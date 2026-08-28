# Changelog

## 1.0.6

The makers release. Nova gained a complete Military maker, a research tree that draws what the game draws, and two months of hardening across every editor — most of it driven by playing the mods Nova produces and reading HOI4's own `error.log`.

If you are upgrading from 1.0.5, the short version: **saving something no longer risks it.** A large share of the work below is one bug class — an editor that read part of a file, rewrote the whole thing, and quietly dropped what it did not understand. Comments, DLC gates, `@variables`, nested blocks, accented text, byte-order marks and un-modelled script now survive a round trip.

---

### ⚔️ Military — a new maker

An entire tab, built from nothing this release. It covers the parts of a mod that decide what an army actually is.

- **Division Template Designer**, rebuilt 1:1 against the in-game designer: the real support/regiment grid, the game's own placement rules, drag battalions between slots, and per-battalion stat editing.
- **Equipment & the Arsenal.** Every country's equipment variants are scanned and listed — not just your mod's. Edit any of them in place, create new equipment families, and see the real in-game art, category icons and DLC badges.
- **The modular designer**, mirroring the game's: pick a chassis, fill its module slots, save a variant. Module count-limits and duplicate rules are enforced the way the game enforces them, and the vehicle picture sits above the modules as it does in-game.
- **Custom modules** — author the guns, engines and armour parts themselves, with an in-designer editor.
- **Custom equipment upgrades** — define the XP upgrades a designer can spend on.
- **Weapon creator** — a front door for a brand-new weapon that does not make you start from an existing one.
- **Manufacturers (MIOs)** — create and edit Military Industrial Organizations in-app, with a trait tree, a mod-aware trait picker, and a "Designed by" view that shows the one company the game actually ties to a variant.
- **Companies** — a dedicated maker for designer companies, rebuilt on Nova's design system and editing the real MIO companies that appear in-game.
- **Starting forces.** Seed a country's equipment stockpile, give it a starting fleet and air force, pin designed variants to a division's starting gear (`force_equipment_variants`), set a division's starting experience and manpower, and assign a commander per division.
- **Orders of battle.** Full OOB editing, verified against 924 Millennium Dawn files, preserving top-level comments and layout.
- **The Army tool on the map** — place divisions on the map by state, and save the OOB from there.
- **Deep links both ways** — a technology's "Unlocked by" chip jumps to the Research tree, and a country's "Set up army" button jumps here.

**Fixed along the way,** across seventeen bug-hunt rounds: equipment writers that shipped a stub which deleted the vanilla file it shadowed; a blind reader that made the writer wipe a base mod's variants, stockpile and OOB references; division names where a backslash escaped its own closing quote; templates that overwrote each other when two shared a name; a save that hung the whole server; every starting stockpile Nova wrote being thrown away by the game; company bonuses HOI4 rejected as unexpected tokens; a chassis with one stat set becoming free to build and unbreakable; and a long tail of races where switching country mid-save wrote the wrong country's data.

---

### 🔬 Research tree

- **Game-accurate rendering is now the only mode.** The editor draws the tree using the mod's real `.gui` geometry — box plates, slot grids, connector routing, section labels and year rails — resolved from the mod's own fonts and sprites. Old World Blues, Road to 56 and Millennium Dawn all render clean.
- **Year label design tool** — resize the font and box, place markers freely, use unlimited markers for the same year, and apply the design to the game as real GUI labels (idempotent and reversible).
- **Section labels** — the game's own in-tree labels are shown, click to edit the text, drag to move, with a font-size editor.
- **Folder backgrounds** — see each folder's real background art, upload your own, and edit its position and scale in-game.
- **Custom research tabs** — create them, name them, drag them into order, and set their background. The editor now agrees with the game about their names and orientation.
- **Undo/redo** (Ctrl+Z / Ctrl+Y), editor-side, never touching the mod until you save.
- **A minimap and a manual canvas-size control**, matching the focus tree.
- **Hidden techs toggle** so DLC-gated and flagged technologies can be found and edited.
- **Equipment icons** shown next to the technologies that unlock them.

