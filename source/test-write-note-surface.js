// #write-notes-reach-one-page — THE SERVER SAYS IT; SOMEBODY HAS TO SHOW IT.
//
// server.js funnels every write-time note into drainRefWriteWarning() and staples the result onto EVERY json
// reply via installWriteNoteDrain, specifically so no handler has to be edited. The consumer side was the
// opposite: of all the client scripts that save, only public/research.js ever read `refWarning`, and nobody
// read the `warnings` array or `guiRepair`. So these were written and thrown away —
//   "AAA is not a country in this mod … HOI4 ignores history/countries/AAA - Custom.txt entirely"
//   "Saved the equipment to zz_nova_equipment.txt instead of the file you named"
//   "the rename was saved, but N files referring to the old id could not be updated"
//
// The surface lives in public/loading-overlay.js — the one script every maker page loads, and the one that
// already owns the window.fetch wrapper. This test RUNS that code (extracted from the shipped file, not a
// copy of it) against a stubbed window, so it measures behaviour rather than the presence of a string.
//
// ⭐ The check that gives the fix its value is the last one: the exact set of pages that save but do NOT
// load the surface. A page added later either joins the covered set or fails this test.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { stripJsComments } = require("./testlib-strip-comments.js");

const PUB = path.join(__dirname, "public");
const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 600));
  }
}

// ── pull the shipped IIFE out of loading-overlay.js ──────────────────────────────────────────────────────
const OVERLAY = path.join(PUB, "loading-overlay.js");
const src = fs.readFileSync(OVERLAY, "utf8");
const start = src.indexOf("/*\n * Nova write-note surface") >= 0
  ? src.indexOf("/*\n * Nova write-note surface")
  : src.indexOf("/*\r\n * Nova write-note surface");
rec("the write-note surface is in the script every maker page loads", start !== -1, OVERLAY);
if (start === -1) {
  console.log(`\n=== write-note surface: ${checks} checks, ${fails.length} failed ===`);
  process.exitCode = 1;
  return;
}
const code = src.slice(start);

// ── a stub window: nbAlert records, fetch answers whatever the case wants ────────────────────────────────
function makeWindow(reply) {
  const shown = [];
  const win = {
    __shown: shown,
    nbAlert: (msg, title) => shown.push({ msg, title }),
    alert: (msg) => shown.push({ msg, title: "(alert)" }),
    fetch: (url, init) => Promise.resolve(reply(url, init)),
  };
  win.window = win;
  return win;
}
// A Response stand-in: json() consumes the body exactly like the real one, so a wrapper that forgets to
// clone() is caught by the "the page can still read it" check rather than passing quietly.
function jsonResponse(body, { ok = true, contentType = "application/json" } = {}) {
  let consumed = false;
  const make = () => ({
    ok,
    headers: { get: (k) => (/content-type/i.test(k) ? contentType : null) },
    clone: make,
    json: () => {
      if (consumed) return Promise.reject(new Error("body already read"));
      consumed = true;
      return Promise.resolve(body);
    },
  });
  const r = make();
  // clone() must hand back an INDEPENDENT body, which is the whole point of using it.
  r.clone = () => {
    let c = false;
    return {
      ok,
      headers: r.headers,
      json: () => (c ? Promise.reject(new Error("clone already read")) : ((c = true), Promise.resolve(body))),
    };
  };
  return r;
}
// The surface shows its note ASYNCHRONOUSLY on purpose: it waits a beat, then waits for any modal already
// on screen to be dismissed, because showNovaInfoModal removes whatever is open and two messages in a row
// destroy one. So settling here has to be a real delay, not a couple of microtasks.
const settle = () => new Promise((r) => setTimeout(r, 260));

async function run(reply, calls) {
  const win = makeWindow(reply);
  vm.runInNewContext(code, { window: win, document: win.__document, Date, Promise, setTimeout, console });
  for (const c of calls) await c(win);
  await settle();
  return win.__shown;
}

