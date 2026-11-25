// #decision-preserve-aborts-on-comment-brace — ONE BRACE IN A COMMENT DISARMED THE WHOLE PRESERVE.
//
// Found by a multi-agent hunt over the makers, then reproduced by hand before it was believed.
//
// `matchBlock`, inside `extractPreservedDecisionBody`, located a category and a decision by counting every
// `{` and `}` in the raw text — skipping neither `#` comments nor quoted strings. Braces inside a comment are
// invisible to HOI4 but not to that counter, and a commented-out block is not always balanced: someone
// comments a decision out mid-edit and leaves the closing `#}` off. Vanilla's SWE.txt alone has 285 comment
// lines whose braces do not pair.
//
// One of them desyncs the count, `matchBlock` returns null, `extractPreservedDecisionBody` returns empty, and
// the preserve tail vanishes — so every key the editor's form does not model is deleted from the decision.
// The save answers {ok:true, success:true}.
//
// On vanilla SWE.txt a no-edit round trip cost `targets = { 138 140 141 }` off SWE_urbanization_decision —
// it can no longer be taken on any state at all — plus `activation` and `is_good` off four more.
//
// The EVENT sibling was fixed for exactly this and carries the note #event-preserve-aborts-on-comment-brace;
// `matchEventBraceInText` IS that fix, comment- and string-safe, sitting in the same file. Same guard, one
// caller short — the shape this codebase keeps producing.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-decbrace-"));
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
  const p = path.join(__dirname, `.ctl-decbrace-${process.pid}-${label}.js`);
  fs.writeFileSync(p, wasCrlf ? out.replace(/\n/g, "\r\n") : out, "utf8");
  ctlFiles.push(p);
  try { return { createApp: require(p).createApp }; } catch (e) { return { error: String(e && e.message) }; }
}

