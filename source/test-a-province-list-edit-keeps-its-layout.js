// Taking an id out of a province list keeps the author's layout: the line keeps its indentation.
// #a-province-list-edit-keeps-its-layout
//
// Found in the owner's torture build (nova_torture_0917, through the real endpoints): a state split moved 1302 and 4379 out of
// vanilla's 1017 - Trung Bo.txt, whose list is written the way vanilla writes nearly every state —
//     provinces = {
//         1302 4379 4397 7280 9988 10016 11909 11936 12297
//     }
// and the file was left with ` 4397 7280 9988 …` — its two tabs gone, a stray space in their place.
// removeIdFromListBlock splices one id out (it stopped re-emitting whole lists long ago, for the comments' sake) and walked
// back over the blanks before the id to take the separator with it. For the FIRST id on a line those blanks are the line's
// indentation, and the space it then kept to stop two ids joining belonged to nothing. The game does not care; the modder's
// diff does, and every vanilla-style state loses its indentation on the first move out of it. Measured (section 3, on 21808ba's
// source): of the lists whose first id opens an indented line, taking that id out damaged vanilla 1,065 of 1,065, Millennium
// Dawn 1,242, Road to 56 1,125, Old World Blues 1,524, Novum Vexillum 1,364, Rise of Nations 1,144 — every one. An id alone on
// its line left a blank line behind.
//
// Now an id that opens its line takes the blanks AFTER it instead, and an id alone on its line takes the line.
// Requests are the client's: public/map.js queueWrite("/api/map/move-province", { provinceId, toStateId }, { fromStateId });
// flushMapSaves adds modPath. Section 3 removes the first id of every state's list on the installed maps.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0, skips = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 600)));
  if (!ok) fails.push(label);
};
const skip = (label) => { skips++; console.log("  SKIP " + label); };

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-listlayout-"));
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const M = require("./map-data.js");
const { createApp } = require("./server.js");

