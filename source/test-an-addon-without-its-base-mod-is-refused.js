// ⛔ #addon-copies-vanillas-gui — "NO DEPENDENCIES" AND "DEPENDENCIES MISSING" ARE NOT THE SAME ANSWER.
//
// Four write paths materialise a research GUI into the mod by copying one from below it. Their own comment
// says why they prefer the dependency's over vanilla's: copying vanilla's research GUI into an add-on
// "would OVERRIDE the base mod's entire (heavily customized) research screen — every base-mod tech would
// then lose its grid box."
//
// resolveDependencyRootsForAssets returned [] for BOTH "this mod declares no dependencies" and "this mod
// declares Millennium Dawn and it is not installed", so the caller could not tell them apart and fell
// through to vanilla in both. Measured before the fix: an add-on declaring an absent base mod was handed a
// 153,180-byte copy of vanilla's GUI — byte-identical to what a standalone mod gets — written permanently
// into the user's mod. The damage surfaces later, when they install the base mod and the research screen is
// broken with nothing to point at.
//
// ⭐ THE CONTROLS ARE THE POINT. Refusing too broadly would break every add-on, so this pins all three
// outcomes: a standalone mod still gets vanilla's GUI, an add-on whose base mod IS installed still gets the
// BASE MOD's (proved by which file the result is closer in size to, not by assertion), and only the
// unresolvable case is refused.
//
// ⛔ SCRATCH MODS IN TEMP ONLY.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 53537;
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-nobase-appdata-"));
process.env.APPDATA = SANDBOX;
process.env.XDG_CONFIG_HOME = SANDBOX;
process.env.NOVA_APP_DATA_DIR = SANDBOX;

const { createApp } = require("./server.js");
const { stripJsComments } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
const VANILLA_GUI = path.join(GAME, "interface", "countrytechtreeview.gui");
const made = [];
function mkMod(name, extra) {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), "nova-nobase-mod-"));
  made.push(p);
  fs.writeFileSync(path.join(p, "descriptor.mod"),
    `name="${name}"\nsupported_version="1.16.*"\n${extra || ""}`, "utf8");
  return p;
}

