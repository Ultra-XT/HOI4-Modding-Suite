// ⛔ #the-army-editor-opens-the-1939-army — EDITS WENT INTO A FILE THE CAMPAIGN NEVER LOADS.
//
// The Army tool resolves which units file to edit by collecting every `set_oob` in a country's history and
// then picking whichever file holds the most land content. For Germany that is GER_1939 — 122 divisions,
// more than the 1936 army — so clicking Germany opened, and saved into, history/units/GER_1939.txt.
//
// Vanilla's "GER - Germany.txt" wires the 1936 army at TOP LEVEL and the 1939 army inside `1939.1.1 = { }`.
// The wiki (Country modding) is explicit that a dated block "will only apply on the start dates that are
// strictly later than the defined timestamp", so a 1936 campaign — the default bookmark, and the one nearly
// everyone plays — never executes it. And on an install with No Step Back the 1939 campaign loads
// GER_1939_nsb, not GER_1939. The file being edited was therefore loaded by NEITHER bookmark.
//
// ⚠️ Only DATED blocks are excluded, not all nested ones. Vanilla wires the 1936 army inside a DLC
// conditional:
//     if = { limit = { NOT = { has_dlc = "No Step Back" } } set_oob = "GER_1936" }
//     else = { set_oob = "GER_1936_nsb" }
// so blanking every nested group would discard the very thing being looked for. That distinction is what
// this test is mostly about.
"use strict";

// #a-bare-test-run-writes-into-the-real-app-data — FIRST: run bare, the server this starts inherits the sandbox.
require("./safe-write.js");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const PORT = Number(process.env.NOVA_TEST_PORT || 53691);
let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 300) : "")); }
};

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
if (!fs.existsSync(path.join(GAME, "history", "countries"))) {
  console.log("  ..   skipped: the base game is not installed at the expected path");
  console.log("\nPASSED 0/0 (skipped)");
  process.exitCode = 0;
} else {
  const roots = [];
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-armyoob-")); roots.push(mod);
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'version="1.0"\nname="Army OOB"\n', "utf8");
  const appdata = fs.mkdtempSync(path.join(os.tmpdir(), "nova-armyoob-ad-")); roots.push(appdata);

  const srv = spawn(process.execPath, [path.join(__dirname, "server.js")], {
    env: Object.assign({}, process.env, {
      PORT: String(PORT), APPDATA: appdata, NOVA_APP_DATA_DIR: appdata, NOVA_HOME_DIR: appdata,
    }),
    stdio: ["ignore", "pipe", "pipe"],
  });
  srv.stdout.on("data", () => {}); srv.stderr.on("data", () => {});

  (async () => {
    try {
      let up = false;
      for (let i = 0; i < 160; i++) {
        try { await fetch(`http://127.0.0.1:${PORT}/`); up = true; break; } catch (_) { await new Promise((r) => setTimeout(r, 250)); }
      }
      if (!up) { ok(false, "server came up on " + PORT); return; }
      const army = async (tag) => (await fetch(`http://127.0.0.1:${PORT}/api/army?modPath=${encodeURIComponent(mod)}&tag=${tag}`)).json();

      console.log("\n-- ⭐ every major opens the army its default campaign loads --");
      {
        // The 1936 bookmark is the default and by far the most played. Whatever else is true, the tool must
        // not open a file that bookmark cannot see.
        for (const tag of ["GER", "USA", "SOV", "ITA", "JAP", "FRA"]) {
          const j = await army(tag);
          ok(j && typeof j.file === "string" && /_1936/.test(j.file),
            `${tag} opens a 1936 order of battle (${j && j.file})`, j && j.file);
          ok(!/_1939/.test(String(j && j.file)), `…and not the 1939 one`, j && j.file);
        }
      }

      console.log("\n-- ⭐ a DLC-conditional 1936 army is still found --");
      {
        // This is the half a naive "strip all nested blocks" fix would break: vanilla wires the 1936 army
        // inside an if/else on has_dlc. ENG's is a La Résistance variant.
        const j = await army("ENG");
        ok(j && /_1936/.test(String(j.file)), `ENG opens a 1936 army (${j && j.file})`, j && j.file);
        ok(j && /LaR|nsb|1936/.test(String(j.file)),
          "…including when it lives inside a has_dlc conditional", j && j.file);
      }

      console.log("\n-- a country wired ONLY from a dated block still opens something --");
      {
        // Editing something beats editing nothing: if a mod arms a country only from a dated block, the
        // dated name is all there is, and the tool must fall back to it rather than showing an empty editor.
        const dir = path.join(mod, "history", "countries");
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, "TST - Test.txt"),
          'capital = 1\n1939.1.1 = {\n\tset_oob = "TST_late"\n}\n', "utf8");
        const units = path.join(mod, "history", "units");
        fs.mkdirSync(units, { recursive: true });
        fs.writeFileSync(path.join(units, "TST_late.txt"),
          'division_template = { name = "Inf" regiments = { infantry = { x = 0 y = 0 } } }\nunits = { division = { name = "1" location = 1 division_template = "Inf" } }\n', "utf8");
        const j = await army("TST");
        ok(j && String(j.file) === "TST_late.txt",
          "the dated name is used when there is no undated one", j && j.file);
      }

      console.log("\n-- ⭐ CONTROL: the old rule really did pick 1939 --");
      {
        // Reconstruct the old behaviour — every set_oob, biggest file wins — on vanilla's own Germany, to
        // show the fix is load-bearing rather than a no-op.
        const hist = fs.readFileSync(path.join(GAME, "history", "countries", "GER - Germany.txt"), "utf8")
          .replace(/#.*$/gm, "");
        const all = [...hist.matchAll(/(?:^|[^_A-Za-z])(?:set_oob|oob)\s*=\s*(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))/gi)]
          .map((m) => (m[1] || m[2]).trim());
        ok(all.some((n) => /_1939/.test(n)),
          "vanilla's GER history does name a 1939 order of battle", all);
        ok(all.some((n) => /_1936/.test(n)), "…as well as the 1936 one", all);
        const sizeOf = (n) => { try { return fs.statSync(path.join(GAME, "history", "units", n + ".txt")).size; } catch (_) { return 0; } };
        const biggest = all.slice().sort((a, b) => sizeOf(b) - sizeOf(a))[0];
        ok(/_1939/.test(String(biggest)),
          `picking the biggest file gives ${biggest} — which is what the tool used to do`, biggest);
      }
    } catch (e) {
      ok(false, "threw: " + e.message + "\n" + e.stack);
    } finally {
      try { srv.kill(); } catch (_) {}
      setTimeout(() => { try { srv.kill("SIGKILL"); } catch (_) {} }, 800);
      for (const r of roots) { try { fs.rmSync(r, { recursive: true, force: true }); } catch (_) { /* scratch only */ } }
      console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
      process.exitCode = fail ? 1 : 0;
      setTimeout(() => process.exit(fail ? 1 : 0), 1200);
    }
  })();
}