**Fixed:** a re-save that stamped `start_year = 1936` onto every tech that deliberately omitted it; deleting a tech taking equipment another tech still unlocked; renaming a tech breaking the weapon it unlocks and leaving the country starting without it; a tech saved into a vanilla filename deleting 88 vanilla technologies; adding a tech deleting the gridboxes of every tech added before it; typing "1%" writing a 100% research bonus; an authored `research_cost` of -1 read as 1 and then deleted; 262 invisible sprites and 4,491 unreadable technology positions; and copying a research tree collapsing 40 of its 87 techs onto one row.

---

### 🌳 Focus trees

- **Shared focuses** are parsed properly — inherited prerequisite and mutually-exclusive connector lines are drawn, and clicking one opens a read-only info card.
- **Continuous focuses** get a real icon picker instead of requiring you to know a GFX key by heart.
- **`available_if_capitulated`** is now a field you can see and set.
- **A redesigned toolbar**, clustered into groups, in the app palette.
- **The focus simulator** understands instant focuses and completes trees it previously could not.

**Fixed:** Nova could not save 67 of the 81 focus trees the game ships — it can now; a 665-focus tree that could not be saved while autosave claimed it had; every focus tree save writing each conditional twice; a tree named after a year having every one of its focuses deleted by the game; renaming a focus breaking every other file that named it; deleting a focus cleaning up only 6% of the references to it, and teleporting everything positioned relative to it; a brace inside a `#` comment making a tree and every tree after it unreachable; a comment taking a 49-focus shared branch down to one visible node; editing prerequisites turning "requires both" into "requires either"; the icon browser offering 1 of Millennium Dawn's 7,074 icons; and two clicks giving a mod two fallback trees.

---

### 📜 Events

- **All four HOI4 event windows** render pixel-exactly — newspaper, report, military leader and operative — using the mod's real `eventwindow.gui` geometry and HOI4's own bitmap fonts, with a style picker.
- **A newspaper style picker** (frame, buttons, window) that patches the mod's own GUI rather than the source's, with a backup.
- **An event info card** showing what fires an event and whether it will fire at all.
- **Per-option `ai_chance` and triggers**, `after`, `timeout_days`, and effect/trigger pickers.
- **Reliable day-one firing**, and a fire date that works with no owner set.

**Fixed:** editing a Millennium Dawn event either doing nothing or deleting it; a no-edit save wiping every comment by two separate routes, turning a quoted title into script the game cannot parse, and moving the event to another file; renaming an event creating a second one; two of the five event types being uneditable and undeletable; the picture browser offering 79 of Millennium Dawn's 2,196 pictures; an add-on's event picker offering one event out of twenty thousand; and a brace in a comment making events vanish from the maker.

---

### ⚖️ Decisions

- **The full advanced field set** — priority, custom cost, `targeted_modifier`, map highlighting, and eight more keys real content leans on that the maker previously could not author at all.
- **A "Restrict to country" picker** for country-specific decisions.
- **Category icons** can finally be chosen.
- **Effect, trigger and modifier pickers.**

**Fixed:** Save doing nothing at all, silently, for every decision that was not a mission; a save renaming a decision to a guess and blanking the tooltip the player was already reading; a brace inside a comment deleting keys from every decision in the category; renaming one leaving every `activate_decision` pointing at the old id; typing "0,5" in the Cost box deleting the value already there; and the first save in an add-on replacing the base mod's file.

---

### 🧿 National spirits & ideas

- **A HOI4 modifier picker** and scaffold chips for authoring.
- **Designers & Companies** split out into their own maker.
- **Spirit art** — national spirits draw their own picture instead of a generic shield.

**Fixed:** Nova could open vanilla's spirits but not save them; saving one erasing its picture and growing the file every time; renaming a spirit writing the name where the game never looks, and leaving every focus that granted it pointing at a dead id; importing a spirit the game already has making a duplicate; copying a base mod's spirit producing a hollow stub; the picker offering 4,815 ideas that stop The Road to 56 loading; and a spirit's name box being empty for a fifth of the base game's ideas.

