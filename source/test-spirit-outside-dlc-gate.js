// #spirit-lands-inside-the-dlc-gate — "TOP-LEVEL" HAS TO MEAN DEPTH ZERO.
//
// Found by a multi-agent hunt over the makers, then reproduced by hand before it was believed.
//
// `setIdeaInHistoryText` says in its own comment that it anchors to "a TOP-LEVEL add_ideas block placed
// BEFORE the first date block". The regex was `/(^|\n)[ \t]*add_ideas\s*=\s*\{/i` — line-anchored, but not
// depth-checked, and `[ \t]*` happily matches an INDENTED `add_ideas` sitting inside
// `if = { limit = { has_dlc = … } … }`.
//
// So granting a national spirit through Country Setup appended it inside that conditional, and the endpoint
// answered {ok:true, refWarning:""}. For every player without the named DLC the spirit was simply never
// granted, and the author got no signal at all. CZE's gate is `NOT = { has_dlc = "Peace For Our Time" }` plus
// `has_dlc = "Death or Dishonor"`, so a spirit put there would apply only to that intersection.
//
// Measured over vanilla's 364 countries: 296 have no pre-date `add_ideas` at all (a fresh top-level block is
// inserted, which was always right), 30 anchor on a genuinely top-level one, and 38 anchored on a conditional
// one. Also 10 of Road to 56's 410 and 6 of Rise of Nations' 546.
//
// The three behaviours that must NOT change are pinned below: an existing top-level block is still appended
// to rather than duplicated, removal still works, and a date block is still respected.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-spiritgate-"));
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
  const p = path.join(__dirname, `.ctl-spiritgate-${process.pid}-${label}.js`);
  fs.writeFileSync(p, wasCrlf ? out.replace(/\n/g, "\r\n") : out, "utf8");
  ctlFiles.push(p);
  try { return { createApp: require(p).createApp }; } catch (e) { return { error: String(e && e.message) }; }
}

const VANILLA_HIST = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/history/countries";
const GATED = [
  "capital = 1",
  "",
  "if = {",
  "\tlimit = { has_dlc = \"Death or Dishonor\" }",
  "\tadd_ideas = {",
  "\t\tdlc_only_spirit",
  "\t}",
  "}",
  "",
  "set_research_slots = 3",
  ""].join("\n");

let seq = 0;
function mkMod(body) {
  const dir = path.join(ROOT, "m" + (++seq));
  fs.mkdirSync(path.join(dir, "history", "countries"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), 'name="m"\nsupported_version="1.19.*"\n', "utf8");
  fs.writeFileSync(path.join(dir, "history", "countries", "NUA - Nova.txt"), body, "utf8");
  return dir;
}
const histOf = (dir) => fs.readFileSync(path.join(dir, "history", "countries", "NUA - Nova.txt"), "utf8");

// Is `needle` inside the first `if = { … }` block of the text? Comment- and string-aware.
function insideFirstIf(text, needle) {
  const at = text.indexOf(needle);
  if (at === -1) return null;
  const ifAt = text.indexOf("if = {");
  if (ifAt === -1) return false;
  let d = 0, end = -1;
  for (let i = text.indexOf("{", ifAt); i < text.length; i++) {
    const c = text[i];
    if (c === "#") { while (i < text.length && text[i] !== "\n") i++; continue; }
    if (c === '"') { i++; while (i < text.length && text[i] !== '"') { if (text[i] === "\\") i++; i++; } continue; }
    if (c === "{") d++;
    else if (c === "}") { d--; if (d === 0) { end = i; break; } }
  }
  return end !== -1 && at > ifAt && at < end;
}

let PORT = 47200;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      spirit: (dir, id, active) => fetch(`http://127.0.0.1:${PORT}/api/history/set-startup`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ modPath: dir, tag: "NUA", itemType: "spirit", itemId: id, active }),
      }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}

