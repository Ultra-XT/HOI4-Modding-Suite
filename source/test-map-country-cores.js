// #map-created-country-cores-nothing — IT OWNED ITS LAND AND HAD NO CLAIM TO ANY OF IT.
//
// /api/map/create-country walked the claimed states calling writeStateOwner, which sets `owner` and nothing
// else. So a country drawn on the Map — the route Nova recommends to anyone who does not know a state id —
// owned every state it was given, capital included, and cored none of them.
//
// That is not tidiness. HOI4 gives an owner almost no manpower from a non-core state, runs it through the
// occupation/resistance system, and will not raise its units there. A country whose entire territory is
// uncored cannot function.
//
// 🈯 GROUND TRUTH, counted on vanilla's history/states: of 1,081 states that declare an owner, 844 (78%) are
// cored by that same owner. The 237 that are not are colonial possessions — Bahrain under ENG, Trung Bo
// under FRA, Kalat under RAJ — which is not what someone drawing a new country is making.
//
// The asymmetry is the familiar one: Country Setup's creator has always cored the capital state it takes.
// This creator never adopted it.
//
// ⚠️ ADDITIVE. The core is appended, never substituted: a state France cored and this country now owns keeps
// France's core, because that is what a contested border looks like in the game's own files — and because
// deleting someone else's claim is not this endpoint's business. The control for that is below.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-cores-"));
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

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const toPosix = (p) => p.split(path.sep).join("/");
let seq = 0;
function mkMod() {
  const dir = path.join(ROOT, "m" + ++seq);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), 'name="C' + seq + '"\nsupported_version="1.19.*"\n');
  fs.writeFileSync(path.join(ROOT, "m" + seq + ".mod"),
    'name="C' + seq + '"\npath="' + toPosix(dir) + '"\nsupported_version="1.19.*"\n');
  return dir;
}
const stateFiles = (mod) => {
  const d = path.join(mod, "history", "states");
  try { return fs.readdirSync(d).map((f) => ({ f, t: fs.readFileSync(path.join(d, f), "utf8") })); }
  catch (_) { return []; }
};
const coresIn = (t) => [...t.matchAll(/add_core_of\s*=\s*([A-Za-z0-9_]+)/g)].map((m) => m[1].toUpperCase());
const ownerIn = (t) => (/owner\s*=\s*([A-Za-z0-9_]+)/.exec(t) || [, ""])[1].toUpperCase();

