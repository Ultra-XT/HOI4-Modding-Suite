// A state merged into another keeps what its history gives its land in every date, not only at the 1936 start.
// #a-merged-state-keeps-its-dated-history
//
// POST /api/map/merge-state moves every province of the merged-away state (each takes its own history — building blocks,
// victory points, names — in its dates: #a-moved-province-keeps-its-dated-buildings), sums the state's UNDATED buildings,
// resources and manpower onto the kept state, and deletes the merged-away file. Everything else in that file was deleted
// with it. Measured on the six shipping maps' history/states (census, this batch):
//     dated `buildings = { }` entries      vanilla 117 · Road to 56 41 · Rise of Nations 131 · Novum Vexillum 17 · MD 0 · OWB 0
//       …of which state-level levels       vanilla 212 · Road to 56 81 · Rise of Nations 211 · Novum Vexillum 21
//     dated add_resource / remove_building  Rise of Nations 2 / 1 · vanilla 0 / 1 · Road to 56 0 / 1
//     dated `TAG = { set_province_controller = … }`   vanilla 11 · Road to 56 10 · Rise of Nations 45 · NV 17 · OWB 4
//     undated add_extra_state_shared_building_slots   Novum Vexillum 115 · OWB 20 · vanilla 2 · R56, RoN, MD 1
// e.g. vanilla 37-Denmark's `1939.1.1 = { buildings = { … fuel_silo = 1 } }` was gone after a merge.
//
// ⚠️ A DATED LEVEL IS A TOTAL, NOT AN INCREMENT. vanilla 37-Denmark's 1939.1.1 block repeats every undated level beside
// its new fuel_silo, and dated levels BELOW the undated one exist (vanilla 851-Var dockyard 3 → 1, Rise of Nations
// 65-Sachsen industrial_complex 4 → 2, Novum Vexillum 785-Kosovo infrastructure 5 → 4): 169 vanilla pairs, 141 higher, 27
// equal, 1 lower. So a merged state's level at a date is the kept state's level THEN plus the merged state's level THEN,
// each read as the latest dated value at or before that date, else the undated one — and it must be written at every date
// either state sets that building, or the kept state's own dated total would drop the merged land's buildings.
//
// What a merge carries, and what it leaves: the effects that add to the land — building levels (summed as above),
// add_resource, remove_building, add_extra_state_shared_building_slots, add_manpower, and a `TAG = { … }` that only sets
// province controllers — go into the kept state's same date, as written. What says who the state IS — owner, controller,
// cores, claims, flags, names, demilitarisation, scripted blocks — is the kept state's, and the response lists what was
// left behind (a merge cannot give one state two owners).
//
// Requests are the client's: public/map.js queueWrite("/api/map/merge-state", { sourceStateId, targetStateId },
// { merge: true }); flushMapSaves adds modPath. The walkers and the arithmetic are this test's own.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0, skips = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 900)));
  if (!ok) fails.push(label);
};
const skip = (label) => { skips++; console.log("  SKIP " + label); };

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-mergehistory-"));
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const M = require("./map-data.js");
const { createApp } = require("./server.js");

