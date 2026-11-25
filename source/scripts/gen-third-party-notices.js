#!/usr/bin/env node
// gen-third-party-notices.js — THIRD-PARTY-NOTICES.txt, DERIVED FROM WHAT IS PACKED, NEVER TYPED.
//
// Nova ships other people's code: 151 npm packages, Electron (Chromium, FFmpeg, WebKit), libvips and the LGPL libraries
// inside it, texconv.exe, and electron-builder's elevate.exe and launcher plug-ins. Their licences ask for notices, and
// the LGPL ones ask for a prominent notice, copies of the GPL and the LGPL, copyright lines and a source offer. 1.0.4 to
// 1.0.6 shipped none of that for libvips (licence workflow, 2026-11-13). A hand-kept list is what goes stale between
// releases, so this script reads every fact out of the tree it is given and refuses, with a named rule, when the tree
// says something a person has not reviewed. Design: the licence workflow's THIRD-PARTY-NOTICES.md, sections 3 and 4.
//
// Typed here: only policy (which licences may ship beside Nova's own, the MIT licence) and the
// section headings. Typed elsewhere, each with a staleness check: third-party/reviewed-binaries.json (sha256 per
// binary, and for each LGPL one where its source is, for the version its version resource gives),
// third-party/electron-sources.json (the Electron version), third-party/libvips-sources.json (where the source of the
// libvips DLLs is, checked for one sharp version), third-party/licenses and third-party/notices (SHA256SUMS). Optional:
// copyright lines a person copied out of the libvips libraries' sources (third-party/notices/lgpl-copyright-lines.txt,
// pinned to sharp's versions.json). The notices never invent a copyright line, and every source location they give is a
// pinned upstream one, so nothing is left for a person to copy, attach or upload (the owner's decision, 2026-11-20: the
// release is the exe, uploaded by hand, and nothing else).
//
// Every `npm run build` runs it first (the prebuild hooks in package.json, beside the icon generator), against the repo
// and its node_modules, so THIRD-PARTY-NOTICES.txt is written at the repo root before electron-builder copies it to the
// app root (build.extraFiles). A refusal stops the build there: electron-builder only WARNS about a missing extraFiles
// source, so without this a build would ship with no notices, or with a stale copy. By hand:
//   node scripts/gen-third-party-notices.js [--root <app root>] [--node-modules <dir>] [--target portable|dir]
// and against the BUILT output, after electron-builder, to check that what shipped is what was derived (gate G2):
//   node scripts/gen-third-party-notices.js --check --app-dir dist/win-unpacked --portable <exe>
// The app root defaults to this script's repo. Exit 0: written (or, with --check, the built app matches). Exit 1:
// refused; each refusal is printed as "FAIL [rule] message". Nothing is written when it refuses. Exit 2: a usage error.
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");
const { spawnSync } = require("child_process");

const REPO = path.join(__dirname, "..");
/** The file this writes, at the app root; build.extraFiles copies it next to the exe. */
const NOTICES_FILE = "THIRD-PARTY-NOTICES.txt";

/** Every refusal names one of these. */
const RULES = {
  "pinned-text": "a vendored licence text or a hand-written notice differs from its pinned sha256, has no pin, or has no recorded source",
  "package-missing": "a production dependency is not installed",
  "licence-not-allowed": "a package's licence is not on the list of licences Nova may ship beside its own",
  "no-licence": "a package has no licence field and no recognisable licence file",
  "sharp-readme": "the sharp README, or its Licensing section, is missing",
  "sharp-versions": "an LGPL or MPL library in the sharp table has no versions.json entry",
  "lgpl-block": "the LGPL block does not name every LGPL or MPL library in the sharp table",
  "lgpl-copyright-lines": "third-party/notices/lgpl-copyright-lines.txt (optional) was copied for other versions than sharp's versions.json, or holds no copyright line",
  "electron-version": "Electron is not the version third-party/electron-sources.json pins, or reports another Chromium",
  "electron-files": "Electron's LICENSE or LICENSES.chromium.html is missing, or differs from Electron's own",
  "chromium-credits": "the Chromium credits lost FFmpeg's or WebKit's entry, or its LGPL text",
  "binary-unreviewed": "a binary that ships has no entry in third-party/reviewed-binaries.json",
  "binary-changed": "a reviewed binary has changed since its licence was reviewed",
  "launcher-binary": "the portable launcher embeds a binary nobody reviewed, or it could not be read",
  "data-licence": "a data file names a licence that has no vendored text, or points at a file that does not ship",
  "template-field": "a notice template has a field this script cannot fill",
  "source-location": "an LGPL or MPL component has no pinned source location in the LGPL block, a source location is a placeholder, a branch or a release page, or a release page of another version is named",
  "game-art": "a shipped image is byte-identical to a game or Workshop file, or the game cannot be found to compare",
  "unclassified-file": "a file in the built app is none of: Electron's own, the exe, Nova's notice files, an npm package's, a reviewed binary",
  "asar-package": "a package ships in app.asar without a notice",
  "notices-differ": "a notice file in the built app is not the one derived from this tree",
};

// ── Policy (typed on purpose; small) ───────────────────────────────────────────────────────────────────────────────
// Licences Nova may ship. Nova itself is under the MIT licence, so code whose licence would put the whole program
// under its own terms (GPL, AGPL, SSPL), or forbids what MIT allows ("UNLICENSED", CC-BY-NC on code, the Commons
// Clause), may not ship in it.
const ALLOWED_SPDX = new Set(["MIT", "ISC", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0", "BlueOak-1.0.0", "Zlib", "0BSD",
  "CC0-1.0", "Unlicense"]);
// The LGPL is allowed only where its code is a separate DLL a user can swap (libvips-42.dll).
const ALLOWED_LGPL_PACKAGES = new Set(["@img/sharp-win32-x64"]);
const LGPL_ID = /^LGPL-(2\.0|2\.1|3\.0)(-only|-or-later)?$/;
const IMAGE_EXT = /\.(dds|png|jpe?g|tga|bmp|gif|webp|ico|svg)$/i;
const RULE_LINE = "=".repeat(78);

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
/** The text with CRLF made LF: how git stores text, and the form every pin in third-party/ is taken over. */
const lfBytes = (buf) => Buffer.from(buf.toString("latin1").replace(/\r\n/g, "\n"), "latin1");
const lfText = (s) => String(s).replace(/\r\n/g, "\n");
const BOM = String.fromCharCode(0xfeff);
const readJson = (p) => { const s = fs.readFileSync(p, "utf8"); return JSON.parse(s.startsWith(BOM) ? s.slice(1) : s); };
const exists = (p) => { try { fs.accessSync(p); return true; } catch (_) { return false; } };
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch (_) { return false; } };
const winPath = (rel) => String(rel).split("/").join("\\");

// ── SPDX expressions (spdx-expression-parse is not installed, and nothing is installed for this) ─────────────────
/** Parse "MIT", "(MIT AND Zlib)", "Apache-2.0 AND LGPL-3.0-or-later", "MIT OR GPL-3.0", "X WITH exception". Throws. */
function parseSpdx(expr) {
  const src = String(expr || "").trim();
  const toks = src.match(/\(|\)|[^\s()]+/g) || [];
  if (!toks.length) throw new Error("empty licence expression");
  let i = 0;
  const kw = (t, w) => typeof t === "string" && t.toUpperCase() === w;
  const atom = () => {
    const t = toks[i++];
    if (t === "(") {
      const e = orExpr();
      if (toks[i++] !== ")") throw new Error(`"${src}": a "(" is not closed`);
      return e;
    }
    if (t === undefined || t === ")" || kw(t, "AND") || kw(t, "OR") || kw(t, "WITH")) throw new Error(`"${src}": a licence id is missing`);
    if (!/^[A-Za-z0-9.+:-]+$/.test(t)) throw new Error(`"${src}": "${t}" is not a licence id`);
    return { id: t };
  };
  const withExpr = () => {
    const a = atom();
    if (kw(toks[i], "WITH")) { i++; const ex = toks[i++]; if (!ex || ex === "(" || ex === ")") throw new Error(`"${src}": WITH names no exception`); return { op: "WITH", l: a, exception: ex }; }
    return a;
  };
  const andExpr = () => { let l = withExpr(); while (kw(toks[i], "AND")) { i++; l = { op: "AND", l, r: withExpr() }; } return l; };
  const orExpr = () => { let l = andExpr(); while (kw(toks[i], "OR")) { i++; l = { op: "OR", l, r: andExpr() }; } return l; };
  const tree = orExpr();
  if (i !== toks.length) throw new Error(`"${src}": unexpected "${toks[i]}"`);
  return tree;
}
/** True when one way of meeting the expression uses only licences `leafOk` accepts: OR needs one side, AND both. */
function spdxSatisfied(node, leafOk) {
  if (node.id) return leafOk(node.id.replace(/\+$/, ""));
  if (node.op === "OR") return spdxSatisfied(node.l, leafOk) || spdxSatisfied(node.r, leafOk);
  if (node.op === "AND") return spdxSatisfied(node.l, leafOk) && spdxSatisfied(node.r, leafOk);
  return false;   // WITH: no licence exception is on the list
}
function licenceAllowed(expr, pkgName) {
  const tree = parseSpdx(expr);
  return spdxSatisfied(tree, (id) => ALLOWED_SPDX.has(id) || (ALLOWED_LGPL_PACKAGES.has(pkgName) && LGPL_ID.test(id)));
}

