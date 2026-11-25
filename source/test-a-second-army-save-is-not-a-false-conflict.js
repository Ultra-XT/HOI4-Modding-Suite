// ⛔ #the-fingerprint-described-text-that-was-never-written — THE SECOND SAVE ALWAYS FAILED ON A CRLF FILE.
//
// The Army maker uses optimistic concurrency: the editor holds a fingerprint of the file it opened, sends
// it back with the save, and the server refuses if the file changed underneath. After a successful save the
// server hands back a fresh fingerprint and the editor re-anchors on it.
//
// It handed back a fingerprint of the wrong text. safeModWrite runs matchExistingLineEndings, so on a CRLF
// file the bytes on disk are not the bytes it was given — but the response fingerprinted the text passed
// IN. The editor adopted a value describing a file that never existed, its next save sent that as
// baseFingerprint, the server compared it against the real file and answered
//     409 "changed on disk after you opened it — something else edited it"
// when nothing had. Pressing Save again gave the same 409 for ever, so a second batch of deployed divisions
// could never be saved at all.
//
// 79% of the order-of-battle files in the installed workshop mods are CRLF-only, so this was the normal
// case, not an edge one. The A/B below differs in nothing but line endings.
//
// The same mistake existed on the shared-focus-connection endpoint, which re-anchors the focus editor for
// exactly this reason; both read the file back now.
"use strict";

// #a-bare-test-run-writes-into-the-real-app-data — FIRST: run bare, the server this starts inherits the sandbox.
require("./safe-write.js");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const PORT = Number(process.env.NOVA_TEST_PORT || 53696);
let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 300) : "")); }
};

const roots = [];
const OOB = (eol) => [
  "division_template = {",
  '\tname = "Inf"',
  "\tregiments = { infantry = { x = 0 y = 0 } }",
  "}",
  "units = {",
  '\tdivision = { name = "1" location = 1 division_template = "Inf" }',
  "}",
  "",
].join(eol);

const mkMod = (eol) => {
  const m = fs.mkdtempSync(path.join(os.tmpdir(), "nova-fp-"));
  roots.push(m);
  fs.mkdirSync(path.join(m, "history", "units"), { recursive: true });
  fs.mkdirSync(path.join(m, "history", "countries"), { recursive: true });
  fs.writeFileSync(path.join(m, "descriptor.mod"), 'version="1.0"\nname="fp"\n', "utf8");
  fs.writeFileSync(path.join(m, "history", "units", "ABC_1936.txt"), OOB(eol), "utf8");
  fs.writeFileSync(path.join(m, "history", "countries", "ABC - T.txt"), 'capital = 1\nset_oob = "ABC_1936"\n', "utf8");
  return m;
};

const appdata = fs.mkdtempSync(path.join(os.tmpdir(), "nova-fp-ad-"));
roots.push(appdata);
const srv = spawn(process.execPath, [path.join(__dirname, "server.js")], {
  env: Object.assign({}, process.env, {
    PORT: String(PORT), APPDATA: appdata, NOVA_APP_DATA_DIR: appdata, NOVA_HOME_DIR: appdata,
  }),
  stdio: ["ignore", "pipe", "pipe"],
});
srv.stdout.on("data", () => {}); srv.stderr.on("data", () => {});

