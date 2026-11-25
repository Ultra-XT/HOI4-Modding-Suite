// TWO READERS THAT STOPPED AT THE FIRST '}' OR DEMANDED LITERAL DIGITS.
//
// #sprite-body-stops-at-first-brace — the .gfx sprite catalogue took each block's body with
// ([\s\S]*?)\}, which ends at the first closing brace ANYWHERE inside it. That is fine only when every
// property is a scalar, and PDX convention puts a nested block first on the tiled kinds: a
// corneredTileSpriteType opens with `size = { x = 96 y = 96 }` and declares texturefile after it. The
// captured body therefore ended mid-block, the texture match failed, and the sprite was skipped whole.
// Measured across the installed corpus: 262 sprites lost, 109 in vanilla alone — Millennium Dawn 72,
// Novum Vexillum 32, Old World Blues 22, Rise of Nations 21, The Road to 56 6. They are absent from the
// icon pickers, and /api/icon-image answers a miss with a PLACEHOLDER rather than a 404, so a reference to
// one just looks like a broken icon with nothing to explain it. The type list was also too narrow: only
// `spriteType` matched, so corneredTileSpriteType and friends were never considered at all.
//
// #folder-position-variables-unreadable — scanTechsInFolder decides which technologies need a gridBoxType,
// and it demanded literal digits: `x\s*=\s*(-?\d+)`. Mods declare rows and years as variables at the top of
// the file (`@row1 = 1`, `@1965 = 12`) and write `position = { x = @row1 y = @1965 }`. Measured, folder
// positions written as an @variable versus as a number:
//
//   Rise of Nations 1947 vs 223 · Millennium Dawn 880 vs 40 · Old World Blues 860 vs 146
//   Novum Vexillum   412 vs 141 · The Road to 56  238 vs 441 · vanilla        154 vs 269
//
// 4,491 in all. A technology this scan cannot see gets no gridbox, so HOI4 logs "Found no grid box for tech
// <id>" and never draws it — on Millennium Dawn that was 880 of 920 positions.
//
// ⭐ Nova already had both rules. matchBraceForward/findMatchingBraceInText are used all over the file, and
// parseFolderFromBlock has long brace-matched the folder body and passed x/y through a resolveVariable
// built from the file's own @ table. Two readers never adopted them.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-brace-"));
process.env.HOI4_MODS_ROOT = ROOT;
process.env.APPDATA = path.join(ROOT, "appdata");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

const toPosix = (p) => p.split(path.sep).join("/");
const MOD = path.join(ROOT, "bracemod");
fs.mkdirSync(path.join(MOD, "interface"), { recursive: true });
fs.mkdirSync(path.join(MOD, "gfx", "interface"), { recursive: true });
fs.mkdirSync(path.join(MOD, "common", "technologies"), { recursive: true });
fs.mkdirSync(path.join(MOD, "common", "technology_tags"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="BraceMod"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "bracemod.mod"), 'name="BraceMod"\npath="' + toPosix(MOD) + '"\nsupported_version="1.19.*"\n');
// a real file for the sprites to point at, so resolveTexturefilePath does not reject them
for (const n of ["nova_plain.dds", "nova_tiled.dds", "nova_frames.dds"]) {
  fs.writeFileSync(path.join(MOD, "gfx", "interface", n), Buffer.from([0x44, 0x44, 0x53, 0x20]));
}
// ⚠️ THE SHAPE THAT BROKE IT: a nested `size = { … }` declared BEFORE texturefile.
fs.writeFileSync(path.join(MOD, "interface", "nova_brace.gfx"),
  "spriteTypes = {\n" +
  "\tspriteType = {\n\t\tname = \"GFX_nova_plain\"\n\t\ttexturefile = \"gfx/interface/nova_plain.dds\"\n\t}\n" +
  "\tcorneredTileSpriteType = {\n\t\tname = \"GFX_nova_tiled\"\n\t\tsize = { x = 96 y = 96 }\n\t\ttexturefile = \"gfx/interface/nova_tiled.dds\"\n\t\tborderSize = { x = 16 y = 16 }\n\t}\n" +
  "\tframeAnimatedSpriteType = {\n\t\tname = \"GFX_nova_frames\"\n\t\tsize = { x = 32 y = 32 }\n\t\ttexturefile = \"gfx/interface/nova_frames.dds\"\n\t\tnoOfFrames = 4\n\t}\n" +
  "}\n");

