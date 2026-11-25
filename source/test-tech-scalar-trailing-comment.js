// #tech-scalar-trailing-comment — A NO-EDIT SAVE DELETED THE NOTE BESIDE A TECH'S research_cost.
//
// buildExtraScriptFromTechBlock strips five scalar lines out of the block by regex, so serializeTechnology
// can re-emit them from the model and stay the single source of truth for them:
//
//   research_cost · start_year · show_equipment_icon · doctrine · force_use_small_tech_layout
//
// The regex takes the WHOLE line, so a trailing comment went with it and the value came back bare. Every
// other comment in a tech block survives — extraScript is deliberately read from the UN-stripped text for
// exactly that reason (#keep-tech-comments) — these five were the hole in it.
//
// It is a small population and worth keeping anyway, because what it deletes is the author's reasoning:
//
//   vanilla air_techs.txt      research_cost = 1.0 #Carrier Variant          (13 of them)
//   Millennium Dawn            start_year = 1945 #needs to be synched maybee with other starting techs
//                              start_year = 2015 ## checked
//
// The note is now read off the raw block alongside authoredFields and re-emitted with the value.
//
// Found by round-tripping vanilla's common/technologies through the catalog and back into
// /api/technologies/save. NOT a bug, checked and confirmed sound in the same pass: the block's key ORDER
// changes and `research_cost = 1.0` is rewritten as `research_cost = 1` — numerically identical, and HOI4
// reads both the same.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-tsc-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const VTECH = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/common/technologies";
const MDTECH = "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649/common/technologies";

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
  const p = path.join(__dirname, `.ctl-tsc-${process.pid}-${label}.js`);
  fs.writeFileSync(p, wasCrlf ? out.replace(/\n/g, "\r\n") : out, "utf8");
  ctlFiles.push(p);
  try { return { createApp: require(p).createApp }; } catch (e) { return { error: String(e && e.message) }; }
}

// A tech annotating all five of the stripped scalars.
const FIXTURE = `technologies = {

	zz_annotated_tech = {

		enable_equipments = {
			infantry_equipment_1
		}

		research_cost = 1.0 #Carrier Variant
		start_year = 1939 #needs to be synched with the other starting techs
		show_equipment_icon = yes # the wide box reads better here
		force_use_small_tech_layout = yes ## checked

		folder = {
			name = infantry_folder
			position = { x = 2 y = 2 }
		}

		categories = {
			infantry_weapons
		}
	}
}
`;

function mkMod(name) {
  const dir = path.join(ROOT, name);
  fs.mkdirSync(path.join(dir, "common", "technologies"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), `name="${name}"\nsupported_version="1.19.*"\n`, "utf8");
  fs.writeFileSync(path.join(dir, "common", "technologies", "zz_annotated.txt"), FIXTURE, "utf8");
  return dir;
}

function blockOf(text, id) {
  const re = new RegExp(`(^|\\n)\\s*${id}\\s*=\\s*\\{`);
  const m = re.exec(text);
  if (!m) return "";
  const open = text.indexOf("{", m.index);
  let d = 0;
  for (let k = open; k < text.length; k++) {
    const c = text[k];
    if (c === "#") { while (k < text.length && text[k] !== "\n") k++; continue; }
    if (c === "{") d++;
    else if (c === "}") { d--; if (d === 0) return text.slice(m.index, k + 1); }
  }
  return "";
}
// trailing comments on the five stripped scalars, across a whole directory
function annotatedScalars(dir) {
  const KEYS = ["research_cost", "start_year", "show_equipment_icon", "doctrine", "force_use_small_tech_layout"];
  const out = {};
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => /\.txt$/i.test(f)); } catch (_) { return null; }
  for (const f of files) {
    let t = "";
    try { t = fs.readFileSync(path.join(dir, f), "utf8"); } catch (_) { continue; }
    for (const line of t.split(/\r?\n/)) {
      const m = /^\s*([a-z_]+)\s*=\s*[^\s#]+\s*(#.*)$/.exec(line);
      if (m && KEYS.includes(m[1])) out[m[1]] = (out[m[1]] || 0) + 1;
    }
  }
  return out;
}

let PORT = 44360;
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

