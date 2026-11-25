// #loc-line-eats-newline — an upsert must not swallow the localisation file's trailing newline.
//
// Every maker replaces its loc line with a regex shaped `^\s*KEY:\d*\s*".*"\s*$`. `\s` includes newlines, so
// when the key happens to be the LAST line of the file, the trailing `\s*$` consumes the final line break and
// the replacement does not put one back. The file quietly loses its trailing newline on every save.
//
// Harmless to the game. It matters because it turns a save that changed NOTHING into a diff, and the whole
// value of the round-trip check is that an unchanged save leaves no diff to hide real damage behind.
//
// The distinction this test protects: the four DELETE helpers still use `\s*` on purpose. Removing a line has
// to take its line break with it, or a delete leaves a blank line where the entry was. So this asserts both
// halves — upserts keep the newline, deletes still collapse the line they remove.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-loc-newline-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const MOD = path.join(ROOT, "newline_probe");
for (const d of [["common", "ideas"], ["common", "characters"], ["common", "decisions"], ["events"], ["localisation", "english"]]) {
  fs.mkdirSync(path.join(MOD, ...d), { recursive: true });
}
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="NewlineProbe"\nsupported_version="1.19.*"\n');

const locDir = path.join(MOD, "localisation", "english");
const endsWithNewline = (f) => { const t = fs.readFileSync(f, "utf8"); return t.length > 0 && t.endsWith("\n"); };
const allLocFiles = () => fs.readdirSync(locDir).filter((f) => /\.yml$/i.test(f)).map((f) => path.join(locDir, f));