const VANILLA_DECISIONS = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/common/decisions";
const leaves = (t) => {
  const o = [];
  for (const m of t.replace(/#.*$/gm, "").matchAll(/([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*("[^"]*"|[^\s{}]+)/g)) o.push(m[1] + "=" + m[2]);
  return o;
};
function lostLeaves(before, after) {
  const cb = {}, ca = {};
  leaves(before).forEach((k) => cb[k] = (cb[k] || 0) + 1);
  leaves(after).forEach((k) => ca[k] = (ca[k] || 0) + 1);
  return Object.keys(cb).filter((k) => (ca[k] || 0) < cb[k]);
}
function unbalancedCommentLines(text) {
  let n = 0;
  for (const ln of text.split(/\r?\n/)) {
    const c = ln.indexOf("#");
    if (c === -1) continue;
    const cm = ln.slice(c);
    if ((cm.match(/\{/g) || []).length !== (cm.match(/\}/g) || []).length) n++;
  }
  return n;
}

let seq = 0;
function mkMod(body) {
  const dir = path.join(ROOT, "m" + (++seq));
  fs.mkdirSync(path.join(dir, "common", "decisions"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), 'name="m"\nsupported_version="1.19.*"\n', "utf8");
  fs.writeFileSync(path.join(dir, "common", "decisions", "zz_t.txt"), body, "utf8");
  return dir;
}
const decFile = (dir) => path.join(dir, "common", "decisions", "zz_t.txt");

// The first decision carries an unbalanced brace inside a comment; the second carries the un-modelled keys.
const FIXTURE = (commentLine) => [
  "nua_cat = {",
  "\tnua_first = {",
  "\t\tavailable = {",
  `\t\t\t${commentLine}`,
  "\t\t\thas_stability > 0.5",
  "\t\t}",
  "\t\tcost = 10",
  "\t}",
  "\tnua_second = {",
  "\t\ttargets = { 138 140 141 }",
  "\t\tis_good = yes",
  "\t\tactivation = { always = no }",
  "\t\tcost = 25",
  "\t\tcomplete_effect = { add_political_power = 10 }",
  "\t}",
  "}", ""].join("\n");
// The opening brace with NO closing one is the whole point. An earlier version of this fixture wrote
// `# NOT = { has_war = yes }` — perfectly balanced — and the back-out control then dutifully reported no loss
// at all. A control that passes can be a broken control; the assertion below exists to catch exactly that.
const UNBALANCED = "# NOT = { has_war = yes    <- commented out mid-edit, closing brace never written";
const BALANCED = "# NOT = ( has_war = yes    <- same comment, brace replaced";

let PORT = 46800;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      port: PORT,
      get: (u) => fetch(`http://127.0.0.1:${PORT}${u}`).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      post: (u, body) => fetch(`http://127.0.0.1:${PORT}${u}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}
// The list answers {categories:[{id, decisions:[…]}]} — flatten it the way the page does.
const flatten = (body) => (body.categories || []).flatMap((c) => (c.decisions || []).map((d) => Object.assign({ categoryId: c.id }, d)));

async function roundTrip(api, dir, decisionId) {
  const before = fs.readFileSync(decFile(dir), "utf8");
  const list = await api.get(`/api/decisions/list?modPath=${encodeURIComponent(dir)}`);
  const found = flatten(list.b).find((d) => d.id === decisionId);
  if (!found) return { error: "not listed", listed: flatten(list.b).map((d) => d.id) };
  const save = await api.post("/api/decisions/save", Object.assign({ modPath: dir }, found));
  const after = fs.readFileSync(decFile(dir), "utf8");
  return { before, after, save: save.b, lost: lostLeaves(before, after) };
}

(async () => {
  let api = null;
  try {
    console.log("\n[ground truth] a comment's braces do not have to pair, and in shipped content they don't");
    if (fs.existsSync(VANILLA_DECISIONS)) {
      let worst = { file: "", n: 0 }, filesWith = 0, total = 0;
      for (const f of fs.readdirSync(VANILLA_DECISIONS)) {
        if (!f.toLowerCase().endsWith(".txt")) continue;
        const n = unbalancedCommentLines(fs.readFileSync(path.join(VANILLA_DECISIONS, f), "utf8"));
        total += n;
        if (n) filesWith++;
        if (n > worst.n) worst = { file: f, n };
      }
      rec("vanilla ships decision files whose comment braces don't pair", filesWith > 0, { filesWith, total });
      rec("…including one with a great many of them", worst.n >= 100, worst);
      console.log(`  --   measured: ${total} such lines across ${filesWith} files; worst is ${worst.file} (${worst.n})`);
    } else {
      console.log("  --   vanilla not installed; skipping the ground-truth block");
    }

    api = await serve(createApp());

    console.log("\n[the round trip] a decision beside a commented-out brace keeps everything");
    const dir = mkMod(FIXTURE(UNBALANCED));
    rec("the fixture really does contain an unbalanced comment brace",
      unbalancedCommentLines(fs.readFileSync(decFile(dir), "utf8")) === 1,
      unbalancedCommentLines(fs.readFileSync(decFile(dir), "utf8")));
    const rt = await roundTrip(api, dir, "nua_second");
    rec("the decision is listed", !rt.error, rt.error ? rt.listed : "");
    rec("…and the save reports success", rt.save && rt.save.ok === true, rt.save);
    rec("…losing nothing at all", rt.lost && rt.lost.length === 0, rt.lost);
    rec("…the state list survives, so the decision can still be taken",
      /targets\s*=\s*\{\s*138\s+140\s+141\s*\}/.test(rt.after || ""), rt.after);
    rec("…is_good survives", /is_good\s*=\s*yes/.test(rt.after || ""), rt.after);
    rec("…activation survives", /activation\s*=\s*\{\s*always\s*=\s*no\s*\}/.test(rt.after || ""), rt.after);
    rec("…and the comment itself is still there, unedited",
      (rt.after || "").includes("closing brace never written"), rt.after);
    // Count the braces HOI4 counts — the fixture's whole point is an unmatched one inside a comment, so a
    // raw count of the file is unbalanced by design and says nothing about whether the write was sound.
    {
      const code = (rt.after || "").replace(/#.*$/gm, "");
      rec("…the file is still brace-balanced once comments are stripped, as the game reads it",
        (code.match(/\{/g) || []).length === (code.match(/\}/g) || []).length,
        { open: (code.match(/\{/g) || []).length, close: (code.match(/\}/g) || []).length });
    }

    console.log("\n[the same file without the comment] behaves identically — the comment is the only variable");
    const dirB = mkMod(FIXTURE(BALANCED));
    const rtB = await roundTrip(api, dirB, "nua_second");
    rec("a balanced comment loses nothing either", rtB.lost && rtB.lost.length === 0, rtB.lost);
    api.stop(); api = null;

    console.log("\n[back-out] count raw braces again, as the decision path used to");
    {
      const built = controlApp("rawbrace", [[
        "      const end = matchEventBraceInText(text, open);",
        "      let end = -1;\n      { let d = 0; for (let i = open; i < text.length; i++) { if (text[i] === \"{\") d++; else if (text[i] === \"}\") { d--; if (d === 0) { end = i; break; } } } }"]]);
      if (built.error) rec("the control patched cleanly", false, built.error);
      else {
        const capi = await serve(built.createApp());
        try {
          const cdir = mkMod(FIXTURE(UNBALANCED));
          const c = await roundTrip(capi, cdir, "nua_second");
          rec("…the control still reports a successful save", c.save && c.save.ok === true, c.save);
          rec("…and silently deletes the un-modelled keys", c.lost && c.lost.length > 0, c.lost);
          rec("…including the state list the decision needs to be takeable",
            !/targets\s*=\s*\{\s*138/.test(c.after || ""), "targets survived — the control did not reproduce the bug");
          // …and prove the comment is what causes it, not the fixture's other content.
          const cdirB = mkMod(FIXTURE(BALANCED));
          const cB = await roundTrip(capi, cdirB, "nua_second");
          rec("…while the SAME file with balanced comment braces loses nothing, so the comment is the cause",
            cB.lost && cB.lost.length === 0, cB.lost);
        } finally { capi.stop(); }
      }
    }

    console.log(`\n=== decision preserve comment brace: ${checks} checks, ${fails.length} failed ===`);
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
