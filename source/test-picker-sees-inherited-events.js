// #picker-blind-to-inherited-events — "FIRE AN EVENT" OFFERED 1 EVENT OUT OF 20,163.
//
// /api/events/list and /api/decisions/list read exactly one directory: `<activeRoot>/events` and
// `<activeRoot>/common/decisions`. For a standalone mod that is right. For an ADD-ON it is close to useless,
// because an add-on's own folders are nearly empty and everything it wants to reference lives in the layers
// underneath. Measured on a scratch add-on declaring Millennium Dawn as its dependency:
//
//     events on disk    add-on 1 · Millennium Dawn 10,958 · vanilla 9,205
//     the picker offered                                                1
//     decision categories offered                                       1   (MD alone has 471)
//
// So a decision could not fire a vanilla event, an add-on could not hook a base-mod decision, and the effect
// wizard's event list was empty for every add-on author. The control that pins it as blindness rather than a
// parsing failure: point the SAME endpoints at Millennium Dawn as the mod and they return 9,340 events and
// 471 categories perfectly well.
//
// ⭐ THE SIBLING NEXT DOOR, AGAIN. Nova's "what fires this event?" reader (server.js, the reverse-reference
// endpoint) already loops `for (const root of roots)` over game + dependencies + mod, because a reference
// can live anywhere. The reader for "which events EXIST to fire" looked in one folder. Same subsystem,
// opposite blindness. A runtime sweep of all eleven list/catalog endpoints found these two are the ONLY
// blind pair — countries, ideas, technologies, equipment, variants, states and characters all resolve their
// dependencies correctly, so this is a gap, not the house style.
//
// ⚠️ THE EDITOR MUST NOT CHANGE. The same two endpoints back the Events and Decisions makers' own sidebars,
// where "everything you inherit" would be actively wrong (and 20,000 rows long). So inherited content is
// OPT-IN via includeInherited=1, sent by the six PICKER call sites and by neither editor. Both halves are
// asserted below; a fix that turned the sidebars into a dump of vanilla would fail this test.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { stripJsComments } = require("./testlib-strip-comments.js");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-inh-"));
process.env.HOI4_MODS_ROOT = ROOT;
process.env.APPDATA = path.join(ROOT, "appdata");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500));
  }
}

const toPosix = (p) => p.split(path.sep).join("/");
const PUB = path.join(__dirname, "public");

// ── the base mod: what an add-on inherits ───────────────────────────────────────────────────────────────
const BASE = path.join(ROOT, "basemod");
fs.mkdirSync(path.join(BASE, "events"), { recursive: true });
fs.mkdirSync(path.join(BASE, "common", "decisions"), { recursive: true });
fs.writeFileSync(path.join(BASE, "descriptor.mod"), 'name="NovaBaseProbe"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "basemod.mod"), 'name="NovaBaseProbe"\npath="' + toPosix(BASE) + '"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(BASE, "events", "base_probe.txt"),
  "add_namespace = baseprobe\n" +
  "country_event = {\n\tid = baseprobe.1\n\ttitle = baseprobe.1.t\n\tdesc = baseprobe.1.d\n\toption = { name = baseprobe.1.a }\n}\n" +
  "country_event = {\n\tid = baseprobe.2\n\ttitle = baseprobe.2.t\n\tdesc = baseprobe.2.d\n\toption = { name = baseprobe.2.a }\n}\n");
fs.writeFileSync(path.join(BASE, "common", "decisions", "base_probe.txt"),
  "baseprobe_category = {\n\tbaseprobe_decision_one = {\n\t\tcost = 10\n\t}\n\tbaseprobe_decision_two = {\n\t\tcost = 20\n\t}\n}\n");
// …and a file the ADD-ON will shadow by the same relative name, which HOI4 replaces wholesale.
fs.writeFileSync(path.join(BASE, "events", "shadowed.txt"),
  "add_namespace = shadowed\ncountry_event = {\n\tid = shadowed.1\n\ttitle = shadowed.1.t\n\tdesc = shadowed.1.d\n\toption = { name = shadowed.1.a }\n}\n");

