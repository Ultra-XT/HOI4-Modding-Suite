// THE MAP PAGE'S WORDS SAY WHAT ITS TOOLS DO — five low word findings of the tool campaign, each read off the page or run as the page runs it.
//
//   B2-6  ⛔ #a-staged-colour-says-it-waits-for-save — the 🎨 Colour label's title said "it saves immediately"; the change is staged (an Undo step,
//         written to colors.txt by 💾 Save), as the status line already said.
//   B2-9  ⛔ #a-moved-capital-is-named — 🔧 Auto-fix's capital repair said only "moved 1 country's capital onto land it owns"; the answer names the
//         country and the two states (capitals.details), so the line does too.
//   B2-33 ⛔ #a-copied-order-of-battle-names-its-layer — on an add-on the order-of-battle files a repair copied in were called "base-game … frozen at
//         this build of the game" when they were the dependency's (Millennium Dawn's ENG_2000_bba.txt). "base-game" now only when the mod depends
//         on nothing.
//   B4-16 ⛔ #the-rail-and-hub-words-say-what-the-tools-do — the 🛤 button promised "every supply hub and railway in your mod" and to "change their
//         level" (the list is the effective set, the first RAIL_LIST_CAP of each, and a hub has SUPPLY_LVL_MAX = 1 level); the 🏭 mode line said
//         "Manage levels in the 🛤 panel"; supply_nodes_empty quoted "Millennium Dawn 914", a map that ships 915.
//   B4-17 ⛔ #the-harbour-words-say-what-auto-fix-did — "naval base(s) whose province lost its sea" was said of a base typed on vanilla's inland
//         13069, which never had one; the orphan-block clause gave a count where the answer names the state and the province.
//
// Each check is derived from the source (comments masked) or RUN: capitalRepairNote and the Auto-fix summary are the page's own code, lifted;
// the shipping figures are re-counted from the installed base game and the installed Workshop copies (read-only). Binds no port.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const T = require("./testlib-map-page.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 700) : "")); }
};
const HTML = T.readSource("public", "map.html");
const titleOf = (id) => { const m = new RegExp(`id="${id}"[^>]*title="([^"]*)"`).exec(HTML) || new RegExp(`title="([^"]*)"[^>]*id="${id}"`).exec(HTML); return m ? m[1] : null; };
const CODE = T.MASKED;
/** The Auto-fix summary, as testlib's autoFixSummary builds it, with `model` in the sandbox as the page holds it (the B2-33 words ask it). */
function summary(fr, model) {
  const at = CODE.indexOf("const ro = (fr.fixes");
  const endAt = at < 0 ? -1 : CODE.indexOf("const summaryLine = (parts.length", at);
  const end = endAt < 0 ? -1 : CODE.indexOf(";", endAt);
  if (at < 0 || end < 0) throw new Error("public/map.js: the Auto-fix summary was not found");
  const sb = { console, JSON, Set, Map, Math, Array, Number, String, Object, fr };
  if (model !== undefined) sb.model = model;
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(T.withNoteHelpers(`var statusEl = null;\n${T.MAP.slice(at, end + 1)}`) + "\nglobalThis.__line = summaryLine;", sb);
  return String(sb.__line);
}

