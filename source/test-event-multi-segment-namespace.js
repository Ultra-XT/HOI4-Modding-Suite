// #event-multi-segment-namespace — OPENING ONE OF THESE EVENTS AND PRESSING SAVE DELETED IT.
//
// 🈯 HOI4's rule, which Nova's own comment at public/events.js:1734 already states: an event id is
// `<namespace>.<integer>`, and everything after the LAST dot is converted to an integer. The namespace may
// itself contain dots — vanilla ships `add_namespace = MUN_czech.news`, Millennium Dawn ships
// `israel.coalition`, The Road to 56 ships 39 of them.
//
// Measured across vanilla + every installed workshop mod — the numbers the [ground truth] block below
// PRINTS on this machine: 1,977 distinct `add_namespace` tokens, 54 of which contain a dot, and 611 event
// ids that are therefore multi-segment. (An earlier version of this header said 1,985 and 756 with a
// per-mod breakdown that summed to neither; the run is the authority, not the prose. The counts move with
// whatever mods are installed, which is why the assertions below are thresholds and not equalities.)
//
// Nova split on the FIRST dot in three places, so `israel.coalition.5` was read as namespace `israel`, id
// `coalition`:
//   · public/events.js:616 — the click handler filled the two boxes with parts[0] / parts[1];
//   · public/events.js:79  — cleanEventNamespace replaced every dot with an underscore;
//   · server.js:11620      — the namespace guard refused anything containing a dot outright.
// Pressing Save then posted `previousEventId = israel.coalition.5` with namespace `israel`, id `1` — so the
// server REMOVED the real event and wrote a differently-named one, leaving every
// `country_event = { id = israel.coalition.5 }` in the mod dangling.
//
// The correct split is already in this file: uniqueEventLocalId (public/events.js:1732) uses the greedy
// /^(.+)\.(\d+)$/, and splitAiEventId (public/events.js:99) takes parts[parts.length - 1].
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-evns-"));
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
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
const toPosix = (p) => p.split(path.sep).join("/");

const MOD = path.join(ROOT, "evmod");
fs.mkdirSync(path.join(MOD, "events"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="EvMod"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "evmod.mod"), 'name="EvMod"\npath="' + toPosix(MOD) + '"\nsupported_version="1.19.*"\n');

const EV_ABS = path.join(MOD, "events", "israel.coalition.txt");
const seed = () => fs.writeFileSync(EV_ABS, [
  "add_namespace = israel.coalition",
  "",
  "country_event = {",
  "\tid = israel.coalition.5",
  "\ttitle = israel.coalition.5.t",
  "\tdesc = israel.coalition.5.d",
  "\tis_triggered_only = yes",
  "\toption = { name = israel.coalition.5.a }",
  "}",
  "",
  "country_event = {",
  "\tid = israel.coalition.6",
  "\ttitle = israel.coalition.6.t",
  "\tdesc = israel.coalition.6.d",
  "\tis_triggered_only = yes",
  "\toption = { name = israel.coalition.6.a }",
  "}",
  "",
].join("\n"), "utf8");

