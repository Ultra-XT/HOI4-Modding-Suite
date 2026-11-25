// #stale-focus-save — the focus tree overwrote a file that had changed on disk, and said nothing.
//
// Every other maker re-reads its file at save time and merges, so a modder with a text editor open beside
// Nova can add something by hand and it survives. The focus tree is the exception: it writes the whole file
// from the client's model, so a hand-added focus vanished from the live file. The previous content did go to
// a timestamped backup, so nothing was destroyed — but the modder was never told, and would have to know to
// go looking.
//
// Refusing is safe here specifically because there is no normalisation anywhere in the path: /api/load hands
// the file over verbatim and /api/save writes back verbatim, so a fingerprint taken at load time can be
// compared byte for byte with the file now. That is what makes an exact check possible rather than a
// heuristic that might block saving for no reason.
//
// Backwards compatible on purpose: a request that sends no fingerprint behaves exactly as before, so nothing
// that has not opted in can be blocked by this.
//
// Also pinned here: #stuck-save-in-flight. Every exit from the client's save cleared saveInFlight except the
// one a real user hits — a refused save. That flag disables Save, Load, Undo, Redo and Add Focus, so a single
// rejection left the editor inert, with unsaved work in it, until the page was reloaded. The rate limit puts
// that one double-click away. Adding a second way for a save to be refused made fixing it a prerequisite.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = path.join(os.tmpdir(), "nova-stale-save-test");
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const MOD = path.join(ROOT, "stale_probe");
fs.mkdirSync(path.join(MOD, "common", "national_focus"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="StaleProbe"\nsupported_version="1.18.*"\n');
const FILE = path.join(MOD, "common", "national_focus", "zz_tree.txt");

const treeWith = (ids) =>
  "focus_tree = {\n\tid = zz_tree\n\tcountry = { factor = 0 }\n" +
  ids.map((f) =>
    `\tfocus = {\n\t\tid = ${f}\n\t\ticon = GFX_focus_generic_treaty\n\t\tx = 0\n\t\ty = 0\n\t\tcost = 10\n\t\tcompletion_reward = { add_political_power = 10 }\n\t}\n`).join("") +
  "}\n";

// The same fingerprint the client and server both compute.
const fingerprint = (text) => {
  const s = String(text == null ? "" : text);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return `${s.length}-${h.toString(16)}`;
};

const PORT = 39651, app = createApp();
const server = app.listen(PORT, async () => {
  const save = (body) => fetch("http://127.0.0.1:" + PORT + "/api/save", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  // /api/save rate-limits per client, so space the requests out.
  const breathe = () => new Promise((r) => setTimeout(r, 1300));

  try {
    // ── the editor loads the file, then something else edits it ───────────────────────────────────
    fs.writeFileSync(FILE, treeWith(["zz_nova_focus"]), "utf8");
    const asLoaded = fs.readFileSync(FILE, "utf8");
    const fp = fingerprint(asLoaded);

    fs.writeFileSync(FILE, treeWith(["zz_nova_focus", "zz_hand_focus"]), "utf8");
    const onDisk = fs.readFileSync(FILE, "utf8");

    await breathe();
    const stale = await save({
      path: FILE,
      content: asLoaded.replace("add_political_power = 10", "add_political_power = 25"),
      baseFingerprint: fp,
    });
    ok("a save built on stale content is refused", stale.s === 409, stale);
    ok("…and flagged as a conflict", stale.b && stale.b.conflict === true, stale.b);
    ok("…naming the file", /zz_tree\.txt/.test(String(stale.b && stale.b.error)), stale.b);
    ok("…saying the other change is still there", /still there/i.test(String(stale.b && stale.b.error)), stale.b);
    ok("…and telling them to reload", /reload/i.test(String(stale.b && stale.b.error)), stale.b);
    ok("the file is untouched, byte for byte", fs.readFileSync(FILE, "utf8") === onDisk, "file changed");
    ok("…so the hand-added focus is still live", /zz_hand_focus/.test(fs.readFileSync(FILE, "utf8")));

    // ── reloading and saving again works ──────────────────────────────────────────────────────────
    await breathe();
    const fresh = fingerprint(fs.readFileSync(FILE, "utf8"));
    const good = await save({
      path: FILE,
      content: onDisk.replace("add_political_power = 10", "add_political_power = 25"),
      baseFingerprint: fresh,
    });
    ok("saving against the CURRENT file succeeds", good.s === 200, good.b);
    const after = fs.readFileSync(FILE, "utf8");
    ok("…the edit landed", /add_political_power = 25/.test(after), after.slice(0, 200));
    ok("…and the hand-added focus survived the real save", /zz_hand_focus/.test(after), after.slice(0, 200));

    // ── no fingerprint = old behaviour, so nothing that has not opted in can be blocked ───────────
    await breathe();
    const legacy = await save({ path: FILE, content: treeWith(["only_this_one"]) });
    ok("a save with no fingerprint still works", legacy.s === 200, legacy.b);
    ok("…and writes what it was given", /only_this_one/.test(fs.readFileSync(FILE, "utf8")));

    // ── autosave must never be blocked by the guard ───────────────────────────────────────────────
    // Autosave calls this endpoint with snapshot:true, which writes a .focus_editor_temp file rather than
    // the tree itself. The guard skips snapshots for exactly that reason: a stale fingerprint would
    // otherwise make autosave fail on every tick, spraying conflict messages at someone who has not asked
    // to save at all. Pinned here because it is one condition away from regressing.
    await breathe();
    const snap = await save({
      path: FILE,
      content: treeWith(["whatever_the_editor_has"]),
      baseFingerprint: "0-deadbeef", // deliberately stale
      snapshot: true,
    });
    ok("an autosave snapshot is not blocked by a stale fingerprint", snap.s === 200, snap.b);
    ok("…and it did not touch the real file", /only_this_one/.test(fs.readFileSync(FILE, "utf8")), "real file changed");

    // ── the client half ───────────────────────────────────────────────────────────────────────────
    {
      const src = fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8");
      ok("the editor fingerprints the file it loaded", /loadedFingerprint = novaFileFingerprint\(nextSource\)/.test(src));
      ok("…sends it with the save", /baseFingerprint: loadedFingerprint/.test(src));
      ok("…and re-takes it after a successful save, so consecutive saves do not conflict",
        /loadedFingerprint = novaFileFingerprint\(rewritten\)/.test(src));
      // The fingerprint must be computed identically on both sides or every save would conflict.
      const svr = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
      // server.js is CRLF and app.js is LF, so compare with line endings normalised — otherwise this
      // fails on a difference that has nothing to do with the algorithm.
      const norm = (t) => String(t).split("\r\n").join("\n");
      // Scope to novaFileFingerprint itself. This used to grab the FIRST FNV-1a hash in each file, which
      // silently compared the wrong function the moment server.js gained a second one (modNameHashSuffix, for
      // #nonlatin-mod-name-slug) earlier in the file — the algorithms were identical, the test failed anyway.
      const fnBody = (t, name) => {
        const s = norm(t);
        const at = s.indexOf("function " + name + "(");
        if (at === -1) return "";
        const end = s.indexOf("\n}", at);
        return end === -1 ? "" : s.slice(at, end + 2);
      };
      const algo = (t) => (fnBody(t, "novaFileFingerprint").match(/let h = 0x811c9dc5;[\s\S]*?0x01000193\) >>> 0;/) || [""])[0];
      ok("…using the same algorithm as the server", !!algo(src) && algo(src) === algo(svr),
        { client: algo(src).slice(0, 120), server: algo(svr).slice(0, 120) });
      // Both must still hash the same input to the same value — the property the assertion above stands in for.
      {
        const mk = (t) => new Function("return " + fnBody(t, "novaFileFingerprint") + "; novaFileFingerprint")();
        const a = mk(src), b = mk(svr);
        const sample = 'focus = { id = x }\n# a comment\r\n\ttab\tand "quotes"';
        ok("…and they agree on a real sample", a(sample) === b(sample), { client: a(sample), server: b(sample) });
        ok("…and on the empty string", a("") === b(""), { client: a(""), server: b("") });
      }

      // #stuck-save-in-flight — a refused save must release the editor.
      const i = src.indexOf("dbgError(\"Save failed\", msg);");
      const branch = i === -1 ? "" : src.slice(i, i + 900);
      ok("a refused save clears saveInFlight", /saveInFlight = false/.test(branch), branch.slice(0, 200));
      ok("…and re-enables the buttons", /refreshPrimaryButtons\(\)/.test(branch), branch.slice(0, 200));
    }

    console.log("\ntest-stale-focus-save: " + pass + "/" + total + " checks passed");
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 16 ? 0 : 1;
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
