// #character-rename-loses-everything — LOOK FOR THE BLOCK UNDER THE NAME IT STILL HAS.
//
// Found by a multi-agent hunt over the makers, then reproduced by hand before it was believed.
//
// `writeCharacterToFile` resolved the block to merge into with
// `findTopLevelCharacterSpan(existing, …, character.token)` — the NEW token. On a rename that token is not in
// the file yet, so the span was null, BOTH the preserve-merge and the "script unchanged, hand the original
// block back" path were skipped, and the thin serialized rebuild was appended verbatim. The rename cleanup
// then deleted the original block. The response was {ok:true, refWarning:""} and the page said "✓ Saved".
//
// What a rename deleted: an advisor's `allowed = { original_tag = … has_dlc = … }` — so it became hireable by
// every country with no condition at all — its `available` gating, `ai_will_do`, `country_leader.id`,
// `legacy_id`, a whole `scientist` role, any second role block, and every comment. 4,771 of vanilla's 5,404
// characters carry at least one affected field.
//
// `previousToken` was in the request body all along, and is used five times further down the same endpoint —
// idea_token follow, collision guard, old-block cleanup, localisation strip, recruit rename. It simply never
// reached the writer.
//
// NOT a loss, and asserted here so nobody "fixes" it: the script's `name` becomes the new token while the
// display name moves to localisation (`NUA_p2:0 "Probe Advisor"`). That is how HOI4 names characters.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-charren-"));
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
  const p = path.join(__dirname, `.ctl-charren-${process.pid}-${label}.js`);
  fs.writeFileSync(p, wasCrlf ? out.replace(/\n/g, "\r\n") : out, "utf8");
  ctlFiles.push(p);
  try { return { createApp: require(p).createApp }; } catch (e) { return { error: String(e && e.message) }; }
}

const VANILLA_CHARS = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/common/characters";
let seq = 0;
const BODY = [
  "characters = {",
  "\tNUA_probe = {",
  "\t\tname = \"Probe Advisor\"",
  "\t\t# a comment the author wrote and expects to keep",
  "\t\tadvisor = {",
  "\t\t\tslot = political_advisor",
  "\t\t\tidea_token = NUA_probe_token",
  "\t\t\tallowed = { original_tag = NUA }",
  "\t\t\tavailable = { has_completed_focus = nua_focus }",
  "\t\t\ttraits = { captain_of_industry }",
  "\t\t\tai_will_do = { factor = 5 }",
  "\t\t}",
  "\t}",
  "}", ""].join("\n");
function mkMod() {
  const dir = path.join(ROOT, "m" + (++seq));
  fs.mkdirSync(path.join(dir, "common", "characters"), { recursive: true });
  fs.writeFileSync(path.join(dir, "descriptor.mod"), 'name="m"\nsupported_version="1.19.*"\n', "utf8");
  fs.writeFileSync(path.join(dir, "common", "characters", "nua_c.txt"), BODY, "utf8");
  return dir;
}
const charFile = (dir, f) => path.join(dir, "common", "characters", f || "nua_c.txt");

