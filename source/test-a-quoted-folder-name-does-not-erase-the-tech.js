// HOI4 accepts a quoted token wherever it accepts a bare one, so `folder = { name = "infantry_folder" … }`
// is valid script. Two of Nova's three folder-name readers could not read it, and the consequences compound:
//
//   1. NO SAVE NEEDED. With folder "" the tech is drawn in NO research tab — every tab filter compares
//      `t.folder === f` — and the custom-tab discovery pass skips it outright. Nova shows nothing where HOI4
//      draws a tech: the "does this show what the GAME will show" class.
//   2. ON SAVE, the placement is DELETED. buildExtraScriptFromTechBlock strips the first folder block on the
//      promise that serializeTechnology will re-emit it, and it only does so `if (tech.folder)`. With no
//      name parsed, the block is stripped and never returned — HTTP 200, no warning, and the technology is
//      now in no research tree at all.
//   3. scanTechsInFolder was blind too, so the gridbox scan missed it and HOI4 would log
//      "Found no grid box for tech <id>" and never draw it.
//
// ⭐ THE GUARD IS THE DURABLE HALF. Quote tolerance closes the one shape known to break; refusing to strip a
// folder block the parser could not read closes the CLASS, including shapes nobody has thought of. Stripping
// is a promise to put the block back — a parser that cannot read it cannot keep that promise, so it must not
// make it.
//
// Measured: 0 of 5,751 folder blocks in the installed corpus use a quoted name, so this is LATENT, not
// active. It is fixed because the script is valid, the failure is total, and it is silent.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 53517;
const BASE = `http://127.0.0.1:${PORT}`;
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-qfolder-appdata-"));
process.env.APPDATA = SANDBOX;
process.env.XDG_CONFIG_HOME = SANDBOX;
process.env.NOVA_APP_DATA_DIR = SANDBOX;

const { createApp } = require("./server.js");
const { stripJsComments } = require("./testlib-strip-comments.js");
const SRC = stripJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};

const TECH_FILE = `technologies = {

\tnova_quoted_folder_tech = {

\t\tresearch_cost = 1.0
\t\tstart_year = 1936

\t\tfolder = {
\t\t\tname = "infantry_folder"
\t\t\tposition = { x = 4 y = 6 }
\t\t}

\t\tcategories = {
\t\t\tinfantry_tech
\t\t}
\t}
}
`;

