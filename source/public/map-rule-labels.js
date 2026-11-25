"use strict";
// Friendly, human-readable names for every map-validation rule that /api/map/validate can emit
// (map-data.js validateMapModel + validateMapBitmap + the building/anchor checks). Shared by the Mod
// Health "Will it crash?" panel (browser) and a node coverage test, so a newly-added validator rule
// can't silently show its raw snake_case name in the UI. UMD: window.NovaMapRuleLabels in the browser,
// module.exports in node.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.NovaMapRuleLabels = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const LABELS = {
    // gamestate / "map won't load" class
    map_x_crossing: "Invalid X-crossing in provinces.bmp",
    river_no_source: "River drawn without a source marker",
    supply_node_bad_province: "Supply hub on a missing/sea/stateless province",
    railway_bad_province: "Railway through a missing/sea/stateless province",
    railway_jump_too_far: "Railway jumps between distant provinces",
    railway_link_not_neighbours: "Railway between provinces that do not touch",
    railway_level_out_of_range: "Railway level the game will skip or cap",
    railway_malformed_row: "Railway row the game will skip or misread",
    province_no_region: "Province in no strategic region",
    bmp_not_24bit: "provinces.bmp is not 24-bit RGB",
    bmp_bad_dimensions: "provinces.bmp dimensions not multiples of 256",
    bmp_too_big: "provinces.bmp over the pixel limit",
    bmp_size_mismatch: "Map bitmap not the size of provinces.bmp",
    bmp_not_8bit: "Map bitmap not 8-bit uncompressed",
    province_color_not_defined: "Colour painted with no definition.csv row",
    province_id_gap: "Province IDs not contiguous (definition.csv gap)",
    province_no_pixels: "Province defined but has no pixels",
    province_too_small: "Province below the game's minimum size",
    province_too_large: "Province pixels spread too far (too-large box)",
    adjacency_bom: "adjacencies.csv has a UTF-8 BOM",
    adjacency_name_encoded_twice: "adjacencies.csv names garbled by a double UTF-8 encoding",
    adjacency_through_too_far: "Strait whose “through” province is nowhere near it",
    buildings_empty: "map/buildings.txt is empty",
    // #an-empty-supply-or-railway-file-deletes-every-hub-below-it — not fatal: a map with both empty launched here
    // and started a 1936 game. The label says what the file does, because "empty" reads as "harmless".
    supply_nodes_empty: "map/supply_nodes.txt is empty — the map has no supply hubs",
    railways_empty: "map/railways.txt is empty — the map has no railways",
    duplicate_state_id: "Duplicate state id",
    duplicate_state_id_across_layers: "Duplicate state id in your mod and a layer below",
    state_id_gap: "State IDs not contiguous (gap)",
    strategic_region_id_gap: "Strategic region IDs not contiguous (gap)",
    province_in_two_states: "Province in two states",
    // #the-world-underneath-a-generated-one — not fatal: the game loads this map and plays it. It is just not the
    // world the modder built. The owner launched exactly this and reported "its still the same world".
    inherited_states_still_load: "States from the base game still loading under your map",
    // #a-replaced-map-folder-says-what-it-hides — a warning: the files the layers below ship directly in map/ that the mod's own
    // replace_path="map" hides and the mod has no copy of (B6-17). What HOI4 does without each has not been launched here.
    replaced_map_files_missing: "Map files your replace_path=\"map\" hides that your mod lacks",
    province_in_two_states_files: "Province in two state files",
    state_file_unbalanced_braces: "State file has unmatched braces",
    state_file_unreadable: "State file could not be read",
    state_province_not_in_definition: "State owns a non-existent province",
    region_province_not_in_definition: "Strategic region lists a non-existent province",
    land_not_in_state: "Land province not in any state",
    province_not_in_region: "Province not in a strategic region",
    province_in_two_regions: "Province listed in more than one strategic region",
    state_split_strategic_regions: "State split across strategic regions",
    supply_area_split_regions: "Supply area split across regions",
    state_in_two_supply_areas: "State in more than one supply area",
    supply_area_state_missing: "Supply area lists a state that doesn't exist",
    vp_not_in_state: "Victory point not in its state",
    province_building_not_in_state: "Province building in a state that doesn't own the province (ignored in-game)",
    strategic_location_not_in_state: "Strategic location on a province its state doesn't own (ignored in-game)",
    strategic_location_building_needs_coast: "Strategic location raises a coast-only building on a province with no coast (ignored in-game)",
    // state / capital class (an empty state fails the load when a game starts; a missing capital is refused)
    empty_capital_state: "Empty capital state",
    capital_state_missing: "Capital points at a missing state",
    // #a-refused-capital-is-what-two-shipping-maps-already-do — the same broken line, in a country with no land on this
    // map. It lands that country exactly where 18 countries Old World Blues and Rise of Nations already ship land: no
    // capital state at all. Both maps play, so this one is reported and does not gate Save.
    capital_state_missing_no_land: "Capital points at a missing state (country owns no land)",
    country_history_state_missing: "Country history runs an effect on a missing state",
    ai_strategy_state_missing: "AI strategy names a missing state (the whole strategy is discarded)",
    ai_strategy_state_list_missing: "AI strategy's state list names a missing state (crashes on the first AI tick)",
    script_state_missing: "A focus, decision or event acts on, reads or targets a missing state",
    // ⛔ #a-dead-state-read-is-fatal — the two shapes of that the engine reads through with no test, for a state the map below had or
    // in the mod's own files (#a-mods-own-read-of-a-state-no-layer-has)
    script_state_read_unguarded: "A focus, decision or event reads a missing state's value or gives it a dynamic modifier (crashed HOI4 in launches)",
    script_state_check_unguarded: "A focus, decision or event asks is_core_of, is_claimed_by or num_owned_neighbour_states of a missing state",
    adjacency_rule_left_on_land: "A base-game strait rule whose sea your map turned into land",
    adjacency_rule_nobody_can_hold: "A base-game strait rule whose land your map turned into water (no country can hold it)",
    adjacency_describes_another_map: "Adjacency rows written for the map below yours (walls in the sea, straits with one shore)",
    adjacency_shape_no_map_ships: "Adjacency row of a shape no shipping map has (a dried or drowned strait, a wall in the sea)",
    state_ids_below_base: "Your world has fewer states than the base game's scripts name",
    naval_region_queue_overflows: "Sea regions too tangled for HOI4's supply system (crashes on the first hour)",
    regions_ignore_the_coastline: "Strategic regions drawn for a different coastline (the air map and naval cards follow them)",
    drowned_coast_shows_through_the_sea: "The old coastline still shows through your sea as sand",
    world_textures_painted_for_another_map: "Your map's colours were painted for a different map (the air map shows the old world)",
    minimap_drawn_for_another_map: "Your minimap shows a different world",
    posteffect_boxes_placed_for_another_map: "Colour-grading boxes placed for a different map (the picture's colours switch in the wrong places)",
    models_stand_on_the_old_ground: "Buildings or unit models still at the height of the ground your map replaced",
    unit_positions_never_laid_out_for_land: "A victory point star, a station or a unit position not laid out for your land (the sea's layout on land, a default slot that leaves the star off its province, off its city or far from its station, or a province Nova cut with no positions or with them on the provinces cut off it)",
    capital_state_owned_by_other: "Capital owned by another country",
    // ⛔ #a-capital-state-keeps-a-victory-point — a warning, not fatal: the game loads it and puts the capital on the state's first province
    capital_state_has_no_victory_point: "Capital state has no victory point (the capital lands on its first province)",
    // #a-capital-set-only-by-set-capital — judged on what the start ENDS with (the line, then the start's set_capital, under every DLC):
    // a set_capital naming another country's state wrote last (reported, not gated: the game stores it and gives the country a state of
    // its own once a game is set up), or nothing named a state at all (gated, as capital_state_missing is — the same capital 0).
    no_capital_of_its_own: "Country starts on a capital it does not own (set_capital names another's state)",
    no_capital_at_all: "Country owns land but starts with no capital at all",
    empty_state_with_content: "Empty state with buildings/VP",
    empty_state: "Empty state (no provinces)",
    state_owns_no_land: "State owns provinces but no land",
    state_no_manpower: "State has no people (manpower)",
    state_no_category: "State has no category",
    unknown_state_category: "State uses an unknown category",
    state_no_name: "State has no name",
    state_no_air_base_or_rocket_site: "State has nowhere to place an air base or rocket site",
    // #a-generated-world-nobody-rules — NOT "a state with no owner", which is legal and which Old World Blues
    // ships 313 of. The whole world at once: not one state anywhere declares an owner. 0 on all six shipping
    // maps (the smallest is OWB's 1,211 owned states of 1,524).
    world_has_no_owners: "No country owns any part of this map",
    // #a-world-owner-is-a-country — a tag no common/country_tags this mod LOADS defines (replace_path honoured). Not fatal: HOI4 logs
    // "-- invalid owner tag" and the state starts unowned.
    state_owner_not_a_country: "State owned by a tag that is not a country in this mod",
    // #a-picker-offers-the-countries-that-load — a tag declared after `dynamic_tags = yes` (the base game's D01..D50). Not fatal: untested.
    state_owned_by_dynamic_tag: "State owned by a civil-war (dynamic) tag, not a country",
    state_core_not_a_country: "State cored by a tag that is not a country in this mod",
    state_buildings_exceed_slots: "State has more buildings than slots",
    // buildings.txt class
    building_wrong_state: "Building in the wrong state (ignored in-game)",
    building_not_over_land: "Building placed over water or off the map (ignored in-game)",
    building_anchor_wrong_state: "Port/harbour anchored in another state",
    coastal_no_port: "Coastal province with no port",
    coastal_province_has_no_sea: "Coastal flag disagrees with the bitmap",
    lone_sea_nobody_uses: "Sea with no other sea beside it, no harbour and no fleet",
    naval_base_non_coastal: "Naval base on a non-coastal province",
    province_building_over_max: "Province building above the most its province can hold",
    naval_base_water_is_gone: "Port pointing at land instead of sea",
    naval_base_sea_zone_invalid: "Port facing a lake or no sea",
    state_naval_building_without_coast: "Naval building in a state with no coast left",
    unitstacks_disagrees_with_province_type: "Unit positions describe the old map",
    fleet_starts_on_land_with_no_sea: "Fleet starts on land with no sea left",
    // #a-fleet-berthed-where-the-map-took-the-land-away — its sibling above covers a berth that is still LAND
    // but has lost its coast; this one covers a berth that is not land at all any more. Neither is fatal:
    // four of the eight installed maps berth a handful of fleets off land and every one of them launches.
    fleet_starts_off_land: "Fleet is berthed where the land is gone",
    division_starts_on_water: "Division starts on a province that became water",
    air_wing_state_missing: "Air wing based in a state that doesn't exist (skipped in-game)",
    // #a-script-loads-an-army-later — the same two berths, in an order of battle an event, focus or decision loads mid-game
    division_loaded_on_water: "Division a script loads later stands on water",
    fleet_loaded_on_land_with_no_sea: "Fleet a script loads later is berthed on land with no sea",
    // ⛔ #a-fleet-loaded-where-the-map-took-the-sea — the same berth, where the map below had sea at or beside it and this mod's map took it
    fleet_loaded_on_land_the_map_cut_off: "Fleet a script loads later is berthed where your map took the sea away",
    // #a-fleets-home-port-the-map-landlocked · #a-wing-the-map-sent-abroad — warnings: neither has been seen to matter in a launch
    fleet_home_port_has_no_sea: "Fleet's home port is on land with no sea left",
    air_wing_based_abroad: "Air wing based in another country's state",
    dated_naval_building_without_coast: "Naval building added on a later date to a state or province with no water",
    country_tag_after_dynamic_marker: "Country registered as a temporary civil-war tag",
    // bitmap / province-definition class
    duplicate_province_color: "Duplicate province colour",
    province_reserved_black: "Province painted reserved-black (0,0,0)",
    province_no_continent: "Land province has no continent",
    sea_province_has_continent: "Sea province assigned a continent",
    land_province_has_naval_terrain: "Land province on a sea terrain",
    province_continent_not_declared: "Province on a continent continent.txt does not declare",
    non_land_province_in_state: "Sea/lake province inside a state",
    fractioned_naval_region: "Naval region cut in two (fractioned)",
  };
  // Pretty-print a fallback for an unknown rule ("some_new_rule" -> "Some new rule") so nothing ever
  // shows raw snake_case even before its label is added here.
  function mapRuleLabel(rule) {
    if (LABELS[rule]) return LABELS[rule];
    const s = String(rule || "").trim();
    if (!s) return "Map problem";
    return s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
  }

  // ── GUARANTEED-FATAL rules ──────────────────────────────────────────────────────────────────────────
  // The subset of errors that make HOI4 unable to load or play the map AT ALL: a structurally-invalid map
  // definition (the game can't even build the map), an empty state the load stops on once a game starts, or a land-owning country
  // left with no capital (refused, and untested: FATAL_OUTCOME says so). These are what the Map editor's Save puts a HARD gate in front of — you must fix them,
  // or deliberately type the word "save" to keep a known-broken map. Deliberately EXCLUDES anything HOI4 only
  // LOGS but still loads past, and every warning. What HOI4 does with each member is not one thing — FATAL_OUTCOME below
  // says which, and the Save gate words itself from that (#the-save-gate-says-what-hoi4-does).
  // ⚠️ This once named "stateless land" among what an in-game launch tolerated. Those launches ran with --debug, the
  // switch that makes hoi4.exe load past a failed map check — see #a-map-the-game-refuses-to-load below.
  // CALIBRATED against real, launchable Millennium Dawn: a rule only belongs here if it does NOT appear in a
  // clean working map. MD ships `duplicate_state_id`, `province_in_two_states[_files]` (its <id>-restored.txt
  // stubs) and still loads — HOI4 resolves duplicate state files first-wins — so those are NOT gated; flagging
  // them would false-fire the gate on a working mod. Kept here = the unreadable-bitmap class + never-in-a-working
  // -map structural breaks (empty states, a land owner's missing capital, id gap, no-pixel province, X-crossing).
  const FATAL = new Set([
    // map definition won't load (no gamestate can be built). bmp_too_big was pushed as a WARNING while listed
    // here, so the popup and Mod Health dropped what the Save status line called a crash; it is an error since
    // 2026-09-11. #a-fatal-rule-is-always-an-error
    "bmp_not_24bit", "bmp_bad_dimensions", "bmp_too_big",
    // ⚠️ bmp_size_mismatch is deliberately NOT here. #a-map-bitmap-must-be-the-size-of-provinces-bmp
    // hoi4.exe checks it ("MAP_ERROR: Size of the world map [ … ] is not equal to the size of rivers.bmp [",
    // "Cities mask bitmap has invalid size"), and the wiki's Troubleshooting page names "the dimensions changing
    // between different bitmaps" among causes of the main-menu crash. But that same sentence names a
    // BITMAPV5HEADER as a cause too, and vanilla's own terrain.bmp is a V5 header (measured 2026-09-11) that
    // loads. So the list is not proof of a crash, none has been reproduced, and a gate needs one. An error.
    "map_x_crossing", "province_no_pixels", "state_id_gap",
    // #a-map-the-game-refuses-to-load — hoi4.exe's map check (gamestate.cpp, read with dumpbin on 1.19.2; VA 0x1401E3F70 in 1.19.4.1)
    // fails the load on a land province with no state ("MAP_ERROR: The land province … has no state."), on any province
    // with no strategic region ("… has no strategic region assigned."), and on a state spread over two regions
    // ("… belonging to different strategic areas" — the same false return as the state-id gap above). A failed check
    // records IsMapInGoodState "no" and, unless the game was launched with -debug, shows "Failed to load the map" and
    // calls abort(). The owner's launches that "loaded past" stateless land were all --debug. Each is 0 on the six
    // shipping maps, is reported only when the mod could have caused it, and Auto-fix or the province inspector fixes it.
    "land_not_in_state", "province_no_region", "state_split_strategic_regions",
    // #a-fractioned-region-is-judged-the-way-the-game-judges-it — the same map check, one call later (0x1401E6380 ->
    // 0x1401E5C80 in 1.19.4.1): a strategic region listing any sea province whose provinces do not all join up across pixel borders
    // and adjacencies.csv rows — "MAP_ERROR: Naval strategic region … is fractioned!" — fails the load too. It stayed
    // out while Nova judged the sea alone and so reported 27 provinces on Old World Blues, which loads; read the game's
    // way (land and lake members join a region too) all six shipping maps have 0. Gated on the mod having changed the
    // region files, provinces.bmp, adjacencies.csv or a province's land/sea type; Auto-fix re-homes each piece.
    "fractioned_naval_region",
    // #a-state-without-an-air-base-site-fails-the-map-load — WITHDRAWN FROM THE FATAL SET 2026-09-17. ⭐⭐⭐ THE GAME IS THE
    // ORACLE, AND IT OUTRANKS A TRACE OF THE BINARY. The trace is real and is re-read from the bytes by
    // test-a-state-without-an-air-base-site-is-not-a-refusal.js (hoi4.exe 1.19.4.1): strategicair.cpp 0x140CB6BE0 walks every state, each of
    // "MAP_ERROR: no air base site defined for state", "no rocket site …" and "no gun emplacement …" clears its ok-flag,
    // and a cleared flag calls the failed-load path (0x140CB789F -> 0x140201F90), behind the same gate as the map check
    // (0x1402055B0). Every instruction of that is still true. Its CONSEQUENCE is not: SEVEN of the owner's own launches
    // reached a 1936 game on maps carrying this and hoi4.exe never logged a word about an air base.
    //   The cleanest is nova_torture_0912, launched 2026-09-09 15:38 (crash folder hoi4_20260909_153814, one active mod,
    //   --debug). Its state 1083 is owned by FRA, owns two LAND provinces (1302, 4379), carries a victory point and 22
    //   buildings.txt rows — naval_headquarters, arms_factory, industrial_complex, supply_node — and has NEITHER an
    //   air_base row NOR a rocket_site_spawn row. map/buildings.txt is dated 14:23, before that launch. The run reached
    //   1936.01.01.12 and its error.log holds 15 lines, none of them a MAP_ERROR.
    //   Same shape in nova_torture_0913, nova_torture_0914, nova_island, nova_island2, nova_island3 (states 1082/1083),
    //   and nova_flow2_b16 on 2026-09-16 with 293 such states.
    // ⭐⭐ THE POSITIVE CONTROL: the same launcher and the same --debug produced "MAP_ERROR: The land province … has no
    // state." in error.log on 2026-09-08 and 2026-09-09 09:55 — a message raised from behind the SAME gate through the
    // same logger call with the same flag word (0x10004). So --debug neither shuts the gate nor suppresses MAP_ERROR,
    // and the gate itself was open: 0x1402055B0 returns "run" when the debug byte is set OR the active-mod count is not
    // zero, and [0x1434F83A8] is the mod list (0x1420DF660 feeds 0x1420DEE40, which the crash meta.yml writer calls for
    // its "Mods: %s" line). Every one of those launches had one active mod.
    // Every candidate gate anyone proposed is dead with it: not landless-ness (state 1083 owns two land provinces), not
    // an owner (FRA), not a controller or a country's state list (cored to FRA, with a VP). WHY the branch does not bite
    // was not established — see the report. It stays an ERROR with its Auto-fix, because 0 of the 7,523 states on the six
    // shipping maps lack either row, so it cannot cry wolf; it is simply not a refusal.
    // "state_no_air_base_or_rocket_site",   ← do not put this back without a launch that FAILS
    // #a-state-that-owns-only-water — THE OTHER HALF OF THE RULE ABOVE, and the same instruction in hoi4.exe. That rule
    // opens `if (!st.provinces.some((p) => typeOf.get(p) === "land")) continue;` (findStatesWithoutSites), so it exempts
    // every state that owns provinces and not one square of land; the engine exempts nobody. strategicair.cpp 0x140CB6BE0 (1.19.4.1)
    // walks state ids 1..N with no land filter (r15d = 1 at 0x140CB7151, `inc r15d` at 0x140CB7772), reads that state's
    // site list, and on an empty one logs "MAP_ERROR: no air base site defined for state " (0x140CB722E) and clears the
    // ok-flag at 0x140CB726A — the very flag `test r12b,r12b` 0x140CB7791 turns into `call 0x140201F90` 0x140CB789F. A
    // state that does own a site row cannot be one of these: the row's province must pass the land bit (`test
    // [prov+0D2h],1` 0x140CB72DD) and be in the state's own list, or 0x140CB7347 "… is invalid for state " clears the
    // same flag. So a landless state fails the load by whichever branch it takes, and there is no third one.
    // ⭐ MEASURED on the world the owner's flow builds (scratchpad IT-D1-airbase.js, read from disk): 1,425 states, 836
    // with land, 589 landless, 0 empty — and its map/buildings.txt names exactly the 836, so all 589 take the first
    // branch and 0 states with land are missing a row. The rule above therefore reports 0 on that world while 589 states
    // produce its own MAP_ERROR, and Nova called the world "zero fatal". 0 of the 7,523 states on the six shipping maps
    // owns no land, so no shipping map gains a gate. Save still lets the modder through by typing "save".
    //
    // 🚫🚫 WITHDRAWN 2026-09-17, BY THE GAME ITSELF. Everything above is a careful reading and it is not enough. The
    // owner launched a Nova-built world on 09-16 and reached the main menu and a 1936 game; measured on that exact
    // installed mod, nova_flow2_b16: 1,380 states, 1,087 with land, **293 OWNING ONLY WATER**, 0 empty — and his
    // error.log, all 14 lines of it, contains ZERO occurrences of "air base". Not one of those 293 produced the message
    // the disassembly says it must, and the map loaded. So the walk is not reached for these states, for a reason nobody
    // has established. ⭐⭐ THOSE CANDIDATES ARE NOW DEAD (2026-09-17): six EARLIER launches carry the same silence for
    // states that are not landless at all — nova_torture_0912's state 1083 is owned by FRA, owns two land provinces,
    // carries a victory point and 22 buildings.txt rows, and has neither site row; it launched with --debug and one
    // active mod on 2026-09-09 15:38 and reached 1936.01.01.12 with no MAP_ERROR of any kind. So it is not an owner,
    // not a controller, not a country's state list and not land: the branch does not bite for anything measured.
    // The rule stays as the ERROR it was: 589 landless states on a generated world is worth telling a modder about. Only
    // the refuses-to-load claim is gone, because a gate here would stop a Save on a map he has already played.
    // ⭐⭐⭐ THE GAME IS THE ORACLE, and it outranks a trace of the binary every time. #a-validator-must-not-cry-wolf
    // "state_owns_no_land",   ← do not put this back without a launch that FAILS
    // #a-hole-in-the-strategic-region-ids — the wiki (Strategic region modding): "skipping numbers will cause crashes".
    // hoi4.exe logs "Hole in Strategic Regions DB at ID =" for an empty slot, and the region check at 0x1401E6380 (1.19.4.1) reads
    // every slot of that table with no empty-slot test. 0 on six shipping maps; Nova's region tool always takes max+1.
    "strategic_region_id_gap",
    // #a-map-message-says-when-the-game-stops — an empty state: the map check ignores state.cpp's "no provinces in state"
    // (0x1401E4500), and strategicair's walk of every state (0x140CB6BE0; both 1.19.4.1) then finds no air base site on it and fails the
    // load when a game is started or a save is loaded. A capital on a missing state: country.cpp only refuses it, so it
    // is gated ONLY for a country that owns land — see FATAL_OUTCOME below and the split in map-data.js. A landless one
    // gets capital_state_missing_no_land, which is not here.
    // ⛔ #a-capital-set-only-by-set-capital — no_capital_of_its_own is NOT here. Read in hoi4.exe 1.19.4.1: set_capital's effect
    // (0x1403799D0) hands its id to SetCapital, which writes it before comparing the state's CONTROLLER, not its owner (0x1407590D2), so such a country starts with a
    // capital — another country's, capital_state_owned_by_other's runtime state, which shipping maps launch with; and InitData then runs
    // 0x140760C80 on every country, which gives one whose capital is missing or not its own a state of its own (0x140720380).
    // no_capital_at_all IS here, beside capital_state_missing, because it is the same runtime state: a country that owns land and whose
    // capital field was never written (no line, and no set_capital naming a state the map has — review E1/R2). 0x140760C80's re-pick
    // covers both alike and runs only once a game is set up, so it is no reason to gate one and not the other.
    "empty_state", "empty_state_with_content", "empty_capital_state", "capital_state_missing", "no_capital_at_all",
    // #a-dead-state-scope-runs-as-an-effect — the other half of "a shrunken world breaks files the mod does not own", and the
    // half that kills. A country's history file is executed as an EFFECT when a game starts; a bare `<id> = { … }` scope on a
    // state the map does not have runs against a null pointer. The owner's 2026-09-17 launch of a Nova-built 832-state world
    // died at 1936.01.01.12, EXCEPTION_ACCESS_VIOLATION, on `mov rbx,[rcx+28h]` 24 bytes into hoi4.exe 1.19.3's 0x1405576b0, under
    // history.cpp "Executing History from " → effect.cpp → effectimplementation.cpp "invalid scope". The identical world with
    // those 14 lines removed reached 1936.01.19. Not the capital rule beside it, which the engine merely refuses.
    "country_history_state_missing",
    // #a-state-list-in-an-ai-strategy-is-never-checked — the AI's list of states, which hoi4.exe reads with no check and
    // looks up on the first AI tick; a missing state comes back null and ai_general.cpp 0x111B680 reads [null+0xCC]. Two of
    // the owner's 2026-09-24 launches died there on the first in-game hour, the dumps holding Italy's and Japan's lists, and
    // the same world with only those ids removed never faulted there again — the game ran the back-out control.
    "ai_strategy_state_list_missing",
    // ⛔ #a-dead-state-read-is-fatal — a focus, decision or event reading a state this map does not have, where hoi4.exe has no test at
    // all: an explicit-id read (`910.DEN_develop_state_cost`) is the resolver's branch with no null test (0x140589BAF in 0x140589930, 1.19.4.1;
    // TEST 19, 22 and 23 died there), add/remove_dynamic_modifier — in the block or through a scripted effect — is the effect the
    // 2026-09-17 launch died in; is_core_of, is_claimed_by and num_owned_neighbour_states read their state unchecked in the disassembly.
    // A variable op in such a scope is NOT here: the same resolver tests the scope's own state (#a-variable-of-a-missing-state-is-guarded).
    // For a state the map below had, and for any in the mod's own files: an id out of range faults the same (#a-mods-own-read-of-a-state-
    // no-layer-has). A LOWER layer's file naming an id no layer had is that layer's problem and stays script_state_missing — the base
    // game ships none in these shapes. Auto-fix neutralises every one.
    "script_state_read_unguarded", "script_state_check_unguarded",
    // #a-coastless-navy-goes-to-sea — a fleet berthed on land with no sea beside it. Deferred from this set until Auto-fix
    // could repair every one (a gate with no button strands the modder); it can now — to a harbour, or to the nearest sea.
    // Eleven crashes of a Nova world named a fleet like this (6332 ten times, 9340 in TEST 21), and TEST 22 — the same world
    // with the coastless navies gone — loaded: the game ran the back-out control.
    "fleet_starts_on_land_with_no_sea",
    // ⛔ #a-fleet-loaded-where-the-map-took-the-sea — the same berth reached mid-game: load_oob tail-jumps into the game start's own
    // loader (0x1403734A0 → 0x14074B100 in 1.19.4.1) and reads the berth's port through the same unchecked [rax+0C8h] (1.19.3's 0x140D6D29A) the eleven
    // start crashes died on. Only where the MOD's map took the sea from a province the map below had at that id and colour: Old World
    // Blues shipped the shape in its own map (cartel_fuerte, 10730; by its 2026-10-28 download the berth is its coastal 2255), and
    // that shape stays fleet_loaded_on_land_with_no_sea, an error. Auto-fix
    // re-berths it, and Generate land does before it returns (#generate-land-pads-the-queue-and-re-berths-the-fleets).
    "fleet_loaded_on_land_the_map_cut_off",
    // #the-supply-queue-counts-naval-links — country_supply's naval-island queue (hoi4.exe 0x12B49E0) holds one slot per strategic
    // region and is pushed once per naval link, unchecked. TEST 25 needed 514 of 305 and crashed an hour in at 5x; TEST 26 — the
    // same world with 345 empty regions (N = 650) — played nine months. Only past the end of the pending array beside the queue,
    // the line two shipping maps sit 7-9 slots under.
    "naval_region_queue_overflows",
    // never present in a working map: an EMPTY buildings.txt crashes outright.
    "buildings_empty",
    // ⚠️ province_no_continent is deliberately NOT here any more. It sat beside buildings_empty as a "wiki-documented
    // hard crash"; the Map modding page has no such sentence — it lists "Prov 12345 has no continent" among common
    // errors, and says the game's own auto-generated definitions (a colour with no row) produce it. hoi4.exe logs
    // "prov %d has no continent" as plain text, with no MAP_ERROR prefix, three strings from a coastal-port line that
    // DOES say "This will likely crash the game". 0 shipping land rows, and 0 of the owner's saved logs, carry it —
    // so no crash was ever seen. An error, with its Auto-fix and hint, not a Save gate.
    // #a-map-message-matches-what-the-engine-checks
    // Reproduced by the owner: twelve of these crashed HOI4 one second after the main menu, access
    // violation, nothing in error.log. Zero in 17,187 shipping rows, so gating a Save on it cannot
    // false-fire on working content. #a-port-whose-water-became-land
    "naval_base_water_is_gone",
    // ⛔ #a-refused-dockyard-is-not-a-save-gate — state_naval_building_without_coast WITHDRAWN FROM THE FATAL SET 2026-11-19 (tool campaign
    // B1-31). A dockyard in a state whose last coastal province an edit elsewhere took away: HOI4 refuses the building ("Trying to set
    // invalid state building") and it never appears. It came here as the owner's island crash, but that launch's divide-by-zero is the
    // flag atlas (hoi4.exe 1.19.2 0x14122BA06, graphics/flagtextureatlas.cpp — country_tag_after_dynamic_marker, below) and struck the
    // same instruction in a launch with no refused building at all. The engine's own path is a log and the next entry (1.19.4.1:
    // statehistory.cpp 0x14163D5C0 logs and moves on, the slot lookup refuses a coastal-only type before it allocates one, SetLevel's
    // landlocked-port test is an assert gated off in a normal launch — test-a-naval-base-the-game-refuses-is-a-warning-and-a-landlocked-
    // dockyard-claims-no-crash.js), and no recorded crash names it: precautionary only, and a Save gate that Auto-fix cannot clear when
    // the country has no other coast left a FATAL no Map tool could take away (raise land in front of all of POL's ports). It stays an
    // ERROR with its Auto-fix, which still carries the dockyards to a coast it can find. 0 across six shipping maps.
    // "state_naval_building_without_coast",   ← do not put this back without a launch that crashes on it
    // A country registered after zz_dynamic_countries.txt is a throwaway civil-war tag, and HOI4 dies
    // building its flag atlas the instant the menu paints, with nothing in error.log. No shipping mod
    // does it. #a-country-after-dynamic-tags-is-not-a-country
    "country_tag_after_dynamic_marker",

  ]);
  // Plain-English "fix it yourself" steps shown in the Save gate for each fatal rule.
  const FIX_HINTS = {
    bmp_not_24bit: "Re-export map/provinces.bmp as 24-bit RGB (no alpha channel) in your image editor, then Save again.",
    bmp_bad_dimensions: "Resize map/provinces.bmp so BOTH its width and height are exact multiples of 256, keeping every province colour — and resize heightmap.bmp, terrain.bmp, rivers.bmp and cities.bmp to exactly the same size (copy any your mod inherits into its map/ folder first), so that they still match it. world_normal.bmp goes with them, at exactly HALF the new width and height — that is the size HOI4 reads it at, and every shipping map keeps it there.",
    bmp_too_big: "Reduce map/provinces.bmp below HOI4's limit of about 13.2 million pixels (13,238,272) by shrinking the canvas — and shrink heightmap.bmp, terrain.bmp, rivers.bmp and cities.bmp to the same size, and world_normal.bmp to exactly half of it.",
    // Not fatal (see the FATAL set): the engine checks the sizes, but no crash from a mismatch has been reproduced.
    bmp_size_mismatch: "heightmap.bmp, terrain.bmp, rivers.bmp and cities.bmp must each be exactly the width and height of map/provinces.bmp, and world_normal.bmp exactly half of it in both axes. Copy the listed ones into your mod's map/ folder and resize each to the size the message names — the four the same, world_normal.bmp the half — or put provinces.bmp back to their size.",
    // Not fatal — the wiki specifies the format and the engine logs it, but no source names a crash for it.
    bmp_not_8bit: "Re-export the listed bitmap as an 8-bit BMP (256-colour indexed, or greyscale for heightmap.bmp) with no compression, at the same size as map/provinces.bmp.",
    // Not fatal — the consequence is documented (HOI4 invents a land province with no continent), a crash is not.
    province_color_not_defined: "Add a row to map/definition.csv for each listed colour (id;r;g;b;type;coastal;terrain;continent, using the next free id), or repaint those pixels in provinces.bmp with the colour of a province that already has a row. While a row is missing HOI4 writes a corrected copy, map/definition.csv.fixed, into its user directory; the wiki notes you may need to delete that copy once your own file is fixed.",
    map_x_crossing: "Four provinces meet at one pixel-corner. Click “Auto-fix all” (it recolours one pixel), or in an image editor nudge the boundary at the listed coords so no 2×2 block has four different provinces.",
    province_no_pixels: "The listed province id has a definition.csv row but NO pixels in provinces.bmp. Either paint pixels with its colour, or delete its definition.csv row AND remove it from every state.",
    province_no_region: "Every province — land, sea and lake — must be listed in exactly one map/strategicregions file, or HOI4 will not load the map (unless started with -debug it stops with “Failed to load the map”). Click “Auto-fix all” to put a land or lake province of a state your mod ships into the region the rest of that state is in. Place any other province by hand: select it and pick a region in the province inspector's “Strat. region” dropdown.",
    // Warnings, not fatal: hoi4.exe logs both and loads on — the later listing overrides the first, and an invalid entry is skipped.
    province_in_two_regions: "Each province belongs in exactly one strategic region. Delete the extra listing from the provinces = { } list of all but one region in map/strategicregions; for a repeat inside one region, delete the repeated id. For a province that belongs to a state, “Auto-fix all” keeps it in its state's region and removes it from the others.",
    region_province_not_in_definition: "A strategic region's provinces = { } list names an id that map/definition.csv does not define, and HOI4 skips it. Remove that id from the region's file in map/strategicregions, or add the province's row back to map/definition.csv if it was deleted by mistake.",
    state_id_gap: "State ids must run 1…max with none skipped. “Auto-fix all” moves the highest-numbered state into each missing id, as long as that state is one your mod defines; a gap under a state from the base game or a dependency has to be filled by hand — give one of your own states the missing id (its id = line, its file name and the references to it).",
    strategic_region_id_gap: "Strategic region ids must run 1…max with none skipped. Renumber the highest-numbered region into the gap by hand: change its id = line in its map/strategicregions file (and the number in the file name), then change the first column of that region's rows in map/weatherpositions.txt to the new id. Nova does not renumber regions itself, because other files can refer to a region by its id.",
    state_split_strategic_regions: "All of a state's provinces must sit in one strategic region, or HOI4 will not load the map. Click “Auto-fix all” to move each split state's provinces into the region most of them are already in, or select each stray province and pick its state's region in the province inspector's “Strat. region” dropdown.",
    fractioned_naval_region: "A strategic region that holds any sea must be one connected piece — each of its provinces, land and lake included, reaching the others across a pixel border or an adjacencies.csv row — or HOI4 will not load the map (unless started with -debug it stops with “Failed to load the map”). Click “Auto-fix all” to move each cut-off piece into a neighbouring region, together with the rest of any state it belongs to — or, where no neighbouring region can take that whole state, to carve the piece out into a state of its own (keeping the owner, controller, cores and claims of the state it came from) and move that. The one state it will not carve is one your mod does not ship, because cutting that in two would copy a lower layer's file into your mod: move that province into a state of the region it touches (or give it a state of its own) and pick that region in the province inspector's “Strat. region” dropdown, or join it to its region with an adjacencies.csv row.",
    // ⛔ #an-empty-inherited-state-is-told-a-step-it-can-take (final round, L1) — no Map tool gives an empty state a province (the Move tool needs a
    // province of the destination), and one the mod inherits cannot be deleted (deleteState refuses it, so Auto-fix leaves it): the three empty
    // rows say so, as their messages do (map-data.js emptyInheritedStateSteps).
    empty_state: "The listed state owns no provinces, and no Map tool gives an empty state a province. If your mod defines it, “Auto-fix all” deletes it. One from the base game or a dependency cannot be deleted — your copy would just stop overriding and the original would come back — so give it a province back: with 🛟 Restore baseline to a baseline saved before it was emptied, or by hand in its history/states file.",
    state_owns_no_land: "The listed states own provinces, but every one of them is sea or lake — so the state has nowhere to put the air base and rocket site positions HOI4 looks for on a state's own land, exactly as an empty state has nowhere. This is what drowning a state's last land leaves behind: paint land back into one of its provinces in the terrain editor, move a land province into it, or delete the state.",
    empty_state_with_content: "The listed state has buildings/victory-points but no provinces. Give it a province, or delete the state (its buildings reference provinces it no longer owns). One from the base game or a dependency cannot be deleted — your copy would just stop overriding and the original would come back — so give it a province back: with 🛟 Restore baseline to a baseline saved before it was emptied, or by hand in its history/states file.",
    empty_capital_state: "The listed state is a country's capital but owns no land. Give it a province, set that country's capital (history/countries) to a state it actually owns, or delete the state and that capital line. One from the base game or a dependency cannot be deleted, and stays empty with another capital — your copy would just stop overriding and the original would come back — so give it a province back: with 🛟 Restore baseline to a baseline saved before it was emptied, or by hand in its history/states file.",
    capital_state_missing: "A country that owns land has capital = N pointing at a state that doesn't exist. HOI4 refuses that capital and the map still loads, but the country then has no capital state. None of the six shipping maps Nova has measured has a country like that and nobody has launched a game with one, so what the game does next is unknown, and Save stops for it. Click “Auto-fix all” to move the capital onto the country's own most important state: the one with its highest victory point. Or set it yourself in history/countries.",
    no_capital_of_its_own: "A country that owns land runs a set_capital at the start — with or without some DLC, or below its capital = N line — naming a state it does not own (vanilla's China sets its capital only that way). HOI4's set_capital makes that state its capital anyway and logs it; once a game is set up it hands the country one of its own states instead. Click “Auto-fix all” to write a capital line naming the country's most important state and point at it each set_capital at its start that would override that line — one that runs whatever the DLC, and one naming a state the country does not own; one naming a state of its own under a DLC or another condition is your alternative for that case, and is left. For a file your mod does not ship, that copies the base game's file in first. Or give it back the state its set_capital names.",
    no_capital_at_all: "A country that owns land starts with no capital at all: it has no capital = N line, and nothing at its start names a state this map has — no set_capital, one only some DLC runs, or one naming a missing state. That is the state capital_state_missing leaves a country in. Click “Auto-fix all” to write a capital line naming the country's most important state, and point at it any set_capital at its start naming a state the country does not own — for a file your mod does not ship, that copies the base game's file in first. Or write a capital = N line yourself in history/countries.",
    capital_state_has_no_victory_point: "A country's capital state has no victory point. HOI4 stands a capital on the best victory point of its capital state, and with none it takes the state's first province; Map Errors lists one only where that province is not where the capital belongs — on the state's supply hub, else on a province a railway runs through, else on its town province. The game loads it. Click “Auto-fix all” to give each such state one victory point there, worth what a state of its category has in the layer below; or add one yourself in the state panel.",
    capital_state_missing_no_land: "A country whose capital = N points at a state that doesn't exist, and which owns no land on this map. HOI4 refuses the capital and the country runs without one — which is where the 18 countries Old World Blues and Rise of Nations ship with no capital line at all already sit, on maps that load and play. Nova reports it and neither gates Save nor repairs it: with no land there is no state of its own to point at, and copying a country file you do not own into your mod would freeze the rest of that country's history at this build of the layer below. To clear it on the map, give the country a state with 🖌 Paint owner, then click that state with 🏛 Set capital; or edit the line yourself.",
    country_history_state_missing: "A history/countries file runs an effect on a state this map does not have — a bare “971 = { … }” block, which is how HOI4 script says “do this to state 971”. The file is executed as an effect the moment a game starts, so the game reaches it every time and faults. Click “Auto-fix all” to take out exactly those blocks — for a file your mod does not ship, that means copying the base game's file into your mod first, which hands you the rest of that country's history frozen at this build of the game, so Nova names every file before it copies one. Otherwise delete the blocks yourself, or give your world a state with that id.",
    lone_sea_nobody_uses: "A sea of one province with no other sea beside it, no adjacencies.csv row to one, no harbour facing it and no fleet in it. No ship can reach it. No shipping map has one, so nobody has launched one, and what the game does with it is unknown. Auto-fix makes it land, on the ground of the land beside it, and says so — or, where it was a lake (the map below has a lake there, or its own row is on lakes terrain), that lake again; to keep it sea, give it a harbour or a way through.",
    fleet_starts_off_land: "A task force starts in a province that used to be land and is now sea. HOI4 loads a fleet at sea without complaint — a few shipping maps start ships at sea on purpose — so this is untidy rather than dangerous: the fleet begins the game adrift instead of in port. Click “Auto-fix all” to re-berth the ones whose country still owns a province with a harbour, at the nearest one; nothing is deleted and no port is invented. For a file your mod does not ship, that means copying it in first, which hands you that country's whole order of battle frozen at this build of the game — so Nova names every file before it copies one.",
    fleet_starts_on_land_with_no_sea: "A task force is berthed on a land province that no longer touches any sea — usually because ocean next to the port was turned into land. HOI4 has crashed while loading on every fleet like this so far: it asks which sea the port opens onto, gets nothing back, and reads through the nothing. Eleven crashes of a Nova-built world named a fleet exactly like this — Germany's Baltic fleet at Königsberg ten times, Latvia's at Riga once — while fleets at sea loaded fine beside them. Click “Auto-fix all” to re-berth them: at the nearest harbour their country still owns, or — for a country with no coastline left at all — at the nearest sea, with its home base, which loads (Rise of Nations starts Austria-Hungary's Qingdao fleet that way). Nothing is deleted and no port is invented. For a file your mod does not ship that means copying it in first, so Nova names every file it copies.",
    division_starts_on_water: "A division's starting location is a province that is now sea or lake. HOI4 loads it anyway — its unit loader tests only whether a location is a province id, never whether that province is land — so the division spawns on the water and the game carries on. It is still worth clearing: no shipping map starts anything of this size on water (the worst of the nine measured is Rise of Nations, 23 of 41,289), and the AI plans its fronts out of where the divisions are. Click “Auto-fix all” to move them to the nearest land their own country owns, spread no thicker than the file's own army stands in the base game — nothing is deleted. For a file your mod does not ship that means copying it in first, because a history/units file replaces the one below it whole: it hands you that country's entire army frozen at this build of the game, so Nova names every file it copies.",
    // #a-script-loads-an-army-later — neither of these two is fatal: the mid-game path has not been seen in a launch (the berth the
    // mod's map cut off, below them, is — on the loader it shares with the game start).
    division_loaded_on_water: "An order of battle that an event, focus or decision loads mid-game (load_oob) puts a division on a province that is now sea or lake. The loader places it where its location says without a land test, so the army appears on the water when the script runs. Click “Auto-fix all” to move each one to the nearest land of the country that held that province in the world your map replaced — that is where the base game put it, for all of its own loaded divisions — spread no thicker than the file's own army stands; nothing is deleted. A division whose country there owns no land on your map is left and counted. For a file your mod does not ship that means copying it in first, so Nova names every file it copies.",
    fleet_loaded_on_land_with_no_sea: "An order of battle that an event, focus or decision loads mid-game berths a fleet on a land province that touches no sea, and that province is your map's own — not the province the map below yours has at that id — so the shape is your mod's to answer for (Old World Blues ships one). A fleet STARTED on a berth like this has crashed HOI4 while loading every time so far; this one is spawned later by a script, and that path has not been seen in a launch, so it is reported as an error without stopping Save. Click “Auto-fix all” to re-berth it at the nearest harbour of the country that holds the berth now, or at the nearest sea if that country has no coast left — the task force and its fleet's home base both. Nothing is deleted and no port is invented.",
    // #a-fleet-loaded-where-the-map-took-the-sea — FATAL: the berth had sea in the map below and this mod's map took it away
    fleet_loaded_on_land_the_map_cut_off: "An order of battle that an event, focus or decision loads mid-game (load_oob) berths a fleet on a province the map below yours has with sea at it or beside it — and your map took that sea away, so the berth is land with no sea now. The base game's own example is the destroyers-for-bases deal: events/USA.txt loads Canada's destroyers at Halifax (7361). load_oob hands the file to the very loader the game start uses, and a fleet STARTED on a berth like this has crashed HOI4 while loading every time so far — so Save stops for it, although no launch has yet fired one mid-game. Click “Auto-fix all” to re-berth it at the nearest harbour of the country that holds the berth now, or at the nearest sea if that country has no coast left — the task force and its fleet's home base both. Nothing is deleted and no port is invented. For a file your mod does not ship that means copying it in first, so Nova names every file it copies. 🌍 Generate land does this itself before it returns.",
    // #a-fleets-home-port-the-map-landlocked · #a-wing-the-map-sent-abroad — warnings: the base game's shape, not a crash
    fleet_home_port_has_no_sea: "A fleet's home port (its naval_base) is a land province that no longer touches any sea — usually because the coast beside it was turned into land — while its task forces may already sit in a real port. No crash has been tied to a home port: every crash of this kind named a task force's location, and a Nova-built world started a game with one. The base game and the shipping maps measured base every fleet they start on a coast. Click “Auto-fix all” to move it to the nearest harbour its own country owns; a country with no harbour keeps it. For a file your mod does not ship that means copying it in first, so Nova names every file it copies.",
    air_wing_based_abroad: "History/units places an air wing by STATE ID, and your world gives that id to another country's state — either your states handed the same land to someone else, or the id now names a different place. HOI4 loads it without a word, so this is a warning, but the base game starts its wings in their own country's states (a few in a subject's), and a wing based abroad starts the game flying from somebody else's airfield. Click “Auto-fix all” to key each one to the nearest state its own country owns with an air base and room for its planes, nearest to where the file meant it; no air base is invented and no wing is deleted. For a file your mod does not ship that means copying it in first, so Nova names every file it copies.",
    naval_region_queue_overflows: "HOI4's supply system keeps a list with one slot per strategic region while it works out which of a country's sea regions connect, adds a region once for every sea link into it, and never checks the list is full. A map whose sea regions are much more tangled than vanilla's — usually because sea was made where land used to be without moving it out of its land region — overflows it, and a Nova world crashed exactly that way an hour into its first game; the same world with the list made longer played nine months. Click “Auto-fix all” to add empty strategic regions, which makes the list long enough without moving anything on your map. The lasting fix is sea regions that are only sea.",
    state_ids_below_base: "Your world replaces the base game's states but still loads its focuses, decisions, events and AI plans, and those name states by id — up to 1,081 in the base game. Every id your world doesn't have is a reference to nothing: most are lines HOI4 logs and skips, and the missing-state crashes a Nova world hit in its launch tests were references like these. Nova only raises this when something that loads actually names a missing id, and only splits up to the highest one named. Six of the seven shipping map mods installed here keep every base-game id for exactly this reason. Click “Auto-fix all” to split your largest states until every id exists; each new state keeps its parent's owner, cores and claims, and its land keeps its own victory points and harbours. The alternative is to replace the base game's focus, decision and event folders with your own, as total conversions do.",
    regions_ignore_the_coastline: "Your strategic regions were drawn for another world's coastline — usually because land and sea were made where the other kind used to be, and every province stayed in the region it had. The game loads and plays it (a Nova world played nine months like this), but the air map mode draws these regions, so it shows the old world over your land; naval dominance and weather are reported per region, so a sea inside a land region has neither; and a lake the ocean now surrounds still is not a sea. Click “🗺 Redraw regions” on the map toolbar: it shows its plan first, then draws land regions from whole states, sea regions from the sea, and turns a lake the sea rings into sea. It is not part of Auto-fix, because it replaces every region your mod has.",
    minimap_drawn_for_another_map: "The minimap tab is one small picture, gfx/minimap/minimap.dds, drawn for one map. Your mod reshaped land and sea but still uses the minimap of the map below it, so the minimap shows the old world's continents. The game loads and plays it. “Auto-fix all” repaints it where land and sea changed, in the minimap's own paper colours, and your mod gets its own copy; Nova keeps it in step from then on whenever it moves land or sea.",
    posteffect_boxes_placed_for_another_map: "HOI4 grades the colours of the whole picture by where the camera is. gfx/posteffect_volumes.txt places boxes on the map for that — the base game has a green one over Brazil's jungle, a warm one over the Sahara, deep blue ones over the open oceans — each made for the ground of one map. Your mod reshaped the ground under some of them, so moving the camera there switches to colours made for land or sea that is not there any more. The game loads and plays it. “Auto-fix all” takes out only the boxes whose ground changed, each with the comment above it; the boxes still over their own ground and the camera-height layers stay, and your mod gets its own copy of the file. Run it again after you reshape the map.",
    world_textures_painted_for_another_map: "HOI4 tints the whole world with five pictures in map/terrain — the ground colour (its alpha is the city lights at night), three water tints and the fog. Each is a picture of one map. Your mod reshaped land and sea but still uses the pictures of the map below it, so the old world's continents are painted over yours: zoomed out, where the air map is read, you see them with pieces missing, and cities light up at sea. The game loads and plays it. “Auto-fix all” repaints the pictures where the ground changed, with the colours the map below uses for the same terrain at the same latitude, and your mod gets its own copy of the five files. Nova keeps them in step from then on whenever it moves land or sea.",
    models_stand_on_the_old_ground: "map/buildings.txt and map/unitstacks.txt store a height for every building and unit model they place, and every shipping map stores the height of the ground under it. Where your map moved the ground — land made sea, sea made land, a hill levelled — these rows still carry the height the map below yours gives them, so they are set above your new seas or inside your new land. A world made with an older Nova also has buildings left at the sea floor's 9.50, where they were placed before the land under them was raised. The game loads and plays it. “Auto-fix all” stands the rows in a file your mod owns on the ground it has now, rewriting only their height; a row whose height you set yourself is never touched, nor a row of the map below's standing where your map left the ground as it was, and one the map below set more than 1 off its own ground is moved only where your map took that ground across the waterline or moved it by more than 1. A file your mod does not own is left alone: copying all of it in only to change heights would stop it following the file below. To have its rows moved now, copy that file into your mod's map folder yourself and click “Auto-fix all”; otherwise they are moved the first time Auto-fix copies it in for a repair of its own.",
    unit_positions_never_laid_out_for_land: "map/unitstacks.txt gives every province the places its unit counters are drawn. HOI4 draws a victory point's star at the province's type 38 position, and its supply hub's icon and railway junction at its type 0, the position a division stands on. Your mod's copy still has, for these provinces, the positions the map below yours wrote: for a province that was sea there, the places a fleet is drawn; for a victory point you put on land that had none, the slot every province is left by default, where that slot stands off the province, off the ground the province's city is drawn on, or farther from the station than the map below leaves its own stars (a star left there that stands as its own do is not reported). So the star, the station and the town stand apart. A province Nova cut out of a raised ocean province may have no position at all, and the province it was cut from its positions on the provinces cut off it; and a province laid out as land may have a harbour and no place for the ships in it. The game loads and plays it. “Auto-fix all” lays a former sea province, and a province Nova cut, out as the map below lays out its own land: its standing position where its supply hub is placed (its supply_node position in map/buildings.txt; near the middle of the province when it has none, or more than one), every other position as far from it as the map below puts its own land's, the ships in a harbour on the harbour, and the positions only a sea uses removed; and it puts each star beside the standing position, as far from it as the map below puts its own. It rewrites only those provinces' rows, and never a row you placed yourself. To place one by hand, move it in the game's nudge tool, or edit the x and z of the province's rows.",
    drowned_coast_shows_through_the_sea: "Land your map turned into sea kept the base game's beach height, and HOI4 draws water see-through from a height of 92 up, so the old coastline shows through as thin sandy lines and small ownerless “islands” along the sea's province borders. The game loads and plays it. “Auto-fix all” lowers those pixels to the sea floor and repaints the ground under them; it only touches pixels still exactly as the drowning left them, so a sea floor you shaped yourself is left alone. Worlds made with this version of Nova do not get it.",
    adjacency_rule_left_on_land: "A strait or canal rule from the base game — Gibraltar, Panama, the Danish straits — governs sea zones that your map has turned into land, so none of its crossing rows joins water to water any more. The game still loads the rule, so it draws the strait's icon where the sea was and its settings for who may cross (enemy armies may not, for Gibraltar) now apply to a crossing that is no strait. Rules that join land on purpose — portals, anomalies, a mod's own — are not this: only a rule the layer below defines over water is reported, and only where its sea is land now. Click “Auto-fix all” to comment the rule out of map/adjacency_rules.txt and take its name off its rows in map/adjacencies.csv; the rows keep their connection.",
    // #a-strait-nobody-can-hold — the mirror: the rule's land drowned. Not fatal; the game loads it.
    adjacency_rule_nobody_can_hold: "A strait or canal rule from the base game — Suez, the Bosphorus, the Dardanelles — is decided by who controls the provinces it lists as required, and your map has turned every one of them into sea or lake, so no country can control them. The rules file's own header says that when no controller of those provinces is at war with or allied to a country, the neutral rule is used — so every country gets the neutral settings, for good, and for the Bosphorus, the Dardanelles, Panama and Kiel those let no army, navy or submarine through. Rules a mod adds itself are not this, nor a rule with any of its land left. A rule whose neutral settings let everything through and that carries no trigger of its own (Otranto's) is then as open as no rule at all, and all that is left of it is its icon: it is reported only where Auto-fix need not copy the base game's files into your mod for it. Click “Auto-fix all” to comment the rule out of map/adjacency_rules.txt and take its name off its rows in map/adjacencies.csv; the rows keep their connection as plain links.",
    // #a-row-written-for-the-map-below — not fatal: TEST 31 loaded and played with every one of them.
    adjacency_describes_another_map: "map/adjacencies.csv describes each crossing with a type read together with the types of the provinces it names, and these rows were written for the map below yours: an impassable border now standing in the sea, a strait whose shores are both sea now, a strait left with one shore, or a crossing whose sea is land now. Of the eight installed maps that draw their own, none has a wall with a sea end and two share one strait with one shore. “Auto-fix all” retypes each to what your map now says — a wall in the sea is opened where the pixels already join the two provinces, a drowned strait becomes a sea link, a strait with one shore becomes a plain border where the two touch and a link nobody crosses where they do not — and never removes a row, because every row is an edge HOI4 counts when it checks a sea region is one piece. Only rows the layer below wrote as they stand are retyped: a row you wrote or changed yourself is left as it is.",
    script_state_missing: "A focus, decision, event or scripted effect touches a state this map does not have: it acts on it (910 = { add_core_of = ROOT } — add_core_of looks the state up and does nothing, but not every effect has been traced), lists it as a target of a targeted decision, or — in a file your mod does not ship, naming a state the map below yours never had either — reads a value off it or asks is_core_of, is_claimed_by or num_owned_neighbour_states of it. (Those reads and checks on a state the map below had, or in your mod's own files, are script_state_read_unguarded and script_state_check_unguarded, which stop Save.) Most references to a missing state are harmless — the game looks, finds nothing, logs it and answers no — and Nova leaves those alone, a variable of a missing state among them: the game checks the state for those. Click “Auto-fix all” to neutralise exactly these: an action on a missing state is commented out, a condition on one becomes always = no, a value read off one counts as 0, and a targeted decision loses the missing states from its list. For files your mod does not ship that means copying them in first, frozen at this build of the game, and Nova names every one. The other way out is to give your world back those state ids — every shipping map but one keeps all of the base game's.",
    // #a-dead-state-read-is-fatal — FATAL: the two shapes the engine reads through with no test, for a state the map below had or in the
    // mod's own files (#a-mods-own-read-of-a-state-no-layer-has)
    script_state_read_unguarded: "A focus, decision, event or scripted effect reads a state this map does not have — one the map below yours has, or any state at all in your mod's own files — through a path HOI4 never checks: a value read off it by id (910.DEN_develop_state_cost — a Nova world crashed on exactly this in three launches, on the first in-game hour), or a dynamic modifier put on it or taken off it, in the block or by a scripted effect it calls (910 = { add_dynamic_modifier = { … } } — what crashed a Nova world's country history at game start; the same world without those lines played on). Save stops for it. Click “Auto-fix all” to neutralise exactly these: a value read off a missing state counts as 0, a condition reading one becomes always = no, and an action on one is commented out. For files your mod does not ship that means copying them in first, frozen at this build of the game, and Nova names every one. The other way out is to give your world back those state ids.",
    script_state_check_unguarded: "A focus, decision, event, scripted trigger or scripted effect asks is_core_of, is_claimed_by or num_owned_neighbour_states of a state this map does not have — one the map below yours has, or any in your mod's own files — inside a block like 886 = { is_core_of = ETH }. hoi4.exe's own code reads the state for those three without checking it is there, so Save stops for it, though no launch has yet fired one. A variable of a missing state is not this: the game checks the state for those and answers no. Click “Auto-fix all” to turn each such condition into always = no, keeping the original below it as a comment (a block that acts on the state, with the condition inside it, is commented out whole). For files your mod does not ship that means copying them in first, frozen at this build of the game, and Nova names every one. The other way out is to give your world back those state ids.",
    ai_strategy_state_list_missing: "An ai_strategy's states = { … } list names a state this map does not have. Unlike a single state = N, which HOI4 checks and logs, a list is loaded without any check and the AI looks each state up the first time it plans — for a state that is not there it gets nothing back and reads through the nothing. A Nova world with these crashed on the first in-game hour in two launches, and the same world with only these ids removed never crashed there again. Click “Auto-fix all” to take the missing ids out of each list; a strategy whose list names no state this map has is commented out whole, having nothing left to act on. For a file your mod does not ship that means copying it in first, so Nova names every file before it copies one.",
    ai_strategy_state_missing: "An ai_strategy = { … } block aims at a state this map does not have. HOI4 logs “invalid state id N”, abandons the whole block, and plays on — so this is not a crash and Save does not stop for it; what is lost is the strategy, and the AI plays without it. It is still worth clearing: every total conversion that rebuilds the world takes ownership of common/ai_strategy, and the five installed here leave no reference like this between them. Click “Auto-fix all” to comment out exactly those blocks, which is what the game already does with them — for a file your mod does not ship that means copying the base game's file in first, so Nova names every file before it copies one. Otherwise point each strategy at a state this map has, or give your world a state with that id.",
    // Not fatal: HOI4 logs the disagreement and plays the bitmap's answer. #a-map-message-matches-what-the-engine-checks
    coastal_province_has_no_sea: "definition.csv's coastal column disagrees with the bitmap for these land provinces — some say coastal with no sea beside them (usually because ocean nearby was turned into land), or touch sea and say they are not (because land nearby was turned into ocean). The column is derived from the map, not authored: click “Auto-fix all” to recompute it.",
    country_tag_after_dynamic_marker: "A country is registered in a common/country_tags file that the game reads AFTER zz_dynamic_countries.txt, so it is treated as a throwaway civil-war tag and never gets a flag — which crashes HOI4 as the main menu paints. Rename that file so it sorts before “zz”; making the country again in Nova migrates it for you.",
    state_naval_building_without_coast: "A state still has a dockyard but no province in it touches sea any more — usually because ocean was turned into land somewhere else, landlocking it. HOI4 refuses the building, logs it and plays on as if it were not there, so Save does not stop for it. Give the state a coastline back, or click “Auto-fix all”: it gives the state land beside it that touches the sea and belongs to no state, else moves the dockyards to the nearest coastal state of the same country. It deletes none: when that country has no other coast they stay, and the game ignores them — take them out with the state panel's Dockyard field if you do not want them in the file.",
    naval_base_water_is_gone: "A naval base in map/buildings.txt points at a province that is now LAND — its 7th column must be the SEA the ships lie in. You turned that water into land, so the port has nowhere to spawn. Click “Auto-fix all” to remove the stranded port(s), or give them a sea province to face.",
    // Not fatal: hoi4.exe's loader logs "port building has a lake as sea zone" / "invalid sea zone", and no crash from one has
    // been reproduced. 0 of 17,187 shipping port rows face anything but a sea. #a-port-whose-sea-is-not-a-sea
    naval_base_sea_zone_invalid: "A port row in map/buildings.txt must name, in its 7th column, the SEA province its ships go out into. These name a lake, a province id definition.csv does not have, or nothing — most often because the water beside the port was turned into a lake. Click “Auto-fix all” to remove them (a coast that still touches the sea is given a port that faces it), or change that column to the id of a sea province next to the port.",
    // Not fatal: hoi4.exe logs "Trying to set province building in state that doesn't own it" and skips the building; Rise
    // of Nations ships one and launches. #a-province-building-in-a-state-that-does-not-own-it
    // Not fatal: the owner launched a map with both on 2026-09-16 without -debug; hoi4.exe logged all twelve, loaded, and
    // played a 1936 game. #a-strategic-location-the-game-refuses
    strategic_location_not_in_state: "A state's history hands a strategic location — a named bundle of extra building levels from common/strategic_locations — to a province the state does not list, so HOI4 throws the bundle away and the extra levels are never there. Usually the province moved to another state, or was turned into sea and dropped out of the state's provinces = { } list, while the strategic_province_location line stayed behind. Point the line at a province the state owns, move that province back into this state, or delete the line.",
    strategic_location_building_needs_coast: "A strategic location raises the maximum level of a coastal building — a naval base, a coastal fort — on a province definition.csv says is not coastal, so HOI4 refuses it and the extra levels are never there. Usually the sea beside that province was turned into land, or the province itself into sea. Give the province its coast back, point the strategic_province_location line at a coastal province, or use a location that raises buildings this province can hold.",
    province_building_not_in_state: "A state's history sets a building — a naval base, a bunker, a landmark — on a province the state does not list, so HOI4 skips it. Usually the province moved to another state and its building block stayed behind. Click “Auto-fix all” to remove the stray block, or, to keep the building, move that block into the history of the state that now holds the province.",
    // Not fatal: hoi4.exe logs "map building location is not over the land - ignoring instance" and loads on. 0 rows of any
    // type but floating_harbor stand off land on the six shipping maps. #a-building-over-water
    building_not_over_land: "A row in map/buildings.txt stands over the sea, a lake, or outside the map, so HOI4 ignores it and nothing of that kind can be built there. “Auto-fix all” puts a standard building position (a factory, bunker, air base, supply node…) back on its own state's land, and is offered only when the warning names one. Any other row it names (a dockyard, a port) has no standard position, so Auto-fix leaves it: move its x and z onto its state's coast with the game's building-position editor, or delete the row.",
    dated_naval_building_without_coast: "A state history file adds a naval building on a later date — inside a block like “1939.1.1 = { … }” — where HOI4 has no water for it: a state building (a dockyard) in a state with no coastline, or a province building (a naval base) on a province with no sea beside it. Your 1936 start is fine, so this stays invisible until someone plays a later bookmark; then HOI4 refuses the building and it never appears. “Auto-fix all” moves a dated level only with the building it moves, and otherwise leaves dated blocks alone, because a dated entry can be intentional. Remove it by hand, or give it water back — a coastal province for the state, a coast for the province.",
    unitstacks_disagrees_with_province_type: "map/unitstacks.txt says where HOI4 draws unit counters, and its slot types are specific to whether a province is land or sea. Your map changed some province types and this file still describes the map you started from, so naval slots sit on dry land or a new sea province has nowhere to draw a fleet. Every shipping map that owns a definition.csv also owns a unitstacks.txt. Click “Auto-fix all” to drop the contradicting slots and give any new sea province the standard set.",
    buildings_empty: "map/buildings.txt exists but is empty — the HOI4 wiki says the game crashes on an empty buildings file. Delete the empty file (the base game's is used instead) or restore it from a backup.",
    // Not fatal since 2026-09-11 (see the FATAL set): HOI4 logs "prov N has no continent", and no crash from it has been seen.
    province_no_continent: "The listed LAND province(s) have continent 0 in definition.csv, and HOI4 logs \"prov N has no continent\" for each — every land province should belong to a continent. Click “Auto-fix all”, or set each row's last column to a real continent id (≥ 1).",
    // Not in FATAL. ⚠️ This used to say the condition it produces — land_not_in_state, provinces belonging to no
    // state — is "an error the game logs and loads past". hoi4.exe says otherwise: stateless land fails the map load
    // unless the game runs with -debug, and land_not_in_state is FATAL now (#a-map-the-game-refuses-to-load). This rule
    // is not promoted on that inference — whether Nova's own reading of such a file still sees its states, and so
    // whether land_not_in_state fires beside it, has not been measured. It is an error because no shipping corpus has
    // one: measured across 7,495 state files from vanilla and five installed workshop mods, zero were unbalanced.
    state_file_unbalanced_braces: "Open the named file and find the brace that does not match — most often a `}` that ended up inside a `#` comment. Until it matches, what follows it is read in the wrong place: after a missing `}` the game closes the block at the end of the file, so later lines — often the provinces list — land inside the block above them; an extra `}` ends the state early.",
    state_file_unreadable: "The named file looks like it defines a state but no state could be read from it. Check its braces and that `state = {` is not commented out; HOI4 will skip it and leave its provinces unassigned.",
    land_not_in_state: "Every passable land province must belong to a state, or HOI4 will not load the map (unless started with -debug it stops with “Failed to load the map”). Click “Auto-fix all” to add each to a neighbouring state, move the province into a state with the Move-province tool, or turn it back into sea.",
    // Not fatal either — both warnings. #a-deleted-state-leaves-no-supply-area-behind #a-railway-cannot-jump-across-the-map
    supply_area_state_missing: "A supply area still lists a state id that no longer exists — usually one that was deleted or merged away. Click “Auto-fix all” to take the id out of the supply-area files your mod ships. If the area comes from the base game or a mod you depend on, and your mod replaces history/states, either add replace_path=\"map/supplyareas\" to your descriptor.mod and ship your own supply areas, or copy that one file into your mod and remove the id.",
    // Not fatal: hoi4.exe caps a level above NSupply.MAX_RAILWAY_LEVEL (logging it) and skips a level of 0, and drops a
    // path under 2 provinces; 0 of 7,149 shipping rows trip either. #a-railway-row-is-read-the-way-the-game-reads-it
    railway_level_out_of_range: "A railway's level must run from 1 to the game's NSupply.MAX_RAILWAY_LEVEL — 5 in vanilla; a mod can change it in common/defines. Change the first number on the named lines of map/railways.txt: HOI4 skips a railway of level 0 and plays one above the maximum as the maximum.",
    railway_malformed_row: "Each line of map/railways.txt is a level, a count, then exactly that many province ids — at least two. HOI4 reads the whole file as one stream of numbers, so a wrong count shifts every railway after it. Fix the named lines by hand, or delete them and redraw the railway in the Map editor; a # starts a comment.",
    railway_jump_too_far: "A railway in map/railways.txt jumps between provinces more than 8 apart, and every province in a railway should border the next. Delete that railway and redraw it through the provinces in between — or, if it really crosses water, declare the crossing in map/adjacencies.csv.",
    // #a-railway-link-joins-neighbours — not fatal: the engine drops the link without a word and loads (Old World Blues ships 132)
    railway_link_not_neighbours: "Two provinces next to each other in a railway of map/railways.txt do not touch, and no row of map/adjacencies.csv joins them. HOI4 stores a railway only between neighbours and drops this link, so it draws no track there and carries no supply over it. Redraw that stretch through a province that borders both, or add the crossing with the Adjacency tool.",
    // Not fatal: every shipping state writes a name (7,495 of 7,495 across six maps), but nothing shows a missing
    // one crashing the game. It is the localisation key the state is labelled with. #a-state-with-no-name
    // FATAL since 2026-09-11 (see the FATAL set): each of these MAP_ERRORs clears strategicair.cpp's ok-flag and a cleared
    // flag calls the failed-load path. 0 of 7,523 shipping states lack them. #a-state-without-an-air-base-site-fails-the-map-load
    state_no_air_base_or_rocket_site: "Every state needs an air_base row and a rocket_site_spawn row keyed to its id in map/buildings.txt, each standing on that state's own land (HOI4 ignores one over water, and one on another state's land is not this state's site) — without them hoi4.exe has a check that runs when a game is started or a save is loaded (only a launch started with -debug writes “no air base site defined for state” to error.log for it), and the code around that check ends in “Failed to load the map”. It has never been seen to: seven of the owner's own launches reached a 1936 game with states missing these rows and the game said nothing, so Nova reports this without stopping Save. Every state on the six shipping maps has both, so it is still worth fixing. Click “Auto-fix all” to add the standard building positions to the state, or place them with the game's building-position editor.",
    state_no_name: "Open the state's file in history/states and add a line name = STATE_<id>, using the state's own id, beside its id line. That is a localisation key, and until something defines it the game shows the key itself — so give it a name too: once the line is in the file, typing a name into the Map editor's state panel writes that for you.",
    // Warnings, deliberately NOT in FATAL: across the six shipping maps 0 of 77,816 land rows use a naval
    // terrain and 0 of 95,440 rows point past their continent list — so neither can false-fire — but nobody has
    // measured what HOI4 does with either, and a gate needs a crash, not a clean corpus.
    land_province_has_naval_terrain: "A LAND province's terrain (definition.csv's 7th column) is a category common/terrain marks naval_terrain = yes — usually `ocean`, left behind when a sea province was turned into land. Select the province and pick a land terrain in the inspector, or paint it with the Terrain brush.",
    province_continent_not_declared: "definition.csv's last column is an index into map/continent.txt: 1 is the first name in that file. These rows point past the end of the list, so they belong to no continent. Set each to a continent the file declares, or add the missing names to the end of map/continent.txt.",
    // #a-generated-world-nobody-rules — the whole world at once, not one state. A single ownerless state is
    // legal and Old World Blues ships 313; a world where NONE has an owner has no countries on it.
    world_has_no_owners: "Give at least one state an owner: `owner = <TAG>` inside its `history = { … }` block, using a tag common/country_tags defines. If Nova generated this world, 🌍 Generate land's “Who owns it” box can hand every state to the country that held its land in the world underneath.",
    // #a-world-owner-is-a-country — what LOADS defines the countries: a mod whose descriptor says replace_path="common/country_tags"
    // has only its own, whatever the base game lists.
    state_owner_not_a_country: "Set `owner = <TAG>` in the state's `history = { … }` block to a tag one of the common/country_tags files this mod loads defines (select the state and pick an owner in the inspector), or define the tag there. With replace_path=\"common/country_tags\" in your descriptor, the base game's countries are not loaded at all.",
    state_owned_by_dynamic_tag: "Give the state a real country: paint it with 🖌 Paint, or pick its Owner in the state panel. The tags common/country_tags declares after `dynamic_tags = yes` (the base game's D01..D50) are throwaways the game hands to civil wars and releasables, not countries that start the game with land.",
    state_core_not_a_country: "Take out the `add_core_of = <TAG>` line, or change it to a tag one of the common/country_tags files this mod loads defines (the inspector's cores box writes these lines).",
  };
  function isFatalRule(rule) { return FATAL.has(rule); }
  function mapRuleFixHint(rule) { return FIX_HINTS[rule] || ""; }

  // ── WHAT HOI4 DOES WITH EACH FATAL RULE ── #the-save-gate-says-what-hoi4-does
  // The Save gate once said every member of FATAL "WILL crash HOI4". The evidence behind the set is three different
  // things, and the gate's own lines (the status line, the popup's title, count and intro, the kept-map line) say which:
  //   "refuses-to-load" — reaches hoi4.exe's failed-load path 0x140201F90 (1.19.4.1, as are the two below): unless started with -debug
  //                       the game stops with "Failed to load the map". The map check 0x1401E3F70 (stateless land, a province with no region,
  //                       a state across two regions, a fractioned sea region, a state-id gap) and strategicair's walk of
  //                       every state 0x140CB6BE0 (no air base or rocket site, and so every empty state); batch 5's table.
  //   "crashes"         — crashed in the owner's own launches: a port facing land, a country tag registered after
  //                       zz_dynamic_countries.txt.
  //   "untested"        — neither: kept on the wiki's word or pending a launch test. An X-crossing and a pixel-less province
  //                       log and carry on; a missing capital is only refused; the bitmap format limits and an empty
  //                       buildings.txt were never traced or reproduced, and a hole in the region ids is traced only as far as
  //                       a null read (below). A dockyard with no
  //                       coast is refused and never appears: it was "crashes" until the minidumps showed the island launch
  //                       blamed on it died in the flag atlas, identically with no refused building (#a-naval-building-the-game-refuses-claims-no-crash).
  // A rule added to FATAL without an entry reads as "untested", which never claims more than that Save stops.
  //
  // #the-untested-fatal-map-rules-traced — batch 8 looked again in hoi4.exe 1.19.2 (dumpbin, read-only) for the engine path behind
  // the four FATAL map rules that had neither a failed-load site nor a launch. Every address below was re-derived on 1.19.4.1
  // (56,530,040 bytes) on 2026-10-30, and every fact still holds but one: the unchecked capital read, which
  // capital_state_missing's entry below takes back. None reaches the failed-load path 0x140201F90, so
  // none is "refuses-to-load"; none has been launched, so none is "crashes". The classes stay; this is what the code shows, for
  // the owner's launch tests to settle (test-a-map-message-claims-only-what-the-engine-shows.js re-reads the bytes):
  //   map_x_crossing           map.cpp 0x140AAF2E0 logs "Map invalid X crossing. Please fix pixels at coords: " (0x140AAF788, the
  //                            literal's only code reference) and goes on to the next pixel (0x140AAF7F6). No other text in the
  //                            exe mentions an X crossing, and nothing after it was traced.
  //   province_no_pixels       map.cpp GenerateBoundingBoxes 0x140AB0C60 appends " has no pixels in provinces.bmp" (0x140AB1D8D /
  //                            0x140AB1DAB), writes the line (0x140AB1DDD) and carries on with the next province. What later
  //                            reads the empty box was not traced. Nova's 2026-06-19 divide-by-zero note blamed a zero-pixel
  //                            province, but that crash outlived the fix (2026-06-20), so it is no evidence either way.
  //   capital_state_missing    ⭐ RE-READ 2026-10-30 in hoi4.exe 1.19.4.1 (56,530,040 bytes; first 2026-09-23 in 1.19.3, when every test that pinned 1.19.2 by
  //                            byte size had been SKIPPING silently since the game updated on 09-17). CCountry::SetCapital
  //                            0x140758EE0 range-tests the id at 0x140758FFA, builds
  //                            "Attempting to set capital state #" (0x14075904E) … ", it is not a valid state!" (0x140759087)
  //                            at country.cpp:0x1B7C, then jmp 0x1407591F7 — the epilogue. It never reaches
  //                            mov [rbx+1018h],edi (0x1407590D2), so the field keeps whatever it had and the country is left
  //                            exactly as one whose history names no capital. It cannot refuse the load: the failed-load
  //                            routine is 0x140201F90 (it clears the good-state byte and files "IsMapInGoodState" = "no") and
  //                            has exactly two callers image-wide — the map check 0x1401E48C2 and strategicair's site walk
  //                            0x140CB789F. CCountry::GetCapitalState 0x140734370 range-tests the field again (0x140734480)
  //                            and hands out null. ⛔ The 09-23 reading said 135 of its 136 call sites test the pointer and
  //                            one does not: 1.19.3's 0x14111C8EA, whose test just above (0x14111C8DE) was of rsi's capital
  //                            ([rbx+1Ch]) while the read after it (0x14111C8F2) is of r13's ([rbx+14h]). THAT WAS NEVER
  //                            TRUE: the same function tests r13's capital first and leaves on null (1.19.4.1: mov rcx,r13
  //                            0x1411A3845 / call 0x1411A3848 / test rax,rax 0x1411A384D / je 0x1411A3850 to the exit; the
  //                            2026-10-14 census of 1.19.3 has that call at 0x14111C8C8, the same offset), nothing jumps
  //                            past it, and that site is one more compiler re-call after a guard. So: no refusal, and — by
  //                            the 1.19.4.1 census of all 137 calls, in the header of
  //                            test-a-missing-capital-stops-save-only-for-a-country-with-land.js — no read of the null
  //                            without a test; what the game then does with such a country is unknown. Still
  //                            "untested" — nobody has launched one, and no shipping map has one — but the class is now gated only for a
  //                            country that OWNS LAND, because 18 landless countries across Old World Blues and Rise of
  //                            Nations ship with no capital at all and both maps play. Six other call sites looked
  //                            unguarded to an automatic scan and are NOT: 0x1406A6ABB, 0x1406A6AD3, 0x140737450,
  //                            0x14073745F, 0x140AD995B and 0x14169825D are all the compiler re-calling the getter after
  //                            the guard, and 0x141AADE79 passes the pointer on rather than reading through it. Followed
  //                            along every path, the 1.19.4.1 census finds three more such re-calls (0x1410DF3F1,
  //                            0x1411A386A, 0x1411A38A6) and one read behind a test for a capital id of 0 (0x140760D41).
  //                            Two capital getters are built on GetCapitalState: 0x1407344B0 and its twin 0x140734540 (1.19.2's
  //                            0x1406DFDA0 / 0x1406DFE30; 38 call sites reach them). They assert pCapitalState && "all nations
  //                            need a capital!" only when the internal assert byte 0x14368F611 is set (gates 0x1407344B9 /
  //                            0x14073455B), and otherwise hand back nothing (the first's xor eax,eax at 0x140734514; the twin
  //                            goes to its epilogue). That byte is clear on a normal launch (-asserts, -ai_testing, -hands_off and the console set it).
  //   strategic_region_id_gap  a missing id is a NULL slot in the region table [gamestate+2E0h]: gradientbordermanager.cpp 0x140FBD090
  //                            tests the slot (0x140FBD2D7) and logs "Hole in Strategic Regions DB at ID = " (0x140FBD308). The map
  //                            check's region pass 0x1401E6380 reads the same table (0x1401E63F7) and dereferences every slot
  //                            (cmp [rcx+0A0h],0 at 0x1401E63FB) with no null test, which faults on that null. Read from the code,
  //                            never launched, and which of the two runs first was not traced.
  const FATAL_OUTCOME = {
    land_not_in_state: "refuses-to-load", province_no_region: "refuses-to-load", state_split_strategic_regions: "refuses-to-load",
    fractioned_naval_region: "refuses-to-load", state_id_gap: "refuses-to-load",
    // state_no_air_base_or_rocket_site — withdrawn, see the note in the fatal list above: seven of the owner's launches
    // reached a 1936 game with states missing these rows and hoi4.exe logged nothing.
    // state_owns_no_land — withdrawn, see the note in the fatal list above: 293 of them loaded fine on 09-16.
    empty_state: "refuses-to-load", empty_state_with_content: "refuses-to-load", empty_capital_state: "refuses-to-load",
    naval_base_water_is_gone: "crashes", country_tag_after_dynamic_marker: "crashes",
    map_x_crossing: "untested", province_no_pixels: "untested", capital_state_missing: "untested", strategic_region_id_gap: "untested",
    // the same capital 0 as capital_state_missing, reached without a line (#a-capital-set-only-by-set-capital): the same verdict
    no_capital_at_all: "untested",
    // "crashes", and the cleanest evidence in this table: the owner launched the world WITH these lines and it died at
    // 1936.01.01.12 with an access violation, and launched the byte-identical world with exactly these lines removed and it
    // played 19 in-game days. The game itself ran the back-out control.
    country_history_state_missing: "crashes",
    // "crashes" on the same kind of evidence: TEST 19 and TEST 22 died with these lists in the faulting threads, and TEST 23 —
    // the same world with only these ids removed — had 0 threads there.
    ai_strategy_state_list_missing: "crashes",
    // "crashes": TEST 19, 22 and 23 died on 910.DEN_develop_state_cost (1.19.3's 0x54277F, rax = 910), TEST 23 with nothing else left; and
    // the 2026-09-17 launch in add_dynamic_modifier on a missing state, which played 19 days with those lines removed.
    script_state_read_unguarded: "crashes",
    // "untested": read from hoi4.exe (is_core_of 0x483180, is_claimed_by 0x482C70), never launched.
    script_state_check_unguarded: "untested",
    // "crashes": eleven launches died on one (taskforce.cpp, [rbx+0xA4] = the berth province), TEST 22 without them loaded.
    fleet_starts_on_land_with_no_sea: "crashes",
    // "untested": the same loader and the same unchecked read as the line above (#a-fleet-loaded-where-the-map-took-the-sea), but
    // reached by a script mid-game, and no launch has fired one yet.
    fleet_loaded_on_land_the_map_cut_off: "untested",
    // "crashes": TEST 25 died in 1.19.3's fn 0x1227400 with the overrun in its registers; TEST 26 with only the region count raised played on.
    naval_region_queue_overflows: "crashes",
    buildings_empty: "untested", bmp_not_24bit: "untested", bmp_bad_dimensions: "untested", bmp_too_big: "untested",
  };
  function fatalOutcome(rule) { return FATAL.has(rule) ? (FATAL_OUTCOME[rule] || "untested") : ""; }
  // The gate's words for a set of fatal problems: the strongest thing at least ONE of them proves, and a count of each kind.
  function fatalVerdict(rules) {
    const n = { "refuses-to-load": 0, crashes: 0, untested: 0 };
    for (const r of rules || []) { const o = fatalOutcome(r); if (o) n[o]++; }
    const refuse = n["refuses-to-load"], crash = n.crashes, untested = n.untested;
    const headline = refuse ? "HOI4 refuses to load this map" : crash ? "HOI4 crashes on this map" : "Save stops for this map";
    const sentence = refuse ? "HOI4 refuses to load this map — unless it is started with -debug it stops with “Failed to load the map”."
      : crash ? `HOI4 has crashed in a launch on a map with ${crash === 1 ? "this" : "these"}.`
      : `No launch has yet shown that HOI4 plays a map with ${untested === 1 ? "this" : "these"}.`;
    const parts = [];
    if (refuse) parts.push(`${refuse} that make${refuse === 1 ? "s" : ""} HOI4 refuse to load the map`);
    if (crash) parts.push(`${crash} that HOI4 has crashed on in a launch`);
    if (untested) parts.push(`${untested} that no launch has yet shown HOI4 can play`);
    return { counts: n, total: refuse + crash + untested, headline, sentence, parts };
  }

  // ── HOW MUCH OF THE MAP ONE PROBLEM FOUND ── #a-map-summary-counts-rules-not-what-they-found
  //
  // ⛔ THE HEADLINE COUNTED RULES. Every line that summarises a map check — the popup's "1 error · 2 warnings", the status
  // line a Save ends on, Mod Health's "Will it crash?" verdict — counted how many RULES fired. A rule that found one thing
  // and a rule that found five thousand are both "1 error".
  //
  // Measured on the world the owner built and launched on 2026-09-16 (new mod → Delete map → Generate land at 35% →
  // Auto-fix ×2), then looked at and described as "full of holes … full of weird things that looked like glass": Nova's
  // verdict was "3 problems, 1 error, 0 fatal", and the Save gate's line was "⚠️ 1 problem the game will load past". The
  // three problems name 8,023 things — 5,049 sea provinces sitting inside states, 2,967 of the 4,566 divisions the mod
  // starts, 7 dated dockyards. Two thirds of the world's land (6,594 of 10,155 provinces) had been drowned in place, and
  // the number that said so appeared nowhere in any headline. Rule-by-rule true; false as a whole.
  //
  // ⚠️ NO THRESHOLD, AND NO NEW RULE. The six shipping maps name 5–69 things in total each (vanilla 8, MD 14, R56 69,
  // OWB 45, NV 31, RoN 5, measured by running the validator on all six); this map names 8,023. The numbers separate
  // themselves, so nothing here invents a severity, moves a rule into FATAL, or fires on a map that did not fire before —
  // it prints what the problems already counted, and ranks by it. A naval total conversion that deliberately made a lot of
  // sea reports exactly the rules it reported before, with their own counts beside them.
  //
  // ⛔ AND IT READS `total`, NEVER AN ARRAY LENGTH. A problem's example lists are capped (60 items, 40, 20 provinces, 80
  // countries), so measuring the payload reports the cap — the very bug 8ee6db7 fixed in the messages, which reported
  // "61 sea province(s)" for 5,049. A rule that counted itself carries `total` plus `totalNoun` (what it counted); a rule
  // that did not is left out of the clause rather than guessed at, so a summary can be silent but never wrong.
  /** The size of one problem: { n, noun } when the rule counted itself, else null. */
  function problemScale(p) {
    if (!p || typeof p !== "object") return null;
    const n = typeof p.total === "number" ? p.total : NaN;
    if (!isFinite(n) || n < 0) return null;
    const noun = String(p.totalNoun || "").trim();
    // `totalNounOne`: the rule's own words for ONE, where the plural is not the noun's last word ("places where land meets
    // sea …") and so cannot be read off its end
    const one = String(p.totalNounOne || "").trim();
    return { n, noun: noun || "of them", ...(noun && one ? { one } : {}) };
  }
  const _num = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  // A rule writes its noun in the plural ("provinces", "naval buildings"), because that is how it nearly always
  // reads. One of them is still one: Rise of Nations' whole contribution is a single dated naval base, and
  // "1 naval buildings" in the line that is meant to be read carefully is the wrong kind of sloppy. Regular
  // plurals only — a rule needing an irregular one should say so rather than have this guess, and does: `totalNounOne`.
  // (-xes, -ches, -shes and -sses lose "es": "boxes" read "boxe", review of 509c00a.)
  const _one = (noun) => noun.replace(/(\w+?)(ies|xes|ches|shes|sses|s)$/, (m, stem, end) => (end === "ies" ? stem + "y" : end === "s" ? stem : stem + end.slice(0, -2)));
  /** "5,049 provinces, 2,967 divisions and 7 naval buildings" for a list of problems — "" when none counted itself.
   *  Nouns are summed, biggest first, so two rules that both counted states read as one figure.
   *  ⚠️ A SUM, NOT A DISTINCT COUNT. Two rules counting the same noun are added, and nothing here knows whether they
   *  found the same thing twice: a state with no category and too many buildings for its category would be counted
   *  once by each. The pair that most often shares a noun cannot overlap (state_no_category and
   *  unknown_state_category are the two halves of one if/else), and the figures this line exists for are orders of
   *  magnitude apart — but if a rule is ever added whose subject really does overlap another's, this reads high. */
  function scaleClause(problems) {
    const byNoun = new Map(), oneOf = new Map();
    for (const p of (problems || [])) {
      const s = problemScale(p);
      if (!s || !s.n) continue;
      byNoun.set(s.noun, (byNoun.get(s.noun) || 0) + s.n);
      if (s.one && !oneOf.has(s.noun)) oneOf.set(s.noun, s.one);
    }
    const parts = [...byNoun].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
      .map(([noun, n]) => `${_num(n)} ${n === 1 ? (oneOf.get(noun) || _one(noun)) : noun}`);
    if (!parts.length) return "";
    if (parts.length === 1) return parts[0];
    return parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];
  }
  /** Sort a list of problems biggest-first. A problem that did not count itself keeps its place among the uncounted
   *  ones (scale 0) rather than being pushed to the end — the order it arrived in is the order the rules ran. */
  function bySizeDescending(problems) {
    return (problems || []).map((p, i) => [p, i, (problemScale(p) || { n: 0 }).n])
      .sort((a, b) => b[2] - a[2] || a[1] - b[1]).map((e) => e[0]);
  }

  // ── WHERE A MAP-FIX CLICK PUT THE COPIES IT TOOK ── #a-recovery-copy-nobody-is-told-about
  //
  // ⛔ THE SENTENCE LIVED IN public/map.js, AND MOD HEALTH CANNOT REACH THAT FILE. #f25 gave the Map editor's
  // "Auto-fix all" this note and its own comment says the two buttons Mod Health's crash check carries
  // (public/modhealth-crashcheck.js) were left: "🔧 Fix duplicate states" and "🔧 Fix region overlaps".
  //
  // 📊 MEASURED 2026-09-17 by clicking both on the real page against a real server — a scratch mod with 12 duplicated
  // state ids and 12 states split across two strategic regions, driven at http://127.0.0.1:54100/modhealth.html:
  //   Fix duplicate states -> { removed: 12, …, backupSnapshot: { dir: "…/.nova/auto_fixes/fixmod_…/2026-09-17T12-01-44-416Z", files: 12, failed: 0 } }
  //                           the panel said, in full: "Removed 12 stray duplicate block(s)."
  //   Fix region overlaps  -> { statesAligned: 12, provincesMoved: 21, backupSnapshot: { dir: "…/2026-09-17T12-01-58-386Z", files: 12, failed: 0 } }
  //                           the panel said: "Aligned 12 split state(s) to a single strategic region …"
  // Twelve state files removed and twelve region files rewritten, a folder outside the mod holding every one of them
  // exactly as it was, and neither sentence named it. map-data.js takes those copies in a `finally` whose own comment
  // says why: "a recovery copy nobody is told about is only marginally better than none".
  //
  // It lives HERE because this module is the one map-wording file that map.html and modhealth.html BOTH load, so there
  // is one sentence and not two that drift. public/map.js keeps the name and delegates to it.
  //
  // `files` counts the copies that were TAKEN, so "all of them" is only true while `failed` is 0: a copy that could not
  // be taken is named rather than counted in, or the sentence promises a file that is not there. "" when the click wrote
  // nothing — a second click on the same mod returns no snapshot at all, so absence is normal and says nothing.
  /** @param {{backupSnapshot?:{dir?:string,files?:number,failed?:number}}} fixes — the click's own answer. */
  function backupSnapshotNote(fixes) {
    const snap = (fixes && fixes.backupSnapshot) || null;
    // ⛔ #the-copies-folder-says-what-it-cannot-cover (B6-20) — …and what the folder is NOT: the files the click CREATED have no "before"
    // to copy, so copying the folder back over the mod leaves every one of them in place. Auto-fix makes state files and names files, and
    // Generate land made 1,090 on the owner's flow. Said here, once, for every caller: it was Generate land's own line, and Auto-fix's
    // "a copy of all of them" said nothing of the files it made.
    const created = (snap && Number(snap.created)) || 0;
    const plural = (n) => `${n.toLocaleString()} new file${n === 1 ? "" : "s"}`;
    // ⛔ #an-auto-fix-hid-the-copies-it-could-not-make — a click whose EVERY copy failed has no folder to name (files 0), and said
    // nothing at all: the same silence as a click that wrote nothing. map-data.js now reports that scope too; say it.
    const failedAll = snap && !Number(snap.files) ? Number(snap.failed) || 0 : 0;
    if (failedAll) {
      return ` ⚠ Nova could not copy the ${failedAll} file${failedAll === 1 ? "" : "s"} it changed before changing ${failedAll === 1 ? "it" : "them"},`
        + ` so ${failedAll === 1 ? "it has" : "they have"} no copy outside your mod.`
        + (created ? `\n  It also created ${plural(created)}.` : "");
    }
    if (!snap || !snap.dir || !snap.files) return "";
    const n = snap.files, missed = Number(snap.failed) || 0;
    return ` Changed ${n} file${n === 1 ? "" : "s"}. A copy of ${n === 1 ? "it" : "all of them"} was saved first,`
      + ` outside your mod, at:\n  ${snap.dir}`
      + (missed ? `\n  (${missed} more file${missed === 1 ? "" : "s"} could not be copied.)` : "")
      + (created ? `\n  It also created ${plural(created)}, which that folder has no copy of: copying it back over your mod leaves ${created === 1 ? "that file" : "them"} in place.` : "");
  }

  // 🔧 WHEN THE MAP ERRORS POPUP OFFERS "🔧 Auto-fix all" — every error, and every warning whose own message names Auto-fix as its
  // repair unless the problem itself declines it (autoFix: false, set where it is pushed: a message can name Auto-fix to say what
  // it will NOT do). #a-fixable-warning-gets-the-auto-fix-button, #a-warning-auto-fix-leaves-alone-offers-no-auto-fix.
  // ⛔ ONE PREDICATE, TWO CALLERS: the popup's own button, and 🌍 Generate a world's last step, which runs Auto-fix once more "if it
  // still offers a fix" — what the modder would do at the popup. The world's step used to ask a narrower question
  // (problems.some((p) => p.autoFix), five warning rules), so a world ending on an error got the button from the popup and no
  // second Auto-fix from the run.
  /** The problems that make the popup offer Auto-fix ([] when it offers nothing). */
  function autoFixOffers(problems) {
    const list = Array.isArray(problems) ? problems : [];
    return list.filter((p) => p && (p.severity === "error" || (p.autoFix !== false && /\bAuto-fix\b/.test(String(p.message || "")))));
  }
  /** Does the popup offer 🔧 Auto-fix all for these problems? */
  function autoFixOffered(problems) { return autoFixOffers(problems).length > 0; }

  return { LABELS, mapRuleLabel, FATAL, FIX_HINTS, isFatalRule, mapRuleFixHint, FATAL_OUTCOME, fatalOutcome, fatalVerdict,
    problemScale, scaleClause, bySizeDescending, backupSnapshotNote, autoFixOffers, autoFixOffered };
});
