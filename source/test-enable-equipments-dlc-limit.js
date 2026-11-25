// #enable-equipments-dlc-limit — A TECH WITH TWO enable_equipments BLOCKS CAME BACK WITH ONE.
//
// Found by a multi-agent hunt over the makers, then reproduced by hand before it was believed.
//
// The technology reader flattens every `enable_equipments` block into one list of bare ids and explicitly
// discards the nested `limit` — its own comment names that as DLC gating — so the model has nowhere to hold
// the gate. The author's verbatim text was handed back only when there was exactly ONE such block
// (#keep-enable-equip-raw). A tech with two took the rebuild path and was written back as a single flat
// block: the second block AND the gate gone, with the save reporting ok. `extraScript` cannot rescue it
// either, because buildExtraScriptFromTechBlock strips enable_equipments.
//
// Measured on vanilla's electronic_mechanical_engineering.txt, a no-edit round trip of the whole file:
//   BEFORE  improved_rocket_engines 2 blocks -> 1, has_dlc kept 0
//           advanced_rocket_engines 2 blocks -> 1, has_dlc kept 0
//   AFTER   both 2 -> 2, has_dlc kept 1
// A By Blood Alone owner would otherwise research into rocket_interceptor_equipment_2, which that DLC
// deliberately withholds.
//
// STILL BROKEN, separately, and NOT caused by this fix: `sp_rockets_improved_guidance` loses its single
// enable_equipments block (1 -> 0) identically on both sides of the change. Different cause, pinned here so
// the number below is not mistaken for a clean sweep.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-eqlimit-"));
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
  const p = path.join(__dirname, `.ctl-eqlimit-${process.pid}-${label}.js`);
  fs.writeFileSync(p, wasCrlf ? out.replace(/\n/g, "\r\n") : out, "utf8");
  ctlFiles.push(p);
  try { return { createApp: require(p).createApp }; } catch (e) { return { error: String(e && e.message) }; }
}