let PORT = 46900;
function serve(app) {
  return new Promise((resolve) => {
    const s = app.listen(++PORT, () => resolve({
      get: (u) => fetch(`http://127.0.0.1:${PORT}${u}`).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      post: (u, body) => fetch(`http://127.0.0.1:${PORT}${u}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) })),
      stop: () => { try { s.closeAllConnections(); } catch (_) {} s.close(); },
    }));
  });
}
const flatten = (b) => (b.files || []).flatMap((f) => (f.characters || []).map((c) => Object.assign({ file: f.file }, c)));

async function renameIn(api, dir, opts) {
  const list = await api.get(`/api/characters/list?modPath=${encodeURIComponent(dir)}`);
  const c = flatten(list.b).find((x) => x.token === "NUA_probe");
  if (!c) return { error: "not listed", listed: flatten(list.b).map((x) => x.token) };
  const save = await api.post("/api/characters/save",
    Object.assign({}, c, { modPath: dir, file: "nua_c.txt", token: "NUA_probe_v2", previousToken: "NUA_probe" }, opts || {}));
  return { save: save.b, status: save.s, text: fs.readFileSync(charFile(dir), "utf8") };
}

(async () => {
  let api = null;
  try {
    console.log("\n[ground truth] how much of the game carries a field a rename would drop");
    if (fs.existsSync(VANILLA_CHARS)) {
      let total = 0, withAllowed = 0, withAiWillDo = 0, withLegacy = 0;
      for (const f of fs.readdirSync(VANILLA_CHARS)) {
        if (!f.toLowerCase().endsWith(".txt")) continue;
        const t = fs.readFileSync(path.join(VANILLA_CHARS, f), "utf8").replace(/#.*$/gm, "");
        total += (t.match(/^[ \t]*[A-Za-z_][\w.\-]*[ \t]*=[ \t]*\{/gm) || []).length;
        withAllowed += (t.match(/\ballowed\s*=\s*\{/g) || []).length;
        withAiWillDo += (t.match(/\bai_will_do\s*=\s*\{/g) || []).length;
        withLegacy += (t.match(/\blegacy_id\s*=/g) || []).length;
      }
      rec("vanilla characters gate advisors with `allowed`, in bulk", withAllowed >= 1000, withAllowed);
      rec("…and carry ai_will_do widely", withAiWillDo >= 500, withAiWillDo);
      console.log(`  --   measured: allowed ${withAllowed}, ai_will_do ${withAiWillDo}, legacy_id ${withLegacy}`);
    } else {
      console.log("  --   vanilla not installed; skipping the ground-truth block");
    }

    api = await serve(createApp());

    console.log("\n[a rename] keeps everything the form does not model");
    const dir = mkMod();
    const r = await renameIn(api, dir);
    rec("the character is listed", !r.error, r.error ? r.listed : "");
    rec("…the save reports success", r.save && r.save.ok === true, r.save);
    rec("…and the block is now under the new token", /NUA_probe_v2\s*=\s*\{/.test(r.text), r.text);
    rec("…with the old token gone, not left beside it", !/\bNUA_probe\s*=\s*\{/.test(r.text), r.text);
    rec("…the advisor's `allowed` survives, so it is not hireable by everyone",
      /allowed\s*=\s*\{\s*original_tag\s*=\s*NUA\s*\}/.test(r.text), r.text);
    rec("…its `available` gating survives",
      /available\s*=\s*\{\s*has_completed_focus\s*=\s*nua_focus\s*\}/.test(r.text), r.text);
    rec("…ai_will_do survives", /ai_will_do\s*=\s*\{\s*factor\s*=\s*5\s*\}/.test(r.text), r.text);
    rec("…the idea_token survives", /idea_token\s*=\s*NUA_probe_token/.test(r.text), r.text);
    rec("…and so does the author's comment", /a comment the author wrote/.test(r.text), r.text);
    rec("…the file is brace-balanced",
      (r.text.replace(/#.*$/gm, "").match(/\{/g) || []).length === (r.text.replace(/#.*$/gm, "").match(/\}/g) || []).length, "unbalanced");
    rec("…and exactly one character block exists, not two",
      (r.text.match(/^\t[A-Za-z_][\w]*\s*=\s*\{/gm) || []).length === 1, r.text.match(/^\t[A-Za-z_][\w]*\s*=\s*\{/gm));

    console.log("\n[the display name] moves to localisation — this is correct, not a loss");
    const locDir = path.join(dir, "localisation", "english");
    const locText = fs.existsSync(locDir)
      ? fs.readdirSync(locDir).map((f) => fs.readFileSync(path.join(locDir, f), "utf8")).join("\n") : "";
    rec("the script names the character by its token", /name\s*=\s*NUA_probe_v2/.test(r.text), r.text);
    rec("…and the readable name is in the loc file under that token",
      /NUA_probe_v2:0?\s*"Probe Advisor"/.test(locText), locText.slice(0, 300));
    rec("…with the old key cleaned up", !/\bNUA_probe:0?\s*"/.test(locText), locText.slice(0, 300));

    console.log("\n[an ordinary save] is unaffected — no rename, nothing moves");
    const dir2 = mkMod();
    const list2 = await api.get(`/api/characters/list?modPath=${encodeURIComponent(dir2)}`);
    const c2 = flatten(list2.b).find((x) => x.token === "NUA_probe");
    await api.post("/api/characters/save", Object.assign({}, c2, { modPath: dir2, file: "nua_c.txt", token: "NUA_probe" }));
    const t2 = fs.readFileSync(charFile(dir2), "utf8");
    rec("the token is unchanged", /NUA_probe\s*=\s*\{/.test(t2), t2);
    rec("…and everything is still there", /allowed\s*=/.test(t2) && /available\s*=/.test(t2) && /ai_will_do/.test(t2), t2);
    api.stop(); api = null;

    console.log("\n[back-out] resolve the block by the NEW token again");
    {
      const built = controlApp("newtoken", [[
        "          const span = findTopLevelCharacterSpan(existing, openIdx + 1, closeIdx, character.token)\n            || (prevTok && prevTok !== character.token\n                  ? findTopLevelCharacterSpan(existing, openIdx + 1, closeIdx, prevTok)\n                  : null);",
        "          const span = findTopLevelCharacterSpan(existing, openIdx + 1, closeIdx, character.token);"]]);
      if (built.error) rec("the control patched cleanly", false, built.error);
      else {
        const capi = await serve(built.createApp());
        try {
          const cdir = mkMod();
          const c = await renameIn(capi, cdir);
          rec("…the control still reports a successful save", c.save && c.save.ok === true, c.save);
          rec("…and strips the advisor's `allowed`, making it hireable by every country",
            !/allowed\s*=/.test(c.text), "allowed survived — the control did not reproduce the bug");
          rec("…and its `available` gating", !/available\s*=/.test(c.text), "available survived");
          rec("…and ai_will_do", !/ai_will_do/.test(c.text), "ai_will_do survived");
        } finally { capi.stop(); }
      }
    }

    console.log(`\n=== character rename preserves: ${checks} checks, ${fails.length} failed ===`);
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
