// ⛔ #folder-list-ignores-file-replacement — HOI4 REPLACES A common/ FILE WHOLESALE AT THE SAME PATH.
//
// A mod shipping its own common/technology_tags/00_technology.txt replaces vanilla's outright, so the
// research folders vanilla declares there DO NOT LOAD. Both folder readers walked every root and merged, so
// those folders were offered anyway. Measured against the install:
//
//     Old World Blues   ships 00_technology.txt, declares 22   ->  13 vanilla folders do not load; Nova said 35
//     Millennium Dawn   ships 00_technology.txt, declares 18   ->   5 vanilla folders do not load; Nova said 23
//
// So a modder on Old World Blues was shown Infantry, Support Companies, Armor, Artillery, Naval, Industry and
// Electronics tabs the game will never draw — and a technology filed into one of them goes nowhere. This is
// the maker's core question ("does this show what the GAME will show?") answered wrongly.
//
// ⭐ server.js already knew the rule in three other places: the equipment collector (#equip-same-filename),
// the technology collector (#tech-catalog-ignores-same-filename), and the tech WRITER, which refuses to
// create such a shadow at all. CLAUDE.md records that four separate readers missed it; these were two more.
//
// ⚠️ CONTROLS MATTER MORE THAN THE FIX HERE. Three of the five installed mods must be UNAFFECTED: Road to 56
// ships r56e_technology.txt (a different basename, so it inherits all 16), while Novum Vexillum and Rise of
// Nations shadow the file but re-declare everything in it. A prune that also trimmed those would be a worse
// bug than the one it replaced.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 53535;
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-foldrepl-"));
process.env.APPDATA = SANDBOX;
process.env.XDG_CONFIG_HOME = SANDBOX;
process.env.NOVA_APP_DATA_DIR = SANDBOX;

const { createApp } = require("./server.js");
const { stripJsComments } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";

