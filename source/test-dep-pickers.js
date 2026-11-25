// Regression test: pickers routed through getActiveRoots() must include declared-dependency
// (base-mod) content when editing an add-on. Without dependency resolution, an MD submod's
// equipment/resource/ideology pickers would show only vanilla — wrong, and a source of broken
// references. Covers the scanHoi4ScriptKeys + scanHoi4Ideologies paths (6 getActiveRoots callers).
const http = require("http");
const fs = require("fs");
const os = require("os");
const pathMod = require("path");
const serverMod = require("./server.js");
const { createApp } = serverMod;

const HELLENIC = pathMod.join(os.homedir(), "OneDrive", "Documents", "Paradox Interactive", "Hearts of Iron IV", "mod", "hellenic_ascendancy");
const PORT = 3498;

// A synthetic MD add-on with NO history of its own — for the GRE-resolution assertions. (The real
// Hellenic mod now ships its own GRE history, so it can't test "an add-on with no history resolves
// to the dependency's GRE".)
const SYNTH = fs.mkdtempSync(pathMod.join(os.tmpdir(), "novamod-deptest-"));
fs.writeFileSync(pathMod.join(SYNTH, "descriptor.mod"), 'name="Dep Test Addon"\ndependencies={\n\t"Millennium Dawn: A Modern Day Mod"\n}\n', "utf8");

function getJson(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port: PORT, path }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => { try { resolve(JSON.parse(body)); } catch (e) { reject(new Error("Bad JSON: " + body.slice(0, 200))); } });
    }).on("error", reject);
  });
}