---

### 🏳️ Countries & characters

- **Country Setup** shows real starting values for stability, war support and research slots, previews the country's current flag, and takes a native flag upload.
- **Characters** gain gender support, mod-aware trait pickers, custom commander (`unit_leader`) traits, and advisors that write the `idea_token` and ledger entry they need to appear in-game.
- **A "✦ NEW" marker** surfaces brand-new countries at the top of the list.

**Fixed:** naming a new country after an existing one destroying that country; a country created in Nova being unable to raise manpower or field infantry; Nova writing country history for tags the game does not know; opening a country and pressing Save rewriting the file — and, for Spain, changing who governs it; renaming a character cloning it instead, leaving two leaders for one country; opening Karl Dönitz deleting his portrait; an advisor's `@variable` cost replaced by an invented 150; and a no-op save changing a country's politics, duplicating its capital, and turning 100% into 101%.

---

### 🗺️ Map editor

- **Crash-proofing.** A seeded fuzz harness drives random map operations and checks the map stays launchable. Detection now covers the fatal classes from the wiki — a `provinces.bmp` that is not 24-bit or not a multiple of 256, state id gaps, provinces with no pixels, X-crossings, empty states, BOMs, an empty `buildings.txt`.
- **Auto-fixes** for the crashes that survived earlier passes, and a **restore-from-baseline backstop** so a broken map is always one click from launchable.
- **A hard Save gate** for errors that are certain to crash the game, with manual fix steps.
- **The Army tool** — place divisions on the map by state.

**Fixed:** saving a state you had not edited commenting out its closing brace and making the file unreadable to the game; deleting a state you had edited handing the base game's version back; renaming a state or region adding a second name instead of changing the first; a country created on the map having no name anywhere the game could read it; making a country and placing it on the map producing two separate countries; a division with no province written at province 0, where it never spawns; and two map crash paths with an unreachable fixer behind them.

---

### 🩺 Mod Health

The accuracy pass: **every firing rule was partly wrong.** False positives on Millennium Dawn dropped from 11,506 to 7,140, and on vanilla from 5,922 to 4,458 — while the rules that were silent on real breakage started speaking.

- Told Millennium Dawn 700 times that working content was broken; called 3,537 working spirits orphaned; called correctly-localised content unlocalised 4,900 times on one mod.
- Said "no problems found" about a country with no flag at all, and stayed quiet about an order of battle naming a division group nothing defines.
- **A mod called "Vanilla Plus" had its crash checks switched off entirely** — identity was inferred from the word "vanilla" appearing in the path.
- **Breaking a state file made the panel go quiet.** A file that stops parsing contributes no content to reason about, so a destroyed mod looked healthier than a working one.
- **The health verdict could stay frozen from a previous launch**, because the staleness check watched only some of the folders the scan reads.
- Six makers threw away every warning their saves returned; two buttons lied about what they would do.

---

### 🧩 Add-ons and base mods

A running theme this release: **a mod is an overlay, not a blank slate.** The game loads vanilla and every dependency underneath, and Nova now shows and respects that.

- A new mod is drawn as an overlay on vanilla rather than an empty canvas.
- **`replace_path` is honoured** wherever the game honours it — a total conversion that replaces a folder no longer has vanilla's copies offered to it. Ten further places that ignored it were fixed, plus two that never asked.
- Inherited icons, shared focus trees, research tab strips, aircraft roles and spirit definitions all resolve from the base mod rather than from vanilla.
- Add-on pickers now offer what the *game* will load, not what the mod happens to own.

---

### 🈯 Localisation

Nova can now see `localisation/<lang>/replace/`, the folder HOI4 uses to override strings. Beyond that: deleting anything strips its localisation instead of orphaning it; a `$` in a name no longer rewrites the file; legacy-encoded files survive a rename with their accents intact; and Rise of Nations no longer loses 852 keys to the alphabet.

---

### ⚡ Performance and stability