const PORT = 39541, app = createApp();
const server = app.listen(PORT, async () => {
  const post = (ep, o) => fetch("http://127.0.0.1:" + PORT + ep, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const breathe = () => new Promise((r) => setTimeout(r, 160));

  try {
    // ── a SPIRIT, the one that was reproduced ─────────────────────────────────────────────────────
    const spirit = (mode, name) => post("/api/ideas/upsert-definition", {
      modPath: MOD, ideaId: "probe_spirit", targetRelativeFile: "common/ideas/probe.txt",
      mode, category: "country", picture: "GFX_idea_generic_communism_drift_bonus",
      name, desc: "A description.", removalCost: "-1",
      selectedEffects: ["modifier = {\n\tpolitical_power_gain = 0.1\n}"],
      targetLocalizationPath: "localisation/english/probe_l_english.yml",
    });
    const r1 = await spirit("create", "Probe Spirit");
    await breathe();
    ok("creating a spirit → 200", r1.s === 200, r1.b);
    const spiritLoc = path.join(locDir, "probe_l_english.yml");
    ok("…its loc file ends with a newline", endsWithNewline(spiritLoc), JSON.stringify(fs.readFileSync(spiritLoc, "utf8").slice(-40)));

    // the REPLACE branch is the one that ate it — save again with a different name
    await breathe();
    const r2 = await spirit("edit", "Probe Spirit Renamed");
    await breathe();
    ok("renaming it → 200", r2.s === 200, r2.b);
    ok("…the loc file STILL ends with a newline", endsWithNewline(spiritLoc), JSON.stringify(fs.readFileSync(spiritLoc, "utf8").slice(-40)));
    ok("…and the new name is there", /Probe Spirit Renamed/.test(fs.readFileSync(spiritLoc, "utf8")));

    // ── a CHARACTER, a different writer with the same shape ───────────────────────────────────────
    const character = (name) => post("/api/characters/save", {
      modPath: MOD, token: "probe_char", name, file: "ZZ_probe.txt",
      portraitCivLarge: "", portraitCivSmall: "", portraitArmyLarge: "", portraitArmySmall: "",
      roleLeader: true, leaderIdeology: "despotism",
    });
    await breathe();
    const c1 = await character("Probe Person");
    await breathe();
    ok("creating a character → 200", c1.s === 200, c1.b);
    await breathe();
    const c2 = await character("Probe Person Renamed");
    await breathe();
    ok("renaming the character → 200", c2.s === 200, c2.b);
    for (const f of allLocFiles()) {
      ok(`${path.basename(f)} ends with a newline`, endsWithNewline(f), JSON.stringify(fs.readFileSync(f, "utf8").slice(-40)));
    }

    // ── the DELETE path must still collapse the line it removes ───────────────────────────────────
    // Two spirits so there is a line after the removed one; deleting the FIRST must not leave a blank.
    await breathe();
    await post("/api/ideas/upsert-definition", {
      modPath: MOD, ideaId: "probe_second", targetRelativeFile: "common/ideas/probe.txt",
      mode: "create", category: "country", picture: "GFX_idea_generic_communism_drift_bonus",
      name: "Second Spirit", desc: "Second description.", removalCost: "-1",
      selectedEffects: ["modifier = {\n\tstability_factor = 0.05\n}"],
      targetLocalizationPath: "localisation/english/probe_l_english.yml",
    });
    await breathe();
    const before = fs.readFileSync(spiritLoc, "utf8");
    ok("both spirits are in the loc file", /probe_spirit:/.test(before) && /probe_second:/.test(before), before);
    await breathe();
    const del = await post("/api/ideas/delete-definition", {
      modPath: MOD, ideaId: "probe_spirit", targetRelativeFile: "common/ideas/probe.txt",
      targetLocalizationPath: "localisation/english/probe_l_english.yml",
    });
    await breathe();
    if (del.s === 200) {
      const after = fs.readFileSync(spiritLoc, "utf8");
      ok("the deleted key is gone", !/probe_spirit:/.test(after), after);
      ok("…the surviving key is still there", /probe_second:/.test(after), after);
      // The delete path deliberately collapses runs of blank lines to ONE (`\n{3,}` → `\n\n`), so a single
      // blank where the entry was is the contract, not a bug. What must not happen is accumulation — delete
      // twenty spirits and get twenty blank lines.
      ok("…blank lines did not accumulate", !/\n{3,}/.test(after), JSON.stringify(after));
      ok("…and the file still ends with a newline", endsWithNewline(spiritLoc), JSON.stringify(after.slice(-40)));
    } else {
      // Endpoint name may differ; report rather than silently skipping the delete half.
      ok("the delete endpoint was reachable", false, del.b);
    }

    // ── the source itself: no UPSERT site may keep the newline-eating form ────────────────────────
    // Deletes legitimately keep `\s*` — they must consume the line break. Upserts must not.
    const src = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
    const srcLines = src.split("\n");
    const greedy = [];
    srcLines.forEach((l, i) => {
      if (!l.includes('\\\\s*".*"\\\\s*$')) return;
      const m = /const\s+(\w+)\s*=\s*new RegExp/.exec(l);
      const varName = m ? m[1] : "";
      const after = srcLines.slice(i + 1, i + 15).join("\n");
      // A site that replaces with "" is a delete and is allowed to keep the newline-eating form.
      // …and so is a CONDITIONAL delete written as a replacer function that can return "" — the event
      // loc-strip keeps a key other events still reference and removes the rest (#event-loc-shared-key),
      // which is still a delete. Detecting only the literal `""` form flagged it as an upsert.
      const literalDelete = varName && new RegExp(`\\.replace\\(\\s*${varName}\\s*,\\s*""`).test(after);
      const callbackDelete = varName &&
        new RegExp(`\\.replace\\(\\s*${varName}\\s*,\\s*\\(`).test(after) &&
        /(\?[^\n]*:\s*"")|(:\s*""\s*\))/.test(after);
      const isDelete = literalDelete || callbackDelete;
      const isTestOnly = varName && !new RegExp(`\\.replace\\(\\s*${varName}\\s*,`).test(after);
      if (!isDelete && !isTestOnly) greedy.push({ line: i + 1, varName });
    });
    ok("no upsert site still eats the trailing newline", greedy.length === 0, greedy.slice(0, 6));

    console.log("\ntest-loc-trailing-newline: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 10 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
