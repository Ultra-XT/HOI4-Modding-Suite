// Two ways a save overwrote what the author actually wrote, both because one call site never adopted a rule
// its siblings already followed.
//
// #commented-timeout-days-resurrected — a modder comments a flag out while balancing. Nova already knows
// this: #commented-flag-read-as-live masks comments before reading `hidden`, `is_triggered_only` and
// `fire_only_once`, because all three ship commented-out in real content. `timeout_days` — the fourth flag of
// the same family, and the one with teeth, since it makes the event auto-resolve to its first option — read
// the RAW block. So `# timeout_days = 30   # disabled while balancing` came back as timeoutDays:30 and the
// next save wrote it out as live script.
//
// #decision-bare-icon-token-clobbered — HOI4 resolves a decision `icon` by trying `GFX_decision_<value>` and
// then `<value>` verbatim, the same two-step rule already recorded for an idea's `picture`. The writer
// accepted only a `GFX_`-prefixed value and replaced anything else with the generic default. Measured: 1,786
// vanilla decisions and 697 Millennium Dawn decisions use the bare form, and the sprite it resolves to
// exists while the bare name does not — so this silently repainted the icon of every one of them on any save.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-ctbi-"));
process.env.HOI4_MODS_ROOT = ROOT;
const { createApp } = require("./server.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 600));
  }
}

const MOD = path.join(ROOT, "ctbi");
fs.mkdirSync(path.join(MOD, "events"), { recursive: true });
fs.mkdirSync(path.join(MOD, "common", "decisions", "categories"), { recursive: true });
fs.mkdirSync(path.join(MOD, "localisation", "english"), { recursive: true });
fs.writeFileSync(path.join(MOD, "descriptor.mod"), 'name="Ctbi"\nsupported_version="1.19.*"\n', "utf8");

const NS = "ctbins";
const EVF = path.join(MOD, "events", `${NS}.txt`);
fs.writeFileSync(EVF, [
  `add_namespace = ${NS}`,
  "",
  "country_event = {",
  `\tid = ${NS}.1`,
  `\ttitle = ${NS}.1.t`,
  `\tdesc = ${NS}.1.d`,
  "\tpicture = GFX_report_event_001",
  "\tis_triggered_only = yes",
  "\t# timeout_days = 30   # disabled while balancing",
  `\toption = { name = ${NS}.1.a add_political_power = 10 }`,
  `\toption = { name = ${NS}.1.b add_political_power = -10 }`,
  "}",
  "",
].join("\n"), "utf8");
fs.writeFileSync(path.join(MOD, "localisation", "english", "c_l_english.yml"),
  `\uFEFFl_english:\n ${NS}.1.t:0 "T"\n ${NS}.1.d:0 "D"\n ${NS}.1.a:0 "A"\n ${NS}.1.b:0 "B"\n`, "utf8");

const DECF = path.join(MOD, "common", "decisions", "nova_dec.txt");
fs.writeFileSync(DECF, [
  "ctbi_cat = {",
  "\tctbi_bare = {",
  "\t\ticon = generic_prepare_civil_war",
  "\t\tcost = 25",
  "\t\tavailable = { has_war = no }",
  "\t\tcomplete_effect = { add_political_power = 10 }",
  "\t}",
  "}",
  "",
].join("\n"), "utf8");
fs.writeFileSync(path.join(MOD, "common", "decisions", "categories", "nova_cat.txt"),
  "ctbi_cat = {\n\ticon = generic_political_actions\n}\n", "utf8");

