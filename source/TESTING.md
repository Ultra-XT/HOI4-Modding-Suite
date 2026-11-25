# Nova Modding Suite — Testing

Repeatable automated tests. Run these anytime (e.g. before a release) to confirm nothing broke.

## Quick start

```bash
npm test          # 108 unit/integration tests (fast, ~85s) — backend logic + the all-endpoints smoke
npm run test:ui   # UI smoke: loads every page + clicks every safe button in headless Chromium
npm run test:full # DEEP: builds a real demo mod using every maker (create→edit→save→verify on disk)
npm run test:ai   # exercises the ✨Generate-with-AI button in every maker (real request + handling)
npm run test:roundtrip # EDIT existing rich items → save → assert un-modeled fields aren't dropped
npm run test:picker # the CWTools command PICKER: 📋 buttons open → search → row-click inserts
npm run test:clone  # the Decision Maker "Duplicate" button: copy with a fresh id, original untouched
npm run test:clone-event # the Event Maker "Duplicate" button (same, in-namespace id copy)
npm run test:clone-idea  # the National Spirit Maker "Duplicate" button
npm run test:clone-char  # the Character Maker "Duplicate" button (token-based copy)
npm run test:focus-triggers # the 📋 picker on the focus editor's available/allow_branch/bypass fields
npm run test:continuous-focus # the draggable Continuous Focuses panel: render + move + edit + add + remove
npm run test:continuous-focus-collapse # the Continuous Focuses panel: defaults OPEN, renders BEHIND the tree (z-index 5 < node z 20 — the game draws focus icons on top of the window, so an open panel no longer covers focuses), is drawn on the MINIMAP (translucent purple rect), and persists the collapse choice (localStorage nova_cf_panel_collapsed). Covers default-open+tiles, z-below-nodes, minimap rect, collapse→persist, reload stays collapsed, cleared pref → open again
npm run test:continuous-focus-clear # CONTINUOUS FOCUS box is always CLEAR + ON-CANVAS + BESIDE the tree (window.__novaCfClearedPosition). continuous_focus_position is authored inconsistently across mods (relative to grid 0 vs tree top-left; some park the box far from the tree, e.g. MD Belarus box at grid 15 / tree at grid 52, or above the canvas origin so it renders off the top like free_states) — and it's draggable in-game so authors are loose. The drawn box is kept clear + on-canvas (no negative coords) + near the tree, derived from the LIVE layout (any mod incl. vanilla, no hardcode); an already-good authored spot is left unchanged. Covers overlap→nudged-clear (same x, on-canvas), off-canvas-far→pulled on-canvas+beside+clear, already-good→unchanged
npm run test:shared-focus # the read-only shared-focus layer: inherited branches render + toggle, not in save
npm run test:focus-perf # focus-tree perf: viewport culling (off-screen nodes unpainted) + geometry-only zoom
npm run test:focus-canvas-extent # FOCUS canvas size = UNION extent of own tree + shared (inherited) tree + continuous-focus panel (window.__novaUnifyCanvasExtent), data-derived not hardcoded — "bigger square so the smaller fits". Was sized from the own tree span + grew only for the shared/continuous far edge, never the own tree's far edge after the viewport shift, so an inherited focus further left (x:-7) shifted the own tree right off the canvas. Covers floor, wider-shared (1900 vs 2000 → 2000), own-furthest, null/missing/non-finite parts
npm run test:focus-country-label # FOCUS dropdown country labelling (/api/focus/country-trees): the owner tag comes from the tree's `country = {}` block written as `tag =` OR `original_tag =` (\btag can't match original_tag → MD's netherlands_focus mislabelled "Brazil" from a stray `tag = BRA` in a focus). Fix: match original_tag, anchor `\bcountry` so `every_country = {` isn't mistaken for the ownership block, and fall back to the most-common focus-id prefix (HOL_*) not a stray tag. Covers original_tag, no-country-block→id-prefix, plain tag (no regression). ALSO the end-to-end OVERLAP fix: because the tree resolves to HOL, its inherited shared focus gets the HOL per-country offset (y=10) not the stray BRA offset (y=99) via /api/focus/shared — under the old mislabel no offset matched and the 164 shared EU focuses piled onto the main tree
npm run test:map-edit # MAP editor end-to-end: render a real provinces.bmp, click-move a province, save → verify disk
npm run test:map-heatmap # MAP heatmaps: Color-by Manpower/Factories/VPs recolours states cold→hot + legend
npm run test:map-history # MAP History panel: jump to any edit step (undo/redo) + named checkpoints (in-memory)
npm run test:map-search # MAP Find box: jump by state id/name, country TAG, or province (p123) — read-only nav
npm run test:map-fixall # MAP "Fix all": auto-repair region splits + missing state_category → 0 errors, disk verified
npm run test:map-multiselect # MAP multi-select: shift-click many states → bulk set-owner → both saved on disk
npm run test:map-bulkedit # MAP bulk edit: "+ same owner" select-similar → bulk set category/manpower → disk
npm run test:map-adjacency # MAP adjacency: click two provinces → add impassable/strait → remove → disk verified
npm run test:map-supply-ui # MAP supply/rail: toggle a supply hub + draw a railway chain → disk verified
npm run test:map-marquee # MAP marquee: shift-drag a box selects all states inside → bulk bar shown
npm run test:map-region-select # MAP "+ same region": select every state in a strategic region (unequal sizes)
npm run test:map-bucketfill # MAP bucket-fill: Shift+click in Paint floods a contiguous same-owner blob → new owner
npm run test:map-ownercolor # MAP fallback owner colours: generated (no colors.txt) hues are spread, not all red
npm run test:map-toolpanel # MAP Adobe tool dock: 9 mode buttons in a left panel, collapse/expand toggle persists
npm run test:map-railmgmt # MAP rails & supply panel: list/remove/downsize railways + hubs, per-state counts, disk-verified
npm run test:map-keys # MAP keyboard modal: ⌨ Keys button opens shortcut list; rebind a tool key, persists, drives the tool
npm run test:map-region-rename # MAP rename a strategic region (✎) → writes localisation only (region file untouched), disk-verified
npm run test:map-supplyarea-rename # MAP rename a supply area (✎) → writes localisation only (map file untouched), disk-verified
npm run test:map-autobackup # MAP crash recovery: staged edits persist to localStorage → reload → Restore/Discard banner → Save
npm run test:map-region-create # MAP create a strategic region (cloned weather) + supply area (✛) → valid block + loc on disk
npm run test:map-brush # MAP brush size up to 256px + typing above it clamps LIVE to 256 (no Enter)
npm run test:map-rivers # MAP rivers overlay: read 8-bit indexed rivers.bmp → /rivers-info + /rivers-png + 🌊 toggle
npm run test:map-autofix # MAP 🛠 Auto-fix toggle: ON auto-deletes a state you empty; OFF keeps it + only warns — disk-verified
npm run test:map-erase # MAP 🧹 Erase brush: click/drag flips whole LAND provinces → sea (definition.csv retype, kept id, out of state, empty state auto-deleted) — disk-verified
npm run test:map-blank # MAP 🗑 Delete map: 2-step confirm (type DELETE) → staged all-sea/0-states → Save → disk all-sea, states+supply gone, capitals stripped, regions kept
npm run test:map-generate # MAP 🌍 Generate land: confirm (amount+seed) → procedural sea→land wrapped in valid region-respecting contiguous-id states — disk-verified, crash-safe
npm run test:map-movecountry # MAP 🚚 Move country (experimental pixel-drag): drag a country's land → confirm → provinces.bmp pixels relocate on disk (damage auto-cleaned/reported)
npm run test:map-terrain # MAP 🏔 Terrain brush: pick a terrain → drag over LAND provinces → definition.csv terrain set on disk (sea left alone, land-only)
npm run test:map-capital # MAP 🏛 Set-capital tool: click a state → its owner's capital = N written to history/countries on disk (always a state it owns)
npm run test:map-deeplink # MAP deep-link: map.html?tag=GER&tool=capital pre-loads the brush + activates the tool + centres on the country (Country-Setup redirect plumbing); plain load does none of it
npm run test:map-country-color # MAP 🎨 colour picker: edit the selected country's colour in colors.txt + recolour; color_ui & other countries preserved (UI→disk). Backend: test-map-country-color.js
npm run test:map-country-thumb # MAP country thumbnail: GET /api/map/country-thumb renders a PNG of a country's territory (its colour, cropped to bbox) for the Country Setup minimap; non-owner → 404
npm run test:map-newcountry # MAP ✨ New country (paint-first): claim land states → name+create → disk has country files + colors.txt + every claimed state owned, capital auto-picked. Backend: test-map-create-country.js
npm run test:map-wheel # MAP wheel scroll: wheel over a floating panel (tool dock, Keys popup, info) scrolls it natively (not preventDefault'd); wheel over the canvas still zooms
npm run test:map-modal-close # MAP modal dismissal: Generate/Delete-map/New-country modals close on Esc + backdrop click (even while typing in a field), but not on clicking inside the dialog
npm run test:country-picker-dismiss # Country Setup spirit/tech picker modals close on Esc + backdrop click (not only the ✕); inside-click keeps them open
npm run test:country-clamp # Country Setup percentage fields (stability / war support / ideology popularities) clamp to 0–100 as you type — 150 → 100, -5 → 0
npm run test:default-images # Maker default preview images point at vanilla assets that EXIST (idea_unknown.dds) — characters.html + ideas.html make no 4xx /api/vanilla-ui request on load
npm run test:decision-newfocus # Maker "New X" focuses the name field (Decision/Event/National-Spirit select the placeholder name; Characters focuses its token) so you can type the real name immediately
npm run test:char-rolelabels # Character maker: role names ("Country Leader"/"Advisor"/"Military Leader") are <label for> tied to their checkbox — clicking the name toggles the role + expands its body
npm run test:img-fallback # CSP-safe image fallback (events.js): inline onerror is CSP-blocked, so images use data-fallback + one capture-phase error listener that swaps a broken image to its fallback
npm run test:map-layers # MAP Layers dropdown: toggle borders/labels/VPs/railways/hubs/adjacency/rivers + manpower→population rename
npm run test:map-deep # MAP deep stress: ONE session chains paint-owner→move-province→terrain→set-capital→set-colour→adjacency, SAVES (clean validate), RELOADS, and verifies every edit on disk + in the reloaded model (the mixed staged-flush + immediate-colour-write seam)
npm run test:country-deep # COUNTRY SETUP deep: edit many non-geography fields (slots/stability/war support/convoys/ruling party/popularities) → save → reload → verify round-trip; proves the FUSION invariant (Save never clobbers the Map-owned capital), preserves un-modelled script (leader/tech/guarantee/dated blocks), and that the read-only Capital field + "Edit on Map" deep-link to the Map
npm run test:event-news-skin # EVENT maker live preview is type-aware: news_event renders HOI4's real "World News" newspaper (mod-aware event_news_bg, typewriter headline, photo in the masthead frame), country_event renders the parchment REPORT window pinned by a binder clip (event_report_top_win/_midsection/_bottom_win_2 3-slice, dark bronze option bars) — per eventwindow.gui; asserts the is-news ⇄ is-report toggle both ways + mod-aware art
npm run test:event-save-deep # EVENT maker deep round-trip through the real UI+endpoint: build a news_event (type/title/desc/is_triggered_only + 2 options) → Save → verify events/<ns>.txt AND generated localisation/english loc → RELOAD → reopen from the list (search→click) → verify type/options/news-skin round-trip → edit a title, an option's script, add a 3rd option → Save → verify the edit landed, the untouched option survived, one news_event block, brace-balanced
npm run test:decision-save-deep # DECISION maker deep round-trip: build a decision (category/id/name/cost/available/complete_effect/days/fire_only_once) → Save → verify common/decisions/<cat>.txt (category+decision blocks, keys) AND generated loc → RELOAD → reopen from list (search→click) → verify cost/effect round-trip → edit cost+effect → Save → verify the edit landed in exactly one category block, old effect replaced, brace-balanced
npm run test:idea-save-deep # NATIONAL SPIRIT (idea) maker deep round-trip: build a country national spirit (id/name/desc/modifier) → Save → verify common/ideas/<file>.txt (ideas→country→<id> with the modifier) AND generated loc → RELOAD → reopen from list (search→click) → verify modifier round-trip → edit the modifier → Save → verify the edit landed in one spirit block, old modifier replaced. NOTE: sets HOI4_MODS_ROOT to a temp workspace so the catalog's sourcePath check (resolveAllowedModDirectory) accepts the temp mod
npm run test:character-save-deep # CHARACTER maker deep round-trip: build a country-leader character (token/name/ideology/expire/traits) → Save → verify common/characters/<file>.txt (characters→<token>→country_leader with ideology/traits) AND generated loc → RELOAD → reopen from list (search→click) → verify ideology/traits round-trip → edit ideology+traits → Save → verify the edit landed in one character block. Completes the maker round-trip sweep (events/decisions/ideas/characters)
npm run test:maker-upload # Maker image UPLOAD (Event/Decision/National-Spirit): drives the real hidden file input → /api/upload-gfx with an OVERSIZED image; asserts the server resizes to each sprite's HOI4 dims (event 218x122 / decision 32x32 / idea 76x76) + writes the .dds, AND the live preview refreshes to the uploaded icon (the bug: handlers set the id but never re-ran updateIconPreview, so the in-game preview kept the placeholder)
npm run test:map-generate-guard # MAP 🌍 Generate-land SAFETY GUARD: on a populated map (existing land, e.g. a real mod) the Generate button is gated behind a typed GENERATE confirm + a red "already has land" warning (generate-land is for a blank ocean canvas); on a blank ocean map it's enabled immediately
npm run test:map-tool-infohide # MAP info panel: the Inspect info/edit panel hides whenever a tool (terrain/erase/capital/paint…) is active (it was mistaken for the tool's option chooser) and re-shows on return to Inspect
npm run test:map-layers-legend # MAP Layers menu: Rivers is ON by default (stays checked with a valid rivers.bmp; gracefully self-disables if missing) + each layer row carries a colour SWATCH matching the map (brown railways / teal hubs / red-cyan adjacency / blue rivers / gold VPs) — a non-intrusive legend
npm run test:continuous-focus-lock # CONTINUOUS FOCUS lock-vs-conditional: a focus with a satisfiable requirement (e.g. Naval Production, available after 10 focuses) is NOT shown locked — full opacity + a subtle "IF" marker; only a force-hidden focus (available = { always = no }) gets the 🔒 + dimming. Header counts conditional vs hidden separately
npm run test:focus-zoom-iconsize # FOCUS-TREE zoom: on a SMALL tree (no culling — e.g. vanilla per-country trees) zooming out now shrinks the focus ICON/title with the box (96px@100% → ~48px@50%), not just the box — fixes "focuses look huge on zoom-out, only when vanilla is active" (the cull early-return skipped the inner re-layout)
npm run test:map-autofix-warn # MAP Auto-fix: DISABLING the auto-fix safety net pops a confirm ("Keep ON" / "Turn it off anyway"); it stays ON until confirmed, and re-enabling needs no warning
npm run test:upload-backup-safety # DATA SAFETY: /api/upload-gfx backs up an existing picture BEFORE overwriting it (a colliding custom-icon name no longer silently corrupts a real base-mod/MD .dds) — the original is copied verbatim into the backups dir + recoverable; response flags overwrote:true/backupPath; a non-colliding upload reports overwrote:false
npm run test:research-boxsize # RESEARCH tech box-size rule vs the wiki: a tech renders WIDE if it unlocks equipment via enable_equipments OR enable_subunits OR enable_equipment_modules (Nova only checked enable_equipments → infantry/support subunit techs were wrongly SMALL); force_use_small_tech_layout + sub-tech force SMALL; show_equipment_icon does NOT affect size
npm run test:research-connector-routing # RESEARCH prereq CONNECTOR routing (window.__novaConnectorPathD): route by DOMINANT PIXEL AXIS like the game — straight vertical drop (parent bottom→child top) when the child is mostly below/above, horizontal run (right→left edge) when to the side. Fixes MD nsb_armour_folder column chains (e.g. tank chassis, small→big autocannon) that bulged out the node's side because the folder flows left→right. Covers same-x drop, vertical-dominant offset, child-above, horizontal row, horizontal-dominant offset
npm run test:research-orientation # RESEARCH game-folder orientation must mirror the GUI (window.__novaStaleOrientKeys): one-time per-mod migration drops any saved orientation override that CONTRADICTS a game folder's GUI orientation, fixing MD's Armour tab getting stuck "Horizontal" (era sideways) when the game lays nsb_armour_folder out vertically (era downward). Contradicting override cleared; matching/absent override kept; unknown-layout tab never touched
npm run test:research-dlc-propagation # RESEARCH DLC hiding propagates down the prereq chain through OR nodes (window.__novaComputeDlcHidden): a tech is hidden if ANY AND parent is hidden OR EVERY alternative of an OR group is hidden. Fixes MD's duplicate "ART 2005" — the base artillery line (root gated NOT No Step Back) reaches an OR[artillery_1, SP_arty_1] node, and the old code filtered OR prereqs on p.tech (undefined; OR uses array p.techs) so the chain leaked. Covers NSB-owned (base line incl. OR node + artillery_2 hidden, NSB line shown), NSB-not-owned (inverse), and an OR child with one surviving alternative staying visible
npm run test:research-zoom-keys # RESEARCH Z/X canvas zoom guard (window.__novaIsTextEntryTarget): the zoom shortcuts are ignored only while genuinely typing (text-like input / textarea / contentEditable). A focused <select> (mod/country/folder dropdowns keep focus after a pick) no longer counts, so zoom stops dying after you use a dropdown (the "Z/X stopped zooming until I restarted" bug). select/button/checkbox/range do NOT block; text input/textarea/CE do; live: a Z/X keydown on a <select> still zooms
npm run test:research-mutex-routing # RESEARCH mutually-exclusive link routing (window.__novaMutexRoute): bow the dashed line only past the blockers the STRAIGHT line actually crosses (a same-row pair dips just under that row, not to the tree bottom) and ride the swords ON the routed line. Fixes MD lte-wimax: the line plunged to the bottom (giant box) and the swords landed on the Modem tech between them. Covers clear shot, blocked same-row dip, a far-off blocker ignored (no plunge), and stacked sideways bow
npm run test:continuous-focus-placement # CONTINUOUS FOCUS panel placement: continuous_focus_position px → grid uses the GUI focus_spacing, VERIFIED 96×130 in both vanilla and MD nationalfocusview.gui (Nova used a mis-measured 120 on X); one focus_spacing cell == one GRID cell on canvas (96/130), linear
npm run test:shared-focus-placement # SHARED FOCUS placement vs the wiki relative_position_id rule: a focus rel OTHER + x/y = OTHER's pos + x/y, chained recursively (wiki example A(1,2)→B(4,6)→C(3,7)); covers shared-rel-shared, dangling ref → own coords, and cycle safety. (Logic was already correct — this locks it in.)
npm run test:all  # the unit suite + UI smoke
```

## The layers (what each catches)

### 1. `npm test` → `run-tests.js`  (108 files, headless, no browser)
Auto-runs every `test-*.js` in the repo. Each is a standalone Node script that exits 0 on pass.
Covers backend logic: parsing, save/round-trip preservation, the map validator, localization,
gridbox sync, the data-safety guards, etc. **Add a test** by dropping a new `test-<thing>.js` that
exits non-zero on failure — it's picked up automatically.

Includes **`test-all-endpoints.js`** — hits every GET route (63) + a curated set of safe POST routes
against a throwaway temp mod and asserts none crash with a 500. This is the API crash-safety net.

### 2. `npm run test:ui` → `e2e-all-pages.js`  (headless Chromium via Playwright)
Loads all 10 pages (home, focus, research, events, decisions, ideas, characters, country-setup, map,
mod-health) against the in-process Express server, then:
- asserts each page loads with **no uncaught JS error** (`pageerror`),
- clicks **every safe, visible button** (twice — once on load, once after revealing the editor panel)
  and asserts no click throws.

It deliberately **skips** destructive / external / file-dialog buttons (delete, save, generate-AI,
import, upload, browse, …) so it can't corrupt anything or hang on an OS dialog. Those deep flows are
covered by `npm run test:research` and the unit suite.

### 3. `npm run test:full` → `e2e-full-mod.js`  (headless Chromium, DEEP)
Builds a real, loadable demo mod (`nova_e2e_demo` in your HOI4 mod folder) by driving the actual UI
through full create→edit→save flows in every maker, then verifying the written files on disk:
- **Country Setup** — creates country `TST`, edits details (stability/popularities), adds a spirit
- **National Spirits** — spirit with a modifier, connected to TST
- **Decisions** — decision with an effect + `available`, connected to TST
- **Events** — event with an immediate effect + option, connected to TST
- **Characters** — all 3 roles (leader/advisor/general), every general skill, traits, portrait paths +
  the real portrait-upload file-chooser, display name in localisation, recruited into TST
- **Focus Tree** — loads the tree, adds a focus, attaches a `completion_reward` effect, saves
- **Continuous Focuses** — loads the panel on the tree, adds a continuous focus, verifies on disk
- **Research** — adds a tech node (square box) and saves
- **Mod Health** — scans + rescans + runs any auto-fix

53 checks, all green. It re-creates the demo mod each run (cleaning the prior one). The map editor has
its own deep end-to-end test (`npm run test:map-edit`): it builds a temp total-conversion mod with a
real 24-bit provinces.bmp + definition.csv + states, loads map.html, drives actual canvas clicks to
move a province between states (and to empty+auto-delete a state), saves, and verifies the bytes on
disk — the render→hit-test→move→save→backend pipeline the UI smoke + all-endpoints tests don't exercise.

### 4. `npm run test:roundtrip` → `e2e-edit-roundtrip.js`  (headless Chromium)
The big-mod safety net: for ideas / decisions / events / characters it plants a pre-existing item
containing fields the maker's form does NOT model (e.g. `cancel_if_invalid`, `on_remove`, `priority`,
`show_sound`, an advisor `available`/`ai_will_do`), then via the UI selects it → edits one modeled
field → saves → asserts the edit applied AND every un-modeled field survived (no silent data loss).
Also checks editing the same item twice stays idempotent (no duplicated blocks). 25 checks, all green.
NOTE: the mod must live under the HOI4 mod folder — the ideas catalog rejects arbitrary paths by
design — so this test plants `nova_rt_test` there and cleans it each run.

### 5. `npm run test:research` → `e2e-research-test.js`  (full Electron app via Playwright)
The deep end-to-end flow: launches the real desktop app, creates a mod, builds a research tree
(custom tab, nodes, equipment, icon picker, AI generate, prerequisites, mutual-exclusion, drag-snap,
delete, save) and verifies the files written to disk. Slower; launches a real window.

## Safety

`test-all-endpoints.js` and `e2e-all-pages.js` use `createApp()` (which does **not** load your
persisted active mod) and point everything at a throwaway temp mod via `modPath` /
`localStorage.activeModPath`. They never touch Millennium Dawn or the real game files.

## Conventions
- Backend unit tests: `test-*.js`, exit 0 = pass, build a temp mod with `fs.mkdtempSync`, clean up in
  `finally`. Never write into a real mod.
- Cache-bust frontend edits by bumping the file's `?v=` token in its `.html` (`app.js` +
  `ai-field-assist.js` are unversioned and load fresh).
