// #a-refused-duplicate-is-described-by-what-it-is
//
// "🔧 FIX DUPLICATE STATES" REFUSED THE ONLY DUPLICATE THE CORPUS HAS, AND EXPLAINED IT BACKWARDS.
//
// fixDuplicateStateFiles is conservative on purpose: it removes a duplicated id's block only when every
// province that block claims is ALSO held by a file OUTSIDE the duplicate set, so removing it strands
// nothing. Everything else goes into `unresolved`, and `unresolved` carried an id and two file names.
//
// Its one reader — the "🔧 Fix duplicate states" button in Mod Health's crash check — filled the gap with a
// sentence of its own: "; N ambiguous duplicate(s) left for you to resolve by hand (both files own unique
// land)". Three things were wrong with it:
//
//   1. THE REASON IS OFTEN FALSE, and is false for the only duplicate state id in the whole installed corpus.
//      Novum Vexillum — which launches — ships state 1325 in 1325-Balti.txt and 1325-Northern Moldova.txt.
//      Both blocks list the SAME four provinces (414, 3577, 6600, 13213); what differs is manpower, 140,000
//      against 900,216. NEITHER FILE OWNS UNIQUE LAND. A modder told the land differs goes looking for
//      geography to merge; told it is identical, the only question left is which block they meant.
//   2. IT NAMED NOTHING — a count, with no id and no file, under the words "resolve by hand".
//   3. "both files" assumed two. An id can be in three.
//
// And Auto-fix all did not mention it AT ALL: public/map.js reads `dupStateFiles.removed` at both of its
// summary sites and has never read `unresolved`, so a refused duplicate vanished from the click's report —
// the exact silence #auto-fix-never-said-what-it-declined fixed for capitals, province conflicts, empty
// states and sea leftovers in the same tail.
//
// Section 1 asks the six shipping maps which duplicate shapes exist at all. Section 2 drives the real
// /api/map/fix-duplicate-states with the body the button sends, on four fixtures, and checks both the answer
// and the disk. Section 3 RUNS the two page functions on the server's real answer. Section 4 is the wiring
// and the decay guard.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");

let checks = 0, skips = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) fails.push(label);
};
const skip = (label) => { skips++; console.log("  SKIP " + label); };

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dupsay-"));
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");
const mapData = require("./map-data.js");

const VAN = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
const MAPS = [["vanilla", VAN], ["Millennium Dawn", WS + "/2777392649"], ["Road to 56", WS + "/820260968"],
  ["Old World Blues", WS + "/2265420196"], ["Novum Vexillum", WS + "/1827273767"], ["Rise of Nations", WS + "/2026448968"]];

// ── lift a function out of a page, comments blanked length-preservingly so line numbers survive ──
function blankComments(src) {
  let out = "", i = 0, state = "code", quote = "";
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (state === "code") {
      if (c === "/" && d === "/") { state = "line"; out += "  "; i += 2; continue; }
      if (c === "/" && d === "*") { state = "block"; out += "  "; i += 2; continue; }
      if (c === '"' || c === "'" || c === "`") { state = "str"; quote = c; out += c; i++; continue; }
      out += c; i++; continue;
    }
    if (state === "str") {
      if (c === "\\") { out += c + (d || ""); i += 2; continue; }
      if (c === quote) state = "code";
      out += c; i++; continue;
    }
    if (state === "line") { if (c === "\n") { state = "code"; out += c; } else out += " "; i++; continue; }
    if (state === "block") { if (c === "*" && d === "/") { state = "code"; out += "  "; i += 2; continue; } out += c === "\n" ? c : " "; i++; continue; }
  }
  return out;
}
const pageSrc = (rel) => fs.readFileSync(path.join(__dirname, rel), "utf8");
function fnText(code, name) {
  const at = code.indexOf("function " + name + "(");
  if (at === -1) return "";
  const open = code.indexOf("{", at);
  let d = 0;
  for (let i = open; i < code.length; i++) { if (code[i] === "{") d++; else if (code[i] === "}") { d--; if (d === 0) return code.slice(at, i + 1); } }
  return "";
}

// ── fixtures ────────────────────────────────────────────────────────────────────────────────────
const stateTxt = (id, provinces, manpower) =>
  "state = {\n\tid = " + id + "\n\tname = \"STATE_" + id + "\"\n\tmanpower = " + manpower +
  "\n\tstate_category = rural\n\tprovinces = { " + provinces.join(" ") + " }\n" +
  "\thistory = {\n\t\towner = SWE\n\t\tadd_core_of = SWE\n\t}\n}\n";

