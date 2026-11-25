// Live integration: boot the real /api/events/save endpoint, save a CHANGE to an existing rich event,
// and assert the on-disk file survives. Two survival kinds: MODELED fields the maker now owns (timeout_days
// + after — the client loads them and re-sends them, so they round-trip through the managed serializer,
// emitted exactly once) and still-un-modeled fields (conditional descs / mtth-modifier / portraits) carried
// verbatim by extractPreservedEventBody. Mirrors the real client, which repopulates + resends every field.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };

// ── temp mod with a realistic event that uses everything the maker doesn't model ──
const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-evt-int-"));
fs.mkdirSync(path.join(mod, "events"), { recursive: true });
const evtPath = path.join(mod, "events", "intg.txt");
const original = `add_namespace = intg

country_event = {
	id = intg.4
	title = intg.4.t

	desc = {
		text = intg.4.d_a
		trigger = { has_war = yes }
	}
	desc = {
		text = intg.4.d_b
		trigger = { has_war = no }
	}

	picture = GFX_report_event_generic_sit_table
	is_triggered_only = no
	fire_only_once = yes

	timeout_days = 30
	left_portrait = GER_leader
	right_portrait = SOV_leader

	mean_time_to_happen = {
		days = 50
		modifier = { factor = 0.5 has_war = yes }
	}

	after = {
		add_stability = 0.05
	}

	option = {
		name = intg.4.a
		add_political_power = 100
	}
}
`;
fs.writeFileSync(evtPath, original, "utf8");

const app = createApp();
const server = http.createServer(app);

function post(pathname, body) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body));
    const req = http.request({ host: "127.0.0.1", port: server.address().port, path: pathname, method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": data.length } }, (res) => {
      let out = ""; res.on("data", c => out += c); res.on("end", () => resolve({ status: res.statusCode, body: out }));
    });
    req.on("error", reject); req.write(data); req.end();
  });
}

server.listen(0, "127.0.0.1", async () => {
  try {
    // Re-save the event with a CHANGED option effect (the modder edits one thing) — everything else must survive.
    const resp = await post("/api/events/save", {
      modPath: mod, namespace: "intg", id: "4", type: "country_event",
      title: "Title", description: "Desc", picture: "GFX_report_event_generic_sit_table",
      triggeredOnly: "no", hidden: "no", fireOnce: "yes", major: "no", mtthDays: 50,
      trigger: "", immediate: "",
      // Modeled advanced fields the real client loads from disk and re-sends.
      timeoutDays: 30, after: "add_stability = 0.05",
      options: [{ name: "intg.4.a", title: "Proceed", script: "add_political_power = 250" }],
    });
    check("save returned 200", resp.status === 200, resp.status + " " + resp.body);

    const after = fs.readFileSync(evtPath, "utf8");
    const balanced = (() => { let d = 0; for (const c of after) { if (c === "{") d++; else if (c === "}") { d--; if (d < 0) return false; } } return d === 0; })();
    check("file still brace-balanced after save", balanced);
    check("the edit landed (option PP now 250)", /add_political_power\s*=\s*250/.test(after));
    check("timeout_days survived re-save (modeled, once)", /timeout_days\s*=\s*30/.test(after) && (after.match(/\btimeout_days\s*=/g) || []).length === 1, after);
    check("after block survived (modeled, exactly one)", /after\s*=\s*\{[\s\S]*add_stability\s*=\s*0\.05/.test(after) && (after.match(/\bafter\s*=\s*\{/g) || []).length === 1, (after.match(/\bafter\s*=\s*\{/g) || []).length);
    check("left_portrait survived", /left_portrait\s*=\s*GER_leader/.test(after));
    check("right_portrait survived", /right_portrait\s*=\s*SOV_leader/.test(after));
    check("conditional desc d_a survived with trigger", /intg\.4\.d_a/.test(after) && /has_war\s*=\s*yes/.test(after));
    check("conditional desc d_b survived with trigger", /intg\.4\.d_b/.test(after) && /has_war\s*=\s*no/.test(after));
    check("mtth modifier survived", /modifier/.test(after) && /factor\s*=\s*0\.5/.test(after));
    check("exactly one mean_time_to_happen block (no duplicate)", (after.match(/mean_time_to_happen/g) || []).length === 1, (after.match(/mean_time_to_happen/g) || []).length);
    check("did NOT flatten conditional desc to a single 'desc = intg.4.d' key", !/\bdesc\s*=\s*intg\.4\.d\b/.test(after), after);
    check("event still parses to exactly one country_event block", (after.match(/country_event\s*=\s*\{/g) || []).length === 1);
  } catch (e) {
    fail++; console.log("  FAIL harness threw →", e && e.message);
  } finally {
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    console.log(`\nEVENT-SAVE-INTEGRATION: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
});
