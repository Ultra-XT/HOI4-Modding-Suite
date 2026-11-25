// Restoring a removed country in a mod that replaces history/states names a state merged away since as not restored, keeps the
// archive, and says so on the status line. #a-restore-reads-only-the-states-the-mod-loads
//
// THE DEFECT (batch 10 page risk 2, re-measured on the base of this change with the Countries modal's and the merge tool's own
// requests over testlib-two-layer-map.js): a mod declaring replace_path="history/states" loads none of the base game's state files.
// Remove AAA, merge its state 3 into state 2 (a Save), and press Restore. editStateBlock, asked for state 3, looked below the mod
// through baseRootsFor — which ignores the mod's own replace_path — and found the game's 3-C.txt:
//   * where the mod's 3-C.txt had been the game's own text, the removed block equalled the game's block, so editStateBlock answered
//     "unchanged" and restoreCountry counted state 3 as already correct: { ok: true, statesRestored: 2, alreadyCorrect: 1,
//     archivedTo: ".nova/removed_countries/restored/AAA-….json" }. The archive — the only copy of state 3's block — was moved to
//     restored/ as if everything were back, and the page's status line said "Restored AAA (2 state(s))." and nothing about state 3.
//   * where the block was the mod's own (manpower 5000), the same lookup wrote a copy of the game's 3-C.txt into the mod carrying
//     the removed block: { ok: true, statesRestored: 3, archivedTo: … } and history/states/3-C.txt back in the mod — a state 3
//     brought back from a layer the mod does not load, on the province state 2 now holds.
// 8 of these 23 checks fail on c093c16's map-data.js and on 915459f (the commit before this one), identically.
//
// THE FIX. editStateBlock copies a state into the mod only from layersBelow (the mod's replace_path honoured), which is what
// stateFileTheGameKeeps already reads. A state no loaded file declares is "not found", so restoreCountry keeps the archive and warns,
// and the Restore button's status line carries that warning (it showed only the count).
"use strict";

const fs = require("fs");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 600)));
  if (!ok) fails.push(label);
};

const L2 = require("./testlib-two-layer-map.js");
const world = L2.makeWorld("b11-restore-merged");   // before server.js: it reads HOI4_MODS_ROOT when it loads
const REPLACES = 'supported_version="1.*"\nreplace_path="history/states"\n';
/** A mod that owns its states under replace_path, with AAA's history naming no capital (a removal empties it anyway). */
const replacingMod = (name, three) => world.mod(name, {
  "descriptor.mod": `name="${name}"\n${REPLACES}`,
  "history/states/1-A.txt": L2.st(1, "4"),
  "history/states/2-B.txt": L2.st(2, "2 5"),
  "history/states/3-C.txt": three,
  "history/countries/AAA - Aland.txt": "set_research_slots = 3\n",
});
const SAME = replacingMod("Restore same text", L2.st(3, "3"));
const OWN = replacingMod("Restore own block", L2.st(3, "3", { manpower: 5000 }));
const PAGE = replacingMod("Restore page probe", L2.st(3, "3"));
const PLAIN = world.mod("Restore plain overlay", { "history/countries/AAA - Aland.txt": "set_research_slots = 3\n" });
const md = require("./map-data.js");
const P = require("./testlib-map-page.js");
const { createApp } = require("./server.js");

// ⛔ #a-removal-archive-lives-outside-the-mod (B2-28) — where Restore looks: Nova's store for the mod (it was <mod>/.nova/removed_countries)
const archive = (mod) => path.join(md.removedCountriesDir(mod), "AAA.json");
/** The files of the mod that declare state `id`, read from disk. */
const declaring = (mod, id) => {
  const dir = path.join(mod, "history", "states");
  let names = []; try { names = fs.readdirSync(dir).filter((f) => /\.txt$/i.test(f)); } catch (_) { names = []; }
  return names.filter((f) => md.parseStatesText(fs.readFileSync(path.join(dir, f), "utf8")).some((s) => s.id === id));
};

const RELOAD = ["async function load(doneMsg)", "function buildFromImage(img, doneMsg)", "async function mapCrashGate(", "function openMapErrorsModal(", "async function reloadAfterImmediateWrite("];
function pageGlobals(srv, mod, requests, log, over) {
  return P.loadGlobals(Object.assign({
    modPath: () => mod,
    Image: P.fakeImageClass({ log }),
    fetch: async (url, opts) => {
      const u = String(url);
      const r = await fetch(srv.base + u, opts);
      const body = await r.json().catch(() => ({}));
      requests.push({ url: u.split("?")[0], body });
      return { ok: r.ok, status: r.status, json: async () => body };
    },
  }, over));
}
async function untilReloaded(log) {
  for (let i = 0; i < 400 && !log.includes("image-loaded"); i++) await P.settle(10);
  await P.settle(60);
}

