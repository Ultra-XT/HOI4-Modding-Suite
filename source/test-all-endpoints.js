// Repeatable API smoke test: hits EVERY GET route + a curated set of safe POST routes against a
// throwaway temp mod, asserting none crash with a 500 (unhandled server error). Handled responses
// (200/304/400/404/429) are fine — we're catching server-side crashes + read-path regressions, not
// validating business logic (the other test-*.js cover that). SAFE: uses createApp() (which does NOT
// load the user's persisted mod), and passes modPath=<tempMod> on every call, so it can never touch
// Millennium Dawn or the real game files.
const fs = require("fs");
const os = require("os");
const path = require("path");
// ⛔ #a-test-that-chooses-a-game-keeps-it-to-itself — FIRST, before any of Nova's modules: this file's own server is told about the
// Game folder, and a choice saved in the run's one app-data folder stood in front of every other test's HOI4_ROOT. Its app data is
// its own (testlib-own-app-data.js; test-a-test-that-chooses-a-game-keeps-it-to-itself.js holds every such file to this).
require("./testlib-own-app-data.js");
const { createApp } = require("./server.js");

const PORT = 3517;
const BASE = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0, warn = 0;
const failures = [];
const ok = (n, c, extra) => { if (c) { pass++; } else { fail++; failures.push(n + (extra ? " → " + extra : "")); console.log("  ✗ FAIL", n, extra != null ? "→ " + extra : ""); } };

// ── Build a small but representative temp mod so read endpoints have something to parse ──
function setupMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-endpoints-"));
  const mk = (rel, body) => { const p = path.join(mod, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body, "utf8"); };
  mk("descriptor.mod", 'name="Endpoint Test"\nsupported_version="*"\n');
  mk("common/country_tags/00_tags.txt", 'TST = "countries/TST.txt"\n');
  mk("history/countries/TST - Test.txt", "capital = 1\nset_technology = {\n}\nset_politics = {\n\truling_party = neutrality\n}\n");
  mk("common/technologies/custom.txt", "technologies = {\n\ttst_tech = {\n\t\tresearch_cost = 1\n\t\tstart_year = 1936\n\t\tfolder = { name = infantry_folder position = { x = 0 y = 0 } }\n\t}\n}\n");
  mk("common/units/equipment/custom.txt", "equipments = {\n\ttst_eq = {\n\t\tyear = 1936\n\t\tarchetype = infantry_equipment\n\t}\n}\n");
  mk("common/ideas/custom.txt", "ideas = {\n\tcountry = {\n\t\ttst_spirit = {\n\t\t\tpicture = GFX_idea_unknown\n\t\t\tmodifier = { stability_factor = 0.1 }\n\t\t}\n\t}\n}\n");
  mk("common/national_focus/custom.txt", 'focus_tree = {\n\tid = tst_tree\n\tcountry = { factor = 0 modifier = { add = 10 tag = TST } }\n\tfocus = {\n\t\tid = tst_focus\n\t\ticon = GFX_goal_unknown\n\t\tx = 1 y = 0\n\t\tcost = 10\n\t\tcompletion_reward = {}\n\t}\n}\n');
  mk("events/custom.txt", 'add_namespace = tst\ncountry_event = {\n\tid = tst.1\n\ttitle = tst.1.t\n\tdesc = tst.1.d\n\tpicture = GFX_report_event_generic\n\toption = { name = tst.1.a }\n}\n');
  mk("common/decisions/custom.txt", "tst_category = {\n\ttst_decision = {\n\t\tcost = 0\n\t\tcomplete_effect = {}\n\t}\n}\n");
  mk("common/characters/custom.txt", "characters = {\n\ttst_char = {\n\t\tname = tst_char\n\t\tcountry_leader = { ideology = conservatism }\n\t}\n}\n");
  mk("localisation/english/custom_l_english.yml", "﻿l_english:\n TST:0 \"Testland\"\n tst_focus:0 \"Test Focus\"\n");
  return mod;
}