// ── Templates: third-party/notices/*.txt ──────────────────────────────────────────────────────────────────────────
// {field} is filled from what was derived; a line that is only {licence:FILE} becomes that vendored text, verbatim; a
// line starting "[portable] " is kept, without the prefix, only when the build carries the portable launcher.
function renderTemplate(ctx, name, fields) {
  const file = path.join(ctx.noticesDir, name);
  if (!exists(file)) { ctx.problem("pinned-text", `third-party/notices/${name} is missing`); return ""; }
  const out = [];
  for (let line of lfText(fs.readFileSync(file, "utf8")).replace(/\n+$/, "").split("\n")) {
    if (line.startsWith("[portable] ")) { if (!ctx.portable) continue; line = line.slice("[portable] ".length); }
    const inc = /^\{licence:([^{}]+)\}$/.exec(line);
    if (inc) { out.push(vendoredText(ctx, inc[1], name)); continue; }
    out.push(line.replace(/\{([A-Za-z0-9_.-]+)\}/g, (m, key) => {
      if (Object.prototype.hasOwnProperty.call(fields, key) && fields[key] !== null && fields[key] !== undefined) return String(fields[key]);
      ctx.problem("template-field", `third-party/notices/${name}: nothing fills {${key}}`);
      return m;
    }));
  }
  return out.join("\n");
}
function vendoredText(ctx, file, from) {
  const p = path.join(ctx.licensesDir, file);
  if (!exists(p)) { ctx.problem("pinned-text", `third-party/notices/${from} includes licenses/${file}, which is not there`); return `{licence:${file}}`; }
  return lfText(fs.readFileSync(p, "utf8")).replace(/\n+$/, "");
}

// ── Pins: SHA256SUMS over the LF form of every .txt (and VENDORED.json naming the source of every licence text) ──
function checkPins(ctx, dir, label, vendored) {
  const sumsFile = path.join(dir, "SHA256SUMS");
  if (!exists(sumsFile)) { ctx.problem("pinned-text", `${label}/SHA256SUMS is missing`); return; }
  const pins = new Map();
  for (const raw of lfText(fs.readFileSync(sumsFile, "utf8")).split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^([0-9a-f]{64}) [ *]?(.+)$/.exec(line);
    if (!m) { ctx.problem("pinned-text", `${label}/SHA256SUMS: "${line}" is not "<sha256>  <file>"`); continue; }
    pins.set(m[2].trim(), m[1]);
  }
  const texts = fs.readdirSync(dir).filter((n) => /\.txt$/i.test(n) && fs.statSync(path.join(dir, n)).isFile()).sort();
  for (const n of texts) if (!pins.has(n)) ctx.problem("pinned-text", `${label}/${n} has no pin in SHA256SUMS`);
  for (const [n, pin] of pins) {
    const p = path.join(dir, n);
    if (!exists(p)) { ctx.problem("pinned-text", `${label}/SHA256SUMS pins ${n}, which is not there`); continue; }
    const got = sha256(lfBytes(fs.readFileSync(p)));
    if (got !== pin) ctx.problem("pinned-text", `${label}/${n} differs from its pin (sha256 ${got}, pinned ${pin}): a vendored text is copied verbatim, never edited`);
  }
  if (vendored) {
    const listed = new Set((vendored.texts || []).map((t) => t.file));
    for (const n of texts) if (!listed.has(n)) ctx.problem("pinned-text", `${label}/${n} has no entry in VENDORED.json saying where it came from`);
    for (const n of listed) if (!texts.includes(n)) ctx.problem("pinned-text", `${label}/VENDORED.json lists ${n}, which is not there`);
  }
}

// ── D1: the production package set — the dependency closure of package.json, resolved as Node resolves it ─────────
// electron-builder 26.8.1 copies what `npm list --omit dev --include prod --include optional` lists
// (node-module-collector/npmNodeModulesCollector.js); this walks the same graph without running npm.
function productionPackages(ctx) {
  const top = ctx.nodeModules;
  const base = path.dirname(top);
  const resolve = (name, fromDir) => {
    for (let d = fromDir; ; d = path.dirname(d)) {
      if (path.basename(d) !== "node_modules") {
        const cand = path.join(d, "node_modules", ...name.split("/"));
        if (exists(path.join(cand, "package.json"))) return cand;
      }
      if (d === base || path.dirname(d) === d || path.relative(base, d).startsWith("..")) break;
    }
    return null;
  };
  const byId = new Map();
  const seenDirs = new Set();
  const queue = [];
  const deps = (pj) => [
    ...Object.keys(pj.dependencies || {}).map((n) => ({ n, optional: false })),
    ...Object.keys(pj.optionalDependencies || {}).map((n) => ({ n, optional: true })),
    ...Object.keys(pj.peerDependencies || {}).map((n) => ({ n, optional: true })),
  ];
  for (const d of deps(ctx.pkg)) queue.push({ ...d, from: base, by: "package.json" });
  while (queue.length) {
    const { n, optional, from, by } = queue.shift();
    const dir = resolve(n, from);
    if (!dir) { if (!optional) ctx.problem("package-missing", `${n} (required by ${by}) is not installed under ${top}`); continue; }
    const key = path.resolve(dir).toLowerCase();
    if (seenDirs.has(key)) continue;
    seenDirs.add(key);
    let pj;
    try { pj = readJson(path.join(dir, "package.json")); } catch (e) { ctx.problem("no-licence", `${dir}: package.json cannot be read (${e.message})`); continue; }
    const id = `${pj.name}@${pj.version}`;
    if (!byId.has(id)) byId.set(id, { id, name: pj.name, version: pj.version, pj, dir, dirs: [dir] });
    else byId.get(id).dirs.push(dir);
    for (const d of deps(pj)) queue.push({ ...d, from: dir, by: id });
  }
  return [...byId.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.version < b.version ? -1 : 1));
}

