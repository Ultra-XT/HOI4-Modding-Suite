// Two HIGH decision bugs found by driving the user's own nova_ui_audit mod.
//
// #decision-country-lock-keyword — OPEN AND SAVE FLIPPED `original_tag` TO `tag`.
// A plain open-and-Save with no edits rewrote `allowed = { original_tag = NUA }` to
// `tag = NUA #nova_country_lock` on 15 of the mod's 31 decisions. `tag` matches a country's CURRENT tag,
// `original_tag` the one it started the game as — so the flip silently changes who ever sees the decision
// for any formable nation, released puppet, government-in-exile or civil-war tag.
// This is the dominant idiom in real content: 1,548 vanilla decisions and 989 Millennium Dawn ones use a
// bare `original_tag`, against 297 and 215 using `tag`. Nova's own Allowed placeholder recommends
// `original_tag = GRE`, so users following Nova's guidance were the ones hit.
// Mechanism: the LOAD path strips the lock line out of the textarea and keeps only the tag, so by the time
// injectCountryLock runs there is nothing left to re-derive the keyword from — its keyword-preserving branch
// was unreachable from its only call site. The keyword now travels on the select's dataset.
//
// ⚠️ WHY THIS TEST GOES THROUGH THE FILE AND NOT injectCountryLock DIRECTLY: calling that helper on
// UNSTRIPPED text passes even with the bug present, because then `found.keyword` really does see
// `original_tag`. A unit test at that seam is vacuous. This drives save → disk → save again.
//
// #decision-icon-unvalidated — A STRAY SPACE IN THE ICON DESTROYED THE DECISION.
// `icon` was written into script with no validation at all, while every neighbouring scalar is guarded
// (custom_cost_text, target_array, on_map_mode, and the CATEGORY icon which is explicitly anchored at both
// ends). `GFX_x 2` emitted a bare `2` token inside the block: still brace-balanced, so the brace guard
// stayed quiet, but the read-back lost the real values and the NEXT ordinary save wrote `cost = 0`, deleted
// `days_remove` and emptied `available`. Two "successful" saves and the decision is gone.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-declock-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