// GET routes + the query params each reasonably needs (modPath is added to all). A handled 400/404 is
// acceptable for routes that want params we don't supply — we only fail on a 500 (a real crash).
const GET_ROUTES = (M) => ([
  ["/api/root", {}],
  ["/api/mods/list", {}],
  ["/api/update-check", {}],
  ["/api/diag/hoi4", {}],
  ["/api/debug/slow-requests", {}],
  ["/api/vanilla-ui", {}],
  ["/api/vanilla/idea-tokens", {}],
  ["/api/vanilla/tech-categories", {}],
  ["/api/settings/allow-vanilla-edits", {}],
  ["/api/settings/game-folder", {}],   // #nova-does-not-find-the-game: the game folder in use and where it was found
  ["/api/modversion", { modPath: M }],
  ["/api/mod/index", { modPath: M }],
  ["/api/mod/start-date", { modPath: M }],
  ["/api/mod/warm-sprites", { modPath: M }],
  ["/api/countries/catalog", { modPath: M }],
  ["/api/units", { modPath: M }],
  ["/api/units", { modPath: M, country: "USA" }],
  ["/api/bookmarks", { modPath: M }],
  ["/api/characters/list", { modPath: M }],
  ["/api/decisions/list", { modPath: M }],
  ["/api/events/list", { modPath: M }],
  ["/api/ideas/catalog", { modPath: M, includeVanilla: 0 }],
  ["/api/ideas/sprites", { modPath: M }],
  ["/api/ideas/target-files", { modPath: M }],
  ["/api/ideas/sprite-url", { modPath: M, key: "GFX_idea_unknown" }],
  ["/api/ideas/edit-payload", { modPath: M, ideaId: "tst_spirit", targetRelativeFile: "custom.txt" }],
  ["/api/ideas/entry-block", { modPath: M, ideaId: "tst_spirit", targetRelativeFile: "custom.txt" }],
  ["/api/ideas/entry-preview", { modPath: M, ideaId: "tst_spirit", targetRelativeFile: "custom.txt" }],
  ["/api/ideologies", { modPath: M }],
  ["/api/game/ideologies", { modPath: M }],
  ["/api/game/leader-ideologies", { modPath: M }],
  ["/api/game/equipment", { modPath: M }],
  ["/api/game/resources", { modPath: M }],
  ["/api/equipment/archetypes", { modPath: M }],
  ["/api/technologies/catalog", { modPath: M, includeVanilla: 0 }],
  ["/api/technologies/country-techs", { modPath: M, tag: "TST" }],
  ["/api/technologies/country-tech-status", { modPath: M, tag: "TST" }],
  ["/api/research/folder-tabs", { modPath: M }],
  ["/api/research/gui-layout", { modPath: M }],
  ["/api/focus/country-trees", { modPath: M }],
  ["/api/focus/sprites", { modPath: M }],
  ["/api/focus/tree-properties", { modPath: M }],
  ["/api/focuses/target-files", { modPath: M }],
  ["/api/history/startup-status", { modPath: M }],
  ["/api/history/country-details", { modPath: M, tag: "TST" }],
  ["/api/history/country-spirits", { modPath: M, tag: "TST" }],
  ["/api/history/character-countries", { modPath: M }],
  ["/api/history/event-countries", { modPath: M }],
  ["/api/history/event-schedules", { modPath: M }],
  ["/api/history/item-countries", { modPath: M, ids: "tst.1" }],
  ["/api/localization", { modPath: M }],
  ["/api/localization/status", { modPath: M }],
  ["/api/modhealth/loc-check", { modPath: M }],
  ["/api/buildings/state-catalog", { modPath: M }],
  ["/api/buildings/icon-map", { modPath: M }],
  ["/api/flags/gfx-stems", { modPath: M }],
  ["/api/sprites", { modPath: M, type: "tech" }],
  ["/api/scripted-effects", { modPath: M }],
  ["/api/scripted-triggers", { modPath: M }],
  ["/api/map/removed-countries", { modPath: M }],
  ["/api/map/validate", { modPath: M }],
  ["/api/map/state-script-lines", { modPath: M, stateId: 1, keptId: 2 }],
  ["/api/resolve-sprite", { modPath: M, key: "GFX_goal_unknown" }],
  ["/api/icon-image", { modPath: M, key: "GFX_goal_unknown" }],
  ["/api/icon", { key: "GFX_goal_unknown" }],
  // Binary/heavy ones that legitimately may 404 on a tiny mod — still must not 500:
  ["/api/map/model", { modPath: M }],
  ["/api/map/provinces-bmp", { modPath: M }],
  ["/api/buildings/icon-file", { modPath: M, key: "GFX_x" }],
]);

