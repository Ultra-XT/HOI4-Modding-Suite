// #refusal-after-the-file-was-created — "NOTHING WAS WRITTEN" LEFT A 57 KB COPY OF VANILLA'S GERMANY BEHIND.
//
// /api/history/set-startup wires an event into a country's game-start history. Two event types cannot be
// fired from country scope at all (state_event, operative_leader_event), and the endpoint refuses them with
// a 400 that says, in as many words, "nothing was written".
//
// The refusal sat inside the `event` branch — below `ensureCountryHistoryFileInMod`, which materialises a
// full vanilla-copy override for the country. So the refusal was true about the event line and false about
// everything else: the mod came away with a 57 KB copy of vanilla's "GER - Germany.txt", from a click the
// user was told did nothing. That override is not cosmetic — from then on the mod shadows Germany's entire
// history, freezing it at whatever vanilla shipped and hiding any change a base mod or a later patch makes.
//
// The same handler already had two guards placed ABOVE that line for exactly this reason (the `technology`
// type, and remove-is-a-no-op). This one was added later and left below — the dominant shape again: the fix
// exists next door and one caller never adopted it.
//
// AND THE USER WAS NEVER TOLD. public/events.js and public/owner-bridge.js both wrote owners with a bare
// fetch wrapped in `catch (_e) {}` — and a fetch RESOLVES on a 400, so the catch never even ran. The refusal
// was indistinguishable from a success, and `loadedOwners`/`loaded` was then set to the chosen owners
// regardless, so reopening the item showed owners that are not on disk and the next save would not retry.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { stripJsComments } = require("./testlib-strip-comments.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300));
  }
}

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-bridge-"));
process.env.HOI4_MODS_ROOT = ROOT;
process.env.APPDATA = path.join(ROOT, "appdata");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
const { createApp } = require("./server.js");
const toPosix = (p) => p.split(path.sep).join("/");
const PORT = 53411;

const MOD = path.join(ROOT, "bridgemod");
fs.mkdirSync(path.join(MOD, "events"), { recursive: true });
fs.mkdirSync(path.join(MOD, "history", "countries"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="BridgeMod"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "bridgemod.mod"), `name="BridgeMod"\npath="${toPosix(MOD)}"\nsupported_version="1.19.*"\n`);
fs.writeFileSync(path.join(MOD, "events", "probe_events.txt"), [
  "add_namespace = probe", "",
  "country_event = {", "\tid = probe.1", "\ttitle = probe.1.t", "\tdesc = probe.1.d", "\toption = { name = probe.1.a }", "}", "",
  "state_event = {", "\tid = probe.2", "\ttitle = probe.2.t", "\tdesc = probe.2.d", "\toption = { name = probe.2.a }", "}", "",
  "operative_leader_event = {", "\tid = probe.3", "\ttitle = probe.3.t", "\tdesc = probe.3.d", "\toption = { name = probe.3.a }", "}", "",
].join("\n"));

const countryDir = path.join(MOD, "history", "countries");
const listCountries = () => { try { return fs.readdirSync(countryDir); } catch (_) { return []; } };
const wipeCountries = () => { for (const f of listCountries()) fs.rmSync(path.join(countryDir, f), { force: true }); };

// ⚠️ WIPING IS NOT INSTANT, AND THE ASSERTION BELOW DEPENDS ON IT BEING SO.
//
// safeModWrite writes to a temp file and RENAMES over the target, so a write from the PREVIOUS iteration can
// still be landing when the next one calls wipeCountries(). The rename then completes after the wipe, and
// the next measurement sees a country file it did not create — which this test reports as "the refusal
// wrote something", i.e. it blames the code under test for its own leftovers.
//
// It passed 4/4 run alone and failed inside a full parallel suite, which is exactly the profile: the window
// is tiny on an idle machine and wide on a loaded one. Wait for the directory to be, and STAY, empty rather
// than assuming the previous statement finished.
const settleEmpty = async (ms = 5000) => {
  const deadline = Date.now() + ms;
  let stableSince = 0;
  while (Date.now() < deadline) {
    if (listCountries().length === 0) {
      if (!stableSince) stableSince = Date.now();
      if (Date.now() - stableSince >= 200) return true;
    } else {
      wipeCountries();   // a late rename landed — take it out again
      stableSince = 0;
    }
    await new Promise((r) => setTimeout(r, 25));
  }
  return listCountries().length === 0;
};

