// CUSTOM ICON UPLOAD SWEEP — every upload type, checked end to end.
//
// The play report asked for a sweep of the custom icon uploads. This is that sweep, kept as a test because
// the thing it protects is a NAMING CONVENTION: each entity type looks its picture up under a different
// sprite prefix, and getting one wrong produces an icon that exists on disk, is declared in a .gfx, and is
// still never drawn. Nothing else in Nova would notice — /api/icon-image serves a placeholder on a miss, so
// the editor shows the art either way.
//
// Three things per type:
//   (a) a .gfx entry is written
//   (b) its texturefile exists on disk, relative to the mod root
//   (c) the sprite NAME is the one the game looks up for that entity
//
// (c) is measured against vanilla, not remembered. The prefixes below are the ones vanilla actually uses:
//   GFX_report_event_ (594 sprites)   GFX_decision_ (600)   GFX_focus_ (5,774)   GFX_idea_ (4,214)
//   GFX_portrait_ (3,832)
// and a TECHNOLOGY is the odd one out — its picture is GFX_<id>_MEDIUM. Measured: 429 of vanilla's 552
// technologies declare GFX_<id>_medium and ZERO declare a bare GFX_<id>, so dropping the suffix would give
// every custom tech icon a name the game never asks for. Nova gets this right; this test keeps it that way.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-iconconv-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const V = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";

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

