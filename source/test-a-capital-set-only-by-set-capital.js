// ⛔ #a-capital-set-only-by-set-capital — A COUNTRY WHOSE HISTORY SETS ITS CAPITAL ONLY WITH set_capital.
//
// TEST 34's rehearsal (the owner's flow: New mod → Delete map → Generate land 35% seed 1 inherit → Auto-fix → Redraw regions) started
// PRC on one state of its own, 835, with no capital it owned: vanilla's "PRC - ComChina.txt" has no `capital = N` line and sets its
// capital only with set_capital — 622 under No Compromise, No Surrender, 1032 without, at the start, and 1032 in both branches of its
// 1939.1.1 block. Generated state ids are new, so 622 was SWE's land and 1032 FRA's (ENG's in TEST 33's rehearsal). Every capital
// reader read the line only: Generate land "left it exactly as shipped", and neither Map Errors nor Auto-fix saw it.
// 🎮 hoi4.exe 1.19.4.1: set_capital (CSetCapitalEffect, 0x1403799D0) hands its id to CCountry::SetCapital, which WRITES it (0x1407590D2)
// before it compares the owner, and a history file's lines are applied in the order they stand — so a `capital = N` line above a
// set_capital does not survive it, and both have to name the country's own state. A state the map does not have writes nothing.
//
// ⭐ THE REVIEW OF THAT FIX (E1-E4, R1-R5) found the judge too narrow: it asked whether ANY start set_capital named an own state (blind to
// which DLC runs which — #a-set-capital-runs-by-dlc), skipped every country with a line (a set_capital below a line overrides it), read
// hidden_effect as another scope, gave "no capital at all" a milder verdict than capital_state_missing's same capital 0, left the other
// capital writers (Auto-fix's line loop, Swap countries, Set capital) pointing only the line, said "took the id" for a pin that never
// happened, and left the 1939 lines naming another country's state. Every one of those is a check below.
// ⭐ THE REVIEW OF THAT (D1-D5) found the FATAL verdict pessimistic — a limit Nova cannot judge (`limit = { tag = OPA }`, `always = yes`)
// was assumed to fail, and a set_capital in the start date's own block (`1936.1.1 = { … }`, how MD, MDC, RoN and NV write their start)
// was "a later bookmark's", so a valid file got a FATAL "no capital at all"; every capital writer rewrote a modder's own-state DLC and
// game-rule alternatives, and said nothing; Generate land copied a country's whole history file into the mod for one digit of a 1939
// capital; and a pointed line kept a comment naming the old state. Each is a check below too.
//
// This test pins:
//   1. findSetCapitalRefs: effect vs trigger context, another country's scope, hidden_effect, undated vs dated, `when` — EVERY condition
//      around it, the nested idiom (else_if INSIDE the if) and the sibling form, a limit Nova cannot judge — a target that is not a
//      number, a comment, a brace in a string, a block left open at EOF, a BOM at the very start, the digits' offsets; then the base
//      game's own PRC and MEN, counted independently of the reader (a counted skip if absent); and the start date — which dated block
//      is the start's, and the earliest bookmark a mod loads, read the overlay way;
//   2. Generate land over a layer below with a PRC-shaped country: its capital takes the id the most of its set_capital lines name, a
//      capital line naming it is written (BOM, CRLF and comments kept), the start's set_capital naming another state is pointed at it —
//      and a MEN-shaped country's dated set_capital naming a state this world gave another country is LEFT and said, never copied in for
//      (review D3), and pointed only in a file written anyway; a second world: an id out of range is NOT said to be pinned, a DLC branch
//      naming the country's other own state is pointed too, and a set_capital below a line is pointed; the page says each, and only that;
//   3. the rules: no_capital_of_its_own (a set_capital wrote another's state last — not fatal) and no_capital_at_all (no line, nothing
//      names a state — FATAL, as capital_state_missing), judged per DLC combination, below a line, through hidden_effect, giving a limit
//      Nova cannot judge the benefit of the doubt (a DLC not), with the start date's own block the start; one row per problem; not on the
//      base-game shape, an empty add-on, nor the base game and every installed shipping map;
//   4. Auto-fix repairs exactly what they report — the line, the start's set_capital, and a dated one naming a state its own file never
//      gives the country — and Auto-fix's line loop (its dated one too) and Swap countries point the start's set_capital too; then silence, and a second click
//      writes nothing; a set_capital naming a state of the country's own under a DLC or a game rule is left by Auto-fix and Set capital,
//      unless — for Set capital — such alternatives decide the capital in every case (PRC's shape), when the click would change nothing
//      in game; a comment trailing a number they point goes with the old state, and the page says what each did.
//
// Fixture-only apart from the read-only corpus checks: binds no port. Run: node test-a-capital-set-only-by-set-capital.js
"use strict";
const fs = require("fs"), os = require("os"), path = require("path"), crypto = require("crypto");

