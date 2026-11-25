// ⛔ #an-adjacency-name-is-encoded-twice — TEST 31's map/adjacencies.csv SAYS `SmÃ¥land-Ã\u0096land` WHERE THE BASE GAME
// SAYS `Småland-Öland`.
//
// The Comment column is the only free text in a map's CSVs. The base game's adjacencies.csv is UTF-8 with no BOM (26 high
// bytes over 13 letters), and so is each of the seven installed workshop maps that ship one. Auto-fix's retype of the file
// (fixAdjacenciesForProvinceTypes) read it as latin1 and wrote the string back as UTF-8, so every one of those bytes became
// two: TEST 31 carries 52 high bytes (C3 83 C2 A5 for `å`) on eleven rows — the six it retyped AND the five it did not. The
// same writer turned a BOM into `ï»¿` and put one more line ending on the end, and it converted a Windows-1252 file (what
// Excel saves a CSV as) to UTF-8 wholesale. writeAdjacency read as UTF-8, so a Windows-1252 file lost every accented letter
// to U+FFFD, and the map model did too — which is the name the page sends back on a remove-then-add.
//
// What this pins, all on fixtures (no game install needed until the last section):
//   1. the codec: every byte a single-byte file can hold, and UTF-8 with and without a BOM, go back byte for byte — and a
//      file that is BOTH (a UTF-8 file with rows Excel wrote as Windows-1252) reads each row in its own and goes back
//      byte for byte too;
//   2. the retype: the whole file comes back byte-identical but for the one row it retypes — UTF-8, UTF-8 with a BOM, CRLF
//      Windows-1252, a CRLF file with one LF row, and the file that is both;
//   3. THE T31 SHAPE: the Auto-fix click that materialised the base game's file keeps every name's bytes;
//   4. writeAdjacency: a row Nova adds is in the file's encoding, a row it edits keeps its name's bytes, and the page's own
//      remove-then-add (the name carried from the map model) puts back the row it removed; a letter the file's code page has
//      no byte for is reported on the line Save shows; every other row keeps its own line ending; and in the file that is
//      both, a row keeps its own encoding through an edit, a remove beside it, and a new row;
//   5. the strait-rule repair and the Delete-map advisory read the Windows-1252 file as it is;
//   6. the repair for worlds already written: a warning (never fatal), one right answer from the file the retype copies
//      from — the last dependency declared, the base game under it, and the base game too for a mod that replaces map/ —
//      only the names' bytes change, a second click writes nothing, a name that file does not give is left alone, and a file
//      that is not UTF-8 throughout (which the old retype never wrote) is not judged at all;
//   7. cry-wolf: the rule is silent on every installed workshop map that ships the file, and on the base game's own file
//      copied into a mod — and finds every accented name when that copy is written twice over.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