// ── the add-on ──────────────────────────────────────────────────────────────────────────────────────────
const ADDON = path.join(ROOT, "addon");
fs.mkdirSync(path.join(ADDON, "events"), { recursive: true });
fs.mkdirSync(path.join(ADDON, "common", "decisions"), { recursive: true });
const dep = 'dependencies={\n\t"NovaBaseProbe"\n}\n';
fs.writeFileSync(path.join(ADDON, "descriptor.mod"), 'name="NovaInhAddon"\n' + dep + 'supported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "addon.mod"), 'name="NovaInhAddon"\npath="' + toPosix(ADDON) + '"\n' + dep + 'supported_version="1.19.*"\n');
fs.writeFileSync(path.join(ADDON, "events", "own.txt"),
  "add_namespace = ownprobe\ncountry_event = {\n\tid = ownprobe.1\n\ttitle = ownprobe.1.t\n\tdesc = ownprobe.1.d\n\toption = { name = ownprobe.1.a }\n}\n");
fs.writeFileSync(path.join(ADDON, "common", "decisions", "own.txt"),
  "ownprobe_category = {\n\townprobe_decision = {\n\t\tcost = 5\n\t}\n}\n");
// the same relative path as the base mod's — the add-on's copy REPLACES it, it does not merge
fs.writeFileSync(path.join(ADDON, "events", "shadowed.txt"),
  "add_namespace = shadowed\ncountry_event = {\n\tid = shadowed.99\n\ttitle = shadowed.99.t\n\tdesc = shadowed.99.d\n\toption = { name = shadowed.99.a }\n}\n");

// ── a second add-on, identical but for one descriptor line: replace_path = "events" ─────────────────────
const REPLADDON = path.join(ROOT, "repladdon");
fs.mkdirSync(path.join(REPLADDON, "events"), { recursive: true });
fs.writeFileSync(path.join(REPLADDON, "descriptor.mod"), 'name="NovaReplAddon"\n' + dep + 'replace_path="events"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "repladdon.mod"), 'name="NovaReplAddon"\npath="' + toPosix(REPLADDON) + '"\n' + dep + 'replace_path="events"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(REPLADDON, "events", "own.txt"),
  "add_namespace = replprobe\ncountry_event = {\n\tid = replprobe.1\n\ttitle = replprobe.1.t\n\tdesc = replprobe.1.d\n\toption = { name = replprobe.1.a }\n}\n");

const PORT = 52961;
(async () => {
  let srv = null;
  try {
    srv = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
    const get = (u) => fetch(`http://127.0.0.1:${PORT}${u}`).then((r) => r.json()).catch((e) => ({ error: String(e) }));
    const A = encodeURIComponent(ADDON);
    const B = encodeURIComponent(BASE);
    const evIds = (j) => ((j && j.events) || []).map((e) => e.fullId || e.id);
    const decIds = (j) => (((j && j.categories) || []).flatMap((c) => c.decisions || [])).map((d) => d.id);

    console.log("\n[CONTROL] the fixture's base mod really does define content");
    {
      // ⚠️ If this fails, every count below is measuring an empty folder and the whole test is vacuous.
      const ev = evIds(await get(`/api/events/list?modPath=${B}`));
      const de = decIds(await get(`/api/decisions/list?modPath=${B}`));
      console.log(`     the base mod alone: ${ev.length} events, ${de.length} decisions`);
      rec("the base mod's events parse when it IS the mod", ev.includes("baseprobe.1") && ev.includes("baseprobe.2"), ev.slice(0, 6));
      rec("…and its decisions too", de.includes("baseprobe_decision_one"), de.slice(0, 6));
    }

    console.log("\n[the editor sidebar] must keep showing the mod's OWN content and nothing else");
    {
      const ev = evIds(await get(`/api/events/list?modPath=${A}`));
      const de = decIds(await get(`/api/decisions/list?modPath=${A}`));
      console.log(`     default: ${ev.length} events ${JSON.stringify(ev)}, ${de.length} decisions`);
      rec("the add-on's own event is listed", ev.includes("ownprobe.1"), ev);
      rec("…and the base mod's are NOT", !ev.includes("baseprobe.1"), ev);
      rec("…same for decisions", de.includes("ownprobe_decision") && !de.includes("baseprobe_decision_one"), de);
    }

    console.log("\n[the picker] includeInherited=1 must offer everything the mod can reference");
    {
      const j = await get(`/api/events/list?modPath=${A}&includeInherited=1`);
      const ev = evIds(j);
      console.log(`     inherited: ${ev.length} events (base-mod ids present: ${ev.filter((x) => /^baseprobe\./.test(x)).join(", ") || "none"})`);
      rec("the add-on's own event is still there", ev.includes("ownprobe.1"), ev.slice(0, 8));
      rec("…and the base mod's two are now offered", ev.includes("baseprobe.1") && ev.includes("baseprobe.2"), ev.slice(0, 8));
      rec("…with no duplicate ids", new Set(ev).size === ev.length, ev.length - new Set(ev).size);

      const jd = await get(`/api/decisions/list?modPath=${A}&includeInherited=1`);
      const de = decIds(jd);
      console.log(`     inherited: ${de.length} decisions in ${((jd && jd.categories) || []).length} categories`);
      rec("the base mod's decisions are offered", de.includes("baseprobe_decision_one") && de.includes("baseprobe_decision_two"), de.slice(0, 8));
      rec("…and the add-on's own as well", de.includes("ownprobe_decision"), de.slice(0, 8));
    }

    console.log("\n[🈯 SAME PATH = REPLACEMENT] a mod file shadows the base mod's file of that name wholesale");
    {
      // HOI4 does not merge two files at the same relative path — the higher layer's copy is the only one
      // loaded. Listing both would offer an event that does not exist in the running game.
      const ev = evIds(await get(`/api/events/list?modPath=${A}&includeInherited=1`));
      rec("the add-on's copy of shadowed.txt wins", ev.includes("shadowed.99"), ev.filter((x) => /^shadowed\./.test(x)));
      rec("…and the base mod's shadowed event is gone", !ev.includes("shadowed.1"), ev.filter((x) => /^shadowed\./.test(x)));
    }

    console.log("\n[🈯 replace_path] offering an event the GAME will not load is its own bug");
    {
      // Millennium Dawn declares BOTH `replace_path = \"events\"` and `replace_path = \"common/decisions\"`,
      // so HOI4 loads none of vanilla's 9,205 events for an MD add-on. A picker that simply concatenated
      // every root would offer all 9,205 of them — references that compile fine and silently never fire.
      // Passing the sub-path to getActiveRoots is what buys this; it drops the game root for a chain that
      // replaces it. Measured on the real add-on: 9,341 offered = MD's 9,340 + the add-on's own 1.
      const before = ((await get(`/api/events/list?modPath=${A}&includeInherited=1`)).events) || [];
      const vanillaBefore = before.filter((e) => e.origin === "vanilla").length;
      console.log(`     without replace_path: ${before.length} events, ${vanillaBefore} of them vanilla's`);
      // ⚠️ ASSERT THE PRECONDITION. With no HOI4 install there are no vanilla events to exclude, the
      // "excluded" check passes for the wrong reason, and a vacuous pass reads exactly like a real one.
      rec("the game's own events are visible to begin with", vanillaBefore > 100,
        `only ${vanillaBefore} vanilla events — without them the exclusion below proves nothing`);

      // ⚠️ A SEPARATE MOD, not the same one edited. getModReplacePaths memoises per root for the life of the
      // process, so rewriting this add-on's descriptor mid-run changes nothing and the check would have
      // reported "replace_path is ignored" about a fixture that never re-read it. REPLADDON declares it from
      // the start, so it gets its own cache entry.
      const after = ((await get(`/api/events/list?modPath=${encodeURIComponent(REPLADDON)}&includeInherited=1`)).events) || [];
      const vanillaAfter = after.filter((e) => e.origin === "vanilla").length;
      console.log(`     with replace_path="events": ${after.length} events, ${vanillaAfter} of them vanilla's`);
      rec("declaring replace_path drops the game's events", vanillaAfter === 0, `${vanillaAfter} still offered`);
      rec("…while the mod's own survive", after.some((e) => (e.fullId || e.id) === "replprobe.1"), after.length);
      // ✅ CHANGED 2026-09-06. This asserted the opposite — "…and the base mod's, which replace_path does
      // NOT drop" — and the rule in its name was wrong. replace_path unloads "every previously-loaded file"
      // in that folder, from ALL sources loaded before it, not just the base game; and `dependencies` is
      // exactly what "forc[es] this mod to be loaded after every mod listed in this attribute". So an add-on
      // that declares replace_path="events" ITSELF loads after its base mod and unloads its events too.
      // Offering them is the same bug as offering vanilla's, one layer up.
      //
      // ⚠️ Only when the ACTIVE mod declares it. A DEPENDENCY's replace_path vs a SIBLING dependency is
      // launcher playset order, which no descriptor records, and Nova keeps the superset there on purpose.
      // test-a-mod-that-replaces-a-folder-hides-its-dependencies-too.js pins both directions.
      //
      // The control is `before` above: the same base mod, an add-on that declares nothing, and its events
      // are offered. Without that, "not offered" could just mean the base mod never reached the picker.
      rec("control: the base mod's events reach an add-on that replaces nothing",
        before.some((e) => (e.fullId || e.id) === "baseprobe.1"), before.length);
      rec("…and the mod's OWN replace_path drops them too, not just vanilla's",
        !after.some((e) => (e.fullId || e.id) === "baseprobe.1"), after.filter((e) => (e.fullId || e.id) === "baseprobe.1"));
    }

    console.log("\n[origin] the picker has to be able to say where an entry came from");
    {
      const evs = ((await get(`/api/events/list?modPath=${A}&includeInherited=1`)).events) || [];
      const own = evs.find((e) => (e.fullId || e.id) === "ownprobe.1");
      const inh = evs.find((e) => (e.fullId || e.id) === "baseprobe.1");
      console.log(`     own.origin=${own && own.origin}   inherited.origin=${inh && inh.origin}`);
      rec("the mod's own entries are marked as its own", own && own.origin === "mod", own);
      rec("…and inherited ones are marked otherwise", inh && inh.origin && inh.origin !== "mod", inh);
    }

    console.log("\n[the clients] the pickers ask for it and the editor sidebars do not");
    {
      // Derived by reading the files: the editor list is the call that feeds the page's own sidebar, the
      // picker calls are the ones inside the effect/target choosers.
      const want = [
        ["app.js", "/api/events/list", true], ["app.js", "/api/decisions/list", true],
        ["decisions.js", "/api/events/list", null], ["events.js", "/api/decisions/list", true],
      ];
      const report = [];
      for (const f of ["app.js", "decisions.js", "events.js"]) {
        const s = stripJsComments(fs.readFileSync(path.join(PUB, f), "utf8"));
        // ⚠️ Do NOT truncate before matching. Slicing to 78 chars for display cut `&includeInherited=1`
        // off the longer call sites, and the check then reported the pages it had just been shown as
        // fixed. Keep the full string for the assertion; shorten only when printing.
        for (const m of s.matchAll(/\/api\/(?:events|decisions)\/list\?[^`"']*/g)) report.push(`${f}: ${m[0]}`);
      }
      console.log("     " + report.map((r) => r.slice(0, 96)).join("\n     "));
      const inherited = report.filter((r) => /includeInherited=1/.test(r));
      const plain = report.filter((r) => !/includeInherited=1/.test(r));
      rec("the call sites were found at all", report.length >= 6, report.length);
      // Six pickers ask for inherited content; the two editor sidebars (decisions.js and events.js each
      // loading their own page's list) do not.
      rec("six picker call sites ask for inherited content", inherited.length === 6, inherited);
      rec("…and exactly the two editor sidebars do not", plain.length === 2, plain);
    }

    console.log(`\n=== picker sees inherited events: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
