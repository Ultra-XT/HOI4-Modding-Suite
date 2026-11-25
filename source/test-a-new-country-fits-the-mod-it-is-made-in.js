// ⛔ #new-country-has-vanilla-ideologies  +  #new-country-steals-a-capital-in-silence
//
// createCountry wrote a country's politics with vanilla's ideology ids hardcoded:
//     set_politics    = { ruling_party = neutrality … }
//     set_popularities = { democratic = 0  fascism = 0  communism = 0  neutrality = 100 }
//
// A mod file replaces a common/ file of the same BASENAME wholesale, and Old World Blues ships
// common/ideologies/00_ideologies.txt — the same name as vanilla's — declaring
// `people, intellectuals, elites, ruler`. Not one of vanilla's four exists in that game, so every country
// Nova created there named a ruling party and four popularities the game cannot resolve. Millennium Dawn
// shows the other half of the problem: it declares FIVE (vanilla's four plus `nationalist`), and the
// hardcoded list silently omitted one.
//
// The same function already discovers the starting TECHNOLOGY from the overlay, with a comment explaining
// that `infantry_weapons` is right for vanilla and wrong for Old World Blues. The ideologies sat two lines
// below it, hardcoded.
//
// AND: drawing a country over another's capital state changed the owner while nothing re-pointed the
// victim's capital. HOI4 crashes when a country's capital is a state it does not own — Nova has a validator
// rule for it, and /api/map/set-owner and /api/map/set-capital both return a capitalWarning. This endpoint,
// the one the recommended flow uses, returned no warning at all.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 300) : "")); }
};

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const OWB = "D:/SteamLibrary/steamapps/workshop/content/394360/2265420196";
const MD = "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649";

