// Moving a province between states — one province, or a whole state merged away — carries its province building
// block into the new state WHOLE: nested sub-blocks, DLC gates and comments included. #a-moved-province-keeps-its-whole-building-block
//
// moveProvince read the block with getProvinceBuildingsForProvince, which keeps only `key = <integer>` pairs at the
// block's top level, wrote those into the target one by one, and then deleted the WHOLE block from the source. So
// anything that is not a flat level was dropped on the floor. Vanilla's own shapes (126-Greater London Area.txt):
//
//     11374 = { naval_base = 10  naval_headquarters = { level = 1  allowed = { has_dlc = "No Compromise, No Surrender" } } }
//     6103 = { landmark_big_ben = { allowed = { has_dlc = "Gotterdammerung" } level = 1 } }
//
// Moving 11374 kept the naval base and lost the naval headquarters; moving 6103 — London, a 50-point victory point —
// found no flat key at all, carried nothing, and deleted Big Ben. Counted across the installed corpora in an earlier
// campaign (#a-nested-building-block-survives-the-erase): 159 of 3,807 province building blocks nest, 30 in vanilla.
// Nothing reported it: the building simply no longer exists anywhere in the mod.
//
// The engine side of the same move is "State Error: Trying to set province building in state that doesn't own it"
// (hoi4.exe) — the building is skipped when a block stays behind — so leaving the block is not an option either.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)));
  if (!ok) fails.push(label);
};

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-wholeblock-"));
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const M = require("./map-data.js");
const { createApp } = require("./server.js");

