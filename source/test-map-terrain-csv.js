// definition.csv is the most safety-critical map file: one malformed row and HOI4 mis-maps every
// colour→province (black areas, wrong shapes, crashes). The terrain/type/coastal editor (editDefinitionCsv,
// behind /api/map/set-province-terrain) must change ONLY the target province's row, touch the right
// columns (id;r;g;b;type;coastal;terrain;continent → 4/5/6/7), never collide on an id PREFIX (province 1
// vs 10/100), and preserve every other byte incl. CRLF line endings.
"use strict";
const { editDefinitionCsv } = require("./map-data.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };

// A small definition.csv with CRLF endings and the tricky prefix ids 1, 10, 100.
const CRLF = "\r\n";
const rows = [
  "0;0;0;0;land;false;unknown;0",
  "1;10;20;30;land;false;plains;1",
  "10;40;50;60;sea;true;ocean;2",
  "100;70;80;90;land;true;forest;1",
  "2;11;22;33;land;false;hills;1",
];
const csv = rows.join(CRLF) + CRLF; // trailing newline like the real file

// 1. Edit terrain of province 1 → only col 6 of row "1;" changes.
{
  const r = editDefinitionCsv(csv, 1, { terrain: "desert" });
  check("province 1 terrain edit reported changed", r.changed === true, r.error);
  const out = r.text.split(CRLF);
  check("province 1 row terrain → desert", out[1] === "1;10;20;30;land;false;desert;1", out[1]);
  check("only terrain col changed on row 1 (rgb/type/coastal/continent intact)", /^1;10;20;30;land;false;desert;1$/.test(out[1]));
  check("province 10 row UNTOUCHED (no prefix collision with 1)", out[2] === "10;40;50;60;sea;true;ocean;2", out[2]);
  check("province 100 row UNTOUCHED", out[3] === "100;70;80;90;land;true;forest;1", out[3]);
  check("province 0 + 2 rows untouched", out[0] === rows[0] && out[4] === rows[4]);
  check("CRLF endings preserved", r.text.includes(CRLF) && !/[^\r]\n/.test(r.text.replace(/\r\n/g, "")), JSON.stringify(r.text.slice(0, 20)));
  check("exactly the same byte length delta as desert-vs-plains", r.text.length === csv.length + ("desert".length - "plains".length));
}

// 2. Edit type + coastal + continent of province 10 together.
{
  const r = editDefinitionCsv(csv, 10, { type: "lake", coastal: false, continent: 3 });
  check("multi-field edit changed", r.changed === true);
  const out = r.text.split(CRLF);
  check("province 10 → type lake, coastal false, continent 3", out[2] === "10;40;50;60;lake;false;ocean;3", out[2]);
  check("other rows untouched on multi-edit", out[1] === rows[1] && out[3] === rows[3]);
}

// 3. coastal=true normalises to the string "true"; type/terrain lowercased.
{
  const r = editDefinitionCsv(csv, 2, { coastal: true, terrain: "MOUNTAIN", type: "LAND" });
  const row = r.text.split(CRLF)[4];
  check("coastal true + lowercased type/terrain", row === "2;11;22;33;land;true;mountain;1", row);
}

// 4. Non-existent province → no change + error.
{
  const r = editDefinitionCsv(csv, 99999, { terrain: "desert" });
  check("unknown province → changed:false + error", r.changed === false && /not found/i.test(r.error || ""), JSON.stringify(r));
  check("unknown province → text returned unchanged", r.text === csv);
}

// 5. No-op (same value) → changed:false, text identical.
{
  const r = editDefinitionCsv(csv, 1, { terrain: "plains" });
  check("setting terrain to its current value is a no-op", r.changed === false && r.text === csv);
}

// 6. Bad id → guarded.
check("non-numeric id rejected", editDefinitionCsv(csv, "abc", { terrain: "x" }).changed === false);

// 7. First row (province 0, no preceding newline) is editable via the ^ anchor.
{
  const r = editDefinitionCsv(csv, 0, { terrain: "snow" });
  check("first row (^ anchor) editable", r.changed === true && r.text.split(CRLF)[0] === "0;0;0;0;land;false;snow;0", r.text.split(CRLF)[0]);
}

console.log(`\nMAP-TERRAIN-CSV TEST: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
