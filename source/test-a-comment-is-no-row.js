// ⛔ #a-comment-is-no-row — a map/railways.txt or map/supply_nodes.txt holding nothing but comments has NO rows, exactly like an empty
// one, and a same-named file in map/ hides the layer below it wholesale either way.
//
// The game reads these files as one stream of numbers in which a `#` starts a comment (railway_malformed_row says so, and parseRailways
// reads a line up to its `#`). HOI4 1.20 (2026-11-20) put the shape on every machine: its map/railways.txt carries a commented-out row,
// `#1 3 6747 723 3707` at line 883, and the water cleanup keeps a line with no code as it is (#the-water-cleanup-keeps-the-files-comments,
// decided). So Delete map over vanilla 1.20 leaves map/railways.txt holding that one comment and nothing else — measured through the
// page's own POST /api/map/blank-to-sea. Two counters took it for a row, because they counted NON-BLANK lines:
//   · validateMapFiles' empty(): railways_empty said nothing about a file that hides every railway below it (an empty file says so),
//     and the count it prints for the layer below counted the comment as a railway (925 where the game loads 924);
//   · generateSupplyNetwork's gate answered "this mod's map/railways.txt already has rows" for a file with none.
// Below, the 1.20 shape is made on a small world and driven through the real writers and the real validator; then the same question is
// asked of the installed base game, with the rows derived from its own railways.txt rather than typed.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-commentrow-home-"));
process.env.APPDATA = SANDBOX;
process.env.XDG_CONFIG_HOME = SANDBOX;
process.env.NOVA_APP_DATA_DIR = SANDBOX;
process.env.NOVA_HOME_DIR = SANDBOX;
const tmps = [SANDBOX];

const md = require("./map-data.js");
const { maskJsComments, maskJsLiterals, jsBodyAt } = require("./testlib-strip-comments.js");

const REAL = process.env.HOI4_ROOT || "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300)));
  if (!ok) fails.push(label);
};

const mk = (root, rel, body) => { const p = path.join(root, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };
function bmp24(w, h, fn) {
  const rs = (w * 3 + 3) & ~3, is = rs * h; const b = Buffer.alloc(54 + is);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(54 + is, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(is, 34);
  for (let y = 0; y < h; y++) { let o = 54 + (h - 1 - y) * rs; for (let x = 0; x < w; x++) { const [r, g, bl] = fn(x, y); b[o++] = bl; b[o++] = g; b[o++] = r; } }
  return b;
}
// 8x8 provinces of 32 px, ids 1..64 by row; 1..48 land, 49..64 sea (the world of test-an-empty-supply-or-railway-file-deletes-every-hub-below-it.js).
const provAt = (x, y) => Math.floor(x / 32) + Math.floor(y / 32) * 8 + 1;
const COL = (p) => [((p * 29) % 210) + 15, ((p * 67) % 210) + 15, ((p * 101) % 210) + 15];
const definition = (isLand) => ["0;0;0;0;land;false;unknown;0"].concat(
  Array.from({ length: 64 }, (_, i) => { const p = i + 1, [r, g, b] = COL(p), L = isLand(p);
    return `${p};${r};${g};${b};${L ? "land" : "sea"};false;${L ? "plains" : "ocean"};${L ? 1 : 0}`; })
).join("\n") + "\n";
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const st = (id, provs, owner = "ZZZ") => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provs.join(" ")} }\n\thistory = {\n\t\towner = ${owner}\n\t}\n}\n`;
// The base game's railways.txt in HOI4 1.20's shape: live rows, and one commented-out row between them.
const LIVE_RAILS = ["1 3 1 2 3 ", "2 3 9 10 11 ", "1 4 17 18 19 20 "];
const DEAD_RAIL = "#1 3 25 26 27 ";
const RAIL_TXT = [LIVE_RAILS[0], LIVE_RAILS[1], DEAD_RAIL, LIVE_RAILS[2]].join("\n") + "\n";
const HUBS = range(1, 12);
const SUPPLY_TXT = HUBS.map((p) => `1 ${p} `).join("\n") + "\n";
// What the game reads from a line file: the lines with code before a `#`.
const codeRows = (text) => String(text).split(/\r?\n/).filter((l) => { const h = l.indexOf("#"); return (h === -1 ? l : l.slice(0, h)).trim(); }).length;
const nonBlank = (text) => String(text).split(/\r?\n/).filter((l) => l.trim()).length;

