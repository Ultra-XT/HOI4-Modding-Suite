// ⛔ #icon-import-no-backup — A SPIRIT'S PICTURE WAS REPLACED, AND NOTHING KEPT THE ONE IT HAD.
//
// Two routes copy a .dds over a picture the mod already has, and both did it with a bare fs.copyFileSync:
//
//   /api/ideas/import             the spirit picker's "Import into my mod": the source's <picture>.dds over the mod's own
//                                 file of that name
//   /api/ideas/import-spirit-dds  Spirit Maker's "Import DDS…", and the custom DDS of both spirit saves: the picked file
//                                 over <token>.dds, where in the spirit editor the token is the spirit's OWN picture
//
// /api/gfx/import-dds next door has backed exactly this class of file up since #import-dds-no-backup. These two never
// adopted it (I-S6 of the 1.0.7 licence review, whose section 11.1 says Nova "tries to back up a file before it changes
// it"). Measured on the base (810459f0) with the bodies the page sends: both answered 200 and replaced the old picture,
// and no backup anywhere held its bytes; the sibling, driven the same way, left one.
//
// Now each backs the picture up first, as the sibling does, and answers whether it replaced one and where the copy is.
// When the backup cannot be taken the picture is NOT replaced: the request is refused, says so, and nothing is written
// (/api/save's #backup-path-too-long is the precedent; the sibling and /api/upload-gfx go ahead without one, by design).
// A picture that is already the mod's own — the same file, or the same bytes — is no change: no backup, no refusal.
//
// The requests are the page's: their keys are read off public/app.js's fetch() calls, and a key the page sends that this
// test does not fails it. Expected bytes are the fixture's; the store asked is this test's own (its own app data).
// Binds port 0 (the OS picks it), so it claims none. Run: node test-a-spirit-picture-import-keeps-the-picture-it-replaces.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { maskJsComments, maskJsLiterals } = require("./testlib-strip-comments.js");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-spiritpic-"));
// This test's own app data (so the backup store below is its alone), home, game user folder and Documents; its own mods
// folder; no game install looked for, and an empty Workshop.
const APP = path.join(ROOT, "appdata");
Object.assign(process.env, {
  APPDATA: APP, XDG_CONFIG_HOME: APP, NOVA_APP_DATA_DIR: APP, NOVA_HOME_DIR: path.join(ROOT, "home"),
  HOI4_USER_DIR: path.join(ROOT, "hoi4-user"), NOVA_DOCUMENTS_DIR: path.join(ROOT, "Documents"),
  HOI4_MODS_ROOT: path.join(ROOT, "mods"), NOVA_TEST_GAME_DETECTION: "off", HOI4_WORKSHOP_ROOT: path.join(ROOT, "workshop"),
});
for (const d of ["appdata", "home", "hoi4-user", "Documents", "mods", "workshop"]) fs.mkdirSync(path.join(ROOT, d), { recursive: true });
const server = require("./server.js");
const safeWrite = require("./safe-write.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700));
  }
}

const BACKUP_DIR = server.constants && server.constants.BACKUP_DIR;
const MODS = process.env.HOI4_MODS_ROOT;
const posix = (p) => p.split(path.sep).join("/");
const inside = (p, dir) => !!p && path.resolve(p).toLowerCase().startsWith(path.resolve(dir).toLowerCase() + path.sep);
// A plausible DDS whose bytes say which one it is: the marker at 128 is what every check below compares, with the rest.
const dds = (tag) => { const b = Buffer.alloc(256, 0); b.write("DDS ", 0, "latin1"); b.writeUInt32LE(124, 4); b.write(tag, 128, "latin1"); return b; };
const put = (file, bytes) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes); return file; };
const tagOf = (file) => { try { return fs.readFileSync(file).slice(128, 136).toString("latin1").replace(/\0+$/, ""); } catch (_) { return "(none)"; } };
function mkMod(name) {
  const dir = path.join(MODS, name);
  fs.mkdirSync(path.join(dir, "common", "ideas"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), `name="${name}"\nsupported_version="1.17.*"\n`);
  fs.writeFileSync(path.join(MODS, `${name}.mod`), `name="${name}"\npath="${posix(dir)}"\nsupported_version="1.17.*"\n`);
  return dir;
}
// Every file of the backup store that holds exactly these bytes.
const backupsHolding = (bytes) => {
  let names = [];
  try { names = fs.readdirSync(BACKUP_DIR); } catch (_) { return []; }
  return names.filter((n) => { try { return fs.readFileSync(path.join(BACKUP_DIR, n)).equals(bytes); } catch (_) { return false; } });
};
const backupCount = () => { try { return fs.readdirSync(BACKUP_DIR).length; } catch (_) { return 0; } };
// Every file under a folder, with its bytes: "nothing was written" is asked of the disk, not of the answer.
const snapshot = (dir) => {
  const out = {};
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else out[posix(path.relative(dir, p))] = fs.readFileSync(p).toString("base64"); } };
  walk(dir);
  return out;
};
const sameSnapshot = (a, b) => JSON.stringify(Object.keys(a).sort().map((k) => [k, a[k]])) === JSON.stringify(Object.keys(b).sort().map((k) => [k, b[k]]));

