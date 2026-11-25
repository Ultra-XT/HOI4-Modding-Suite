// Localization-value escaping. A user-entered name/desc with a " (or \ or newline) must be escaped or
// it breaks the whole .yml loc file (HOI4 stops reading it → missing names everywhere). These are the
// values the makers write as `KEY:0 "value"`.
const { escapeLocalizationValue } = require("./server.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };

check('escapes a double quote', escapeLocalizationValue('The "Great" War') === 'The \\"Great\\" War', JSON.stringify(escapeLocalizationValue('The "Great" War')));
check('escapes a backslash', escapeLocalizationValue('a\\b') === 'a\\\\b', JSON.stringify(escapeLocalizationValue('a\\b')));
check('backslash escaped BEFORE quote (no double-escape)', escapeLocalizationValue('\\"') === '\\\\\\"', JSON.stringify(escapeLocalizationValue('\\"')));
check('newline → \\n (stays on one line)', escapeLocalizationValue('a\nb') === 'a\\nb', JSON.stringify(escapeLocalizationValue('a\nb')));
check('CRLF → \\n', escapeLocalizationValue('a\r\nb') === 'a\\nb', JSON.stringify(escapeLocalizationValue('a\r\nb')));
check('tab → \\t', escapeLocalizationValue('a\tb') === 'a\\tb', JSON.stringify(escapeLocalizationValue('a\tb')));
check('plain text unchanged', escapeLocalizationValue("People's Republic") === "People's Republic", JSON.stringify(escapeLocalizationValue("People's Republic")));
// `$` is deliberately NOT doubled — HOI4 uses $var$ substitution, and these values include descriptions
// that legitimately reference variables. Doubling would render `$cost$` literally. (Wiki-informed; see
// the comment on escapeLocalizationValue.) This locks the decision so it isn't silently "fixed".
check('$ passes through (preserves $var$ references)', escapeLocalizationValue('Cost: $cost$ PP') === 'Cost: $cost$ PP', JSON.stringify(escapeLocalizationValue('Cost: $cost$ PP')));
check('null/undefined → empty string', escapeLocalizationValue(null) === '' && escapeLocalizationValue(undefined) === '', '');
check('number coerced to string', escapeLocalizationValue(206) === '206', JSON.stringify(escapeLocalizationValue(206)));
// The escaped value, wrapped in quotes, must contain no UN-escaped interior quote (would end the string early).
const wrapped = '"' + escapeLocalizationValue('say "hi"') + '"';
check('wrapped value has balanced delimiters', (wrapped.match(/(?<!\\)"/g) || []).length === 2, JSON.stringify(wrapped));

console.log(`\nLOC-ESCAPE TEST: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