const MOD = path.join(ROOT, "wholeblock");
const mk = (rel, c) => { const p = path.join(MOD, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
// history/countries too: the endpoint layers the installed game underneath, and a vanilla country whose capital is state 1
// would make merge-state refuse (correctly) to merge it away.
mk("descriptor.mod", 'name="WholeBlock"\nsupported_version="1.19.*"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\n');
mk("map/definition.csv", ["0;0;0;0;land;false;unknown;0", "1;10;0;0;land;true;plains;1", "2;20;0;0;land;true;plains;1", "3;30;0;0;land;true;plains;1", "4;40;0;0;land;true;plains;1", "5;50;0;0;sea;false;ocean;0"].join("\n") + "\n");
mk("map/adjacencies.csv", "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n-1;-1;-1;-1;-1;-1;-1;-1;-1\n");
mk("map/strategicregions/1-R.txt", "strategic_region={\n\tid=1\n\tname=\"R1\"\n\tprovinces={ 1 2 3 4 5 }\n}\n");
mk("history/states/1-A.txt", `state = {
	id = 1
	name = "STATE_1"
	manpower = 1000
	state_category = rural
	provinces = { 1 2 }
	history = {
		owner = AAA
		victory_points = {
			2 10
		}
		buildings = {
			infrastructure = 3
			1 = {
				naval_base = 10
				naval_headquarters = {
					level = 1
					allowed = {
						has_dlc = "No Compromise, No Surrender"
					}
				}
			}
			2 = { # Big Ben
				landmark_big_ben = {
					allowed = {
						has_dlc = "Gotterdammerung"
					}
					level = 1
				}
			}
		}
	}
}
`);
mk("history/states/2-B.txt", 'state = {\n\tid = 2\n\tname = "STATE_2"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 3 }\n\thistory = {\n\t\towner = BBB\n\t}\n}\n');
mk("history/states/3-C.txt", 'state = {\n\tid = 3\n\tname = "STATE_3"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 4 }\n\thistory = {\n\t\towner = CCC\n\t\tbuildings = {\n\t\t\tinfrastructure = 1\n\t\t}\n\t}\n}\n');
mk("history/countries/BBB - B.txt", "capital = 2\n");

const stateText = (file) => { try { return fs.readFileSync(path.join(MOD, "history", "states", file), "utf8"); } catch (_) { return ""; } };
const balance = (t) => { let d = 0, inC = false, inQ = false; for (const c of t) { if (inC) { if (c === "\n") inC = false; continue; } if (inQ) { if (c === '"') inQ = false; continue; } if (c === "#") inC = true; else if (c === '"') inQ = true; else if (c === "{") d++; else if (c === "}") d--; } return d; };
const blockOf = (text, pid) => {
  const at = text.search(new RegExp(`(?<![0-9])${pid}\\s*=\\s*\\{`));
  if (at < 0) return "";
  let d = 0;
  for (let i = text.indexOf("{", at); i < text.length; i++) { if (text[i] === "{") d++; else if (text[i] === "}") { d--; if (d === 0) return text.slice(at, i + 1); } }
  return "";
};
const buildingsOf = (text) => { const at = text.search(/buildings\s*=\s*\{/); return at < 0 ? "" : blockOf(text.slice(at).replace(/^buildings/, "0"), 0); };
const model = () => M.buildMapModel({ modRoot: MOD, gameRoot: path.join(ROOT, "no-game"), dependencyRoots: [], cacheStableLayers: false });

const server = createApp().listen(0, async () => {
  const PORT = server.address().port;
  // Exactly what public/map.js sends: queueWrite("/api/map/move-province", { provinceId, toStateId }, { fromStateId }) keeps
  // fromStateId in META, and flushMapSaves posts Object.assign({}, w.body, { modPath }).
  const post = (ep, body) => fetch(`http://127.0.0.1:${PORT}${ep}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  try {
    console.log("[control] the fixture is what this test thinks it is");
    rec("state 1 holds the naval headquarters inside province 1's block", /naval_headquarters/.test(blockOf(buildingsOf(stateText("1-A.txt")), 1)), buildingsOf(stateText("1-A.txt")));
    rec("…and Big Ben inside province 2's", /landmark_big_ben/.test(blockOf(buildingsOf(stateText("1-A.txt")), 2)));
    const m0 = model();
    rec("the model sees province 1's naval base", (((m0.states || []).find((s) => s.id === 1) || {}).provinceBuildings || {})[1]?.naval_base === 10);

    console.log("\n1. Move province 1 (naval base + DLC-gated headquarters) into state 2");
    {
      const r = await post("/api/map/move-province", { provinceId: 1, toStateId: 2, modPath: MOD });
      rec("the move succeeded", r.s === 200 && r.b && r.b.ok === true, r.b);
      const a = stateText("1-A.txt"), b = stateText("2-B.txt");
      const moved = blockOf(buildingsOf(b), 1);
      rec("state 2 now has a block for province 1", !!moved, b);
      rec("…with its naval base level", /naval_base\s*=\s*10/.test(moved), moved);
      rec("⭐⭐⭐ …AND its naval headquarters, which is not a flat level", /naval_headquarters\s*=\s*\{/.test(moved), moved);
      rec("⭐⭐ …still gated on the DLC the author gated it on", /has_dlc\s*=\s*"No Compromise, No Surrender"/.test(moved), moved);
      rec("⭐ state 1 no longer holds a block for province 1", !blockOf(buildingsOf(a), 1), buildingsOf(a));
      rec("…nor a naval headquarters anywhere", !/naval_headquarters/.test(a), a);
      rec("both files are still brace-balanced", balance(a) === 0 && balance(b) === 0, { a: balance(a), b: balance(b) });
      const st2 = (model().states || []).find((s) => s.id === 2) || {};
      rec("the model reads province 1's naval base in state 2", (st2.provinceBuildings || {})[1]?.naval_base === 10, st2.provinceBuildings);
    }

    console.log("\n2. Merge state 1 (province 2, Big Ben, a victory point) into state 3");
    {
      const r = await post("/api/map/merge-state", { sourceStateId: 1, targetStateId: 3, modPath: MOD });
      rec("the merge succeeded", r.s === 200 && r.b && r.b.ok === true, r.b);
      const c = stateText("3-C.txt");
      const moved = blockOf(buildingsOf(c), 2);
      rec("state 3 now has a block for province 2", !!moved, c);
      rec("⭐⭐⭐ …holding Big Ben", /landmark_big_ben\s*=\s*\{/.test(moved), moved);
      rec("⭐⭐ …with its DLC gate and its level", /has_dlc\s*=\s*"Gotterdammerung"/.test(moved) && /level\s*=\s*1/.test(moved), moved);
      rec("⭐ …and the author's comment on it", /# Big Ben/.test(c), c);
      rec("⚠️ state 3's own building survives beside it", /infrastructure\s*=\s*\d+/.test(buildingsOf(c)), buildingsOf(c));
      rec("the victory point came along", /victory_points\s*=\s*\{[^}]*\b2\s+10\b/.test(c), c);
      rec("state 3's file is brace-balanced", balance(c) === 0, balance(c));
      rec("no file mentions Big Ben twice", (c.match(/landmark_big_ben/g) || []).length === 1 && !/landmark_big_ben/.test(stateText("1-A.txt")), { c: (c.match(/landmark_big_ben/g) || []).length });
    }

    console.log("\n3. The map is left with no building in a state that does not own its province");
    {
      const probs = M.validateMapModel(model());
      rec("⭐ no province building sits in the wrong state", !probs.some((p) => p.rule === "province_building_not_in_state"), probs.filter((p) => p.rule === "province_building_not_in_state"));
      rec("…and no victory point either", !probs.some((p) => p.rule === "vp_not_in_state"), probs.filter((p) => p.rule === "vp_not_in_state"));
    }

    console.log("\n4. Auto-fix, resolving a province two states claim, hands the keeper the loser's whole block");
    {
      // fixProvinceInTwoStates keeps the province in the state with more provinces and carries the loser's victory point and
      // province buildings across — the same carry, the same loss.
      const TWO = path.join(ROOT, "twostates");
      const put = (rel, c) => { const p = path.join(TWO, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
      put("descriptor.mod", 'name="TwoStates"\nsupported_version="1.19.*"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\n');
      put("map/definition.csv", ["0;0;0;0;land;false;unknown;0", "1;10;0;0;land;true;plains;1", "2;20;0;0;land;true;plains;1", "3;30;0;0;land;true;plains;1", "4;40;0;0;land;true;plains;1"].join("\n") + "\n");
      put("map/adjacencies.csv", "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n-1;-1;-1;-1;-1;-1;-1;-1;-1\n");
      put("map/strategicregions/1-R.txt", "strategic_region={\n\tid=1\n\tname=\"R1\"\n\tprovinces={ 1 2 3 4 }\n}\n");
      put("history/states/1-Keeper.txt", 'state = {\n\tid = 1\n\tname = "STATE_1"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 1 2 3 }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n');
      // ⚠️ NOT a naval block. This fixture has no provinces.bmp of its own, and a whole Auto-fix click also runs the no-coast
      // cleanup, which removes naval keys from provinces it cannot see touching the sea — correctly, for what it can see.
      // A bunker and a DLC-gated landmark ask the same question of the carry without asking that one.
      put("history/states/2-Loser.txt", 'state = {\n\tid = 2\n\tname = "STATE_2"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 3 4 }\n\thistory = {\n\t\towner = BBB\n\t\tbuildings = {\n\t\t\t3 = {\n\t\t\t\tbunker = 5\n\t\t\t\tlandmark_test_tower = {\n\t\t\t\t\tlevel = 1\n\t\t\t\t\tallowed = { has_dlc = "Gotterdammerung" }\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\t}\n}\n');
      const r = await post("/api/map/auto-fix", { modPath: TWO });
      rec("Auto-fix ran", r.s === 200 && r.b && r.b.ok === true, r.b);
      const pc = r.b && r.b.fixes && r.b.fixes.provConflicts;
      rec("…and resolved province 3 into state 1", pc && (pc.resolved || []).some((x) => x.province === 3 && x.keptIn === 1 && x.removedFrom === 2), pc);
      const keeper = fs.readFileSync(path.join(TWO, "history", "states", "1-Keeper.txt"), "utf8");
      const loser = fs.readFileSync(path.join(TWO, "history", "states", "2-Loser.txt"), "utf8");
      const got = blockOf(buildingsOf(keeper), 3);
      rec("the keeper has province 3's bunker", /bunker\s*=\s*5/.test(got), { got, navalNoCoast: r.b && r.b.fixes && r.b.fixes.navalNoCoast });
      rec("⭐⭐⭐ …and its landmark, DLC gate and all", /landmark_test_tower\s*=\s*\{/.test(got) && /has_dlc\s*=\s*"Gotterdammerung"/.test(got), got);
      rec("⭐ the loser no longer holds it", !/landmark_test_tower/.test(loser), loser);
      rec("both files are brace-balanced", balance(keeper) === 0 && balance(loser) === 0, { keeper: balance(keeper), loser: balance(loser) });
    }
  } catch (e) {
    rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e), false);
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    console.log(`\n=== a moved province keeps its whole building block: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exitCode = 1; });