// An INDEPENDENT parse: the technology_folders keys one .txt declares.
function foldersIn(file) {
  const keys = [];
  let text;
  try { text = fs.readFileSync(file, "utf8"); } catch (_) { return keys; }
  const clean = text.replace(/#[^\n]*/g, "");
  const at = clean.search(/technology_folders\s*=\s*\{/);
  if (at === -1) return keys;
  const open = clean.indexOf("{", at);
  let d = 0, close = -1;
  for (let i = open; i < clean.length; i++) {
    if (clean[i] === "{") d++;
    else if (clean[i] === "}") { d--; if (!d) { close = i; break; } }
  }
  const inner = clean.slice(open + 1, close === -1 ? clean.length : close);
  const re = /([A-Za-z0-9_]+)\s*=\s*\{/g;
  let m;
  while ((m = re.exec(inner))) {
    keys.push(m[1]);
    let o2 = inner.indexOf("{", m.index), dd = 0, c2 = -1;
    for (let i = o2; i < inner.length; i++) {
      if (inner[i] === "{") dd++;
      else if (inner[i] === "}") { dd--; if (!dd) { c2 = i; break; } }
    }
    if (c2 === -1) break;
    re.lastIndex = c2 + 1;
  }
  return keys;
}
const tagFiles = (root) => {
  try { return fs.readdirSync(path.join(root, "common", "technology_tags")).filter((f) => f.toLowerCase().endsWith(".txt")); }
  catch (_) { return []; }
};
// What the GAME loads: for each basename, only the highest-priority root that ships it.
function expectedFolders(modRoot) {
  const roots = [modRoot, GAME].filter(Boolean); // mod first
  const owner = new Map();
  for (const r of roots) for (const f of tagFiles(r)) { const b = f.toLowerCase(); if (!owner.has(b)) owner.set(b, r); }
  const out = new Set();
  for (const r of roots) {
    for (const f of tagFiles(r)) {
      if (owner.get(f.toLowerCase()) !== r) continue;
      for (const k of foldersIn(path.join(r, "common", "technology_tags", f))) out.add(k);
    }
  }
  return out;
}

(async () => {
  let server;
  try {
    const SERVER = stripJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));

    console.log("1. Both readers apply the same ownership prune");
    rec("there is one owner for the rule", /function ownedTechnologyTagFiles\(roots\)/.test(SERVER));
    const uses = (SERVER.match(/const owned = ownedTechnologyTagFiles\(roots\);/g) || []).length;
    rec("…adopted by BOTH folder readers", uses === 2, uses + " call sites");
    const filters = (SERVER.match(/owned\.get\(f\.toLowerCase\(\)\) === root/g) || []).length;
    rec("…and both actually filter on it", filters === 2, filters + " filters");
    rec("the owner takes the FIRST root, because roots arrive mod-first",
      /if \(!owner\.has\(b\)\) owner\.set\(b, root\);/.test(SERVER),
      "last-wins here would keep vanilla's copy — backwards");

    console.log("\n2. Measured against every installed root");
    if (!fs.existsSync(path.join(GAME, "common", "technology_tags"))) {
      rec("a vanilla install to measure against", false, "cannot verify");
    } else {
      server = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
      const served = async (root) => {
        const b = await (await fetch(`http://127.0.0.1:${PORT}/api/research/gui-layout?modPath=${encodeURIComponent(root)}`)).json();
        return b.allFolders || [];
      };

      const vanillaFolders = expectedFolders(GAME);
      rec("vanilla declares a folder set to inherit", vanillaFolders.size >= 10, vanillaFolders.size);

      const roots = [["vanilla", GAME]];
      try {
        for (const d of fs.readdirSync(WS)) {
          const p = path.join(WS, d);
          if (tagFiles(p).length) roots.push([d, p]);
        }
      } catch (_) {}
      rec("there are installed mods with folder files", roots.length > 2, roots.length + " roots");

      // ⚠️ The fixture must contain BOTH kinds, or this measures only half the rule.
      const shadows = roots.filter(([, p]) => p !== GAME && tagFiles(p).some((f) => f.toLowerCase() === "00_technology.txt"));
      const inherits = roots.filter(([, p]) => p !== GAME && !tagFiles(p).some((f) => f.toLowerCase() === "00_technology.txt"));
      rec("…some SHADOW vanilla's file", shadows.length > 0, shadows.map(([n]) => n));
      rec("…and some do NOT", inherits.length > 0, inherits.map(([n]) => n));

      for (const [label, root] of roots) {
        const got = new Set(await served(root));
        const want = expectedFolders(root);
        const extra = [...got].filter((k) => !want.has(k));
        const missing = [...want].filter((k) => !got.has(k));
        rec(`${label}: serves exactly the folders the game loads`, extra.length === 0 && missing.length === 0,
          `served ${got.size}, expected ${want.size}` + (extra.length ? ` | extra: ${extra.slice(0, 6)}` : "")
          + (missing.length ? ` | missing: ${missing.slice(0, 6)}` : ""));
      }

      console.log("\n3. ⭐ Controls — the mods that must NOT be trimmed");
      for (const [label, root] of inherits) {
        const got = new Set(await served(root));
        const stillInherited = [...vanillaFolders].filter((k) => got.has(k));
        rec(`${label} still inherits vanilla's folders`, stillInherited.length === vanillaFolders.size,
          `${stillInherited.length} of ${vanillaFolders.size}`);
      }
      // A mod that shadows the file but RE-DECLARES everything must also keep them.
      for (const [label, root] of shadows) {
        const own = new Set(tagFiles(root).flatMap((f) => foldersIn(path.join(root, "common", "technology_tags", f))));
        const redeclaresAll = [...vanillaFolders].every((k) => own.has(k));
        if (!redeclaresAll) continue;
        const got = new Set(await served(root));
        rec(`${label} shadows the file but re-declares all of them, so nothing is lost`,
          [...vanillaFolders].every((k) => got.has(k)), "re-declared folders must survive the prune");
      }

      console.log("\n4. The old behaviour, composed");
      // The union across roots with no prune — what every reader used to do.
      const OLD_UNION = (modRoot) => {
        const out = new Set();
        for (const r of [modRoot, GAME]) {
          for (const f of tagFiles(r)) for (const k of foldersIn(path.join(r, "common", "technology_tags", f))) out.add(k);
        }
        return out;
      };
      let provedOn = 0;
      for (const [label, root] of shadows) {
        const oldSet = OLD_UNION(root), want = expectedFolders(root);
        const phantom = [...oldSet].filter((k) => !want.has(k));
        if (!phantom.length) continue;   // NV / RoN re-declare everything — correctly no phantoms
        provedOn++;
        rec(`${label}: the old union invented ${phantom.length} tabs the game never draws`, phantom.length > 0,
          phantom.slice(0, 6));
        const got = new Set(await served(root));
        rec(`…and none of them is served now`, phantom.every((k) => !got.has(k)));
      }
      // If no installed mod exposed the bug, everything above passed while measuring nothing.
      rec("at least one installed mod actually exhibited the bug", provedOn > 0, provedOn + " mods");
    }

    console.log(`\n=== a replaced folder file does not add tabs: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    if (server) { try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {} await new Promise((r) => server.close(r)); }
    try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}
  }
})();
