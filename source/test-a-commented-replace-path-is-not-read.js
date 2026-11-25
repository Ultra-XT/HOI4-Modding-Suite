// ⛔ #a-commented-replace-path-is-not-read (B6-17-open) — a replace_path line behind a # in descriptor.mod is a comment: HOI4 never
// reads it, and neither may Nova.
//
// readReplacePaths matched `replace_path = "…"` anywhere in the text, comments included, so `# replace_path="map"` turned on the
// total-conversion reading and raised replaced_map_files_missing for a mod that replaces nothing: a validator crying wolf. server.js's
// getModReplacePaths, behind getActiveRoots and every maker, had the same regex. Both now read through descriptorReplacePaths, the
// comment-aware (and quote-aware: a name may hold a #) reader the replace_path splicer already used.
// Run: node test-a-commented-replace-path-is-not-read.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-commented-rp-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.APPDATA, { recursive: true }); fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");
const { maskJsComments, maskJsLiterals, jsBodyAt } = require("./testlib-strip-comments.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 900) : "")); }
};
const write = (dir, rel, body) => { const p = path.join(dir, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
function bmp24(W, H, fn) {
  const rs = Math.floor((24 * W + 31) / 32) * 4, b = Buffer.alloc(54 + rs * H);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(rs * H, 34);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, bl] = fn(x, y); const o = 54 + (H - 1 - y) * rs + x * 3; b[o] = bl; b[o + 1] = g; b[o + 2] = r; }
  return b;
}
const DEF = "0;0;0;0;land;false;unknown;0\n1;10;0;0;land;false;plains;1\n2;20;0;0;land;false;plains;1\n";
const BMP = bmp24(20, 10, (x) => (x < 10 ? [10, 0, 0] : [20, 0, 0]));
const ADJ = "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n-1;-1;;-1;-1;-1;-1;-1;;\n";
const GAME = path.join(ROOT, "game");
write(GAME, "map/provinces.bmp", BMP); write(GAME, "map/definition.csv", DEF); write(GAME, "map/adjacencies.csv", ADJ);
const mod = (label, descriptor) => {
  const m = path.join(ROOT, label);
  write(m, "descriptor.mod", descriptor);
  write(m, "map/provinces.bmp", BMP); write(m, "map/definition.csv", DEF);    // no adjacencies.csv of its own
  return m;
};
const missingRule = (m) => md.validateMapFiles({ modRoot: m, gameRoot: GAME, dependencyRoots: [] }).find((p) => p && p.rule === "replaced_map_files_missing") || null;

try {
  console.log("1. ⭐⭐⭐ readReplacePaths reads the descriptor's code, not its comments");
  {
    const m = mod("commented", 'version="1.0"\r\nname="Commented #1 mod"\r\n# replace_path="map"\r\n\t#replace_path="common/ideas"\r\nreplace_path="history/states" # the one that counts\r\nreplace_path="common/units/" replace_path="Gfx\\Leaders"\r\n');
    const rp = md.readReplacePaths(m);
    ok(!rp.has("map") && !rp.has("common/ideas"), "⭐⭐⭐ a # replace_path line (indented or not) is not read", [...rp]);
    ok(rp.has("history/states"), "⭐⭐ a live line with a comment after it is read", [...rp]);
    ok(rp.has("common/units") && rp.has("gfx/leaders"), "…two on one line, normalised as before (slashes, a trailing slash, case)", [...rp]);
    ok(rp.size === 3, "…and nothing else", [...rp]);
    ok(md.descriptorReplacePaths('name="A # B"\nreplace_path="map"\n').length === 1, "a # inside a quoted name is not a comment (quote-aware)");
  }

  console.log("\n2. ⭐⭐⭐ The validator does not cry wolf over a commented-out replace_path=\"map\"");
  {
    const live = mod("live", 'name="Live"\nreplace_path="map"\n');
    const pLive = missingRule(live);
    ok(!!pLive && (pLive.items || []).some((i) => i.file === "map/adjacencies.csv"), "THE CONTROL: the live line raises replaced_map_files_missing (adjacencies.csv)", pLive && pLive.items);
    const off = mod("off", 'name="Off"\n# replace_path="map"\n');
    ok(missingRule(off) === null, "⭐⭐⭐ the commented line raises nothing", missingRule(off));
  }

  console.log("\n3. ⭐⭐ server.js getModReplacePaths (behind getActiveRoots) reads through the same comment-aware reader");
  {
    const src = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
    const code = maskJsComments(src), lit = maskJsLiterals(src);
    const at = code.indexOf("function getModReplacePaths(");
    const body = at === -1 ? null : jsBodyAt(lit, at);
    const text = body ? code.slice(body[0], body[1] + 1) : "";
    ok(at !== -1 && !!body, "getModReplacePaths is found, once", { at, again: code.indexOf("function getModReplacePaths(", at + 1) });
    ok(code.indexOf("function getModReplacePaths(", at + 1) === -1, "…and only once");
    ok(/mapData\.descriptorReplacePaths\(/.test(text), "⭐⭐ it reads through mapData.descriptorReplacePaths", text.slice(0, 600));
    ok(!/replace_path\\s\*=/.test(text), "…and no comment-blind regex of its own is left", text.slice(0, 600));
  }
} catch (e) {
  fail++;
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
} finally {
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
}
console.log(`\n=== a commented replace_path is not read: ${pass} passed, ${fail} failed ===`);
process.exitCode = fail ? 1 : 0;