(async () => {
  try {
    console.log("\n[a save with a note] the message reaches the user");
    {
      const note = "AAA is not a country in this mod, so HOI4 ignores history/countries/AAA - Custom.txt.";
      const shown = await run(
        () => jsonResponse({ ok: true, refWarning: note }),
        [(w) => w.fetch("/api/ideas/upsert-definition", { method: "POST" })]
      );
      rec("refWarning is shown", shown.length === 1 && shown[0].msg === note, shown);
    }

    console.log("\n[the other two channels] warnings[] and guiRepair, which nobody read at all");
    {
      const shown = await run(
        () => jsonResponse({ ok: true, warnings: ["first note", "second note"] }),
        [(w) => w.fetch("/api/army/oob/save", { method: "POST" })]
      );
      rec("a warnings array is shown", shown.length === 1
        && shown[0].msg.includes("first note") && shown[0].msg.includes("second note"), shown);
    }
    {
      const shown = await run(
        () => jsonResponse({ ok: true, guiRepair: "Nova added the officer-corps glow element." }),
        [(w) => w.fetch("/api/ideas/upsert-definition", { method: "POST" })]
      );
      rec("guiRepair is shown", shown.length === 1 && /officer-corps/.test(shown[0].msg), shown);
    }

    console.log("\n[the Military save's own two channels] #army-save-notes-invisible");
    {
      // POST /api/army/oob/save answers with `oobNote` (what the OOB auto-wiring could NOT do) and
      // `namesGroupNote` (a division_names_group defined nowhere → unnamed divisions in game). Nothing on
      // army.js read the wiring note at all, and `namesGroupNote` was appended to the transient status line,
      // which the page's own next message overwrites. Both are facts about what the save could not do.
      const note = 'Saved the OOB, but GER already loads "GER_1936", so the new file may never be read.';
      const shown = await run(
        () => jsonResponse({ ok: true, file: "x.txt", templates: 2, divisions: 1, oobWired: true, oobNote: note }),
        [(w) => w.fetch("/api/army/oob/save", { method: "POST" })]
      );
      rec("the OOB wiring note is shown", shown.length === 1 && shown[0].msg === note, shown);
    }
    {
      const ng = 'Division name group "GER_INF_99" is not defined in this mod, its dependencies, or the base game.';
      const shown = await run(
        () => jsonResponse({ ok: true, file: "x.txt", templates: 1, divisions: 0, namesGroupNote: ng }),
        [(w) => w.fetch("/api/army/oob/save", { method: "POST" })]
      );
      rec("the undefined name-group warning is shown", shown.length === 1 && shown[0].msg === ng, shown);
    }
    {
      // Both at once must arrive as ONE dialog, not two that destroy each other.
      const shown = await run(
        () => jsonResponse({ ok: true, oobNote: "oob thing", namesGroupNote: "names thing" }),
        [(w) => w.fetch("/api/army/oob/save", { method: "POST" })]
      );
      rec("…and both together are one dialog, not two",
        shown.length === 1 && /oob thing/.test(shown[0].msg) && /names thing/.test(shown[0].msg), shown);
    }
    {
      // CONTROL: `note` is a common field name. A reply with a non-string `note`, or an empty one, must not
      // conjure a dialog out of nothing — otherwise every save that happens to carry the word would nag.
      const shown = await run(
        () => jsonResponse({ ok: true, note: "", namesGroupNote: null, notes: ["not this field"] }),
        [(w) => w.fetch("/api/army/oob/save", { method: "POST" })]
      );
      rec("CONTROL: an empty or non-string note shows nothing", shown.length === 0, shown);
    }

    console.log("\n[THE CORRECTNESS CONTROL] the page's own body must survive being inspected");
    {
      const win = makeWindow(() => jsonResponse({ ok: true, refWarning: "note", ideaId: "x" }));
      vm.runInNewContext(code, { window: win, document: win.__document, Date, Promise, setTimeout, console });
      const r = await win.fetch("/api/ideas/upsert-definition", { method: "POST" });
      let body = null, err = null;
      try { body = await r.json(); } catch (e) { err = String(e); }
      await settle();
      rec("the caller can still parse the response", body && body.ideaId === "x", err || body);
      rec("…and the note was shown anyway", win.__shown.length === 1, win.__shown);
    }

    console.log("\n[CONTROL — a GET] is never inspected: no dialog on a background poll");
    {
      const shown = await run(
        () => jsonResponse({ ok: true, refWarning: "should not appear" }),
        [(w) => w.fetch("/api/ideas/catalog"), (w) => w.fetch("/api/ideas/catalog", { method: "GET" })]
      );
      rec("nothing is shown for a read", shown.length === 0, shown);
    }

    console.log("\n[CONTROL — `warnings` as a COUNT] the modhealth reply shape must not be spoken aloud");
    {
      const shown = await run(
        () => jsonResponse({ ok: true, problems: [], errors: 0, warnings: 7 }),
        [(w) => w.fetch("/api/modhealth/scan", { method: "POST" })]
      );
      rec("a numeric `warnings` is not treated as a message", shown.length === 0, shown);
    }

    console.log("\n[CONTROL — a mixed `warnings` array] only the strings are messages");
    {
      // `Array.isArray` is what keeps the modhealth COUNT above out; this is what keeps a non-string ENTRY
      // out, so a reply that ever grows structured warnings cannot put "[object Object]" in a dialog.
      const shown = await run(
        () => jsonResponse({ ok: true, warnings: [7, "", { code: "x" }, "a real note"] }),
        [(w) => w.fetch("/api/army/oob/save", { method: "POST" })]
      );
      rec("the string is shown", shown.length === 1 && shown[0].msg === "a real note", shown);
      rec("…and nothing else leaks into it", shown.length === 1 && !/object|^7|\[/.test(shown[0].msg), shown);
    }

    console.log("\n[CONTROL — nothing to say] the common case stays silent");
    {
      const shown = await run(
        () => jsonResponse({ ok: true, refWarning: "" }),
        [(w) => w.fetch("/api/ideas/upsert-definition", { method: "POST" })]
      );
      rec("an empty refWarning shows nothing", shown.length === 0, shown);
    }

    console.log("\n[a repeat] the same note twice does not stack dialogs");
    {
      const shown = await run(
        () => jsonResponse({ ok: true, refWarning: "same note" }),
        [(w) => w.fetch("/a", { method: "POST" }), async (w) => { await settle(); await w.fetch("/a", { method: "POST" }); }]
      );
      rec("shown once, not twice", shown.length === 1, shown);
    }

    console.log("\n[robustness] a save must never be broken by the attempt to explain it");
    {
      const shown = await run(
        () => ({ ok: true, headers: { get: () => "text/html" }, clone: () => { throw new Error("nope"); }, json: () => Promise.reject(new Error("not json")) }),
        [(w) => w.fetch("/a", { method: "POST" })]
      );
      rec("a non-JSON reply is ignored quietly", shown.length === 0, shown);
    }
    {
      const win = makeWindow(() => { throw new Error("network down"); });
      win.fetch = () => Promise.reject(new Error("network down"));
      vm.runInNewContext(code, { window: win, document: win.__document, Date, Promise, setTimeout, console });
      let caught = "";
      try { await win.fetch("/a", { method: "POST" }); } catch (e) { caught = String(e.message || e); }
      rec("a failed request still rejects, unchanged", caught === "network down", caught);
    }

    console.log("\n[⚠️ NEVER THE NATIVE ALERT] Nova removed those on purpose");
    {
      // army.html and home.html do not load the script that defines nbAlert, so a bare
      // `window.nbAlert || window.alert` fell through to exactly the dialog Nova replaced everywhere —
      // and in Electron's renderer those are unreliable. showNovaInfoModal is the shared modal underneath.
      const shown = [];
      const win = {
        alert: (m) => shown.push({ via: "NATIVE", m }),
        showNovaInfoModal: (t, html) => shown.push({ via: "modal", t, html }),
        fetch: () => Promise.resolve(jsonResponse({ ok: true, refWarning: "a note" })),
      };
      win.window = win;
      vm.runInNewContext(code, { window: win, document: undefined, Date, Promise, setTimeout, console });
      await win.fetch("/a", { method: "POST" });
      await settle();
      rec("with no nbAlert it uses the shared modal", shown.length === 1 && shown[0].via === "modal", shown);
      rec("…and never window.alert", !shown.some((s) => s.via === "NATIVE"), shown);
      rec("…escaping the message rather than injecting it as markup",
        shown[0] && !/[<>]/.test(String(shown[0].html).replace(/<br>/g, "")), shown[0]);
    }

    console.log("\n[⚠️ NEVER ON TOP OF ANOTHER] showNovaInfoModal removes whatever is open");
    {
      // This is the regression the review caught: the page's own "Successfully saved" lands a moment AFTER
      // the note, and destroys it. The note now waits for the screen to be clear — so the user sees both,
      // in order, instead of one of them silently dying.
      let overlay = { id: "novaInfoModalOverlay" };
      const shown = [];
      const win = {
        __document: { getElementById: (id) => (id === "novaInfoModalOverlay" ? overlay : null) },
        nbAlert: (m) => shown.push(m),
        alert: () => shown.push("NATIVE"),
        fetch: () => Promise.resolve(jsonResponse({ ok: true, refWarning: "the note" })),
      };
      win.window = win;
      vm.runInNewContext(code, { window: win, document: win.__document, Date, Promise, setTimeout, console });
      await win.fetch("/a", { method: "POST" });
      await settle();
      rec("nothing is shown while another modal is open", shown.length === 0, shown);
      overlay = null; // the user dismisses it
      await new Promise((r) => setTimeout(r, 700));
      rec("…and the note appears once the screen is clear", shown.length === 1 && shown[0] === "the note", shown);
    }

    console.log("\n[the generic name] `note` is NOT this surface's to claim");
    {
      // ⚠️ THE COLLISION THIS SURFACE INVITES. It drains named fields out of EVERY json reply in the app, so
      // any name it claims it claims GLOBALLY. `note` was claimed first, and `note` is not one endpoint's
      // word: /api/technologies/save-country-techs answers with its own, which Country Setup already shows
      // under a title of its own ("Some technologies weren't changed"). The user read the same sentence in
      // two dialogs, one after the other. The army field was renamed `oobNote`; a bare `note` must pass
      // through this surface untouched and be left to whoever asked for it.
      const shown = await run(
        () => jsonResponse({ ok: true, changed: 0, note: "Some technologies weren't changed." }),
        [(w) => w.fetch("/api/technologies/save-country-techs", { method: "POST" })]
      );
      rec("a bare `note` is left to the page that owns it", shown.length === 0, shown);
    }

    console.log("\n[ONE OWNER] a page that shows the note itself would dialog the user twice");
    {
      // ⭐ DERIVED, NOT COPIED. This list used to be typed out here — refWarning|guiRepair|namesGroupNote —
      // and that is precisely how the `note` collision shipped: the surface grew a fourth field and the
      // check that was supposed to police it had never heard of it. Read the names out of notesIn() itself,
      // so a field added tomorrow is swept the day it is added.
      const drained = [...code.matchAll(/typeof body\.([A-Za-z_$][\w$]*) === "string"/g)].map((m) => m[1]);
      console.log("     the surface drains: " + drained.join(", "));
      rec("the field list really was derived", drained.length >= 4 && drained.includes("oobNote"), drained);
      rec("…and `note` is not among them", !drained.includes("note"), drained);

      // A page may legitimately read the field itself IF its own html does not load the surface — map.html
      // and modhealth.html deliberately do not, so map.js printing the OOB note in its status line is that
      // page's ONLY surfacing, not a second one. Offender = read by a page that ALSO gets the dialog.
      const overlayed = new Set();
      for (const h of fs.readdirSync(PUB).filter((f) => f.endsWith(".html"))) {
        const html = fs.readFileSync(path.join(PUB, h), "utf8");
        const scripts = [...html.matchAll(/src="\.?\/?([A-Za-z0-9._-]+\.js)/g)].map((m) => m[1]);
        if (scripts.includes("loading-overlay.js")) for (const s of scripts) overlayed.add(s);
      }
      rec("the covered-page set is real, not an empty sweep", overlayed.size >= 8, [...overlayed].slice(0, 4));

      const rx = new RegExp("\\b(?:" + drained.join("|") + ")\\b");
      const offenders = [...overlayed].filter((f) => f !== "loading-overlay.js").filter((f) => {
        let raw = ""; try { raw = fs.readFileSync(path.join(PUB, f), "utf8"); } catch (_) { return false; }
        // ⚠️ STRIP COMMENTS FIRST. A fix's own prose names the very field it removed, and a raw grep reads
        // that as the page still doing it — this has cost a false finding four times over.
        return rx.test(stripJsComments(raw));
      });
      rec("no page that gets the dialog also reads the channel itself", offenders.length === 0, offenders);
    }

    console.log("\n[⭐ THE DRIFT CHECK] every page that saves must load the surface");
    {
      const htmls = fs.readdirSync(PUB).filter((f) => f.endsWith(".html"));
      const saves = [], uncovered = [];
      for (const h of htmls) {
        const html = fs.readFileSync(path.join(PUB, h), "utf8");
        const scripts = [...html.matchAll(/src="\.?\/?([A-Za-z0-9._-]+\.js)/g)].map((m) => m[1]);
        const savesHere = scripts.some((s) => {
          try { return /method:\s*["']POST["']/.test(fs.readFileSync(path.join(PUB, s), "utf8")); }
          catch (_) { return false; }
        });
        if (!savesHere) continue;
        saves.push(h);
        if (!scripts.includes("loading-overlay.js")) uncovered.push(h);
      }
      console.log("     pages that save: " + saves.length + "   not covered: " + (uncovered.join(", ") || "none"));
      rec("the page set is real, not an empty sweep", saves.length >= 8, saves);
      // map.html and modhealth.html deliberately do not load the overlay and are outside the maker set.
      // Naming them EXACTLY means a tenth page added later fails this instead of joining them unnoticed.
      rec("only the two known pages are uncovered",
        JSON.stringify(uncovered.sort()) === JSON.stringify(["map.html", "modhealth.html"]), uncovered);
    }

    console.log(`\n=== write-note surface: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  }
})();