let seq = 0;
function mkMod(files) {
  const MOD = path.join(ROOT, "mod" + (++seq));
  fs.mkdirSync(path.join(MOD, "history", "states"), { recursive: true });
  // replace_path so nothing from a layer below can resurface and change what "redundant" means.
  fs.writeFileSync(path.join(MOD, "descriptor.mod"),
    "version=\"1\"\nname=\"dupsay" + seq + "\"\nreplace_path=\"history/states\"\npath=\"mod/dupsay" + seq + "\"\n");
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(MOD, "history", "states", name), text);
  return MOD;
}
const treeOf = (dir) => fs.readdirSync(dir).sort().map((f) => f + ":" + fs.readFileSync(path.join(dir, f), "utf8").length).join("|");

console.log("\n1. which duplicate shapes the six shipping maps actually have");
let nvPair = null;
{
  let looked = 0;
  for (const [name, root] of MAPS) {
    const dir = path.join(root, "history", "states");
    let names = [];
    try { names = fs.readdirSync(dir).filter((f) => /\.txt$/i.test(f)); } catch (_) { continue; }
    looked++;
    const idToFiles = new Map(), landOf = new Map();
    for (const f of names) {
      let txt = "";
      try { txt = fs.readFileSync(path.join(dir, f), "utf8"); } catch (_) { continue; }
      // ask map-data's own finder, so a stray "id = 3" inside a victory point is never counted as a state
      const masked = txt.replace(/#[^\r\n]*/g, (m) => " ".repeat(m.length));
      const ids = new Set();
      let m; const re = /(^|[^A-Za-z_])id\s*=\s*(\d+)/g;
      while ((m = re.exec(masked))) ids.add(parseInt(m[2], 10));
      for (const id of ids) {
        const found = mapData.findStateBlockById(txt, id);
        if (!found) continue;
        if (!idToFiles.has(id)) idToFiles.set(id, []);
        idToFiles.get(id).push(f);
        const pm = txt.slice(found.start, found.end).match(/provinces\s*=\s*\{([^}]*)\}/);
        landOf.set(id + "|" + f, (pm ? pm[1] : "").trim().split(/\s+/).filter(Boolean).map(Number).sort((a, b) => a - b).join(","));
      }
    }
    const dups = [...idToFiles].filter(([, a]) => a.length > 1);
    console.log("   " + name + ": " + names.length + " files, " + idToFiles.size + " state ids, " + dups.length + " duplicated"
      + (dups.length ? "  " + JSON.stringify(dups.map(([id, a]) => [id, a])) : ""));
    for (const [id, a] of dups) {
      const same = a.every((f) => landOf.get(id + "|" + f) === landOf.get(id + "|" + a[0]));
      console.log("      id " + id + ": every file lists the same provinces? " + same + "  (" + landOf.get(id + "|" + a[0]) + ")");
      if (name === "Novum Vexillum") nvPair = { id, files: a.slice().sort(), same };
    }
  }
  if (!looked) skip("no shipping map is installed — the census needs one");
  else if (!nvPair) skip("Novum Vexillum has no duplicate here (it shipped one at 1.0.6)");
  else {
    rec("⭐⭐⭐ the corpus's only duplicate is two files listing the SAME provinces — nobody owns unique land", nvPair.same === true, nvPair);
    rec("…and HOI4 loads the first of them in load order", nvPair.files[0] < nvPair.files[1], nvPair.files);
  }
}

