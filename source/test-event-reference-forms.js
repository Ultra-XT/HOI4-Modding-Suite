// Reference extraction knew only two of the seven ways HOI4 fires an event.
//
// mod-index recognised `country_event = { id = X … }` and the bare `country_event = X` / `news_event = X`.
// It did NOT recognise the BLOCK form of news_event — `news_event = { id = X days = 3 }`, which is how most
// newspaper events are actually fired — nor state_event, unit_leader_event or operative_leader_event in
// either form.
//
// Everything built on the reference graph inherited the blind spot: broken-reference checking, the incoming-
// reference map, and "what fires this?" questions. Measured over the corpora, widening the patterns finds
// about 630 more real event references in each of vanilla and Millennium Dawn.
//
// It is not academic. The demo mod this campaign built fires one of its two events with
// `news_event = { id = nova_audit.2 days = 3 }`; before this fix Nova could not see that firing at all.
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const mi = require("./mod-index.js");

let pass = 0;
const ok = (n, c, x) => { assert.ok(c, n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); console.log("  ok  " + n); pass++; };
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-evforms-"));
mk(path.join(mod, "descriptor.mod"), 'name="EvForms"\nsupported_version="1.19.*"\n');

// One focus firing an event every way the game allows.
const rewards = [
  "country_event = { id = ns.1 days = 2 }",
  "news_event = { id = ns.2 days = 3 }",
  "state_event = { id = ns.3 }",
  "unit_leader_event = { id = ns.4 }",
  "operative_leader_event = { id = ns.5 }",
  "country_event = ns.6",
  "news_event = ns.7",
].map((l) => "\t\t\t" + l).join("\n");
mk(path.join(mod, "common", "national_focus", "f.txt"),
  `focus_tree = {\n\tid = tt\n\tfocus = {\n\t\tid = f1\n\t\tx = 0\n\t\ty = 0\n\t\tcost = 1\n\t\tcompletion_reward = {\n${rewards}\n\t\t}\n\t}\n}\n`);

const r = mi.buildModIndex(mod, {});
const focus = r.entities.find((e) => e.type === "focus" && e.id === "f1");
const seen = focus.refs.filter((x) => x.type === "event").map((x) => x.id).sort();

ok("the focus was indexed", !!focus);
ok("country_event block form is seen", seen.includes("ns.1"), seen);
ok("news_event BLOCK form is seen", seen.includes("ns.2"), seen);
ok("state_event is seen", seen.includes("ns.3"), seen);
ok("unit_leader_event is seen", seen.includes("ns.4"), seen);
ok("operative_leader_event is seen", seen.includes("ns.5"), seen);
ok("the bare country_event form is seen", seen.includes("ns.6"), seen);
ok("the bare news_event form is seen", seen.includes("ns.7"), seen);
ok("…and nothing extra was invented", seen.length === 7, seen);

// An event id may carry a non-numeric tail — vanilla ships BBA_italy_missiolinis.02_north. A pattern that
// stops at the digits silently truncates the reference and then reports the event as missing.
const mod2 = fs.mkdtempSync(path.join(os.tmpdir(), "nova-evtail-"));
mk(path.join(mod2, "descriptor.mod"), 'name="EvTail"\nsupported_version="1.19.*"\n');
mk(path.join(mod2, "common", "national_focus", "f.txt"),
  'focus_tree = {\n\tid = tt\n\tfocus = {\n\t\tid = f1\n\t\tx = 0\n\t\ty = 0\n\t\tcost = 1\n\t\tcompletion_reward = {\n' +
  '\t\t\tcountry_event = { id = ns.02_north hours = 1 }\n\t\t}\n\t}\n}\n');
const r2 = mi.buildModIndex(mod2, {});
const seen2 = r2.entities.find((e) => e.type === "focus").refs.filter((x) => x.type === "event").map((x) => x.id);
ok("an id with a non-numeric tail is captured whole", seen2.includes("ns.02_north"), seen2);

[mod, mod2].forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
console.log("\ntest-event-reference-forms: " + pass + " checks passed");
