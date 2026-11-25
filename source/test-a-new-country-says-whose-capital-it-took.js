// ⛔ #new-country-steals-a-capital-in-silence — THE WARNING WAS WRITTEN, WIRED, AND NEVER PRODUCED.
//
// Draw a new country over another country's CAPITAL state and that country is left pointing `capital = N` at
// land it no longer owns. HOI4 crashes the moment it is selected. Nova has a validator rule for it
// (capital_state_owned_by_other, one of the twelve fatal ones), and /api/map/set-owner and
// /api/map/set-capital both return a `capitalWarning` saying so.
//
// /api/map/create-country appeared to have adopted it — the code was there, with a comment explaining that
// the two sibling endpoints warn and this one had not. THREE separate faults meant it never reached anyone:
//
//   1. ⭐ COMPUTED AFTER THE WRITE. capitalTransferWarning reads the PREVIOUS owner off disk and returns ""
//      when it already equals the new tag. Its own comment says "computed BEFORE the write (both call
//      sites)" — and this third call site ran it after createCountry had written the new owner, so it
//      compared ZQ1 against ZQ1 and returned "" every time. Measured against a real install: drawing a
//      country over vanilla's state 16 (France's Paris — "FRA - France.txt" opens `capital = 16`) answered
//      ok:true with no capitalWarning key in the response at all.
//
//   2. THE CLIENT NEVER READ IT. The server comment said the map page's existing writeWarnings channel
//      would surface it "with no client change". writeWarnings lives inside the Save loop; this is an
//      immediate POST. Country Setup's create — the sibling endpoint, the same helper, the same response
//      key — nbAlerts it. The map page printed "✨ Created ZQ1 “Probeland” — 1 state, capital state 16."
//
//   3. FIRST-WINS OVER A MULTI-STATE CLAIM. It stopped at the first state that produced any message, and
//      the helper also emits a benign "only a territory change" note. A claim is normally dozens of states
//      with the capital somewhere in the middle, so the benign note for state #1 won and the capital taken
//      at state #17 was never mentioned. A claim drawn across a border takes two capitals; one was named.
//
// ⚠️ The benign note is right for the SIBLINGS and must survive: set-owner moves one state at a time, where
// "FRA loses this state but keeps its capital" is worth saying. Only the many-states-at-once caller opts out.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-capsteal-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");
// maskJsComments, not strip: it blanks comments length-preservingly, so the indexOf ordering below still
// compares real source positions.
const { maskJsComments: strip } = require("./testlib-strip-comments.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond === true) console.log("  ok   " + label);
  else { fails.push(label); console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)); }
}

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const toPosix = (p) => p.split(path.sep).join("/");
let seq = 0;
function mkMod() {
  const n = "CAPS" + ++seq;
  const dir = path.join(ROOT, "m" + seq);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), 'name="' + n + '"\nsupported_version="1.19.*"\n');
  fs.writeFileSync(path.join(ROOT, "m" + seq + ".mod"),
    'name="' + n + '"\npath="' + toPosix(dir) + '"\nsupported_version="1.19.*"\n');
  return dir;
}