(async () => {
  try {
    let up = false;
    for (let i = 0; i < 160; i++) {
      try { await fetch(`http://127.0.0.1:${PORT}/`); up = true; break; } catch (_) { await new Promise((r) => setTimeout(r, 250)); }
    }
    if (!up) { ok(false, "server came up on " + PORT); return; }

    const run = async (label, eol) => {
      const m = mkMod(eol);
      const g = await (await fetch(`http://127.0.0.1:${PORT}/api/army?modPath=${encodeURIComponent(m)}&tag=ABC`)).json();
      const post = async (fp, divisions) => (await fetch(`http://127.0.0.1:${PORT}/api/army/save`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modPath: m, tag: "ABC", file: g.file, templates: g.templates, divisions, baseFingerprint: fp }),
      })).json();

      const d1 = (g.divisions || []).concat([{ name: "2", location: 1, division_template: "Inf" }]);
      const r1 = await post(g.fingerprint, d1);
      const d2 = d1.concat([{ name: "3", location: 1, division_template: "Inf" }]);
      const r2 = await post(r1.fingerprint, d2);
      const disk = fs.readFileSync(path.join(m, "history", "units", "ABC_1936.txt"), "utf8");
      return { g, r1, r2, disk, mod: m };
    };

    console.log("\n-- ⭐ A/B: identical content, only the line endings differ --");
    const lf = await run("LF", "\n");
    const crlf = await run("CRLF", "\r\n");

    ok(lf.r1 && lf.r1.ok === true, "LF: the first save succeeds", lf.r1 && lf.r1.error);
    ok(lf.r2 && lf.r2.ok === true, "LF: and so does the second", lf.r2 && lf.r2.error);
    ok(crlf.r1 && crlf.r1.ok === true, "CRLF: the first save succeeds", crlf.r1 && crlf.r1.error);
    ok(crlf.r2 && crlf.r2.ok === true, "CRLF: AND SO DOES THE SECOND — this is the bug", crlf.r2 && (crlf.r2.error || crlf.r2));
    ok(!(crlf.r2 && crlf.r2.conflict), "…with no false 'something else edited it'", crlf.r2 && crlf.r2.error);

    console.log("\n-- both batches of divisions actually land --");
    {
      const count = (t) => (t.match(/division = \{/g) || []).length;
      ok(count(lf.disk) === 3, `LF: 3 divisions on disk`, count(lf.disk));
      ok(count(crlf.disk) === 3, `CRLF: 3 divisions on disk — the second batch was previously unsaveable`, count(crlf.disk));
    }

    console.log("\n-- ⭐ the returned fingerprint describes the file that exists --");
    {
      // The root cause in one assertion: what the server hands back must match what a reader of the file
      // would compute. If it does not, the next save is refused however correct it is.
      const { novaFileFingerprint } = require("./server.js");
      for (const [label, r] of [["LF", lf], ["CRLF", crlf]]) {
        const onDisk = novaFileFingerprint(fs.readFileSync(path.join(r.mod, "history", "units", "ABC_1936.txt"), "utf8"));
        ok(r.r2.fingerprint === onDisk,
          `${label}: the fingerprint returned by the save is the fingerprint of the saved file`,
          { returned: r.r2.fingerprint, onDisk });
      }
    }

    console.log("\n-- CRLF files keep their line endings through the save --");
    {
      ok((crlf.disk.match(/[^\r]\n/g) || []).length === 0, "no lone LF was introduced into the CRLF file");
      ok(crlf.disk.indexOf("\r\n") !== -1, "…and it is still CRLF");
      ok(lf.disk.indexOf("\r") === -1, "…while the LF file stays LF");
    }

    console.log("\n-- a REAL conflict is still caught --");
    {
      // Loosening this must not disable it: if something genuinely edits the file behind the editor, the
      // save must still refuse rather than clobber it.
      const m = mkMod("\r\n");
      const g = await (await fetch(`http://127.0.0.1:${PORT}/api/army?modPath=${encodeURIComponent(m)}&tag=ABC`)).json();
      fs.appendFileSync(path.join(m, "history", "units", "ABC_1936.txt"), "\r\n# someone else edited this\r\n", "utf8");
      const r = await (await fetch(`http://127.0.0.1:${PORT}/api/army/save`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modPath: m, tag: "ABC", file: g.file, templates: g.templates, divisions: g.divisions, baseFingerprint: g.fingerprint }),
      })).json();
      ok(r && r.conflict === true, "an edit made behind the editor's back is still refused", r);
      ok(/changed on disk/i.test(String(r.error)), "…with the conflict message", r && r.error);
      const still = fs.readFileSync(path.join(m, "history", "units", "ABC_1936.txt"), "utf8");
      ok(/someone else edited this/.test(still), "…and that edit is still there, unclobbered");
    }

    console.log("\n-- the focus-connection endpoint had the same mistake --");
    {
      const SRV = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
      ok(!/fingerprint: novaFileFingerprint\(updated\)/.test(SRV),
        "shared-focus-connection no longer fingerprints the text it passed in");
      ok(!/fingerprint: novaFileFingerprint\(newText\)/.test(SRV),
        "…and neither does the army save");
    }
  } catch (e) {
    ok(false, "threw: " + e.message + "\n" + e.stack);
  } finally {
    try { srv.kill(); } catch (_) {}
    setTimeout(() => { try { srv.kill("SIGKILL"); } catch (_) {} }, 800);
    for (const r of roots) { try { fs.rmSync(r, { recursive: true, force: true }); } catch (_) { /* scratch only */ } }
    console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
    process.exitCode = fail ? 1 : 0;
    setTimeout(() => process.exit(fail ? 1 : 0), 1200);
  }
})();