const MOD = path.join(ROOT, "declockmod");
fs.mkdirSync(path.join(MOD, "common", "decisions", "categories"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="DecLock"\nsupported_version="1.19.*"\n', "utf8");
fs.writeFileSync(path.join(MOD, "common", "decisions", "categories", "zz_cat.txt"),
  "nova_lock_cat = {\n\ticon = GFX_decision_category_generic_political_actions\n}\n", "utf8");
const DEC = path.join(MOD, "common", "decisions", "nova_lock.txt");
fs.writeFileSync(DEC, `nova_lock_cat = {
\tnova_locked_dec = {
\t\ticon = GFX_decision_generic_decision
\t\tallowed = {
\t\t\toriginal_tag = NUA
\t\t}
\t\tcost = 10
\t\tdays_remove = 5
\t\tfire_only_once = no
\t\tavailable = {
\t\t\talways = yes
\t\t}
\t\tcomplete_effect = {
\t\t\tadd_political_power = 1
\t\t}
\t}
}
`, "utf8");

const PORT = 42953;
const app = createApp();
const srv = app.listen(PORT, async () => {
  const post = (url, body) => fetch(`http://127.0.0.1:${PORT}${url}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(Object.assign({ modPath: MOD }, body)),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const read = () => fs.readFileSync(DEC, "utf8");

  try {
    console.log("\n[ground truth] `original_tag` is what real content actually uses");
    const V = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/common/decisions";
    let orig = 0, plain = 0;
    try {
      const walk = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const p = path.join(d, e.name);
          if (e.isDirectory()) walk(p);
          else if (/\.txt$/i.test(e.name)) {
            const t = fs.readFileSync(p, "utf8");
            orig += (t.match(/(^|\n)\s*original_tag\s*=\s*[A-Z]{3}/g) || []).length;
            plain += (t.match(/(^|\n)\s*tag\s*=\s*[A-Z]{3}/g) || []).length;
          }
        }
      };
      walk(V);
    } catch (_) {}
    rec("vanilla's decisions were scanned", orig + plain > 100, { orig, plain });
    rec("…and `original_tag` is the dominant idiom, so flipping it matters", orig > plain, { orig, plain });

    console.log("\n[scope] this file covers the SERVER half only — the bug was in the client");
    // Said plainly because I walked into it: posting a pre-built `allowed` string here exercises the server,
    // which was always innocent. The client is what stripped the keyword out before the server ever saw it,
    // so a check at this seam passes with the fix reverted. The non-vacuous proof is e2e-decision-country-lock.js,
    // which opens a real decision in a browser and presses Save. Keep both — this one guards the server
    // contract and the icon validation; that one guards the round trip.

    console.log("\n[the bug] a save must not change the keyword");
    // Exactly what the editor posts for an unchanged decision that had `original_tag = NUA`: the client
    // strips the lock line into the dropdown, so `allowed` arrives EMPTY and the tag comes separately.
    // With the keyword hint lost, the client used to rebuild this as `tag = NUA`.
    const clientAllowed = "original_tag = NUA #nova_country_lock"; // what injectCountryLock now produces
    let r = await post("/api/decisions/save", {
      categoryId: "nova_lock_cat", id: "nova_locked_dec", fileName: "nova_lock.txt",
      icon: "GFX_decision_generic_decision", cost: "10", days: "5", fireOnce: "no",
      allowed: clientAllowed, available: "always = yes", effect: "add_political_power = 1",
    });
    rec("the save succeeded", r.s === 200 && !r.b.error, r.b || r.s);
    rec("…and the file still says original_tag", /(^|\n)\s*original_tag\s*=\s*NUA/.test(read()), read().slice(0, 400));
    rec("…and did NOT become a plain tag", !/(^|\n)\s*tag\s*=\s*NUA/.test(read()), read().slice(0, 400));

    console.log("\n[the client] the keyword must survive load -> save");
    // The defect lived entirely in the client, so assert the wiring exists: the load hands the keyword to
    // setCountryLockValue, that stores it, and the save reads it back out.
    const dj = fs.readFileSync(path.join(__dirname, "public", "decisions.js"), "utf8");
    rec("the load passes the keyword on", /setCountryLockValue\(_cl\.tag, _cl\.keyword\)/.test(dj), "load does not pass keyword");
    rec("…it is stored where the save can reach it", /sel\.dataset\.lockKeyword = /.test(dj), "not stored");
    rec("…and the save passes it into injectCountryLock",
      /injectCountryLock\([\s\S]{0,220}?dataset\.lockKeyword/.test(dj), "save does not pass the hint");
    rec("…and injectCountryLock accepts a hint rather than only re-deriving",
      /function injectCountryLock\(allowedText, tag, keywordHint\)/.test(dj), "signature unchanged");

    console.log("\n[the icon] a value that would BREAK THE SCRIPT must never reach it");
    // RETARGETED (#decision-bare-icon-token-clobbered). `not_a_sprite` used to be in this list because the
    // writer required a GFX_ prefix. That requirement was wrong: HOI4 resolves a decision `icon` by trying
    // `GFX_decision_<value>` and then `<value>` verbatim — the same two-step rule already recorded here for
    // an idea's `picture` — and 1,786 vanilla decisions plus 697 Millennium Dawn ones use the bare form. The
    // guard exists to keep whitespace and braces out of the emitted script, which is what the four remaining
    // values test; whether a token names a sprite that exists is a content question, not a corruption one.
    for (const bad of ["GFX_decision_generic_decision 2", "GFX_a\nb", "GFX_x }", "GFX_x = {"]) {
      r = await post("/api/decisions/save", {
        categoryId: "nova_lock_cat", id: "nova_icon_dec", fileName: "nova_lock.txt",
        icon: bad, cost: "10", days: "5", fireOnce: "no",
        available: "always = yes", effect: "add_political_power = 1",
      });
      rec(`icon ${JSON.stringify(bad)} did not reach the file`,
        r.s === 200 && !read().includes(bad.replace(/\n/g, "")), { s: r.s });
    }
    // …and the bare form the guard used to reject now round-trips, because it is what real content writes.
    r = await post("/api/decisions/save", {
      categoryId: "nova_lock_cat", id: "nova_icon_dec", fileName: "nova_lock.txt",
      icon: "generic_prepare_civil_war", cost: "10", days: "5", fireOnce: "no",
      available: "always = yes", effect: "add_political_power = 1",
    });
    rec("a BARE token is written through, as vanilla writes it",
      r.s === 200 && /icon = generic_prepare_civil_war/.test(read()), { s: r.s, file: read().slice(0, 300) });
    const icons = [...read().matchAll(/(^|\n)\s*icon\s*=\s*(\S+)/g)].map((m) => m[2]);
    rec("every icon written is a single safe token",
      icons.length > 0 && icons.every((v) => /^[A-Za-z0-9_]+$/.test(v)), icons);

    console.log("\n[the damage that followed] the second save must not destroy the decision");
    // The original report's worst part: a bad icon made the read-back lose values, so the NEXT ordinary
    // save wrote cost = 0 and deleted days_remove / available. Save twice and check the values survive.
    r = await post("/api/decisions/save", {
      categoryId: "nova_lock_cat", id: "nova_icon_dec", fileName: "nova_lock.txt",
      icon: "GFX_decision_generic_decision", cost: "10", days: "5", fireOnce: "no",
      available: "always = yes", effect: "add_political_power = 1",
    });
    rec("the follow-up save succeeded", r.s === 200 && !r.b.error, r.b || r.s);
    // Brace-matched, not a lazy regex — the block contains nested `{ … }` so `[\s\S]*?\n\t\}` stops early.
    const blk = (() => {
      const t = read();
      const i = t.indexOf("nova_icon_dec");
      if (i < 0) return "";
      const o = t.indexOf("{", i);
      let d = 0;
      for (let j = o; j < t.length; j++) {
        if (t[j] === "{") d++;
        else if (t[j] === "}") { d--; if (!d) return t.slice(o + 1, j); }
      }
      return "";
    })();
    rec("…cost survived", /(^|\n)\s*cost\s*=\s*10\b/.test(blk), blk.slice(0, 300));
    rec("…days_remove survived", /(^|\n)\s*days_remove\s*=\s*5\b/.test(blk), blk.slice(0, 300));
    rec("…available survived", /available\s*=\s*\{[\s\S]*?always\s*=\s*yes/.test(blk), blk.slice(0, 300));
    rec("…and no stray bare token was left in the block",
      !/(^|\n)\s*\d+\s*(\n|$)/.test(blk), blk.slice(0, 300));

    console.log("\n[the advanced scalars] a value Nova can't write must be REFUSED, not dropped");
    // #decision-adv-fields-silently-dropped. custom_cost_text, target_array and ai_hint_pp_cost were written
    // only if their regex matched and otherwise discarded with a 200 — while their sibling `priority` in the
    // same handler already refused with a message naming the bad value. Dropping is worse than it sounds on
    // an EDIT: all three keys are managed, so a rejected value ALSO deletes the authored one already on disk.
    await post("/api/decisions/save", {
      categoryId: "nova_lock_cat", id: "nova_adv_dec", fileName: "nova_lock.txt",
      icon: "GFX_decision_generic_decision", cost: "10", fireOnce: "no",
      available: "always = yes", effect: "add_political_power = 1",
      customCostText: "decision_cost_civ_factory_3", targetArray: "ROOT.core_states", aiHintPpCost: "150",
    });
    rec("the good values were written", /custom_cost_text\s*=\s*decision_cost_civ_factory_3/.test(read()) &&
      /target_array\s*=\s*ROOT\.core_states/.test(read()) && /ai_hint_pp_cost\s*=\s*150/.test(read()), read().slice(0, 700));
    for (const [field, bad] of [["customCostText", "Costs 3 factories"], ["targetArray", "my array!"], ["aiHintPpCost", "5 } nope"]]) {
      const body = {
        categoryId: "nova_lock_cat", id: "nova_adv_dec", fileName: "nova_lock.txt",
        icon: "GFX_decision_generic_decision", cost: "10", fireOnce: "no",
        available: "always = yes", effect: "add_political_power = 1",
        customCostText: "decision_cost_civ_factory_3", targetArray: "ROOT.core_states", aiHintPpCost: "150",
      };
      body[field] = bad;
      const rr = await post("/api/decisions/save", body);
      rec(`${field} = ${JSON.stringify(bad)} is refused with a message`,
        rr.s === 400 && !!(rr.b && rr.b.error), { s: rr.s, b: rr.b });
    }
    // The point of refusing rather than dropping: the authored values are all still there.
    rec("…and the authored values on disk are untouched",
      /custom_cost_text\s*=\s*decision_cost_civ_factory_3/.test(read()) &&
      /target_array\s*=\s*ROOT\.core_states/.test(read()) && /ai_hint_pp_cost\s*=\s*150/.test(read()), read().slice(0, 700));

    console.log("\n[safety] the file the game has to parse");
    let d = 0, ok = true;
    for (const ch of read()) { if (ch === "{") d++; else if (ch === "}") { d--; if (d < 0) ok = false; } }
    rec("the decisions file is brace-balanced", ok && d === 0, d);

    console.log(`\n=== decision lock + icon: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { srv.closeAllConnections(); } catch (_) {}
    srv.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
srv.on("error", (e) => { console.error("listen error:", e.message); process.exitCode = 1; });
