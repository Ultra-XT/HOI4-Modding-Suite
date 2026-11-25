// ⛔ #the-fix-tier-could-only-touch-localisation — EVERY DETERMINISTIC FIX WROTE A .yml, AND THE BATCH
// RUNNER REJECTED ANYTHING ELSE OUTRIGHT WITH "No localisation file to fix."
//
// That made the tier structurally incapable of repairing a script file, however single-answer the repair
// was — the limit was the plumbing, not the judgement.
//
// add_namespace is the safest possible case to open that path with. An event id is
// `<namespace>.<number>`; HOI4 will not register the event at all unless its file declares
// `add_namespace = <namespace>`; and the namespace is DERIVED from the id the author already wrote, so
// there is nothing for Nova to choose. Mod Health reported this as an ERROR and could do nothing about it.
//
// The write goes through safeModWrite, which backs the file up and matches its existing line endings, so no
// new write path is introduced (test-mod-writes-have-one-owner.js still holds).
//
// Corpus count is 1, which is why this was previously judged not worth the work. It is here for a different
// reason: it is the first non-localisation fix, and the plumbing it opens is the point.
"use strict";

// #a-bare-test-run-writes-into-the-real-app-data — FIRST: run bare, the server this starts inherits the sandbox.
require("./safe-write.js");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const PORT = Number(process.env.NOVA_TEST_PORT || 53689);

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 300) : "")); }
};
const roots = [];
const mkMod = (files) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nova-nsfix-"));
  roots.push(root);
  const W = (rel, body) => {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body, "utf8");
  };
  W("descriptor.mod", 'version="1.0"\nname="NS Fix"\nsupported_version="1.17.*"\n');
  for (const [rel, body] of Object.entries(files)) W(rel, body);
  return root;
};
const EV = (ns, n) => `country_event = {
	id = ${ns}.${n}
	title = ${ns}.${n}.t
	desc = ${ns}.${n}.d
	is_triggered_only = yes
	option = { name = ${ns}.${n}.a }
}
`;

const appdata = fs.mkdtempSync(path.join(os.tmpdir(), "nova-nsfix-appdata-"));
roots.push(appdata);
const srv = spawn(process.execPath, [path.join(__dirname, "server.js")], {
  env: { ...process.env, PORT: String(PORT), APPDATA: appdata },
  stdio: ["ignore", "pipe", "pipe"],
});
srv.stdout.on("data", () => {}); srv.stderr.on("data", () => {});

const scan = async (root) => (await fetch(`http://127.0.0.1:${PORT}/api/mod/index?fresh=1&modPath=${encodeURIComponent(root)}`)).json();
const fixAll = async (root, problems) => (await fetch(`http://127.0.0.1:${PORT}/api/modhealth/fix-batch`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modPath: root, problems }),
})).json();
const nsProblems = (j) => (j.problems || []).filter((p) => p.rule === "event_namespace_undeclared");

