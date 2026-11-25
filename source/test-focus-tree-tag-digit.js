// #focus-tree-tag-letters-only — THE FOCUS TREE MAKER REFUSED THE TAG NOVA'S OWN MAP HANDS OUT.
//
// /api/map/free-tag pre-fills the Map's ✨ New country box with a letter + two digits (Z00, Z01, …) on
// purpose: vanilla and the workshop mods use 3-letter tags, so a letter+digits tag can never clash. That is
// the DEFAULT on the beginner path — draw a country on the map, accept the suggestion, done.
//
// Then, in the Focus Tree maker, assigning a tree to that country was refused outright:
//     "Z00" is not a country tag. A tag is 2-3 letters, like GER or SOV.
// The writer's gate was /^[A-Za-z]{2,3}$/ and it was deliberately matched to the READER,
// parseFocusTreeCountryBlock, whose own tagRe was /\b(original_)?tag\s*=\s*([A-Za-z]{2,3})\b/ — so the gate
// was telling the truth about Nova, and both halves were wrong about HOI4.
//
// 🈯 79 of the 1,186 country tags vanilla and the installed workshop mods declare carry a digit — vanilla's
// own dynamic countries D01…, C01…. A digit is only illegal as the FIRST character, where a Paradox token
// may not begin with one. #country-tag-shape
//
// Both halves move together. Widening the writer alone would write a tree the reader still cannot parse,
// which is exactly the one-way door the gate's comment was put there to prevent: the tree reports
// simple:false and every later repair through the same endpoint is refused.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-fttag-"));
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
const MOD = path.join(ROOT, "ftmod");
fs.mkdirSync(path.join(MOD, "common", "national_focus"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="FtMod"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "ftmod.mod"), 'name="FtMod"\npath="' + toPosix(MOD) + '"\nsupported_version="1.19.*"\n');

const treeText = (tag) => [
  "focus_tree = {",
  "\tid = zeph_tree",
  "\tcountry = {",
  "\t\tfactor = 0",
  "\t\tmodifier = {",
  "\t\t\tadd = 10",
  `\t\t\ttag = ${tag}`,
  "\t\t}",
  "\t}",
  "",
  "\tfocus = {",
  "\t\tid = zeph_first_focus",
  "\t\ticon = GFX_goal_generic_construct_civ_factory",
  "\t\tx = 0",
  "\t\ty = 0",
  "\t\tcost = 7",
  "\t}",
  "}",
  "",
].join("\n");

const REL = "common/national_focus/zeph_tree.txt";
const ABS = path.join(MOD, "common", "national_focus", "zeph_tree.txt");
const seed = (tag) => fs.writeFileSync(ABS, treeText(tag), "utf8");