// ── D2: each package's licence and its texts ───────────────────────────────────────────────────────────────────
const LIC_FILE = /^(licen[cs]e|copying|unlicense)([-_.].*)?$/i;
const NOTICE_FILE = /^notice([-_.].*)?$/i;
const README_FILE = /^readme(\.(md|markdown|txt))?$/i;
const filesMatching = (dir, re) => {
  try { return fs.readdirSync(dir).filter((n) => re.test(n) && fs.statSync(path.join(dir, n)).isFile()).sort(); } catch (_) { return []; }
};
function declaredLicence(pj) {
  if (typeof pj.license === "string" && pj.license.trim()) return pj.license.trim();
  if (pj.license && typeof pj.license === "object" && pj.license.type) return String(pj.license.type);
  if (Array.isArray(pj.licenses) && pj.licenses.length) {
    const ids = pj.licenses.map((l) => (l && typeof l === "object" ? l.type : l)).filter(Boolean);
    return ids.length > 1 ? "(" + ids.join(" OR ") + ")" : ids[0] || null;
  }
  return null;
}
function readmeLicenceSection(dir) {
  for (const n of filesMatching(dir, README_FILE)) {
    const lines = lfText(fs.readFileSync(path.join(dir, n), "utf8")).split("\n");
    const start = lines.findIndex((l) => /^#{1,6}\s*licen[cs]e/i.test(l) || /^licen[cs]e\s*$/i.test(l));
    if (start < 0) continue;
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) if (/^#{1,6}\s/.test(lines[i])) { end = i; break; }
    const body = lines.slice(start, end).join("\n").trim();
    if (/Permission is hereby granted|Copyright/i.test(body)) return { from: n, text: body };
  }
  return null;
}
function leadingCommentOfMain(dir, pj) {
  for (const c of [pj.main, "index.js", String(pj.name || "").split("/").pop() + ".js"].filter(Boolean)) {
    const p = path.join(dir, /\.[cm]?js$/.test(c) ? c : c + ".js");
    if (!exists(p)) continue;
    const src = lfText(fs.readFileSync(p, "utf8").slice(0, 8000));
    const m = src.match(/^\s*((?:\/\/[^\n]*\n)+|\/\*[\s\S]*?\*\/)/);
    if (m && /Permission is hereby granted|Copyright/i.test(m[1])) return { from: path.basename(p), text: m[1].trim() };
  }
  return null;
}
function describePackage(ctx, p) {
  const texts = filesMatching(p.dir, LIC_FILE).map((f) => ({ from: f, text: lfText(fs.readFileSync(path.join(p.dir, f), "utf8")).replace(/\s+$/, "") }));
  const notices = filesMatching(p.dir, NOTICE_FILE).map((f) => ({ from: f, text: lfText(fs.readFileSync(path.join(p.dir, f), "utf8")).replace(/\s+$/, "") }));
  let licence = declaredLicence(p.pj);
  let note = null;
  if (!licence) {
    // exif-parser has no licence field; its LICENSE.md is MIT. Only an unmistakable MIT text is read this way.
    const t = texts.map((x) => x.text).join("\n");
    if (/\bMIT License\b/.test(t.slice(0, 400)) || /Permission is hereby granted, free of charge/.test(t)) { licence = "MIT"; note = "package.json names no licence; its licence file is the MIT licence"; }
  }
  if (!licence) ctx.problem("no-licence", `${p.id}: no licence field and no recognisable licence file`);
  else {
    let ok = false;
    try { ok = licenceAllowed(licence, p.name); } catch (e) { ctx.problem("licence-not-allowed", `${p.id}: licence "${licence}" cannot be read (${e.message})`); licence = licence + " (unreadable)"; }
    if (!ok && !/unreadable/.test(licence)) ctx.problem("licence-not-allowed", `${p.id}: licence "${licence}" is not on the list of licences Nova may ship (ALLOWED_SPDX in scripts/gen-third-party-notices.js)`);
  }
  if (!texts.length) {
    const r = readmeLicenceSection(p.dir) || leadingCommentOfMain(p.dir, p.pj);
    if (r) { texts.push(r); note = `licence text taken from ${r.from}: the package has no licence file, and electron-builder leaves READMEs out of the app`; }
    else {
      const author = typeof p.pj.author === "string" ? p.pj.author : p.pj.author && p.pj.author.name;
      const repo = (p.pj.repository && (p.pj.repository.url || p.pj.repository)) || p.pj.homepage || "unknown";
      note = `the npm package carries no licence text or copyright line; it declares "${licence}", author "${author || "unknown"}", ${repo}`;
      ctx.warn(`${p.id}: ${note}`);
    }
  }
  const homepage = p.pj.homepage || (p.pj.repository && (p.pj.repository.url || p.pj.repository)) || null;
  return { id: p.id, name: p.name, version: p.version, licence, homepage: homepage ? String(homepage) : null, texts, notices, note };
}

// ── D3: the libraries inside libvips-42.dll ────────────────────────────────────────────────────────────────────
function sharpLibraries(ctx, pkgs) {
  const sharp = pkgs.find((p) => p.name === "@img/sharp-win32-x64");
  if (!sharp) return null;
  const readme = path.join(sharp.dir, "README.md");
  if (!exists(readme)) { ctx.problem("sharp-readme", `${sharp.id}: README.md is missing, so the table of the LGPL libraries inside libvips-42.dll has nowhere to come from`); return { sharp, section: null, rows: [], versions: {} }; }
  const md = lfText(fs.readFileSync(readme, "utf8"));
  const lines = md.split("\n");
  const at = lines.findIndex((l) => /^##\s+Licensing\s*$/.test(l));
  if (at < 0) { ctx.problem("sharp-readme", `${sharp.id}: README.md has no "## Licensing" section`); return { sharp, section: null, rows: [], versions: {} }; }
  let end = lines.length;
  for (let i = at + 1; i < lines.length; i++) if (/^##\s/.test(lines[i])) { end = i; break; }
  const section = lines.slice(at, end).join("\n").replace(/\s+$/, "");
  const rows = [];
  for (const l of lines.slice(at, end)) {
    const m = /^\|\s*([^|]+?)\s*\|\s*(.+?)\s*\|\s*$/.exec(l);
    if (!m || /^-+$/.test(m[1]) || /^library$/i.test(m[1])) continue;
    rows.push({ library: m[1], terms: m[2], lgpl: /LGPL/i.test(m[2]), mpl: /Mozilla Public License|\bMPL\b/i.test(m[2]) });
  }
  if (!rows.length) ctx.problem("sharp-readme", `${sharp.id}: the Licensing section has no table of libraries`);
  let versions = {};
  const vj = path.join(sharp.dir, "versions.json");
  if (exists(vj)) { try { versions = readJson(vj); } catch (e) { ctx.problem("sharp-versions", `${sharp.id}: versions.json cannot be read (${e.message})`); } }
  else ctx.problem("sharp-versions", `${sharp.id}: versions.json is missing`);
  for (const r of rows) {
    const cands = [r.library, r.library.replace(/^lib/, ""), r.library.replace(/^lib/, "").replace(/\d+$/, "")];
    r.key = cands.find((k) => Object.prototype.hasOwnProperty.call(versions, k)) || null;
    r.version = r.key ? versions[r.key] : null;
    // libnsgif has no entry (it is built inside libvips); only a library whose source must be offered needs one.
    if ((r.lgpl || r.mpl) && !r.key) ctx.problem("sharp-versions", `${sharp.id}: ${r.library} (${r.terms}) has no versions.json entry, so its source cannot be offered at an exact version`);
  }
  return { sharp, section, rows, versions };
}

// ── D4 / D5: Electron, Chromium, FFmpeg, WebKit ──────────────────────────────────────────────────────────────
function decodeHtml(s) {
  return s.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(Number(d))).replace(/&amp;/g, "&");
}
/** The copyright notices in a credits entry: each paragraph that starts "Copyright (c)/(C)/© <year>", minus the FSF's
 *  own line at the top of a GNU licence text the entry quotes. */
function copyrightParagraphs(text) {
  const lines = lfText(text).split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*Copyright\s+(\(c\)|\(C\)|©)\s*\d{4}/.test(lines[i])) continue;
    const before = lines.slice(Math.max(0, i - 4), i).join("\n");
    if (/Free Software Foundation/.test(lines[i]) && /Version \d(\.\d)?, \w+ \d{4}/.test(before)) continue;
    const para = [lines[i].trim()];
    for (let j = i + 1; j < lines.length && lines[j].trim() && !/^\s*Copyright\s/.test(lines[j]); j++) { para.push(lines[j].trim()); i = j; }
    const p = para.join("\n");
    if (!out.includes(p)) out.push(p);
  }
  return out;
}
/** The electron package folder. --electron may name it, or its dist folder, where electron.exe and the two licence
 *  files are: a natural thing to type, which read nothing useful when it was taken as the package folder (a run with
 *  node_modules/electron/dist was refused for {electron} and the Electron DLLs, 2026-11-20). */
function electronPackageDir(dir) {
  if (exists(path.join(dir, "package.json")) || path.basename(dir).toLowerCase() !== "dist") return dir;
  const up = path.dirname(dir);
  try { if (readJson(path.join(up, "package.json")).name === "electron") return up; } catch (_) { /* not Electron's dist: keep what was given */ }
  return dir;
}
function electronFacts(ctx) {
  const dir = ctx.electronDir;
  const facts = { version: null, chrome: null, license: null, credits: null, ffmpegLines: [], webkitLines: [] };
  if (!dir || !exists(path.join(dir, "package.json"))) { ctx.problem("electron-files", `no Electron at ${dir || "(none)"}: pass --electron <repo>/node_modules/electron`); return facts; }
  facts.version = readJson(path.join(dir, "package.json")).version;
  const pinned = ctx.electronSources;
  if (!pinned || pinned.electron !== facts.version) ctx.problem("electron-version", `node_modules/electron is ${facts.version}, but third-party/electron-sources.json pins ${pinned ? pinned.electron : "nothing"}: re-check the Chromium version and FFmpeg's DEPS pin, then update it`);
  facts.chrome = pinned ? pinned.chromium : null;
  const exe = path.join(dir, "dist", process.platform === "win32" ? "electron.exe" : "electron");
  if (ctx.askElectron !== false && exists(exe)) {
    const r = spawnSync(exe, ["-p", "process.versions.chrome"], { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, encoding: "utf8", windowsHide: true, timeout: 60000 });
    const said = String(r.stdout || "").trim();
    if (r.status !== 0 || !/^\d+(\.\d+){3}$/.test(said)) ctx.problem("electron-version", `could not ask ${exe} for its Chromium version (${r.error ? r.error.message : String(r.stderr || "").trim().slice(0, 200)})`);
    else if (pinned && said !== pinned.chromium) ctx.problem("electron-version", `Electron reports Chromium ${said}, but third-party/electron-sources.json pins ${pinned.chromium}`);
    else facts.chrome = said;
  } else ctx.warn(`Chromium version taken from third-party/electron-sources.json: there is no ${exe} to ask`);
  const lic = path.join(dir, "dist", "LICENSE");
  const credits = path.join(dir, "dist", "LICENSES.chromium.html");
  if (!exists(lic)) ctx.problem("electron-files", `Electron's LICENSE is missing (${lic})`); else facts.license = fs.readFileSync(lic);
  if (!exists(credits)) { ctx.problem("electron-files", `Electron's LICENSES.chromium.html is missing (${credits})`); return facts; }
  facts.credits = fs.readFileSync(credits);
  const html = facts.credits.toString("utf8");
  const products = new Map();
  for (const m of html.matchAll(/<div class="product">\s*<span class="title">([\s\S]*?)<\/span>[\s\S]*?<pre>([\s\S]*?)<\/pre>/g)) {
    const title = decodeHtml(m[1]).trim();
    if (!products.has(title)) products.set(title, decodeHtml(m[2]));
  }
  for (const [title, key] of [["ffmpeg", "ffmpegLines"], ["WebKit", "webkitLines"]]) {
    const text = products.get(title);
    if (text === undefined) { ctx.problem("chromium-credits", `LICENSES.chromium.html has no "${title}" entry: check whether it still ships, and under what licence`); continue; }
    if (!/GNU (LESSER|LIBRARY) GENERAL PUBLIC LICENSE/.test(text)) ctx.problem("chromium-credits", `LICENSES.chromium.html: the "${title}" entry no longer carries the LGPL text`);
    facts[key] = copyrightParagraphs(text);
    if (!facts[key].length) ctx.problem("chromium-credits", `LICENSES.chromium.html: the "${title}" entry has no copyright line`);
  }
  return facts;
}

