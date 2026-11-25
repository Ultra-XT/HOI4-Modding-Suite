// ⛔ #the-licence-and-the-notices-ship — NOVA'S LICENCE AND EVERYONE ELSE'S GO OUT WITH EVERY BUILD.
//
// 1.0.4 to 1.0.6 shipped without Nova's own licence (it was never in build.files) and without the notices the LGPL
// libraries inside Nova ask for (libvips in sharp, FFmpeg and WebKit in Electron): a prominent notice, copies of the GPL
// and the LGPL, and an offer of their source. From 1.0.7 on, Nova is open source under the MIT licence, and:
//   - LICENSE travels with the app, as LICENSE.txt next to the exe (build.extraFiles);
//   - THIRD-PARTY-NOTICES.txt is written before every build by scripts/gen-third-party-notices.js, derived from what
//     ships and never typed, and copied next to the exe;
//   - the licence texts it points at are vendored verbatim in third-party/licenses and pinned by sha256;
//   - every shipped data file's licence line points at a notice that ships (data/hoi4-spec.json's pointed into the
//     gitignored reference/ folder through 1.0.6).
//
// electron-builder only WARNS about a missing extraFiles source, so nothing at build time would notice any of this
// going missing. "A rule policed only by an e2e test still decays" — and a rule policed only by the release gate is
// checked once, after the tree is tagged. This is the unit version.
//
// Derived, never typed: the pins from SHA256SUMS, the tracked files from git,
// the build scripts from package.json, the file the generator writes from the generator, and what build.files matches
// (the data files among it) from electron-builder's own matcher.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 600));
  }
}

const ROOT = __dirname;
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const build = pkg.build || {};
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
// The pins are taken over the LF form (git stores text so; a checkout may be CRLF).
const lfBytes = (buf) => Buffer.from(buf.toString("latin1").replace(/\r\n/g, "\n"), "latin1");
const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, maxBuffer: 256 * 1024 * 1024 }).toString("utf8").split("\0").filter(Boolean);
const GEN = require(path.join(ROOT, "scripts", "gen-third-party-notices.js"));

console.log("\n[the licence is the MIT licence, and package.json and the README say so]");
// From 1.0.7 Nova is open source under MIT (the owner, 2026-11-25: "u can make it open source and use whatever licence for
// anything who wanna edit it"). Licence version 1, the Nova Modding Suite Licence Agreement (5ae9890c), never shipped.
const MIT_GRANT = "Permission is hereby granted, free of charge, to any person obtaining a copy";
const isMit = (text) => (String(text).split(/\r?\n/)[0] || "").trim() === "MIT License" && String(text).includes(MIT_GRANT) &&
  /^Copyright \(c\) \d{4}(?:-\d{4})? Ultra-XT\s*$/m.test(String(text));
{
  rec("LICENSE is tracked", tracked.includes("LICENSE"));
  const text = fs.readFileSync(path.join(ROOT, "LICENSE"), "utf8");
  rec("LICENSE is the MIT licence, with Ultra-XT's copyright line", isMit(text), text.split(/\r?\n/).slice(0, 3).join(" | "));
  rec("CONTROL: the licence it replaced is not taken for MIT",
    !isMit("Nova Modding Suite - Licence Agreement\nLicence version 1, 13 November 2026\n\nCopyright (c) 2026 Ultra-XT. All rights reserved.\n"));
  rec('package.json says "MIT"', pkg.license === "MIT", pkg.license);
  // The README's licence section is what the public repo shows; a changed licence with a stale README tells people the
  // wrong terms.
  const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
  const sec = /^## Licence\s*$([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(readme);
  rec("README's licence section names MIT, and no other licence of Nova's", !!sec && /\bMIT\b/.test(sec[1]) && !/Licence Agreement|licence version \d/i.test(sec[1]),
    sec ? sec[1].slice(0, 200) : "no ## Licence section");
}

