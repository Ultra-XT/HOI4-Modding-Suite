// A definition.csv whose coastal column disagrees with its bitmap, made out of a real one for a test that must not
// depend on a third-party mod still shipping such rows. #auto-fix-leaves-a-coastal-flag-the-mod-inherited
// #a-province-says-coastal-with-no-sea
//
// WHY THIS EXISTS. Two tests took their full-size case from Novum Vexillum, which shipped three land rows whose
// coastal column its bitmap contradicted (7972 and 15485 said coastal with no sea beside them, 14650 touched sea and
// said it did not). NV's 2026-10-02 update corrected exactly those three, and both tests' controls went red while
// Nova was right. Measured 2026-10-08 over every installed map (vanilla 0 of 10,154 land rows; MD, MDC, OWB, NV, RoN,
// R56, Hearts of Minecraft, TEST 31, TEST 32 all 0): not one ships a disagreement of its own. So the case is BUILT:
// the base game's own definition.csv, with rows flipped both ways, picked from the file itself, never typed.
//
// flipCoastalColumn(text, { lost, gained, skip }) -> { text, lost: [ids], gained: [ids] }
//   lost:   how many land rows that say `false` to turn to `true`  (says coastal, touches no sea)
//   gained: how many land rows that say `true` to turn to `false`  (touches sea, says not coastal)
//   skip:   ids not to pick (a second flip on top of a first)
// It trusts the file's own column to say which rows are coastal; the test's control then asks fixCoastalFlags to
// name exactly the rows flipped here, so a pick the bitmap disagreed with already would show up there, not pass.
// Each line keeps its own ending.
"use strict";

function flipCoastalColumn(text, { lost = 0, gained = 0, skip = null } = {}) {
  const lines = String(text).split("\n");
  const picked = { lost: [], gained: [] };
  for (let i = 0; i < lines.length && (picked.lost.length < lost || picked.gained.length < gained); i++) {
    const eol = lines[i].endsWith("\r") ? "\r" : "";
    const c = (eol ? lines[i].slice(0, -1) : lines[i]).split(";");
    if (c.length < 8 || !/^[1-9]\d*$/.test(c[0])) continue;
    const id = parseInt(c[0], 10);
    if ((c[4] || "").trim().toLowerCase() !== "land" || (skip && skip.has(id))) continue;
    const says = (c[5] || "").trim().toLowerCase();
    if (says === "false" && picked.lost.length < lost) { c[5] = "true"; picked.lost.push(id); }
    else if (says === "true" && picked.gained.length < gained) { c[5] = "false"; picked.gained.push(id); }
    else continue;
    lines[i] = c.join(";") + eol;
  }
  if (picked.lost.length < lost || picked.gained.length < gained) {
    throw new Error(`flipCoastalColumn: wanted ${lost} lost + ${gained} gained, the file offered ${picked.lost.length} + ${picked.gained.length}`);
  }
  return { text: lines.join("\n"), lost: picked.lost, gained: picked.gained };
}

module.exports = { flipCoastalColumn };
