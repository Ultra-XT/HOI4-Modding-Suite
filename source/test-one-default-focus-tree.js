// #two-default-trees — TWO CLICKS PRODUCED A MOD WITH TWO FALLBACK TREES.
//
// `default = yes` names THE fallback focus tree, and HOI4 honours one of them. The owner dialog's
// "Shared / fallback tree" preset force-ticked that flag for EVERY shared tree, and the checkbox it ticks
// lives inside a COLLAPSED "Advanced" section — so a modder who made a second shared tree wrote a second
// `default = yes` they never saw. The game then picks one and ignores the other, with nothing in error.log
// to explain why a tree "does nothing".
//
// Measured over the shipping corpora, every root carries EXACTLY ONE default focus tree: vanilla's
// generic_focus (of 67 trees) and Millennium Dawn's dummy_generic_focus (of 93). Nobody ships two.
//
// The guard is deliberately scoped to ONE MOD. Vanilla already has a default tree and out-ranking it is the
// entire point of the feature — MD ships its own alongside vanilla's — so a cross-root check would refuse
// every legitimate use. See the mod-scope control below, which is the half most likely to be "fixed" wrong.
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
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-onedefault-"));
process.env.HOI4_MODS_ROOT = ROOT;
process.env.APPDATA = path.join(ROOT, "appdata");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
const { createApp } = require("./server.js");

const toPosix = (p) => p.split(path.sep).join("/");
const PORT = 53307;

function makeMod(name, deps) {
  const dir = path.join(ROOT, name);
  fs.mkdirSync(path.join(dir, "common", "national_focus"), { recursive: true });
  const depLines = (deps || []).map((d) => `\t"${d}"`).join("\n");
  fs.writeFileSync(
    path.join(dir, "descriptor.mod"),
    `name="${name}"\nsupported_version="1.19.*"\n` + (deps && deps.length ? `dependencies={\n${depLines}\n}\n` : "")
  );
  fs.writeFileSync(
    path.join(ROOT, `${name}.mod`),
    `name="${name}"\npath="${toPosix(dir)}"\nsupported_version="1.19.*"\n` + (deps && deps.length ? `dependencies={\n${depLines}\n}\n` : "")
  );
  return dir;
}
const tree = (id) => `focus_tree = {\n\tid = ${id}\n\tfocus = {\n\t\tid = ${id}_a\n\t\tx = 0\n\t\ty = 0\n\t\tcost = 1\n\t}\n}\n`;
const write = (mod, file, text) => fs.writeFileSync(path.join(mod, "common", "national_focus", file), text);
const read = (mod, file) => fs.readFileSync(path.join(mod, "common", "national_focus", file), "utf8");
const isDefault = (mod, file) => /(^|\n)\s*default\s*=\s*yes/i.test(read(mod, file));

