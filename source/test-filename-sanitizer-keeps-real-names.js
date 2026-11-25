// #filename-sanitizer-stricter-than-the-filesystem — a save aimed at "Cote d'Ivoire.txt" would have landed
// in "Cote dIvoire.txt".
//
// sanitizeModFileName kept only [A-Za-z0-9 _.-]. Windows forbids \ / : * ? " < > | and control characters,
// and nothing else — so the allow-list threw away characters real HOI4 mods use constantly. A save that
// rewrites the filename the user picked writes to a DIFFERENT file, silently, while the original keeps its
// own copy of the content.
//
// ⭐ THE CASES ARE HARVESTED, NOT TYPED. The test walks the installed corpus and takes real filenames that
// the old rule would have rewritten. Typing in examples would have missed the one that matters most —
// Millennium Dawn's "!Generic Defense Companies.txt", where the ! is a deliberate load-order prefix.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-fname-"));
process.env.HOI4_MODS_ROOT = ROOT;
process.env.APPDATA = path.join(ROOT, "appdata");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
const { sanitizeModFileName } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

try {
  rec("the sanitizer is exported", typeof sanitizeModFileName === "function", typeof sanitizeModFileName);

  console.log("\n[⭐ harvested] real script filenames the old allow-list would have rewritten");
  {
    const OLD_RULE = (n) => path.basename(n).replace(/[^A-Za-z0-9 _.-]/g, "").replace(/\s+/g, " ").trim().replace(/[ .]+$/, "");
    const roots = ["D:/SteamLibrary/steamapps/common/Hearts of Iron IV"];
    try {
      const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
      for (const d of fs.readdirSync(WS)) {
        const p = path.join(WS, d);
        if (fs.existsSync(path.join(p, "descriptor.mod"))) roots.push(p);
      }
    } catch (_) {}
    const DIRS = [["common", "ideas"], ["common", "decisions"], ["common", "national_focus"],
      ["common", "characters"], ["common", "technologies"], ["events"], ["history", "countries"]];
    const victims = [];
    let scanned = 0;
    for (const r of roots) {
      for (const parts of DIRS) {
        const walk = (d) => {
          let e = [];
          try { e = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
          for (const x of e) {
            const f = path.join(d, x.name);
            if (x.isDirectory()) { walk(f); continue; }
            if (!/\.txt$/i.test(x.name)) continue;
            scanned++;
            if (OLD_RULE(x.name) !== x.name) victims.push(x.name);
          }
        };
        walk(path.join(r, ...parts));
      }
    }
    console.log(`     ${scanned} script filenames scanned, ${victims.length} the old rule would rewrite`);
    for (const v of victims.slice(0, 5)) console.log(`        ${v}   ->   ${OLD_RULE(v)}`);
    // ⚠️ If the corpus is absent there is nothing to measure and every check below is vacuous.
    if (scanned < 1000) {
      console.log("     SKIPPED — no installed corpus to harvest from");
      rec("the corpus probe is skipped only because the mods are absent", true, "skipped");
    } else {
      rec("the corpus really contains names the old rule mangled", victims.length > 50, victims.length);
      const stillMangled = victims.filter((v) => sanitizeModFileName(v, "custom.txt") !== v);
      console.log(`     still rewritten by the current rule: ${stillMangled.length}`);
      for (const v of stillMangled.slice(0, 5)) console.log(`        ${v}   ->   ${sanitizeModFileName(v, "custom.txt")}`);
      rec("…and the sanitizer now leaves every one of them alone", stillMangled.length === 0, stillMangled.slice(0, 8));
    }
  }

  console.log("\n[CONTROL] what the filesystem really forbids must still go");
  {
    // Each of these is rejected by Windows itself, so keeping them would produce a name that cannot be created.
    const cases = [
      ["a<b.txt", "<"], ["a>b.txt", ">"], ["a:b.txt", ":"], ['a"b.txt', '"'],
      ["a|b.txt", "|"], ["a?b.txt", "?"], ["a*b.txt", "*"],
    ];
    let allStripped = true;
    const kept = [];
    for (const [name, ch] of cases) {
      const out = sanitizeModFileName(name, "custom.txt");
      if (out.includes(ch)) { allStripped = false; kept.push([name, out]); }
    }
    rec("the characters Windows rejects are still removed", allStripped, kept);

    // …and the guards that already existed must survive.
    rec("a path separator cannot escape the directory",
      !sanitizeModFileName("../../evil.txt", "custom.txt").includes(".."), sanitizeModFileName("../../evil.txt", "custom.txt"));
    rec("a bare traversal falls back", sanitizeModFileName("...", "custom.txt") === "custom.txt", sanitizeModFileName("...", "custom.txt"));
    // #windows-hostile-filename — Windows drops trailing dots and spaces when it creates the file.
    rec("a trailing dot is still dropped", sanitizeModFileName("my_ideas.txt.", "custom.txt") === "my_ideas.txt",
      sanitizeModFileName("my_ideas.txt.", "custom.txt"));
    rec("a trailing space is still dropped", sanitizeModFileName("my_ideas.txt ", "custom.txt") === "my_ideas.txt",
      sanitizeModFileName("my_ideas.txt ", "custom.txt"));
    rec("a reserved device name is still defused", /^nova_/.test(sanitizeModFileName("CON.txt", "custom.txt")),
      sanitizeModFileName("CON.txt", "custom.txt"));
    rec("a missing extension is still supplied", sanitizeModFileName("my_ideas", "custom.txt") === "my_ideas.txt",
      sanitizeModFileName("my_ideas", "custom.txt"));
    rec("a control character is still removed", !/[\x00-\x1f]/.test(sanitizeModFileName("a\u0007b.txt", "custom.txt")),
      JSON.stringify(sanitizeModFileName("a\u0007b.txt", "custom.txt")));
  }

  console.log("\n[the specific ones] the names that motivated this");
  {
    for (const n of ["!Generic Defense Companies.txt", "Cote d'Ivoire.txt", "XIC - Xi'An.txt",
      "April Fools (ODY).txt", "JER - Jersey & Guernsey.txt"]) {
      rec(`${n} survives intact`, sanitizeModFileName(n, "custom.txt") === n, sanitizeModFileName(n, "custom.txt"));
    }
  }

  console.log(`\n=== filename sanitizer keeps real names: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
  process.exitCode = 1;
} finally {
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
}
