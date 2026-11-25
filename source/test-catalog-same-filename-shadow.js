// #catalog-offers-a-replaced-file — A FILE AT THE SAME PATH REPLACES IT WHOLESALE, WITH NO replace_path.
//
// The catalogue knew the loud half of the rule — a descriptor declaring replace_path="common/ideas" means
// the game loads none of vanilla's, so the game root is dropped. It did not know the quiet half: HOI4 also
// replaces a single common/ file outright when a mod ships one at the SAME RELATIVE PATH, with no descriptor
// line involved. So Country Setup and every spirit picker offered ideas that do not exist in the running
// game, and referencing one is how a mod ends up granting nothing.
//
// 🈯 Measured against the workshop mods installed on this machine:
//     The Road to 56   101 shadowed vanilla idea files, NO replace_path → the picker offered 4,409
//                      vanilla ideas the game does not load. Measured as the catalogue's own delta for
//                      an R56 add-on: 16,939 entries before, 12,530 after, base-game entries 5,998 →
//                      1,589. (Those 101 files hold 4,815 idea definitions; 4,409 is how many of them
//                      actually reached the picker, which is the number that describes the symptom.)
//     Novum Vexillum 38, Rise of Nations 49, Old World Blues 4, Millennium Dawn 5 — all declare
//                      replace_path, so the existing guard already covered those
// The gap is worst under one of the most widely used base mods there is.
//
// ⚠️ Two controls carry this test. A browse source (an explicitly named `sourcePath`) must NOT be filtered —
// hiding what the user asked to look at is a different bug in the same place. And a mod that ships an EMPTY
// file at a vanilla path still replaces it, so ownership has to come from the files on disk rather than from
// the ideas parsed out of them.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-catshadow-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500));
  }
}

const toPosix = (p) => p.split(path.sep).join("/");
const mk = (p) => (fs.mkdirSync(p, { recursive: true }), p);
const ideasFile = (ids) => [
  "ideas = {",
  "\tcountry = {",
  ...ids.flatMap((id) => [
    "\t\t" + id + " = {",
    "\t\t\tpicture = generic_morale_bonus",
    "\t\t\tremoval_cost = -1",
    "\t\t\tmodifier = { political_power_gain = 0.1 }",
    "\t\t}",
  ]),
  "\t}",
  "}",
  "",
].join("\n");