// ── the requests, as the page sends them ────────────────────────────────────────────────────────────────────────
// The keys of the object each fetch() of a route posts, read off public/app.js: found in the comment-masked text (one of these
// bodies carries a comment block between its keys), its braces counted in the literal-masked one (same length), so a `,` or `:`
// inside a string is not read as the code's. One key set per call site.
const APPJS_RAW = fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8");
const APPJS = maskJsComments(APPJS_RAW), APPJS_CODE = maskJsLiterals(APPJS_RAW);
function clientBodyKeys(route) {
  const sites = [];
  const needle = `fetch("${route}"`;
  for (let at = APPJS.indexOf(needle); at !== -1; at = APPJS.indexOf(needle, at + 1)) {
    const b = APPJS.indexOf("body: JSON.stringify(", at);
    if (b === -1 || b - at > 600) { sites.push(null); continue; }
    let i = APPJS_CODE.indexOf("{", b), depth = 0, keys = [], token = "";
    for (; i < APPJS_CODE.length; i++) {
      const c = APPJS_CODE[i];
      if (c === "{" || c === "(" || c === "[") { depth++; if (depth === 1) token = ""; continue; }
      if (c === "}" || c === ")" || c === "]") { depth--; if (depth === 0) break; continue; }
      if (depth !== 1) continue;
      if (c === ":" || c === ",") { const k = token.trim(); if (/^[A-Za-z_$][\w$]*$/.test(k)) keys.push(k); token = c === "," ? "" : "\u0000"; continue; }
      if (token !== "\u0000") token += c;
    }
    const tail = token.trim();
    if (/^[A-Za-z_$][\w$]*$/.test(tail)) keys.push(tail);   // a shorthand last key
    sites.push([...new Set(keys)].sort());
  }
  return sites;
}
const SHAPES = {};
for (const route of ["/api/ideas/import", "/api/ideas/import-spirit-dds", "/api/gfx/import-dds"]) SHAPES[route] = clientBodyKeys(route);
console.log("\n[the requests are the page's]");
for (const [route, sites] of Object.entries(SHAPES)) {
  const shapes = [...new Set(sites.map((s) => JSON.stringify(s)))];
  rec(`PRECONDITION: public/app.js posts to ${route} from ${sites.length} place(s), all with one body shape (${shapes.join(" | ")})`,
    sites.length > 0 && !sites.includes(null) && shapes.length === 1, sites);
}
// A request built here must carry exactly the keys the page sends: one the page sends and this test does not would make the
// request below one no modder ever makes.
function asThePageSends(route, body) {
  const want = (SHAPES[route] || [])[0] || [];
  const have = Object.keys(body).sort();
  rec(`the ${route} request carries exactly the page's keys (${want.join(", ")})`, JSON.stringify(want) === JSON.stringify(have), { page: want, test: have });
  return body;
}

// ── the fixture ───────────────────────────────────────────────────────────────────────────────────────────────
const SPIRIT = "pic_spirit", PICTURE = "pic_spirit_art";
const SOURCE = mkMod("srcmod");
fs.writeFileSync(path.join(SOURCE, "common", "ideas", "src_ideas.txt"),
  `ideas = {\n\tcountry = {\n\t\t${SPIRIT} = {\n\t\t\tpicture = ${PICTURE}\n\t\t\tmodifier = { political_power_factor = 0.1 }\n\t\t}\n\t}\n}\n`);
