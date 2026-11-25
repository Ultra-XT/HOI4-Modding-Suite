// #template-mod-ships-missing-textures — the starter mod from "＋New Mod" referenced three sprites that do
// not exist in HOI4, so the first mod a newcomer ever makes opened with three missing-texture boxes:
//
//   common/decisions/custom_decisions.txt  ->  icon = GFX_decision_generic
//   common/ideas/custom_ideas.txt          ->  picture = generic   (BOTH national spirits)
//
// HOI4 resolves a decision `icon` as GFX_decision_<value> then <value> verbatim, and an idea `picture` as
// GFX_idea_<picture>. Neither `GFX_decision_generic` nor `GFX_idea_generic` is a spriteType anywhere in
// vanilla — only their `_*` variants are. A DEFAULT_DECISION_ICON constant carrying exactly this lesson
// already existed a few thousand lines up; the template just never used it.
//
// This test does not hardcode the replacements. It generates a template mod and RESOLVES every sprite the
// generated files reference against the real install, so the next person to edit the template cannot
// reintroduce a plausible-looking name that does not exist.
//
// Needs a HOI4 install to resolve against; skips cleanly without one.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-template-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
let skipped = 0;
function rec(label, ok, detail) {
  checks++;
  if (ok) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

const PORT = 42229;
const app = createApp();
const server = app.listen(PORT, async () => {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/mod/create-template`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        modName: "Nova Sprite Audit", countryTag: "NVX", countryName: "Novaxia",
        capitalStateId: 64, color: "40 90 160",
      }),
    });
    const body = await r.json().catch(() => null);
    rec("the template mod was created", r.status === 200 && body && body.ok !== false, body);

    const modDir = (body && (body.modPath || body.path)) ||
      path.join(ROOT, fs.readdirSync(ROOT).find((d) => fs.statSync(path.join(ROOT, d)).isDirectory()) || "");
    rec("…and it is on disk", modDir && fs.existsSync(modDir), modDir);

    // Collect every sprite the generated mod references.
    const refs = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { walk(p); continue; }
        if (!/\.txt$/i.test(e.name)) continue;
        const txt = fs.readFileSync(p, "utf8");
        const rel = path.relative(modDir, p);
        // A decision/idea/focus `icon` — the engine tries GFX_<domain>_<value> then <value> verbatim.
        for (const m of txt.matchAll(/^\s*icon\s*=\s*([A-Za-z0-9_]+)\s*$/gm)) {
          refs.push({ rel, field: "icon", raw: m[1], candidates: [m[1], `GFX_decision_${m[1]}`, `GFX_focus_${m[1]}`] });
        }
        // An idea `picture` — resolves as GFX_idea_<picture>.
        for (const m of txt.matchAll(/^\s*picture\s*=\s*([A-Za-z0-9_]+)\s*$/gm)) {
          refs.push({ rel, field: "picture", raw: m[1], candidates: [`GFX_idea_${m[1]}`, m[1]] });
        }
      }
    };
    if (modDir && fs.existsSync(modDir)) walk(modDir);
    rec("the generated mod references at least one sprite", refs.length > 0, refs.length);

    // Resolve against the real install: a spriteType declared with that exact name in any interface/*.gfx.
    const gameRoot = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
    const ifaceDir = path.join(gameRoot, "interface");
    if (!fs.existsSync(ifaceDir)) {
      skipped++;
      console.log("  skip sprite resolution  (no HOI4 install on this machine)");
    } else {
      const declared = new Set();
      const collect = (dir) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          const p = path.join(dir, e.name);
          if (e.isDirectory()) { collect(p); continue; }
          if (!/\.gfx$/i.test(e.name)) continue;
          let txt = "";
          try { txt = fs.readFileSync(p, "latin1"); } catch (_) { continue; }
          for (const m of txt.matchAll(/\bname\s*=\s*"([^"]+)"/g)) declared.add(m[1].toLowerCase());
        }
      };
      collect(ifaceDir);
      rec("vanilla's sprite declarations were read", declared.size > 1000, declared.size);

      // The negative control: the names this defect was about must genuinely be absent, or "everything
      // resolves" would be trivially true because the resolver is too permissive.
      rec("GFX_decision_generic really is absent from vanilla", !declared.has("gfx_decision_generic"), "present!");
      rec("GFX_idea_generic really is absent from vanilla", !declared.has("gfx_idea_generic"), "present!");

      const broken = refs.filter((x) => !x.candidates.some((c) => declared.has(String(c).toLowerCase())));
      rec("every sprite the starter mod references resolves in vanilla", broken.length === 0,
        broken.map((b) => `${b.rel}: ${b.field} = ${b.raw}`));
    }

    console.log(`\n=== template mod sprites: ${checks} checks, ${fails.length} failed, ${skipped} skipped ===`);
    if (fails.length) {
      fails.forEach((f) => console.log("   FAILED: " + f));
      process.exitCode = 1;
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
server.on("error", (e) => {
  console.error("listen error:", e.message);
  process.exitCode = 1;
});
