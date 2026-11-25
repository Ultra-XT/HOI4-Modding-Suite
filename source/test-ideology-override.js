// #ideology-picker-ignores-override — the character ideology picker offered sub-ideologies the active mod
// does not have, under a subtitle reading "The sub-ideologies in your active mod".
//
// scanLeaderIdeologies looped over game root + dependencies + mod and unioned every `types = { … }` key it
// found. HOI4 does not work that way for common/ files: a later-loading mod that ships a file with the SAME
// BASENAME replaces it wholesale. Millennium Dawn ships its own common/ideologies/00_ideologies.txt defining
// 24 sub-ideologies — none of them despotism, nazism or marxism — yet the picker offered 41, because the base
// game's 00_ideologies.txt kept contributing its 17. The save's validator accepted them from the same list, so
// a leader could be given an ideology the mod does not define.
//
// Fix: resolve files by basename across the root chain first (later root wins), then parse only the winners.
//
// The other direction matters just as much: a mod that ships no ideologies file of its own must still see the
// full base-game list, or the picker would go empty for almost every mod. Both are pinned below.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-ideo-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const mk = (name, files) => {
  const M = path.join(ROOT, name);
  fs.mkdirSync(path.join(M, "common", "ideologies"), { recursive: true });
  fs.writeFileSync(path.join(M, "descriptor.mod"), `name="${name}"\nsupported_version="1.18.*"\n`);
  Object.entries(files || {}).forEach(([f, body]) => fs.writeFileSync(path.join(M, "common", "ideologies", f), body, "utf8"));
  return M;
};
const IDEO = (pairs) => "ideologies = {\n" + pairs.map(([g, subs]) =>
  `\t${g} = {\n\t\ttypes = {\n` + subs.map((s) => `\t\t\t${s} = {}\n`).join("") + "\t\t}\n\t}\n").join("") + "}\n";

// (1) replaces vanilla's file by basename
const OVERRIDE = mk("overrider", { "00_ideologies.txt": IDEO([["neutrality", ["conservatism", "liberalism"]], ["communism", ["socialism"]]]) });
// (2) ships no ideologies file at all — must inherit the base game's
const PLAIN = mk("plain", {});
// (3) ships an ADDITIONAL file under a different basename — must ADD to the base game's, not replace
const EXTRA = mk("extra", { "zz_nova_ideologies.txt": IDEO([["neutrality", ["nova_technocracy"]]]) });

