// Refusing to move a sea province into a state says what the maps show, not that HOI4 crashes.
// #a-sea-province-refusal-promises-no-crash
//
// POST /api/map/move-province refuses a sea province (#move-province-accepts-the-sea), and the map page refuses the same
// click before staging it. Both told the modder "HOI4 crashes on load". The evidence says less than that:
//   · a sea province in a state: 0 on vanilla, Millennium Dawn, Road to 56, Old World Blues, Novum Vexillum and Rise of
//     Nations (test-a-sea-province-cannot-join-a-state.js counts them);
//   · the engine text Nova once quoted for it ("… not a land province but is used in state") is absent from hoi4.exe 1.19,
//     and the validator's non_land_province_in_state stopped promising a crash on that evidence
//     (test-a-map-message-claims-only-what-the-engine-shows.js, section G).
// Nobody has loaded a map with a sea province in a state, so nothing shows a crash. The refusal stays; its reason is the
// evidence: no shipping map has one, and Nova's own map check reports it.
//
// Checked through the request the client sends (public/map.js doMoveProvince → queueWrite("/api/map/move-province",
// { provinceId, toStateId }, { fromStateId }); flushMapSaves adds modPath), and on the client's own status line, read out of
// public/map.js with its comments masked.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)));
  if (!ok) fails.push(label);
};

// The wording that promises a certain failure — the same judge the validator's messages answer to.
const CERTAIN = /\bcrash(es|ed)?\b|\bwill crash\b|\bCTD\b|\bfails? to load\b/i;

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-searefusal-"));
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

const MOD = path.join(ROOT, "mod");
const mk = (rel, c) => { const p = path.join(MOD, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
mk("descriptor.mod", 'name="sea refusal"\nsupported_version="1.19.*"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\n');
mk("map/definition.csv", ["0;0;0;0;land;false;unknown;0", "1;10;10;10;land;false;plains;1", "2;20;20;20;land;false;plains;1", "3;30;30;30;sea;false;ocean;0"].join("\n") + "\n");
mk("map/strategicregions/1-R.txt", "strategic_region={\n\tid=1\n\tname=\"R1\"\n\tprovinces={ 1 2 3 }\n}\n");
const st = (id, prov) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${prov.join(" ")} }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n`;
mk("history/states/1-A.txt", st(1, [1]));
mk("history/states/2-B.txt", st(2, [2]));
const stateFile = () => fs.readFileSync(path.join(MOD, "history", "states", "1-A.txt"), "utf8");

const server = createApp().listen(0, async () => {
  const PORT = server.address().port;
  const post = (ep, body) => fetch(`http://127.0.0.1:${PORT}${ep}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  try {
    console.log("1. POST /api/map/move-province with a sea province");
    {
      const before = stateFile();
      const r = await post("/api/map/move-province", { provinceId: 3, toStateId: 1, modPath: MOD });
      const msg = String((r.b && r.b.error) || "");
      rec("the move is refused", r.s === 400 && r.b && r.b.ok === false, r);
      rec("…and writes nothing", stateFile() === before);
      rec("…with a reason that names the sea", /\bsea\b/i.test(msg), msg);
      rec("…and says how to proceed (turn it into land first)", /land first/i.test(msg), msg);
      rec("⭐⭐ …without promising that HOI4 crashes", !CERTAIN.test(msg), msg);
      rec("⭐ …and gives the evidence instead: no shipping map has one", /no shipping map/i.test(msg), msg);
    }
    console.log("\n2. Control: a land province still moves");
    {
      const r = await post("/api/map/move-province", { provinceId: 2, toStateId: 1, modPath: MOD });
      rec("a land province moves", r.s === 200 && r.b && r.b.ok === true && r.b.changed === true, r.b);
    }
    console.log("\n3. The map page's own refusal, before it stages the move (public/map.js doMoveProvince)");
    {
      const MASKED = maskJsComments(fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8"));
      const s = MASKED.indexOf("function doMoveProvince");
      const body = s < 0 ? "" : MASKED.slice(s, MASKED.indexOf("\n  }", s) + 4);
      rec("doMoveProvince was found", body.length > 200, body.length);
      const gate = body.indexOf('provinceType.get(provinceId) === "sea"');
      const status = gate < 0 ? "" : (/setStatus\(([\s\S]*?)\);/.exec(body.slice(gate)) || [])[1] || "";
      rec("its sea check stages a status line", gate >= 0 && status.length > 40, status.slice(0, 200));
      rec("…that names the sea", /\bsea\b/i.test(status), status);
      rec("⭐⭐ …without promising that HOI4 crashes", !CERTAIN.test(status), status);
      rec("⭐ …and gives the same evidence as the server", /no shipping map/i.test(status), status);
    }
  } catch (e) {
    rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 5).join(" | ") : e), false);
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    console.log(`\n=== a sea province refusal promises no crash: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exitCode = 1; });
