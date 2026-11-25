// #focus-list-ignores-same-filename — SAME PATH MEANS REPLACED, WHATEVER TAG IS INSIDE.
//
// Found by the dependency-axis hunt, then reproduced by hand before it was believed.
//
// `/api/focus/country-trees` keyed its results on `tag|fileName`, so a later root displaced an earlier entry
// only when BOTH matched. HOI4 replaces a common/ file wholesale at the same relative path: when a mod (or an
// add-on over its base) ships a national_focus file whose path an earlier root also ships, the game loads
// only the later file and every `focus_tree` the earlier copy defined is gone. Nova went on listing those
// trees — and handing out their absolute path to open, which is what makes the stale entry actionable rather
// than merely cosmetic.
//
// The discriminating control is the whole proof, and it is below: an add-on shipping the base's path with a
// SAME-tag tree displaced the base entry even before the fix, while the same file with a DIFFERENT-tag tree
// left it offered. That asymmetry is `tag|fileName` keying, not file ownership.
//
// The engine premise settles which behaviour is right. Road to 56 ships 78 of vanilla's 81 national_focus
// basenames with NO `replace_path`, and its `germany.txt` redefines the same tree id `german_focus` with 909
// focuses against vanilla's 438. Under merge that would be 438 duplicate focus ids in one of the most-played
// HOI4 mods; wholesale same-path replacement is the only model under which it works.
//
// Nova already models this three times in the same file — equipment, weapons and technologies.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-fxlist-"));
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
  const p = path.join(__dirname, `.ctl-fxlist-${process.pid}-${label}.js`);
  fs.writeFileSync(p, wasCrlf ? out.replace(/\n/g, "\r\n") : out, "utf8");
  ctlFiles.push(p);
  try { return { createApp: require(p).createApp }; } catch (e) { return { error: String(e && e.message) }; }
}

const tree = (id, tag, n) => {
  const f = [];
  for (let i = 0; i < n; i++) {
    f.push(`\tfocus = {\n\t\tid = ${id}_f${i}\n\t\ticon = GFX_goal_generic_construct_civ_factory\n\t\tx = ${i}\n\t\ty = 0\n\t\tcost = 5\n\t}`);
  }
  return `focus_tree = {\n\tid = ${id}\n\tcountry = {\n\t\tfactor = 0\n\t\tmodifier = { add = 10 tag = ${tag} }\n\t}\n${f.join("\n")}\n}\n`;
};
let seq = 0;
function mkMod(name, opts) {
  const dir = path.join(ROOT, name + (++seq));
  fs.mkdirSync(path.join(dir, "common", "national_focus"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"),
    `name="${opts.modName || name}"\nsupported_version="1.19.*"\n`
    + (opts.dependsOn ? `dependencies={ "${opts.dependsOn}" }\n` : ""), "utf8");
  fs.writeFileSync(path.join(ROOT, `${name}${seq}.mod`),
    `name="${opts.modName || name}"\npath="${dir.replace(/\\/g, "/")}"\nsupported_version="1.19.*"\n`, "utf8");
  if (opts.file) {
    fs.writeFileSync(path.join(dir, "common", "national_focus", opts.file), tree(opts.treeId, opts.tag, opts.n || 3), "utf8");
  }
  return dir;
}

let PORT = 48200;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      trees: async (dir) => {
        const r = await fetch(`http://127.0.0.1:${PORT}/api/focus/country-trees?modPath=${encodeURIComponent(dir)}`)
          .then((x) => x.json()).catch(() => ({}));
        return r.trees || r.items || r.countryTrees || (Array.isArray(r) ? r : []);
      },
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}

// Build the two shapes once, so the fix and the control see identical fixtures.
function shapes(tagOnAddon) {
  mkMod("baseA", { modName: "BaseA" + seq, file: "pack.txt", treeId: "base_tree" + seq, tag: "GER", n: 3 });
  const baseName = "BaseA" + seq;
  const baseTree = "base_tree" + seq;
  const addon = mkMod("addonA", { modName: "AddOnA", dependsOn: baseName, file: "pack.txt", treeId: "addon_tree", tag: tagOnAddon, n: 2 });
  return { addon, baseTree };
}

(async () => {
  let api = null;
  try {
    api = await serve(createApp());

    console.log("\n[same path, DIFFERENT tag] the base's tree is gone, because its file was replaced");
    {
      const { addon, baseTree } = shapes("ITA");
      const list = await api.trees(addon);
      rec("the add-on's own tree is offered", list.some((t) => t.treeId === "addon_tree"), list.map((t) => t.treeId));
      rec("…and the base mod's is NOT, though nothing shares its tag",
        !list.some((t) => t.treeId === baseTree), list.map((t) => t.treeId));
    }

    console.log("\n[same path, SAME tag] behaves the same — this always worked, and is the reason it looked fine");
    {
      const { addon, baseTree } = shapes("GER");
      const list = await api.trees(addon);
      rec("the base mod's tree is not offered", !list.some((t) => t.treeId === baseTree), list.map((t) => t.treeId));
    }

    console.log("\n[a DIFFERENT path] leaves the base's tree alone — the control in the other direction");
    {
      mkMod("baseB", { modName: "BaseB", file: "pack.txt", treeId: "baseb_tree", tag: "GER", n: 3 });
      const addonB = mkMod("addonB", { modName: "AddOnB", dependsOn: "BaseB", file: "mine.txt", treeId: "addonb_tree", tag: "ITA", n: 2 });
      const list = await api.trees(addonB);
      rec("the base mod's tree is still offered", list.some((t) => t.treeId === "baseb_tree"), list.map((t) => t.treeId));
      rec("…alongside the add-on's own", list.some((t) => t.treeId === "addonb_tree"), list.map((t) => t.treeId));
    }
    api.stop(); api = null;

    console.log("\n[back-out] key on tag|fileName again, with no ownership prune");
    {
      const built = controlApp("nokeyprune", [[
        "          // …only from the root that still owns this path.\n          if (focusFileOwner.get(String(rel).toLowerCase()) !== rootIdx) continue;",
        "          // (prune removed)"]]);
      if (built.error) rec("the control patched cleanly", false, built.error);
      else {
        const capi = await serve(built.createApp());
        try {
          mkMod("cbase", { modName: "CBase", file: "pack.txt", treeId: "cbase_tree", tag: "GER", n: 3 });
          const caddon = mkMod("caddon", { modName: "CAddOn", dependsOn: "CBase", file: "pack.txt", treeId: "caddon_tree", tag: "ITA", n: 2 });
          const list = await capi.trees(caddon);
          rec("…the control still lists the add-on's tree", list.some((t) => t.treeId === "caddon_tree"), list.map((t) => t.treeId));
          rec("…and goes on offering a tree from a file the game replaced",
            list.some((t) => t.treeId === "cbase_tree"), list.map((t) => t.treeId));
        } finally { capi.stop(); }
      }
    }

    console.log(`\n=== focus list same filename: ${checks} checks, ${fails.length} failed ===`);
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
