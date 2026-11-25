// #spirit-icons-missing — NATIONAL SPIRITS DREW A GENERIC SHIELD INSTEAD OF THEIR ART.
//
// Reported by the user: "in national spirits if i was not wrong we had pictures for them, i think they are
// gone now in the country setup page, also in the browse list they dont show up, the icons."
//
// Worth being exact about what this was: NOT a regression. `<div class="cs-spirit-icon">🛡️</div>` is
// hardcoded in both the assigned-spirit rows and the Browse picker, and `git log -S` shows it that way in the
// very first commit that has the file. The Ideas maker DOES draw real art (it resolves through
// /api/ideas/sprite-url), which is almost certainly where the memory of "we had pictures" comes from.
//
// The cause was one line in the catalogue: `pictureToken: ""`, under a comment saying icon enrichment is
// deferred for performance. That reasoning holds for icon RESOLUTION — sprite key to a file on disk to a
// converted png — which is genuinely expensive. It does not hold for the raw token, which is three regex
// characters against a block already sitting in memory. So every consumer got a blank and had no choice but
// to draw a placeholder.
//
// GROUND TRUTH, measured rather than assumed: HOI4 draws an idea with sprite `GFX_idea_<token>` where token
// is the block's `picture = …` — a BARE name, not a GFX key. Vanilla `picture = AFG_zahir_shah_idea` against
// `name = "GFX_idea_AFG_zahir_shah_idea"` in interface/ideas.gfx. 5,612 of vanilla's 5,998 idea blocks
// declare one (94%) and 9,992 of Millennium Dawn's 10,518 (95%). The remainder — doctrine spirits, hidden
// landmark ideas — have no art at all, so the shield stays for them rather than being guessed at.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-spiritpic-"));
process.env.HOI4_MODS_ROOT = ROOT;
const server = require("./server.js");
const { createApp, collectIdeaBlocksFromText } = server;

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

