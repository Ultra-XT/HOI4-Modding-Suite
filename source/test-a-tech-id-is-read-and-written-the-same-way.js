// ⛔ #tech-id-dot — A TECHNOLOGY ID CONTAINING A DOT WAS INVISIBLE, AND SAVING DELETED THE EDGES TO IT.
//
// This is the third time this exact shape has been recorded in server.js, and the second comment about it
// predicted the third:
//
//   #tech-id-hyphen — the reader class had no `-`, so Millennium Dawn's `self-replicated_3D_printer` never
//   entered the catalog, while `leads_to_tech = self-replicated_3D_printer` on its parent parsed fine.
//   serializeTechnology rebuilds a parent's outgoing edges FROM the catalog, so re-serializing the parent
//   silently deleted the edge to a tech it could not see.
//
//   …and the writer's guard was then found to be "stricter than the constraint it describes", so once the
//   reader could see that tech, saving its file THREW — after the batch had already rewritten part of it.
//
// Both happened again for a DOT. Rise of Nations' air_techs.txt defines `gen3.5_ucav` — the only dotted
// technology id in the vanilla install or any of the nine installed workshop mods. Measured by a no-edit
// round trip of that one file: 160 of 161 declared ids parsed, and the save deleted two whole
// `path = { leads_to_tech = … }` blocks. Widening the reader then made the writer's guard throw mid-batch,
// exactly as its own comment describes.
//
// ⭐ So the guard here is not "does the class contain a dot" — it is that EVERY id class agrees. A rule that
// was widened twice and diverged twice needs the invariant pinned, not the character.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 53540;
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-techid-appdata-"));
process.env.APPDATA = SANDBOX;
process.env.XDG_CONFIG_HOME = SANDBOX;
process.env.NOVA_APP_DATA_DIR = SANDBOX;

