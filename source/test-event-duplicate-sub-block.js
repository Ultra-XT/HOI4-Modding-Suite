// #event-duplicate-sub-block-dropped — A SECOND `trigger` / `immediate` BLOCK WAS SILENTLY DELETED ON SAVE.
//
// An event, and an option inside it, may declare the same block twice. Shipping content does:
//
//   vanilla          2 events with two `trigger` blocks; 3 options with two `trigger`, 2 with two `ai_chance`
//   Millennium Dawn  8 events with two `immediate` blocks; 1 option with two `trigger`, 1 with two `ai_chance`
//
// (Counted over 6,941 vanilla and 9,340 Millennium Dawn events with a comment- and string-safe walker. An
// earlier count of the same thing saw only 6,437 vanilla events, because its walker aborted on exactly the
// unbalanced comment braces #event-preserve-aborts-on-comment-brace is about, and it reported ZERO options
// with two ai_chance blocks. Measure with a scanner that does not share the bug you are measuring.)
//
// Sibling blocks of one key are not last-wins in Clausewitz — every one is evaluated. Two effect blocks both
// run, in order; two condition blocks must both hold, which is an AND. Nova's readers assigned instead of
// merging: extractEventSubBlockBody returned on the FIRST match and parseEventOptionParts overwrote on each,
// so every occurrence but one was dropped, and a no-edit save deleted it from the file.
//
// Vanilla's AAT_Sweden_nordic_defense_council.1 shows the cost. Its "yes, as a member" option is gated by
// `trigger = { SWE = { has_completed_focus = SWE_decentralized_nordic_army_command } }` and, further down,
// `trigger = { FIN_is_lone_wolf_finland = no }`. The reader kept the second, so a save deleted the focus
// requirement and the option became available to countries that had never taken the focus.
//
// Both readers now concatenate the bodies of sibling blocks into the one block the writer emits.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-evsub-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const VEV = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/events";

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

const ctlFiles = [];
function controlApp(label, pairs) {
  // server.js is CRLF here, so a multi-line anchor written with \n matches nothing and the control would
  // pass while patching nothing. Normalise, patch, restore.
  const raw = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  const wasCrlf = raw.includes("\r\n");
  let out = wasCrlf ? raw.replace(/\r\n/g, "\n") : raw;
  for (const [from, to] of pairs) {
    if (!out.includes(from)) return { error: "anchor missing: " + from.slice(0, 80) };
    if (out.split(from).length !== 2) return { error: "anchor not unique: " + from.slice(0, 80) };
    out = out.replace(from, to);
  }
  const p = path.join(__dirname, `.ctl-evsub-${process.pid}-${label}.js`);
  fs.writeFileSync(p, wasCrlf ? out.replace(/\n/g, "\r\n") : out, "utf8");
  ctlFiles.push(p);
  try { return { createApp: require(p).createApp }; } catch (e) { return { error: String(e && e.message) }; }
}

const FIXTURE = `add_namespace = zzsub

country_event = {
	id = zzsub.1
	title = zzsub.1.t
	desc = zzsub.1.d
	trigger = {
		has_country_flag = first_gate
	}
	immediate = {
		set_country_flag = first_effect
	}
	immediate = {
		set_country_flag = second_effect
	}
	trigger = {
		has_country_flag = second_gate
	}
	option = {
		name = zzsub.1.a
		trigger = {
			has_completed_focus = SOME_FOCUS
		}
		ai_chance = {
			factor = 100
		}
		add_political_power = 10
		trigger = {
			has_country_flag = option_gate
		}
		ai_chance = {
			base = 5
		}
	}
}
`;

function mkMod(name) {
  const dir = path.join(ROOT, name);
  fs.mkdirSync(path.join(dir, "events"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), `name="${name}"\nsupported_version="1.19.*"\n`, "utf8");
  fs.writeFileSync(path.join(dir, "events", "sub.txt"), FIXTURE, "utf8");
  return dir;
}

