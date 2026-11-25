// 🌍 #a-world-run-is-shown-to-its-own-mod — THE RECORD OF A RUN IS NOVA'S (one file in app data), THE MAP PAGE IS ONE MOD'S.
//
// A run that ended unseen — its panel never Closed, because Nova was closed on the ✓ panel or the modder was on another page when it
// ended — is shown again by the next map page that loads. Whatever mod that page is on. Measured (reviewer, the page's own world block
// against a live server): a run built "First World" and ended unseen; 🏠 New mod made "Second Mod" and its "🌍 Generate a world for
// it →" opened map.html?world=1 — and the page showed "✓ Your new world is ready: 105 land provinces in 34 states…" (First World's,
// naming no mod) over Second Mod's untouched map, opened no confirm, stripped ?world=1, and opened none after Close either.
//
// So: a finished run's panel is shown on load only to the mod it was built for, and ?world=1 on any other mod opens the confirm.
// The page code is the page's own (testlib-world-page.js lifts the world block); the record is GET /api/map/world-run's shape.
"use strict";
const WP = require("./testlib-world-page.js");
const W = require("./world-run.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) fails.push(label);
};
const A = "C:\\fixture\\mods\\first_world", B = "C:\\fixture\\mods\\second_mod";
const clone = (x) => JSON.parse(JSON.stringify(x));
const RUN = {
  id: "r1", modRoot: A, modName: "First World", state: "done", seen: false, startedAt: 0, endedAt: 2000, stepIndex: 5, step: "check",
  choices: { landShare: 35, seed: 1, ownerMode: "inherit", owner: "" }, plan: { copiesUnder: "C:\\fixture\\home\\.nova", modName: "First World" },
  steps: W.STEPS.map((s) => ({ key: s.key, n: s.n, k: s.k, title: s.title, optional: !!s.optional, state: s.optional ? "skipped" : "done", startedAt: 1, endedAt: 2, error: "" })),
  answers: { generate: { flippedProvinces: 105, createdStates: 34, asked: { pct: 35, seed: 1, sea: 298 }, ownership: { mode: "inherit", countries: 2 } }, check: { validate: { problems: [] }, offered: [] } },
  leftovers: [],
};
const PLAN = { modName: "Second Mod", bitmap: { own: false, from: "game", bytes: 1 }, descriptors: [], ownsWorld: false, copiesUnder: "C:\\fixture\\home\\.nova" };
const answer = (body) => ({ status: 200, json: async () => clone(body) });
async function open({ modPath, search, run }) {
  const sent = [];
  const p = WP.worldPage({
    modPath, search, timers: { setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {} },
    fetch: async (url, init) => {
      sent.push(`${(init && init.method) || "GET"} ${url}`);
      if (url === "/api/map/world-run" || url === "/api/map/world-run?answers=1") return answer({ ok: true, run: url.endsWith("answers=1") ? run : Object.assign(clone(run), { answers: undefined }) });
      if (url === "/api/map/prepare-world") return answer({ ok: true, dryRun: true, plan: Object.assign({}, PLAN, { modName: modPath === A ? "First World" : "Second Mod" }) });
      return answer({ ok: true });
    },
  });
  await p.fns.startMapPage();
  await WP.settle(40);
  const shown = p.el("mapWorldProgress").style.display === "flex";
  return { p, sent, shown, title: p.el("mapWorldTitle").textContent, foot: p.el("mapWorldFoot").textContent, confirm: p.el("mapWorldConfirm").style.display === "flex" };
}

(async () => {
  // THE CONTROL: the run's own mod, reopened — its unseen result is shown once, as designed
  const own = await open({ modPath: A, search: "", run: RUN });
  rec("THE CONTROL: on the run's own mod the unseen result is shown", own.shown && /ready/i.test(own.title), { title: own.title });
  // (MOVED WITH review cr2 R1: an unseen run's page start reloads as its poll's end does, through reloadAfterImmediateWrite)
  rec("THE CONTROL: …and the page loads its map, once", own.p.loads.length + own.p.reloads.length === 1, { loads: own.p.loads, reloads: own.p.reloads });

  // another mod's map page, plain
  const other = await open({ modPath: B, search: "", run: RUN });
  rec("⭐ another mod's map page does not show the run as its own: no panel, or one that names the mod it was built for",
    !other.shown || (other.title + other.foot).includes(RUN.modName), { shown: other.shown, title: other.title, foot: other.foot.slice(0, 200) });

  // 🏠 New mod → "🌍 Generate a world for it →" (map.html?world=1) on another mod
  const deep = await open({ modPath: B, search: "?world=1", run: RUN });
  rec("⭐ ?world=1 on another mod opens the 🌍 confirm for THAT mod (POST /api/map/prepare-world sent)", deep.confirm && deep.sent.includes("POST /api/map/prepare-world"), { confirm: deep.confirm, sent: deep.sent, title: deep.title });

  // the same mod spelled with forward slashes (a path that has been through localStorage, a URL, a config) is the same mod
  const spelled = await open({ modPath: A.replace(/\\/g, "/"), search: "", run: RUN });
  rec("the run's own mod in another spelling still gets its result", spelled.shown && /ready/i.test(spelled.title), { title: spelled.title });

  // the panel names the mod it was built for (the record is Nova's one run)
  rec("⭐ the panel's title names the mod the world was built for", own.title.includes(RUN.modName), own.title);
  // ?world=1 on the run's OWN mod, over its unseen panel: the panel first, and the confirm once that panel is Closed (it was dropped)
  const ownDeep = await open({ modPath: A, search: "?world=1", run: RUN });
  rec("THE CONTROL: ?world=1 on the run's own mod shows its unseen panel first, with no confirm over it", ownDeep.shown && !ownDeep.confirm, { shown: ownDeep.shown, confirm: ownDeep.confirm });
  await ownDeep.p.fire("mapWorldClose");
  await WP.settle(40);
  rec("⭐ …and opens the 🌍 confirm once that panel is closed (POST /api/map/prepare-world sent)", ownDeep.p.el("mapWorldConfirm").style.display === "flex" && ownDeep.sent.includes("POST /api/map/prepare-world"), { confirm: ownDeep.p.el("mapWorldConfirm").style.display, sent: ownDeep.sent });
  const plainClose = await open({ modPath: A, search: "", run: RUN });
  await plainClose.p.fire("mapWorldClose");
  await WP.settle(40);
  rec("THE CONTROL: closing that panel with no ?world=1 opens no confirm", plainClose.p.el("mapWorldConfirm").style.display !== "flex" && !plainClose.sent.includes("POST /api/map/prepare-world"), plainClose.sent);

  console.log(`\n${checks - fails.length}/${checks} checks passed`);
  if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exitCode = 1; }
})().catch((e) => { console.error(e); process.exitCode = 1; });
