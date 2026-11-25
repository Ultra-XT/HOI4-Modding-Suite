// A commented-out block's body and closing brace are not the caption of the statement below them.
// #a-caption-ate-a-commented-out-block
//
// Every cut in map-data.js takes a statement together with its caption — the own-line comments directly
// above it, which belong to it the way a comment above a key belongs to that key. captionStart refused the
// FIRST line of commented-out code (`#victory_points = {` matches `#<key> =`) and nothing refused the REST
// of it, so `#\t976 1` and `#}` read as ordinary prose and were captured as the caption of whatever real
// statement came next. The cut then deleted them.
//
// Measured through POST /api/map/flip-province-sea — the request public/map.js's eraseProvinceLocal
// queues — on vanilla's history/states/47-Greece.txt, which ships five commented-out victory_points blocks:
// erasing the provinces of the LIVE blocks underneath them took `#\t976 1` and `#}` with them. 9 comment
// lines in, 7 out, and the `#victory_points = {` they left standing is then an unmatched brace inside a
// comment — which is the other half of this pair (#a-brace-in-a-comment-loses-a-state-file): the mod's own
// validator called the file unreadable and told the modder HOI4 would skip it. The same file is on disk in
// the owner's nova_flow2_0916 build, written by an Auto-fix click.
//
// COMMENTS ARE CONTENT. A caption is prose, and prose does not open or close a brace it does not close or
// open, so a comment line whose own braces do not balance is part of somebody's disabled code.
//
// Section 4 is the other direction: a REAL caption must still travel with its statement, or the fix would
// have bought comment safety by breaking #a-moved-province-keeps-its-victory-points-in-their-dates.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0, skips = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) fails.push(label);
};
const skip = (label) => { skips++; console.log("  SKIP " + label); };

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-capblock-"));
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

// ── the test's own reading of a file ─────────────────────────────────────────────────────────────────────
/** every own-line comment, in order, trimmed — a multiset comparison is blind to POSITION, so section 1
 *  checks the sequence AND section 2 checks which code line each comment captions. */