function newGame() {
  const g = fs.mkdtempSync(path.join(os.tmpdir(), "nova-commentrow-game-")); tmps.push(g);
  mk(g, "map/provinces.bmp", bmp24(256, 256, (x, y) => COL(provAt(x, y))));
  mk(g, "map/definition.csv", definition((p) => p <= 48));
  mk(g, "map/supply_nodes.txt", SUPPLY_TXT);
  mk(g, "map/railways.txt", RAIL_TXT);
  mk(g, "history/states/1.txt", st(1, range(1, 24)));
  mk(g, "history/states/2.txt", st(2, range(25, 48)));
  mk(g, "history/countries/ZZZ - Zzzland.txt", "capital = 1\n");
  return g;
}
function newMod(name) {
  const m = fs.mkdtempSync(path.join(os.tmpdir(), "nova-commentrow-" + name + "-")); tmps.push(m);
  mk(m, "descriptor.mod", `name="${name}"\n`);
  return m;
}
const fire = (modRoot, gameRoot) => (md.validateMapBitmap({ modRoot, gameRoot, dependencyRoots: [] }) || [])
  .filter((p) => p.rule === "supply_nodes_empty" || p.rule === "railways_empty");
const ruleIn = (ps, rule) => ps.find((p) => p.rule === rule) || null;