(async () => {
  let srv = null;
  try {
    console.log("0. The requests the page sends");
    {
      const M = P.MASKED;
      rec("Remove country posts { modPath, tag, reassignTo }", /fetch\("\/api\/map\/delete-country", \{[\s\S]{0,160}?body: JSON\.stringify\(\{ modPath: modPath\(\), tag, reassignTo \}\) \}\)/.test(M));
      rec("…Restore posts { modPath, tag }", /fetch\("\/api\/map\/restore-country", \{[\s\S]{0,160}?body: JSON\.stringify\(\{ modPath: modPath\(\), tag \}\) \}\)/.test(M));
      rec("…and a merge is queued as { sourceStateId, targetStateId }, which flushMapSaves posts with modPath", /queueWrite\("\/api\/map\/merge-state", \{ sourceStateId: sourceSid, targetStateId: targetSid \}/.test(M));
    }
    srv = await L2.startServer(createApp);
    const removeMergeRestore = async (mod) => {
      const del = await srv.post("/api/map/delete-country", { tag: "AAA", reassignTo: "" }, mod);
      const merge = await srv.post("/api/map/merge-state", { sourceStateId: 3, targetStateId: 2 }, mod);
      const gone = declaring(mod, 3);
      const res = await srv.post("/api/map/restore-country", { tag: "AAA" }, mod);
      return { del, merge, gone, res };
    };

    console.log("\n1. ⭐⭐⭐ A mod that replaces history/states, whose state 3 was the game's text, merges it away and restores AAA");
    {
      const { del, merge, gone, res } = await removeMergeRestore(SAME);
      rec("THE CONTROL: the removal answered ok for AAA's three states", del.status === 200 && del.body.ok === true && del.body.statesChanged === 3, del.body);
      rec("THE CONTROL: the merge answered ok", merge.status === 200 && merge.body.ok === true, merge.body);
      rec("THE CONTROL: …and after it no file of the mod declares state 3, and the game's 3-C.txt does not load", gone.length === 0, gone);
      const r = res.body || {};
      rec("the restore answered ok", res.status === 200 && r.ok === true, r);
      rec("THE CONTROL: states 1 and 2 were put back", r.statesRestored === 2, r);
      rec("⭐⭐⭐ state 3 is named as not restored", (r.failedStates || []).some((f) => f.id === 3 && /not found/i.test(String(f.error))), r);
      rec("⭐⭐ …not counted as already correct", !(r.alreadyCorrect > 0), r);
      rec("⭐⭐⭐ the archive is kept where Restore looks, so the restore can be tried again", fs.existsSync(archive(SAME)) && !r.archivedTo, { kept: fs.existsSync(archive(SAME)), archivedTo: r.archivedTo });
      rec("⭐⭐ …and the answer says so", /could not be restored \(3\)/.test(String(r.warning || "")) && /KEPT/.test(String(r.warning || "")), r.warning);
      rec("⭐⭐ no file of the mod declares state 3 after the restore", declaring(SAME, 3).length === 0, declaring(SAME, 3));
    }

    console.log("\n2. ⭐⭐⭐ …and where state 3's block was the mod's own, no copy of the game's file brings it back");
    {
      const { gone, res } = await removeMergeRestore(OWN);
      rec("THE CONTROL: after the merge no file of the mod declares state 3", gone.length === 0, gone);
      const r = res.body || {};
      rec("⭐⭐⭐ state 3 is named as not restored", res.status === 200 && (r.failedStates || []).some((f) => f.id === 3), r);
      rec("⭐⭐⭐ …and no file of the mod declares state 3 — nothing was copied in from the game, which this mod does not load", declaring(OWN, 3).length === 0 && !fs.existsSync(path.join(OWN, "history", "states", "3-C.txt")), declaring(OWN, 3));
      rec("⭐⭐ …and the archive is kept", fs.existsSync(archive(OWN)), fs.existsSync(archive(OWN)));
    }

    console.log("\n3. THE CONTROL: a mod over the base game restores the state it inherited");
    {
      const del = await srv.post("/api/map/delete-country", { tag: "AAA", reassignTo: "" }, PLAIN);
      rec("the removal answered ok", del.status === 200 && del.body.ok === true, del.body);
      const res = await srv.post("/api/map/restore-country", { tag: "AAA" }, PLAIN);
      const r = res.body || {};
      rec("…and the restore puts all three states back with nothing failed, and moves the archive aside", r.ok === true && r.statesRestored === 3 && !(r.failedStates || []).length && !!r.archivedTo, r);
    }

    console.log("\n4. ⭐⭐ The Restore button says what it could not put back");
    {
      await srv.post("/api/map/delete-country", { tag: "AAA", reassignTo: "" }, PAGE);
      await srv.post("/api/map/merge-state", { sourceStateId: 3, targetStateId: 2 }, PAGE);
      const requests = [], log = [];
      const restoreBtn = Object.assign(P.element("button"), { getAttribute: (k) => (k === "data-tag" ? "AAA" : null) });
      const box = Object.assign(P.element(), { querySelectorAll: (sel) => (sel === ".ccRestore" ? [restoreBtn] : []) });
      const page = P.runPage([["async function refreshRemoved()", "\n    }"]].concat(RELOAD),
        pageGlobals(srv, PAGE, requests, log, { $: (id) => (id === "ccRemovedList" ? box : P.element()), close: () => {} }));
      await page.sb.refreshRemoved();
      const click = restoreBtn.listeners.click && restoreBtn.listeners.click[0];
      rec("THE CONTROL: the removed-countries list offers AAA's Restore button", typeof click === "function", box.innerHTML.slice(0, 160));
      if (typeof click !== "function") throw new Error("no Restore handler");
      await click();
      await untilReloaded(log);
      const res = requests.find((q) => q.url === "/api/map/restore-country");
      rec("THE CONTROL: the click restored what it could and answered ok", !!(res && res.body.ok === true), res && res.body);
      const last = page.statuses[page.statuses.length - 1] || "";
      rec("…the status line still says what was restored", /Restored AAA/.test(last), last);
      rec("⭐⭐⭐ …and names the state it could not restore and that the removal was kept", /could not be restored \(3\)/.test(last) && /KEPT/.test(last), { last, statuses: page.statuses });
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
    fails.push("harness error");
  } finally {
    if (srv) srv.close();
    world.cleanup();
  }
  console.log(`\n=== a restore in a mod that replaces history/states names the state merged away since: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
