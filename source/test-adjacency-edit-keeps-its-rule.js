// #adjacency-edit-drops-the-rule
//
// EDITING AN ADJACENCY DELETED THE CANAL RULE ATTACHED TO IT.
//
// map/adjacencies.csv is ten columns:
//     From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment
//
// Nova models a link as one thing per province pair, and "editing" one is an add that replaces whatever was
// there. The client (public/map.js adjApply) posts only { action, from, to, type, through }, so `rule` and
// `comment` arrived undefined and defaulted to "", the replace stripped EVERY row for the pair, and
// addAdjacencyRow hardcoded -1 into the four coordinate columns. Changing a link's type therefore destroyed:
//
//   • adjacency_rule_name — which is the entire point of the row for a canal. Without it the passage stops
//     obeying its rule in game: vanilla's SUEZ_CANAL, PANAMA_CANAL, KIEL_CANAL, GIBRALTAR,
//     BOSPHORUS_STRAIT, DARDANELLES_STRAIT and every mod equivalent.
//   • start_x/start_y/stop_x/stop_y — the drawn line for that strait or canal.
//   • the Comment — the only human label the file carries.
//   • and the pair's OTHER row, where it had one (Millennium Dawn gives the Bosphorus and the Dardanelles
//     two rows apiece).
//
// MEASURED over the installed corpus, before and after, by running the real row functions:
//     rows carrying a rule      101 → before: 101 lost, after: 101 kept
//     rows carrying coordinates  46 → before:  46 lost, after:  46 kept
//     rows carrying a comment 2,050 → before: 2,050 lost, after: 2,050 kept
//     rows in a multi-row pair   16 → before: the second row lost, after: kept
//
// The control is BUILT IN below: the same corpus is run through the OLD composition as well, and the test
// asserts that the old one loses what the new one keeps. A measurement that cannot show the loss is not
// measuring anything.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 320));
  }
}
const { stripJsComments } = require("./testlib-strip-comments.js");
const RAW = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
const SRC = stripJsComments(RAW);

/** Source of a named function. Skips the PARAMETER LIST first — addAdjacencyRow destructures its options,
 *  so "the first { after the name" is the parameter object and slicing from there yields a fragment that is
 *  not a function at all. */
function fnSource(name) {
  const at = SRC.indexOf(`function ${name}(`);
  if (at === -1) return "";
  let depth = 0, i = SRC.indexOf("(", at);
  for (; i < SRC.length; i++) { if (SRC[i] === "(") depth++; else if (SRC[i] === ")") { depth--; if (depth === 0) break; } }
  let d = 0;
  for (i = SRC.indexOf("{", i); i < SRC.length; i++) {
    if (SRC[i] === "{") d++;
    else if (SRC[i] === "}") { d--; if (d === 0) return SRC.slice(at, i + 1); }
  }
  return "";
}

