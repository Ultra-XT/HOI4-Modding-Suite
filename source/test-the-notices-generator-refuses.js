// ⛔ #the-notices-generator-refuses — A BUILD WHOSE NOTICES ARE INCOMPLETE MUST STOP, AND SAY WHY.
//
// scripts/gen-third-party-notices.js runs before every `npm run build` and writes THIRD-PARTY-NOTICES.txt from what is
// installed. It is the only thing between a build and shipping other people's code without the notices their licences
// ask for (1.0.4 to 1.0.6 shipped none for libvips): electron-builder only warns about a missing extraFiles source. So
// every policy failure its design lists (the licence workflow's THIRD-PARTY-NOTICES.md, sections 3.5 and 3.6) must make
// it refuse, exit 1, and name the rule — and a clean tree must pass, or the refusals prove nothing.
//
// Each case below is ONE change to a clean fixture, and must be refused for its own rule. The fixture is built from the
// repo's own third-party/ folder (the real templates, the real vendored texts and pins), the real package.json build
// configuration, the real sharp README and versions.json, and fake binaries pinned in a copy of the real
// reviewed-binaries.json. The rule list comes from the generator itself: a rule added there without a case here fails.
//
// The clean fixture's notices are also read for what they CARRY, not only for what they name: each package's declared
// licence on its entry's own line, its licence and NOTICE files inside that entry, sharp's table of the libraries inside
// libvips-42.dll inside sharp's entry, every vendored text a template includes, right under that template's own line,
// the copyright lines of the LGPL components (Chromium's credits for FFmpeg and WebKit, lgpl-copyright-lines.txt, the
// launcher's plug-ins) inside the LGPL block and no copyright line besides those, and the pinned source location of
// every LGPL and MPL component inside the LGPL block. Each is read out of the fixture, never typed here. Nothing else can
// see a dropped text: gate G2 (--check) compares the shipped file with the text the same code derives, so a generator
// that lists package names without their licences passes it (lic-final review, M1, 2026-11-19).
//
// #the-notices-need-no-manual-step (the owner's decision, 2026-11-20) — the design asked a person to copy each libvips
// library's copyright lines into third-party/notices/lgpl-copyright-lines.txt and to attach the LGPL sources to the
// release page, and every build refused until then. Nobody will: the owner uploads the exe by hand, and is stopping.
// So that file is optional (when present it is still carried and checked), the notices say where those libraries'
// copyright notices are instead of inventing any, and every source location is a pinned upstream one.
"use strict";

// #a-bare-test-run-writes-into-the-real-app-data — FIRST: run bare, the generator this starts inherits the sandbox.
require("./safe-write.js");
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

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

const ROOT = __dirname;
const GEN_PATH = path.join(ROOT, "scripts", "gen-third-party-notices.js");
const GEN = require(GEN_PATH);
const asar = require("@electron/asar");

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const lfBytes = (buf) => Buffer.from(buf.toString("latin1").replace(/\r\n/g, "\n"), "latin1");
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
function write(p, data) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); }
function editJson(p, fn) { const j = readJson(p); fn(j); write(p, JSON.stringify(j, null, 2) + "\n"); }
function editText(p, fn) { write(p, fn(fs.readFileSync(p, "utf8"))); }
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.isDirectory()) copyDir(path.join(src, e.name), path.join(dst, e.name));
    else fs.copyFileSync(path.join(src, e.name), path.join(dst, e.name));
  }
}
/** SHA256SUMS for every .txt in dir, as the repo's own are kept: a deliberate edit to a pinned text is re-pinned. */
function repin(dir) {
  const lines = fs.readdirSync(dir).filter((x) => /\.txt$/i.test(x)).sort().map((x) => `${sha256(lfBytes(fs.readFileSync(path.join(dir, x))))}  ${x}`);
  fs.writeFileSync(path.join(dir, "SHA256SUMS"), lines.join("\n") + "\n");
}
/** A fake Windows binary: "MZ", then bytes that are this name's alone. */
const fakePe = (name) => Buffer.concat([Buffer.from("MZ", "latin1"), crypto.createHash("sha512").update("fixture binary " + name).digest(), Buffer.alloc(64, 7)]);

// What the fixture copies from the repo, read once.
const REAL_PKG = readJson(path.join(ROOT, "package.json"));
const REAL_TP = path.join(ROOT, "third-party");
const REAL_REVIEWED = readJson(path.join(REAL_TP, "reviewed-binaries.json"));
const REAL_ELECTRON_SOURCES = readJson(path.join(REAL_TP, "electron-sources.json"));
const REAL_VENDORED = readJson(path.join(REAL_TP, "licenses", "VENDORED.json"));
// The installed package's folder ("./package" is the subpath its exports map gives package.json).
const SHARP_DIR = path.dirname(require.resolve("@img/sharp-win32-x64/package", { paths: [ROOT] }));
const REAL_SPEC_META = readJson(path.join(ROOT, "data", "hoi4-spec.json"))._meta;
const { RELEASES_URL } = require(path.join(ROOT, "update-checker.js"));
// The extraResources source as it is spelled on disk in this repo (git tracks Texconv.exe; package.json says
// texconv.exe), so the fixture keeps the same mismatch the generator has to match case-insensitively.
const onDiskName = (rel) => (fs.readdirSync(path.join(ROOT, path.dirname(rel))).find((n) => n.toLowerCase() === path.basename(rel).toLowerCase()) || path.basename(rel));

const BASE = fs.mkdtempSync(path.join(os.tmpdir(), "nova-notices-refuses-"));
let fixtureCount = 0;

function creditsHtml(opts) {
  const o = opts || {};
  const entry = (title, pre) => `<div class="product">\n<span class="title">${title}</span>\n<span class="homepage"><a href="https://example.invalid/">homepage</a></span>\n<div class="licence">\n<pre>${pre}</pre>\n</div>\n</div>\n`;
  const lgpl = (v, kind) => `                  GNU ${kind} GENERAL PUBLIC LICENSE\n                       Version ${v}\n\n Copyright (C) 1991, 1999 Free Software Foundation, Inc.\n (the rest of the licence, in the fixture)\n`;
  return "<!doctype html><html><body>\n" +
    entry("some other product", "Copyright (c) 2010 Someone Else\n\nPermission is hereby granted (fixture).\n") +
    entry("ffmpeg", "Copyright (c) 2000-2024 the FFmpeg developers (fixture)\n\n" + (o.ffmpegLgpl === false ? "(no licence text)\n" : lgpl("2.1, February 1999", "LESSER"))) +
    entry("WebKit", "Copyright (C) 2009 Apple Inc. All rights reserved. (fixture)\nCopyright (C) 2011 Google Inc. (fixture)\n\n" + (o.webkitLgpl === false ? "(no licence text)\n" : lgpl("2, June 1991", "LIBRARY"))) +
    "</body></html>\n";
}