let checks = 0, skips = 0;
const fails = [];
const rec = (label, cond, detail) => {
  checks++;
  console.log((cond ? "  ok   " : "  FAIL ") + label + (cond || detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)));
  if (!cond) fails.push(label);
};
const skip = (label) => { skips++; console.log("  SKIP " + label); };

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-setcapital-"));
process.env.APPDATA = path.join(SANDBOX, "appdata");
process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_APP_DATA_DIR = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(SANDBOX, "home");
process.env.HOI4_MODS_ROOT = SANDBOX;
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");
const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const RULE = "no_capital_of_its_own", NONE = "no_capital_at_all";
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const sha = (p) => crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex");
const conds = (r) => (r && r.when ? r.when.map((c) => `${c.key}=${c.has}`).join(" & ") : "?");

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
console.log("=== 1. findSetCapitalRefs: the start's set_capital, read the way the game runs it ===");
const hasReader = typeof md.findSetCapitalRefs === "function";
rec("map-data.js exports findSetCapitalRefs", hasReader);
const read = (t) => (hasReader ? md.findSetCapitalRefs(t) : []);
{
  // PRC's shape, CRLF, with a BOM before the very first key, the else_if written INSIDE the if (as vanilla writes it)
  const DLC = "Fixture Pack";
  const T = "\ufeffif = {\r\n\tlimit = {\r\n\t\thas_dlc = \"" + DLC + "\"\r\n\t}\r\n\tset_capital = {\r\n\t\tstate = 622\r\n\t}\r\n"
    + "\telse_if = {\r\n\t\tlimit = {\r\n\t\t\tNOT = { has_dlc = \"" + DLC + "\" }\r\n\t\t}\r\n\t\tset_capital = {\r\n\t\t\tstate = 1032\r\n\t\t}\r\n\t}\r\n}\r\n"
    + "# set_capital = { state = 9 }  a comment is not a line\r\nset_politics = { ruling_party = communism }\r\n"
    + "1939.1.1 = {\r\n\tset_capital = { state = 1032 remember_old_capital = yes }\r\n}\r\n";
  const r = read(T);
  rec("⭐⭐ the PRC shape: three set_capital lines (the commented one is not read)", r.length === 3, r);
  const at622 = T.indexOf("622"), at1032 = T.indexOf("1032"), at1939 = T.indexOf("1032", T.indexOf("1939.1.1"));
  rec("⭐⭐ …622 at the start, run only WITH the DLC", !!r[0] && r[0].id === 622 && r[0].date === "" && r[0].own && !r[0].trigger
    && conds(r[0]) === `dlc:${DLC}=true` && r[0].when[0].dlc === DLC, r[0]);
  rec("⭐⭐⭐ …1032 at the start, in the else_if written INSIDE the if: that else_if is the if's else, so it runs only WITHOUT it",
    !!r[1] && r[1].id === 1032 && r[1].date === "" && r[1].own && conds(r[1]) === `dlc:${DLC}=false`, r[1]);
  rec("⭐⭐ …1032 again in the 1939.1.1 block, which is not the start", !!r[2] && r[2].id === 1032 && r[2].date === "1939.1.1" && r[2].own && conds(r[2]) === "", r[2]);
  rec("⭐⭐ the digits' offsets address the ORIGINAL text, BOM and all", !!r[2] && r[0].idStart === at622 && r[0].idEnd === at622 + 3
    && r[1].idStart === at1032 && r[1].idEnd === at1032 + 4 && r[2].idStart === at1939 && T.slice(r[0].idStart, r[0].idEnd) === "622", r.map((x) => [x.idStart, x.idEnd]));
  rec("…and the line numbers are the file's", !!r[2] && r[0].line === T.slice(0, T.indexOf("set_capital")).split("\n").length && r[2].line === T.slice(0, T.indexOf("set_capital", T.indexOf("1939"))).split("\n").length, r.map((x) => x.line));
}
{
  // ⭐ A UTF-8 BOM DEFEATS EVERY ^ ANCHOR: the base game's country files open with one, and a set_capital can be the very first key
  const T = "\ufeffset_capital = { state = 5 }\r\n";
  const r = read(T);
  rec("⭐⭐ a set_capital that is the file's first key, behind a BOM, is read: state 5, at the start, its own, under no condition", r.length === 1 && r[0].id === 5 && r[0].date === "" && r[0].own && !r[0].trigger && r[0].idStart === T.indexOf("5") && conds(r[0]) === "", r);
}
{
  // what does NOT set this country's capital at the start — and hidden_effect, which does (review E4)
  const T = [
    "if = { limit = { NOT = { set_capital = { state = 7 } } } }",           // a trigger block: only asks
    "random_list = { 50 = { set_capital = { state = 8 } } }",                // not one of the blocks the corpus shows around it
    "GER = { set_capital = { state = 9 } }",                                 // another country's scope
    "effect_tooltip = { set_capital = { state = 10 } }",                     // shown, never run
    "set_capital = { state = var:my_capital }",                              // not a number
    "set_country_flag = \"a { quoted } brace\"",                             // a brace in a string must not throw the walk
    "hidden_effect = { set_capital = { state = 14 } }",                      // run on this country, only unseen
    "set_capital = { state = 13",                                            // never closed: Clausewitz closes at EOF
  ].join("\n");
  const r = read(T), by = new Map(r.map((x) => [x.id, x]));
  rec("THE CONTROL: every set_capital in the text is found", r.length === 7, r.map((x) => x.id));
  rec("⭐⭐ inside a trigger block it is a trigger", !!by.get(7) && by.get(7).trigger === true && by.get(7).own === false, by.get(7));
  rec("⭐ under random_list, another country's tag, or effect_tooltip it is not this country's own", [8, 9, 10].every((i) => by.get(i) && by.get(i).own === false), [8, 9, 10].map((i) => by.get(i)));
  rec("⭐⭐⭐ under hidden_effect it IS this country's own (review E4: the same scope, run unseen)", !!by.get(14) && by.get(14).own === true && !by.get(14).trigger, by.get(14));
  rec("⭐ a target that is not a number has no id", r.some((x) => x.id === null), r.map((x) => x.id));
  rec("⭐ a block left open at the end of the file is still read", !!by.get(13) && by.get(13).own === true && T.slice(by.get(13).idStart, by.get(13).idEnd) === "13", by.get(13));
  rec("…and the state scopes the same walk reads are unchanged by it", md.findStateScopeRefs("1 = { set_capital = { state = 2 } }").map((s) => s.id).join() === "1");
}
{
  // ⛔ #a-set-capital-runs-by-dlc — `when` is EVERY condition around it, whichever way the else is written (review E2/R5)
  const T = [
    'if = { limit = { has_dlc = "S" } set_capital = { state = 21 } }',
    'else = { set_capital = { state = 22 } }',                                                   // written AFTER the if: its else
    'if = { limit = { has_dlc = "A" } set_capital = { state = 23 } }',
    'else_if = { limit = { has_dlc = "B" } set_capital = { state = 24 } }',
    'else = { set_capital = { state = 25 } }',                                                   // after both: neither held
    'if = { limit = { has_dlc = "C" } else_if = { limit = { has_dlc = "D" } set_capital = { state = 26 } } else = { set_capital = { state = 27 } } }',
    'if = { limit = { tag = PRC } set_capital = { state = 28 } }',                              // a limit Nova cannot judge
    'if = { set_capital = { state = 29 } else = { set_capital = { state = 30 } } }',              // no limit: always — and its else never
    'if = { limit = { has_dlc = "Other" } set_capital = { state = 11 } else = { set_capital = { state = 12 } } }',
  ].join("\n");
  const r = read(T), c = (id) => conds(r.find((x) => x.id === id));
  rec("THE CONTROL: all twelve are read, every one the country's own", r.length === 12 && r.every((x) => x.own && !x.trigger), r.map((x) => x.id));
  rec("⭐⭐ the sibling form: the if's own with its DLC, the else written after it without", c(21) === "dlc:S=true" && c(22) === "dlc:S=false", [c(21), c(22)]);
  rec("⭐⭐ an else_if after an if runs only when the if's limit fails AND its own holds; the else after both, when neither held",
    c(23) === "dlc:A=true" && c(24) === "dlc:A=false & dlc:B=true" && c(25) === "dlc:A=false & dlc:B=false", [c(23), c(24), c(25)]);
  rec("⭐⭐⭐ the nested idiom: an else_if and an else INSIDE an if are its alternatives — the else only when every limit before it failed",
    c(26) === "dlc:C=false & dlc:D=true" && c(27) === "dlc:C=false & dlc:D=false" && c(11) === "dlc:Other=true" && c(12) === "dlc:Other=false", [c(26), c(27), c(11), c(12)]);
  const odd = r.find((x) => x.id === 28);
  rec("⭐ a limit that is not one has_dlc is a condition of its own, named by its if's line", !!odd && (odd.when || []).length === 1 && odd.when[0].key === "limit@7" && odd.when[0].has === true, odd);
  rec("⭐ an if with no limit always runs, and its else never does", c(29) === "" && c(30) === "@always=false", [c(29), c(30)]);
}
// the base game's own files, counted INDEPENDENTLY of the reader: every `set_capital` key outside a comment, and its `state = N`
{
  const files = { PRC: path.join(GAME, "history", "countries", "PRC - ComChina.txt"), MEN: path.join(GAME, "history", "countries", "MEN - Mengkukuo.txt") };
  if (!fs.existsSync(files.PRC) || !fs.existsSync(files.MEN)) skip("the base game is not installed here — its PRC and MEN were not read");
  else {
    for (const [tag, f] of Object.entries(files)) {
      const t = fs.readFileSync(f, "utf8"), noComments = t.replace(/#[^\r\n]*/g, "");
      const ids = [...noComments.matchAll(/\bset_capital\s*=\s*\{\s*state\s*=\s*(\d+)/g)].map((m) => +m[1]);
      const dateAt = noComments.search(/\b\d{4}\.\d{1,2}\.\d{1,2}\s*=\s*\{/);
      const undated = [...noComments.matchAll(/\bset_capital\s*=\s*\{\s*state\s*=\s*(\d+)/g)].filter((m) => dateAt < 0 || m.index < dateAt).map((m) => +m[1]);
      const r = read(t);
      rec(`⭐⭐ vanilla's ${tag}: the reader finds the ${ids.length} set_capital line(s) a plain count finds, with their ids, and the ${undated.length} at the start`,
        t.charCodeAt(0) === 0xfeff && r.length === ids.length && r.map((x) => x.id).join() === ids.join() && r.filter((x) => !x.date).map((x) => x.id).join() === undated.join()
        && r.every((x) => x.own && !x.trigger), { ids, undated, read: r.map((x) => `${x.id}@${x.date || "start"}`) });
      if (tag !== "PRC") continue;
      // the DLC its first `if` asks for, read off the text: the first undated set_capital runs WITH it, the second WITHOUT
      const dlc = (/has_dlc\s*=\s*"([^"]+)"/.exec(noComments) || [])[1];
      const start = r.filter((x) => !x.date);
      rec(`⭐⭐⭐ vanilla's PRC: ${undated[0]} runs with "${dlc}", ${undated[1]} without it — never both, never neither`,
        !!dlc && start.length === 2 && conds(start[0]) === `dlc:${dlc}=true` && conds(start[1]) === `dlc:${dlc}=false`, start.map(conds));
    }
  }
}
// ⛔ #a-set-capital-at-the-start-date — A DATED BLOCK ON OR BEFORE THE START DATE IS THE START (review D1). HOI4 runs a country's history
// up to the bookmark a game starts on: the undated part, then every dated block on or before that date. The start Nova judges is the
// EARLIEST bookmark the mod loads, the one at which the fewest blocks have run.
{
  const at = typeof md.setCapitalAtStart === "function" ? md.setCapitalAtStart : () => null;
  rec("⭐⭐⭐ (D1) a set_capital's block runs at a start on or after its DAY: undated always, the start's own day whatever the hour, an earlier day",
    at("", "1936.1.1.12") === true && at("1936.1.1", "1936.1.1.12") === true && at("1936.1.1.12", "1936.1.1.12") === true && at("1935.12.31", "1936.1.1.12") === true
    && at("2000.1.1", "2000.1.1.12") === true && at("1900.1.1", "1900.1.1.1") === true, ["", "1936.1.1", "1936.1.1.12", "1935.12.31"].map((d) => at(d, "1936.1.1.12")));
  rec("⭐⭐ …and a later day's never: 1936.1.2 and 1939.1.1 at a 1936 start, RoN's 1919.1.1 at its 1900 one; nor what is not a date",
    at("1936.1.2", "1936.1.1.12") === false && at("1939.1.1", "1936.1.1.12") === false && at("1919.1.1", "1900.1.1.1") === false && at("start", "1936.1.1.12") === false,
    ["1936.1.2", "1939.1.1", "start"].map((d) => at(d, "1936.1.1.12")));
  const sd = (o) => (typeof md.modStartDate === "function" ? md.modStartDate(o) : null);
  const bm = (dates) => "bookmarks = {\r\n" + dates.map((d, i) => `\tbookmark = {\r\n\t\tname = "BM_${i}"\r\n\t\tdate = ${d}\r\n\t\t"AAA" = { history = "AAA_DESC" ideology = neutrality }\r\n\t}\r\n`).join("") + "}\r\n";
  const below = path.join(SANDBOX, "bm-below"), bmMod = (l) => path.join(SANDBOX, "bm-" + l);
  mk(path.join(below, "common", "bookmarks", "the_gathering_storm.txt"), bm(["1936.1.1.12"]));
  mk(path.join(below, "common", "bookmarks", "blitzkrieg.txt"), bm(["1939.8.14.12"]));
  for (const l of ["empty", "same", "replace", "nested"]) mk(path.join(bmMod(l), "descriptor.mod"), l === "replace" ? 'name="bm"\nreplace_path="common/bookmarks"\n' : 'name="bm"\n');
  mk(path.join(bmMod("same"), "common", "bookmarks", "the_gathering_storm.txt"), bm(["2000.1.1.12"]));          // the same name: replaces the one below
  mk(path.join(bmMod("replace"), "common", "bookmarks", "millennium.txt"), bm(["2017.1.1.12", "2000.1.1.12"]));
  // both decoys stand ABOVE the bookmark's own date and are earlier, so a reader taking the first `date =` it meets takes one of them
  mk(path.join(bmMod("nested"), "common", "bookmarks", "early.txt"), "bookmarks = {\r\n\tbookmark = {\r\n\t\tname = \"EARLY\"\r\n\t\t# date = 1700.1.1.1\r\n"
    + "\t\t\"AAA\" = { history = \"AAA_DESC\" ideology = neutrality date = 1800.1.1.1 }\r\n\t\tdate = 1900.1.1.1\r\n\t}\r\n}\r\n");
  fs.mkdirSync(path.join(SANDBOX, "bm-none"), { recursive: true });
  const got = Object.fromEntries(["empty", "same", "replace", "nested"].map((l) => [l, sd({ modRoot: bmMod(l), gameRoot: below })]));
  rec("⭐⭐⭐ (D1) modStartDate: the earliest bookmark the mod loads — the layer below's for an empty mod; with none loaded anywhere, HOI4's own 1936.1.1.12",
    got.empty === "1936.1.1.12" && sd({ modRoot: null, gameRoot: path.join(SANDBOX, "bm-none") }) === "1936.1.1.12", got);
  rec("⭐⭐ …a same-named file replaces the one below it wholesale, as HOI4's file system does: the 1936 bookmark is gone, 1939's is left", got.same === "1939.8.14.12", got);
  rec("⭐⭐ …replace_path hides every file below, and the earliest of the mod's own is taken", got.replace === "2000.1.1.12", got);
  rec("⭐ …and only a bookmark's own date counts: not one in a comment, nor one inside a block within it", got.nested === "1900.1.1.1", got);
  // (review F2c) an add-on learns its start from the mod it depends on: MD's add-ons start on MD's 2000.1.1.12, not the base game's 1936
  const bmDep = path.join(SANDBOX, "bm-dep");
  mk(path.join(bmDep, "descriptor.mod"), 'name="dep"\nreplace_path="common/bookmarks"\n');
  mk(path.join(bmDep, "common", "bookmarks", "millennium.txt"), bm(["2000.1.1.12"]));
  const onDep = sd({ modRoot: bmMod("empty"), gameRoot: below, dependencyRoots: [bmDep] });
  rec("⭐⭐⭐ (F2) …and an empty add-on over a dependency that replaces the bookmarks starts on the DEPENDENCY's earliest bookmark", onDep === "2000.1.1.12", onDep);
  // the shipping maps, measured on this machine (fix2/startdates.out): the base game 1936.1.1.12, MD 2000.1.1.12, RoN 1900.1.1.1, OWB 2275.1.1.12
  const WS = "D:/SteamLibrary/steamapps/workshop/content/394360/";
  const MEASURED = { vanilla: [null, "1936.1.1.12"], MD: [WS + "2777392649", "2000.1.1.12"], RoN: [WS + "2026448968", "1900.1.1.1"], OWB: [WS + "2265420196", "2275.1.1.12"] };
  for (const [k, [root, want]] of Object.entries(MEASURED)) {
    if (!fs.existsSync(path.join(GAME, "common", "bookmarks")) || (root && !fs.existsSync(path.join(root, "common", "bookmarks")))) { skip(`${k} is not installed here — its start date was not read`); continue; }
    const d = sd({ modRoot: root, gameRoot: GAME });
    rec(`⭐ ${k} starts on ${want}, its earliest bookmark`, d === want, d);
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n=== 2. Generate land: a PRC-shaped country takes the id its set_capital names, and a line naming it ===");
function bmp24(width, height, fn) {
  const rowSize = (width * 3 + 3) & ~3, imageSize = rowSize * height;
  const buf = Buffer.alloc(54 + imageSize);
  buf.write("BM", 0, "ascii"); buf.writeUInt32LE(54 + imageSize, 2); buf.writeUInt32LE(54, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18); buf.writeInt32LE(height, 22); buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(0, 30); buf.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < height; y++) { let off = 54 + (height - 1 - y) * rowSize; for (let x = 0; x < width; x++) { const [r, g, b] = fn(x, y); buf[off++] = b; buf[off++] = g; buf[off++] = r; } }
  return buf;
}
// The layer below: three countries side by side, two states each, and ocean. AAA has a line; CCC is PRC (no line, set_capital by DLC
// branch, a 1939 block); DDD is MEN (a line, and a set_capital in its 1939 block only).
const W = 24, H = 16, N = W * H;
const idAt = (x, y) => y * W + x + 1;
const colourOf = (id) => [id & 255, (id >> 8) & 255, 107];
const box = (x0, x1, y0, y1) => { const out = []; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push(idAt(x, y)); return out; };
const STATES = {
  A_town: { tag: "AAA", cat: "town", provs: box(0, 3, 0, 7), vp: 30 },
  A_rural: { tag: "AAA", cat: "rural", provs: box(0, 3, 8, 15), vp: 0 },
  C_town: { tag: "CCC", cat: "town", provs: box(4, 7, 0, 7), vp: 20 },
  C_rural: { tag: "CCC", cat: "rural", provs: box(4, 7, 8, 15), vp: 0 },
  D_town: { tag: "DDD", cat: "town", provs: box(8, 11, 0, 7), vp: 10 },
  D_rural: { tag: "DDD", cat: "rural", provs: box(8, 11, 8, 15), vp: 0 },
};
const OCEAN = [box(12, 17, 0, 7), box(18, 23, 0, 7), box(12, 17, 8, 15), box(18, 23, 8, 15)];
const landBelow = new Map();
for (const [k, s] of Object.entries(STATES)) for (const p of s.provs) landBelow.set(p, k);
const REGION_OF = new Map();
{ let r = 1; for (const s of Object.values(STATES)) { for (const p of s.provs) REGION_OF.set(p, r); r++; } for (const o of OCEAN) { for (const p of o) REGION_OF.set(p, r); r++; } }
const keyOf = (provs) => provs.slice().sort((a, b) => a - b).join(",");
const DLC = "Fixture Pack";
// CCC's file, PRC's shape: `start` the DLC branch's id, `main` the other branch's and both 1939 ones'. Comments are content.
const cccFile = (start, main) => "\ufeff# CCC's history: its capital is set by the effect, never a line\r\n"
  + "if = {\r\n\tlimit = {\r\n\t\thas_dlc = \"" + DLC + "\"\r\n\t}\r\n\tset_capital = { # the DLC's start\r\n\t\tstate = " + start + "\r\n\t}\r\n"
  + "\telse_if = {\r\n\t\tlimit = {\r\n\t\t\tNOT = { has_dlc = \"" + DLC + "\" }\r\n\t\t}\r\n\t\tset_capital = {\r\n\t\t\tstate = " + main + "\r\n\t\t}\r\n\t}\r\n}\r\n"
  + "oob = \"CCC_1936\"\r\n"
  + "1939.1.1 = {\r\n\tif = {\r\n\t\tlimit = { has_dlc = \"" + DLC + "\" }\r\n\t\tset_capital = { state = " + main + " }\r\n"
  + "\t\telse_if = {\r\n\t\t\tlimit = { NOT = { has_dlc = \"" + DLC + "\" } }\r\n\t\t\tset_capital = { state = " + main + " }\r\n\t\t}\r\n\t}\r\n}\r\n";
function makeBase(label, { ids, aaa, ccc, ddd }) {
  const base = path.join(SANDBOX, "base-" + label);
  mk(path.join(base, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0"].concat(Array.from({ length: N }, (_, i) => {
    const id = i + 1, [r, g, b] = colourOf(id);
    return landBelow.has(id) ? `${id};${r};${g};${b};land;false;plains;1` : `${id};${r};${g};${b};sea;false;ocean;0`;
  })).join("\r\n") + "\r\n");
  mk(path.join(base, "map", "provinces.bmp"), bmp24(W, H, (x, y) => colourOf(idAt(x, y))));
  const byR = new Map();
  for (const [p, r] of REGION_OF) { if (!byR.has(r)) byR.set(r, []); byR.get(r).push(p); }
  for (const [r, p] of byR) mk(path.join(base, "map", "strategicregions", `r${r}.txt`), `strategic_region={\n\tid=${r}\n\tname="REGION_${r}"\n\tprovinces={ ${p.join(" ")} }\n\tweather={}\n}\n`);
  mk(path.join(base, "common", "state_category", "00.txt"), "state_categories = {\n\ttown = { local_building_slots = 4 }\n\trural = { local_building_slots = 2 }\n}\n");
  for (const [k, s] of Object.entries(STATES)) {
    const id = ids[k];
    mk(path.join(base, "history", "states", `${id}-${k}.txt`), `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = ${1000 * s.provs.length}\n\tstate_category = ${s.cat}\n\tprovinces = { ${s.provs.join(" ")} }\n\thistory = {\n\t\towner = ${s.tag}\n\t\tadd_core_of = ${s.tag}\n${s.vp ? `\t\tvictory_points = { ${s.provs[0]} ${s.vp} }\n` : ""}\t}\n}\n`);
  }
  mk(path.join(base, "history", "countries", "AAA - Land of AAA.txt"), aaa);
  mk(path.join(base, "history", "countries", "CCC - Land of CCC.txt"), ccc);
  mk(path.join(base, "history", "countries", "DDD - Land of DDD.txt"), ddd);
  return base;
}
function makeMod(label) {
  const mod = path.join(SANDBOX, "mod-" + label);
  mk(path.join(mod, "descriptor.mod"), 'name="SetCapital"\nreplace_path="history/states"\n');
  mk(path.join(mod, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0"].concat(Array.from({ length: N }, (_, i) => {
    const id = i + 1, [r, g, b] = colourOf(id);
    return `${id};${r};${g};${b};sea;false;ocean;0`;
  })).join("\r\n") + "\r\n");
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(W, H, (x, y) => colourOf(idAt(x, y))));
  return mod;
}
function statesOnDisk(mod) {
  const dir = path.join(mod, "history", "states");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".txt")).map((f) => {
    const t = fs.readFileSync(path.join(dir, f), "utf8");
    return { id: +(/\bid\s*=\s*(\d+)/.exec(t) || [])[1], owner: ((/owner\s*=\s*([A-Za-z0-9_]+)/.exec(t) || [])[1]) || "",
      provinces: ((((/provinces\s*=\s*\{([^}]*)\}/.exec(t) || [])[1]) || "").match(/\d+/g) || []).map(Number) };
  });
}
const countryFilesIn = (mod) => { const d = path.join(mod, "history", "countries"); return fs.existsSync(d) ? fs.readdirSync(d).sort() : []; };
const countryText = (mod, tag) => { const f = path.join(mod, "history", "countries", `${tag} - Land of ${tag}.txt`); return fs.existsSync(f) ? fs.readFileSync(f, "utf8") : ""; };
const eligibleOf = (mod) => fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8").split(/\r?\n/)
  .filter((l) => /;sea;/.test(l) && REGION_OF.has(+l.split(";")[0])).length;