// The mod owns a gui declaring the folder WITH a gridbox to anchor on, so the add reaches the scan rather
// than bailing for want of a base file to copy — which is a different skip path entirely.
fs.writeFileSync(path.join(MOD, "interface", "countrytechtreeview.gui"),
  "guiTypes = {\n" +
  "\tcontainerWindowType = {\n\t\tname = \"nova_brace_folder\"\n\t\tposition = { x = 0 y = 0 }\n\t\tsize = { width = 100 height = 100 }\n" +
  "\t\tgridBoxType = {\n\t\t\tname = \"nova_anchor_tree\"\n\t\t\tposition = { x = 10 y = 20 }\n\t\t\tsize = { width = 100 height = 100 }\n\t\t\tslotsize = { width = 10 height = 10 }\n\t\t\tformat = \"UP\"\n\t\t}\n" +
  "\t}\n}\n");

// …and a technology whose folder position is an @variable, the way most shipped mods write it.
fs.writeFileSync(path.join(MOD, "common", "technology_tags", "00_technology.txt"),
  "technology_categories = {\n\tnova_brace_cat\n}\n");
// Registered as a Nova-created tab — the delete endpoint deliberately refuses any folder not listed here,
// because stripping a base-game folder's container would stop every technology in it appearing in game.
fs.writeFileSync(path.join(MOD, "common", "technology_tags", "zz_nova_custom_folders.txt"),
  "technology_folders = {\n\tnova_brace_folder = {\n\t\tledger = army\n\t}\n}\n");
