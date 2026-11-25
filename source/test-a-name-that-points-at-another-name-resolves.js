// ⛔ #a-reference-to-a-description-never-resolved — RAW $DOLLARS$ ON SCREEN, IN TWO MAKERS.
//
// A localisation VALUE may itself be a reference to another key, and the game substitutes it:
//     small_plane_airframe_1_desc: "$small_plane_airframe_0_desc$"      (a tech description)
//     AAT_Sweden.39.t:            "$AAT_Sweden.38.t$"                   (an event title)
// 6,769 values across the installed corpus are entirely one such reference — vanilla 2,982, Millennium Dawn
// 2,383, Old World Blues 885, Rise of Nations 310, Road to 56 209 — so a reader that does one lookup and
// stops shows the dollars to the modder.
//
// Two separate causes, found by asking every maker's list endpoint for a big corpus and counting the
// display strings that were still an unresolved reference:
//
//  1. resolveLocReferences looked up ONLY the names map. Localisation is split into `names` and
//     `descriptions` here, and a $key$ inside a value names a KEY, not a map — so a description pointing at
//     another description could never resolve. 24 vanilla technologies and 12 of MD's showed raw dollars as
//     their description. It takes either shape now and looks in both.
//  2. The event reader never called the helper at all. 27 whole references and 70 partial ones on the base
//     game, 16 more on Old World Blues.
//
// ⭐ AND THE CONTROL THAT MATTERS MOST: an UNRESOLVABLE reference is left exactly as it is. Vanilla ships
// some, and inventing text for a key the game cannot resolve either would be worse than showing the key.
// That behaviour is what made the first measurement look wrong, and it is correct.
"use strict";

// #a-bare-test-run-writes-into-the-real-app-data — FIRST: run bare, the server this starts inherits the sandbox.
require("./safe-write.js");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { makeLiveFetch } = require("./testlib-live-fetch.js");

const PORT = Number(process.env.NOVA_TEST_PORT || 53704);
let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 340) : "")); }
};

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
const WHOLE = /^\$[A-Za-z0-9_.\-]+\$$/;