// ── Reviewed binaries (D7 and the Electron DLLs whose notices Nova writes) ───────────────────────────────────
const reviewedKey = (file) => String(file).toLowerCase().replace(/\.[^.]+$/, "");
function findCaseInsensitive(dir, name) {
  try { const hit = fs.readdirSync(dir).find((n) => n.toLowerCase() === String(name).toLowerCase()); return hit ? path.join(dir, hit) : null; } catch (_) { return null; }
}
function checkReviewedBinaries(ctx) {
  const shipped = [];   // { entry, where } — the reviewed binaries this build carries, in notice order
  const reviewed = ctx.reviewed;
  const byName = (name, inWhere) => reviewed.find((b) => b.file.toLowerCase() === String(name).toLowerCase() && b.in === inWhere);
  for (const r of (ctx.pkg.build && ctx.pkg.build.extraResources) || []) {
    const from = typeof r === "string" ? r : r.from;
    const to = typeof r === "string" ? r : (r.to || r.from);
    // Texconv.exe is tracked; extraResources says texconv.exe. Windows does not care, git and a stage might.
    const file = findCaseInsensitive(path.join(ctx.root, path.dirname(from)), path.basename(from));
    const entry = byName(path.basename(from), "resources");
    if (!entry) { ctx.problem("binary-unreviewed", `extraResources ${from}: no entry in third-party/reviewed-binaries.json; a person must review its licence first`); continue; }
    if (!file) { ctx.problem("binary-unreviewed", `extraResources ${from}: not found in ${ctx.root}`); continue; }
    const got = sha256(fs.readFileSync(file));
    if (got !== entry.sha256) { ctx.problem("binary-changed", `extraResources ${from}: changed since its licence was reviewed (sha256 ${got}, reviewed ${entry.sha256}); review it and update its entry`); continue; }
    shipped.push({ entry, where: winPath(path.posix.join("resources", to.replace(/\\/g, "/"))) });
  }
  for (const entry of reviewed.filter((b) => b.in === "app-root")) {
    const file = path.join(ctx.electronDir || "", "dist", entry.path || entry.file);
    if (!exists(file)) { ctx.problem("binary-changed", `${entry.file} is reviewed as shipped by Electron, but Electron's dist has no ${entry.path || entry.file}: review the notices for this Electron`); continue; }
    const got = sha256(fs.readFileSync(file));
    if (got !== entry.sha256) ctx.problem("binary-changed", `Electron's ${entry.file} changed since its notice was reviewed (sha256 ${got}, reviewed ${entry.sha256})`);
  }
  if (ctx.portable) for (const entry of reviewed.filter((b) => b.ships === "portable" && b.in === "resources")) shipped.push({ entry, where: winPath(path.posix.join("resources", entry.path || entry.file)) });
  return shipped;
}

// ── The shipped set: what electron-builder will put into app.asar, asked of electron-builder itself ──────────
// Its own matcher (app-builder-lib, resolved from the app root first, then from this script), with build.extraResources
// and build.extraFiles turned into exclusions exactly as its platformPackager does (26.8.1, platformPackager.js 190-203):
// a source those copy outside the asar never goes into it. Measured 2026-11-18: that keeps LICENSE out of app.asar
// although build.files names it, because build.extraFiles copies it to the app root as LICENSE.txt. A model of the
// packer's rules typed here would not have known that; asking the packer cannot drift from it. electron-builder walks the
// working tree, not git, so an untracked file under public/ ships too: this walks the tree the same way, pruning every
// folder the filter refuses (so backups/ and the worktrees under .claude/ are never read).
// opts.extraExcludes === false leaves the extraResources/extraFiles exclusions out: what build.files alone matches.
function electronBuilderAppFilters(root, pkg, opts) {
  const o = opts || {};
  let abl;
  try { abl = path.dirname(require.resolve("app-builder-lib/package.json", { paths: [root, __dirname] })); }
  catch (e) { throw new Error("app-builder-lib (electron-builder's packer) is not installed, so what it will pack cannot be known: " + e.message); }
  const { getFileMatchers, getMainFileMatchers } = require(path.join(abl, "out", "fileMatcher.js"));
  const config = pkg.build || {};
  const platform = config.win || {};
  const dirs = config.directories || {};
  const outDir = path.resolve(root, dirs.output || "dist");
  const appOutDir = path.join(outDir, "win-unpacked");
  // electron-builder expands ${os}, ${arch} and the like in patterns; Nova's have none, and a model that ignored one would
  // be wrong without saying so.
  const expand = (s) => { if (String(s).includes("${")) throw new Error(`build pattern "${s}" uses a macro, which this script does not expand`); return s; };
  const excludePatterns = [];
  if (o.extraExcludes !== false) {
    const fmOpts = { macroExpander: expand, customBuildOptions: platform, globalOutDir: outDir, defaultSrc: root };
    for (const name of ["extraResources", "extraFiles"]) {
      for (const m of getFileMatchers(config, name, appOutDir, fmOpts) || []) m.computeParsedPatterns(excludePatterns, root);
    }
  }
  const info = { projectDir: root, buildResourcesDir: path.resolve(root, dirs.buildResources || "build"), config, isPrepackedAppAsar: false, debugLogger: { isEnabled: false } };
  const matchers = getMainFileMatchers(root, path.join(appOutDir, "resources", "app"), expand, platform, { info }, outDir, false);
  return matchers.map((m) => {
    if (excludePatterns.length) m.excludePatterns = excludePatterns;
    return { from: m.from, filter: m.createFilter() };
  });
}
/** The files (paths relative to `root`, "/"-separated) electron-builder would pack into app.asar, node_modules aside. */
function shippedFiles(root, pkg, opts) {
  const out = new Set();
  const asDir = { isDirectory: () => true };
  const asFile = { isDirectory: () => false };
  for (const { from, filter } of electronBuilderAppFilters(root, pkg, opts)) {
    const walk = (abs) => {
      let ents;
      try { ents = fs.readdirSync(abs, { withFileTypes: true }); } catch (_) { return; }
      for (const e of ents) {
        const p = path.join(abs, e.name);
        if (e.isDirectory()) { if (e.name !== "node_modules" && filter(p, asDir)) walk(p); }
        else if (e.isFile() && filter(p, asFile)) out.add(path.relative(root, p).split(path.sep).join("/"));
      }
    };
    walk(from);
  }
  return [...out].sort();
}

// ── D9: what the shipped data files say about their own licences ──────────────────────────────────────────────
const normUrl = (u) => String(u || "").trim().toLowerCase().replace(/^git\+/, "").replace(/\.git$/, "").replace(/\/+$/, "");
function dataLicences(ctx, shipped) {
  const byComponent = new Map();
  for (const rel of shipped.filter((r) => /^data\/.+\.json$/i.test(r))) {
    let j;
    try { j = readJson(path.join(ctx.root, rel)); } catch (_) { continue; }
    const meta = j && typeof j === "object" && !Array.isArray(j) ? j._meta : null;
    if (!meta || !meta.license) continue;
    const id = (/^\s*([A-Za-z0-9.+-]+)/.exec(String(meta.license)) || [])[1];
    const text = (ctx.vendored.texts || []).find((t) => t.component && normUrl(t.upstream) === normUrl(meta.source) && t.spdx === id);
    if (!text) { ctx.problem("data-licence", `${rel}: _meta.license "${meta.license}" (source ${meta.source || "none"}) has no vendored licence text in third-party/licenses`); continue; }
    for (const m of String(meta.license).matchAll(/\bsee\s+([A-Za-z0-9_./\\-]+[A-Za-z0-9_-])/gi)) {
      const ref = m[1].replace(/\\/g, "/");
      if (/^(THIRD-PARTY-NOTICES|LICENSE)\.txt$/i.test(ref) || shipped.includes(ref)) continue;
      ctx.problem("data-licence", `${rel}: _meta.license points at ${ref}, which does not ship; point it at THIRD-PARTY-NOTICES.txt`);
    }
    if (!exists(path.join(ctx.noticesDir, `${text.component}.txt`))) { ctx.problem("data-licence", `${rel}: there is no notice text third-party/notices/${text.component}.txt for ${text.component}`); continue; }
    if (!byComponent.has(text.component)) byComponent.set(text.component, []);
    byComponent.get(text.component).push(rel);
  }
  return byComponent;
}

// The data-licence rule on its own, for the unit suite (test-the-licence-and-notices-ship.js). It needs only the app
// root's data files and third-party/, not node_modules, so a data file whose licence line names a file that does not
// ship is caught on every change, not first by the prebuild hook. It is the same dataLicences() the build runs.
// `opts.shipped` stands in for what electron-builder would pack (a control's fixture has no package.json).
function checkDataLicences(root, opts) {
  const o = opts || {};
  const r = path.resolve(root || REPO);
  const problems = [];
  const ctx = { root: r, problem: (rule, message) => { if (!RULES[rule]) throw new Error("unnamed rule " + rule); problems.push({ rule, message }); } };
  ctx.licensesDir = path.join(r, "third-party", "licenses");
  ctx.noticesDir = path.join(r, "third-party", "notices");
  try { ctx.vendored = readJson(path.join(ctx.licensesDir, "VENDORED.json")); } catch (e) { ctx.vendored = { texts: [] }; ctx.problem("pinned-text", `third-party/licenses/VENDORED.json cannot be read: ${e.message}`); }
  const shipped = o.shipped || shippedFiles(r, readJson(path.join(r, "package.json")));
  return { problems, licensed: dataLicences(ctx, shipped), shipped };
}

