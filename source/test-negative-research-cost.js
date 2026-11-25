// #negative-research-cost — AN AUTHORED research_cost = -1 WAS READ AS 1 AND THEN DELETED.
//
// Found by a corpus round trip aimed at sub_technologies (which turned out sound — 0 lost across every
// vanilla file that has them). The round trip on infantry.txt showed two research_cost leaves LOST with no
// replacement, and both belonged to techs vanilla declares as `research_cost = -1`.
//
// The parser's class was `([0-9\.]+)` — no minus sign — so the pattern matched NOTHING and the tech came
// back carrying the parser's invented default of 1. That alone would be a misread. What made it a deletion
// is the writer: by #no-invented-tech-fields it emits a defaulted field only when the value has moved off
// the default, and 1 IS the default, so the authored -1 was dropped from the file by a save that changed
// nothing at all.
//
// Vanilla uses it on the two techs granted by a Munich focus (`research_cost = -1` beside
// `allow = { always = no }`); Millennium Dawn uses it nowhere. Rare — but an authored value has to survive
// a round trip whether or not we can think of a reason for it, and the two-step (misread, then silently
// dropped as "unchanged") is the part worth pinning.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-negrc-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const V = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const VANILLA_NEG = ["MUN_CZE_establish_air_defense_zones", "MUN_merge_the_financial_and_state_guard_tech"];

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
  const p = path.join(__dirname, `.ctl-negrc-${process.pid}-${label}.js`);
  fs.writeFileSync(p, wasCrlf ? out.replace(/\n/g, "\r\n") : out, "utf8");
  ctlFiles.push(p);
  try { return { createApp: require(p).createApp }; } catch (e) { return { error: String(e && e.message) }; }
}

