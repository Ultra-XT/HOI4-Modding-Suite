// #event-preserve-aborts-on-comment-brace — ONE BRACE IN A COMMENT SILENTLY DISARMED THE WHOLE PRESERVE.
//
// The Event Maker rebuilds an event from a fixed model and relies on extractPreservedEventBody to carry
// everything the model does not hold: the author's own `desc` / `title` localisation keys, unmodelled fields
// (`Picture`, `timeout_days`, portraits, modded keys), conditional `desc = { trigger=… text=… }` blocks, a
// mean_time_to_happen with modifiers, and every comment.
//
// That helper walked the file with a hand-rolled counter over every `{` and `}` in the RAW text, and its
// regex could match a COMMENTED-OUT header (`#country_event = {`). Braces inside a comment are invisible to
// HOI4 but not to the counter, and a commented-out block is not always balanced — someone comments an event
// out while balancing and leaves the closing `#}` off:
//
//   vanilla BBA_Ethiopia.txt     code braces balance 0, comments net +1
//   Millennium Dawn Sweden.txt   code braces balance 0, comments net +5
//
// One stray brace was enough. The scan ran past the block it was reading, never got back to depth zero, hit
// the end of the file with `end === -1`, and `break`. Every event after that point was never found, so a
// no-edit save silently dropped all of the above — including rewriting `desc = <id>.desc` to the maker's own
// `<id>.d`, pointing the event at a localisation key nobody has written.
//
// Measured on the real files: the helper found 158 of BBA_Ethiopia.txt's ids before the fix and 181 after.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-evbrace-"));
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
  // server.js is CRLF in the working tree, so a multi-line anchor spelled with \n never matches and the
  // control passes by patching nothing. Normalise, patch, then write it back with the endings it came with.
  const raw = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  const wasCrlf = raw.includes("\r\n");
  let out = wasCrlf ? raw.replace(/\r\n/g, "\n") : raw;
  for (const [from, to] of pairs) {
    if (!out.includes(from)) return { error: "anchor missing: " + from.slice(0, 80) };
    if (out.split(from).length !== 2) return { error: "anchor not unique: " + from.slice(0, 80) };
    out = out.replace(from, to);
  }
  const p = path.join(__dirname, `.ctl-evbrace-${process.pid}-${label}.js`);
  fs.writeFileSync(p, wasCrlf ? out.replace(/\n/g, "\r\n") : out, "utf8");
  ctlFiles.push(p);
  try { return { createApp: require(p).createApp }; } catch (e) { return { error: String(e && e.message) }; }
}

// brace balance split by where the braces live — the shape that made this bug possible
function braceSplit(src) {
  let comment = 0, string = 0, code = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "#") { while (i < src.length && src[i] !== "\n") { if (src[i] === "{") comment++; else if (src[i] === "}") comment--; i++; } continue; }
    if (c === '"') { i++; while (i < src.length && src[i] !== '"') { if (src[i] === "\\") i++; if (src[i] === "{") string++; else if (src[i] === "}") string--; i++; } continue; }
    if (c === "{") code++;
    else if (c === "}") code--;
  }
  return { code, comment, string };
}

// ── the fixture ──────────────────────────────────────────────────────────────────────────────────
// A commented-out event whose closing `#}` is missing, exactly as vanilla and Millennium Dawn ship it, with
// a real event AFTER it carrying material only the preserve can keep.
const FIXTURE = `add_namespace = zzbrace

country_event = {
	id = zzbrace.1
	title = zzbrace.1.t
	desc = zzbrace.1.d
	is_triggered_only = yes
	option = {
		name = zzbrace.1.a
	}
}

# Shelved while we rebalance — put it back when the war goal lands
#country_event = {
#	id = zzbrace.99
#	title = zzbrace.99.t
#	option = {
#		name = zzbrace.99.a
#	}

country_event = {
	id = zzbrace.2
	# the long version, written by Anna
	title = zzbrace.2.t
	desc = zzbrace.2.desc
	is_triggered_only = yes
	Picture = GFX_report_event_generic_sign_treaty2
	timeout_days = 30
	option = {
		name = zzbrace.2.a
		add_political_power = 10
	}
}
`;