// ── Copyright lines a person copied out of the libvips libraries' sources: OPTIONAL ──────────────────────────────
// libvips and the libraries inside libvips-42.dll have no single upstream copyright line (THIRD-PARTY-NOTICES.md 4.2),
// and the design's step of copying each one's lines in by hand will not be done: the owner is stopping, and a build that
// refused until then never shipped. So the notices name each library, its version and its terms (the block, and sharp's
// table under NPM PACKAGES), and say that its copyright notices are in its own source, at the pinned location the block
// gives; they never invent a line. When this file exists it is still carried, and still checked (its versions line
// against sharp's versions.json, and its pin in SHA256SUMS); when it does not, that is not refused. Returns null then.
function lgplCopyrightLines(ctx, libs) {
  const file = path.join(ctx.noticesDir, "lgpl-copyright-lines.txt");
  if (!exists(file)) return null;
  const wanted = libs ? libs.rows.filter((r) => (r.lgpl || r.mpl) && r.key).map((r) => [r.key, r.version]) : [];
  const how = "copy each LGPL and MPL library's copyright lines out of its source at the versions.json version " +
    "(its COPYING and AUTHORS files and the headers of its main files) into third-party/notices/lgpl-copyright-lines.txt, " +
    `under a first line "# versions: ${wanted.map(([k, v]) => `${k} ${v}`).join(", ")}", and pin it in third-party/notices/SHA256SUMS; ` +
    "or delete the file, which is optional";
  const lines = lfText(fs.readFileSync(file, "utf8")).split("\n");
  const head = /^#\s*versions:\s*(.*)$/.exec(lines[0] || "");
  const had = new Map();
  if (head) for (const part of head[1].split(",")) { const m = /^\s*(\S+)\s+(\S+)\s*$/.exec(part); if (m) had.set(m[1], m[2]); }
  const stale = wanted.filter(([k, v]) => had.get(k) !== v).map(([k, v]) => `${k} ${v} (the file says ${had.has(k) ? had.get(k) : "nothing"})`);
  if (!head || stale.length) ctx.problem("lgpl-copyright-lines", `third-party/notices/lgpl-copyright-lines.txt was copied for other versions than sharp's versions.json: ${stale.join("; ") || "no '# versions:' first line"}; ${how}`);
  const body = lines.slice(1).filter((l) => l.trim() && !/^#/.test(l));
  if (!body.length) ctx.problem("lgpl-copyright-lines", `third-party/notices/lgpl-copyright-lines.txt has no copyright lines: ${how}`);
  return body;
}

// ── D11: where the source of every LGPL and MPL component is, pinned to the version this build carries ────────
// GPL-3.0 s.6(d), which LGPL-3.0 s.4(d) uses, lets the Corresponding Source sit on a third party's server, given clear
// directions next to the object code; MPL-2.0 s.3.2(a) asks that recipients are told how to get it. So the LGPL block
// gives exact upstream locations, as it always did for Electron, Chromium and FFmpeg, and nothing is left to attach to a
// release. A location is pinned when it names the version (tag, revision) that ships, and no branch; Nova's own release
// page is never one: it carries the exe, and only the exe. Each version below is derived (versions.json, the installed
// packages, the reviewed binaries' records), never typed here.
const MOVING_REF = /\/(?:tree|blob|commits?)\/(?:main|master|HEAD|develop|trunk)(?:[/?#]|$)|\/\+\/(?:main|master|HEAD|refs\/heads\/)|\/latest(?:[/?#]|$)/i;
const fillPattern = (pattern, values) => String(pattern).replace(/\{([A-Za-z0-9_.-]+)\}/g, (m, k) => (values[k] !== undefined && values[k] !== null ? String(values[k]) : m));
/** The digits of a version, its trailing zero parts aside: "19.00.0.0" and "19.00" are "19"; "1.1.4.0" and "1.14" are
 *  "114". How a source named by its release ("StdUtils 1.14") is matched to a binary's version resource (1.1.4.0). */
function versionDigits(v) {
  const parts = String(v === null || v === undefined ? "" : v).split(".").map((x) => x.replace(/\D/g, ""));
  while (parts.length > 1 && /^0*$/.test(parts[parts.length - 1])) parts.pop();
  return parts.join("");
}
function sourceLocations(ctx, libs, ef, releasesUrl) {
  const out = [];   // { component, version, pin, terms, why, url, field }
  const LGPL_WHY = "LGPL-3.0 s.4(d), GPL-3.0 s.6(d)";
  const missing = new Set();   // components already refused for having no location, so each is named once
  const none = (component, message) => { missing.add(component); ctx.problem("source-location", message); };
  // The libvips DLLs. Where they come from was read out of sharp's own build scripts for one sharp version
  // (third-party/libvips-sources.json says what was read); another sharp is refused until someone reads them again.
  if (libs && libs.sharp) {
    const rows = libs.rows.filter((r) => (r.lgpl || r.mpl) && r.key);
    const vips = libs.versions.vips || null;
    const chain = ctx.libvipsSources;
    const cppName = "libvips-cpp.dll";
    let dlls = null;
    let cpp = null;
    const refuse = (names, message) => { for (const c of names) missing.add(c); ctx.problem("source-location", message); };
    const all = rows.map((r) => r.library).concat([cppName]);
    if (!chain || typeof chain !== "object") {
      refuse(all, `third-party/libvips-sources.json is missing or cannot be read, so ${all.join(", ")} have no source location`);
    } else if (chain.checkedFor !== libs.sharp.version) {
      refuse(all, `third-party/libvips-sources.json was checked for ${chain.package || "@img/sharp-win32-x64"} ${chain.checkedFor}, but ${libs.sharp.id} is installed: read that version's own build scripts for win32-x64 again (its "checked" says which), then update it`);
    } else {
      if (!vips) refuse(rows.map((r) => r.library), `${libs.sharp.id}: versions.json names no vips version, so the source of libvips-42.dll cannot be pinned`);
      else if (!chain.dlls) refuse(rows.map((r) => r.library), "third-party/libvips-sources.json names no \"dlls\" location, so the libraries inside libvips-42.dll have none");
      else dlls = fillPattern(chain.dlls, { vips });
      if (!chain.cpp) refuse([cppName], `third-party/libvips-sources.json names no "cpp" location, so ${cppName} has none`);
      else cpp = fillPattern(chain.cpp, { sharp: libs.sharp.version });
    }
    for (const r of rows) out.push({ component: r.library, version: r.version, pin: vips, terms: r.terms, why: r.mpl ? "MPL-2.0 s.3.2(a)" : LGPL_WHY, url: dlls, field: "libvipsSource" });
    out.push({ component: cppName, version: libs.sharp.version, pin: libs.sharp.version, terms: "LGPL (libvips' C++ sources), built by sharp", why: LGPL_WHY, url: cpp, field: "libvipsCppSource" });
  }
  // FFmpeg and WebKit: Chromium's tree at the version Electron reports, and Electron's at its tag, which builds both.
  const rev = ctx.electronSources && ctx.electronSources.ffmpegRevision;
  if (ef.version) out.push({ component: "Electron (builds ffmpeg.dll and the program's .exe)", version: ef.version, pin: ef.version, terms: "MIT", why: LGPL_WHY, url: `https://github.com/electron/electron/tree/v${ef.version}` });
  if (ef.chrome) {
    out.push({ component: "Chromium (WebKit code)", version: ef.chrome, pin: ef.chrome, terms: "LGPL-2.0 or LGPL-2.1, and others", why: LGPL_WHY, url: `https://chromium.googlesource.com/chromium/src/+/${ef.chrome}` });
    out.push({ component: "FFmpeg", version: rev || null, pin: rev || ef.chrome, terms: "LGPL-2.1-or-later", why: LGPL_WHY,
      url: rev ? `https://chromium.googlesource.com/chromium/third_party/ffmpeg/+/${rev}` : `https://chromium.googlesource.com/chromium/src/+/${ef.chrome}/DEPS` });
  }
  // The portable launcher's LGPL plug-ins: their reviewed records say where the source of that version is.
  if (ctx.portable) for (const b of ctx.reviewed.filter((x) => x.in === "launcher" && x.lgpl)) {
    const name = b.component || b.file;
    const s = b.source && typeof b.source === "object" && !Array.isArray(b.source) ? b.source : null;
    const urls = s && Array.isArray(s.urls) ? s.urls.filter((u) => typeof u === "string" && u.trim()) : [];
    if (!s || !urls.length) { none(name, `${name} ships in the portable launcher, but third-party/reviewed-binaries.json gives no source location for it: add "source": { "version", "urls" } for the version its version resource gives (${b.fileVersion || "none"})`); continue; }
    if (versionDigits(s.version) === "" || versionDigits(s.version) !== versionDigits(b.fileVersion)) ctx.problem("source-location", `${name}: its source location is for version ${s.version || "(none named)"}, but the binary's version resource says ${b.fileVersion || "nothing"}`);
    for (const u of urls) out.push({ component: name, version: s.version, pin: s.version, terms: b.licence, why: "LGPL-2.1 s.4, GPL-3.0 s.6(d)", url: u.trim(), field: "launcherSources" });
  }
  // Each one pinned: https, filled in, naming the version that ships, on no branch, and not Nova's own repository.
  const own = String(releasesUrl || "").replace(/\/releases\/?$/, "").toLowerCase();
  for (const s of out) {
    if (!s.url) { if (!missing.has(s.component)) none(s.component, `${s.component} has no source location`); continue; }
    if (!/^https:\/\/[^\s<>{}"]+$/.test(s.url)) ctx.problem("source-location", `${s.component}: the source location "${s.url}" is not a filled-in https address`);
    else if (MOVING_REF.test(s.url)) ctx.problem("source-location", `${s.component}: the source location ${s.url} names a branch or "latest", not the version that ships`);
    else if (!s.pin || !s.url.includes(s.pin)) ctx.problem("source-location", `${s.component}: the source location ${s.url} does not name the version that ships (${s.pin || "unknown"})`);
    if (own && s.url.toLowerCase().startsWith(own)) ctx.problem("source-location", `${s.component}: the source location ${s.url} is Nova's own repository; a release page is never a source location`);
  }
  return out;
}

// ── D12: shipped art that belongs to the game or a Workshop mod ──────────────────────────────────────────────
function novaGameFolders() {
  // Nova's own finder (the modder's choice, HOI4_ROOT, Steam's records), never a typed path. Loaded only here: it
  // runs the detection when server.js loads.
  const S = require(path.join(REPO, "server.js"));
  const game = S.hoi4GameFolderFound() ? S.constants.GAME_ROOT : null;
  const ws = S.constants.WORKSHOP_ROOT;
  return { game: game ? [game] : [], workshop: ws && isDir(ws) ? [ws] : [] };
}
function gameArt(ctx, shipped) {
  const images = shipped.filter((r) => IMAGE_EXT.test(r));
  // Nothing that ships is an image: nothing can be the game's art, so the game need not be found or walked.
  if (!images.length) { ctx.gameArtCompared = { images: 0, candidates: 0, matches: 0 }; return; }
  let folders = ctx.gameFolders !== undefined ? { game: ctx.gameFolders || [], workshop: ctx.workshopFolders || [] } : null;
  if (!folders) {
    try { folders = novaGameFolders(); } catch (e) { ctx.problem("game-art", `Nova's game-folder finder failed (${e.message}); shipped art cannot be compared`); return; }
  }
  if (!folders.game.length) { ctx.problem("game-art", "Nova's game-folder finder found no Hearts of Iron IV on this machine, so shipped art cannot be compared with it: set the game folder on Nova's Home page"); return; }
  if (!folders.workshop.length) ctx.warn("no Steam Workshop folder was found: shipped art was compared with the game only");
  const bySize = new Map();
  for (const rel of images) {
    const size = fs.statSync(path.join(ctx.root, rel)).size;
    if (!bySize.has(size)) bySize.set(size, []);
    bySize.get(size).push(rel);
  }
  const shippedSha = new Map();
  const shaOf = (rel) => { if (!shippedSha.has(rel)) shippedSha.set(rel, sha256(fs.readFileSync(path.join(ctx.root, rel)))); return shippedSha.get(rel); };
  const hits = new Map();
  let compared = 0;
  const walk = (dir, label) => {
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p, label); continue; }
      if (!e.isFile() || !IMAGE_EXT.test(e.name)) continue;
      let size;
      try { size = fs.statSync(p).size; } catch (_) { continue; }
      const same = bySize.get(size);
      if (!same) continue;
      let h;
      try { h = sha256(fs.readFileSync(p)); } catch (_) { continue; }
      compared++;
      for (const rel of same) if (shaOf(rel) === h && !hits.has(rel)) hits.set(rel, `${label} ${p}`);
    }
  };
  for (const g of folders.game) walk(path.join(g, "gfx"), "the game's");
  for (const w of folders.workshop) {
    let items = [];
    try { items = fs.readdirSync(w, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name); } catch (_) { items = []; }
    for (const it of items) walk(path.join(w, it, "gfx"), `Workshop item ${it}'s`);
  }
  for (const [rel, where] of [...hits].sort()) ctx.problem("game-art", `${rel} ships, and is byte-identical to ${where}: it is not Nova's to license; take it out`);
  ctx.gameArtCompared = { images: images.length, candidates: compared, matches: hits.size };
}

// ── The built output: D6 (every file classified), D8 (the launcher), D10 (the asar), G2 (the notices themselves) ──
function walkFiles(root) {
  const out = [];
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
      const r = rel ? rel + "/" + e.name : e.name;
      if (e.isDirectory()) walk(r); else if (e.isFile()) out.push(r);
    }
  };
  walk("");
  return out.sort();
}
function peStrings(buf) {
  const w = buf.toString("utf16le");
  const pick = (key) => { const i = w.lastIndexOf(key + "\u0000"); if (i < 0) return null; return w.slice(i + key.length, i + key.length + 160).replace(/\u0000+/g, "|").split("|").filter(Boolean)[0] || null; };
  return { FileDescription: pick("FileDescription"), FileVersion: pick("FileVersion"), LegalCopyright: pick("LegalCopyright") };
}
function checkBuiltApp(ctx, ids, text) {
  const appDir = ctx.appDir;
  if (!isDir(appDir)) { ctx.problem("unclassified-file", `--app-dir ${appDir} is not a folder`); return; }
  const dist = path.join(ctx.electronDir || "", "dist");
  const product = (ctx.pkg.build && ctx.pkg.build.productName) || ctx.pkg.name;
  const reviewedRes = new Map();
  for (const r of (ctx.pkg.build && ctx.pkg.build.extraResources) || []) {
    const to = String((typeof r === "string" ? r : (r.to || r.from))).replace(/\\/g, "/");
    const e = ctx.reviewed.find((b) => b.in === "resources" && b.file.toLowerCase() === path.posix.basename(to).toLowerCase());
    if (e) reviewedRes.set(("resources/" + to).toLowerCase(), e);
  }
  for (const b of ctx.reviewed.filter((x) => x.in === "resources" && x.ships === "portable")) reviewedRes.set(("resources/" + (b.path || b.file)).toLowerCase(), b);
  const asarPath = ctx.asar || path.join(appDir, "resources", "app.asar");
  const unpackedPkg = new Map();
  const sameAs = (a, bufB) => exists(a) && sha256(fs.readFileSync(a)) === sha256(bufB);
  for (const rel of walkFiles(appDir)) {
    const abs = path.join(appDir, ...rel.split("/"));
    const low = rel.toLowerCase();
    if (low === "resources/app.asar") continue;
    if (low.startsWith("resources/app.asar.unpacked/")) {
      const m = /^resources\/app\.asar\.unpacked\/((?:node_modules\/(?:@[^/]+\/)?[^/]+\/)+)/.exec(rel);
      if (!m) { ctx.problem("unclassified-file", `${rel}: unpacked from the asar, but not inside an npm package`); continue; }
      const pkgDir = m[1].replace(/\/$/, "");
      if (!unpackedPkg.has(pkgDir)) {
        let id = null;
        try { const pj = readJson(path.join(appDir, "resources", "app.asar.unpacked", ...pkgDir.split("/"), "package.json")); id = `${pj.name}@${pj.version}`; } catch (_) { id = null; }
        unpackedPkg.set(pkgDir, id);
      }
      const id = unpackedPkg.get(pkgDir);
      if (!id || !ids.has(id)) ctx.problem("unclassified-file", `${rel}: in ${pkgDir}, which is ${id || "no package"}, and that package has no notice`);
      continue;
    }
    if (rel === `${product}.exe`) {
      const head = fs.readFileSync(abs).subarray(0, 2).toString("latin1");
      if (head !== "MZ") ctx.problem("unclassified-file", `${rel}: the program is not a Windows executable`);
      continue;
    }
    if (rel === "LICENSE.electron.txt") { if (!ctx.electronFacts.license || !sameAs(abs, ctx.electronFacts.license)) ctx.problem("electron-files", `${rel} is not Electron's own LICENSE`); continue; }
    if (rel === "LICENSES.chromium.html") { if (!ctx.electronFacts.credits || !sameAs(abs, ctx.electronFacts.credits)) ctx.problem("electron-files", `${rel} is not Electron's own LICENSES.chromium.html`); continue; }
    if (rel === "LICENSE.txt") {
      if (sha256(lfBytes(fs.readFileSync(abs))) !== sha256(lfBytes(fs.readFileSync(path.join(ctx.root, "LICENSE"))))) ctx.problem("notices-differ", "LICENSE.txt in the built app is not this tree's LICENSE");
      continue;
    }
    if (rel === "THIRD-PARTY-NOTICES.txt") continue;   // compared below, as a whole
    if (low.startsWith("licenses/")) {
      const src = path.join(ctx.licensesDir, rel.slice("licenses/".length));
      if (!exists(src)) ctx.problem("unclassified-file", `${rel}: no such text in third-party/licenses`);
      else if (sha256(lfBytes(fs.readFileSync(abs))) !== sha256(lfBytes(fs.readFileSync(src)))) ctx.problem("notices-differ", `${rel} is not third-party/licenses/${rel.slice(9)}`);
      continue;
    }
    if (reviewedRes.has(low)) {
      const e = reviewedRes.get(low);
      const got = sha256(fs.readFileSync(abs));
      if (got !== e.sha256) ctx.problem("binary-changed", `${rel} changed since its licence was reviewed (sha256 ${got}, reviewed ${e.sha256})`);
      continue;
    }
    const stock = path.join(dist, ...rel.split("/"));
    if (exists(stock)) {
      if (sha256(fs.readFileSync(stock)) !== sha256(fs.readFileSync(abs))) ctx.problem("unclassified-file", `${rel} is not Electron's own ${rel}`);
      continue;
    }
    ctx.problem("unclassified-file", `${rel} is in the built app, and is none of Electron's files, the program, Nova's notice files, an npm package's files or a reviewed binary`);
  }
  for (const must of ["LICENSE.electron.txt", "LICENSES.chromium.html"]) if (!exists(path.join(appDir, must))) ctx.problem("electron-files", `the built app has no ${must}`);
  // D10: every package inside the asar has a notice.
  if (!exists(asarPath)) ctx.problem("asar-package", `${asarPath} is missing`);
  else {
    let asar;
    try { asar = require("@electron/asar"); } catch (e) { ctx.problem("asar-package", `@electron/asar is needed to read ${asarPath}: ${e.message}`); asar = null; }
    if (asar) {
      for (const f of asar.listPackage(asarPath, { isPack: false })) {
        const rel = String(f).split(path.sep).join("/").replace(/^\//, "");
        const m = /^((?:.*\/)?node_modules\/(?:@[^/]+\/)?[^/]+)\/package\.json$/.exec(rel);
        if (!m) continue;
        let pj = null;
        try { pj = JSON.parse(asar.extractFile(asarPath, rel.split("/").join(path.sep)).toString("utf8")); } catch (_) { pj = null; }
        if (!pj || !pj.name || !pj.version) continue;
        const id = `${pj.name}@${pj.version}`;
        if (!ids.has(id)) ctx.problem("asar-package", `${id} ships in app.asar (${m[1]}) but has no notice`);
      }
    }
  }
  // D8: every binary the portable launcher embeds is a reviewed one.
  if (ctx.portable) {
    if (!ctx.portableExe) ctx.problem("launcher-binary", "this is a portable build: pass --portable <the portable exe>, so its launcher's plug-ins can be checked");
    else if (!exists(ctx.portableExe)) ctx.problem("launcher-binary", `${ctx.portableExe} is missing`);
    else checkLauncher(ctx);
  }
  // G2: the notices that shipped are the ones derived here, apart from the date line.
  const shippedNotices = path.join(appDir, "THIRD-PARTY-NOTICES.txt");
  if (!exists(shippedNotices)) ctx.problem("notices-differ", "the built app has no THIRD-PARTY-NOTICES.txt");
  else {
    const strip = (s) => lfText(s).split("\n").filter((_, i) => i !== 1).join("\n");
    if (strip(fs.readFileSync(shippedNotices, "utf8")) !== strip(text)) ctx.problem("notices-differ", "THIRD-PARTY-NOTICES.txt in the built app is not the one this tree derives (dates aside): it was generated from another tree");
  }
  if (!exists(path.join(appDir, "LICENSE.txt"))) ctx.problem("notices-differ", "the built app has no LICENSE.txt");
  for (const n of fs.readdirSync(ctx.licensesDir).filter((x) => /\.txt$/i.test(x))) if (!exists(path.join(appDir, "licenses", n))) ctx.problem("notices-differ", `the built app has no licenses/${n}`);
}
function checkLauncher(ctx) {
  // The NSIS stub's data blocks (the licence research's walk, which accounted for every byte of the 1.0.6 exe): the
  // firstheader is found by "NullsoftInst" after 0xDEADBEEF; each block is a length, its top bit set when deflated.
  const buf = fs.readFileSync(ctx.portableExe);
  const sig = Buffer.from("NullsoftInst", "latin1");
  let at = -1;
  for (let i = buf.indexOf(sig); i !== -1; i = buf.indexOf(sig, i + 1)) if (i >= 8 && buf.readUInt32LE(i - 4) === 0xdeadbeef) { at = i - 8; break; }
  if (at < 0) { ctx.problem("launcher-binary", `${ctx.portableExe}: no NSIS header found, so its plug-ins cannot be read`); return; }
  const end = Math.min(buf.length, at + buf.readUInt32LE(at + 24));
  let p = at + 28;
  let pes = 0;
  while (p + 4 <= end) {
    const raw = buf.readUInt32LE(p);
    const size = raw & 0x7fffffff;
    if (!size || p + 4 + size > buf.length) break;
    let data = buf.subarray(p + 4, p + 4 + size);
    if (raw & 0x80000000) { try { data = zlib.inflateRawSync(data); } catch (_) { data = null; } }
    if (data && data.length > 64 && data[0] === 0x4d && data[1] === 0x5a) {
      pes++;
      const h = sha256(data);
      const e = ctx.reviewed.find((b) => b.in === "launcher" && b.sha256 === h);
      if (!e) {
        const pe = peStrings(data);
        ctx.problem("launcher-binary", `the portable launcher embeds a binary nobody reviewed: "${pe.FileDescription || "no description"}" ${pe.FileVersion || ""} (sha256 ${h})`);
      }
    }
    p += 4 + size;
  }
  if (!pes) ctx.problem("launcher-binary", `${ctx.portableExe}: no plug-in could be read out of the launcher (a solid or new NSIS format?), so none was checked`);
}

// ── Assembling the file ───────────────────────────────────────────────────────────────────────────────────────
function renderPackage(d, libs) {
  const L = [];
  L.push(`${d.id}   [${d.licence || "no licence named"}]${d.homepage ? "   " + d.homepage : ""}`);
  if (d.note) L.push(`  NOTE: ${d.note}`);
  for (const t of d.texts) { L.push(`  --- ${t.from} ---`); L.push(t.text); }
  for (const n of d.notices) { L.push(`  --- ${n.from} (a NOTICE file, reproduced as Apache-2.0 section 4(d) asks) ---`); L.push(n.text); }
  if (libs && libs.sharp && libs.sharp.id === d.id && libs.section) {
    L.push("  --- the libraries inside lib/libvips-42.dll: the Licensing section of the package's README.md (electron-builder leaves READMEs out of the app) ---");
    L.push(libs.section);
    L.push("  versions.json: " + Object.entries(libs.versions).map(([k, v]) => `${k} ${v}`).join(", "));
  }
  return L.join("\n");
}

/**
 * Derive THIRD-PARTY-NOTICES.txt for the app root `opts.root` (the repo with its node_modules, or a stage) and write it
 * there (or to `opts.out`) when nothing is refused. opts: { root = this script's repo, nodeModules = <root>/node_modules,
 * electronDir = <nodeModules>/electron, thirdParty = <root>/third-party, out = <root>/THIRD-PARTY-NOTICES.txt,
 * write = true, sourcesOut = null (where to write SOURCES.json: the pinned source location of each LGPL and MPL component),
 * date = today, target = package.json's, askElectron = true, check, appDir, asar, portable } plus, for tests only,
 * gameFolders and workshopFolders in place of Nova's own game-folder finder.
 * Returns { ok, problems: [{rule, message}], warnings, text, sources, packages, outFile }.
 */
function generateThirdPartyNotices(opts) {
  const o = opts || {};
  const root = path.resolve(o.root || REPO);
  const problems = [];
  const warnings = [];
  const ctx = {
    root,
    problem: (rule, message) => { if (!RULES[rule]) throw new Error("unnamed rule " + rule); problems.push({ rule, message }); },
    warn: (m) => warnings.push(m),
  };
  ctx.pkg = readJson(path.join(root, "package.json"));
  ctx.nodeModules = path.resolve(o.nodeModules || path.join(root, "node_modules"));
  ctx.electronDir = electronPackageDir(path.resolve(o.electronDir || path.join(ctx.nodeModules, "electron")));
  const tp = path.resolve(o.thirdParty || path.join(root, "third-party"));
  ctx.licensesDir = path.join(tp, "licenses");
  ctx.noticesDir = path.join(tp, "notices");
  ctx.askElectron = o.askElectron;
  ctx.gameFolders = o.gameFolders;
  ctx.workshopFolders = o.workshopFolders;
  ctx.appDir = o.appDir ? path.resolve(o.appDir) : null;
  ctx.asar = o.asar ? path.resolve(o.asar) : null;
  ctx.portableExe = o.portable ? path.resolve(o.portable) : null;
  const targets = o.target ? [o.target] : (((ctx.pkg.build && ctx.pkg.build.win && ctx.pkg.build.win.target) || []).map((t) => (typeof t === "string" ? t : t.target)));
  ctx.portable = targets.includes("portable");
  const fail = (rule, message) => ({ ok: false, problems: [{ rule, message }], warnings, text: "", sources: null, packages: [], outFile: null });
  if (!isDir(tp)) return fail("pinned-text", `${tp} is missing: the app root needs the tracked third-party/ folder`);
  if (!isDir(ctx.nodeModules)) return fail("package-missing", `${ctx.nodeModules} is missing: install the dependencies, or pass --node-modules <dir>`);
  try { ctx.reviewed = readJson(path.join(tp, "reviewed-binaries.json")).binaries || []; } catch (e) { return fail("binary-unreviewed", `third-party/reviewed-binaries.json cannot be read: ${e.message}`); }
  try { ctx.electronSources = readJson(path.join(tp, "electron-sources.json")); } catch (e) { ctx.electronSources = null; ctx.problem("electron-version", `third-party/electron-sources.json cannot be read: ${e.message}`); }
  try { ctx.vendored = readJson(path.join(ctx.licensesDir, "VENDORED.json")); } catch (e) { ctx.vendored = { texts: [] }; ctx.problem("pinned-text", `third-party/licenses/VENDORED.json cannot be read: ${e.message}`); }
  // Refused, with its own message, by sourceLocations() when sharp ships and this cannot be read.
  try { ctx.libvipsSources = readJson(path.join(tp, "libvips-sources.json")); } catch (_) { ctx.libvipsSources = null; }

  const version = ctx.pkg.version;
  // The release page is the one the app's own update checker sends users to: the app root's copy, else this repo's.
  const checker = [path.join(root, "update-checker.js"), path.join(REPO, "update-checker.js")].find(exists);
  const { RELEASES_URL } = require(checker);
  const releasePage = `${RELEASES_URL}/tag/v${version}`;
  const date = o.date || new Date().toISOString().slice(0, 10);

  // Pins first: every text below is read out of these folders.
  checkPins(ctx, ctx.licensesDir, "third-party/licenses", ctx.vendored);
  checkPins(ctx, ctx.noticesDir, "third-party/notices", null);

  const pkgs = productionPackages(ctx);
  const described = pkgs.map((p) => describePackage(ctx, p));
  const ids = new Set(pkgs.map((p) => p.id));
  const libs = sharpLibraries(ctx, pkgs);
  const ef = electronFacts(ctx);
  ctx.electronFacts = ef;
  const binaries = checkReviewedBinaries(ctx);
  const shipped = shippedFiles(root, ctx.pkg);
  const data = dataLicences(ctx, shipped);
  const lgplLines = lgplCopyrightLines(ctx, libs);
  const links = sourceLocations(ctx, libs, ef, RELEASES_URL);
  const launcherLgpl = ctx.portable ? ctx.reviewed.filter((b) => b.in === "launcher" && b.lgpl) : [];

  // The fields every template may use: derived above, or a reviewed binary's pinned record.
  const fields = { version, date, releasePage, electron: ef.version, chrome: ef.chrome };
  const pinnedFfmpeg = ctx.electronSources && ctx.electronSources.ffmpegRevision;
  const ffmpegLink = links.find((s) => s.component === "FFmpeg");
  fields.ffmpegRevision = pinnedFfmpeg ? `${pinnedFfmpeg} (${ffmpegLink ? ffmpegLink.url : "no source location"})`
    : (ef.chrome && ffmpegLink ? `the revision Chromium ${ef.chrome}'s DEPS file pins (${ffmpegLink.url})` : null);
  if (libs) for (const [k, v] of Object.entries(libs.versions)) fields[k] = v;
  fields.sharp = libs && libs.sharp ? libs.sharp.version : null;
  // The source locations the block gives by field; a refused one leaves its field unfilled, which is refused as well.
  for (const f of ["libvipsSource", "libvipsCppSource"]) { const s = links.find((x) => x.field === f && x.url); fields[f] = s ? s.url : null; }
  {
    const lines = [];
    for (const b of launcherLgpl) {
      const mine = links.filter((s) => s.field === "launcherSources" && s.component === (b.component || b.file));
      if (!mine.length) continue;
      lines.push(`  ${b.component || b.file} ${mine[0].version}:`);
      for (const s of mine) lines.push(`    ${s.url}`);
    }
    fields.launcherSources = lines.length ? lines.join("\n") : (launcherLgpl.length ? null : "");
  }
  fields.electronLicenseSha256 = ef.license ? sha256(ef.license) : null;
  fields.chromiumCreditsSha256 = ef.credits ? sha256(ef.credits) : null;
  for (const b of ctx.reviewed) {
    const k = reviewedKey(b.file);
    for (const f of ["fileVersion", "legalCopyright", "component", "copyright"]) fields[`${k}.${f}`] = b[f];
  }
  for (const s of binaries) fields[`${reviewedKey(s.entry.file)}.where`] = s.where;
  const cr = ["Copyright notices:"];
  cr.push("  FFmpeg (as LICENSES.chromium.html gives them):");
  for (const l of ef.ffmpegLines) cr.push(l.split("\n").map((x) => "    " + x).join("\n"));
  cr.push("  WebKit (as LICENSES.chromium.html gives them):");
  for (const l of ef.webkitLines) cr.push(l.split("\n").map((x) => "    " + x).join("\n"));
  for (const b of launcherLgpl) cr.push(`  ${b.component || b.file}: ${b.legalCopyright || "(no copyright in its version resource)"}`);
  // Never an invented line: libvips and its libraries have no single one, so the block says where theirs are.
  cr.push("  libvips and the libraries inside libvips-42.dll and libvips-cpp.dll:");
  cr.push("    they have no single copyright line. Each library's copyright");
  cr.push("    notices are in its own source code, at the location given under");
  cr.push("    \"Source code\" below. The terms each is used under are in the");
  cr.push(`    table in the ${libs && libs.sharp ? libs.sharp.id : "@img/sharp-win32-x64"} entry under NPM PACKAGES.`);
  if (lgplLines) {
    cr.push("    Copied from their source code:");
    for (const l of lgplLines) cr.push("      " + l.trim());
  }
  fields.copyrightLines = cr.join("\n");

  // The LGPL block names every LGPL or MPL library in sharp's table: a template that misses one is refused.
  const lgplTemplate = exists(path.join(ctx.noticesDir, "lgpl-block.txt")) ? fs.readFileSync(path.join(ctx.noticesDir, "lgpl-block.txt"), "utf8") : "";
  if (libs) for (const r of libs.rows.filter((x) => (x.lgpl || x.mpl) && x.key)) {
    if (!lgplTemplate.includes(`{${r.key}}`)) ctx.problem("lgpl-block", `third-party/notices/lgpl-block.txt does not name ${r.library} (${r.terms}); add it with {${r.key}}`);
  }

  const sections = [];
  sections.push(renderTemplate(ctx, "header.txt", fields));
  const lgpl = renderTemplate(ctx, "lgpl-block.txt", fields);
  sections.push(lgpl);
  // The block itself gives every LGPL and MPL component's pinned source location (sourceLocations() derived them and
  // judged each one), nothing is left to fill in by hand, and no release page of Nova's is offered as a source: the
  // release carries the exe, and only the exe. (It may name this release's page elsewhere, as where the notices go out.)
  const byUrl = new Map();
  for (const s of links) if (s.url) { if (!byUrl.has(s.url)) byUrl.set(s.url, []); byUrl.get(s.url).push(s.component); }
  for (const [url, comps] of byUrl) if (!lgpl.includes(url)) ctx.problem("source-location", `the LGPL block does not give the source location of ${comps.join(", ")} (${url})`);
  for (const m of lgpl.matchAll(/<[A-Z][A-Z0-9 _/-]*>/g)) ctx.problem("source-location", `the LGPL block still has the placeholder ${m[0]}`);
  if (lgpl.includes(RELEASES_URL)) ctx.problem("source-location", `the LGPL block names Nova's release page (${RELEASES_URL}): a release page is never a source location; the block gives the pinned upstream ones`);
  sections.push([renderTemplate(ctx, "electron.txt", fields), renderTemplate(ctx, "dxcompiler.txt", fields), renderTemplate(ctx, "microsoft-dlls.txt", fields)].join("\n\n"));
  const tools = binaries.map((s) => (s.entry.notice ? renderTemplate(ctx, s.entry.notice, fields) : null)).filter(Boolean);
  for (const s of binaries) if (!s.entry.notice) ctx.problem("binary-unreviewed", `${s.entry.file} ships, but its reviewed entry names no notice text`);
  if (tools.length) sections.push("TOOLS THAT SHIP WITH NOVA\n\n" + tools.join("\n\n"));
  if (ctx.portable) sections.push("THE PORTABLE LAUNCHER (the .exe you download unpacks Nova with these)\n\n" + renderTemplate(ctx, "launcher.txt", fields));
  if (data.size) {
    const parts = [];
    for (const [component, files] of data) parts.push(renderTemplate(ctx, `${component}.txt`, { ...fields, dataFiles: files.map(winPath).join(", ") }));
    sections.push("DATA THAT SHIPS WITH NOVA\n\n" + parts.join("\n\n"));
  }
  sections.push("NPM PACKAGES\n\n" + described.map((d) => renderPackage(d, libs)).join("\n\n" + "-".repeat(78) + "\n"));
  sections.push(renderTemplate(ctx, "paradox.txt", fields));
  const text = sections.join(`\n\n${RULE_LINE}\n\n`) + "\n";
  // A release page of Nova's that the notices name anywhere is this version's.
  const escRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const at of text.matchAll(new RegExp(`${escRe(RELEASES_URL)}/tag/v([0-9][^\\s)]*)`, "g"))) {
    if (at[1] !== version) ctx.problem("source-location", `the notices name the release page of v${at[1]}; this build is v${version}`);
  }

  // D12 against the shipped tree, and the built output when there is one.
  gameArt(ctx, shipped);
  if (o.check) {
    if (!ctx.appDir) ctx.problem("unclassified-file", "--check needs --app-dir <win-unpacked>");
    else checkBuiltApp(ctx, ids, text);
  }

  // D11: where the source of each LGPL and MPL component is. Every one is a pinned upstream link, so nothing is left to
  // attach to a release. releasePage is the page this build goes out on (and its notices with it, inside the exe), never
  // a source location.
  const sources = {
    release: version,
    releasePage,
    link: links.map((s) => ({ component: s.component, version: s.version, terms: s.terms, why: s.why, url: s.url })),
  };
  // Written beside the app root's files, where build.extraFiles takes it from (and .gitignore keeps it out of git).
  const outFile = path.resolve(o.out || path.join(root, NOTICES_FILE));
  const ok = problems.length === 0;
  const wrote = ok && o.write !== false && !o.check;
  if (wrote) {
    fs.writeFileSync(outFile, text);
    // SOURCES.json is for the release step (gate G3/G4), so it is written only where that step asks for it: a copy left
    // at the repo root by every build would be one more untracked file in the owner's checkout.
    if (o.sourcesOut) fs.writeFileSync(path.resolve(o.sourcesOut), JSON.stringify(sources, null, 2) + "\n");
  }
  return { ok, problems, warnings, text, sources, packages: described.map((d) => d.id), outFile: wrote ? outFile : null, gameArt: ctx.gameArtCompared || null };
}

