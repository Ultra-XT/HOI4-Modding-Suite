// A state carved out of existing land keeps everything its provinces carried: their building blocks and victory points, in
// the dates they are written for. #a-carved-state-keeps-its-provinces-history
//
// THE DEFECT. POST /api/map/create-state accepts `provinces` and createState STEALS them from the states that list them. The
// steal stripped each province's victory points and its (first) building block from the old state — and wrote the new state
// with neither, so both were deleted outright, and everything dated stayed behind in the old state. Reproduced on the base
// commit with exactly the request below: the new state held `owner` and `add_core_of` and nothing else; the old state kept
// the 1939.1.1 and 1933.1.1 blocks and the add_victory_points of provinces it no longer listed.
//
// WHO REACHES IT. createState's only caller is that endpoint, which forwards req.body.provinces. public/map.js sends
// `{ name, owner }` (queueWrite("/api/map/create-state", { name: "", owner }, …)) and moves provinces in one by one, so the
// map page itself never took this path — an API client or a script does. fillMissingStateGaps strips a province the same way
// and has no caller outside tests (Auto-fix closes id gaps with closeStateIdGaps), so it is left alone.
//
// The walkers below are this test's own, so it does not grade the implementation with the implementation.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 600)));
  if (!ok) fails.push(label);
};

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-carvedstate-"));
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const M = require("./map-data.js");
const { createApp } = require("./server.js");

// ── the test's own reading of a state file ───────────────────────────────────────────────────────────────────────────
const mask = (t) => String(t).replace(/#[^\r\n]*/g, (m) => " ".repeat(m.length));
const closeOf = (s, open) => { let d = 0; for (let i = open; i < s.length; i++) { if (s[i] === "{") d++; else if (s[i] === "}") { d--; if (d === 0) return i; } } return -1; };
const isDate = (k) => /^\d+\.\d+\.\d+(\.\d+)?$/.test(k);
const entries = (raw) => {
  const s = mask(raw), out = [];
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "}") { depth--; continue; }
    if (c !== "{") continue;
    if (depth > 0) { depth++; continue; }
    let k = i, key = "";
    while (k > 0 && /\s/.test(s[k - 1])) k--;
    if (s[k - 1] === "=") { k--; while (k > 0 && /\s/.test(s[k - 1])) k--; const e = k; while (k > 0 && /[A-Za-z0-9_.]/.test(s[k - 1])) k--; key = s.slice(k, e); }
    const close = closeOf(s, i);
    if (close < 0) break;
    out.push({ key, inner: raw.slice(i + 1, close), text: raw.slice(k, close + 1) });
    i = close;
  }
  return out;
};
const historyOf = (fileText) => {
  const st = entries(fileText).find((e) => e.key === "state");
  const h = st && entries(st.inner).find((e) => e.key === "history");
  return h ? h.inner : "";
};
const ctxs = (hist, date) => (date ? entries(hist).filter((e) => e.key === date).map((e) => e.inner) : [hist]);
const allDates = (hist) => [null, ...new Set(entries(hist).map((e) => e.key).filter(isDate))];
const blocks = (hist, pid, date) => ctxs(hist, date).flatMap((c) => entries(c).filter((e) => e.key === "buildings").flatMap((b) => entries(b.inner).filter((p) => p.key === String(pid))));
const pairsIn = (inner) => { const n = mask(inner).match(/-?\d+(?:\.\d+)?/g) || []; const out = []; for (let i = 0; i + 1 < n.length; i += 2) out.push([Number(n[i]), Number(n[i + 1])]); return out; };
const vps = (hist, pid, date) => ctxs(hist, date).flatMap((c) => entries(c).filter((e) => e.key === "victory_points").flatMap((e) => pairsIn(e.inner).filter(([q]) => q === pid).map(([, v]) => v)));
const addVps = (hist, pid, date) => ctxs(hist, date).flatMap((c) => entries(c).filter((e) => e.key === "add_victory_points" && Number((/province\s*=\s*(\d+)/.exec(mask(e.inner)) || [])[1]) === pid));
const mentions = (hist, pid) => allDates(hist).reduce((n, d) => n + blocks(hist, pid, d).length + vps(hist, pid, d).length + addVps(hist, pid, d).length, 0);
const dateEntries = (hist, date) => entries(hist).filter((e) => e.key === date);
const balance = (t) => { let d = 0; for (const c of mask(t)) { if (c === "{") d++; else if (c === "}") d--; } return d; };

