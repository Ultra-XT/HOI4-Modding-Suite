// ⛔ #mio-initial-trait-invented / #mio-nested-icon-borrowed / #mio-detached-comment-dropped —
// A SAVE THAT CHANGED NOTHING REWROTE 97% OF EVERY MILITARY INDUSTRIAL ORGANIZATION IN THE CORPUS.
//
// serializeMio rebuilds an organization from a model, and four of the things it wrote were the model's own
// conventions rather than answers about the file. Counted over the 2,418 organization blocks in the install
// and every installed mod:
//
//     no `initial_trait` at all              1,484   (450 vanilla)  -> GAINED an empty one
//     its `name` is the author's own key        868   ( 67 vanilla)  -> that key REPLACED by <id>_initial
//     an `initial_trait` with no name            58   ( 20 vanilla)  -> GAINED the convention name
//     a `trait` with no name                    172   ( 65 vanilla)  -> GAINED `name = <token>`
//     a `trait` whose name is not its token     111   ( 12 vanilla)  -> that key REPLACED by the token
//     no top-level `icon`                       142   ( 48 vanilla)  -> GAINED one
//     no `allowed` block                          5   (  1 vanilla)  -> GAINED `always = yes`
//
// Only 4 organizations of 2,418 actually use the `<id>_initial` name Nova wrote. Every replaced or invented
// name is a localisation key that resolves to nothing, so the company's starting trait renders as a raw key —
// and vanilla's own generic organizations name theirs `generic_mio_initial_trait_medium_tank_designer`.
//
// ⭐ The cause is one shape, four times: a field the CLIENT MODEL CANNOT CARRY, defaulted to a convention in
// the route instead of read back off disk. readMioAllowedBlock three lines up already does exactly that for
// the `allowed` gate, with the comment "the browser never has the block, and a guard the client cannot carry
// is not a guard". Its twin for the starting trait never existed.
//
// ⛔ #mio-nested-icon-borrowed is the fifth and a different fault: /api/mio/detail read the organization's
// `icon` with a regex over the WHOLE block, so an organization with none picked up the first TRAIT's icon and
// wrote it back as its own. 13 organizations, 5 of them vanilla. Same shape as #event-nested-picture-wins.
//
// ⛔ SCRATCH MODS IN TEMP ONLY.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 53558;
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-mioform-"));
process.env.APPDATA = SANDBOX;
process.env.XDG_CONFIG_HOME = SANDBOX;
process.env.NOVA_APP_DATA_DIR = SANDBOX;

const { createApp } = require("./server.js");
const BASE = `http://127.0.0.1:${PORT}`;
const SUB = path.join("common", "military_industrial_organization", "organizations");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};
const show = (t) => String(t).slice(0, 320).replace(/\n/g, "|");

