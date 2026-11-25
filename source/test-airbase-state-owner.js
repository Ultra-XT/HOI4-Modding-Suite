// #airbase-state-owner — THE AIR-BASE STATE BOX ASKED YOU TO KNOW A NUMBER.
//
// Reported from play: the airbase state list should filter by owner.
//
// There was no list. "Air-base state" was a bare <input type="number"> with a placeholder of "e.g. 278", so
// basing an air wing meant knowing the numeric id of the state you wanted, out of 1,081 in the audit mod.
//
// The data was already served. /api/buildings/state-catalog returns every state's id, display name and
// ownerTag, and already sorts a given countryTag's states to the front — it just could not be pointed at a
// mod, because it only took a focusPath or fell back to the persisted active root. That is the focus
// editor's shape, and the Military page has a mod in hand and no focus path.
//
// Ownership is a SOFT filter here, deliberately. A mod may legitimately base a wing abroad (vanilla does),
// so the other states are still listed — after the owner's, and labelled with whose they are. Filtering them
// out would replace "I can't find my state" with "my state has vanished".
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-abstate-"));
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
const ARMY = fs.readFileSync(path.join(__dirname, "public", "army.js"), "utf8");
const HTML = fs.readFileSync(path.join(__dirname, "public", "army.html"), "utf8");

const ctlFiles = [];
function controlApp(label, pairs) {
  const raw = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  const wasCrlf = raw.includes("\r\n");
  let out = wasCrlf ? raw.replace(/\r\n/g, "\n") : raw;
  for (const [from, to] of pairs) {
    if (!out.includes(from)) return { error: "anchor missing: " + from.slice(0, 90) };
    if (out.split(from).length !== 2) return { error: "anchor not unique: " + from.slice(0, 90) };
    out = out.replace(from, to);
  }
  const p = path.join(__dirname, `.ctl-abstate-${process.pid}-${label}.js`);
  fs.writeFileSync(p, wasCrlf ? out.replace(/\n/g, "\r\n") : out, "utf8");
  ctlFiles.push(p);
  try { return { createApp: require(p).createApp }; } catch (e) { return { error: String(e && e.message) }; }
}

// A mod with three states: two owned by NUA, one by GER.
function mkMod() {
  const dir = path.join(ROOT, "m");
  fs.mkdirSync(path.join(dir, "history", "states"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), 'name="m"\nsupported_version="1.19.*"\n', "utf8");
  const st = (id, name, owner, prov) => [
    "state = {", `\tid = ${id}`, `\tname = "${name}"`, "\tmanpower = 100000",
    "\tstate_category = rural",
    "\thistory = {", `\t\towner = ${owner}`, `\t\tvictory_points = { ${prov} 5 }`, "\t}",
    `\tprovinces = { ${prov} }`, "}", ""].join("\n");
  fs.writeFileSync(path.join(dir, "history", "states", "900-Alpha.txt"), st(900, "STATE_900", "NUA", 9001), "utf8");
  fs.writeFileSync(path.join(dir, "history", "states", "901-Beta.txt"), st(901, "STATE_901", "GER", 9011), "utf8");
  fs.writeFileSync(path.join(dir, "history", "states", "902-Gamma.txt"), st(902, "STATE_902", "NUA", 9021), "utf8");
  return dir;
}

let PORT = 46000;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      get: (u) => fetch(`http://127.0.0.1:${PORT}${u}`).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}

