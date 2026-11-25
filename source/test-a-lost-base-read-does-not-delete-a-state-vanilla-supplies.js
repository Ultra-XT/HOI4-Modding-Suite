// ⛔ #a-momentary-read-failure-emptied-a-map-folder, THE SIDE THAT DELETES — A BASE FILE THAT IS BUSY FOR A
// MOMENT IS NOT A STATE THE BASE GAME DOES NOT HAVE.
//
// fixProvinceInTwoStates resolves a province claimed by two states by taking it out of the loser, and when that
// empties the loser it deletes the stub state. It must NOT do that when a layer beneath the mod supplies the same
// state: deleting the mod's copy only un-shadows vanilla's, which still claims the province, so the conflict
// survives and the modder's own state is gone (#deleting-the-mods-copy-un-shadows-vanilla — measured on the
// owner's kurdistan, where it deleted 554-Syria.txt and 1079-Auckland.txt and reported both as resolved).
//
// That guard is one Set, built by baseStateIdsByFile, built by READING the layers below. Its read was the last
// raw one in an otherwise patient chain, so a lock that outlasted the reader beside it defeated the guard.
//
// MEASURED on 3ad238d (scratchpad probe-c.js), a mod shadowing vanilla's 554-Syria.txt and a second, bigger state
// claiming the same province 77, in a child process wrapping fs.readFileSync before map-data.js is required:
//
//   the guard's own read lost : deletedStates [554], resolved 1, the mod's 554-Syria.txt block GONE — and
//                               vanilla's 554-Syria.txt loads again, still claiming province 77
//   clean                     : deletedStates [], unresolved ["state 554 also comes from the base game …"]
//
// Since #a-conflict-whose-loser-cannot-be-deleted-keeps-the-province the clean answer is better than that refusal — the
// guard's Set now makes 554 the KEEPER, so province 77 comes out of 900 instead and the conflict is resolved — but the
// danger the injection creates is unchanged: with that read lost, 554 is not known to be the base game's, 900 wins on
// province count, and 554 is deleted. The checks below measure "the mod's 554 comes through untouched", which is what
// this file has always been about, rather than the shape of the answer that used to deliver it.
//
// With a blunt "the first N reads of that file fail" injection it took N = 6 rather than 1, because
// buildMapModel reads the same file first THROUGH readTextWithRetry and absorbs a whole ladder. That is why
// section 4 pins the chain: a single lost call on that path must stay harmless.
//
// Run: node test-a-lost-base-read-does-not-delete-a-state-vanilla-supplies.js
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)));
  if (!ok) fails.push(label);
};

const tmps = [];
const mk = (tag) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-baseblip-" + tag + "-")); tmps.push(d); return d; };
const w = (root, rel, body) => {
  const p = path.join(root, ...rel.split("/"));
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
  return p;
};
const norm = (p) => String(p).replace(/\\/g, "/").toLowerCase();
const state = (id, name, provs) =>
  `state = {\r\n\tid = ${id}\r\n\tname = "${name}"\r\n\tprovinces = { ${provs.join(" ")} }\r\n\thistory = {}\r\n}\r\n`;

// ── What safe-write.js calls transient, and how long its ladder is — DERIVED, never typed here ──────────────
const SW = require("./safe-write.js");
const SW_SRC = fs.readFileSync(path.join(__dirname, "safe-write.js"), "utf8");
const LADDER = (() => {
  const m = SW_SRC.match(/RENAME_RETRY_MS\s*=\s*\[([^\]]*)\]/);
  return m ? m[1].split(",").map((x) => parseInt(x, 10)).filter(Number.isFinite) : [];
})();
const TRANSIENT = Array.isArray(SW.TRANSIENT_READ_CODES) ? SW.TRANSIENT_READ_CODES.slice() : [];
// The guard's own reader, named out of map-data.js rather than typed: the injection below fails a read only when
// it is THAT function asking, which is what "the file was locked exactly then" means.
const GUARD_READER = (() => {
  const m = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8").match(/function\s+(baseStateIdsByFile)\s*\(/);
  return m ? m[1] : "";
})();

