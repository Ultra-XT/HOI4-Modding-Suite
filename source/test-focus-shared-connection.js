// /api/focus/shared-connection had no test at all.
//
// A mechanical survey of server.js found 19 POST endpoints no test file calls; 12 are map, which this pass
// excludes, and this was one of the two remaining write paths. It rewrites a shipping focus-tree file in
// place to link or unlink a shared-focus group, so the failure mode is the expensive kind: a bad insert
// point puts `shared_focus` somewhere HOI4 does not read it, and an unbalanced edit stops the whole tree
// loading.
//
// Driven against five real vanilla trees, it is sound — the link lands as a direct child of `focus_tree`,
// the file stays brace-balanced, linking twice is a no-op, and unlinking restores the file BYTE FOR BYTE.
// This test pins that. It is a guard, not a fix; nothing in server.js changed.
//
// The endpoint already carries the comment-brace guard (#comment-brace-hides-tree) that the event preserve
// was missing — it matches braces against a comment-blanked copy, so a `#` comment holding an unmatched `{`
// cannot hide the tree. The control below removes exactly that, which is the failure this class produces.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-sfc-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const VNF = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/common/national_focus";
const CANDIDATES = ["germany.txt", "italy.txt", "japan.txt", "usa.txt", "soviet.txt"];

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700));
  }
}

const ctlFiles = [];
function controlApp(label, pairs) {
  // server.js is CRLF here; a multi-line anchor spelled with \n would match nothing and the control would
  // pass while patching none of the code it claims to back out.
  const raw = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  const wasCrlf = raw.includes("\r\n");
  let out = wasCrlf ? raw.replace(/\r\n/g, "\n") : raw;
  for (const [from, to] of pairs) {
    if (from instanceof RegExp) {
      // A regex anchor, for a span whose literal text is awkward to transcribe (this one crosses a comment
      // containing an em dash and backticks). Uniqueness is still asserted.
      const all = out.match(new RegExp(from.source, "g" + from.flags.replace(/g/g, "")));
      if (!all) return { error: "anchor missing: " + String(from).slice(0, 90) };
      if (all.length !== 1) return { error: `anchor not unique (${all.length}): ` + String(from).slice(0, 90) };
      out = out.replace(from, to);
      continue;
    }
    if (!out.includes(from)) return { error: "anchor missing: " + from.slice(0, 90) };
    if (out.split(from).length !== 2) return { error: "anchor not unique: " + from.slice(0, 90) };
    out = out.replace(from, to);
  }
  const p = path.join(__dirname, `.ctl-sfc-${process.pid}-${label}.js`);
  fs.writeFileSync(p, wasCrlf ? out.replace(/\n/g, "\r\n") : out, "utf8");
  ctlFiles.push(p);
  try { return { createApp: require(p).createApp }; } catch (e) { return { error: String(e && e.message) }; }
}

