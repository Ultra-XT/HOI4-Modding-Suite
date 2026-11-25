// #event-declared-loc-key — an event's title/desc may point at a key the author chose, and a no-touch Save
// used to repoint it at the maker's own convention and write the box contents there instead.
//
// Two data-loss paths, both fired on a plain open-and-Save:
//
//   1. Only a BLOCK-form `title = { text = KEY trigger = … }` was preserved. A SIMPLE
//      `title = SOME_OTHER_KEY` was treated as managed and re-synthesised as `title = <namespace>.<id>.t`,
//      with the title box's contents written under that NEW key — so the author's pointer AND their text
//      were both lost by a save that touched neither.
//   2. The list resolved the title from `<fullId>.t` only and ended with `|| evt.fullId`, so when that key
//      does not exist the client was handed the event ID dressed up as a name. The user could not tell an
//      invented name from a real one, and Save persisted it as real localisation. 328 MD and 633 vanilla
//      events have no `<id>.t` key at all.
//
// The fix: the parser reports which key the event points at, the list resolves from it, the writer emits it
// back, and an EMPTY box is never written as a name.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const MOD = path.join(os.tmpdir(), "nova-event-lockey-test");
process.env.HOI4_MODS_ROOT = os.tmpdir();
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

fs.rmSync(MOD, { recursive: true, force: true });
fs.mkdirSync(path.join(MOD, "events"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="EvLocKey"\nsupported_version="1.19.*"\n');

const FILE = "ZZ_ev.txt";
const SRC = [
  "add_namespace = zz",
  "",
  "# points at keys of its OWN choosing, not the <namespace>.<id>.t convention",
  "country_event = {",
  "\tid = zz.1",
  "\ttitle = MY_SHARED_TITLE",
  "\tdesc = MY_SHARED_DESC",
  "\tpicture = GFX_report_event_generic_factory",
  "\tis_triggered_only = yes",
  "",
  "\toption = {",
  "\t\tname = zz.1.a",
  "\t}",
  "}",
  "",
  "# has no localisation for its title at all — the list used to hand the client the id as the name",
  "country_event = {",
  "\tid = zz.2",
  "\ttitle = zz.2.t",
  "\tdesc = zz.2.d",
  "\tpicture = GFX_report_event_generic_factory",
  "\tis_triggered_only = yes",
  "",
  "\toption = {",
  "\t\tname = zz.2.a",
  "\t}",
  "}",
  "",
].join("\n");
fs.writeFileSync(path.join(MOD, "events", FILE), SRC, "utf8");

const LOC = path.join(MOD, "localisation", "english", "AAA_ev_l_english.yml");
const LOC_TEXT = "﻿l_english:\n" + [
  ' MY_SHARED_TITLE:0 "The Shared Headline"',
  ' MY_SHARED_DESC:0 "The shared body text."',
  ' zz.1.a:0 "Very well."',
  ' zz.2.a:0 "Understood."',
  "",
].join("\n");
fs.writeFileSync(LOC, LOC_TEXT, "utf8");

const evText = () => fs.readFileSync(path.join(MOD, "events", FILE), "utf8");
// A brand-new event goes to the maker's own file, not the fixture's, so scan them all for it.
const allEvText = () => fs.readdirSync(path.join(MOD, "events"))
  .map((f) => fs.readFileSync(path.join(MOD, "events", f), "utf8")).join("\n");
const locDir = path.join(MOD, "localisation", "english");
const allLoc = () => fs.readdirSync(locDir).map((f) => fs.readFileSync(path.join(locDir, f), "utf8")).join("\n");
const valueOf = (key) => {
  const m = new RegExp("^[ \\t]*" + key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ':\\d*[ \\t]*"(.*)"', "m").exec(allLoc());
  return m ? m[1] : null;
};
const countKey = (key) => (allLoc().match(new RegExp("^[ \\t]*" + key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ":\\d*", "gm")) || []).length;

const PORT = 39593, app = createApp();
const server = app.listen(PORT, async () => {
  const get = (ep) => fetch("http://127.0.0.1:" + PORT + ep).then((r) => r.json());
  const post = (ep, o) => fetch("http://127.0.0.1:" + PORT + ep, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const breathe = () => new Promise((r) => setTimeout(r, 200));
  const listOne = async (fullId) => {
    const l = await get("/api/events/list?modPath=" + encodeURIComponent(MOD));
    return (l.events || []).find((e) => e.fullId === fullId) || null;
  };
  // the payload the page sends, rebuilt from what the list reports
  const saveFrom = (e, over) => post("/api/events/save", Object.assign({
    modPath: MOD, namespace: "zz", id: String(e.fullId).split(".").slice(1).join("."),
    type: e.type, title: e.title || "", description: e.description || "",
    picture: e.picture || "", triggeredOnly: e.triggeredOnly ? "yes" : "no",
    hidden: e.hidden ? "yes" : "no", fireOnce: e.fireOnce ? "yes" : "no",
    major: e.major ? "yes" : "no", mtthDays: e.mtthDays || "", trigger: e.trigger || "",
    immediate: e.immediate || "", after: e.after || "", timeoutDays: e.timeoutDays || "",
    options: (e.options || []).map((o) => ({ name: o.name, title: o.title || "", script: o.script || "", aiChance: o.aiChance || "", trigger: o.trigger || "" })),
  }, over || {}));

  try {
    // ── the declared key is reported and resolved ───────────────────────────────────────────────────
    const e1 = await listOne("zz.1");
    ok("zz.1 is listed", !!e1);
    ok("its declared title key is reported", e1 && e1.titleKey === "MY_SHARED_TITLE", e1 && e1.titleKey);
    ok("its declared desc key is reported", e1 && e1.descKey === "MY_SHARED_DESC", e1 && e1.descKey);
    ok("the title resolves FROM that key", e1 && e1.title === "The Shared Headline", e1 && e1.title);
    ok("the desc resolves FROM that key", e1 && e1.description === "The shared body text.", e1 && e1.description);

    // ── a no-touch save keeps the pointer AND the text ──────────────────────────────────────────────
    const r1 = await saveFrom(e1);
    await breathe();
    ok("save → 200", r1.s === 200, r1.b);
    ok("the author's title pointer survived", /(?:^|\n)\s*title\s*=\s*MY_SHARED_TITLE\b/.test(evText()), evText().slice(0, 300));
    ok("the author's desc pointer survived", /(?:^|\n)\s*desc\s*=\s*MY_SHARED_DESC\b/.test(evText()), evText().slice(0, 300));
    ok("it was NOT repointed at the .t convention", !/title\s*=\s*zz\.1\.t/.test(evText()), evText().slice(0, 300));
    ok("the shared title text is unchanged", valueOf("MY_SHARED_TITLE") === "The Shared Headline", valueOf("MY_SHARED_TITLE"));
    ok("the shared desc text is unchanged", valueOf("MY_SHARED_DESC") === "The shared body text.", valueOf("MY_SHARED_DESC"));
    ok("no zz.1.t key was invented", countKey("zz.1.t") === 0, allLoc());
    ok("each shared key is still declared exactly once", countKey("MY_SHARED_TITLE") === 1 && countKey("MY_SHARED_DESC") === 1);

    // ── an event with NO title localisation must not be handed its own id as a name ─────────────────
    const e2 = await listOne("zz.2");
    ok("zz.2 is listed", !!e2);
    ok("its title is EMPTY, not the event id", e2 && e2.title === "", JSON.stringify(e2 && e2.title));
    const r2 = await saveFrom(e2);
    await breathe();
    ok("save → 200", r2.s === 200, r2.b);
    ok("no title key was written from the id", countKey("zz.2.t") === 0, allLoc());
    ok("no desc key was written either", countKey("zz.2.d") === 0, allLoc());
    ok("its option text was left alone", valueOf("zz.2.a") === "Understood.", valueOf("zz.2.a"));

    // ── a real edit still lands, under the author's key ─────────────────────────────────────────────
    await breathe();
    const r3 = await saveFrom(e1, { title: "A Better Headline" });
    await breathe();
    ok("edit → 200", r3.s === 200, r3.b);
    ok("the new text went to the AUTHOR'S key", valueOf("MY_SHARED_TITLE") === "A Better Headline", valueOf("MY_SHARED_TITLE"));
    ok("…and not to a newly invented one", countKey("zz.1.t") === 0, allLoc());
    ok("the pointer is still the author's", /(?:^|\n)\s*title\s*=\s*MY_SHARED_TITLE\b/.test(evText()));

    // ── #event-home-file: the edit must land in the file the event LIVES in ─────────────────────────
    // An events file is named for a country or a theme; the namespace is declared inside with
    // add_namespace. Deriving the filename from the namespace meant editing zz.1 (which lives in ZZ_ev.txt)
    // wrote a COPY into zz.txt and left the original untouched — the event was then defined twice in-game,
    // and the copy carried the maker's own .t/.d keys rather than the author's.
    ok("no second events file was created", fs.readdirSync(path.join(MOD, "events")).join(",") === FILE,
      fs.readdirSync(path.join(MOD, "events")));
    ok("the event is defined exactly once across every events file",
      (allEvText().match(/(?:^|\n)\s*id\s*=\s*zz\.1\b/g) || []).length === 1,
      (allEvText().match(/(?:^|\n)\s*id\s*=\s*zz\.1\b/g) || []).length);
    ok("its type was not degraded", !/undefined\s*=\s*\{/.test(allEvText()), allEvText().slice(0, 200));

    // an unknown event type must be REFUSED, not written as `undefined = { … }` (invalid script that makes
    // HOI4 discard the whole file)
    const rBad = await post("/api/events/save", {
      modPath: MOD, namespace: "zz", id: "77", type: "not_a_real_event_type",
      title: "X", description: "Y", picture: "", triggeredOnly: "yes", hidden: "no",
      fireOnce: "no", major: "no", mtthDays: "", trigger: "", immediate: "", after: "", timeoutDays: "",
      options: [{ name: "zz.77.a", title: "Ok", script: "", aiChance: "", trigger: "" }],
    });
    ok("an unknown event type is refused", rBad.s >= 400 && /Unknown event type/i.test(rBad.b.error || ""), rBad);
    ok("…and nothing was written for it", !/undefined\s*=\s*\{/.test(allEvText()) && !/zz\.77/.test(allEvText()));

    // ── and a brand-new event still gets the convention ─────────────────────────────────────────────
    await breathe();
    const r4 = await post("/api/events/save", {
      modPath: MOD, namespace: "zz", id: "9", type: "country_event",
      title: "Fresh Event", description: "Fresh body.", picture: "GFX_report_event_generic_factory",
      triggeredOnly: "yes", hidden: "no", fireOnce: "no", major: "no",
      mtthDays: "", trigger: "", immediate: "", after: "", timeoutDays: "",
      options: [{ name: "zz.9.a", title: "Fine.", script: "", aiChance: "", trigger: "" }],
    });
    await breathe();
    ok("new event → 200", r4.s === 200, r4.b);
    ok("it uses the maker's own key convention", /title\s*=\s*zz\.9\.t/.test(allEvText()), fs.readdirSync(path.join(MOD, "events")));
    ok("and its text was written there", valueOf("zz.9.t") === "Fresh Event", valueOf("zz.9.t"));

    const balanced = (t) => { let d = 0; for (const ch of t.replace(/#.*$/gm, "")) { if (ch === "{") d++; else if (ch === "}") d--; if (d < 0) return false; } return d === 0; };
    ok("the events file is still valid", balanced(evText()));

    console.log("\ntest-event-declared-loc-key: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 20 ? 0 : 1;
    try { fs.rmSync(MOD, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
