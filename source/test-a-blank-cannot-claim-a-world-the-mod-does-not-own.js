// ⛔ #a-blank-claims-a-world-the-mod-does-not-own — DELETE MAP DROWNED TWO THIRDS OF THE WORLD IN A MOD
// THAT CANNOT OWN A WORLD.
//
// The owner built a world through Nova's own sequence — new mod → 🗑 Delete map → 🌍 Generate land at 35% →
// 🛠 Auto-fix ×2 — and launched it without -debug. Nova had called it 3 problems, 1 error, 0 fatal. It LOADED:
// main menu, a 1936 singleplayer game, no MAP_ERROR, a 14-line error.log. Then he looked at it: "the world
// looked super weird … it was still the same world but full of holes … full of weird things that looked like
// glass."
//
// 📊 Measured against the installed mod and the installed game (13,414 rows each):
//
//     vanilla map/definition.csv    10,155 land ·  3,133 sea · 126 lake
//     the mod's map/definition.csv   4,655 land ·  8,633 sea · 126 lake
//     6,594 provinces went land → sea · 1,094 went sea → land · 2,515 more changed terrain only
//     …and the mod ships NO map/provinces.bmp.
//
// Province SHAPES came from the base game; province TYPES came from the mod. Two thirds of the world's land
// drowned exactly where it stood, and vanilla's ocean provinces — which are enormous — came up as angular
// land. The holes, and the glass.
//
// 📊 Reproduced on a copy, on the base commit, against a scratch mod holding nothing but the descriptor Nova's
// own wizard writes: ONE blankMapToSea call flipped 10,154 land rows to sea and MATERIALISED six map files —
// definition.csv (445 KB), heightmap.bmp (11.5 MB), a 0-byte supply_nodes.txt, a 0-byte railways.txt and a
// 0-byte buildings.txt — while writing no provinces.bmp, no terrain.bmp and no rivers.bmp. It kept no snapshot
// either: nothing was OVERWRITTEN, so there was nothing to back up and nothing to restore from.
//
// ⭐ THE WORDS ALREADY EXISTED NEXT DOOR. fixMapXCrossings, in the same file, declines for exactly this reason:
// "This mod has no map/provinces.bmp of its own, so the X-crossing is in a file it inherits. Nova will not
// write into the base game or another mod." An X-crossing is one pixel; a blank is every pixel of the world.
//
// ⚠️ IT REFUSES RATHER THAN COPYING THE BITMAP IN, and that is the measured choice: materialising vanilla's
// provinces.bmp changes not one pixel of what HOI4 draws (the blank and the land generator both keep the
// province partition), so it would hand back the same moth-eaten world, 34 MB heavier and formally owned —
// the trap the X-crossing decline already names.
//
// Run: node test-a-blank-cannot-claim-a-world-the-mod-does-not-own.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const ok = (label, cond, detail) => {
  checks++;
  if (cond === true) { console.log("  ok   " + label); return; }
  fails.push(label);
  console.log("  FAIL " + label + (detail === undefined ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300)));
};

const tmps = [];
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-blankown-home-")); tmps.push(HOME);
process.env.NOVA_HOME_DIR = HOME;
process.env.NOVA_APP_DATA_DIR = path.join(HOME, "appdata");
process.env.APPDATA = path.join(HOME, "roaming");
process.env.XDG_CONFIG_HOME = path.join(HOME, "xdg");
for (const d of [process.env.NOVA_APP_DATA_DIR, process.env.APPDATA, process.env.XDG_CONFIG_HOME]) fs.mkdirSync(d, { recursive: true });

const md = require("./map-data.js");
const { stripJsComments } = require("./testlib-strip-comments.js");

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const WORKSHOP = "D:/SteamLibrary/steamapps/workshop/content/394360";

const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const tmp = (tag) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-blankown-" + tag + "-")); tmps.push(d); return d; };
const listTxt = (d) => { try { return fs.readdirSync(d).filter((f) => f.toLowerCase().endsWith(".txt")); } catch (_) { return []; } };

