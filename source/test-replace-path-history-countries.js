// #replace-path-history-countries — NAME THE DIRECTORY, OR THE replace_path BRANCH NEVER RUNS.
//
// Found by a multi-agent hunt over the makers, then reproduced by hand before it was believed.
//
// `getActiveRoots` takes a subpath and only then consults `chainReplacesPath`. `findCountryHistoryFile`
// called it bare, so the game root was always included — and for a total conversion whose descriptor declares
// `replace_path = "history/countries"`, where HOI4 loads NO vanilla country histories at all, Nova still
// reported vanilla's file as the country's history: its capital, stability, politics, popularities and
// spirits, none of which exist in that mod's game.
//
// Worse on a write, because every reader and writer funnels through this one function. A single set-startup
// call dropped 57.6 KB of vanilla Germany into a total conversion — `set_oob = "GER_1936"`,
// `recruit_character = GER_adolf_hitler` and the rest — into a mod that had deliberately replaced the whole
// directory.
//
// Verified CONTROL-FIRST and in BOTH DIRECTIONS, which is what this bug family demands: two scratch mods
// identical but for the one descriptor line. Without it vanilla must still be found (the game loads it);
// with it vanilla must not be offered at all.
//
// Same family as [[replace-path-not-honoured-2026-08-06]] — #replace-path.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-rphist-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

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
  const p = path.join(__dirname, `.ctl-rphist-${process.pid}-${label}.js`);
  fs.writeFileSync(p, wasCrlf ? out.replace(/\n/g, "\r\n") : out, "utf8");
  ctlFiles.push(p);
  try { return { createApp: require(p).createApp }; } catch (e) { return { error: String(e && e.message) }; }
}

const VANILLA_HIST = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/history/countries";
let seq = 0;
function mkMod(replace) {
  const dir = path.join(ROOT, (replace ? "tc" : "plain") + ++seq);
  fs.mkdirSync(path.join(dir, "history", "countries"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"),
    'name="m"\nsupported_version="1.19.*"\n' + (replace ? 'replace_path="history/countries"\n' : ""), "utf8");
  return dir;
}
const histFiles = (dir) => { try { return fs.readdirSync(path.join(dir, "history", "countries")); } catch (_) { return []; } };
const isVanillaPath = (p) => !!p && /Hearts of Iron IV[\\/]history[\\/]countries/i.test(p);

let PORT = 47400;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      get: (u) => fetch(`http://127.0.0.1:${PORT}${u}`).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      post: (u, body) => fetch(`http://127.0.0.1:${PORT}${u}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}

(async () => {
  let api = null;
  try {
    if (!fs.existsSync(VANILLA_HIST)) {
      console.log("  --   vanilla not installed; this test needs a base-game country history. Skipping.");
      console.log("\n=== replace_path history/countries: skipped ===");
      return;
    }
    const vanillaGer = fs.readdirSync(VANILLA_HIST).find((f) => /^GER /.test(f));
    console.log("\n[ground truth] the base game has a Germany history worth several tens of KB");
    rec("vanilla ships GER's history", !!vanillaGer, vanillaGer);
    const vanillaBytes = vanillaGer ? fs.statSync(path.join(VANILLA_HIST, vanillaGer)).size : 0;
    rec("…and it is substantial, so copying it in is not a trivial mistake", vanillaBytes > 20000, vanillaBytes);
    console.log(`  --   measured: ${vanillaGer} is ${vanillaBytes} bytes`);

    api = await serve(createApp());

    console.log("\n[control first] WITHOUT replace_path, vanilla must still be found — the game loads it");
    const plain = mkMod(false);
    const dPlain = await api.get(`/api/history/country-details?tag=GER&modPath=${encodeURIComponent(plain)}`);
    rec("the country's history is found", !!dPlain.b.filePath, dPlain.b);
    rec("…in the base game, since the mod has none of its own", isVanillaPath(dPlain.b.filePath), dPlain.b.filePath);
    rec("…and its details are read", !!dPlain.b.details, dPlain.b.details);
    rec("…and reported as not in the mod", dPlain.b.inMod === false, dPlain.b.inMod);

    console.log("\n[the other direction] WITH replace_path, vanilla must not be offered at all");
    const tc = mkMod(true);
    const dTc = await api.get(`/api/history/country-details?tag=GER&modPath=${encodeURIComponent(tc)}`);
    rec("no vanilla file is reported as this country's history", !isVanillaPath(dTc.b.filePath), dTc.b.filePath);
    rec("…so the editor does not show a history the game will never load",
      !dTc.b.details && !dTc.b.filePath, { details: !!dTc.b.details, filePath: dTc.b.filePath });

    console.log("\n[the write path] must not drop vanilla's file into a mod that replaced the directory");
    const w = await api.post("/api/history/set-startup",
      { modPath: tc, tag: "GER", itemType: "spirit", itemId: "nua_test_spirit", active: true });
    rec("the write succeeds", w.b && w.b.ok === true, w.b);
    const files = histFiles(tc);
    rec("…writing exactly one file", files.length === 1, files);
    const written = files.length ? fs.readFileSync(path.join(tc, "history", "countries", files[0]), "utf8") : "";
    rec("…a fresh one, not a copy of vanilla's", written.length < 2000, { bytes: written.length, vanillaBytes });
    rec("…carrying the spirit that was asked for", /nua_test_spirit/.test(written), written.slice(0, 200));
    rec("…and none of vanilla Germany's content", !/recruit_character|set_oob\s*=/.test(written), written.slice(0, 300));
    api.stop(); api = null;

    console.log("\n[back-out] ask for the roots without naming the directory");
    {
      const built = controlApp("bareroots", [[
        '    const roots = getActiveRoots(modRoot, "history/countries");',
        "    const roots = getActiveRoots(modRoot);"]]);
      if (built.error) rec("the control patched cleanly", false, built.error);
      else {
        const capi = await serve(built.createApp());
        try {
          const ctc = mkMod(true);
          const cd = await capi.get(`/api/history/country-details?tag=GER&modPath=${encodeURIComponent(ctc)}`);
          rec("…the control reports vanilla's file for a mod that replaced the directory",
            isVanillaPath(cd.b.filePath), cd.b.filePath);
          const cw = await capi.post("/api/history/set-startup",
            { modPath: ctc, tag: "GER", itemType: "spirit", itemId: "nua_test_spirit", active: true });
          const cfiles = histFiles(ctc);
          const ctext = cfiles.length ? fs.readFileSync(path.join(ctc, "history", "countries", cfiles[0]), "utf8") : "";
          rec("…and the write drops a full copy of vanilla Germany into it",
            ctext.length > 20000 && /recruit_character/.test(ctext),
            { bytes: ctext.length, hasRecruits: /recruit_character/.test(ctext), save: cw.b });
          // …and the control must still behave correctly for a mod with NO replace_path, or it proves nothing.
          const cplain = mkMod(false);
          const cdp = await capi.get(`/api/history/country-details?tag=GER&modPath=${encodeURIComponent(cplain)}`);
          rec("…while an ordinary mod is unaffected either way, so replace_path is the only variable",
            isVanillaPath(cdp.b.filePath), cdp.b.filePath);
        } finally { capi.stop(); }
      }
    }

    console.log(`\n=== replace_path history/countries: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (api) api.stop(); } catch (_) {}
    for (const p of ctlFiles) { try { fs.unlinkSync(p); } catch (_) {} }
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
