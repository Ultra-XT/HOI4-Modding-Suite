// ⛔ #map-edit-mixes-line-endings — ONE EDIT TURNED AN ALL-CRLF STATE FILE MIXED.
//
// The map writers spliced with a bare fs.writeFileSync(p, text, "utf8") and never matched the file's own
// endings, while the block transforms insert literal "\n" — setResourcesInBlock adds
// `"\tresources = {\n\t}\n"`, and addProvinceToBlock and the buildings helpers do the same.
//
// Demonstrated before the fix: an all-CRLF state file (11 CRLF, 0 LF) came back with 11 CRLF and 3 LF —
// the three inserted lines — leaving a pocket of LF exactly where the next anchored edit will look, with
// nothing at runtime complaining. CLAUDE.md calls that "the single most common way an edit here appears to
// work and does not".
//
// Measured over the installed corpus's history/states:
//     5,193 files entirely CRLF   (Novum Vexillum, Rise of Nations, Old World Blues, The Road to 56)
//     3,385 files entirely LF     (vanilla, Millennium Dawn, the owner's kurdistan)
//         0 files mixed
// None is mixed today, so any mixing is new damage and ours.
//
// server.js has matchExistingLineEndings for exactly this, and map-data.js cannot reach it — server.js
// requires this module, not the other way round. So map-data.js has its own, with the same conservatism:
// convert ONLY when the file on disk is entirely CRLF, and leave an already-mixed file alone rather than
// rewriting lines the edit was never asked to touch.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail === undefined ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};

const eolOf = (t) => ({
  crlf: (t.match(/\r\n/g) || []).length,
  lf: (t.match(/(^|[^\r])\n/g) || []).length,
});
const mixed = (t) => { const e = eolOf(t); return !!(e.crlf && e.lf); };

// A state with NO resources block, so the edit must INSERT lines rather than only replace them.
const stateText = (eol) => [
  'state = {', '\tid = 1', '\tname = "STATE_1"', '\tmanpower = 100',
  '\thistory = {', '\t\towner = GER', '\t}',
  '\tprovinces = {', '\t\t1 2 3', '\t}', '}', '',
].join(eol);

function editIn(root, transform) {
  return md.editStateBlock(
    { modRoot: root, gameRoot: path.join(os.tmpdir(), "nova-not-the-game"), dependencyRoots: [], stateId: 1 },
    transform,
  );
}
const addSteel = (block) => md.setStateFieldsInBlock(block, { resources: { steel: 5 } });

const roots = [];
const makeMod = (text) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nova-mapeol-"));
  roots.push(root);
  const dir = path.join(root, "history", "states");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "1-Test.txt"), text, "utf8");
  return { root, file: path.join(dir, "1-Test.txt") };
};