try {
  const game = newGame();
  rec("the fixture's base game ships 3 railways and one commented-out row", codeRows(RAIL_TXT) === 3 && nonBlank(RAIL_TXT) === 4, { code: codeRows(RAIL_TXT), nonBlank: nonBlank(RAIL_TXT) });

  console.log("\n1. ⛔ Nova's own Delete map leaves the comment as the file's only line — and the rule must still hear an empty file");
  {
    const blanked = newMod("blanked");
    mk(blanked, "map/provinces.bmp", bmp24(256, 256, (x, y) => COL(provAt(x, y))));   // a blank needs a world the mod owns
    const r = md.blankMapToSea({ modRoot: blanked, gameRoot: game, dependencyRoots: [] });
    rec("the blank ran", !!(r && r.changed), r && { changed: r.changed, error: r.error });
    const rail = fs.readFileSync(path.join(blanked, "map", "railways.txt"), "utf8");
    rec("its map/railways.txt keeps the base game's commented-out row (a comment is content)", rail.includes(DEAD_RAIL.trim()), JSON.stringify(rail));
    rec("…and holds no railway the game would read", md.parseRailways(rail).length === 0 && codeRows(rail) === 0, JSON.stringify(rail));
    mk(blanked, "map/definition.csv", definition((p) => p <= 24));                    // land again, as a paint or Generate land leaves it
    const p = fire(blanked, game), rw = ruleIn(p, "railways_empty");
    rec("⭐⭐⭐ the modder is told the map has no railways", !!rw, p.map((x) => x.rule));
    rec("⭐⭐ …and the layer below is counted as the game reads it: 3 railways, not the comment as a 4th", !!rw && rw.below === 3, rw && rw.below);
    rec("…and the supply file the blank emptied is heard as before", !!ruleIn(p, "supply_nodes_empty"), p.map((x) => x.rule));
  }

  console.log("\n2. ⛔ a file of comments alone is answered exactly as an empty one; a noted row is still a row");
  {
    const mod = (name, file, text) => { const m = newMod(name); mk(m, "map/definition.csv", definition((p) => p <= 24)); mk(m, "map/" + file, text); return m; };
    const emptyRail = fire(mod("rail-empty", "railways.txt", ""), game);
    const deadRail = fire(mod("rail-dead", "railways.txt", "#1 3 1 2 3 \n   # disabled for now\n"), game);
    const notedRail = fire(mod("rail-noted", "railways.txt", "1 3 1 2 3 # kept by hand\n"), game);
    const e = ruleIn(emptyRail, "railways_empty"), d = ruleIn(deadRail, "railways_empty");
    rec("an empty railways.txt is reported, with the 3 railways the game loads below it", !!e && e.below === 3, e && e.below);
    rec("⭐⭐⭐ a railways.txt of comments alone is reported too, with the same count below", !!d && !!e && d.below === e.below, { empty: e && e.below, comments: d && d.below, rules: deadRail.map((x) => x.rule) });
    rec("…and in the same words", !!d && !!e && d.message === e.message);
    rec("⭐ a live row with a note is a row: nothing is said", !ruleIn(notedRail, "railways_empty"), notedRail.map((x) => x.rule));
    const emptyHub = fire(mod("hub-empty", "supply_nodes.txt", ""), game);
    const deadHub = fire(mod("hub-dead", "supply_nodes.txt", "#1 5 \n"), game);
    const notedHub = fire(mod("hub-noted", "supply_nodes.txt", "1 5 # the capital's\n"), game);
    const eh = ruleIn(emptyHub, "supply_nodes_empty"), dh = ruleIn(deadHub, "supply_nodes_empty");
    rec("⭐⭐ a supply_nodes.txt of comments alone is reported as an empty one is", !!eh && !!dh && dh.below === eh.below && eh.below === HUBS.length, { empty: eh && eh.below, comments: dh && dh.below });
    rec("⭐ a hub with a note is a hub: nothing is said", !ruleIn(notedHub, "supply_nodes_empty"), notedHub.map((x) => x.rule));
  }

  console.log("\n3. ⛔ generateSupplyNetwork's gate: a file of comments alone is the empty file it asks for");
  {
    // A world the mod owns outright (its own bitmap, definition and both state files), hubs on 1 and 3: the railway pass the validator asks of it.
    const owned = (name, railText, hubText) => {
      const m = newMod(name);
      mk(m, "map/provinces.bmp", bmp24(256, 256, (x, y) => COL(provAt(x, y))));
      mk(m, "map/definition.csv", definition((p) => p <= 48));
      mk(m, "history/states/1.txt", st(1, range(1, 24)));
      mk(m, "history/states/2.txt", st(2, range(25, 48)));
      mk(m, "map/supply_nodes.txt", hubText);
      mk(m, "map/railways.txt", railText);
      return m;
    };
    const ask = (m, o) => { const r = md.generateSupplyNetwork({ modRoot: m, gameRoot: game, dependencyRoots: [], dryRun: true, ...o }) || {}; return { changed: !!r.changed, hubs: r.hubs || 0, railways: r.railways || 0, reason: r.reason || "", error: r.error || "" }; };
    const a = ask(owned("own-rail-empty", "", "1 1 \n1 3 \n"), { railwaysOnly: true });
    const b = ask(owned("own-rail-dead", DEAD_RAIL + "\n", "1 1 \n1 3 \n"), { railwaysOnly: true });
    rec("⭐⭐⭐ the railway pass over a railways.txt of comments alone is not refused as one that 'already has rows'", !/already has rows/.test(b.reason), b);
    rec("⭐⭐ …it answers exactly as for an empty railways.txt", JSON.stringify(a) === JSON.stringify(b), { empty: a, comments: b });
    const c = ask(owned("own-hub-empty", "", ""), {});
    const d = ask(owned("own-hub-dead", "", "#1 5 \n"), {});
    rec("⭐⭐ the hub pass over a supply_nodes.txt of comments alone answers as for an empty one", JSON.stringify(c) === JSON.stringify(d), { empty: c, comments: d });
  }

  console.log("\n4. ⛔ the installed base game, read as the game reads it (rows derived from its own railways.txt)");
  {
    const railFile = path.join(REAL, "map", "railways.txt");
    if (!fs.existsSync(railFile)) console.log("  SKIP — no base game at " + REAL);
    else {
      const text = fs.readFileSync(railFile, "utf8");
      const R = codeRows(text), NB = nonBlank(text);
      const dead = text.split(/\r?\n/).filter((l) => /^\s*#/.test(l) && codeRows(l.replace(/^\s*#+/, "")) > 0);
      console.log(`     the installed railways.txt: ${R} railway row(s), ${NB} non-blank line(s), ${dead.length} commented-out row(s)`);
      const addOn = (name, body) => { const m = newMod(name); mk(m, "map/railways.txt", body); return m; };
      const e = ruleIn(fire(addOn("real-empty", ""), REAL), "railways_empty");
      rec("⭐⭐ an add-on's empty railways.txt is told how many the base game really loads", !!e && e.below === R, { below: e && e.below, rows: R, nonBlank: NB });
      // #the-base-games-rows-are-read-not-typed — the shipping-maps aside names the base game's count off the same install
      const vanillaSaid = e && /No shipping map ships an empty one \(vanilla ([\d,]+)/.exec(e.message);
      rec("⭐⭐ …and its list of shipping maps names the base game's own count, not a typed one", !!vanillaSaid && Number(vanillaSaid[1].replace(/,/g, "")) === R,
        { said: vanillaSaid && vanillaSaid[1], rows: R });
      if (!dead.length) console.log("  SKIP — the installed base game ships no commented-out railway row");
      else {
        const d = ruleIn(fire(addOn("real-dead", dead.join("\n") + "\n"), REAL), "railways_empty");
        rec("⭐⭐⭐ an add-on whose railways.txt holds only the base game's commented-out row(s) is told it has no railways", !!d && d.below === R, { below: d && d.below, rows: R });
      }
    }
  }

  console.log("\n4b. ⛔ #the-base-games-rows-are-read-not-typed — the aside counts the base game it stands on");
  {
    const m = newMod("aside"); mk(m, "map/definition.csv", definition((p) => p <= 24)); mk(m, "map/railways.txt", ""); mk(m, "map/supply_nodes.txt", "");
    const p = fire(m, game), rw = ruleIn(p, "railways_empty"), hub = ruleIn(p, "supply_nodes_empty");
    const said = (x) => { const r = x && /No shipping map ships an empty one \(([^)]*)\)/.exec(x.message); return r ? r[1] : null; };
    rec("⭐⭐ railways_empty names the 3 railways this base game ships", /^vanilla 3, /.test(said(rw) || ""), said(rw));
    rec("⭐⭐ supply_nodes_empty names its 12 hubs", /^vanilla 12, /.test(said(hub) || ""), said(hub));
    rec("…and both still name the Workshop maps measured beside it", /Millennium Dawn/.test(said(rw) || "") && /Millennium Dawn/.test(said(hub) || ""));
  }

  console.log("\n4c. ⛔ the page's hub and railway removals touch no comment line (the water cleanup's cut, adopted)");
  {
    const HUBS_TXT = "#1 9617 \n1 9617 \n# 9617 is the capital's hub\n1 12 \n";
    const r = md.removeSupplyNodeRow(HUBS_TXT, 9617);
    rec("⭐⭐⭐ removing hub 9617 removes its one hub row", r.removed === 1, r);
    rec("⭐⭐⭐ …and keeps the commented-out hub and the note that names 9617, byte for byte", r.text === "#1 9617 \n# 9617 is the capital's hub\n1 12 \n", JSON.stringify(r.text));
    const RAILS = "#1 3 6747 723 3707 \n1 3 6747 723 3707 \n";
    const rr = md.removeRailwayRow(RAILS, [6747, 723, 3707]);
    rec("⭐⭐ removing a railway takes the live row, never the commented-out one before it", rr.removed === 1 && rr.text === "#1 3 6747 723 3707 \n", JSON.stringify(rr.text));
    const rl = md.relevelRailwayRow("#1 3 6747 723 3707 \n1 3 6747 723 3707 # note\n", [6747, 723, 3707], undefined, 2);
    rec("⭐⭐ a level change finds the live row past a commented-out one, and keeps its note", rl.changed === true && rl.text === "#1 3 6747 723 3707 \n2 3 6747 723 3707 # note\n", rl);
    // …and through the write the 🏭 click queues (writeSupplyNode → _writeMapLineFile → safeModWrite), on the mod's own file
    const m = newMod("hub-remove");
    mk(m, "map/supply_nodes.txt", "# hubs placed by hand\n1 5 \n#1 5 (the old one)\n1 7 \n");
    const w = md.writeSupplyNode({ modRoot: m, gameRoot: game, dependencyRoots: [], action: "remove", province: 5 });
    const disk = fs.readFileSync(path.join(m, "map", "supply_nodes.txt"), "utf8");
    rec("the page's hub removal writes", !!(w && w.changed) && w.removed === 1, w);
    rec("⭐⭐ …and the file keeps every comment it had", disk === "# hubs placed by hand\n#1 5 (the old one)\n1 7 \n", JSON.stringify(disk));
  }

  console.log("\n5. ⛔ the source: neither counter counts non-blank lines (comments masked)");
  {
    const src = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
    const lit = maskJsLiterals(src), com = maskJsComments(src);
    for (const fn of ["generateSupplyNetwork", "validateMapFiles"]) {
      const at = lit.indexOf(`function ${fn}(`);
      const body = at === -1 ? null : jsBodyAt(lit, at);
      const text = body ? com.slice(body[0], body[1] + 1) : "";
      rec(`${fn} is found`, !!body);
      rec(`⭐ ${fn} counts no line file by its non-blank lines`, !!body && !/\.filter\(\s*\(\s*l\s*\)\s*=>\s*l\.trim\(\)\s*\)\.length/.test(text));
      if (fn === "validateMapFiles") rec("⭐ …and types no base-game count into its words", !!body && !/["'`][^"'`]*\bvanilla \d/.test(text), (/["'`][^"'`]*\bvanilla \d[^"'`]*/.exec(text) || [""])[0].slice(0, 120));
    }
  }

  console.log(`\n=== a comment is no row: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
