// #mod-index-fingerprint-blind-dirs — MOD HEALTH REPLAYED THE PREVIOUS LAUNCH'S VERDICT.
//
// The mod index is cached to disk against a fingerprint built by statting the directories buildModIndex
// reads. server.js states the rule in a comment right above the list: "this list must cover EVERY directory
// buildModIndex reads". `interface` was not in it.
//
// mod-index.js opens <modRoot>/interface/*.gui for the "Found no grid box for tech" rule: a technology whose
// chain resolves to a gridbox NOVA ITSELF placed is not the failure that rule is about, and the marker in
// the .gui is how it tells. Placing gridboxes rewrites interface/countrytechtreeview.gui — so the very act
// that RESOLVES the problem left the fingerprint unmoved. The modder fixed the tree, relaunched, and Mod
// Health still listed those technologies as undrawable, until some unrelated file happened to change.
//
// ⭐ THE CHECK IS DERIVED. Asserting "interface is in the list" would pin this one instance and miss the
// next. Instead it reads every root-relative directory mod-index.js actually opens and requires the
// fingerprint to cover each one — so a rule that starts reading a new directory tomorrow fails this the day
// it is added, which is exactly how `interface` came to be missing.
"use strict";
const fs = require("fs");
const path = require("path");
const { stripJsComments } = require("./testlib-strip-comments.js");

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

const SV = stripJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));
const MI = stripJsComments(fs.readFileSync(path.join(__dirname, "mod-index.js"), "utf8"));

// ── what the fingerprint covers ─────────────────────────────────────────────────────────────────────────
function listFrom(name) {
  const at = SV.indexOf(`const ${name} = [`);
  if (at === -1) return null;
  // ⚠️ START INSIDE THE OUTER BRACKET. Slicing from `const NAME = [` made the first inner match capture
  // that opening bracket too, so the first entry parsed as `["gfx/flags` and every coverage check against
  // it failed for a reason that had nothing to do with the code under test.
  const open = SV.indexOf("[", at);
  const end = SV.indexOf("];", at);
  const body = SV.slice(open + 1, end);
  return [...body.matchAll(/\[([^\]]*)\]/g)]
    .map((m) => m[1].split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean))
    .filter((a) => a.length)
    .map((a) => a.join("/").toLowerCase());
}
const scanDirs = listFrom("MOD_INDEX_SCAN_DIRS");
const nameOnly = listFrom("MOD_INDEX_NAME_ONLY_DIRS");

console.log("\n[the lists] both must be readable, or this test measures nothing");
{
  rec("MOD_INDEX_SCAN_DIRS is parseable", Array.isArray(scanDirs) && scanDirs.length > 5, scanDirs);
  rec("MOD_INDEX_NAME_ONLY_DIRS is parseable", Array.isArray(nameOnly) && nameOnly.length >= 1, nameOnly);
  console.log(`     fingerprinted: ${(scanDirs || []).join(", ")}`);
  console.log(`     name-only:     ${(nameOnly || []).join(", ")}`);
}

