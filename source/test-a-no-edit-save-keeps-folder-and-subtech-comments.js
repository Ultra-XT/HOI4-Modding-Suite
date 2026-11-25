// `folder` and `sub_technologies` were RE-CREATED from parsed values on every save, so every comment INSIDE
// their braces was deleted — by a save the modder often did not even mean as an edit, since save-batch
// re-serializes a prerequisite PARENT whenever a child moves.
//
// Measured across vanilla + five installed workshop mods: 28 first-folder blocks and 2 sub_technologies
// blocks carry an inner comment, and all but two are in MOD files — exactly the content Nova writes into.
// The lost text is the author's reasoning:
//     name = electronics_folder #civilian_folder
//     sub_technologies = { #light_air  #not a sub_tech, but a category!  fighter_bomber3 }
// The second is a warning someone left themselves about a trap they had already fallen into.
//
// ⛔ THREE THINGS THAT ALREADY ROUND-TRIP AND MUST NOT BE "FIXED" AGAIN:
//   1. A comment on its own line ABOVE the key — leadComments carries those.
//   2. Any folder block after the FIRST — removeFirstBraceKeyBlock leaves those in extraScript.
//   3. A fully commented-out `# folder = { … }` — the remover anchors on live text, so it never matched.
// Capturing more than the first block would DOUBLE-WRITE content that is already preserved.
//
// ⭐ The rule is the one categories already uses: hand the author's own text back when the parsed value is
// unchanged, and rebuild only when they really edited it. A test that only proved preservation would pass on
// a writer that had stopped honouring edits entirely, so both directions are asserted.
"use strict";

const fs = require("fs");
const path = require("path");
const { stripJsComments } = require("./testlib-strip-comments.js");

const SRC = stripJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};