/** A clean app root, with Electron, sharp, a dependency, data, the game and the Workshop beside it. */
function makeFixture() {
  const dir = path.join(BASE, "case-" + (++fixtureCount));
  const app = path.join(dir, "app");
  const nm = path.join(app, "node_modules");
  const electron = path.join(nm, "electron");
  const fx = { dir, app, nm, electron, game: path.join(dir, "game"), workshop: path.join(dir, "workshop"), tp: path.join(app, "third-party") };
  // package.json: the real build configuration, a fixture's own name, version and dependencies.
  const build = JSON.parse(JSON.stringify(REAL_PKG.build));
  build.productName = "Fixture App";
  fx.pkg = { name: "fixture-app", version: "9.9.9", main: "main.js", license: REAL_PKG.license,
    dependencies: { alpha: "^1.0.0", "@img/sharp-win32-x64": readJson(path.join(SHARP_DIR, "package.json")).version },
    devDependencies: { electron: REAL_ELECTRON_SOURCES.electron }, build };
  write(path.join(app, "package.json"), JSON.stringify(fx.pkg, null, 2) + "\n");
  fs.copyFileSync(path.join(ROOT, "LICENSE"), path.join(app, "LICENSE"));
  fs.copyFileSync(path.join(ROOT, "update-checker.js"), path.join(app, "update-checker.js"));
  write(path.join(app, "main.js"), "// fixture\n");
  write(path.join(app, "public", "index.html"), "<!doctype html><title>fixture</title>\n");
  write(path.join(app, "public", "logo.png"), Buffer.from("fixture logo, Nova's own " + fixtureCount, "latin1"));
  // A data file that carries its own licence line, as data/hoi4-spec.json does, for the same upstream.
  const dataText = REAL_VENDORED.texts.find((t) => t.component && String(t.upstream).replace(/\.git$/, "") === String(REAL_SPEC_META.source).replace(/\.git$/, ""));
  fx.dataSpdx = dataText ? dataText.spdx : "MIT";
  write(path.join(app, "data", "spec.json"), JSON.stringify({ _meta: { source: REAL_SPEC_META.source, license: `${fx.dataSpdx} (c) the fixture; see ${GEN.NOTICES_FILE}` }, effects: [] }, null, 1) + "\n");
  // The extraResources binaries, spelled as on disk here.
  fx.resources = [];
  for (const r of build.extraResources || []) {
    const from = typeof r === "string" ? r : r.from;
    const file = path.join(app, path.dirname(from), onDiskName(from));
    write(file, fakePe(path.basename(from).toLowerCase()));
    fx.resources.push({ from, to: typeof r === "string" ? r : (r.to || r.from), file });
  }
  // node_modules: one MIT dependency, sharp's Windows package (the real README and versions.json), Electron.
  write(path.join(nm, "alpha", "package.json"), JSON.stringify({ name: "alpha", version: "1.0.0", license: "MIT" }) + "\n");
  write(path.join(nm, "alpha", "LICENSE"), "MIT License\n\nCopyright (c) 2026 Fixture Alpha\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this fixture.\n");
  const sharpPj = readJson(path.join(SHARP_DIR, "package.json"));
  fx.sharp = path.join(nm, "@img", "sharp-win32-x64");
  write(path.join(fx.sharp, "package.json"), JSON.stringify({ name: sharpPj.name, version: sharpPj.version, license: sharpPj.license }) + "\n");
  write(path.join(fx.sharp, "LICENSE"), "Apache License, Version 2.0 (the fixture's stand-in for sharp's own text)\n");
  // A NOTICE file, which an Apache-2.0 package may carry and the notices must then reproduce (Apache-2.0 s.4(d)). No
  // package Nova ships has one today, so only a fixture can show that one would not be dropped.
  write(path.join(fx.sharp, "NOTICE"), "NOTICE (the fixture's stand-in)\nThis product includes software developed by the fixture's sharp authors.\n");
  fs.copyFileSync(path.join(SHARP_DIR, "README.md"), path.join(fx.sharp, "README.md"));
  fs.copyFileSync(path.join(SHARP_DIR, "versions.json"), path.join(fx.sharp, "versions.json"));
  write(path.join(electron, "package.json"), JSON.stringify({ name: "electron", version: REAL_ELECTRON_SOURCES.electron }) + "\n");
  write(path.join(electron, "dist", "LICENSE"), "Copyright (c) Electron contributors (fixture)\n\nPermission is hereby granted, free of charge (fixture).\n");
  write(path.join(electron, "dist", "LICENSES.chromium.html"), creditsHtml());
  write(path.join(electron, "dist", "ffmpeg.dll"), fakePe("ffmpeg.dll"));
  // third-party/: the repo's own, with the binaries' pins swapped for the fakes'.
  copyDir(REAL_TP, fx.tp);
  fx.binaries = {};
  const reviewed = JSON.parse(JSON.stringify(REAL_REVIEWED));
  for (const b of reviewed.binaries) {
    const bytes = fakePe(b.file.toLowerCase());
    fx.binaries[b.file] = bytes;
    b.sha256 = sha256(bytes);
    b.bytes = bytes.length;
    if (b.in === "app-root") write(path.join(electron, "dist", b.path || b.file), bytes);
  }
  write(path.join(fx.tp, "reviewed-binaries.json"), JSON.stringify(reviewed, null, 2) + "\n");
  // The LGPL libraries' copyright lines, which a person MAY copy out of their sources (the file is optional; see
  // "lgpl-copyright-lines.txt is optional" below, which takes it away): the fixture writes a stand-in for every library
  // sharp's versions.json names, so that the lines it carries are checked.
  const versions = readJson(path.join(fx.sharp, "versions.json"));
  write(path.join(fx.tp, "notices", "lgpl-copyright-lines.txt"),
    `# versions: ${Object.entries(versions).map(([k, v]) => `${k} ${v}`).join(", ")}\nCopyright (C) the fixture's libvips authors\n`);
  repin(path.join(fx.tp, "notices"));
  // The game and a Workshop item, each with one image.
  write(path.join(fx.game, "gfx", "interface", "fixture_game_art.dds"), Buffer.from("DDS the game's own art (fixture)", "latin1"));
  write(path.join(fx.workshop, "4242", "gfx", "interface", "fixture_workshop_art.dds"), Buffer.from("DDS a Workshop mod's art (fixture)", "latin1"));
  return fx;
}