// ⛔ writeAdjacency and the fixers back every write up: their backups and caches go to this test's own scratch folder.
const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), "nova-adjnames-"));
const APP = path.join(SCRATCH, "appdata");
fs.mkdirSync(APP, { recursive: true });
process.env.APPDATA = APP; process.env.NOVA_APP_DATA_DIR = APP; process.env.XDG_CONFIG_HOME = APP;
process.env.NOVA_HOME_DIR = path.join(SCRATCH, "home");
const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");
const P = require("./testlib-map-page.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

let pass = 0, skips = 0;
const fails = [];
const rec = (name, cond, detail) => {
  if (cond) { console.log("  ok   " + name); pass++; }
  else { console.log("  FAIL " + name + (detail === undefined ? "" : "   -> " + JSON.stringify(detail).slice(0, 500))); fails.push(name); }
};
const skip = (why) => { console.log("  skip " + why); skips++; };

const put = (root, rel, c) => { const p = path.join(root, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const highBytes = (b) => [...b].filter((x) => x >= 0x80).map((x) => x.toString(16).toUpperCase()).join(" ");
// a buffer's bytes as a string of one letter per byte — so a splice on it is a splice on the bytes, and nothing is decoded
const bytes = (b) => b.toString("latin1");
const fromBytes = (s) => Buffer.from(s, "latin1");
// a name's UTF-8 bytes, as such a string
const u = (s) => bytes(Buffer.from(s, "utf8"));
// what the old retype did to a name: its UTF-8 bytes read one letter a byte, written back as UTF-8
const dbl = (s) => Buffer.from(s, "utf8").toString("latin1");
// line endings that are LF alone, in a file that is otherwise CRLF
const loneLf = (b) => bytes(b).split(/(?<!\r)\n/).length - 1;

function bmp24(W, H, fn) {
  const rs = (W * 3 + 3) & ~3, is = rs * H; const b = Buffer.alloc(54 + is);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(54 + is, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(is, 34);
  for (let y = 0; y < H; y++) { let o = 54 + (H - 1 - y) * rs; for (let x = 0; x < W; x++) { const [r, g, bl] = fn(x, y); b[o++] = bl; b[o++] = g; b[o++] = r; } }
  return b;
}

// ── the fixture: a base game of its own. 1-4 land, 5 sea; the mod floods 1 and 2, so the strait 1;2 through 5 "drowns" and is
// retyped, while 3;4 through 5 stays a legal strait and is left alone. Each name carries letters the two encodings write
// differently — and `–`, `“”`, `€`, which Windows-1252 keeps in its 0x80-0x9F block, where latin1 has control codes.
const HEADER = "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment";
const END = "-1;-1;-1;-1;-1;-1;-1;-1;-1";
const NAMES = { a: "Småland-Öland", b: "Skåne-Sjælland", c: "Café – “quoted” €" };
const ROWS = [HEADER, `1;2;sea;5;-1;-1;-1;-1;;${NAMES.a}`, `3;4;sea;5;-1;-1;-1;-1;;${NAMES.b}`, `3;1;impassable;-1;-1;-1;-1;-1;;${NAMES.c}`,
  "2;4;impassable;-1;-1;-1;-1;-1;;Plain", END, ""];
// Windows-1252 bytes written out by hand, not by the codec under test: é E9, å E5, æ E6, Ö D6, – 96, “ 93, ” 94, € 80
const CP1252 = { a: "Sm\xE5land-\xD6land", b: "Sk\xE5ne-Sj\xE6lland", c: "Caf\xE9 \x96 \x93quoted\x94 \x80" };
const utf8File = (eol) => Buffer.from(ROWS.join(eol), "utf8");
const cp1252File = (eol) => fromBytes(ROWS.join(eol).replace(NAMES.a, CP1252.a).replace(NAMES.b, CP1252.b).replace(NAMES.c, CP1252.c));
const BOM = Buffer.from([0xEF, 0xBB, 0xBF]);
// ⛔ one row pasted in from an editor that ends its lines with LF, in a CRLF file: the 3;1 row, which no fixture click edits
const ONE_LF = "UTF-8, CRLF with one LF row";
const FILES = {
  "UTF-8, LF": utf8File("\n"),
  "UTF-8 with a BOM, LF": Buffer.concat([BOM, utf8File("\n")]),
  "UTF-8, CRLF": utf8File("\r\n"),
  "Windows-1252, CRLF": cp1252File("\r\n"),
  [ONE_LF]: Buffer.from(ROWS.map((ln, i) => ln + (i === ROWS.length - 1 ? "" : i === 3 ? "\n" : "\r\n")).join(""), "utf8"),
};

// ⛔ THE FILE THAT IS BOTH — the mod's UTF-8 file after a trip through Excel. Excel reads a UTF-8 CSV one byte a letter and
// writes each byte back as it found it, so the names the file had are still UTF-8; a name typed there goes in as Windows-1252.
// Rows as bytes, written out by hand:
//   B[1]  1;2  `Malmö – typed`  Windows-1252 (F6, 96)   — the strait the flood retypes, and the minority encoding
//   B[2]  3;4  `Città`          UTF-8, ending C3 A0     — read one byte a letter that is `Ã` and a no-break space, which a trim eats
//   B[3]  3;1  `Skåne`          UTF-8 (C3 A5)
//   B[4]  2;4  `Skåne`          Windows-1252 (E5)       — the same name as B[3], in the other encoding
//   B[5]  2;3  `Småland-Öland`  UTF-8
const B = [HEADER, "1;2;sea;5;-1;-1;-1;-1;;Malm\xF6 \x96 typed", "3;4;sea;5;-1;-1;-1;-1;;" + u("Città"), "3;1;impassable;-1;-1;-1;-1;-1;;" + u("Skåne"),
  "2;4;impassable;-1;-1;-1;-1;-1;;Sk\xE5ne", "2;3;impassable;-1;-1;-1;-1;-1;;" + u(NAMES.a), END, ""];
const bothOf = (rows) => fromBytes(rows.join("\r\n"));
const BOTH_LABEL = "UTF-8 rows and Windows-1252 rows, CRLF";
const BOTH = bothOf(B);                               // three rows UTF-8, two Windows-1252
const BOTH_TIED = bothOf([B[0], B[1], B[2], B[6], B[7]]);       // one of each
const BOTH_MOSTLY_1252 = bothOf([B[0], B[1], B[4], B[2], B[6], B[7]]);   // two Windows-1252, one UTF-8

const DEF = (types) => ["0;0;0;0;land;false;unknown;0"].concat(Object.entries(types).map(([i, t]) =>
  `${i};${i * 20};7;0;${t};false;${t === "sea" ? "ocean" : "plains"};${t === "sea" ? 0 : 1}`)).join("\n") + "\n";
let seq = 0;
function world(adjBytes, { flood = true, modAdj = null, replacesMap = false } = {}) {
  const dir = path.join(SCRATCH, "w" + (++seq));
  const game = path.join(dir, "game"), mod = path.join(dir, "mod");
  put(game, "map/definition.csv", DEF({ 1: "land", 2: "land", 3: "land", 4: "land", 5: "sea" }));
  put(game, "map/provinces.bmp", bmp24(10, 2, (x) => { const id = x >= 8 ? 5 : [1, 2, 3, 4][Math.floor(x / 2)]; return [id * 20, 7, 0]; }));
  put(game, "map/adjacencies.csv", adjBytes);
  put(mod, "descriptor.mod", 'version="1"\nname="adjnames"\nsupported_version="1.19.*"\n' + (replacesMap ? 'replace_path="map"\n' : ""));
  if (flood) put(mod, "map/definition.csv", DEF({ 1: "sea", 2: "sea", 3: "land", 4: "land", 5: "sea" }));
  if (modAdj) put(mod, "map/adjacencies.csv", modAdj);
  return { modRoot: mod, gameRoot: game, dependencyRoots: [] };
}
const modCsv = (ctx) => path.join(ctx.modRoot, "map", "adjacencies.csv");
const readCsv = (ctx) => (fs.existsSync(modCsv(ctx)) ? fs.readFileSync(modCsv(ctx)) : Buffer.alloc(0));
// a mod that already owns the file, as a modder who saved it from Excel would
const owning = (file) => world(FILES["UTF-8, LF"], { flood: false, modAdj: file });
// each section on its own: one that throws is a FAIL, and the ones after it still run (and still say what they found)
const section = (title, fn) => {
  console.log("\n" + title);
  try { fn(); } catch (e) { rec(`${title.replace(/=/g, "").trim()} ran to its end`, false, e && e.stack ? e.stack.split("\n").slice(0, 3).join(" / ") : String(e)); }
};

try {
  section("=== 1. the codec ===", () => {
    const all = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
    const d = md.decodeAdjacencyCsv(all);
    rec("THE CONTROL: a file of all 256 byte values is not UTF-8, and is read as Windows-1252", d.encoding === "windows-1252", d.encoding);
    rec("⭐⭐⭐ …and every one of those bytes goes back as it was", md.encodeAdjacencyCsv(d.text, d.encoding).equals(all));
    // the oracle is the WHATWG decoder built into node, not a table typed in here: its windows-1252 index is the one browsers use
    const whatwg = new TextDecoder("windows-1252").decode(all);
    rec("⭐⭐ …and every byte reads as the letter Windows-1252 puts there (0x96 is `–`, not latin1's control code), as TextDecoder reads it",
      d.text === whatwg && d.text[0x96] === "–", JSON.stringify(d.text.slice(0x80, 0xA0)));
    for (const [label, buf] of Object.entries(FILES)) {
      const x = md.decodeAdjacencyCsv(buf);
      rec(`${label}: read as ${/Windows/.test(label) ? "Windows-1252" : "UTF-8"}, every name as written, and back byte for byte`,
        x.encoding === (/Windows/.test(label) ? "windows-1252" : "utf8") && Object.values(NAMES).every((n) => x.text.includes(n)) && md.encodeAdjacencyCsv(x.text, x.encoding).equals(buf),
        { encoding: x.encoding, text: x.text.slice(0, 200) });
    }
    rec("⭐ a letter Windows-1252 has no byte for is written as \"?\", as Windows writes it, and one it has goes to its own byte",
      md.encodeAdjacencyCsv("Ł€", "windows-1252").equals(Buffer.from([0x3F, 0x80])), highBytes(md.encodeAdjacencyCsv("Ł€", "windows-1252")));

    // ⛔ the file that is both. Read whole as Windows-1252 — one stray byte decided it — every UTF-8 name in it was `SmÃ¥land`.
    const both = md.decodeAdjacencyCsv(BOTH);
    rec("THE CONTROL: the file that is both has UTF-8 names (C3 A5) and Windows-1252 ones (E5, F6, 96), so it is neither read whole",
      bytes(BOTH).includes("Sk\xC3\xA5ne") && bytes(BOTH).includes("Sk\xE5ne") && bytes(BOTH).includes("Malm\xF6 \x96") && both.encoding !== "utf8" && both.encoding !== "windows-1252",
      typeof both.encoding);
    const read = md.parseAdjacencies(both.text).map((a) => a.comment);
    rec("⭐⭐⭐ …each row is read in its own encoding: `Città` and `Malmö – typed` alike, and `Skåne` from both",
      JSON.stringify(read) === JSON.stringify(["Malmö – typed", "Città", "Skåne", "Skåne", NAMES.a]), read);
    rec("⭐⭐⭐ …and the file goes back byte for byte", md.encodeAdjacencyCsv(both.text, both.encoding).equals(BOTH),
      { got: highBytes(md.encodeAdjacencyCsv(both.text, both.encoding)), want: highBytes(BOTH) });
  });

  section("=== 2. the retype keeps every byte but the row it retypes ===", () => { for (const [label, base] of Object.entries({ ...FILES, [BOTH_LABEL]: BOTH })) {
    const ctx = world(base);
    const r = md.fixAdjacenciesForProvinceTypes(ctx);
    const out = readCsv(ctx);
    // the one splice the retype is asked for: 1;2 is a sea link now, `sea;5` -> `;-1`
    // ⛔ #a-row-written-for-the-map-below — …and in the file that is both, a second: 2;3 is an impassable border between 2, which the
    // flood made sea, and 3, which touches it in the fixture's bitmap — a wall standing in the sea, which the retype now opens.
    // Moved with that change: this said "exactly one row" when the retype had only two kinds.
    const walls = label === BOTH_LABEL ? 1 : 0;
    const strait = bytes(base).replace("\n1;2;sea;5;", "\n1;2;;-1;");
    const want = fromBytes(walls ? strait.replace("\n2;3;impassable;", "\n2;3;;") : strait);
    rec(`THE CONTROL (${label}): the fixture has exactly one strait to retype${walls ? " and one wall in the sea" : ""}, and names with accents on rows it does not retype`,
      r.retyped === 1 + walls && r.seaLinks === 1 && r.wallsOpened === walls && r.materialized === true && !want.equals(base) && /[\x80-\xFF]/.test(bytes(base).split("\n")[2]), r);
    rec(`⭐⭐⭐ ${label}: the mod's copy is the base file byte for byte, but for that one row`, out.equals(want),
      { got: highBytes(out), want: highBytes(want), gotLen: out.length, wantLen: want.length });
    // …and the ways the old writer broke it, each on its own
    if (label === BOTH_LABEL) rec(`⭐⭐⭐ ${label}: the row it retyped keeps the Windows-1252 bytes its name was typed in, in a file most of whose names are UTF-8`,
      bytes(out).includes("\r\n1;2;;-1;-1;-1;-1;-1;;Malm\xF6 \x96 typed\r\n"), bytes(out).split("\r\n").filter((l) => l.startsWith("1;2;")).map((l) => highBytes(fromBytes(l))));
    else if (/Windows/.test(label)) rec(`⭐⭐ ${label}: still one byte a letter — not converted to UTF-8`, !/[\xC2-\xF4][\x80-\xBF]/.test(bytes(out)), highBytes(out));
    else rec(`⭐⭐ ${label}: no letter is encoded twice (TEST 31's C3 83 C2 A5 for å)`, !/\xC3[\x82\x83]\xC2/.test(bytes(out)), highBytes(out));
    if (label === ONE_LF) rec(`⭐⭐ ${label}: THE CONTROL — the base has exactly one, and the mod's copy still has exactly one`, loneLf(base) === 1 && loneLf(out) === 1, [loneLf(base), loneLf(out)]);
    rec(`⭐⭐ ${label}: the file ends as the base's ends — no line ending added`, out.length > 8 && out.slice(-8).equals(base.slice(-8)), JSON.stringify(bytes(out.slice(-8))));
  } });

  section("=== 3. THE T31 SHAPE: the Auto-fix click that copies the base game's file in ===", () => {
    const base = FILES["UTF-8, LF"];
    const ctx = world(base);
    const r = md.autoFixMap(ctx);
    const at = (r.fixes || {}).adjacencyTypes || {};
    // ⛔ #a-row-written-for-the-map-below — what the retype owes is read off the types the click LEFT, because the click may drain
    // sea 5 first (fixInlandSeas; whether it calls a pocket this small inland is that pass's own business). Drained, 3;4 through 5 is
    // a land crossing, and 1;2 through 5, whose shores the flood made sea, joins two seas through land — an army strait turned inside
    // out, a sea link now (the old retype took that for a legal canal and left it, and this said retyped 1). Left sea, 1;2 is a sea
    // link and 3;4 a strait as it was. Moved with that change: this said retyped === 1.
    const now = new Map(fs.readFileSync(path.join(ctx.modRoot, "map", "definition.csv"), "utf8").split(/\r?\n/).map((l) => l.split(";")).filter((c) => /^\d+$/.test(c[0])).map((c) => [+c[0], c[4]]));
    const below = new Map([[1, "land"], [2, "land"], [3, "land"], [4, "land"], [5, "sea"]]);
    const cls = (t) => (t === "land" ? "land" : t === "sea" || t === "lake" ? "water" : "other");
    const owed = { seaLinks: 0, landCrossings: 0 };
    for (const [a, b, t] of [[1, 2, 5], [3, 4, 5]]) {
      if (![a, b, t].some((p) => cls(now.get(p)) !== cls(below.get(p)))) continue;
      if (cls(now.get(a)) === "water" && cls(now.get(b)) === "water") owed.seaLinks++;
      else if ([a, b, t].every((p) => now.get(p) === "land")) owed.landCrossings++;
    }
    rec("THE CONTROL: the click retyped what the types it left say, at least one strait, and took a copy of the base game's adjacencies.csv to do it",
      r.ok === true && at.changed === true && owed.seaLinks + owed.landCrossings >= 1 && at.retyped === owed.seaLinks + owed.landCrossings
      && at.seaLinks === owed.seaLinks && at.landCrossings === owed.landCrossings && at.materialized === true, { at, owed });
    const out = readCsv(ctx);
    rec("⭐⭐⭐ every accented byte is the base's, in the base's order — TEST 31 had twice as many (52 against 26)",
      highBytes(out) === highBytes(base), { mod: highBytes(out), base: highBytes(base) });
    const namesOf = (b) => md.parseAdjacencies(b.toString("utf8")).map((a) => a.from + ";" + a.to + "=" + a.comment).sort().join(" | ");
    rec("⭐⭐ …and every row still carries its own name", namesOf(out) === namesOf(base), namesOf(out));
    rec("⭐⭐ …so the rule for names written twice has nothing to say afterwards",
      !md.validateMapFiles(ctx).some((p) => p.rule === "adjacency_name_encoded_twice"));
  });

  section("=== 4. writeAdjacency, and the page's own remove-then-add ===", () => { for (const label of ["UTF-8, CRLF", "Windows-1252, CRLF"]) {
    const base = FILES[label];
    const cp = /Windows/.test(label);
    const ctx = owning(base);
    const added = "Nové – Město €";
    // Windows-1252 has \u00E9 (E9), \u2013 (96) and \u20AC (80), and no \u011B: that one becomes "?"
    const addedBytes = cp ? "Nov\xE9 \x96 M?sto \x80" : u(added);
    // 4;1 — a pair the file has no row for, so this is a new link and not an edit of one
    const w = md.writeAdjacency({ ...ctx, action: "add", from: 4, to: 1, type: "sea", through: 5, comment: added });
    const out = readCsv(ctx);
    const want = fromBytes(bytes(base).replace("\r\n-1;-1;-1;", `\r\n4;1;sea;5;-1;-1;-1;-1;;${addedBytes}\r\n-1;-1;-1;`));
    rec(`THE CONTROL (${label}): the link was written`, w.changed === true, w);
    rec(`⭐⭐⭐ ${label}: a row Nova adds is in the file's own encoding, and every other byte is as it was`, out.equals(want),
      { got: highBytes(out), want: highBytes(want) });
    rec(`⭐⭐ ${label}: no letter was lost to U+FFFD (EF BF BD)`, !bytes(out).includes("\xEF\xBF\xBD"), highBytes(out));
    // ⛔ …and the one that was lost to "?" is SAID. The save answered plain { changed: true }, and the page showed the name as typed
    // until the next reload. `fileWarning` is the field Save puts on its warning line, for any write.
    if (cp) rec(`⭐⭐⭐ ${label}: the save names the letter it wrote as "?", on the line Save shows`,
      JSON.stringify(w.lostLetters) === JSON.stringify(["ě"]) && /map\/adjacencies\.csv/.test(w.fileWarning || "") && /Windows-1252/.test(w.fileWarning || "") && (w.fileWarning || "").includes(" ě ") && (w.fileWarning || "").includes("\"?\""), w);
    else rec(`THE CONTROL (${label}): the same name loses no letter in a UTF-8 file, and the save says nothing of one`, w.lostLetters === undefined && w.fileWarning === undefined, w);

    // an edit of 3;4: its row is replaced, and the name it carried goes back with the same bytes
    const ctx2 = owning(base);
    const w2 = md.writeAdjacency({ ...ctx2, action: "add", from: 3, to: 4, type: "sea", through: 5 });
    const row34 = bytes(base).split("\r\n").find((l) => l.startsWith("3;4;"));
    const out2 = bytes(readCsv(ctx2));
    rec(`⭐⭐ ${label}: an edited row keeps its name's bytes`, out2.split("\r\n").includes(row34) && highBytes(fromBytes(out2)) !== "" && out2.length === base.length,
      out2.split("\r\n").filter((l) => l.startsWith("3;4;")));
    rec(`⭐⭐ ${label}: …and a save that lost no letter warns of none — every accented letter the file already had has its byte`, w2.changed === true && w2.lostLetters === undefined && w2.fileWarning === undefined, w2);

    // ⭐ the page: model.adjacencies carries the name; a remove queues it in its meta, and the add sends it back (public/map.js adjApply)
    const ctx3 = owning(base);
    const m = md.buildMapModel(ctx3);
    const kept = (m.adjacencies || []).find((a) => a.from === 3 && a.to === 4) || {};
    rec(`⭐⭐⭐ ${label}: the map model reads the name as it is written (the page sends it back)`, kept.comment === NAMES.b, kept.comment);
    md.writeAdjacency({ ...ctx3, action: "remove", from: 3, to: 4 });
    md.writeAdjacency({ ...ctx3, action: "add", from: 3, to: 4, type: "sea", through: 5, rule: kept.rule || "", comment: kept.comment || "", coords: [-1, -1, -1, -1] });
    const out3 = bytes(readCsv(ctx3));
    rec(`⭐⭐⭐ ${label}: …so removing the link and adding it again puts back the row's own bytes`,
      out3.split("\r\n").includes(row34) && out3.length === base.length, out3.split("\r\n").filter((l) => l.startsWith("3;4;")));
  }
    // each lost letter once, in the order it was typed
    const lossy = owning(FILES["Windows-1252, CRLF"]);
    const wl = md.writeAdjacency({ ...lossy, action: "add", from: 4, to: 1, type: "impassable", comment: "Łódź Łask" });
    rec("⭐⭐ two letters Windows-1252 lacks, one of them twice: each is named once, and the row says `?ód? ?ask`",
      JSON.stringify(wl.lostLetters) === JSON.stringify(["Ł", "ź"]) && bytes(readCsv(lossy)).includes("\r\n4;1;impassable;-1;-1;-1;-1;-1;;?\xF3d? ?ask\r\n"), wl);
    // …and it reaches the modder: the endpoint answers with writeAdjacency's own result, and Save shows any write's fileWarning
    const SERVER = maskJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));
    const at = SERVER.indexOf('app.post("/api/map/adjacency"');
    const handler = at < 0 ? "" : SERVER.slice(at, SERVER.indexOf("\n  });", at));
    rec("⭐⭐ …the adjacency endpoint answers with that result whole", /const result = mapData\.writeAdjacency\(/.test(handler) && /res\.json\(\{ ok: true, \.\.\.result \}\)/.test(handler), handler.length);
    rec("⭐⭐ …and Save puts a write's fileWarning on its warning line, whatever the write was",
      (P.MASKED.match(/if \(res\.fileWarning && writeWarnings\.indexOf\(res\.fileWarning\) === -1\) writeWarnings\.push\(res\.fileWarning\);/g) || []).length === 1);
  });

  section("=== 4b. writeAdjacency keeps each row's own line ending ===", () => {
    const base = FILES[ONE_LF];
    const L = bytes(base).split(/\r?\n/);   // the rows; 3;1 (L[3]) is the one that ends in LF
    const file = (rows) => fromBytes(rows.map((ln, i) => ln + (i === rows.length - 1 ? "" : ln === L[3] ? "\n" : "\r\n")).join(""));
    rec("THE CONTROL: the fixture is a CRLF file with exactly one LF row, and the rebuild used below gives it back", loneLf(base) === 1 && file(L).equals(base), loneLf(base));
    const NEW = "4;1;impassable;-1;-1;-1;-1;-1;;New";
    const a = owning(base);
    md.writeAdjacency({ ...a, action: "add", from: 4, to: 1, type: "impassable", comment: "New" });
    rec("⭐⭐⭐ a new link: the LF row is still the only one, and every other byte is as it was",
      readCsv(a).equals(file([L[0], L[1], L[2], L[3], L[4], NEW, L[5], L[6]])), { loneLf: loneLf(readCsv(a)) });
    // an edit takes the row out and puts it back before the terminator: 3;4 moves down, and nothing else changes
    const e = owning(base);
    md.writeAdjacency({ ...e, action: "add", from: 3, to: 4, type: "sea", through: 5 });
    rec("⭐⭐⭐ an edit of another row: the LF row is still the only one", readCsv(e).equals(file([L[0], L[1], L[3], L[4], L[2], L[5], L[6]])), { loneLf: loneLf(readCsv(e)) });
    // …and the row AFTER the LF row, which is the last before the terminator, so it goes back where it was: taken out with the
    // ending before it instead of its own, it would take the LF with it
    const e2 = owning(base);
    md.writeAdjacency({ ...e2, action: "add", from: 2, to: 4, type: "impassable" });
    rec("⭐⭐ an edit of the row after the LF row leaves the file byte for byte as it was", readCsv(e2).equals(base), { loneLf: loneLf(readCsv(e2)) });
    const x = owning(base);
    md.writeAdjacency({ ...x, action: "remove", from: 2, to: 4 });
    rec("⭐⭐⭐ a remove of another row: the LF row is still the only one", readCsv(x).equals(file([L[0], L[1], L[2], L[3], L[5], L[6]])), { loneLf: loneLf(readCsv(x)) });
    // the row that goes takes its own ending with it, and the last line's goes with the last line
    const y = owning(base);
    md.writeAdjacency({ ...y, action: "remove", from: 3, to: 1 });
    rec("⭐⭐ removing the LF row itself leaves a file that is CRLF throughout, and nothing doubled", readCsv(y).equals(fromBytes([L[0], L[1], L[2], L[4], L[5], L[6]].join("\r\n"))), bytes(readCsv(y)).slice(-60));
  });

  section("=== 4c. writeAdjacency on the file that is both ===", () => {
    const names = (ctx) => (md.buildMapModel(ctx).adjacencies || []).map((a) => `${a.from};${a.to}=${a.comment}`);
    const m = names(owning(BOTH));
    rec("⭐⭐⭐ the map model reads every name as it is written — this file showed `SmÃ¥land-Ã–land` and `CittÃ` on the page",
      JSON.stringify(m) === JSON.stringify(["1;2=Malmö – typed", "3;4=Città", "3;1=Skåne", "2;4=Skåne", "2;3=" + NAMES.a]), m);
    const adv = md.blankAdjacencySurvivors({ ...owning(BOTH), drownedIds: [3] });
    rec("⭐⭐ …and so does the Delete-map advisory", adv.examples.some((x) => x.comment === "Città") && adv.examples.some((x) => x.comment === "Skåne"), adv.examples);

    // the page's plain edit of a row: it posts no comment, so the server carries the one on disk — trimmed
    const e1 = owning(BOTH);
    md.writeAdjacency({ ...e1, action: "add", from: 3, to: 4, type: "sea", through: 5 });
    rec("⭐⭐⭐ an edit of `Città` keeps its C3 A0 — read as `Ã` and a no-break space, the trim took the A0 off",
      readCsv(e1).equals(bothOf([B[0], B[1], B[3], B[4], B[5], B[2], B[6], B[7]])), { got: highBytes(readCsv(e1)), want: highBytes(BOTH) });
    const e2 = owning(BOTH);
    md.writeAdjacency({ ...e2, action: "add", from: 1, to: 2, type: "impassable" });
    rec("⭐⭐⭐ an edit of the Windows-1252 row keeps its F6 and 96, though most of the file's names are UTF-8",
      readCsv(e2).equals(bothOf([B[0], B[2], B[3], B[4], B[5], "1;2;impassable;-1;-1;-1;-1;-1;;Malm\xF6 \x96 typed", B[6], B[7]])), highBytes(readCsv(e2)));
    // two rows say `Skåne`, one in each encoding: taking the UTF-8 one out must not hand its encoding to the other
    const e3 = owning(BOTH);
    md.writeAdjacency({ ...e3, action: "remove", from: 3, to: 1 });
    rec("⭐⭐⭐ removing the UTF-8 `Skåne` leaves the Windows-1252 `Skåne` its E5", readCsv(e3).equals(bothOf([B[0], B[1], B[2], B[4], B[5], B[6], B[7]])), highBytes(readCsv(e3)));

    // a row the file did not have: the encoding most of its names are in, UTF-8 on a tie
    const add = (file, comment) => { const c = owning(file); const w = md.writeAdjacency({ ...c, action: "add", from: 4, to: 1, type: "impassable", comment }); return { w, row: bytes(readCsv(c)).split("\r\n").find((l) => l.startsWith("4;1;")) || "", out: readCsv(c) }; };
    const NEWROW = "4;1;impassable;-1;-1;-1;-1;-1;;";
    const n1 = add(BOTH, "Nové");
    rec("⭐⭐ a new row in a file of three UTF-8 names and two Windows-1252 ones is UTF-8, and no other byte moves",
      n1.out.equals(bothOf([B[0], B[1], B[2], B[3], B[4], B[5], NEWROW + "Nov\xC3\xA9", B[6], B[7]])), highBytes(fromBytes(n1.row)));
    const n2 = add(BOTH_TIED, "Nové");
    rec("⭐⭐ …in a file of one of each it is UTF-8 too, the base game's encoding", n2.row === NEWROW + "Nov\xC3\xA9", highBytes(fromBytes(n2.row)));
    const n3 = add(BOTH_MOSTLY_1252, "Nové");
    rec("⭐⭐ …and in a file of two Windows-1252 names and one UTF-8 it is Windows-1252", n3.row === NEWROW + "Nov\xE9", highBytes(fromBytes(n3.row)));
    const n4 = add(BOTH_MOSTLY_1252, "Łódź");
    rec("⭐⭐⭐ …unless Windows-1252 has no byte for one of its letters: the file holds UTF-8 rows already, so it goes in whole, as one, and nothing is lost",
      n4.row === NEWROW + u("Łódź") && n4.w.lostLetters === undefined && n4.w.fileWarning === undefined, { row: highBytes(fromBytes(n4.row)), w: n4.w });
  });

  section("=== 5. the strait-rule repair and the Delete-map advisory read a Windows-1252 file as it is ===", () => {
    const TYPES = { 1: "land", 2: "land", 10: "sea", 11: "sea" };
    const defs = (over) => ["0;0;0;0;land;false;unknown;0"].concat(Object.keys(TYPES).map((id) => {
      const t = (over || {})[id] || TYPES[id];
      return `${id};${id};${id * 3};${id * 7};${t};false;${t === "land" ? "plains" : "ocean"};${t === "land" ? 1 : 0}`;
    })).join("\n") + "\n";
    // a base game with one strait rule over 10 and 11, and a mod that made both land
    const rulesWorld = (name, adj) => {
      const dir = path.join(SCRATCH, name), game = path.join(dir, "game"), mod = path.join(dir, "mod");
      put(game, "map/definition.csv", defs());
      put(game, "map/adjacency_rules.txt", 'adjacency_rule =\n{\n\tname = "TEST_STRAIT"\n\tenemy = { army = no navy = no submarine = yes trade = no }\n\trequired_provinces = { 1 2 }\n\ticon = 10\n\toffset = { 0 0 0 }\n}\n');
      put(game, "map/adjacencies.csv", adj);
      put(mod, "descriptor.mod", 'name="rules fixture"\n');
      put(mod, "map/definition.csv", defs({ 10: "land", 11: "land" }));
      return { modRoot: mod, gameRoot: game, dependencyRoots: [] };
    };
    const adj = fromBytes([HEADER, "10;11;;-1;-1;-1;-1;-1;TEST_STRAIT;\xD8resund \x96 north", "1;2;;-1;-1;-1;-1;-1;;Sm\xE5land", END, ""].join("\r\n"));
    const ctx = rulesWorld("rules", adj);
    const r = md.fixAdjacencyRulesLeftOnLand(ctx);
    rec("THE CONTROL: the rule whose sea became land was taken out of the rules file", r.fixed === 1 && (r.files || []).includes("map/adjacency_rules.txt"), r);
    const out = readCsv(ctx);
    rec("⭐⭐⭐ …and its name came off the row too — a Windows-1252 file is not refused after the rules file was already written",
      r.rowsCleared === 1 && !(r.skipped || []).length && out.equals(fromBytes(bytes(adj).replace(";TEST_STRAIT;", ";;"))), { r, got: highBytes(out) });

    const b = md.blankAdjacencySurvivors({ ...ctx, drownedIds: [1, 2] });
    rec("⭐⭐ the Delete-map advisory quotes a Windows-1252 name as it is written", b.rows === 1 && (b.examples[0] || {}).comment === "Småland", b);

    // …and a CRLF file whose one LF row is not the row it clears
    const lf = Buffer.from(HEADER + "\r\n10;11;;-1;-1;-1;-1;-1;TEST_STRAIT;Øresund\r\n1;2;;-1;-1;-1;-1;-1;;Småland\n" + END + "\r\n", "utf8");
    const ctx2 = rulesWorld("rules-one-lf", lf);
    const r2 = md.fixAdjacencyRulesLeftOnLand(ctx2);
    rec("⭐⭐ the strait-rule repair leaves a row it does not touch its own line ending", r2.rowsCleared === 1 && loneLf(lf) === 1 && readCsv(ctx2).equals(fromBytes(bytes(lf).replace(";TEST_STRAIT;", ";;"))),
      { r2, loneLf: [loneLf(lf), loneLf(readCsv(ctx2))] });
  });

  section("=== 6. the repair for worlds already written ===", () => {
    const base = FILES["UTF-8, LF"];
    // the mod's own copy, as the old retype left it, in CRLF and with no final line ending: 1;2 doubled once; 3;4 doubled once and
    // stored the other way round (the page writes a link in click order); 3;1 doubled three times (each later retype doubled it
    // again); and a row of the mod's own, doubled, that the layer below does not name.
    const mine = [HEADER, `1;2;;-1;-1;-1;-1;-1;;${dbl(NAMES.a)}`, `4;3;sea;5;-1;-1;-1;-1;;${dbl(NAMES.b)}`, `3;1;impassable;-1;-1;-1;-1;-1;;${dbl(dbl(dbl(NAMES.c)))}`,
      "2;4;impassable;-1;-1;-1;-1;-1;;Plain", `4;1;impassable;-1;-1;-1;-1;-1;;${dbl("Göteborg")}`, END];
    const fixed = mine.slice();
    fixed[1] = `1;2;;-1;-1;-1;-1;-1;;${NAMES.a}`; fixed[2] = `4;3;sea;5;-1;-1;-1;-1;;${NAMES.b}`; fixed[3] = `3;1;impassable;-1;-1;-1;-1;-1;;${NAMES.c}`;
    const MINE = Buffer.from(mine.join("\r\n"), "utf8"), WANT = Buffer.from(fixed.join("\r\n"), "utf8");
    const ctx = world(base, { flood: false, modAdj: MINE });

    const probs = md.validateMapFiles(ctx).filter((p) => p.rule === "adjacency_name_encoded_twice");
    const p = probs[0] || {};
    rec("THE CONTROL: the fixture's doubled names are what the old retype wrote", bytes(MINE).includes("Sm\xC3\x83\xC2\xA5land"), highBytes(MINE).slice(0, 60));
    rec("⭐⭐⭐ the validator reports it once, as a WARNING for the three names the layer below gives",
      probs.length === 1 && p.severity === "warning" && p.total === 3 && (p.rows || []).length === 3, probs);
    rec("⭐⭐ …never in the fatal set, and with a label of its own",
      !labels.isFatalRule("adjacency_name_encoded_twice") && !!labels.LABELS.adjacency_name_encoded_twice && labels.mapRuleLabel("adjacency_name_encoded_twice") === labels.LABELS.adjacency_name_encoded_twice,
      labels.mapRuleLabel("adjacency_name_encoded_twice"));
    rec("⭐⭐ …and its message says what the layer below calls the row, and that Auto-fix repairs it",
      /"Småland-Öland"/.test(p.message || "") && /\bAuto-fix\b/.test(p.message || ""), p.message);
    const hits = md.adjacencyNamesEncodedTwice(ctx);
    rec("⭐⭐ a row stored the other way round from the layer below's is still found",
      hits.some((h) => h.from === 4 && h.to === 3 && h.was === NAMES.b), hits.map((h) => h.from + ";" + h.to));
    rec("⭐⭐ a name encoded three times over is found, and traced back to the layer below's",
      hits.some((h) => h.from === 3 && h.to === 1 && h.was === NAMES.c), hits.map((h) => h.from + ";" + h.to));

    const r1 = md.fixAdjacencyNamesEncodedTwice(ctx);
    const out1 = readCsv(ctx);
    rec("⭐⭐⭐ the repair puts back exactly those three names, and every other byte of the file stays", r1.fixed === 3 && out1.equals(WANT),
      { r1, got: bytes(out1).split("\r\n"), want: bytes(WANT).split("\r\n") });
    rec("⭐⭐⭐ …leaving the name the layer below does not give as it found it", bytes(out1).includes(`4;1;impassable;-1;-1;-1;-1;-1;;${u(dbl("Göteborg"))}`));
    const r2 = md.fixAdjacencyNamesEncodedTwice(ctx);
    rec("⭐⭐⭐ a second click writes nothing", r2.fixed === 0 && readCsv(ctx).equals(out1), r2);
    rec("⭐⭐ …and the rule is silent", !md.validateMapFiles(ctx).some((q) => q.rule === "adjacency_name_encoded_twice"));

    // the controls: a mod that inherits the file has nothing of its own to repair; a copy equal to the base has nothing wrong
    const inh = world(base, { flood: false });
    rec("THE CONTROL: a mod that inherits the file is told nothing, and the repair creates no file",
      md.adjacencyNamesEncodedTwice(inh).length === 0 && md.fixAdjacencyNamesEncodedTwice(inh).fixed === 0 && !fs.existsSync(modCsv(inh)));
    const same = world(base, { flood: false, modAdj: base });
    rec("THE CONTROL: a mod whose copy is the base's is told nothing", md.adjacencyNamesEncodedTwice(same).length === 0);
    // ⛔ the old retype wrote UTF-8 throughout, so a file with a row that is not UTF-8 was not written by it alone. That row is read
    // one byte a letter — here a rule named in Windows-1252 (C9) decides it — and then the CORRECT UTF-8 name beside it (Skåne's
    // C3 A5) reads as `SkÃ¥ne` and would pass for a doubled one.
    const MIXED = fromBytes([HEADER, `3;4;sea;5;-1;-1;-1;-1;D\xC9TROIT;${u(NAMES.b)}`, "2;4;impassable;-1;-1;-1;-1;-1;;Plain", ""].join("\r\n"));
    const mix = world(base, { flood: false, modAdj: MIXED });
    rec("THE CONTROL: that file is not UTF-8, its 3;4 name is the base's own bytes, and its row reads one byte a letter",
      md.decodeAdjacencyCsv(MIXED).encoding !== "utf8" && bytes(MIXED).includes(u(NAMES.b)) && md.parseAdjacencies(md.decodeAdjacencyCsv(MIXED).text)[0].comment === dbl(NAMES.b),
      md.parseAdjacencies(md.decodeAdjacencyCsv(MIXED).text)[0]);
    const mixFix = md.fixAdjacencyNamesEncodedTwice(mix);
    rec("⭐⭐ a correct UTF-8 name on a row with one Windows-1252 byte is not taken for a doubled one, and nothing is written",
      md.adjacencyNamesEncodedTwice(mix).length === 0 && mixFix.fixed === 0 && readCsv(mix).equals(MIXED), mixFix);

    // ⛔ WHICH FILE IS "THE LAYER BELOW". The one the retype copies from: the LAST dependency declared that ships an adjacencies.csv,
    // the base game under them, and nothing under a dependency that replaces map/. No fixture had a dependency, so judging an
    // add-on against the base game's spelling instead of its dependency's passed every check here.
    const rowsOf = (pairs, eol) => Buffer.from([HEADER, ...pairs.map(([pr, n]) => `${pr};;-1;-1;-1;-1;-1;;${n}`), END, ""].join(eol), "utf8");
    const layer = (name, descriptor, adj) => {
      const d = path.join(SCRATCH, "layers", name);
      fs.mkdirSync(d, { recursive: true });
      if (descriptor) put(d, "descriptor.mod", descriptor);
      if (adj) put(d, "map/adjacencies.csv", adj);
      return d;
    };
    const G = layer("game", "", rowsOf([["1;2", "Skåne"], ["3;4", "Øresund"]], "\n"));
    const A = layer("depA", 'name="A"\n', rowsOf([["1;2", "Småland"], ["3;4", "Sundet"]], "\r\n"));
    const Bd = layer("depB", 'name="B"\n', rowsOf([["1;2", "Blekinge-Öland"], ["3;4", "Sundet"]], "\r\n"));
    const R = layer("depR", 'name="R"\nreplace_path="map"\n', null);
    // the add-on's 1;2 is dependency A's name twice over; its 3;4 is the BASE GAME's name twice over
    const addon = layer("addon", 'name="addon"\n', rowsOf([["1;2", dbl("Småland")], ["3;4", dbl("Øresund")]], "\r\n"));
    const seen = (deps) => md.adjacencyNamesEncodedTwice({ modRoot: addon, gameRoot: G, dependencyRoots: deps }).map((h) => `${h.from};${h.to}=${h.was}`).join(" | ");
    rec("THE CONTROL: with no dependency the add-on is judged against the base game — its 3;4 is found, its 1;2 is not", seen([]) === "3;4=Øresund", seen([]));
    rec("⭐⭐⭐ an add-on is judged against its dependency's file, not the base game's under it: 1;2 is found, and 3;4 is left alone",
      seen([A]) === "1;2=Småland", seen([A]));
    rec("⭐⭐ of two dependencies the one declared LAST is the file it was copied from, in either order",
      seen([Bd, A]) === "1;2=Småland" && seen([A, Bd]) === "", { BA: seen([Bd, A]), AB: seen([A, Bd]) });
    rec("⭐⭐ a dependency that replaces map/ and ships no adjacencies.csv hides the base game's: nothing to judge against", seen([R]) === "", seen([R]));
    const addonFix = md.fixAdjacencyNamesEncodedTwice({ modRoot: addon, gameRoot: G, dependencyRoots: [A] });
    rec("⭐⭐ …and the repair writes the dependency's name, leaving the row only the base game names",
      addonFix.fixed === 1 && fs.readFileSync(path.join(addon, "map", "adjacencies.csv")).equals(rowsOf([["1;2", "Småland"], ["3;4", dbl("Øresund")]], "\r\n")), addonFix);

    // ⛔ A MOD THAT DECLARES replace_path="map". Nothing loads under its map/ — and the retype used to copy the base game's file into it
    // all the same (baseRootsFor does not look at the mod's own descriptor), so the old one doubled its names like anyone's. Such a copy
    // is still in every world it was written into, and it is judged against the file it was made from (worldBeneathRoots): asked "what
    // loads below", the rule found no file to judge against and Auto-fix left them.
    // ⛔ #a-replaced-map-folder-is-judged-by-its-own-files — the retype no longer makes that copy (B6-17): no adjacencies.csv loads under
    // the line, so there is none to retype. Moved with that fix: this was THE CONTROL that the retype copies the base game's file in;
    // the copy the old retype left is now taken from the twin without the line, where the base game's file loads and copying it is right.
    const rp = world(base, { replacesMap: true });
    const rr = md.fixAdjacenciesForProvinceTypes(rp);
    rec("⭐⭐⭐ the retype copies nothing into a mod that replaces map/: no adjacencies.csv loads under its line (B6-17)",
      !rr.changed && !rr.materialized && rr.retyped === 0 && !fs.existsSync(modCsv(rp)) && /replace_path="map"/.test(rr.skipped || ""), rr);
    const twin = world(base);
    const tr = md.fixAdjacenciesForProvinceTypes(twin);
    const good = readCsv(twin);
    rec("THE CONTROL: its twin without the line is given the base game's file and retyped, as the old retype did to both", tr.materialized === true && tr.retyped === 1 && good.length > 0, tr);
    // what the OLD retype wrote there: those bytes read one letter each, written back as UTF-8
    put(rp.modRoot, "map/adjacencies.csv", Buffer.from(bytes(good), "utf8"));
    const rpHits = md.adjacencyNamesEncodedTwice(rp);
    rec("⭐⭐⭐ …so the three names the old one wrote twice there are found", rpHits.length === 3 && rpHits.map((h) => h.was).sort().join("|") === Object.values(NAMES).sort().join("|"), rpHits);
    const rpFix = md.fixAdjacencyNamesEncodedTwice(rp);
    rec("⭐⭐⭐ …and the repair leaves exactly the file the retype writes today", rpFix.fixed === 3 && readCsv(rp).equals(good), { rpFix, got: highBytes(readCsv(rp)), want: highBytes(good) });

    // ⛔ the wiring: Auto-fix all runs the repair, and the summary says so
    const wired = world(base, { flood: false, modAdj: MINE });
    const a = md.autoFixMap(wired);
    const an = ((a && a.fixes) || {}).adjacencyNames || {};
    rec("⭐⭐⭐ Auto-fix all runs the repair", an.fixed === 3 && readCsv(wired).equals(WANT), an);
    const line = P.autoFixSummary(a);
    rec("⭐⭐ …and its summary says how many names it put back, and which", /put back 3 name\(s\) in map\/adjacencies\.csv/.test(line) && line.includes(NAMES.a), line.slice(0, 600));
    rec("⭐ …and a repair that failed says so", P.autoFixSummary({ ok: true, fixes: { adjacencyNames: { error: "probe-failure" } } }).includes("probe-failure"));
  });

  section("=== 7. cry-wolf: every installed workshop map that ships the file, and the base game's own names ===", () => {
    const GAME = process.env.HOI4_ROOT || "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
    const WORKSHOP = "D:/SteamLibrary/steamapps/workshop/content/394360";
    if (!fs.existsSync(path.join(GAME, "map", "adjacencies.csv"))) { skip("the base game is not installed here — the cry-wolf half did NOT run"); return; }
    // ⛔ The base game has no file under it, so the rule does not apply to it: asked about the game folder itself it answers 0
    // whatever the file holds, and a check of that could not fail. What CAN be asked is whether the rule tells the base game's
    // own names from the same names written twice — in two scratch mods, one holding its adjacencies.csv byte for byte and one
    // holding it as the old retype would have left it. Nothing is written outside this test's scratch folder.
    const vanilla = fs.readFileSync(path.join(GAME, "map", "adjacencies.csv"));
    const accented = md.parseAdjacencies(md.decodeAdjacencyCsv(vanilla).text).filter((a) => /[^\x00-\x7F]/.test(a.comment));
    const scratchMod = (name, adj) => {
      const d = path.join(SCRATCH, name);
      put(d, "descriptor.mod", `name="${name}"\n`);
      put(d, "map/adjacencies.csv", adj);
      return { modRoot: d, gameRoot: GAME, dependencyRoots: [] };
    };
    const twice = md.adjacencyNamesEncodedTwice(scratchMod("vanilla-twice", Buffer.from(bytes(vanilla), "utf8")));
    rec(`THE CONTROL: the base game's own file written twice over, in a scratch mod — all ${accented.length} of its accented names are found, each traced back to its own`,
      accented.length > 0 && twice.length === accented.length && accented.every((a) => twice.some((h) => h.from === a.from && h.to === a.to && h.was === a.comment)),
      { accented: accented.length, found: twice.length });
    rec("⭐⭐ the base game's own file, byte for byte, in a scratch mod: 0", md.adjacencyNamesEncodedTwice(scratchMod("vanilla-copy", vanilla)).length === 0);
    // Derived from what is on disk. A hit here is by construction a name the map ships encoded twice over the base game's
    // same row — read it before loosening this: it is either a real one or a bug in the rule.
    let entries = [];
    try { entries = fs.readdirSync(WORKSHOP, { withFileTypes: true }); } catch (_) { /* no workshop folder on this machine */ }
    const maps = entries.filter((e) => e.isDirectory() && fs.existsSync(path.join(WORKSHOP, e.name, "map", "adjacencies.csv")));
    for (const e of maps) {
      const n = md.adjacencyNamesEncodedTwice({ modRoot: path.join(WORKSHOP, e.name), gameRoot: GAME, dependencyRoots: [] }).length;
      rec(`⭐⭐ workshop ${e.name}: 0`, n === 0, n);
    }
    if (!maps.length) skip("no workshop map ships an adjacencies.csv here — only the base game's own names were checked");
  });
} catch (e) {
  fails.push("HARNESS " + (e && e.message));
  console.log("HARNESS ERROR " + (e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e));
} finally {
  try { fs.rmSync(SCRATCH, { recursive: true, force: true }); } catch (_) {}
}
console.log(`\n${pass} passed, ${fails.length} failed${skips ? `, ${skips} SKIPPED` : ""}`);
if (fails.length) { console.log("FAILED: " + fails.join(" | ")); process.exit(1); }