(async () => {
  const srv = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
  const post = (body) => fetch(`http://127.0.0.1:${PORT}/api/focus/tree-properties`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }))
    .catch((e) => ({ status: 0, body: { error: String(e) } }));

  // Exactly what the owner dialog sends for "Shared / fallback tree": shared, weight 2, isDefault ticked.
  const shareIt = (mod, file, treeId, def) => post({
    modPath: mod, relPath: `common/national_focus/${file}`, treeId, tag: "", shared: true, weight: 2, isDefault: def,
  });

  try {
    console.log("\n[the bug] two trees, both flagged the fallback");
    {
      const mod = makeMod("twodef");
      write(mod, "alpha.txt", tree("alpha_tree"));
      write(mod, "bravo.txt", tree("bravo_tree"));

      const first = await shareIt(mod, "alpha.txt", "alpha_tree", true);
      rec("the FIRST default is accepted", first.status === 200, first);
      rec("…and really landed on disk", isDefault(mod, "alpha.txt"), read(mod, "alpha.txt").slice(0, 120));

      const second = await shareIt(mod, "bravo.txt", "bravo_tree", true);
      rec("the SECOND default is refused", second.status === 400, second);
      rec("…and nothing was written to the second file", !isDefault(mod, "bravo.txt"), read(mod, "bravo.txt").slice(0, 120));
      // Naming the holder is the whole value: "one default" is useless advice without "and it's over there".
      const msg = String((second.body && second.body.error) || "");
      rec("…and the message names the file that holds it", msg.includes("alpha.txt"), msg);
      rec("…and names the tree inside it", msg.includes("alpha_tree"), msg);
      rec("…and says nothing was changed", /nothing was changed/i.test(msg), msg);
      // The first tree must be left alone — a refusal that edited the other file would be worse than the bug.
      rec("…and the tree that held the default is untouched", isDefault(mod, "alpha.txt"), read(mod, "alpha.txt").slice(0, 120));
    }

    console.log("\n[CONTROL] the feature still works — a second SHARED tree without the flag saves");
    {
      const mod = makeMod("sharedok");
      write(mod, "alpha.txt", tree("alpha_tree"));
      write(mod, "bravo.txt", tree("bravo_tree"));
      await shareIt(mod, "alpha.txt", "alpha_tree", true);
      const second = await shareIt(mod, "bravo.txt", "bravo_tree", false);
      rec("a second shared tree is accepted when it doesn't claim the default", second.status === 200, second);
      // Shared is carried by the untagged country block, NOT by `default` — that is why dropping the flag
      // costs the modder nothing. If this assertion ever fails, the preset change above became a real loss.
      rec("…and it is genuinely shared (untagged country weight)", /country\s*=\s*\{[^}]*factor\s*=\s*2/.test(read(mod, "bravo.txt")), read(mod, "bravo.txt").slice(0, 160));
      rec("…and it did NOT get a default flag", !isDefault(mod, "bravo.txt"), read(mod, "bravo.txt").slice(0, 160));
    }

    console.log("\n[CONTROL] re-saving the tree that ALREADY holds the default is not a conflict");
    {
      const mod = makeMod("resave");
      write(mod, "alpha.txt", tree("alpha_tree"));
      await shareIt(mod, "alpha.txt", "alpha_tree", true);
      // Changing the weight on the existing default tree — the guard must not treat the tree as its own rival.
      const again = await post({
        modPath: mod, relPath: "common/national_focus/alpha.txt", treeId: "alpha_tree",
        tag: "", shared: true, weight: 5, isDefault: true,
      });
      rec("the default tree can be edited again", again.status === 200, again);
      rec("…and keeps its default flag", isDefault(mod, "alpha.txt"), read(mod, "alpha.txt").slice(0, 120));
      rec("…and took the new weight", /factor\s*=\s*5/.test(read(mod, "alpha.txt")), read(mod, "alpha.txt").slice(0, 160));
    }

    console.log("\n[CONTROL] MOD-SCOPED — a base mod's default must not block this mod's own");
    {
      // This is the half a well-meaning change is most likely to break, by swapping the mod-only walker for
      // getActiveRoots(). Vanilla ships generic_focus and MD ships dummy_generic_focus ON TOP of it; if the
      // guard looked across roots, no mod could ever set a default and the feature would be dead.
      const base = makeMod("basemod");
      write(base, "generic.txt", tree("base_generic"));
      await shareIt(base, "generic.txt", "base_generic", true);
      rec("the base mod has a default tree (fixture assertion)", isDefault(base, "generic.txt"), read(base, "generic.txt").slice(0, 120));

      const child = makeMod("childmod", ["basemod"]);
      write(child, "mine.txt", tree("child_generic"));
      const r = await shareIt(child, "mine.txt", "child_generic", true);
      rec("a dependent mod can still declare its own default", r.status === 200, r);
      rec("…and it landed", isDefault(child, "mine.txt"), read(child, "mine.txt").slice(0, 120));
    }

    console.log("\n[CONTROL] two trees in ONE file still collide");
    {
      const mod = makeMod("onefile");
      write(mod, "both.txt", tree("first_tree") + tree("second_tree"));
      const a = await shareIt(mod, "both.txt", "first_tree", true);
      rec("the first tree in the file takes the default", a.status === 200, a);
      const b = await shareIt(mod, "both.txt", "second_tree", true);
      rec("its neighbour in the SAME file is refused", b.status === 400, b);
      rec("…naming the tree, not just the file", String((b.body && b.body.error) || "").includes("first_tree"), b.body);
    }
  } finally {
    srv.closeAllConnections();
    srv.close();
  }

  // ── The client half: the preset must ask before it claims the flag ────────────────────────────────────
  console.log("\n[client] the fallback preset no longer ticks `default` unconditionally");
  {
    const APP = fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8");
    // ⭐ Strip comments first — the prose ABOVE the fix quotes the very line the fix removed.
    const CODE = stripJsComments(APP);
    rec("the unconditional tick is gone", !/if \(defEl && shared\) defEl\.checked = true;/.test(CODE), "still unconditional");
    rec("…replaced by a guarded one", /if \(defEl && shared && !otherDefault\) defEl\.checked = true;/.test(CODE), "guard not found");
    rec("treeOwnerOtherDefaultTree exists", /function treeOwnerOtherDefaultTree\(/.test(CODE), "missing");
    rec("…and the open path fills the cache before the preset runs",
      /await getTreeOwnerCountryTrees\(\);\s*onTreeOwnerModeChange\(\);/.test(CODE), "not prefetched");

    // A note rendered into an element the page does not contain is a dead warning.
    const HTML = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");
    rec("the note element exists in the page", /id="treeOwnerDefaultTaken"/.test(HTML), "missing from index.html");

    // Run the real helper.
    const at = CODE.indexOf("function treeOwnerOtherDefaultTree(");
    let fn = null;
    if (at !== -1) {
      const open = CODE.indexOf("{", at);
      let d = 0, end = -1;
      for (let i = open; i < CODE.length; i++) {
        const c = CODE[i];
        if (c === "{") d++;
        else if (c === "}") { d--; if (d === 0) { end = i; break; } }
      }
      if (end !== -1) {
        const src = CODE.slice(at, end + 1);
        // eslint-disable-next-line no-new-func
        fn = new Function("treeOwnerDialog", "treeOwnerCountryTreesCache", `${src}; return treeOwnerOtherDefaultTree;`);
      }
    }
    rec("…and is runnable", typeof fn === "function", typeof fn);
    if (typeof fn === "function") {
      const dlg = { dataset: { treeId: "mine" } };
      const call = (cache) => fn(dlg, cache)();
      rec("no trees -> nothing holds the default", call([]) === null, call([]));
      rec("a base-game default does NOT count (inMod false)",
        call([{ treeId: "generic_focus", isDefault: true, inMod: false }]) === null, "counted an inherited tree");
      rec("this tree's own default does not count as a rival",
        call([{ treeId: "mine", isDefault: true, inMod: true }]) === null, "flagged itself");
      const rival = call([{ treeId: "other", isDefault: true, inMod: true }]);
      rec("another tree in the mod IS a rival", rival && rival.treeId === "other", rival);
      rec("a non-default sibling is not a rival",
        call([{ treeId: "other", isDefault: false, inMod: true }]) === null, "flagged a non-default tree");
    }
  }

  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  console.log(`\n=== one default focus tree: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
