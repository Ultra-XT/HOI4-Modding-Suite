// #tech-catalog-lists-nested-blocks — THE RESEARCH CATALOGUE OFFERED A SUB-UNIT'S STAT BLOCK AS A TECHNOLOGY.
//
// collectTechBlocksFromText told a technology from a block nested inside one by INDENTATION: any `<id> = {` with
// at most one tab (or four spaces) in front of it was a technology. HOI4 reads braces, not whitespace. The
// Millennium Dawn the owner reinstalled on 2026-09-11 writes the blocks INSIDE its ukr_zhytomyr_* technologies
// (common/technologies/custom_tech.txt) with a single tab:
//
//       ukr_zhytomyr_engi_h = {
//       allow = {
//               original_tag = UKR
//           }
//       H_Engi_Comp = {
//       suppression = 0.5
//
// so /api/technologies/catalog listed H_Engi_Comp, Arty_Bat and combat_service_support_company — two sub-units and
// a support company — as technologies of that mod: each a legal prerequisite, folder placement and set_technology
// grant naming something the game does not load. And the real technology around each was cut short at the
// phantom's line, because a technology's block is clamped at its next "sibling".
//
// Measured over every installed corpus, indentation rule against brace depth (a direct child of
// `technologies = {`): vanilla 552/552, Novum Vexillum 625/625, Rise of Nations 2,339/2,339, Old World Blues
// 1,089/1,089 — identical; Millennium Dawn 1,481 -> 1,478 (the three above); Road to 56 940 -> 920
// (enable_building, ai_research_weights, cavalry, category_recon … nested at one tab). Neither rule found a
// direct child the other missed — brace depth only removes what is not a technology.
//
// The depth-aware locator already existed next door: findTopLevelTechBlockIndex (#top-level-tech-only), which the
// tech WRITER uses to find the block it removes or replaces. The reader never adopted it, so reader and writer
// disagreed about which blocks are technologies. The reader's second locator — the raw block it re-reads for
// comments, modifiers and extraScript (#raw-block-wrong-depth) — used the same indentation rule "so the two
// locators agree", and so took a nested block named like a later technology as that technology's body.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-technest-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
const MD = path.join(WS, "2777392649");
// Road to 56's workshop copy carries files a Nova session wrote into it on 2026-07-19. Nothing may be pinned to it,
// so the corpus search below never asks it.
const R56 = path.join(WS, "820260968");

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

// The field names collectTechBlocksFromText skips, lifted from the source so this cannot drift from it. They are
// the keys a technology's body commonly holds, and the old rule already declined to list them.
const SERVER_SRC = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
const BAD_KEYS = (() => {
  const at = SERVER_SRC.indexOf("function collectTechBlocksFromText");
  const m = at === -1 ? null : /const badKeys = new Set\((\[[^\]]*\])\);/.exec(SERVER_SRC.slice(at, at + 6000));
  try { return new Set(m ? JSON.parse(m[1]) : []); } catch (_) { return new Set(); }
})();