// ── the test's own reading of a state file ───────────────────────────────────────────────────────────────────────────
const mask = (t) => String(t).replace(/#[^\r\n]*/g, (m) => " ".repeat(m.length));
const closeOf = (s, open) => { let d = 0; for (let i = open; i < s.length; i++) { if (s[i] === "{") d++; else if (s[i] === "}") { d--; if (d === 0) return i; } } return -1; };
const isDate = (k) => /^\d+\.\d+\.\d+(\.\d+)?$/.test(k);
const dateKey = (d) => d.split(".").map(Number).concat([0, 0, 0, 0]).slice(0, 4);
const dateCmp = (a, b) => { const x = dateKey(a), y = dateKey(b); for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
/** depth-0 statements of a body: { key, inner (block) | value (scalar), text } */
const stmts = (raw) => {
  const s = mask(raw), out = [];
  let i = 0;
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i >= s.length) break;
    const st = i;
    if (s[i] === "{" || s[i] === "}") { const c = s[i] === "{" ? closeOf(s, i) : i; i = (c < 0 ? s.length : c) + 1; continue; }
    let key = "";
    while (i < s.length && !/[\s={}]/.test(s[i])) key += s[i++];
    while (i < s.length && /\s/.test(s[i])) i++;
    if (s[i] !== "=") { out.push({ key, value: null, inner: null, text: raw.slice(st, i) }); continue; }
    i++;
    while (i < s.length && /\s/.test(s[i])) i++;
    if (s[i] === "{") { const c = closeOf(s, i); if (c < 0) break; out.push({ key, value: null, inner: raw.slice(i + 1, c), text: raw.slice(st, c + 1) }); i = c + 1; continue; }
    let v = "";
    if (s[i] === '"') { const e = s.indexOf('"', i + 1); v = s.slice(i, e < 0 ? s.length : e + 1); i = e < 0 ? s.length : e + 1; }
    else while (i < s.length && !/[\s{}]/.test(s[i])) v += s[i++];
    out.push({ key, value: v, inner: null, text: raw.slice(st, i) });
  }
  return out;
};
const stateBody = (fileText) => { const st = stmts(fileText).find((e) => e.key === "state" && e.inner != null); return st ? st.inner : ""; };
const historyOf = (fileText) => { const h = stmts(stateBody(fileText)).find((e) => e.key === "history" && e.inner != null); return h ? h.inner : ""; };
const provincesOf = (fileText) => { const p = stmts(stateBody(fileText)).find((e) => e.key === "provinces" && e.inner != null); return p ? (mask(p.inner).match(/\d+/g) || []).map(Number) : []; };
const squash = (t) => String(t).replace(/\s+/g, " ").trim();
const balance = (t) => { let d = 0; for (const c of mask(t)) { if (c === "{") d++; else if (c === "}") d--; } return d; };
/** the contexts of a history: undated ("-") and each date entry, in file order */
const contexts = (hist) => [{ date: "-", body: hist }, ...stmts(hist).filter((e) => isDate(e.key) && e.inner != null).map((e) => ({ date: e.key, body: e.inner }))];
/** state-level building levels: { und: {k: v}, dated: [{date, k, v}] } — the undated block is the first `buildings` of history itself */
const levelsOf = (fileText) => {
  const hist = historyOf(fileText);
  const flat = (inner) => { const o = {}; for (const e of stmts(inner)) if (e.value != null && /^[a-z_][a-z0-9_]*$/.test(e.key) && /^-?\d+(\.\d+)?$/.test(e.value)) o[e.key] = Number(e.value); return o; };
  const und = (() => { const b = stmts(hist).find((e) => e.key === "buildings" && e.inner != null); return b ? flat(b.inner) : {}; })();
  const dated = [];
  for (const c of contexts(hist).slice(1)) for (const b of stmts(c.body).filter((e) => e.key === "buildings" && e.inner != null)) for (const [k, v] of Object.entries(flat(b.inner))) dated.push({ date: c.date, k, v });
  return { und, dated };
};
/** a building's level at a date: the latest dated value at or before it (file order breaks a tie), else the undated one */
const levelAt = (lv, k, date) => {
  let best = null;
  for (const d of lv.dated) if (d.k === k && dateCmp(d.date, date) <= 0 && (best === null || dateCmp(d.date, best.date) >= 0)) best = d;
  return best ? best.v : (lv.und[k] || 0);
};
/** the effects a merge carries, per context: squashed text list */
const CARRIED_SCALARS = new Set(["add_extra_state_shared_building_slots", "add_manpower"]);
const CARRIED_BLOCKS = new Set(["add_resource", "remove_building"]);
const isControllerBlock = (e) => /^[A-Z][A-Z0-9]{2}$/.test(e.key) && e.inner != null && stmts(e.inner).length > 0 && stmts(e.inner).every((x) => x.key === "set_province_controller" && x.value != null);
const carriedOf = (fileText) => {
  const out = [];
  for (const c of contexts(historyOf(fileText))) for (const e of stmts(c.body)) {
    if ((CARRIED_SCALARS.has(e.key) && e.value != null) || (CARRIED_BLOCKS.has(e.key) && e.inner != null) || isControllerBlock(e)) out.push(`${c.date}|${squash(mask(e.text))}`);
  }
  return out;
};
const count = (arr, x) => arr.filter((y) => y === x).length;
/** check the kept state after a merge against the two states before it; returns a list of problems */
const judgeMerge = (T0, S0, T1) => {
  const problems = [];
  const lt0 = levelsOf(T0), ls0 = levelsOf(S0), lt1 = levelsOf(T1);
  const keys = new Set([...Object.keys(lt0.und), ...Object.keys(ls0.und), ...lt0.dated.map((d) => d.k), ...ls0.dated.map((d) => d.k)]);
  const dates = new Set(["0.1.1", ...lt0.dated.map((d) => d.date), ...ls0.dated.map((d) => d.date)]);
  for (const k of keys) for (const d of dates) {
    const want = levelAt(lt0, k, d) + levelAt(ls0, k, d), got = levelAt(lt1, k, d);
    if (want !== got) problems.push({ level: k, at: d === "0.1.1" ? "start" : d, want, got });
  }
  const c1 = carriedOf(T1), cs = carriedOf(S0), ct = carriedOf(T0);
  for (const x of new Set(cs)) if (count(c1, x) < count(cs, x) + count(ct, x)) problems.push({ notCarried: x });
  return problems;
};