- The mod index is persisted to disk, so Home is instant on every relaunch rather than only once per session.
- The focus editor no longer pulls ~100 MB of localisation on open.
- 25 seconds of dead work was deleted from startup, along with artificial sleeps.
- **A single log line could kill the app and then keep it dead** — an `EPIPE` from a write to a closed stdout left Nova alive, listening and answering nothing.
- A single-instance lock means a second launch focuses the window you already have.

---

### 🖥️ Interface

- **Onboarding** was redesigned around one obvious front door: Create a New Mod.
- **Pickers everywhere now offer what the game loads.** Thousands of entries that the game would never load were being offered, and thousands it does load were missing — the trait picker listing 2,445 traits by raw script token, the battalion palette offering 61 battalions the game does not load, the equipment picker offering 97 things that are not equipment, the effect and trigger pickers offering 2,459 scripted names a total conversion drops.
- Every dropdown is a real scrollable list, and one of them stopped killing itself on its own scrollbar.
- A page that says "unsaved" now offers a way to save.
- **A Steam build target**, so the app is no longer shipped as an unsigned executable that runs from `%TEMP%`.

---

### 💾 A save writes what it said it wrote

Twelve places reported success while writing nothing, or writing something else. None of them announced anything: the output was valid script, so the game never complained and `error.log` stayed silent.

**Fixed:** a focus tree saved 43 KB smaller, reported as a success; the quit dialog's Save writing nothing and saying it had; removing a base-game spirit doing nothing and reporting success; changing an all-countries event's fire date writing nothing; a division saved exactly as it already was on disk and reported as saved; a save that stopped halfway leaving the rest of the file pointing at a state that never existed; a failed year write clearing its own dirty flag in silence; a failed localisation write leaving edits that described a file no longer there; `cancel_trigger` having two boxes on screen with Save reading only one; dragging a focus and then typing in its sidebar reverting the drag; a division added by hand while the Army maker was open being deleted by the next Save; **Country Setup listing national spirits its Remove could not take out** — the remove answered `ok`, wrote nothing, and nothing said why, for 535 spirits across 101 country files; and **Save Details writing Convoys, Stability, War Support and Research Slots above the dated block that overrides them**, so Millennium Dawn's Germany kept starting on 150 convoys after you typed 999 — and because the reader then preferred the new line, the editor showed 999 forever.

---

### ✍️ A save no longer edits what you didn't touch

The largest group by far. An editor that reads part of a file, rebuilds the whole thing and writes it back drops everything it has no field for — and the thing it drops most is your own writing.

**Fixed:** comments deleted by seven separate writers, including notes beside a value, notes at the end of a block, notes on a line the editor skips, and notes attached to nothing; **1,265 technology comments and 444 spirit comments that survived a save but were torn off the statement they explained** and re-attached elsewhere, measured across the six installed corpora; **a note above a key the maker doesn't model written twice, then doubling on every later save** — 1, 2, 4, 8, 16 — reproduced on vanilla's own `SOV.txt`; **a preserved note coming back on the wrong statement entirely**, once landing four levels deep inside an unrelated effect; every comment inside a division's block deleted by editing that division; **a focus save rewriting the `mutually_exclusive` section of every focus in the file** and permanently deleting the commented-out entries parked inside them, across 15,698 such blocks; a spirit that declared a section twice coming back with one copy; a no-edit character save renaming the character; a technology reading a different technology's block and saving it over its own; one trailing zero costing an equipment block every comment in it; and a save splitting a file's line endings — in every writer that never checked, and then in `/api/save`, which is where 561 of the 746 shipping focus trees are written.

---

### 👓 Readers that looked straight past what the file said

A misreading is worse than a missing feature: the editor shows you something the file does not say, and the next save makes it true.

