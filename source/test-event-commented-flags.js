// #commented-flag-read-as-live — a flag the author had COMMENTED OUT was read as live and written back
// uncommented, silently changing when (or whether) the event fires.
//
// parseEventsFromFile read is_triggered_only / hidden / fire_only_once / major / picture / mean_time_to_happen
// with bare regexes over the raw block text, with no comment handling. `#hidden = yes` matches
// /\bhidden\s*=\s*yes/ perfectly well, so the checkbox loaded ticked and the writer emitted it as real script:
//
//   #hidden = yes            -> a visible popup becomes permanently invisible (a hidden event fires its
//                               immediate and never shows a window)
//   #is_triggered_only = yes -> a date- or MTTH-fired event stops firing on its own
//   #fire_only_once = yes    -> a repeatable event becomes a one-shot
//
// Commenting a flag out is how people disable one while balancing, so this is ordinary content, not an edge
// case: 197 commented event flags in vanilla and 141 in Millennium Dawn. Real examples — vanilla's
// denmark_expansion_event.100 (#fire_only_once), vanilla's germany.20 (#is_triggered_only, above its real
// date trigger), MD's USA_FOCUS.9 (#hidden).
//
// Only the SCALAR reads use a comment-stripped copy. The trigger/immediate/after sub-blocks keep the raw
// text, because a comment in there is the modder's own script and has to round-trip.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-cflags-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const MOD = path.join(ROOT, "probe");
fs.mkdirSync(path.join(MOD, "events"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="CF"\nsupported_version="1.18.*"\n');

const FILE = path.join(MOD, "events", "probe.txt");
fs.writeFileSync(FILE, `add_namespace = probe

country_event = {
	id = probe.1
	title = probe.1.t
	desc = probe.1.d
	picture = GFX_report_event_generic_read_write
	#picture = GFX_report_event_wrong_one

	#hidden = yes
	#fire_only_once = yes
	#is_triggered_only = yes
	#major = yes

	trigger = {
		date > 1936.6.1   # the real gate, and this note must survive
	}

	option = {
		name = probe.1.a
		add_political_power = 10
	}
}

country_event = {
	id = probe.2
	title = probe.2.t
	desc = probe.2.d
	picture = GFX_report_event_generic_read_write
	hidden = yes
	fire_only_once = yes
	is_triggered_only = yes

	option = { name = probe.2.a add_political_power = 5 }
}
`, "utf8");

const PORT = 39953, app = createApp();
const server = app.listen(PORT, async () => {
  const list = () => fetch(`http://127.0.0.1:${PORT}/api/events/list?modPath=${encodeURIComponent(MOD)}`).then((r) => r.json());
  const save = (e) => fetch(`http://127.0.0.1:${PORT}/api/events/save`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      modPath: MOD, ...e,
      namespace: String(e.fullId).split(".")[0],
      id: String(e.fullId).split(".").slice(1).join("."),
    }),
  }).then((r) => r.json());

  try {
    const l = await list();
    const e1 = (l.events || []).find((x) => x.fullId === "probe.1");
    const e2 = (l.events || []).find((x) => x.fullId === "probe.2");
    ok("both events are read", !!e1 && !!e2, (l.events || []).map((x) => x.fullId));

    // ── the commented flags must NOT load as set ────────────────────────────────────────────────────
    ok("a commented-out hidden does not load as hidden", e1.hidden !== "yes", e1.hidden);
    ok("…nor fire_only_once", e1.fireOnce !== "yes", e1.fireOnce);
    ok("…nor is_triggered_only", e1.triggeredOnly !== "yes", e1.triggeredOnly);
    ok("…nor major", e1.major !== "yes", e1.major);
    ok("the LIVE picture wins over the commented one", e1.picture === "GFX_report_event_generic_read_write", e1.picture);

    // ── while genuinely live flags still load ──────────────────────────────────────────────────────
    ok("a real hidden still loads as set", e2.hidden === "yes", e2.hidden);
    ok("…a real fire_only_once too", e2.fireOnce === "yes", e2.fireOnce);
    ok("…and a real is_triggered_only", e2.triggeredOnly === "yes", e2.triggeredOnly);

    // ── and an unchanged save must not promote the comments to live script ─────────────────────────
    const r = await save(e1);
    ok("the unchanged save succeeds", r && r.ok !== false && !r.error, r);
    const after = fs.readFileSync(FILE, "utf8");
    const block1 = /country_event = \{[\s\S]*?\n\}/.exec(after)[0];
    ok("the event did not gain a live hidden", !/^\s*hidden = yes/m.test(block1), block1);
    ok("…nor a live fire_only_once", !/^\s*fire_only_once = yes/m.test(block1), block1);
    ok("…nor a live major", !/^\s*major = yes/m.test(block1), block1);
    // …and the same for is_triggered_only. ⚠️ THE RULE IS "NOT PROMOTED TO LIVE", NOT "WRITTEN AS NO" — this
    // asserted `/is_triggered_only = no/`, which only held because the writer used to emit the key
    // unconditionally. It no longer does (#no-invented-event-header-keys: 5,048 events across the corpora
    // have no is_triggered_only at all, and gained one on every save), and this event never had a live one,
    // so ABSENT is now the truthful output and equivalent to `no` in HOI4. Generalised to the property that
    // was always the point, with the two halves that make it bite kept explicit below.
    ok("…nor a live is_triggered_only", !/^\s*is_triggered_only\s*=\s*yes/m.test(block1), block1);
    ok("…and the commented-out one is still there, still commented",
      /^\s*#\s*is_triggered_only\s*=\s*yes/m.test(block1), block1);
    ok("the comment inside the trigger block survives",
      /the real gate, and this note must survive/.test(after), after);
    ok("the real trigger survives", /date > 1936\.6\.1/.test(after), after);
    ok("the file is brace-balanced",
      (() => { let d = 0; for (const c of after) { if (c === "{") d++; else if (c === "}") d--; } return d === 0; })(), after);

    // ── saving the genuinely-flagged event keeps its flags ─────────────────────────────────────────
    const l2 = await list();
    const r2 = await save((l2.events || []).find((x) => x.fullId === "probe.2"));
    ok("saving the live-flag event succeeds", r2 && r2.ok !== false && !r2.error, r2);
    const after2 = fs.readFileSync(FILE, "utf8");
    const block2 = after2.slice(after2.indexOf("id = probe.2"));
    ok("its real hidden survives", /hidden = yes/.test(block2), block2.slice(0, 300));
    ok("…and its real fire_only_once", /fire_only_once = yes/.test(block2), block2.slice(0, 300));

    console.log("\ntest-event-commented-flags: " + pass + "/" + total + " checks passed");
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