let PORT = 51450;
(async () => {
  let srv = null;
  try {
    srv = await new Promise((r) => { const s = createApp().listen(++PORT, () => r(s)); });
    const B = `http://127.0.0.1:${PORT}`;
    const props = () => fetch(`${B}/api/focus/tree-properties?modPath=${encodeURIComponent(MOD)}&relPath=${encodeURIComponent(REL)}`)
      .then((r) => r.json()).catch((e) => ({ error: String(e) }));
    const setProps = (body) => fetch(`${B}/api/focus/tree-properties`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ modPath: MOD, relPath: REL, ...body }),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) })).catch((e) => ({ status: 0, body: { error: String(e) } }));

    let suggested = "";
    console.log("\n[the seam] the tag the Map suggests must be assignable in the Focus Tree maker");
    {
      seed("GER");
      const free = await fetch(`${B}/api/map/free-tag?modPath=${encodeURIComponent(MOD)}`).then((r) => r.json()).catch(() => ({}));
      suggested = String(free.tag || "");
      console.log(`     the Map suggests: ${suggested || "(none)"}`);
      rec("the Map really does suggest a digit-bearing tag", /^[A-Z][0-9]{2}$/.test(suggested), free);

      const r = await setProps({ tag: suggested });
      rec("assigning the tree to it is accepted", r.status < 400 && r.body && r.body.ok !== false, { status: r.status, body: r.body });
      const onDisk = fs.readFileSync(ABS, "utf8");
      rec("…and the tag really was written", new RegExp(`tag\\s*=\\s*${suggested}\\b`).test(onDisk), onDisk.slice(0, 240));
    }

    console.log("\n[the reader] must then recognise what the writer just wrote");
    {
      // This is the half the gate's own comment exists to protect: a tree the reader cannot parse reports
      // simple:false, and every later repair through this endpoint is refused — a one-way door.
      const d = await props();
      const t = (d.trees || [])[0] || {};
      console.log(`     read back: tag=${t.tag || "(none)"} simple=${t.simple}`);
      rec("the tree reads back as a plain single-country tree", t.simple === true, t);
      rec("…owned by the tag that was written", String(t.tag || "") === suggested, { got: t.tag, want: suggested });
    }

    console.log("\n[a second edit] the door is not one-way");
    {
      // The endpoint refuses a body with nothing to change, so a weight edit carries the tag with it —
      // which is what the panel's Save does too.
      const r = await setProps({ tag: suggested, weight: 25 });
      rec("the tree can still be edited afterwards", r.status < 400 && r.body && r.body.ok !== false, { status: r.status, body: r.body });
      const t = ((await props()).trees || [])[0] || {};
      rec("…and the change landed", Number(t.weight) === 25, t);
      rec("…without losing the country", /^[A-Z][0-9]{2}$/.test(String(t.tag || "")), t);
    }

    console.log("\n[a tree that already names a digit-bearing tag] is read, not written off");
    {
      seed("D01"); // vanilla's own dynamic-country tag shape
      const t = ((await props()).trees || [])[0] || {};
      console.log(`     read back: tag=${t.tag || "(none)"} simple=${t.simple}`);
      rec("D01 is recognised as the owner", String(t.tag || "") === "D01", t);
      rec("…and the tree is editable", t.simple === true, t);
    }

    console.log("\n[the owner DIALOG] the client half must accept it too");
    {
      // ⚠️ THE HALF THAT SHIPPED ALONE. Widening the server guard achieves nothing while the dialog that
      // calls it still refuses the tag: public/app.js gates Save on its own pattern before ever sending, so
      // a country created the recommended way — the Map suggests Z00 — could not be given a focus tree at
      // all. EVALUATE the gate rather than grep for it: a wrong-but-differently-spelled pattern also
      // satisfies "the old spelling is gone", which is how this slipped through the first time.
      const app = fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8");
      const m = /if \(!shared && !(\/\^.*?\/)\.test\(tag\)\) \{/.exec(app);
      rec("the owner dialog's tag gate is findable", !!m, "gate not found in public/app.js");
      if (m) {
        // eslint-disable-next-line no-new-func
        const re = Function(`return ${m[1]};`)();
        console.log(`     gate: ${m[1]}`);
        // 🈯 "GR" and "A1" are the ones this gate used to LET THROUGH: it adopted the digit half of
        // #country-tag-shape and not the length half, so it stood alone in accepting {1,2} while every other
        // create path required exactly 3. A HOI4 tag is exactly 3 characters — measured across 746
        // national_focus files in 10 roots, 17,755 tags are 3 long and not one is shorter — so a 2-character
        // owner writes a tree that parses, saves, reloads, and silently belongs to nobody.
        for (const [tg, want] of [["GER", true], ["SOV", true], ["Z00", true], ["D01", true],
          ["0AB", false], ["ZZZZ", false], ["Z", false], ["GR", false], ["A1", false], ["", false]]) {
          rec(`the dialog ${want ? "accepts" : "refuses"} ${JSON.stringify(tg)}`, re.test(tg) === want, { tg, got: re.test(tg), want });
        }
      }
    }

    console.log("\n[the source] every copy of the shape moved, not just the one the endpoint hit");
    {
      // The same pattern lived in FOUR places in server.js and the first pass only moved two of them: the
      // `leftover` strip inside parseFocusTreeCountryBlock left "tag = Z00" behind, so the tag parsed and
      // the tree was still declared not-simple, and applySharedFocusOffset would have dropped the offset
      // for such a country and drawn its shared focuses on top of its own. A source guard, because the
      // offset path needs a shared-tree fixture to reach and the parse path already has one above.
      const sv = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
      const stragglers = (sv.match(/\[A-Za-z\]\{2,3\}/g) || []).length;
      rec("no letters-only tag pattern is left in server.js", stragglers === 0, stragglers + " remaining");
    }

    console.log("\n[CONTROL] a plain 3-letter tag is unchanged, and rubbish is still refused");
    {
      seed("GER");
      const ok = await setProps({ tag: "SOV" });
      rec("CONTROL: a 3-letter tag still works", ok.status < 400 && ok.body && ok.body.ok !== false, ok.body);
      const t = ((await props()).trees || [])[0] || {};
      rec("CONTROL: …and reads back", String(t.tag || "") === "SOV" && t.simple === true, t);

      // Without these, "widen the gate" would be indistinguishable from "remove the gate" — and the gate
      // exists because an unparseable country rule bricks the file for this editor.
      // "GR" is here for the same reason as above: the SERVER gate was {1,2} too, mirroring the reader's
      // deliberately-loose tagRe. The reader stays loose — a hand-written tree must still parse and stay
      // repairable — but the writer must not mint an owner no country can ever have.
      for (const bad of ["0AB", "ZZZZ", "Z", "GR", "hello world", "Z-0"]) {
        const r = await setProps({ tag: bad });
        rec(`CONTROL: "${bad}" is still refused`, r.status >= 400 || (r.body && r.body.ok === false) || !!(r.body || {}).error, { bad, status: r.status, body: r.body });
      }
      const after = ((await props()).trees || [])[0] || {};
      rec("CONTROL: …and none of them changed the file", String(after.tag || "") === "SOV", after);
    }

    srv.closeAllConnections(); srv.close(); srv = null;
    console.log(`\n=== focus tree tag digit: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