(async () => {
  let server;
  try {
    const SERVER = stripJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));

    console.log("1. Declared and resolved are told apart");
    rec("there is a declaredDependencyNames helper", /function declaredDependencyNames\(activeRoot\)/.test(SERVER));
    rec("…and a baseGuiSourceRoots that reports what is missing",
      /function baseGuiSourceRoots\(modRoot, gameRoot\)/.test(SERVER));
    rec("…flagging ONLY declared-but-none-resolved",
      /\(declared\.length && resolved\.length === 0\) \? declared : \[\]/.test(SERVER),
      "a mod that declares nothing must keep falling back to vanilla, which is correct for it");
    // ⭐ DERIVED: every base-copy site must use it, not a hand-kept list of endpoints.
    const uses = (SERVER.match(/baseGuiSourceRoots\(modRoot, gameRoot\)/g) || []).length;
    const raws = (SERVER.match(/\[\.\.\.resolveDependencyRootsForAssets\(modRoot\), gameRoot\]/g) || []).length;
    rec("every base-copy site goes through it", uses >= 4, uses + " sites");
    rec("…and none still builds the roots by hand", raws === 0, raws + " left");
    rec("the refusal is worded in one place", /function baseModMissingError\(missing, what\)/.test(SERVER),
      "four sites throwing four different messages is how the wording drifts");

    console.log("\n2. Runtime — the three outcomes");
    if (!fs.existsSync(VANILLA_GUI)) {
      rec("a vanilla install to measure against", false, "cannot run the probes");
    } else {
      server = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
      const create = async (root) => {
        const r = await fetch(`http://127.0.0.1:${PORT}/api/research/create-custom-folder`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folderKey: "probe_tab", ledger: "army", modPath: root, name: "Probe" }),
        });
        return { status: r.status, body: await r.json() };
      };
      const guiSize = (root) => {
        const p = path.join(root, "interface", "countrytechtreeview.gui");
        return fs.existsSync(p) ? fs.statSync(p).size : 0;
      };
      const vanillaSize = fs.statSync(VANILLA_GUI).size;

      // (a) A standalone mod — no dependencies. Vanilla is the right base for it.
      const solo = mkMod("Standalone Probe", "");
      const soloRes = await create(solo);
      rec("a standalone mod still gets a research GUI", soloRes.status === 200 && guiSize(solo) > 0,
        `${soloRes.status}, ${guiSize(solo)} bytes`);

      // (b) An add-on whose base mod is NOT installed — the bug.
      const orphan = mkMod("Orphan Addon", 'dependencies={\n\t"A Mod That Is Not Installed"\n}\n');
      const orphanRes = await create(orphan);
      rec("an add-on with a missing base mod is refused", orphanRes.status === 400,
        `${orphanRes.status} ${String(orphanRes.body.error || "").slice(0, 60)}`);
      rec("…and NOTHING is written into the mod", guiSize(orphan) === 0, guiSize(orphan) + " bytes");
      rec("…and the refusal names the missing mod", /A Mod That Is Not Installed/.test(String(orphanRes.body.error || "")));
      rec("…and says what would have gone wrong",
        /override that mod's entire research screen/.test(String(orphanRes.body.error || "")),
        "a refusal a modder cannot act on is only half a fix");

      // (c) ⭐ THE CONTROL THAT MATTERS: an add-on whose base mod IS installed must still work, and copy the
      //     BASE MOD's gui. Derived from whatever is installed, and only run if a base mod ships one that
      //     DIFFERS from vanilla's — otherwise the attribution below could not tell the two apart.
      let base = null;
      try {
        for (const d of fs.readdirSync(WS)) {
          const p = path.join(WS, d);
          const gui = path.join(p, "interface", "countrytechtreeview.gui");
          if (!fs.existsSync(gui)) continue;
          let name = "";
          try { name = (/name\s*=\s*"([^"]+)"/.exec(fs.readFileSync(path.join(p, "descriptor.mod"), "utf8")) || [])[1] || ""; } catch (_) {}
          if (!name) continue;
          const size = fs.statSync(gui).size;
          if (size === vanillaSize) continue;   // indistinguishable from vanilla — useless as a fixture
          base = { name, size };
          break;
        }
      } catch (_) {}
      if (!base) {
        rec("an installed base mod shipping its own research GUI", false,
          "cannot prove the add-on path still copies the right file");
      } else {
        rec(`the fixture base mod's GUI differs from vanilla's`, base.size !== vanillaSize,
          `"${base.name}" ${base.size} vs vanilla ${vanillaSize}`);
        const addon = mkMod("Addon On Installed Base", `dependencies={\n\t"${base.name}"\n}\n`);
        const addonRes = await create(addon);
        rec("an add-on with its base mod INSTALLED still works", addonRes.status === 200,
          `${addonRes.status} ${String(addonRes.body.error || "").slice(0, 70)}`);
        const size = guiSize(addon);
        // Nova injects a container, so the copy is larger than its source; attribute by which it is NEARER.
        const dBase = Math.abs(size - base.size), dVanilla = Math.abs(size - vanillaSize);
        rec("…and it was copied from the BASE MOD, not vanilla", size > 0 && dBase < dVanilla,
          `${size} bytes — ${dBase} from the base mod, ${dVanilla} from vanilla`);
      }
    }

    console.log(`\n=== an add-on without its base mod is refused: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    if (server) { try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {} await new Promise((r) => server.close(r)); }
    // Only the scratch mods this test made, each from mkdtemp under the OS temp dir.
    try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}
    for (const p of made) { try { fs.rmSync(p, { recursive: true, force: true }); } catch (_) {} }
  }
})();