const made = [];
(async () => {
  let server;
  try {
    server = await new Promise((r) => { const s = createApp().listen(PORT, () => r(s)); });

    // Sends exactly what public/mio-editor.js sends: /api/mio/detail -> its collect() -> POST /api/mio.
    // `opts` stands in for the modder acting: renaming a trait's token, or deleting a trait.
    const roundTrip = async (text, fileName, opts) => {
      const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-mioform-mod-"));
      made.push(mod);
      const f = fileName || "probe.txt";
      const dest = path.join(mod, SUB, f);
      fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="MIO Form"\nsupported_version="1.16.*"\n');
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, text, "utf8");
      const list = await fetch(`${BASE}/api/mio?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
      const ids = (list.items || list.mios || list.organizations || []).map((x) => (typeof x === "string" ? x : x.id)).filter(Boolean);
      const errors = [];
      const details = [];
      for (const id of ids) {
        const d = await fetch(`${BASE}/api/mio/detail?id=${encodeURIComponent(id)}&modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
        if (!d || d.ok === false) { errors.push(`detail ${id}: ${(d && d.error) || "?"}`); continue; }
        details.push(d);
        const res = await fetch(`${BASE}/api/mio`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modPath: mod, id, name: (d.name || id).trim(), desc: (d.desc || "").trim(),
            allowedTag: (d.allowedTag || "").trim(), icon: (d.icon || "").trim(), fileName: (d.file || f).trim(),
            equipmentType: (d.equipmentType || []).slice(),
            researchCategories: (d.researchCategories || []).slice(),
            include: (d.include || []).slice(),
            initial: {
              equipmentBonus: (d.initial && d.initial.equipmentBonus) || {},
              productionBonus: (d.initial && d.initial.productionBonus) || {},
            },
            traits: (d.traits || [])
              .filter((tr, i) => !(opts && opts.dropFirstTrait && i === 0))
              .map((tr) => ({
                token: (opts && opts.renameTrait && tr.token === opts.renameTrait[0]) ? opts.renameTrait[1] : (tr.token || "").trim(),
                name: (tr.name || "").trim(),
                x: Number(tr.x) || 0, y: Number(tr.y) || 0,
                relativeTo: (tr.relativeTo || "").trim(), icon: (tr.icon || "").trim(),
                parents: (tr.parents || []).slice(),
                equipmentBonus: tr.equipmentBonus || {}, productionBonus: tr.productionBonus || {},
              })).filter((tr) => tr.token),
            writeIdeaFallback: false, companyType: d.companyType, previousId: id,
          }),
        }).then((r) => r.json());
        if (!res || res.ok !== true) errors.push(`save ${id}: ${String((res && res.error) || "?").slice(0, 70)}`);
      }
      return { after: fs.readFileSync(dest, "utf8"), errors, ids, details, mod };
    };

    // Vanilla's own shape: an organization that inherits everything through `include` and declares no
    // starting trait, no equipment types and no icon.
    const INCLUDED = `SLO_zbrojnica_roth_organization = {
\tinclude = generic_infantry_equipment_organization
\ticon = GFX_idea_generic_infantry_equipment_manufacturer_3
\tallowed = {
\t\ttag = SLO
\t}
}
`;

    console.log("1. An organization with no starting trait does not gain one");
    {
      const { after, errors } = await roundTrip(INCLUDED);
      rec("the save was accepted", errors.length === 0, errors[0]);
      rec("⭐ no `initial_trait` is invented", !/initial_trait/.test(after), show(after));
      rec("…and the include it inherits from survives", /include = generic_infantry_equipment_organization/.test(after), show(after));
      rec("…and its own icon survives", /icon = GFX_idea_generic_infantry_equipment_manufacturer_3/.test(after), show(after));
      rec("…and its allowed gate survives", /tag = SLO/.test(after), show(after));
      // ⚠️ Byte-identity is NOT asserted: the writer emits the keys in its own order (icon, allowed, include
      // where the author wrote include first). That is a reorder inside a block, which HOI4 does not read,
      // and asserting it would fail this check for a reason it is not about. What must hold is that nothing
      // is lost and nothing invented.
      const lines = (t) => t.replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean).sort();
      rec("⭐ …and every line of it is still there, and no other",
        JSON.stringify(lines(after)) === JSON.stringify(lines(INCLUDED)),
        JSON.stringify(after.slice(0, 220)));
    }

    console.log("\n2. …and one that HAS a starting trait keeps the author's name for it");
    {
      const AUTHORED = `probe_medium_tank_organization = {
\ticon = GFX_idea_generic_tank_manufacturer_2
\tequipment_type = { infantry_equipment }
\tallowed = { original_tag = GER }
\tinitial_trait = {
\t\tname = generic_mio_initial_trait_medium_tank_designer
\t\tproduction_bonus = {
\t\t\tproduction_capacity_factor = 0.05
\t\t}
\t\torganization_modifier = {
\t\t\tmilitary_industrial_organization_research_bonus = 0.05
\t\t}
\t}
}
`;
      const { after, errors } = await roundTrip(AUTHORED);
      rec("the save was accepted", errors.length === 0, errors[0]);
      rec("⭐ the author's trait name survives",
        /name = generic_mio_initial_trait_medium_tank_designer/.test(after), show(after));
      rec("⭐ …and was not replaced by the convention",
        !/probe_medium_tank_organization_initial/.test(after), show(after));
      rec("…and the bonuses inside it survive",
        /production_capacity_factor = 0\.05/.test(after) && /military_industrial_organization_research_bonus = 0\.05/.test(after), show(after));
    }

    console.log("\n3. …and a starting trait with NO name is not given one  (the empty answer is an answer)");
    {
      const NONAME = `probe_noname_organization = {
\ticon = GFX_idea_generic_tank_manufacturer_2
\tequipment_type = { infantry_equipment }
\tallowed = { original_tag = GER }
\tinitial_trait = {
\t\tequipment_bonus = {
\t\t\thard_attack = 0.1
\t\t}
\t}
}
`;
      const { after, errors } = await roundTrip(NONAME);
      rec("the save was accepted", errors.length === 0, errors[0]);
      rec("⭐ the initial_trait is kept", /initial_trait/.test(after), show(after));
      rec("⭐ …and gains no name", !/probe_noname_organization_initial/.test(after), show(after));
      rec("…and its bonus survives", /hard_attack = 0\.1/.test(after), show(after));
    }

    console.log("\n4. …and the same for a TRAIT's name, one level down");
    {
      const TRAITS = `probe_trait_organization = {
\ticon = GFX_idea_generic_tank_manufacturer_2
\tequipment_type = { infantry_equipment }
\tallowed = { original_tag = GER }
\ttrait = {
\t\ttoken = probe_named
\t\tname = probe_authors_own_key
\t\tposition = { x=0 y=0 }
\t\tequipment_bonus = {
\t\t\tsoft_attack = 0.1
\t\t}
\t}
\ttrait = {
\t\ttoken = probe_unnamed
\t\tposition = { x=1 y=0 }
\t\tequipment_bonus = {
\t\t\tbreakthrough = 0.1
\t\t}
\t}
}
`;
      const { after, errors } = await roundTrip(TRAITS);
      rec("the save was accepted", errors.length === 0, errors[0]);
      rec("⭐ a trait's own name key survives", /name = probe_authors_own_key/.test(after), show(after));
      rec("⭐ …and was not replaced by its token", !/name = probe_named/.test(after), show(after));
      rec("⭐ a trait with no name gains none", !/name = probe_unnamed/.test(after), show(after));
      rec("…and both traits are still there",
        /token = probe_named/.test(after) && /token = probe_unnamed/.test(after), show(after));
    }

    console.log("\n5. …and an organization's icon is read from the organization, not from a trait");
    {
      // ⛔ #mio-nested-icon-borrowed. The reader scanned the whole block, so this organization — which has no
      // icon of its own — reported its first TRAIT's icon and wrote it back as the company's. 13 across the
      // corpora, 5 vanilla. Same shape as #event-nested-picture-wins.
      const BORROW = `probe_iconless_organization = {
\tequipment_type = { infantry_equipment }
\tallowed = { original_tag = GER }
\ttrait = {
\t\ttoken = probe_t1
\t\tname = probe_t1
\t\ticon = GFX_industrial_org_trait_placeholder
\t\tposition = { x=0 y=0 }
\t\tequipment_bonus = {
\t\t\tsoft_attack = 0.1
\t\t}
\t}
}
`;
      const { after, errors, details } = await roundTrip(BORROW);
      rec("the save was accepted", errors.length === 0, errors[0]);
      rec("⭐ READ: the organization reports NO icon of its own",
        details.length === 1 && (details[0].icon || "") === "", JSON.stringify(details.map((d) => d.icon)));
      rec("⭐ SAVE: it does not gain the trait's icon",
        !/^\ticon\s*=/m.test(after), show(after));
      rec("…and the trait keeps its own icon",
        /icon = GFX_industrial_org_trait_placeholder/.test(after), show(after));
      rec("…and exactly one icon line remains",
        (after.match(/^\s*icon\s*=/gm) || []).length === 1, show(after));
    }

    console.log("\n6. …and a note behind a blank line, or written last, survives");
    {
      // ⛔ #mio-detached-comment-dropped. mergePreservedMioBlock carried only the note TOUCHING a key.
      // 91 detached notes across the corpora (27 vanilla) and 51 written last (18 vanilla) were dropped —
      // vanilla's GER_alkett_organization parks a whole commented-out `#override_trait = { … }` that way.
      const NOTES = `probe_notes_organization = {
\ticon = GFX_idea_generic_tank_manufacturer_2
\tequipment_type = { infantry_equipment }
\t#research_categories = { infantry_equipment }

\tallowed = { original_tag = GER }
\t#override_trait = {
\t#\ttoken = generic_mio_trait_held_back
\t#}
}
`;
      const { after, errors } = await roundTrip(NOTES);
      rec("the save was accepted", errors.length === 0, errors[0]);
      rec("⭐ the DETACHED note survives", /#research_categories = \{ infantry_equipment \}/.test(after), show(after));
      // ⚠️ The gap, not just the text. A detached note that comes back ATTACHED is a different note — it
      // would read as a caption for whatever the writer happens to put below it. The key it now precedes is
      // the writer's choice (it emits in its own order), so this asserts the BLANK LINE, not the neighbour.
      rec("⭐ …and is still separated from what follows by a blank line",
        /#research_categories = \{ infantry_equipment \}[ \t]*\n[ \t]*\n/.test(after), JSON.stringify(after));
      rec("⭐ the block written LAST survives",
        /#override_trait = \{/.test(after) && /#\s*token = generic_mio_trait_held_back/.test(after), show(after));
      rec("…and nothing is duplicated",
        (after.match(/#research_categories/g) || []).length === 1
        && (after.match(/#override_trait/g) || []).length === 1, show(after));
      const { after: twice } = await roundTrip(after);
      rec("…and a second save is stable",
        (twice.match(/#research_categories/g) || []).length === 1
        && (twice.match(/#override_trait/g) || []).length === 1, show(twice));
    }

    console.log("\n7. …and a label on an opening line stays on that line, at all three depths");
    {
      // The same shape the events and decisions writers were fixed for, three more times here: the
      // organization's own line (141 across the corpora, 16 vanilla — vanilla's AST_organization.txt marks
      // `#BASEGAME` vs `#TAOG VERSION` that way), the initial_trait's line (The Road to 56 marks its changed
      // blocks `#r56`), and a trait's line.
      const HEADS = `probe_heads_organization = { #BASEGAME
\ticon = GFX_idea_generic_tank_manufacturer_2
\tequipment_type = { infantry_equipment }
\tallowed = { original_tag = GER }
\tinitial_trait = { #r56
\t\tname = probe_heads_initial
\t\tequipment_bonus = {
\t\t\tsoft_attack = 0.1
\t\t}
\t}
\ttrait = { #the cheap one
\t\ttoken = probe_h1
\t\tname = probe_h1
\t\tposition = { x=0 y=0 }
\t\tequipment_bonus = {
\t\t\tbreakthrough = 0.1
\t\t}
\t}
}
`;
      const { after, errors } = await roundTrip(HEADS);
      rec("the save was accepted", errors.length === 0, errors[0]);
      rec("⭐ the organization's label is on its own line",
        /probe_heads_organization[ \t]*=[ \t]*\{[ \t]*#BASEGAME/.test(after), show(after));
      rec("⭐ the initial_trait's label is on its own line",
        /initial_trait[ \t]*=[ \t]*\{[ \t]*#r56/.test(after), show(after));
      rec("⭐ the trait's label is on its own line",
        /trait[ \t]*=[ \t]*\{[ \t]*#the cheap one/.test(after), show(after));
      rec("…and none is duplicated",
        (after.match(/#BASEGAME/g) || []).length === 1 && (after.match(/#r56/g) || []).length === 1
        && (after.match(/#the cheap one/g) || []).length === 1, show(after));
      const { after: twice } = await roundTrip(after);
      rec("…and a second save is stable",
        (twice.match(/#BASEGAME/g) || []).length === 1 && (twice.match(/#r56/g) || []).length === 1
        && (twice.match(/#the cheap one/g) || []).length === 1, show(twice));
    }

    console.log("\n8. …and a sprite name with a hyphen in it is not thrown away");
    {
      // ⚠️ The guard here exists to keep braces and whitespace out of the emitted script, and `[A-Za-z0-9_]`
      // was narrower than that needs. Millennium Dawn's own MD_ideas.gfx defines GFX_idea_kongsberg-logo,
      // GFX_idea_floro-international-corporation and four more. Measured over every `icon =` value in the MIO
      // corpora, the ONLY characters outside [A-Za-z0-9_] are `-` (12) and `.` (2). The idea reader learned
      // this same lesson already — `[A-Za-z0-9_.]` truncated `pro-american` to `pro`.
      const HYPHEN = `probe_hyphen_organization = {
\ticon = GFX_idea_kongsberg-logo
\tequipment_type = { infantry_equipment }
\tallowed = { original_tag = GER }
\ttrait = {
\t\ttoken = probe_hy
\t\tname = probe_hy
\t\ticon = GFX_idea_floro-international-corporation
\t\tposition = { x=0 y=0 }
\t\tequipment_bonus = {
\t\t\tsoft_attack = 0.1
\t\t}
\t}
}
`;
      const { after, errors, details } = await roundTrip(HYPHEN);
      rec("the save was accepted", errors.length === 0, errors[0]);
      rec("⭐ READ: the hyphenated organization icon is reported whole",
        (details[0] || {}).icon === "GFX_idea_kongsberg-logo", JSON.stringify((details[0] || {}).icon));
      rec("⭐ SAVE: it survives", /icon = GFX_idea_kongsberg-logo/.test(after), show(after));
      rec("…and is not truncated at the hyphen", !/icon = GFX_idea_kongsberg\s*$/m.test(after), show(after));
      rec("⭐ …and a trait's hyphenated icon survives too",
        /icon = GFX_idea_floro-international-corporation/.test(after), show(after));
    }

    console.log("\n9. …and notes inside a trait survive");
    {
      // mioOldTraitExtras kept each preserved statement's TEXT, and a comment is not part of a statement's
      // text — so every note inside a `trait = { … }` was dropped. 138 across the corpora, 41 vanilla, and
      // vanilla's ARG_organization.txt parks `#all_parents = { … }` that way: a held-back setting.
      const TNOTES = `probe_tnotes_organization = {
\ticon = GFX_idea_generic_tank_manufacturer_2
\tequipment_type = { infantry_equipment }
\tallowed = { original_tag = GER }
\ttrait = {
\t\ttoken = probe_tn
\t\tname = probe_tn
\t\tposition = { x=0 y=0 }
\t\t#all_parents = { probe_other }

\t\t#a note about the limit
\t\tlimit_to_equipment_type = { infantry_equipment }
\t\t#written last, leading nothing
\t}
}
`;
      const { after, errors } = await roundTrip(TNOTES);
      rec("the save was accepted", errors.length === 0, errors[0]);
      rec("⭐ the DETACHED note inside the trait survives", /#all_parents = \{ probe_other \}/.test(after), show(after));
      rec("⭐ the note above a preserved key survives", /#a note about the limit/.test(after), show(after));
      rec("⭐ the note written LAST survives", /#written last, leading nothing/.test(after), show(after));
      rec("…and the key it annotates is still there", /limit_to_equipment_type = \{ infantry_equipment \}/.test(after), show(after));
      const { after: twice } = await roundTrip(after);
      rec("…and a second save does not multiply them",
        (twice.match(/#all_parents/g) || []).length === 1
        && (twice.match(/#written last/g) || []).length === 1, show(twice));
    }

    console.log("\n10. …and a trait that inherits its place is not pinned to the origin");
    {
      // ⛔ #mio-trait-position-invented. mioTraitLines wrote `position = { x=… y=… }` unconditionally and the
      // reader reports 0/0 for a trait that declares none, so the editor cannot tell "no position" from
      // "position 0,0". 116 traits across the corpora have none — and ALL 116 are in organizations that
      // `include` a template, which is where their position comes from. 46 are vanilla:
      // BEL_cockerill_shipyards_organization refines three generic submarine traits that way. Writing the
      // origin stacks them on column 0, the picture #mio-negative-trait-position was fixed for.
      const POS = `probe_pos_organization = {
\ticon = GFX_idea_generic_tank_manufacturer_2
\tinclude = generic_infantry_equipment_organization
\tallowed = { original_tag = GER }
\ttrait = {
\t\ttoken = probe_inherits_place
\t\tname = probe_inherits_place
\t\tequipment_bonus = {
\t\t\tsoft_attack = 0.1
\t\t}
\t}
\ttrait = {
\t\ttoken = probe_states_place
\t\tname = probe_states_place
\t\tposition = { x=2 y=3 }
\t\tequipment_bonus = {
\t\t\tbreakthrough = 0.1
\t\t}
\t}
}
`;
      const { after, errors } = await roundTrip(POS);
      rec("the save was accepted", errors.length === 0, errors[0]);
      rec("⭐ the trait that states no position gains none",
        !/token = probe_inherits_place[\s\S]*?position/.test(after.slice(0, after.indexOf("probe_states_place"))), show(after));
      rec("⭐ …and the one that DOES state a place keeps it", /position = \{ x=2 y=3 \}/.test(after), show(after));
      rec("…and neither is pinned to the origin", !/position = \{ x=0 y=0 \}/.test(after), show(after));
    }

    console.log("\n11. …and several notes on several traits each go back on their own trait");
    {
      // ⚠️ The injection matched the FIRST `trait =` in the block, so a note above the third trait landed on
      // the first — and with several such notes they would all stack there, duplicating rather than moving.
      // Also: a tail made of two comment RUNS separated by a blank line came back as only the last run,
      // which is how Millennium Dawn's BEL_organization.txt parks two `# add_trait = { … }` blocks.
      const MANY = `probe_many_organization = {
\ticon = GFX_idea_generic_tank_manufacturer_2
\tequipment_type = { infantry_equipment }
\tallowed = { original_tag = GER }

\t#about the first trait
\ttrait = {
\t\ttoken = probe_m1
\t\tname = probe_m1
\t\tposition = { x=0 y=0 }
\t\tequipment_bonus = { soft_attack = 0.1 }
\t}

\t#about the second trait
\ttrait = {
\t\ttoken = probe_m2
\t\tname = probe_m2
\t\tposition = { x=1 y=0 }
\t\tequipment_bonus = { breakthrough = 0.1 }
\t}

\t# add_trait = {
\t# \ttoken = probe_parked_one
\t# }

\t# add_trait = {
\t# \ttoken = probe_parked_two
\t# }
}
`;
      const { after, errors } = await roundTrip(MANY);
      rec("the save was accepted", errors.length === 0, errors[0]);
      rec("⭐ each trait's note is above ITS OWN trait",
        /#about the first trait[\s\S]{0,80}token = probe_m1/.test(after)
        && /#about the second trait[\s\S]{0,80}token = probe_m2/.test(after), show(after));
      rec("…and neither note is duplicated",
        (after.match(/#about the first trait/g) || []).length === 1
        && (after.match(/#about the second trait/g) || []).length === 1, show(after));
      rec("⭐ BOTH parked blocks at the end survive",
        /probe_parked_one/.test(after) && /probe_parked_two/.test(after), show(after));
      const { after: twice } = await roundTrip(after);
      rec("…and a second save multiplies nothing",
        (twice.match(/#about the first trait/g) || []).length === 1
        && (twice.match(/probe_parked_one/g) || []).length === 1
        && (twice.match(/probe_parked_two/g) || []).length === 1, show(twice));
    }

    console.log("\n12. …and an organization whose id carries a hyphen can be opened at all");
    {
      // ⛔ #mio-id-listed-but-unopenable. scanModMioIds lists whatever the file declares, so the sidebar
      // showed every company — and /api/mio/detail then refused five of them with "Bad id.", so they could
      // not be opened, edited or saved. TWO ARE VANILLA: AST_curtiss-wright_organization and
      // AST_vickers-ruwolt_organization carry a hyphen; a mod ships göteborg_shipyard_organization. Measured
      // over 2,423 organization blocks, the only characters outside [A-Za-z0-9_] in an id are `-` (4) and
      // `ö` (1). This is #dotted-vanilla-token-listed-but-unsaveable one maker over, and the character maker
      // was widened for it with the note that "a gate that disagrees with the endpoint it guards is worse
      // than no gate".
      const ODD = `AST_curtiss-wright_organization = {
\ticon = GFX_idea_generic_tank_manufacturer_2
\tequipment_type = { infantry_equipment }
\tallowed = { original_tag = AST }
}

göteborg_shipyard_organization = {
\ticon = GFX_idea_generic_tank_manufacturer_1
\tequipment_type = { infantry_equipment }
\tallowed = { original_tag = SWE }
}
`;
      const { after, errors, ids, details } = await roundTrip(ODD);
      rec("CONTROL: both are listed", ids.length === 2, JSON.stringify(ids));
      rec("⭐ the hyphenated one can be OPENED", details.some((d) => d.id === "AST_curtiss-wright_organization"),
        JSON.stringify(details.map((d) => d.id)));
      rec("⭐ …and so can the non-ASCII one", details.some((d) => d.id === "göteborg_shipyard_organization"),
        JSON.stringify(details.map((d) => d.id)));
      rec("⭐ …and both save without error", errors.length === 0, errors[0]);
      rec("…and both blocks are still in the file",
        /AST_curtiss-wright_organization = \{/.test(after) && /göteborg_shipyard_organization = \{/.test(after), show(after));
      rec("…and neither is duplicated",
        (after.match(/AST_curtiss-wright_organization = \{/g) || []).length === 1
        && (after.match(/göteborg_shipyard_organization = \{/g) || []).length === 1, show(after));
    }

    console.log("\n13. …and a trait declared twice keeps both blocks  (a no-edit save lost the second)");
    {
      // ⛔ #mio-trait-second-block-dropped. The reader takes the FIRST `any_parent` / `equipment_bonus` and
      // the writer emits one, so a trait declaring the key twice lost the second WITHOUT ANY EDIT. It matters
      // most for any_parent: HOI4 evaluates the blocks together, so two mean "a parent from THIS set AND one
      // from that set", and collapsing them turns an AND into an OR — the semantics
      // #event-duplicate-sub-block-dropped was fixed for one maker over. 5 traits declare `any_parent` twice
      // across the corpora and 4 declare `all_parents` twice; one of each is vanilla.
      const TWICE = `probe_twice_organization = {
\ticon = GFX_idea_generic_tank_manufacturer_2
\tequipment_type = { infantry_equipment }
\tallowed = { original_tag = GER }
\ttrait = {
\t\ttoken = probe_tw
\t\tname = probe_tw
\t\tposition = { x=0 y=0 }
\t\tany_parent = { probe_a }
\t\tany_parent = { probe_b }
\t\tequipment_bonus = {
\t\t\tsoft_attack = 0.1
\t\t}
\t\tequipment_bonus = {
\t\t\treliability = 0.2
\t\t}
\t}
}
`;
      const { after, errors } = await roundTrip(TWICE);
      rec("the save was accepted", errors.length === 0, errors[0]);
      rec("⭐ BOTH any_parent blocks survive",
        /any_parent = \{ probe_a \}/.test(after) && /any_parent[\s\S]*probe_b/.test(after), show(after));
      rec("⭐ …and both equipment_bonus blocks",
        /soft_attack = 0\.1/.test(after) && /reliability = 0\.2/.test(after), show(after));
      const { after: twice } = await roundTrip(after);
      rec("…and a second save does not multiply them",
        (twice.match(/probe_b/g) || []).length === 1 && (twice.match(/reliability = 0\.2/g) || []).length === 1, show(twice));
    }

    console.log("\n14. …and renaming a trait keeps its script, and takes its references with it");
    {
      // ⛔ #mio-trait-rename-drops-everything. The preserve is keyed on the token, so renaming a trait made
      // every lookup miss and its ai_will_do / on_complete / limit_to_equipment_type / all_parents /
      // mutually_exclusive / organization_modifier / available went. 4,215 traits across the corpora carry at
      // least one of those — 11,816 statements, 455 traits and 736 statements of them VANILLA.
      const REN = `probe_ren_organization = {
\ticon = GFX_idea_generic_tank_manufacturer_2
\tequipment_type = { infantry_equipment }
\tallowed = { original_tag = GER }
\ttrait = {
\t\ttoken = probe_old
\t\tname = probe_old
\t\tposition = { x=0 y=0 }
\t\tlimit_to_equipment_type = { infantry_equipment }
\t\tai_will_do = { factor = 2 }
\t\tequipment_bonus = {
\t\t\tsoft_attack = 0.1
\t\t}
\t}
\ttrait = {
\t\ttoken = probe_child
\t\tname = probe_child
\t\tposition = { x=1 y=0 }
\t\tany_parent = { probe_old }
\t\tequipment_bonus = {
\t\t\tbreakthrough = 0.1
\t\t}
\t}
}
`;
      const { after, errors } = await roundTrip(REN, null, { renameTrait: ["probe_old", "probe_renamed"] });
      rec("the save was accepted", errors.length === 0, errors[0]);
      rec("⭐ the new token is written", /token = probe_renamed/.test(after), show(after));
      rec("⭐ …and the trait's un-modelled script came with it",
        /limit_to_equipment_type = \{ infantry_equipment \}/.test(after) && /ai_will_do/.test(after), show(after));
      rec("⭐ …and the child's reference FOLLOWS the rename",
        /any_parent = \{ probe_renamed \}/.test(after), show(after));
      rec("…and nothing still points at the old token", !/probe_old/.test(after), show(after));
    }

    console.log("\n15. …but a positional guess must not graft one trait's script onto another  (safety control)");
    {
      // ⚠️ The editor sends no per-trait previous token, so the rename fallback is POSITION — and a wrong
      // positional guess would move one trait's script onto a different trait, which is worse than dropping
      // it. It is only used when the disk trait at that index has a token that is NOT among the tokens being
      // written. DELETING the first trait shifts every position by one while all remaining tokens still
      // exist, so nothing may move.
      const SHIFT = `probe_shift_organization = {
\ticon = GFX_idea_generic_tank_manufacturer_2
\tequipment_type = { infantry_equipment }
\tallowed = { original_tag = GER }
\ttrait = {
\t\ttoken = probe_s1
\t\tname = probe_s1
\t\tposition = { x=0 y=0 }
\t\tai_will_do = { factor = 11 }
\t\tequipment_bonus = { soft_attack = 0.1 }
\t}
\ttrait = {
\t\ttoken = probe_s2
\t\tname = probe_s2
\t\tposition = { x=1 y=0 }
\t\tai_will_do = { factor = 22 }
\t\tequipment_bonus = { breakthrough = 0.1 }
\t}
}
`;
      const { after, errors } = await roundTrip(SHIFT, null, { dropFirstTrait: true });
      rec("the save was accepted", errors.length === 0, errors[0]);
      rec("CONTROL: the first trait really was removed", !/token = probe_s1/.test(after), show(after));
      rec("⭐ the survivor kept its OWN script, not the deleted one's",
        /factor = 22/.test(after) && !/factor = 11/.test(after), show(after));
    }

    console.log("\n16. …and the company's name is read and written against the key the GAME reads");
    {
      // ⛔ #mio-name-written-to-the-wrong-key. An organization is named by its own `name` key when it
      // declares one — 1,143 do across the corpora, and for 611 (33 vanilla) that key is NOT the id. Vanilla
      // names BEL_cockerill_shipyards_organization through `cockerill_shipyards`, and the base game defines
      // `cockerill_shipyards: "Cockerill Shipyards"` while it NEVER defines the id. Nova read and wrote
      // loc[id], so the editor showed the raw id and a rename went somewhere the game does not look: the save
      // reported success and nothing changed in game.
      const NAMED = `probe_named_organization = {
\ticon = GFX_idea_generic_tank_manufacturer_2
\tname = probe_authors_name_key
\tequipment_type = { infantry_equipment }
\tallowed = { original_tag = GER }
\tinitial_trait = {
\t\tname = probe_authors_initial_key
\t\tequipment_bonus = { soft_attack = 0.1 }
\t}
}
`;
      const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-mioform-named-"));
      made.push(mod);
      fs.mkdirSync(path.join(mod, SUB), { recursive: true });
      fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="MIO Form"\nsupported_version="1.16.*"\n');
      fs.writeFileSync(path.join(mod, SUB, "probe.txt"), NAMED, "utf8");
      const ld = path.join(mod, "localisation", "english");
      fs.mkdirSync(ld, { recursive: true });
      fs.writeFileSync(path.join(ld, "probe_l_english.yml"),
        '﻿l_english:\n probe_authors_name_key:0 "The Author’s Company"\n probe_authors_initial_key:0 "The Author’s Starting Trait"\n', "utf8");

      const d = await fetch(`${BASE}/api/mio/detail?id=probe_named_organization&modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
      rec("⭐ READ: the name comes from the author's key, not the raw id",
        d && d.name === "The Author’s Company", JSON.stringify(d && d.name));

      const res = await fetch(`${BASE}/api/mio`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modPath: mod, id: "probe_named_organization", name: "Renamed By The Editor", desc: "",
          allowedTag: d.allowedTag || "", icon: d.icon || "", fileName: "probe.txt",
          equipmentType: (d.equipmentType || []).slice(), researchCategories: [], include: [],
          initial: { equipmentBonus: (d.initial && d.initial.equipmentBonus) || {}, productionBonus: {} },
          traits: [], writeIdeaFallback: false, previousId: "probe_named_organization",
        }),
      }).then((r) => r.json());
      rec("the save was accepted", res && res.ok === true, res && res.error);
      const loc = fs.readdirSync(ld).map((f) => fs.readFileSync(path.join(ld, f), "utf8")).join("\n");
      rec("⭐ SAVE: the new name went to the author's key",
        /probe_authors_name_key:0 "Renamed By The Editor"/.test(loc), loc);
      rec("…and no entry was invented against the id", !/probe_named_organization:0/.test(loc), loc);
      // ⭐ The regression this nearly caused. The editor has no field for the starting trait's name and never
      // sends one, so the save stamped the English literal "Standardized production" on every write. While it
      // landed on `<id>_initial` that was junk nobody read; once the writer began keeping the AUTHOR'S key it
      // would have overwritten the real name of 868 starting traits, 67 of them vanilla.
      rec("⭐ …and the author's starting-trait name was NOT overwritten",
        /probe_authors_initial_key:0 "The Author’s Starting Trait"/.test(loc), loc);
      rec("…and \"Standardized production\" appears nowhere", !/Standardized production/.test(loc), loc);
      const after = fs.readFileSync(path.join(mod, SUB, "probe.txt"), "utf8");
      rec("…and the script still points at the author's keys",
        /name = probe_authors_name_key/.test(after) && /name = probe_authors_initial_key/.test(after), show(after));
      // …and the line keeps its own shape: replacing only the quoted value leaves the indent and version.
      rec("…and the rewritten line keeps its indentation", / probe_authors_name_key:0 /.test(loc), JSON.stringify(loc.slice(0, 120)));
    }

    console.log("\n17. …but a NEW organization still gets the maker's template  (the other direction)");
    {
      const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-mioform-new-"));
      made.push(mod);
      fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="MIO Form"\nsupported_version="1.16.*"\n');
      fs.mkdirSync(path.join(mod, SUB), { recursive: true });
      const res = await fetch(`${BASE}/api/mio`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modPath: mod, id: "brand_new_organization", name: "Brand New", desc: "",
          allowedTag: "", icon: "", fileName: "nova_mio.txt",
          // The maker refuses an organization with nothing to work on — "needs at least one equipment_type
          // or research_category" — which is Nova being right, not a bug. Send one, as the editor does.
          equipmentType: ["infantry_equipment"], researchCategories: [], include: [],
          initial: { equipmentBonus: {}, productionBonus: {} }, traits: [],
          writeIdeaFallback: false, previousId: "",
        }),
      }).then((r) => r.json());
      rec("the new organization saved", res && res.ok === true, res && res.error);
      const f = path.join(mod, SUB, "nova_mio.txt");
      const t = fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "";
      // Nothing was on disk to respect, so the template is the maker's own default, not an invention.
      rec("⭐ it still gets an icon, an allowed gate and an initial_trait",
        /icon\s*=/.test(t) && /allowed\s*=/.test(t) && /initial_trait/.test(t), show(t));
      rec("…and the initial_trait carries the convention name",
        /brand_new_organization_initial/.test(t), show(t));
    }

    console.log("\n8. Measured on the vanilla files that carry each shape");
    const CASES = [
      ["an organization with no initial_trait", "SLO_organization.txt", (t) => !/initial_trait/.test(t)],
      ["an organization with a named initial_trait", "AFG_organization.txt", (t) => /initial_trait/.test(t)],
    ];
    for (const [label, base, prop] of CASES) {
      const REAL = path.join("D:/SteamLibrary/steamapps/common/Hearts of Iron IV", SUB, base);
      if (!fs.existsSync(REAL)) { rec(`vanilla's ${base} is installed`, false, "cannot verify"); continue; }
      const original = fs.readFileSync(REAL, "utf8");
      rec(`CONTROL: ${base} really is ${label}`, prop(original), "");
      const { after, errors } = await roundTrip(original, base);
      rec(`${label}: every organization saved`, errors.length === 0, errors[0]);
      // No leaf assignment lost and none invented, counted over the whole file.
      const bag = (t) => {
        const m = new Map();
        const src = t.replace(/#[^\n]*/g, "");
        const re = /([A-Za-z_][A-Za-z0-9_.]*)\s*(=|<|>)\s*("[^"]*"|[^\s{}]+)/g;
        let x;
        while ((x = re.exec(src))) { const k = `${x[1]} ${x[2]} ${x[3]}`; m.set(k, (m.get(k) || 0) + 1); }
        return m;
      };
      const A = bag(original), B = bag(after);
      const lost = [...A].filter(([k, n]) => (B.get(k) || 0) < n).map(([k, n]) => `${k} (${n}->${B.get(k) || 0})`);
      const gained = [...B].filter(([k, n]) => (A.get(k) || 0) < n).map(([k, n]) => `${k} (${A.get(k) || 0}->${n})`);
      rec(`⭐ ${label}: not one leaf assignment is lost`, lost.length === 0, lost.slice(0, 4).join(" · "));
      rec(`⭐ ${label}: …nor one invented`, gained.length === 0, gained.slice(0, 4).join(" · "));
    }

    console.log(`\n=== an organization keeps what its author wrote: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
    process.exitCode = 1;
  } finally {
    if (server) { try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {} await new Promise((r) => server.close(r)); }
    try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}
    for (const p of made) { try { fs.rmSync(p, { recursive: true, force: true }); } catch (_) {} }
  }
})();