(async () => {
  let api = null;
  try {
    const mod = mkMod();
    api = await serve(createApp());

    console.log("\n[the catalogue] can be pointed at a mod, and puts the owner's states first");
    const r = await api.get(`/api/buildings/state-catalog?modPath=${encodeURIComponent(mod)}&countryTag=NUA`);
    rec("the endpoint answers", r.s === 200 && Array.isArray(r.b.items), r.b.error || Object.keys(r.b || {}));
    rec("…honouring the modPath it was given",
      String(r.b.modRoot || "").toLowerCase().includes(path.basename(mod).toLowerCase()), r.b.modRoot);
    const items = r.b.items || [];
    const mine = items.filter((x) => x.ownerTag === "NUA");
    rec("…and finds the mod's states", mine.length >= 2, items.map((x) => `${x.stateId}:${x.ownerTag}`).slice(0, 6));
    const firstOther = items.findIndex((x) => x.ownerTag !== "NUA");
    rec("…with every one of the owner's before the first foreign one",
      firstOther === mine.length, { firstOther, mine: mine.length });
    rec("…and the foreign one is still listed, not hidden",
      items.some((x) => x.ownerTag === "GER"), items.map((x) => x.ownerTag));
    rec("…each carrying an id, a name and an owner",
      items.every((x) => x.stateId != null && x.ownerTag !== undefined && "displayName" in x), items[0]);
    api.stop(); api = null;

    console.log("\n[the picker] the box is no longer a number you have to know");
    rec("army.html has a Browse button beside the state box", /id="naStateBrowseBtn"/.test(HTML), "no button");
    rec("…wired to the state browser", /naStateBrowseBtn[\s\S]{0,200}?openStateBrowser\(\)/.test(ARMY), "not wired");
    rec("openStateBrowser exists", /async function openStateBrowser\(/.test(ARMY), "not found");
    rec("…asking for the OWNER chosen beside the box, falling back to the country being edited",
      /naAirOwner[\s\S]{0,80}?S\.country/.test(ARMY), "does not read the owner");
    rec("…passing the mod explicitly rather than trusting the active root",
      /qs = new URLSearchParams\(\{ modPath: modPath\(\) \}\)/.test(ARMY), "no modPath");
    rec("…reading `items`, since the catalogue carries no ok flag",
      /Array\.isArray\(d\.items\) \? d\.items : \[\]/.test(ARMY), "checks the wrong key");
    rec("…labelling a state the owner actually owns", /— owned/.test(ARMY), "no owned label");
    rec("…and naming whose the others are", /s\.ownerTag \? \(s\.ownerTag === owner/.test(ARMY), "no foreign owner label");
    // The browser is now shared with the land deploy card (#deploy-state-id-blind-box), so the input it
    // fills is a parameter whose DEFAULT is this box. That default is what this check protects; that the
    // air-base call really lands in naState — and the deploy call really does not — is measured by driving
    // the function in test-deploy-state-picker.js.
    rec("…filling the state box on pick",
      /const targetId = \(opts && opts\.target\) \|\| "naState";/.test(ARMY) && /eqbSetInput\(targetId, id\)/.test(ARMY),
      "does not fill the box");
    rec("…and saying so when the list cannot be read, rather than opening an empty picker",
      /Couldn't read the state list/.test(ARMY), "fails silently");

    console.log("\n[ordering] state ids are numbers, and must not sort like words");
    rec("the browser sorts numeric ids numerically",
      /Number\.isFinite\(na\) && Number\.isFinite\(nb\)[\s\S]{0,120}?return na - nb/.test(ARMY), "string sort only");
    rec("…while non-numeric ids still sort as text",
      /return String\(a\.id\)\.localeCompare\(String\(b\.id\)\)/.test(ARMY), "text sort lost");
    rec("…and the owner's rows still come first regardless",
      /const own = \(b\.own \? 1 : 0\) - \(a\.own \? 1 : 0\);\s*\n\s*if \(own\) return own;/.test(ARMY), "own-first lost");

    console.log("\n[back-out] ignore the modPath again");
    {
      const built = controlApp("nomodpath", [[
        "      let modRoot = (modPathRaw && path.isAbsolute(modPathRaw) && fs.existsSync(modPathRaw)) ? modPathRaw : getActiveRoot();",
        "      let modRoot = getActiveRoot();"]]);
      if (built.error) rec("the control patched cleanly", false, built.error);
      else {
        const capi = await serve(built.createApp());
        try {
          const c = await capi.get(`/api/buildings/state-catalog?modPath=${encodeURIComponent(mod)}&countryTag=NUA`);
          rec("…and the catalogue reads a different mod than the one asked for",
            !String(c.b.modRoot || "").toLowerCase().includes(path.basename(mod).toLowerCase()), c.b.modRoot);
        } finally { capi.stop(); }
      }
    }

    console.log("\n[still valid]");
    rec("army.js parses", (() => { try { new Function(ARMY); return true; } catch (e) { return String(e.message); } })() === true,
      (() => { try { new Function(ARMY); return "ok"; } catch (e) { return String(e.message); } })());
    rec("army.js is versioned so the change ships", /army\.js\?v=\d+/.test(HTML), "no version");

    console.log(`\n=== airbase state owner: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (api) api.stop(); } catch (_) {}
    for (const p of ctlFiles) { try { fs.unlinkSync(p); } catch (_) {} }
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