console.log("\n[every vendored licence text and every hand-written notice matches its pin]");
function pinProblems(dir) {
  const out = [];
  const sumsFile = path.join(dir, "SHA256SUMS");
  if (!fs.existsSync(sumsFile)) return ["no SHA256SUMS in " + dir];
  const pins = new Map();
  for (const raw of fs.readFileSync(sumsFile, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^([0-9a-f]{64}) [ *]?(.+)$/.exec(line);
    if (!m) { out.push(`not a "<sha256>  <file>" line: ${line}`); continue; }
    pins.set(m[2].trim(), m[1]);
  }
  const texts = fs.readdirSync(dir).filter((n) => /\.txt$/i.test(n)).sort();
  for (const n of texts) if (!pins.has(n)) out.push(`${n} has no pin`);
  for (const [n, pin] of pins) {
    const p = path.join(dir, n);
    if (!fs.existsSync(p)) { out.push(`${n} is pinned but missing`); continue; }
    const got = sha256(lfBytes(fs.readFileSync(p)));
    if (got !== pin) out.push(`${n}: sha256 ${got}, pinned ${pin}`);
  }
  return out;
}
{
  for (const sub of ["licenses", "notices"]) {
    const dir = path.join(ROOT, "third-party", sub);
    const texts = fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => /\.txt$/i.test(n)) : [];
    rec(`third-party/${sub} holds texts (${texts.length})`, texts.length > 0);
    rec(`…every one of them is tracked`, texts.every((n) => tracked.includes(`third-party/${sub}/${n}`)), texts.filter((n) => !tracked.includes(`third-party/${sub}/${n}`)));
    const bad = pinProblems(dir);
    rec(`⭐ …and the sha256 of every text in third-party/${sub} matches SHA256SUMS`, bad.length === 0, bad);
  }
  const lic = path.join(ROOT, "third-party", "licenses");
  for (const must of ["GPL-3.0.txt", "LGPL-3.0.txt", "LGPL-2.1.txt", "MPL-2.0.txt", "Apache-2.0.txt"]) {
    // The five the LGPL block and the Apache-licensed packages send readers to (THIRD-PARTY-NOTICES.md s.2).
    rec(`licenses/${must} is vendored`, fs.existsSync(path.join(lic, must)));
  }
  const vendored = JSON.parse(fs.readFileSync(path.join(lic, "VENDORED.json"), "utf8"));
  const byFile = new Map((vendored.texts || []).map((t) => [t.file, t]));
  const texts = fs.readdirSync(lic).filter((n) => /\.txt$/i.test(n));
  rec("VENDORED.json says where every licence text came from", texts.every((n) => byFile.has(n) && String(byFile.get(n).copiedFrom || "").trim() && String(byFile.get(n).upstream || "").trim()),
    texts.filter((n) => !byFile.has(n) || !String(byFile.get(n).copiedFrom || "").trim()));
  rec("…and its sha256 for each is the pinned one", texts.every((n) => byFile.has(n) && byFile.get(n).sha256 === sha256(lfBytes(fs.readFileSync(path.join(lic, n))))));
  // CONTROL: the pin check bites. Copy the folder, change one byte of one text, and it must be found.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nova-licence-ship-"));
  try {
    for (const n of fs.readdirSync(lic)) fs.copyFileSync(path.join(lic, n), path.join(tmp, n));
    const victim = path.join(tmp, "GPL-3.0.txt");
    const b = fs.readFileSync(victim);
    b[100] = b[100] === 0x61 ? 0x62 : 0x61;
    fs.writeFileSync(victim, b);
    rec("CONTROL: one byte changed in a vendored text is caught", pinProblems(tmp).some((x) => x.startsWith("GPL-3.0.txt:")), pinProblems(tmp));
    fs.writeFileSync(path.join(tmp, "Extra.txt"), "an unpinned text\n");
    rec("CONTROL: a text with no pin is caught", pinProblems(tmp).includes("Extra.txt has no pin"), pinProblems(tmp));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

console.log("\n[package.json ships the licence and the notices]");
{
  const files = build.files || [];
  rec("⭐ build.files names LICENSE", files.includes("LICENSE"), files);
  const extra = (build.extraFiles || []).map((e) => (typeof e === "string" ? { from: e, to: e } : e));
  const has = (from, to) => extra.find((e) => e.from === from && (e.to || e.from) === to);
  rec("⭐ build.extraFiles copies LICENSE to the app root as LICENSE.txt", !!has("LICENSE", "LICENSE.txt"), extra);
  rec(`⭐ …${GEN.NOTICES_FILE} to the app root`, !!has(GEN.NOTICES_FILE, GEN.NOTICES_FILE), extra);
  const texts = has("third-party/licenses", "licenses");
  rec("⭐ …and third-party/licenses to licenses/, its .txt files only", !!texts && Array.isArray(texts.filter) && texts.filter.includes("*.txt"), texts);
  // Every source is a tracked path, or the one file the generator writes (and that one is never committed).
  const sources = extra.map((e) => e.from);
  const untracked = sources.filter((s) => s !== GEN.NOTICES_FILE && !tracked.some((t) => t === s || t.startsWith(s.replace(/\/+$/, "") + "/")));
  rec("every extraFiles source is a tracked path or the file the notices generator writes", untracked.length === 0, untracked);
  let ignored = false;
  try { execFileSync("git", ["check-ignore", "-q", GEN.NOTICES_FILE], { cwd: ROOT }); ignored = true; } catch (_) { ignored = false; }
  rec(`…and ${GEN.NOTICES_FILE} is gitignored, so a generated copy is never committed`, ignored);
  rec(`…and none is tracked`, !tracked.includes(GEN.NOTICES_FILE));
}

console.log("\n[⭐ nothing under third-party/ or scripts/ is matched by build.files]");
{
  // Asked of electron-builder's own matcher (through the generator), build.files alone: its patterns plus the defaults
  // electron-builder adds, without the extraFiles exclusions, so a pattern that would pull build-time files into
  // app.asar is caught even where an extraFiles exclusion happens to cover it today.
  const matched = (p, rels) => {
    const filters = GEN.electronBuilderAppFilters(ROOT, p, { extraExcludes: false });
    return rels.filter((rel) => {
      const abs = path.join(ROOT, ...rel.split("/"));
      return filters.some(({ from, filter }) => !path.relative(from, abs).startsWith("..") && filter(abs, { isDirectory: () => false }));
    });
  };
  const buildTime = tracked.filter((t) => t.startsWith("third-party/") || t.startsWith("scripts/"));
  rec(`there are build-time files to check (${buildTime.length})`, buildTime.some((t) => t.startsWith("third-party/")) && buildTime.some((t) => t.startsWith("scripts/")));
  const hits = matched(pkg, buildTime);
  rec("⭐ build.files matches none of them", hits.length === 0, hits.slice(0, 20));
  rec("CONTROL: the same matcher does match what ships (the main module and a page)", matched(pkg, [pkg.main || "main.js", "public/index.html"]).length === 2);
  for (const extraPattern of ["third-party/**/*", "scripts/**/*", "**/*.txt"]) {
    const widened = JSON.parse(JSON.stringify(pkg));
    widened.build.files = (widened.build.files || []).concat([extraPattern]);
    rec(`CONTROL: a build.files with "${extraPattern}" added is caught`, matched(widened, buildTime).length > 0);
  }
  // A measured fact, not a check: electron-builder 26.8.1 keeps every extraFiles source out of app.asar, so the LICENSE
  // build.files names does not reach the asar; LICENSE.txt next to the exe is the copy that ships.
  const packed = GEN.shippedFiles(ROOT, pkg);
  console.log(`  NOTE app.asar ${packed.includes("LICENSE") ? "WILL" : "will NOT"} contain LICENSE (electron-builder keeps extraFiles sources out of it); ${packed.length} files would be packed`);
}

console.log("\n[⭐ every build writes the notices first]");
{
  // Derived from package.json: every script that runs electron-builder has a pre-hook, and that hook runs the notices
  // generator for the target electron-builder is about to build. A notices file written for the portable build ships
  // the launcher's notices; a Steam (dir) build has no launcher.
  const scripts = pkg.scripts || {};
  const targetOf = (cmd) => { const m = /(?:^|\s)--win(?:=|\s+)([a-z0-9-]+)/i.exec(cmd); return m ? m[1] : null; };
  const problems = (sc) => {
    const out = [];
    const builds = Object.keys(sc).filter((k) => !k.startsWith("pre") && !k.startsWith("post") && /^\s*electron-builder\b/.test(sc[k]));
    if (!builds.length) out.push("no script runs electron-builder");
    for (const k of builds) {
      const hook = sc["pre" + k];
      const target = targetOf(sc[k]);
      if (!hook) { out.push(`"${k}" has no "pre${k}"`); continue; }
      const gen = /node\s+scripts\/gen-third-party-notices\.js(?:\s+--target\s+([a-z0-9-]+))?/.exec(hook);
      if (!gen) { out.push(`"pre${k}" does not run scripts/gen-third-party-notices.js`); continue; }
      if (target && gen[1] !== target) out.push(`"pre${k}" writes the notices for --target ${gen[1] || "(none)"}, but "${k}" builds ${target}`);
      // Joined with && only: "||", ";" or a lone "&" would run electron-builder after the generator refused.
      if (/\|\||;|(?<!&)&(?!&)/.test(hook)) out.push(`"pre${k}" can carry on past a refusal: ${hook}`);
    }
    return out;
  };
  const builds = Object.keys(scripts).filter((k) => !k.startsWith("pre") && /^\s*electron-builder\b/.test(scripts[k]));
  rec(`the build scripts are found (${builds.join(", ")})`, builds.length >= 2, builds);
  const bad = problems(scripts);
  rec("⭐ every one runs the notices generator first, for its own target, and stops on a refusal", bad.length === 0, bad);
  rec("…beside the icon generator, which still runs", builds.every((k) => /generate-app-icon\.cjs/.test(scripts["pre" + k] || "")), builds.map((k) => scripts["pre" + k]));
  const without = { ...scripts, prebuild: "node scripts/generate-app-icon.cjs" };
  rec("CONTROL: a pre-hook without the generator is caught", problems(without).some((x) => x.startsWith('"prebuild" does not run')), problems(without));
  const wrongTarget = { ...scripts, "prebuild:steam": "node scripts/generate-app-icon.cjs && node scripts/gen-third-party-notices.js --target portable" };
  rec("CONTROL: a pre-hook writing the notices for the wrong target is caught", problems(wrongTarget).some((x) => x.includes("but \"build:steam\" builds dir")), problems(wrongTarget));
  const goesOn = { ...scripts, prebuild: "node scripts/gen-third-party-notices.js --target portable || echo skipped" };
  rec("CONTROL: a pre-hook that carries on past a refusal is caught", problems(goesOn).some((x) => x.includes("carry on past a refusal")), problems(goesOn));
  rec("the generator exports what the build and this test use", typeof GEN.generateThirdPartyNotices === "function" && GEN.NOTICES_FILE === "THIRD-PARTY-NOTICES.txt");
}

console.log("\n[⭐ every shipped data file's licence line points at a notice that ships]");
{
  // data/hoi4-spec.json said "see reference/cwtools-hoi4-config/LICENSE" through 1.0.6: reference/ is gitignored and
  // never packed, so it named a file no user has. Asked of the generator's own data-licence rule, over what build.files
  // packs, so the prebuild hook is not the first thing to notice.
  rec("the generator exports its data-licence rule", typeof GEN.checkDataLicences === "function");
  if (typeof GEN.checkDataLicences === "function") {
    const readMeta = (abs) => {
      try { const s = fs.readFileSync(abs, "utf8"); const j = JSON.parse(s.charCodeAt(0) === 0xfeff ? s.slice(1) : s); return j && typeof j === "object" && !Array.isArray(j) ? j._meta || null : null; } catch (_) { return null; }
    };
    const dl = GEN.checkDataLicences(ROOT);
    const licensed = [].concat(...dl.licensed.values());
    const naming = dl.shipped.filter((rel) => /^data\/.+\.json$/i.test(rel)).filter((rel) => { const m = readMeta(path.join(ROOT, rel)); return !!(m && m.license); });
    rec(`the shipped data files that name a licence are found (${naming.join(", ")})`, naming.length > 0, dl.shipped.filter((rel) => rel.startsWith("data/")).slice(0, 20));
    rec("⭐ every one passes the generator's data-licence rule", dl.problems.length === 0 && naming.every((rel) => licensed.includes(rel)), dl.problems.map((p) => p.message));
    // CONTROL: a fixture root with the real third-party/ texts. The real files' licence lines pass there, and the line
    // 1.0.6 shipped is refused, so the rule above is not passing by measuring nothing.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nova-licence-ship-"));
    try {
      for (const sub of ["licenses", "notices"]) {
        fs.mkdirSync(path.join(tmp, "third-party", sub), { recursive: true });
        for (const n of fs.readdirSync(path.join(ROOT, "third-party", sub))) fs.copyFileSync(path.join(ROOT, "third-party", sub, n), path.join(tmp, "third-party", sub, n));
      }
      fs.mkdirSync(path.join(tmp, "data"));
      const put = (name, meta) => { fs.writeFileSync(path.join(tmp, "data", name), JSON.stringify({ _meta: meta }) + "\n"); return "data/" + name; };
      const today = naming.map((rel, i) => put(`today-${i}.json`, readMeta(path.join(ROOT, rel))));
      const ok = GEN.checkDataLicences(tmp, { shipped: today });
      rec("CONTROL: in that fixture, the real files' licence lines pass", today.length > 0 && ok.problems.length === 0 && today.every((rel) => [].concat(...ok.licensed.values()).includes(rel)), ok.problems);
      const old = put("as-1.0.6-shipped.json", { source: "https://github.com/cwtools/cwtools-hoi4-config", license: "MIT (c) 2018 tboby — see reference/cwtools-hoi4-config/LICENSE" });
      const bad = GEN.checkDataLicences(tmp, { shipped: [old] });
      rec("CONTROL: the line 1.0.6 shipped is refused, naming the file that does not ship", bad.problems.some((p) => p.rule === "data-licence" && p.message.includes("reference/cwtools-hoi4-config/LICENSE")), bad.problems);
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
}

console.log(`\n=== the licence and the notices ship: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
