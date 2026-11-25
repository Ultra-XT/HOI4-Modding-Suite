// #gated-spirit-remove-is-a-silent-no-op — COUNTRY SETUP LISTED SPIRITS ITS REMOVE COULD NOT TAKE OUT.
//
// /api/history/country-spirits — the list Country Setup draws — scans EVERY `add_ideas` block in the
// pre-date region with no brace-depth check, so it lists spirits sitting inside a DLC gate such as
// `if = { limit = { has_dlc = "Arms Against Tyranny" } add_ideas = { … } }`. The writer
// setIdeaInHistoryText is depth-checked on purpose (#spirit-lands-inside-the-dlc-gate) and returns the text
// untouched for such an id, so POST /api/history/set-startup {active:false} answered
// {ok:true, unchanged:true} and wrote nothing.
//
// No client anywhere reads `unchanged`. public/country-setup.js only checks `noop`, which is set by the
// "your mod does not own this country" branch and therefore NOT set here — so the page advanced
// savedSpirits, announced "Country details saved successfully!", reloaded, and the spirit was still there
// with nothing saying why. public/owner-bridge.js counted it as written and dropped the tag from `loaded`.
//
// Measured across the six installed corpora: 101 country history files declare 535 spirits this way —
// vanilla alone 45 files / 181 spirits (ARG, AST, AUS, BRA, BUL, SWE, …).
//
// Refusing to edit inside the gate is still the right behaviour; being silent about it is not. The refusal
// now goes out on `refWarning`, the channel public/loading-overlay.js already drains for every write.
//
// What must NOT change is pinned below: a top-level add and a top-level remove still write, and neither
// they nor a genuinely empty no-op (re-adding a spirit that is already there, removing one that was never
// there) may produce a warning.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-gatedspirit-"));
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

const ctlFiles = [];
function controlApp(label, pairs) {
  const raw = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  const wasCrlf = raw.includes("\r\n");
  let out = wasCrlf ? raw.replace(/\r\n/g, "\n") : raw;
  for (const [from, to] of pairs) {
    if (!out.includes(from)) return { error: "anchor missing: " + from.slice(0, 90) };
    if (out.split(from).length !== 2) return { error: "anchor not unique: " + from.slice(0, 90) };
    out = out.replace(from, () => to);
  }
  const p = path.join(__dirname, `.ctl-gatedspirit-${process.pid}-${label}.js`);
  fs.writeFileSync(p, wasCrlf ? out.replace(/\n/g, "\r\n") : out, "utf8");
  ctlFiles.push(p);
  try { return { createApp: require(p).createApp }; } catch (e) { return { error: String(e && e.message) }; }
}

// A country whose ONLY pre-date add_ideas sits inside a DLC gate — the shape 101 shipped history files use.
const GATED = [
  "capital = 1",
  "",
  "if = {",
  "\tlimit = { has_dlc = \"Arms Against Tyranny\" }",
  "\tadd_ideas = {",
  "\t\tnua_gated_spirit",
  "\t\tnua_gated_second",
  "\t}",
  "}",
  "",
  "set_research_slots = 3",
  ""].join("\n");

let seq = 0;
function mkMod(body) {
  const dir = path.join(ROOT, "m" + (++seq));
  fs.mkdirSync(path.join(dir, "history", "countries"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), 'name="m"\nsupported_version="1.19.*"\n', "utf8");
  fs.writeFileSync(path.join(dir, "history", "countries", "NUA - Nova.txt"), body, "utf8");
  return dir;
}
const histPath = (dir) => path.join(dir, "history", "countries", "NUA - Nova.txt");
const histOf = (dir) => fs.readFileSync(histPath(dir), "utf8");
const bytesOf = (dir) => fs.readFileSync(histPath(dir));

// Depth of the first occurrence of `needle`, counted the way the game reads the file.
function depthOf(text, needle) {
  const at = text.indexOf(needle);
  if (at === -1) return -1;
  let d = 0;
  for (let i = 0; i < at; i++) {
    const c = text[i];
    if (c === "#") { while (i < text.length && text[i] !== "\n") i++; continue; }
    if (c === '"') { i++; while (i < text.length && text[i] !== '"') { if (text[i] === "\\") i++; i++; } continue; }
    if (c === "{") d++;
    else if (c === "}") d = Math.max(0, d - 1);
  }
  return d;
}