(async () => {
  const app = createApp();
  const server = app.listen(PORT, "127.0.0.1");
  await new Promise((r) => server.on("listening", r));
  let pass = 0, fail = 0;
  const check = (name, cond, extra) => {
    if (cond) { pass++; console.log("  PASS", name); }
    else { fail++; console.log("  FAIL", name, extra != null ? "→ " + extra : ""); }
  };
  const asArr = (x) => (Array.isArray(x) ? x : (x && Array.isArray(x.items) ? x.items : []));
  try {
    // --- Equipment keys (scanHoi4ScriptKeys) ---
    const equipAddon = asArr(await getJson("/api/game/equipment?modPath=" + encodeURIComponent(HELLENIC)));
    const equipVanilla = asArr(await getJson("/api/game/equipment"));
    check("equipment picker non-empty for add-on", equipAddon.length > 0, "count=" + equipAddon.length);
    const mdOnlyEquip = equipAddon.filter((x) => !equipVanilla.includes(x));
    check("add-on equipment includes MD-only content (via dependency)", mdOnlyEquip.length > 0, mdOnlyEquip.slice(0, 8).join(","));
    check("add-on equipment set is a superset of vanilla", equipAddon.length >= equipVanilla.length, `addon=${equipAddon.length} vanilla=${equipVanilla.length}`);

    // --- Ideologies (scanHoi4Ideologies) — must return REAL ideologies, not the wrapper key ---
    const ideo = asArr(await getJson("/api/game/ideologies?modPath=" + encodeURIComponent(HELLENIC)));
    check("ideology picker non-empty for add-on", ideo.length > 0, ideo.join(","));
    check("ideology picker returns real ideologies (democratic)", ideo.includes("democratic"), ideo.join(","));
    check("ideology picker does NOT return the 'ideologies' wrapper", !ideo.includes("ideologies"), ideo.join(","));

    // --- Country focus-trees directory (getActiveRoots caller) ---
    const trees = await getJson("/api/focus/country-trees?modPath=" + encodeURIComponent(HELLENIC));
    const treeList = asArr(trees.countries || trees.trees || trees);
    check("country focus-tree directory returns entries", treeList.length > 0, "count=" + treeList.length);

    // --- Idea/spirit catalog must include declared-dependency (MD) ideas ---
    const ideaCat = await getJson("/api/ideas/catalog?includeActiveMod=1&includeVanilla=1&modPath=" + encodeURIComponent(HELLENIC));
    const ideaItems = asArr(ideaCat.items);
    check("idea catalog non-empty for add-on", ideaItems.length > 0, "count=" + ideaItems.length);
    const fromMd = ideaItems.some((it) => String(it && it.sourceRoot || "").includes("2777392649"));
    check("idea catalog includes ideas from the MD dependency", fromMd, "sample=" + (ideaItems[0] && ideaItems[0].sourceRoot || "?"));
    const hasOwn = ideaItems.some((it) => String(it && it.ideaId || "") === "hel_aegean_resurgence");
    check("idea catalog still includes the add-on's own spirit", hasOwn, "");

    // --- Country start-setup resolves a base history file to copy (not a bare/empty file) ---
    // The Hellenic add-on ships no GRE history. Configuring GRE's start-setup must resolve to the
    // existing base GRE history (MD doesn't override history/, so it falls through to vanilla's
    // "GRE - Greece.txt") with inMod=false, so editing COPIES that base setup (capital, politics)
    // into the add-on rather than clobbering GRE with an empty file. Guards the country-overhaul
    // start-setup path. (The mod/dep override precedence itself is proven by the equipment/idea
    // assertions above, since MD overrides common/ but not history/.)
    const greHist = await getJson("/api/history/country-spirits?tag=GRE&modPath=" + encodeURIComponent(SYNTH));
    check("GRE start-setup resolves an existing base history file", /GRE\b.*\.txt$/i.test(String(greHist.filePath || "")), greHist.filePath || "(none)");
    // MUST resolve the DEPENDENCY's (MD's) modern-day GRE, not vanilla's 1936 file — otherwise an
    // add-on's Country Setup would copy the wrong-era base and break the country. (Regression guard
    // for the getActiveRoots dual-resolver bug.)
    check("GRE resolves to the MD dependency's history (not vanilla)", String(greHist.filePath || "").includes("2777392649"), greHist.filePath || "(none)");
    check("GRE base history is NOT yet in the add-on (so edit copies it in, preserving base setup)", greHist.inMod === false, "inMod=" + greHist.inMod);

    // --- Icon/GFX pickers: asset scans intentionally EXCLUDE dependency roots (performance) ---
    // A base mod like Millennium Dawn is ~70k files (gfx/leaders alone is 12k+ portraits); scanning
    // it on every portrait/sprite/icon request made the editor unusable whenever an add-on was
    // active. So getAssetRoots scans only [active mod, vanilla, dlc] — deps stay OUT of the heavy
    // asset walks (they remain in the cheap, cached correctness scans verified above).
    const assetRoots = serverMod.getAssetRoots(HELLENIC).map((r) => String(r).toLowerCase());
    check("getAssetRoots EXCLUDES dependency roots (perf: avoids scanning MD's 70k files)",
      !assetRoots.some((r) => r.includes("2777392649")), assetRoots.join(" | "));
    check("getAssetRoots still starts with the active mod", assetRoots[0] && assetRoots[0].includes("hellenic_ascendancy"), assetRoots[0] || "(empty)");
    // Smoke: the icon pickers still return data for the add-on (vanilla art).
    const focusSprites = (await getJson("/api/focus/sprites?modPath=" + encodeURIComponent(HELLENIC))).sprites || [];
    check("focus icon picker non-empty for add-on", focusSprites.length > 0, "count=" + focusSprites.length);
    const ideaSprites = (await getJson("/api/ideas/sprites?modPath=" + encodeURIComponent(HELLENIC))).sprites || [];
    check("idea sprite picker non-empty for add-on", ideaSprites.length > 0, "count=" + ideaSprites.length);
  } catch (e) {
    fail++; console.log("  FAIL harness error →", e.message);
  } finally {
    server.close();
    try { fs.rmSync(SYNTH, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nDEP-PICKERS TEST: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
