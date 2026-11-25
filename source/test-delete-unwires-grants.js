// #delete-leaves-grant — deleting an item left the grant that handed it out.
//
// The owner chips on every maker write game-start wiring into the mod's country history: a spirit becomes
// `add_ideas = { <id> }`, a decision `activate_decision = <id>`, an event a scheduled `country_event`, a
// character a `recruit_character`. Deleting the item removed its definition and left all of that behind, so
// the mod shipped country histories naming things it no longer defines. The country silently gets nothing and
// the game log fills with unresolved ids.
//
// Nova wrote both halves of that wiring, so a delete now removes both — the per-country grant and the
// all-countries one. This is the mirror of #spirit-rename, where the grants had to FOLLOW the item; here they
// have to go with it.
//
// The negative half matters as much as the positive: deleting one item must not disturb another's grant, and
// the country's own history — its capital, OOB, everything the mod did not write — has to come through
// untouched. Both are asserted below.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-delete-unwire-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const MOD = path.join(ROOT, "delete_unwire_probe");
["common/ideas", "common/decisions", "events", "history/countries", "localisation/english"].forEach((d) =>
  fs.mkdirSync(path.join(MOD, d), { recursive: true }));
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="DeleteUnwireProbe"\nsupported_version="1.19.*"\n');

const HIST = path.join(MOD, "history", "countries", "GER - Germany.txt");
const ALL = path.join(MOD, "common", "on_actions", "zz_nova_all_countries.txt");
const rd = (p) => { try { return fs.readFileSync(p, "utf8"); } catch (_) { return ""; } };
const balanced = (t) => { let d = 0; for (const ch of String(t).replace(/#.*$/gm, "")) { if (ch === "{") d++; else if (ch === "}") d--; if (d < 0) return false; } return d === 0; };
const mentions = (t, id) => new RegExp("\\b" + id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b").test(String(t).replace(/#.*$/gm, ""));

const IDEAS_REL = "common/ideas/zz_unwire.txt";
const IDEA_LOC = "localisation/english/custom_ideas_l_english.yml";

const PORT = 39573, app = createApp();
const server = app.listen(PORT, async () => {
  const post = (ep, o) => fetch("http://127.0.0.1:" + PORT + ep, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const breathe = () => new Promise((r) => setTimeout(r, 170));
  const grant = (itemId, itemType) => post("/api/history/set-startup", { tag: "GER", itemId, itemType, active: true, modPath: MOD });
  const grantAll = (itemId, itemType) => post("/api/history/set-startup-all", { itemId, itemType, active: true, modPath: MOD });
  const spirit = (ideaId, name) => post("/api/ideas/upsert-definition", {
    modPath: MOD, ideaId, targetRelativeFile: IDEAS_REL, targetLocalizationPath: IDEA_LOC,
    name, desc: "d", picture: "GFX_idea_generic_army_bonus",
    selectedEffects: ["political_power_gain = 0.1"], mode: "create", category: "country",
    traits: [], cost: "", removalCost: "", ledger: "",
  });
  const event = (id, title) => post("/api/events/save", {
    modPath: MOD, namespace: "zz_ns", id, type: "country_event",
    picture: "GFX_report_event_generic_factory", triggeredOnly: "yes", hidden: "no",
    fireOnce: "no", major: "no", mtthDays: "", trigger: "", immediate: "", after: "", timeoutDays: "",
    title, description: "d", options: [{ name: `zz_ns.${id}.a`, title: "OK", script: "", aiChance: "", trigger: "" }],
  });

  try {
    // ── two spirits, one deleted and one kept ─────────────────────────────────────────────────────
    await spirit("zz_doomed", "Doomed Spirit"); await breathe();
    await spirit("zz_keeper", "Kept Spirit"); await breathe();
    await grant("zz_doomed", "spirit"); await breathe();
    await grant("zz_keeper", "spirit"); await breathe();
    await grantAll("zz_doomed", "spirit"); await breathe();

    const histBefore = rd(HIST);
    ok("the doomed spirit was granted to a country", mentions(histBefore, "zz_doomed"), histBefore.slice(0, 200));
    ok("…and to every country", mentions(rd(ALL), "zz_doomed"), rd(ALL).slice(0, 200));
    ok("…and a second spirit was granted alongside it", mentions(histBefore, "zz_keeper"), histBefore.slice(0, 200));
    // the history file is an override of the country's real one — it carries content Nova never wrote
    const capitalLine = /capital\s*=\s*\d+/.test(histBefore);
    ok("…and the file carries the country's own history too", capitalLine, histBefore.slice(0, 200));

    await breathe();
    const dsp = await post("/api/ideas/delete-definition", {
      modPath: MOD, ideaId: "zz_doomed", targetRelativeFile: IDEAS_REL, targetLocalizationPath: IDEA_LOC,
    });
    await breathe();
    ok("deleting the spirit → 200", dsp.s === 200, dsp.b);
    const histAfter = rd(HIST);
    ok("…the country no longer receives it", !mentions(histAfter, "zz_doomed"), histAfter.slice(0, 300));
    ok("…neither does every country", !mentions(rd(ALL), "zz_doomed"), rd(ALL).slice(0, 300));
    ok("…the OTHER spirit is still granted", mentions(histAfter, "zz_keeper"), histAfter.slice(0, 300));
    ok("…and it is still defined", /zz_keeper\s*=/.test(rd(path.join(MOD, IDEAS_REL))), rd(path.join(MOD, IDEAS_REL)).slice(0, 200));
    ok("…the country's own history survived", /capital\s*=\s*\d+/.test(histAfter), histAfter.slice(0, 200));
    ok("…and the file is still valid", balanced(histAfter), histAfter.slice(0, 200));

    // ── removing the LAST idea must take the empty block with it ──────────────────────────────────
    // `add_ideas = { }` is an effect block that says nothing. Unchecking the last owner chip used to leave
    // one in the country's history, and so did the unwire above. The all-countries writer had always
    // stripped it; the per-country one had not, so the wart only appeared in the file players read.
    await breathe();
    await post("/api/history/set-startup", { tag: "GER", itemId: "zz_keeper", itemType: "spirit", active: false, modPath: MOD });
    await breathe();
    const emptied = rd(HIST);
    ok("removing the last granted spirit leaves no empty add_ideas", !/add_ideas\s*=\s*\{\s*\}/.test(emptied), emptied.slice(0, 300));
    ok("…the country's own history is still there", /capital\s*=\s*\d+/.test(emptied), emptied.slice(0, 200));
    ok("…and the file is still valid", balanced(emptied), emptied.slice(0, 200));
    // put it back so the rest of the run has a grant to leave alone
    await post("/api/history/set-startup", { tag: "GER", itemId: "zz_keeper", itemType: "spirit", active: true, modPath: MOD });
    await breathe();
    ok("…and re-granting it rebuilds the block", mentions(rd(HIST), "zz_keeper"), rd(HIST).slice(0, 300));

    // ── an event scheduled at game start ──────────────────────────────────────────────────────────
    await breathe();
    await event("5", "Doomed Event"); await breathe();
    await event("6", "Kept Event"); await breathe();
    await grant("zz_ns.5", "event"); await breathe();
    await grant("zz_ns.6", "event"); await breathe();
    ok("the doomed event was scheduled for a country", mentions(rd(HIST), "zz_ns.5"), rd(HIST).slice(0, 300));

    await breathe();
    const dev = await post("/api/events/delete-definition", { modPath: MOD, eventId: "zz_ns.5" });
    await breathe();
    ok("deleting the event → 200", dev.s === 200, dev.b);
    ok("…the country no longer fires it", !mentions(rd(HIST), "zz_ns.5"), rd(HIST).slice(0, 400));
    ok("…the OTHER event is still scheduled", mentions(rd(HIST), "zz_ns.6"), rd(HIST).slice(0, 400));
    ok("…and the history file is still valid", balanced(rd(HIST)), rd(HIST).slice(0, 300));

    // ── a character recruited at game start ───────────────────────────────────────────────────────
    await breathe();
    const chr = (token, name) => post("/api/characters/save", {
      modPath: MOD, token, name, file: "ZZ_unwire.txt",
      portraitCivLarge: "", portraitCivSmall: "", portraitArmyLarge: "", portraitArmySmall: "",
      roleLeader: true, leaderIdeology: "despotism",
    });
    await chr("zz_doomed_char", "Doomed Person"); await breathe();
    await chr("zz_kept_char", "Kept Person"); await breathe();
    await grant("zz_doomed_char", "character"); await breathe();
    await grant("zz_kept_char", "character"); await breathe();
    ok("the doomed character was recruited by a country", mentions(rd(HIST), "zz_doomed_char"), rd(HIST).slice(0, 400));

    await breathe();
    const dch = await post("/api/characters/delete", { modPath: MOD, token: "zz_doomed_char", file: "ZZ_unwire.txt" });
    await breathe();
    ok("deleting the character → 200", dch.s === 200, dch.b);
    ok("…the country no longer recruits them", !mentions(rd(HIST), "zz_doomed_char"), rd(HIST).slice(0, 400));
    ok("…the OTHER character is still recruited", mentions(rd(HIST), "zz_kept_char"), rd(HIST).slice(0, 400));
    ok("…and the history file is still valid", balanced(rd(HIST)), rd(HIST).slice(0, 300));

    // ── a decision activated at game start ────────────────────────────────────────────────────────
    await breathe();
    const dec = (id, name) => post("/api/decisions/save", {
      modPath: MOD, categoryId: "zz_unwire_cat", id, name, cost: "", icon: "", days: "",
      fireOnce: "no", available: "", modifier: "", effect: "add_political_power = 10",
      decisionType: "decision", scope: "", cooldown: "", targetTrigger: "", removeEffect: "",
    });
    const decCreated = await dec("zz_doomed_dec", "Doomed Decision"); await breathe();
    await dec("zz_kept_dec", "Kept Decision"); await breathe();
    ok("two decisions were created", decCreated.s === 200, decCreated.b);
    await grant("zz_doomed_dec", "decision"); await breathe();
    await grant("zz_kept_dec", "decision"); await breathe();
    ok("the doomed decision was activated for a country", mentions(rd(HIST), "zz_doomed_dec"), rd(HIST).slice(0, 400));

    await breathe();
    const ddec = await post("/api/decisions/delete-definition", {
      modPath: MOD, categoryId: "zz_unwire_cat", decisionId: "zz_doomed_dec", fileName: "zz_unwire_cat.txt",
    });
    await breathe();
    ok("deleting the decision → 200", ddec.s === 200, ddec.b);
    ok("…the country no longer activates it", !mentions(rd(HIST), "zz_doomed_dec"), rd(HIST).slice(0, 400));
    ok("…the OTHER decision is still activated", mentions(rd(HIST), "zz_kept_dec"), rd(HIST).slice(0, 400));

    // ── everything the mod itself owns is still intact at the end ─────────────────────────────────
    const finalHist = rd(HIST);
    ok("the country's capital survived every unwire", /capital\s*=\s*\d+/.test(finalHist), finalHist.slice(0, 200));
    ok("…and nothing deleted is named anywhere in it",
      !mentions(finalHist, "zz_doomed") && !mentions(finalHist, "zz_ns.5") &&
      !mentions(finalHist, "zz_doomed_char") && !mentions(finalHist, "zz_doomed_dec"),
      finalHist.slice(0, 500));

    console.log("\ntest-delete-unwires-grants: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 20 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
