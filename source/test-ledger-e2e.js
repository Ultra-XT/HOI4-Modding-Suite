// In-game-equivalent proof for the advisor-ledger fix (bug-hunt #8, commit 93e18eb) — the full save PATH,
// not just the merge helper. A character with a military advisor is written to disk with ledger=army; the
// modder edits the ledger to navy and re-saves through the real /api/characters/save endpoint; we read the
// FILE HOI4 would load and confirm there is exactly ONE `ledger = navy` (no duplicate, no stale army). Before
// the fix, `ledger` wasn't a managed advisor key, so the merge re-injected the old `ledger = army`, HOI4
// last-wins kept army, and the edit silently reverted in the game (the advisor stayed in the army ledger tab).
// Run: node test-ledger-e2e.js
"use strict";
const fs = require("fs"), os = require("os"), path = require("path"), http = require("http");
const { createApp } = require("./server.js");
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, x != null ? "→ " + x : ""); } };

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-ledger-"));
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Ledger"\n');
const charPath = path.join(mod, "common", "characters", "custom_characters.txt");
fs.mkdirSync(path.dirname(charPath), { recursive: true });
// A real-shaped character on disk: an ARMY chief advisor with ledger = army.
fs.writeFileSync(charPath,
`characters = {
	GER_gen = {
		name = "The General"
		advisor = {
			slot = army_chief
			idea_token = GER_gen
			ledger = army
			traits = { army_chief_offensive_2 }
		}
	}
}
`, "utf8");

const app = createApp();
const server = http.createServer(app);
const post = (p, body) => new Promise((res, rej) => {
  const data = Buffer.from(JSON.stringify(body));
  const r = http.request({ host: "127.0.0.1", port: server.address().port, path: p, method: "POST", headers: { "Content-Type": "application/json", "Content-Length": data.length } },
    (rs) => { let o = ""; rs.on("data", c => o += c); rs.on("end", () => res({ status: rs.statusCode, body: o })); });
  r.on("error", rej); r.write(data); r.end();
});

server.listen(0, "127.0.0.1", async () => {
  try {
    // The modder switches the advisor's ledger army -> navy and saves.
    const resp = await post("/api/characters/save", {
      modPath: mod, token: "GER_gen", name: "The General", file: "custom_characters.txt",
      roleAdvisor: true, advisorSlot: "army_chief", advisorIdeaToken: "GER_gen",
      advisorLedger: "navy", advisorTraits: "army_chief_offensive_2",
      roleLeader: false, roleGeneral: false,
    });
    ok("save returned 200", resp.status === 200, resp.status + " " + resp.body.slice(0, 120));

    const after = fs.readFileSync(charPath, "utf8");
    const ledgerLines = (after.match(/ledger\s*=\s*\w+/g) || []);
    ok("exactly ONE ledger line on disk (no duplicate)", ledgerLines.length === 1, ledgerLines);
    ok("the on-disk ledger is navy (the edit stuck — HOI4 would read navy)", ledgerLines[0] === "ledger = navy", ledgerLines);
    ok("no stale `ledger = army` left behind", !/ledger\s*=\s*army/.test(after), after);
    ok("file is brace-balanced", (() => { let d = 0; for (const c of after) { if (c === "{") d++; else if (c === "}") { if (--d < 0) return false; } } return d === 0; })());
    ok("the advisor's un-modeled trait survived the round-trip", /army_chief_offensive_2/.test(after), after);
  } catch (e) { fail++; console.log("  FAIL threw →", e && e.stack || e); }
  finally {
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    console.log(`\nLEDGER-E2E: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
});
