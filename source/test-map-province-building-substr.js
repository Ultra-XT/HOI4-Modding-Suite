// REGRESSION: province-id substring false-match in the state-history building helpers.
// A state that owns BOTH province 121 and province 1121 (1121 carries a building) used to corrupt 1121
// when you edited/moved 121 — the bare `${pid}` regexes in setProvinceBuildingInHistory /
// removeProvinceBuildingBlock matched "121" *inside* "1121". The getter was already guarded with
// (?<![0-9]); the writers now are too. This proves a move of 121 leaves 1121 byte-intact.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { moveProvince, setStateFieldsInBlock } = require("./map-data.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };
const balanced = (s) => { let d = 0; for (const c of s) { if (c === "{") d++; else if (c === "}") { d--; if (d < 0) return false; } } return d === 0; };
// Pull a province's building level out of a state-history buildings block, boundary-correct.
const provLvl = (txt, pid, key) => {
  const m = new RegExp(`(?:^|[^0-9])${pid}\\s*=\\s*\\{([^{}]*)\\}`).exec(txt);
  if (!m) return null;
  const k = new RegExp(`${key}\\s*=\\s*(\\d+)`).exec(m[1]);
  return k ? parseInt(k[1], 10) : null;
};

// ── Part A: the pure setter (setProvinceBuildingInHistory via setStateFieldsInBlock) ───────────────
const block = `state = {
\tid = 999
\tprovinces = { 121 1121 }
\thistory = {
\t\towner = TST
\t\tbuildings = {
\t\t\t1121 = { naval_base = 3 }
\t\t\t121 = { naval_base = 1 }
\t\t}
\t}
}`;
const setOut = setStateFieldsInBlock(block, { provinceBuildings: [{ province: 121, building: "naval_base", level: 5 }] });
check("setter: province 121 updated to 5", provLvl(setOut, 121, "naval_base") === 5, setOut);
check("setter: province 1121 left at 3 (not false-matched)", provLvl(setOut, 1121, "naval_base") === 3, setOut);
check("setter: block still brace-balanced", balanced(setOut), setOut);

// ── Part B: the remover, end-to-end through moveProvince (source removal must not touch 1121) ───────
const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-provsubstr-"));
fs.mkdirSync(path.join(mod, "history", "states"), { recursive: true });
const s1 = path.join(mod, "history", "states", "1-Src.txt");
const s2 = path.join(mod, "history", "states", "2-Dst.txt");
fs.writeFileSync(s1, `state = {
\tid = 1
\tname = "SRC"
\tprovinces = { 121 1121 }
\thistory = {
\t\towner = TST
\t\tvictory_points = { 121 7 }
\t\tbuildings = {
\t\t\t1121 = { naval_base = 3 }
\t\t\t121 = { naval_base = 1 }
\t\t}
\t}
}
`, "utf8");
fs.writeFileSync(s2, `state = {
\tid = 2
\tname = "DST"
\tprovinces = { 200 }
\thistory = {
\t\towner = TST
\t}
}
`, "utf8");

try {
  const r = moveProvince({ modRoot: mod, dependencyRoots: [], provinceId: 121, fromStateId: 1, toStateId: 2 });
  check("moveProvince reported a change", r && r.changed, JSON.stringify(r));

  const t1 = fs.readFileSync(s1, "utf8");
  const t2 = fs.readFileSync(s2, "utf8");

  // Source: 121 gone from the provinces list, 1121 stays.
  const srcProvs = (/(provinces\s*=\s*\{)([^{}]*)\}/.exec(t1) || [])[2] || "";
  const srcIds = (srcProvs.match(/\d+/g) || []).map(Number);
  check("source provinces no longer list 121", !srcIds.includes(121), srcIds);
  check("source provinces still list 1121", srcIds.includes(1121), srcIds);

  // The whole point: 1121's building block is byte-intact, 121's is gone.
  check("source 1121 building INTACT (naval_base = 3)", provLvl(t1, 1121, "naval_base") === 3, t1);
  check("source 121 building removed", provLvl(t1, 121, "naval_base") === null, t1);
  check("source no longer has a VP for 121", !/victory_points\s*=\s*\{\s*121\b/.test(t1), t1);
  check("source brace-balanced", balanced(t1), t1);

  // Destination: 121 arrives with its carried building + VP.
  const dstIds = (((/(provinces\s*=\s*\{)([^{}]*)\}/.exec(t2) || [])[2] || "").match(/\d+/g) || []).map(Number);
  check("dest provinces now list 121", dstIds.includes(121), dstIds);
  check("dest carried 121's building (naval_base = 1)", provLvl(t2, 121, "naval_base") === 1, t2);
  check("dest carried 121's victory point (7)", /victory_points\s*=\s*\{\s*121\s+7\s*\}/.test(t2), t2);
  check("dest brace-balanced", balanced(t2), t2);
} catch (e) {
  fail++; console.log("  FAIL harness threw →", e && e.stack || e);
} finally {
  try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  console.log(`\nMAP-PROVINCE-BUILDING-SUBSTR TEST: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