if (!fs.existsSync(path.join(GAME, "common", "ideologies"))) {
  console.log("  ..   skipped: the base game is not installed at the expected path");
  console.log("\nPASSED 0/0 (skipped)");
  process.exitCode = 0;
} else {
  console.log("\n-- ⭐ ideologies come from the mod that is actually loaded --");
  {
    const v = md.findIdeologies([GAME]);
    ok(v.length === 4 && v.includes("neutrality") && v.includes("democratic"),
      "vanilla declares democratic / communism / fascism / neutrality", v);

    if (fs.existsSync(OWB)) {
      const o = md.findIdeologies([OWB, GAME]);
      ok(o.length > 0 && !o.includes("neutrality") && !o.includes("democratic"),
        "Old World Blues declares its OWN four, and none of vanilla's", o);
      ok(o.includes("people"), "…including `people`, which is what a country there must actually name", o);
    } else console.log("  ..   skipped: Old World Blues is not installed");

    if (fs.existsSync(MD)) {
      const m = md.findIdeologies([MD, GAME]);
      ok(m.includes("nationalist"),
        "Millennium Dawn adds a FIFTH ideology the hardcoded list omitted", m);
      ok(m.length > v.length, "…so a country there needs a popularity the old code never wrote", { md: m.length, vanilla: v.length });
    } else console.log("  ..   skipped: Millennium Dawn is not installed");

    ok(md.findIdeologies(["C:/definitely/not/a/root"]).length === 0,
      "an unresolvable root yields nothing rather than a guess");
  }

  console.log("\n-- a created country names only ideologies that exist --");
  {
    const roots = [];
    try {
      const mk = () => {
        const m = fs.mkdtempSync(path.join(os.tmpdir(), "nova-newc-"));
        roots.push(m);
        fs.mkdirSync(path.join(m, "history", "states"), { recursive: true });
        fs.writeFileSync(path.join(m, "descriptor.mod"), 'version="1.0"\nname="newc"\n', "utf8");
        fs.writeFileSync(path.join(m, "history", "states", "9001-Home.txt"),
          'state = {\n\tid = 9001\n\tname = "STATE_9001"\n\tprovinces = { 3838 }\n\thistory = { owner = GER }\n}\n', "utf8");
        return m;
      };
      const histOf = (m, tag) => {
        const dir = path.join(m, "history", "countries");
        const f = fs.readdirSync(dir).find((x) => x.toUpperCase().startsWith(tag + " "));
        return fs.readFileSync(path.join(dir, f), "utf8");
      };

      // Vanilla overlay
      {
        const m = mk();
        md.createCountry({ modRoot: m, gameRoot: GAME, dependencyRoots: [], techRoots: [m, GAME], tag: "Z01", name: "Testia", rgb: [10, 200, 90], stateIds: [9001], capitalStateId: 9001 });
        const h = histOf(m, "Z01");
        ok(/ruling_party = neutrality/.test(h), "on vanilla it still picks neutrality", h.match(/ruling_party = \w+/));
        // Scoped to the set_popularities block. A bare /^\t(\w+) = \d+$/ over the whole file also picks up
        // `infantry_weapons` from set_technology and `election_frequency` from set_politics.
        const popsBlock = (/set_popularities\s*=\s*\{([\s\S]*?)\}/.exec(h) || [, ""])[1];
        const named = [...popsBlock.matchAll(/([a-z_]+)\s*=\s*\d+/g)].map((x) => x[1]);
        const real = md.findIdeologies([m, GAME]);
        ok(named.length > 0 && named.every((n) => real.includes(n)),
          "every popularity names a real ideology", { named, real });
        ok(real.every((r) => named.includes(r)), "…and every ideology gets a popularity", { named, real });
      }

      // Old World Blues overlay — the case that was broken
      if (fs.existsSync(OWB)) {
        const m = mk();
        md.createCountry({ modRoot: m, gameRoot: GAME, dependencyRoots: [OWB], techRoots: [m, OWB, GAME], tag: "Z02", name: "Vaultia", rgb: [10, 200, 90], stateIds: [9001], capitalStateId: 9001 });
        const h = histOf(m, "Z02");
        ok(!/neutrality|democratic|fascism|communism/.test(h),
          "on Old World Blues it names NONE of vanilla's ideologies", h.match(/set_politics[\s\S]{0,120}/));
        const real = md.findIdeologies([m, OWB, GAME]);
        const m2 = /ruling_party = ([a-z_]+)/.exec(h);
        ok(m2 && real.includes(m2[1]), "…and its ruling party is one Old World Blues declares", m2 && m2[1]);
      }

      console.log("\n-- a mod with no ideologies at all gets no politics block, rather than invented ones --");
      {
        // A bare fixture: better to write nothing than four names the game has never heard of.
        const m = mk();
        md.createCountry({ modRoot: m, gameRoot: null, dependencyRoots: [], techRoots: [m], tag: "Z03", name: "Bare", rgb: [1, 2, 3], stateIds: [9001], capitalStateId: 9001 });
        const h = histOf(m, "Z03");
        ok(!/set_politics/.test(h), "no set_politics block is written", h.slice(0, 160));
        ok(/capital = 9001/.test(h), "…but the country is still created with its capital", h.slice(0, 80));
      }
    } catch (e) {
      ok(false, "threw: " + e.message + "\n" + e.stack);
    } finally {
      for (const r of roots) { try { fs.rmSync(r, { recursive: true, force: true }); } catch (_) { /* scratch only */ } }
    }
  }

  console.log("\n-- the endpoint warns when it takes another country's capital --");
  {
    // Source-level: the behavioural half needs a live server, and the two sibling endpoints are already
    // covered that way. What matters here is that this endpoint uses the SAME helper and returns the SAME
    // key, so the map page's existing writeWarnings channel surfaces it with no client change.
    const SRV = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
    // To the END of the handler, not a fixed window — the first version cut at 4,000 characters and stopped
    // short of the call it was looking for, failing for a reason that had nothing to do with the code.
    const at = SRV.indexOf('app.post("/api/map/create-country"');
    const next = SRV.indexOf('app.post("', at + 10);
    const body = at < 0 ? "" : SRV.slice(at, next > at ? next : at + 12000);
    ok(body.length > 0, "the create-country handler was found", body.length);
    ok(/capitalTransferWarning\(/.test(body), "…and it calls capitalTransferWarning, like its siblings", body.length);
    ok(/capitalWarning \? \{ capitalWarning \}/.test(body) || /capitalWarning\b/.test(body),
      "…returning it under the key the client already reads");
    // The client half already exists — assert it, so the warning cannot be returned into a void.
    const MAP = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
    ok(/res\.capitalWarning/.test(MAP), "public/map.js surfaces capitalWarning on save");
  }

  console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
  process.exitCode = fail ? 1 : 0;
}
