// #event-duplicate-option-name-collides — TWO OPTIONS SHARING ONE `name` KEY SWAPPED THEIR AI WEIGHTINGS.
//
// An event's options carry a localisation key in `name`, and two of them may legally hold the SAME key —
// shipping content does it 37 times in vanilla and 29 times in Millennium Dawn, 44 of those with an
// `ai_chance` on at least one of the colliding options. The two preserve helpers that carry an option's
// authored material across a save were both keyed by that name alone:
//
//   extractOnDiskOptionAiChance -> Map(name -> ai_chance body)
//   extractPreservedEventBody   -> optionComments[name] = the note above the option
//
// so the second option overwrote the first. A no-edit save then did two wrong things at once. Option 1 was
// written back out carrying option 2's AI weighting; and option 2 — which the writer renames to <id>.b so the
// two buttons don't share one localisation key — matched nothing in either map, so its `ai_chance` was
// flattened to a bare `base`, losing every `modifier`, and its comment vanished.
//
// Vanilla's denmark_events.100 is the exact shape: "Welcome him" and "Send him away", both named
// denmark_events.100.a, weighted in opposite directions. After a save the AI's reasons for welcoming the
// exiled Danish king were the reasons for sending him away.
//
// Both maps now hold a QUEUE per name, consumed in option order, and the lookup is by the name the option has
// ON DISK (opt.diskName), which also resolves correctly during a rename.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-evdup-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const VEV = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/events";
const MDEV = "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649/events";

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
  const src = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  let out = src;
  for (const [from, to] of pairs) {
    if (!out.includes(from)) return { error: "anchor missing: " + from.slice(0, 70) };
    if (out.split(from).length !== 2) return { error: "anchor not unique: " + from.slice(0, 70) };
    out = out.replace(from, to);
  }
  const p = path.join(__dirname, `.ctl-evdup-${process.pid}-${label}.js`);
  fs.writeFileSync(p, out, "utf8");
  ctlFiles.push(p);
  try { return { createApp: require(p).createApp }; } catch (e) { return { error: String(e && e.message) }; }
}

// ── the fixture ──────────────────────────────────────────────────────────────────────────────────
// Two options under one name key, each with its OWN ai_chance modifier and its OWN note above it, so a
// swap or a flatten is visible rather than merely plausible.
const FIXTURE = `add_namespace = zzdup

country_event = {
	id = zzdup.1
	title = zzdup.1.t
	desc = zzdup.1.d
	is_triggered_only = yes
	# Welcome him
	option = {
		name = zzdup.1.a
		add_political_power = 10
		ai_chance = {
			base = 1
			modifier = {
				factor = 5
				has_government = fascism
			}
		}
	}
	# Send him away
	option = {
		name = zzdup.1.a
		add_stability = 0.1
		ai_chance = {
			base = 1
			modifier = {
				factor = 9
				has_war_with_major = yes
			}
		}
	}
}
`;
// A control fixture whose two options have DISTINCT names — the overwhelmingly common case, which must be
// completely unaffected by the queueing.
const FIXTURE_UNIQ = `add_namespace = zzuniq

country_event = {
	id = zzuniq.1
	title = zzuniq.1.t
	desc = zzuniq.1.d
	is_triggered_only = yes
	# first
	option = {
		name = zzuniq.1.a
		add_political_power = 10
		ai_chance = {
			base = 1
			modifier = {
				factor = 5
				has_government = fascism
			}
		}
	}
	# second
	option = {
		name = zzuniq.1.b
		add_stability = 0.1
		ai_chance = {
			base = 1
			modifier = {
				factor = 9
				has_war_with_major = yes
			}
		}
	}
}
`;
// One option with an ai_chance, one WITHOUT, sharing a name: the option that never had a weighting must not
// inherit the other's. This is why the queue pushes an entry for every option, not only the weighted ones.
const FIXTURE_GAP = `add_namespace = zzgap

country_event = {
	id = zzgap.1
	title = zzgap.1.t
	desc = zzgap.1.d
	is_triggered_only = yes
	option = {
		name = zzgap.1.a
		add_political_power = 10
	}
	option = {
		name = zzgap.1.a
		add_stability = 0.1
		ai_chance = {
			base = 7
			modifier = {
				factor = 9
				has_war_with_major = yes
			}
		}
	}
}
`;