console.log("\n-- B2-6: the 🎨 Colour label says the colour waits for 💾 Save, as the change does --");
{
  const t = titleOf("mapCountryColorLabel") || "";
  const handler = T.liftFrom(T.MAP, CODE, '$("mapCountryColor").addEventListener("change"', "\n    });");
  ok(/queueWrite\("\/api\/map\/set-country-color"/.test(maskJsComments(handler)) && !/fetch\(/.test(maskJsComments(handler)), "THE CONTROL: the change handler stages the write (queueWrite), it posts nothing", handler.slice(0, 200));
  ok(t && !/saves immediately/.test(t), "⭐⭐ the label's title no longer says it saves immediately", t);
  ok(/💾 Save writes it to colors\.txt/.test(t), "⭐ …and says 💾 Save writes it", t);
}

console.log("\n-- B2-9: the capital repair names the country and the two states --");
{
  const note = vm.runInNewContext(T.lift("function capitalRepairNote(") + "\ncapitalRepairNote;", {});
  const p = note({ fixed: 1, details: [{ tag: "FRA", from: 16, to: 14 }] }).parts;
  ok(p[0] && p[0].startsWith("moved 1 country's capital onto land it owns"), "THE CONTROL: the count is still said first", p);
  ok(p[0] && p[0].includes("FRA: state 16 → 14"), "⭐⭐ …and the country, from where, to where", p);
  const many = note({ fixed: 9, details: Array.from({ length: 9 }, (_, i) => ({ tag: `T${i}`, from: i, to: 100 + i })) }).parts[0] || "";
  ok(/T0: state 0 → 100/.test(many) && /T7: state 7 → 107; …\)$/.test(many) && !/T8/.test(many), "⭐ …eight named, the rest left as …", many);
}

console.log("\n-- B2-33: the order-of-battle files a repair copied in are 'base-game' only on a mod that depends on nothing --");
{
  const fr = { ok: true, fixes: { airWingsAbroad: { moved: 1, materialised: ["ENG_2000_bba.txt"] }, drownedDivisions: { moved: 2, materialised: ["ENG_2000.txt"] }, fleetBerths: { moved: 1, materialised: ["ENG_2000_naval.txt"] } } };
  const onDep = summary(fr, { dependencyRoots: ["C:/mods/md"] });
  ok(/ENG_2000_bba\.txt/.test(onDep) && /ENG_2000\.txt/.test(onDep) && /ENG_2000_naval\.txt/.test(onDep), "THE CONTROL: the line names the three files the repairs copied in", onDep.slice(0, 600));
  ok(!/base-game order-of-battle file/.test(onDep), "⭐⭐⭐ on an add-on over another mod, none is called a base-game file", onDep.slice(0, 900));
  ok((onDep.match(/order-of-battle file\(s\) your mod inherited \(from the base game, or from a mod it is built on\)/g) || []).length === 3, "⭐⭐ …each of the three says the layers it can come from", onDep.slice(0, 900));
  ok(!/frozen at this build of the game/.test(onDep) && /a later update of the game or of that mod no longer reaches them/.test(onDep), "⭐ …and what stops reaching it is that layer's update", onDep.slice(0, 900));
  const onGame = summary(fr, { dependencyRoots: [] });
  ok((onGame.match(/base-game order-of-battle file\(s\) are now YOUR mod's, frozen at this build of the game/g) || []).length === 3, "⭐ a mod that depends on nothing keeps the base-game words, at all three", onGame.slice(0, 900));
  const lifted = summary(fr);
  ok(!/base-game order-of-battle file/.test(lifted), "…and with no model to ask, it claims no layer", lifted.slice(0, 300));
}

console.log("\n-- B4-16: the 🛤 and 🏭 words say what the tools do, and the shipping figures are what the maps ship --");
{
  const cap = Number((/const RAIL_LIST_CAP = (\d+);/.exec(CODE) || [])[1]), lvl = Number((/const SUPPLY_LVL_MAX = (\d+);/.exec(CODE) || [])[1]);
  ok(cap > 0 && lvl === 1, "THE CONTROL: the page caps the list at RAIL_LIST_CAP and gives a hub SUPPLY_LVL_MAX = 1 level", { cap, lvl });
  const t = titleOf("mapRailPanelBtn") || "";
  ok(t && !/List every supply hub and railway in your mod/.test(t) && !/change their level/.test(t), "⭐⭐ the 🛤 button's title no longer promises every hub and railway, nor a level for both", t);
  ok(t.includes(`the first ${cap} of each`) && /a supply hub has only one/.test(t), "⭐ …it says the list stops at the cap, and that a hub has one level", t);
  const line = (/if \(m === "supplyhub"\) setStatus\("([^"]*)"\)/.exec(T.MAP) || [])[1] || "";
  ok(line && !/Manage levels in the 🛤 panel/.test(line) && /A hub has one level/.test(line), "⭐⭐ the 🏭 mode line no longer sends the modder to the panel for a hub's levels", line);
  // (c) the figures supply_nodes_empty and railways_empty quote, against the maps installed here, counted as the game reads the files.
  //     The base game's figure is not typed: shippingRows counts it off the install (#the-base-games-rows-are-read-not-typed, final-v120,
  //     also held by test-a-comment-is-no-row.js), so the typed lists hold the five Workshop maps and the base game's is checked through
  //     the reader the two messages call.
  const DATA = maskJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
  const figures = (name) => { const m = new RegExp(`const ${name} = "([^"]*)"`).exec(DATA); return m ? m[1].split(", ").map((x) => { const r = /^(.*) ([\d,]+)$/.exec(x); return r ? [r[1], Number(r[2].replace(/,/g, ""))] : [x, NaN]; }) : []; };
  const hubs = figures("SHIPPING_SUPPLY_ROWS"), rails = figures("SHIPPING_RAILWAY_ROWS");
  ok(hubs.length === 5 && rails.length === 5 && !hubs.concat(rails).some((x) => /vanilla/i.test(x[0])), "THE CONTROL: the five Workshop maps' figures are read from map-data.js, and no base-game figure is typed among them", { hubs, rails });
  ok(/shippingRows\("supply_nodes\.txt", SHIPPING_SUPPLY_ROWS\)/.test(DATA) && /shippingRows\("railways\.txt", SHIPPING_RAILWAY_ROWS\)/.test(DATA), "THE CONTROL: …and both messages put the base game's count, read by shippingRows, in front of them");
  const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV", WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
  const live = (f) => { try { return fs.readFileSync(f, "utf8").split(/\r?\n/).filter((l) => l.replace(/#.*/, "").trim()).length; } catch (_) { return null; } };
  const items = (() => { try { return fs.readdirSync(WS).map((d) => path.join(WS, d)); } catch (_) { return []; } })();
  const nameOf = (d) => { try { return (/^\s*name\s*=\s*"([^"]*)"/m.exec(fs.readFileSync(path.join(d, "descriptor.mod"), "utf8")) || [])[1] || ""; } catch (_) { return ""; } };
  const rootFor = (label) => {
    if (label === "vanilla") return fs.existsSync(path.join(GAME, "map", "supply_nodes.txt")) ? GAME : null;
    const hits = items.filter((d) => nameOf(d).includes(label) && fs.existsSync(path.join(d, "map", "supply_nodes.txt")));
    return hits.length === 1 ? hits[0] : null;
  };
  let checked = 0;
  for (const [label, n] of hubs) {
    const root = rootFor(label);
    if (!root) { console.log(`       (${label} is not installed here: its figure is not checked)`); continue; }
    checked++;
    const r = rails.find((x) => x[0] === label);
    const got = { hubs: live(path.join(root, "map", "supply_nodes.txt")), rails: live(path.join(root, "map", "railways.txt")) };
    ok(got.hubs === n && r && got.rails === r[1], `⭐⭐ ${label}: the message's ${n} hubs and ${r && r[1]} railways are what the installed copy ships`, { quoted: { hubs: n, rails: r && r[1] }, ships: got, root });
  }
  // the base game's: shippingRows' own row counter (the rowsOf just above it, lifted; map-data.js has other rowsOf), against the installed
  // copy counted by this test's reader
  const rowsAt = [...DATA.matchAll(/const rowsOf = (\(file\) => .*);[ \t]*\r?\n[ \t]*const thousands = .*\r?\n[ \t]*const shippingRows = /g)];
  const rowsSrc = rowsAt.length === 1 ? rowsAt[0][1] : null;
  const rowsOf = rowsSrc ? vm.runInNewContext("(" + rowsSrc + ")", { fs }) : null;
  const vroot = rootFor("vanilla");
  if (vroot && rowsOf) {
    checked++;
    const said = { hubs: rowsOf(path.join(vroot, "map", "supply_nodes.txt")), rails: rowsOf(path.join(vroot, "map", "railways.txt")) };
    const got = { hubs: live(path.join(vroot, "map", "supply_nodes.txt")), rails: live(path.join(vroot, "map", "railways.txt")) };
    ok(said.hubs === got.hubs && said.rails === got.rails && got.hubs > 0 && got.rails > 0, `⭐⭐ vanilla: the message's ${said.hubs} hubs and ${said.rails} railways are what the installed base game ships`, { said, ships: got, root: vroot });
  }
  ok(checked >= 1 && !!vroot && !!rowsOf, "THE CONTROL: at least the base game's figures were checked", { checked, rowsOf: !!rowsOf });
}

console.log("\n-- B4-17: the harbour clauses of the 🔧 summary --");
{
  const lN = summary({ ok: true, fixes: { navalNoCoast: { moved: [{ stateId: 463, from: 13069, to: 1219, key: "naval_base", level: 3 }] } } });
  ok(/13069 → 1219 in state 463/.test(lN), "THE CONTROL: the moved base is said", lN.slice(0, 400));
  ok(!/whose province lost its sea/.test(lN) && /naval base\(s\) on a province with no sea beside it/.test(lN), "⭐⭐ …without claiming its province lost a sea it may never have had", lN.slice(0, 400));
  const lO = summary({ ok: true, fixes: { orphanBuildings: { removed: 2, details: [{ state: 463, file: "463-Alaska.txt", province: 13069, reason: "not owned by state" }, { state: 7, file: "7-S.txt", province: 12, reason: "province is water" }] } } });
  ok(/took 2 province building block\(s\) out of state history/.test(lO), "THE CONTROL: the count is still said", lO.slice(0, 500));
  ok(/province 13069 in state 463/.test(lO) && /province 12 in state 7, now sea/.test(lO), "⭐⭐ …and each block's province and state, from the answer's details", lO.slice(0, 500));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