/** A 24-bit provinces.bmp: one vertical stripe per province, in the colours the definition rows use. */
function bmp24(W, H, colAtX) {
  const rowSize = (W * 3 + 3) & ~3, imageSize = rowSize * H;
  const b = Buffer.alloc(54 + imageSize);
  b.write("BM", 0, "ascii");
  b.writeUInt32LE(54 + imageSize, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26);
  b.writeUInt16LE(24, 28); b.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < H; y++) { let o = 54 + (H - 1 - y) * rowSize; for (let x = 0; x < W; x++) { const c = colAtX(x); b[o++] = c[2]; b[o++] = c[1]; b[o++] = c[0]; } }
  return b;
}

// ── the fixture: a base "game" with a real world, and mods layered over it ───────────────────────────
// Four provinces: 1, 2, 3 land and 4 sea. The base root owns definition.csv AND provinces.bmp, exactly as
// every installed map does; the mods over it own whatever each case is about.
const COL = { 1: [10, 10, 10], 2: [20, 20, 20], 3: [30, 30, 30], 4: [40, 40, 40] };
const LAND_IDS = [1, 2, 3];
const DEF = ["0;0;0;0;land;false;unknown;0"]
  .concat(LAND_IDS.map((i) => i + ";" + COL[i][0] + ";" + COL[i][1] + ";" + COL[i][2] + ";land;false;plains;1"))
  .concat(["4;40;40;40;sea;false;ocean;0"]).join("\r\n") + "\r\n";
const REGION = 'strategic_region={\n\tid=1\n\tname="REGION_1"\n\tprovinces={ 1 2 3 4 }\n\tweather={}\n}\n';
const STATE = (id, provs) => "state = {\n\tid = " + id + '\n\tname = "STATE_' + id + '"\n\tstate_category = rural\n\tprovinces = { ' + provs + " }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n";

function makeBase() {
  const g = tmp("base");
  mk(path.join(g, "map", "definition.csv"), DEF);
  fs.writeFileSync(path.join(g, "map", "provinces.bmp"), bmp24(12, 4, (x) => COL[x < 3 ? 1 : x < 6 ? 2 : x < 9 ? 3 : 4]));
  mk(path.join(g, "map", "strategicregions", "r.txt"), REGION);
  mk(path.join(g, "history", "states", "1.txt"), STATE(1, "1 2"));
  mk(path.join(g, "history", "states", "2.txt"), STATE(2, "3"));
  return g;
}
/** A mod over that base. own:true adds its own copy of the world's bitmap — what the refusal asks for. */
function makeMod(tag, { descriptor = 'name="' + tag + '"\nsupported_version="1.19.*"\n', own = false, states = true } = {}) {
  const d = tmp(tag);
  mk(path.join(d, "descriptor.mod"), descriptor);
  if (own) { fs.mkdirSync(path.join(d, "map"), { recursive: true }); fs.writeFileSync(path.join(d, "map", "provinces.bmp"), bmp24(12, 4, (x) => COL[x < 3 ? 1 : x < 6 ? 2 : x < 9 ? 3 : 4])); }
  if (states) mk(path.join(d, "history", "states", "9.txt"), STATE(9, "3"));
  return d;
}

const BASE = makeBase();
const LAND_IN_BASE = DEF.split(/\r?\n/).filter((l) => { const c = l.split(";"); return /^\d+$/.test(c[0]) && c[0] !== "0" && c[4] === "land"; }).length;