// Curated SAFE POST routes (idempotent / read-ish / per-process). Heavy write paths (save, map edits,
// create) are covered by the other test-*.js — we don't re-hit them here. Each gets modPath=temp.
const POST_ROUTES = (M) => ([
  ["/api/cache/clear", {}],
  // /api/telemetry used to be listed here. It was removed from server.js (#no-telemetry) — it wrote to a
  // local file, sent nothing anywhere, and had no caller in the app. This list was in fact its ONLY caller,
  // which is why logs/telemetry.jsonl kept growing: 834 of its 1,588 lines are this suite's own
  // `{"event":"endpoint_test"}` marker. A 404 counts as a pass here, so the entry would have gone on quietly
  // hitting a dead route forever. test-no-telemetry.js now asserts the endpoint stays gone.
  ["/api/settings/allow-vanilla-edits", { enabled: false }],
  // #nova-does-not-find-the-game — the Game folder setting, never with a folder it would keep: no { path } is a handled 400, and
  // the temp mod (no hoi4.exe in it) is refused with its reason; nothing is saved either way
  ["/api/settings/game-folder", {}],
  ["/api/settings/game-folder", { path: M }],
  ["/api/modversion/dismiss", { modPath: M }],
  ["/api/localization/validate", { modPath: M, entries: [] }],
  ["/api/ideas/verify", { modPath: M, ideaId: "tst_spirit", targetRelativeFile: "custom.txt" }],
  // Map WRITE endpoints with MINIMAL payloads — these must reject missing required fields with a
  // handled 4xx, NOT crash with a 500. (The happy-path map writes need a map base + in-game checks,
  // so they're tested with the user; this is the crash-safety net for the map-edit surface.)
  ["/api/map/set-owner", { modPath: M }],
  ["/api/map/create-state", { modPath: M }],
  ["/api/map/delete-state", { modPath: M }],
  ["/api/map/merge-state", { modPath: M }],
  ["/api/map/set-state", { modPath: M }],
  ["/api/map/move-province", { modPath: M }],
  ["/api/map/move-province-region", { modPath: M }],
  ["/api/map/move-state-supplyarea", { modPath: M }],
  ["/api/map/set-province-terrain", { modPath: M }],
  ["/api/map/set-province-terrains", { modPath: M }],
  ["/api/map/railway-curves", { modPath: M }],   // read-only: the Railway tool's curve note (#a-railway-bends-over-a-bay)
  ["/api/map/railway-curves", { modPath: M, rows: [[1, 2]], at: [1] }],
  ["/api/map/victory-point-towns", { modPath: M }],
  ["/api/map/seas-cut-off", { modPath: M }],
  ["/api/map/flip-provinces-sea", { modPath: M }],
  ["/api/map/keep-capitals", { modPath: M }],
  ["/api/map/delete-country", { modPath: M }],
  ["/api/map/restore-country", { modPath: M }],
]);

async function hit(method, route, paramsOrBody) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    let url = BASE + route, opts = { method, signal: ctrl.signal };
    if (method === "GET") {
      const qs = new URLSearchParams(Object.entries(paramsOrBody).map(([k, v]) => [k, String(v)])).toString();
      if (qs) url += "?" + qs;
    } else {
      opts.headers = { "Content-Type": "application/json" };
      opts.body = JSON.stringify(paramsOrBody);
    }
    const res = await fetch(url, opts);
    return { status: res.status };
  } catch (e) {
    return { status: -1, err: e.message };
  } finally {
    clearTimeout(timer);
  }
}