(async () => {
  try {
    let up = false;
    for (let i = 0; i < 120; i++) {
      try { await fetch(`http://127.0.0.1:${PORT}/`); up = true; break; } catch (_) { await new Promise((r) => setTimeout(r, 250)); }
    }
    if (!up) { ok(false, "server came up on " + PORT); return; }

    console.log("\n-- an event whose namespace was never declared --");
    {
      const root = mkMod({ "events/a.txt": "﻿" + EV("zz_undeclared", 1) + EV("zz_undeclared", 2) });
      const before = nsProblems(await scan(root));
      ok(before.length >= 1, "the undeclared namespace is reported", before.length);

      const res = await fixAll(root, before);
      ok(!res.error, "the batch does not reject a .txt out of hand", res.error);
      ok((res.fixed || 0) >= 1, "…it reports the repair", { fixed: res.fixed, failed: res.failed });
      ok((res.filesWritten || 0) >= 1, "…and counts the script file it wrote", res.filesWritten);

      const txt = fs.readFileSync(path.join(root, "events", "a.txt"), "utf8");
      ok(/(^|\n)add_namespace = zz_undeclared(\r?\n)/.test(txt.replace(/^﻿/, "")),
        "the declaration is in the file", txt.slice(0, 60));
      ok(txt.charCodeAt(0) === 0xFEFF, "…the file's BOM is preserved");
      ok(/country_event = \{/.test(txt) && /id = zz_undeclared\.1/.test(txt), "…and the events are untouched");
      ok(nsProblems(await scan(root)).length === 0, "…so a rescan reports nothing");
    }

    console.log("\n-- one file needing TWO namespaces gets both, once each --");
    {
      const root = mkMod({ "events/b.txt": EV("ns_one", 1) + EV("ns_two", 5) + EV("ns_one", 2) });
      const before = nsProblems(await scan(root));
      ok(before.length >= 2, "both namespaces are reported", before.length);
      await fixAll(root, before);
      const txt = fs.readFileSync(path.join(root, "events", "b.txt"), "utf8");
      ok((txt.match(/add_namespace = ns_one/g) || []).length === 1, "ns_one declared exactly once",
        (txt.match(/add_namespace = ns_one/g) || []).length);
      ok((txt.match(/add_namespace = ns_two/g) || []).length === 1, "ns_two declared exactly once",
        (txt.match(/add_namespace = ns_two/g) || []).length);
      ok(nsProblems(await scan(root)).length === 0, "…and nothing is left undeclared");
    }

    console.log("\n-- a namespace the file ALREADY declares is not declared twice --");
    {
      const root = mkMod({ "events/c.txt": "add_namespace = ns_have\n\n" + EV("ns_have", 1) + EV("ns_missing", 2) });
      const before = nsProblems(await scan(root));
      ok(before.length === 1 && before[0].entityId.startsWith("ns_missing"),
        "only the genuinely missing one is reported", before.map((p) => p.entityId));
      await fixAll(root, before);
      const txt = fs.readFileSync(path.join(root, "events", "c.txt"), "utf8");
      ok((txt.match(/add_namespace = ns_have/g) || []).length === 1, "the existing declaration is not duplicated",
        (txt.match(/add_namespace = ns_have/g) || []).length);
      ok((txt.match(/add_namespace = ns_missing/g) || []).length === 1, "…and the missing one is added");
    }

    console.log("\n-- an existing declaration is recognised however it is written --");
    {
      // The "is it already declared?" test has to survive the shapes real files use: a trailing comment
      // after the declaration, CRLF endings, and odd spacing. Getting this wrong adds a second
      // add_namespace line — harmless to HOI4, but it is Nova editing a file that needed no edit.
      for (const [label, head] of [
        ["a trailing comment", "add_namespace = ns_have # the crisis chain\n\n"],
        ["CRLF endings", "add_namespace = ns_have\r\n\r\n"],
        ["no spaces around =", "add_namespace=ns_have\n\n"],
        ["leading tab", "\tadd_namespace = ns_have\n\n"],
      ]) {
        const root = mkMod({ "events/f.txt": head + EV("ns_have", 1) + EV("ns_missing", 2) });
        const before = nsProblems(await scan(root));
        await fixAll(root, before);
        const txt = fs.readFileSync(path.join(root, "events", "f.txt"), "utf8");
        const n = (txt.match(/add_namespace\s*=\s*ns_have/g) || []).length;
        ok(n === 1, `${label}: the existing declaration is not duplicated`, { count: n, head });
      }
    }

    console.log("\n-- an author's header comment stays first --");
    {
      const root = mkMod({ "events/d.txt": "# Written by someone, 1936\n# Do not reorder.\n\n" + EV("ns_after", 1) });
      await fixAll(root, nsProblems(await scan(root)));
      const lines = fs.readFileSync(path.join(root, "events", "d.txt"), "utf8").replace(/^﻿/, "").split(/\r?\n/);
      ok(lines[0].startsWith("# Written by someone"), "the comment block is still the first thing in the file", lines[0]);
      ok(lines.some((l) => l === "add_namespace = ns_after"), "…and the declaration went in after it", lines.slice(0, 6));
      const declAt = lines.findIndex((l) => l === "add_namespace = ns_after");
      const evAt = lines.findIndex((l) => /country_event/.test(l));
      ok(declAt > 1 && declAt < evAt, "…before the first event, where HOI4 wants it", { declAt, evAt });
    }

    console.log("\n-- the BUTTON has to offer it, not just the endpoint --");
    {
      // The server pass runs for anything posted to it; what decides whether "Fix all" ever posts this rule
      // is the client's tier. Miss that and the endpoint can repair a problem the UI never sends it — the
      // #deterministic-tier-typed-in-four-places failure in a new costume.
      const src = fs.readFileSync(path.join(__dirname, "public", "modhealth.js"), "utf8");
      const blk = src.slice(src.indexOf("const DETERMINISTIC_FIXES = {"));
      const tier = blk.slice(blk.indexOf("{"), blk.indexOf("\n  };") + 4);
      ok(/event_namespace_undeclared\s*:\s*true/.test(tier),
        "event_namespace_undeclared is in the client's deterministic tier", tier.slice(0, 160));
    }

    console.log("\n-- the file is backed up first, like every other fix --");
    {
      const root = mkMod({ "events/e.txt": EV("ns_backup", 1) });
      await fixAll(root, nsProblems(await scan(root)));
      let backups = [];
      try { backups = fs.readdirSync(path.join(appdata, "NovaModdingSuite", "backups")); } catch (_) {}
      ok(backups.some((b) => /e\.txt/i.test(b) || /add-namespace/i.test(b)),
        "a backup of the script file exists", backups.slice(-3));
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