let PORT = 44200;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      post: (u, b) => fetch(`http://127.0.0.1:${PORT}${u}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) })
        .then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      get: (u) => fetch(`http://127.0.0.1:${PORT}${u}`).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}
async function roundTrip(api, mod) {
  const listed = await api.get(`/api/events/list?modPath=${encodeURIComponent(mod)}`);
  const events = (listed.b && listed.b.events) || [];
  for (const e of events) {
    const [ns, id] = String(e.fullId).split(/\.(?=[^.]*$)/);
    await api.post("/api/events/save", {
      modPath: mod, previousEventId: e.fullId, namespace: ns, id, type: e.type,
      title: e.title, description: e.description, picture: e.picture,
      triggeredOnly: e.triggeredOnly, options: e.options,
      hidden: e.hidden, fireOnce: e.fireOnce, major: e.major,
      mtthDays: e.mtthDays, trigger: e.trigger, immediate: e.immediate,
      after: e.after, timeoutDays: e.timeoutDays,
    });
  }
  return events;
}

(async () => {
  const api = await serve(createApp());
  try {
    console.log("\n[ground truth] vanilla really declares the same block twice");
    const f = path.join(VEV, "AAT_Sweden.txt");
    if (!fs.existsSync(f)) console.log("  (skipped — vanilla not installed)");
    else {
      const src = fs.readFileSync(f, "utf8");
      rec("AAT_Sweden_nordic_defense_council.1 gates an option on a completed focus",
        /has_completed_focus\s*=\s*SWE_decentralized_nordic_army_command/.test(src), "not found");
      rec("…and gates the same option again further down",
        /FIN_is_lone_wolf_finland\s*=\s*no/.test(src), "not found");
    }
    const raj = path.join(VEV, "GOE_Raj.txt");
    if (!fs.existsSync(raj)) console.log("  (skipped — GOE_Raj.txt not installed)");
    else {
      // GOE_RAJ.46 gives its first two options a `factor` ai_chance and then a `base` one.
      const src = fs.readFileSync(raj, "utf8");
      rec("GOE_RAJ.46 writes an option's ai_chance twice",
        /ai_chance\s*=\s*\{\s*\r?\n?\s*factor\s*=\s*100/.test(src) && /ai_chance\s*=\s*\{\s*\r?\n?\s*base\s*=\s*5/.test(src),
        "not found");
    }

    console.log("\n[the bug] a no-edit save keeps every sibling block");
    const mod = mkMod("m");
    await roundTrip(api, mod);
    const t = fs.readFileSync(path.join(mod, "events", "sub.txt"), "utf8");
    rec("both event triggers survive",
      /has_country_flag\s*=\s*first_gate/.test(t) && /has_country_flag\s*=\s*second_gate/.test(t), t);
    rec("both immediate effects survive",
      /set_country_flag\s*=\s*first_effect/.test(t) && /set_country_flag\s*=\s*second_effect/.test(t), t);
    rec("both option triggers survive",
      /has_completed_focus\s*=\s*SOME_FOCUS/.test(t) && /has_country_flag\s*=\s*option_gate/.test(t), t);
    rec("they were merged, not duplicated: one event trigger block",
      (t.match(/^\ttrigger\s*=/gm) || []).length === 1, t.match(/^\ttrigger\s*=/gm));
    rec("…one immediate block", (t.match(/^\timmediate\s*=/gm) || []).length === 1, t.match(/^\timmediate\s*=/gm));
    rec("…one option trigger block", (t.match(/^\t\ttrigger\s*=/gm) || []).length === 1, t.match(/^\t\ttrigger\s*=/gm));
    rec("both halves of the option's twin ai_chance survive",
      /factor\s*=\s*100/.test(t) && /base\s*=\s*5/.test(t), t);
    rec("…in one ai_chance block", (t.match(/\bai_chance\s*=/g) || []).length === 1, t.match(/\bai_chance\s*=/g));
    rec("the file is still brace-balanced", (t.match(/\{/g) || []).length === (t.match(/\}/g) || []).length, t);

    console.log("\n[idempotence] a second no-edit round trip changes nothing further");
    await roundTrip(api, mod);
    rec("byte-identical on the second pass",
      fs.readFileSync(path.join(mod, "events", "sub.txt"), "utf8") === t, "changed again");
    api.stop();

    console.log("\n[back-out] go back to keeping only one of the siblings");
    {
      const built = controlApp("firstwins", [
        ["    if (bodies.length) return bodies.join(\"\\n\");", "    if (bodies.length) return bodies[0];"],
        ["if (o !== -1 && c > o) trigger = trigger ? trigger + \"\\n\" + dedentPdxBlockBodyShared(st.value.slice(o + 1, c)) : dedentPdxBlockBodyShared(st.value.slice(o + 1, c));",
         "if (o !== -1 && c > o) trigger = dedentPdxBlockBodyShared(st.value.slice(o + 1, c));"],
        ["if (ao !== -1 && ac > ao) { const b = s2.value.slice(ao + 1, ac); aiRaw = aiRaw ? aiRaw + \"\\n\" + b : b; }",
         "if (ao !== -1 && ac > ao) { const b = s2.value.slice(ao + 1, ac); aiRaw = b; }"],
      ]);
      if (built.error) rec("the control patched cleanly", false, built.error);
      else {
        const capi = await serve(built.createApp());
        const cmod = mkMod("ctl");
        try {
          await roundTrip(capi, cmod);
          const c = fs.readFileSync(path.join(cmod, "events", "sub.txt"), "utf8");
          rec("…and the second event trigger is deleted", !/second_gate/.test(c), c);
          rec("…and the second immediate effect is deleted", !/second_effect/.test(c), c);
          rec("…and one of the option's two gates is deleted",
            !(/SOME_FOCUS/.test(c) && /option_gate/.test(c)), c);
          rec("…and one half of its twin ai_chance is deleted",
            !(/factor\s*=\s*100/.test(c) && /base\s*=\s*5/.test(c)), c);
        } finally { capi.stop(); }
      }
    }

    console.log(`\n=== event duplicate sub-block: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { api.stop(); } catch (_) {}
    for (const p of ctlFiles) { try { fs.unlinkSync(p); } catch (_) {} }
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
