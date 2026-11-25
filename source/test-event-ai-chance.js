// #event-ai-chance-flattened — saving an event deleted or flattened every option's AI weighting.
//
// The Event Maker models an option's ai_chance as a single `base` number: parseEventOptionParts scraped
// `base = N` out of the block and dropped the statement, and the writer re-emitted at most
// `ai_chance = { base = N }`. Two losses on an UNCHANGED open-and-save:
//
//   * an ai_chance written with `factor` and no `base` — the common form — parsed to nothing and the whole
//     block was DELETED, leaving the option at the engine default;
//   * one written as `base` plus `modifier = { … }` blocks was FLATTENED to the bare base, dropping every
//     conditional weight.
//
// That is a meaning change, not formatting. Vanilla's romania.1 "Refuse" option carries base 0 plus four
// modifiers — the modifiers are the entire reason the AI can ever refuse (in a faction, at war with FROM).
// Flattened to `ai_chance = { base = 0 }` it is weight zero forever, against a now-default-weighted "Accept".
//
// `option` is in MANAGED_EVENT_KEYS, so extractPreservedEventBody deliberately skips options and could not
// rescue this. The authored block is now carried forward from disk and only its base number is rewritten when
// the modder actually changed it. Options are matched by `name`, the option's localisation key, which the
// writer preserves.
//
// Measured on the real vanilla events/Romania.txt, saving all 6 events unchanged through the real endpoints:
//   before: ai_chance blocks 11 -> 4, `factor` tokens 18 -> 0
//   after : ai_chance blocks 11 -> 11, `factor` tokens 18 -> 18
// Population at risk: 5944 vanilla / 8646 MD options carry an ai_chance; ~1663 vanilla and ~1548 MD events
// would lose content if opened and saved (one event per save — the save rewrites a single event block).
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-aichance-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const MOD = path.join(ROOT, "probe");
fs.mkdirSync(path.join(MOD, "events"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="AC"\nsupported_version="1.18.*"\n');

const FILE = path.join(MOD, "events", "probe.txt");
fs.writeFileSync(FILE, `add_namespace = probe

country_event = {
	id = probe.1
	title = probe.1.t
	desc = probe.1.d
	picture = GFX_report_event_generic_read_write
	is_triggered_only = yes

	option = {
		name = probe.1.a
		ai_chance = {
			factor = 90
			modifier = {
				factor = 0
				is_in_faction = yes
			}
		}
		add_political_power = 10
	}
	option = {
		name = probe.1.b
		ai_chance = {
			base = 0
			modifier = {
				add = 100
				has_war_with = FROM
			}
		}
		add_stability = 0.05
	}
	option = {
		name = probe.1.c
		ai_chance = { base = 7 }
		add_war_support = 0.05
	}
}
`, "utf8");

const PORT = 39949, app = createApp();
const server = app.listen(PORT, async () => {
  const list = () => fetch(`http://127.0.0.1:${PORT}/api/events/list?modPath=${encodeURIComponent(MOD)}`).then((r) => r.json());
  const save = (e, extra) => fetch(`http://127.0.0.1:${PORT}/api/events/save`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      modPath: MOD, ...e, ...extra,
      namespace: String(e.fullId).split(".")[0],
      id: String(e.fullId).split(".").slice(1).join("."),
    }),
  }).then((r) => r.json());

  try {
    const l1 = await list();
    const ev = (l1.events || []).find((e) => e.fullId === "probe.1");
    ok("the event is read back", !!ev, (l1.events || []).map((e) => e.fullId));
    ok("precondition: it has three options", (ev.options || []).length === 3, ev && ev.options);

    // Save it back UNCHANGED — the whole bug.
    const r = await save(ev);
    // A save that threw would leave the file looking untouched, and every check below would pass vacuously.
    ok("the unchanged save actually succeeds", r && r.ok !== false && !r.error, r);

    const after = fs.readFileSync(FILE, "utf8");
    ok("all three ai_chance blocks survive", (after.match(/ai_chance\s*=\s*\{/g) || []).length === 3,
      (after.match(/ai_chance\s*=\s*\{/g) || []).length);
    ok("the factor-form block is not deleted", /factor\s*=\s*90/.test(after), after);
    ok("…and keeps its modifier", /is_in_faction\s*=\s*yes/.test(after), after);
    ok("the base-form block keeps its modifier too", /has_war_with\s*=\s*FROM/.test(after), after);
    ok("…and its base", /base\s*=\s*0/.test(after), after);
    ok("the plain base-only option still works", /base\s*=\s*7/.test(after), after);
    ok("the file is brace-balanced",
      (() => { let d = 0; for (const c of after) { if (c === "{") d++; else if (c === "}") d--; } return d === 0; })(), after);

    // ── changing the weight must still work, without destroying the modifiers ──────────────────────
    const l2 = await list();
    const ev2 = (l2.events || []).find((e) => e.fullId === "probe.1");
    const opts = (ev2.options || []).map((o) => (o.name === "probe.1.b" ? { ...o, aiChance: 42 } : o));
    const r2 = await save(ev2, { options: opts });
    ok("changing an option's AI weight succeeds", r2 && r2.ok !== false && !r2.error, r2);
    const after2 = fs.readFileSync(FILE, "utf8");
    ok("…the new base is written", /base\s*=\s*42/.test(after2), after2);
    ok("…the old base is gone", !/base\s*=\s*0\b/.test(after2), after2);
    ok("…and that option's modifier is still intact", /has_war_with\s*=\s*FROM/.test(after2), after2);
    ok("…while the other option's factor form is untouched", /factor\s*=\s*90/.test(after2), after2);

    // ── a brand-new option still gets the simple form ──────────────────────────────────────────────
    const l3 = await list();
    const ev3 = (l3.events || []).find((e) => e.fullId === "probe.1");
    const withNew = (ev3.options || []).concat([{ name: "probe.1.d", title: "New", script: "add_manpower = 100", aiChance: 5 }]);
    const r3 = await save(ev3, { options: withNew });
    ok("adding an option succeeds", r3 && r3.ok !== false && !r3.error, r3);
    const after3 = fs.readFileSync(FILE, "utf8");
    ok("…the new option gets a plain ai_chance", /probe\.1\.d[\s\S]{0,220}?base\s*=\s*5/.test(after3), after3);
    ok("…and nothing else lost its weighting", /factor\s*=\s*90/.test(after3) && /has_war_with\s*=\s*FROM/.test(after3), after3);

    console.log("\ntest-event-ai-chance: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 18 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