// ── the driver: a child process that wraps fs.readFileSync BEFORE map-data.js is required ───────────────────
const RIG = mk("rig");
const DRIVER = path.join(RIG, "driver.js");
fs.writeFileSync(DRIVER, `"use strict";
Error.stackTraceLimit = 60;
const fs = require("fs"), path = require("path");
const plan = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const norm = (p) => String(p).replace(/\\\\/g, "/").toLowerCase();
const seen = { attempts: 0, thrown: 0 };
const real = fs.readFileSync;
fs.readFileSync = function (p, o) {
  if (typeof p === "string" && plan.pathContains && norm(p).indexOf(plan.pathContains) !== -1) {
    // callSite: fail the read only when THAT function is the one asking — a lock present exactly then.
    const mine = !plan.callSite || String(new Error().stack || "").indexOf(plan.callSite) !== -1;
    if (mine) {
      seen.attempts++;
      if (seen.thrown < plan.failures) {
        seen.thrown++;
        const e = new Error(plan.code + ": injected by the test, read '" + p + "'");
        e.code = plan.code;
        throw e;
      }
    }
  }
  return real.call(fs, p, o);
};
const M = require(plan.mapData);
const out = {};
const t0 = Date.now();
try {
  out.result = M.fixProvinceInTwoStates({ modRoot: plan.mod, gameRoot: plan.game, dependencyRoots: [] });
} catch (e) { out.err = String((e && e.message) || e); }
out.ms = Date.now() - t0;
out.attempts = seen.attempts;
out.thrown = seen.thrown;
// what the mod still holds afterwards — a state block that is gone is gone
const sd = path.join(plan.mod, "history", "states");
out.modFiles = {};
for (const f of (function () { try { return fs.readdirSync(sd); } catch (_) { return []; } })()) {
  const t = real.call(fs, path.join(sd, f), "utf8");
  out.modFiles[f] = (t.match(/\\bid\\s*=\\s*(\\d+)/g) || []).join(",") || "(no state block left)";
}
process.stdout.write(JSON.stringify(out));
`);

let run = 0;
function drive(f, { failures = 0, code = "EBUSY", callSite = GUARD_READER } = {}) {
  const planPath = path.join(RIG, `plan-${++run}.json`);
  fs.writeFileSync(planPath, JSON.stringify({
    mapData: path.join(__dirname, "map-data.js"), mod: f.mod, game: f.game, code, failures, callSite,
    pathContains: norm(path.join(f.game, "history", "states", "554-Syria.txt")),
  }));
  const r = spawnSync(process.execPath, [DRIVER, planPath], { encoding: "utf8", timeout: 180000 });
  if (r.status !== 0 || !r.stdout) return { err: `driver exit ${r.status}: ${(r.stderr || "").slice(0, 300)}`, attempts: 0, thrown: 0 };
  try { return JSON.parse(r.stdout); } catch (_) { return { err: "unparsable: " + r.stdout.slice(0, 200), attempts: 0, thrown: 0 }; }
}

/** Vanilla ships 554-Syria.txt. The mod ships a file of THAT NAME (so vanilla's is shadowed, not gone) and a
 *  second, bigger state claiming the same province — the conflict the fixer is asked to resolve. The loser is
 *  the mod's 554, and deleting it would simply hand province 77 back to vanilla's 554. */
function fixture() {
  const game = mk("game");
  w(game, "hoi4.exe", "x");
  w(game, "history/states/554-Syria.txt", state(554, "SYRIA", [77]));
  w(game, "history/states/900-Other.txt", state(900, "OTHER", [900]));
  const mod = mk("mod");
  w(mod, "descriptor.mod", 'name="base blip"\n');              // NO replace_path: vanilla's own states really load
  const wrote = [];                                            // what the mod was GIVEN — the survival check is against this, never a typed count
  for (const [file, body] of [["554-Syria.txt", state(554, "SYRIA_MOD", [77])], ["900-Other.txt", state(900, "KEEPER", [77, 78])]]) {
    w(mod, "history/states/" + file, body);
    wrote.push(file);
  }
  return { mod, game, wrote };
}
/** Every state file the fixture gave the mod is still there, and still holds a state block. */
const stillThere = (r, f) => (f.wrote || []).every((name) => r.modFiles && r.modFiles[name] && !/no state block/.test(r.modFiles[name]));
// #a-conflict-whose-loser-cannot-be-deleted-keeps-the-province — WHAT THE GUARD IS FOR, not the shape of one answer it once
// gave. The guard's Set used to stop a delete and leave the conflict UNRESOLVED; it now makes a state that cannot be emptied
// the KEEPER, so the same never-delete rule holds and the conflict is resolved as well. Either way the thing being measured
// is that the mod's 554 comes through untouched: not deleted, and not stripped of the province that is its only one. With
// the guard's read lost, 554 is not recognised as the base game's and 900 — which has more provinces — takes it, which is
// the delete this test exists to catch.
const kept554 = (r) => {
  const res = r.result || {};
  if ((res.deletedStates || []).some((id) => Number(id) === 554)) return false;
  if ((res.resolved || []).some((x) => Number(x.removedFrom) === 554)) return false;
  return true;
};

