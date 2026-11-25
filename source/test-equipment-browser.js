// #equipment-picker-blind — PICKING EQUIPMENT MEANT TYPING AN ID YOU ALREADY KNEW.
//
// Reported from play: the equipment picker should be a visual browser like decisions and spirits; and,
// separately, "aircraft should offer real in-game or user-made aircraft". Both were the same input: a bare
// <input list="…"> with a datalist behind it. You had to know the id to find it, and nothing showed you what
// the thing looked like — which is the entire point of a picker.
//
// There are now Browse buttons beside the three equipment fields (starting stockpile, OOB ship, OOB
// aircraft), all opening one shared grid of tiles with the real in-game picture, searchable, batched.
//
// ⚠️ THE PART THAT NEEDED MEASURING — equipment art is NOT named like technology art.
// A technology's picture is GFX_<id>_medium. Equipment is not: measured on vanilla, GFX_<id>_medium resolves
// for only 74 of its 308 equipment entries. The real rule is GFX_<picture>_medium, and a TIER usually
// carries no picture of its own — it inherits its archetype's. infantry_equipment declares no picture; its
// archetype's is archetype_infantry_equipment, so the sprite is GFX_archetype_infantry_equipment_medium.
// The first version of this browser used the technology helper unchanged and every vanilla tile came up
// blank; /api/icon-image serves a placeholder on a miss, so nothing errored — it just showed nothing.
"use strict";
const fs = require("fs");
const path = require("path");

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
const P = (f) => path.join(__dirname, "public", f);
const ARMY = fs.readFileSync(P("army.js"), "utf8");
const HTML = fs.readFileSync(P("army.html"), "utf8");
const ICO = fs.readFileSync(P("tech-icon.js"), "utf8");

function walk(dir, re, d = 0) {
  let out = [];
  if (d > 8) return out;
  let es = [];
  try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return out; }
  for (const e of es) out = out.concat(e.isDirectory() ? walk(path.join(dir, e.name), re, d + 1) : (re.test(e.name) ? [path.join(dir, e.name)] : []));
  return out;
}
function loadHelper() {
  const doc = {
    getElementById: () => null,
    createElement: () => ({ id: "", textContent: "", appendChild() {} }),
    head: { appendChild() {} }, documentElement: { appendChild() {} }, querySelectorAll: () => [],
  };
  const win = { document: doc, localStorage: { getItem: () => "" } };
  // eslint-disable-next-line no-new-func
  new Function("window", "document", "Image", ICO)(win, doc, function Image() {});
  return win.NovaTechIcon;
}

