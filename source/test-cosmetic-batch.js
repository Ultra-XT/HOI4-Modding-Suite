// #cosmetic-batch — five ship-readiness defects that each reported the wrong thing rather than breaking.
// None crashed; all five told the caller something untrue, or refused work it should have done.
//
//  #33 a .tga building icon was rejected by the upload filter, though .tga is a first-class HOI4 image
//      format (every vanilla portrait ships as one) and the reader already handles it.
//  #30 /api/equipment/archetype-missions wrote allow_mission_type onto LAND archetypes. The game ignores it
//      there — but public/army.js's isAirEquip() falls back to "has any effective mission", so one call
//      permanently reclassified a land archetype as aircraft inside Nova itself.
//  #29 the army OOB save set oobWired = true even when it had deliberately SKIPPED wiring, because the
//      country already loads a different land OOB. Skipping is right; claiming success for it is not.
//  #34 /api/vanilla/idea-tokens scanned for identifiers heuristically and returned EFFECT names — the
//      "which vanilla idea does this refer to" picker offered add_ideas, hidden_effect and friends as ideas.
//  #32 four client files fell back to gfx/interface/ideas/idea_generic.png, which exists in NO HOI4 install.
//      The fallback for a missing image was itself a missing image. idea_unknown.dds is the real one, and
//      characters.html was already using it as a primary src.
//
// Hermetic: fake mod under tmpdir. The two vanilla-facing checks (#34, #32) need a real game root and skip
// cleanly without one.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-cosmetic-"));
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
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300));
  }
}
function skip(label, why) { skipped++; console.log("  skip " + label + "  (" + why + ")"); }

const MOD = path.join(ROOT, "cosmod");
fs.mkdirSync(path.join(MOD, "common", "units", "equipment"), { recursive: true });
fs.mkdirSync(path.join(MOD, "history", "countries"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="CosMod"\nsupported_version="1.18.*"\n', "utf8");

// One land archetype and one aircraft archetype, so the guard can be shown to refuse the first and allow
// the second — a guard that refuses everything would pass a one-sided test.
fs.writeFileSync(path.join(MOD, "common", "units", "equipment", "nua_eq.txt"), [
  "equipments = {",
  "\tnua_at_equipment = {",
  "\t\tyear = 1936",
  "\t\tis_archetype = yes",
  "\t\ttype = anti_tank",
  "\t\tinterface_category = interface_category_land",
  "\t\tbuild_cost_ic = 4",
  "\t}",
  "\tnua_fighter_equipment = {",
  "\t\tyear = 1936",
  "\t\tis_archetype = yes",
  "\t\ttype = fighter",
  "\t\tinterface_category = interface_category_air",
  "\t\tallow_mission_type = { air_superiority }",
  "\t\tbuild_cost_ic = 20",
  "\t}",
  "}",
  "",
].join("\n"), "utf8");

// A country whose history ALREADY points at a different land OOB — the exact shape #29 mis-reported.
fs.writeFileSync(path.join(MOD, "history", "countries", "NUA - Nova Audit.txt"), [
  'oob = "NUA_1936_existing"',
  "capital = 1",
  "",
].join("\n"), "utf8");

function makePng() {
  const t = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = t[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (ty, d) => {
    const l = Buffer.alloc(4); l.writeUInt32BE(d.length);
    const td = Buffer.concat([Buffer.from(ty, "ascii"), d]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td));
    return Buffer.concat([l, td, c]);
  };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(4, 0); ih.writeUInt32BE(4, 4); ih[8] = 8; ih[9] = 6;
  const raw = Buffer.concat(Array.from({ length: 4 }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(16, 180)])));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ih), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
  ]);
}

// A minimal uncompressed 24bpp true-colour TGA — the shape every vanilla portrait uses.
function makeTga(w = 4, h = 4) {
  const head = Buffer.alloc(18);
  head[2] = 2;                       // image type 2 = uncompressed true-colour
  head.writeUInt16LE(w, 12);
  head.writeUInt16LE(h, 14);
  head[16] = 24;                     // bits per pixel
  return Buffer.concat([head, Buffer.alloc(w * h * 3, 120)]);
}