put(path.join(SOURCE, "localisation", "english", "srcmod_l_english.yml"), Buffer.from(`﻿l_english:\n ${SPIRIT}:0 "Picture Spirit"\n`, "utf8"));
const NEW1 = dds("NEW1"), OLD1 = dds("OLD1"), NEW2 = dds("NEW2"), OLD2 = dds("OLD2"), NEW3 = dds("NEW3"), OLD3 = dds("OLD3");
const FRESH = dds("FRESH"), DEEPOLD = dds("DEEPOLD"), DEEPNEW = dds("DEEPNEW");
put(path.join(SOURCE, "gfx", "interface", "ideas", `${PICTURE}.dds`), NEW1);
const MINE = mkMod("mymod");
const MINE_PICTURE = put(path.join(MINE, "gfx", "interface", "ideas", `${PICTURE}.dds`), OLD1);     // the mod's own picture of that name
const MINE_TOKEN2 = put(path.join(MINE, "gfx", "interface", "ideas", "own_spirit_pic.dds"), OLD2);   // a spirit's own picture
// a file the modder picks: under the mods folder, which is where /api/ideas/import-spirit-dds takes a source from (isWithinRoots)
const PICKED2 = put(path.join(MODS, "picked", "own_spirit_pic.dds"), NEW2);
const PICKED_FRESH = put(path.join(MODS, "picked", "brand_new_pic.dds"), FRESH);
const PICKED_DEEP = put(path.join(MODS, "picked", "deep_pic.dds"), DEEPNEW);
// /api/gfx/import-dds's own case, for the control
const GOAL = put(path.join(MINE, "gfx", "interface", "goals", "probe_focus.dds"), OLD3);
const PICKED3 = put(path.join(MODS, "picked", "probe_focus_new.dds"), NEW3);

// Mods deep enough that a backup of their picture cannot be taken: the backup's name spells out the picture's whole path and
// passes the 255 characters one name may have. Derived, not typed: the shortest folder name that does it here, under this
// machine's temp folder, with a one-letter reason, so whatever reason a route backs up with makes it longer still. Two of
// them, of one length, one per route: what one route wrongly writes cannot then fail the other's checks.
let deepNames = [], deepBackupName = 0;
for (let k = 1; k <= 240; k++) {
  const names = ["deepa_", "deepb_"].map((p) => p + "d".repeat(k));
  const lens = names.map((n) => path.basename(safeWrite.buildBackupPath(path.join(MODS, n, "gfx", "interface", "ideas", `${PICTURE}.dds`), "x")).length);
  if (lens.every((l) => l > 255)) { deepNames = names; deepBackupName = Math.min(...lens); break; }
}
const [DEEP_A, DEEP_B] = deepNames.map((n) => { const dir = mkMod(n); put(path.join(dir, "gfx", "interface", "ideas", `${PICTURE}.dds`), DEEPOLD); return dir; });
const deepPicture = (dir) => path.join(dir, "gfx", "interface", "ideas", `${PICTURE}.dds`);

console.log("\n[preconditions]");
rec("PRECONDITION: the backup store is this test's own", !!BACKUP_DIR && inside(BACKUP_DIR, ROOT), { BACKUP_DIR, ROOT });
rec("PRECONDITION: no backup holds any fixture picture yet", [OLD1, OLD2, OLD3, DEEPOLD].every((b) => backupsHolding(b).length === 0), backupCount());
rec(`PRECONDITION: two mod folder names of ${(deepNames[0] || "").length} characters make the backup's name ${deepBackupName} long (over 255)`,
  !!DEEP_A && !!DEEP_B && deepBackupName > 255 && deepNames[0].length < 250, { deepNames: deepNames.map((n) => n.length), deepBackupName });