console.log("\n[the writer keeps what the caller did not mention]");
{
  const write = fnSource("writeAdjacency");
  rec("writeAdjacency was extracted", write.length > 600, write.length);
  rec("an edit finds the row it is replacing", /const existing = findAdjacencyRowFor\(text, f, t, type\);/.test(write),
    "the replace is still blind to what the row carried");
  // ⭐ UNDEFINED means "the caller did not say" and the answer is the value on disk. An explicit "" is a
  // choice and must still clear the field — that distinction is the whole bug.
  rec("…keeps the rule when the caller did not mention one", /const keptRule = rule === undefined \|\| rule === null \? \(existing \? existing\.rule : ""\) : rule;/.test(write),
    "the canal rule is blanked again");
  rec("…and the comment", /const keptComment = comment === undefined \|\| comment === null \? \(existing \? existing\.comment : ""\) : comment;/.test(write), "");
  rec("…and the coordinates", /const keptCoords = existing \? existing\.coords : null;/.test(write), "");
  rec("…and removes ONLY that row, not every row for the pair", /if \(existing\) text = removeAdjacencyRowAt\(text, existing\.index\);/.test(write),
    "a pair with two rows loses the one that was not being edited");
  rec("…so the blind replace-by-pair is gone from the add path", !/text = removeAdjacencyRow\(text, f, t\)\.text;/.test(write),
    "the add path still strips every row for the pair");
  rec("CONTROL: remove-by-pair still exists for an actual REMOVE", /const r = removeAdjacencyRow\(text, f, t, type\);/.test(write),
    "removing a link no longer removes it");
  // The backup is safeModWrite's, and it lands in Nova's backups folder. This looked for the sibling .bak
  // until 2026-09-16, which was a copy inside the mod that shipped to the Workshop with it.
  // #a-backup-must-not-ship-with-the-mod
  // #an-adjacency-name-is-encoded-twice — the text now goes back in the encoding it was read in, so the call names the encoder;
  // it is still safeModWrite that writes it.
  rec("CONTROL: …and the file is still written through the safe writer, which backs it up first",
    /safeModWrite\(modCsv, encodeAdjacencyCsv\(text, onDisk\.encoding\), "map-writeAdjacency"\)/.test(write), "the write no longer goes through safeModWrite");
}

