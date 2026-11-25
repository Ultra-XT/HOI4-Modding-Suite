// #unbalanced-file-blamed-the-spirit — one missing brace made Nova report the wrong problem.
//
// A single unclosed `{` anywhere in an ideas file stops the block reader finding ANY spirit in it. Editing a
// spirit that is plainly sitting in the file then failed with "spirit not found in the selected idea file",
// sending the modder to look for a missing spirit instead of a missing brace.
//
// A half-finished edit, a merge, or another tool can leave a file unbalanced at any moment, so this is a
// normal thing to walk into rather than an exotic one.
//
// The important half is what did NOT go wrong, and it is asserted here so it stays that way: the save is
// REFUSED and the file is left byte-for-byte alone. A serializer that rebuilt the file from what it managed
// to parse would have silently deleted the unreadable spirit — the worst outcome available here, and the
// reason this was worth probing at all.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-unbalanced-msg-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const MOD = path.join(ROOT, "unbalanced_probe");
fs.mkdirSync(path.join(MOD, "common", "ideas"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="UnbalancedProbe"\nsupported_version="1.19.*"\n');

const REL = "common/ideas/zz_probe.txt";
const abs = path.join(MOD, "common", "ideas", "zz_probe.txt");

// Identical files apart from ONE closing brace, so the difference in behaviour has a single cause.
const build = (closeIt) => [
  "ideas = {",
  "\tcountry = {",
  "\t\tzz_healthy = {",
  "\t\t\tremoval_cost = -1",
  "\t\t\tpicture = academy_scholarships_spirit",
  "\t\t\tmodifier = {",
  "\t\t\t\tstability_factor = 0.03",
  "\t\t\t}",
  "\t\t}",
  "\t\tzz_other = {",
  "\t\t\tremoval_cost = -1",
  "\t\t\tmodifier = {",
  "\t\t\t\twar_support_factor = 0.10",
  ...(closeIt ? ["\t\t\t}"] : []),
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n");

const PORT = 39627, app = createApp();
const server = app.listen(PORT, async () => {
  const save = () => fetch("http://127.0.0.1:" + PORT + "/api/ideas/upsert-definition", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      modPath: MOD, ideaId: "zz_healthy", targetRelativeFile: REL,
      targetLocalizationPath: "localisation/english/custom_ideas_l_english.yml",
      name: "Healthy", desc: "d", picture: "GFX_idea_generic_army_bonus",
      selectedEffects: ["modifier = {\nstability_factor = 0.04\n}"],
      mode: "edit", category: "country", traits: [], cost: "", removalCost: "", ledger: "",
    }),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const breathe = () => new Promise((r) => setTimeout(r, 180));

  try {
    // ── the same request against a BALANCED file must succeed ─────────────────────────────────────
    fs.writeFileSync(abs, build(true), "utf8");
    const good = await save();
    await breathe();
    ok("editing a spirit in a well-formed file → 200", good.s === 200, good.b);

    // ── …and the only change is one missing brace ────────────────────────────────────────────────
    const broken = build(false);
    fs.writeFileSync(abs, broken, "utf8");
    const bad = await save();
    await breathe();
    const msg = String((bad.b && bad.b.error) || "");
    ok("the same edit against an unbalanced file is refused", bad.s === 400, bad.b);
    ok("…and the message blames the BRACES, not a missing spirit", /unbalanced braces/i.test(msg), msg);
    ok("…naming the file to look in", /zz_probe\.txt/.test(msg), msg);
    ok("…saying which way it is unbalanced", /closing brace is missing/i.test(msg), msg);
    ok("…and no longer claims the spirit is not there", !/spirit not found/i.test(msg), msg);
    ok("…while telling the modder nothing was written", /Nothing was written/i.test(msg), msg);

    // ── the file must be untouched: refusing is only safe if it really wrote nothing ──────────────
    ok("the unreadable file is left byte-for-byte alone", fs.readFileSync(abs, "utf8") === broken, "file changed");
    ok("…so the unparseable spirit is still there", /zz_other/.test(fs.readFileSync(abs, "utf8")));
    ok("…with its contents intact", /war_support_factor = 0\.10/.test(fs.readFileSync(abs, "utf8")));

    // ── an EXTRA closing brace is the other direction, and should say so ─────────────────────────
    const extra = build(true).replace("\t}\n}\n", "\t}\n}\n}\n");
    fs.writeFileSync(abs, extra, "utf8");
    const bad2 = await save();
    await breathe();
    const msg2 = String((bad2.b && bad2.b.error) || "");
    // An EXTRA closing brace is caught earlier, by the pre-existing brace-balance guard on the assembled
    // script, which words it differently. That is fine — what matters is that it is refused, that the
    // message says the problem is brace balance rather than a missing spirit, and that nothing is written.
    ok("an extra closing brace is also refused", bad2.s === 400, bad2.b);
    ok("…and the message still points at brace balance", /brace-balanced|unbalanced braces/i.test(msg2), msg2);
    ok("…rather than at a missing spirit", !/spirit not found/i.test(msg2), msg2);
    ok("…and that file is untouched too", fs.readFileSync(abs, "utf8") === extra, "file changed");

    console.log("\ntest-unbalanced-file-message: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 12 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