const generate = (mod, base) => md.generateLand({ modRoot: mod, gameRoot: base, dependencyRoots: [], count: eligibleOf(mod), seed: 2, provincesPerState: 64 });
const holding = (states, k) => states.find((s) => keyOf(s.provinces) === keyOf(STATES[k].provs));
const pageNote = (() => {
  const { maskJsLiterals, jsBodyAt } = require("./testlib-strip-comments.js");
  const PAGE = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8"), MASKED = maskJsLiterals(PAGE);
  const at = MASKED.indexOf("function generatedCountriesNote("), body = at < 0 ? null : jsBodyAt(MASKED, at);
  return body ? require("vm").runInNewContext("(" + PAGE.slice(at, body[1] + 1) + ")") : () => "";
})();
const capitalRows = (mod, base) => { md.clearMapLayerCache(); return (md.validateMapModel(md.buildMapModel({ modRoot: mod, gameRoot: base, dependencyRoots: [], cacheStableLayers: false })) || []).filter((p) => /capital/.test(p.rule)); };

// The CONTROL world: nothing pinned anywhere (no line, no set_capital), so each state below rises under the id it takes on its own.
const noLine = (t) => `\ufeffoob = "${t}_1936"\r\n`;
const ctlIds = { A_town: 1, A_rural: 2, C_town: 3, C_rural: 4, D_town: 5, D_rural: 6 };
const ctlMod = makeMod("ctl");
const ctl = generate(ctlMod, makeBase("ctl", { ids: ctlIds, aaa: noLine("AAA"), ccc: noLine("CCC"), ddd: noLine("DDD") }));
const nat = Object.fromEntries(Object.keys(STATES).map((k) => [k, (holding(statesOnDisk(ctlMod), k) || {}).id]));
rec("the control world: every state below rose as exactly one state", ctl.changed === true && Object.values(nat).every((v) => Number.isInteger(v)) && new Set(Object.values(nat)).size === 6, nat);
// ⭐ …and a country with a history file but no capital at all is given a line now, not "left as shipped" (it would start with none)
const ctlCaps = (ctl.countries || {}).capitals || {};
rec("⭐⭐ a country with a history file and no capital anywhere is given its capital group's id as a line", ["AAA", "CCC", "DDD"].every((t) => (ctlCaps.withNoCapital || []).includes(t) && (ctlCaps.written || []).some((w) => w.tag === t))
  && (ctlCaps.leftAsShipped || []).length === 0, ctlCaps);

// The real world. CCC's set_capital lines name, three times, the id C_rural takes on its own (so pinning it SWAPS C_town's state into
// it), and once — the DLC branch — the id AAA's A_rural takes, which stays AAA's. AAA's and DDD's lines name their towns' own ids.
// DDD's 1939 set_capital names C_town's own id, which CCC's swap hands to C_rural: CCC's state, in a world whose states carry no dated
// owner — so at 1939 DDD would start on CCC's land (vanilla MEN's 611, SOV's on the owner's flow: review E3).
const MAIN = nat.C_rural, START = nat.A_rural;
const used = new Set([nat.A_town, nat.D_town, MAIN, START]);
const rest = [1, 2, 3, 4, 5, 6].filter((i) => !used.has(i));
// below, CCC owns both ids its set_capital names, exactly like vanilla's PRC (622 and 1032 both PRC's)
const IDS = { A_town: nat.A_town, D_town: nat.D_town, C_town: MAIN, C_rural: START, A_rural: rest[0], D_rural: rest[1] };
const CCC = cccFile(START, MAIN);
// \u26a0\ufe0f MOVED with #a-generated-state-keeps-its-countrys-id: DDD's 1939 set_capital named nat.C_town \u2014 the id C_town took in CUT order,
// which CCC's swap handed to C_rural. Generate land now gives every state the id its land held below, so that id is A_rural's or
// D_rural's here. The target is derived from the state below's id instead: C_rural's (START), CCC's below and kept CCC's by the
// renumbering \u2014 vanilla MEN's 1939 set_capital to 611, a Chinese state below that stays Chinese. The case whose base owner does NOT
// keep the id is section 2a below.
const MEN_TARGET = IDS.C_rural;
const DDD = `\ufeffcapital = ${nat.D_town} # Dee\r\n1939.1.1 = {\r\n\tset_capital = {\r\n\t\tstate = ${MEN_TARGET}\r\n\t\tremember_old_capital = yes\r\n\t}\r\n}\r\n`;
const mainBase = makeBase("main", { ids: IDS, aaa: `\ufeffcapital = ${nat.A_town}\r\noob = "AAA_1936"\r\n`, ccc: CCC, ddd: DDD });
const mainMod = makeMod("main");
const main = generate(mainMod, mainBase);
const st = statesOnDisk(mainMod);
const caps = (main.countries || {}).capitals || {};
rec("generate land ran", main.changed === true && st.length === statesOnDisk(ctlMod).length, { error: main.error, countries: main.countries && main.countries.error, states: st.length });
const capState = st.find((s) => s.id === MAIN);
rec("⭐⭐⭐ (a) the PIN: CCC's most important state (its town) took the id the most of its set_capital lines name",
  !!capState && capState.owner === "CCC" && keyOf(capState.provinces) === keyOf(STATES.C_town.provs), { MAIN, capState });