console.log("\n[RUN IT] over the installed corpus, old composition vs new");
{
  const sandbox = {};
  vm.createContext(sandbox);
  const needed = ["addAdjacencyRow", "findAdjacencyRowFor", "removeAdjacencyRowAt", "removeAdjacencyRow", "parseAdjacencies"];
  const srcs = needed.map(fnSource);
  rec("the row functions were extracted", srcs.every((s) => s.length > 60), needed.map((n, i) => n + ":" + srcs[i].length));
  vm.runInContext(srcs.join("\n"), sandbox);
  const call = (fn, ...args) => { sandbox.__a = args; return vm.runInContext(`${fn}(...__a)`, sandbox); };

  // A fixture carrying every shape, so this test measures something even on a machine with no HOI4.
  const FIXTURE = [
    "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment",
    "1;2;;-1;100;200;300;400;SUEZ_CANAL;Suez",
    "3;4;sea;5;-1;-1;-1;-1;GIBRALTAR;Gibraltar",
    "6;7;;-1;-1;-1;-1;-1;BOSPHORUS_STRAIT;Bosphorus one",
    "7;6;sea;8;-1;-1;-1;-1;BOSPHORUS_STRAIT;Bosphorus two",
    "9;10;impassable;-1;-1;-1;-1;-1;;just impassable",
    // ⭐ A pair whose two rows carry DIFFERENT rules, and whose FIRST row is not the type being edited.
    // Without it the multi-row cases are undiscriminating: the corpus's real two-row pairs (MD's Bosphorus
    // and Dardanelles) put the SAME rule on both rows, so replacing the wrong one of the two still preserved
    // the rule and the back-out for "prefer the matching type" stayed silent.
    "11;12;sea;13;-1;-1;-1;-1;RULE_ON_THE_SEA_ROW;sea row",
    "12;11;;-1;-1;-1;-1;-1;RULE_ON_THE_PLAIN_ROW;plain row",
    "-1;-1;-1;-1;-1;-1;-1;-1;-1;",
  ].join("\r\n");

  const ROOTS = [
    ["vanilla", "D:/SteamLibrary/steamapps/common/Hearts of Iron IV"],
    ["Millennium Dawn", "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649"],
    ["Road to 56", "D:/SteamLibrary/steamapps/workshop/content/394360/820260968"],
    ["Old World Blues", "D:/SteamLibrary/steamapps/workshop/content/394360/2265420196"],
    ["Rise of Nations", "D:/SteamLibrary/steamapps/workshop/content/394360/2026448968"],
  ];
  const files = [["fixture", FIXTURE]];
  for (const [label, root] of ROOTS) {
    const csv = path.join(root, "map", "adjacencies.csv");
    if (fs.existsSync(csv)) { try { files.push([label, fs.readFileSync(csv, "utf8")]); } catch (_) {} }
  }
  console.log("     corpora read: " + files.map((f) => f[0]).join(", "));

  /** Simulate an edit of one row: NEW composition (preserving) or OLD (blind). */
  function editRow(text, row, mode) {
    if (mode === "new") {
      const existing = call("findAdjacencyRowFor", text, row.from, row.to, row.type);
      const keptRule = existing ? existing.rule : "";
      const keptComment = existing ? existing.comment : "";
      const keptCoords = existing ? existing.coords : null;
      let out = existing ? call("removeAdjacencyRowAt", text, existing.index) : text;
      return call("addAdjacencyRow", out, { from: row.from, to: row.to, type: row.type, through: row.through, rule: keptRule, comment: keptComment, coords: keptCoords });
    }
    // OLD: strip every row for the pair, then add with nothing carried forward.
    const out = call("removeAdjacencyRow", text, row.from, row.to).text;
    return call("addAdjacencyRow", out, { from: row.from, to: row.to, type: row.type, through: row.through });
  }

  const tally = { new: { rule: 0, comment: 0, coords: 0, sibling: 0 }, old: { rule: 0, comment: 0, coords: 0, sibling: 0 } };
  let withRule = 0, withComment = 0, withCoords = 0, inMultiPair = 0;

  for (const [, text] of files) {
    const rows = call("parseAdjacencies", text);
    const pairCount = new Map();
    for (const r of rows) { const k = [Math.min(r.from, r.to), Math.max(r.from, r.to)].join("-"); pairCount.set(k, (pairCount.get(k) || 0) + 1); }
    for (const r of rows) {
      const raw = r.raw.split(";");
      const hadCoords = [raw[4], raw[5], raw[6], raw[7]].some((v) => String(v).trim() !== "-1" && String(v).trim() !== "");
      const k = [Math.min(r.from, r.to), Math.max(r.from, r.to)].join("-");
      const multi = pairCount.get(k) > 1;
      if (r.rule) withRule++;
      if (r.comment) withComment++;
      if (hadCoords) withCoords++;
      if (multi) inMultiPair++;

      for (const mode of ["new", "old"]) {
        const out = editRow(text, r, mode);
        const after = call("parseAdjacencies", out).filter((x) => (x.from === r.from && x.to === r.to) || (x.from === r.to && x.to === r.from));
        const mine = after.find((x) => x.type === r.type) || after[0];
        if (r.rule && !(mine && mine.rule === r.rule)) tally[mode].rule++;
        if (r.comment && !(mine && mine.comment === r.comment)) tally[mode].comment++;
        if (hadCoords) {
          const line = (out.split(/\r?\n/).find((ln) => { const c = ln.split(";"); return (parseInt(c[0], 10) === r.from && parseInt(c[1], 10) === r.to) || (parseInt(c[0], 10) === r.to && parseInt(c[1], 10) === r.from); }) || "").split(";");
          if (![4, 5, 6, 7].every((i) => String(line[i] || "").trim() === String(raw[i]).trim())) tally[mode].coords++;
        }
        if (multi && after.length < pairCount.get(k)) tally[mode].sibling++;
      }
    }
  }

  console.log(`     rows carrying a rule ${withRule} · a comment ${withComment} · coordinates ${withCoords} · in a multi-row pair ${inMultiPair}`);
  console.log(`     LOST — new: ${JSON.stringify(tally.new)}   old: ${JSON.stringify(tally.old)}`);

  rec("the corpus actually contains rows with a rule", withRule >= 5, withRule);
  rec("…with a comment", withComment >= 5, withComment);
  rec("…with coordinates", withCoords >= 1, withCoords);
  rec("…and a pair with more than one row", inMultiPair >= 2, inMultiPair);

  rec("RUN: ⭐ an edit keeps every adjacency rule", tally.new.rule === 0, { lost: tally.new.rule, of: withRule });
  rec("RUN: …every comment", tally.new.comment === 0, { lost: tally.new.comment, of: withComment });
  rec("RUN: …every coordinate set", tally.new.coords === 0, { lost: tally.new.coords, of: withCoords });
  rec("RUN: …and the pair's other row", tally.new.sibling === 0, { lost: tally.new.sibling, of: inMultiPair });

  // ⭐ THE BUILT-IN CONTROL. The old composition must LOSE what the new one keeps, or this measures nothing.
  rec("CONTROL: the old composition lost the rules", tally.old.rule === withRule, { lost: tally.old.rule, of: withRule });
  rec("CONTROL: …and the comments", tally.old.comment === withComment, { lost: tally.old.comment, of: withComment });
  rec("CONTROL: …and the coordinates", tally.old.coords === withCoords, { lost: tally.old.coords, of: withCoords });
  rec("CONTROL: …and the pair's other row", tally.old.sibling === inMultiPair, { lost: tally.old.sibling, of: inMultiPair });
}