// ── what mod-index actually reads ───────────────────────────────────────────────────────────────────────
console.log("\n[⭐ DERIVED] every directory mod-index.js opens must be fingerprinted");
{
  const reads = new Set();
  for (const m of MI.matchAll(/path\.join\(\s*[A-Za-z.]+\s*,\s*("(?:common|events|history|localisation|localization|gfx|interface)"(?:\s*,\s*"[a-z_]+")*)/g)) {
    const segs = m[1].split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
    reads.add(segs.join("/").toLowerCase());
  }
  const readList = [...reads].sort();
  console.log(`     mod-index.js opens: ${readList.join(", ")}`);
  // ⚠️ If this sweep finds nothing, every check below passes for the wrong reason.
  rec("the sweep found the directories it reads", readList.length >= 8, readList);

  // ⭐ COVERAGE RUNS ONE WAY: the list must hold the directory or an ANCESTOR of it.
  //
  // This used to accept `d.startsWith(dir + "/")` as well — a DESCENDANT proving coverage of its parent.
  // So `common`, which mod-index.js walks wholesale in scanUnbalancedModFiles and getModGrantedIdeaSet,
  // counted as covered because the list happened to contain `common/technologies`. Watching one
  // subdirectory tells you nothing about the tree around it.
  //
  // That one clause is why the gap shipped past two tests written to catch exactly it: the sweep above
  // had already derived `common` and `history` correctly, and this line forgave them. Measured with the
  // clause removed, against the list as it then stood: `common, history` — precisely the trees whose
  // contents could change without moving the fingerprint, leaving Home's verdict frozen from a previous
  // launch. #mod-index-fingerprint-blind-dirs
  const covered = (dir) => (scanDirs || []).concat(nameOnly || [])
    .some((d) => dir === d || dir.startsWith(d + "/"));
  // CONTROL: the rule must be DIRECTIONAL, or it is the old rule wearing a comment. Drive it against
  // hand-made lists so the check does not depend on what the real list happens to contain today.
  const coversWith = (list, dir) => list.some((d) => dir === d || dir.startsWith(d + "/"));
  rec("a parent covers its child", coversWith(["common"], "common/technologies"), "ancestor rule lost");
  rec("an exact entry covers itself", coversWith(["gfx/flags"], "gfx/flags"), "exact match lost");
  rec("…but a child does NOT cover its parent", !coversWith(["common/technologies"], "common"), "direction lost");
  rec("…and an unrelated sibling covers nothing", !coversWith(["commonwealth"], "common"), "prefix without a separator matched");
  const missing = readList.filter((d) => !covered(d));
  console.log(`     not covered by the fingerprint: ${missing.join(", ") || "none"}`);
  // THE BUG: `interface` was read and not fingerprinted.
  rec("every directory it reads is covered by the fingerprint", missing.length === 0, missing);
}

console.log("\n[the specific case] interface/ is read for the grid-box rule");
{
  rec("mod-index.js opens the mod's interface dir", /path\.join\([A-Za-z.]+, "interface"\)/.test(MI), "no longer read");
  rec("…and only for .gui files", /\\\.gui\$/i.test(MI) || /\.gui\$/i.test(MI), "the .gui filter is gone");
  rec("interface is fingerprinted", (scanDirs || []).includes("interface"), scanDirs);
}

console.log("\n[CONTROL] the expensive directory is still name-only, not statted");
{
  // gfx/flags is 13,108 files in Millennium Dawn and statting them cost 441ms of a 622ms cold start. The
  // fix must not have quietly moved it into the full-stat list.
  rec("gfx/flags is still name-only", (nameOnly || []).includes("gfx/flags"), nameOnly);
  rec("…and not in the stat list", !(scanDirs || []).includes("gfx/flags"), scanDirs);
  // …while interface/ IS cheap enough to stat: 622 files in vanilla, 389 in MD.
  const count = (root) => {
    let n = 0;
    const walk = (d) => {
      let e = []; try { e = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
      for (const x of e) { if (x.isDirectory()) walk(path.join(d, x.name)); else n++; }
    };
    walk(root);
    return n;
  };
  const vanillaIface = count("D:/SteamLibrary/steamapps/common/Hearts of Iron IV/interface");
  console.log(`     vanilla interface/ holds ${vanillaIface} files`);
  if (vanillaIface > 0) {
    rec("…and interface/ is small enough that statting it is reasonable", vanillaIface < 5000, vanillaIface);
  } else {
    rec("the corpus check is skipped only because the game is not installed", true, "skipped");
  }
}

console.log("\n[the rule is written down] so the next reader knows the constraint");
{
  const raw = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  rec("the list still carries its own rule in a comment",
    /must cover EVERY directory buildModIndex reads/.test(raw), "the stated rule was removed");
}

console.log(`\n=== mod index fingerprint covers reads: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