fs.writeFileSync(path.join(MOD, "common", "technologies", "nova_brace.txt"),
  "@row1 = 3\n@1965 = 7\n\ntechnologies = {\n" +
  "\tnova_var_tech = {\n\t\tresearch_cost = 2\n\t\tstart_year = 1936\n" +
  "\t\tfolder = {\n\t\t\tname = nova_brace_folder\n\t\t\tposition = { x = @row1 y = @1965 }\n\t\t}\n\t}\n" +
  "\tnova_num_tech = {\n\t\tresearch_cost = 2\n\t\tstart_year = 1936\n" +
  "\t\tfolder = {\n\t\t\tname = nova_brace_folder\n\t\t\tposition = { x = 5 y = 9 }\n\t\t}\n\t}\n" +
  "\tnova_other_folder_tech = {\n\t\tresearch_cost = 2\n" +
  "\t\tfolder = {\n\t\t\tname = some_other_folder\n\t\t\tposition = { x = 1 y = 1 }\n\t\t}\n\t}\n" +
  "}\n");

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const PORT = 53111;
(async () => {
  let srv = null;
  try {
    srv = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
    const get = (u) => fetch(`http://127.0.0.1:${PORT}${u}`).then((r) => r.json()).catch((e) => ({ error: String(e) }));

    console.log("\n[sprites] a nested block before texturefile must not hide the sprite");
    {
      const j = await get(`/api/sprites?modPath=${encodeURIComponent(MOD)}`);
      const rows = Array.isArray(j) ? j : (j.sprites || j.items || []);
      const names = rows.map((x) => String(typeof x === "string" ? x : (x.name || x.key || ""))).filter(Boolean);
      const has = (n) => names.some((x) => x.toLowerCase() === n.toLowerCase());
      console.log(`     ${names.length} sprites offered`);
      // CONTROL first: the plain sprite has no nested block and always worked. If it is missing the fixture
      // never reached the parser and nothing below discriminates.
      rec("the plain sprite is found", has("GFX_nova_plain"), names.filter((n) => /nova_/.test(n)));
      // THE BUG: body ended at the '}' of `size = { … }`, so texturefile was never seen.
      rec("a corneredTileSpriteType with size before texturefile is found", has("GFX_nova_tiled"), names.filter((n) => /nova_/.test(n)));
      rec("…and a frameAnimatedSpriteType too", has("GFX_nova_frames"), names.filter((n) => /nova_/.test(n)));
    }

    console.log("\n[the corpus] the shape is not a fixture invention");
    {
      // Count sprites in vanilla whose texturefile sits after a nested block. If this is zero the fixture is
      // testing something that does not occur and the measurement in the header is wrong.
      const matchBrace = (s, o) => { let d = 0; for (let i = o; i < s.length; i++) { if (s[i] === "{") d++; else if (s[i] === "}") { d--; if (!d) return i; } } return -1; };
      const walk = (dir, out) => {
        let e = []; try { e = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return out; }
        for (const x of e) { const f = path.join(dir, x.name); if (x.isDirectory()) walk(f, out); else if (/\.gfx$/i.test(x.name)) out.push(f); }
        return out;
      };
      let lost = 0;
      for (const f of walk(path.join(GAME, "interface"), [])) {
        let t = ""; try { t = fs.readFileSync(f, "latin1").replace(/#[^\n]*/g, ""); } catch (_) { continue; }
        const re = /\b(?:sprite|corneredTileSprite|frameAnimatedSprite|maskedShield|progressbar)Type\s*=\s*\{/gi;
        let m;
        while ((m = re.exec(t)) !== null) {
          const o = t.indexOf("{", m.index), c = matchBrace(t, o);
          if (c === -1) break;
          const body = t.slice(o + 1, c);
          re.lastIndex = c;
          if (!/texturefile\s*=/i.test(body)) continue;
          const lazy = body.indexOf("}") === -1 ? body : body.slice(0, body.indexOf("}"));
          if (!/texturefile\s*=/i.test(lazy)) lost++;
        }
      }
      console.log(`     vanilla sprites the old lazy body would have dropped: ${lost}`);
      rec("the corpus really contains this shape", lost > 20, lost);
    }

    console.log("\n[gridboxes] a technology positioned by @variable must still get one");
    {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/technologies/save-batch`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modPath: MOD,
          technologies: [{ id: "nova_new_tech", folder: "nova_brace_folder", isMod: true, researchCost: 2, x: 1, y: 1, startYear: 1936 }],
          newTechIds: ["nova_new_tech"],
        }),
      }).then(async (x) => ({ status: x.status, body: await x.json().catch(() => null) })).catch((e) => ({ status: 0, body: { error: String(e) } }));
      rec("the save succeeds", r.status < 400 && r.body && r.body.ok === true, r.body);

      // ⚠️ AIM AT WHAT scanTechsInFolder ACTUALLY DRIVES. A first version asserted that the two EXISTING
      // techs gained gridboxes on save — but addGridboxesForNewTechs only ever adds for the ids in
      // newTechIds, so that expectation was about a different function and failed against working code.
      // The scan's real job is answering "which technologies are in this folder", and deleting a custom tab
      // is where the user sees that answer: the endpoint reports the techs it moved out.
      const del = await fetch(`http://127.0.0.1:${PORT}/api/research/delete-custom-folder`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderKey: "nova_brace_folder", modPath: MOD }),
      }).then(async (x) => ({ status: x.status, body: await x.json().catch(() => null) })).catch((e) => ({ status: 0, body: { error: String(e) } }));
      // The endpoint reports the COUNT it re-homed, not the list. THREE technologies sit in this folder by
      // now: nova_num_tech (numeric), nova_var_tech (@variable) and nova_new_tech (added by the save above,
      // also numeric). The honest answer is 3. Before the fix the scan could not see the @variable one and
      // answered 2, silently leaving that technology pointing at a folder that no longer exists — which is
      // exactly the "Found no grid box for tech <id>" case, and on Millennium Dawn would be 880 of 920.
      const rehomed = del.body && del.body.rehomedGridboxes;
      console.log(`     delete rehomed ${rehomed} gridbox(es)`);
      rec("the delete succeeds", del.status < 400 && del.body && !del.body.error, del.body);
      rec("all three technologies are re-homed, including the @variable one", rehomed === 3, del.body);
    }

    console.log("\n[the mechanism] both readers use the shared brace matcher");
    {
      const sv = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
      // ⚠️ DO NOT BRACE-MATCH JAVASCRIPT SOURCE. A first attempt did, and the function's own regex literals
      // — /\bfolder\s*=\s*\{/gi — carry an unpaired '{' that the matcher counts, so the extracted body ended
      // in the wrong place and both checks failed against code that was plainly there. Slice to the next
      // top-level declaration instead, which needs no matching at all.
      const bodyOf = (name) => {
        const at = sv.indexOf(`function ${name}(`);
        if (at === -1) return "";
        const next = sv.indexOf("\nfunction ", at + 10);
        return sv.slice(at, next === -1 ? at + 6000 : next);
      };
      const scan = bodyOf("scanTechsInFolder");
      rec("scanTechsInFolder is findable", !!scan, "not found");
      rec("…and resolves @variables", /startsWith\("@"\)/.test(scan), scan.slice(0, 200));
      rec("…and brace-matches the folder body", /matchBraceForward/.test(scan), scan.slice(0, 200));
    }

    srv.closeAllConnections(); srv.close(); srv = null;
    console.log(`\n=== block body brace matching: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