// ── the BASE mod: two files, one of which the add-on will shadow ─────────────────────────────────────────
const BASE = path.join(ROOT, "shadowbase");
mk(path.join(BASE, "common", "ideas"));
fs.writeFileSync(path.join(BASE, "descriptor.mod"), 'name="ShadowBase"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "shadowbase.mod"),
  'name="ShadowBase"\npath="' + toPosix(BASE) + '"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(BASE, "common", "ideas", "shared.txt"), ideasFile(["base_in_shared_a", "base_in_shared_b"]));
fs.writeFileSync(path.join(BASE, "common", "ideas", "untouched.txt"), ideasFile(["base_in_untouched"]));
fs.writeFileSync(path.join(BASE, "common", "ideas", "blanked.txt"), ideasFile(["base_in_blanked"]));

// ── the ADD-ON: replaces `shared.txt` and BLANKS `blanked.txt`, no replace_path anywhere ─────────────────
const ADDON = path.join(ROOT, "shadowaddon");
mk(path.join(ADDON, "common", "ideas"));
fs.writeFileSync(path.join(ADDON, "descriptor.mod"),
  'name="ShadowAddon"\ndependencies={\n\t"ShadowBase"\n}\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "shadowaddon.mod"),
  'name="ShadowAddon"\npath="' + toPosix(ADDON) + '"\ndependencies={\n\t"ShadowBase"\n}\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ADDON, "common", "ideas", "shared.txt"), ideasFile(["addon_in_shared"]));
// An override with nothing in it. HOI4 still loads THIS file instead of the base's.
fs.writeFileSync(path.join(ADDON, "common", "ideas", "blanked.txt"), "# intentionally empty\n");

// ── an UNRELATED mod that happens to use the same filename ───────────────────────────────────────────────
// Needed for the browse-source control below to mean anything. Pointing `sourcePath` at the BASE would not
// work: the base is already in the root list as a dependency and addRoot dedupes by resolved path, so the
// "custom" entry would silently collapse into it and no collision would exist to measure.
const OTHER = path.join(ROOT, "othermod");
mk(path.join(OTHER, "common", "ideas"));
fs.writeFileSync(path.join(OTHER, "descriptor.mod"), 'name="Other"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(ROOT, "othermod.mod"),
  'name="Other"\npath="' + toPosix(OTHER) + '"\nsupported_version="1.19.*"\n');
fs.writeFileSync(path.join(OTHER, "common", "ideas", "shared.txt"), ideasFile(["other_in_shared"]));

let PORT = 50500;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      catalog: (q) => fetch("http://127.0.0.1:" + PORT + "/api/ideas/catalog?" + q)
        .then((r) => r.json()).catch((e) => ({ error: String(e) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}

(async () => {
  let api = null;
  try {
    console.log("\n[ground truth] real base mods shadow vanilla idea files without saying so");
    {
      const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
      const V = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/common/ideas";
      if (fs.existsSync(WS) && fs.existsSync(V)) {
        const vfiles = new Set(fs.readdirSync(V).filter((f) => f.endsWith(".txt")));
        const rows = [];
        for (const d of fs.readdirSync(WS)) {
          const root = path.join(WS, d);
          const dir = path.join(root, "common", "ideas");
          if (!fs.existsSync(dir)) continue;
          let desc = ""; try { desc = fs.readFileSync(path.join(root, "descriptor.mod"), "utf8"); } catch (_) { continue; }
          const declares = /replace_path\s*=\s*"common\/ideas"/.test(desc);
          const shadowed = fs.readdirSync(dir).filter((f) => f.endsWith(".txt") && vfiles.has(f)).length;
          if (shadowed) rows.push({ name: (/name\s*=\s*"([^"]+)"/.exec(desc) || [, d])[1], shadowed, declares });
        }
        rows.forEach((r) => console.log(`     ${r.name.slice(0, 36).padEnd(36)} shadows ${String(r.shadowed).padStart(3)}   replace_path: ${r.declares ? "yes" : "NO"}`));
        rec("at least one installed base mod shadows vanilla idea files with no replace_path",
          rows.some((r) => r.shadowed > 0 && !r.declares), rows);
      } else console.log("     (no workshop mods / vanilla installed — skipped)");
    }

    api = await serve(createApp());
    const ids = async (q) => {
      const r = await api.catalog(q);
      return { items: r.items || [], set: new Set((r.items || []).map((i) => i.ideaId)) };
    };
    const enc = encodeURIComponent;

    console.log("\n[the add-on's catalogue] must not offer what its own file replaced");
    {
      const { set, items } = await ids(`withNames=0&modPath=${enc(ADDON)}&includeVanilla=0`);
      rec("the add-on's own idea is offered", set.has("addon_in_shared"), [...set]);
      rec("…the base's ideas from an UNSHADOWED file are still offered", set.has("base_in_untouched"), [...set]);
      rec("…but the two in the file it replaced are gone",
        !set.has("base_in_shared_a") && !set.has("base_in_shared_b"), [...set]);
      rec("…including through an EMPTY override, which replaces just the same",
        !set.has("base_in_blanked"), [...set]);
      rec("…and nothing was emptied wholesale", items.length >= 2, items.length);
    }

    console.log("\n[CONTROL — the base mod on its own] sees every one of its own ideas");
    {
      const { set } = await ids(`withNames=0&modPath=${enc(BASE)}&includeVanilla=0`);
      rec("all four of its ideas are present",
        ["base_in_shared_a", "base_in_shared_b", "base_in_untouched", "base_in_blanked"].every((i) => set.has(i)),
        [...set]);
      rec("…and it does not see the add-on's", !set.has("addon_in_shared"), [...set]);
    }

    console.log("\n[⚠️ CONTROL — an explicitly browsed source] must NOT be filtered");
    {
      // sourcePath is "show me what is inside that mod". Hiding half of it because the ACTIVE mod happens to
      // ship a file of the same name would answer a question nobody asked. OTHER is not in the add-on's load
      // order at all, so its shared.txt is not replaced by anything — but it collides by name with the
      // add-on's, which is exactly the situation an over-broad filter gets wrong.
      const { set } = await ids(`withNames=0&modPath=${enc(ADDON)}&includeVanilla=0&sourcePath=${enc(OTHER)}`);
      rec("the browsed mod's colliding file is a real collision", set.has("addon_in_shared"), [...set]);
      rec("…and browsing it still shows its own idea from that file", set.has("other_in_shared"), [...set]);
      // …while the load-order rule still applies to the roots it governs, in the same response.
      rec("…without switching the rule off for the dependency", !set.has("base_in_shared_a"), [...set]);
    }

    console.log("\n[CONTROL — vanilla] a plain mod that shadows nothing loses nothing");
    {
      const PLAIN = path.join(ROOT, "plainmod");
      mk(path.join(PLAIN, "common", "ideas"));
      fs.writeFileSync(path.join(PLAIN, "descriptor.mod"), 'name="Plain"\nsupported_version="1.19.*"\n');
      fs.writeFileSync(path.join(PLAIN, "common", "ideas", "zz_mine.txt"), ideasFile(["plain_own_idea"]));
      const withV = await ids(`withNames=0&modPath=${enc(PLAIN)}&includeVanilla=1`);
      const noV = await ids(`withNames=0&modPath=${enc(PLAIN)}&includeVanilla=0`);
      rec("its own idea is there", withV.set.has("plain_own_idea"), [...withV.set].slice(0, 5));
      rec("…and vanilla's ideas are still offered in full",
        withV.items.length > noV.items.length + 100, { withVanilla: withV.items.length, without: noV.items.length });
    }

    api.stop(); api = null;
    console.log(`\n=== catalogue same-path shadow: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { if (api) api.stop(); } catch (_) {}
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
})();