function mkMod(name) {
  const dir = path.join(ROOT, name);
  fs.mkdirSync(path.join(dir, "events"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), `name="${name}"\nsupported_version="1.19.*"\n`, "utf8");
  fs.writeFileSync(path.join(dir, "events", "brace.txt"), FIXTURE, "utf8");
  return dir;
}

let PORT = 44160;
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

async function roundTrip(api, mod, onlyId) {
  const listed = await api.get(`/api/events/list?modPath=${encodeURIComponent(mod)}`);
  const events = (listed.b && listed.b.events) || [];
  for (const e of events) {
    if (onlyId && e.fullId !== onlyId) continue;
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
    console.log("\n[ground truth] shipping files really do carry an unbalanced brace inside a comment");
    // ⚠️ MOVED 2026-09-11. This named Millennium Dawn's Sweden.txt as skewed by 5. The owner reinstalled MD and
    // the fresh Sweden.txt balances its comments — and no MD events file carries the shape any more — so the
    // check failed while the fix still held. Rather than name files, each installed corpus is ASKED which of its
    // events files are brace-balanced as script but not in their comments, and the real-corpus round trip below
    // uses the first one found. The fixture and the back-out do not depend on any corpus.
    let corpusFile = null, shipped = 0, readable = 0;
    for (const [label, dir] of [["vanilla", VEV], ["Millennium Dawn", MDEV]]) {
      let files = [];
      try { files = fs.readdirSync(dir).filter((f) => /\.txt$/i.test(f)).sort(); } catch (_) { console.log(`  (skipped — ${label} not installed)`); continue; }
      readable++;
      const skewed = [];
      for (const f of files) {
        const b = braceSplit(fs.readFileSync(path.join(dir, f), "utf8"));
        if (b.code === 0 && b.comment !== 0) skewed.push([f, b.comment]);
      }
      console.log(`     ${label}: ${skewed.length} of ${files.length} events files balance their script braces but not their comments`
        + (skewed.length ? " — " + skewed.slice(0, 4).map(([f, c]) => `${f} (${c > 0 ? "+" : ""}${c})`).join(", ") : ""));
      shipped += skewed.length;
      if (!corpusFile && skewed.length) corpusFile = path.join(dir, skewed[0][0]);
    }
    if (!readable) console.log("  (skipped — no corpus installed)");
    else if (!shipped) console.log("  SKIPPED — no installed events file ships the shape any more; the corpus half cannot run");
    else rec("a shipping events file balances its script braces while its comments do not", !!corpusFile, shipped);

    console.log("\n[the bug] an event after a lopsided comment keeps everything the preserve carries");
    const mod = mkMod("m");
    const events = await roundTrip(mod ? api : api, mod);
    rec("both real events are listed (the commented-out one is not)",
      events.length === 2 && events.map((e) => e.fullId).join(",") === "zzbrace.1,zzbrace.2",
      events.map((e) => e.fullId));

    const text = fs.readFileSync(path.join(mod, "events", "brace.txt"), "utf8");
    rec("the author's own desc key survives (not rewritten to <id>.d)",
      /desc\s*=\s*zzbrace\.2\.desc/.test(text) && !/desc\s*=\s*zzbrace\.2\.d\b/.test(text), text.slice(-600));
    rec("an unmodelled key survives (Picture, capital P)",
      /Picture\s*=\s*GFX_report_event_generic_sign_treaty2/.test(text), text.slice(-600));
    rec("timeout_days survives", /timeout_days\s*=\s*30/.test(text), text.slice(-600));
    rec("the comment above the title survives",
      /the long version, written by Anna/.test(text), text.slice(-600));
    rec("the commented-out event is still commented out",
      /#country_event\s*=\s*\{/.test(text) && !/\n\s*country_event\s*=\s*\{[^}]*id\s*=\s*zzbrace\.99/.test(text),
      text);
    rec("the first event is untouched by all this",
      /id\s*=\s*zzbrace\.1\b/.test(text), text.slice(0, 400));
    rec("the file is still brace-balanced as script", braceSplit(text).code === 0, braceSplit(text));

    console.log("\n[idempotence] a second no-edit round trip changes nothing further");
    const before2 = fs.readFileSync(path.join(mod, "events", "brace.txt"), "utf8");
    await roundTrip(api, mod);
    rec("byte-identical on the second pass",
      fs.readFileSync(path.join(mod, "events", "brace.txt"), "utf8") === before2, "changed again");

    console.log("\n[real corpus] the helper finds the events it used to walk past");
    if (!corpusFile) console.log("  (skipped — no installed events file has the shape)");
    else {
      const base = path.basename(corpusFile);
      console.log(`     round-tripping ${base}`);
      const cmod = mkMod("corpus");
      fs.copyFileSync(corpusFile, path.join(cmod, "events", base));
      const before = fs.readFileSync(path.join(cmod, "events", base), "utf8");
      const descKeysBefore = (before.match(/\bdesc\s*=\s*[A-Za-z0-9_.]+/g) || []).length;
      await roundTrip(api, cmod);
      const after = fs.readFileSync(path.join(cmod, "events", base), "utf8");
      rec("no `.desc` key was rewritten to the maker's `.d` convention",
        (after.match(/\bdesc\s*=\s*[A-Za-z0-9_.]+\.desc\b/g) || []).length
          === (before.match(/\bdesc\s*=\s*[A-Za-z0-9_.]+\.desc\b/g) || []).length,
        { before: (before.match(/\.desc\b/g) || []).length, after: (after.match(/\.desc\b/g) || []).length });
      rec("the desc statements are all still there", (after.match(/\bdesc\s*=\s*[A-Za-z0-9_.]+/g) || []).length >= descKeysBefore,
        { before: descKeysBefore, after: (after.match(/\bdesc\s*=\s*[A-Za-z0-9_.]+/g) || []).length });
      rec("the capital-P Picture key was not deleted",
        (after.match(/\bPicture\s*=/g) || []).length === (before.match(/\bPicture\s*=/g) || []).length,
        { before: (before.match(/\bPicture\s*=/g) || []).length, after: (after.match(/\bPicture\s*=/g) || []).length });
      rec("the file is still brace-balanced as script", braceSplit(after).code === 0, braceSplit(after));
    }
    api.stop();

    console.log("\n[back-out] let a commented-out header derail the scan again");
    {
      const built = controlApp("naivescan", [
        // stop skipping comments when looking for an event header…
        ["  while (i < s.length) {\n    const c = s[i];\n    if (c === \"#\") { while (i < s.length && s[i] !== \"\\n\") i++; continue; }",
         "  while (i < s.length) {\n    const c = s[i];\n    if (false) { while (i < s.length && s[i] !== \"\\n\") i++; continue; }"],
        // …and abandon the rest of the file when a block does not close, as the old scan did
        ["        if (end === -1) { i = open + 1; continue; }", "        if (end === -1) { break; }"],
      ]);
      if (built.error) rec("the control patched cleanly", false, built.error);
      else {
        const capi = await serve(built.createApp());
        const cmod = mkMod("ctl");
        try {
          await roundTrip(capi, cmod, "zzbrace.2");
          const t = fs.readFileSync(path.join(cmod, "events", "brace.txt"), "utf8");
          rec("…and the author's desc key is rewritten to <id>.d",
            /desc\s*=\s*zzbrace\.2\.d\b/.test(t) && !/desc\s*=\s*zzbrace\.2\.desc/.test(t), t.slice(-500));
          rec("…and the unmodelled Picture key is deleted", !/Picture\s*=/.test(t), t.slice(-500));
          rec("…and the comment above the title is gone", !/written by Anna/.test(t), t.slice(-500));
        } finally { capi.stop(); }
      }
    }

    console.log(`\n=== event preserve comment brace: ${checks} checks, ${fails.length} failed ===`);
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
