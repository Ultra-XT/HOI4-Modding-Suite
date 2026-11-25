// Two ways the Event Maker wrote something the game would not do what the user asked with.
//
// #picture-default-injected-and-wrong-family
//   (a) AN EVENT WITH NO PICTURE GOT ONE. Events legitimately ship without a `picture` at all: 183 vanilla
//       country_events, 6 news, 7 unit_leader, 7 operative_leader, 2 state — and 1,646 country_events in
//       Millennium Dawn. The writer emitted `picture = <value or GFX_report_event_001>` unconditionally, so
//       opening any of them and pressing Save gave the player a picture the author had left out on purpose.
//   (b) AND THE DEFAULT WAS FROM THE WRONG FAMILY for a news event. A news event draws in the newspaper frame
//       and takes a `GFX_news_event_*` sprite. Counted over every top-level event block: vanilla news_events
//       use GFX_news_event_* 664 times and GFX_report_event_* ZERO times. The two are different shapes on disk
//       (news_event_012.dds 397×153 vs report_event_001.dds 210×176), so it is visibly wrong, not just
//       unconventional.
//
// #country-bridge-writes-country-event-for-every-type — ADDING AN OWNER TO A STATE EVENT WROTE A LINE THAT
// CANNOT FIRE IT. The owner picker is offered for every event type and the bridge hard-coded the
// `country_event` keyword, so a state event got `country_event = { id = X hours = 1 }` in the country's
// history and the save reported success.
//
// Which types are affected is MEASURED, and narrower than it looks. Mapping every declared event id in both
// corpora to the keyword real content fires it with:
//     state_event            fired  9× as state_event,            0× as country_event
//     operative_leader_event fired 24× as operative_leader_event, 0× as country_event
//     unit_leader_event      fired 76× as unit_leader_event,     11× as country_event   <- legal
//     news_event             fired 3470× as news_event,          47× as country_event   <- legal
// and fire sites inside history/countries: 22 country_event, 4 unit_leader_event, ZERO of the other three.
// So news and unit-leader events stay allowed — the base game bridges them that way itself — and only the two
// nothing ever bridges are refused.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-evpic-"));
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

