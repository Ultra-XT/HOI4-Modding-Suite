// #country-map-seam — ONE COUNTRY, CREATED ONCE, WITH ITS LAND PAINTED ON THE MAP.
//
// Reported by the user after sitting with two people making a mod: you create a country in Country Setup,
// find no way to put it on the map, go to the Map — and create a BRAND NEW country there. Two countries, two
// forms, no idea which is real.
//
// Neither maker was broken. The Map's paint-to-claim flow is the better one: it takes territory, auto-picks
// the capital from the claim, and suggests a free tag. Geography living on the Map is deliberate and
// documented — Country Setup's Save Details omits `capital` precisely so the Map stays the single source of
// truth. None of that changes here.
//
// The seam between them was the whole problem, and it broke in three places:
//
//   1. The Create Country dialog's own recommended button navigated to a bare "map.html?tool=newcountry",
//      DISCARDING the tag, name and colour just typed. The Map then opened an empty form with a randomly
//      suggested tag — which is why it reads as a different country. That is the reported bug exactly.
//   2. Nothing told the Map it was FINISHING something already started.
//   3. After creating on the Map you were left there, with no route back to the rest of the country's setup.
//
// ⚠️ `newtag`/`newname`/`newcolor` are deliberately NOT the existing `tag` deep-link. `tag` means "select
// this EXISTING country as the paint brush"; using it for a country that does not exist yet would add a
// phantom entry to the country dropdown and try to centre the view on land that is not there.
//
// ⚠️ AND THE ORDERING TRAP, which is why the tag assertions below are so specific. My first version of this
// fix set the tag box from the pending country and the ORIGINAL next line then ran `ti.value = ""`, wiping
// it. Name and colour survived because their lines were edited in place. Driving the real UI caught it; a
// source read would not have. The tag must be seeded AT the initialiser, so there is exactly one place
// deciding that box's starting value.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-seam-"));
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

const CS = fs.readFileSync(path.join(__dirname, "public", "country-setup.js"), "utf8");
const MJ = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
const MH = fs.readFileSync(path.join(__dirname, "public", "map.html"), "utf8");

const toPosix = (p) => p.split(path.sep).join("/");
let seq = 0;
function mkMod() {
  const n = "SEAM" + ++seq;
  const dir = path.join(ROOT, "m" + seq);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), 'name="' + n + '"\nsupported_version="1.19.*"\n');
  fs.writeFileSync(path.join(ROOT, "m" + seq + ".mod"),
    'name="' + n + '"\npath="' + toPosix(dir) + '"\nsupported_version="1.19.*"\n');
  return { name: n, dir };
}

