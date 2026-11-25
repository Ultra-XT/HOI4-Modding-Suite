// #dotted-vanilla-token-listed-but-unsaveable — TWO CHARACTERS THE BASE GAME SHIPS COULD NOT BE SAVED AT ALL.
//
// The token guard refused a dot. Vanilla's common/characters/AST.txt ships `AST_florence_v._mckenzie` and
// `AST_eric_l._lloyd` — middle initials. The reader listed them and the editor opened them, and then EVERY
// save was refused with HTTP 400: a no-edit save, a portrait change, even a rename AWAY from the dotted id.
//
// The comment beside the guard said "there are no dotted tokens in either corpus", which is what made this
// look settled. Counting says two. It was written from an assumption rather than a measurement, and the
// measurement is what this test now pins — if the game ever stops shipping them, the ground-truth check here
// fails loudly instead of the rule quietly outliving its evidence.
//
// What genuinely breaks the characters file is still refused: a leading digit (HOI4 lexes it as a number),
// whitespace, braces and quotes.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dot-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700));
  }
}

const V = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const MOD = path.join(ROOT, "dot");
fs.mkdirSync(path.join(MOD, "common", "characters"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="Dot"\nsupported_version="1.19.*"\n', "utf8");
try { fs.copyFileSync(path.join(V, "common", "characters", "AST.txt"), path.join(MOD, "common", "characters", "AST.txt")); } catch (_) {}

const PORT = 43497;
const srv = createApp().listen(PORT, async () => {
  const get = (u) => fetch(`http://127.0.0.1:${PORT}${u}`).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const post = (u, b) => fetch(`http://127.0.0.1:${PORT}${u}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));

  try {
    console.log("\n[ground truth] the base game ships dotted character tokens");
    const dotted = [];
    let charFiles = [];
    try { charFiles = fs.readdirSync(path.join(V, "common", "characters")).filter((f) => /\.txt$/i.test(f)); } catch (_) {}
    for (const f of charFiles) {
      let t = "";
      try { t = fs.readFileSync(path.join(V, "common", "characters", f), "utf8"); } catch (_) { continue; }
      t = t.replace(/#[^\n\r]*/g, "");
      for (const m of t.matchAll(/(^|\n)\t([A-Za-z0-9_.-]*\.[A-Za-z0-9_.-]*)\s*=\s*\{/g)) dotted.push(`${f}:${m[2]}`);
    }
    rec("the characters corpus was readable", charFiles.length > 40, charFiles.length);
    rec("…and it contains dotted tokens", dotted.length >= 2, dotted);
    rec("…specifically the two middle-initial Australians",
      dotted.some((d) => /AST_florence_v\._mckenzie/.test(d)) && dotted.some((d) => /AST_eric_l\._lloyd/.test(d)),
      dotted);

    console.log("\n[the bug] such a character must be listed AND saveable");
    const l = await get(`/api/characters/list?modPath=${encodeURIComponent(MOD)}`);
    let flo = null;
    for (const f of l.b.files || []) {
      const c = (f.characters || []).find((x) => x.token === "AST_florence_v._mckenzie" || x.id === "AST_florence_v._mckenzie");
      if (c) { flo = c; break; }
    }
    rec("the dotted character is listed", !!flo, (l.b.files || []).map((f) => f.file));
    const before = fs.readFileSync(path.join(MOD, "common", "characters", "AST.txt"), "utf8");
    // `file` (not fileName) matters twice over: it is the field the handler reads, AND the roleless guard
    // exempts a character that already exists IN THAT FILE. Sending the wrong name made the save fail on a
    // DIFFERENT guard, which would have made this test pass for the wrong reason.
    const r = await post("/api/characters/save", {
      modPath: MOD, file: "AST.txt",
      token: "AST_florence_v._mckenzie",
      name: (flo && flo.name) || "Florence V. McKenzie",
      portraitCivLarge: (flo && flo.portraitCivLarge) || "",
      portraitArmyLarge: (flo && flo.portraitArmyLarge) || "",
    });
    rec("the save is no longer refused", r.s === 200 && !r.b.error, r.b || r.s);
    const after = fs.readFileSync(path.join(MOD, "common", "characters", "AST.txt"), "utf8");
    rec("…and the character is still defined exactly once",
      (after.match(/(^|\n)\tAST_florence_v\._mckenzie\s*=\s*\{/g) || []).length === 1,
      (after.match(/(^|\n)\tAST_florence_v\._mckenzie\s*=\s*\{/g) || []).length);
    rec("…and the file is brace-balanced",
      (after.match(/\{/g) || []).length === (after.match(/\}/g) || []).length, "unbalanced");
    rec("…and its sibling with a dot survived too", /AST_eric_l\._lloyd\s*=\s*\{/.test(after), "sibling gone");

    console.log("\n[control] what genuinely breaks the file is still refused");
    for (const [bad, why] of [
      ["1leading_digit", "a leading digit — HOI4 lexes it as a number"],
      ["has space", "whitespace"],
      ["has{brace", "a brace"],
      ['has"quote', "a quote"],
    ]) {
      const rr = await post("/api/characters/save", {
        modPath: MOD, file: "AST.txt", token: bad, name: "X", roleAdvisor: true, advisorSlot: "political_advisor",
      });
      rec(`"${bad}" is refused (${why})`, rr.s !== 200 || !!rr.b.error, { s: rr.s, b: rr.b });
    }
    const after2 = fs.readFileSync(path.join(MOD, "common", "characters", "AST.txt"), "utf8");
    rec("…and none of them reached the file",
      !/1leading_digit|has space|has\{brace|has"quote/.test(after2), after2);

    console.log("\n[control] the startup-item guard agrees with the token guard");
    // Both had the same narrow class; a character that can be SAVED but not RECRUITED is the same bug wearing
    // a different hat.
    const SRC = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
    const NARROW = "[\\p{L}\\p{N}_-]*";
    const WIDE = "[\\p{L}\\p{N}_.-]*";
    const narrowLines = SRC.split("\n").map((l, i) => [i + 1, l]).filter(([, l]) => l.includes(NARROW));
    // Comments included on purpose: a comment quoting the OLD pattern is how the next reader learns the wrong
    // rule, and this one already said "there are no dotted tokens in either corpus" while vanilla shipped two.
    rec("no narrow character class is left anywhere in server.js, comments included",
      narrowLines.length === 0, narrowLines.map(([n, l]) => `${n}: ${l.trim().slice(0, 90)}`));
    rec("…and the widened one is what is actually used", SRC.includes(WIDE), WIDE);

    console.log(`\n=== dotted character token: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { srv.closeAllConnections(); } catch (_) {}
    srv.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
srv.on("error", (e) => { console.error("listen error:", e.message); process.exitCode = 1; });