const cccText = countryText(mainMod, "CCC");
const lineIds = [...cccText.replace(/#[^\r\n]*/g, "").matchAll(/(?:^|[^A-Za-z0-9_])capital\s*=\s*(\d+)/g)].map((m) => +m[1]);
rec("⭐⭐⭐ (b) the LINE: CCC's file in the mod has one capital line, naming that state",
  lineIds.length === 1 && lineIds[0] === MAIN && (caps.written || []).some((w) => w.tag === "CCC" && w.state === MAIN), { lineIds, written: caps.written });
const refsAfter = read(cccText);
rec("⭐⭐⭐ (c) the START's set_capital that named AAA's state is pointed at CCC's capital, the other one already named it",
  refsAfter.filter((x) => !x.date).length === 2 && refsAfter.filter((x) => !x.date).every((x) => x.id === MAIN)
  && (caps.setCapitalPointed || []).some((p) => p.tag === "CCC" && p.to === MAIN && p.from.join() === String(START) && !p.dated), { refs: refsAfter.map((x) => `${x.id}@${x.date || "start"}`), pointed: caps.setCapitalPointed });
rec("⭐⭐ …and the 1939 lines, which named it already, are untouched — so at 1939 too CCC's capital is its own",
  refsAfter.filter((x) => x.date === "1939.1.1").map((x) => x.id).join() === `${MAIN},${MAIN}` && refsAfter.filter((x) => x.date).every((x) => (st.find((s) => s.id === x.id) || {}).owner === "CCC"), refsAfter);
// splice, never rebuild: the file is the base game's byte for byte apart from the line and the one number
const expected = "\ufeff" + `capital = ${MAIN}\r\n` + CCC.slice(1).replace(`state = ${START}\r\n`, () => `state = ${MAIN}\r\n`);
rec("⭐⭐ (d) …and nothing else in it moved: BOM first, CRLF, every comment, the oob, the dated block", cccText === expected,
  { got: JSON.stringify(cccText.slice(0, 160)), want: JSON.stringify(expected.slice(0, 160)) });
// ⛔ review E3 — the MEN shape: its line holds, but its 1939 set_capital named a state THIS world gave CCC.
// ⛔ review D3 — …and pointing it copied the base game's whole DDD file into the mod for one digit of a later bookmark's capital, which
// is not fatal (the game stores the foreign id and hands DDD a state of its own once a 1939 game is set up). Left now, and said.
rec("THE CONTROL: in this world DDD's 1939 set_capital names CCC's state — the one CCC held below under that id — and its line DDD's own town",
  (st.find((s) => s.id === MEN_TARGET) || {}).owner === "CCC" && keyOf((st.find((s) => s.id === MEN_TARGET) || {}).provinces || []) === keyOf(STATES.C_rural.provs)
  && (st.find((s) => s.id === nat.D_town) || {}).owner === "DDD" && keyOf((st.find((s) => s.id === nat.D_town) || {}).provinces || []) === keyOf(STATES.D_town.provs), { MEN_TARGET, D_town: nat.D_town });
rec("⭐⭐⭐ (e) the MEN shape (review D3): its DATED set_capital naming another country's generated state does NOT copy its history file into the mod",
  countryText(mainMod, "DDD") === "" && !(caps.setCapitalPointed || []).some((p) => p.tag === "DDD"), { pointed: caps.setCapitalPointed, files: countryFilesIn(mainMod) });
rec("⭐⭐⭐ …and it is reported: DDD, the block's date, the state it names and whose that is, and the capital it has",
  JSON.stringify(caps.setCapitalLeft) === JSON.stringify([{ tag: "DDD", date: "1939.1.1", file: "DDD - Land of DDD.txt", capital: nat.D_town, names: [{ id: MEN_TARGET, owner: "CCC" }] }]), caps.setCapitalLeft);
rec("…and only CCC's file was written (AAA, a line naming its own state and nothing else, is left alone; DDD as above)", JSON.stringify(countryFilesIn(mainMod)) === JSON.stringify(["CCC - Land of CCC.txt"]), countryFilesIn(mainMod));
rec("⭐⭐ (f) the report: CCC's capital came from set_capital, it was pinned, nothing was left as shipped",
  JSON.stringify(caps.fromSetCapital) === JSON.stringify(["CCC"]) && (caps.fromSetCapitalNotPinned || []).length === 0 && caps.pinned === 3 && caps.chosen === 3 && (caps.leftAsShipped || []).length === 0 && !(caps.failed || []).length, caps);
const after = capitalRows(mainMod, mainBase);
rec("⭐⭐ (g) …and Map Errors has no capital row for the world it made", !after.length, after.map((p) => `${p.rule}:${JSON.stringify(p.tags || p.items)}`));
{
  const said = pageNote(main);
  rec("⭐⭐ (h) the page names the country whose capital came from set_capital, says it took the id, and each line it pointed",
    /CCC/.test(said) && /took the id/.test(said) && said.includes(`CCC: ${START} → ${MAIN}`) && !said.includes("DDD: "), said);
  rec("⭐⭐⭐ (h, review D3) …and the dated line it left: whose, from when, what it names, why it was left, and what the game does with it",
    said.includes(`DDD from 1939.1.1 (${MEN_TARGET}, CCC's)`) && /rather than copy a whole country history file into your mod/.test(said) && /they dont own it/.test(said), said);
  rec("CONTROL: a world with none of it says none of it", !/set_capital/.test(pageNote({ countries: { kept: [], stillGone: [], capitals: { chosen: 1, written: [] } } })));
}

console.log("\n=== 2a. …and a dated set_capital whose target's country below did NOT keep that id ===");
// ⛔ #a-generated-state-keeps-its-countrys-id — the renumbering keeps an id with its country below where it can, and a SHORT country
// cannot: here CCC holds a third state below, C_far, on land that cannot rise (its provinces, and the ocean's, are in no strategic
// region), so CCC has two states for three ids, and C_far's id goes to land another country holds in this world. AAA's 1939
// set_capital names that id. What Generate land does with it is asked of the world it wrote, never of the owner below: it is left and
// said as naming the id's owner HERE.
{
  const FAR = box(18, 23, 8, 15);   // the fourth ocean box, made CCC's land below
  const SHORT_ID = 3;
  const ids = { A_town: 1, A_rural: 2, C_town: 4, C_rural: 5, D_town: 6, D_rural: 7 };
  const aaaShort = `﻿capital = ${ids.A_town}\r\n1939.1.1 = {\r\n\tset_capital = { state = ${SHORT_ID} }\r\n}\r\n`;
  const base = makeBase("short", { ids, aaa: aaaShort, ccc: `﻿capital = ${ids.C_town}\r\n`, ddd: `﻿capital = ${ids.D_town}\r\n` });
  const farSet = new Set(FAR), oceanSet = new Set(OCEAN.flat());
  const defFile = path.join(base, "map", "definition.csv");
  mk(defFile, fs.readFileSync(defFile, "utf8").split("\r\n").map((l) => { const c = l.split(";"); return farSet.has(+c[0]) ? `${c[0]};${c[1]};${c[2]};${c[3]};land;false;plains;1` : l; }).join("\r\n"));
  // the fixture's own files, in its temp sandbox: no ocean region, so only the land below rises and no new land is dealt to CCC
  for (const r of new Set(OCEAN.flat().map((p) => REGION_OF.get(p)))) fs.unlinkSync(path.join(base, "map", "strategicregions", `r${r}.txt`));
  mk(path.join(base, "history", "states", `${SHORT_ID}-C_far.txt`), `state = {\n\tid = ${SHORT_ID}\n\tname = "STATE_${SHORT_ID}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${FAR.join(" ")} }\n\thistory = {\n\t\towner = CCC\n\t\tadd_core_of = CCC\n\t}\n}\n`);
  const mod = makeMod("short");
  const r2 = md.generateLand({ modRoot: mod, gameRoot: base, dependencyRoots: [], count: eligibleOf(mod) - oceanSet.size, seed: 2, provincesPerState: 64 });
  const s2 = statesOnDisk(mod), c2 = (r2.countries || {}).capitals || {};
  const holder = s2.find((s) => s.id === SHORT_ID) || {};
  const idsHere = Object.fromEntries(Object.keys(STATES).map((k) => [k, (holding(s2, k) || {}).id]));
  rec("(the fixture: CCC is short — C_far's land did not rise, every state below whose id is in range kept it, and C_far's id went to land that is not CCC's)",
    r2.changed === true && s2.length === Object.keys(STATES).length && Object.keys(STATES).every((k) => ids[k] > s2.length || idsHere[k] === ids[k])
    && s2.every((s) => !s.provinces.some((p) => farSet.has(p) || oceanSet.has(p))) && !!holder.owner && holder.owner !== "CCC", { error: r2.error, holder, idsHere });
  const leftRows = (c2.setCapitalLeft || []).filter((l) => l.tag === "AAA");
  rec(`⭐⭐⭐ AAA's 1939 set_capital is left and said as naming ${holder.owner}'s state — its owner in THIS world, not CCC, its owner below — and nothing is copied in`,
    JSON.stringify(leftRows.map((l) => [l.date, l.names.map((n) => `${n.id}:${n.owner}`).join()])) === JSON.stringify([["1939.1.1", `${SHORT_ID}:${holder.owner}`]]) && countryFilesIn(mod).length === 0,
    { leftRows, files: countryFilesIn(mod) });
  const said = pageNote(r2);
  rec("…and the page says whose it is here", said.includes(`AAA from 1939.1.1 (${SHORT_ID}, ${holder.owner}'s)`) && !said.includes(`${SHORT_ID}, CCC's`), said);
}

console.log("\n=== 2b. Generate land, the odd shapes: an id it cannot pin, a branch naming its own other state, a set_capital below a line ===");
// Every state below has the id it takes on its own, so nothing moves but what the shapes move.
//   AAA: a line naming its town, and BELOW it a set_capital naming DDD's rural state — the effect runs after the line (review E4/R1) —
//        and a 1939 one naming DDD's town: its file is written for the start's anyway, so that one is pointed in it too (review D3).
//   CCC: PRC's shape, its DLC branch naming its OWN rural state (review R4), every other line naming 41 — an id this 6-state world
//        does not reach, so nothing can be pinned (review R3).
//   DDD: a line naming its town, and a 1939 set_capital naming CCC's town — in a file nothing else writes, so it is left (review D3).
const AAA_ODD = `\ufeffcapital = ${nat.A_town}\r\nset_capital = { state = ${nat.D_rural} }\r\n1939.1.1 = {\r\n\tset_capital = { state = ${nat.D_town} }\r\n}\r\n`;
{
  const base = makeBase("odd", { ids: nat, aaa: AAA_ODD, ccc: cccFile(nat.C_rural, 41), ddd: `\ufeffcapital = ${nat.D_town}\r\n1939.1.1 = { set_capital = { state = ${nat.C_town} } }\r\n` });
  const mod = makeMod("odd");
  const res = generate(mod, base), c = (res.countries || {}).capitals || {}, s2 = statesOnDisk(mod);
  rec("generate land ran, and every state kept the id it rose with", res.changed === true && Object.keys(STATES).every((k) => (holding(s2, k) || {}).id === nat[k]), { error: res.error, c });
  rec("⭐⭐⭐ (R3) an id the world does not reach is NOT reported as pinned: fromSetCapital is empty, and the reason is given",
    JSON.stringify(c.fromSetCapital) === "[]" && JSON.stringify(c.fromSetCapitalNotPinned) === JSON.stringify([{ tag: "CCC", id: 41, why: "range" }]), c);
  const ct = countryText(mod, "CCC"), cr = read(ct);
  const cLine = [...ct.replace(/#[^\r\n]*/g, "").matchAll(/(?:^|[^A-Za-z0-9_])capital\s*=\s*(\d+)/g)].map((m) => +m[1]);
  rec("…CCC's line names its most important state, its town", cLine.join() === String(nat.C_town) && (s2.find((x) => x.id === nat.C_town) || {}).owner === "CCC", cLine);
  rec("⭐⭐⭐ (R4) BOTH start set_capital lines now name it — the DLC branch that named CCC's OTHER own state too, not only the missing 41",
    cr.filter((x) => !x.date).map((x) => x.id).join() === `${nat.C_town},${nat.C_town}`
    && (c.setCapitalPointed || []).some((p) => p.tag === "CCC" && p.to === nat.C_town && p.from.join() === `${nat.C_rural},41` && p.lines === 2 && !p.dated), { refs: cr.map((x) => `${x.id}@${x.date || "start"}`), pointed: c.setCapitalPointed });
  rec("⭐ …and the 1939 lines naming 41, a state this world does not have (the game writes nothing for them), are left", cr.filter((x) => x.date).map((x) => x.id).join() === "41,41", cr.map((x) => `${x.id}@${x.date || "start"}`));
  const at = countryText(mod, "AAA");
  rec("⭐⭐⭐ (E4) AAA's set_capital BELOW its line is pointed at the capital the line names; the line itself is untouched",
    at.startsWith(`\ufeffcapital = ${nat.A_town}\r\nset_capital = { state = ${nat.A_town} }\r\n`) && (c.setCapitalPointed || []).some((p) => p.tag === "AAA" && p.from[0] === nat.D_rural && p.to === nat.A_town), { at: JSON.stringify(at), pointed: c.setCapitalPointed });
  rec("⭐⭐⭐ (D3) …and its 1939 one, naming DDD's state, is pointed too: the file is written for the start's anyway",
    at === AAA_ODD.replace(`state = ${nat.D_rural} }`, () => `state = ${nat.A_town} }`).replace(`state = ${nat.D_town} }`, () => `state = ${nat.A_town} }`)
    && (c.setCapitalPointed || []).some((p) => p.tag === "AAA" && p.from.join() === `${nat.D_rural},${nat.D_town}` && p.lines === 2 && p.dated === 1), { at: JSON.stringify(at), pointed: c.setCapitalPointed });
  rec("THE CONTROL (D3): DDD — a line, and a 1939 set_capital naming CCC's state in a file nothing else writes — gets no file", JSON.stringify(countryFilesIn(mod)) === JSON.stringify(["AAA - Land of AAA.txt", "CCC - Land of CCC.txt"]), countryFilesIn(mod));
  rec("⭐⭐ (D3) …and that line is the one reported as left (CCC's 1939 lines name 41, no state of this world, and are not)",
    JSON.stringify((c.setCapitalLeft || []).map((l) => [l.tag, l.date, l.names.map((n) => `${n.id}:${n.owner}`).join()])) === JSON.stringify([["DDD", "1939.1.1", `${nat.C_town}:CCC`]]), c.setCapitalLeft);
  const rows = capitalRows(mod, base);
  rec("⭐⭐ Map Errors has no capital row for this world either", !rows.length, rows.map((p) => `${p.rule}:${JSON.stringify(p.tags || p.items)}`));
  const said = pageNote(res);
  rec("⭐⭐⭐ (R3) the page does not say CCC's capital took the id its lines name — it says why it could not, and what each line now names",
    !/took the id/.test(said) && said.includes("41 (an id this world does not reach)") && said.includes(`CCC: ${nat.C_rural}, 41 → ${nat.C_town}`) && said.includes(`AAA: ${nat.D_rural}, ${nat.D_town} → ${nat.A_town} (1 of them in a dated block)`), said);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n=== 3. the rules: no_capital_of_its_own and no_capital_at_all, judged on what the start ENDS with ===");
// A mod over a layer below whose history files are the base game's, as in the owner's flow: the mod ships the states.
const stateTxt = (id, owner, extra = "") => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = ${1000 * id}\n\tstate_category = rural\n\tprovinces = { ${id * 10} ${id * 10 + 1} }\n\thistory = {\n\t\towner = ${owner}\n${extra}\t}\n}\n`;
const BASE_COUNTRIES = {
  AAA: "\ufeffcapital = 1\r\n",
  CCC: cccFile(1, 2),
  DDD: "\ufeffcapital = 4\r\n1939.1.1 = { set_capital = { state = 1 } }\r\n",
  EEE: "\ufeff# no capital here\r\noob = \"EEE_1936\"\r\n",
};
function world(label, owners, countries = {}, extra = {}) {
  const base = path.join(SANDBOX, "rbase-" + label), mod = path.join(SANDBOX, "rmod-" + label);
  for (const [tag, text] of Object.entries({ ...BASE_COUNTRIES, ...countries })) mk(path.join(base, "history", "countries", `${tag} - Land of ${tag}.txt`), text);
  mk(path.join(mod, "descriptor.mod"), 'name="Rule"\nreplace_path="history/states"\n');
  for (const [id, owner] of Object.entries(owners)) mk(path.join(mod, "history", "states", `${id}-S.txt`), stateTxt(+id, owner, extra[id] || ""));
  return { base, mod };
}
const rowsOf = (w) => { md.clearMapLayerCache(); return md.validateMapModel(md.buildMapModel({ modRoot: w.mod, gameRoot: w.base, dependencyRoots: [], cacheStableLayers: false })) || []; };
const tagsOf = (rows, rule) => { const p = rows.find((x) => x.rule === rule); return p ? (p.tags || []).slice().sort() : []; };
//   CCC owns state 3; its start's set_capital names 1 (with the DLC) and 2 (without), both AAA's: the TEST 34 shape.
//   EEE owns 5 and its file names no capital at all.  FFF owns 6 and no history file loads for it.  AAA and DDD have lines.
const t34 = world("t34", { 1: "AAA", 2: "AAA", 3: "CCC", 4: "DDD", 5: "EEE", 6: "FFF" });
const r34 = rowsOf(t34), row = r34.find((p) => p.rule === RULE), noneRow = r34.find((p) => p.rule === NONE);
rec("⭐⭐⭐ the TEST 34 shape is reported: CCC owns land, and with the DLC or without it the start ends on AAA's state",
  !!row && JSON.stringify(row.tags) === JSON.stringify(["CCC"]) && JSON.stringify((row.items[0].runs || []).map((r) => [r.given[`dlc:${DLC}`], r.id, r.ownedBy]).sort()) === JSON.stringify([[false, 2, "AAA"], [true, 1, "AAA"]]), row && row.items);
rec("⭐⭐⭐ a country whose loading file names no capital at all is no_capital_at_all, not that row (review E1/R2)",
  !!noneRow && JSON.stringify(noneRow.tags) === JSON.stringify(["EEE"]) && noneRow.items[0].kind === "none" && (noneRow.items[0].sets || []).length === 0, noneRow && noneRow.items);
rec("⭐ a country no history file loads for is not these rules'; nor one with a line; nor the MEN shape", ![RULE, NONE].some((r) => tagsOf(r34, r).some((t) => ["FFF", "AAA", "DDD"].includes(t))), [tagsOf(r34, RULE), tagsOf(r34, NONE)]);
rec("⭐⭐ each counts itself, so the summary can size it", !!row && row.total === 1 && row.totalNoun === "countries" && row.severity === "error" && !!noneRow && noneRow.total === 1 && noneRow.severity === "error", [row && row.total, noneRow && noneRow.total]);
rec("⭐⭐⭐ no_capital_of_its_own is NOT fatal (the engine stores the foreign id; NV and RoN launch with countries on another's capital)", labels.isFatalRule(RULE) === false);
rec("⭐⭐⭐ no_capital_at_all IS fatal, with the very verdict capital_state_missing has — the same capital 0 (review E1/R2)",
  labels.isFatalRule(NONE) === true && labels.isFatalRule("capital_state_missing") === true && labels.fatalOutcome(NONE) === labels.fatalOutcome("capital_state_missing") && labels.fatalOutcome(NONE) === "untested", [labels.fatalOutcome(NONE), labels.fatalOutcome("capital_state_missing")]);
rec("⭐ both read as plain English and have a real fix hint", [RULE, NONE].every((r) => /capital/i.test(labels.mapRuleLabel(r)) && labels.mapRuleLabel(r) === labels.LABELS[r] && labels.mapRuleFixHint(r).length > 40), [RULE, NONE].map(labels.mapRuleLabel));
rec("⭐ the messages quote what the game logs and claim no crash", !!row && /they dont own it/.test(row.message) && !/crash/i.test(row.message) && row.message.includes(`the DLC "${DLC}"`)
  && !!noneRow && /NO capital defined/.test(noneRow.message) && !/crash/i.test(noneRow.message), [row && row.message, noneRow && noneRow.message]);
const baseShape = world("base", { 1: "CCC", 2: "CCC", 3: "CCC", 4: "DDD", 5: "AAA", 6: "AAA" });
rec("⭐⭐⭐ the BASE-GAME shape is not reported: CCC owns what its set_capital names (vanilla's PRC owns 622 and 1032)", !tagsOf(rowsOf(baseShape), RULE).includes("CCC"), tagsOf(rowsOf(baseShape), RULE));
// ⛔ #a-set-capital-runs-by-dlc — owning ONE branch's state is not enough: a player with the other DLC set starts on AAA's (review E2/R5)
{
  const ownsMain = rowsOf(world("ownsMain", { 1: "AAA", 2: "CCC", 3: "CCC", 4: "DDD", 5: "AAA", 6: "AAA" }));
  const ownsDlc = rowsOf(world("ownsDlc", { 1: "CCC", 2: "AAA", 3: "CCC", 4: "DDD", 5: "AAA", 6: "AAA" }));
  const rm = ownsMain.find((p) => p.rule === RULE), rd = ownsDlc.find((p) => p.rule === RULE);
  rec("⭐⭐⭐ CCC owning only the no-DLC branch's state is reported: WITH the DLC its start ends on AAA's state 1",
    !!rm && JSON.stringify(rm.tags) === JSON.stringify(["CCC"]) && JSON.stringify(rm.items[0].runs) === JSON.stringify([{ given: { [`dlc:${DLC}`]: true }, id: 1, ownedBy: "AAA" }]) && rm.message.includes(`with the DLC "${DLC}"`), rm && rm.items);
  rec("⭐⭐⭐ …and the mirror: owning only the DLC branch's state, WITHOUT the DLC it ends on AAA's state 2",
    !!rd && JSON.stringify(rd.items[0].runs) === JSON.stringify([{ given: { [`dlc:${DLC}`]: false }, id: 2, ownedBy: "AAA" }]) && rd.message.includes(`without the DLC "${DLC}"`), rd && rd.items);
}
// the other shapes the review found (E1, E4, R1), each beside its control
{
  const w = world("shapes", { 7: "GGG", 8: "HHH", 10: "III", 11: "JJJ", 12: "III", 13: "KKK", 14: "AAA", 15: "AAA", 16: "LLL", 1: "AAA" }, {
    GGG: "\ufeffcapital = 99\r\n",                                                       // a line naming a missing state: capital_state_missing's
    HHH: "\ufeffset_capital = { state = 99 }\r\n",                                       // the effect naming a missing state: it writes nothing
    III: "\ufeffhidden_effect = {\r\n\tset_capital = { state = 10 }\r\n}\r\n",          // hidden_effect naming its own state
    JJJ: "\ufeffhidden_effect = {\r\n\tset_capital = { state = 12 }\r\n}\r\n",          // …and another's
    KKK: "\ufeffcapital = 13\r\nset_capital = { state = 14 }\r\n",                      // its own line, and BELOW it another's state
    LLL: "\ufeffcapital = 15\r\nset_capital = { state = 15 }\r\n",                      // a foreign line, and the same state again
  });
  const rows = rowsOf(w);
  rec("THE CONTROL: GGG's line naming a missing state stays capital_state_missing's, and only its", JSON.stringify(tagsOf(rows, "capital_state_missing")) === JSON.stringify(["GGG"]) && ![RULE, NONE].some((r) => tagsOf(rows, r).includes("GGG")), rows.map((p) => p.rule + ":" + (p.tags || []).join("+")));
  rec("⭐⭐⭐ (E1) HHH, whose only set_capital names a state the map lacks, starts with NO capital: no_capital_at_all, fatal like GGG",
    JSON.stringify(tagsOf(rows, NONE)) === JSON.stringify(["HHH"]) && /names state 99, which this map does not have/.test((rows.find((p) => p.rule === NONE) || {}).message || ""), rows.find((p) => p.rule === NONE));
  rec("⭐⭐⭐ (E4) KKK, its own line overridden by a set_capital below it naming AAA's state, and JJJ, whose hidden_effect names III's, are reported",
    JSON.stringify(tagsOf(rows, RULE)) === JSON.stringify(["JJJ", "KKK"]), tagsOf(rows, RULE));
  rec("⭐⭐ (E4) III, whose hidden_effect names its own state, is not (it starts on it)", ![RULE, NONE].some((r) => tagsOf(rows, r).includes("III")), [tagsOf(rows, RULE), tagsOf(rows, NONE)]);
  const other = ((rows.find((p) => p.rule === "capital_state_owned_by_other") || {}).items || []).map((i) => i.tag);
  rec("⭐ LLL — a foreign line, and a set_capital naming that same state — is ONE problem, capital_state_owned_by_other's", JSON.stringify(other) === JSON.stringify(["LLL"]) && !tagsOf(rows, RULE).includes("LLL"),
    rows.filter((p) => /capital/.test(p.rule)).map((p) => p.rule + ":" + JSON.stringify(p.tags || (p.items || []).map((i) => i.tag))));
}
// ⛔ #a-limit-nova-cannot-judge-gets-the-benefit-of-the-doubt / #a-set-capital-at-the-start-date (review D1) — the shapes a modder writes to
// set a capital with set_capital alone, each the country's only one and no line: each starts the game on its own state, so none may be
// told "no capital at all" — and beside them the shapes that do start with none, and one wrong either way
{
  const ifLim = (lim, id) => `\ufeffif = {\r\n\tlimit = { ${lim} }\r\n\tset_capital = { state = ${id} }\r\n}\r\n`;
  const shapes = {
    OPA: ifLim("tag = OPA", 2),                                            // its own tag, in its own file: always holds
    ALW: ifLim("always = yes", 3),
    DTE: ifLim("date < 1937.1.1", 4),
    EXI: ifLim("NOT = { has_country_flag = never_set_flag }", 5),
    D36: "\ufeff1936.1.1 = {\r\n\tset_capital = { state = 6 }\r\n}\r\n",   // the start date's own block: run at the 1936.1.1.12 start
    DLX: ifLim(`has_dlc = "${DLC}"`, 7),                                   // a DLC the player may not own, and no else: none without it
    FLG: "\ufeffcapital = 8\r\n" + ifLim("has_country_flag = set_only_by_an_event", 1).slice(1),   // its line, and AAA's state if an event sets a flag
    OPF: ifLim("tag = OPF", 1),                                            // its only set_capital names AAA's state: wrong either way
    OMI: ifLim("tag = OMI", 99),                                           // …or a state the map lacks: no capital either way
    D39: "\ufeff1939.1.1 = {\r\n\tset_capital = { state = 11 }\r\n}\r\n",   // a later block: not run at a 1936 start
  };
  const w = world("doubt", { 1: "AAA", 2: "OPA", 3: "ALW", 4: "DTE", 5: "EXI", 6: "D36", 7: "DLX", 8: "FLG", 9: "OPF", 10: "OMI", 11: "D39" }, shapes);
  const rows = rowsOf(w), fatalTags = [].concat(...rows.filter((p) => labels.isFatalRule(p.rule)).map((p) => p.tags || []));
  const said = rows.filter((p) => /capital/.test(p.rule)).map((p) => `${p.rule}:${(p.tags || []).join("+")}`);
  rec("⭐⭐⭐ (D1) a set_capital under a limit that holds at the start — its own tag, always, the date, a flag never set — is no FATAL \"no capital at all\", nor any row",
    !["OPA", "ALW", "DTE", "EXI"].some((t) => fatalTags.includes(t) || tagsOf(rows, RULE).includes(t) || tagsOf(rows, NONE).includes(t)), said);
  rec("⭐⭐⭐ (D1) nor one in the start date's own block, 1936.1.1 = { … }, which HOI4 runs at the 1936.1.1.12 start", ![NONE, RULE].some((r) => tagsOf(rows, r).includes("D36")), said);
  rec("⭐⭐ (D1) the non-fatal rule gives the same benefit of the doubt: FLG's line holds unless an event sets the flag, so it is not reported", !tagsOf(rows, RULE).includes("FLG"), said);
  rec("THE CONTROL: a DLC is not a doubt — DLX, whose only set_capital runs with a DLC, starts with none without it and is still FATAL; so is D39, whose only one is in a 1939 block, at a 1936 start",
    JSON.stringify(tagsOf(rows, NONE)) === JSON.stringify(["D39", "DLX", "OMI"]) && fatalTags.includes("DLX") && fatalTags.includes("D39"), said);
  rec("⭐⭐ (D1) OMI, under a limit Nova cannot judge but naming a state the map lacks, has none whichever way the limit goes: still no_capital_at_all", tagsOf(rows, NONE).includes("OMI") && fatalTags.includes("OMI"), said);
  const opf = rows.find((p) => p.rule === RULE);
  rec("⭐⭐ (D1) OPF, whose only set_capital names AAA's state under a limit Nova cannot judge, is wrong either way — on AAA's state, or with none — so it IS reported, as the non-fatal row",
    JSON.stringify(tagsOf(rows, RULE)) === JSON.stringify(["OPF"]) && !fatalTags.includes("OPF") && !!opf && opf.items[0].kind === "foreign" && JSON.stringify(opf.items[0].either) === JSON.stringify(["limit@1"])
    && /whichever way the limit at line 1 goes/.test(opf.message), opf && { items: opf.items, message: opf.message.slice(0, 300) });
  // the same mod with a bookmark of its own, on 1939.1.1.12: D39's block is that start's
  mk(path.join(w.mod, "common", "bookmarks", "late.txt"), "bookmarks = {\r\n\tbookmark = {\r\n\t\tname = \"LATE\"\r\n\t\tdate = 1939.1.1.12\r\n\t}\r\n}\r\n");
  md.clearMapLayerCache();
  const lateModel = md.buildMapModel({ modRoot: w.mod, gameRoot: w.base, dependencyRoots: [], cacheStableLayers: false });
  const late = md.validateMapModel(lateModel) || [];
  rec("⭐⭐⭐ (D1) a mod whose own bookmark starts on 1939.1.1.12: D39's 1939.1.1 block IS its start, so D39 starts on its own state; the rest as before",
    lateModel.startDate === "1939.1.1.12" && JSON.stringify(tagsOf(late, NONE)) === JSON.stringify(["DLX", "OMI"]) && JSON.stringify(tagsOf(late, RULE)) === JSON.stringify(["OPF"]),
    { startDate: lateModel.startDate, none: tagsOf(late, NONE), own: tagsOf(late, RULE) });
}
// #inherited-problem-not-yours: the same world with every file below the mod — an empty add-on over it is told nothing
{
  const dep = path.join(SANDBOX, "rdep"), add = path.join(SANDBOX, "radd");
  fs.cpSync(t34.base, dep, { recursive: true });
  fs.cpSync(path.join(t34.mod, "history"), path.join(dep, "history"), { recursive: true });
  mk(path.join(add, "descriptor.mod"), 'name="Empty add-on"\n');
  fs.mkdirSync(path.join(SANDBOX, "nogame"), { recursive: true });
  md.clearMapLayerCache();
  const p = (md.validateMapModel(md.buildMapModel({ modRoot: add, gameRoot: path.join(SANDBOX, "nogame"), dependencyRoots: [dep], cacheStableLayers: false })) || []).filter((x) => x.rule === RULE || x.rule === NONE);
  rec("⭐⭐ #inherited-problem-not-yours: an empty add-on over that world ships neither file, and is told nothing", !p.length, p.map((x) => x.rule));
}
// the base game and every installed shipping map: the game loads them all, so neither rule may say anything on any
{
  const WS = "D:/SteamLibrary/steamapps/workshop/content/394360/";
  const MAPS = { vanilla: GAME, MD: WS + "2777392649", R56: WS + "820260968", OWB: WS + "2265420196", NV: WS + "1827273767", RoN: WS + "2026448968", MDC: WS + "3721160655", HoM: WS + "2624254320" };
  const present = Object.entries(MAPS).filter(([, p]) => fs.existsSync(path.join(p, "history", "countries")));
  if (present.length < Object.keys(MAPS).length) skip(`only ${present.length} of the ${Object.keys(MAPS).length} corpus maps are installed — the others DID NOT run`);
  for (const [key, root] of present) {
    md.clearMapLayerCache();
    const m = md.buildMapModel({ modRoot: root, gameRoot: GAME, dependencyRoots: [], cacheStableLayers: true });
    const p = (md.validateMapModel(m) || []).filter((x) => x.rule === RULE || x.rule === NONE);
    rec(`⭐⭐⭐ ${key}: a map the game loads gets no ${RULE} or ${NONE} row`, !p.length, p.map((x) => x.rule + ":" + (x.tags || []).join("+")));
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n=== 4. Auto-fix repairs exactly that ===");
{
  //   CCC, EEE: the TEST 34 shapes.  HHH: set_capital naming a missing state.  KKK: a set_capital below its own line naming AAA's.
  //   MMM: a start set_capital and a 1939 one naming 12, AAA's now — whose own file hands it to MMM in 1939 (a dated owner).
  //   LLL: a foreign line and a set_capital naming the same state: capital_state_owned_by_other's, Auto-fix's other loop (review R1).
  //   Ids 1..13 with no gap: a gap is state_id_gap, and Auto-fix's renumbering would move the fixture under the test.
  const w = world("fix", { 1: "AAA", 2: "AAA", 3: "CCC", 4: "DDD", 5: "EEE", 6: "FFF", 7: "HHH", 8: "KKK", 9: "AAA", 10: "AAA", 11: "LLL", 12: "AAA", 13: "MMM" }, {
    HHH: "\ufeffset_capital = { state = 99 }\r\n",
    KKK: "\ufeffcapital = 8\r\nset_capital = { state = 9 }\r\n",
    MMM: "\ufeffset_capital = { state = 12 }\r\n1939.1.1 = {\r\n\tset_capital = { state = 12 }\r\n}\r\n",
    LLL: "\ufeffcapital = 10\r\nset_capital = { state = 10 }\r\n1939.1.1 = {\r\n\tset_capital = { state = 10 }\r\n}\r\n",
  }, { 12: "\t\t1939.1.1 = {\n\t\t\towner = MMM\n\t\t}\n" });
  md.clearMapLayerCache();
  const model = md.buildMapModel({ modRoot: w.mod, gameRoot: w.base, dependencyRoots: [], cacheStableLayers: false });
  const want = Object.fromEntries(["CCC", "EEE", "HHH", "KKK", "MMM", "LLL"].map((t) => [t, md.capitalStateFor(model, t)]));
  rec("THE CONTROL: capitalStateFor gives each a state of its own (KKK keeps its line's)", JSON.stringify(want) === JSON.stringify({ CCC: 3, EEE: 5, HHH: 7, KKK: 8, MMM: 13, LLL: 11 }), want);
  const before = validateTags(w);
  rec("THE CONTROL: before the click the rules report exactly these", JSON.stringify(before) === JSON.stringify({ capital_state_owned_by_other: ["LLL"], [NONE]: ["EEE", "HHH"], [RULE]: ["CCC", "KKK", "MMM"] }), before);
  const af = md.autoFixMap({ modRoot: w.mod, gameRoot: w.base, dependencyRoots: [] });
  const fx = (af.fixes || {}).capitals || {};
  const txt = (t) => countryText(w.mod, t);
  rec("⭐⭐⭐ CCC: a capital line naming capitalStateFor's state", /^\ufeffcapital = 3\r\n/.test(txt("CCC")) && (fx.details || []).some((d) => d.tag === "CCC" && d.to === 3), { head: JSON.stringify(txt("CCC").slice(0, 40)), details: fx.details });
  const r = read(txt("CCC"));
  rec("⭐⭐⭐ …its start's set_capital lines pointed at it — and (E3) its 1939 ones too: they named AAA's state 2, whose file never hands it to CCC",
    r.map((x) => `${x.id}@${x.date || "start"}`).join() === "3@start,3@start,3@1939.1.1,3@1939.1.1", r.map((x) => `${x.id}@${x.date || "start"}`));
  rec("⭐⭐ …a splice: the base game's file apart from the line and those numbers", txt("CCC") === "\ufeffcapital = 3\r\n" + cccFile(3, 3).slice(1), JSON.stringify(txt("CCC").slice(0, 200)));
  rec("⭐⭐ EEE, which named none: a line naming its own state, the rest of its file kept", txt("EEE") === "\ufeffcapital = 5\r\n# no capital here\r\noob = \"EEE_1936\"\r\n", JSON.stringify(txt("EEE")));
  rec("⭐⭐⭐ HHH: a line naming its own state, and its set_capital naming the missing state pointed at it", txt("HHH") === "\ufeffcapital = 7\r\nset_capital = { state = 7 }\r\n", JSON.stringify(txt("HHH")));
  rec("⭐⭐⭐ KKK: its line kept, the set_capital below it pointed at the line's own state", txt("KKK") === "\ufeffcapital = 8\r\nset_capital = { state = 8 }\r\n", JSON.stringify(txt("KKK")));
  rec("⭐⭐⭐ MMM: its start's set_capital pointed — and its 1939 one LEFT, because state 12's own file gives it to MMM in 1939",
    txt("MMM") === "\ufeffcapital = 13\r\nset_capital = { state = 13 }\r\n1939.1.1 = {\r\n\tset_capital = { state = 12 }\r\n}\r\n", JSON.stringify(txt("MMM")));
  rec("⭐⭐⭐ (R1) LLL, repaired by Auto-fix's LINE loop: the line moved AND the set_capital below it, which would have overridden it",
    txt("LLL").startsWith("\ufeffcapital = 11\r\nset_capital = { state = 11 }\r\n") && (fx.details || []).some((d) => d.tag === "LLL" && d.from === 10 && d.to === 11), { txt: JSON.stringify(txt("LLL")), details: fx.details });
  rec("⭐⭐⭐ (R1/E3) …and its 1939 set_capital, which named the same AAA state — whose file never hands it to LLL — names the new capital too",
    txt("LLL") === "\ufeffcapital = 11\r\nset_capital = { state = 11 }\r\n1939.1.1 = {\r\n\tset_capital = { state = 11 }\r\n}\r\n" && (fx.details || []).some((d) => d.tag === "LLL" && d.setCapitalLines === 2), { txt: JSON.stringify(txt("LLL")), details: fx.details });
  rec("⭐ nothing for FFF (no history file), AAA or DDD", JSON.stringify(countryFilesIn(w.mod)) === JSON.stringify(["CCC", "EEE", "HHH", "KKK", "LLL", "MMM"].map((t) => `${t} - Land of ${t}.txt`)), countryFilesIn(w.mod));
  const afterTags = validateTags(w);
  rec("⭐⭐⭐ …and every capital rule is silent afterwards", !Object.keys(afterTags).length, afterTags);
  const hashes = () => countryFilesIn(w.mod).map((f) => sha(path.join(w.mod, "history", "countries", f))).join();
  const h0 = hashes();
  const af2 = md.autoFixMap({ modRoot: w.mod, gameRoot: w.base, dependencyRoots: [] });
  rec("⭐⭐ a second click repairs nothing and writes nothing", (((af2.fixes || {}).capitals || {}).fixed || 0) === 0 && h0 === hashes(), (af2.fixes || {}).capitals);
}
function validateTags(w) {
  const out = {};
  for (const p of rowsOf(w)) if (/capital/.test(p.rule)) out[p.rule] = (p.tags || (p.items || []).map((i) => i.tag)).slice().sort();
  return out;
}
// ⛔ review R1 — Swap countries (and the map's Set capital, the same setCountryCapital) on what Generate land leaves PRC with
{
  const genCCC = "\ufeffcapital = 3\r\n" + cccFile(3, 3).slice(1);
  const w = world("swap", { 1: "AAA", 2: "AAA", 3: "CCC", 4: "DDD" }, { CCC: genCCC });
  const sw = md.swapCountries({ modRoot: w.mod, gameRoot: w.base, dependencyRoots: [], tagA: "CCC", tagB: "AAA" });
  const r = read(countryText(w.mod, "CCC"));
  rec("⭐⭐⭐ Swap countries: CCC's line AND its start's set_capital lines name its new capital, so under either DLC it starts on its own land",
    sw.changed === true && sw.aCapital === 1 && /^\ufeffcapital = 1\r\n/.test(countryText(w.mod, "CCC")) && r.filter((x) => !x.date).map((x) => x.id).join() === "1,1", { sw, refs: r.map((x) => `${x.id}@${x.date || "start"}`) });
  const rows = validateTags(w);
  rec("…and no capital rule reports either country afterwards", !Object.keys(rows).length, rows);
  rec("…and it says what it pointed", JSON.stringify(sw.aSetCapital) === JSON.stringify({ setCapitalPointed: { from: [3], lines: 2 } }), sw.aSetCapital);
}
// ⛔ #a-set-capital-alternative-of-its-own-is-left (review D2) — A MODDER'S OWN ALTERNATIVE IS LEFT, AND WHAT IS POINTED IS SAID. Every
// capital writer pointed each start set_capital naming another state at the new capital: a game rule's or a DLC's alternative naming a
// second state of the country's OWN too, which no rule had reported and the game would have started it on — and the page said none of it.
// ⛔ (review D4) …and a comment trailing a number it pointed still named the old state, in the write that dropped the line's for that.
// XXX's file: its line; the capital re-asserted unseen; a game rule's and a DLC's alternative naming its OWN state 2; a DLC's naming
// ZZZ's state 3 (one line, closing its if); a game rule's naming a state the map lacks; comments beside and above them; and an intended
// 1939 move to its own state 5.
const XXX = "\ufeffcapital = 1 # Ex City\r\n"
  + "# the capital, re-asserted unseen\r\nhidden_effect = {\r\n\tset_capital = { state = 1 } # Ex City again\r\n}\r\n"
  + "# the game rule's capital\r\nif = {\r\n\tlimit = { has_game_rule = { rule = xxx_capital option = second } }\r\n\tset_capital = { state = 2 } # Second City\r\n}\r\n"
  + "if = {\r\n\tlimit = { has_dlc = \"La Resistance\" }\r\n\tset_capital = {\r\n\t\tstate = 2 # LaR capital\r\n\t}\r\n}\r\n"
  + "if = { limit = { has_dlc = \"" + DLC + "\" } set_capital = { state = 3 } } # Their City\r\n"
  + "if = {\r\n\tlimit = { has_game_rule = { rule = xxx_capital option = lost } }\r\n\tset_capital = {\r\n\t\tstate = 99 # Atlantis\r\n\t}\r\n}\r\n"
  + "1939.1.1 = {\r\n\tset_capital = { state = 5 } # the 1939 move\r\n}\r\n";
const pageFn = (name) => {
  const { maskJsLiterals, jsBodyAt } = require("./testlib-strip-comments.js");
  const PAGE = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8"), MASKED = maskJsLiterals(PAGE);
  const at = MASKED.indexOf(`function ${name}(`), body = at < 0 ? null : jsBodyAt(MASKED, at);
  return body ? require("vm").runInNewContext("(" + PAGE.slice(at, body[1] + 1) + ")") : () => null;
};
const commentsOf = (t) => (t.match(/#[^\r\n]*/g) || []);
{
  // Auto-fix: the modder gave XXX's capital state 1 to YYY; XXX's most important state left is 6
  const w = world("alts", { 1: "YYY", 2: "XXX", 3: "ZZZ", 4: "YYY", 5: "XXX", 6: "XXX" }, { XXX, YYY: "\ufeffcapital = 4\r\n", ZZZ: "\ufeffcapital = 3\r\n" });
  const before = validateTags(w);
  rec("THE CONTROL: before the click the line is on YYY's state, and with the DLC the start ends on ZZZ's", JSON.stringify(before) === JSON.stringify({ capital_state_owned_by_other: ["XXX"], [RULE]: ["XXX"] }), before);
  const af = md.autoFixMap({ modRoot: w.mod, gameRoot: w.base, dependencyRoots: [] }), fx = (af.fixes || {}).capitals || {};
  const t = countryText(w.mod, "XXX"), refs = read(t).map((x) => `${x.id}@${x.date || "start"}`).join();
  rec("THE CONTROL: Auto-fix moved XXX's line onto its most important state, 6", /^\ufeffcapital = 6\r\n/.test(t) && (fx.details || []).some((d) => d.tag === "XXX" && d.from === 1 && d.to === 6), { head: JSON.stringify(t.slice(0, 30)), details: fx.details });
  rec("⭐⭐⭐ (D2) the game rule's and the DLC's alternative naming XXX's OWN state 2 are left, comments and all — the modder's capital for that case",
    t.includes("\tset_capital = { state = 2 } # Second City\r\n") && t.includes("\t\tstate = 2 # LaR capital\r\n") && refs === "6@start,2@start,2@start,6@start,6@start,5@1939.1.1", refs);
  rec("⭐⭐⭐ (D2) …and pointed: the one that runs whatever the DLC (the hidden_effect), the DLC's naming ZZZ's state, the game rule's naming a state the map lacks",
    (fx.details || []).some((d) => d.tag === "XXX" && d.setCapitalLines === 3 && JSON.stringify(d.setCapitalFrom) === "[1,3,99]" && JSON.stringify(d.setCapitalKept) === "[2]" && d.setCapitalKeptLines === 2), fx.details);
  rec("⭐⭐ (D2) …and the intended 1939 move to its own state 5 is left", t.includes("1939.1.1 = {\r\n\tset_capital = { state = 5 } # the 1939 move\r\n}\r\n"), refs);
  rec("⭐⭐⭐ (D4) a comment trailing a number it pointed named the old state, and goes with it as the line's does; every other comment stays where it stood",
    JSON.stringify(commentsOf(t)) === JSON.stringify(["# the capital, re-asserted unseen", "# the game rule's capital", "# Second City", "# LaR capital", "# the 1939 move"]), commentsOf(t));
  const want = XXX.replace("capital = 1 # Ex City\r\n", () => "capital = 6\r\n").replace("{ state = 1 } # Ex City again", () => "{ state = 6 }")
    .replace("set_capital = { state = 3 } } # Their City", () => "set_capital = { state = 6 } }").replace("state = 99 # Atlantis", () => "state = 6");
  rec("⭐⭐ …a splice: the base game's file apart from the line, those numbers and their comments — BOM, CRLF and the closing braces kept", t === want, JSON.stringify(t));
  rec("⭐⭐ …and no capital rule reports XXX afterwards: with the game rule or La Resistance it starts on its own state 2", !Object.keys(validateTags(w)).length, validateTags(w));
  const parts = (pageFn("capitalRepairNote")(fx) || {}).parts || [];
  rec("⭐⭐⭐ (D2) the Auto-fix summary says which set_capital lines it pointed, from what to what, and which it left and why",
    parts.some((p) => /pointed 3 set_capital lines at the new capital/.test(p) && p.includes("XXX: 1, 3, 99 → 6")) && parts.some((p) => /left 2 set_capital lines naming a state of the country's own under a DLC or another condition/.test(p) && p.includes("XXX: 2")), parts);
  // (moved with #a-moved-capital-is-named, tool campaign B2-9: the line names whose capital moved, from where to where)
  rec("CONTROL: a click that pointed nothing says nothing of set_capital", JSON.stringify(pageFn("capitalRepairNote")({ fixed: 1, details: [{ tag: "QQQ", from: 1, to: 2 }] })) === JSON.stringify({ parts: ["moved 1 country's capital onto land it owns (QQQ: state 1 → 2)"] }));
}
{
  // the map's Set capital (setCountryCapital, as /api/map/set-capital calls it: no owners given, so it reads them): XXX's capital → 5
  const w = world("setcap", { 1: "XXX", 2: "XXX", 3: "ZZZ", 4: "YYY", 5: "XXX", 6: "XXX" }, { XXX, YYY: "\ufeffcapital = 4\r\n", ZZZ: "\ufeffcapital = 3\r\n" });
  md.clearMapLayerCache();
  const r = md.setCountryCapital({ modRoot: w.mod, gameRoot: w.base, dependencyRoots: [], tag: "XXX", stateId: 5 });
  const t = countryText(w.mod, "XXX");
  rec("⭐⭐⭐ (D2) Set capital leaves XXX's own-state alternatives and points the rest: the hidden_effect, ZZZ's state, the missing one",
    r.changed === true && JSON.stringify(r.setCapitalPointed) === JSON.stringify({ from: [1, 3, 99], lines: 3 }) && JSON.stringify(r.setCapitalKept) === JSON.stringify({ ids: [2], lines: 2 })
    && read(t).map((x) => `${x.id}@${x.date || "start"}`).join() === "5@start,2@start,2@start,5@start,5@start,5@1939.1.1", { r, refs: read(t).map((x) => `${x.id}@${x.date || "start"}`) });
  const note = pageFn("setCapitalNote")("XXX", 5, r) || "";
  rec("⭐⭐⭐ (D2) …and the map page says both: what it pointed, from what, and the alternative it left, and what that means for a game under it",
    note.includes("pointed those 3 lines (1, 3, 99 → 5)") && note.includes("It left the 2 set_capital lines in XXX's history naming a state XXX owns (2) under a DLC or another condition") && /starts XXX there rather than on the capital you set/.test(note), note);
  rec("CONTROL: a Set capital with no set_capital in the file says nothing more", pageFn("setCapitalNote")("AAA", 1, { ok: true, changed: true, file: "AAA.txt" }) === "");
  const { stripJsComments } = require("./testlib-strip-comments.js");
  const code = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8"));
  rec("⭐⭐ (D2) the page's Save reads it off each Set capital response, and the Auto-fix summary is built by capitalRepairNote",
    /setCapitalNote\(\s*w\.body\s*&&\s*w\.body\.tag\s*,\s*body\.stateId\s*,\s*res\s*\)/.test(code) && /parts\.push\(\s*\.\.\.capitalRepairNote\(\s*cap\s*\)\.parts\s*\)/.test(code));
  // …and the summary as the tests that click Auto-fix lift it (testlib-map-page.js): the helper comes along, and the line says it
  const P = require("./testlib-map-page.js");
  let line = "";
  try { line = P.autoFixSummary({ ok: true, fixes: { capitals: { fixed: 1, details: [{ tag: "XXX", from: 1, to: 6, setCapitalLines: 3, setCapitalFrom: [1, 3, 99], setCapitalKept: [2], setCapitalKeptLines: 2 }] } } }); } catch (e) { line = "THREW " + e.message; }
  rec("⭐⭐ (D2) …and the Auto-fix summary lifted the way every Auto-fix test lifts it runs, and says it", /XXX: 1, 3, 99 → 6/.test(line) && /left 2 set_capital lines/.test(line), line);
  // Generate land's mode: a generated world's ids are new, so every start set_capital naming another id is pointed (review R4)
  const w2 = world("setall", { 1: "XXX", 2: "XXX", 3: "ZZZ", 4: "YYY", 5: "XXX", 6: "XXX" }, { XXX, YYY: "\ufeffcapital = 4\r\n", ZZZ: "\ufeffcapital = 3\r\n" });
  const r2 = md.setCountryCapital({ modRoot: w2.mod, gameRoot: w2.base, dependencyRoots: [], tag: "XXX", stateId: 5, pointAll: true });
  rec("THE CONTROL: with pointAll (Generate land) every start set_capital naming another state is pointed, the own alternatives too",
    JSON.stringify(r2.setCapitalPointed) === JSON.stringify({ from: [1, 2, 3, 99], lines: 5 }) && !r2.setCapitalKept, r2);
}
// ⛔ #alternatives-for-every-case-are-the-capital — …BUT ALTERNATIVES THAT DECIDE EVERY CASE ARE THE CAPITAL. PRC's shape — `if DLC → a,
// else → b`, both its own — ends on one of them with the DLC and without it, so leaving both made the map's Set capital write a line no
// game starts on; after Generate land both name the capital it chose, so on the owner's own worlds Set capital on PRC changed nothing in
// game while the page called them "your alternative for that case". Auto-fix, which repairs and does not choose, still leaves them.
{
  const runsOf = (w, tag) => {
    md.clearMapLayerCache();
    const m = md.buildMapModel({ modRoot: w.mod, gameRoot: w.base, dependencyRoots: [], cacheStableLayers: false });
    return md.startCapitalRuns(m, tag, new Map(m.states.map((s) => [s.id, s]))).map((r) => r.id);
  };
  const refsOf = (t) => read(t).map((x) => `${x.id}@${x.date || "start"}`).join();
  // the owner's generated-world shape: a line and both branches naming the capital Generate land chose, 3; the owner clicks Set capital → 4
  const w = world("everycase", { 1: "AAA", 2: "AAA", 3: "CCC", 4: "CCC" }, { CCC: "﻿capital = 3\r\n" + cccFile(3, 3).slice(1) });
  const before = runsOf(w, "CCC");
  const r = md.setCountryCapital({ modRoot: w.mod, gameRoot: w.base, dependencyRoots: [], tag: "CCC", stateId: 4 });
  const t = countryText(w.mod, "CCC"), after = runsOf(w, "CCC");
  rec("THE CONTROL: before the click CCC starts on 3 with the DLC and without it", JSON.stringify(before) === "[3,3]", before);
  rec("⭐⭐⭐ (D2) Set capital on PRC's shape: its own state under the DLC and without it decides every case — so both are pointed with the line, and the game starts on the capital set",
    JSON.stringify(after) === "[4,4]" && /^﻿capital = 4\r\n/.test(t) && refsOf(t) === "4@start,4@start,3@1939.1.1,3@1939.1.1", { after, refs: refsOf(t), r });
  rec("⭐⭐ …and it says so: pointed, and that they decided every case — none left", JSON.stringify(r.setCapitalPointed) === JSON.stringify({ from: [3], lines: 2, everyCase: true }) && !r.setCapitalKept, r);
  const note = pageFn("setCapitalNote")("CCC", 4, r) || "";
  rec("⭐⭐ …and the map page says it pointed its own states, and why", note.includes("pointed those 2 lines (3 → 4)") && note.includes("decided CCC's capital in every case") && !/ left /.test(note.replace("left, no game", "")), note);
  // vanilla PRC's own shape: a different state of its own under each
  const w2 = world("everycase2", { 1: "CCC", 2: "CCC", 3: "AAA", 4: "CCC" }, { CCC: cccFile(1, 2) });
  const r2 = md.setCountryCapital({ modRoot: w2.mod, gameRoot: w2.base, dependencyRoots: [], tag: "CCC", stateId: 4 });
  rec("⭐⭐ …and vanilla PRC's: 1 with the DLC and 2 without, both its own — both pointed",
    JSON.stringify(runsOf(w2, "CCC")) === "[4,4]" && JSON.stringify(r2.setCapitalPointed) === JSON.stringify({ from: [1, 2], lines: 2, everyCase: true }), { runs: runsOf(w2, "CCC"), r2 });
  // Auto-fix: CCC's line names state 1, given to AAA; its branches name its own 2 (the DLC) and 3 (without) — the game starts it on its own
  // state whatever the DLC. capital_state_owned_by_other reads the line; Auto-fix moves the line and leaves the modder's capital.
  const w3 = world("everycase-fix", { 1: "AAA", 2: "CCC", 3: "CCC", 4: "CCC" }, { CCC: "﻿capital = 1\r\n" + cccFile(2, 3).slice(1) });
  const af = md.autoFixMap({ modRoot: w3.mod, gameRoot: w3.base, dependencyRoots: [] }), fx = (af.fixes || {}).capitals || {};
  const t3 = countryText(w3.mod, "CCC");
  rec("THE CONTROL: Auto-fix moved CCC's line onto its most important state, 4", /^﻿capital = 4\r\n/.test(t3) && (fx.details || []).some((d) => d.tag === "CCC" && d.from === 1 && d.to === 4), { head: JSON.stringify(t3.slice(0, 30)), details: fx.details });
  rec("⭐⭐⭐ (D2) …and left both branches, though between them they decide every case: Auto-fix repairs, and a modder's own capital is not wrong",
    refsOf(t3) === "2@start,3@start,3@1939.1.1,3@1939.1.1" && (fx.details || []).some((d) => d.tag === "CCC" && JSON.stringify(d.setCapitalKept) === "[2,3]" && !d.setCapitalLines), { refs: refsOf(t3), details: fx.details });
  // …and an alternative that leaves a case to the line is still left by Set capital (XXX above), as is one under a limit Nova cannot judge
  const w4 = world("everycase-opaque", { 1: "CCC", 2: "CCC", 3: "AAA", 4: "CCC" }, { CCC: "﻿capital = 1\r\nif = {\r\n\tlimit = { has_country_flag = ccc_moved }\r\n\tset_capital = { state = 2 }\r\n}\r\n" });
  const r4 = md.setCountryCapital({ modRoot: w4.mod, gameRoot: w4.base, dependencyRoots: [], tag: "CCC", stateId: 4 });
  rec("THE CONTROL: one own alternative under a flag leaves the other case to the line — left", JSON.stringify(r4.setCapitalKept) === JSON.stringify({ ids: [2], lines: 1 }) && !r4.setCapitalPointed, r4);
  // …and a line BELOW the branches runs after them in every case: they decide nothing, and are left
  const w5 = world("everycase-below", { 1: "AAA", 2: "CCC", 3: "CCC", 4: "CCC" }, { CCC: "﻿" + cccFile(2, 3).slice(1) + "capital = 1\r\n" });
  const r5 = md.setCountryCapital({ modRoot: w5.mod, gameRoot: w5.base, dependencyRoots: [], tag: "CCC", stateId: 4 });
  rec("⭐ (D2) …and branches a line BELOW them overrides in every case decide nothing: left, the line set", JSON.stringify(r5.setCapitalKept) === JSON.stringify({ ids: [2, 3], lines: 2 }) && !r5.setCapitalPointed
    && /\r\ncapital = 4\r\n$/.test(countryText(w5.mod, "CCC")) && JSON.stringify(runsOf(w5, "CCC")) === "[4,4]", { r5, runs: runsOf(w5, "CCC") });
  // ⛔ #a-pick-of-one-branch-decides-its-case (review F1) — Set capital on vanilla PRC's shape ONTO ONE OF ITS BRANCHES' OWN STATES. The
  // branch already naming the pick was counted with the line, so the other branch was kept, the line decided no case, and the click
  // changed nothing in game: → 1032 still started PRC on 622 with No Compromise, No Surrender, and → 622 on 1032 without it.
  for (const [pick, other] of [[1, 2], [2, 1]]) {
    const w6 = world("everycase-pick" + pick, { 1: "CCC", 2: "CCC", 3: "AAA", 4: "CCC" }, { CCC: cccFile(1, 2) });
    const was = runsOf(w6, "CCC");
    const r6 = md.setCountryCapital({ modRoot: w6.mod, gameRoot: w6.base, dependencyRoots: [], tag: "CCC", stateId: pick });
    const runs = runsOf(w6, "CCC");
    rec(`⭐⭐⭐ (F1) Set capital on vanilla PRC's shape onto its ${pick === 1 ? "DLC" : "no-DLC"} branch's own state ${pick}: the other branch's ${other} is pointed too, and the game starts on ${pick} with the DLC and without it`,
      JSON.stringify(was) === "[2,1]" && JSON.stringify(runs) === `[${pick},${pick}]` && JSON.stringify(r6.setCapitalPointed) === JSON.stringify({ from: [other], lines: 1, everyCase: true }) && !r6.setCapitalKept, { was, runs, r6 });
  }
  // (review F2d) …and PRC's shape inside the START DATE's own block is the start's too: both its own states, pointed with the line
  const dated = "﻿capital = 3\r\n1936.1.1 = {\r\n\tif = {\r\n\t\tlimit = { has_dlc = \"" + DLC + "\" }\r\n\t\tset_capital = { state = 1 }\r\n"
    + "\t\telse_if = {\r\n\t\t\tlimit = { NOT = { has_dlc = \"" + DLC + "\" } }\r\n\t\t\tset_capital = { state = 2 }\r\n\t\t}\r\n\t}\r\n}\r\n";
  const w7 = world("everycase-dated", { 1: "CCC", 2: "CCC", 3: "CCC", 4: "CCC", 5: "AAA" }, { CCC: dated });
  const was7 = runsOf(w7, "CCC");
  const r7 = md.setCountryCapital({ modRoot: w7.mod, gameRoot: w7.base, dependencyRoots: [], tag: "CCC", stateId: 4 });
  rec("⭐⭐⭐ (F2) PRC's shape in a 1936.1.1 block decides every case at a 1936 start: Set capital → 4 points both branches, and the game starts on 4",
    JSON.stringify(was7) === "[2,1]" && JSON.stringify(runsOf(w7, "CCC")) === "[4,4]" && JSON.stringify(r7.setCapitalPointed) === JSON.stringify({ from: [1, 2], lines: 2, everyCase: true }) && !r7.setCapitalKept,
    { was7, runs: runsOf(w7, "CCC"), r7 });
}
// (review F2a/b) — A LINE, AND THE START DATE'S OWN BLOCK MOVING THE CAPITAL ONTO ANOTHER COUNTRY'S STATE. The game runs the block at a 1936
// start and starts LDQ on FOR's state 3 (ids without a gap: Auto-fix's renumber stays out of it). Reported, and Auto-fix points the block's set_capital as it moves the line, so the row clears.
{
  const LDQ = "﻿capital = 1\r\n1936.1.1 = {\r\n\tset_capital = { state = 3 }\r\n}\r\n";
  const w = world("ldq", { 1: "LDQ", 2: "LDQ", 3: "FOR", 4: "FOR" }, { LDQ, FOR: "﻿capital = 3\r\n" });
  const before = tagsOf(rowsOf(w), RULE);
  rec("⭐⭐⭐ (F2) LDQ — its line on its own state, then the 1936.1.1 block naming FOR's — is no_capital_of_its_own", before.includes("LDQ") && !before.includes("FOR"), before);
  const af = md.autoFixMap({ modRoot: w.mod, gameRoot: w.base, dependencyRoots: [] }), fx = (af.fixes || {}).capitals || {};
  const t = countryText(w.mod, "LDQ"), line = (/^﻿capital = (\d+)\r\n/.exec(t) || [])[1], set = (/set_capital = \{ state = (\d+) \}/.exec(t) || [])[1];
  rec("⭐⭐⭐ (F2) …and Auto-fix points the block's set_capital where the line stands, on LDQ's own land: the row clears",
    !!line && line === set && ["1", "2"].includes(set) && t.includes("1936.1.1 = {\r\n\tset_capital = { state = " + set + " }\r\n}\r\n") && !tagsOf(rowsOf(w), RULE).includes("LDQ"),
    { text: JSON.stringify(t), details: fx.details, after: tagsOf(rowsOf(w), RULE) });
}

try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}   // scratch fixtures only — never a mod directory (⛔ CLAUDE.md #1)
console.log(`\n=== a capital set only by set_capital: ${checks} checks, ${fails.length} failed, ${skips} SKIPPED (not counted as passes) ===`);
if (fails.length) { for (const f of fails) console.log("   FAILED: " + f); process.exit(1); }