let PORT = 53711;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(PORT, () => resolve({
      post: (p, b) => fetch("http://127.0.0.1:" + PORT + p, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b),
      }).then((r) => r.json()).catch((e) => ({ error: String(e) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}

// Read the base game the way the endpoint will: which states are somebody's capital, who owns them, and how
// much land that owner keeps. DERIVED, never typed in — a hand-written "state 16 is France" ages badly, and
// a country that owns nothing cannot be selected, so its dangling capital is NOT a crash.
function surveyVanilla() {
  const out = { realCaps: [], filler: [] };
  const cdir = path.join(GAME, "history", "countries"), sdir = path.join(GAME, "history", "states");
  if (!fs.existsSync(cdir) || !fs.existsSync(sdir)) return null;
  // ⚠️ utf8, not latin1. Vanilla's country files carry a UTF-8 BOM, and `capital = 10` is the FIRST line of
  // "POL - Poland.txt" — read as latin1 the BOM becomes three visible characters and `^\s*capital` misses,
  // so a latin1 survey quietly reports Warsaw as ordinary territory and then blames the fix for warning
  // about it. Read as utf8 the BOM is U+FEFF, which JavaScript's `\s` does match. The server reads utf8.
  const capOf = new Map();
  for (const f of fs.readdirSync(cdir)) {
    const m = /^\s*capital\s*=\s*(\d+)/m.exec(fs.readFileSync(path.join(cdir, f), "utf8"));
    if (m) capOf.set(f.slice(0, 3).toUpperCase(), Number(m[1]));
  }
  const ownerOf = new Map(), owned = new Map();
  for (const f of fs.readdirSync(sdir)) {
    if (!f.endsWith(".txt")) continue;
    const src = fs.readFileSync(path.join(sdir, f), "latin1");
    const id = Number((/(?:^|\n)\s*id\s*=\s*(\d+)/.exec(src) || [])[1]);
    const ow = (/\bowner\s*=\s*([A-Z0-9]{3})\b/.exec(src) || [])[1];
    if (Number.isFinite(id) && ow) { ownerOf.set(id, ow); owned.set(ow, (owned.get(ow) || 0) + 1); }
  }
  for (const [tag, sid] of capOf) {
    if (ownerOf.get(sid) === tag && (owned.get(tag) || 0) > 1 && out.realCaps.length < 2) out.realCaps.push({ tag, sid });
  }
  for (const [sid, ow] of ownerOf) {
    if (capOf.get(ow) !== sid && (owned.get(ow) || 0) > 3 && out.filler.length < 4) out.filler.push(sid);
  }
  return (out.realCaps.length >= 2 && out.filler.length >= 4) ? out : null;
}

(async () => {
  let api = null;
  try {
    console.log("\n[the seam] the server computes it and the client reads it");
    {
      const SRV = strip(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));
      const h = SRV.indexOf("/api/map/create-country");
      const end = SRV.indexOf("/api/map/move-state-supplyarea", h);
      const body = h > 0 && end > h ? SRV.slice(h, end) : "";
      rec("the create-country handler was found", body.length > 0, body.length);
      // ⭐ The ordering IS the bug. Comments are masked first — this file's own prose says "before the
      // write" more than once, and an unmasked search would match my explanation instead of the code.
      const warnAt = body.indexOf("capitalTransferWarning(");
      const writeAt = body.indexOf("mapData.createCountry(");
      rec("⭐ the warning is computed BEFORE createCountry writes the new owner",
        warnAt > 0 && writeAt > 0 && warnAt < writeAt, { warnAt, writeAt });

      const MAP = strip(fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8"));
      const s = MAP.indexOf("/api/map/create-country");
      // (to the handler's own catch, not a fixed 2,600 characters: the states it could not take, said in the same alert, pushed the alert
      // past that window, B2-26, 2026-11-19)
      const segEnd = s > 0 ? MAP.indexOf('.catch((e) => setStatus("✨ Create failed: "', s) : -1;
      const seg = s > 0 ? MAP.slice(s, segEnd > s ? segEnd : s + 2600) : "";
      rec("the map page reads capitalWarning off the create response", /res\.capitalWarning/.test(seg));
      rec("…and puts it in front of the user rather than a status line the reload overwrites",
        /nbAlert\(/.test(seg.slice(seg.indexOf("res.capitalWarning"))), seg.slice(0, 120));
    }

    const V = surveyVanilla();
    if (!V) {
      console.log("\n  (no HOI4 install, or no two capital-owning countries found — the writing half cannot run)");
    } else {
      api = await serve(createApp());
      console.log("\n[drawing over ONE capital] " + JSON.stringify(V.realCaps[0]));
      {
        const mod = mkMod();
        const r = await api.post("/api/map/create-country", {
          modPath: mod, tag: "ZC1", name: "Onecap", rgb: [200, 40, 90],
          stateIds: [V.realCaps[0].sid], capitalStateId: V.realCaps[0].sid,
        });
        rec("the create still succeeds — this is a warning, not a refusal", r && r.ok === true, r && r.error);
        rec("⭐ …and the response carries capitalWarning, which it did not before",
          !!(r && r.capitalWarning), Object.keys(r || {}).join(","));
        rec("…naming the country whose capital was taken",
          !!(r && r.capitalWarning && r.capitalWarning.indexOf(V.realCaps[0].tag) !== -1), r && r.capitalWarning);
        // Moved with #a-map-message-matches-what-the-engine-checks: HOI4 refuses a capital the country does not own and
        // logs it, then plays on. The crash on selection was never isolated, and Millennium Dawn, Novum Vexillum and
        // Rise of Nations ship ten such countries between them and launch.
        rec("…and saying the game refuses that capital, without promising a crash",
          !!(r && r.capitalWarning && /refuses/i.test(r.capitalWarning) && !/crash/i.test(r.capitalWarning)), r && r.capitalWarning);
      }

      console.log("\n[a claim across a border] capitals LAST, four non-capital states first");
      {
        const mod = mkMod();
        const claim = V.filler.concat(V.realCaps.map((c) => c.sid));
        const r = await api.post("/api/map/create-country", {
          modPath: mod, tag: "ZC2", name: "Twoflower", rgb: [30, 160, 200],
          stateIds: claim, capitalStateId: claim[0],
        });
        const ws = (r && r.capitalWarnings) || [];
        rec("⭐ BOTH capitals are named — first-wins reported one and stopped",
          V.realCaps.every((c) => ws.some((w) => w.indexOf(c.tag) !== -1)), ws);
        rec("⭐ …and the capitals were found even though four other states came first in the claim",
          ws.length === V.realCaps.length, { got: ws.length, want: V.realCaps.length });
        rec("no benign “only a territory change” note leaks into a many-state claim",
          ws.every((w) => !/only a territory change/.test(w)), ws);
      }

      console.log("\n[the control] a claim that takes NO capital says nothing");
      {
        const mod = mkMod();
        const r = await api.post("/api/map/create-country", {
          modPath: mod, tag: "ZC3", name: "Quietland", rgb: [90, 90, 90],
          stateIds: V.filler.slice(), capitalStateId: V.filler[0],
        });
        rec("a country drawn over ordinary territory raises no capital warning",
          r && r.ok === true && !r.capitalWarning, r && r.capitalWarning);
      }

      console.log("\n[⚠️ the siblings keep theirs] set-owner is one state at a time");
      {
        const mod = mkMod();
        const r = await api.post("/api/map/set-owner", { modPath: mod, stateId: V.filler[0], owner: "ZC4" });
        rec("set-owner still says who lost the state and that they keep their capital",
          !!(r && r.ok && r.capitalWarning && /only a territory change/.test(r.capitalWarning)), r && r.capitalWarning);
      }
      {
        const mod = mkMod();
        const r = await api.post("/api/map/set-owner", { modPath: mod, stateId: V.realCaps[0].sid, owner: "ZC5" });
        rec("…and still shouts when the single state it moves IS a capital",
          !!(r && r.ok && r.capitalWarning && /CAPITAL/.test(r.capitalWarning)), r && r.capitalWarning);
      }
    }
  } finally {
    if (api) api.stop();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }

  console.log(`\n=== a new country says whose capital it took: ${checks} checks, ${fails.length} failed ===`);
  fails.forEach((f) => console.log("   FAILED: " + f));
  process.exit(fails.length ? 1 : 0);
})();