const VANILLA_TECH = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/common/technologies";
const SRC = "electronic_mechanical_engineering.txt";
let seq = 0;
function mkMod() {
  const dir = path.join(ROOT, "m" + (++seq));
  fs.mkdirSync(path.join(dir, "common", "technologies"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), 'name="m"\nsupported_version="1.19.*"\n', "utf8");
  fs.copyFileSync(path.join(VANILLA_TECH, SRC), path.join(dir, "common", "technologies", SRC));
  return dir;
}
const techPath = (dir) => path.join(dir, "common", "technologies", SRC);
// The text of one tech's own block, brace-matched from its declaration line.
function techSegment(text, id) {
  const i = text.indexOf("\n\t" + id + " = {");
  if (i === -1) return "";
  let d = 0;
  for (let k = text.indexOf("{", i); k < text.length; k++) {
    if (text[k] === "{") d++;
    else if (text[k] === "}") { d--; if (!d) return text.slice(i, k + 1); }
  }
  return "";
}
const blocks = (seg) => (seg.match(/enable_equipments\s*=\s*\{/g) || []).length;
const dlcGates = (seg) => (seg.match(/has_dlc/g) || []).length;

let PORT = 47300;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      get: (u) => fetch(`http://127.0.0.1:${PORT}${u}`).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      post: (u, body) => fetch(`http://127.0.0.1:${PORT}${u}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}
async function noEditRoundTrip(api, dir) {
  const before = fs.readFileSync(techPath(dir), "utf8");
  const cat = await api.get(`/api/technologies/catalog?modPath=${encodeURIComponent(dir)}`);
  const list = ((cat.b.technologies || cat.b.techs) || []).filter((t) => t.isMod);
  const save = await api.post("/api/technologies/save-batch", { modPath: dir, technologies: list, file: SRC });
  return { before, after: fs.readFileSync(techPath(dir), "utf8"), list, save: save.b };
}

const MULTI = ["improved_rocket_engines", "advanced_rocket_engines"];

(async () => {
  let api = null;
  try {
    if (!fs.existsSync(path.join(VANILLA_TECH, SRC))) {
      console.log("  --   vanilla not installed; this test measures a vanilla file, skipping");
      console.log("\n=== enable_equipments DLC limit: skipped ===");
      return;
    }

    console.log("\n[ground truth] the file really does carry gated multi-block techs");
    const raw = fs.readFileSync(path.join(VANILLA_TECH, SRC), "utf8");
    for (const id of MULTI) {
      rec(`${id} declares two enable_equipments blocks`, blocks(techSegment(raw, id)) === 2, blocks(techSegment(raw, id)));
      rec(`…one of them gated by has_dlc`, dlcGates(techSegment(raw, id)) >= 1, dlcGates(techSegment(raw, id)));
    }

    api = await serve(createApp());

    console.log("\n[a no-edit round trip] keeps both blocks and the gate");
    const dir = mkMod();
    const r = await noEditRoundTrip(api, dir);
    rec("the batch save succeeds", r.save && r.save.ok === true, r.save);
    rec("…and the catalogue carried every block for a multi-block tech",
      (r.list.find((t) => t.id === MULTI[0]) || {}).enableEquipmentsRawAll &&
      ((r.list.find((t) => t.id === MULTI[0]) || {}).enableEquipmentsRawAll || []).length === 2,
      (r.list.find((t) => t.id === MULTI[0]) || {}).enableEquipmentsRawAll);
    for (const id of MULTI) {
      const b = techSegment(r.before, id), a = techSegment(r.after, id);
      rec(`${id} still has both blocks`, blocks(a) === blocks(b) && blocks(a) === 2, { before: blocks(b), after: blocks(a) });
      rec(`…and still has its DLC gate`, dlcGates(a) === dlcGates(b) && dlcGates(a) >= 1, { before: dlcGates(b), after: dlcGates(a) });
      rec(`…naming the equipment the gate withholds`, /rocket_interceptor_equipment/.test(a), a.slice(0, 200));
    }
    rec("the file is still brace-balanced",
      (r.after.replace(/#.*$/gm, "").match(/\{/g) || []).length === (r.after.replace(/#.*$/gm, "").match(/\}/g) || []).length, "unbalanced");

    // #enable-equipments-comment-only-block — this block used to assert the LOSS. It was a separate defect,
    // found while fixing the multi-block one and pinned in its broken state so the result could not be
    // mistaken for a clean sweep; it has since been fixed, and the assertion is inverted rather than deleted.
    console.log("\n[a comment-only block] survives too — an empty list is not the same as no block");
    {
      const seg = techSegment(r.after, "sp_rockets_improved_guidance");
      rec("sp_rockets_improved_guidance keeps its block",
        blocks(seg) === blocks(techSegment(r.before, "sp_rockets_improved_guidance")) && blocks(seg) === 1,
        { before: blocks(techSegment(r.before, "sp_rockets_improved_guidance")), after: blocks(seg) });
      rec("…including the author's note about the equipment they have not made yet",
        /#\s*guided_missile_equipment_2/.test(seg), seg.slice(0, 300));
      const totalBefore = (r.before.match(/enable_equipments\s*=\s*\{/g) || []).length;
      const totalAfter = (r.after.match(/enable_equipments\s*=\s*\{/g) || []).length;
      rec("…so the whole file round-trips every enable_equipments block it had",
        totalBefore === totalAfter, { totalBefore, totalAfter });
    }
    console.log("\n[the four edit cases] preserving a comment-only block must not resurrect a cleared one");
    {
      const mkTech = (body) => {
        const dir = path.join(ROOT, "e" + ++seq);
        fs.mkdirSync(path.join(dir, "common", "technologies"), { recursive: true });
        fs.writeFileSync(path.join(dir, "descriptor.mod"), 'name="m"\nsupported_version="1.19.*"\n', "utf8");
        fs.writeFileSync(path.join(dir, "common", "technologies", "zz_t.txt"), body, "utf8");
        return dir;
      };
      const TECH = (inner) => `technologies = {\n\tnua_tech = {\n\t\tenable_equipments = {\n${inner}\n\t\t}\n\t\tresearch_cost = 1\n\t\tfolder = { name = infantry_folder position = { x = 0 y = 0 } }\n\t}\n}\n`;
      const WITH_LIST = TECH("\t\t\tinfantry_equipment_1\n\t\t\tinfantry_equipment_2");
      const COMMENT_ONLY = TECH("\t\t\t#not_made_yet");
      const run = async (body, mutate) => {
        const dir = mkTech(body);
        const cat = await api.get(`/api/technologies/catalog?modPath=${encodeURIComponent(dir)}`);
        const list = ((cat.b.technologies || cat.b.techs) || []).filter((t) => t.isMod);
        list.forEach(mutate);
        await api.post("/api/technologies/save-batch", { modPath: dir, technologies: list, file: "zz_t.txt" });
        return fs.readFileSync(path.join(dir, "common", "technologies", "zz_t.txt"), "utf8");
      };
      const t1 = await run(COMMENT_ONLY, () => {});
      rec("a comment-only block survives an untouched save", blocks(t1) === 1 && /not_made_yet/.test(t1), t1);
      const t2 = await run(WITH_LIST, () => {});
      rec("a listed block survives an untouched save", blocks(t2) === 1 && /infantry_equipment_1/.test(t2), t2);
      const t3 = await run(WITH_LIST, (t) => { t.enableEquipments = []; });
      rec("…but CLEARING the list in the editor still removes the block entirely — not an empty one left behind",
        blocks(t3) === 0, t3);
      const t4 = await run(WITH_LIST, (t) => { t.enableEquipments = ["infantry_equipment_3"]; });
      rec("…and changing the list writes the new one, without the old ids",
        blocks(t4) === 1 && /infantry_equipment_3/.test(t4) && !/infantry_equipment_1/.test(t4), t4);
    }
    api.stop(); api = null;

    console.log("\n[back-out] keep only the single-block verbatim path");
    {
      const built = controlApp("singleonly", [[
        "      if (rawAll && rawAll.length > 1 && sameAsModel(rawAll.flatMap(flatten))) {",
        "      if (false && rawAll && rawAll.length > 1 && sameAsModel(rawAll.flatMap(flatten))) {"]]);
      if (built.error) rec("the control patched cleanly", false, built.error);
      else {
        const capi = await serve(built.createApp());
        try {
          const cdir = mkMod();
          const c = await noEditRoundTrip(capi, cdir);
          rec("…the control still reports a successful save", c.save && c.save.ok === true, c.save);
          for (const id of MULTI) {
            const a = techSegment(c.after, id);
            rec(`…${id} collapses to one block`, blocks(a) === 1, blocks(a));
            rec(`…and its DLC gate is gone entirely`, dlcGates(a) === 0,
              "the gate survived — the control did not reproduce the bug");
          }
        } finally { capi.stop(); }
      }
    }

    console.log(`\n=== enable_equipments DLC limit: ${checks} checks, ${fails.length} failed ===`);
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