function mkMod(name, fixtures) {
  const dir = path.join(ROOT, name);
  fs.mkdirSync(path.join(dir, "events"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), `name="${name}"\nsupported_version="1.19.*"\n`, "utf8");
  for (const [f, t] of Object.entries(fixtures)) fs.writeFileSync(path.join(dir, "events", f), t, "utf8");
  return dir;
}

// the depth-1 option blocks of an event, in order, as raw text
function optionBlocksOf(text, fullId) {
  const idAt = text.indexOf(`id = ${fullId}`);
  if (idAt === -1) return [];
  let s = text.lastIndexOf("_event", idAt);
  s = text.indexOf("{", s);
  let d = 0, end = -1;
  for (let i = s; i < text.length; i++) {
    const c = text[i];
    if (c === "#") { while (i < text.length && text[i] !== "\n") i++; continue; }
    if (c === '"') { i++; while (i < text.length && text[i] !== '"') { if (text[i] === "\\") i++; i++; } continue; }
    if (c === "{") d++;
    else if (c === "}") { d--; if (d === 0) { end = i; break; } }
  }
  if (end === -1) return [];
  const body = text.slice(s + 1, end);
  const out = [];
  const re = /(^|\n)\s*option\s*=\s*\{/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    const o = body.indexOf("{", m.index);
    let dd = 0, e2 = -1;
    for (let i = o; i < body.length; i++) {
      const c = body[i];
      if (c === "#") { while (i < body.length && body[i] !== "\n") i++; continue; }
      if (c === '"') { i++; while (i < body.length && body[i] !== '"') { if (body[i] === "\\") i++; i++; } continue; }
      if (c === "{") dd++;
      else if (c === "}") { dd--; if (dd === 0) { e2 = i; break; } }
    }
    if (e2 === -1) break;
    re.lastIndex = e2;
    // include the comment line directly above, so a note that moved is detectable
    const lineStart = body.lastIndexOf("\n", m.index + (m[1] ? m[1].length : 0) - 1);
    const above = body.slice(Math.max(0, body.lastIndexOf("\n", lineStart - 1)), lineStart);
    out.push({ text: body.slice(o, e2 + 1), above: above.trim() });
  }
  return out;
}

// events in a corpus whose options share a name key, and how many of those carry an ai_chance
function dupNameStats(dir) {
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => /\.txt$/i.test(f)); } catch (_) { return null; }
  let events = 0, dupEvents = 0, withAi = 0;
  for (const f of files) {
    let src = "";
    try { src = fs.readFileSync(path.join(dir, f), "utf8"); } catch (_) { continue; }
    const re = /(country_event|news_event|state_event|unit_leader_event|operative_leader_event)\s*=\s*\{/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      const start = src.indexOf("{", m.index);
      let d = 0, end = -1;
      for (let i = start; i < src.length; i++) {
        const c = src[i];
        if (c === "#") { while (i < src.length && src[i] !== "\n") i++; continue; }
        if (c === '"') { i++; while (i < src.length && src[i] !== '"') { if (src[i] === "\\") i++; i++; } continue; }
        if (c === "{") d++;
        else if (c === "}") { d--; if (d === 0) { end = i; break; } }
      }
      if (end === -1) break;
      re.lastIndex = end;
      events++;
      const body = src.slice(start + 1, end);
      const idM = /\bid\s*=\s*([A-Za-z0-9_.]+)/.exec(body);
      const opts = optionBlocksOf(src.slice(start - 20 > 0 ? 0 : 0), idM ? idM[1] : "\u0000");
      const names = opts.map((o) => { const n = /\bname\s*=\s*([A-Za-z0-9_.]+)/.exec(o.text); return n ? n[1] : ""; });
      const seen = new Map();
      names.forEach((n) => { if (n) seen.set(n, (seen.get(n) || 0) + 1); });
      const collide = [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);
      if (!collide.length) continue;
      dupEvents++;
      if (opts.some((o, i) => collide.includes(names[i]) && /\bai_chance\s*=/.test(o.text))) withAi++;
    }
  }
  return { events, dupEvents, withAi };
}