(async () => {
  try {
    console.log("\n[ground truth] equipment art is not named like technology art");
    const haveGame = fs.existsSync(path.join(V, "common", "units", "equipment"));
    if (!haveGame) console.log("  (skipped — vanilla not installed)");
    else {
      const sprites = new Set();
      for (const p of walk(V, /\.gfx$/i)) {
        let t = "";
        try { t = fs.readFileSync(p, "utf8").replace(/#[^\n]*/g, ""); } catch (_) { continue; }
        for (const m of t.matchAll(/\bname\s*=\s*"([^"]+)"/g)) sprites.add(m[1]);
        for (const m of t.matchAll(/\bname\s*=\s*([A-Za-z0-9_.-]+)/g)) sprites.add(m[1]);
      }
      // equipment ids + their own picture, if any
      const dir = path.join(V, "common", "units", "equipment");
      const ids = [], pic = new Map(), arch = new Map();
      for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".txt"))) {
        const raw = fs.readFileSync(path.join(dir, f), "utf8").replace(/#[^\n]*/g, "");
        const im = /(^|[^A-Za-z0-9_])equipments\s*=\s*\{/.exec(raw);
        if (!im) continue;
        const o = raw.indexOf("{", im.index);
        let d = 0, body = "";
        for (let k = o; k < raw.length; k++) { if (raw[k] === "{") d++; else if (raw[k] === "}") { d--; if (!d) { body = raw.slice(o + 1, k); break; } } }
        let lvl = 0, cur = null, start = 0;
        for (let k = 0; k < body.length; k++) {
          if (lvl === 0) {
            const m = /^\s*([A-Za-z0-9_]+)\s*=\s*\{/.exec(body.slice(k, k + 140));
            if (m) { cur = m[1]; k += m[0].length - 1; lvl = 1; start = k + 1; continue; }
          } else {
            const c = body[k];
            if (c === "{") lvl++;
            else if (c === "}") {
              lvl--;
              if (!lvl && cur) {
                const blk = body.slice(start, k);
                ids.push(cur);
                const pm = /(^|\n)\s*picture\s*=\s*"?([A-Za-z0-9_.-]+)"?/.exec(blk);
                if (pm) pic.set(cur, pm[2]);
                const am = /(^|\n)\s*archetype\s*=\s*([A-Za-z0-9_]+)/.exec(blk);
                if (am) arch.set(cur, am[2]);
                cur = null;
              }
            }
          }
        }
      }
      rec("vanilla declares hundreds of equipment entries", ids.length > 200, ids.length);
      const byIdMedium = ids.filter((id) => sprites.has(`GFX_${id}_medium`)).length;
      rec("…and GFX_<id>_medium resolves for only a minority of them",
        byIdMedium > 0 && byIdMedium < ids.length / 2, { resolves: byIdMedium, of: ids.length });
      // the rule the browser implements: picture (own, else archetype's) -> GFX_<picture>_medium
      const keyFor = (id) => {
        const p = pic.get(id) || pic.get(arch.get(id) || "") || "";
        return `GFX_${p || id}_medium`;
      };
      const resolved = ids.filter((id) => sprites.has(keyFor(id))).length;
      rec("…while picture-through-archetype resolves far more", resolved > byIdMedium,
        { pictureRule: resolved, idRule: byIdMedium, of: ids.length });
      rec("the worked example holds: infantry_equipment -> GFX_archetype_infantry_equipment_medium",
        keyFor("infantry_equipment") === "GFX_archetype_infantry_equipment_medium" &&
        sprites.has("GFX_archetype_infantry_equipment_medium"), keyFor("infantry_equipment"));
      rec("…and its bare form really is absent", !sprites.has("GFX_infantry_equipment_medium"), "it exists after all");
    }

    console.log("\n[the helper] can be told which sprite to fetch");
    const api = loadHelper();
    rec("NovaTechIcon loaded", !!(api && api.html), typeof api);
    rec("…still derives GFX_<id>_medium when not told otherwise",
      !/data-key/.test(api.html("some_tech")), api.html("some_tech"));
    rec("…and carries an explicit key when given one",
      /data-key="GFX_archetype_infantry_equipment_medium"/.test(api.html("infantry_equipment", { key: "GFX_archetype_infantry_equipment_medium" })),
      api.html("infantry_equipment", { key: "GFX_archetype_infantry_equipment_medium" }));
    rec("…and mount() prefers that key over the derived one",
      /el\.dataset\.key \|\| "GFX_" \+ el\.dataset\.tech \+ "_medium"/.test(ICO), "mount ignores data-key");
    rec("…with the key escaped into the attribute", api.html("x", { key: 'a"b' }).includes("&quot;"), api.html("x", { key: 'a"b' }));

    console.log("\n[the browser] exists, is shared, and is reachable from all three fields");
    rec("army.js has an equipment browser", /function openEquipmentBrowser\(/.test(ARMY), "no browser");
    rec("…rendering the same tile class the tech picker uses",
      /openEquipmentBrowser[\s\S]{0,3000}?modal-item-tech/.test(ARMY), "different tiles");
    rec("…with a search box", /openEquipmentBrowser[\s\S]{0,3000}?eqbSearch/.test(ARMY), "no search");
    rec("…and batched rendering, because the list runs to hundreds",
      /openEquipmentBrowser[\s\S]{0,3000}?BATCH = \d+/.test(ARMY), "renders everything at once");
    rec("…closable by button, backdrop and Escape",
      /eqbClose/.test(ARMY) && /e\.target === ov/.test(ARMY) && /e\.key === "Escape"/.test(ARMY), "not all three");
    for (const [btn, input] of [["spBrowseBtn", "spType"], ["naShipEqBrowseBtn", "naShipEq"], ["naAirEqBrowseBtn", "naAirEq"]]) {
      rec(`army.html has a Browse button for ${input}`, new RegExp(`id="${btn}"`).test(HTML), "missing");
      rec(`…wired to open the browser and fill ${input}`,
        new RegExp(`${btn}[\\s\\S]{0,400}?openEquipmentBrowser\\([\\s\\S]{0,300}?eqbSetInput\\("${input}"`).test(ARMY),
        "not wired");
    }
    rec("filling an input tells listeners it changed",
      /function eqbSetInput[\s\S]{0,400}?dispatchEvent\(new Event\("input"[\s\S]{0,200}?dispatchEvent\(new Event\("change"/.test(ARMY),
      "no events fired");

    console.log("\n[the icons] the browser resolves them the measured way");
    rec("it builds a sprite key from picture, falling back to the id",
      /GFX_\$\{pic \|\| e\.id\}_medium/.test(ARMY), "no picture-based key");
    rec("…walking a tier up to its archetype's picture",
      /picOf\.get\(hop\)/.test(ARMY), "no archetype hop");
    rec("…and passes that key to the icon helper",
      /size: "lg", key: r\.iconKey/.test(ARMY), "key not passed");
    rec("the OOB rows reuse the same resolved keys",
      /S\.eqIconKey && S\.eqIconKey\.get\(r\.id\)/.test(ARMY), "OOB rows derive their own");

    console.log("\n[cache] the helper's stylesheet and the page script must both ship");
    const pages = fs.readdirSync(P("")).filter((f) => f.endsWith(".html") && fs.readFileSync(P(f), "utf8").includes("tech-icon.js"));
    const vers = pages.map((f) => (/tech-icon\.js\?v=(\d+)/.exec(fs.readFileSync(P(f), "utf8")) || [, null])[1]);
    rec("every page loading tech-icon.js agrees on its version", new Set(vers).size === 1, { pages, vers });
    rec("army.js is versioned", /army\.js\?v=\d+/.test(HTML), "no version");

    console.log("\n[back-out] take the explicit key away again");
    {
      // Without the key the browser falls back to the technology rule, which is the bug: measured above,
      // that resolves for a minority of vanilla equipment, and the rest silently show the placeholder.
      const reverted = ARMY.replace(/size: "lg", key: r\.iconKey \|\| ""/, 'size: "lg"');
      rec("the control patched cleanly", reverted !== ARMY, "anchor did not match");
      rec("…and the browser then asks for no explicit sprite", !/key: r\.iconKey/.test(reverted), "key survived");
      const icoReverted = ICO.replace(/el\.dataset\.key \|\| /, "");
      rec("…and the helper would go back to deriving GFX_<id>_medium",
        !/el\.dataset\.key/.test(icoReverted.replace(/data-key="/g, "")), "still reads data-key");
    }

    console.log("\n[still valid]");
    for (const [n, src] of [["army.js", ARMY], ["tech-icon.js", ICO]]) {
      rec(`${n} parses`, (() => { try { new Function(src); return true; } catch (e) { return String(e.message); } })() === true,
        (() => { try { new Function(src); return "ok"; } catch (e) { return String(e.message); } })());
    }

    console.log(`\n=== equipment browser: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  }
})();
