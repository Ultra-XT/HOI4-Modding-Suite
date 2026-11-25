// #inherited-tree-unlabelled — SAY WHOSE FILE THIS IS, BEFORE THE CLICK.
//
// The last of the dependency-axis hunt's findings, and the only one whose framing did not survive
// verification intact. The original claim was that saving a focus tree "writes into the mod it depends on",
// which the verifier demolished: `/api/save` is the generic Load/Save endpoint behind the file picker, its
// contract IS "edit the file you opened", `resolveUserPath` deliberately whitelists the mods folder, and the
// vanilla asymmetry is the Settings toggle protecting the game install, not an ownership guard. Saving into a
// third mod with no dependency relationship behaves identically.
//
// What survives is narrower and still real: the focus picker keeps only `inMod` trees, and falls through to
// everything the endpoint returned when the mod owns none — which is exactly a brand-new add-on. So its base
// mod's trees and vanilla's sat in the dropdown, and the only thing distinguishing them was the ABSENCE of a
// star. Opening one and saving edits that file where it lives, and nothing said so.
//
// This does not restrict the write — that would break the file picker's whole purpose. It makes the list
// honest: each entry names the mod it comes from, and carries a tooltip saying that editing it edits that
// mod's file rather than yours.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-inh-"));
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

const CLIENT = fs.readFileSync(path.join(__dirname, "public", "app.js"), "utf8");
const INDEX = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8");

const toPosix = (p) => p.split(path.sep).join("/");
const tree = (id, tag) =>
  "focus_tree = {\n\tid = " + id + "\n\tcountry = { factor = 0 modifier = { add = 10 tag = " + tag + " } }\n" +
  "\tfocus = { id = " + id + "_f0 icon = GFX_goal_generic_construct_civ_factory x = 0 y = 0 cost = 5 }\n}\n";
let seq = 0;
function mkMod(name, opts) {
  const dir = path.join(ROOT, name + (++seq));
  fs.mkdirSync(path.join(dir, "common", "national_focus"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"),
    'name="' + opts.modName + '"\nsupported_version="1.19.*"\n'
    + (opts.dependsOn ? 'dependencies={ "' + opts.dependsOn + '" }\n' : ""), "utf8");
  fs.writeFileSync(path.join(ROOT, name + seq + ".mod"),
    'name="' + opts.modName + '"\npath="' + toPosix(dir) + '"\nsupported_version="1.19.*"\n', "utf8");
  if (opts.file) fs.writeFileSync(path.join(dir, "common", "national_focus", opts.file), tree(opts.treeId, opts.tag), "utf8");
  return dir;
}

let PORT = 48300;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      trees: async (dir) => {
        const r = await fetch("http://127.0.0.1:" + PORT + "/api/focus/country-trees?modPath=" + encodeURIComponent(dir))
          .then((x) => x.json()).catch((e) => ({ error: String(e) }));
        return { list: r.trees || [], error: r.error };
      },
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}

(async () => {
  let api = null;
  try {
    api = await serve(createApp());

    console.log("\n[an add-on that owns no tree] is shown the base mod's, and told whose it is");
    mkMod("base", { modName: "My Base Mod", file: "base.txt", treeId: "base_tree", tag: "GER" });
    const addon = mkMod("addon", { modName: "AddOn", dependsOn: "My Base Mod" });
    const r = await api.trees(addon);
    rec("the endpoint answers", !r.error, r.error);
    rec("…offering trees at all, since the add-on has none of its own", r.list.length > 0, r.list.length);
    const base = r.list.find((t) => t.treeId === "base_tree");
    rec("the base mod's tree is offered", !!base, r.list.map((t) => t.treeId).slice(0, 6));
    rec("…marked as not the add-on's own", base && base.inMod === false, base);
    rec("…and NAMED with the mod it belongs to", base && base.sourceName === "My Base Mod", base && base.sourceName);
    const vanilla = r.list.find((t) => !t.inMod && t.sourceName === "base game");
    rec("a base-game tree says so too", !!vanilla, r.list.filter((t) => !t.inMod).map((t) => t.sourceName).slice(0, 5));

    console.log("\n[a mod that owns its tree] is unchanged — no label where none is needed");
    const own = mkMod("own", { modName: "Own", file: "own.txt", treeId: "own_tree", tag: "ITA" });
    const r2 = await api.trees(own);
    const mine = r2.list.find((t) => t.treeId === "own_tree");
    rec("its own tree is offered", !!mine, r2.list.map((t) => t.treeId).slice(0, 6));
    rec("…flagged as the mod's own", mine && mine.inMod === true, mine);
    rec("…and carries no source label", mine && !mine.sourceName, mine && mine.sourceName);
    api.stop(); api = null;

    console.log("\n[the picker] shows it, and says what opening one will do");
    rec("the label appends the source for an inherited tree",
      /const from = !t\.inMod && t\.sourceName \? ` — from \$\{t\.sourceName\}` : ""/.test(CLIENT), "no label");
    rec("…and it reaches the option text", /\$\{label\}\$\{from\}`/.test(CLIENT), "not rendered");
    rec("…with a tooltip saying whose file it edits",
      /Opening it edits that file, not your mod's\./.test(CLIENT), "no tooltip");
    rec("…and a fallback when the source could not be named",
      /This tree is not in your mod\. Opening it edits the file where it lives\./.test(CLIENT), "no fallback");
    rec("the fall-through that offers them is explained rather than left bare",
      /#inherited-tree-unlabelled/.test(CLIENT), "no note");
    rec("the mod's own trees still get the star", /\$\{t\.inMod \? "★ " : ""\}/.test(CLIENT), "star gone");
    rec("app.js parses", (() => { try { new Function(CLIENT); return true; } catch (e) { return String(e.message); } })() === true,
      (() => { try { new Function(CLIENT); return "ok"; } catch (e) { return String(e.message); } })());
    rec("…and is versioned so the change ships", /app\.js\?v=[\w]+/.test(INDEX), "no version");

    console.log(`\n=== inherited tree labelled: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (api) api.stop(); } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