let PORT = 44120;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      port: PORT,
      post: (u, b) => fetch(`http://127.0.0.1:${PORT}${u}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) })
        .then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      get: (u) => fetch(`http://127.0.0.1:${PORT}${u}`).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}

// list the mod's events, then hand each one straight back unchanged
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
    console.log("\n[ground truth] shipping content really does reuse one option name key");
    for (const [label, dir, minDup] of [["vanilla", VEV, 20], ["Millennium Dawn", MDEV, 15]]) {
      const st = dupNameStats(dir);
      if (!st) { console.log(`  (skipped — ${label} not installed)`); continue; }
      rec(`${label}: events reusing an option name key is a real population`, st.dupEvents >= minDup,
        st);
      rec(`${label}: …and some of them weight their options`, st.withAi > 0, st);
    }

    console.log("\n[the bug] a no-edit save must not swap or flatten the two weightings");
    const mod = mkMod("m", { "dup.txt": FIXTURE, "uniq.txt": FIXTURE_UNIQ, "gap.txt": FIXTURE_GAP });
    const events = await roundTrip(api, mod);
    rec("all three fixtures parsed", events.length === 3, events.map((e) => e.fullId));

    const dupText = fs.readFileSync(path.join(mod, "events", "dup.txt"), "utf8");
    const opts = optionBlocksOf(dupText, "zzdup.1");
    rec("both options survive the save", opts.length === 2, dupText);
    // ⚠️ This asserted the writer RENAMED the second option to `zzdup.1.b`. That rename was the mechanism
    // that made the five comment-injection anchors unambiguous, not a property this test exists to protect —
    // the header above says the point is that the two weightings must not swap or flatten, and every check
    // below still says so. The rename also rewrote the author's own key: sharing one is a choice (one loc
    // entry, both buttons reading the same text and staying in sync), and 239 events across the install do
    // it. The anchors are occurrence-aware now, so the shared key survives.
    // #event-duplicate-option-name-collides — see test-two-options-may-share-one-name.js
    rec("⭐ the writer KEPT the shared name key the author wrote",
      /name = zzdup\.1\.a/.test(opts[0] ? opts[0].text : "") && /name = zzdup\.1\.a/.test(opts[1] ? opts[1].text : ""),
      opts.map((o) => o.text.slice(0, 60)));
    rec("CONTROL: …and invented no `.b`",
      !/name = zzdup\.1\.b/.test(dupText), dupText.slice(0, 300));
    rec("option 1 keeps ITS OWN weighting (has_government = fascism)",
      /factor\s*=\s*5/.test(opts[0].text) && /has_government\s*=\s*fascism/.test(opts[0].text), opts[0].text);
    rec("option 1 did NOT inherit option 2's (has_war_with_major)",
      !/has_war_with_major/.test(opts[0].text), opts[0].text);
    rec("option 2 keeps ITS OWN weighting (has_war_with_major)",
      /factor\s*=\s*9/.test(opts[1].text) && /has_war_with_major\s*=\s*yes/.test(opts[1].text), opts[1].text);
    rec("option 2's ai_chance was not flattened to a bare base",
      /modifier\s*=\s*\{/.test(opts[1].text), opts[1].text);
    rec("option 1 keeps its own note", opts[0].above === "# Welcome him", opts[0].above);
    rec("option 2 keeps its own note", opts[1].above === "# Send him away", opts[1].above);

    console.log("\n[no regression] distinct names behave exactly as before");
    const uniqOpts = optionBlocksOf(fs.readFileSync(path.join(mod, "events", "uniq.txt"), "utf8"), "zzuniq.1");
    rec("both options survive", uniqOpts.length === 2, uniqOpts.length);
    rec("option a keeps has_government = fascism",
      /has_government\s*=\s*fascism/.test(uniqOpts[0].text) && !/has_war_with_major/.test(uniqOpts[0].text), uniqOpts[0].text);
    rec("option b keeps has_war_with_major",
      /has_war_with_major/.test(uniqOpts[1].text) && !/has_government/.test(uniqOpts[1].text), uniqOpts[1].text);
    rec("their notes stay put", uniqOpts[0].above === "# first" && uniqOpts[1].above === "# second",
      [uniqOpts[0].above, uniqOpts[1].above]);

    console.log("\n[the gap case] an option with no weighting must not inherit one");
    const gapOpts = optionBlocksOf(fs.readFileSync(path.join(mod, "events", "gap.txt"), "utf8"), "zzgap.1");
    rec("both options survive", gapOpts.length === 2, gapOpts.length);
    rec("the unweighted option did not acquire the other's modifier",
      !/has_war_with_major/.test(gapOpts[0].text), gapOpts[0].text);
    rec("the weighted option kept base = 7 and its modifier",
      /base\s*=\s*7/.test(gapOpts[1].text) && /has_war_with_major/.test(gapOpts[1].text), gapOpts[1].text);

    console.log("\n[idempotence] saving a second time changes nothing further");
    const before2 = fs.readFileSync(path.join(mod, "events", "dup.txt"), "utf8");
    await roundTrip(api, mod);
    rec("a second no-edit round trip is byte-identical",
      fs.readFileSync(path.join(mod, "events", "dup.txt"), "utf8") === before2, "changed on the second pass");
    api.stop();

    console.log("\n[back-out] key the ai_chance preserve by name alone again");
    {
      const built = controlApp("aiqueue", [[
        '        out.get(optName).push(aiRaw.trim() ? aiRaw : "");',
        '        out.set(optName, [aiRaw.trim() ? aiRaw : ""]);']]);
      if (built.error) rec("the control patched cleanly", false, built.error);
      else {
        const capi = await serve(built.createApp());
        const cmod = mkMod("ctl-ai", { "dup.txt": FIXTURE });
        try {
          await roundTrip(capi, cmod);
          const o = optionBlocksOf(fs.readFileSync(path.join(cmod, "events", "dup.txt"), "utf8"), "zzdup.1");
          rec("…and option 1 is handed option 2's weighting",
            o.length === 2 && /has_war_with_major/.test(o[0].text), o.map((x) => x.text));
          rec("…and option 2's modifiers are flattened away",
            o.length === 2 && !/modifier\s*=\s*\{/.test(o[1].text), o.map((x) => x.text));
        } finally { capi.stop(); }
      }
    }

    console.log("\n[back-out] key the option comments by name alone again");
    {
      const built = controlApp("optcomment", [[
        "          if (nm0) (res.optionComments[nm0[1]] = res.optionComments[nm0[1]] || []).push(st.leadComment);",
        "          if (nm0) res.optionComments[nm0[1]] = [st.leadComment];"]]);
      if (built.error) rec("the control patched cleanly", false, built.error);
      else {
        const capi = await serve(built.createApp());
        const cmod = mkMod("ctl-cm", { "dup.txt": FIXTURE });
        try {
          await roundTrip(capi, cmod);
          const o = optionBlocksOf(fs.readFileSync(path.join(cmod, "events", "dup.txt"), "utf8"), "zzdup.1");
          rec("…and option 1 is labelled with option 2's note",
            o.length === 2 && o[0].above === "# Send him away", o.map((x) => x.above));
          rec("…and option 2 is left with none",
            o.length === 2 && o[1].above !== "# Send him away", o.map((x) => x.above));
        } finally { capi.stop(); }
      }
    }

    console.log(`\n=== event duplicate option name: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { api.stop(); } catch (_) {}
    for (const p of ctlFiles) { try { fs.unlinkSync(p); } catch (_) {} }
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
