// #starter-tree-duplicate-ids — /api/mod/copy-generic-focus-tree derives the prefix for the copied focus ids
// by stripping a trailing "focus" / "_focus" / "_focus_tree" from the file's basename. That is a name-SHAPE
// guess with no uniqueness check, so `alpha.txt` and `alpha_focus.txt` both reduce to `alpha` and every focus
// in the second copy is given an id the first copy already owns.
//
// Focus ids are GLOBALLY unique in HOI4, so the second tree's focuses are simply dead. And because the
// localisation keys ARE the focus ids, both trees also fight over the same loc entries — the exact collision
// the prefix rename exists to prevent.
//
// The `_focus` suffix is the dominant naming convention in Millennium Dawn, and the "+ New Tree" prompt in
// the UI offers "nikos_focus" as its own worked example, so this is reachable by following Nova's own advice.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-copygen-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, ok, detail) {
  checks++;
  if (ok) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

const MOD = path.join(ROOT, "copymod");
const NF = path.join(MOD, "common", "national_focus");
fs.mkdirSync(NF, { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="CopyMod"\nsupported_version="1.18.*"\n', "utf8");

// The mod ships its own generic tree, so the test needs no game install.
fs.writeFileSync(path.join(NF, "generic.txt"), [
  "focus_tree = {",
  "\tid = generic",
  "\tcountry = { factor = 1 }",
  "\tdefault = yes",
  "\tfocus = {",
  "\t\tid = generic_industry",
  "\t\tx = 0",
  "\t\ty = 0",
  "\t}",
  "\tfocus = {",
  "\t\tid = generic_army",
  "\t\tx = 2",
  "\t\ty = 0",
  "\t\tprerequisite = { focus = generic_industry }",
  "\t}",
  "}",
  "",
].join("\n"), "utf8");

const idsIn = (file) => {
  let t = "";
  try { t = fs.readFileSync(path.join(NF, file), "utf8"); } catch (_) { return []; }
  const scan = t.replace(/#[^\n]*/g, (c) => " ".repeat(c.length));
  return [...scan.matchAll(/(?:^|\n)[ \t]*id[ \t]*=[ \t]*([A-Za-z0-9_]+)/g)].map((m) => m[1]);
};

const PORT = 42449;
const app = createApp();
const server = app.listen(PORT, async () => {
  const copy = async (fileName) => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/mod/copy-generic-focus-tree`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ modPath: MOD, fileName }),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };

  try {
    console.log("\n[first copy] a plain name");
    let r = await copy("alpha");
    rec("the first copy succeeded", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    const firstIds = idsIn("alpha.txt");
    rec("it produced focus ids", firstIds.length >= 3, firstIds);

    console.log("\n[second copy] a name differing ONLY by a trailing _focus");
    r = await copy("alpha_focus");
    rec("the second copy succeeded", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    const secondIds = idsIn("alpha_focus.txt");
    rec("it produced focus ids too", secondIds.length >= 3, secondIds);

    console.log("\n[the contract] no id may be shared between the two trees");
    const shared = firstIds.filter((id) => secondIds.includes(id));
    rec("the two trees share NO focus id", shared.length === 0, { shared, firstIds, secondIds });

    console.log("\n[control] the first tree was not altered by the second copy");
    // Guards against a "fix" that renames the earlier tree instead of the new one.
    rec("the first tree's ids are unchanged",
      JSON.stringify(idsIn("alpha.txt")) === JSON.stringify(firstIds), { now: idsIn("alpha.txt"), before: firstIds });

    console.log("\n[control] ordinary names still get the pretty stripped prefix");
    // Without this the fix could just always use the raw basename, which would make every id uglier.
    r = await copy("bravo_focus");
    rec("a third copy with a free name succeeded", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    const thirdIds = idsIn("bravo_focus.txt");
    rec("…and used the STRIPPED prefix (bravo_, not bravo_focus_)",
      thirdIds.some((id) => /^bravo_/.test(id)) && !thirdIds.some((id) => /^bravo_focus_/.test(id)), thirdIds);

    console.log("\n[three-way] a third colliding name must also stay distinct");
    r = await copy("alpha_focus_tree");
    rec("the fourth copy succeeded", r.status === 200 && r.body && r.body.ok !== false, r.body || r.status);
    const fourthIds = idsIn("alpha_focus_tree.txt");
    const allPrev = new Set([...firstIds, ...secondIds]);
    rec("it collides with neither earlier tree",
      fourthIds.filter((id) => allPrev.has(id)).length === 0,
      { collides: fourthIds.filter((id) => allPrev.has(id)), fourthIds });

    console.log("\n[loc keys] the ids are the loc keys, so those cannot collide either");
    const locDir = path.join(MOD, "localisation", "english");
    let locText = "";
    try {
      for (const f of fs.readdirSync(locDir)) locText += fs.readFileSync(path.join(locDir, f), "utf8") + "\n";
    } catch (_) {}
    if (locText) {
      const dupLoc = [...locText.matchAll(/^[ \t]*([A-Za-z0-9_]+):\d*[ \t]*"/gm)].map((m) => m[1]);
      const seen = new Set(), dups = new Set();
      for (const k of dupLoc) { if (seen.has(k)) dups.add(k); seen.add(k); }
      rec("no localisation key is defined twice", dups.size === 0, [...dups].slice(0, 8));
    } else {
      rec("(no localisation written by this endpoint — nothing to check)", true, "");
    }

    console.log(`\n=== copy-generic unique ids: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) {
      fails.forEach((f) => console.log("   FAILED: " + f));
      process.exitCode = 1;
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
server.on("error", (e) => {
  console.error("listen error:", e.message);
  process.exitCode = 1;
});
