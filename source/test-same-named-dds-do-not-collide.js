// texconv writes `<outDir>/<basename>.png`, a name that depends only on the source BASENAME. Both DDS
// converters used to pass ICON_CACHE_DIR — ONE directory shared by every conversion in the process — while
// _ddsAcquire permits DDS_CONV_MAX = 3 conversions at once. Three children could therefore hold the same
// intermediate open at the same time. Whoever copied last won, and the result is persisted under an
// mtime+size-keyed hash, so a wrong image is STICKY ACROSS RESTARTS rather than a flicker.
//
// The Newspaper Style picker is the live trigger: four installed sources ship a file at exactly
// gfx/interface/event_news_bg.dds, and the picker appends every tile in one synchronous loop, firing all four
// image loads in the same frame. The modder then picks their newspaper from tiles that may be showing another
// mod's paper under the wrong label.
//
// ⭐ THIS TEST CONVERTS THE REAL COLLIDING FILES THROUGH THE REAL ENDPOINT, CONCURRENTLY, and asserts every
// answer is distinct. A source-level check would only prove the argument changed; the property is that two
// same-named files cannot hand back each other's pixels.
//
// ⚠️ Runs against a PRIVATE app-data directory, so it neither reads nor writes the user's real icon cache —
// which also guarantees a cold cache, without which every request would be served from disk and prove nothing.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const PORT = 53419;
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-ddscollide-"));
process.env.NOVA_APP_DATA_DIR = SANDBOX;
process.env.APPDATA = SANDBOX;
process.env.XDG_CONFIG_HOME = SANDBOX;

const { createApp } = require("./server.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};

// Every installed source that ships gfx/interface/event_news_bg.dds — DERIVED, not listed.
function collidingSources() {
  const out = [];
  const steam = "D:/SteamLibrary/steamapps";
  const rel = path.join("gfx", "interface", "event_news_bg.dds");
  const game = path.join(steam, "common", "Hearts of Iron IV", rel);
  if (fs.existsSync(game)) out.push({ name: "vanilla", file: game });
  const ws = path.join(steam, "workshop", "content", "394360");
  if (fs.existsSync(ws)) {
    for (const d of fs.readdirSync(ws)) {
      const p = path.join(ws, d, rel);
      if (fs.existsSync(p)) out.push({ name: d, file: p });
    }
  }
  return out;
}

const sha1 = (buf) => crypto.createHash("sha1").update(buf).digest("hex").slice(0, 16);

(async () => {
  let server;
  try {
    const sources = collidingSources();
    console.log("1. The collision precondition exists on this machine");
    rec("at least two installed sources ship the same-named file", sources.length >= 2,
      sources.map((s) => s.name));
    rec("…and their bytes really are different files",
      new Set(sources.map((s) => sha1(fs.readFileSync(s.file)))).size === sources.length,
      "identical sources would make the whole test vacuous");
    if (sources.length < 2) throw new Error("cannot test a collision without colliding files");

    server = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });

    console.log("\n2. Converted CONCURRENTLY, the way the picker does it");
    // All in one frame, exactly as events.js appends its tiles.
    const results = await Promise.all(sources.map(async (s) => {
      const url = `http://127.0.0.1:${PORT}/api/buildings/icon-file?path=${encodeURIComponent(s.file)}`;
      const r = await fetch(url);
      if (!r.ok) return { name: s.name, ok: false, status: r.status };
      const buf = Buffer.from(await r.arrayBuffer());
      // PNG dimensions live in the IHDR chunk at bytes 16..24.
      const isPng = buf.length > 24 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
      return {
        name: s.name, ok: true, isPng, bytes: buf.length, hash: sha1(buf),
        w: isPng ? buf.readUInt32BE(16) : null, h: isPng ? buf.readUInt32BE(20) : null,
      };
    }));
    results.forEach((r) => console.log(`     ${r.name}: ${r.ok ? `${r.w}x${r.h}, ${r.bytes} bytes, ${r.hash}` : "HTTP " + r.status}`));

    const served = results.filter((r) => r.ok && r.isPng);
    rec("every request produced an image", served.length === sources.length,
      `${served.length}/${sources.length} — a blank tile is the OTHER outcome of this collision`);

    console.log("\n3. …and no two of them are the same image");
    // THE PROPERTY. With a shared intermediate, two conversions could hand back identical pixels.
    const hashes = served.map((r) => r.hash);
    rec("no source was served another source's pixels", new Set(hashes).size === hashes.length,
      hashes.length === new Set(hashes).size ? `${hashes.length} distinct` : results.map((r) => `${r.name}=${r.hash}`));

    console.log("\n4. The intermediate is no longer shared");
    const { stripJsComments } = require("./testlib-strip-comments.js");
    const SRC = stripJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));
    rec("a private work directory is created per conversion", /mkdtempSync\(path\.join\(os\.tmpdir\(\), "nova-dds-"\)\)/.test(SRC));
    // ⚠️ Count CALL sites, not occurrences. `_ddsWorkDir(outPath)` also matches the helper's own definition
    // line, which is this project's documented trap for derived counts — and it caught this test out first
    // time, reporting 3 where 2 callers exist.
    const callSites = (SRC.match(/[^n] _ddsWorkDir\(outPath\)/g) || []).length;
    rec("…and both converters use it, not the shared cache dir", callSites === 2,
      `${callSites} call sites — the two converters are twins; fixing one leaves the other to be copied onward`);
    rec("…and it is cleaned up", (SRC.match(/_ddsWorkCleanup\(/g) || []).length >= 3);
    rec("neither converter still passes path.dirname(outPath) to texconv",
      !/"-o", outDir, ddsPath/.test(SRC), "outDir was ICON_CACHE_DIR, shared by every conversion");

    console.log("\n5. No raw-basename leftovers land beside the hashed entries");
    // 1,212 of them were measured in the real cache when this was found. The sandbox must stay clean.
    // resolveNovaAppDataDir() appends "NovaModdingSuite" to APPDATA, so the cache is one level deeper than
    // the sandbox root. Looking in the wrong place reported "0 files" and read as a failure of the fix.
    const cacheDir = path.join(SANDBOX, "NovaModdingSuite", "cache");
    const entries = fs.existsSync(cacheDir) ? fs.readdirSync(cacheDir) : [];
    const leftovers = entries.filter((f) => /^event_news_bg\.png$/i.test(f));
    rec("the conversions produced cache entries at all", entries.length > 0, entries.length + " files");
    rec("…and none of them is the raw basename", leftovers.length === 0, leftovers);

    console.log(`\n=== same-named dds do not collide: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    if (server) { try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {} await new Promise((r) => server.close(r)); }
    try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}
  }
})();
