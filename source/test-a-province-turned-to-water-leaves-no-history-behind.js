// A province turned to water leaves nothing of its history behind in its old state, in any date.
// #a-province-turned-to-water-leaves-no-history-behind
//
// Erasing land (POST /api/map/flip-province-sea) takes the province out of its state, and Auto-fix's sea cleanup
// (fixSeaProvinceLeftovers, POST /api/map/auto-fix) does the same for a state still listing a sea province. Both then ran
// removeVictoryPointForProvince and removeProvinceBuildingBlock — the first `buildings` block only — so what the state's
// history writes for the province IN A DATE stayed behind, naming a province the state no longer lists:
//   · a dated building block: `1939.1.1 = { buildings = { 3686 = { naval_facility = 1 } } }` — hoi4.exe logs
//     "State Error: Trying to set province building in state that doesn't own it" (statehistory.cpp) and skips it;
//   · a dated `add_victory_points = { province = N … }` (vanilla's 1032 - Yanan.txt, Rise of Nations' 505-Goias.txt);
//   · a province name or modifier naming it alone (`set_province_name` 23 dated in Rise of Nations, 1 in Novum Vexillum;
//     `add_province_modifier` 1,737 undated in Millennium Dawn).
// Measured on the six shipping maps' history/states: dated province building blocks vanilla 26, Rise of Nations 27, Novum
// Vexillum 8. And the undated victory point went without the comment above it, which then captioned the NEXT victory point
// — the caption-map failure CLAUDE.md warns about.
//
// A province that MOVES already takes all of this with it (takeProvinceHistory, #a-moved-province-keeps-its-dated-buildings).
// Water has nowhere to take it, so the same cut runs and the pieces are dropped: every date, every kind, each with the
// own-line comment above it and its trailing comment. Everything about the state's other provinces stays as written.
//
// Requests are the client's: public/map.js eraseProvinceLocal → queueWrite("/api/map/flip-province-sea", { provinceId });
// the Auto-fix button posts { modPath }; flushMapSaves adds modPath. The walkers are this test's own.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

let checks = 0, skips = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) fails.push(label);
};
const skip = (label) => { skips++; console.log("  SKIP " + label); };

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-watered-"));
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
const squash = (t) => String(t).replace(/\s+/g, " ").trim();
const provincesOf = (fileText) => {
  const st = entries(fileText).find((e) => e.key === "state");
  const m = st && /(?:^|[^A-Za-z0-9_])provinces\s*=\s*\{([^}]*)\}/.exec(mask(st.inner));
  return m ? (m[1].match(/\d+/g) || []).map(Number) : [];
};
/** everything a state's history writes for one province, per date: `<date>|<kind>|<squashed>` */
const piecesOf = (fileText, pid) => {
  const hist = historyOf(fileText);
  const ctxs = [{ date: "-", body: hist }, ...entries(hist).filter((e) => isDate(e.key)).map((e) => ({ date: e.key, body: e.inner }))];
  const out = [];
  const idIs = (inner, re) => { const ids = [...mask(inner).matchAll(re)].map((m) => Number(m[1])); return ids.length === 1 && ids[0] === pid; };
  for (const c of ctxs) {
    for (const e of entries(c.body)) {
      if (e.key === "buildings") { for (const q of entries(e.inner)) if (q.key === String(pid)) out.push(`${c.date}|B|${squash(mask(q.text))}`); }
      else if (e.key === "victory_points") { const n = mask(e.inner).match(/-?\d+(?:\.\d+)?/g) || []; for (let i = 0; i + 1 < n.length; i += 2) if (Number(n[i]) === pid) out.push(`${c.date}|V|${Number(n[i + 1])}`); }
      else if (e.key === "add_victory_points") { if (idIs(e.inner, /(?:^|[^A-Za-z0-9_])province\s*=\s*(\d+)/g)) out.push(`${c.date}|AV|${squash(mask(e.text))}`); }
      else if (e.key === "add_province_modifier" || e.key === "set_province_name") { if (idIs(e.inner, /(?:^|[^A-Za-z0-9_])id\s*=\s*(\d+)/g)) out.push(`${c.date}|P|${squash(mask(e.text))}`); }
    }
  }
  return out;
};
const balance = (t) => { let d = 0; for (const c of mask(t)) { if (c === "{") d++; else if (c === "}") d--; } return d; };
/** the first code line after the line holding `comment`, or null when the comment is not in the file */
const captioned = (text, comment) => {
  const lines = text.replace(/\r/g, "").split("\n");
  const at = lines.findIndex((l) => l.trim() === comment);
  if (at < 0) return null;
  for (let i = at + 1; i < lines.length; i++) { const l = lines[i].trim(); if (l && !l.startsWith("#")) return l; }
  return "";
};

