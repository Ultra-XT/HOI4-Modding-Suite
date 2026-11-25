// Generate land says what rivers it drew, or why it drew none — and says nothing the game does not do.
// #a-generated-world-has-rivers (batch B, B3; critic R10)
//
// generatedRiversNote (public/map.js, pure) words `res.rivers`, which generateLand returns from generateRivers. Two things it must
// never say, both measured wrong in the design: a COLOUR (the game tints a river from colormap_water at its place, river.shader; the
// light-to-dark blues are Nova's overlay), and "no river errors" (graphics.log's "Too small river found" was never checked in game).
// Lifted out of the page and run on every shape the result takes; the report line must carry it.
"use strict";

const vm = require("vm");
const lib = require("./testlib-map-page.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)));
  if (!ok) fails.push(label);
};

let note = null;
try { note = vm.runInNewContext(lib.lift("function generatedRiversNote(") + "\ngeneratedRiversNote", {}); }
catch (e) { rec("public/map.js has generatedRiversNote", false, e.message); }

if (note) {
  const drew = { changed: true, systems: 244, tributaries: 392, borderShare: 0.2151, target: 0.2157, saturated: false, learntFrom: "the map underneath", stranded: { rivers: 0, pixels: 0 } };
  const ok = note({ rivers: drew });
  rec("⭐ success: how many rivers and tributaries, and the share against the map they were learnt from", /244 rivers/.test(ok) && /392 tributaries/.test(ok) && /21\.5%/.test(ok) && /21\.6%/.test(ok), ok);
  const sat = note({ rivers: { ...drew, borderShare: 0.1892, saturated: true } });
  rec("⭐ saturated: says the lanes ran out, short of the target", /18\.9%/.test(sat) && /short of/.test(sat) && /21\.6%/.test(sat), sat);
  const own = note({ rivers: { ...drew, learntFrom: "the mod's own map" } });
  rec("…learnt from the mod's own map: says so", /this map/.test(own), own);
  const err = note({ rivers: { changed: false, error: "EBUSY: rivers.bmp is open in another program" } });
  rec("⭐ error: ⚠ and the reason", /⚠/.test(err) && /EBUSY/.test(err), err);
  // writeRiversPaint's own messages end in a full stop ("No rivers.bmp found in mod, dependencies, or vanilla.")
  const stop = note({ rivers: { changed: false, error: "No rivers.bmp found in mod, dependencies, or vanilla." } });
  rec("…a message with its own full stop is not given a second one", /vanilla\.$/.test(stop) && !/\.\./.test(stop), stop);
  const why = note({ rivers: { changed: false, reason: "no map underneath this mod has a rivers.bmp to learn its rivers from" } });
  rec("⭐ refused: ⚠ and the reason", /⚠/.test(why) && /no map underneath/.test(why), why);
  const off = note({ rivers: { changed: false, skipped: "turned off (drawRivers: false)" } });
  rec("skipped by the caller: ⚠ and why", /⚠/.test(off) && /turned off/.test(off), off);
  rec("nothing raised, or no rivers key: nothing said", note({ rivers: { changed: false, skipped: "no land was raised" } }) === "" && note({}) === "" && note(null) === "");
  const str = note({ rivers: { ...drew, stranded: { rivers: 3, pixels: 41 } } });
  rec("⭐ stranded: the rivers of the map below that now end inland are counted", /3 rivers of the map underneath now end inland/.test(str), str);
  const strNone = note({ rivers: { changed: false, reason: "no border of the new land drains far enough to start a river", stranded: { rivers: 2, pixels: 9 } } });
  rec("…and when no river was drawn too", /⚠/.test(strNone) && /2 rivers of the map underneath now end inland/.test(strNone), strNone);
  const one = note({ rivers: { ...drew, systems: 1, tributaries: 1, stranded: { rivers: 1, pixels: 4 } } });
  rec("…singular when there is one", /1 river \(1 tributary\)/.test(one) && /1 river of the map underneath now ends inland/.test(one), one);
  // review R2-2: a second Generate land strands Nova's own first rivers (10 on a 5% raise over the owner's world), and they are not
  // the map underneath's. `byNova` says how many are Nova's; null says the record could not be read.
  const novas = note({ rivers: { ...drew, stranded: { rivers: 10, pixels: 390, byNova: 10 } } });
  rec("⭐ stranded rivers Nova drew on an earlier Generate land are called Nova's, not the map underneath's", /10 rivers Nova drew on an earlier Generate land now end inland/.test(novas) && !/rivers? of the map underneath/.test(novas), novas);
  const both = note({ rivers: { changed: false, reason: "no border of the new land drains far enough to start a river", stranded: { rivers: 3, pixels: 60, byNova: 1 } } });
  rec("⭐ …each counted by whose it is when both strand", /2 rivers of the map underneath and 1 river Nova drew on an earlier Generate land now end inland/.test(both), both);
  const oneNova = note({ rivers: { ...drew, stranded: { rivers: 1, pixels: 30, byNova: 1 } } });
  rec("…singular", /1 river Nova drew on an earlier Generate land now ends inland: the sea it ran into/.test(oneNova), oneNova);
  const unknown = note({ rivers: { ...drew, stranded: { rivers: 2, pixels: 50, byNova: null } } });
  rec("⭐ whose they are not known (the record could not be read): said without a guess", /2 rivers already on this map now end inland/.test(unknown) && !/rivers? of the map underneath|Nova drew/.test(unknown), unknown);
  const made = note({ rivers: { ...drew, created: true } });
  rec("a mod that just took its own rivers.bmp is told", /own map\/rivers\.bmp/.test(made), made);
  // review R-4: a success the step could not finish says so — it printed the plain success line over both
  rec("THE CONTROL: a plain success carries no ⚠", !/⚠/.test(ok), ok);
  const unrec = note({ rivers: { ...drew, recordError: "EPERM: operation not permitted, open 'generated_rivers.json'" } });
  rec("⭐ the record of the land the rivers were drawn on was not written: ⚠, why, and what the next Generate land will do", /⚠/.test(unrec) && /EPERM/.test(unrec) && /next Generate land/.test(unrec) && unrec.startsWith(ok), unrec);
  const seas = note({ rivers: { ...drew, seasError: "the map model could not be built" } });
  rec("⭐ which seas Auto-fix will fill was not known: ⚠, why, and that a river may end in one", /⚠/.test(seas) && /map model could not be built/.test(seas) && /Auto-fix/.test(seas) && seas.startsWith(ok), seas);
  const all = [ok, sat, own, err, stop, why, off, str, strNone, one, novas, both, oneNova, unknown, made, unrec, seas].join(" ");
  rec("⭐ no colour is described (the game tints rivers from colormap_water)", !/\b(blue|cyan|navy|turquoise|green|red|yellow|light-blue|dark-blue)\b/i.test(all), all.match(/\b(blue|cyan|navy|turquoise|green|red|yellow)\b/i));
  rec("⭐ no promise of a river-free error log", !/no (river )?errors?|without (any )?errors?|error[- ]free/i.test(all));
}

{
  // the report line the page prints after Generate land carries the note (comments masked: a mention in prose is not a use)
  // ⚠️ MOVED WITH 🌍 Generate a world: the handler hands generatedLandResultNote(res) to the reload, and the notes are built in that
  // function (the world shows the same words for its own Generate land step) — so the report is read through it (testlib-map-page.js)
  const m = lib.generateLandReportLine(lib.MASKED), at = m.indexOf("reloadAfterImmediateWrite(`🌍 Generated");
  const line = at >= 0 ? m.slice(at, m.indexOf("\n", at)) : "";
  rec("THE CONTROL: the Generate land report line is found", at >= 0);
  rec("⭐ it carries ${riversNote}, and riversNote is generatedRiversNote(res)", /\$\{riversNote\}/.test(line) && /const riversNote = generatedRiversNote\(res\)/.test(m), line.slice(0, 200));
}

console.log(`\n${checks - fails.length}/${checks} checks passed`);
if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exit(1); }
