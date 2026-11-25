// Generate land must name its states the way every shipping map names a state — and give them names.
// #generated-states-have-no-name
//
// generateLand wrote `name = "nova_gen_state_<id>"` into every state it made, and no localisation at all.
// Measured across the six maps that ship their own map/ (vanilla, Millennium Dawn, Road to 56, Old World Blues,
// Novum Vexillum, Rise of Nations): 7,495 states, 7,495 named STATE_<n>, 7,495 resolving to a localised name.
// The generator broke both halves at once — a shape no shipping state uses, under a key nothing defines — on
// the owner's own route to a map built from scratch (Delete map, then Generate land). At the shipped defaults on
// vanilla (35% of 3,133 sea provinces, 8 per state) that is 179 states, each labelled "nova_gen_state_1082" and
// so on in game. The shape also slipped past both of Nova's raw-key guards, which test ^STATE_\d+$.
//
// createState already writes STATE_<id>; generateLand now does too, and /api/map/generate-land localises every
// state it made.
//
// ⚠️ IN ONE WRITE. A rewrite of the names file per state is 179 backups from one click against a pool of 200 —
// the "Fix all" incident, which destroyed every real backup — and one file re-saved many times in a burst is the
// pattern behavioural antivirus has already frozen this machine over.
//
// ⚠️ A name the mod already defines for one of those keys is the modder's, and is kept.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 260)));
  if (!ok) fails.push(label);
};

// ⚠️ A plain constant, not process.env.NOVA_PORT — this test starts its own server.
const PORT = 54148;
const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nova-genname-"));
const APPDATA = path.join(tmp, "appdata");
const HOME = path.join(tmp, "home");
const HOI4_USER = path.join(tmp, "hoi4user");
fs.mkdirSync(APPDATA, { recursive: true });
fs.mkdirSync(HOME, { recursive: true });
fs.mkdirSync(path.join(HOI4_USER, "logs"), { recursive: true });
process.env.NOVA_HOME_DIR = HOME;
const md = require("./map-data.js");
const modIndex = require("./mod-index.js");

const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

// The top-level `name` of every state block in a text, braces and comments respected.
const topLevelNames = (text) => {
  const t = String(text).replace(/#[^\n\r]*/g, (m) => " ".repeat(m.length));
  const out = [];
  const re = /(?:^|[^A-Za-z0-9_])state\s*=\s*\{/g;
  let m;
  while ((m = re.exec(t))) {
    const open = t.indexOf("{", m.index);
    let d = 0, end = -1;
    for (let i = open; i < t.length; i++) { if (t[i] === "{") d++; else if (t[i] === "}") { d--; if (!d) { end = i; break; } } }
    if (end === -1) break;
    let flat = "", depth = 0;
    for (const ch of t.slice(open + 1, end)) {
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      flat += depth === 0 && ch !== "}" ? ch : " ";
    }
    re.lastIndex = end + 1;
    if (!/(?:^|[^A-Za-z0-9_])id\s*=\s*\d+/.test(flat)) continue;
    const n = /(?:^|[^A-Za-z0-9_])name\s*=\s*(?:"([^"\r\n]*)"|([A-Za-z0-9_.:-]+))/.exec(flat);
    const id = parseInt((/(?:^|[^A-Za-z0-9_])id\s*=\s*(\d+)/.exec(flat) || [])[1], 10);
    out.push({ id, name: n ? (n[1] !== undefined ? n[1] : n[2]) : "" });
  }
  return out;
};

// A 12-province all-sea canvas — the shape "Delete map" leaves behind — in FOUR strategic regions of three
// provinces. Generate land never puts two regions in one state, so this yields four states: enough that "one
// write" and "one write per state" cannot produce the same backup count.
function buildAllSeaMod(root) {
  mk(path.join(root, "descriptor.mod"), 'name="GenNames"\nsupported_version="1.19.*"\nreplace_path="history/states"\nreplace_path="map"\nreplace_path="map/strategicregions"\n');
  const rows = ["0;0;0;0;land;false;unknown;0;"];
  for (let i = 1; i <= 12; i++) rows.push(`${i};${i * 17 % 256};${i * 53 % 256};${i * 91 % 256};sea;false;ocean;0;`);
  mk(path.join(root, "map", "definition.csv"), rows.join("\r\n") + "\r\n");
  for (let r = 0; r < 4; r++) {
    const ids = [r * 3 + 1, r * 3 + 2, r * 3 + 3].join(" ");
    mk(path.join(root, "map", "strategicregions", `r${r + 1}.txt`), `strategic_region={\n\tid=${r + 1}\n\tname="REGION_${r + 1}"\n\tprovinces={ ${ids} }\n\tweather={}\n}\n`);
  }
  fs.mkdirSync(path.join(root, "history", "states"), { recursive: true });
}
const statesOnDisk = (root) => {
  const dir = path.join(root, "history", "states");
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".txt")) continue;
    for (const s of topLevelNames(fs.readFileSync(path.join(dir, f), "utf8"))) out.push(Object.assign({ file: f }, s));
  }
  return out.sort((a, b) => a.id - b.id);
};