(async () => {
  const srv = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
  // Exactly the body public/events.js:406 builds.
  const setStartup = (body) => fetch(`http://127.0.0.1:${PORT}/api/history/set-startup`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));

  console.log("\n[POSITIVE CONTROL] the type a country history CAN fire is still written");
  {
    wipeCountries();
    const r = await setStartup({ tag: "GER", itemId: "probe.1", itemType: "event", active: true, eventDays: 0, eventHours: 0, modPath: MOD });
    rec("a country_event is accepted", r.status === 200 && r.body.ok, r.body);
    const made = listCountries();
    rec("…and the country history is created", made.length === 1, made);
    const txt = made.length ? fs.readFileSync(path.join(countryDir, made[0]), "utf8") : "";
    rec("…with the country_event line in it", /country_event\s*=/.test(txt) && /probe\.1/.test(txt), txt.slice(0, 200));
  }

  console.log("\n[THE BUG] a refusal must leave the mod exactly as it found it");
  for (const [id, kind] of [["probe.2", "state_event"], ["probe.3", "operative_leader_event"]]) {
    wipeCountries();
    // Measure only once the wipe has actually taken effect, or a late rename from the previous iteration is
    // counted against this one. Asserted, not assumed: a wipe that never settles is itself a finding.
    rec(`${kind}: the mod really is empty before the refused call`, await settleEmpty(), listCountries());
    const before = listCountries();
    const r = await setStartup({ tag: "GER", itemId: id, itemType: "event", active: true, eventDays: 0, eventHours: 0, modPath: MOD });
    const after = listCountries();
    rec(`${kind}: refused`, r.status === 400 && /cannot be added to a country/i.test(String(r.body.error)), r.body);
    rec(`${kind}: the message claims nothing was written`, /nothing was written/i.test(String(r.body.error)), r.body.error);
    // …and that claim must be TRUE. This is the whole finding.
    rec(`${kind}: no country history was created`, after.length === before.length, after);
    rec(`${kind}: specifically, no GER override`, !after.some((f) => /^GER/i.test(f)), after);
  }

  console.log("\n[the ordering, in the source] the guard must run before the file is materialised");
  {
    const SRC = stripJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));
    const at = SRC.indexOf('app.post("/api/history/set-startup"');
    const body = at === -1 ? "" : SRC.slice(at, SRC.indexOf('app.post("/api/history/set-startup-all"', at) > at
      ? SRC.indexOf('app.post("/api/history/set-startup-all"', at) : at + 9000);
    rec("the handler is found", body.length > 500, body.length);
    const guardAt = body.indexOf("COUNTRY_BRIDGE_UNSUPPORTED");
    const createAt = body.indexOf("ensureCountryHistoryFileInMod(");
    rec("the refusal is present", guardAt !== -1, "guard gone");
    rec("the materialising call is present", createAt !== -1, "call gone");
    // ⭐ The ordering IS the fix. A source check here is worth having because the two lines are 30 apart and
    // a later edit could easily move one back inside the branch.
    rec("the refusal comes FIRST", guardAt !== -1 && createAt !== -1 && guardAt < createAt, { guardAt, createAt });
    // The sibling endpoint never materialises anything, so its guard placement is not load-bearing — but it
    // must still refuse. Assert that, so a refactor cannot quietly drop it.
    const allAt = SRC.indexOf('app.post("/api/history/set-startup-all"');
    const allBody = allAt === -1 ? "" : SRC.slice(allAt, allAt + 4000);
    rec("the all-countries endpoint refuses too", /COUNTRY_BRIDGE_UNSUPPORTED/.test(allBody), "guard missing");
  }

  console.log("\n[THE SILENCE] a refused owner write must reach the user");
  {
    for (const [file, label] of [["public/events.js", "events maker"], ["public/owner-bridge.js", "shared owner bridge (decisions, spirits)"]]) {
      const CODE = stripJsComments(fs.readFileSync(path.join(__dirname, file), "utf8"));
      // The exact swallow: a set-startup call wrapped in catch(){} with no status check.
      rec(`${label}: no bare catch around a set-startup write`,
        !/try \{ await post\("\/api\/history\/set-startup/.test(CODE), "the swallow is back");
      rec(`${label}: post() checks the response`, /if \(!r\.ok/.test(CODE), "response status ignored");
      rec(`${label}: failures are collected`, /failed\.push\(/.test(CODE), "failures not collected");
      // ⭐ And the collection must be USED — a list nobody reads is the same silence with more code.
      rec(`${label}: …and surfaced`, /ownerWarn|setStatus\(`⚠/.test(CODE), "collected but never shown");
      // The book-keeping: what we believe is on disk must not include a write that was refused.
      rec(`${label}: refused owners are not recorded as written`, /failedTags/.test(CODE), "loaded set unconditionally");
    }
  }

  console.log("\n[the seam] the events maker actually reads what sync returns");
  {
    const CODE = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "events.js"), "utf8"));
    rec("sync returns its failures", /return \{ failed \};/.test(CODE), "no return");
    rec("the caller captures them", /const ownerSync = await syncEventOwnersToGame\(/.test(CODE), "return value discarded");
    // Both exits from the save path — the ordinary one and the global-date one — must carry it, or half
    // the saves stay silent.
    const alerts = CODE.match(/nbAlert\([^;]*/g) || [];
    const warned = alerts.filter((a) => /ownerWarn/.test(a));
    rec("…and both save messages carry the warning", warned.length === 2, { alerts: alerts.length, warned: warned.length });
  }

  srv.closeAllConnections(); srv.close();
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}

  console.log(`\n=== country bridge refusal writes nothing: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
