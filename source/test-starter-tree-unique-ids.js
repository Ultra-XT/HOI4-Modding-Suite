// #starter-tree-duplicate-ids — every copied focus tree must get its own focus ids.
//
// Focus ids are globally unique in HOI4. copy-generic-focus-tree gives each copy its own identity by
// prefixing the 56 vanilla focus ids — but the prefix was derived by stripping `_focus_tree(_N)?` off the
// filename, which removed the very `_2`/`_3` the auto-name loop had just added to keep the copies apart. So
// every auto-named copy got the prefix `<modname>` and therefore the SAME 56 focus ids, and the second tree
// collided with the first. The tree_id itself was fine, which is why it looked like it had worked.
//
// Reachable from the UI twice over: the empty-mod overlay's "Create Starter Tree" sends no fileName at all,
// and "+ New Tree" sends "" when the name box is left blank.
//
// Both directions: copies must not collide, AND a user-supplied filename must still produce the prefix it
// always did — the auto-name path is the only one that needed changing.
//
// Hermetic: fake mod under tmpdir.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-startertree-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, ok, detail) {
  checks++;
  if (ok) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300));
  }
}

const MOD = path.join(ROOT, "treemod");
fs.mkdirSync(path.join(MOD, "common", "national_focus"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="TreeMod"\nsupported_version="1.18.*"\n', "utf8");

const NF = path.join(MOD, "common", "national_focus");
const focusIdsIn = (file) => {
  const t = fs.readFileSync(path.join(NF, file), "utf8");
  const ids = [];
  // Focus ids only — skip the focus_tree's own `id`, which is a different thing and was never broken.
  for (const m of t.matchAll(/focus\s*=\s*\{[^]*?\bid\s*=\s*([A-Za-z_][A-Za-z0-9_.\-]*)/g)) ids.push(m[1]);
  return ids;
};

const PORT = 42185;
const app = createApp();
const server = app.listen(PORT, async () => {
  const copy = async (body) => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/mod/copy-generic-focus-tree`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modPath: MOD, ...body }),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };

  try {
    console.log("\n[auto-named copies] the path the Create Starter Tree button uses");
    const a = await copy({});
    rec("the first copy succeeded", a.status === 200 && a.body && a.body.ok !== false, a.body || a.status);
    const b = await copy({});
    rec("the second copy succeeded", b.status === 200 && b.body && b.body.ok !== false, b.body || b.status);

    const files = fs.readdirSync(NF).filter((f) => f.endsWith(".txt")).sort();
    rec("two separate tree files exist", files.length >= 2, files);

    const idsA = focusIdsIn(files[0]);
    const idsB = focusIdsIn(files[1]);
    rec("both trees actually contain focuses", idsA.length > 5 && idsB.length > 5,
      { first: idsA.length, second: idsB.length });

    const shared = idsA.filter((id) => idsB.includes(id));
    rec("the two trees share NO focus id", shared.length === 0,
      { shared: shared.slice(0, 6), count: shared.length });

    // The whole mod must have no duplicate focus id at all.
    const all = [...idsA, ...idsB];
    const dupes = all.filter((id, i) => all.indexOf(id) !== i);
    rec("the mod has no duplicate focus id anywhere", dupes.length === 0,
      { dupes: [...new Set(dupes)].slice(0, 6), count: dupes.length });

    console.log("\n[named copy] a user-supplied filename is unaffected");
    const named = await copy({ fileName: "my_custom_tree" });
    rec("the named copy succeeded", named.status === 200 && named.body && named.body.ok !== false,
      named.body || named.status);
    const namedIds = focusIdsIn("my_custom_tree.txt");
    rec("it got its own ids too", namedIds.length > 5 && !namedIds.some((id) => idsA.includes(id)),
      namedIds.slice(0, 4));
    rec("…prefixed from the name the user chose", namedIds.every((id) => id.startsWith("my_custom_tree")),
      namedIds.slice(0, 4));

    console.log(`\n=== starter tree unique ids: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) {
      fails.forEach((f) => console.log("   FAILED: " + f));
      process.exitCode = 1;
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 6).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
server.on("error", (e) => {
  console.error("listen error:", e.message);
  process.exitCode = 1;
});