/** The built app electron-builder would leave in win-unpacked, and the portable exe, for --check (gate G2). */
async function addBuiltApp(fx, text, opts) {
  const o = opts || {};
  const appDir = path.join(fx.dir, "win-unpacked");
  fx.appDir = appDir;
  write(path.join(appDir, `${fx.pkg.build.productName}.exe`), fakePe("the program"));
  for (const f of fs.readdirSync(path.join(fx.electron, "dist"))) {
    const to = f === "LICENSE" ? "LICENSE.electron.txt" : f;
    fs.copyFileSync(path.join(fx.electron, "dist", f), path.join(appDir, to));
  }
  for (const e of fx.pkg.build.extraFiles || []) {
    const src = path.join(fx.app, e.from);
    if (e.from === GEN.NOTICES_FILE) write(path.join(appDir, e.to), text);
    else if (fs.statSync(src).isDirectory()) {
      for (const f of fs.readdirSync(src).filter((x) => /\.txt$/i.test(x))) write(path.join(appDir, e.to, f), fs.readFileSync(path.join(src, f)));
    } else write(path.join(appDir, e.to), fs.readFileSync(src));
  }
  for (const r of fx.resources) write(path.join(appDir, "resources", r.to), fs.readFileSync(r.file));
  for (const b of REAL_REVIEWED.binaries.filter((x) => x.in === "resources" && x.ships === "portable")) write(path.join(appDir, "resources", b.path || b.file), fx.binaries[b.file]);
  // app.asar: package.json, main.js and the production packages' package.json files.
  const stage = path.join(fx.dir, "asar-stage");
  write(path.join(stage, "package.json"), fs.readFileSync(path.join(fx.app, "package.json")));
  write(path.join(stage, "main.js"), fs.readFileSync(path.join(fx.app, "main.js")));
  write(path.join(stage, "node_modules", "alpha", "package.json"), fs.readFileSync(path.join(fx.nm, "alpha", "package.json")));
  write(path.join(stage, "node_modules", "@img", "sharp-win32-x64", "package.json"), fs.readFileSync(path.join(fx.sharp, "package.json")));
  if (o.asarExtraPackage) write(path.join(stage, "node_modules", "gamma", "package.json"), JSON.stringify({ name: "gamma", version: "2.0.0", license: "MIT" }) + "\n");
  fs.mkdirSync(path.join(appDir, "resources"), { recursive: true });
  await asar.createPackage(stage, path.join(appDir, "resources", "app.asar"));
  // The native package electron-builder unpacks next to the asar.
  write(path.join(appDir, "resources", "app.asar.unpacked", "node_modules", "@img", "sharp-win32-x64", "package.json"), fs.readFileSync(path.join(fx.sharp, "package.json")));
  write(path.join(appDir, "resources", "app.asar.unpacked", "node_modules", "@img", "sharp-win32-x64", "lib", "libvips-42.dll"), fakePe("libvips-42.dll"));
  // The portable exe: an NSIS stub whose data blocks are a header and the launcher's plug-ins, each deflated.
  const pes = REAL_REVIEWED.binaries.filter((x) => x.in === "launcher").map((x) => fx.binaries[x.file]);
  if (o.extraPe) pes.push(fakePe("a plug-in nobody reviewed"));
  const blocks = [Buffer.from("the fixture's NSIS header, which is not a program", "latin1"), ...pes].map((b) => {
    const d = zlib.deflateRawSync(b);
    const len = Buffer.alloc(4);
    len.writeUInt32LE((0x80000000 | d.length) >>> 0, 0);
    return Buffer.concat([len, d]);
  });
  const body = Buffer.concat(blocks);
  const head = Buffer.alloc(28);
  head.writeUInt32LE(0, 0);
  head.writeUInt32LE(0xdeadbeef, 4);
  head.write("NullsoftInst", 8, "latin1");
  head.writeUInt32LE(blocks[0].length, 20);
  head.writeUInt32LE(28 + body.length, 24);
  fx.portableExe = path.join(fx.dir, "Fixture App 9.9.9.exe");
  write(fx.portableExe, Buffer.concat([fakePe("the portable launcher's stub"), head, body]));
}