const PORT = 40001, app = createApp();
const server = app.listen(PORT, async () => {
  const get = (mod) => fetch(`http://127.0.0.1:${PORT}/api/game/leader-ideologies?modPath=${encodeURIComponent(mod)}`)
    .then((r) => r.json())
    .then((j) => { const arr = Array.isArray(j) ? j : (j.ideologies || j.items || []); return arr.map((x) => (x && x.type) || x); });
  try {
    // ── the override case ────────────────────────────────────────────────────────────────────────
    const over = await get(OVERRIDE);
    ok("the overriding mod's own sub-ideologies are offered", ["conservatism", "liberalism", "socialism"].every((t) => over.includes(t)), over);
    ok("…and ONLY those", over.length === 3, over);
    ok("…so vanilla's despotism is gone", !over.includes("despotism"), over);
    ok("…nazism too", !over.includes("nazism"), over);
    ok("…and marxism", !over.includes("marxism"), over);

    // ── a mod with no ideologies file must still see the base game's ─────────────────────────────
    const plain = await get(PLAIN);
    ok("a mod that ships no ideologies file still gets a list", plain.length > 0, plain.length);
    ok("…which is the base game's", plain.includes("despotism") || plain.includes("nazism"), plain.slice(0, 12));
    ok("…and is bigger than the overriding mod's", plain.length > over.length, { plain: plain.length, over: over.length });

    // ── a differently-named file ADDS rather than replaces ───────────────────────────────────────
    const extra = await get(EXTRA);
    ok("a file with a NEW basename adds its sub-ideology", extra.includes("nova_technocracy"), extra.slice(0, 12));
    ok("…without dropping the base game's", extra.includes("despotism") || extra.includes("nazism"), extra.slice(0, 12));
    ok("…so it is strictly larger than the plain mod's", extra.length === plain.length + 1, { extra: extra.length, plain: plain.length });

    // ── the real corpus, read-only ───────────────────────────────────────────────────────────────
    const MD = "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649";
    if (fs.existsSync(path.join(MD, "common", "ideologies", "00_ideologies.txt"))) {
      const md = await get(MD);
      ok("Millennium Dawn overrides 00_ideologies.txt", true);
      ok("…so its picker no longer offers vanilla despotism", !md.includes("despotism"), md.slice(0, 14));
      ok("…nor nazism", !md.includes("nazism"), md.slice(0, 14));
      ok("…while its own conservatism is there", md.includes("conservatism"), md.slice(0, 14));
      ok("…and the list shrank to roughly what MD defines", md.length <= 30, md.length);
    } else { console.log("  --  MD not present; skipping the corpus check"); }

    // ── ⭐ THE SIBLING SCANNER — same rule, same files, and it never adopted the fix ─────────────
    //
    // Everything above tests scanLeaderIdeologies, which feeds the character/leader picker with SUB-
    // ideologies. scanHoi4Ideologies feeds /api/game/ideologies with the TOP-LEVEL ones (democratic,
    // communism, …) and read the very same directory with the very same union bug — it honoured
    // replace_path but not the half of the rule that needs no descriptor line at all. Vanilla ships exactly
    // one 00_ideologies.txt, and EVERY installed total conversion ships its own at that same relative path.
    // Measured: Novum Vexillum declares 12 and Old World Blues 4, and the union handed each of them
    // vanilla's democratic/communism/fascism/neutrality on top — for OWB (whose four are elites,
    // intellectuals, people, ruler) that is half the picker listing ideologies the game does not have, and
    // a country assigned `ideology = democratic` there has no such ideology. #ideology-union-offers-dead
    const top = (mod) => fetch(`http://127.0.0.1:${PORT}/api/game/ideologies?modPath=${encodeURIComponent(mod)}`)
      .then((r) => r.json()).then((j) => (Array.isArray(j) ? j : (j.ideologies || j.items || [])));
    {
      const overTop = await top(OVERRIDE);
      ok("the top-level picker offers the overriding mod's own ideologies",
        overTop.includes("neutrality") && overTop.includes("communism"), overTop);
      ok("…and NOT vanilla's democratic, whose file no longer loads", !overTop.includes("democratic"), overTop);
      ok("…nor fascism", !overTop.includes("fascism"), overTop);

      // CONTROL — the other direction. A fix that always replaced would pass the three above and be wrong
      // here: a differently-named file adds, exactly as The Road to 56's r56e_technology.txt does for techs.
      const extraTop = await top(EXTRA);
      ok("a NEW-basename file still ADDS to the base game's", extraTop.includes("democratic") && extraTop.includes("neutrality"), extraTop);
      const plainTop = await top(PLAIN);
      ok("…and a mod with no ideologies file still sees the base game's", plainTop.includes("democratic"), plainTop);
      ok("…so replacing and adding give different answers", overTop.length !== plainTop.length, { over: overTop.length, plain: plainTop.length });

      // the real corpus: Old World Blues renames all four, so it is the discriminating mod here
      const OWB = ["D:/SteamLibrary/steamapps/workshop/content/394360"].flatMap((ws) => {
        try {
          return fs.readdirSync(ws).map((d) => path.join(ws, d)).filter((p) => {
            try { return /Old World Blues/i.test((/name="([^"]+)"/.exec(fs.readFileSync(path.join(p, "descriptor.mod"), "latin1")) || [])[1] || ""); }
            catch (_) { return false; }
          });
        } catch (_) { return []; }
      })[0];
      if (OWB) {
        const owb = await top(OWB);
        console.log("     Old World Blues top-level ideologies: " + owb.join(", "));
        ok("Old World Blues gets its own four", owb.includes("elites") && owb.includes("ruler"), owb);
        ok("…and none of vanilla's, which it replaces wholesale",
          !owb.some((i) => ["democratic", "communism", "fascism", "neutrality"].includes(i)), owb);
      } else { console.log("  --  Old World Blues not present; skipping its corpus check"); }
    }

    // ── the source ──────────────────────────────────────────────────────────────────────────────
    const src = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
    const fn = src.slice(src.indexOf("function scanLeaderIdeologies"), src.indexOf("function scanLeaderIdeologies") + 2200);
    ok("the scan resolves files by basename first", /const byBase = new Map\(\);/.test(fn), fn.slice(0, 700));
    ok("…letting a later root win", /byBase\.set\(f\.toLowerCase\(\), path\.join\(dir, f\)\)/.test(fn), fn.slice(0, 900));
    ok("…and parses only the winners", /for \(const abs of byBase\.values\(\)\)/.test(fn), fn.slice(0, 1100));
    ok("…and it explains why", /#ideology-picker-ignores-override/.test(fn), "no marker comment");

    console.log("\ntest-ideology-override: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 15 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