// The body of the first top-level `technologies = { … }`, comments blanked (length kept), or null.
function technologiesBody(text) {
  const t = String(text || "").replace(/#[^\n]*/g, (c) => " ".repeat(c.length));
  const m = /(?:^|\n)[ \t]*technologies[ \t]*=[ \t]*\{/.exec(t);
  if (!m) return null;
  const open = t.indexOf("{", m.index);
  let d = 0;
  for (let i = open; i < t.length; i++) {
    if (t[i] === "{") d++;
    else if (t[i] === "}") { d--; if (d === 0) return t.slice(open + 1, i); }
  }
  return t.slice(open + 1); // Clausewitz closes an unterminated block at end of file
}
// Every `<id> = {` that starts a line of that body, with its indentation and its brace depth.
function blockLines(text) {
  const body = technologiesBody(text);
  if (body === null) return [];
  const out = [];
  let depth = 0;
  for (const line of body.split("\n")) {
    const m = /^([ \t]*)([A-Za-z0-9_@.\-]+)[ \t]*=[ \t]*\{/.exec(line);
    if (m) out.push({ id: m[2], ws: m[1], depth });
    for (const c of line.replace(/"[^"]*"/g, "")) { if (c === "{") depth++; else if (c === "}") depth--; }
  }
  return out;
}
const techIdsByDepth = (text) => blockLines(text).filter((b) => b.depth === 0 && !b.id.startsWith("@")).map((b) => b.id);
// The shape: a nested block indented as a technology would be, under a name the old rule did not skip.
const nestedAtTechIndent = (text) => blockLines(text).filter((b) => {
  const tabs = (b.ws.match(/\t/g) || []).length, spaces = (b.ws.match(/ /g) || []).length;
  return b.depth > 0 && tabs <= 1 && spaces <= 4 && !b.id.startsWith("@") && !BAD_KEYS.has(b.id);
}).map((b) => b.id);

function mkMod(name, files) {
  const dir = path.join(ROOT, name);
  fs.mkdirSync(path.join(dir, "common", "technologies"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"),
    `name="${name}"\nsupported_version="1.19.*"\nreplace_path = "common/technologies"\n`, "utf8");
  for (const [f, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, "common", "technologies", f), body, "utf8");
  return dir;
}

const PORT = 44617;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(PORT, () => resolve({
      get: (u) => fetch(`http://127.0.0.1:${PORT}${u}`).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}

// A real technology holding two blocks written at a technology's indentation, the way MD's custom_tech.txt writes
// them, and a technology after it.
const AT_TECH_INDENT = [
  "technologies = {",
  "\tprobe_outer = {",
  "\tallow = {",
  "\t\t\talways = yes",
  "\t\t}",
  "\tProbe_Sub_Bat = {",
  "\tsoft_attack = 0.1",
  "\t\t}",
  "\t\tresearch_cost = 2",
  "\t\tstart_year = 1941",
  "\t\tfolder = { name = infantry_folder position = { x = 3 y = 5 } }",
  "\t}",
  "",
  "\tprobe_after = {",
  "\t\tresearch_cost = 1",
  "\t\tstart_year = 1936",
  "\t\tfolder = { name = infantry_folder position = { x = 4 y = 5 } }",
  "\t}",
  "}",
  "",
].join("\n");
// Byte for byte the same script, indented the ordinary way.
const PROPERLY_INDENTED = [
  "technologies = {",
  "\tprobe_outer = {",
  "\t\tallow = {",
  "\t\t\talways = yes",
  "\t\t}",
  "\t\tProbe_Sub_Bat = {",
  "\t\t\tsoft_attack = 0.1",
  "\t\t}",
  "\t\tresearch_cost = 2",
  "\t\tstart_year = 1941",
  "\t\tfolder = { name = infantry_folder position = { x = 3 y = 5 } }",
  "\t}",
  "",
  "\tprobe_after = {",
  "\t\tresearch_cost = 1",
  "\t\tstart_year = 1936",
  "\t\tfolder = { name = infantry_folder position = { x = 4 y = 5 } }",
  "\t}",
  "}",
  "",
].join("\n");
// A nested block written at a technology's indentation and named like a technology declared LATER in the file.
const TWIN = [
  "technologies = {",
  "\tprobe_carrier = {",
  "\tprobe_twin = {",
  "\tsoft_attack = 0.25",
  "\t\t}",
  "\t\tresearch_cost = 1",
  "\t\tstart_year = 1936",
  "\t\tfolder = { name = infantry_folder position = { x = 0 y = 7 } }",
  "\t}",
  "",
  "\tprobe_twin = {",
  "\t\tresearch_cost = 3",
  "\t\tstart_year = 1942",
  "\t\tfolder = { name = infantry_folder position = { x = 1 y = 7 } }",
  "\t}",
  "}",
  "",
].join("\n");

(async () => {
  const api = await serve(createApp());
  const catalog = (dir) => api.get(`/api/technologies/catalog?lite=1&modPath=${encodeURIComponent(dir)}`)
    .then((c) => (c.b && (c.b.technologies || c.b.techs)) || []);
  const pick = (t) => t && { researchCost: t.researchCost, startYear: t.startYear, x: t.x, y: t.y, folder: t.folder };
  try {
    console.log("\n[control] the fixtures have the shapes they claim");
    rec("the badKeys list was lifted from server.js", BAD_KEYS.size > 5 && BAD_KEYS.has("allow"), [...BAD_KEYS].slice(0, 5));
    rec("the one-tab fixture nests Probe_Sub_Bat at a technology's indentation",
      nestedAtTechIndent(AT_TECH_INDENT).includes("Probe_Sub_Bat"), nestedAtTechIndent(AT_TECH_INDENT));
    rec("…the ordinary fixture does not", nestedAtTechIndent(PROPERLY_INDENTED).length === 0, nestedAtTechIndent(PROPERLY_INDENTED));
    rec("…and both declare the same two technologies",
      JSON.stringify(techIdsByDepth(AT_TECH_INDENT)) === '["probe_outer","probe_after"]'
      && JSON.stringify(techIdsByDepth(PROPERLY_INDENTED)) === '["probe_outer","probe_after"]',
      [techIdsByDepth(AT_TECH_INDENT), techIdsByDepth(PROPERLY_INDENTED)]);

    console.log("\n[the bug] a block nested at a technology's indentation is not a technology");
    const oneTab = await catalog(mkMod("onetab", { "zz_probe_nested.txt": AT_TECH_INDENT }));
    const ids = oneTab.map((t) => t.id);
    rec("both real technologies are listed", ids.includes("probe_outer") && ids.includes("probe_after"), ids);
    rec("⭐ the nested Probe_Sub_Bat is NOT listed as a technology", !ids.includes("Probe_Sub_Bat"), ids);
    rec("…nor is anything else", ids.length === 2, ids);
    const outer = oneTab.find((t) => t.id === "probe_outer");
    rec("⭐ the technology holding it keeps what is written AFTER the nested block (research_cost 2, start_year 1941)",
      !!outer && Number(outer.researchCost) === 2 && Number(outer.startYear) === 1941, pick(outer));
    rec("…and its position (3, 5)", !!outer && Number(outer.x) === 3 && Number(outer.y) === 5, pick(outer));

    console.log("\n[control] whitespace decides nothing — the ordinarily indented file reads the same");
    const proper = await catalog(mkMod("proper", { "zz_probe_nested.txt": PROPERLY_INDENTED }));
    rec("the ordinary file lists the same technologies",
      JSON.stringify(proper.map((t) => t.id).sort()) === JSON.stringify(ids.slice().sort()), { proper: proper.map((t) => t.id), oneTab: ids });
    const outerP = proper.find((t) => t.id === "probe_outer");
    rec("…and reads probe_outer identically", JSON.stringify(pick(outerP)) === JSON.stringify(pick(outer)), { proper: pick(outerP), oneTab: pick(outer) });

    console.log("\n[the second locator] a nested block named like a later technology is not that technology's body");
    const twin = await catalog(mkMod("twin", { "zz_probe_twin.txt": TWIN }));
    const real = twin.filter((t) => t.id === "probe_twin");
    rec("probe_twin is listed once", real.length === 1, twin.map((t) => t.id));
    const tw = real[0];
    rec("…with its OWN research_cost and position (3; 1, 7)",
      !!tw && Number(tw.researchCost) === 3 && Number(tw.x) === 1 && Number(tw.y) === 7, pick(tw));
    rec("⭐ …and none of the nested block's soft_attack in its modifiers or preserved script",
      !!tw && !/soft_attack/.test(JSON.stringify({ m: tw.modifiers, e: tw.extraScript, l: tw.leadComments })),
      tw && { modifiers: tw.modifiers, extraScript: tw.extraScript });
    const carrier = twin.find((t) => t.id === "probe_carrier");
    rec("the carrier keeps its position (0, 7)", !!carrier && Number(carrier.x) === 0 && Number(carrier.y) === 7, pick(carrier));

    console.log("\n[the corpus] the first installed map that nests a block at a technology's indentation");
    let others = [];
    try { others = fs.readdirSync(WS).map((d) => path.join(WS, d)).filter((d) => d !== MD && d !== R56).sort(); } catch (_) {}
    let SRC = null, techFiles = [], nested = [];
    for (const root of [MD].concat(others)) {
      const dir = path.join(root, "common", "technologies");
      let files = [];
      try { files = fs.readdirSync(dir).filter((f) => /\.txt$/i.test(f)).sort(); } catch (_) { continue; }
      const found = [];
      for (const f of files) {
        let t = "";
        try { t = fs.readFileSync(path.join(dir, f), "utf8"); } catch (_) { continue; }
        for (const id of nestedAtTechIndent(t)) found.push([f, id]);
      }
      if (found.length) { SRC = root; techFiles = files; nested = found; break; }
    }
    if (!SRC) {
      console.log("     SKIPPED — no installed map nests a block at a technology's indentation; the fixtures above carry the check");
    } else {
      const dir = path.join(SRC, "common", "technologies");
      const copies = {};
      const declared = new Set();
      for (const f of techFiles) {
        const t = fs.readFileSync(path.join(dir, f), "utf8");
        copies[f] = t;
        techIdsByDepth(t).forEach((id) => declared.add(id));
      }
      const notTechs = [...new Set(nested.map(([, id]) => id))].filter((id) => !declared.has(id));
      console.log(`     ${path.basename(SRC)}: ${declared.size} technologies; nested at a technology's indentation: `
        + nested.slice(0, 6).map(([f, id]) => `${id} (${f})`).join(", ") + (nested.length > 6 ? ` +${nested.length - 6}` : ""));
      const list = await catalog(mkMod("corpus", copies));
      const got = new Set(list.map((t) => t.id));
      rec("CONTROL: some of those nested names are declared as no technology at all", notTechs.length > 0, notTechs);
      rec("⭐ not one of them is offered as a technology", notTechs.every((id) => !got.has(id)), notTechs.filter((id) => got.has(id)));
      const missing = [...declared].filter((id) => !got.has(id));
      rec("…while every technology those files declare still is", missing.length === 0, missing.slice(0, 10));
    }

    console.log(`\n=== a block nested in a technology is not a technology: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { api.stop(); } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