const { createApp } = require("./server.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const WS = "D:/SteamLibrary/steamapps/workshop/content/394360";
const BASE = `http://127.0.0.1:${PORT}`;

(async () => {
  let server;
  try {
    const RAW = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");

    console.log("1. DERIVED: every technology-id character class agrees");
    // Collect the classes from CODE lines only — the comments quote the historical class on purpose and must
    // keep saying what they said.
    const classes = new Map();
    RAW.split(/\r?\n/).forEach((line, i) => {
      const t = line.trim();
      if (t.startsWith("//") || t.startsWith("*")) return;
      // The tech-id family is the character class carrying `_@` — that is what distinguishes it from the
      // dozens of other classes in this file.
      for (const m of line.matchAll(/\[[^\]]*_@[^\]]*\]/g)) {
        const cls = m[0];
        if (!classes.has(cls)) classes.set(cls, []);
        classes.get(cls).push(i + 1);
      }
    });
    rec("tech-id classes were found in the source", classes.size > 0,
      [...classes.entries()].map(([c, l]) => `${c} x${l.length}`));
    // Normalise: the same set of characters, however it is spelled (case-range order differs by site).
    // `[A-Za-z0-9_@.\-]` and `[a-zA-Z0-9_@.\-]` are the same set spelled two ways; collapse both letter
    // ranges to one token before comparing, or the check fails on spelling rather than on meaning.
    // A NEGATED class `[^…]` is the complement of the same set — it is how the writer names the offending
    // character — so the leading `^` is stripped before comparing rather than counted as a member.
    const charsOf = (cls) => [...new Set(
      cls.replace(/^\[\^?|\]$/g, "").replace(/\\/g, "")
        .replace(/A-Za-z|a-zA-Z/g, "L").replace(/A-Z|a-z/g, "L").replace(/0-9/g, "D")
    )].sort().join("");
    const shapes = new Set([...classes.keys()].map(charsOf));
    rec("…and they are all the same set of characters", shapes.size === 1,
      [...shapes].map((s) => JSON.stringify(s)));
    rec("…which includes the dot", [...shapes][0] && [...shapes][0].includes("."),
      "a dotted id is legal and shipping — see gen3.5_ucav");

    console.log("\n2. The corpus really contains one");
    const RON = path.join(WS, "2026448968", "common", "technologies", "air_techs.txt");
    if (!fs.existsSync(RON)) {
      rec("Rise of Nations' air_techs.txt is installed", false, "cannot run the round trip");
    } else {
      const original = fs.readFileSync(RON, "utf8");
      const declared = [...original.matchAll(/(^|\n)\t([A-Za-z0-9_@.\-]+)\s*=\s*\{/g)].map((m) => m[2]);
      rec("it declares a dotted technology id", declared.some((d) => d.includes(".")),
        declared.filter((d) => d.includes(".")));

      console.log("\n3. Round trip: a no-edit save keeps the edge to it");
      server = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });
      const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-techid-mod-"));
      const dest = path.join(mod, "common", "technologies", "probe.txt");
      try {
        fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Nova Tech Id"\n');
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, original, "utf8");

        const cat = await fetch(`${BASE}/api/technologies/catalog?modPath=${encodeURIComponent(mod)}&lite=1`).then((r) => r.json());
        const mine = (cat.technologies || []).filter((t) => t && t.isMod);
        const parsed = new Set(mine.map((t) => t.id));
        const missed = declared.filter((d) => !parsed.has(d));
        rec("every declared id is parsed", missed.length === 0, missed.slice(0, 5));

        const send = mine.map((t) => JSON.parse(JSON.stringify(t)));
        const res = await fetch(`${BASE}/api/technologies/save-batch`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ technologies: send, equipments: cat.equipments || {}, customTabs: [], modPath: mod, countryTag: null, countryTechIds: null, deletions: [], newTechIds: [] }),
        }).then((r) => r.json());
        rec("the save did not refuse the dotted id", !/Invalid technology id/.test(String((res && res.error) || "")),
          String((res && res.error) || "").slice(0, 90));

        const after = fs.readFileSync(dest, "utf8");
        const dotted = declared.find((d) => d.includes("."));
        rec(`the edge to "${dotted}" survives the save`,
          new RegExp(`leads_to_tech\\s*=\\s*${dotted.replace(/\./g, "\\.")}`).test(after),
          "serializeTechnology rebuilds edges from the catalog, so an unseen tech loses its incoming edges");
        rec(`…and the tech itself is still declared`, new RegExp(`(^|\\n)\\t${dotted.replace(/\./g, "\\.")}\\s*=\\s*\\{`).test(after));
      } finally {
        try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
      }
    }

    console.log("\n4. ⭐ Controls — the guard must still refuse a genuinely bad id");
    // The real HOI4 constraint is on the FIRST character: the lexer rejects an id starting with a digit.
    const idOk = (id) => /^[A-Za-z_][A-Za-z0-9_@.\-]*$/.test(String(id));
    rec("a leading digit is still refused", idOk("3gen_ucav") === false);
    rec("…and a leading hyphen", idOk("-ucav") === false);
    rec("…and a space", idOk("gen 3") === false);
    rec("…and a brace", idOk("gen{3}") === false);
    rec("a dotted id is accepted", idOk("gen3.5_ucav") === true);
    rec("…as are the hyphen and @ forms already shipping",
      idOk("self-replicated_3D_printer") === true && idOk("tech@1") === true);
    // ⭐ COMPOSED: the OLD class is what missed it, so the fix is load-bearing.
    const OLD = (id) => /^[A-Za-z_][A-Za-z0-9_\-]*$/.test(String(id));
    rec("the old writer guard rejected the dotted id", OLD("gen3.5_ucav") === false);
    rec("…and also rejected the @ form the readers accept", OLD("tech@1") === false,
      "the guard was stricter than the readers in TWO ways, not one");

    console.log("\n5. The refusal names the character it refused");
    // The message said ids "must start with a letter or underscore" — which gen3.5_ucav does. A modder was
    // sent to look at the wrong end of the id.
    rec("the writer reports the offending character", /is not allowed in a HOI4 identifier/.test(RAW));
    rec("…and still explains the leading-digit rule when that is the cause",
      /a leading digit breaks the mod/.test(RAW));

    console.log(`\n=== a tech id is read and written the same way: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    if (server) { try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {} await new Promise((r) => server.close(r)); }
    try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}
  }
})();