(async () => {
  console.log("=== ALL-ENDPOINTS SMOKE TEST ===");
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const mod = setupMod();
  try {
    for (const [route, params] of GET_ROUTES(mod)) {
      const r = await hit("GET", route, params);
      if (r.status === -1) { warn++; console.log("  ⚠ TIMEOUT/ABORT", route, r.err); continue; }
      ok(`GET ${route} (${r.status})`, r.status < 500, r.status >= 500 ? "HTTP " + r.status : null);
    }
    for (const [route, body] of POST_ROUTES(mod)) {
      const r = await hit("POST", route, body);
      if (r.status === -1) { warn++; console.log("  ⚠ TIMEOUT/ABORT", route, r.err); continue; }
      ok(`POST ${route} (${r.status})`, r.status < 500, r.status >= 500 ? "HTTP " + r.status : null);
    }

    // ⛔ #a-route-that-raises-its-limit-gets-it — the limit a route carries is the limit it has, and a body refused is an answer the page can read.
    // The table is read from server.js, and every route-level limit above the global parser's is one that can never apply (it did not for years).
    const { maskJsComments } = require("./testlib-strip-comments.js");
    const SRV = maskJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));
    const table = /for \(const \[route, limit\] of (\[\[.*?\]\])\) app\.use\(route, express\.json\(\{ limit \}\)\);/.exec(SRV);
    const limits = table ? JSON.parse(table[1]) : [];
    ok("the routes with a raised limit are read from server.js", limits.length === 3, JSON.stringify(limits));
    const globalAt = SRV.indexOf('app.use(express.json({ limit: "10mb" }))'), appAt = SRV.indexOf("function createApp(");
    ok("…and their parsers run ahead of the global one and of every route", !!table && table.index > appAt && table.index < globalAt && globalAt < SRV.indexOf('app.post("/api/map/', appAt), JSON.stringify({ table: table && table.index, globalAt }));
    const raised = [...SRV.matchAll(/app\.post\("([^"]+)",\s*express\.json\(\{\s*limit:\s*"(\d+)mb"/g)].filter((m) => Number(m[2]) > 10).map((m) => m[1]);
    ok("no route declares a limit above the global parser's on its own line, where it could not apply", raised.length === 0, raised.join(", "));
    const send = async (route, body) => {
      const r = await fetch(BASE + route, { method: "POST", headers: { "Content-Type": "application/json" }, body });
      const text = await r.text();
      let json = null; try { json = JSON.parse(text); } catch (_) { /* not JSON: the page's r.json() throws on it */ }
      return { status: r.status, type: String(r.headers.get("content-type") || ""), json, head: text.slice(0, 120) };
    };
    const padded = (mb) => JSON.stringify({ modPath: mod, pad: "x".repeat(mb * 1048576) });
    for (const [route, limit] of limits) {
      const mb = parseInt(limit, 10);
      const over = await send(route, padded(11));
      ok(`${route} reads a body of 11 MB, over the global parser's 10`, over.status !== 413 && !!over.json && !/Nova reads in one request/.test(String(over.json.error || "")), JSON.stringify({ status: over.status, head: over.head }));
      const tooBig = await send(route, padded(mb + 1));
      ok(`${route} refuses a body over its own ${limit}, in JSON the page can read and say`, tooBig.status === 413 && !!tooBig.json && tooBig.json.ok === false && new RegExp(`${mb} MB Nova reads in one request`).test(String(tooBig.json.error)) && /json/i.test(tooBig.type), JSON.stringify({ status: tooBig.status, type: tooBig.type, head: tooBig.head }));
    }
    const plain = await send("/api/map/set-owner", padded(11));
    ok("every other route keeps the global 10 MB, and is refused in JSON too", plain.status === 413 && !!plain.json && plain.json.ok === false && /10 MB Nova reads in one request/.test(String(plain.json.error)), JSON.stringify({ status: plain.status, head: plain.head }));
    const broken = await send("/api/map/set-owner", "{ this is not json");
    ok("a body that is not JSON is answered in JSON, with the status it always had", broken.status === 400 && !!broken.json && broken.json.ok === false && /could not read this request/.test(String(broken.json.error)), JSON.stringify({ status: broken.status, head: broken.head }));
  } catch (e) {
    fail++; failures.push("harness: " + e.message); console.log("  ✗ harness threw:", e.message);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    server.close();
  }
  console.log(`\nALL-ENDPOINTS: ${pass} ok, ${fail} failed, ${warn} timed-out/skipped.`);
  if (fail) { console.log("FAILURES:\n  " + failures.join("\n  ")); process.exit(1); }
  process.exit(0);
})();
