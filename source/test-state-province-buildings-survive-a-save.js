// #province-building-reflow-swallows-the-brace · #state-writes-land-in-comments (the READER half) ·
// #building-key-with-a-digit-is-invisible
//
// THREE WAYS SAVING A STATE DAMAGED IT — all in one function family, all found by round-tripping the real
// corpus with NO edit applied. The map panel binds its naval_base box to the CLICKED province and posts
// provinceBuildings on every save, so "press Save state with a province selected" is enough to reach them.
//
// 1. THE CLOSING BRACE LANDED INSIDE A COMMENT AND THE STATE DISAPPEARED.
//    setProvinceBuildingInHistory re-emitted the block on one line — `<pid> = { <inner trimmed> }` — so a
//    block written across lines whose last line carries a comment came back as
//        3838 = { bunker = 1 # coastal }
//    and never closed. history { } and state { } never closed either: the file stopped parsing and the state
//    vanished from Nova and from HOI4. 12 of 6,123 state files. The same reflow rewrote bytes on 2,570 of
//    2,762 (state, province) pairs where nothing had changed.
//
// 2. THE READER SAW STRAIGHT THROUGH A COMMENT.
//    The WRITER masks comments so a commented-out province block — how vanilla disables one — is not
//    mistaken for the real thing. getProvinceBuildingsForProvince did not. 27 province blocks in the corpus
//    exist only inside a comment and it read 15 of them as live, including vanilla's own disabled
//    `dam = 1`. The panel showed a building the author had turned off; saving then materialised it, because
//    the comment-aware writer found nothing to edit and ADDED a live block.
//
// 3. A BUILDING WHOSE NAME CONTAINS A DIGIT WAS DELETED.
//    Building keys were matched as /[a-z_]+/ throughout, which cannot match `bunker2`: after `bunker` comes
//    `2`, not `=`. The getter read nothing, the setter refused the key, and the "is this block empty now?"
//    test found no assignment and deleted the whole block. `bunker2` appears 26 times and 9 province blocks
//    across 9 Old World Blues states were removed by a save that changed nothing.
//
// MEASURED over 6,123 state files / 4,272 (state, province) pairs, before → after:
//     braces broken by a no-op save        12 files → 0
//     commented blocks read as live        15 of 27 → 0
//     province blocks deleted               9 files → 0
//     no-op saves that rewrote bytes          2,570 → 1
//
// That last 1 is deliberate: `10698 = { #naval_base = 1 }` in Old World Blues holds nothing live, and the
// writer tidies an empty block away on purpose rather than leave `1234 = { }` for the engine.
"use strict";
const fs = require("fs");
const path = require("path");

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
const M = require("./map-data.js");
const { stripJsComments } = require("./testlib-strip-comments.js");
const SRC = stripJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));