(async () => {
  let api = null;
  try {
    console.log("\n[ground truth] the game really does gate add_ideas behind DLC checks");
    if (fs.existsSync(VANILLA_HIST)) {
      let gated = 0, topLevel = 0, none = 0, total = 0;
      for (const f of fs.readdirSync(VANILLA_HIST)) {
        if (!f.toLowerCase().endsWith(".txt")) continue;
        total++;
        const t = fs.readFileSync(path.join(VANILLA_HIST, f), "utf8").replace(/#.*$/gm, "");
        const dm = /(^|\n)[ \t]*\d{4}\.\d{1,2}\.\d{1,2}\s*=\s*\{/.exec(t);
        const region = dm ? t.slice(0, dm.index) : t;
        const m = /(^|\n)([ \t]*)add_ideas[ \t]*=[ \t]*\{/.exec(region);
        if (!m) { none++; continue; }
        // depth of the match decides it: indented under an `if` means gated
        let d = 0;
        for (let i = 0; i < m.index; i++) { const c = region[i]; if (c === "{") d++; else if (c === "}") d = Math.max(0, d - 1); }
        if (d > 0) gated++; else topLevel++;
      }
      rec("vanilla countries put add_ideas behind a conditional, in numbers", gated >= 20, { gated, topLevel, none, total });
      rec("…and most have none before the first date block", none > topLevel, { none, topLevel });
      console.log(`  --   measured over ${total} vanilla countries: ${none} with no pre-date add_ideas, ${topLevel} top-level, ${gated} conditional`);
    } else {
      console.log("  --   vanilla not installed; skipping the ground-truth block");
    }

    api = await serve(createApp());

    console.log("\n[a gated country] gets its new spirit at top level, where every player sees it");
    const dir = mkMod(GATED);
    const r = await api.spirit(dir, "nua_new_spirit", true);
    rec("the grant succeeds", r.b && r.b.ok === true, r.b);
    const t = histOf(dir);
    rec("…the spirit is written", /nua_new_spirit/.test(t), t);
    rec("…OUTSIDE the DLC gate", insideFirstIf(t, "nua_new_spirit") === false, t);
    rec("…and the country's own gated spirit is left exactly where it was",
      insideFirstIf(t, "dlc_only_spirit") === true, t);
    rec("…the gate itself is untouched", /has_dlc\s*=\s*"Death or Dishonor"/.test(t), t);
    rec("…and the file is brace-balanced",
      (t.replace(/#.*$/gm, "").match(/\{/g) || []).length === (t.replace(/#.*$/gm, "").match(/\}/g) || []).length, "unbalanced");

    console.log("\n[what must not change] the three behaviours this anchor already had");
    const dirTop = mkMod("capital = 1\n\nadd_ideas = {\n\texisting_spirit\n}\n\nset_research_slots = 3\n");
    await api.spirit(dirTop, "nua_new", true);
    const tTop = histOf(dirTop);
    rec("an existing TOP-LEVEL block is appended to, not duplicated",
      (tTop.match(/add_ideas\s*=\s*\{/g) || []).length === 1, tTop);
    rec("…with both spirits in it", /existing_spirit/.test(tTop) && /nua_new/.test(tTop), tTop);
    await api.spirit(dirTop, "nua_new", false);
    const tTop2 = histOf(dirTop);
    rec("removal still works", !/nua_new/.test(tTop2), tTop2);
    rec("…and leaves the country's own spirit alone", /existing_spirit/.test(tTop2), tTop2);
    const dirDate = mkMod("capital = 1\n\n1939.1.1 = {\n\tadd_ideas = { late_spirit }\n}\n");
    await api.spirit(dirDate, "nua_early", true);
    const tDate = histOf(dirDate);
    rec("a date block is still respected — the spirit goes before it",
      tDate.indexOf("nua_early") < tDate.indexOf("1939.1.1"), tDate);
    rec("…and the dated block is untouched",
      tDate.indexOf("late_spirit") > tDate.indexOf("1939.1.1"), tDate);
    api.stop(); api = null;

    console.log("\n[back-out] anchor on any indentation again");
    {
      const built = controlApp("anydepth", [[
        "    const top = findTopLevelAddIdeas(region);\n    const match = top ? { index: top.index, 0: region.substr(top.index, top.length), 1: \"\" } : null;",
        "    const match = /(^|\\n)[ \\t]*add_ideas\\s*=\\s*\\{/i.exec(region);"]]);
      if (built.error) rec("the control patched cleanly", false, built.error);
      else {
        const capi = await serve(built.createApp());
        try {
          const cdir = mkMod(GATED);
          const c = await capi.spirit(cdir, "nua_new_spirit", true);
          const ct = histOf(cdir);
          rec("…the control still reports success", c.b && c.b.ok === true, c.b);
          rec("…and writes the spirit INSIDE the DLC gate, where most players never see it",
            insideFirstIf(ct, "nua_new_spirit") === true,
            "the spirit landed outside — the control did not reproduce the bug");
        } finally { capi.stop(); }
      }
    }

    console.log(`\n=== spirit outside DLC gate: ${checks} checks, ${fails.length} failed ===`);
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
