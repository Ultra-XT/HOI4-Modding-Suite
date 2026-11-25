// mod ↔ game version compatibility checks.
const mv = require("./mod-version.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };

// parseGameBranch
check("parseGameBranch from rawVersion", JSON.stringify(mv.parseGameBranch("1.18.3.0", "")) === JSON.stringify({ major: 1, minor: 18 }));
check("parseGameBranch from display string", JSON.stringify(mv.parseGameBranch("", "Case Green v1.18.3.0.7709 (d7cc)")) === JSON.stringify({ major: 1, minor: 18 }));
check("parseGameBranch null on junk", mv.parseGameBranch("", "") === null);

// parseSupportedBranch
check("supported '*' is any", mv.parseSupportedBranch("*").any === true);
check("supported '1.17.*' → major 1 minor 17 (the * is the patch wildcard)", JSON.stringify(mv.parseSupportedBranch("1.17.*")) === JSON.stringify({ major: 1, minor: 17 }));
check("supported '1.*' → major 1 minor null (minor wildcard)", JSON.stringify(mv.parseSupportedBranch("1.*")) === JSON.stringify({ major: 1, minor: null }));
check("supported '1.18.3.*' → major 1 minor 18", JSON.stringify(mv.parseSupportedBranch("1.18.3.*")) === JSON.stringify({ major: 1, minor: 18 }));
check("supported '' → null", mv.parseSupportedBranch("") === null);

// checkModGameVersion — the real-world MD case
const md = mv.checkModGameVersion("1.17.*", "1.18.3.0", "Case Green v1.18.3.0.7709");
check("MD 1.17.* on game 1.18.3 → MISMATCH warning", !md.match && md.severity === "warning", JSON.stringify(md));
check("mismatch message names both branches", /1\.17/.test(md.message) && /1\.18/.test(md.message), md.message);

const okSame = mv.checkModGameVersion("1.18.*", "1.18.3.0", "");
check("mod 1.18.* on game 1.18.3 → match", okSame.match && okSame.severity === "none", JSON.stringify(okSame));

const okAny = mv.checkModGameVersion("*", "1.18.3.0", "");
check("mod '*' matches any game", okAny.match && okAny.severity === "none", JSON.stringify(okAny));

const okSpecific = mv.checkModGameVersion("1.18.3", "1.18.3.0", "");
check("mod '1.18.3' on game 1.18.3 → match (major.minor)", okSpecific.match, JSON.stringify(okSpecific));

const patchDiff = mv.checkModGameVersion("1.18.1", "1.18.3.0", "");
check("mod '1.18.1' on game 1.18.3 → still match (same branch, patch differs)", patchDiff.match, JSON.stringify(patchDiff));

const noGame = mv.checkModGameVersion("1.17.*", "", "");
check("unknown game version → no false alarm", noGame.match && noGame.severity === "none", JSON.stringify(noGame));

const noDecl = mv.checkModGameVersion("", "1.18.3.0", "");
check("mod with no supported_version → no alarm", noDecl.match && noDecl.severity === "none", JSON.stringify(noDecl));

const olderGame = mv.checkModGameVersion("1.18.*", "1.17.3.0", "");
check("mod 1.18.* on older game 1.17 → MISMATCH (either direction)", !olderGame.match && olderGame.severity === "warning", JSON.stringify(olderGame));

console.log(`\nMOD-VERSION TEST: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