let PORT = 50210;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      post: (p, b) => fetch("http://127.0.0.1:" + PORT + p, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b),
      }).then((r) => r.json()).catch((e) => ({ error: String(e) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}

(async () => {
  let api = null;
  try {
    console.log("\n[1. the hand-over] Country Setup carries what was typed");
    rec("the Draw-on-Map button no longer navigates to a bare tool link",
      !/window\.location\.href = "map\.html\?tool=newcountry"/.test(CS), "still discarding the identity");
    rec("…it builds a query carrying the pending country",
      /q\.set\("newtag", tag\)/.test(CS) && /q\.set\("newname", name\)/.test(CS) && /q\.set\("newcolor", color\)/.test(CS),
      "one or more fields are not carried");
    rec("…reading them from the dialog's own inputs",
      /getElementById\("ccTag"\)/.test(CS) && /getElementById\("ccName"\)/.test(CS) && /getElementById\("ccColor"\)/.test(CS),
      "not reading the dialog fields");
    rec("…and only sending values that are actually valid",
      /\/\^\[A-Z\]\[A-Z0-9\]\{2\}\$\/\.test\(tag\)/.test(CS) && /\/\^#\[0-9a-fA-F\]\{6\}\$\/\.test\(color\)/.test(CS),
      "unvalidated values are forwarded");

    console.log("\n[2. the receiving end] the Map reads it, without pretending the country exists");
    rec("the Map parses the pending country", /q\.get\("newtag"\)/.test(MJ) && /q\.get\("newname"\)/.test(MJ), "not parsed");
    rec("…into its own slot, not the existing-country deep-link",
      /let pendingCountry = null;/.test(MJ) && /pendingCountry = \{/.test(MJ), "no separate pending slot");
    rec("…and validates the tag shape before trusting it",
      /\/\^\[A-Z\]\[A-Z0-9\]\{2\}\$\/\.test\(nTag\)/.test(MJ), "tag taken verbatim from the URL");
    // Both ends must agree with the rule the Map's own submit enforces, and with HOI4. A tag is exactly
    // three characters — carrying a shorter one pre-filled a box that submitNewCountry then refused, while
    // suppressing the free-tag suggestion that would have filled it correctly.
    //
    // 🈯 The FIRST of those three must be a letter. This used to pin [A-Z0-9]{3}, which let a digit-first
    // tag through both ends — and none of the 1,186 tags vanilla and the workshop mods declare looks like
    // that, because a Paradox token cannot begin with a digit. Digits elsewhere are fine and necessary:
    // /api/map/free-tag suggests Z00, Z01, … precisely so the suggestion cannot clash. #country-tag-shape
    rec("…using the SAME shape the Map's own submit demands",
      /\/\^\[A-Z\]\[A-Z0-9\]\{2\}\$\/\.test\(tag\)/.test(MJ) && !/\{1,3\}/.test(MJ) && !/\{1,3\}/.test(CS),
      "the seam and the Map's submit disagree about what a tag looks like");
    rec("…and bounds the name so a crafted URL cannot flood the bar",
      /nName\.slice\(0, 120\)/.test(MJ), "name unbounded");

    console.log("\n[3. the ordering trap] the tag must survive the box being initialised");
    rec("the tag is seeded AT the initialiser, not before it",
      /ti\.value = \(pc && pc\.tag\) \? pc\.tag : "";/.test(MJ), "seeded somewhere the clear can wipe");
    rec("…so nothing clears it unconditionally afterwards",
      !/if \(ti\) \{ ti\.value = ""; fetch/.test(MJ), "the unconditional clear is back");
    rec("…and the free-tag suggestion still only fills an EMPTY box",
      /&& !ti\.value\) ti\.value = j\.tag/.test(MJ), "the suggestion would overwrite a carried tag");
    rec("the name and colour are seeded too",
      /\(pc && pc\.name\) \? pc\.name : ""/.test(MJ) && /if \(pc && pc\.color && ci\) ci\.value = pc\.color;/.test(MJ),
      "name or colour not seeded");

    console.log("\n[4. it says whose land you are claiming]");
    rec("the claim bar has a slot for it", /id="mapNewCountryPending"/.test(MH), "no pending label in the markup");
    rec("…filled from the pending country",
      /pend\.textContent = label \? "— finishing " \+ label : "";/.test(MJ), "never filled");
    rec("…and hidden when there is none", /pend\.style\.display = label \? "inline" : "none";/.test(MJ), "always shown");

    console.log("\n[5. the way back] the two halves join up");
    rec("a created-country bar exists", /id="mapCountryCreatedBar"/.test(MH), "no return bar");
    rec("…linking into Country Setup for that tag",
      /link\.href = "country-setup\.html\?tag=" \+ encodeURIComponent\(res\.tag\)/.test(MJ), "no deep link back");
    rec("…and it can be dismissed to stay on the Map",
      /mapCountryCreatedDismiss/.test(MH) && /mapCountryCreatedDismiss"\)\.addEventListener/.test(MJ), "no dismiss");
    rec("the pending country is cleared once it exists",
      /pendingCountry = null;\n\s*const back = \$\("mapCountryCreatedBar"\)/.test(MJ.replace(/\r\n/g, "\n")),
      "a second country would inherit the first one's identity");
    rec("Country Setup selects the country named in ?tag=",
      /sp\.get\("tag"\) \|\| sp\.get\("country"\)/.test(CS), "the return link would land on nothing");

    console.log("\n[6. the thing that actually writes] creating from a claim");
    api = await serve(createApp());
    {
      const mod = mkMod();
      const r = await api.post("/api/map/create-country", {
        modPath: mod.dir, tag: "ATL", name: "Atlantis", rgb: [63, 167, 214],
        stateIds: [], capitalStateId: null,
      });
      rec("a claim with no states is refused, not half-created", r.ok !== true, r);
    }
    {
      // A real claim needs real states; use the game's own if it is installed, else state the skip.
      const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
      if (!fs.existsSync(path.join(GAME, "history", "states"))) {
        console.log("  (no HOI4 install — the create half is not exercised here)");
      } else {
        const mod = mkMod();
        const files = fs.readdirSync(path.join(GAME, "history", "states")).filter((f) => f.endsWith(".txt"));
        const ids = [];
        for (const f of files.slice(0, 40)) {
          const m = /(?:^|\n)\s*id\s*=\s*(\d+)/.exec(fs.readFileSync(path.join(GAME, "history", "states", f), "latin1"));
          if (m) ids.push(Number(m[1]));
          if (ids.length >= 2) break;
        }
        rec("fixture: found real state ids to claim", ids.length >= 2, ids);
        // Snapshot the game's tag directory BEFORE the create, so "untouched" is a comparison rather than
        // a guess about which filename a leak would have used.
        const gameTagsBefore = JSON.stringify(fs.readdirSync(path.join(GAME, "common", "country_tags")).sort());
        rec("fixture: the game's country_tags is readable, so the guard can actually compare",
          gameTagsBefore.length > 2, gameTagsBefore.slice(0, 80));
        const r = await api.post("/api/map/create-country", {
          modPath: mod.dir, tag: "ATL", name: "Atlantis", rgb: [63, 167, 214],
          stateIds: ids, capitalStateId: ids[0],
        });
        rec("the country is created from the claim", r.ok === true, r);
        rec("…owning every state that was claimed", r.owned === ids.length, { owned: r.owned, claimed: ids.length });
        rec("…with the capital it was given", Number(r.capital) === ids[0], r);
        const tagsFile = path.join(mod.dir, "common", "country_tags");
        rec("…registered in the tag list", fs.existsSync(tagsFile) && fs.readdirSync(tagsFile).length > 0, "no tag file");
        const hist = path.join(mod.dir, "history", "countries");
        rec("…and given a country history", fs.existsSync(hist) && fs.readdirSync(hist).some((f) => f.startsWith("ATL")),
          fs.existsSync(hist) ? fs.readdirSync(hist) : "(none)");
        // The states must actually name it as owner — that IS "placed on the map".
        const stDir = path.join(mod.dir, "history", "states");
        const owned = fs.existsSync(stDir)
          ? fs.readdirSync(stDir).filter((f) => /owner\s*=\s*ATL/.test(fs.readFileSync(path.join(stDir, f), "utf8"))).length
          : 0;
        rec("…and the claimed states name it as their owner", owned === ids.length, { ownerFiles: owned, claimed: ids.length });
        // This used to look for a filename Nova never writes anywhere, under any circumstances, so it could
        // not fail. Compare the game's own country_tags listing against the snapshot taken before the
        // create — that directory is exactly where a create would land if it ever escaped the mod.
        rec("…while the game install is untouched",
          JSON.stringify(fs.readdirSync(path.join(GAME, "common", "country_tags")).sort()) === gameTagsBefore,
          "the game's common/country_tags changed during the create");

        // A second country must not inherit the first one's identity.
        const r2 = await api.post("/api/map/create-country", {
          modPath: mod.dir, tag: "ATL", name: "Atlantis Again", rgb: [1, 2, 3],
          stateIds: [ids[1]], capitalStateId: ids[1],
        });
        rec("re-using an existing tag is refused", r2.ok !== true && /already exists/i.test(String(r2.error || "")), r2);
      }
    }

    api.stop(); api = null;
    console.log(`\n=== country map seam: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (api) api.stop(); } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