**Fixed:** four readers that looked straight through a `#` comment, with saving making what they saw real; **the focus-tree header writer editing a commented-out `continuous_focus_position`** — the reader masked comments, the writer did not, so dragging the panel rewrote the numbers inside your own comment and the panel never moved in game; **a staged header edit silently discarded** on the 114 shipping files that use `shared_focus` containers, and always applied to the first tree in files that declare several; four Rise of Nations focus trees that could not be saved at all; saving a focus tree deleting the `CAT_` prefix from **1,818 real category names**; an idea category opening after a brace on the same line being invisible; saving a spirit moving it out of its own category when the category was capitalised; a decision written with `Cost` read as free and saved with two of everything; vanilla's `Picture` key neither seen nor preserved, then duplicated; a prerequisite check blind to a second entry on the same line, turning "requires both" into "requires either"; the Designer showing Millennium Dawn's special forces as having no support companies; `l_english:0` — a legal header — read as "not English"; saving a state putting its closing brace inside a comment so the state vanished; editing an adjacency deleting the canal rule attached to it; and two more state-writer bugs found by rechecking against 7,495 real files.

---

### 🈯 Content Nova creates is named, and renames stick

**Fixed:** **renaming equipment, a manufacturer or a research tab appended a second localisation definition** instead of editing the one your mod already had — the game read whichever file sorted first, so the rename was silently discarded and the editor's own reload still showed the old name. **Importing a national spirit whose block redirects its name** wrote the text under the idea id instead of the redirect key, so the import arrived with no name at all; 6,514 of the 48,173 idea blocks in the installed mods use such a redirect. And **new equipment families, custom commander traits, custom modules and custom upgrades were written with no localisation at all**, so they read as raw tokens in the production line, the arsenal and the division designer.

---

### 🛟 Unsaved work is actually guarded

Eighteen ways to lose work you hadn't saved yet, most of them one misplaced click.

**Fixed:** Spirits, Characters, the Event Maker and Country Setup all discarding finished work without asking; "+ Create New" replacing a written item with a blank template and asking nothing; the country dropdown discarding unsaved work; picking another country throwing away every unsaved research edit; the Decisions guard watching 38 of the editor's 42 fields; the map's state panel never wired to the Save button; the game-start country chips invisible to every unsaved-work check; the company editor sitting inside the Spirit page's guard and never talking to it; a role that could be added and then never removed without reloading; discarding an unsaved new state leaving its province moves behind; deleting an event leaving the quit dialog able to re-create it; a header edit staged on one focus tree written into the next one you opened; linking a shared focus group making the page's own Save impossible; Ctrl+S saving an editor that was not on screen; three edits reaching the mod without anyone pressing Save; and Save asking whether to discard the work it had just saved.

**Undo now covers the editor rather than part of it:** the focus tree's main editing surface was not in the undo history at all; map undo half-reverted every strategic region and supply area edit; the sidebar's × buttons and the AI button sat outside undo; and a map checkpoint walked past the rule that saving clears the undo stack.

---

### 🔒 Writing to your mod

**Fixed:** **44 writes into your own files that skipped the safe writer** — no backup, no atomic replace, and no retry when antivirus held the file open; every maker backing up the file that *defines* a thing but not the file that *names* it, so a restore brought back an item with no name; and "Restore baseline" wiping the mod's map and history folders with no confirmation.

---

### 🧪 Testing

The suite grew to **843 files**. Two things worth calling out, because they changed how the rest of this list was found:

- Every fix carries a **back-out control** — the test is run against the un-fixed code to prove it actually fails there. Several "fixes" did not survive that.
- Findings are **adversarially verified** before being believed. Historic refutation rates ran between a quarter and two thirds, so a reported bug is not a bug until it has been reproduced against the shipped code.

---


## 1.0.5

The research-tree-and-map hardening release.