let PORT = 53624; // assigned range 53620-53639
function serve(app) {
  return new Promise((resolve) => {
    const port = ++PORT;
    const s = app.listen(port, () => resolve({
      // EXACTLY the body public/country-setup.js:1311 builds.
      spirit: (dir, itemId, active) => fetch(`http://127.0.0.1:${port}/api/history/set-startup`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag: "NUA", itemId, itemType: "spirit", active, modPath: dir }),
      }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      // EXACTLY the request public/country-setup.js:854 makes.
      list: (dir) => fetch(`http://127.0.0.1:${port}/api/history/country-spirits?tag=NUA&modPath=${encodeURIComponent(dir)}`)
        .then((r) => r.json()),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}
const warnOf = (r) => String((r && r.b && r.b.refWarning) || "");

(async () => {
  let api = null;
  try {
    api = await serve(createApp());

    console.log("\n[the fixture really has the property] the spirit is gated, and the LIST still offers it");
    const dir = mkMod(GATED);
    rec("the fixture declares the spirit BELOW depth zero", depthOf(histOf(dir), "nua_gated_spirit") === 2,
      { depth: depthOf(histOf(dir), "nua_gated_spirit") });
    rec("…and the file has no top-level add_ideas at all",
      depthOf(histOf(dir), "add_ideas") === 1, histOf(dir));
    const l0 = await api.list(dir);
    rec("Country Setup's list offers it anyway", Array.isArray(l0.spirits) && l0.spirits.includes("nua_gated_spirit"), l0);
    rec("…from a file the mod owns, so the `noop` branch the client already handles cannot fire",
      l0.inMod === true, l0);

    console.log("\n[the defect] Remove writes nothing — and now says so");
    const before = bytesOf(dir);
    const r = await api.spirit(dir, "nua_gated_spirit", false);
    const after = bytesOf(dir);
    rec("the remove still answers ok (it is a refusal, not a failure)", r.s === 200 && r.b && r.b.ok === true, r.b);
    rec("…the file is byte-identical, so nothing was removed", before.equals(after), "the file moved");
    rec("…and the spirit is still on disk", /nua_gated_spirit/.test(histOf(dir)), histOf(dir));
    rec("…`noop`, the only flag the client reads, is NOT set", !(r.b && r.b.noop), r.b);
    rec("THE FIX: the reply carries a warning", warnOf(r).length > 0, r.b);
    rec("…that names the spirit", warnOf(r).includes("nua_gated_spirit"), warnOf(r));
    rec("…says nothing was removed", /nothing was removed/i.test(warnOf(r)), warnOf(r));
    rec("…names the file to open", warnOf(r).includes("NUA - Nova.txt"), warnOf(r));
    rec("…and points at the line the spirit is actually on",
      warnOf(r).includes("(line " + (histOf(dir).slice(0, histOf(dir).indexOf("nua_gated_spirit")).split("\n").length) + ")"),
      warnOf(r));
    rec("…on `refWarning`, the field public/loading-overlay.js drains",
      /body\.refWarning/.test(fs.readFileSync(path.join(__dirname, "public", "loading-overlay.js"), "utf8")),
      "loading-overlay.js no longer reads refWarning — the note has nowhere to appear");

    console.log("\n[must not change] a real write still happens, and stays quiet");
    const bAdd = bytesOf(dir);
    const rAdd = await api.spirit(dir, "nua_top_spirit", true);
    const aAdd = bytesOf(dir);
    rec("adding a spirit still writes", rAdd.b && rAdd.b.ok === true && !bAdd.equals(aAdd), rAdd.b);
    rec("…at top level", depthOf(histOf(dir), "nua_top_spirit") === 1, histOf(dir));
    rec("…with no warning", warnOf(rAdd) === "", warnOf(rAdd));
    const rDel = await api.spirit(dir, "nua_top_spirit", false);
    rec("removing a top-level spirit still writes", rDel.b && rDel.b.ok === true && !/nua_top_spirit/.test(histOf(dir)), histOf(dir));
    rec("…with no warning", warnOf(rDel) === "", warnOf(rDel));

    console.log("\n[must not change] the gated one still warns once a top-level block exists");
    const r2 = await api.spirit(dir, "nua_gated_second", false);
    rec("…still refused", r2.b && r2.b.unchanged === true && /nua_gated_second/.test(histOf(dir)), r2.b);
    rec("…and still explains itself", warnOf(r2).includes("nua_gated_second"), warnOf(r2));

    console.log("\n[must not change] an honestly empty no-op must stay silent");
    const dirTop = mkMod("capital = 1\n\nadd_ideas = {\n\texisting_spirit\n}\n\nset_research_slots = 3\n");
    const rDup = await api.spirit(dirTop, "existing_spirit", true);
    rec("re-adding a spirit that is already there changes nothing", rDup.b && rDup.b.unchanged === true, rDup.b);
    rec("…and says nothing (the user asked to ADD, and it IS granted)", warnOf(rDup) === "", warnOf(rDup));
    const rMissing = await api.spirit(dirTop, "never_here", false);
    rec("removing a spirit the file never had changes nothing", rMissing.b && rMissing.b.unchanged === true, rMissing.b);
    rec("…and says nothing", warnOf(rMissing) === "", warnOf(rMissing));

    console.log("\n[must not change] a spirit only inside a DATED block is neither listed nor warned about");
    const dirDate = mkMod("capital = 1\n\n1939.1.1 = {\n\tadd_ideas = { late_spirit }\n}\n");
    const lDate = await api.list(dirDate);
    rec("the list does not offer it", !(lDate.spirits || []).includes("late_spirit"), lDate);
    const rDate = await api.spirit(dirDate, "late_spirit", false);
    rec("…and removing it produces no warning about a gate", warnOf(rDate) === "", warnOf(rDate));

    console.log("\n[must not change] the other item types are untouched");
    const rDec = await api.spirit(dirTop, "existing_spirit", false); // real removal, to leave the file clean
    rec("the real removal still works", rDec.b && rDec.b.ok === true && !/existing_spirit/.test(histOf(dirTop)), histOf(dirTop));
    api.stop(); api = null;

    console.log("\n[back-out] with the note suppressed, the remove goes silent again");
    {
      const built = controlApp("silent", [[
        "        if (!active && itemType === \"spirit\" && isIdeaActiveInHistory(content, itemId)) {",
        "        if (false && !active && itemType === \"spirit\" && isIdeaActiveInHistory(content, itemId)) {"]]);
      if (built.error) rec("the control patched cleanly", false, built.error);
      else {
        const capi = await serve(built.createApp());
        try {
          const cdir = mkMod(GATED);
          const cl = await capi.list(cdir);
          rec("…the control fixture is still offered by the list", (cl.spirits || []).includes("nua_gated_spirit"), cl);
          const cb = bytesOf(cdir);
          const c = await capi.spirit(cdir, "nua_gated_spirit", false);
          rec("…the control still answers ok:true", c.b && c.b.ok === true, c.b);
          rec("…still writes nothing", cb.equals(bytesOf(cdir)), "the control's file moved");
          rec("…and reproduces the SILENT no-op — no warning at all", warnOf(c) === "",
            "the back-out still warned, so the change under test is not what produces the warning");
          // …while the control CAN still speak on that channel, so "no warning" is a real measurement.
          const cAdd = await capi.spirit(cdir, "nua_top_spirit", true);
          rec("…and the control's write path still works (it is not just broken)",
            cAdd.b && cAdd.b.ok === true && /nua_top_spirit/.test(histOf(cdir)), cAdd.b);
        } finally { capi.stop(); }
      }
    }

    console.log(`\n=== gated country spirit remove says so: ${checks} checks, ${fails.length} failed ===`);
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