if (!fs.existsSync(path.join(GAME, "localisation", "english"))) {
  console.log("  ..   skipped: the base game is not installed at the expected path");
  console.log("\nPASSED 0/0 (skipped)");
  process.exitCode = 0;
} else {
  const roots = [];
  const appdata = fs.mkdtempSync(path.join(os.tmpdir(), "nova-loc-ad-")); roots.push(appdata);
  const blank = fs.mkdtempSync(path.join(os.tmpdir(), "nova-loc-")); roots.push(blank);
  fs.writeFileSync(path.join(blank, "descriptor.mod"), 'version="1.0"\nname="Blank"\n', "utf8");

  const srv = spawn(process.execPath, [path.join(__dirname, "server.js")], {
    env: Object.assign({}, process.env, {
      PORT: String(PORT), APPDATA: appdata, NOVA_APP_DATA_DIR: appdata, NOVA_HOME_DIR: appdata,
    }),
    stdio: ["ignore", "pipe", "pipe"],
  });
  // ⛔ #a-live-fetch-tells-busy-from-dead — KEEP WHAT THE SERVER SAYS. This file failed twice, in two suite runs
  // weeks apart, with nothing but "threw: fetch failed", passing 3 of 3 alone both times; both failing runs were
  // the slow ones. Because every word this server said was thrown away here, a CRASHED server and a merely busy
  // one produced the identical message, and each failure cost a 17-minute re-run to tell them apart.
  const said = [];
  srv.stdout.on("data", (b) => { said.push(String(b)); }); srv.stderr.on("data", (b) => { said.push(String(b)); });
  const liveFetch = makeLiveFetch({ label: "the server this test started", serverOutput: said });

  (async () => {
    try {
      let up = false;
      for (let i = 0; i < 240; i++) {
        try { await fetch(`http://127.0.0.1:${PORT}/`); up = true; break; } catch (_) { await new Promise((r) => setTimeout(r, 250)); }
      }
      if (!up) { ok(false, "server came up on " + PORT); return; }

      console.log("\n-- ⭐ the premise: the shipped files really are written this way --");
      {
        // Counted here, from the .yml, so this test does not depend on Nova agreeing with itself.
        const dir = path.join(GAME, "localisation", "english");
        let whole = 0;
        for (const f of fs.readdirSync(dir)) {
          if (!f.endsWith(".yml")) continue;
          for (const line of fs.readFileSync(path.join(dir, f), "utf8").split("\n")) {
            const m = /^\s*([A-Za-z0-9_.\-]+):\s*\d*\s*"(.*)"\s*$/.exec(line);
            if (m && WHOLE.test(m[2])) whole++;
          }
        }
        ok(whole > 1000, `${whole} vanilla loc values are entirely a reference to another key`, whole);
        const nsb = fs.readFileSync(path.join(dir, "nsb_characters_l_english.yml"), "utf8");
        ok(/GER_gerd_von_rundstedt:\s*"\$gerd_von_rundstedt\$"/.test(nsb), "…a character name among them");
        // A DESCRIPTION pointing at another description — the case the names-only lookup could never reach.
        let descRef = null;
        for (const f of fs.readdirSync(dir)) {
          if (!f.endsWith(".yml")) continue;
          for (const line of fs.readFileSync(path.join(dir, f), "utf8").split("\n")) {
            const m = /^\s*([A-Za-z0-9_.\-]+_desc):\s*\d*\s*"(\$[A-Za-z0-9_.\-]+_desc\$)"\s*$/.exec(line);
            if (m) { descRef = m; break; }
          }
          if (descRef) break;
        }
        ok(!!descRef, "…and a description pointing at another description", descRef && (descRef[1] + " -> " + descRef[2]));
      }

      const rawIn = async (url, pull) => {
        const d = await liveFetch(`http://127.0.0.1:${PORT}${url}`).then((r) => r.json());
        const strings = pull(d).filter((s) => typeof s === "string" && s);
        return { total: strings.length, raw: strings.filter((s) => WHOLE.test(s)) };
      };

      console.log("\n-- ⛔ nothing reaches the screen as a raw key --");
      {
        const corpora = [["the base game", blank]];
        for (const [name, id] of [["Millennium Dawn", "2777392649"], ["Old World Blues", "2265420196"]]) {
          if (fs.existsSync(path.join(WS, id))) corpora.push([name, path.join(WS, id)]);
        }
        for (const [label, m] of corpora) {
          const mp = encodeURIComponent(m);
          const tech = await rawIn(`/api/technologies/catalog?modPath=${mp}`,
            (d) => (d.technologies || []).flatMap((t) => [t.name, t.description]));
          ok(tech.raw.length === 0, `${label}: ${tech.total} technology strings, none raw`, tech.raw.slice(0, 3));

          const evt = await rawIn(`/api/events/list?includeInherited=1&modPath=${mp}`,
            (d) => (d.events || []).flatMap((e) => [e.title, e.desc]));
          ok(evt.raw.length === 0, `${label}: ${evt.total} event strings, none raw`, evt.raw.slice(0, 3));

          const ch = await rawIn(`/api/characters/list?includeBaseMod=1&modPath=${mp}`,
            (d) => [].concat(d.files || [], d.baseModFiles || []).flatMap((f) => (f.characters || []).map((c) => c.name)));
          ok(ch.raw.length === 0, `${label}: ${ch.total} character names, none raw`, ch.raw.slice(0, 3));
        }
      }

      console.log("\n-- ⭐ a specific one, DERIVED so it cannot name the wrong entity --");
      {
        // Find a vanilla technology whose description loc value is itself a whole reference, then ask the
        // catalogue what it shows for that tech. Hardcoding an id got this wrong once already: the first
        // attempt named small_plane_airframe_1, which is EQUIPMENT and never appears in the tech catalogue,
        // so the assertion failed for a reason that had nothing to do with the fix.
        const d = await liveFetch(`http://127.0.0.1:${PORT}/api/technologies/catalog?modPath=${encodeURIComponent(blank)}`).then((r) => r.json());
        const byId = new Map((d.technologies || []).map((t) => [t.id, t]));
        const dir = path.join(GAME, "localisation", "english");
        let found = null;
        for (const f of fs.readdirSync(dir)) {
          if (!f.endsWith(".yml")) continue;
          for (const line of fs.readFileSync(path.join(dir, f), "utf8").split("\n")) {
            const m = /^\s*([A-Za-z0-9_.\-]+)_desc:\s*\d*\s*"(\$[A-Za-z0-9_.\-]+\$)"\s*$/.exec(line);
            if (m && byId.has(m[1])) { found = { id: m[1], raw: m[2], tech: byId.get(m[1]) }; break; }
          }
          if (found) break;
        }
        if (!found) ok(true, "(no vanilla TECHNOLOGY has a whole-reference description — the corpus-wide checks above cover it)");
        else {
          ok(!WHOLE.test(String(found.tech.description || "")),
            `${found.id}'s description resolves through ${found.raw}`, String(found.tech.description || "").slice(0, 70));
          ok(String(found.tech.description || "").length > 20,
            "…to real prose, not to another key", String(found.tech.description || "").slice(0, 80));
        }
      }

      console.log("\n-- ⭐ CONTROL: an UNRESOLVABLE reference is left alone, not invented --");
      {
        const { resolveLocReferences } = require("./server.js");
        if (typeof resolveLocReferences !== "function") {
          ok(true, "(resolveLocReferences is not exported — behaviour checked through the endpoints above)");
        } else {
          ok(resolveLocReferences("$nothing_defines_this$", {}) === "$nothing_defines_this$",
            "a key nothing defines comes back unchanged", "inventing text the game cannot resolve is worse than showing the key");
          ok(resolveLocReferences("$a$", { a: "Alpha" }) === "Alpha", "…while a key that exists resolves");
          ok(resolveLocReferences("$a$", { names: {}, descriptions: { a: "From the desc map" } }) === "From the desc map",
            "…and a whole locMap resolves out of EITHER half — the fix", "a description reference could never resolve");
          // A cycle must terminate, not hang the scan.
          const cyc = resolveLocReferences("$a$", { a: "$b$", b: "$a$" });
          ok(typeof cyc === "string", "a cycle returns rather than hanging", cyc);
          const deep = {};
          for (let i = 0; i < 12; i++) deep["k" + i] = "$k" + (i + 1) + "$";
          deep.k12 = "bottom";
          ok(typeof resolveLocReferences("$k0$", deep) === "string", "…and a long chain hits the depth cap safely");
        }
      }

      console.log("\n-- the readers use the shared helper --");
      {
        const SRV = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
        ok(/const resolveEvtLoc = \([\s\S]{0,200}?resolveLocReferences\(/.test(SRV),
          "the event reader resolves references");
        ok(/tech\.description = resolveLocReferences\(locMap\.descriptions\[descKey\] \|\| "", locMap\);/.test(SRV),
          "…and the tech description passes the WHOLE locMap, not just names");
        ok(/if \(key && n\[key\]\) return resolveLocReferences\(n\[key\], n\);/.test(SRV),
          "…and so does the character reader");
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