// ── fixture ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const mkMod = (name, provinceIds, states) => {
  const MOD = path.join(ROOT, name);
  const mk = (rel, c) => { const p = path.join(MOD, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
  mk("descriptor.mod", `name="${name}"\nsupported_version="1.19.*"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\n`);
  mk("map/definition.csv", ["0;0;0;0;land;false;unknown;0", ...provinceIds.map((q, i) => `${q};${((i + 1) >> 16) & 255};${((i + 1) >> 8) & 255};${(i + 1) & 255};land;false;plains;1`)].join("\n") + "\n");
  mk("map/adjacencies.csv", "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n-1;-1;-1;-1;-1;-1;-1;-1;-1\n");
  mk("map/strategicregions/1-R.txt", `strategic_region={\n\tid=1\n\tname="R1"\n\tprovinces={ ${provinceIds.join(" ")} }\n}\n`);
  for (const [f, t] of Object.entries(states)) mk("history/states/" + f, t);
  return MOD;
};
const stateText = (MOD, f) => { try { return fs.readFileSync(path.join(MOD, "history", "states", f), "utf8"); } catch (_) { return ""; } };

const KEPT = `state = {
	id = 1
	name = "STATE_1"
	manpower = 1000
	state_category = rural
	provinces = { 1 2 }
	history = {
		owner = AAA
		add_core_of = AAA
		buildings = {
			infrastructure = 3
			industrial_complex = 2
			arms_factory = 1
		}
		1936.6.1 = {
			buildings = {
				infrastructure = 4
			}
		}
		1939.1.1 = {
			owner = AAA
			buildings = {
				industrial_complex = 6
			}
		}
	}
}
`;
const MERGED = `state = {
	id = 2
	name = "STATE_2"
	manpower = 2000
	state_category = rural
	provinces = { 3 4 }
	history = {
		owner = AAA
		add_core_of = AAA
		buildings = {
			infrastructure = 2
			industrial_complex = 1
			3 = { bunker = 1 }
		}
		# slots for the shipyard town
		add_extra_state_shared_building_slots = 2
		1936.6.1 = {
			add_resource = { type = steel amount = 4 }
		}
		1938.10.25 = {
			owner = BBB
			controller = JAP
			add_core_of = BBB
			JAP = {
				set_province_controller = 3
				set_province_controller = 4
			}
		}
		1939.1.1 = {
			buildings = {
				infrastructure = 2
				industrial_complex = 4 # expanded for 1939
				fuel_silo = 1
				3 = { naval_facility = 1 }
			}
			remove_building = { type = arms_factory level = 1 }
		}
	}
}
`;
const CAPITAL = 'state = {\n\tid = 3\n\tname = "STATE_3"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 5 }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n';

const server = createApp().listen(0, async () => {
  const PORT = server.address().port;
  const post = (ep, body) => fetch(`http://127.0.0.1:${PORT}${ep}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  try {
    console.log("[control] the test's own walkers read the fixture the way it is written");
    {
      const lk = levelsOf(KEPT), lm = levelsOf(MERGED);
      rec("kept state: industrial_complex 2 at the start, 6 from 1939.1.1", levelAt(lk, "industrial_complex", "1936.1.1") === 2 && levelAt(lk, "industrial_complex", "1939.1.1") === 6);
      rec("…infrastructure 3 at the start, 4 from 1936.6.1 on", levelAt(lk, "infrastructure", "1936.1.1") === 3 && levelAt(lk, "infrastructure", "1939.1.1") === 4);
      rec("merged state: industrial_complex 1 at the start, 4 from 1939.1.1; fuel_silo 0 then 1", levelAt(lm, "industrial_complex", "1936.1.1") === 1 && levelAt(lm, "industrial_complex", "1939.1.1") === 4 && levelAt(lm, "fuel_silo", "1938.1.1") === 0 && levelAt(lm, "fuel_silo", "1939.1.1") === 1);
      rec("a province block is not a state-level level", !lm.dated.some((d) => /^\d+$/.test(d.k)));
      rec("the merged state has 4 effects to carry: extra slots, add_resource, a controller block, remove_building", carriedOf(MERGED).length === 4, carriedOf(MERGED));
    }

    console.log("\n1. Merge a state with dated history into one with dated history of its own  (POST /api/map/merge-state)");
    {
      const MOD = mkMod("merge", [1, 2, 3, 4, 5], { "1-Kept.txt": KEPT, "2-Merged.txt": MERGED, "3-Other.txt": CAPITAL });
      const r = await post("/api/map/merge-state", { sourceStateId: 2, targetStateId: 1, modPath: MOD });
      rec("the merge succeeded", r.s === 200 && r.b && r.b.ok === true && r.b.changed === true, r.b);
      rec("the merged-away state's file is gone", !fs.existsSync(path.join(MOD, "history", "states", "2-Merged.txt")));
      const k = stateText(MOD, "1-Kept.txt"), lk = levelsOf(k);
      rec("the kept state lists all four provinces", [1, 2, 3, 4].every((p) => provincesOf(k).includes(p)), provincesOf(k));
      const problems = judgeMerge(KEPT, MERGED, k);
      rec("⭐⭐⭐ at every date either state sets a building, the kept state's level is the sum of the two", problems.filter((p) => p.level).length === 0, problems.filter((p) => p.level));
      rec("⭐⭐ 1939.1.1 industrial_complex: 6 + 4 = 10", levelAt(lk, "industrial_complex", "1939.1.1") === 10, levelAt(lk, "industrial_complex", "1939.1.1"));
      rec("⭐⭐ 1939.1.1 fuel_silo: the merged state's new building arrives", levelAt(lk, "fuel_silo", "1939.1.1") === 1 && levelAt(lk, "fuel_silo", "1936.1.1") === 0, k);
      rec("⭐ 1936.6.1 infrastructure: the kept state's dated 4 + the merged state's undated 2 = 6", levelAt(lk, "infrastructure", "1936.6.1") === 6, levelAt(lk, "infrastructure", "1936.6.1"));
      rec("…and at the start the undated sums still stand (infrastructure 5, industrial_complex 3, arms_factory 1)", levelAt(lk, "infrastructure", "1936.1.1") === 5 && levelAt(lk, "industrial_complex", "1936.1.1") === 3 && levelAt(lk, "arms_factory", "1936.1.1") === 1, lk.und);
      const entriesAt = (d) => stmts(historyOf(k)).filter((e) => e.key === d);
      rec("⭐ one 1939.1.1 entry and one 1936.6.1 entry — the dated history was spliced into the kept state's own", entriesAt("1939.1.1").length === 1 && entriesAt("1936.6.1").length === 1, historyOf(k));
      rec("⭐⭐ every effect the merged state gave its land is in the kept state, in the same date", problems.filter((p) => p.notCarried).length === 0, problems.filter((p) => p.notCarried));
      rec("⭐ the extra building slots keep the comment above them", /# slots for the shipyard town\s*\n\s*add_extra_state_shared_building_slots = 2/.test(k), k);
      rec("⭐ the merged 1939 level's own comment is kept", /# expanded for 1939/.test(k), k);
      // Comments are content, and a comment captions the code line below it: kept is not enough, it must caption nothing else.
      const captionedBy = (text, comment) => { const ls = text.replace(/\r/g, "").split("\n"); const at = ls.findIndex((l) => l.trim() === comment); if (at < 0) return null; for (let i = at + 1; i < ls.length; i++) { const l = ls[i].trim(); if (l && !l.startsWith("#")) return l; } return ""; };
      const cap = captionedBy(k, "# expanded for 1939");
      rec("⭐⭐ …and captions no other building: it stands at the end of the 1939 block, or on the industrial_complex line", cap === null ? /industrial_complex = 10 # expanded for 1939/.test(k) : cap === "}", { captions: cap });
      rec("the moved province's 1939 building block arrived in 1939.1.1 (the province move)", /3 = \{ naval_facility = 1 \}/.test((entriesAt("1939.1.1")[0] || {}).inner || ""), k);
      rec("⚠️ the kept state is still AAA's: no owner BBB, no controller JAP, no core for BBB", !/owner = BBB|controller = JAP|add_core_of = BBB/.test(k), k);
      rec("⚠️ …and its own 1939.1.1 owner line stays", /owner = AAA/.test((entriesAt("1939.1.1")[0] || {}).inner || ""), k);
      const left = (r.b && r.b.carriedHistory && r.b.carriedHistory.leftBehind) || [];
      rec("⭐ the response says what the merge left behind: the 1938.10.25 owner, controller and core", ["owner", "controller", "add_core_of"].every((key) => left.some((x) => x.key === key && x.date === "1938.10.25")), r.b && r.b.carriedHistory);
      rec("the kept state's file is brace-balanced", balance(k) === 0, balance(k));
    }

    console.log("\n2. The shipping maps' own states, merged through mergeState (derived from the installed corpus)");
    {
      const VAN = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
      const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
      const roots = [["vanilla", VAN], ["Millennium Dawn", path.join(WS, "2777392649")], ["Road to 56", path.join(WS, "820260968")], ["Old World Blues", path.join(WS, "2265420196")], ["Novum Vexillum", path.join(WS, "1827273767")], ["Rise of Nations", path.join(WS, "2026448968")]];
      const PER_MAP = 20;
      let ran = 0, merged = 0;
      for (const [label, root] of roots) {
        const sdir = path.join(root, "history", "states");
        if (!fs.existsSync(sdir)) { skip(`${label} is not installed — its states were NOT merged`); continue; }
        ran++;
        const all = [];
        for (const f of fs.readdirSync(sdir).filter((x) => /\.txt$/i.test(x)).sort()) {
          let raw; try { raw = fs.readFileSync(path.join(sdir, f), "utf8"); } catch (_) { continue; }
          if (stmts(raw).filter((e) => e.key === "state").length !== 1 || balance(raw) !== 0) continue;
          const body = stateBody(raw);
          const id = Number((stmts(body).find((e) => e.key === "id") || {}).value);
          const owner = (stmts(historyOf(raw)).find((e) => e.key === "owner") || {}).value || "";
          if (!Number.isFinite(id) || !owner || !provincesOf(raw).length) continue;
          all.push({ f, raw, id, owner, provs: [...new Set(provincesOf(raw))], interesting: levelsOf(raw).dated.length > 0 || carriedOf(raw).length > 0 });
        }
        // A state with dated levels or an effect to carry, merged into the next state of the same owner that has dated levels
        // of its own when one exists (the harder case), else the next of the same owner.
        const pairs = [];
        const used = new Set();
        for (const s of all.filter((x) => x.interesting)) {
          if (pairs.length >= PER_MAP || used.has(s.f)) continue;
          const same = all.filter((x) => x.owner === s.owner && x.f !== s.f && !used.has(x.f) && !x.provs.some((p) => s.provs.includes(p)));
          const t = same.find((x) => levelsOf(x.raw).dated.length) || same[0];
          if (!t) continue;
          used.add(s.f); used.add(t.f);
          pairs.push({ s, t });
        }
        if (!pairs.length) { rec(`${label}: no state with dated levels or an effect to carry had a same-owner partner`, false); continue; }
        const bad = [], errors = [], unbalanced = [];
        pairs.forEach((p, n) => {
          const MOD = mkMod(`corpus-${label.replace(/\W+/g, "")}-${n}`, [...p.s.provs, ...p.t.provs], { [p.s.f]: p.s.raw, [p.t.f]: p.t.raw });
          let res;
          try { res = M.mergeState({ modRoot: MOD, gameRoot: path.join(ROOT, "no-game"), dependencyRoots: [], sourceStateId: p.s.id, targetStateId: p.t.id }); } catch (e) { res = { error: e.message }; }
          if (!res || res.error || !res.changed || fs.existsSync(path.join(MOD, "history", "states", p.s.f))) { errors.push({ s: p.s.f, t: p.t.f, error: res && res.error }); return; }
          const after = stateText(MOD, p.t.f);
          if (balance(after) !== 0) unbalanced.push(p.t.f);
          const problems = judgeMerge(p.t.raw, p.s.raw, after);
          if (problems.length) bad.push({ s: p.s.f, t: p.t.f, problems: problems.slice(0, 4) });
          try { fs.rmSync(MOD, { recursive: true, force: true }); } catch (_) {}
        });
        merged += pairs.length;
        rec(`${label}: merged ${pairs.length} same-owner pairs`, errors.length === 0, errors.slice(0, 3));
        rec(`${label}: ⭐⭐⭐ every building level at every date is the sum of the two states, and every effect arrived in its date`, bad.length === 0, bad.slice(0, 3));
        rec(`${label}: every kept file stays brace-balanced`, unbalanced.length === 0, unbalanced);
      }
      if (!ran) skip("no shipping map is installed — section 2 did NOT run");
      else console.log(`  (${merged} merges across ${ran} maps)`);
    }
  } catch (e) {
    rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e), false);
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    console.log(`\n=== a merged state keeps its dated history: ${checks} checks, ${fails.length} failed, ${skips} skipped ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exitCode = 1; });