try {
  console.log("\n-- a CRLF state file stays CRLF --");
  {
    const { root, file } = makeMod(stateText("\r\n"));
    const before = eolOf(fs.readFileSync(file, "utf8"));
    rec("precondition: the fixture is entirely CRLF", before.crlf > 0 && before.lf === 0, before);
    const r = editIn(root, addSteel);
    rec("the edit was applied", r.changed === true, r);
    const after = fs.readFileSync(file, "utf8");
    rec("…the resource really was inserted", /steel\s*=\s*5/.test(after));
    rec("…and the file is NOT mixed", !mixed(after), eolOf(after));
    rec("…it gained lines, all of them CRLF", eolOf(after).crlf > before.crlf && eolOf(after).lf === 0, eolOf(after));
  }

  console.log("\n-- an LF state file stays LF (the fix must not convert the other way) --");
  {
    const { root, file } = makeMod(stateText("\n"));
    const r = editIn(root, addSteel);
    rec("the edit was applied", r.changed === true, r);
    const after = fs.readFileSync(file, "utf8");
    rec("…the file is not mixed", !mixed(after), eolOf(after));
    rec("…and it is still LF, not silently upgraded to CRLF", eolOf(after).crlf === 0, eolOf(after));
  }

  console.log("\n-- an ALREADY-mixed file is left alone, not normalised --");
  {
    // Half CRLF, half LF: normalising it would rewrite lines this edit was never asked to touch.
    const half = 'state = {\r\n\tid = 1\r\n\tname = "STATE_1"\n\tmanpower = 100\n\tprovinces = {\r\n\t\t1\r\n\t}\n}\n';
    const { root, file } = makeMod(half);
    rec("precondition: the fixture is mixed", mixed(fs.readFileSync(file, "utf8")));
    const r = editIn(root, addSteel);
    rec("the edit still applies", r.changed === true, r);
    const after = fs.readFileSync(file, "utf8");
    rec("…the untouched CRLF lines are still CRLF", /\tid = 1\r\n/.test(after), JSON.stringify(after.slice(0, 40)));
    rec("…and the untouched LF lines are still LF", /\tmanpower = 100\n/.test(after) && !/\tmanpower = 100\r\n/.test(after));
  }
  console.log("\n-- setting a capital: the branch that PREPENDS a line was the one that mixed --");
  {
    // Replacing an existing `capital = N` edits within a line and was always safe. The else branch
    // prepends "capital = N\n", which in a CRLF country file is a pocket of LF at line 1. 1,308 of the
    // installed corpus's country files are entirely CRLF (Rise of Nations, Old World Blues, Road to 56).
    const mkCountry = (body) => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "nova-capeol-"));
      roots.push(root);
      const dir = path.join(root, "history", "countries");
      fs.mkdirSync(dir, { recursive: true });
      const f = path.join(dir, "GER.txt");
      fs.writeFileSync(f, body, "utf8");
      return { root, f };
    };
    const setCap = (root) => md.setCountryCapital({
      modRoot: root, gameRoot: path.join(os.tmpdir(), "nova-not-the-game"),
      dependencyRoots: [], tag: "GER", stateId: 42,
    });

    const withCap = mkCountry('capital = 64\r\nset_research_slots = 3\r\noob = "GER_1936"\r\n');
    rec("replacing an existing capital keeps CRLF", (setCap(withCap.root).changed && !mixed(fs.readFileSync(withCap.f, "utf8"))), eolOf(fs.readFileSync(withCap.f, "utf8")));
    rec("…and actually set it", /capital = 42/.test(fs.readFileSync(withCap.f, "utf8")));

    const noCap = mkCountry('set_research_slots = 3\r\noob = "GER_1936"\r\nset_politics = {\r\n\truling_party = fascism\r\n}\r\n');
    const r2 = setCap(noCap.root);
    const t2 = fs.readFileSync(noCap.f, "utf8");
    rec("prepending a capital to a CRLF file does not mix it", r2.changed && !mixed(t2), eolOf(t2));
    rec("…the prepended line is CRLF like the rest", /^capital = 42\r\n/.test(t2), JSON.stringify(t2.slice(0, 24)));
    rec("…and the original content survived", /ruling_party = fascism/.test(t2));
  }
  console.log("\n-- the OTHER map writers, checked rather than assumed --");
  {
    // ⚠️ A HEURISTIC AUDIT FLAGGED ELEVEN WRITERS AS UNMATCHED. TEN WERE FALSE.
    //
    // The audit asked "does this compose text with a literal \n and lack a `const eol =`?" and that missed
    // three perfectly good ways of being safe:
    //
    //   fixBuildingsTxtPlacement  keeps each line's own "\r" (`line.endsWith("\r") ? "\r" : ""`) and joins
    //                             with "\n" — correct, just not the idiom the audit looked for.
    //   createState / createStrategicRegion / createSupplyArea / createCountry / fillMissingStateGaps
    //                             write a NEW file. There is no existing convention to mix with.
    //   deleteCountry             replaces the whole file with a stub, so the result is consistent.
    //   deleteState / removeStateBlockFromFile
    //                             slice a block OUT of existing text and write the remainder.
    //
    // Only setCountryCapital was a real bug. That last pair is the one worth pinning, because "removal
    // preserves endings" is a claim about code that could stop being true.
    const root2 = fs.mkdtempSync(path.join(os.tmpdir(), "nova-mapeol-del-"));
    roots.push(root2);
    const d2 = path.join(root2, "history", "states");
    fs.mkdirSync(d2, { recursive: true });
    fs.mkdirSync(path.join(root2, "map"), { recursive: true });
    const two = path.join(d2, "1-Two.txt");
    fs.writeFileSync(two,
      'state = {\r\n\tid = 1\r\n\tname = "A"\r\n\tprovinces = {\r\n\t\t1\r\n\t}\r\n}\r\n' +
      'state = {\r\n\tid = 2\r\n\tname = "B"\r\n\tprovinces = {\r\n\t\t2\r\n\t}\r\n}\r\n', "utf8");
    const del = md.deleteState({
      modRoot: root2, gameRoot: path.join(os.tmpdir(), "nova-not-the-game"),
      dependencyRoots: [], stateId: 2,
    });
    const t3 = fs.readFileSync(two, "utf8");
    rec("deleting a state from a CRLF file removes it", del.changed && !/id = 2/.test(t3), del);
    rec("…leaves the sibling state intact", /id = 1/.test(t3));
    rec("…and does not mix the endings", !mixed(t3), eolOf(t3));
  }
} finally {
  for (const r of roots) { try { fs.rmSync(r, { recursive: true, force: true }); } catch (_) { /* scratch only */ } }
}

console.log("\n" + (fails.length ? "FAILED " + fails.length + "/" + checks : "PASSED " + checks + "/" + checks));
process.exitCode = fails.length ? 1 : 0;
