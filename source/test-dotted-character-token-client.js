// #dotted-vanilla-token-listed-but-unsaveable — MIRROR MEANS MIRROR.
//
// Found by a multi-agent hunt over the makers, then confirmed against vanilla before it was believed.
//
// The Characters page's save guard carried a comment saying it "Mirrors the server guard
// (#character-token-charset)" — and did not. The server's class accepts a DOT
// (`/^[\p{L}_][\p{L}\p{N}_.-]*$/u`, widened deliberately under a comment naming the two base-game characters
// it unblocked, with `renameCharacterRecruits` widened to match). The browser's class left the dot out.
//
// So the card listed the character, opened it and filled the form — and Save returned before issuing a single
// request. The two characters the base game ships with a dot in their token could not be edited at all, and
// the refusal blamed the data.
//
// The message was wrong on the facts, too. A dot does not break the characters file: vanilla's AST.txt
// declares `AST_florence_v._mckenzie={`, names it and its `idea_token` with the dot, the localisation key
// carries the dot (`AST_florence_v._mckenzie: "Florence V. McKenzie"`) and an idea references it back through
// `$AST_florence_v._mckenzie$`.
//
// A client guard that is stricter than the server's is not a safety margin — it is a feature the user can see
// and cannot reach.
"use strict";
const fs = require("fs");
const path = require("path");

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

const CLIENT = fs.readFileSync(path.join(__dirname, "public", "characters.js"), "utf8");
const HTML = fs.readFileSync(path.join(__dirname, "public", "characters.html"), "utf8");
const SERVER = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
const VANILLA = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";

// Pull the token class out of each side and compare them as the regexes they are, not as strings.
function clientTokenClass() {
  const m = /if \(!(\/\^\[\\p\{L\}_\]\[[^/]*\/u)\.test\(body\.token\)\)/.exec(CLIENT);
  return m ? m[1] : "";
}

(async () => {
  try {
    console.log("\n[ground truth] the base game really does ship a dotted token");
    const astPath = path.join(VANILLA, "common", "characters", "AST.txt");
    if (fs.existsSync(astPath)) {
      const ast = fs.readFileSync(astPath, "utf8");
      const dotted = [...ast.matchAll(/^[ \t]*([A-Za-z_][A-Za-z0-9_.-]*\.[A-Za-z0-9_.-]*)[ \t]*=[ \t]*\{/gm)].map((m) => m[1]);
      rec("vanilla declares character tokens containing a dot", dotted.length > 0, dotted.slice(0, 4));
      rec("…including the one the server guard was widened for",
        dotted.some((t) => /florence_v\./.test(t)), dotted.slice(0, 6));
      const locDir = path.join(VANILLA, "localisation", "english");
      let locHit = "";
      if (fs.existsSync(locDir)) {
        for (const f of fs.readdirSync(locDir)) {
          if (!/characters/i.test(f)) continue;
          const t = fs.readFileSync(path.join(locDir, f), "utf8");
          const m = /^\s*(AST_florence_v\._mckenzie):\s*\d*\s*"([^"]*)"/m.exec(t);
          if (m) { locHit = m[0].trim(); break; }
        }
      }
      rec("…and its localisation key carries the dot too, so the dot is not the problem",
        /florence_v\._mckenzie/.test(locHit), locHit || "(no loc line found)");
      console.log("  --   " + (locHit || "(loc line not located)"));
    } else {
      console.log("  --   vanilla not installed; skipping the ground-truth block");
    }

    console.log("\n[the two guards] must accept the same tokens");
    const cls = clientTokenClass();
    rec("the client's token class is findable", !!cls, "could not extract it from characters.js");
    rec("…and it accepts a dot", cls.includes("_.-") || cls.includes("."), cls);
    rec("the server's class accepts a dot", /\/\^\[\\p\{L\}_\]\[\\p\{L\}\\p\{N\}_\.-\]\*\$\/u/.test(SERVER), "server class not found");

    // Exercise the actual client class against real tokens rather than eyeballing the source.
    let clientRe = null;
    try { clientRe = new RegExp(cls.replace(/^\//, "").replace(/\/u$/, ""), "u"); } catch (_) { clientRe = null; }
    rec("the client class compiles", !!clientRe, cls);
    if (clientRe) {
      rec("…it accepts vanilla's dotted token", clientRe.test("AST_florence_v._mckenzie"), "rejected");
      rec("…and the other one", clientRe.test("AST_eric_l._lloyd"), "rejected");
      rec("…it still accepts an ordinary token", clientRe.test("NUA_probe_advisor"), "rejected");
      rec("…an accented one, which vanilla also ships", clientRe.test("IRE_Éamon_de_valera"), "rejected");
      rec("…and a hyphenated one", clientRe.test("AUS_arthur_seyss-inquart"), "rejected");
      rec("…while still refusing a space", !clientRe.test("bad token"), "accepted a space");
      rec("…a quote", !clientRe.test('bad"token'), "accepted a quote");
      rec("…a brace", !clientRe.test("bad{token"), "accepted a brace");
      rec("…and a leading digit", !clientRe.test("1_bad"), "accepted a leading digit");
    }

    console.log("\n[the message] must not blame the data for something the data does not do");
    rec("it no longer claims a dot breaks the file in-game",
      !/no dots[\s\S]{0,200}breaks the characters file/.test(CLIENT), "the old claim is still there");
    rec("…and it still names what is actually refused",
      /no spaces or quotes/.test(CLIENT), "the message no longer says what is rejected");

    console.log("\n[still valid]");
    rec("characters.js parses", (() => { try { new Function(CLIENT); return true; } catch (e) { return String(e.message); } })() === true,
      (() => { try { new Function(CLIENT); return "ok"; } catch (e) { return String(e.message); } })());
    rec("…and is versioned so the change ships", /characters\.js\?v=[\w]+/.test(HTML), "no version");

    console.log(`\n=== dotted character token: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  }
})();
