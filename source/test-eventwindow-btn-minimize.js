// #eventwindow-btn-minimize — DELETING A BUTTON THE ENGINE FETCHES BY NAME.
//
// From HOI4's own error.log during the play-test:
//   containerwindow.cpp: interface/zz_nova_eventwindow.gui (line 25 ): Could not find "btn_minimize" in window top_Window
//   containerwindow.cpp: interface/zz_nova_eventwindow.gui (line 465): Could not find "btn_minimize" in window top_Window
//
// Events > Newspaper Style writes a Nova-owned interface/zz_nova_eventwindow.gui that copies the mod's real
// event-window layout with the minimize / "skip event" button removed. It removed it by deleting the whole
// buttonType block — but all four event windows (EventWindow, _News, _leader, _Operative) declare
// `name = "btn_minimize"` inside their `top_Window`, and the engine looks that name up when it builds the
// window. Deleting the block does not delete a decoration; it deletes something the engine asked for, and it
// logs once per event opened. Two of the four showed up in the play log — those were the two window types
// that came up in that session, not the only two broken ones.
//
// The button is now NEUTRALISED rather than deleted: the block and its name stay so the lookup succeeds, the
// spriteType stays so nothing goes hunting for a missing sprite, and it is parked far outside the parent
// window at zero size with its tooltip and click sound dropped — nothing draws, nothing is clickable, and
// no hover can surface a control that is no longer meant to exist.
//
// An override written by the older Nova is healed on the next read of the newspaper-styles list, because
// nothing else would rewrite that file until the author happened to re-apply a style.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-ewbtn-"));
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
    out = out.replace(from, to);
  }
  const p = path.join(__dirname, `.ctl-ewbtn-${process.pid}-${label}.js`);
  fs.writeFileSync(p, wasCrlf ? out.replace(/\n/g, "\r\n") : out, "utf8");
  ctlFiles.push(p);
  try { return { createApp: require(p).createApp }; } catch (e) { return { error: String(e && e.message) }; }
}

function mkMod(name) {
  const dir = path.join(ROOT, name);
  fs.mkdirSync(path.join(dir, "interface"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), `name="${name}"\nsupported_version="1.19.*"\n`, "utf8");
  return dir;
}