// list the mod's techs, then hand the annotated one straight back unchanged
async function roundTrip(api, mod) {
  const cat = await api.get(`/api/technologies/catalog?modPath=${encodeURIComponent(mod)}`);
  const all = (cat.b && cat.b.technologies) || [];
  const t = all.find((x) => x.id === "zz_annotated_tech");
  if (!t) return { err: "tech not in catalog", block: "" };
  const r = await api.post("/api/technologies/save", { modPath: mod, tech: t, allTechs: all });
  const text = fs.readFileSync(path.join(mod, "common", "technologies", "zz_annotated.txt"), "utf8");
  return { r, tech: t, block: blockOf(text, "zz_annotated_tech") };
}

(async () => {
  const api = await serve(createApp());
  try {
    console.log("\n[ground truth] shipping content annotates these lines");
    const v = annotatedScalars(VTECH);
    if (!v) console.log("  (skipped — vanilla not installed)");
    else {
      rec("vanilla annotates research_cost on its carrier variants", (v.research_cost || 0) >= 13, v);
      rec("…and air_techs.txt is where they are",
        /research_cost\s*=\s*1\.0\s*#Carrier Variant/.test(fs.readFileSync(path.join(VTECH, "air_techs.txt"), "utf8")), "not found");
    }
    const md = annotatedScalars(MDTECH);
    if (!md) console.log("  (skipped — Millennium Dawn not installed)");
    else rec("Millennium Dawn annotates start_year", (md.start_year || 0) >= 3, md);

    console.log("\n[the bug] a no-edit save keeps the note beside each scalar");
    const mod = mkMod("m");
    const { r, tech, block } = await roundTrip(api, mod);
    rec("the save succeeds", r && r.s === 200 && !r.b.error, r && r.b);
    rec("the catalog carries the notes", !!(tech && tech.scalarComments && tech.scalarComments.research_cost),
      tech && tech.scalarComments);
    rec("research_cost keeps its note", /research_cost\s*=\s*\S+\s*#Carrier Variant/.test(block), block);
    rec("start_year keeps its note", /start_year\s*=\s*1939\s*#needs to be synched/.test(block), block);
    rec("show_equipment_icon keeps its note", /show_equipment_icon\s*=\s*yes\s*# the wide box/.test(block), block);
    rec("force_use_small_tech_layout keeps its note", /force_use_small_tech_layout\s*=\s*yes\s*## checked/.test(block), block);
    rec("…and the VALUES are unchanged",
      /start_year\s*=\s*1939/.test(block) && /show_equipment_icon\s*=\s*yes/.test(block), block);
    rec("the block is brace-balanced",
      (block.replace(/#[^\n]*/g, "").match(/\{/g) || []).length === (block.replace(/#[^\n]*/g, "").match(/\}/g) || []).length, block);

    console.log("\n[idempotence] a second no-edit round trip changes nothing further");
    const again = await roundTrip(api, mod);
    rec("byte-identical on the second pass", again.block === block, "changed again");

    console.log("\n[no invention] a tech with no note gets none added");
    {
      const bare = mkMod("bare");
      fs.writeFileSync(path.join(bare, "common", "technologies", "zz_annotated.txt"),
        FIXTURE.replace(/ *#[^\n]*/g, ""), "utf8");
      const out = await roundTrip(api, bare);
      rec("no `#` appears in the rewritten block", !/#/.test(out.block), out.block);
    }
    api.stop();

    console.log("\n[back-out] stop carrying the note");
    {
      const built = controlApp("nonote", [[
        "    const noteT = (key) => (sc && typeof sc[key] === \"string\" && sc[key].trim() ? ` ${sc[key].trim()}` : \"\");",
        "    const noteT = () => \"\";"]]);
      if (built.error) rec("the control patched cleanly", false, built.error);
      else {
        const capi = await serve(built.createApp());
        const cmod = mkMod("ctl");
        try {
          const out = await roundTrip(capi, cmod);
          rec("…and research_cost's note is deleted", !/#Carrier Variant/.test(out.block), out.block);
          rec("…and start_year's too", !/needs to be synched/.test(out.block), out.block);
        } finally { capi.stop(); }
      }
    }

    console.log(`\n=== tech scalar trailing comment: ${checks} checks, ${fails.length} failed ===`);
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