const balanced = (t) => {
  const s = t.replace(/#[^\n]*/g, "");
  return (s.match(/\{/g) || []).length === (s.match(/\}/g) || []).length;
};

// Is `shared_focus = <sid>` a DIRECT child of a focus_tree block? HOI4 reads it there and nowhere else.
function sharedAtTreeLevel(text, sid) {
  const scan = text.replace(/#[^\n]*/g, (c) => " ".repeat(c.length));
  const re = /focus_tree\s*=\s*\{/g;
  let m;
  while ((m = re.exec(scan)) !== null) {
    const open = scan.indexOf("{", m.index);
    let d = 0, close = -1;
    for (let i = open; i < scan.length; i++) {
      if (scan[i] === "{") d++;
      else if (scan[i] === "}") { d--; if (d === 0) { close = i; break; } }
    }
    if (close === -1) break;
    re.lastIndex = close + 1;
    const body = scan.slice(open + 1, close);
    let dd = 0;
    for (let i = 0; i < body.length; i++) {
      if (body[i] === "{") dd++;
      else if (body[i] === "}") dd--;
      else if (dd === 0 && body.startsWith("shared_focus", i) && (i === 0 || !/[A-Za-z0-9_]/.test(body[i - 1]))) {
        const nl = body.indexOf("\n", i);
        if (new RegExp(`^shared_focus\\s*=\\s*${sid}\\b`).test(body.slice(i, nl === -1 ? undefined : nl))) return true;
      }
    }
  }
  return false;
}

function mkMod(name, files) {
  const dir = path.join(ROOT, name);
  fs.mkdirSync(path.join(dir, "common", "national_focus"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), `name="${name}"\nsupported_version="1.19.*"\n`, "utf8");
  for (const f of files) fs.copyFileSync(path.join(VNF, f), path.join(dir, "common", "national_focus", f));
  return dir;
}

let PORT = 44280;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      post: (u, b) => fetch(`http://127.0.0.1:${PORT}${u}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) })
        .then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}

const SID = "zz_probe_shared";
// relPath is relative to the MOD ROOT, not to common/national_focus.
const link = (api, mod, f, on) => api.post("/api/focus/shared-connection",
  { modPath: mod, relPath: `common/national_focus/${f}`, sharedId: SID, enabled: on });

(async () => {
  const api = await serve(createApp());
  try {
    const FILES = CANDIDATES.filter((f) => fs.existsSync(path.join(VNF, f)));
    if (!FILES.length) {
      console.log("\n  (skipped — vanilla not installed)");
      console.log(`\n=== focus shared connection: ${checks} checks, 0 failed ===`);
      return;
    }
    const mod = mkMod("m", FILES);

    console.log(`\n[round trip] link then unlink, on ${FILES.length} real vanilla trees`);
    for (const f of FILES) {
      const p = path.join(mod, "common", "national_focus", f);
      const before = fs.readFileSync(p, "utf8");

      const on = await link(api, mod, f, true);
      const linked = fs.readFileSync(p, "utf8");
      rec(`${f}: the link is accepted`, on.s === 200 && on.b.changed === true, on.b);
      rec(`${f}: …and lands as a direct child of focus_tree`, sharedAtTreeLevel(linked, SID), linked.slice(0, 400));
      rec(`${f}: …leaving the file brace-balanced`, balanced(linked), "unbalanced");

      const on2 = await link(api, mod, f, true);
      rec(`${f}: linking again changes nothing`,
        on2.b.changed === false && fs.readFileSync(p, "utf8") === linked, on2.b);

      const off = await link(api, mod, f, false);
      rec(`${f}: unlinking restores the file byte for byte`,
        off.s === 200 && off.b.changed === true && fs.readFileSync(p, "utf8") === before, off.b);

      const off2 = await link(api, mod, f, false);
      rec(`${f}: unlinking again changes nothing`, off2.b.changed === false, off2.b);
    }

    console.log("\n[comment brace] a tree behind a commented-out block is still reachable");
    {
      // The authoring shape that shipped in vanilla's BBA_Ethiopia.txt and Millennium Dawn's Sweden.txt:
      // a block commented out while rebalancing, with its closing `#}` left off.
      const bmod = path.join(ROOT, "brace");
      fs.mkdirSync(path.join(bmod, "common", "national_focus"), { recursive: true });
      fs.writeFileSync(path.join(bmod, "descriptor.mod"), 'name="brace"\nsupported_version="1.19.*"\n', "utf8");
      fs.writeFileSync(path.join(bmod, "common", "national_focus", "t.txt"),
        "# shelved while rebalancing\n#focus_tree = {\n#\tid = old_tree\n\nfocus_tree = {\n\tid = real_tree\n\tcountry = { factor = 0 }\n}\n", "utf8");
      const b = await api.post("/api/focus/shared-connection",
        { modPath: bmod, relPath: "common/national_focus/t.txt", sharedId: SID, enabled: true });
      const txt = fs.readFileSync(path.join(bmod, "common", "national_focus", "t.txt"), "utf8");
      rec("the link reaches the real tree past the lopsided comment",
        b.s === 200 && b.b.changed === true && sharedAtTreeLevel(txt, SID), { resp: b.b, txt });
      rec("…and the commented-out block is left commented out",
        /#focus_tree\s*=\s*\{/.test(txt) && !sharedAtTreeLevel(txt.replace(/^#.*$/gm, ""), "old_tree"), txt);
    }

    console.log("\n[guards] the endpoint refuses what it should");
    const mod2 = mkMod("m2", FILES.slice(0, 1));
    let r = await api.post("/api/focus/shared-connection",
      { modPath: mod2, relPath: "common/national_focus/does_not_exist.txt", sharedId: SID, enabled: true });
    rec("a missing file is refused", r.s === 400 && /not found/i.test(String(r.b.error)), r.b);
    r = await api.post("/api/focus/shared-connection",
      { modPath: mod2, relPath: "../../escape.txt", sharedId: SID, enabled: true });
    rec("a path escaping the mod is refused", r.s === 400 && !!r.b.error, r.b);
    r = await api.post("/api/focus/shared-connection",
      { modPath: mod2, relPath: `common/national_focus/${FILES[0]}`, sharedId: "not a token!", enabled: true });
    rec("a shared id that is not a PDX token is refused",
      r.s === 400 && /invalid shared focus id/i.test(String(r.b.error)), r.b);
    api.stop();

    console.log("\n[back-out] let a comment brace hide the tree again");
    {
      const built = controlApp("commentbrace", [
        // setFocusTreeOwnership has the identical `const scan = …` line, so the anchor spans from the throw
        // that only setSharedFocusConnection carries down to it.
        [/(throw new Error\("Invalid shared focus id: " \+ opts\.sharedId\);[\s\S]*?)const scan = text\.replace\(\/#\[\^\\n\]\*\/g, \(c\) => " "\.repeat\(c\.length\)\);/,
         "$1const scan = text;"]]);
      if (built.error) rec("the control patched cleanly", false, built.error);
      else {
        const capi = await serve(built.createApp());
        // A tree preceded by a commented-out block whose closing `#}` is missing — the same authoring shape
        // that shipped in vanilla's BBA_Ethiopia.txt and Millennium Dawn's Sweden.txt.
        const cmod = path.join(ROOT, "ctl");
        fs.mkdirSync(path.join(cmod, "common", "national_focus"), { recursive: true });
        fs.writeFileSync(path.join(cmod, "descriptor.mod"), 'name="ctl"\nsupported_version="1.19.*"\n', "utf8");
        fs.writeFileSync(path.join(cmod, "common", "national_focus", "t.txt"),
          "# shelved while rebalancing\n#focus_tree = {\n#\tid = old_tree\n\nfocus_tree = {\n\tid = real_tree\n\tcountry = { factor = 0 }\n}\n", "utf8");
        try {
          const c = await capi.post("/api/focus/shared-connection",
            { modPath: cmod, relPath: "common/national_focus/t.txt", sharedId: SID, enabled: true });
          const txt = fs.readFileSync(path.join(cmod, "common", "national_focus", "t.txt"), "utf8");
          rec("…and the link no longer reaches the real tree",
            !(c.s === 200 && c.b.changed === true && sharedAtTreeLevel(txt, SID)), { resp: c.b, txt });
        } finally { capi.stop(); }
      }
    }

    console.log(`\n=== focus shared connection: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { api.stop(); } catch (_) {}
    for (const p of ctlFiles) { try { fs.unlinkSync(p); } catch (_) {} }
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