let PORT = 46100;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      port: PORT,
      get: (u) => fetch(`http://127.0.0.1:${PORT}${u}`).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      post: (u, body) => fetch(`http://127.0.0.1:${PORT}${u}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}

// Walk the braces so an untracked block (background / a multi-line position) cannot pop a real frame.
function parentChainOf(text, needle) {
  const lines = text.split(/\r?\n/);
  const stack = [];
  const chains = [];
  for (const raw of lines) {
    const ln = raw.replace(/#.*$/, "");
    const decl = /^\s*(\w+)\s*=\s*\{\s*$/.exec(ln);
    if (ln.includes(needle)) chains.push(stack.map((f) => f.name || f.kind).join(" > "));
    const n = /^\s*name\s*=\s*"([^"]+)"/.exec(ln);
    if (n && stack.length && !stack[stack.length - 1].name) {
      stack[stack.length - 1].name = `${stack[stack.length - 1].kind}:${n[1]}`;
    }
    for (const ch of ln) {
      if (ch === "{") stack.push({ kind: decl ? decl[1] : "blk", name: "" });
      else if (ch === "}") stack.pop();
    }
  }
  return chains;
}
function braceBalance(text) {
  let d = 0;
  for (const c of text.replace(/#.*$/gm, "")) { if (c === "{") d++; else if (c === "}") d--; }
  return d;
}

const GUI_REL = path.join("interface", "zz_nova_eventwindow.gui");
const VANILLA_GUI = path.join("D:/SteamLibrary/steamapps/common/Hearts of Iron IV", "interface", "eventwindow.gui");

(async () => {
  let api = null;
  try {
    console.log("\n[ground truth] vanilla's own event window, read not assumed");
    let vanillaCount = 0;
    if (fs.existsSync(VANILLA_GUI)) {
      const v = fs.readFileSync(VANILLA_GUI, "utf8");
      vanillaCount = (v.match(/"btn_minimize"/g) || []).length;
      rec("vanilla declares a btn_minimize in every event window", vanillaCount === 4, vanillaCount);
      const chains = parentChainOf(v, '"btn_minimize"');
      rec("…each one inside that window's top_Window",
        chains.length === 4 && chains.every((c) => /containerWindowType:top_Window/.test(c)), chains);
      rec("…across all four window types",
        new Set(chains.map((c) => (/containerWindowType:(EventWindow\w*)/.exec(c) || [])[1])).size === 4, chains);
    } else {
      console.log("  --   vanilla not installed; skipping the ground-truth block");
    }

    const mod = mkMod("m");
    api = await serve(createApp());

    console.log("\n[apply] the override keeps the button the engine looks up");
    const r = await api.post("/api/events/apply-newspaper-style", { modPath: mod, source: "vanilla" });
    rec("applying a newspaper style succeeds", r.s === 200 && r.b.ok, r.b.error || r.b);
    rec("…and writes the window override", r.b.hasWindow === true, r.b);
    const guiPath = path.join(mod, GUI_REL);
    rec("…as a Nova-owned zz_ file", fs.existsSync(guiPath), guiPath);
    const gui = fs.existsSync(guiPath) ? fs.readFileSync(guiPath, "utf8") : "";
    rec("the override still declares btn_minimize",
      (gui.match(/"btn_minimize"/g) || []).length === 4, (gui.match(/"btn_minimize"/g) || []).length);
    rec("…one per top_Window, none orphaned",
      (gui.match(/"top_Window"/g) || []).length === (gui.match(/"btn_minimize"/g) || []).length,
      { top: (gui.match(/"top_Window"/g) || []).length, btn: (gui.match(/"btn_minimize"/g) || []).length });
    const chains = parentChainOf(gui, '"btn_minimize"');
    rec("…still nested in top_Window, where the engine looks",
      chains.length === 4 && chains.every((c) => /containerWindowType:top_Window/.test(c)), chains);

    console.log("\n[hidden] present for the engine, gone for the player");
    const blocks = gui.match(/buttonType = \{(?:[^{}]|\{[^{}]*\})*\}/g) || [];
    const mins = blocks.filter((b) => /"btn_minimize"/.test(b));
    rec("every minimize button is parked outside its window",
      mins.length === 4 && mins.every((b) => /position = \{ x = -9000 y = -9000 \}/.test(b)), mins[0]);
    rec("…and given no area to be clicked in",
      mins.length === 4 && mins.every((b) => /size = \{ width = 0 height = 0 \}/.test(b)), mins[0]);
    rec("…with no tooltip left to surface on hover",
      !/MINIMIZE_EVENT/.test(gui) && mins.every((b) => !/pdx_tooltip/.test(b)), gui.match(/.*MINIMIZE_EVENT.*/g));
    rec("…and no click sound",
      mins.every((b) => !/clicksound/.test(b)), mins.find((b) => /clicksound/.test(b)));
    rec("…but keeping the sprite, so nothing hunts for a missing one",
      mins.every((b) => /GFX_event_button_minimize/.test(b)), mins[0]);
    rec("only the minimize buttons were touched — other buttons keep their position",
      blocks.some((b) => !/"btn_minimize"/.test(b) && /position/.test(b) && !/-9000/.test(b)),
      blocks.filter((b) => !/"btn_minimize"/.test(b)).length);

    console.log("\n[still a valid gui]");
    rec("braces balance", braceBalance(gui) === 0, braceBalance(gui));
    rec("…and the file is still marked as Nova's, so it stays revertible",
      gui.startsWith("# Nova-managed event window"), gui.slice(0, 60));
    rec("…and the mod's OWN eventwindow.gui was never created or touched",
      !fs.existsSync(path.join(mod, "interface", "eventwindow.gui")), "mod's own gui was written");

    console.log("\n[the one-line form] a buttonType written on a single line is neutralised too");
    // Found by the existing newspaper test, whose fixture mod writes its custom layout this way. The first
    // version of this fix anchored its patterns to a line start, matched nothing here, and left a fully
    // visible, fully clickable button behind — while reporting success.
    {
      const modOL = mkMod("oneline");
      const ownGui = path.join(modOL, "interface", "eventwindow.gui");
      fs.writeFileSync(ownGui, [
        "# MOD-CUSTOM-LAYOUT", "guiTypes = {", '\tcontainerWindowType = {', '\t\tname = "EventWindow"',
        '\t\tcontainerWindowType = {', '\t\t\tname = "top_Window"',
        '\t\t\tbuttonType = { name = "btn_minimize" spriteType = "GFX_event_button_minimize" position = { x = 10 y = 45 } pdx_tooltip = "MINIMIZE_EVENT" }',
        '\t\t\tbuttonType = { name = "btn_other" spriteType = "GFX_something" position = { x = 20 y = 20 } }',
        "\t\t}", "\t}", "}", ""].join("\n"), "utf8");
      {
        // Reuse the app already listening — a second createApp() alongside it is what every other secondary
        // block in this file avoids by stopping the first one, and two at once do not survive here.
        const ro = await api.post("/api/events/apply-newspaper-style", { modPath: modOL, source: "vanilla" });
        rec("applying over a one-line layout succeeds", ro.b.ok === true, ro.b);
        const g = fs.readFileSync(path.join(modOL, GUI_REL), "utf8");
        rec("…the mod's own layout is carried across", /MOD-CUSTOM-LAYOUT/.test(g), g.slice(0, 80));
        rec("…the button is still declared", /"btn_minimize"/.test(g), g);
        rec("…parked outside the window", /position = \{ x = -9000 y = -9000 \}/.test(g), g);
        rec("…at zero size", /size = \{ width = 0 height = 0 \}/.test(g), g);
        rec("…with its original position gone, not merely followed",
          !/x = ?10 y = ?45/.test(g) && !/x=10/.test(g), g);
        rec("…and its tooltip gone", !/MINIMIZE_EVENT/.test(g), g);
        rec("…while the neighbouring button keeps its own position",
          /"btn_other"/.test(g) && /x = 20 y = 20/.test(g), g);
        rec("…and the file still parses as balanced gui", braceBalance(g) === 0, braceBalance(g));
      }
    }

    console.log("\n[revert] removing the style takes the override away");
    const rm = await api.post("/api/events/apply-newspaper-style", { modPath: mod, source: "remove" });
    rec("remove succeeds", rm.s === 200 && rm.b.ok, rm.b);
    rec("…and the override is gone", !fs.existsSync(guiPath), "still present");

    console.log("\n[heal] an override written by the older Nova repairs itself");
    const mod2 = mkMod("m2");
    const gui2 = path.join(mod2, GUI_REL);
    // exactly what the old code produced: our marker, the windows, no button
    fs.writeFileSync(gui2, [
      "# Nova-managed event window (Events > Newspaper Style): copied with the minimize/skip button removed.",
      "guiTypes = {", '\tcontainerWindowType = { name = "EventWindow"',
      '\t\tcontainerWindowType = { name = "top_Window" }', "\t}", "}", ""].join("\n"), "utf8");
    const before = fs.readFileSync(gui2, "utf8");
    rec("the stale override really is missing the button", !/"btn_minimize"/.test(before), before.slice(0, 80));
    const st = await api.get(`/api/events/newspaper-styles?modPath=${encodeURIComponent(mod2)}`);
    rec("reading the style list succeeds", st.s === 200 && Array.isArray(st.b.styles), st.b.error || st.b);
    rec("…and reports that it healed the window", st.b.healedEventWindow === true, st.b.healedEventWindow);
    const after = fs.readFileSync(gui2, "utf8");
    rec("…the button is back", (after.match(/"btn_minimize"/g) || []).length === 4, (after.match(/"btn_minimize"/g) || []).length);
    rec("…and still hidden", /position = \{ x = -9000 y = -9000 \}/.test(after), "not parked");

    console.log("\n[heal] but never touches a file that is not Nova's");
    const mod3 = mkMod("m3");
    const gui3 = path.join(mod3, GUI_REL);
    const theirs = 'containerWindowType = { name = "top_Window" }\n';
    fs.writeFileSync(gui3, theirs, "utf8");
    const st3 = await api.get(`/api/events/newspaper-styles?modPath=${encodeURIComponent(mod3)}`);
    rec("an unmarked file is left exactly as the author wrote it",
      st3.b.healedEventWindow !== true && fs.readFileSync(gui3, "utf8") === theirs, fs.readFileSync(gui3, "utf8"));
    const mod4 = mkMod("m4");
    const st4 = await api.get(`/api/events/newspaper-styles?modPath=${encodeURIComponent(mod4)}`);
    rec("a mod with no override is left without one",
      st4.b.healedEventWindow !== true && !fs.existsSync(path.join(mod4, GUI_REL)), "an override appeared");
    api.stop(); api = null;

    console.log("\n[back-out] delete the button again, as the old code did");
    {
      const built = controlApp("delete", [[
        "    s = s.replace(re, (m) => (/GFX_event_button_minimize/.test(m) ? neutralizeMinimizeButton(m) : m));",
        "    s = s.replace(re, (m) => (/GFX_event_button_minimize/.test(m) ? \"\" : m));"]]);
      if (built.error) rec("the control patched cleanly", false, built.error);
      else {
        const capi = await serve(built.createApp());
        try {
          const cmod = mkMod("ctl");
          const c = await capi.post("/api/events/apply-newspaper-style", { modPath: cmod, source: "vanilla" });
          const ctext = fs.existsSync(path.join(cmod, GUI_REL)) ? fs.readFileSync(path.join(cmod, GUI_REL), "utf8") : "";
          rec("…the control still writes an override", c.b.ok === true && ctext.length > 0, c.b);
          rec("…which declares top_Window", /"top_Window"/.test(ctext), "no windows");
          rec("…and no longer contains the name the engine fetches",
            !/"btn_minimize"/.test(ctext), (ctext.match(/"btn_minimize"/g) || []).length);
        } finally { capi.stop(); }
      }
    }

    console.log(`\n=== eventwindow btn_minimize: ${checks} checks, ${fails.length} failed ===`);
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
