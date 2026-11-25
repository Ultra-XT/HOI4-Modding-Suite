// #spirit-move-deletes-from-the-base-mod + #create-path-drops-unmodelled-idea-sections
//
// TWO HALVES OF ONE STORY, AND THEY HAD TO BE FIXED TOGETHER.
//
// Half one — copying an inherited spirit wrote a STUB. The server can seed a copy from the source block,
// keeping everything the form does not model, but that path is gated on `sourceRoot` and the Ideas page never
// sent it. Measured, copying a base mod's spirit into an add-on:
//
//     without sourceRoot   0 of 6 un-modelled blocks kept   (allowed, cancel_if, research_bonus,
//     with sourceRoot      6 of 6                            targeted_modifier, on_remove, ai_will_do)
//
// An advisor losing `allowed` becomes hireable by everyone; losing `cancel_if` never expires.
//
// Half two — a save carrying BOTH `sourceRoot` and `previousRelativeFile` deleted the spirit out of the BASE
// MOD's own file. The move-cleanup passes `activeRoot` as the root to work in, but also forwarded
// `sourceRoot`, and the helper ignores the activeRoot it was handed whenever a sourceRoot is present:
//     const root = sourceRoot ? resolveAllowedModDirectory(sourceRoot) : activeRoot;
// Measured: the base lost 4 leaf assignments and the spirit entirely, its sibling untouched, reply ok:true,
// no warning. Each half alone is harmless — only the pair reaches in.
//
// That second half was LATENT: no caller sent both fields. It is in this file because the fix for half one is
// exactly what makes it reachable — the Ideas page now sends `sourceRoot` on every inherited save, and it
// already sent `previousRelativeFile`. Fixing the copy without fixing the cleanup would have converted a
// dormant hazard into a live one on the first save.
//
// The MIO sibling passes "" and is right to. The explicit delete endpoint passes sourceRoot deliberately,
// behind a UI confirm reading "Deleting it will modify the source files directly!" — a save must never carry
// that power without that warning.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-inhspirit-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

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
  const raw = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  const wasCrlf = raw.includes("\r\n");
  let out = wasCrlf ? raw.replace(/\r\n/g, "\n") : raw;
  for (const [from, to] of pairs) {
    if (!out.includes(from)) return { error: "anchor missing: " + from.slice(0, 90) };
    if (out.split(from).length !== 2) return { error: "anchor not unique: " + from.slice(0, 90) };
    out = out.replace(from, to);
  }
  const p = path.join(__dirname, `.ctl-inhspirit-${process.pid}-${label}.js`);
  fs.writeFileSync(p, wasCrlf ? out.replace(/\n/g, "\r\n") : out, "utf8");
  ctlFiles.push(p);
  try { return { createApp: require(p).createApp }; } catch (e) { return { error: String(e && e.message) }; }
}