const PORT = 43389;
const srv = createApp().listen(PORT, async () => {
  const get = (u) => fetch(`http://127.0.0.1:${PORT}${u}`).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  const post = (u, b) => fetch(`http://127.0.0.1:${PORT}${u}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));

  try {
    console.log("\n[ground truth] the bare-token icon is the DOMINANT idiom, not a mistake");
    const V = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
    const MD = "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649";
    let bare = 0, gfx = 0;
    for (const root of [V, MD]) {
      let files = [];
      try { files = fs.readdirSync(path.join(root, "common", "decisions")).filter((f) => /\.txt$/i.test(f)); } catch (_) { continue; }
      for (const f of files) {
        const t = fs.readFileSync(path.join(root, "common", "decisions", f), "utf8").replace(/#[^\n]*/g, "");
        for (const m of t.matchAll(/(^|\n)\s*icon\s*=\s*([^\s{}\n]+)/g)) (/^GFX_/.test(m[2]) ? gfx++ : bare++);
      }
    }
    rec("real decisions use both forms", bare > 0 && gfx > 0, { bare, gfx });
    rec("…and the bare form runs to thousands", bare > 2000, { bare, gfx });
    // …and the sprite it resolves to really exists, while the bare name does not.
    let gfxAll = "";
    try {
      for (const f of fs.readdirSync(path.join(V, "interface"))) {
        if (/\.gfx$/i.test(f)) gfxAll += fs.readFileSync(path.join(V, "interface", f), "utf8");
      }
    } catch (_) {}
    rec("`icon = generic_prepare_civil_war` resolves via the GFX_decision_ prefix",
      gfxAll.includes("GFX_decision_generic_prepare_civil_war"), "sprite not found");
    rec("…and NOT as a bare sprite name, which is why the prefix rule is the real one",
      !gfxAll.includes('name = "generic_prepare_civil_war"'), "bare sprite name exists after all");

    console.log("\n[the bug] a decision save must keep the author's bare icon");
    const dl = await get(`/api/decisions/list?modPath=${encodeURIComponent(MOD)}`);
    rec("the decision read back", dl.s === 200, dl.b);
    const cat = (dl.b.categories || []).find((c) => c.id === "ctbi_cat");
    const dec = cat && (cat.decisions || []).find((d) => d.id === "ctbi_bare");
    rec("…with its bare icon intact", dec && dec.icon === "generic_prepare_civil_war", dec);
    const ds = await post("/api/decisions/save", {
      modPath: MOD, isMod: true, fileName: "nova_dec.txt",
      categoryId: "ctbi_cat", previousCategoryId: "ctbi_cat",
      id: "ctbi_bare", previousId: "ctbi_bare",
      name: "Bare Icon Decision", cost: 30, icon: dec && dec.icon,
      available: "has_war = no", completeEffect: "add_political_power = 10",
    });
    rec("the save succeeded", ds.s === 200 && !ds.b.error, ds.b || ds.s);
    const decAfter = fs.readFileSync(DECF, "utf8");
    rec("the bare icon survived", /icon = generic_prepare_civil_war/.test(decAfter), decAfter);
    rec("…and was NOT replaced by the generic default",
      !/icon = GFX_decision_generic_decision/.test(decAfter), decAfter);
    rec("…while the unrelated edit did land", /cost = 30/.test(decAfter), decAfter);

    console.log("\n[control] genuinely unsafe icon values still fall back");
    // The guard this widened exists to keep braces and whitespace out of the emitted script.
    for (const [bad, why] of [["has bad chars", "two words"], ["braces", "a{b"], ["empty", ""]]) {
      const r = await post("/api/decisions/save", {
        modPath: MOD, isMod: true, fileName: "nova_dec.txt",
        categoryId: "ctbi_cat", previousCategoryId: "ctbi_cat",
        id: `ctbi_${bad.replace(/\s/g, "_")}`, name: "X", cost: 1, icon: why,
        available: "has_war = no", completeEffect: "add_political_power = 1",
      });
      rec(`an icon that ${bad} is refused into the default`, r.s === 200, r.b);
    }
    const decAfter2 = fs.readFileSync(DECF, "utf8");
    // Every emitted icon value must be a single safe token — that is what the guard is FOR, and widening it
    // to accept the bare form must not widen it to accept whitespace or braces.
    const emitted = [...decAfter2.matchAll(/(^|\n)[ \t]*icon\s*=\s*([^\n]*)/g)].map((m) => m[2].trim());
    rec("every icon written is a single safe token",
      emitted.length > 0 && emitted.every((v) => /^[A-Za-z0-9_]+$/.test(v)), emitted);
    // ⚠️ TWO DIFFERENT THINGS WERE COUNTED AS ONE. The rule here — an unsafe value falls back rather than
    // being written through — is right, and `two words` and `a{b` are what it is about. An EMPTY icon is not
    // an unsafe value, it is no value: the decision has no icon, and writing the generic default for it
    // invented one (3,840 decisions across the corpora have no icon, 509 in vanilla).
    // #no-invented-decision-defaults. So the count drops to the two cases the rule actually covers, and the
    // empty one gets the assertion that now applies to it.
    rec("…and the unsafe ones fell back to the default rather than being written through",
      emitted.filter((v) => v === "GFX_decision_generic_decision").length >= 2, emitted);
    {
      const emptyBlock = /(^|\n)[ \t]*ctbi_empty\s*=\s*\{[\s\S]*?\n[ \t]*\}/.exec(decAfter2);
      rec("⭐ …while the one with NO icon was given none", !!emptyBlock && !/(^|\n)[ \t]*icon\s*=/.test(emptyBlock[0]),
        emptyBlock ? emptyBlock[0].slice(0, 200) : "ctbi_empty block not found");
    }
    rec("…and the file is still brace-balanced",
      (decAfter2.match(/\{/g) || []).length === (decAfter2.match(/\}/g) || []).length, decAfter2);

    console.log("\n[the bug] a commented-out timeout_days is not script");
    const el = await get(`/api/events/list?modPath=${encodeURIComponent(MOD)}`);
    const ev = (el.b.events || [])[0];
    rec("the event read back", !!ev, el.b);
    rec("…and its timeout_days is 0, not 30", ev && ev.timeoutDays === 0, ev && ev.timeoutDays);
    const es = await post("/api/events/save", {
      modPath: MOD, namespace: NS, id: "1", type: ev.type,
      title: ev.title, description: ev.description, picture: ev.picture,
      triggeredOnly: ev.triggeredOnly, timeoutDays: ev.timeoutDays,
      options: (ev.options || []).map((o) => ({
        name: o.name, title: o.title || "", script: o.script || "",
        aiChance: o.aiChance != null ? o.aiChance : null, trigger: o.trigger || "",
      })),
    });
    rec("the save succeeded", es.s === 200 && !es.b.error, es.b || es.s);
    const evAfter = fs.readFileSync(EVF, "utf8");
    rec("no LIVE timeout_days was written", !/(^|\n)[ \t]*timeout_days\s*=/.test(evAfter), evAfter);
    rec("…and the author's commented line is still there", /#\s*timeout_days\s*=\s*30/.test(evAfter), evAfter);

    console.log("\n[control] a REAL timeout_days still round-trips");
    fs.writeFileSync(EVF, fs.readFileSync(EVF, "utf8")
      .replace(/\t# timeout_days = 30   # disabled while balancing/, "\ttimeout_days = 45"), "utf8");
    const el2 = await get(`/api/events/list?modPath=${encodeURIComponent(MOD)}`);
    const ev2 = (el2.b.events || [])[0];
    rec("a live timeout_days reads back", ev2 && ev2.timeoutDays === 45, ev2 && ev2.timeoutDays);
    const es2 = await post("/api/events/save", {
      modPath: MOD, namespace: NS, id: "1", type: ev2.type,
      title: ev2.title, description: ev2.description, picture: ev2.picture,
      triggeredOnly: ev2.triggeredOnly, timeoutDays: ev2.timeoutDays,
      options: (ev2.options || []).map((o) => ({
        name: o.name, title: o.title || "", script: o.script || "",
        aiChance: o.aiChance != null ? o.aiChance : null, trigger: o.trigger || "",
      })),
    });
    rec("the save succeeded", es2.s === 200 && !es2.b.error, es2.b || es2.s);
    rec("…and it is still in the file", /(^|\n)[ \t]*timeout_days\s*=\s*45/.test(fs.readFileSync(EVF, "utf8")),
      fs.readFileSync(EVF, "utf8"));

    console.log(`\n=== commented timeout + bare icon: ${checks} checks, ${fails.length} failed ===`);
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