const PORT = 42217;
const app = createApp();
const server = app.listen(PORT, async () => {
  const post = async (route, body) => {
    const r = await fetch(`http://127.0.0.1:${PORT}${route}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const get = async (route) => {
    const r = await fetch(`http://127.0.0.1:${PORT}${route}`);
    const ct = r.headers.get("content-type") || "";
    return { status: r.status, ct, body: ct.includes("json") ? await r.json().catch(() => null) : null };
  };

  try {
    // ---------------------------------------------------------------- #33
    console.log("\n[#33] a .tga sprite is served, and served as something a browser can draw");
    {
      const tgaPath = path.join(MOD, "gfx", "nua_portrait.tga");
      fs.mkdirSync(path.dirname(tgaPath), { recursive: true });
      fs.writeFileSync(tgaPath, makeTga());
      const r = await fetch(
        `http://127.0.0.1:${PORT}/api/buildings/icon-file?path=${encodeURIComponent(tgaPath)}`
      );
      const ct = r.headers.get("content-type") || "";
      // Read the body ONCE — a second read on the same Response throws and the failure detail is lost.
      const buf = Buffer.from(await r.arrayBuffer());
      const bodyText = ct.includes("json") ? buf.toString("utf8") : "";
      rec("the request is not refused", r.status === 200, r.status + " " + bodyText);
      rec("…not with 'Unsupported asset type'", !/unsupported asset type/i.test(bodyText), bodyText);
      // The half-fix would send the raw .tga, which renders as a broken image just the same.
      rec("…and it comes back as PNG, not raw TGA", /image\/png/.test(ct), ct);
      rec("…with real PNG bytes", buf.length > 8 && buf[0] === 0x89 && buf.slice(1, 4).toString() === "PNG",
        buf.slice(0, 8).toString("hex"));
    }

    // ---------------------------------------------------------------- #30
    console.log("\n[#30] allow_mission_type is refused on a land archetype");
    {
      const land = await post("/api/equipment/archetype-missions", {
        modPath: MOD, id: "nua_at_equipment", missions: ["cas", "air_superiority"],
      });
      rec("the land archetype is refused", land.body && land.body.ok === false, land.body);
      rec("…and the message says it is not aircraft", /not aircraft/i.test(String((land.body && land.body.error) || "")),
        land.body && land.body.error);
      const after = fs.readFileSync(path.join(MOD, "common", "units", "equipment", "nua_eq.txt"), "utf8");
      const atBlock = after.slice(after.indexOf("nua_at_equipment"), after.indexOf("nua_fighter_equipment"));
      rec("…and nothing was written to the land block", !/allow_mission_type/.test(atBlock), atBlock.slice(0, 200));

      // The other half: the guard must still let real aircraft through, or it is just a blanket refusal.
      const air = await post("/api/equipment/archetype-missions", {
        modPath: MOD, id: "nua_fighter_equipment", missions: ["cas"],
      });
      rec("the aircraft archetype is still accepted", air.body && air.body.ok === true, air.body);
      const after2 = fs.readFileSync(path.join(MOD, "common", "units", "equipment", "nua_eq.txt"), "utf8");
      rec("…and its missions were actually rewritten", /allow_mission_type\s*=\s*\{[^}]*\bcas\b/.test(after2),
        after2.slice(after2.indexOf("nua_fighter_equipment"), after2.indexOf("nua_fighter_equipment") + 320));
    }

    // ---------------------------------------------------------------- #29
    console.log("\n[#29] a skipped OOB wiring is not reported as wired");
    {
      const r = await post("/api/army/save", {
        modPath: MOD, tag: "NUA", fileName: "NUA_nova.txt",
        templates: [{ name: "Nova Infantry", regiments: [{ unit: "infantry", x: 0, y: 0 }], support: [], _dirty: true }],
        divisions: [{ name: "1. Nova Div", location: 1, template: "Nova Infantry", _dirty: true }],
      });
      rec("the save itself succeeded", r.body && r.body.ok === true, r.body);
      rec("oobWired is FALSE (the country already loads another OOB)", r.body && r.body.oobWired === false, r.body);
      rec("…and a note explains why", /already loads/i.test(String((r.body && r.body.oobNote) || "")), r.body && r.body.oobNote);
      rec("…naming the OOB it kept", /NUA_1936_existing/.test(String((r.body && r.body.oobNote) || "")), r.body && r.body.oobNote);
      const hist = fs.readFileSync(path.join(MOD, "history", "countries", "NUA - Nova Audit.txt"), "utf8");
      rec("…and the existing history was left alone", (hist.match(/^\s*oob\s*=/gm) || []).length === 1, hist.slice(0, 200));
    }

    // ---------------------------------------------------------------- #34
    console.log("\n[#34] the vanilla idea-token list holds ideas, not effects");
    {
      const r = await get("/api/vanilla/idea-tokens");
      const ideas = (r.body && r.body.ideas) || [];
      if (!ideas.length) {
        // An empty list is only a legitimate skip when vanilla genuinely isn't installed. If it IS installed,
        // an empty list is a regression — and skipping on it would let the whole section pass vacuously,
        // which is exactly how the first control run for this defect fooled me.
        const vanillaProbe = await get("/api/vanilla-ui?rel=gfx/interface/ideas/idea_entry_bg.dds");
        if (vanillaProbe.status === 200) rec("vanilla is installed, so the idea list must not be empty", false, r.body);
        else skip("vanilla idea tokens", "no game root on this machine");
      } else {
        const ids = new Set(ideas.map((x) => (typeof x === "string" ? x : x && x.id)));
        // Effect keywords that the old heuristic scraped out of idea bodies. None is an idea.
        const effects = ["add_ideas", "remove_ideas", "hidden_effect", "swap_ideas", "add_timed_idea",
          "country_event", "set_country_flag", "if", "else", "random_list"];
        const leaked = effects.filter((e) => ids.has(e));
        rec("no effect keyword is offered as an idea", leaked.length === 0, leaked);
        // …and it must still be a real list, or "no effects" is trivially satisfied by returning nothing.
        rec("real vanilla ideas are still present",
          ["great_depression", "civilian_economy", "volunteer_only"].every((x) => ids.has(x)),
          [...ids].slice(0, 12));
        rec("the list is substantial (structural scan, not a stub)", ideas.length > 1000, ideas.length);
      }
    }

    // ---------------------------------------------------------------- #28
    console.log("\n[#28] a font the mod does not ship gets an actionable error, not a raw ENOENT");
    {
      // Reachable with a real mod, not just by an API caller: the client passes the mod's AUTHORED textbox
      // font through here, so a tree naming a font it doesn't ship lands exactly on this path.
      const r = await get(`/api/research/glyph-text?text=Nova&font=nua_missing_font&modPath=${encodeURIComponent(MOD)}`);
      const msg = String((r.body && r.body.error) || "");
      if (r.status === 501) {
        skip("missing-font message", "sharp unavailable on this machine");
      } else {
        rec("it fails rather than pretending", r.status >= 400, r.status);
        rec("…and does not leak a raw ENOENT", !/ENOENT|no such file/i.test(msg), msg);
        rec("…it names the font", /nua_missing_font/.test(msg), msg);
        rec("…and says where to look", /\.gfx|bitmapfont/i.test(msg), msg);
      }
    }

    // ---------------------------------------------------------------- #32
    console.log("\n[#32] the hardcoded image fallback resolves");
    {
      // The bug is entirely client-side, so assert on the shipped client text: no file may still point at the
      // .png that exists nowhere.
      const pub = path.join(__dirname, "public");
      const stale = fs.readdirSync(pub)
        .filter((f) => /\.(js|html)$/.test(f))
        .filter((f) => fs.readFileSync(path.join(pub, f), "utf8").includes("ideas/idea_generic.png"));
      rec("no client file references idea_generic.png", stale.length === 0, stale);

      // And the replacement must actually be servable.
      const r = await get("/api/vanilla-ui?rel=gfx/interface/ideas/idea_unknown.dds");
      if (r.status === 404 && !/Hearts of Iron IV/i.test(String(process.env.HOI4_GAME_ROOT || ""))) {
        // Distinguish "no game installed" from "the endpoint rejects it" — only the latter is a defect.
        const probe = await get("/api/vanilla-ui?rel=gfx/interface/ideas/idea_entry_bg.dds");
        if (probe.status === 404) skip("fallback image is servable", "no game root on this machine");
        else rec("fallback image is servable", r.status === 200, r.status);
      } else {
        rec("fallback image is servable", r.status === 200, r.status);
      }
    }

    console.log(`\n=== cosmetic batch: ${checks} checks, ${fails.length} failed, ${skipped} skipped ===`);
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