try {
  console.log("0. The rig, and what it reads out of the source");
  rec("safe-write.js still owns one retry ladder", LADDER.length >= 2, LADDER);
  rec("…and still names the read codes worth waiting out", TRANSIENT.length > 0 && TRANSIENT.includes("EBUSY"), TRANSIENT);
  rec("the guard's reader is still named in map-data.js", !!GUARD_READER, GUARD_READER);

  console.log("\n1. THE CONTROL: with nothing injected, the mod's state is kept, not deleted");
  {
    const f = fixture();
    const r = drive(f);
    rec("the fixer keeps the province in the state the base game also supplies, rather than deleting it", kept554(r), r.result);
    rec("…nothing is deleted", ((r.result || {}).deletedStates || []).length === 0, r.result);
    rec("…and every state file the mod was given still holds its block", stillThere(r, f), r.modFiles);
  }

  console.log("\n2. ⭐⭐⭐ One momentary failure AT THAT READ must not turn the refusal into a delete");
  for (const code of (TRANSIENT.length ? TRANSIENT : ["EBUSY"])) {
    const f = fixture();
    const r = drive(f, { code, failures: 1 });
    rec(`one ${code} while the guard reads vanilla's 554-Syria.txt still keeps it`,
      r.thrown === 1 && kept554(r), { thrown: r.thrown, result: r.result });
    rec("…and the modder's own state block is still on disk", stillThere(r, f), r.modFiles);
  }

  console.log("\n3. PINNED: a base file that is REALLY unreadable is still skipped, and refused promptly");
  {
    const acc = drive(fixture(), { code: "EACCES", failures: 9999 });
    const forever = drive(fixture(), { code: "EBUSY", failures: 9999 });
    rec("the answer still comes back either way", !acc.err && !!acc.result && !forever.err && !!forever.result,
      { eacces: acc.err || "", ebusy: forever.err || "" });
    // Counted as a CEILING, not as a number: the waiting is bounded by TRANSIENT_READ_BUDGET_MS per folder as
    // well as by the ladder, so a folder that has gone unreadable may stop paying it partway.
    rec("EACCES is not waited out where a lock is — a permission costs fewer attempts",
      acc.attempts > 0 && acc.attempts < forever.attempts,
      { eaccesAttempts: acc.attempts, ebusyAttempts: forever.attempts, ladder: LADDER.length });
    rec("⭐⭐ a file that stays busy for ever is given up on after the ladder and no longer",
      forever.attempts <= acc.attempts * (LADDER.length + 1),
      { attempts: forever.attempts, ceiling: acc.attempts * (LADDER.length + 1) });
  }

  console.log("\n4. …and the chain in front of it is patient too: ONE lost call anywhere on that path is harmless");
  {
    // No call site: the first read of that file fails, whoever is asking. buildMapModel reads it first and
    // through readTextWithRetry, so it absorbs the blip — if this ever fails, a reader in front of the guard
    // has lost its retry.
    const f = fixture();
    const r = drive(f, { failures: 1, callSite: "" });
    rec("one lost read of vanilla's 554-Syria.txt, wherever it lands, still keeps it", r.thrown === 1 && kept554(r), { thrown: r.thrown, result: r.result });
    rec("…and deletes nothing", ((r.result || {}).deletedStates || []).length === 0 && stillThere(r, f), r.modFiles);
  }

  console.log("\n5. CONTROL: the injection really is what moves the answer");
  {
    const f = fixture();
    const r = drive(f, { failures: 0 });
    rec("with nothing thrown at that same read, the state is still kept", r.thrown === 0 && kept554(r) && stillThere(r, f), r);
  }
} catch (e) {
  rec("harness", false, String((e && e.stack) || e));
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) { /* scratch only */ } }
  console.log(`\n=== a lost base read does not delete a state vanilla supplies: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
}