### Research tree
- **1:1 fidelity** — the editor now renders any mod's existing research tree exactly as the game does. Fixed a real bug where commented-out `@variable` redefinitions (e.g. `#@1945 = 18` over the active `@1945 = 2`) leaked into the position parser and misplaced a handful of air techs. A new regression test (`test-research-fidelity.js`) asserts all of Millennium Dawn's ~916 techs land at the exact right spot.
- **Configurable year labels** — a "🔢 Year labels" toggle repeats each year along its guide line: 1 (one end), 2 (both sides), or 3–4 (evenly spaced), so the year stays readable in a tall tree. Per-mod.
- **Folder backgrounds** — a "🖼 Background" toggle shows each folder's real in-game background art, and "🖼 Set bg…" lets you upload your own picture for a folder (written into the mod + the folder's background sprite overridden, so it shows in-game too).
- **Text placer** — "📝 Add text" drops free-text labels on the tree (drag to move, double-click to edit, right-click to delete), persisted per mod. (Editor annotation; rendering the text in-game would require the mod to own a full copy of the research GUI — available as an opt-in on request.)

### Map editor
- **"Still in development" notice.** Opening the Map editor now shows a one-time-per-launch heads-up that the map tools are under active development and not yet fully tested, recommending you back up first and hold off on important work for now. (Dismissable; returns on the next launch.)
- **Hardening** — a seeded fuzz harness drives random map operations and verifies the map stays launchable after each. It found and fixed a gap where creating a state without a category could produce an invalid (un-launchable) state; new states now always get a category. Confirmed the land→sea ("make water") conversion correctly re-files new sea into its naval region. Combined with the existing per-operation Auto-fix and the live "Map Problems" panel, an editor operation can no longer silently corrupt a mod.

### Map crash-proofing
Repeated in-game stress-launches drove a deep pass on the things that make HOI4 refuse to load a map. Nova's Auto-fix and "Map Problems" panel now detect and, where safe, repair the full catalogue of detectable map errors:
- **Restore-baseline backstop** — "💾 Save baseline" snapshots a known-good map; "🛟 Restore baseline" puts it back with one click. This is the absolute "always launchable" guarantee underneath every in-place fix: if anything ever slips through, you're one click from a working map. The Restore button pulses when errors remain after Auto-fix.
- **New fatal-error detection** straight from the wiki: a provinces.bmp that isn't 24-bit or whose size isn't a multiple of 256, gaps in the definition.csv province ids, a province defined but painted out of the bitmap entirely, provinces under 8px or with pixels scattered across the map ("too-large box"), a UTF-8 BOM in adjacencies.csv (auto-stripped), and an empty buildings.txt — verified to produce **zero false positives** on real Millennium Dawn and vanilla.
- **New auto-fixes** for the crashes that survived earlier passes: invalid X-crossings in provinces.bmp, empty states (fatal, were treated as cosmetic), naval strategic regions "fractioned" by a cut-off coastal-land member, stateless land — now including isolated **islands** (homed to the nearest state) — and an empty state left behind when a country's capital is relocated off it. One "Auto-fix all" is now complete in a single pass.
- **Verified against the real game.** Launching a deliberately-corrupted Millennium Dawn and diffing HOI4's own `error.log` against Nova confirmed Nova detects every fatal map-error class the game reports — with matching province/state IDs. The comparison also caught and fixed the last detection gap: fractioned-region checking now uses the game's exact rule (a region is naval if it contains sea, and `adjacencies.csv` sea-straits count for contiguity), so Nova flags precisely what the game does.
- **Hard Save gate for guaranteed crashes.** If a Save leaves the map with an error that is *certain* to crash HOI4 (an invalid map definition, or an empty / dangling-capital state), the popup becomes a wall you can't click past — it shows plain-English "fix it yourself" steps for each one, and to keep a knowingly-broken map you must literally type the word **save**. It fires only when a crash is certain (never on the things the game logs but loads past, and never on warnings), so it's a real stop sign, not noise you learn to ignore.

### Add-ons
- Creating an add-on (a mod that depends on another, e.g. a Millennium Dawn submod) is now a clear up-front choice: the Create Mod dialog and the Home-page storyline wizard both ask **Standalone vs Add-on**, revealing a base-mod field only for add-ons.
- An add-on's inherited icons (focus, idea) and shared focus trees now resolve and position correctly from the base mod.

