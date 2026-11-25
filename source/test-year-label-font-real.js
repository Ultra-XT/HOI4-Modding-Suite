// #year-label-font-not-a-font — MAKING A RESEARCH-TREE YEAR LABEL BIG NAMED A FONT THE GAME DOES NOT HAVE.
//
// HOI4 has no free-form text size: a label names a FONT, and the name has to be one the game defines.
// novaYearFontForPx returned `hoi_48header` above its top threshold, and that font exists in neither vanilla
// nor Millennium Dawn — vanilla's largest header font is hoi_36header. The client clamps the size control to
// 6–120px and the threshold sat at 55, so dragging a year marker larger wrote a name into the mod's
// countrytechtreeview.gui that resolves to nothing.
//
// The middle of the ladder was dead too: hoi_30 and hoi_33 exist, and are in Nova's own SECTION_LABEL_FONTS,
// but every size from 24 to 36 collapsed onto hoi_24header — most of the drag range did nothing visible.
//
// The invariant this test really pins is the one that matters: EVERY font Nova can emit, anywhere in the
// range the UI allows, must be a font the game actually declares.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-ylf-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";

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

const ctlFiles = [];
function controlApp(label, pairs) {
  const raw = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  const wasCrlf = raw.includes("\r\n");
  let out = wasCrlf ? raw.replace(/\r\n/g, "\n") : raw;
  for (const [from, to] of pairs) {
    if (!out.includes(from)) return { error: "anchor missing: " + from.slice(0, 90) };
    if (out.split(from).length !== 2) return { error: "anchor not unique: " + from.slice(0, 90) };
    out = out.replace(from, to);
  }
  const p = path.join(__dirname, `.ctl-ylf-${process.pid}-${label}.js`);
  fs.writeFileSync(p, wasCrlf ? out.replace(/\n/g, "\r\n") : out, "utf8");
  ctlFiles.push(p);
  try { return { createApp: require(p).createApp }; } catch (e) { return { error: String(e && e.message) }; }
}

// every font name the game declares in interface/*.gfx
function gameFonts() {
  const out = new Set();
  const dir = path.join(GAME, "interface");
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => /\.gfx$/i.test(f)); } catch (_) { return null; }
  for (const f of files) {
    let t = "";
    try { t = fs.readFileSync(path.join(dir, f), "utf8"); } catch (_) { continue; }
    for (const m of t.matchAll(/name\s*=\s*"(hoi_[A-Za-z0-9_]+)"/g)) out.add(m[1]);
  }
  return out;
}

function mkMod(name) {
  const dir = path.join(ROOT, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), `name="${name}"\nsupported_version="1.19.*"\n`, "utf8");
  return dir;
}

let PORT = 44400;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      post: (u, b) => fetch(`http://127.0.0.1:${PORT}${u}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) })
        .then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}

// the font the writer picks for one editor-px size
async function fontFor(api, mod, px) {
  const r = await api.post("/api/research/folder-year-labels", {
    modPath: mod, folder: "infantry_folder",
    markers: [{ id: "probe", year: 1936, x: 10, y: 10, fontSize: px, w: 200, h: 40, format: "left" }],
  });
  const y = (r.b && r.b.years && r.b.years[0]) || null;
  return y ? y.font : null;
}

// the whole range the client's own clamp allows: Math.max(6, Math.min(120, …))
const SIZES = [];
for (let px = 6; px <= 120; px += 2) SIZES.push(px);

(async () => {
  const api = await serve(createApp());
  try {
    console.log("\n[ground truth] which fonts does the game actually define?");
    const fonts = gameFonts();
    if (!fonts) {
      console.log("  (skipped — vanilla not installed)");
      console.log(`\n=== year label font: ${checks} checks, 0 failed ===`);
      return;
    }
    rec("vanilla declares a set of hoi_ fonts", fonts.size >= 10, fonts.size);
    rec("…including hoi_36header", fonts.has("hoi_36header"), [...fonts].join(", "));
    rec("…and NOT hoi_48header", !fonts.has("hoi_48header"), [...fonts].join(", "));

    console.log("\n[the invariant] every size the UI allows must name a real font");
    const mod = mkMod("m");
    const seen = new Map();
    const bad = [];
    for (const px of SIZES) {
      const f = await fontFor(api, mod, px);
      seen.set(px, f);
      if (!f || !fonts.has(f)) bad.push(`${px}px -> ${f}`);
    }
    rec("every size from 6 to 120 names a font the game declares", bad.length === 0, bad);
    rec("…and the largest size does not invent one",
      seen.get(120) === "hoi_36header", { "120px": seen.get(120) });

    console.log("\n[the ladder] bigger never means smaller, and the middle is not dead");
    const SIZE_OF = { hoi_16mbs: 16, hoi_18: 18, hoi_20b: 20, hoi_22tech: 22, hoi_24header: 24, hoi_30: 30, hoi_33: 33, hoi_36header: 36 };
    let monotonic = true, prev = 0;
    for (const px of SIZES) {
      const s = SIZE_OF[seen.get(px)];
      if (s === undefined) continue;
      if (s < prev) monotonic = false;
      prev = s;
    }
    rec("the ladder never goes backwards as the size grows", monotonic,
      SIZES.map((p) => `${p}:${seen.get(p)}`).join(" "));
    const used = new Set([...seen.values()]);
    rec("hoi_30 is reachable", used.has("hoi_30"), [...used].join(", "));
    rec("hoi_33 is reachable", used.has("hoi_33"), [...used].join(", "));
    rec("distinct fonts across the range is more than the old three", used.size >= 4, [...used].join(", "));

    console.log("\n[unchanged] the small end keeps the font it already had");
    rec("the default 13px is still hoi_20b", seen.get(14) === "hoi_20b" && (await fontFor(api, mod, 13)) === "hoi_20b",
      { "13px": await fontFor(api, mod, 13), "14px": seen.get(14) });
    api.stop();

    console.log("\n[back-out] put the invented font back");
    {
      const built = controlApp("fakefont", [[
        '  return "hoi_36header"; // the largest header font the game actually defines',
        '  if (g <= 44) return "hoi_36header";\n  return "hoi_48header";']]);
      if (built.error) rec("the control patched cleanly", false, built.error);
      else {
        const capi = await serve(built.createApp());
        const cmod = mkMod("ctl");
        try {
          const f = await fontFor(capi, cmod, 120);
          rec("…and the largest size names a font the game does not have",
            f === "hoi_48header" && !fonts.has(f), f);
        } finally { capi.stop(); }
      }
    }

    console.log(`\n=== year label font: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { api.stop(); } catch (_) {}
    for (const p of ctlFiles) { try { fs.unlinkSync(p); } catch (_) {} }
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
