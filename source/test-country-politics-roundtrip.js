// Country Setup writer: editing politics/popularities for a country whose vanilla
// file places set_politics/set_popularities AFTER an early dated block (e.g. Germany)
// must REPLACE those blocks in place — not append duplicates — and must preserve the
// dated blocks. Regression test for the date-block split bug.
const fs = require("fs"), os = require("os"), path = require("path");
const { createApp } = require("./server.js");
const PORT = 3496, BASE = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log("  ✓ " + m); } else { fail++; console.log("  ✗ FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
async function post(r, b) { const res = await fetch(BASE + r, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }); let j = null; try { j = await res.json(); } catch (_) {} return { status: res.status, json: j }; }
async function get(r) { const res = await fetch(BASE + r); let j = null; try { j = await res.json(); } catch (_) {} return { status: res.status, json: j }; }

(async () => {
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-polrt-"));
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Politics RT"\n', "utf8");
  // Pre-place a Germany-style file: politics/popularities come AFTER a dated block.
  const dir = path.join(mod, "history", "countries");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "GER - Germany.txt");
  fs.writeFileSync(file, `capital = 64
set_research_slots = 4
set_convoys = 200
set_stability = 0.7

1939.1.1 = {
	set_research_slots = 5
	set_stability = 0.6
}

set_politics = {
	ruling_party = fascism
	last_election = "1933.3.5"
	election_frequency = 48
	elections_allowed = no
}
set_popularities = {
	democratic = 35
	fascism = 40
	communism = 10
	neutrality = 15
}
`, "utf8");

  try {
    // Sanity: the reader sees the real (post-date-block) politics
    let r = await get(`/api/history/country-details?modPath=${encodeURIComponent(mod)}&tag=GER`);
    ok(r.json && r.json.details && r.json.details.politics.rulingParty === "fascism", "reader parses ruling_party after a dated block", r.json && r.json.details && r.json.details.politics);
    ok(r.json && r.json.details && r.json.details.popularities.fascism === 40, "reader parses popularities after a dated block", r.json && r.json.details && r.json.details.popularities);

    // Edit politics + popularities
    r = await post("/api/history/save-country-details", {
      modPath: mod, tag: "GER",
      details: {
        capital: 64, researchSlots: 4, stability: 0.6, warSupport: 0.4, convoys: 100,
        politics: { rulingParty: "democratic", lastElection: "1936.1.1", electionFrequency: 36, electionsAllowed: "yes" },
        popularities: { democratic: 60, fascism: 20, communism: 10, neutrality: 10 }
      }
    });
    ok(r.json && r.json.ok, "save-country-details succeeded", r.json);

    const after = fs.readFileSync(file, "utf8");
    const polCount = (after.match(/set_politics\s*=\s*\{/g) || []).length;
    const popCount = (after.match(/set_popularities\s*=\s*\{/g) || []).length;
    ok(polCount === 1, "exactly ONE set_politics block (no duplicate)", polCount);
    ok(popCount === 1, "exactly ONE set_popularities block (no duplicate)", popCount);
    ok(/ruling_party\s*=\s*democratic/.test(after), "ruling_party updated to democratic", after.match(/ruling_party.*/));
    ok(/democratic\s*=\s*60/.test(after), "democratic popularity updated to 60", after.match(/democratic\s*=\s*\d+/g));
    ok(/1939\.1\.1\s*=\s*\{/.test(after), "the dated 1939.1.1 block is preserved", true);
    ok(!/fascism\s*=\s*40/.test(after), "old fascism=40 popularity replaced", after.match(/fascism\s*=\s*\d+/g));

    // Re-read through the parser confirms the change
    r = await get(`/api/history/country-details?modPath=${encodeURIComponent(mod)}&tag=GER`);
    ok(r.json && r.json.details.politics.rulingParty === "democratic", "re-parse: ruling_party democratic", r.json && r.json.details && r.json.details.politics);
    ok(r.json && r.json.details.popularities.democratic === 60, "re-parse: democratic 60", r.json && r.json.details && r.json.details.popularities);

    console.log(`\n  ${pass} passed, ${fail} failed`);
  } catch (e) { console.error(e); fail++; }
  finally {
    process.exitCode = fail ? 1 : 0;
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
})();