const DATE = "2026-01-01";
const genOpts = (fx, extra) => Object.assign({ root: fx.app, gameFolders: [fx.game], workshopFolders: [fx.workshop], askElectron: false, write: false, date: DATE }, extra || {});
const rulesOf = (r) => [...new Set(r.problems.map((p) => p.rule))];
const firstTemplateKey = (fx) => {
  const tpl = fs.readFileSync(path.join(fx.tp, "notices", "lgpl-block.txt"), "utf8");
  return Object.keys(readJson(path.join(fx.sharp, "versions.json"))).find((k) => tpl.includes(`{${k}}`));
};
const insertTableRow = (md, row) => {
  const lines = md.split("\n");
  const at = lines.findIndex((l) => /^##\s+Licensing\s*$/.test(l));
  let last = -1;
  for (let i = at + 1; i < lines.length && !/^##\s/.test(lines[i]); i++) if (/^\|/.test(lines[i])) last = i;
  lines.splice(last + 1, 0, row);
  return lines.join("\n");
};
const reviewedResourceOnlyInPortable = () => REAL_REVIEWED.binaries.find((x) => x.in === "resources" && x.ships === "portable");

// ── What the clean notices must carry, each read out of the fixture ────────────────────────────────────────────────
const lf = (s) => String(s).replace(/\r\n/g, "\n");
const escRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** The fixture's production packages (its package.json's dependencies): each one's id, the licence its package.json
 *  declares, and its licence and NOTICE files. */
function fixturePackages(fx) {
  return Object.keys(fx.pkg.dependencies).map((name) => {
    const dir = path.join(fx.nm, ...name.split("/"));
    const pj = readJson(path.join(dir, "package.json"));
    const files = fs.readdirSync(dir).sort();
    const texts = (re) => files.filter((n) => re.test(n)).map((n) => ({ file: n, text: lf(fs.readFileSync(path.join(dir, n), "utf8")).replace(/\s+$/, "") }));
    return { id: `${pj.name}@${pj.version}`, dir, declared: pj.license, licences: texts(/^licen[cs]e/i), notices: texts(/^notice/i) };
  });
}
/** Each package's entry in the notices' NPM PACKAGES section: from its own header line ("<id>   [<licence>]") to the
 *  next package's, or to the rule line that closes the section. `ids` as the generator reports them (r.packages). */
function packageEntries(text, ids) {
  const entries = new Map();
  const head = text.indexOf("\nNPM PACKAGES\n");
  if (head < 0) return entries;
  let section = text.slice(head + 1);
  const close = /^=+$/m.exec(section);
  if (close) section = section.slice(0, close.index);
  const at = ids.map((id) => { const m = new RegExp(`^${escRe(id)}\\s+\\[`, "m").exec(section); return m ? m.index : -1; });
  ids.forEach((id, i) => { if (at[i] >= 0) entries.set(id, section.slice(at[i], Math.min(section.length, ...at.filter((x) => x > at[i])))); });
  return entries;
}
/** The table rows of a README's "## Licensing" section, in order (the section insertTableRow above edits). */
function licensingRows(md) {
  const lines = lf(md).split("\n");
  const at = lines.findIndex((l) => /^##\s+Licensing\s*$/.test(l));
  const rows = [];
  if (at >= 0) for (let i = at + 1; i < lines.length && !/^##\s/.test(lines[i]); i++) if (/^\|/.test(lines[i])) rows.push(lines[i]);
  return rows;
}
/** True when every needle is in `hay`, in this order. */
function inOrder(hay, needles) {
  let from = 0;
  for (const n of needles) { const i = hay.indexOf(n, from); if (i < 0) return false; from = i + 1; }
  return true;
}
/** Every {licence:FILE} line of the notice templates: the template, the vendored text it names (LF, as the notices
 *  carry it), and the template's line before it. A "[portable] " line renders without its prefix, and the fixture
 *  builds package.json's own target, the portable one, which renders every template. */
function templateIncludes(fx) {
  const dir = path.join(fx.tp, "notices");
  const out = [];
  for (const template of fs.readdirSync(dir).filter((n) => /\.txt$/i.test(n)).sort()) {
    const lines = lf(fs.readFileSync(path.join(dir, template), "utf8")).split("\n").map((l) => l.replace(/^\[portable\] /, ""));
    lines.forEach((l, i) => {
      const m = /^\{licence:([^{}]+)\}$/.exec(l);
      if (!m) return;
      const prev = i > 0 && !/^\{licence:/.test(lines[i - 1]) ? lines[i - 1] : null;
      out.push({ template, file: m[1], prev, body: lf(fs.readFileSync(path.join(fx.tp, "licenses", m[1]), "utf8")).replace(/\s+$/, "") });
    });
  }
  return out;
}
/** True when the included text starts a line of `text`, right under a line the template's line before it renders to
 *  (each {field} of that line matches anything on it). */
function includedInPlace(text, inc) {
  const needle = "\n" + inc.body;
  const prev = inc.prev === null ? null : new RegExp("^" + inc.prev.split(/\{[A-Za-z0-9_.-]+\}/).map(escRe).join("[^\\n]*") + "$");
  for (let at = text.indexOf(needle); at >= 0; at = text.indexOf(needle, at + 1)) {
    if (!prev || prev.test(text.slice(text.lastIndexOf("\n", at - 1) + 1, at))) return true;
  }
  return false;
}
/** The rendered section that opens with the line `title`, up to the rule line that closes it (the generator joins its
 *  sections with a line of "="). Empty when no line is `title`. */
function sectionAt(text, title) {
  const m = new RegExp(`^${escRe(title)}$`, "m").exec(text);
  if (!m) return "";
  const rest = text.slice(m.index);
  const close = /^=+$/m.exec(rest);
  return close ? rest.slice(0, close.index) : rest;
}
/** The copyright lines the LGPL block must carry, by where the fixture gives them: the Chromium credits' own lines for
 *  each entry under an LGPL (its first paragraph, above the licence text), the lines a person copied into
 *  third-party/notices/lgpl-copyright-lines.txt (under its "# versions:" line), and the version-resource copyright of
 *  each LGPL plug-in the portable launcher carries (reviewed-binaries.json; only a portable build has the launcher). */
function lgplCopyrightSources(fx) {
  const html = lf(fs.readFileSync(path.join(fx.electron, "dist", "LICENSES.chromium.html"), "utf8"));
  const credits = [];
  for (const entry of html.split('<div class="product">').slice(1)) {
    const title = /<span class="title">([^<]*)<\/span>/.exec(entry);
    const pre = /<pre>([\s\S]*?)<\/pre>/.exec(entry);
    if (!title || !pre || !/GNU (LESSER|LIBRARY) GENERAL PUBLIC LICENSE/.test(pre[1])) continue;
    for (const l of pre[1].split("\n\n")[0].split("\n")) if (/^\s*Copyright\b/.test(l)) credits.push({ from: `LICENSES.chromium.html "${title[1]}"`, line: l.trim() });
  }
  const copiedFile = path.join(fx.tp, "notices", "lgpl-copyright-lines.txt");
  const copied = !fs.existsSync(copiedFile) ? [] : lf(fs.readFileSync(copiedFile, "utf8")).split("\n").slice(1)
    .filter((l) => l.trim() && !/^#/.test(l)).map((l) => ({ from: "lgpl-copyright-lines.txt", line: l.trim() }));
  const targets = ((fx.pkg.build.win && fx.pkg.build.win.target) || []).map((t) => (typeof t === "string" ? t : t.target));
  const portable = targets.includes("portable");
  const plugins = !portable ? [] : readJson(path.join(fx.tp, "reviewed-binaries.json")).binaries
    .filter((b) => b.in === "launcher" && b.lgpl).map((b) => ({ from: b.file, line: b.legalCopyright }));
  return { credits, copied, plugins, portable, targets };
}
/** The lines of an LGPL block that state a copyright ("Copyright (c)/(C)/©"), and those of them no source above gives:
 *  a generator that invented one for libvips would show up here. */
function inventedCopyrightLines(block, cs) {
  const known = [...cs.credits, ...cs.copied, ...cs.plugins].map((x) => x.line);
  const stated = block.split("\n").filter((l) => /\bCopyright\s+(\(c\)|\(C\)|©)/i.test(l));
  return { stated, invented: stated.filter((l) => !known.some((k) => l.includes(k))) };
}
/** The LGPL and MPL rows of sharp's Licensing table, each with its versions.json version (looked up as the table names
 *  it, or without "lib", or without a trailing number: libvips is "vips", librsvg "rsvg"). */
function lgplLibraries(fx) {
  const versions = readJson(path.join(fx.sharp, "versions.json"));
  const has = (k) => Object.prototype.hasOwnProperty.call(versions, k);
  return licensingRows(fs.readFileSync(path.join(fx.sharp, "README.md"), "utf8"))
    .map((l) => /^\|\s*([^|]+?)\s*\|\s*(.+?)\s*\|\s*$/.exec(l)).filter(Boolean)
    .filter((m) => !/^-+$/.test(m[1]) && !/^library$/i.test(m[1]) && /LGPL|Mozilla Public License|\bMPL\b/i.test(m[2]))
    .map((m) => {
      const key = [m[1], m[1].replace(/^lib/, ""), m[1].replace(/^lib/, "").replace(/\d+$/, "")].find(has);
      return { library: m[1], terms: m[2], key: key || null, version: key ? versions[key] : null };
    });
}
/** Where the fixture's own records say the source of each LGPL and MPL component is: third-party/libvips-sources.json
 *  filled from the fixture's sharp (its versions.json's vips, its package's version), and the source of each LGPL
 *  plug-in its reviewed-binaries.json gives, when the build carries the portable launcher. */
function expectedSources(fx) {
  const chain = readJson(path.join(fx.tp, "libvips-sources.json"));
  const versions = readJson(path.join(fx.sharp, "versions.json"));
  const sharpVersion = readJson(path.join(fx.sharp, "package.json")).version;
  const out = [
    { what: "the libraries inside libvips-42.dll", url: String(chain.dlls).split("{vips}").join(versions.vips) },
    { what: "libvips-cpp.dll", url: String(chain.cpp).split("{sharp}").join(sharpVersion) },
  ];
  const targets = ((fx.pkg.build.win && fx.pkg.build.win.target) || []).map((t) => (typeof t === "string" ? t : t.target));
  if (targets.includes("portable")) {
    for (const b of readJson(path.join(fx.tp, "reviewed-binaries.json")).binaries.filter((x) => x.in === "launcher" && x.lgpl)) {
      for (const u of (b.source && b.source.urls) || []) out.push({ what: b.file, url: u });
    }
  }
  return out;
}
const lgplBlockOf = (fx, text) => sectionAt(text, lf(fs.readFileSync(path.join(fx.tp, "notices", "lgpl-block.txt"), "utf8")).split("\n")[0]);
const appendToLgplBlock = (fx, line) => { editText(path.join(fx.tp, "notices", "lgpl-block.txt"), (s) => s.replace(/\s*$/, () => `\n${line}\n`)); repin(path.join(fx.tp, "notices")); };
const firstLgplPlugin = (j) => j.binaries.find((b) => b.in === "launcher" && b.lgpl);

// One change each. `check: true` runs against the built app too (gate G2's --check), where the change is made.
const CASES = [
  { rule: "licence-not-allowed", label: "a package under Python-2.0 (argparse's licence)", mutate: (fx) => editJson(path.join(fx.nm, "alpha", "package.json"), (j) => { j.license = "Python-2.0"; }) },
  { rule: "licence-not-allowed", label: "a package under (MIT OR GPL-3.0) AND GPL-3.0, which no choice clears", mutate: (fx) => editJson(path.join(fx.nm, "alpha", "package.json"), (j) => { j.license = "(MIT OR GPL-3.0) AND GPL-3.0"; }) },
  { rule: "no-licence", label: "a package with no licence field and no licence file", mutate: (fx) => { editJson(path.join(fx.nm, "alpha", "package.json"), (j) => { delete j.license; }); fs.rmSync(path.join(fx.nm, "alpha", "LICENSE")); } },
  { rule: "package-missing", label: "a production dependency that is not installed", mutate: (fx) => editJson(path.join(fx.app, "package.json"), (j) => { j.dependencies.beta = "^1.0.0"; }) },
  { rule: "sharp-readme", label: "sharp's README without its Licensing section", mutate: (fx) => editText(path.join(fx.sharp, "README.md"), (s) => s.replace(/^##\s+Licensing\s*$/m, "## Terms")) },
  { rule: "sharp-readme", label: "sharp's README missing", mutate: (fx) => fs.rmSync(path.join(fx.sharp, "README.md")) },
  { rule: "sharp-versions", label: "an LGPL library in sharp's table with no versions.json entry", mutate: (fx) => { const k = firstTemplateKey(fx); editJson(path.join(fx.sharp, "versions.json"), (j) => { delete j[k]; }); } },
  { rule: "lgpl-block", label: "an LGPL library in sharp's table that the LGPL block does not name", mutate: (fx) => {
    editText(path.join(fx.sharp, "README.md"), (s) => insertTableRow(s, "| libnovafixture | LGPLv3 |"));
    editJson(path.join(fx.sharp, "versions.json"), (j) => { j.novafixture = "1.0.0"; });
  } },
  // lgpl-copyright-lines.txt MISSING is not refused (it is optional; see its own section below), but a copy made for
  // other versions than the ones that ship still is.
  { rule: "lgpl-copyright-lines", label: "lgpl-copyright-lines.txt, which is optional, copied for another version of a library", why: /was copied for other versions than sharp's versions\.json/, mutate: (fx) => {
    const k = firstTemplateKey(fx);
    editText(path.join(fx.tp, "notices", "lgpl-copyright-lines.txt"), (s) => s.replace(new RegExp(`(^#\\s*versions:.*?\\b${k}) (\\S+?)(,|\\n)`, "m"), "$1 0.0.1-not-it$3"));
    repin(path.join(fx.tp, "notices"));
  } },
  { rule: "electron-version", label: "an Electron other than the one third-party/electron-sources.json pins", mutate: (fx) => editJson(path.join(fx.electron, "package.json"), (j) => { j.version = j.version + "-other"; }) },
  { rule: "electron-files", label: "Electron's LICENSES.chromium.html missing from its dist", mutate: (fx) => fs.rmSync(path.join(fx.electron, "dist", "LICENSES.chromium.html")) },
  { rule: "chromium-credits", label: "the Chromium credits without WebKit's LGPL text", mutate: (fx) => write(path.join(fx.electron, "dist", "LICENSES.chromium.html"), creditsHtml({ webkitLgpl: false })) },
  { rule: "chromium-credits", label: "the Chromium credits without FFmpeg's LGPL text", mutate: (fx) => write(path.join(fx.electron, "dist", "LICENSES.chromium.html"), creditsHtml({ ffmpegLgpl: false })) },
  { rule: "binary-unreviewed", label: "an extraResources binary nobody reviewed", mutate: (fx) => {
    write(path.join(fx.app, "unreviewed-tool.exe"), fakePe("unreviewed-tool.exe"));
    editJson(path.join(fx.app, "package.json"), (j) => { j.build.extraResources.push({ from: "unreviewed-tool.exe", to: "unreviewed-tool.exe" }); });
  } },
  { rule: "binary-changed", label: "a fake texconv.exe (an extraResources binary changed since its review)", mutate: (fx) => write(fx.resources[0].file, fakePe("a different texconv")) },
  { rule: "binary-changed", label: "an Electron DLL changed since its notice was reviewed", mutate: (fx) => { const b = REAL_REVIEWED.binaries.find((x) => x.in === "app-root"); write(path.join(fx.electron, "dist", b.path || b.file), fakePe("a different " + b.file)); } },
  { rule: "data-licence", label: "a data file naming CC-BY-4.0, which has no vendored text", mutate: (fx) => editJson(path.join(fx.app, "data", "spec.json"), (j) => { j._meta.license = "CC-BY-4.0"; }) },
  { rule: "data-licence", label: "a data file pointing at a licence file that does not ship", mutate: (fx) => editJson(path.join(fx.app, "data", "spec.json"), (j) => { j._meta.license = `${fx.dataSpdx} (c) the fixture; see reference/fixture-config/LICENSE`; }) },
  { rule: "template-field", label: "a notice template with a field nothing fills", mutate: (fx) => { editText(path.join(fx.tp, "notices", "paradox.txt"), (s) => s + "{fixtureNoSuchField}\n"); repin(path.join(fx.tp, "notices")); } },
  // `why`, where given: the refusal must also say this, so a case refused for its rule but for another reason fails.
  { rule: "source-location", label: "<SOURCE URL> left in the LGPL block", why: /placeholder <SOURCE URL>/, mutate: (fx) => appendToLgplBlock(fx, "  <SOURCE URL>") },
  { rule: "source-location", label: "the LGPL block naming another release's page", why: /release page of v1\.0\.0/, mutate: (fx) => appendToLgplBlock(fx, `  ${RELEASES_URL}/tag/v1.0.0`) },
  { rule: "source-location", label: "the LGPL block offering this release's own page as a source (it carries the exe, and only the exe)", why: /names Nova's release page/, mutate: (fx) => appendToLgplBlock(fx, `  ${RELEASES_URL}/tag/v${fx.pkg.version}`) },
  { rule: "source-location", label: "⭐ an LGPL plug-in of the portable launcher with no source location", why: /gives no source location for it/, mutate: (fx) => editJson(path.join(fx.tp, "reviewed-binaries.json"), (j) => { delete firstLgplPlugin(j).source; }) },
  { rule: "source-location", label: "an LGPL plug-in whose source location is for another version than its binary", why: /source location is for version 0\.1, but the binary's version resource says/, mutate: (fx) => editJson(path.join(fx.tp, "reviewed-binaries.json"), (j) => {
    const b = firstLgplPlugin(j);
    const was = b.source.version;
    b.source.version = "0.1";
    b.source.urls = b.source.urls.map((u) => u.split(was).join("0.1"));
  }) },
  { rule: "source-location", label: "⭐ the LGPL block without the source location of the libvips DLLs", why: /does not give the source location of .*libvips/, mutate: (fx) => { editText(path.join(fx.tp, "notices", "lgpl-block.txt"), (s) => s.replace("{libvipsSource}", "the release page")); repin(path.join(fx.tp, "notices")); } },
  { rule: "source-location", label: "the libvips DLLs' source chain checked for another sharp than the one installed", why: /was checked for .*-other, but .* is installed/, mutate: (fx) => editJson(path.join(fx.tp, "libvips-sources.json"), (j) => { j.checkedFor = `${j.checkedFor}-other`; }) },
  { rule: "source-location", label: "the libvips DLLs' source location on a branch, not the version that ships", why: /names a branch or "latest"/, mutate: (fx) => editJson(path.join(fx.tp, "libvips-sources.json"), (j) => { j.dlls = String(j.dlls).replace(/v\{vips\}$/, "master"); }) },
  { rule: "game-art", label: "a shipped image byte-identical to the game's (fuel_silos.dds, in the fixture)", mutate: (fx) => write(path.join(fx.app, "public", "GFX", "copied.dds"), fs.readFileSync(path.join(fx.game, "gfx", "interface", "fixture_game_art.dds"))) },
  { rule: "game-art", label: "a shipped image byte-identical to a Workshop item's", mutate: (fx) => write(path.join(fx.app, "data", "icons", "copied.dds"), fs.readFileSync(path.join(fx.workshop, "4242", "gfx", "interface", "fixture_workshop_art.dds"))) },
  { rule: "game-art", label: "no game to compare the shipped images with", opts: { gameFolders: [] } },
  { rule: "pinned-text", label: "one byte of a vendored licence text changed", mutate: (fx) => { const p = path.join(fx.tp, "licenses", "GPL-3.0.txt"); const b = fs.readFileSync(p); b[200] = b[200] === 0x65 ? 0x66 : 0x65; fs.writeFileSync(p, b); } },
  { rule: "pinned-text", label: "a hand-written notice edited without its pin", mutate: (fx) => editText(path.join(fx.tp, "notices", "header.txt"), (s) => s + "An extra sentence nobody pinned.\n") },
  { rule: "pinned-text", label: "a licence text with no record of where it came from", mutate: (fx) => { write(path.join(fx.tp, "licenses", "Fixture-1.0.txt"), "A licence nobody recorded.\n"); repin(path.join(fx.tp, "licenses")); } },
  // The built app (gate G2): the same tree, checked against what electron-builder left.
  { rule: "unclassified-file", check: true, label: "an unknown DLL at the app root", mutate: (fx) => write(path.join(fx.appDir, "unknown.dll"), fakePe("unknown.dll")) },
  { rule: "asar-package", check: true, label: "a package in app.asar that has no notice (dropped from the paths)", built: { asarExtraPackage: true } },
  { rule: "launcher-binary", check: true, label: "the portable launcher embedding a plug-in nobody reviewed", built: { extraPe: true } },
  { rule: "notices-differ", check: true, label: "a THIRD-PARTY-NOTICES.txt derived from another tree", mutate: (fx) => editText(path.join(fx.appDir, GEN.NOTICES_FILE), (s) => s.replace("NPM PACKAGES", "NPM PACKAGES (from another tree)")) },
  { rule: "electron-files", check: true, label: "Electron's LICENSE missing from the built app", mutate: (fx) => fs.rmSync(path.join(fx.appDir, "LICENSE.electron.txt")) },
  { rule: "binary-changed", check: true, label: "a reviewed binary in the built app changed", mutate: (fx) => { const b = reviewedResourceOnlyInPortable(); write(path.join(fx.appDir, "resources", b.path || b.file), fakePe("a different " + b.file)); } },
];

async function main() {
  console.log("\n[a clean tree is not refused  (the control every case below leans on)]");
  let cleanText = "";
  {
    const fx = makeFixture();
    const r = GEN.generateThirdPartyNotices(genOpts(fx));
    rec("CONTROL: the clean fixture is not refused", r.ok === true && r.problems.length === 0, r.problems);
    cleanText = r.text;
    // The source offer: a pinned upstream location for every LGPL and MPL component, inside the LGPL block, and never
    // Nova's release page (the owner uploads the exe there, and nothing else).
    const block = lgplBlockOf(fx, r.text);
    const want = expectedSources(fx);
    rec(`⭐ …its LGPL block gives the pinned source location of each LGPL and MPL component, from the fixture's own records (${want.length} locations)`,
      block !== "" && want.length > 2 && want.every((s) => block.includes(s.url)), want.filter((s) => !block.includes(s.url)));
    rec("…and offers no release page of Nova's as a source", block !== "" && !block.includes(RELEASES_URL), block.slice(-600));
    const libs = lgplLibraries(fx);
    rec(`…and SOURCES.json links every LGPL and MPL library of sharp's table to it, with nothing left to attach (${libs.length} libraries)`,
      libs.length > 0 && r.sources && !("attach" in r.sources) && libs.every((l) => r.sources.link.some((s) => s.component === l.library && s.url === want[0].url)),
      r.sources);
    // ⭐ What they CARRY (the top of this file says why): every text below is read out of the fixture.
    const pkgs = fixturePackages(fx);
    const entries = packageEntries(r.text, r.packages);
    rec(`…with an entry for each of the fixture's ${pkgs.length} production packages`, pkgs.length > 0 && pkgs.every((p) => entries.has(p.id)),
      { want: pkgs.map((p) => p.id), got: [...entries.keys()] });
    // The entry's own line names the licence its package.json declares: the one statement of its terms that every entry
    // has, licence file or not.
    const opensWithLicence = (p) => typeof p.declared === "string" && new RegExp(`^${escRe(p.id)}\\s+\\[${escRe(p.declared)}\\]`).test(entries.get(p.id) || "");
    const entryLine = (p) => `${p.id} declares ${JSON.stringify(p.declared)}: ${(entries.get(p.id) || "(no entry)").split("\n")[0]}`;
    rec(`⭐ …each package's entry opening with the licence its package.json declares (${pkgs.length} packages)`,
      pkgs.length > 0 && pkgs.every(opensWithLicence), pkgs.filter((p) => !opensWithLicence(p)).map(entryLine));
    const inEntry = (p, t) => (entries.get(p.id) || "").includes(t.text);
    const lics = pkgs.flatMap((p) => p.licences.map((t) => ({ p, t })));
    rec(`⭐ …each package's licence files, in full, inside that package's own entry (${lics.length} files)`,
      lics.length > 0 && lics.every(({ p, t }) => inEntry(p, t)), lics.filter(({ p, t }) => !inEntry(p, t)).map(({ p, t }) => `${p.id}: ${t.file}`));
    const notes = pkgs.flatMap((p) => p.notices.map((t) => ({ p, t })));
    rec(`⭐ …each package's NOTICE files, in full, inside that package's own entry (${notes.length} files)`,
      notes.length > 0 && notes.every(({ p, t }) => inEntry(p, t)), notes.filter(({ p, t }) => !inEntry(p, t)).map(({ p, t }) => `${p.id}: ${t.file}`));
    // sharp's table is the only notice the libraries inside libvips-42.dll get that are under neither the LGPL nor the MPL.
    const sharp = pkgs.find((p) => path.resolve(p.dir) === path.resolve(fx.sharp));
    const rows = licensingRows(fs.readFileSync(path.join(fx.sharp, "README.md"), "utf8"));
    rec(`⭐ …every row of sharp's Licensing table, in order, inside sharp's own entry (${rows.length} rows)`,
      Boolean(sharp) && rows.length > 0 && inOrder(entries.get(sharp.id) || "", rows.map((x) => "\n" + x + "\n")),
      sharp ? (entries.get(sharp.id) || "(no entry)").slice(0, 400) : "sharp is not among the fixture's packages");
    const incs = templateIncludes(fx);
    rec(`⭐ …every vendored licence text a notice template includes, in full, right under that template's own line (${incs.length} texts)`,
      incs.length > 0 && incs.every((x) => includedInPlace(r.text, x)), incs.filter((x) => !includedInPlace(r.text, x)).map((x) => `${x.template} -> licenses/${x.file}`));
    // The copyright notices of the LGPL components, which the LGPL asks for, inside the LGPL block itself, where the
    // design puts them: the launcher's own section also carries the plug-ins' copyright, so a check of the whole file
    // would pass without the block's copy.
    const lgplBlock = sectionAt(r.text, lf(fs.readFileSync(path.join(fx.tp, "notices", "lgpl-block.txt"), "utf8")).split("\n")[0]);
    const cs = lgplCopyrightSources(fx);
    const notInBlock = (xs) => xs.filter((x) => !lgplBlock.includes(x.line)).map((x) => `${x.from}: ${x.line}`);
    rec(`⭐ …the copyright lines of each Chromium credits entry under an LGPL, inside the LGPL block (${cs.credits.length} lines)`,
      lgplBlock !== "" && cs.credits.length > 0 && notInBlock(cs.credits).length === 0, notInBlock(cs.credits));
    rec(`⭐ …the copyright lines a person copied into lgpl-copyright-lines.txt, inside the LGPL block (${cs.copied.length} lines)`,
      lgplBlock !== "" && cs.copied.length > 0 && notInBlock(cs.copied).length === 0, notInBlock(cs.copied));
    rec(`⭐ …the copyright of each LGPL plug-in in the portable launcher, inside the LGPL block (${cs.plugins.length} lines)`,
      lgplBlock !== "" && cs.portable && cs.plugins.length > 0 && notInBlock(cs.plugins).length === 0,
      cs.portable ? notInBlock(cs.plugins) : `the fixture builds ${JSON.stringify(cs.targets)} (package.json's build.win.target), which carries no launcher`);
    const made = inventedCopyrightLines(lgplBlock, cs);
    rec(`⭐ …and no copyright line in the LGPL block that those sources do not give: none invented (${made.stated.length} lines)`,
      made.stated.length > 0 && made.invented.length === 0, made.invented);
    rec("…with the LGPL block first, right after the header",
      r.text.indexOf("GNU LESSER GENERAL PUBLIC LICENSE (LGPL)") > 0 && r.text.indexOf("GNU LESSER GENERAL PUBLIC LICENSE (LGPL)") < r.text.indexOf("ELECTRON AND CHROMIUM"));
    rec("…and the shipped images were compared with the game and the Workshop", r.gameArt && r.gameArt.images >= 1 && r.gameArt.matches === 0, r.gameArt);
    const w = GEN.generateThirdPartyNotices(genOpts(fx, { write: true }));
    const out = path.join(fx.app, GEN.NOTICES_FILE);
    rec(`a clean tree writes ${GEN.NOTICES_FILE} at the app root`, w.ok && fs.existsSync(out) && fs.readFileSync(out, "utf8") === r.text, w.problems);
  }
  {
    const fx = makeFixture();
    await addBuiltApp(fx, cleanText);
    const r = GEN.generateThirdPartyNotices(genOpts(fx, { check: true, appDir: fx.appDir, portable: fx.portableExe }));
    rec("CONTROL: the clean built app passes --check", r.ok === true, r.problems);
  }

  console.log("\n[⭐ lgpl-copyright-lines.txt is optional: without it nothing is refused, and no copyright line is invented]");
  {
    // As the repo is today: nobody copied the libvips libraries' lines in, and nobody will.
    const fx = makeFixture();
    const copiedFile = path.join(fx.tp, "notices", "lgpl-copyright-lines.txt");
    const copiedLines = lf(fs.readFileSync(copiedFile, "utf8")).split("\n").slice(1).filter((l) => l.trim() && !/^#/.test(l)).map((l) => l.trim());
    fs.rmSync(copiedFile);
    repin(path.join(fx.tp, "notices"));
    const r = GEN.generateThirdPartyNotices(genOpts(fx));
    rec("⭐ without the file, the clean fixture is not refused", r.ok === true && r.problems.length === 0, r.problems.slice(0, 4));
    const block = lgplBlockOf(fx, r.text).replace(/\r\n/g, "\n");   // read LF, written out (not lf()) so test-a-page-lift-reads-the-same-text-from-a-crlf-checkout.js sees it: the "\n\n" below is searched in it
    const flat = block.replace(/\s+/g, " ");
    const libs = lgplLibraries(fx);
    rec(`…its LGPL block still names each LGPL and MPL library of sharp's table with its version (${libs.length} libraries)`,
      libs.length > 0 && libs.every((l) => l.version && flat.includes(`${l.library} ${l.version}`)), libs.filter((l) => !l.version || !flat.includes(`${l.library} ${l.version}`)));
    const want = expectedSources(fx);
    rec("…and gives the pinned source location their copyright notices are in", block !== "" && block.includes(want[0].url), want[0]);
    const notices = block.slice(block.indexOf("Copyright notices:"), block.indexOf("\n\n", Math.max(0, block.indexOf("Copyright notices:"))));
    rec("…and its copyright notices still have an entry for libvips and its libraries", block.includes("Copyright notices:") && /libvips/.test(notices), notices.slice(-500));
    rec("…which carries none of the lines the file had", copiedLines.length > 0 && copiedLines.every((l) => !block.includes(l)), copiedLines);
    const made = inventedCopyrightLines(block, lgplCopyrightSources(fx));
    rec("⭐ …and no copyright line its sources do not give: none invented", made.stated.length > 0 && made.invented.length === 0, made.invented);
  }

  console.log("\n[--electron may name Electron's dist folder, where electron.exe and its two licence files are]");
  {
    const fx = makeFixture();
    const viaPackage = GEN.generateThirdPartyNotices(genOpts(fx));
    const viaDist = GEN.generateThirdPartyNotices(genOpts(fx, { electronDir: path.join(fx.electron, "dist") }));
    rec("the dist folder gives the same notices as the package folder, and is not refused",
      viaPackage.ok === true && viaDist.ok === true && viaDist.text === viaPackage.text, { viaPackage: viaPackage.problems.slice(0, 2), viaDist: viaDist.problems.slice(0, 3) });
    // CONTROL: a folder named dist that is not Electron's is still refused, so the rule above is not a blanket pass.
    write(path.join(fx.app, "other", "package.json"), JSON.stringify({ name: "other", version: "1.0.0" }) + "\n");
    fs.mkdirSync(path.join(fx.app, "other", "dist"), { recursive: true });
    const notElectron = GEN.generateThirdPartyNotices(genOpts(fx, { electronDir: path.join(fx.app, "other", "dist") }));
    rec("CONTROL: another package's dist folder is still refused", notElectron.ok === false && rulesOf(notElectron).includes("electron-files"), rulesOf(notElectron));
  }

  console.log("\n[⭐ each listed failure is refused, for its own rule  (one change to the clean fixture each)]");
  const covered = new Set();
  for (const c of CASES) {
    const fx = makeFixture();
    let r;
    if (c.check) {
      const text = GEN.generateThirdPartyNotices(genOpts(fx)).text;
      await addBuiltApp(fx, text, c.built);
      if (c.mutate) await c.mutate(fx);
      r = GEN.generateThirdPartyNotices(genOpts(fx, Object.assign({ check: true, appDir: fx.appDir, portable: fx.portableExe }, c.opts || {})));
    } else {
      if (c.mutate) await c.mutate(fx);
      r = GEN.generateThirdPartyNotices(genOpts(fx, Object.assign({ write: true }, c.opts || {})));
    }
    const named = rulesOf(r);
    const ok = r.ok === false && named.includes(c.rule) && (!c.why || r.problems.some((p) => p.rule === c.rule && c.why.test(p.message)));
    if (ok) covered.add(c.rule);
    rec(`[${c.rule}] ${c.label}`, ok, { ok: r.ok, rules: named, first: r.problems.slice(0, 3) });
    console.log(`         refused for: ${named.join(", ") || "(nothing)"}`);
    if (!c.check) rec(`…and nothing was written`, !fs.existsSync(path.join(fx.app, GEN.NOTICES_FILE)));
  }

  console.log("\n[every rule the generator can refuse with has a case here  (derived from its RULES)]");
  {
    const rules = Object.keys(GEN.RULES);
    rec(`the generator names ${rules.length} rules`, rules.length >= 15, rules);
    const missing = rules.filter((x) => !CASES.some((c) => c.rule === x));
    rec("⭐ each one has a case above", missing.length === 0, missing);
    const notRefused = rules.filter((x) => !covered.has(x));
    rec("⭐ …and each one was refused for", notRefused.length === 0, notRefused);
    rec("every case names a real rule", CASES.every((c) => GEN.RULES[c.rule]), CASES.filter((c) => !GEN.RULES[c.rule]).map((c) => c.rule));
  }

  console.log("\n[⭐ the command the build runs exits 1 on a refusal, and names the rule]");
  {
    // As the prebuild hook runs it: a separate process, its exit code the only thing npm looks at. These fixtures ship
    // no image, so the command needs no game to compare art with.
    const run = (fx) => spawnSync(process.execPath, [GEN_PATH, "--root", fx.app, "--date", DATE], { encoding: "utf8", windowsHide: true, timeout: 120000 });
    const clean = makeFixture();
    fs.rmSync(path.join(clean.app, "public", "logo.png"));
    const ok = run(clean);
    const out = path.join(clean.app, GEN.NOTICES_FILE);
    rec("a clean tree: exit 0, and the notices are written", ok.status === 0 && fs.existsSync(out) && /^OK: /m.test(ok.stdout), { status: ok.status, out: String(ok.stdout).slice(-400), err: String(ok.stderr).slice(-400) });
    const bad = makeFixture();
    fs.rmSync(path.join(bad.app, "public", "logo.png"));
    editJson(path.join(bad.nm, "alpha", "package.json"), (j) => { j.license = "GPL-3.0-only"; });
    const no = run(bad);
    rec("⭐ a refused tree: exit 1, the rule named, and nothing written",
      no.status === 1 && /^FAIL \[licence-not-allowed\] /m.test(no.stdout) && /^REFUSED: /m.test(no.stdout) && !fs.existsSync(path.join(bad.app, GEN.NOTICES_FILE)),
      { status: no.status, out: String(no.stdout).slice(-400), err: String(no.stderr).slice(-400) });
  }
}

main()
  .catch((e) => { fails.push("crashed: " + (e && e.stack || e)); console.log("  FAIL crashed: " + (e && e.stack || e)); })
  .finally(() => {
    try { fs.rmSync(BASE, { recursive: true, force: true }); } catch (_) { /* a temp folder this test made; the OS cleans up the rest */ }
    console.log(`\n=== the notices generator refuses: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  });
