// ⛔ #a-rules-change-replayed-on-home — HOME'S DISK COPY OF A MOD'S INDEX IS FILED UNDER THE RULES THAT MADE IT.
//
// Home reads GET /api/mod/index without ?fresh=1. On a cold session that answer is a copy kept on disk from an earlier launch,
// taken back when its fingerprint matches: server.js's MOD_INDEX_RULES_VERSION and the stat of the mod's files. The version was
// typed ("Bump when the RULES change") and two rule changes went in after v5 without the bump — Mod Health's naming of advisors,
// hidden ideas, never-shown options and event calls, and the per-language count of a duplicated localisation key. 1.0.6 shipped
// v2, so a public upgrader's copy is dropped anyway; anyone who had run a build since v5 (the owner's own Home) was handed that
// build's rows — a mod that copies the base game's characters: the nameless advisors no longer reported — until a file of the
// mod changed, while Mod Health, which always rescans, said otherwise; and the next rule change would have done the same. The
// version is now derived from mod-index.js, which holds every rule, so the key moves whenever a rule does.
//
// Pinned: the version is the hash of mod-index.js as it is on disk, a one-byte change of that source moves it and the fingerprint
// with it; and, through the request Home sends on a cold session, a disk copy filed under other rules is not served while one
// filed under these rules is (the control that shows this test can see a served copy at all).
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const MODS = fs.mkdtempSync(path.join(os.tmpdir(), "nova-rules-key-mods-"));
process.env.HOI4_MODS_ROOT = MODS;
const srv = require("./server.js");

const PORT = Number(process.env.NOVA_TEST_PORT) || 54741;
const BASE = "http://127.0.0.1:" + PORT;

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail === undefined ? "" : "   " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 240)));
  if (!ok) fails.push(label);
};
const write = (root, rel, body) => {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body, "utf8");
};
const makeMod = (name) => {
  const mod = fs.mkdtempSync(path.join(MODS, name + "-"));
  write(mod, "descriptor.mod", `name="${name}"\nsupported_version="1.20.*"\n`);
  write(mod, "common/ideas/zz_probe.txt", "ideas = {\n\tcountry = {\n\t\tPRB_rules_key_spirit = {\n\t\t\tmodifier = { stability_factor = 0.01 }\n\t\t}\n\t}\n}\n");
  return mod;
};

let server;
(async () => {
  try {
    console.log("\n-- the key is derived from the rules' own source --");
    const rules = fs.readFileSync(path.join(__dirname, "mod-index.js"));
    const touched = Buffer.concat([rules, Buffer.from(" ")]);
    rec("server.js derives the rules version from mod-index.js", typeof srv.modIndexRulesVersion === "function"
      && srv.MOD_INDEX_RULES_VERSION === srv.modIndexRulesVersion(rules), srv.MOD_INDEX_RULES_VERSION);
    const other = typeof srv.modIndexRulesVersion === "function" ? srv.modIndexRulesVersion(touched) : "";
    rec("...and a one-byte change to that source gives another", !!other && other !== srv.MOD_INDEX_RULES_VERSION, other);
    const mod = makeMod("rules-key");
    rec("the fingerprint of a mod's disk copy moves with it",
      typeof srv.modIndexFingerprint === "function" && srv.modIndexFingerprint(mod) === srv.modIndexFingerprint(mod, srv.MOD_INDEX_RULES_VERSION)
      && srv.modIndexFingerprint(mod) !== srv.modIndexFingerprint(mod, other));

    console.log("\n-- the request Home sends, on a cold session --");
    server = await new Promise((res, rej) => { const s = srv.createApp().listen(PORT, "127.0.0.1", () => res(s)); s.on("error", rej); });
    const MARK = "PRB_a_row_an_older_release_wrote";
    const fileCopy = (m, fingerprint) => {
      const p = srv.modIndexDiskPath(m);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, JSON.stringify({ fingerprint, payload: { modRoot: m, isVanilla: false, counts: { problems: 1 }, entities: [],
        problems: [{ severity: "warning", rule: "missing_localization", entityType: "idea", entityId: MARK, file: "common/ideas/zz_probe.txt", message: MARK }] } }));
    };
    const home = async (m) => (await (await fetch(BASE + "/api/mod/index?modPath=" + encodeURIComponent(m))).json());
    const served = (body) => (body.problems || []).some((p) => p.entityId === MARK);
    const older = makeMod("older-rules");
    fileCopy(older, srv.modIndexFingerprint(older, other));
    const a = await home(older);
    rec("a copy filed under other rules is not served: Home gets a fresh scan", !served(a) && (a.problems || []).some((p) => p.entityId === "PRB_rules_key_spirit"),
      (a.problems || []).map((p) => p.entityId));
    const same = makeMod("same-rules");
    fileCopy(same, srv.modIndexFingerprint(same));
    rec("...while a copy filed under these rules is (the control)", served(await home(same)));
  } catch (e) {
    console.error(e);
    fails.push("threw: " + e.message);
  } finally {
    if (server) { try { server.closeAllConnections(); } catch (_) { /* older node */ } server.close(); }
    try { fs.rmSync(MODS, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
    if (fails.length) console.log("\nfailed:\n" + fails.map((f) => "  " + f.slice(0, 150)).join("\n"));
    console.log("\n" + (fails.length ? "FAILED " + fails.length + "/" + checks : "PASSED " + checks + "/" + checks));
    process.exitCode = fails.length || checks < 5 ? 1 : 0;
    setTimeout(() => process.exit(process.exitCode), 300).unref();
  }
})();