let PORT = 50840;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      post: (p, b) => fetch("http://127.0.0.1:" + PORT + p, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b),
      }).then((r) => r.json()).catch((e) => ({ error: String(e) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}

(async () => {
  let api = null;
  try {
    console.log("\n[ground truth] a homeland is cored; the exceptions are colonies");
    {
      const dir = path.join(GAME, "history", "states");
      if (!fs.existsSync(dir)) console.log("     (no HOI4 install — skipped)");
      else {
        let owned = 0, self = 0;
        for (const f of fs.readdirSync(dir)) {
          if (!f.endsWith(".txt")) continue;
          const t = fs.readFileSync(path.join(dir, f), "latin1").replace(/#.*$/gm, "");
          const o = ownerIn(t);
          if (!o) continue;
          owned++;
          if (coresIn(t).includes(o)) self++;
        }
        console.log(`     vanilla: ${owned} owned states, ${self} cored by their own owner (${Math.round(self / owned * 100)}%)`);
        rec("most of vanilla's owned states are cored by their owner", owned > 500 && self / owned > 0.7, { owned, self });
      }
    }

    const states = (() => {
      const dir = path.join(GAME, "history", "states");
      if (!fs.existsSync(dir)) return [];
      const ids = [];
      for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".txt")).slice(0, 60)) {
        const m = /(?:^|\n)\s*id\s*=\s*(\d+)/.exec(fs.readFileSync(path.join(dir, f), "latin1"));
        if (m) ids.push(Number(m[1]));
        if (ids.length >= 3) break;
      }
      return ids;
    })();
    if (states.length < 3) {
      console.log("\n  (no HOI4 install — the writing half cannot run)");
      console.log(`\n=== map country cores: ${checks} checks, ${fails.length} failed ===`);
      if (fails.length) process.exitCode = 1;
      return;
    }

    api = await serve(createApp());

    console.log("\n[a country drawn on the Map] cores every state it was given");
    {
      const mod = mkMod();
      const r = await api.post("/api/map/create-country", {
        modPath: mod, tag: "CRA", name: "Coreland", rgb: [20, 90, 160],
        stateIds: states, capitalStateId: states[0],
      });
      rec("the country is created", r.ok === true, r);
      rec("…owning every claimed state", r.owned === states.length, { owned: r.owned, claimed: states.length });
      const files = stateFiles(mod);
      rec("…and a state file was written for each", files.length === states.length, files.map((x) => x.f));
      const ownedByUs = files.filter((x) => ownerIn(x.t) === "CRA");
      rec("…all owned by the new tag", ownedByUs.length === states.length, ownedByUs.length);
      const coredByUs = files.filter((x) => coresIn(x.t).includes("CRA"));
      rec("…and ALL of them cored by it — this is the bug", coredByUs.length === states.length,
        { cored: coredByUs.length, of: states.length, sample: files[0] && files[0].t.slice(0, 260) });
      const capFile = files.find((x) => /(?:^|\n)\s*id\s*=\s*(\d+)/.test(x.t) && new RegExp("id\\s*=\\s*" + states[0] + "\\b").test(x.t));
      rec("…including the capital state", !capFile || coresIn(capFile.t).includes("CRA"), capFile && capFile.t.slice(0, 260));
      rec("…and the reply says how many it cored", r.cored === states.length, r.cored);
    }

    console.log("\n[⚠️ CONTROL — someone else's core is not ours to delete]");
    {
      // A state its previous owner cored keeps that core. Overwriting it would be Nova deciding a political
      // claim on the author's behalf, and vanilla itself ships states cored by more than one country.
      const mod = mkMod();
      const dir = path.join(mod, "history", "states");
      fs.mkdirSync(dir, { recursive: true });
      const sid = states[0];
      fs.writeFileSync(path.join(dir, sid + "-Pre.txt"),
        `state = {\n\tid = ${sid}\n\tname = "STATE_${sid}"\n\tmanpower = 100\n\tprovinces = { 1 }\n\thistory = {\n\t\towner = FRA\n\t\tadd_core_of = FRA\n\t}\n}\n`);
      const r = await api.post("/api/map/create-country", {
        modPath: mod, tag: "CRB", name: "Contested", rgb: [90, 20, 20],
        stateIds: [sid], capitalStateId: sid,
      });
      rec("the country is created", r.ok === true, r);
      const t = (stateFiles(mod).find((x) => x.f.startsWith(String(sid))) || { t: "" }).t;
      rec("…the new country owns it", ownerIn(t) === "CRB", t.slice(0, 240));
      rec("…and cores it", coresIn(t).includes("CRB"), t.slice(0, 240));
      rec("…WITHOUT deleting the previous owner's core", coresIn(t).includes("FRA"), t.slice(0, 240));
    }

    console.log("\n[CONTROL — idempotent] creating over a state already cored by that tag adds nothing twice");
    {
      const mod = mkMod();
      const dir = path.join(mod, "history", "states");
      fs.mkdirSync(dir, { recursive: true });
      const sid = states[0];
      fs.writeFileSync(path.join(dir, sid + "-Pre.txt"),
        `state = {\n\tid = ${sid}\n\tname = "STATE_${sid}"\n\tmanpower = 100\n\tprovinces = { 1 }\n\thistory = {\n\t\towner = CRC\n\t\tadd_core_of = CRC\n\t}\n}\n`);
      const r = await api.post("/api/map/create-country", {
        modPath: mod, tag: "CRC", name: "Already", rgb: [10, 10, 10],
        stateIds: [sid], capitalStateId: sid,
      });
      // The tag already exists in the mod's own state file but not as a COUNTRY, so the create still runs.
      const t = (stateFiles(mod).find((x) => x.f.startsWith(String(sid))) || { t: "" }).t;
      const n = coresIn(t).filter((c) => c === "CRC").length;
      rec("the core is not duplicated", n <= 1, { count: n, text: t.slice(0, 240), reply: r.ok });
    }

    api.stop(); api = null;
    console.log(`\n=== map country cores: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (api) api.stop(); } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