const maskComments = (t) => String(t).replace(/#[^\r\n]*/g, (m) => " ".repeat(m.length));
function balanced(text) {
  let d = 0;
  for (const ch of maskComments(text)) { if (ch === "{") d++; else if (ch === "}") { d--; if (d < 0) return false; } }
  return d === 0;
}
const state = (inner) => `state = {\n\tid = 1\n\tname = "TEST"\n\thistory = {\n\t\towner = GER\n\t\tbuildings = {\n${inner}\n\t\t}\n\t}\n\tprovinces = {\n\t\t100 200\n\t}\n}\n`;

console.log("\n[a block written across lines keeps its shape]");
{
  // ⭐ THE ONE THAT BROKE FILES: a trailing comment on the last line of the block.
  const withComment = state("\t\t\t100 = {\n\t\t\t\tbunker = 1 # coastal, keep\n\t\t\t}");
  const out = M.setProvinceBuildingInHistory(withComment, 100, "naval_base", 0);
  rec("the braces still balance", balanced(out), out);
  rec("…the comment survives", /# coastal, keep/.test(out), out);
  rec("…and the closing brace is still on its own line, not behind the #",
    /bunker = 1 # coastal, keep\r?\n\s*\}/.test(out), out);
  rec("…and a no-op save changes nothing at all", out === withComment, { changed: out !== withComment });

  // A real edit still edits, and still keeps the shape.
  const edited = M.setProvinceBuildingInHistory(withComment, 100, "bunker", 3);
  rec("a real edit changes the value", /bunker = 3/.test(edited), edited);
  rec("…keeps the braces balanced", balanced(edited), edited);
  rec("…and keeps the comment", /# coastal, keep/.test(edited), edited);

  // ⭐ ADDING a key to a block whose last line ends in a comment. The reflow was not the only way to lose
  // something behind a `#` — appending after `inner.replace(/\s*$/, " ")` puts the new assignment on the
  // commented line, where the engine never sees it. The back-out for this stayed silent until the case
  // existed: the fixtures only covered editing a key that was already there.
  const appended = M.setProvinceBuildingInHistory(withComment, 100, "naval_base", 2);
  rec("adding a key does not land inside a trailing comment",
    /naval_base = 2/.test(maskComments(appended)), appended);
  rec("…the braces still balance", balanced(appended), appended);
  rec("…and the existing key and its comment survive", /bunker = 1/.test(appended) && /# coastal, keep/.test(appended), appended);
}

console.log("\n[a commented-out block is not a live one]");
{
  const commented = state("\t\t\tindustrial_complex = 1\n\t\t\t# 100 = {\n\t\t\t# \tnaval_base = 1\n\t\t\t# }");
  rec("the reader does not see it", M.getProvinceBuildingsForProvince(commented, 100) === null,
    M.getProvinceBuildingsForProvince(commented, 100));
  // A live block is still read.
  const live = state("\t\t\t100 = {\n\t\t\t\tnaval_base = 2\n\t\t\t}");
  const read = M.getProvinceBuildingsForProvince(live, 100);
  rec("…but a live one is", !!read && read.naval_base === 2, read);
  // A commented KEY inside a live block is disabled too.
  const mixed = state("\t\t\t100 = {\n\t\t\t\tnaval_base = 2\n\t\t\t\t# bunker = 9\n\t\t\t}");
  const readMixed = M.getProvinceBuildingsForProvince(mixed, 100);
  rec("…and a commented key inside a live block is not reported", !!readMixed && readMixed.naval_base === 2 && readMixed.bunker === undefined, readMixed);
  // CONTROL, behavioural rather than textual. This used to grep for the literal
  // `provRe.exec(maskComments(bInner))`, which broke the moment the brace-counting locator replaced that
  // regex — a control that fails on a refactor it should not care about teaches people to edit controls.
  // Ask the writer to do the thing instead: a commented-out block must not be found, so setting a value
  // must ADD a live block rather than edit the comment.
  {
    const c = state("\t\t\t# 100 = { naval_base = 3 }");
    const out = M.setProvinceBuildingInHistory(c, 100, "naval_base", 7);
    rec("CONTROL: the writer still masks comments too",
      /#\s*100 = \{ naval_base = 3 \}/.test(out) && /(?:^|\n)\s*100\s*=\s*\{[^#]*naval_base\s*=\s*7/.test(out),
      { hint: "the writer half of #state-writes-land-in-comments regressed", out: out.slice(-220) });
  }
  // …and the locator it now uses must count braces, or a nested sub-block ends the block early.
  rec("CONTROL: the writer locates the block by counting braces",
    /findProvinceBuildingBlock\(bInner, pid\)/.test(SRC),
    "a [^{}]* match cannot span `naval_headquarters = { … }` — #a-nested-sub-block-hides-the-port");
}

console.log("\n[a building name with a digit is a building name]");
{
  const digit = state("\t\t\t100 = {\n\t\t\t\tbunker2 = 1\n\t\t\t}");
  const read = M.getProvinceBuildingsForProvince(digit, 100);
  rec("the reader reports it", !!read && read.bunker2 === 1, read);
  // ⭐ THE DANGEROUS ONE: a no-op save must not judge the block empty and delete it.
  const out = M.setProvinceBuildingInHistory(digit, 100, "naval_base", 0);
  rec("a no-op save does not delete the block", /bunker2 = 1/.test(out), out);
  rec("…and changes nothing", out === digit, { changed: out !== digit });
  const edited = M.setProvinceBuildingInHistory(digit, 100, "bunker2", 4);
  rec("…and the key can actually be edited", /bunker2 = 4/.test(edited), edited);
  // A block that really IS empty of live assignments is still tidied away, as designed.
  const onlyComment = state("\t\t\t100 = {\n\t\t\t\t# naval_base = 1\n\t\t\t}");
  const tidied = M.setProvinceBuildingInHistory(onlyComment, 100, "naval_base", 0);
  rec("CONTROL: a block with nothing live in it is still removed", !/100 = \{/.test(maskComments(tidied)), tidied);
}

console.log("\n[nothing to write means nothing is written]");
{
  const noBuildings = 'state = {\n\tid = 1\n\thistory = {\n\t\towner = GER\n\t}\n\tprovinces = {\n\t\t100\n\t}\n}\n';
  const out = M.setProvinceBuildingInHistory(noBuildings, 100, "naval_base", 0);
  rec("a state with no buildings block is left alone", out === noBuildings, out);
  const added = M.setProvinceBuildingInHistory(noBuildings, 100, "naval_base", 2);
  rec("…but a real value still creates one", /naval_base = 2/.test(added) && balanced(added), added);
}

console.log("\n[RUN IT] over every state file installed on this machine");
{
  const ROOTS = [
    ["vanilla", "D:/SteamLibrary/steamapps/common/Hearts of Iron IV"],
    ["Millennium Dawn", "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649"],
    ["Road to 56", "D:/SteamLibrary/steamapps/workshop/content/394360/820260968"],
    ["Old World Blues", "D:/SteamLibrary/steamapps/workshop/content/394360/2265420196"],
    ["Rise of Nations", "D:/SteamLibrary/steamapps/workshop/content/394360/2026448968"],
  ].filter(([, r]) => fs.existsSync(path.join(r, "history", "states")));
  console.log("     corpora found: " + (ROOTS.map((r) => r[0]).join(", ") || "(none — corpus checks skipped)"));

  if (!ROOTS.length) {
    rec("no corpus on this machine — the fixture checks above still ran", true, "");
  } else {
    let files = 0, pairs = 0, broke = 0, changed = 0, deleted = 0, commentedReadLive = 0, commentedBlocks = 0;
    for (const [, root] of ROOTS) {
      const dir = path.join(root, "history", "states");
      for (const name of fs.readdirSync(dir)) {
        if (!name.endsWith(".txt")) continue;
        let text; try { text = fs.readFileSync(path.join(dir, name), "utf8"); } catch (_) { continue; }
        files++;
        const bare = text.replace(/#[^\r\n]*/g, "");
        for (const m of text.matchAll(/#[^\r\n]*?(?<![0-9])(\d+)\s*=\s*\{/g)) {
          const pid = parseInt(m[1], 10);
          if (new RegExp(`(?<![0-9])${pid}\\s*=\\s*\\{`).test(bare)) continue;
          commentedBlocks++;
          let live = null; try { live = M.getProvinceBuildingsForProvince(text, pid); } catch (_) {}
          if (live) commentedReadLive++;
        }
        for (const pid of new Set([...bare.matchAll(/(?<![0-9])(\d+)\s*=\s*\{[^{}]*\}/g)].map((x) => parseInt(x[1], 10)))) {
          pairs++;
          let cur = 0;
          try { const b = M.getProvinceBuildingsForProvince(text, pid); cur = (b && b.naval_base) || 0; } catch (_) {}
          let out; try { out = M.setProvinceBuildingInHistory(text, pid, "naval_base", cur); } catch (_) { continue; }
          if (!balanced(out)) broke++;
          if (out !== text) changed++;
          const had = new RegExp(`(?<![0-9])${pid}\\s*=\\s*\\{`).test(bare);
          const still = new RegExp(`(?<![0-9])${pid}\\s*=\\s*\\{`).test(out.replace(/#[^\r\n]*/g, ""));
          const liveKeys = ((bare.match(new RegExp(`(?<![0-9])${pid}\\s*=\\s*\\{([^{}]*)\\}`)) || [, ""])[1].match(/[A-Za-z_][A-Za-z0-9_]*\s*=\s*\d+/g) || []).length;
          if (had && !still && liveKeys > 0) deleted++;
        }
      }
    }
    console.log(`     ${files} state files · ${pairs} (state, province) pairs · ${commentedBlocks} blocks that exist only in a comment`);
    console.log(`     braces broken ${broke} · blocks deleted ${deleted} · commented read as live ${commentedReadLive} · no-op byte rewrites ${changed}`);
    rec("the corpus is actually there", files > 500 && pairs > 500, { files, pairs });
    rec("RUN: ⭐ a no-op save never unbalances a state file", broke === 0, { broke });
    rec("RUN: ⭐ …never deletes a province block that had live buildings", deleted === 0, { deleted });
    rec("RUN: ⭐ …and no commented-out block is read as live", commentedReadLive === 0, { commentedReadLive, of: commentedBlocks });
    // One legitimate change: a block holding only a commented-out building is tidied away by design.
    rec("RUN: …and a no-op save rewrites at most the blocks that hold nothing live", changed <= 2, { changed });
  }
}

console.log(`\n=== state province buildings survive a save: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