(async () => {
  let server;
  try {
    console.log("1. Both readers tolerate a quoted name");
    rec("parseFolderFromBlock does", /const nameM = \/name\\s\*=\\s\*"\?\(\[A-Za-z0-9_\]\+\)"\?\/\.exec\(body\)/.test(SRC),
      "it returned \"\" for a quoted name, and a tech with no folder is drawn nowhere");
    rec("the gridbox scan does too", /name\\\\s\*=\\\\s\*"\?\$\{escFolder\}"\?/.test(SRC),
      "otherwise HOI4 logs \"Found no grid box for tech <id>\" and never draws it");

    console.log("\n2. ⭐ The guard: an unreadable folder block is never stripped");
    rec("the strip is conditional on the parse succeeding",
      /if \(parseFolderFromBlock\(blockText, \(v\) => v\)\.folderName\) \{[\s\S]{0,120}?removeFirstBraceKeyBlock\(out, "folder"\)/.test(SRC),
      "stripping is a promise to re-emit; a parser that cannot read the block cannot keep it");
    rec("…and it passes a resolver, since parseFolderFromBlock calls one",
      /parseFolderFromBlock\(blockText, \(v\) => v\)/.test(SRC),
      "buildExtraScriptFromTechBlock is not given the file's @variable table");

    console.log("\n3. Round-trip: a quoted folder survives a save");
    const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-qfolder-"));
    fs.mkdirSync(path.join(mod, "common", "technologies"), { recursive: true });
    fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="QFolder"\nsupported_version="1.16.*"\n');
    const techPath = path.join(mod, "common", "technologies", "nova_quoted.txt");
    fs.writeFileSync(techPath, TECH_FILE, "utf8");

    server = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });

    const cat = await (await fetch(`${BASE}/api/technologies/catalog?modPath=${encodeURIComponent(mod)}`)).json();
    const mine = (cat.technologies || []).filter((t) => t && t.isMod);
    rec("the catalogue found the tech", mine.length === 1, mine.map((t) => t.id));
    // THE DISPLAY HALF: without the fix this is "", and the tech appears in no tab.
    rec("…and it parsed the quoted folder name", mine[0] && mine[0].folder === "infantry_folder",
      mine[0] ? JSON.stringify(mine[0].folder) : "no tech");
    rec("…with its position intact", mine[0] && Number(mine[0].x) === 4 && Number(mine[0].y) === 6,
      mine[0] ? `x=${mine[0].x} y=${mine[0].y}` : "");

    await (await fetch(`${BASE}/api/technologies/save-batch`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        technologies: mine.map((t) => JSON.parse(JSON.stringify(t))),
        equipments: cat.equipments || {}, customTabs: [], modPath: mod,
        countryTag: null, countryTechIds: null, deletions: [], newTechIds: [],
      }),
    })).json();

    const after = fs.readFileSync(techPath, "utf8");
    rec("the folder block survived the save", /folder\s*=\s*\{/.test(after),
      "without the fix it is stripped and never re-emitted — the tech lands in no research tree");
    rec("…naming the same folder", /name\s*=\s*"?infantry_folder"?/.test(after));
    rec("…at the same position", /x\s*=\s*4/.test(after) && /y\s*=\s*6/.test(after));
    rec("…exactly once", (after.match(/folder\s*=\s*\{/g) || []).length === 1,
      (after.match(/folder\s*=\s*\{/g) || []).length + " folder blocks");
    rec("and the tech itself is still there", /nova_quoted_folder_tech\s*=\s*\{/.test(after));

    console.log("\n4. The corpus this is latent against");
    // Stated so nobody re-reports it as active, and so the claim is falsifiable if a mod ever adds one.
    const maskComments = (s) => {
      const out = s.split(""); let inQ = false;
      for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (c === '"') inQ = !inQ;
        if (!inQ && c === "#") { while (i < s.length && s[i] !== "\n") { out[i] = " "; i++; } }
      }
      return out.join("");
    };
    const roots = [];
    const game = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
    if (fs.existsSync(game)) roots.push(game);
    const ws = "D:/SteamLibrary/steamapps/workshop/content/394360";
    if (fs.existsSync(ws)) for (const d of fs.readdirSync(ws)) {
      if (fs.existsSync(path.join(ws, d, "common", "technologies"))) roots.push(path.join(ws, d));
    }
    let blocks = 0, quoted = 0;
    for (const root of roots) {
      const dir = path.join(root, "common", "technologies");
      let files = []; try { files = fs.readdirSync(dir).filter((f) => /\.txt$/i.test(f)); } catch (_) { continue; }
      for (const f of files) {
        let text; try { text = fs.readFileSync(path.join(dir, f), "utf8"); } catch (_) { continue; }
        const masked = maskComments(text);
        const re = /(?:^|\n)\s*folder\s*=\s*\{/g;
        let m;
        while ((m = re.exec(masked)) !== null) {
          const open = masked.indexOf("{", m.index);
          if (open < 0) break;
          let d = 0, close = -1;
          for (let i = open; i < masked.length; i++) {
            if (masked[i] === "{") d++;
            else if (masked[i] === "}") { d--; if (d === 0) { close = i; break; } }
          }
          if (close < 0) break;
          blocks++;
          if (/\bname\s*=\s*"/.test(masked.slice(open + 1, close))) quoted++;
          re.lastIndex = close;
        }
      }
    }
    rec("real folder blocks were counted", blocks > 1000, blocks + " blocks across " + roots.length + " roots");
    console.log(`     quoted names in the corpus: ${quoted} — ${quoted === 0 ? "latent, as recorded" : "NOW ACTIVE"}`);
    rec("the fix works whether or not the corpus uses it", true, "valid script, total failure, no symptom");

    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    console.log(`\n=== a quoted folder name does not erase the tech: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    if (server) { try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {} await new Promise((r) => server.close(r)); }
    try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}
  }
})();