const commentLines = (t) => t.replace(/\r\n/g, "\n").split("\n").filter((l) => /^[ \t]*#/.test(l)).map((l) => l.trim());
/** caption map: for each own-line comment, the first code line under it — the comparison CLAUDE.md asks for */
const captionMap = (t) => {
  const lines = t.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^[ \t]*#/.test(lines[i])) continue;
    let j = i + 1;
    while (j < lines.length && (!lines[j].trim() || /^[ \t]*#/.test(lines[j]))) j++;
    out.push(lines[i].trim() + "  ->  " + (j < lines.length ? lines[j].trim() : "<end of file>"));
  }
  return out;
};
/** each commented-out block as one group: its `#<key> = …` opening line and the comment lines under it that
 *  are not themselves an opening. Grouping is the POSITION check — losing `#\t976 1` and `#}` leaves the
 *  opener behind as a group of one, which a multiset of comment lines would still call a loss but a
 *  whole-line diff would drown in noise. */
const disabledBlocks = (t) => {
  const lines = t.replace(/\r\n/g, "\n").split("\n");
  const opener = (l) => /^[ \t]*#+[ \t]*[A-Za-z0-9_.]+[ \t]*=/.test(l);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (!opener(lines[i])) continue;
    const g = [lines[i].trim()];
    let j = i + 1;
    while (j < lines.length && /^[ \t]*#/.test(lines[j]) && !opener(lines[j])) { g.push(lines[j].trim()); j++; }
    out.push(g.join(" | "));
    i = j - 1;
  }
  return out;
};
const mask = (t) => String(t).replace(/#[^\r\n]*/g, (m) => " ".repeat(m.length));
const balance = (t) => { let d = 0; for (const c of mask(t)) { if (c === "{") d++; else if (c === "}") d--; } return d; };
/** the brace balance of the COMMENT text alone — 0 on a file whose disabled blocks are all intact */
const commentBalance = (t) => {
  let d = 0;
  for (const l of commentLines(t)) for (const c of l) { if (c === "{") d++; else if (c === "}") d--; }
  return d;
};

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────────────────
const mk = (MOD, rel, c) => { const p = path.join(MOD, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
let n = 0;
const mkMod = (defs, states) => {
  const MOD = path.join(ROOT, "mod" + (++n));
  mk(MOD, "descriptor.mod", "name=\"mod" + n + "\"\nsupported_version=\"1.19.*\"\nreplace_path=\"history/states\"\nreplace_path=\"history/countries\"\nreplace_path=\"map\"\n");
  mk(MOD, "map/definition.csv", ["0;0;0;0;land;false;unknown;0", ...defs].join("\n") + "\n");
  mk(MOD, "map/adjacencies.csv", "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n-1;-1;-1;-1;-1;-1;-1;-1;-1\n");
  mk(MOD, "map/strategicregions/1-R.txt", "strategic_region={\n\tid=1\n\tname=\"R1\"\n\tprovinces={ " + defs.map((d) => d.split(";")[0]).join(" ") + " }\n}\n");
  mk(MOD, "history/countries/AAA - A.txt", "capital = 2\n");
  for (const [f, t] of Object.entries(states)) mk(MOD, "history/states/" + f, t);
  return MOD;
};
const DEFS = ["1;10;0;0;land;true;plains;1", "2;20;0;0;land;false;plains;1", "3;30;0;0;sea;false;ocean;0"];
const stateText = (MOD, f) => fs.readFileSync(path.join(MOD, "history", "states", f), "utf8");

// Vanilla 47-Greece.txt's history, verbatim in shape: three commented-out victory_points blocks sitting
// directly above a live one. Province 1 is erased; province 2 stays.
const GREECE_SHAPE = `state = {
	id = 1
	name = "STATE_1"
	manpower = 1000
	state_category = rural
	provinces = { 1 2 }
	history = {
		owner = AAA
		victory_points = {
			2 3
		}
		#victory_points = {
		#	863 1
		#}
		#victory_points = {
		#	3864 3
		#}
		#victory_points = {
		#	976 1
		#}
		victory_points = {
			1 20
		}
		buildings = {
			infrastructure = 2
		}
		add_core_of = AAA
	}
}
`;

// Every other kind of statement the cut takes, each sitting under a commented-out block's tail.
// (id 7, not 1: the state's own `id = 1` would make this test's "nothing still names province 1" walker
// answer itself.)
const EVERY_KIND = `state = {
	id = 7
	name = "STATE_7"
	manpower = 1000
	state_category = rural
	provinces = { 1 2 }
	history = {
		owner = AAA
		#buildings = {
		#	1 = { naval_base = 3 }
		#}
		buildings = {
			infrastructure = 2
			1 = { naval_base = 2 }
			2 = { bunker = 1 }
		}
		#add_victory_points = {
		#	province = 99
		#}
		add_victory_points = { province = 1 value = 2 }
		#set_province_name = {
		#	id = 99
		#}
		set_province_name = { id = 1 name = PORT_OLD }
		1939.2.7 = {
			#victory_points = {
			#	4242 7
			#}
			victory_points = { 1 10 }
		}
	}
}
`;

// A REAL caption, the thing the guard must not cost us.
const REAL_CAPTION = `state = {
	id = 1
	name = "STATE_1"
	manpower = 1000
	state_category = rural
	provinces = { 1 2 }
	history = {
		owner = AAA
		# the harbour city
		victory_points = { 1 5 }
		# the inland town
		victory_points = { 2 1 }
	}
}
`;

const server = createApp().listen(0, async () => {
  const PORT = server.address().port;
  // public/map.js eraseProvinceLocal -> queueWrite("/api/map/flip-province-sea", { provinceId }); flushMapSaves adds modPath.
  const erase = (MOD, provinceId) => fetch("http://127.0.0.1:" + PORT + "/api/map/flip-province-sea", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provinceId, modPath: MOD }),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));

  try {
    console.log("[control] the fixture is vanilla's shape, and the test's own readers agree about it");
    {
      rec("three commented-out blocks, each with a body and a closing `#}`", commentLines(GREECE_SHAPE).length === 9, commentLines(GREECE_SHAPE));
      rec("…so its comment text is brace-balanced to start with", commentBalance(GREECE_SHAPE) === 0, commentBalance(GREECE_SHAPE));
      rec("…and the file is brace-balanced outside comments", balance(GREECE_SHAPE) === 0, balance(GREECE_SHAPE));
      rec("the last commented `#}` captions the live victory_points block — that is the trap", captionMap(GREECE_SHAPE).slice(-1)[0] === "#}  ->  victory_points = {", captionMap(GREECE_SHAPE).slice(-1));
    }

    console.log("\n1. erase the province of the live block sitting under them  (POST /api/map/flip-province-sea)");
    {
      const MOD = mkMod(DEFS, { "1-A.txt": GREECE_SHAPE });
      const r = await erase(MOD, 1);
      rec("the erase succeeded", r.s === 200 && r.b && r.b.ok === true, r.b);
      const after = stateText(MOD, "1-A.txt");
      rec("it did what it was asked: the state no longer lists province 1", !/provinces\s*=\s*\{[^}]*\b1\b/.test(mask(after)) === false ? !(/(?:^|[^0-9])1(?:[^0-9]|$)/.test((/provinces\s*=\s*\{([^}]*)\}/.exec(mask(after)) || ["", ""])[1])) : true, (/provinces\s*=\s*\{([^}]*)\}/.exec(mask(after)) || ["", ""])[1]);
      rec("…and the live victory point for province 1 is gone", !/victory_points\s*=\s*\{[^}]*\b1\s+20/.test(mask(after)), after);
      rec("⭐⭐⭐ every commented line survives, in order", JSON.stringify(commentLines(after)) === JSON.stringify(commentLines(GREECE_SHAPE)), { was: commentLines(GREECE_SHAPE), now: commentLines(after) });
      rec("⭐⭐⭐ …and each disabled block is still whole: opener, body, `#}` together", JSON.stringify(disabledBlocks(after)) === JSON.stringify(disabledBlocks(GREECE_SHAPE)), { was: disabledBlocks(GREECE_SHAPE), now: disabledBlocks(after) });
      rec("⭐⭐ the comment text is still brace-balanced — no dangling `#victory_points = {`", commentBalance(after) === 0, commentBalance(after));
      rec("⭐ and the file itself is still balanced", balance(after) === 0, balance(after));
    }

    console.log("\n2. the same, for every kind of statement the cut takes (buildings, add_victory_points, a name, a dated block)");
    {
      const MOD = mkMod(DEFS, { "1-A.txt": EVERY_KIND });
      const r = await erase(MOD, 1);
      rec("the erase succeeded", r.s === 200 && r.b && r.b.ok === true, r.b);
      const after = stateText(MOD, "1-A.txt");
      rec("it did the work: nothing live still names province 1", !/(^|[^0-9])1\s*=\s*\{/.test(mask(after)) && !/province\s*=\s*1\b/.test(mask(after)) && !/set_province_name/.test(mask(after)), after);
      rec("⭐⭐⭐ all twelve commented lines survive, in order", JSON.stringify(commentLines(after)) === JSON.stringify(commentLines(EVERY_KIND)), { was: commentLines(EVERY_KIND), now: commentLines(after) });
      rec("⭐⭐⭐ …and all four disabled blocks are still whole", JSON.stringify(disabledBlocks(after)) === JSON.stringify(disabledBlocks(EVERY_KIND)), { was: disabledBlocks(EVERY_KIND), now: disabledBlocks(after) });
      rec("⭐⭐ the disabled blocks are still balanced", commentBalance(after) === 0, commentBalance(after));
      rec("⭐ the file is still balanced", balance(after) === 0, balance(after));
      rec("⚠️ province 2's own building block is untouched", /2\s*=\s*\{\s*bunker\s*=\s*1\s*\}/.test(mask(after)), after);
    }

    console.log("\n3. the cut for the OTHER province — the one whose live block sits ABOVE the disabled ones");
    {
      // Both coastal, so the erase is not refused for making an isolated sea.
      const MOD = mkMod(["1;10;0;0;land;true;plains;1", "2;20;0;0;land;true;plains;1", "3;30;0;0;sea;false;ocean;0"], { "1-A.txt": GREECE_SHAPE });
      const before = stateText(MOD, "1-A.txt");
      const r = await erase(MOD, 2);
      rec("the erase succeeded", r.s === 200 && r.b && r.b.ok === true, r.b);
      const after = stateText(MOD, "1-A.txt");
      rec("it did the work: the live victory point for province 2 is gone", !/victory_points\s*=\s*\{[^}]*\b2\s+3/.test(mask(after)), after);
      rec("⭐⭐ the disabled blocks below it are whole too", JSON.stringify(disabledBlocks(after)) === JSON.stringify(disabledBlocks(before)), { was: disabledBlocks(before), now: disabledBlocks(after) });
      rec("…balanced", commentBalance(after) === 0 && balance(after) === 0, [commentBalance(after), balance(after)]);
    }

    console.log("\n4. ⚠️ the other direction: a REAL caption must still travel with its statement");
    {
      const MOD = mkMod(DEFS, { "1-A.txt": REAL_CAPTION });
      const r = await erase(MOD, 1);
      rec("the erase succeeded", r.s === 200 && r.b && r.b.ok === true, r.b);
      const after = stateText(MOD, "1-A.txt");
      rec("⭐⭐⭐ the erased province's caption went WITH it — it does not caption the survivor", !/# the harbour city/.test(after), after);
      rec("⭐⭐ the survivor keeps its own caption, still on its own statement", captionMap(after).includes("# the inland town  ->  victory_points = { 2 1 }"), captionMap(after));
    }

    console.log("\n5. vanilla's own 47-Greece.txt, if the game is installed here");
    {
      const VAN = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/history/states/47-Greece.txt";
      if (!fs.existsSync(VAN)) skip("Hearts of Iron IV is not installed — section 5 did NOT run");
      else {
        const src = fs.readFileSync(VAN, "utf8");
        rec("it ships commented-out victory_points blocks", commentLines(src).some((l) => /^#[ \t]*victory_points/.test(l)), commentLines(src).length);
        rec("…balanced, which is the only reason the validator ever liked it", commentBalance(src) === 0, commentBalance(src));
        // The provinces the owner's Auto-fix click turned to water, derived from the file itself: every
        // province with a LIVE victory point, which is what the cut runs for.
        const live = [...mask(src).matchAll(/victory_points\s*=\s*\{([^}]*)\}/g)].map((m) => Number((m[1].match(/-?\d+/g) || [])[0])).filter(Number.isFinite);
        rec("…and live victory points for " + live.length + " provinces", live.length >= 2, live);
        const defs = ["0;0;0;0;land;false;unknown;0"];
        const ids = (/provinces\s*=\s*\{([^}]*)\}/.exec(mask(src))[1].match(/\d+/g) || []).map(Number);
        const MOD = mkMod(ids.map((i) => i + ";" + ((i * 7) % 250 + 1) + ";" + ((i * 13) % 250 + 1) + ";" + ((i * 29) % 250 + 1) + ";land;true;plains;1").concat(["99999;9;9;9;sea;false;ocean;0"]), { "47-Greece.txt": src });
        void defs;
        let ok = true, refused = [];
        for (const p of live) {
          const r = await erase(MOD, p);
          if (!(r.s === 200 && r.b && r.b.ok === true)) { ok = false; refused.push([p, (r.b && r.b.error) || r.s]); }
        }
        if (!ok && refused.length === live.length) skip("no erase ran on the vanilla file — section 5's erases did NOT run: " + JSON.stringify(refused).slice(0, 300));
        else {
          const after = stateText(MOD, "47-Greece.txt");
          rec("⭐⭐⭐ erasing every province with a live victory point leaves all " + commentLines(src).length + " comment lines standing", JSON.stringify(commentLines(after)) === JSON.stringify(commentLines(src)), { was: commentLines(src), now: commentLines(after), refused });
          rec("⭐⭐⭐ …so no commented-out block is left dangling", commentBalance(after) === 0, commentBalance(after));
          rec("⭐ …and the file is still balanced", balance(after) === 0, balance(after));
        }
      }
    }

    console.log("\n6. the source says what it does");
    {
      const src = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
      const fn = /function captionStart\(raw, start, floor = 0\)[\s\S]*?\n\}/.exec(src);
      rec("captionStart exists", !!fn, null);
      if (fn) rec("⭐⭐ it counts the braces of each candidate comment line and stops when they do not balance", /if \(d !== 0 \|\| min < 0\) break;/.test(fn[0]), fn[0].slice(-600));
    }
  } catch (e) {
    rec("the test ran to the end", false, String((e && e.stack) || e));
  } finally {
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    console.log("\n=== a caption does not eat a commented-out block: " + checks + " checks, " + fails.length + " failed, " + skips + " skipped ===");
    if (fails.length) { for (const f of fails) console.log("  ✗ " + f); process.exitCode = 1; }
  }
});