try {
  console.log("1. The raw text is captured, like categories already was");
  rec("folderRaw is captured from the UN-stripped block",
    /const folderRaw = \(\(\) => \{[\s\S]{0,220}?extractBraceBlockBodies\(rawBlk, "folder"\)/.test(SRC));
  rec("subTechnologiesRaw too",
    /const subTechnologiesRaw = \(\(\) => \{[\s\S]{0,220}?extractBraceBlockBodies\(rawBlk, "sub_technologies"\)/.test(SRC));
  rec("…and both reach the model", /folderRaw,/.test(SRC) && /subTechnologiesRaw,/.test(SRC));
  // The pattern being mirrored must still be there, or this is a lone special case rather than a family.
  rec("the categories precedent still exists", /const categoriesRaw = /.test(SRC));

  console.log("\n2. Only the FIRST folder block is captured");
  // extractBraceBlockBodies returns every match; taking [0] is what keeps this from double-writing the
  // additional folder blocks that removeFirstBraceKeyBlock deliberately leaves in extraScript.
  rec("folderRaw takes bodies[0], not all of them",
    /extractBraceBlockBodies\(rawBlk, "folder"\);\s*\n\s*return bodies\.length \? bodies\[0\] : "";/.test(SRC),
    "capturing all of them would double-write blocks extraScript already carries");
  rec("…and the extraScript split it depends on is still there",
    /removeFirstBraceKeyBlock/.test(SRC), "if this became removeBraceKeyBlocks, folderRaw would double-write");

  console.log("\n3. Unchanged means unchanged — judged on the values, not on the text");
  rec("the folder decision compares name, x and y", /nm\[1\] === String\(tech\.folder\)/.test(SRC)
    && /strip\(pos\[1\]\) === String\(px\)/.test(SRC) && /strip\(pos\[2\]\) === String\(py\)/.test(SRC));
  rec("…and it compares CODE, with the comments stripped first",
    /const bare = fRaw\.replace\(\/#\[\^\\n\]\*\/g, " "\)/.test(SRC),
    "comparing raw text including comments would never match and the escape hatch would be dead");
  rec("sub_technologies compares the id list in order",
    /sList\.every\(\(c, i\) => c === tech\.subTechnologies\[i\]\)/.test(SRC));

  console.log("\n4. A real edit still rebuilds");
  rec("the folder rebuild survives as the else branch",
    /if \(fUnchanged\) \{[\s\S]{0,400}?\} else \{[\s\S]{0,200}?name = \$\{tech\.folder\}/.test(SRC),
    "preserving unconditionally would ignore the user moving a tech");
  rec("the sub_technologies rebuild survives too",
    /if \(sUnchanged\) \{[\s\S]{0,400}?\} else \{[\s\S]{0,200}?tech\.subTechnologies\.forEach/.test(SRC));

  console.log("\n5. Behaviour, composed over the real shapes");
  // Re-express the shipped decision and run it over the actual corpus shapes.
  const folderUnchanged = (raw, folder, px, py) => {
    if (!raw) return false;
    const bare = raw.replace(/#[^\n]*/g, " ");
    const nm = /\bname\s*=\s*"?([A-Za-z0-9_.@-]+)"?/.exec(bare);
    const pos = /\bposition\s*=\s*\{[^}]*?\bx\s*=\s*("?[@A-Za-z0-9_.-]+"?)[^}]*?\by\s*=\s*("?[@A-Za-z0-9_.-]+"?)/.exec(bare);
    if (!nm || !pos) return false;
    const strip = (v) => String(v).replace(/^"|"$/g, "");
    return nm[1] === String(folder) && strip(pos[1]) === String(px) && strip(pos[2]) === String(py);
  };
  const REAL = "\n\t\t\tname = electronics_folder #civilian_folder\n\t\t\tposition = { x = 11 y = 9 }\n\t\t";
  rec("a real annotated folder is recognised as unchanged", folderUnchanged(REAL, "electronics_folder", 11, 9) === true,
    "this is the case whose comment was being deleted");
  rec("…moving the tech makes it changed", folderUnchanged(REAL, "electronics_folder", 12, 9) === false);
  rec("…re-foldering makes it changed", folderUnchanged(REAL, "air_techs_folder", 11, 9) === false);
  // @variable positions must not be mistaken for a change — they round-trip as tokens.
  const VAR = '\n\t\t\tname = land_doctrine_folder\n\t\t\tposition = { x = @x_pos y = 4 }\n\t\t';
  rec("an @variable position still compares equal", folderUnchanged(VAR, "land_doctrine_folder", "@x_pos", 4) === true);

  const subUnchanged = (raw, list) => {
    const l = raw ? raw.replace(/#[^\n]*/g, " ").split(/\s+/).map((t) => t.trim()).filter((t) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(t)) : null;
    return !!(l && l.length === list.length && l.every((c, i) => c === list[i]));
  };
  // ⚠️ THE REAL BYTES, MULTI-LINE. Written on one line this fixture means something else entirely: `#` runs
  // to end of LINE, so a single-line version puts fighter_bomber3 INSIDE the comment and the block has no
  // live members at all. The first draft of this test did exactly that and failed — the fixture was wrong,
  // not the writer. Copied from
  // workshop/content/394360/820260968/common/technologies/air_techs.txt:545-548.
  const SUB = "\n\t\t\t#light_air\t\t\t#not a sub_tech, but a category!\n\t\t\tfighter_bomber3\n\t\t";
  rec("the annotated sub_technologies case is unchanged", subUnchanged(SUB, ["fighter_bomber3"]) === true,
    "the commented-out entries must not be read as members");
  // …and the one-line form really does mean no members, which is why the fixture shape matters.
  rec("…while a one-line form comments out everything after the first #",
    subUnchanged("#light_air fighter_bomber3", ["fighter_bomber3"]) === false,
    "HOI4 comments run to end of line");
  rec("…and adding a real entry makes it changed", subUnchanged(SUB, ["fighter_bomber3", "heavy_fighter1"]) === false);

  console.log("\n6. The corpus this exists for");
  // DERIVED: count blocks whose body actually contains a comment, from the installed files.
  const maskComments = (s) => {
    const out = s.split(""); let inQ = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '"') inQ = !inQ;
      if (!inQ && c === "#") { while (i < s.length && s[i] !== "\n") { out[i] = " "; i++; } }
    }
    return out.join("");
  };
  const roots = [];
  const game = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
  if (fs.existsSync(game)) roots.push(game);
  const ws = "D:/SteamLibrary/steamapps/workshop/content/394360";
  if (fs.existsSync(ws)) for (const d of fs.readdirSync(ws)) {
    if (fs.existsSync(path.join(ws, d, "common", "technologies"))) roots.push(path.join(ws, d));
  }
  let annotated = 0, filesSeen = 0;
  for (const root of roots) {
    const dir = path.join(root, "common", "technologies");
    let files = []; try { files = fs.readdirSync(dir).filter((f) => /\.txt$/i.test(f)); } catch (_) { continue; }
    for (const f of files) {
      filesSeen++;
      let text; try { text = fs.readFileSync(path.join(dir, f), "utf8"); } catch (_) { continue; }
      const masked = maskComments(text);
      for (const kw of ["folder", "sub_technologies"]) {
        const re = new RegExp("(?:^|\\n)\\s*" + kw + "\\s*=\\s*\\{", "g");
        let m;
        while ((m = re.exec(masked)) !== null) {
          const open = masked.indexOf("{", m.index);
          if (open < 0) break;
          let d = 0, close = -1;
          for (let i = open; i < masked.length; i++) {
            if (masked[i] === "{") d++;
            else if (masked[i] === "}") { d--; if (d === 0) { close = i; break; } }
          }
          if (close < 0) break;
          if (text.slice(open, close + 1) !== masked.slice(open, close + 1)) annotated++;
          re.lastIndex = close;
        }
      }
    }
  }
  rec("real technology files were scanned", filesSeen > 100, filesSeen + " files across " + roots.length + " roots");
  rec("…and they really do carry annotated folder / sub_technologies blocks", annotated >= 10,
    annotated + " blocks with a comment inside — every one was being deleted on a no-edit save");

  console.log(`\n=== a no-edit save keeps folder and subtech comments: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
  process.exitCode = 1;
}