const server = createApp().listen(0, async () => {
  const PORT = server.address().port;
  const post = (url, body) => new Promise((resolve) => {
    const http = require("http");
    const data = Buffer.from(JSON.stringify(body));
    const req = http.request({ host: "127.0.0.1", port: PORT, path: url, method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": data.length } }, (res) => {
      let b = ""; res.on("data", (c) => { b += c; });
      res.on("end", () => { let j = null; try { j = JSON.parse(b); } catch (_) {} resolve({ status: res.statusCode, body: j, raw: b }); });
    });
    req.on("error", (e) => resolve({ status: 0, body: null, raw: String(e.message) }));
    req.end(data);
  });

  let sameAnswer = null;
  try {
    console.log("\n2. the real /api/map/fix-duplicate-states, with the body the button sends: { modPath }");

    // (a) the shape Novum Vexillum ships: one id, two files, the same land, different payload.
    {
      const MOD = mkMod({
        "1325-Balti.txt": stateTxt(1325, [414, 3577, 6600, 13213], 140000),
        "1325-Northern Moldova.txt": stateTxt(1325, [414, 3577, 6600, 13213], 900216),
      });
      const dir = path.join(MOD, "history", "states");
      const before = treeOf(dir);
      const r = await post("/api/map/fix-duplicate-states", { modPath: MOD });
      sameAnswer = r.body;
      const u = (r.body && r.body.unresolved || [])[0];
      rec("it answers", r.status === 200 && r.body && r.body.ok === true, r.body);
      rec("it removes nothing, on purpose", (r.body && r.body.removed || []).length === 0, r.body && r.body.removed);
      rec("CONTROL: and writes nothing — the disk is byte-for-byte what it was", treeOf(dir) === before, { before, after: treeOf(dir) });
      rec("the refusal names the state", u && u.id === 1325, u);
      rec("⭐⭐⭐ …and says the two files list the SAME land, which is why it will not choose", u && u.sameLand === true, u);
      rec("…and says which file HOI4 actually reads", u && u.loads === "1325-Balti.txt", u);
      rec("…and which it ignores", u && Array.isArray(u.ignores) && u.ignores.join() === "1325-Northern Moldova.txt", u);
      rec("…and how much land is at stake", u && u.provinces === 4, u);
    }

    // (b) the other shape: same id, DIFFERENT land. Removing either would leave provinces in no state.
    {
      const MOD = mkMod({
        "700-A.txt": stateTxt(700, [1001, 1002], 50),
        "700-B.txt": stateTxt(700, [1003, 1004], 60),
      });
      const r = await post("/api/map/fix-duplicate-states", { modPath: MOD });
      const u = (r.body && r.body.unresolved || [])[0];
      rec("a duplicate whose files hold different land is still refused", (r.body && r.body.removed || []).length === 0, r.body);
      rec("⭐ …and is reported as different land, not the same", u && u.sameLand === false, u);
    }

    // (c) REGRESSION GUARD: the classic stray stub must still be removed, unchanged.
    {
      const MOD = mkMod({
        "500-Real.txt": stateTxt(500, [2001, 2002], 70),
        "500-restored.txt": "state = {\n\tid = 500\n\tname = \"STATE_500\"\n\tprovinces = { }\n\thistory = {\n\t}\n}\n",
      });
      const dir = path.join(MOD, "history", "states");
      const r = await post("/api/map/fix-duplicate-states", { modPath: MOD });
      rec("CONTROL: the stray empty stub is still removed", (r.body && r.body.removed || []).length === 1, r.body);
      rec("CONTROL: …and the real file is the one left standing", fs.existsSync(path.join(dir, "500-Real.txt")), fs.readdirSync(dir));
      rec("CONTROL: …and nothing is reported unresolved for it", (r.body && r.body.unresolved || []).length === 0, r.body);
    }

    // (d) REGRESSION GUARD: every file redundant → keep the one HOI4 keeps, the first in load order.
    //     This is the branch whose sort `loads` reuses, so the two can never name different files.
    {
      const MOD = mkMod({
        "600-A.txt": stateTxt(600, [3001], 80),
        "600-b.txt": stateTxt(600, [3001], 90),
        "601-Other.txt": stateTxt(601, [3001], 100),
      });
      const dir = path.join(MOD, "history", "states");
      const r = await post("/api/map/fix-duplicate-states", { modPath: MOD });
      const order = ["600-A.txt", "600-b.txt"].sort();
      rec("CONTROL: when every copy is redundant one is still removed", (r.body && r.body.removed || []).length === 1, r.body);
      rec("CONTROL: …and the survivor is the first in load order", fs.existsSync(path.join(dir, order[0])), fs.readdirSync(dir));
    }

    console.log("\n3. the two sentences the pages print, RUN on the server's real answer");
    {
      const mh = blankComments(pageSrc(path.join("public", "modhealth-crashcheck.js")));
      const noteFn = fnText(mh, "duplicateFixNote");
      rec("duplicateFixNote is a real function in the crash-check page", noteFn.length > 200, noteFn.length);
      let line = "";
      if (noteFn.length > 200 && sameAnswer) {
        const ctx = { window: {}, esc: (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])) };
        vm.createContext(ctx);
        vm.runInContext(noteFn + "\nthis.__out = duplicateFixNote;", ctx);
        line = ctx.__out(sameAnswer);
        console.log("   panel line: " + line);
        rec("⭐⭐⭐ the panel no longer claims the two files own unique land", line.indexOf("unique land") === -1, line);
        rec("…it names the state", line.indexOf("1325") !== -1, line);
        rec("…it names both files", line.indexOf("1325-Balti.txt") !== -1 && line.indexOf("1325-Northern Moldova.txt") !== -1, line);
        rec("…and says which one HOI4 reads", /loads .1325-Balti\.txt./.test(line), line);
        rec("…and says the land is the same, so deleting one strands nothing", /SAME 4 province/.test(line) && /strand|nothing is stranded/.test(line), line);
        rec("CONTROL: with nothing left over it says so and stops", /^Removed 1 stray duplicate block\(s\)\.$/.test(ctx.__out({ removed: [{ id: 1 }], unresolved: [] })), ctx.__out({ removed: [{ id: 1 }], unresolved: [] }));
      } else rec("the panel sentence could be run", false, "duplicateFixNote not liftable");
    }
    {
      const mp = blankComments(pageSrc(path.join("public", "map.js")));
      const leftFn = fnText(mp, "duplicateStatesLeftNote");
      rec("duplicateStatesLeftNote is a real function in the map page", leftFn.length > 150, leftFn.length);
      if (leftFn.length > 150 && sameAnswer) {
        const ctx = { window: {} };
        vm.createContext(ctx);
        vm.runInContext(leftFn + "\nthis.__out = duplicateStatesLeftNote;", ctx);
        const tail = ctx.__out(sameAnswer);
        console.log("   auto-fix tail: " + tail);
        rec("⭐⭐ Auto-fix now says which duplicate id it left", tail.indexOf("1325") !== -1, tail);
        rec("…and that HOI4 keeps the first file", /keeps the first file/.test(tail), tail);
        rec("CONTROL: and says nothing at all when there is nothing to say", ctx.__out({ removed: [], unresolved: [] }) === "" && ctx.__out(null) === "" && ctx.__out({}) === "", [ctx.__out({ removed: [], unresolved: [] }), ctx.__out(null), ctx.__out({})]);
      } else rec("the auto-fix tail could be run", false, "duplicateStatesLeftNote not liftable");
    }

    console.log("\n4. the wiring, and the decay guard");
    {
      const mpRaw = pageSrc(path.join("public", "map.js"));
      const mp = blankComments(mpRaw);
      // Both of Auto-fix's summary sites must go through the one owner — a note each caller has to adopt
      // is one a caller will miss, which is how `unresolved` came to be unread at both of them.
      const calls = (mp.match(/duplicateStatesLeftNote\(/g) || []).length;
      rec("⭐⭐ both Auto-fix summary sites call the one note function (plus its definition)", calls >= 3, calls);
      const defs = (mp.match(/function duplicateStatesLeftNote\(/g) || []).length;
      rec("…and there is exactly one of it", defs === 1, defs);
      // The false sentence must not come back anywhere on the client.
      const pub = path.join(__dirname, "public");
      const offenders = [];
      for (const f of fs.readdirSync(pub)) {
        if (!/\.js$/i.test(f)) continue;
        const t = blankComments(fs.readFileSync(path.join(pub, f), "utf8"));
        if (t.indexOf("own unique land") !== -1) offenders.push(f);
      }
      rec("⭐ no page claims \"own unique land\" about a refused duplicate any more", offenders.length === 0, offenders);
      // …and map-data must keep answering the question the sentence is built from.
      const md = blankComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
      rec("map-data's refusal still carries sameLand / loads", /sameLand:/.test(md) && /loads: order\[0\]/.test(md), null);
    }
  } catch (e) {
    console.log("THREW: " + (e && e.stack || e));
    fails.push("threw");
  }
  console.log("\n" + (checks - fails.length) + "/" + checks + " checks passed" + (skips ? ", " + skips + " skipped" : "") + (fails.length ? "\nFAILED: " + fails.join("\n        ") : ""));
  server.close();
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  process.exit(fails.length ? 1 : 0);
});