console.log("\n[an explicit empty string still clears]");
{
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext([fnSource("addAdjacencyRow"), fnSource("findAdjacencyRowFor"), fnSource("removeAdjacencyRowAt"), fnSource("parseAdjacencies")].join("\n"), sandbox);
  const call = (fn, ...args) => { sandbox.__a = args; return vm.runInContext(`${fn}(...__a)`, sandbox); };
  const text = "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\r\n1;2;;-1;-1;-1;-1;-1;SUEZ_CANAL;Suez\r\n";
  const ex = call("findAdjacencyRowFor", text, 1, 2, "");
  rec("the row is found", !!ex && ex.rule === "SUEZ_CANAL", ex);
  // undefined → keep; "" → clear. Both directions matter: a user removing a rule must be able to.
  const kept = call("addAdjacencyRow", call("removeAdjacencyRowAt", text, ex.index), { from: 1, to: 2, type: "", rule: ex.rule, comment: ex.comment, coords: ex.coords });
  rec("carrying it forward keeps it", /SUEZ_CANAL/.test(kept), kept);
  const cleared = call("addAdjacencyRow", call("removeAdjacencyRowAt", text, ex.index), { from: 1, to: 2, type: "", rule: "", comment: "" });
  rec("…and an explicit empty string clears it", !/SUEZ_CANAL/.test(cleared), cleared);

  // ⭐ THE RIGHT ROW. Two rows for one pair, different rules, and the one being edited is NOT first.
  // Picking by pair alone would carry the sea row's rule onto the plain row and delete the sea row.
  const two = [
    "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment",
    "11;12;sea;13;-1;-1;-1;-1;RULE_ON_THE_SEA_ROW;sea row",
    "12;11;;-1;-1;-1;-1;-1;RULE_ON_THE_PLAIN_ROW;plain row",
  ].join("\r\n");
  const plain = call("findAdjacencyRowFor", two, 11, 12, "");
  rec("editing the plain row finds the PLAIN row", !!plain && plain.rule === "RULE_ON_THE_PLAIN_ROW", plain);
  const sea = call("findAdjacencyRowFor", two, 11, 12, "sea");
  rec("…and editing the sea row finds the SEA row", !!sea && sea.rule === "RULE_ON_THE_SEA_ROW", sea);
  // …and the edit leaves the other one alone.
  const afterPlainEdit = call("addAdjacencyRow", call("removeAdjacencyRowAt", two, plain.index), { from: 11, to: 12, type: "", rule: plain.rule, comment: plain.comment, coords: plain.coords });
  rec("…and the sea row survives an edit of the plain one", /RULE_ON_THE_SEA_ROW/.test(afterPlainEdit) && /RULE_ON_THE_PLAIN_ROW/.test(afterPlainEdit), afterPlainEdit);
}

console.log(`\n=== adjacency edit keeps its rule: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