const srv = server.createApp().listen(0, "127.0.0.1", async () => {
  const PORT = srv.address().port;
  const post = async (url, body) => {
    const r = await fetch(`http://127.0.0.1:${PORT}${url}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) { json = { unparsed: text.slice(0, 300) }; }
    return { status: r.status, body: json };
  };
  try {
    console.log("\n[control] the store this test reads does show a backup when one is taken (/api/gfx/import-dds, next door)");
    {
      const r = await post("/api/gfx/import-dds", asThePageSends("/api/gfx/import-dds", { sourcePath: PICKED3, focusId: "probe_focus", modPath: MINE }));
      const held = backupsHolding(OLD3);
      rec("CONTROL: the sibling replaced its picture and says it did", r.status === 200 && r.body.ok === true && r.body.overwrote === true && tagOf(GOAL) === "NEW3", { r, now: tagOf(GOAL) });
      rec("CONTROL: …and the store holds the old bytes, under the name it answered", held.length === 1 && held[0] === r.body.backupPath, { held, answered: r.body.backupPath });
    }

    console.log("\n[/api/ideas/import] the spirit picker's \"Import into my mod\", over a picture of that name the mod already has");
    {
      rec("(fixture) the mod's own picture holds its own bytes", tagOf(MINE_PICTURE) === "OLD1", tagOf(MINE_PICTURE));
      const r = await post("/api/ideas/import", asThePageSends("/api/ideas/import", { ideaId: SPIRIT, modPath: MINE, sourceModRoot: SOURCE, targetLocalizationPath: "" }));
      rec("the import succeeded, the icon with it", r.status === 200 && r.body.ok === true && Array.isArray(r.body.imported) && r.body.imported.includes("icon") && r.body.iconCopied === true, r);
      rec("the source's picture is in place", tagOf(MINE_PICTURE) === "NEW1", tagOf(MINE_PICTURE));
      const held = backupsHolding(OLD1);
      rec("⭐ the picture it replaced is in the backup store, byte for byte", held.length === 1, { held, backups: backupCount() });
      rec("…and the answer says it replaced one, and names that backup", r.body.iconOverwrote === true && held.length === 1 && r.body.iconBackupPath === held[0],
        { iconOverwrote: r.body.iconOverwrote, iconBackupPath: r.body.iconBackupPath, held });

      const before = backupCount();
      const again = await post("/api/ideas/import", { ideaId: SPIRIT, modPath: MINE, sourceModRoot: SOURCE, targetLocalizationPath: "" });
      rec("importing it again, onto the same picture, replaces nothing and takes no backup of it",
        again.status === 200 && again.body.ok === true && again.body.iconOverwrote === false && again.body.iconBackupPath === "" && backupsHolding(NEW1).length === 0,
        { again: again.body, backupsOfTheSamePicture: backupsHolding(NEW1).length, before, after: backupCount() });
    }

    console.log("\n[/api/ideas/import-spirit-dds] a custom DDS over a spirit's own picture");
    {
      const r = await post("/api/ideas/import-spirit-dds", asThePageSends("/api/ideas/import-spirit-dds", { sourcePath: PICKED2, pictureToken: "own_spirit_pic", modPath: MINE }));
      rec("the import succeeded", r.status === 200 && r.body.ok === true && r.body.copiedTo === "gfx/interface/ideas/own_spirit_pic.dds", r);
      rec("the picked picture is in place", tagOf(MINE_TOKEN2) === "NEW2", tagOf(MINE_TOKEN2));
      const held = backupsHolding(OLD2);
      rec("⭐ the spirit's own picture is in the backup store, byte for byte", held.length === 1, { held, backups: backupCount() });
      rec("…and the answer says it replaced one, and names that backup, as /api/gfx/import-dds answers", r.body.overwrote === true && held.length === 1 && r.body.backupPath === held[0],
        { overwrote: r.body.overwrote, backupPath: r.body.backupPath, held });

      const again = await post("/api/ideas/import-spirit-dds", { sourcePath: PICKED2, pictureToken: "own_spirit_pic", modPath: MINE });
      rec("the same picture again replaces nothing and takes no backup of it",
        again.status === 200 && again.body.ok === true && again.body.overwrote === false && again.body.backupPath === "" && backupsHolding(NEW2).length === 0, again.body);
      const self = await post("/api/ideas/import-spirit-dds", { sourcePath: MINE_TOKEN2, pictureToken: "own_spirit_pic", modPath: MINE });
      rec("…nor does picking the mod's own file for its own name", self.status === 200 && self.body.ok === true && self.body.overwrote === false && tagOf(MINE_TOKEN2) === "NEW2" && backupsHolding(NEW2).length === 0, self.body);

      const first = await post("/api/ideas/import-spirit-dds", { sourcePath: PICKED_FRESH, pictureToken: "brand_new_pic", modPath: MINE });
      const freshTarget = path.join(MINE, "gfx", "interface", "ideas", "brand_new_pic.dds");
      rec("a picture the mod does not have yet is simply copied in: nothing replaced, no backup",
        first.status === 200 && first.body.ok === true && first.body.overwrote === false && first.body.backupPath === "" && tagOf(freshTarget) === "FRESH", first.body);
    }

    console.log("\n[refused] a picture whose backup cannot be taken is not replaced, and the answer says so");
    if (DEEP_A && DEEP_B) {
      const before = backupCount();
      const diskA = snapshot(DEEP_A);
      const r1 = await post("/api/ideas/import", { ideaId: SPIRIT, modPath: DEEP_A, sourceModRoot: SOURCE, targetLocalizationPath: "" });
      rec("⭐ /api/ideas/import refuses", r1.status === 400 && r1.body.ok === false, r1);
      rec("…and says why (the backup's name is over the 255 one name may have), and that nothing was written",
        /could not back it up/.test(String(r1.body.error)) && /Nothing was written/.test(String(r1.body.error)) && /\b255\b/.test(String(r1.body.error)), r1.body.error);
      rec("⭐ …and nothing was: the mod's files are byte for byte as they were (no definition, no name, no picture)",
        sameSnapshot(diskA, snapshot(DEEP_A)) && tagOf(deepPicture(DEEP_A)) === "DEEPOLD", { before: Object.keys(diskA), after: Object.keys(snapshot(DEEP_A)) });
      const diskB = snapshot(DEEP_B);
      const r2 = await post("/api/ideas/import-spirit-dds", { sourcePath: PICKED_DEEP, pictureToken: PICTURE, modPath: DEEP_B });
      rec("⭐ /api/ideas/import-spirit-dds refuses", r2.status === 400 && r2.body.ok === false, r2);
      rec("…and says why, and that nothing was written", /could not back it up/.test(String(r2.body.error)) && /Nothing was written/.test(String(r2.body.error)), r2.body.error);
      rec("⭐ …and nothing was: no picture replaced, no sprite file written", sameSnapshot(diskB, snapshot(DEEP_B)) && tagOf(deepPicture(DEEP_B)) === "DEEPOLD",
        { before: Object.keys(diskB), after: Object.keys(snapshot(DEEP_B)) });
      // What a refusal promises is this import's own (review M2). It said "Nova does not replace a file it has not first backed
      // up", which is false: safeModWrite, the sibling and /api/upload-gfx write on when their backup fails, and the licence this
      // release ships says Nova "tries to back up a file before it changes it, but it may not do so in every case" (11.1).
      const novaWide = /\bNova\b[^.]*\b(?:(?:does not|doesn't|never|will not|won't)\s+(?:replace|overwrite|write|change)|always\s+backs?\s+up)/i;
      rec("⭐ …and what both refusals promise is the import's own, not a rule of every write Nova makes",
        [r1, r2].every((r) => /\bthis import\b/i.test(String(r.body.error)) && !novaWide.test(String(r.body.error))), [r1.body.error, r2.body.error]);
      rec("(the refusals left no backup either: there was none to leave)", backupCount() === before, { before, after: backupCount() });
      // CONTROL: the refusal is about the backup, not about the deep mod. The helper itself cannot back these pictures up, and can
      // back up one at an ordinary depth; and the same mod takes a picture it does not have yet (nothing to back up).
      rec("CONTROL: the asset backup itself fails for the deep pictures, and works for an ordinary one",
        [DEEP_A, DEEP_B].every((d) => safeWrite.backupAssetBeforeOverwrite(deepPicture(d), "spirit-dds") === "") && !!safeWrite.backupAssetBeforeOverwrite(MINE_PICTURE, "spirit-dds"));
      const fresh = await post("/api/ideas/import-spirit-dds", { sourcePath: PICKED_FRESH, pictureToken: "brand_new_pic", modPath: DEEP_B });
      rec("CONTROL: …and the deep mod takes a picture it does not have yet", fresh.status === 200 && fresh.body.ok === true && fresh.body.overwrote === false
        && tagOf(path.join(DEEP_B, "gfx", "interface", "ideas", "brand_new_pic.dds")) === "FRESH", fresh.body);
    }

    console.log(`\n=== a spirit picture import keeps the picture it replaces: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { srv.closeAllConnections(); } catch (_) {}
    srv.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* this test's own scratch folder */ }
  }
});
srv.on("error", (e) => { console.error("listen error:", e.message); process.exitCode = 1; });