console.log("\n=== 1. ⛔ THE REFUSAL: a mod with no provinces.bmp of its own cannot blank an inherited world ===");
let refused = null;
{
  const m = makeMod("noown");
  const before = listTxt(path.join(m, "history", "states"));
  const r = md.blankMapToSea({ modRoot: m, gameRoot: BASE, dependencyRoots: [] });
  refused = r;
  ok("the blank is refused", r.changed === false, r);
  ok("⭐ …and says which inherited file holds the world's shapes",
    typeof r.error === "string" && r.error.indexOf(path.join(BASE, "map", "provinces.bmp")) !== -1, r.error);
  ok("⭐ …and how much world the rewrite would have claimed, counted off the file that loads",
    typeof r.error === "string" && r.error.indexOf(String(LAND_IN_BASE)) !== -1, { land: LAND_IN_BASE, error: r.error });
  ok("…and names what to do first, as the X-crossing decline does",
    /provinces\.bmp into your mod's map\/ folder/.test(r.error || "") && /paint anything on the map/.test(r.error || ""), r.error);
  ok("…as a machine-readable reason too, not only prose", r.refusedNoOwnBitmap === true && r.landProvinces === LAND_IN_BASE, r);

  // ⛔ THE POINT: it refuses BEFORE it writes or deletes anything. On the base commit this same call
  // materialised six map files and would have deleted every state file the mod owns.
  ok("⛔ nothing was materialised into the mod's map/ folder", !fs.existsSync(path.join(m, "map")), listTxt(path.join(m, "map")));
  ok("⛔ …and the state file the mod DOES own is still there — the refusal is ahead of the deletions",
    listTxt(path.join(m, "history", "states")).join(",") === before.join(","), { before, after: listTxt(path.join(m, "history", "states")) });
  ok("⛔ …and the base root it read from is untouched", fs.existsSync(path.join(BASE, "map", "provinces.bmp")) && listTxt(path.join(BASE, "history", "states")).length === 2);
}

console.log("\n=== 2. ⭐ THE CONTROL THAT MUST STILL RUN: a mod that owns the world blanks it ===");
{
  const m = makeMod("owns", { own: true });
  const r = md.blankMapToSea({ modRoot: m, gameRoot: BASE, dependencyRoots: [] });
  ok("the blank runs", r.changed === true, r.error);
  ok("…and drowns every land province the file that loads declares", r.flippedProvinces === LAND_IN_BASE, { got: r.flippedProvinces, want: LAND_IN_BASE });
  ok("…and deletes the state file the mod owns", r.deletedStates === 1 && listTxt(path.join(m, "history", "states")).length === 0, r.deletedStates);
  ok("…and the definition.csv it now owns says so", (() => {
    const txt = fs.readFileSync(path.join(m, "map", "definition.csv"), "utf8");
    return txt.split(/\r?\n/).filter((l) => { const c = l.split(";"); return /^\d+$/.test(c[0]) && c[0] !== "0" && c[4] === "land"; }).length === 0;
  })());
  ok("⚠️ CONTROL vs case 1: the SAME base root, the SAME mod shape — one bitmap is the whole difference",
    refused && refused.changed === false && r.changed === true);
}

console.log("\n=== 3. ⚠️ CONTROLS: what must NOT be refused ===");
{
  // Nothing below loads a bitmap at all: a fixture, or a mod with no world beneath it. Nothing is being
  // claimed from anybody, so there is nothing to refuse.
  const empty = tmp("nobase");
  const m = makeMod("nobitmapanywhere");
  const r = md.blankMapToSea({ modRoot: m, gameRoot: empty, dependencyRoots: [] });
  ok("a mod with no provinces.bmp ANYWHERE below it is not refused — nothing is being taken", r.changed === true, r.error);
}
{
  // replace_path="map" hides the whole base map folder, so the base bitmap does not load either.
  const m = makeMod("tcmap", { descriptor: 'name="TC"\nreplace_path="map"\n' });
  mk(path.join(m, "map", "definition.csv"), DEF);
  const r = md.blankMapToSea({ modRoot: m, gameRoot: BASE, dependencyRoots: [] });
  ok('a total conversion whose replace_path="map" hides the base bitmap is not refused', r.changed === true, r.error);
}
{
  // A DEPENDENCY's bitmap is just as much someone else's file as the base game's.
  const dep = makeMod("dep", { own: true, states: false });
  const addon = makeMod("addon");
  const r = md.blankMapToSea({ modRoot: addon, gameRoot: BASE, dependencyRoots: [dep] });
  ok("⭐ an add-on is refused over its DEPENDENCY's bitmap, not only over the base game's",
    r.changed === false && (r.error || "").indexOf(path.join(dep, "map", "provinces.bmp")) !== -1, r.error);
}

console.log("\n=== 4. ⭐ the same answer reaches the PAGE, because the click is what has to refuse ===");
{
  const m = makeMod("model");
  const model = md.buildMapModel({ modRoot: m, gameRoot: BASE, dependencyRoots: [] });
  ok("buildMapModel says the world's shapes are not the mod's", model.provincesBmpFromMod === false, model.provincesBmpFromMod);
  ok("…and names the file they come from", model.inheritedProvincesBmp === path.join(BASE, "map", "provinces.bmp"), model.inheritedProvincesBmp);
  const own = md.buildMapModel({ modRoot: makeMod("model2", { own: true }), gameRoot: BASE, dependencyRoots: [] });
  ok("⚠️ CONTROL: a mod that owns its bitmap is told so, and named no inherited file",
    own.provincesBmpFromMod === true && own.inheritedProvincesBmp === "", { own: own.provincesBmpFromMod, src: own.inheritedProvincesBmp });
  ok("…and provincesBmpSource is exported, so this can be asked without building a model",
    typeof md.provincesBmpSource === "function" && md.provincesBmpSource({ modRoot: m, gameRoot: BASE, dependencyRoots: [] }).own === false);
}

console.log("\n=== 5. ⭐⭐ RUN the page's own refusal builder — a source assertion is not a control ===");
{
  const SRC = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
  const fnSrc = (() => {
    const at = SRC.indexOf("function blankRefusalBody(");
    if (at === -1) return "";
    let d = 0;
    for (let i = SRC.indexOf("{", at); i < SRC.length; i++) {
      if (SRC[i] === "{") d++;
      else if (SRC[i] === "}") { d--; if (d === 0) return SRC.slice(at, i + 1); }
    }
    return "";
  })();
  ok("blankRefusalBody was lifted out of public/map.js", !!fnSrc);
  const build = fnSrc ? new Function(fnSrc + "\nreturn blankRefusalBody;")() : null;
  if (build) {
    const html = build({
      provincesBmpFromMod: false,
      inheritedProvincesBmp: "D:\\SteamLibrary\\steamapps\\common\\Hearts of Iron IV\\map\\provinces.bmp",
      provinces: [{ id: 1, type: "land" }, { id: 2, type: "land" }, { id: 3, type: "sea" }],
    });
    ok("⭐ RUN: it refuses, and says the mod owns no provinces.bmp", /will not blank a world your mod does not own/.test(html) && /provinces\.bmp/.test(html), html.slice(0, 200));
    ok("⭐ RUN: …names the inherited file", html.indexOf("Hearts of Iron IV") !== -1, html.slice(0, 400));
    ok("⭐ RUN: …counts the land off the loaded map rather than assuming", />2<\/b> of those inherited land provinces/.test(html), html.slice(0, 600));
    ok("⭐ RUN: …and tells the modder what to do first", /copy that <code>provinces\.bmp<\/code>/.test(html), html.slice(-400));
    ok("⚠️ RUN, THE CONTROL: a mod that owns its bitmap gets no refusal at all",
      build({ provincesBmpFromMod: true, inheritedProvincesBmp: "", provinces: [{ id: 1, type: "land" }] }) === "");
    ok("⚠️ RUN, THE CONTROL: a model that has not answered yet is not refused either",
      build({}) === "" && build(null) === "");
  }
  const CODE = stripJsComments(SRC);
  ok("⛔ blankMapLocal itself consults it, so the model is never emptied for a write that cannot happen",
    /function blankMapLocal\(\)\s*\{[\s\S]{0,400}?blankRefusalBody\(/.test(CODE));
  ok("…before pushUndo, so a refused click leaves nothing on the undo stack",
    (() => { const at = CODE.indexOf("function blankMapLocal()"); return at !== -1 && CODE.indexOf("blankRefusalBody(", at) < CODE.indexOf("pushUndo(", at); })());
  ok("…and the Delete map dialog takes the typed-DELETE gate away when it refuses",
    /mapBlankTypeRow/.test(CODE) && /mapBlankConfirmBtn/.test(CODE));
  const HTML = fs.readFileSync(path.join(__dirname, "public", "map.html"), "utf8");
  ok("…and that row exists to be hidden", /id="mapBlankTypeRow"/.test(HTML));
  const SERVER = stripJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));
  const ep = SERVER.indexOf('app.post("/api/map/blank-to-sea"');
  ok("…and the endpoint turns a refusal into a 400 the save reports, not a silent success",
    ep !== -1 && /!result\.changed && result\.error[\s\S]{0,120}status\(400\)/.test(SERVER.slice(ep, ep + 900)));
}

console.log("\n=== 6. 🈯 THE CORPUS: definition.csv and provinces.bmp are owned TOGETHER, or not at all ===");
{
  // Derived from what is installed, never typed in. The shape Delete map produced — a mod owning
  // map/definition.csv but no map/provinces.bmp — is what this asserts occurs nowhere in shipping content.
  let roots = [];
  try { roots = fs.readdirSync(WORKSHOP).map((d) => path.join(WORKSHOP, d)).filter((d) => fs.statSync(d).isDirectory()); } catch (_) { roots = []; }
  if (fs.existsSync(path.join(GAME, "map", "definition.csv"))) roots.unshift(GAME);
  if (!roots.length) console.log("  ..   (no installed maps here — the corpus half cannot run)");
  else {
    const has = (r, f) => fs.existsSync(path.join(r, "map", f));
    const both = roots.filter((r) => has(r, "definition.csv") && has(r, "provinces.bmp"));
    const neither = roots.filter((r) => !has(r, "definition.csv") && !has(r, "provinces.bmp"));
    const defOnly = roots.filter((r) => has(r, "definition.csv") && !has(r, "provinces.bmp"));
    console.log("     " + roots.length + " installed roots: " + both.length + " own both, " + neither.length + " own neither, " + defOnly.length + " own definition.csv alone");
    ok("⭐⭐ not one installed map owns definition.csv without provinces.bmp — the shape the blank produced",
      defOnly.length === 0, defOnly.map((d) => path.basename(d)));
    ok("…and the corpus is big enough to mean something", both.length + neither.length === roots.length && both.length >= 2, { both: both.length, neither: neither.length });
  }
}

console.log("\n=== 7. 🈯 the owner's own starting point, against the real install ===");
{
  if (!fs.existsSync(path.join(GAME, "map", "provinces.bmp"))) console.log("  ..   (the base game is not installed — this half cannot run)");
  else {
    // Exactly what build-flow2-mod.js writes before step 1: the descriptor Nova's wizard produces, nothing else.
    const m = tmp("wizard");
    mk(path.join(m, "descriptor.mod"), 'version="1"\ntags={\n\t"Gameplay"\n}\nname="Nova Flow 2"\nsupported_version="1.19.*"\npath="mod/x"\n');
    const r = md.blankMapToSea({ modRoot: m, gameRoot: GAME, dependencyRoots: [] });
    ok("⛔ the owner's flow is refused at step 1, before it can drown the base game's world", r.changed === false, r);
    ok("⛔ …and the mod gains no map/ folder at all — on the base commit this call left six files in one",
      !fs.existsSync(path.join(m, "map")));
    const vanillaLand = (() => {
      let n = 0;
      for (const line of fs.readFileSync(path.join(GAME, "map", "definition.csv"), "utf8").split("\n")) {
        const c = line.split(";");
        if (c.length >= 7 && /^\d+$/.test(c[0]) && c[0] !== "0" && c[4] === "land") n++;
      }
      return n;
    })();
    ok("⭐ …and the refusal names the size of what it did not do, derived from the installed game",
      (r.error || "").indexOf(vanillaLand.toLocaleString()) !== -1 && r.landProvinces === vanillaLand,
      { vanillaLand, landProvinces: r.landProvinces });
  }
}

tmps.forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
console.log("\n=== a blank cannot claim a world the mod does not own: " + checks + " checks, " + fails.length + " failed ===");
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length ? 1 : 0);