const MOD = path.join(ROOT, "spiritpicmod");
fs.mkdirSync(path.join(MOD, "common", "ideas"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="SpiritPicMod"\nsupported_version="1.19.*"\n', "utf8");
fs.writeFileSync(path.join(MOD, "common", "ideas", "nova_spirits.txt"), `ideas = {
\tcountry = {
\t\tnova_with_art = {
\t\t\tpicture = nova_custom_art
\t\t\tmodifier = { stability_factor = 0.1 }
\t\t}
\t\tnova_no_art = {
\t\t\tmodifier = { war_support_factor = 0.05 }
\t\t}
\t\tnova_commented_art = {
\t\t\t# picture = nova_old_art
\t\t\tpicture = nova_real_art
\t\t\tmodifier = { political_power_gain = 0.2 }
\t\t}
\t\tnova_only_commented = {
\t\t\t# picture = nova_never_use_me
\t\t\tmodifier = { political_power_gain = 0.1 }
\t\t}
\t}
}
`, "utf8");

const PORT = 42623;
const app = createApp();
const srv = app.listen(PORT, async () => {
  try {
    console.log("\n[the scan] a picture token survives, and a COMMENTED one does not");
    const txt = fs.readFileSync(path.join(MOD, "common", "ideas", "nova_spirits.txt"), "utf8");
    const byId = {};
    for (const b of collectIdeaBlocksFromText(txt)) byId[b.ideaId] = b;
    rec("all four blocks were found", Object.keys(byId).length === 4, Object.keys(byId));
    rec("a declared picture is captured", byId.nova_with_art && byId.nova_with_art.picture === "nova_custom_art",
      byId.nova_with_art && byId.nova_with_art.picture);
    rec("a block with no picture reports none", byId.nova_no_art && byId.nova_no_art.picture === "",
      byId.nova_no_art && byId.nova_no_art.picture);
    // WHAT THE CONTROL ACTUALLY SHOWED. I first claimed the comment mask does this work, backed the mask out
    // alone, and the test still passed — so the claim was wrong as stated. Backing out the line anchor alone
    // also still passed. Both defences are independently sufficient; only removing BOTH lets `nova_old_art`
    // through, and then exactly these two checks fail. So they are not vacuous, but they measure the PAIR.
    rec("a commented-out picture is skipped for the real one",
      byId.nova_commented_art && byId.nova_commented_art.picture === "nova_real_art",
      byId.nova_commented_art && byId.nova_commented_art.picture);
    rec("…and a picture that ONLY exists in a comment yields nothing",
      byId.nova_only_commented && byId.nova_only_commented.picture === "",
      byId.nova_only_commented && byId.nova_only_commented.picture);

    console.log("\n[the class] a token is not just letters and underscores");
    // Found by an adversarial review of this very commit, then measured: my first character class was
    // `[A-Za-z0-9_.]`, which truncates at the first hyphen — `pro-american` -> `pro`. That is 4 vanilla
    // ideas and 135 in Millennium Dawn, and since /api/icon-image answers a miss with a placeholder rather
    // than a 404 they would draw the WRONG art instead of falling back to the shield. Three sibling
    // `picMatch` regexes in server.js already used `[A-Za-z0-9_.:-]`; the new one did not.
    const hyph = collectIdeaBlocksFromText(`ideas = {\n\tcountry = {\n\t\tnova_hyphen = {\n\t\t\tpicture = pro-american\n\t\t}\n\t\tnova_colon = {\n\t\t\tpicture = ns:thing\n\t\t}\n\t}\n}\n`);
    const hy = hyph.find((b) => b.ideaId === "nova_hyphen");
    const co = hyph.find((b) => b.ideaId === "nova_colon");
    rec("a hyphenated token survives whole", hy && hy.picture === "pro-american", hy && hy.picture);
    rec("…and a colon does too", co && co.picture === "ns:thing", co && co.picture);
    // And the real corpora, not just a fixture: every declared token must round-trip exactly.
    let mismatched = 0, sample = null;
    for (const root of ["D:/SteamLibrary/steamapps/common/Hearts of Iron IV",
                        "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649"]) {
      const dir = path.join(root, "common", "ideas");
      const fl = [];
      (function walk(dd) {
        let es = []; try { es = fs.readdirSync(dd, { withFileTypes: true }); } catch (_) { return; }
        for (const e of es) { const p = path.join(dd, e.name); if (e.isDirectory()) walk(p); else if (/\.txt$/i.test(e.name)) fl.push(p); }
      })(dir);
      for (const f of fl) {
        let t = ""; try { t = fs.readFileSync(f, "utf8"); } catch (_) { continue; }
        for (const b of collectIdeaBlocksFromText(t)) {
          // The oracle has to handle a QUOTED value too, or it disagrees with a correct parser. MD ships
          // `picture = "glilot_kiryah rivalry"` — a quoted token containing a space.
          const raw = /(^|\n)[ \t]*picture[ \t]*=[ \t]*("(?:[^"\r\n]*)"|[^\s#{}"]+)/.exec(b.blockText || "");
          if (!raw) continue;
          const declared = /^"/.test(raw[2]) ? raw[2].slice(1, -1).trim() : raw[2];
          if (declared !== b.picture) { mismatched += 1; if (!sample) sample = { id: b.ideaId, declared, got: b.picture }; }
        }
      }
    }
    rec("every picture token in vanilla AND Millennium Dawn round-trips exactly", mismatched === 0,
      { mismatched, sample });

    console.log("\n[the catalogue] the token reaches the client");
    const qs = new URLSearchParams({
      includeVanilla: "0", includeActiveMod: "1", includeWorkshop: "0", includeModsRoot: "0",
      sourcePath: MOD, modPath: MOD,
    });
    const r = await fetch(`http://127.0.0.1:${PORT}/api/ideas/catalog?${qs}`);
    const d = await r.json();
    const items = (d && d.items) || [];
    const find = (id) => items.find((it) => it.ideaId === id);
    rec("the catalogue answered with our ideas", items.length >= 4, items.length);
    rec("pictureToken is no longer blanked", find("nova_with_art") && find("nova_with_art").pictureToken === "nova_custom_art",
      find("nova_with_art"));
    rec("…and stays empty where there is genuinely no art",
      find("nova_no_art") && find("nova_no_art").pictureToken === "", find("nova_no_art"));

    console.log("\n[the cache] a catalogue written by the OLD schema must not be served");
    // The half that decides whether a user ever sees this fix, and it had no test. The disk cache is keyed by
    // a fingerprint of the idea files' size+mtime, so nothing about ADDING A FIELD invalidates it — a cache
    // written before pictureToken existed stays valid and serves blanks forever. That is why the fingerprint
    // carries a `schema:vN` knob, and why it had to be bumped. Forge a stale entry and prove it is rejected.
    {
      const cacheDir = path.join(process.env.APPDATA || os.homedir(), "NovaModdingSuite", "cache");
      let files = [];
      try { files = fs.readdirSync(cacheDir).filter((f) => /^ideacatalog_.*\.json$/.test(f)); } catch (_) {}
      rec("the catalogue's disk cache exists after a request", files.length > 0, { cacheDir, files: files.length });
      if (files.length) {
        // Newest one is ours. Poison it: keep its fingerprint, blank every pictureToken.
        const newest = files
          .map((f) => ({ f, t: fs.statSync(path.join(cacheDir, f)).mtimeMs }))
          .sort((a, b) => b.t - a.t)[0].f;
        const p = path.join(cacheDir, newest);
        const j = JSON.parse(fs.readFileSync(p, "utf8"));
        rec("…and the cached items carry the new field", (j.items || []).some((it) => it.pictureToken), newest);
        // Forge the cache an OLDER Nova would have written: blank tokens, and the fingerprint that
        // `schema:v1` produces over the same files. Poisoning with the CURRENT fingerprint proves nothing —
        // I tried that first and the control refused to fire, because any file whose fingerprint matches is
        // served regardless of what is in it. The bump is only doing work if the v1 fingerprint is REJECTED.
        const crypto = require("crypto");
        const ideaFiles = [];
        (function walk(dd) {
          let es = []; try { es = fs.readdirSync(dd, { withFileTypes: true }); } catch (_) { return; }
          for (const e of es) { const q = path.join(dd, e.name); if (e.isDirectory()) walk(q); else if (/\.txt$/i.test(e.name)) ideaFiles.push(q); }
        })(path.join(MOD, "common", "ideas"));
        const parts = ideaFiles.map((f) => { const st = fs.statSync(f); return `${f}:${st.size}:${st.mtimeMs}`; });
        parts.unshift("schema:v1");
        const v1Fingerprint = crypto.createHash("sha1").update(parts.join("\n")).digest("hex");
        rec("…and the forged v1 fingerprint differs from the live one", v1Fingerprint !== j.fingerprint,
          { v1: v1Fingerprint.slice(0, 12), live: String(j.fingerprint).slice(0, 12) });
        const poisoned = { fingerprint: v1Fingerprint, items: (j.items || []).map((it) => ({ ...it, pictureToken: "" })) };
        fs.writeFileSync(p, JSON.stringify(poisoned), "utf8");
        // Memory-cache only: clearIdeasCatalogCache() would delete the file we just forged.
        server._clearIdeasCatalogMemoryCacheForTests();
        const again = await fetch(`http://127.0.0.1:${PORT}/api/ideas/catalog?${new URLSearchParams({
          includeVanilla: "0", includeActiveMod: "1", includeWorkshop: "0", includeModsRoot: "0",
          sourcePath: MOD, modPath: MOD,
        })}`).then((x) => x.json());
        const art = (again.items || []).find((it) => it.ideaId === "nova_with_art");
        // If the schema knob were still v1 the poisoned file would validate and this would be "".
        rec("…and a stale-schema cache is not served", art && art.pictureToken === "nova_custom_art", art);
      }
    }

    console.log("\n[ground truth] GFX_idea_<token> is the key the game resolves");
    const V = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
    let gfx = "";
    try { gfx = fs.readFileSync(path.join(V, "interface", "ideas.gfx"), "utf8"); } catch (_) {}
    rec("vanilla's ideas.gfx was readable", gfx.length > 1000, gfx.length);
    rec("…and the bare token is prefixed with GFX_idea_ there",
      /name\s*=\s*"GFX_idea_AFG_zahir_shah_idea"/.test(gfx), "GFX_idea_AFG_zahir_shah_idea not found");
    // And the bare form must NOT be a sprite name, or the prefix would be wrong.
    rec("…and the bare token is not itself a sprite name",
      !/name\s*=\s*"AFG_zahir_shah_idea"/.test(gfx), "bare name unexpectedly present");

    console.log("\n[coverage] most real ideas actually have art — this is worth drawing");
    let tot = 0, withPic = 0;
    const ideasDir = path.join(V, "common", "ideas");
    const files = [];
    (function walk(dir) {
      let ents = [];
      try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
      for (const e of ents) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p); else if (/\.txt$/i.test(e.name)) files.push(p);
      }
    })(ideasDir);
    for (const f of files) {
      let t = ""; try { t = fs.readFileSync(f, "utf8"); } catch (_) { continue; }
      for (const b of collectIdeaBlocksFromText(t)) { tot++; if (b.picture) withPic++; }
    }
    rec("vanilla's ideas were scanned", tot > 4000, tot);
    rec("…and the large majority declare a picture", withPic / tot > 0.85, `${withPic}/${tot}`);
    console.log(`       (${withPic} of ${tot} = ${Math.round((withPic / tot) * 100)}%)`);

    console.log("\n[the client] source-level only — the behaviour lives in e2e-spirit-icons.js");
    // These are string matches against the client source. An adversarial review was right that greps like
    // these survive the reported symptom: they prove the file CONTAINS certain text, not that a spirit ever
    // draws its art. They are kept as a cheap tripwire for an accidental revert, and the real proof was
    // moved to e2e-spirit-icons.js, which drives both surfaces in a browser and fails 7 of 12 when the
    // hardcoded shield is put back.
    const cs = fs.readFileSync(path.join(__dirname, "public", "country-setup.js"), "utf8");
    rec("the shield is no longer hardcoded in the assigned rows",
      /\$\{spiritIconHtml\(picMap\[id\]\)\}/.test(cs), "assigned-row icon not wired");
    rec("…nor in the Browse picker",
      /\$\{spiritIconHtml\(item\.pictureToken, "cs-picker-icon"\)\}/.test(cs), "picker icon not wired");
    rec("…and the fallback is CSP-safe (no inline onerror)",
      /data-fallback-html=/.test(cs) && !/<img[^>]*\sonerror=/.test(cs), "inline onerror present");
    rec("…and the sprite key is built with the GFX_idea_ prefix",
      /"GFX_idea_" \+ token/.test(cs), "prefix not applied");
    // …but NOT when the token is already a sprite key. Measured across vanilla + Millennium Dawn: of the 51
    // distinct `picture` values that already start with GFX_, 35 resolve as the token ITSELF, 15 resolve as
    // nothing (broken in the mod), and exactly 1 wants the double prefix. So prefixing unconditionally is
    // wrong for the large majority. An adversarial verifier told me not to change this, citing that single
    // exception as proof the double prefix was game-faithful — checking the whole population is what
    // settled it.
    rec("…and a token that is ALREADY a sprite key is not double-prefixed",
      /\/\^GFX_\/i\.test\(token\)/.test(cs), "double-prefix guard missing");
    // A token goes into a URL and into markup; anything outside this class must not be drawn at all.
    // The guard rejects what would break the markup or the URL, rather than whitelisting a character class —
    // a whitelist is what put the shield back on 135 MD spirits and on `the_people's_army`.
    rec("…and a token that would break the markup is refused",
      /\/\[\\s<>"&\]\/\.test\(token\)/.test(cs), "token not guarded");

    console.log(`\n=== spirit picture token: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    try { srv.closeAllConnections(); } catch (_) {}
    srv.close();
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  }
});
srv.on("error", (e) => { console.error("listen error:", e.message); process.exitCode = 1; });