### Editing safety — delete now cleans up localization
Deleting an item used to leave its **localization** (the name + description text) orphaned in the `.yml` — harmless in-game, but it cluttered the mod and could leave a stale name behind. Fixed across the board: deleting a **national spirit / idea**, a **focus**, a **technology** (and its equipment), or a **continuous focus** now also strips that item's loc, in whichever loc file it lives. (Events, decisions and characters already did this.)

### Research tree
- **No more digit-leading tech IDs.** The editor accepted a technology ID starting with a number (e.g. `1infantry`), but HOI4's parser rejects an identifier that starts with a digit — saving one broke the entire technologies file. The editor now refuses it (must start with a letter or underscore) with a clear message, and the server guards it too so a bad ID can't reach disk.
- **"Hidden techs" toggle.** Marking a tech *Hidden* (`allow = always no`) made its node vanish from the canvas, recoverable only via the search box. A new 🙈/👁 **Hidden techs** toggle draws hidden (and DLC-gated) techs dimmed so you can find and edit them, without changing what saves to disk.
- **The research-screen GUI is now backed up before any edit.** Creating, syncing, or deleting a custom research folder rewrites the mod's `interface/countrytechtreeview.gui` — the file that *is* the in-game research screen. Unlike the makers, those edits were the one write path that did **not** snapshot the original first, so a bad edit could leave the research screen unrecoverable (with no original to diff or restore). Every such write now backs up first. Also fixed the backup pruner, which sorted by file mtime: because a file copy inherits the source's timestamp, a backup of a long-untouched file was "born old" and could be discarded the moment it was taken — it now orders by true creation time, so a just-made backup is never the one pruned.

### Country setup
- **Stat boxes show the country's real starting values.** Stability, War Support, and Research Slots used to sit blank for almost every country, because only a handful of countries script those values — the rest inherit the game's defaults. The boxes now fill with the country's explicit value when it has one, otherwise the *effective* default read from the active mod's defines (e.g. Millennium Dawn raises default stability to 65%), so you can actually see where a country starts. Default-filled values are shown muted (vs. a normal entry for an explicitly-set one) and are never written to the country file unless you edit them.
- **Starting-units panel collapses.** The read-only Order-of-Battle viewer (division templates, divisions, stockpile) can be very tall — 140+ divisions for a major — so it's now collapsed by default behind a one-line header; click to expand, and the choice is remembered.
- **The flag panel now previews a country's current flag.** Selecting a country shows its existing flag instead of an empty box. HOI4 flags are `.tga` (which browsers can't render and the image libraries can't decode), so Nova hand-decodes the country's `gfx/flags/<TAG>.tga` — active mod first, then the base game, falling back to an ideology variant — and serves it as a PNG. Countries with no flag yet show a "no flag yet" hint.
- **Country flag upload.** A new "🏴 Country Flag" panel sets a country's flag from a normal **PNG or JPG** — Nova writes the HOI4 `gfx/flags/<TAG>.tga` at all three sizes (82×52, 41×26, 10×7) plus the per-ideology variants, so a country you create has a real flag from game start instead of a blank placeholder. (Previously the only way was a detour through a focus's cosmetic-tag effect.)

### Accuracy — no more crying wolf
- The map validator and Mod Health's **"Will it crash?"** check stopped telling you a duplicate state id or a province-in-two-states will *"fail to load the map."* The game actually **loads past these** (first-wins — Millennium Dawn ships them and launches fine), so they're now reported accurately ("loads, but works wrong"), and the crash panel distinguishes a true crash from a load-past problem instead of flagging everything red.

### Performance
- **Faster Focus editor on big mods.** Opening the focus tree on a large mod (Millennium Dawn) transferred ~100 MB of localization on open — a field that was duplicated in the response, fetched twice. Fixed: ~3× less data, fetched once. The multi-MB Genesis script definitions (used only to prettify preview text) now load on idle instead of competing with the first render.

### Tests
- Full suite green (183/183): the research-fidelity + map crash-proofing tests, plus new regression tests for delete-localization cleanup (focus / tech / spirit / continuous focus), the digit-leading tech-ID guard, the country-flag upload, and the research-GUI backup + prune-ordering fix.