const V = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const MOD = path.join(ROOT, "evpic");
fs.mkdirSync(path.join(MOD, "events"), { recursive: true });
fs.mkdirSync(path.join(MOD, "history", "countries"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="EvPic"\nsupported_version="1.19.*"\n', "utf8");
fs.writeFileSync(path.join(MOD, "history", "countries", "MZA - Mozambique.txt"), "capital = 1\n", "utf8");

const NS = "epns";
const EVF = path.join(MOD, "events", `${NS}.txt`);
// One of each shape: a country event with NO picture, a news event, and a state event.
fs.writeFileSync(EVF, [
  `add_namespace = ${NS}`,
  "",
  "country_event = {",
  `\tid = ${NS}.1`,
  `\ttitle = ${NS}.1.t`,
  `\tdesc = ${NS}.1.d`,
  "\tis_triggered_only = yes",
  `\toption = { name = ${NS}.1.a }`,
  "}",
  "",
  "state_event = {",
  `\tid = ${NS}.9`,
  `\ttitle = ${NS}.9.t`,
  `\tdesc = ${NS}.9.d`,
  "\tis_triggered_only = yes",
  `\toption = { name = ${NS}.9.a }`,
  "}",
  "",
].join("\n"), "utf8");
fs.writeFileSync(path.join(MOD, "localisation", "english", "ep_l_english.yml"),
  `\uFEFFl_english:\n ${NS}.1.t:0 "T"\n ${NS}.1.d:0 "D"\n ${NS}.1.a:0 "A"\n ${NS}.9.t:0 "T9"\n ${NS}.9.d:0 "D9"\n ${NS}.9.a:0 "A9"\n`, "utf8");

const read = () => fs.readFileSync(EVF, "utf8");
const blockOf = (id) => {
  const m = new RegExp(`(country_event|news_event|state_event)\\s*=\\s*\\{[\\s\\S]*?\\bid = ${id.replace(/\./g, "\\.")}\\b[\\s\\S]*?\\n\\}`).exec(read());
  return m ? m[0] : "";
};

const PORT = 43509;
const srv = createApp().listen(PORT, async () => {
  const get = (u) => fetch(`http://127.0.0.1:${PORT}${u}`).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const post = (u, b) => fetch(`http://127.0.0.1:${PORT}${u}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));

  try {
    console.log("\n[ground truth] events ship without a picture, and news events use their own family");
    let noPicture = 0, newsNews = 0, newsReport = 0;
    for (const root of [V, "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649"]) {
      let files = [];
      try { files = fs.readdirSync(path.join(root, "events")).filter((f) => /\.txt$/i.test(f)); } catch (_) { continue; }
      for (const f of files) {
        const t = fs.readFileSync(path.join(root, "events", f), "utf8").replace(/#[^\n]*/g, "");
        for (const m of t.matchAll(/(country_event|news_event|state_event|unit_leader_event|operative_leader_event)\s*=\s*\{([\s\S]*?)\n\}/g)) {
          const body = m[2];
          const pic = /(^|\n)\s*picture\s*=\s*([A-Za-z0-9_]+)/.exec(body);
          if (!pic) { noPicture++; continue; }
          if (m[1] === "news_event") (/^GFX_news_event_/.test(pic[2]) ? newsNews++ : (/^GFX_report_event_/.test(pic[2]) ? newsReport++ : 0));
        }
      }
    }
    rec("hundreds of real events carry no picture at all", noPicture > 500, noPicture);
    rec("news events use the news sprite family", newsNews > 300, { newsNews, newsReport });
    rec("…and NEVER the report family", newsReport === 0, { newsNews, newsReport });
    let gfx = "";
    try { gfx = fs.readFileSync(path.join(V, "interface", "eventpictures.gfx"), "utf8"); } catch (_) {}
    rec("GFX_news_event_001 is a real sprite", /name\s*=\s*"GFX_news_event_001"/.test(gfx), "not found");

    console.log("\n[the bug] a no-edit save must not invent a picture");
    let r = await get(`/api/events/list?modPath=${encodeURIComponent(MOD)}`);
    const ev1 = (r.b.events || []).find((e) => e.fullId === `${NS}.1`);
    rec("the picture-less event read back", !!ev1, (r.b.events || []).map((e) => e.fullId));
    const s1 = await post("/api/events/save", {
      modPath: MOD, namespace: NS, id: "1", type: ev1.type,
      title: ev1.title, description: ev1.description, picture: ev1.picture || "",
      triggeredOnly: ev1.triggeredOnly,
      options: (ev1.options || []).map((o) => ({ name: o.name, title: o.title || "", script: o.script || "", aiChance: o.aiChance, trigger: o.trigger || "" })),
    });
    rec("the save succeeded", s1.s === 200 && !s1.b.error, s1.b || s1.s);
    rec("no picture line was added", !/(^|\n)\s*picture\s*=/.test(blockOf(`${NS}.1`)), blockOf(`${NS}.1`));
    rec("…and the event is otherwise intact",
      /is_triggered_only = yes/.test(blockOf(`${NS}.1`)) && new RegExp(`name = ${NS}\\.1\\.a`).test(blockOf(`${NS}.1`)),
      blockOf(`${NS}.1`));

    console.log("\n[the bug] a NEW news event's default picture must be a NEWS sprite");
    const s2 = await post("/api/events/save", {
      modPath: MOD, namespace: NS, id: "50", type: "news_event",
      title: "Newsflash", description: "D", picture: "", triggeredOnly: "yes",
      options: [{ name: `${NS}.50.a`, title: "OK", script: "" }],
    });
    rec("the save succeeded", s2.s === 200 && !s2.b.error, s2.b || s2.s);
    rec("it got a news-family picture", /picture = GFX_news_event_/.test(blockOf(`${NS}.50`)), blockOf(`${NS}.50`));
    rec("…and NOT the report family", !/picture = GFX_report_event_/.test(blockOf(`${NS}.50`)), blockOf(`${NS}.50`));

    console.log("\n[control] a NEW country event still gets the report family");
    const s3 = await post("/api/events/save", {
      modPath: MOD, namespace: NS, id: "51", type: "country_event",
      title: "Report", description: "D", picture: "", triggeredOnly: "yes",
      options: [{ name: `${NS}.51.a`, title: "OK", script: "" }],
    });
    rec("the save succeeded", s3.s === 200 && !s3.b.error, s3.b || s3.s);
    rec("it got a report-family picture", /picture = GFX_report_event_/.test(blockOf(`${NS}.51`)), blockOf(`${NS}.51`));

    console.log("\n[control] an explicit picture is still written, whatever the type");
    const s4 = await post("/api/events/save", {
      modPath: MOD, namespace: NS, id: "52", type: "news_event",
      title: "Chosen", description: "D", picture: "GFX_report_event_001", triggeredOnly: "yes",
      options: [{ name: `${NS}.52.a`, title: "OK", script: "" }],
    });
    rec("the save succeeded", s4.s === 200 && !s4.b.error, s4.b || s4.s);
    rec("…and the author's choice is respected, not corrected",
      /picture = GFX_report_event_001/.test(blockOf(`${NS}.52`)), blockOf(`${NS}.52`));

    console.log("\n[the bridge] a STATE event cannot be added to a country, and must say so");
    const HIST = path.join(MOD, "history", "countries", "MZA - Mozambique.txt");
    const before = fs.readFileSync(HIST, "utf8");
    const b1 = await post("/api/history/set-startup", {
      modPath: MOD, tag: "MZA", itemId: `${NS}.9`, itemType: "event", active: true, eventHours: 1,
    });
    rec("the request is refused", b1.s >= 400 || !!b1.b.error, { s: b1.s, b: b1.b });
    rec("…and the message names the type and the reason",
      /state_event/.test(String(b1.b.error || "")) && /state/i.test(String(b1.b.error || "")), b1.b.error);
    rec("…and NOTHING was written", fs.readFileSync(HIST, "utf8") === before, fs.readFileSync(HIST, "utf8"));

    console.log("\n[control] a COUNTRY event still bridges, and so does a NEWS event");
    const b2 = await post("/api/history/set-startup", {
      modPath: MOD, tag: "MZA", itemId: `${NS}.1`, itemType: "event", active: true,
    });
    rec("the country event was wired", b2.s === 200 && !b2.b.error, b2.b || b2.s);
    rec("…with a country_event line", new RegExp(`country_event\\s*=\\s*(\\{[^}]*)?${NS.replace(/\./g, "\\.")}\\.1`).test(fs.readFileSync(HIST, "utf8")),
      fs.readFileSync(HIST, "utf8"));
    const b3 = await post("/api/history/set-startup", {
      modPath: MOD, tag: "MZA", itemId: `${NS}.50`, itemType: "event", active: true,
    });
    rec("a NEWS event is allowed too — vanilla bridges 47 of them this way", b3.s === 200 && !b3.b.error, b3.b || b3.s);

    console.log("\n[control] a stray line for an unsupported type can still be REMOVED");
    // The refusal is on adding only; a file that already carries such a line must not become unfixable.
    fs.writeFileSync(HIST, fs.readFileSync(HIST, "utf8") + `country_event = { id = ${NS}.9 hours = 1 }\n`, "utf8");
    const b4 = await post("/api/history/set-startup", {
      modPath: MOD, tag: "MZA", itemId: `${NS}.9`, itemType: "event", active: false,
    });
    rec("removing it succeeds", b4.s === 200 && !b4.b.error, b4.b || b4.s);
    rec("…and the line is gone", !new RegExp(`${NS.replace(/\./g, "\\.")}\\.9`).test(fs.readFileSync(HIST, "utf8")),
      fs.readFileSync(HIST, "utf8"));

    console.log(`\n=== event picture + country bridge: ${checks} checks, ${fails.length} failed ===`);
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