// Brace-match the whole block. A fixed-size slice around the id measures how long the block happens to be,
// not what it contains — two false findings this session came from exactly that.
function techBlock(text, id) {
  const re = new RegExp("(^|\\n)[ \\t]*" + id + "[ \\t]*=[ \\t]*\\{");
  const m = re.exec(text);
  if (!m) return "";
  let d = 0;
  for (let k = text.indexOf("{", m.index); k < text.length; k++) {
    if (text[k] === "{") d++;
    else if (text[k] === "}") { d--; if (!d) return text.slice(m.index, k + 1); }
  }
  return "";
}
function costOf(text, id) {
  const b = techBlock(text, id);
  if (!b) return "(block not found)";
  const m = /research_cost\s*=\s*(-?[0-9.]+)/.exec(b.replace(/#[^\n]*/g, ""));
  return m ? m[1] : "(no research_cost)";
}

function mkMod(name, fileName, body) {
  const dir = path.join(ROOT, name);
  fs.mkdirSync(path.join(dir, "common", "technologies"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), `name="${name}"\nsupported_version="1.19.*"\n`, "utf8");
  fs.writeFileSync(path.join(dir, "common", "technologies", fileName), body, "utf8");
  return dir;
}

let PORT = 44960;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      get: (u) => fetch(`http://127.0.0.1:${PORT}${u}`).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      post: (u, b) => fetch(`http://127.0.0.1:${PORT}${u}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) })
        .then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}
// Read the mod's techs back and hand them straight to the save, unchanged. That IS the round trip: any
// difference on disk afterwards was introduced by Nova, not by an edit.
async function roundTrip(api, mod, fileName) {
  const cat = await api.get(`/api/technologies/catalog?modPath=${encodeURIComponent(mod)}`);
  const all = (cat.b.technologies || cat.b.techs || []);
  const mine = all.filter((t) => t && t.isMod);
  const save = await api.post("/api/technologies/save-batch", {
    technologies: mine, equipments: [], customTabs: [], modPath: mod, deletions: [], newTechIds: [],
  });
  return { mine, save, after: fs.readFileSync(path.join(mod, "common", "technologies", fileName), "utf8") };
}

const SYNTH = [
  "technologies = {",
  "\tnua_granted_tech = {",
  "\t\tresearch_cost = -1",
  "\t\tstart_year = 1936",
  "\t\tallow = { always = no }",
  "\t\tfolder = {",
  "\t\t\tname = infantry_folder",
  "\t\t\tposition = { x = 1 y = 1 }",
  "\t\t}",
  "\t}",
  "\tnua_normal_tech = {",
  "\t\tresearch_cost = 2",
  "\t\tstart_year = 1936",
  "\t\tfolder = {",
  "\t\t\tname = infantry_folder",
  "\t\t\tposition = { x = 2 y = 1 }",
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n");

(async () => {
  let api = null;
  try {
    console.log("\n[ground truth] vanilla really does author a negative research_cost");
    const vFile = path.join(V, "common", "technologies", "infantry.txt");
    const haveGame = fs.existsSync(vFile);
    if (!haveGame) console.log("  (skipped — vanilla not installed)");
    else {
      const txt = fs.readFileSync(vFile, "utf8");
      for (const id of VANILLA_NEG) rec(`${id} declares research_cost = -1`, costOf(txt, id) === "-1", costOf(txt, id));
      // …and that it is genuinely rare, so this is a fidelity fix and not a common-case one.
      let neg = 0, total = 0;
      for (const f of fs.readdirSync(path.dirname(vFile)).filter((x) => x.endsWith(".txt"))) {
        const t = fs.readFileSync(path.join(path.dirname(vFile), f), "utf8").replace(/#[^\n]*/g, "");
        for (const m of t.matchAll(/(^|\n)\s*research_cost\s*=\s*(-?[\d.]+)/g)) { total++; if (Number(m[2]) < 0) neg++; }
      }
      rec("…and only these two, out of hundreds", neg === 2 && total > 300, { negative: neg, total });
    }

    api = await serve(createApp());

    console.log("\n[the read] the value arrives as authored, not as the parser's default");
    {
      const mod = mkMod("m1", "t.txt", SYNTH);
      const cat = await api.get(`/api/technologies/catalog?modPath=${encodeURIComponent(mod)}`);
      const t = (cat.b.technologies || cat.b.techs || []).find((x) => x && x.id === "nua_granted_tech");
      rec("the tech is in the catalogue", !!t, "not found");
      rec("…and its researchCost is -1, not 1", t && t.researchCost === -1, t && t.researchCost);
    }

    console.log("\n[the round trip] a save that changed nothing changes nothing");
    {
      const mod = mkMod("m2", "t.txt", SYNTH);
      const { save, after } = await roundTrip(api, mod, "t.txt");
      rec("the save succeeds", save.s === 200 && save.b.ok, save.b);
      rec("…the negative cost is still on disk", costOf(after, "nua_granted_tech") === "-1",
        costOf(after, "nua_granted_tech"));
      rec("…and the ordinary tech beside it is untouched", costOf(after, "nua_normal_tech") === "2",
        costOf(after, "nua_normal_tech"));
      // The two-step is the point: it was misread as the default AND THEN dropped for being the default.
      rec("…so it was not silently deleted as 'unchanged'",
        !/\(no research_cost\)/.test(costOf(after, "nua_granted_tech")), after.slice(0, 300));
    }

    console.log("\n[the corpus] vanilla's own file survives its own round trip");
    if (haveGame) {
      const before = fs.readFileSync(vFile, "utf8");
      const mod = mkMod("m3", "infantry.txt", before);
      const { after } = await roundTrip(api, mod, "infantry.txt");
      for (const id of VANILLA_NEG) rec(`${id} keeps research_cost = -1`, costOf(after, id) === "-1", costOf(after, id));
      // The round trip that found this also proved sub_technologies sound — keep that pinned, since the
      // user's report was that sub-technologies had never been tested at all.
      const subsBefore = (before.match(/sub_technologies\s*=\s*\{/g) || []).length;
      const subsAfter = (after.match(/sub_technologies\s*=\s*\{/g) || []).length;
      rec("…and every sub_technologies block survives", subsBefore > 0 && subsAfter === subsBefore,
        { before: subsBefore, after: subsAfter });
    }
    api.stop(); api = null;

    console.log("\n[back-out] take the minus sign out of the pattern again");
    {
      const built = controlApp("noneg", [[
        "              const costMatch = /research_cost\\s*=\\s*(-?[0-9.]+)/.exec(blockText);",
        "              const costMatch = /research_cost\\s*=\\s*([0-9.]+)/.exec(blockText);"]]);
      if (built.error) rec("the control patched cleanly", false, built.error);
      else {
        const capi = await serve(built.createApp());
        const cmod = mkMod("ctl", "t.txt", SYNTH);
        try {
          const cat = await capi.get(`/api/technologies/catalog?modPath=${encodeURIComponent(cmod)}`);
          const t = (cat.b.technologies || cat.b.techs || []).find((x) => x && x.id === "nua_granted_tech");
          rec("…the value is misread as the default 1", t && t.researchCost === 1, t && t.researchCost);
          const { after } = await roundTrip(capi, cmod, "t.txt");
          rec("…and then dropped from the file entirely by a no-edit save",
            costOf(after, "nua_granted_tech") === "(no research_cost)", costOf(after, "nua_granted_tech"));
        } finally { capi.stop(); }
      }
    }

    console.log(`\n=== negative research cost: ${checks} checks, ${fails.length} failed ===`);
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