// ── fixtures ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const MOD = path.join(ROOT, "carve");
const mk = (rel, c) => { const p = path.join(MOD, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
mk("descriptor.mod", 'name="carve"\nsupported_version="1.19.*"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\n');
mk("map/definition.csv", ["0;0;0;0;land;false;unknown;0", ...[1, 2, 3, 4, 5, 6].map((i) => `${i};${i * 10};0;0;land;false;plains;1`)].join("\n") + "\n");
mk("map/adjacencies.csv", "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n-1;-1;-1;-1;-1;-1;-1;-1;-1\n");
mk("map/strategicregions/1-R.txt", "strategic_region={\n\tid=1\n\tname=\"R1\"\n\tprovinces={ 1 2 3 4 5 6 }\n}\n");
mk("history/countries/ZZZ - Z.txt", "capital = 3\n");
// State 1 lists provinces 1, 2 and 5. Province 1 carries every shape: a nested, commented building block, a commented victory
// point, a 1939.1.1 block and victory point, a 1933.1.1 block, and an add_victory_points in a date that also changes the owner.
// Province 5 shares the 1939 buildings block and has only a dated victory point.
mk("history/states/1-A.txt", `state = {
	id = 1
	name = "STATE_1"
	manpower = 1000
	state_category = rural
	provinces = { 1 2 5 }
	history = {
		owner = AAA
		victory_points = { #Capital
			1 5
		}
		buildings = {
			infrastructure = 3
			1 = {
				bunker = 5
				naval_headquarters = { level = 1 allowed = { has_dlc = "No Compromise, No Surrender" } }
			}
			2 = { bunker = 2 }
		}
		1939.1.1 = {
			buildings = {
				1 = { land_facility = 1 # Mytischi
				}
				5 = { bunker = 1 }
			}
			victory_points = { 1 15 }
			victory_points = { 5 7 }
		}
		1933.1.1 = {
			buildings = {
				1 = { bunker = 10 }
			}
		}
		1938.10.25 = {
			owner = AAA
			add_victory_points = { province = 1 value = 2 }
		}
	}
}
`);
// State 2 lists province 3, which has its own block and victory point, and province 4.
mk("history/states/2-B.txt", 'state = {\n\tid = 2\n\tname = "STATE_2"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 3 4 }\n\thistory = {\n\t\towner = BBB\n\t\tvictory_points = {\n\t\t\t3 8 # Three\n\t\t}\n\t\tbuildings = {\n\t\t\t3 = { naval_base = 4 }\n\t\t}\n\t}\n}\n');
mk("history/states/3-C.txt", 'state = {\n\tid = 3\n\tname = "STATE_3"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 6 }\n\thistory = {\n\t\towner = ZZZ\n\t}\n}\n');
const stateText = (f) => { try { return fs.readFileSync(path.join(MOD, "history", "states", f), "utf8"); } catch (_) { return ""; } };

const server = createApp().listen(0, async () => {
  const PORT = server.address().port;
  const post = (ep, body) => fetch(`http://127.0.0.1:${PORT}${ep}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  try {
    console.log("[control] the test's own walkers read the fixture the way it is written");
    {
      const h = historyOf(stateText("1-A.txt"));
      rec("province 1 is named by six pieces, province 5 by two", mentions(h, 1) === 6 && mentions(h, 5) === 2, { p1: mentions(h, 1), p5: mentions(h, 5) });
    }

    console.log("\n1. Carve a state out of provinces 1 and 5 of state 1 and province 3 of state 2  (POST /api/map/create-state with provinces)");
    {
      // What an API client sends; the map page sends { name, owner } and moves provinces in afterwards.
      const r = await post("/api/map/create-state", { name: "Carved", owner: "DDD", provinces: [1, 5, 3], modPath: MOD });
      rec("create-state succeeded", r.s === 200 && r.b && r.b.ok === true && Number.isFinite(r.b.id), r.b);
      const file = r.b && r.b.file;
      const n = file ? stateText(file) : "", hn = historyOf(n);
      const a = stateText("1-A.txt"), ha = historyOf(a);
      const b = stateText("2-B.txt"), hb = historyOf(b);

      rec("the new state lists all three provinces", /provinces\s*=\s*\{\s*1\s+5\s+3\s*\}/.test(n), n);
      rec("…owned and cored by the country it was made for", /owner\s*=\s*DDD/.test(hn) && /add_core_of\s*=\s*DDD/.test(hn), hn);
      rec("⭐⭐⭐ province 1's building block arrived, naval headquarters and DLC gate and all", blocks(hn, 1, null).length === 1 && /naval_headquarters\s*=\s*\{/.test(blocks(hn, 1, null)[0].text) && /has_dlc/.test(blocks(hn, 1, null)[0].text), n);
      rec("⭐⭐⭐ …and its victory point, with the comment on it", String(vps(hn, 1, null)) === "5" && /#Capital/.test(n), n);
      rec("⭐⭐ its 1939 building and province 5's arrived in ONE 1939.1.1 entry, the author's comment kept", dateEntries(hn, "1939.1.1").length === 1 && blocks(hn, 1, "1939.1.1").length === 1 && blocks(hn, 5, "1939.1.1").length === 1 && /# Mytischi/.test(n), n);
      rec("⭐⭐ …with both provinces' 1939 victory points, still dated", String(vps(hn, 1, "1939.1.1")) === "15" && String(vps(hn, 5, "1939.1.1")) === "7" && vps(hn, 5, null).length === 0, n);
      rec("⭐ the 1933 building arrived in a 1933.1.1 entry, and the add_victory_points in a 1938.10.25 one", blocks(hn, 1, "1933.1.1").length === 1 && addVps(hn, 1, "1938.10.25").length === 1, n);
      rec("⭐⭐ province 3, from the other state, brought its own block and commented victory point", blocks(hn, 3, null).length === 1 && /naval_base\s*=\s*4/.test(blocks(hn, 3, null)[0].text) && String(vps(hn, 3, null)) === "8" && /# Three/.test(n), n);

      rec("⭐⭐⭐ state 1 names provinces 1 and 5 nowhere — no block, victory point or add_victory_points, in any date", mentions(ha, 1) === 0 && mentions(ha, 5) === 0, a);
      rec("⚠️ …and keeps province 2, its block, its infrastructure and its own 1938.10.25 owner change", /provinces\s*=\s*\{\s*2\s*\}/.test(a) && blocks(ha, 2, null).length === 1 && /infrastructure\s*=\s*3/.test(ha) && /owner\s*=\s*AAA/.test((dateEntries(ha, "1938.10.25")[0] || {}).inner || ""), a);
      rec("⭐⭐ state 2 names province 3 nowhere and keeps province 4", mentions(hb, 3) === 0 && /provinces\s*=\s*\{\s*4\s*\}/.test(b), b);
      rec("every file is brace-balanced", balance(n) === 0 && balance(a) === 0 && balance(b) === 0, { n: balance(n), a: balance(a), b: balance(b) });

      const model = M.buildMapModel({ modRoot: MOD, gameRoot: path.join(ROOT, "no-game"), dependencyRoots: [], cacheStableLayers: false });
      const st = (model.states || []).find((s) => s.id === r.b.id) || {};
      const got = (st.victoryPoints || []).map((v) => v.province + ":" + v.value).sort().join(",");
      rec("the model reads the new state's victory points", ["1:15", "1:5", "3:8", "5:7"].every((x) => got.split(",").includes(x)), got);
      const probs = M.validateMapModel(model);
      rec("no victory point or province building is left in a state that does not list its province", !probs.some((p) => p.rule === "vp_not_in_state" || p.rule === "province_building_not_in_state"), probs.filter((p) => p.rule === "vp_not_in_state" || p.rule === "province_building_not_in_state"));
      rec("no province is in two states", !probs.some((p) => p.rule === "province_in_two_states"), probs.filter((p) => p.rule === "province_in_two_states"));
    }
  } catch (e) {
    rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e), false);
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    console.log(`\n=== a state carved from existing land keeps its provinces' history: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exitCode = 1; });