let PORT = 51930;
(async () => {
  let srv = null;
  try {
    srv = await new Promise((r) => { const s = createApp().listen(++PORT, () => r(s)); });
    const B = `http://127.0.0.1:${PORT}`;
    const get = (u) => fetch(B + u).then(async (r) => ({ s: r.status, b: await r.json().catch(() => null) })).catch((e) => ({ s: 0, b: { error: String(e) } }));
    const save = (body) => fetch(`${B}/api/events/save`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => null) })).catch((e) => ({ s: 0, b: { error: String(e) } }));

    console.log("\n[ground truth] a namespace may contain dots, and hundreds of real events rely on it");
    {
      const roots = [GAME];
      try { for (const d of fs.readdirSync(WS)) roots.push(path.join(WS, d)); } catch (_) {}
      const ns = new Set();
      let dottedIds = 0;
      for (const root of roots) {
        const dir = path.join(root, "events");
        let files = []; try { files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".txt")); } catch (_) { continue; }
        for (const f of files) {
          let t = ""; try { t = fs.readFileSync(path.join(dir, f), "latin1").replace(/#[^\n]*/g, ""); } catch (_) { continue; }
          for (const m of t.matchAll(/(?:^|\n)\s*add_namespace\s*=\s*([^\s{}#]+)/g)) ns.add(m[1]);
          for (const m of t.matchAll(/(?:^|\n)\s*id\s*=\s*([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+){2,})\s*(?:\n|$)/g)) dottedIds++;
        }
      }
      if (!ns.size) console.log("     (no HOI4 corpus — skipped)");
      else {
        const dotted = [...ns].filter((n) => n.includes("."));
        const SHAPE = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)*$/;
        const offenders = [...ns].filter((n) => !SHAPE.test(n));
        console.log(`     ${ns.size} distinct namespaces · ${dotted.length} contain a dot · ${dottedIds} multi-segment event ids`);
        console.log(`     e.g. ${dotted.slice(0, 4).join(", ")}`);
        rec("dotted namespaces are real, and not rare", dotted.length >= 20, dotted.length);
        rec("…and hundreds of events sit under one", dottedIds >= 200, dottedIds);
        // The shape Nova should accept matches everything legal and still rejects the digit-first outlier.
        console.log(`     not matching the accepted shape: ${offenders.length}${offenders.length ? " -> " + offenders.join(", ") : ""}`);
        rec("the accepted shape covers every real namespace but the digit-first one",
          offenders.length <= 1 && offenders.every((o) => /^\d/.test(o)), offenders);
      }
    }

    console.log("\n[the defect] saving a multi-segment event must not delete it");
    {
      seed();
      const list = await get(`/api/events/list?modPath=${encodeURIComponent(MOD)}`);
      const ids = ((list.b && (list.b.events || list.b.items || list.b)) || []).map((e) => e.fullId || e.id).filter(Boolean);
      console.log(`     Nova lists: ${JSON.stringify(ids)}`);
      rec("Nova reads the event with its full id", ids.includes("israel.coalition.5"), ids);

      // ⭐ The payload the real client builds: namespace box + id box + previousEventId. With the split fixed
      // these are "israel.coalition" and "5", so previousEventId is omitted (nothing was renamed).
      const r = await save({
        modPath: MOD, namespace: "israel.coalition", id: "5", type: "country_event",
        title: "Coalition Talks", description: "d", picture: "", triggeredOnly: true, hidden: false,
        fireOnce: false, major: false, mtthDays: "", trigger: "", immediate: "", after: "", timeoutDays: "",
        options: [{ name: "OK" }],
      });
      rec("the save is accepted", r.s < 400 && r.b && !r.b.error, r);

      const after = fs.existsSync(EV_ABS) ? fs.readFileSync(EV_ABS, "utf8") : "";
      rec("the event is STILL THERE under its real id", /id\s*=\s*israel\.coalition\.5\b/.test(after), after.slice(0, 400));
      rec("…and its neighbour was not disturbed", /id\s*=\s*israel\.coalition\.6\b/.test(after), after.slice(0, 400));
      rec("…and no differently-named copy was written", !/(?:^|\n)\s*id\s*=\s*israel\.1\b/.test(after), after.slice(0, 400));
      rec("…and the namespace declaration survived", /add_namespace\s*=\s*israel\.coalition\b/.test(after), after.slice(0, 200));
    }

    console.log("\n[the client] splits on the LAST dot, like its two siblings already do");
    {
      const src = fs.readFileSync(path.join(__dirname, "public", "events.js"), "utf8");
      // ⚠️ EVALUATE THE SPLIT, DO NOT GREP FOR IT. This first checked that the old `parts[0]` spelling was
      // gone, which a wrong-but-differently-spelled split also satisfies — backing the greedy `(.+)` out to
      // `([^.]+)` left this check green. Pull the regex out of the shipped file and run it.
      const m = /const idSplit = (\/\^.*?\/)\.exec\(String\(evt\.fullId/.exec(src);
      rec("the click handler's split is findable", !!m, "idSplit expression not found");
      if (m) {
        // eslint-disable-next-line no-new-func
        const re = Function(`return ${m[1]};`)();
        const got = re.exec("israel.coalition.5");
        console.log(`     "israel.coalition.5" splits to namespace=${JSON.stringify(got && got[1])} id=${JSON.stringify(got && got[2])}`);
        rec("…and it takes everything before the LAST dot as the namespace",
          got && got[1] === "israel.coalition" && got[2] === "5", got && [got[1], got[2]]);
        const plain = re.exec("plain_events.1");
        rec("…while a single-segment id is unaffected",
          plain && plain[1] === "plain_events" && plain[2] === "1", plain && [plain[1], plain[2]]);
      }
      rec("…and cleanEventNamespace keeps interior dots",
        /replace\(\/\[\^A-Za-z0-9_\.\]\+\/g, "_"\)/.test(src) || /\[\^A-Za-z0-9_.\]/.test(src), "still replacing dots with underscores");
    }

    console.log("\n[the Save button's own normaliser] splitAiEventId must not rewrite the namespace");
    {
      // ⚠️ THE PATH THIS TEST ORIGINALLY MISSED. Both the Save and the Delete handlers push the two boxes
      // through splitAiEventId before sending, and the AI-import path uses it too. It splits a dotted id and
      // REJOINS the namespace segments — with an underscore, so pasting the full `israel.coalition.5` into
      // the id box produced the namespace `israel_coalition`: a different namespace, a different file, and a
      // silently different event. The endpoint checks above could never see this, because they send the
      // already-split values.
      const src = fs.readFileSync(path.join(__dirname, "public", "events.js"), "utf8");
      const grab = (name) => {
        const s = src.indexOf("function " + name + "(");
        if (s === -1) return "";
        const o = src.indexOf("{", s);
        let d = 0, e = -1;
        for (let k = o; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) { e = k; break; } } }
        return e === -1 ? "" : src.slice(s, e + 1);
      };
      const fnSrc = [grab("cleanEventNamespace"), grab("cleanScriptId"), grab("splitAiEventId")].join("\n\n");
      rec("splitAiEventId is findable", /function splitAiEventId/.test(fnSrc), "not found");
      if (/function splitAiEventId/.test(fnSrc)) {
        const box = { console, String, Number, Boolean, Array, Object };
        const sb = new Proxy(box, { has: () => true, get: (t, k) => (k in t ? t[k] : undefined), set: (t, k, v) => { t[k] = v; return true; } });
        require("vm").runInNewContext(fnSrc + "\n; __f = splitAiEventId;", sb);
        const cases = [
          ["israel.coalition", "5", "israel.coalition", "5"],
          ["israel.coalition", "israel.coalition.5", "israel.coalition", "5"],
          ["MUN_czech.news", "1", "MUN_czech.news", "1"],
          ["plain_events", "7", "plain_events", "7"],
        ];
        for (const [ns, id, wantNs, wantId] of cases) {
          let got = null;
          try { got = box.__f(ns, id); } catch (e) { got = { THREW: e.message }; }
          console.log(`     (${JSON.stringify(ns)}, ${JSON.stringify(id)}) -> ${JSON.stringify(got)}`);
          rec(`${ns} + ${id} keeps its namespace`, got && got.namespace === wantNs && got.id === wantId, { got, wantNs, wantId });
        }
      }
    }

    console.log("\n[CONTROL] the guard still refuses what HOI4 really cannot load");
    {
      // Widening must not become removing. Each of these is refused for a reason that still applies.
      const bad = [
        ["1933_spain", "5", "a namespace starting with a digit"],
        [".leading", "5", "a leading dot"],
        ["trailing.", "5", "a trailing dot"],
        ["double..dot", "5", "an empty segment"],
        ["has space", "5", "a space"],
        ["israel.coalition", "notanumber", "a non-integer id"],
      ];
      for (const [ns, id, why] of bad) {
        const r = await save({
          modPath: MOD, namespace: ns, id, type: "country_event", title: "t", description: "d",
          picture: "", triggeredOnly: true, hidden: false, fireOnce: false, major: false,
          mtthDays: "", trigger: "", immediate: "", after: "", timeoutDays: "", options: [{ name: "OK" }],
        });
        rec(`CONTROL: ${why} is refused`, r.s >= 400 || !!(r.b && r.b.error), { ns, id, r: r.b });
      }
    }

    console.log("\n[CONTROL] an ordinary single-segment namespace still works");
    {
      const r = await save({
        modPath: MOD, namespace: "plain_events", id: "1", type: "country_event", title: "t", description: "d",
        picture: "", triggeredOnly: true, hidden: false, fireOnce: false, major: false,
        mtthDays: "", trigger: "", immediate: "", after: "", timeoutDays: "", options: [{ name: "OK" }],
      });
      rec("a plain namespace saves", r.s < 400 && r.b && !r.b.error, r);
      const p = path.join(MOD, "events", "plain_events.txt");
      rec("…into its own file", fs.existsSync(p) && /id\s*=\s*plain_events\.1\b/.test(fs.readFileSync(p, "utf8")), p);
    }

    srv.closeAllConnections(); srv.close(); srv = null;
    console.log(`\n=== event multi-segment namespace: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (srv) { srv.closeAllConnections(); srv.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