const toPosix = (p) => p.split(path.sep).join("/");
const IDEAS = [
  "ideas = {",
  "\tcountry = {",
  "\t\tzz_base_spirit = {",
  "\t\t\tpicture = generic_morale_bonus",
  "\t\t\tallowed = { original_tag = ZZA }",
  "\t\t\tcancel_if = { has_war = yes }",
  "\t\t\tremoval_cost = -1",
  "\t\t\tresearch_bonus = { infantry_weapons = 0.1 }",
  "\t\t\ttargeted_modifier = { tag = GER attack_bonus_against = 0.1 }",
  "\t\t\ton_remove = { add_political_power = 10 }",
  "\t\t\tai_will_do = { factor = 2 }",
  "\t\t\tmodifier = { political_power_gain = 0.5 }",
  "\t\t}",
  "\t\tzz_sibling_spirit = {",
  "\t\t\tpicture = generic_morale_bonus",
  "\t\t\tremoval_cost = -1",
  "\t\t\tmodifier = { war_support_factor = 0.1 }",
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n");
const UNMODELLED = ["allowed", "cancel_if", "research_bonus", "targeted_modifier", "on_remove", "ai_will_do"];

let seq = 0;
function mkPair() {
  const bn = "BaseS" + (++seq);
  const bdir = path.join(ROOT, "base" + seq);
  fs.mkdirSync(path.join(bdir, "common", "ideas"), { recursive: true });
  fs.writeFileSync(path.join(bdir, "descriptor.mod"), 'name="' + bn + '"\nsupported_version="1.19.*"\n', "utf8");
  fs.writeFileSync(path.join(ROOT, "base" + seq + ".mod"),
    'name="' + bn + '"\npath="' + toPosix(bdir) + '"\nsupported_version="1.19.*"\n', "utf8");
  fs.writeFileSync(path.join(bdir, "common", "ideas", "zz_base.txt"), IDEAS, "utf8");
  const adir = path.join(ROOT, "addon" + seq);
  fs.mkdirSync(path.join(adir, "common", "ideas"), { recursive: true });
  fs.writeFileSync(path.join(adir, "descriptor.mod"),
    'name="AddOnS' + seq + '"\nsupported_version="1.19.*"\ndependencies={ "' + bn + '" }\n', "utf8");
  fs.writeFileSync(path.join(ROOT, "addon" + seq + ".mod"),
    'name="AddOnS' + seq + '"\npath="' + toPosix(adir) + '"\nsupported_version="1.19.*"\n', "utf8");
  return { base: bdir, addon: adir, baseFile: path.join(bdir, "common", "ideas", "zz_base.txt") };
}
const leaves = (t) => {
  const o = [];
  for (const m of String(t).replace(/#.*$/gm, "").matchAll(/([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*("[^"]*"|[^\s{}]+)/g)) o.push(m[1] + "=" + m[2]);
  return o;
};
function lostLeaves(before, after) {
  const cb = {}, ca = {};
  leaves(before).forEach((k) => cb[k] = (cb[k] || 0) + 1);
  leaves(after).forEach((k) => ca[k] = (ca[k] || 0) + 1);
  return Object.keys(cb).filter((k) => (ca[k] || 0) < cb[k]);
}

let PORT = 49200;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      upsert: (body) => fetch("http://127.0.0.1:" + PORT + "/api/ideas/upsert-definition", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}
const BASE_BODY = (addon) => ({
  modPath: addon, ideaId: "zz_base_spirit", category: "country",
  targetRelativeFile: "nova_spirits.txt",
  modifiers: [{ key: "political_power_gain", value: 0.5 }],
});
const addonText = (addon) => {
  const f = path.join(addon, "common", "ideas", "nova_spirits.txt");
  return fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "";
};

(async () => {
  let api = null;
  try {
    api = await serve(createApp());

    console.log("\n[copying an inherited spirit] keeps what the form does not model");
    {
      const { base, addon } = mkPair();
      const r = await api.upsert(Object.assign(BASE_BODY(addon), { sourceRoot: base }));
      rec("the copy succeeds", r.b && r.b.ok === true, r.b);
      const t = addonText(addon);
      const kept = UNMODELLED.filter((k) => new RegExp("\\b" + k + "\\s*=").test(t));
      rec("…keeping every un-modelled block", kept.length === UNMODELLED.length,
        { kept, lost: UNMODELLED.filter((k) => !kept.includes(k)) });
      rec("…including the gate that stops it applying to everyone", /allowed\s*=/.test(t), t.slice(0, 300));
      rec("…and the modifier the form DOES model", /political_power_gain/.test(t), t.slice(0, 300));
    }

    console.log("\n[without being told where it came from] it can only write a stub — the contrast");
    {
      const { addon } = mkPair();
      await api.upsert(BASE_BODY(addon));
      const t = addonText(addon);
      const kept = UNMODELLED.filter((k) => new RegExp("\\b" + k + "\\s*=").test(t));
      rec("nothing un-modelled survives, which is why the client must send sourceRoot",
        kept.length === 0, kept);
    }

    console.log("\n[the page sends it] and only when the spirit is not already ours");
    {
      const CLIENT = fs.readFileSync(path.join(__dirname, "public", "ideas.js"), "utf8");
      rec("the loaded spirit's root is remembered", /loadedSourceRoot = item\.sourceRoot \|\| ""/.test(CLIENT), "not captured");
      rec("…and sent on save", /\{ sourceRoot: loadedSourceRoot \}/.test(CLIENT), "not sent");
      rec("…only when it differs from this mod", /loadedSourceRoot !== getModPath\(\)/.test(CLIENT), "sent unconditionally");
      rec("…and cleared once the spirit lives here", /loadedSourceRoot = getModPath\(\)/.test(CLIENT), "never cleared");
      rec("ideas.js parses", (() => { try { new Function(CLIENT); return true; } catch (e) { return String(e.message); } })() === true,
        (() => { try { new Function(CLIENT); return "ok"; } catch (e) { return String(e.message); } })());
      rec("…and is versioned so the change ships",
        /ideas\.js\?v=[\w]+/.test(fs.readFileSync(path.join(__dirname, "public", "ideas.html"), "utf8")), "no version");
    }

    console.log("\n[and a save must never reach into the base mod] the half that fixing the above would have armed");
    {
      const { base, addon, baseFile } = mkPair();
      const before = fs.readFileSync(baseFile, "utf8");
      const r = await api.upsert(Object.assign(BASE_BODY(addon), {
        sourceRoot: base, previousRelativeFile: "zz_base.txt",
      }));
      const after = fs.readFileSync(baseFile, "utf8");
      rec("the save succeeds", r.b && r.b.ok === true, r.b);
      rec("…and the BASE mod's file is byte-identical", after === before, lostLeaves(before, after));
      rec("…its spirit still defined there", /zz_base_spirit\s*=\s*\{/.test(after), after.slice(0, 200));
      rec("…and its sibling untouched", /zz_sibling_spirit\s*=\s*\{/.test(after), after.slice(0, 200));
      rec("…while the copy landed in the add-on", /zz_base_spirit/.test(addonText(addon)), addonText(addon).slice(0, 200));
    }
    api.stop(); api = null;

    console.log("\n[back-out] let the cleanup delete from whichever root it is handed");
    {
      const built = controlApp("reachin", [[
        'try { deleteIdeaDefinitionFromIdeasFile(activeRoot, previousRelativeFile, ideaId, "", "", true); }',
        'try { deleteIdeaDefinitionFromIdeasFile(activeRoot, previousRelativeFile, ideaId, "", sourceRoot, true); }']]);
      if (built.error) rec("the control patched cleanly", false, built.error);
      else {
        const capi = await serve(built.createApp());
        try {
          const { base, addon, baseFile } = mkPair();
          const before = fs.readFileSync(baseFile, "utf8");
          const r = await capi.upsert(Object.assign(BASE_BODY(addon), {
            sourceRoot: base, previousRelativeFile: "zz_base.txt",
          }));
          const after = fs.readFileSync(baseFile, "utf8");
          rec("…the control still reports a successful save", r.b && r.b.ok === true, r.b);
          rec("…and deletes the spirit out of the BASE mod", !/zz_base_spirit\s*=\s*\{/.test(after), after.slice(0, 300));
          rec("…leaving its sibling, so it really is a targeted splice",
            /zz_sibling_spirit\s*=\s*\{/.test(after), after.slice(0, 300));
        } finally { capi.stop(); }
      }
    }

    console.log(`\n=== inherited spirit copy: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (api) api.stop(); } catch (_) {}
    for (const p of ctlFiles) { try { fs.unlinkSync(p); } catch (_) {} }
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