function walk(dir, re, d = 0) {
  let out = [];
  if (d > 8) return out;
  let es = [];
  try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return out; }
  for (const e of es) out = out.concat(e.isDirectory() ? walk(path.join(dir, e.name), re, d + 1) : (re.test(e.name) ? [path.join(dir, e.name)] : []));
  return out;
}
function spriteNames(root) {
  const out = new Set();
  for (const p of walk(root, /\.gfx$/i)) {
    let t = "";
    try { t = fs.readFileSync(p, "utf8").replace(/#[^\n]*/g, ""); } catch (_) { continue; }
    for (const m of t.matchAll(/\bname\s*=\s*"([^"]+)"/g)) out.add(m[1]);
    for (const m of t.matchAll(/\bname\s*=\s*([A-Za-z0-9_.-]+)/g)) out.add(m[1]);
  }
  return out;
}
function techIds(root) {
  const out = new Set();
  const dir = path.join(root, "common", "technologies");
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith(".txt")); } catch (_) { return out; }
  for (const f of files) {
    const t = fs.readFileSync(path.join(dir, f), "utf8").replace(/#[^\n]*/g, "");
    const i = t.indexOf("technologies");
    if (i < 0) continue;
    const o = t.indexOf("{", i);
    let d = 0, body = "";
    for (let k = o; k < t.length; k++) { if (t[k] === "{") d++; else if (t[k] === "}") { d--; if (!d) { body = t.slice(o + 1, k); break; } } }
    let lvl = 0;
    for (const line of body.split(/\r?\n/)) {
      const m = /^\s*([A-Za-z0-9_]+)\s*=\s*\{/.exec(line);
      if (m && lvl === 0) out.add(m[1]);
      lvl += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
    }
  }
  return out;
}

const mod = path.join(ROOT, "m");
fs.mkdirSync(mod, { recursive: true });
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="m"\nsupported_version="1.19.*"\n', "utf8");

const PORT = 45850;
(async () => {
  let server = null;
  try {
    console.log("\n[ground truth] the prefixes vanilla actually uses");
    const haveGame = fs.existsSync(path.join(V, "interface"));
    let vs = new Set();
    if (!haveGame) console.log("  (skipped — vanilla not installed)");
    else {
      vs = spriteNames(V);
      const n = (p) => [...vs].filter((s) => s.startsWith(p)).length;
      for (const [p, min] of [["GFX_report_event_", 100], ["GFX_decision_", 100], ["GFX_focus_", 1000],
        ["GFX_idea_", 1000], ["GFX_portrait_", 1000]]) {
        rec(`vanilla uses ${p}`, n(p) >= min, { prefix: p, count: n(p) });
      }
      // The technology exception, which is the one worth guarding.
      const ids = techIds(V);
      const withMedium = [...ids].filter((id) => vs.has(`GFX_${id}_medium`)).length;
      const withBare = [...ids].filter((id) => vs.has(`GFX_${id}`) && !vs.has(`GFX_${id}_medium`)).length;
      rec("a technology's picture is GFX_<id>_medium", withMedium > 300, { withMedium, of: ids.size });
      rec("…and NO vanilla technology uses a bare GFX_<id>", withBare === 0, withBare);
    }

    const app = createApp();
    server = await new Promise((r) => { const sv = app.listen(PORT, () => r(sv)); });
    const { Jimp } = require("jimp");
    const png = await new Jimp({ width: 64, height: 64, color: 0xffffffff }).getBuffer("image/png");
    const upload = async (url, fields) => {
      const fd = new FormData();
      fd.append("image", new Blob([png], { type: "image/png" }), "i.png");
      for (const [k, v] of Object.entries(fields)) fd.append(k, v);
      const r = await fetch(`http://127.0.0.1:${PORT}${url}`, { method: "POST", body: fd });
      return { s: r.status, b: await r.json().catch(() => ({})) };
    };
    const modSprites = () => {
      const out = new Map();
      for (const p of walk(mod, /\.gfx$/i)) {
        const t = fs.readFileSync(p, "utf8").replace(/#[^\n]*/g, "");
        const re = /name\s*=\s*"([^"]+)"[\s\S]*?texturefile\s*=\s*"([^"]+)"/g;
        let m;
        while ((m = re.exec(t))) out.set(m[1], m[2]);
      }
      return out;
    };

    console.log("\n[every type] declared, on disk, and named the way the game asks for it");
    const TYPES = [
      { type: "event", name: "nua_pic_ev", want: "GFX_report_event_nua_pic_ev" },
      { type: "decision", name: "nua_pic_de", want: "GFX_decision_nua_pic_de" },
      { type: "focus", name: "nua_pic_fo", want: "GFX_focus_nua_pic_fo" },
      { type: "idea", name: "nua_pic_id", want: "GFX_idea_nua_pic_id" },
      { type: "spirit", name: "nua_pic_sp", want: "GFX_idea_nua_pic_sp" },
      { type: "technology", name: "nua_tech", want: "GFX_nua_tech_medium" },
      { type: "equipment", name: "nua_equip", want: "GFX_nua_equip_medium" },
      { type: "character", name: "nua_ger_bob", want: "GFX_portrait_nua_ger_bob" },
    ];
    for (const t of TYPES) {
      const r = await upload("/api/upload-gfx", { type: t.type, name: t.name, modPath: mod });
      const sp = String(r.b.spriteName || "");
      rec(`${t.type}: upload succeeds`, r.s === 200 && !r.b.error, r.b.error || r.b);
      rec(`${t.type}: sprite is ${t.want}`, sp === t.want, sp);
      const all = modSprites();
      const tex = all.get(sp);
      rec(`${t.type}: declared in a .gfx`, !!tex, [...all.keys()].slice(0, 4));
      rec(`${t.type}: and its texturefile really exists`, !!tex && fs.existsSync(path.join(mod, tex)), tex);
    }

    console.log("\n[the reference] what the page then puts in the content must match the sprite");
    {
      // The upload is only half of it: the id written into the focus/idea has to be the name just declared,
      // or the picture exists and nothing points at it.
      const APP = fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8");
      const IDEAS = fs.readFileSync(path.join(__dirname, "public", "ideas.js"), "utf8");
      const RES = fs.readFileSync(path.join(__dirname, "public", "research.js"), "utf8");
      rec("the focus editor sets its icon field from the returned sprite name",
        /const key = data\.spriteName[\s\S]{0,240}?sb-focus-icon[\s\S]{0,160}?input\.value = key/.test(APP), "not wired");
      rec("the idea editor sets its picture field from it",
        /ideaPictureId\.value = data\.spriteName/.test(IDEAS), "not wired");
      rec("the research page sets its tech icon field from it",
        /techIconId"\)\.value = data\.spriteName/.test(RES), "not wired");
    }

    console.log("\n[no collision] two types may share a name without overwriting each other");
    {
      const a = await upload("/api/upload-gfx", { type: "focus", name: "shared_name", modPath: mod });
      const b = await upload("/api/upload-gfx", { type: "idea", name: "shared_name", modPath: mod });
      rec("both uploads succeed", a.s === 200 && b.s === 200, { a: a.b.error, b: b.b.error });
      rec("…and they are different sprites", a.b.spriteName !== b.b.spriteName,
        { focus: a.b.spriteName, idea: b.b.spriteName });
      const all = modSprites();
      rec("…both still declared", all.has(a.b.spriteName) && all.has(b.b.spriteName), [...all.keys()].slice(0, 6));
      rec("…and they do not share one file",
        all.get(a.b.spriteName) !== all.get(b.b.spriteName),
        { focus: all.get(a.b.spriteName), idea: all.get(b.b.spriteName) });
    }

    console.log(`\n=== icon upload conventions: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (server) { server.closeAllConnections(); server.close(); } } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