const mask = (t) => String(t).replace(/#[^\r\n]*/g, (m) => " ".repeat(m.length));
/** the raw body of a state's `provinces = { … }` */
const listBody = (text) => { const m = /(?:^|[^A-Za-z0-9_])provinces\s*=\s*\{/.exec(mask(text)); if (!m) return null; const open = text.indexOf("{", m.index); const close = mask(text).indexOf("}", open); return text.slice(open + 1, close); };

const mkMod = (states) => {
  const MOD = fs.mkdtempSync(path.join(ROOT, "mod-"));
  const mk = (rel, c) => { const p = path.join(MOD, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
  const ids = [9, 11, 12, 21, 22, 23, 31, 32, 1302, 4379, 4397, 7280];
  mk("descriptor.mod", 'name="list layout"\nsupported_version="1.19.*"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\n');
  mk("map/definition.csv", ["0;0;0;0;land;false;unknown;0", ...ids.map((q, i) => `${q};${i + 1};0;0;land;false;plains;1`)].join("\n") + "\n");
  for (const [f, t] of Object.entries(states)) mk("history/states/" + f, t);
  return MOD;
};
const st = (id, list) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\thistory = {\n\t\towner = AAA\n\t}\n\n\tprovinces = {${list}}\n}\n`;
const stateText = (MOD, f) => fs.readFileSync(path.join(MOD, "history", "states", f), "utf8");

const server = createApp().listen(0, async () => {
  const PORT = server.address().port;
  const post = (ep, body) => fetch(`http://127.0.0.1:${PORT}${ep}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  try {
    console.log("1. Move ids out of vanilla-shaped lists  (POST /api/map/move-province)");
    {
      const MOD = mkMod({
        "1-Trung.txt": st(1, "\n\t\t1302 4379 4397 7280 #the coast\n\t"),
        "2-Lines.txt": st(2, "\n\t\t11\n\t\t12\n\t"),
        "3-Compact.txt": st(3, " 21 22 23 "),
        "4-Target.txt": st(4, " 9 "),
      });
      const move = async (pid) => { const r = await post("/api/map/move-province", { provinceId: pid, toStateId: 4, modPath: MOD }); return r.s === 200 && r.b.ok === true && r.b.changed === true ? "" : JSON.stringify(r.b); };
      rec("moving 1302 (the first id on its line) succeeded", (await move(1302)) === "");
      rec("⭐⭐⭐ the line keeps its two tabs and starts with the next id", listBody(stateText(MOD, "1-Trung.txt")) === "\n\t\t4379 4397 7280 #the coast\n\t", listBody(stateText(MOD, "1-Trung.txt")));
      rec("moving 4379 (the first id again) succeeded", (await move(4379)) === "");
      rec("⭐⭐ …and again", listBody(stateText(MOD, "1-Trung.txt")) === "\n\t\t4397 7280 #the coast\n\t", listBody(stateText(MOD, "1-Trung.txt")));
      rec("moving 7280 (the last id, before a comment) succeeded", (await move(7280)) === "");
      rec("⚠️ …leaves one space between the id before it and the comment, as it always did", listBody(stateText(MOD, "1-Trung.txt")) === "\n\t\t4397 #the coast\n\t", listBody(stateText(MOD, "1-Trung.txt")));
      rec("moving 11 (an id alone on its line) succeeded", (await move(11)) === "");
      rec("⭐⭐ …takes its line, leaving no blank one", listBody(stateText(MOD, "2-Lines.txt")) === "\n\t\t12\n\t", listBody(stateText(MOD, "2-Lines.txt")));
      rec("moving 22 (between two ids on a one-line list) succeeded", (await move(22)) === "");
      rec("⚠️ the one-line list keeps one space between the ids around it", listBody(stateText(MOD, "3-Compact.txt")) === " 21 23 ", listBody(stateText(MOD, "3-Compact.txt")));
      rec("moving 21 (the first on a one-line list) succeeded", (await move(21)) === "");
      rec("⚠️ …and `{ 23 }` stays `{ 23 }`", listBody(stateText(MOD, "3-Compact.txt")) === " 23 ", listBody(stateText(MOD, "3-Compact.txt")));
      const target = listBody(stateText(MOD, "4-Target.txt"));
      rec("the target lists all of them", [9, 1302, 4379, 7280, 11, 22, 21].every((p) => new RegExp("\\b" + p + "\\b").test(target)), target);
    }

    console.log("\n2. The same through the pure transform, with CRLF line endings");
    {
      const block = st(5, "\r\n\t\t31 32\r\n\t").replace(/\n/g, "\r\n").replace(/\r\r\n/g, "\r\n");
      const out = M.removeProvinceFromBlock(block, 31);
      rec("⭐ a CRLF list keeps its indentation too", listBody(out) === "\r\n\t\t32\r\n\t", JSON.stringify(listBody(out)));
      const out2 = M.removeProvinceFromBlock(M.removeProvinceFromBlock(st(6, "\r\n\t\t31\r\n\t\t32\r\n\t").replace(/\n/g, "\r\n").replace(/\r\r\n/g, "\r\n"), 31), 99);
      rec("⭐ …and an id alone on a CRLF line takes the whole line", listBody(out2) === "\r\n\t\t32\r\n\t", JSON.stringify(listBody(out2)));
    }

    console.log("\n3. The first id of every state's list on the installed maps (derived from the corpus)");
    {
      const VAN = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
      const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
      const roots = [["vanilla", VAN], ["Millennium Dawn", path.join(WS, "2777392649")], ["Road to 56", path.join(WS, "820260968")], ["Old World Blues", path.join(WS, "2265420196")], ["Novum Vexillum", path.join(WS, "1827273767")], ["Rise of Nations", path.join(WS, "2026448968")]];
      let ran = 0;
      for (const [label, root] of roots) {
        const sdir = path.join(root, "history", "states");
        if (!fs.existsSync(sdir)) { skip(`${label} is not installed`); continue; }
        ran++;
        let lists = 0, openers = 0;
        const bad = [];
        for (const f of fs.readdirSync(sdir).filter((x) => /\.txt$/i.test(x))) {
          const raw = fs.readFileSync(path.join(sdir, f), "utf8");
          const body = listBody(raw);
          if (body == null) continue;
          const first = /\d+/.exec(mask(body));
          if (!first) continue;
          lists++;
          const ls = body.lastIndexOf("\n", first.index - 1) + 1;
          if (ls === 0 || !/^[ \t]*$/.test(body.slice(ls, first.index))) continue;       // only ids that open an indented line
          if ((mask(body).match(new RegExp("(?<![0-9])" + first[0] + "(?![0-9])", "g")) || []).length !== 1) continue;   // listed twice: every copy goes
          openers++;
          // What the list must read afterwards, derived from the list itself: the id's line keeps everything before the id and
          // starts again at the next token; an id alone on its line takes the line with it.
          const idEnd = first.index + first[0].length;
          const nl = body.indexOf("\n", idEnd);
          const tail = nl === -1 ? body.slice(idEnd) : body.slice(idEnd, nl);            // ends in \r on a CRLF line
          const rest = tail.replace(/^[ \t]+/, "");
          let want;
          if (rest.replace(/\r$/, "")) want = body.slice(0, first.index) + rest + (nl === -1 ? "" : body.slice(nl));
          else if (nl !== -1) want = body.slice(0, ls) + body.slice(nl + 1);
          else want = body.slice(0, ls - 1 - (body[ls - 2] === "\r" ? 1 : 0));
          const got = listBody(M.removeProvinceFromBlock(raw, Number(first[0])));
          if (got !== want) { if (bad.length < 4) bad.push({ f, want: JSON.stringify(want.slice(0, 80)), got: JSON.stringify(String(got).slice(0, 80)) }); else bad.push(null); }
        }
        rec(`${label}: ⭐⭐ taking out a list's first id, where it opens an indented line, changes that id and the blanks after it and nothing else (${openers} of ${lists} lists)`, bad.length === 0, { bad: bad.length, samples: bad.filter(Boolean) });
      }
      if (!ran) skip("no shipping map is installed — section 3 did NOT run");
    }
  } catch (e) {
    rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e), false);
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    console.log(`\n=== a province list edit keeps its layout: ${checks} checks, ${fails.length} failed, ${skips} skipped ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exitCode = 1; });
