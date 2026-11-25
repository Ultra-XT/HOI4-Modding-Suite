// Mod ↔ game version compatibility. A HOI4 mod declares `supported_version` in its descriptor (e.g.
// "1.17.*"). When the game moves to another major/minor branch (e.g. 1.18.x), a mod built for the old
// one may still run fine — many do — or misbehave in a way that is hard to pin on the version from the
// logs. This module flags the mismatch up front as a heads-up (severity "warning"), never as a crash:
// Mod Health's "Will it crash?" card files it with the warnings, and the banners show `message` as it is
// (#a-game-version-mismatch-is-a-warning-not-a-crash, owner 2026-11-20: amber, not red).
//
// Pure functions only (no fs) so they're trivially unit-testable; the server passes in the strings it
// reads from launcher-settings.json and descriptor.mod.

/** Parse "1.18.3.0" / "Case Green v1.18.3.0.7709" → { major, minor } or null. */
function parseGameBranch(rawVersion, displayVersion) {
  for (const s of [rawVersion, displayVersion]) {
    const m = String(s || "").match(/(\d+)\.(\d+)/);
    if (m) return { major: +m[1], minor: +m[2] };
  }
  return null;
}

/**
 * Parse a descriptor `supported_version` into a branch matcher:
 *   "*"        → { any: true }            (matches any game version)
 *   "1.*"      → { major: 1, minor: null } (any 1.x — minor wildcard)
 *   "1.17.*"   → { major: 1, minor: 17 }   (1.17 branch; the * is the patch wildcard)
 *   "1.17.3.*" → { major: 1, minor: 17 }   (1.17 branch)
 *   ""/garbage → null
 * Note HOI4 treats the SECOND segment as the gameplay branch (1.17 vs 1.18). A trailing "*" after the
 * minor still pins the minor; "*" in the minor position (rare) means any minor of that major.
 */
function parseSupportedBranch(supported) {
  const s = String(supported || "").trim();
  if (!s) return null;
  if (s === "*" || s === "*.*" || s === "*.*.*") return { any: true };
  const parts = s.split(".");
  const major = parts[0] === "*" ? null : parseInt(parts[0], 10);
  if (parts[0] === "*") return { any: true }; // wildcard major = any
  if (!Number.isFinite(major)) return null;
  const minorTok = (parts[1] || "*").trim();
  const minor = minorTok === "*" ? null : parseInt(minorTok, 10);
  return { major, minor: Number.isFinite(minor) ? minor : null };
}

/**
 * Compare a mod's supported_version against the game version. Returns:
 *   { match, severity, gameBranch, modSupported, message }
 * severity: "none" (compatible/unknown) | "warning" (branch mismatch — a heads-up: many mods run fine across a branch).
 */
function checkModGameVersion(supportedVersion, rawVersion, displayVersion) {
  const game = parseGameBranch(rawVersion, displayVersion);
  const sup = parseSupportedBranch(supportedVersion);
  const gameBranch = game ? `${game.major}.${game.minor}` : (String(displayVersion || rawVersion || "").trim() || "unknown");
  const modSupported = String(supportedVersion || "").trim() || "(none declared)";

  // Can't tell → don't cry wolf.
  if (!game || !sup || sup.any) {
    return { match: true, severity: "none", gameBranch, modSupported, message: "" };
  }
  const majorOk = sup.major === game.major;
  const minorOk = sup.minor === null ? true : sup.minor === game.minor;
  if (majorOk && minorOk) {
    return { match: true, severity: "none", gameBranch, modSupported, message: "" };
  }
  return {
    match: false,
    severity: "warning",
    gameBranch,
    modSupported,
    message: `Heads up: this mod targets HOI4 ${modSupported}, but your game is ${gameBranch}. Many mods still run fine across a branch, so this isn't necessarily a problem — but if the game misbehaves, rolling back to ${sup.minor === null ? `${sup.major}.x` : `${sup.major}.${sup.minor}.x`} (Steam → HOI4 → Properties → Betas) rules the version out.`,
  };
}

module.exports = { parseGameBranch, parseSupportedBranch, checkModGameVersion };