module.exports = { generateThirdPartyNotices, RULES, NOTICES_FILE, parseSpdx, licenceAllowed, electronBuilderAppFilters, shippedFiles, checkDataLicences };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const opts = { write: true };
  const flags = { "--root": "root", "--node-modules": "nodeModules", "--electron": "electronDir", "--third-party": "thirdParty", "--out": "out",
    "--sources": "sourcesOut", "--date": "date", "--target": "target", "--app-dir": "appDir", "--asar": "asar", "--portable": "portable" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--check") opts.check = true;
    else if (a === "--no-write") opts.write = false;
    else if (flags[a] && argv[i + 1] !== undefined && !argv[i + 1].startsWith("--")) opts[flags[a]] = argv[++i];
    else { console.error(`unknown or incomplete argument: ${a}\nusage: node scripts/gen-third-party-notices.js [--root <app root>] [--node-modules <dir>] [--electron <node_modules/electron, or its dist>] [--out <file>] [--sources <SOURCES.json>] [--date YYYY-MM-DD] [--target portable|dir] [--no-write] [--check --app-dir <win-unpacked> [--asar <app.asar>] [--portable <exe>]]`); process.exit(2); }
  }
  let r;
  try { r = generateThirdPartyNotices(opts); } catch (e) { console.error("ERROR " + (e && e.stack || e)); process.exit(2); }
  for (const w of r.warnings) console.log("WARN " + w);
  for (const p of r.problems) console.log(`FAIL [${p.rule}] ${p.message}`);
  if (r.ok) console.log(opts.check ? `OK: the built app carries the notices this tree derives (${r.packages.length} packages)` : `OK: ${r.packages.length} packages -> ${r.outFile || "(not written)"}`);
  else console.log(`REFUSED: ${r.problems.length} problem(s); nothing was written`);
  process.exit(r.ok ? 0 : 1);
}