const post = (url, body) => new Promise((resolve) => {
  const data = JSON.stringify(body);
  const req = http.request({ host: "127.0.0.1", port: PORT, path: url, method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } }, (res) => {
    let b = ""; res.on("data", (c) => (b += c));
    res.on("end", () => { let j; try { j = JSON.parse(b); } catch (_) { j = { raw: b.slice(0, 200) }; } j.__status = res.statusCode; resolve(j); });
  });
  req.on("error", (e) => resolve({ error: String(e) }));
  req.setTimeout(240000, () => { req.destroy(); resolve({ error: "timeout" }); });
  req.write(data); req.end();
});

let srv = null;
const done = () => {
  try { if (srv) srv.kill(); } catch (_) {}
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
};
process.on("exit", done);

(async () => {
  try {
    console.log("1. 🈯 The shape, re-derived from every installed map");
    {
      const roots = [];
      if (fs.existsSync(path.join(GAME, "history", "states"))) roots.push(GAME);
      if (fs.existsSync(WS)) for (const id of fs.readdirSync(WS)) {
        const r = path.join(WS, id);
        if (fs.existsSync(path.join(r, "map", "definition.csv")) && fs.existsSync(path.join(r, "history", "states"))) roots.push(r);
      }
      if (roots.length < 3) {
        rec("enough installed maps to derive the shape", false, roots.length + " found — a skip reads as a pass, so this fails");
      } else {
        let total = 0, other = 0, unnamed = 0;
        const examples = [], unnamedExamples = [];
        for (const r of roots) {
          const dir = path.join(r, "history", "states");
          for (const f of fs.readdirSync(dir)) {
            if (!f.toLowerCase().endsWith(".txt")) continue;
            let t = "";
            try { t = fs.readFileSync(path.join(dir, f), "utf8"); } catch (_) { continue; }
            for (const s of topLevelNames(t)) {
              total++;
              // ⚠️ MOVED 2026-09-15. A workshop map installed on 2026-09-14 (3721160655) ships a state with no name line at all
              // (68-Guadeloupe.txt), so "every shipping state is named STATE_<n>" failed on every commit. A state with NO name is a
              // different problem — state_no_name reports it — not a different naming shape, so the shape is asked of the states
              // that carry a name, and the nameless ones are counted and must stay a rare exception for the census to mean anything.
              if (!s.name) { unnamed++; if (unnamedExamples.length < 4) unnamedExamples.push(path.basename(r) + "/" + f); continue; }
              if (!/^STATE_\d+$/.test(s.name)) { other++; if (examples.length < 4) examples.push(f + ": " + s.name); }
            }
          }
        }
        rec("the corpus is big enough to mean something", total > 5000, total + " states across " + roots.length + " maps");
        // ⚠️ MOVED AGAIN 2026-09-23, and for the same reason as the note above: the corpus grew. Hearts of
        // Minecraft (2624254320) names nine of its 744 states by hand — "The King's Fortress", "Outer Castle
        // Region" — which is a perfectly ordinary thing for a total conversion to do. So `other === 0` was
        // never a property of shipping maps; it was a property of the maps that happened to be installed.
        //
        // What justifies Nova writing STATE_<n> is that it is the OVERWHELMING convention, not a universal
        // law, and that is what is asserted now — the same framing the nameless check below already uses.
        // The property actually under test, "every state the generator makes is named STATE_<its id>", is
        // pinned further down and is unaffected by any of this.
        rec("⭐⭐⭐ a hand-written state name is a rare exception, not a shape",
          other * 100 < total, { other, total, percent: +(other * 100 / total).toFixed(2), examples });
        rec("…and a state with no name at all is a rare exception, not a shape", unnamed * 100 < total, { unnamed, total, unnamedExamples });
      }
    }

    console.log("\n2. ⛔ The generator writes that shape");
    {
      const mod = path.join(tmp, "inproc");
      buildAllSeaMod(mod);
      const r = md.generateLand({ modRoot: mod, count: 8, provincesPerState: 3, seed: 7 });
      rec("the generator ran", r.changed === true && r.createdStates >= 3, { changed: r.changed, created: r.createdStates, error: r.error });
      const states = statesOnDisk(mod);
      rec("…and wrote a state file for each state it counted", states.length === r.createdStates, states.map((s) => s.file));
      const off = states.filter((s) => s.name !== `STATE_${s.id}`);
      rec("⭐⭐⭐ every generated state is named STATE_<its id>", states.length > 0 && off.length === 0, off.map((s) => s.file + ": " + s.name));
      const badFile = states.filter((s) => s.file !== `${s.id}-STATE_${s.id}.txt`);
      rec("⭐ …in a file named the way createState names one, <id>-STATE_<id>.txt", badFile.length === 0, badFile.map((s) => s.file));
      rec("⭐ …and the result lists the states it made, with their names", Array.isArray(r.newStates) && r.newStates.length === r.createdStates
        && r.newStates.every((s) => s.name === `STATE_${s.id}`), r.newStates);
      // #a-generated-capital-sits-on-its-rail — one victory point per state, on one of its own provinces: with none, HOI4 makes
      // the capital state's first province the capital, and the supply hub (which prefers a state's best victory point) is
      // somewhere else.
      const badVp = states.filter((s) => {
        const t = fs.readFileSync(path.join(mod, "history", "states", s.file), "utf8");
        const vps = [...t.matchAll(/victory_points\s*=\s*\{\s*(\d+)\s+(\d+)\s*\}/g)];
        const own = ((/provinces\s*=\s*\{([^}]*)\}/.exec(t) || [])[1] || "").trim().split(/\s+/).map(Number);
        return !(vps.length === 1 && own.includes(Number(vps[0][1])) && Number(vps[0][2]) >= 1);
      });
      rec("⭐⭐ every generated state has one victory point, on one of its own provinces", states.length > 0 && badVp.length === 0, badVp.map((s) => s.file));
      rec("…and the result says which", r.newStates.length > 0 && r.newStates.every((s) => s.vp && s.vp.province > 0 && s.vp.value >= 1), r.newStates);
    }

    console.log("\n3. ⭐⭐⭐ Generate land, from the page — every new state has a name, written once");
    {
      const MODS = path.join(tmp, "mods");
      const mod = path.join(MODS, "gennames");
      buildAllSeaMod(mod);
      const ENG = path.join(mod, "localisation", "english");
      // Nova's names file already exists (a rename from earlier), so every write to it takes a backup — which is
      // how "one write" is measured.
      mk(path.join(ENG, "replace", "nova_state_names_l_english.yml"), '\uFEFFl_english:\n SOME_EARLIER_RENAME:0 "Earlier"\n');
      // …and the modder's own file already names STATE_1, the first id a blank canvas hands out — and STATE_2, with a quote and
      // a backslash in it, escaped on disk the way the state panel writes them: a victory point named after it must read the
      // same, not escaped twice (review of abc3f0a, probe zz-probe-escape.js). QUOTED is the raw text between the outer quotes.
      const QUOTED = 'The \\"Old\\" Shore \\\\ East';
      const MODDERS = new Set(["STATE_1", "STATE_2"]);
      mk(path.join(ENG, "my_names_l_english.yml"), '\uFEFFl_english:\n STATE_1:0 "Homeland"\n STATE_2:0 "' + QUOTED + '"\n');

      srv = spawn(process.execPath, ["server.js"], {
        cwd: __dirname, stdio: "ignore",
        env: { ...process.env, PORT: String(PORT), APPDATA, XDG_CONFIG_HOME: APPDATA, NOVA_APP_DATA_DIR: path.join(APPDATA, "NovaModdingSuite"),
          NOVA_HOME_DIR: HOME, HOI4_MOD_ROOT: MODS, HOI4_USER_DIR: HOI4_USER },
      });
      let up = false;
      for (let i = 0; i < 90 && !up; i++) {
        await new Promise((res) => setTimeout(res, 500));
        up = await new Promise((res) => {
          const q = http.get({ host: "127.0.0.1", port: PORT, path: "/api/settings/allow-vanilla-edits" }, (x) => { x.resume(); res(true); });
          q.on("error", () => res(false)); q.setTimeout(1500, () => { q.destroy(); res(false); });
        });
      }
      rec(`the server answered on ${PORT}`, up);
      if (up) {
        const MAPJS = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
        // ⚠️ MOVED WITH THE FIX. The page now also sends `replacesExistingWorld: true` — the endpoint gained a
        // populated-map gate that used to live only in the browser (#generate-land-is-gated-only-in-the-browser),
        // and this fixture is a blank canvas so the gate would not fire either way. A test that mirrors the
        // client has to keep mirroring it, or it quietly stops sending what the client sends and starts
        // testing a request nothing makes.
        // ⚠️ MOVED WITH THE FIX AGAIN — the dialog gained a "Who owns it" control, so the body carries
        // `ownerMode` and `owner` (#a-generated-world-nobody-rules). Same reason as before: a test that
        // mirrors the client has to keep mirroring it.
        rec("the page still sends { modPath, count, seed, ownerMode, owner, replacesExistingWorld } (so this test sends what it sends)",
          /JSON\.stringify\(\{ modPath: modPath\(\), count, seed, ownerMode, owner: ownerMode === "single" \? ownerTag : "", replacesExistingWorld: true \}\)/.test(MAPJS));
        // ⚠️ MOVED WITH THE FIX (#a-province-below-is-the-same-province, review cr1 WC-1) — this blank canvas draws a map of its own over
        // the base game (none of its 12 rows is the base game's province of that id) and owns no state, so "the countries below it" has
        // nothing to read: the dialog keeps Generate off for it and the endpoint refuses it (refusedCannotInherit), where it used to hand
        // these states to whichever base-game countries held provinces 1-12 down there. The names are this test's subject, and owners
        // do not name a state (generatedStateNameEntries), so it asks for the choice the dialog leaves on: Nobody.
        const g = await post("/api/map/generate-land", { modPath: mod, count: 12, seed: 7, ownerMode: "none", owner: "", replacesExistingWorld: true });
        rec("generate land succeeds", g.ok === true && g.createdStates >= 4, { ok: g.ok, created: g.createdStates, error: g.error || g.raw });
        const states = statesOnDisk(mod);
        const names = modIndex.scanLocalization(mod);
        rec("the states are on disk", states.length === g.createdStates && states.length >= 4, states.map((s) => s.file));
        const unnamed = states.filter((s) => !names[s.name] || names[s.name] === s.name);
        rec("⭐⭐⭐ every generated state's key has a name in the mod's localisation", states.length > 0 && unnamed.length === 0,
          unnamed.map((s) => s.name));
        const one = states.find((s) => s.id === 1);
        rec("⚠️⚠️ the modder's own name for STATE_1 is kept", !!one && names.STATE_1 === "Homeland", { state1: !!one, value: names.STATE_1 });
        // ⭐ #a-generated-world-names-its-places — the owner after TEST 30's "STATE 112" labels: "we do in fact need a name
        // generator … we dont have to make it perfect". A made-up place name for each, none of them "State <id>", no two alike.
        const made = states.filter((s) => !MODDERS.has(s.name)).map((s) => names[s.name]);
        rec("⭐⭐⭐ every other generated state has a made-up name, not \"State <id>\"", made.length >= 2 && made.every((v) => /^[A-Z][a-z]{3,10}$/.test(String(v || ""))) && !made.some((v) => /^State \d+$/.test(String(v))), made);
        rec("⭐ …and no two share one", new Set(made.map((v) => String(v).toLowerCase())).size === made.length, made);
        // …and each state's victory point is named after its state, as vanilla pairs them — in the same write, which the
        // one-write check below therefore covers too. STATE_1 included: its point reads the modder's "Homeland", what the state
        // reads, and not the made-up name the state would have had (review of 4b52991 — this check used to leave STATE_1 out).
        const vpNames = states.map((s) => {
          const m = /victory_points\s*=\s*\{\s*(\d+)/.exec(fs.readFileSync(path.join(mod, "history", "states", s.file), "utf8"));
          return { key: s.name, state: names[s.name], vp: m ? names[`VICTORY_POINTS_${m[1]}`] : undefined };
        });
        rec("⭐⭐ every new state's victory point is named after its state", vpNames.length >= 3 && vpNames.every((x) => x.vp && x.vp === x.state), vpNames);
        rec("⭐⭐ …the one in STATE_1 reads \"Homeland\", as its state does", (vpNames.find((x) => x.key === "STATE_1") || {}).vp === "Homeland", vpNames.find((x) => x.key === "STATE_1"));
        // raw text as it sits on the line (scanLocalization reads it so): the same escaping as the modder's, once
        rec("⭐⭐ …the one in STATE_2 reads the modder's quoted name, escaped once like theirs, not twice", (vpNames.find((x) => x.key === "STATE_2") || {}).vp === QUOTED, vpNames.find((x) => x.key === "STATE_2"));
        // every definition in the mod's English localisation, replace/ included (#a-name-nova-writes-must-win)
        const count = (key) => {
          let n = 0;
          const walk = (d) => {
            for (const e of fs.readdirSync(d, { withFileTypes: true })) {
              if (e.isDirectory()) { walk(path.join(d, e.name)); continue; }
              for (const line of fs.readFileSync(path.join(d, e.name), "utf8").split(/\r?\n/)) if (new RegExp("^\\s*" + key + ":\\d*\\s*\"").test(line)) n++;
            }
          };
          walk(ENG);
          return n;
        };
        const dup = states.filter((s) => count(s.name) !== 1);
        rec("⚠️ …and no key is defined twice", states.length > 0 && dup.length === 0, dup.map((s) => s.name + "×" + count(s.name)));
        const novaFile = fs.readFileSync(path.join(ENG, "replace", "nova_state_names_l_english.yml"));
        rec("…the earlier rename in Nova's names file survives", /SOME_EARLIER_RENAME:0 "Earlier"/.test(novaFile.toString("utf8")));
        rec("…which keeps its BOM and l_english: header", novaFile[0] === 0xEF && novaFile[1] === 0xBB && novaFile[2] === 0xBF
          && /^\uFEFFl_english:/.test(novaFile.toString("utf8")), novaFile.toString("utf8").slice(0, 30));
        const newlyNamed = states.filter((s) => !MODDERS.has(s.name)).length;
        rec("there are at least two new names to write, so one write and one-per-state cannot look alike", newlyNamed >= 2, newlyNamed);
        const backups = path.join(APPDATA, "NovaModdingSuite", "backups");
        const taken = fs.existsSync(backups) ? fs.readdirSync(backups).filter((f) => f.includes("nova_state_names_l_english.yml")) : [];
        rec("⭐⭐⭐ ONE write for all of them, not one per state", taken.length === 1, taken.length + " backup(s) of the names file for " + newlyNamed + " new names");
      }
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    fails.push("harness");
  }
  console.log(`\n=== generated land names its states like every shipping map: ${checks} checks, ${fails.length} failed ===`);
  fails.forEach((f) => console.log("   FAILED: " + f));
  process.exit(fails.length ? 1 : 0);
})();
