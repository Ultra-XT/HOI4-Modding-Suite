// ⛔ #a-capital-star-is-one-the-mode-can-change (tool campaign B2-24) — 🏛 SET CAPITAL STARS THE CAPITALS IT CAN CHANGE, AND EVERY COUNTRY THAT OWNS LAND.
//
// A click in 🏛 Set capital sets the capital of the clicked state's OWNER. The mode starred every capital line, so on the base game 274 of the
// 363 stars stood on another country's state (landless ABK on a Soviet state, ALG on a French one) — capitals the mode cannot change — and
// PRC, which names its capital only by set_capital, owned land and had no star. capitalStarsOnPage now gives the stars: a capital where its
// country owns the state, and for a land-owning country with no capital line, each state a set_capital of its own names at the start.
//
// RUN, not grepped: the page's own capitalStarsOnPage (lifted from public/map.js) on the map model buildMapModel builds for an empty add-on over
// the INSTALLED base game (read-only; the counts are derived from it, never typed), then on small models for the edges. Binds no port.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const T = require("./testlib-map-page.js");

let checks = 0; const fails = [];
const ok = (c, m, d) => { checks++; if (c) console.log("  ok   " + m); else { fails.push(m); console.log("  FAIL " + m + (d !== undefined ? "   -> " + JSON.stringify(d).slice(0, 600) : "")); } };
const FN = T.lift("function capitalStarsOnPage()");
const starsFor = (model) => {
  const sb = { model, stateById: new Map((model.states || []).map((s) => [Number(s.id), s])), Number, String, Set, Map, parseInt };
  vm.createContext(sb);
  return vm.runInContext(FN + "\ncapitalStarsOnPage();", sb);
};

console.log("\n-- the draw loop stars what capitalStarsOnPage gives --");
{
  const at = T.MASKED.indexOf('if (mode === "capital" && model.capitals)');
  const loop = at < 0 ? "" : T.MASKED.slice(at, T.MASKED.indexOf("ctx.restore();", at));
  ok(/for \(const \{ tag, sid \} of capitalStarsOnPage\(\)\)/.test(loop) && !/for \(const tag in model\.capitals\)/.test(loop), "⭐⭐ the 🏛 mode's star loop iterates capitalStarsOnPage(), not every capital line", loop.slice(0, 300));
}

console.log("\n-- on the installed base game --");
const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nova-capstars-"));
try {
  process.env.NOVA_APP_DATA_DIR = process.env.NOVA_APP_DATA_DIR || path.join(tmp, "appdata");
  const md = require("./map-data.js");
  const mod = path.join(tmp, "mod"); fs.mkdirSync(mod, { recursive: true }); fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Stars"\n');
  const have = fs.existsSync(path.join(GAME, "history", "countries"));
  ok(have, "THE CONTROL: the base game is installed here, so its capitals are read, not typed", GAME);
  if (have) {
    const m = md.buildMapModel({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] });
    const owner = new Map(m.states.map((s) => [Number(s.id), s.owner]));
    const lines = Object.entries(m.capitals || {}), onOwn = lines.filter(([t, sid]) => owner.get(Number(sid)) === t);
    const land = [...new Set(m.states.map((s) => s.owner).filter(Boolean))];
    const stars = starsFor(m);
    ok(lines.length > onOwn.length && onOwn.length > 0, "THE CONTROL: the base game has capital lines on another country's state (the old stars)", { lines: lines.length, onOwn: onOwn.length });
    ok(stars.every((s) => owner.get(s.sid) === s.tag), "⭐⭐⭐ every star stands on a state its country owns", stars.filter((s) => owner.get(s.sid) !== s.tag).slice(0, 5));
    ok(stars.filter((s) => !s.set).length === onOwn.length, "⭐⭐ …one for each capital line on its own country's state", { stars: stars.filter((s) => !s.set).length, onOwn: onOwn.length });
    const unstarred = land.filter((t) => !stars.some((s) => s.tag === t));
    ok(unstarred.length === 0, "⭐⭐⭐ every country that owns land has a star", unstarred);
    const noLine = land.filter((t) => !(t in (m.capitals || {})));
    ok(noLine.length > 0 && noLine.every((t) => stars.some((s) => s.tag === t && s.set)), "⭐⭐ …a country with no capital line is starred where its own set_capital puts it", { noLine, set: stars.filter((s) => s.set) });
  }
} finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} }

console.log("\n-- the edges, on small models --");
{
  const base = { startDate: "1936.1.1.12", states: [{ id: 1, owner: "AAA" }, { id: 2, owner: "AAA" }, { id: 3, owner: "BBB" }, { id: 4, owner: "CCC" }],
    capitals: { AAA: 1, ZZZ: 3 },
    capitalSets: { CCC: { sets: [{ id: 4, date: "", when: [] }, { id: 3, date: "", when: [] }, { id: 4, date: "1939.1.1", when: [] }] }, BBB: { sets: [{ id: 3, date: "1940.1.1", when: [] }] } } };
  const s = starsFor(base), keys = s.map((x) => `${x.tag}@${x.sid}${x.set ? "(set)" : ""}`).sort();
  ok(keys.includes("AAA@1") && !keys.some((k) => /^ZZZ/.test(k)), "THE CONTROL: AAA's capital on its own state is starred; ZZZ's, on BBB's state, is not", keys);
  ok(keys.includes("CCC@4(set)") && !keys.includes("CCC@3(set)"), "⭐ CCC (no capital line) is starred at its own set_capital state, not at one it does not own", keys);
  ok(!keys.some((k) => /^BBB/.test(k)), "⭐ a set_capital dated after the start does not count (BBB has no capital at the start to star)", keys);
  ok(keys.filter((k) => /^CCC/.test(k)).length === 1, "…and a state named twice is starred once", keys);
}

console.log(`\n${checks - fails.length}/${checks} checks passed`);
if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exit(1); }