// ── fixtures ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const mkMod = (name, defs, states) => {
  const MOD = path.join(ROOT, name);
  const mk = (rel, c) => { const p = path.join(MOD, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
  mk("descriptor.mod", `name="${name}"\nsupported_version="1.19.*"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\n`);
  mk("map/definition.csv", ["0;0;0;0;land;false;unknown;0", ...defs].join("\n") + "\n");
  mk("map/adjacencies.csv", "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n-1;-1;-1;-1;-1;-1;-1;-1;-1\n");
  const ids = defs.map((d) => d.split(";")[0]);
  mk("map/strategicregions/1-R.txt", `strategic_region={\n\tid=1\n\tname="R1"\n\tprovinces={ ${ids.join(" ")} }\n}\n`);
  mk("history/countries/AAA - A.txt", "capital = 1\n");
  for (const [f, t] of Object.entries(states)) mk("history/states/" + f, t);
  return MOD;
};
const stateText = (MOD, f) => { try { return fs.readFileSync(path.join(MOD, "history", "states", f), "utf8"); } catch (_) { return ""; } };

// Province 1 is the coast that is erased; province 2 stays. Province 1 has something in every context a shipping map uses.
const COAST = `state = {
	id = 1
	name = "STATE_1"
	manpower = 1000
	state_category = rural
	provinces = { 1 2 }
	history = {
		owner = AAA
		# the harbour city
		victory_points = { 1 5 }
		victory_points = {
			2 1 # Inland Town
		}
		buildings = {
			infrastructure = 3
			1 = { naval_base = 2 }
			2 = { bunker = 1 }
		}
		add_province_modifier = { static_modifiers = { terrain_port } province = { id = 1 } }
		1939.1.1 = {
			buildings = {
				1 = { naval_base = 4 } # the 1939 port
				2 = { bunker = 2 }
			}
			victory_points = { 1 10 }
			add_victory_points = { province = 1 value = 2 }
			set_province_name = { id = 1 name = PORT_NEW }
		}
		1933.1.1 = {
			buildings = {
				1 = { land_facility = 1 }
			}
		}
		1938.10.25 = {
			owner = AAA
		}
	}
}
`;

const server = createApp().listen(0, async () => {
  const PORT = server.address().port;
  const post = (ep, body) => fetch(`http://127.0.0.1:${PORT}${ep}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  try {
    console.log("[control] the test's own walkers read the fixture the way it is written");
    {
      const p1 = piecesOf(COAST, 1), p2 = piecesOf(COAST, 2);
      rec("province 1 has 8 pieces: 2 victory points, 3 building blocks, an add_victory_points, a modifier and a name", p1.length === 8, p1);
      rec("…in the undated history, 1939.1.1 and 1933.1.1", ["-", "1939.1.1", "1933.1.1"].every((d) => p1.some((x) => x.startsWith(d + "|"))), p1);
      rec("province 2 has 3: a victory point and two building blocks", p2.length === 3, p2);
      rec("the harbour-city comment captions province 1's victory point", captioned(COAST, "# the harbour city") === "victory_points = { 1 5 }", captioned(COAST, "# the harbour city"));
    }

    console.log("\n1. Erase coastal province 1  (POST /api/map/flip-province-sea)");
    {
      const MOD = mkMod("erase", ["1;10;0;0;land;true;plains;1", "2;20;0;0;land;false;plains;1", "3;30;0;0;sea;false;ocean;0"], { "1-A.txt": COAST });
      const r = await post("/api/map/flip-province-sea", { provinceId: 1, modPath: MOD });
      rec("the erase succeeded", r.s === 200 && r.b && r.b.ok === true && r.b.type === "sea", r.b);
      const a = stateText(MOD, "1-A.txt");
      rec("the state no longer lists province 1", !provincesOf(a).includes(1) && provincesOf(a).includes(2), provincesOf(a));
      const left = piecesOf(a, 1);
      rec("⭐⭐⭐ the state's history names province 1 in nothing, in any date", left.length === 0, left);
      rec("⭐⭐ …no dated building block for it (1939.1.1, 1933.1.1)", !left.some((x) => /\|B\|/.test(x) && !x.startsWith("-|")), left);
      rec("⭐⭐ …no add_victory_points for it", !left.some((x) => /\|AV\|/.test(x)), left);
      rec("⭐ …no province name or modifier for it", !left.some((x) => /\|P\|/.test(x)), left);
      rec("⚠️ province 2 keeps all three of its pieces, as written", JSON.stringify(piecesOf(a, 2)) === JSON.stringify(piecesOf(COAST, 2)), { was: piecesOf(COAST, 2), now: piecesOf(a, 2) });
      rec("⚠️ …with its victory point's own comment", /2 1 # Inland Town/.test(a), a);
      rec("⭐⭐ the comment above province 1's victory point went with it — it does not caption province 2's", captioned(a, "# the harbour city") === null, captioned(a, "# the harbour city"));
      rec("⚠️ …and the trailing comment of province 1's 1939 port went too", !/# the 1939 port/.test(a), a);
      rec("⚠️ the state-level infrastructure and the 1938.10.25 owner change stay", /infrastructure = 3/.test(a) && entries(historyOf(a)).some((e) => e.key === "1938.10.25" && /owner = AAA/.test(e.inner)), a);
      rec("⭐ the 1939.1.1 entry stays for province 2's block", entries(historyOf(a)).filter((e) => e.key === "1939.1.1").length === 1, a);
      rec("⭐ …and the 1933.1.1 entry, which held only province 1's block, leaves no empty shell", !entries(historyOf(a)).some((e) => e.key === "1933.1.1"), a);
      rec("the file is brace-balanced", balance(a) === 0, balance(a));
      // ⛔ #an-erase-says-what-it-cut — …and the answer says what went, for the Save line to say it (review of the T39 merge,
      // S-erase-drops-vp-unsaid): every piece above, as the page's erasedHistoryNote reads it
      const cut = (r.b.historyCut || []).filter((c) => c.stateId === 1 && c.provinceId === 1);
      rec("⭐⭐⭐ the answer names what the erase cut from state 1: its victory points (5; 10 and +2 in 1939.1.1), its building blocks in their dates (a naval base of 2; of 4 in 1939.1.1; a land facility in 1933.1.1) and the two lines naming or modifying it",
        cut.length === 1 && (r.b.historyCut || []).length === 1
        && JSON.stringify(cut[0].victoryPoints) === JSON.stringify([{ value: 5 }, { value: 10, date: "1939.1.1" }, { value: 2, date: "1939.1.1", added: true }])
        && JSON.stringify(cut[0].buildings) === JSON.stringify([{ levels: { naval_base: 2 } }, { date: "1939.1.1", levels: { naval_base: 4 } }, { date: "1933.1.1", levels: { land_facility: 1 } }])
        && cut[0].statements === 2, r.b.historyCut);
    }

    console.log("\n2. Auto-fix a state that still lists a sea province with dated history  (POST /api/map/auto-fix → fixSeaProvinceLeftovers)");
    {
      const LEFT = 'state = {\n\tid = 1\n\tname = "STATE_1"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 3 4 }\n\thistory = {\n\t\towner = AAA\n'
        + '\t\tvictory_points = { 3 2 }\n\t\tvictory_points = { 4 1 }\n\t\tbuildings = {\n\t\t\tinfrastructure = 2\n\t\t\t3 = { bunker = 1 }\n\t\t\t4 = { bunker = 1 }\n\t\t}\n'
        + '\t\t1939.1.1 = {\n\t\t\tbuildings = {\n\t\t\t\t3 = { land_facility = 1 }\n\t\t\t\t4 = { bunker = 3 }\n\t\t\t}\n\t\t\tadd_victory_points = { province = 3 value = 1 }\n\t\t}\n'
        + '\t\t1936.6.1 = {\n\t\t\tset_province_name = { id = 3 name = OLD_SHORE }\n\t\t}\n\t}\n}\n';
      const MOD = mkMod("leftovers", ["3;30;0;0;sea;false;ocean;0", "4;40;0;0;land;false;plains;1"], { "1-A.txt": LEFT });
      const r = await post("/api/map/auto-fix", { modPath: MOD });
      rec("Auto-fix ran", r.s === 200 && r.b && r.b.ok === true, r.b);
      const sl = r.b && r.b.fixes && r.b.fixes.seaLeftovers;
      rec("…and its sea cleanup edited the state", !!sl && sl.statesEdited === 1 && sl.provincesRemoved === 1, sl);
      const a = stateText(MOD, "1-A.txt");
      rec("the state no longer lists sea province 3", !provincesOf(a).includes(3) && provincesOf(a).includes(4), provincesOf(a));
      rec("⭐⭐⭐ the state's history names province 3 in nothing, in any date", piecesOf(a, 3).length === 0, piecesOf(a, 3));
      rec("⚠️ province 4 keeps all three of its pieces", JSON.stringify(piecesOf(a, 4)) === JSON.stringify(piecesOf(LEFT, 4)), { was: piecesOf(LEFT, 4), now: piecesOf(a, 4) });
      rec("⭐ …and no empty 1936.6.1 entry is left behind", !entries(historyOf(a)).some((e) => e.key === "1936.6.1"), a);
      rec("the file is brace-balanced", balance(a) === 0, balance(a));
      const dir = path.join(MOD, "history", "states");
      const hash = () => fs.readdirSync(dir).sort().map((f) => f + ":" + crypto.createHash("sha1").update(fs.readFileSync(path.join(dir, f))).digest("hex")).join("|");
      const before = hash();
      const r2 = await post("/api/map/auto-fix", { modPath: MOD });
      rec("a second Auto-fix click ran", r2.s === 200 && r2.b && r2.b.ok === true, r2.b);
      rec("⭐ …and left history/states byte-identical", hash() === before, { before, after: hash() });
    }

    console.log("\n3. The shipping maps' own dated pieces, erased through flipProvinceToSea (derived from the installed corpus)");
    {
      const VAN = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
      const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
      const roots = [["vanilla", VAN], ["Millennium Dawn", path.join(WS, "2777392649")], ["Road to 56", path.join(WS, "820260968")], ["Old World Blues", path.join(WS, "2265420196")], ["Novum Vexillum", path.join(WS, "1827273767")], ["Rise of Nations", path.join(WS, "2026448968")]];
      let ran = 0, total = 0;
      for (const [label, root] of roots) {
        const sdir = path.join(root, "history", "states");
        if (!fs.existsSync(sdir)) { skip(`${label} is not installed — its pieces were NOT erased`); continue; }
        ran++;
        const picked = [];
        for (const f of fs.readdirSync(sdir).filter((x) => /\.txt$/i.test(x))) {
          let raw; try { raw = fs.readFileSync(path.join(sdir, f), "utf8"); } catch (_) { continue; }
          if (entries(raw).filter((e) => e.key === "state").length !== 1 || balance(raw) !== 0) continue;
          const provs = [...new Set(provincesOf(raw))];
          if (provs.length < 2) continue;                                   // erasing a state's last province is another path
          const pids = provs.filter((p) => piecesOf(raw, p).some((x) => !x.startsWith("-|")));
          if (pids.length) picked.push({ f, raw, provs, pid: pids[0] });
        }
        if (!picked.length) { rec(`${label}: no province with a dated piece (the census says ${["Millennium Dawn", "Road to 56", "Old World Blues"].includes(label) ? "none" : "some"})`, ["Millennium Dawn", "Road to 56", "Old World Blues"].includes(label)); continue; }
        const MOD = path.join(ROOT, "corpus-" + label.replace(/\W+/g, ""));
        const allProvs = [...new Set(picked.flatMap((p) => p.provs))];
        const mk = (rel, c) => { const p = path.join(MOD, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
        mk("descriptor.mod", 'name="corpus"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\n');
        mk("map/definition.csv", ["0;0;0;0;land;false;unknown;0", ...allProvs.map((q, i) => `${q};${((i + 1) >> 16) & 255};${((i + 1) >> 8) & 255};${(i + 1) & 255};land;true;plains;1`)].join("\n") + "\n");
        for (const p of picked) mk("history/states/" + p.f, p.raw);
        const stranded = [], disturbed = [], unbalanced = [], errors = [];
        for (const p of picked) {
          const res = M.flipProvinceToSea({ modRoot: MOD, gameRoot: path.join(ROOT, "no-game"), dependencyRoots: [], provinceId: p.pid });
          if (!res || res.error) { errors.push({ f: p.f, pid: p.pid, error: res && res.error }); continue; }
          const after = stateText(MOD, p.f);
          if (balance(after) !== 0) unbalanced.push(p.f);
          if (piecesOf(after, p.pid).length) stranded.push({ f: p.f, pid: p.pid, left: piecesOf(after, p.pid) });
          for (const q of p.provs) if (q !== p.pid && JSON.stringify(piecesOf(after, q)) !== JSON.stringify(piecesOf(p.raw, q))) { disturbed.push({ f: p.f, q, was: piecesOf(p.raw, q), now: piecesOf(after, q) }); break; }
        }
        total += picked.length;
        rec(`${label}: erased all ${picked.length} provinces that carry a dated piece`, errors.length === 0, errors.slice(0, 4));
        rec(`${label}: ⭐⭐⭐ none of them is named by anything left in its old state, in any date`, stranded.length === 0, stranded.slice(0, 3));
        rec(`${label}: ⚠️ every other province of those states keeps its pieces exactly`, disturbed.length === 0, disturbed.slice(0, 3));
        rec(`${label}: every file stays brace-balanced`, unbalanced.length === 0, unbalanced);
      }
      if (!ran) skip("no shipping map is installed — section 3 did NOT run");
      else console.log(`  (${total} provinces across ${ran} maps)`);
    }
  } catch (e) {
    rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e), false);
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    console.log(`\n=== a province turned to water leaves no history behind: ${checks} checks, ${fails.length} failed, ${skips} skipped ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exitCode = 1; });
