/* ===========================================================================
   GENESIS ENGINE  —  Hearts of Iron IV script → plain English
   ---------------------------------------------------------------------------
   A data-driven translator for Paradox effect / trigger / modifier script.
   Replaces the old hand-tuned regex cascade (which was overfit to a few
   country trees) with a real brace-aware parser + curated dictionaries sourced
   from the HOI4 wiki effect/trigger/modifier lists.

   Pure and isomorphic: runs in the browser (uses window.localizationMap and
   window.GENESIS_DICTIONARY for real in-mod names when present) and in Node
   (falls back to humanised identifiers), so it can be unit-tested directly
   against real vanilla focus trees.

   Public API (window.GenesisEngine / module.exports):
     translate(code)            -> English string for a script fragment/block
     tokenize(text)             -> [{key, op, value, block}]
     humanizeId(id)             -> friendly name for a tag/idea/focus id
     EFFECTS, TRIGGERS, SCOPES, MODIFIERS, BUILDINGS, RESOURCES
   =========================================================================== */
(function (root) {
  "use strict";

  /* ---------------------------------------------------------------- name maps */

  const TAG_MAP = {
    AFG: "Afghanistan", ALB: "Albania", ARG: "Argentina", AST: "Australia",
    AUS: "Austria", BEL: "Belgium", BHU: "Bhutan", BOL: "Bolivia", BRA: "Brazil",
    BUL: "Bulgaria", CAN: "Canada", CHI: "China", CHL: "Chile", COL: "Colombia",
    CRO: "Croatia", CUB: "Cuba", CZE: "Czechoslovakia", DEN: "Denmark",
    DOM: "Dominican Republic", ECU: "Ecuador", EGY: "Egypt", ENG: "United Kingdom",
    EST: "Estonia", ETH: "Ethiopia", FIN: "Finland", FRA: "France", GER: "Germany",
    GRE: "Greece", GUA: "Guatemala", HAI: "Haiti", HON: "Honduras", HUN: "Hungary",
    ICE: "Iceland", IND: "British Raj", IRE: "Ireland", IRQ: "Iraq", ITA: "Italy",
    JAP: "Japan", LAT: "Latvia", LIT: "Lithuania", LUX: "Luxembourg", MAN: "Manchukuo",
    MEX: "Mexico", MON: "Mongolia", NEP: "Nepal", NOR: "Norway", NZL: "New Zealand",
    OMA: "Oman", PAK: "Pakistan", PAN: "Panama", PAR: "Paraguay", PER: "Peru",
    PHI: "Philippines", POL: "Poland", POR: "Portugal", PRC: "Communist China",
    PRU: "Prussia", RAJ: "British Raj", ROM: "Romania", SAF: "South Africa",
    SAU: "Saudi Arabia", SIA: "Siam", SOV: "Soviet Union", SPA: "Spain",
    SPR: "Republican Spain", SWE: "Sweden", SWI: "Switzerland", TUR: "Turkey",
    URG: "Uruguay", USA: "United States", VEN: "Venezuela", YUG: "Yugoslavia",
    HOL: "Netherlands", NED: "Netherlands", YEM: "Yemen", TIB: "Tibet",
    SIK: "Sinkiang", SHX: "Shanxi", GXC: "Guangxi Clique", YUN: "Yunnan",
    XSM: "Xibei San Ma", PERU: "Peru"
  };

  const IDEOLOGY_NOUN = {
    fascism: "Fascism", communism: "Communism", democratic: "Democracy",
    neutrality: "Non-Aligned", democracy: "Democracy", anarchist: "Anarchism"
  };
  const IDEOLOGY_ADJ = {
    fascism: "Fascist", communism: "Communist", democratic: "Democratic",
    neutrality: "Non-Aligned"
  };

  const BUILDINGS = {
    industrial_complex: "civilian factory", arms_factory: "military factory",
    dockyard: "naval dockyard", air_base: "air base", naval_base: "naval base",
    infrastructure: "infrastructure", anti_air_building: "anti-air",
    radar_station: "radar station", rocket_site: "rocket site",
    nuclear_reactor: "nuclear reactor", synthetic_refinery: "synthetic refinery",
    fuel_silo: "fuel silo", land_fort: "land fort", coastal_bunker: "coastal fort",
    bunker: "land fort", supply_node: "supply hub", rail_way: "railway",
    floating_harbor: "floating harbour", special_naval_base: "naval base"
  };

  const RESOURCES = {
    oil: "oil", rubber: "rubber", steel: "steel", aluminium: "aluminium",
    aluminum: "aluminium", tungsten: "tungsten", chromium: "chromium"
  };

  /* ----------------------------------------------------- modifier dictionary  */
  /* Common country / state / unit modifiers (used inside ideas, dynamic
     modifiers, and shown on national-spirit cards). value→% when |v|<1.       */
  const MODIFIERS = {
    political_power_factor: "Political power gain",
    political_power_gain: "Political power gain (flat)",
    command_power_gain: "Command power gain (flat)",
    stability_factor: "Stability",
    stability_weekly: "Weekly stability",
    stability_weekly_factor: "Weekly stability",
    war_support_factor: "War support",
    war_support_weekly: "Weekly war support",
    war_support_weekly_factor: "Weekly war support",
    research_speed_factor: "Research speed",
    production_speed_buildings_factor: "Construction speed",
    production_factory_max_efficiency_factor: "Max factory efficiency",
    production_factory_efficiency_gain_factor: "Factory efficiency growth",
    production_factory_start_efficiency_factor: "Starting factory efficiency",
    industrial_capacity_factory: "Factory output",
    industrial_capacity_dockyard: "Dockyard output",
    consumer_goods_factor: "Consumer goods",
    conversion_cost_civ_to_mil_factor: "Civ→Mil conversion cost",
    conversion_cost_mil_to_civ_factor: "Mil→Civ conversion cost",
    line_change_production_efficiency_factor: "Retooling efficiency",
    local_resources_factor: "Local resource output",
    army_org_factor: "Division organisation",
    army_morale_factor: "Division recovery rate",
    army_speed_factor: "Division speed",
    army_attack_factor: "Army attack",
    army_defence_factor: "Army defence",
    army_org: "Division organisation",
    max_dig_in_factor: "Max entrenchment",
    army_core_attack_factor: "Core territory attack",
    army_core_defence_factor: "Core territory defence",
    land_reinforce_rate: "Reinforce rate",
    training_time_factor: "Training time",
    experience_gain_army_factor: "Army experience gain",
    experience_gain_air_factor: "Air experience gain",
    experience_gain_navy_factor: "Navy experience gain",
    army_leader_start_level: "Starting general level",
    planning_speed: "Planning speed",
    max_planning: "Max planning bonus",
    air_superiority_efficiency: "Air superiority efficiency",
    air_accidents_factor: "Air accidents",
    air_mission_efficiency: "Air mission efficiency",
    air_cas_efficiency: "Close air support efficiency",
    naval_morale_factor: "Naval morale",
    navy_org_factor: "Fleet organisation",
    ships_at_battle_start_factor: "Fleet reinforcement range",
    naval_coordination: "Naval coordination",
    surface_navy_org_factor: "Surface fleet organisation",
    sortie_efficiency: "Naval sortie efficiency",
    justify_war_goal_time_factor: "Justify war goal time",
    generate_wargoal_tension: "World tension needed to declare war",
    join_faction_tension: "World tension needed to join factions",
    guarantee_tension: "World tension needed to guarantee",
    lend_lease_tension: "World tension needed for lend-lease",
    drift_defence_factor: "Ideology drift defence",
    political_advisor_cost_factor: "Political advisor cost",
    high_command_cost_factor: "High command cost",
    theorist_cost_factor: "Theorist cost",
    air_chief_cost_factor: "Air chief cost",
    army_chief_cost_factor: "Army chief cost",
    navy_chief_cost_factor: "Navy chief cost",
    min_export: "Minimum export",
    trade_opinion_factor: "Trade opinion",
    targeted_modifier: "Targeted opinion",
    surrender_limit: "Surrender limit",
    war_stability_factor: "Wartime stability",
    mobilization_speed: "Mobilisation speed",
    conscription: "Recruitable population",
    conscription_factor: "Recruitable population",
    enemy_intel_network_gain_factor_over_occupied_tag: "Enemy intel over our territory",
    resistance_target: "Resistance target",
    resistance_growth: "Resistance growth",
    compliance_growth: "Compliance growth",
    supply_consumption_factor: "Supply consumption",
    fuel_gain_factor: "Fuel gain",
    fuel_cost: "Fuel usage",
    research_sharing_per_country_bonus: "Research-sharing bonus",
    civilian_intel_to_others: "Civilian intel leaked to others",
    army_intel_to_others: "Army intel leaked to others",
    navy_intel_to_others: "Navy intel leaked to others",
    encryption_factor: "Encryption",
    decryption_factor: "Decryption",
    // — common idea modifiers (kept in sync with the National Spirit maker's display map) —
    production_speed_arms_factory_factor: "Mil factory construction speed",
    production_speed_industrial_complex_factor: "Civ factory construction speed",
    production_speed_dockyard_factor: "Dockyard construction speed",
    production_speed_infrastructure_factor: "Infrastructure construction speed",
    production_speed_bunker_factor: "Land fort construction speed",
    production_speed_coastal_bunker_factor: "Coastal fort construction speed",
    communism_drift: "Communism support drift",
    fascism_drift: "Fascism support drift",
    democratic_drift: "Democratic support drift",
    neutrality_drift: "Non-aligned support drift",
    stability_weekly: "Weekly stability",
    economy_cost_factor: "Economy law cost",
    mobilization_laws_cost_factor: "Mobilisation law cost",
    trade_laws_cost_factor: "Trade law cost",
    non_core_manpower: "Non-core manpower available",
    repair_speed_factor: "Repair speed",
    army_org_regain: "Organisation regain rate",
    command_power_gain_mult: "Command power gain",
    send_volunteers_tension: "World tension needed to send volunteers",
    send_volunteer_size: "Max volunteer divisions",
    operative_slot: "Operative slots",
    max_command_power: "Max command power"
  };

  // Modifiers whose value is a flat amount/count, NOT a percentage. auto() guesses from magnitude,
  // so a sub-1 flat value like political_power_gain = 0.5 would wrongly read as "+50%". Render these
  // with flat() ("+0.5") instead. (Most modifiers ARE factors, so the default stays auto().)
  const FLAT_MODIFIERS = new Set([
    "political_power_gain", "command_power_gain", "weekly_manpower",
    "send_volunteer_size", "send_volunteer_divisions_required", "operative_slot", "max_command_power"
  ]);
  function modVal(k, v) { return FLAT_MODIFIERS.has(lc(k)) ? flat(v) : auto(v); }

  /* ---------------------------------------------------------------- utilities */

  function isBlank(s) { return s === null || s === undefined || String(s).trim() === ""; }

  function num(v) { const n = parseFloat(v); return Number.isFinite(n) ? n : null; }

  // signed flat number, trimming trailing zeros
  function flat(v) {
    const n = num(v); if (n === null) return isBlank(v) ? "" : String(v);
    const s = (Math.round(n * 1000) / 1000).toString();
    return (n > 0 ? "+" : "") + s;
  }
  // value as signed percentage (0.05 -> +5%)
  function pct(v) {
    const n = num(v); if (n === null) return isBlank(v) ? "" : String(v);
    const p = Math.round(n * 1000) / 10;
    return (n > 0 ? "+" : "") + p + "%";
  }
  // generic: small fractions read as %, whole numbers as flat
  function auto(v) {
    const n = num(v); if (n === null) return humanizeId(v);
    if (n !== 0 && Math.abs(n) < 1) return pct(n);
    return flat(n);
  }

  function titleCase(s) {
    return String(s).split("_").filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }

  // English pluraliser for building/unit nouns ("military factory" -> "...factories").
  function plural(noun, n) {
    if (!noun || n === null || Math.abs(n) === 1) return noun;
    if (noun === "infrastructure") return noun;
    if (/[^aeiou]y$/.test(noun)) return noun.replace(/y$/, "ies");
    if (/(s|x|z|ch|sh)$/.test(noun)) return noun + "es";
    return noun + "s";
  }

  function lc(s) { return String(s || "").toLowerCase(); }

  // Friendly name for an identifier: country tag, ideology, real in-mod loc
  // name, or a humanised fallback.
  function humanizeId(id) {
    if (isBlank(id)) return "";
    let s = String(id).trim().replace(/^"|"$/g, "");
    if (/^(ROOT|THIS)$/.test(s)) return "this country";
    if (s === "FROM") return "the source country";
    if (s === "PREV") return "the previous country";
    if (s === "OWNER") return "the owner";
    if (s === "CONTROLLER") return "the controller";
    if (TAG_MAP[s.toUpperCase()] && s.length <= 4) return TAG_MAP[s.toUpperCase()];
    if (IDEOLOGY_NOUN[s.toLowerCase()]) return IDEOLOGY_NOUN[s.toLowerCase()];
    // real in-mod names when running in the browser
    try {
      if (typeof window !== "undefined") {
        if (window.localizationMap && window.localizationMap[s]) return window.localizationMap[s];
        if (window.GENESIS_DICTIONARY && window.GENESIS_DICTIONARY[s]) return window.GENESIS_DICTIONARY[s];
      }
    } catch (e) { /* ignore */ }
    if (RESOURCES[s.toLowerCase()]) return RESOURCES[s.toLowerCase()];
    if (BUILDINGS[s.toLowerCase()]) return BUILDINGS[s.toLowerCase()];
    // An unknown all-caps tag -> leave it as a tag. 🈯 Three characters, first a LETTER: 79 of the 1,186 tags
    // vanilla and the workshop mods declare carry a digit (D01, C01…), and so does every tag Nova's own
    // /api/map/free-tag suggests (Z00, Z01…). #country-tag-shape
    if (/^[A-Z][A-Z0-9]{2}$/.test(s)) return s;
    // strip leading known country-tag prefix (GER_mefo_bills -> Mefo Bills)
    let core = s.replace(/^(GFX_|idea_|spirit_)/, "");
    const tagPre = core.match(/^([A-Za-z][A-Za-z0-9]{2})_/);
    if (tagPre && TAG_MAP[tagPre[1].toUpperCase()]) core = core.slice(4);
    return titleCase(core);
  }

  /* ----------------------------------------------------------- the tokenizer  */

  function tokenize(text) {
    const out = [];
    if (!text) return out;
    const n = text.length;
    let i = 0;
    const isBreak = (c) => c === " " || c === "\t" || c === "\r" || c === "\n" ||
      c === "{" || c === "}" || c === "=" || c === "<" || c === ">" || c === "#";
    function skipWs() {
      while (i < n) {
        const c = text[i];
        if (c === "#") { while (i < n && text[i] !== "\n") i++; }
        else if (c === " " || c === "\t" || c === "\r" || c === "\n") i++;
        else break;
      }
    }
    function word() {
      skipWs();
      if (i >= n) return null;
      const c = text[i];
      if (c === "{" || c === "}" || c === "=" || c === "<" || c === ">") { i++; return c; }
      if (c === '"') { let j = i + 1; while (j < n && text[j] !== '"') j++; const t = text.slice(i + 1, j); i = j + 1; return t; }
      let j = i;
      while (j < n && !isBreak(text[j])) j++;
      const t = text.slice(i, j); i = j; return t;
    }
    function block() {
      let depth = 0, start = i, j = i;
      while (j < n) {
        const c = text[j];
        if (c === "{") depth++;
        else if (c === "}") { depth--; if (depth === 0) { j++; break; } }
        j++;
      }
      const inner = text.slice(start + 1, Math.max(start + 1, j - 1));
      i = j; return inner;
    }
    let guard = 200000;
    while (guard-- > 0) {
      skipWs();
      if (i >= n) break;
      const key = word();
      if (key === null) break;
      if (key === "}" || key === "{" || key === "=" || key === "<" || key === ">") continue;
      skipWs();
      let op = "=";
      if (text[i] === "=" || text[i] === "<" || text[i] === ">") {
        op = text[i]; i++;
        if (text[i] === "=") { op += "="; i++; } // >= / <=
      }
      skipWs();
      if (text[i] === "{") out.push({ key: key, op: op, value: null, block: block() });
      else out.push({ key: key, op: op, value: word(), block: null });
    }
    return out;
  }

  // First `name = X` value within a block's raw text.
  function field(stmt, name) {
    if (!stmt || !stmt.block) return null;
    const toks = tokenize(stmt.block);
    for (const t of toks) if (lc(t.key) === lc(name)) return t.value !== null ? t.value : (t.block !== null ? "{block}" : null);
    return null;
  }
  function fieldNum(stmt, name) { return num(field(stmt, name)); }

  // Every delay form HOI4 accepts on an event, not just `days`. Reading only `days` made a delayed event
  // read exactly like an immediate one — and news_event and state_event read no delay at all.
  // #event-delay-dropped
  //
  // days/hours are a fixed wait; random_days/random_hours are an ADDITIONAL wait of zero up to that many,
  // so they are worded as a range rather than a point. They combine, and HOI4 mods do combine them.
  function eventDelay(s) {
    const unit = (n, one, many) => n + " " + (Math.abs(n) === 1 ? one : many);
    const fixed = [];
    const d = fieldNum(s, "days"), h = fieldNum(s, "hours");
    if (d) fixed.push(unit(d, "day", "days"));
    if (h) fixed.push(unit(h, "hour", "hours"));
    const rnd = [];
    const rd = fieldNum(s, "random_days"), rh = fieldNum(s, "random_hours");
    if (rd) rnd.push(unit(rd, "day", "days"));
    if (rh) rnd.push(unit(rh, "hour", "hours"));
    if (!fixed.length && !rnd.length) return "";
    if (fixed.length && rnd.length) return " (in " + fixed.join(" ") + ", plus up to " + rnd.join(" ") + ")";
    if (fixed.length) return " (in " + fixed.join(" ") + ")";
    return " (within " + rnd.join(" ") + ")";
  }

  /* -------------------------------------------------------------- the scopes  */

  const SCOPES = {
    every_state: "In every state", random_state: "In a random state",
    any_state: "In any state", all_state: "In all states",
    every_owned_state: "In every owned state", random_owned_state: "In a random owned state",
    any_owned_state: "In any owned state",
    every_controlled_state: "In every controlled state", random_controlled_state: "In a random controlled state",
    every_owned_controlled_state: "In every controlled state", random_owned_controlled_state: "In a random controlled state",
    every_core_state: "In every core state", random_core_state: "In a random core state",
    any_owned_controlled_state: "In any controlled state",
    every_state_loop: "In every state", random_neighbor_state: "In a random neighbouring state",
    every_subject_country: "For every subject", random_subject_country: "For a random subject",
    every_country_with_original_tag: "For every matching country",
    every_occupied_country: "For every occupied country",
    capital_state: "In the capital state",
    every_country: "For every country", random_country: "For a random country",
    any_country: "For any country", all_country: "For all countries",
    every_other_country: "For every other country", random_other_country: "For a random other country",
    every_enemy_country: "For every enemy country", any_enemy_country: "For any enemy country",
    every_neighbor_country: "For every neighbouring country", random_neighbor_country: "For a random neighbouring country",
    any_neighbor_country: "For any neighbouring country",
    every_neighbor_state: "In every neighbouring state",
    every_unit_leader: "For every commander", random_unit_leader: "For a random commander",
    every_army_leader: "For every general", random_army_leader: "For a random general",
    every_navy_leader: "For every admiral", random_navy_leader: "For a random admiral",
    every_character: "For every character", random_character: "For a random character",
    capital_scope: "In the capital", owner: "For the owner", controller: "For the controller",
    overlord: "For the overlord", faction_leader: "For the faction leader",
    all_owned_state: "In all owned states",
    for_each_scope_loop: "For each match", for_each_loop: "For each match",
    every_possible_country: "For every possible country",
    random_scientist: "For a random scientist", every_scientist: "For every scientist",
    random_character: "For a random character",
    // "any_*" existence scopes — common in conditions ("does there exist an X such that…").
    any_other_country: "For any other country",
    any_core_state: "In any core state", any_controlled_state: "In any controlled state",
    any_country_with_original_tag: "For any country with that original tag",
    every_country_with_original_tag: "For every country with that original tag",
    any_army_leader: "For any general", any_navy_leader: "For any admiral",
    any_unit_leader: "For any commander", any_character: "For any character",
    any_allied_country: "For any ally", every_allied_country: "For every ally",
    random_allied_country: "For a random ally",
    any_subject_country: "For any subject", all_subject_countries: "For all subjects",
    any_occupied_country: "For any occupied country",
    any_scientist: "For any scientist"
  };

  /* ------------------------------------------------------------- the triggers */

  const TRIGGERS = {
    always: (s) => lc(s.value) === "yes" ? "always" : "never",
    has_war: (s) => lc(s.value) === "yes" ? "is at war" : "is at peace",
    is_at_war: (s) => lc(s.value) === "yes" ? "is at war" : "is at peace",
    has_civil_war: (s) => lc(s.value) === "no" ? "is not in a civil war" : "is in a civil war",
    has_dlc: (s) => "the \"" + (s.value || "") + "\" DLC is active",
    has_country_flag: (s) => "has the flag “" + humanizeId(s.value) + "”",
    has_global_flag: (s) => "the global flag “" + humanizeId(s.value) + "” is set",
    has_state_flag: (s) => "the state has the flag “" + humanizeId(s.value) + "”",
    has_idea: (s) => "has the national spirit " + humanizeId(s.value),
    has_completed_focus: (s) => "has completed the focus " + humanizeId(s.value),
    has_focus_tree: (s) => "uses the " + humanizeId(s.value) + " focus tree",
    focus_progress: (s) => {
      // Sub-block form: focus_progress = { focus = X progress > Y }
      if (s.block) { const t = tokenize(s.block); const f = t.find((x) => lc(x.key) === "focus"); const p = t.find((x) => lc(x.key) === "progress"); return "progress on the focus " + (f ? humanizeId(f.value) : "?") + (p ? " " + (p.op || "≥") + " " + p.value : ""); }
      return "focus progress " + (s.op || "=") + " " + s.value;
    },
    has_government: (s) => "is " + (IDEOLOGY_ADJ[lc(s.value)] || titleCase(s.value)),
    is_fascist: (s) => lc(s.value) === "yes" ? "is fascist" : "is not fascist",
    is_communist: (s) => lc(s.value) === "yes" ? "is communist" : "is not communist",
    is_democratic: (s) => lc(s.value) === "yes" ? "is democratic" : "is not democratic",
    is_neutral: (s) => lc(s.value) === "yes" ? "is non-aligned" : "is not non-aligned",
    has_tech: (s) => "has researched " + humanizeId(s.value),
    tag: (s) => "is " + humanizeId(s.value),
    original_tag: (s) => "was originally " + humanizeId(s.value),
    is_owned_by: (s) => "is owned by " + humanizeId(s.value),
    is_controlled_by: (s) => "is controlled by " + humanizeId(s.value),
    is_core_of: (s) => "is a core of " + humanizeId(s.value),
    is_claimed_by: (s) => "is claimed by " + humanizeId(s.value),
    owns_state: (s) => "owns state " + s.value,
    controls_state: (s) => "controls state " + s.value,
    has_full_control_of_state: (s) => "fully controls state " + s.value,
    is_in_faction: (s) => lc(s.value) === "yes" ? "is in a faction" : "is not in a faction",
    is_in_faction_with: (s) => "is in a faction with " + humanizeId(s.value),
    is_faction_leader: (s) => lc(s.value) === "yes" ? "leads its faction" : "does not lead its faction",
    is_subject_of: (s) => "is a subject of " + humanizeId(s.value),
    is_puppet_of: (s) => "is a puppet of " + humanizeId(s.value),
    is_major: (s) => lc(s.value) === "yes" ? "is a major power" : "is a minor power",
    is_ai: (s) => lc(s.value) === "yes" ? "is AI-controlled" : "is player-controlled",
    has_capitulated: (s) => lc(s.value) === "yes" ? "has capitulated" : "has not capitulated",
    exists: (s) => lc(s.value) === "yes" ? "exists" : "does not exist",
    has_war_with: (s) => "is at war with " + humanizeId(s.value),
    country_exists: (s) => humanizeId(s.value) + " exists",
    date: (s) => "the date is " + (s.op || "") + " " + s.value,
    threat: (s) => "world tension " + (s.op || "=") + " " + pct(s.value),
    has_war_support: (s) => "war support " + (s.op || "=") + " " + pct(s.value),
    has_stability: (s) => "stability " + (s.op || "=") + " " + pct(s.value),
    political_power: (s) => "political power " + (s.op || "=") + " " + s.value,
    num_of_factories: (s) => "total factories " + (s.op || "=") + " " + s.value,
    num_of_military_factories: (s) => "military factories " + (s.op || "=") + " " + s.value,
    num_of_civilian_factories: (s) => "civilian factories " + (s.op || "=") + " " + s.value,
    has_manpower: (s) => "manpower " + (s.op || "=") + " " + s.value,
    // Cleaner phrasings for two unambiguous flat-value comparison triggers (verified real, no scale
    // assumption) that otherwise read as "Command Power > 50" / "Amount Research Slots > 3".
    command_power: (s) => "command power " + (s.op || "=") + " " + s.value,
    amount_research_slots: (s) => "research slots " + (s.op || "=") + " " + s.value,
    controls_province: (s) => "controls province " + s.value,
    has_army_size: (s) => "army size " + (field(s, "size") ? ("≥ " + field(s, "size")) : ""),
    surrender_progress: (s) => "surrender progress " + (s.op || "=") + " " + pct(s.value),
    has_government_transition: (s) => lc(s.value) === "no" ? "is not undergoing a government transition" : "is undergoing a government transition",
    has_dynamic_modifier: (s) => "has the modifier " + humanizeId(field(s, "modifier") || s.value),
    is_fully_controlled_by: (s) => "is fully controlled by " + humanizeId(s.value),
    is_owned_and_controlled_by: (s) => "is owned and controlled by " + humanizeId(s.value),
    free_building_slots: (s) => "has free building slots for " + (BUILDINGS[lc(field(s, "building"))] || humanizeId(field(s, "building") || "buildings")),
    has_game_rule: (s) => "the game rule " + humanizeId(field(s, "rule")) + " is set to " + humanizeId(field(s, "option")),
    original_tag: (s) => "was originally " + humanizeId(s.value),
    has_added_tension_amount: (s) => "has added world tension" + (s.value ? " " + (s.op || "≥") + " " + s.value : ""),
    is_subject: (s) => lc(s.value) === "yes" ? "is a subject" : "is independent",
    is_independent: (s) => lc(s.value) === "no" ? "is a subject" : "is independent",
    has_opinion: (s) => "opinion of " + humanizeId(field(s, "target")) + " " + (field(s, "value") ? (s.op || "≥") + " " + field(s, "value") : ""),
    // ---- data-mined base-game conditions, each verified against real vanilla usage ----
    // sub-block helper: pull a named comparison statement out of `{ … }`
    has_country_leader: (s) => { const c = field(s, "character") || field(s, "name"); return c ? (humanizeId(c) + " is the country leader") : "has the specified country leader"; },
    has_character: (s) => "the character " + humanizeId(s.value) + " is recruited",
    has_equipment: (s) => { const t = (tokenize(s.block || "")[0]); return t ? ("stockpile of " + humanizeId(t.key) + " " + (t.op || "≥") + " " + t.value) : "has the specified equipment"; },
    has_army_manpower: (s) => { const t = tokenize(s.block || "").find((x) => lc(x.key) === "size"); return "army manpower " + (t ? (t.op || "≥") + " " + t.value : "available"); },
    has_navy_size: (s) => { const toks = tokenize(s.block || ""); const sz = toks.find((x) => lc(x.key) === "size"); const u = toks.find((x) => lc(x.key) === "unit"); return (u ? humanizeId(u.value) + " count " : "navy size ") + (sz ? (sz.op || "≥") + " " + sz.value : ""); },
    divisions_in_state: (s) => { const toks = tokenize(s.block || ""); const sz = toks.find((x) => lc(x.key) === "size"); const st = toks.find((x) => lc(x.key) === "state"); return "divisions in state " + (st ? st.value : "?") + " " + (sz ? (sz.op || "≥") + " " + sz.value : ""); },
    strength_ratio: (s) => {
      // Sub-block form: strength_ratio = { tag = X ratio > Y }
      if (s.block) { const t = tokenize(s.block); const r = t.find((x) => lc(x.key) === "ratio"); const tag = t.find((x) => lc(x.key) === "tag"); return "strength ratio" + (tag ? " vs " + humanizeId(tag.value) : "") + (r ? " " + (r.op || "≥") + " " + r.value : ""); }
      return "strength ratio " + (s.op || "≥") + " " + s.value;
    },
    has_war_together_with: (s) => "is at war alongside " + humanizeId(s.value),
    has_autonomy_state: (s) => "is " + humanizeId(s.value),
    has_war_with_major: (s) => lc(s.value) === "no" ? "is not at war with a major power" : "is at war with a major power",
    // ---- data-mined diplomacy / war / leader conditions (were rendering "X is Y") ----
    is_neighbor_of: (s) => "borders " + humanizeId(s.value),
    has_border_war_with: (s) => "is in a border war with " + humanizeId(s.value),
    has_offensive_war_with: (s) => "is in an offensive war with " + humanizeId(s.value),
    has_defensive_war_with: (s) => "is in a defensive war with " + humanizeId(s.value),
    has_wargoal_against: (s) => "has a war goal against " + humanizeId(s.value),
    is_guaranteed_by: (s) => "is guaranteed by " + humanizeId(s.value),
    has_guaranteed: (s) => "has guaranteed " + humanizeId(s.value),
    is_lend_leasing: (s) => "is lend-leasing to " + humanizeId(s.value),
    is_embargoed_by: (s) => "is embargoed by " + humanizeId(s.value),
    has_event_target: (s) => "the event target “" + humanizeId(s.value) + "” is set",
    has_cosmetic_tag: (s) => "is using the cosmetic name " + humanizeId(s.value),
    is_in_tech_sharing_group: (s) => "is in the tech-sharing group " + humanizeId(s.value),
    has_doctrine: (s) => "has the doctrine " + humanizeId(s.value),
    has_decision: (s) => "the decision " + humanizeId(s.value) + " is active",
    has_opinion_modifier: (s) => "has the opinion modifier " + humanizeId(s.value),
    has_idea_with_trait: (s) => "has a national spirit with the trait " + humanizeId(s.value),
    has_country_leader_ideology: (s) => "the country leader's sub-ideology is " + humanizeId(s.value),
    has_country_leader_with_trait: (s) => "the country leader has the trait " + humanizeId(s.value),
    is_special_project_completed: (s) => "the special project " + humanizeId(s.value) + " is completed",
    has_political_power: (s) => "political power " + (s.op || "≥") + " " + s.value,
    has_legitimacy: (s) => "legitimacy " + (s.op || "≥") + " " + s.value,
    has_army_experience: (s) => "army experience " + (s.op || "≥") + " " + s.value,
    has_navy_experience: (s) => "navy experience " + (s.op || "≥") + " " + s.value,
    has_air_experience: (s) => "air experience " + (s.op || "≥") + " " + s.value,
    num_subjects: (s) => "number of subjects " + (s.op || "≥") + " " + s.value,
    num_of_civilian_factories_available_for_projects: (s) => "civilian factories free for projects " + (s.op || "≥") + " " + s.value,
    has_active_mission: (s) => "the mission " + humanizeId(s.value) + " is active",
    has_variable: (s) => "the variable " + humanizeId(s.value) + " is set",
    has_subject: (s) => (lc(s.value) === "yes" ? "has a subject" : lc(s.value) === "no" ? "has no subjects" : "has " + humanizeId(s.value) + " as a subject"),
    is_puppet: (s) => lc(s.value) === "no" ? "is not a puppet" : "is a puppet",
    is_government_in_exile: (s) => lc(s.value) === "no" ? "is not a government-in-exile" : "is a government-in-exile",
    has_defensive_war: (s) => lc(s.value) === "no" ? "is not in a defensive war" : "is in a defensive war",
    has_intelligence_agency: (s) => lc(s.value) === "no" ? "has no intelligence agency" : "has an intelligence agency",
    is_ally_with: (s) => "is allied with " + humanizeId(s.value),
    is_debug: (s) => lc(s.value) === "no" ? "(debug mode is off)" : "(debug mode is on)",
    is_coastal: (s) => lc(s.value) === "no" ? "is not coastal" : "is coastal",
    is_capital: (s) => lc(s.value) === "no" ? "is not the capital" : "is the capital",
    is_island_state: (s) => lc(s.value) === "no" ? "is not an island state" : "is an island state",
    is_demilitarized_zone: (s) => lc(s.value) === "no" ? "is not a demilitarized zone" : "is a demilitarized zone",
    is_historical_focus_on: (s) => lc(s.value) === "no" ? "historical AI focuses are off" : "historical AI focuses are on",
    is_male: (s) => lc(s.value) === "no" ? "is female" : "is male",
    is_on_continent: (s) => "is on the continent " + humanizeId(s.value),
    has_border_war: (s) => lc(s.value) === "no" ? "is not in a border war" : "is in a border war",
    is_power_balance_in_range: (s) => "the balance of power" + (field(s, "id") ? " “" + humanizeId(field(s, "id")) + "”" : "") + " is in the specified range",
    power_balance_value: (s) => { const t = tokenize(s.block || "").find((x) => lc(x.key) === "value"); const id = field(s, "id"); return "balance-of-power value" + (id ? " (" + humanizeId(id) + ")" : "") + (t ? " " + (t.op || "≥") + " " + t.value : ""); },
    // Common conditions that were falling back to raw title-case.
    has_trait: (s) => "has the trait " + humanizeId(field(s, "trait") || s.value),
    has_country_leader_with_trait: (s) => "the country leader has the trait " + humanizeId(s.value),
    is_in_array: (s) => { const arr = field(s, "array") || (s.value ? String(s.value).split("^")[0] : ""); const v = field(s, "value"); return "the list " + humanizeId(arr) + (v ? " contains " + (humanizeId(v)) : " contains a match"); },
    // Two forms, and the long one used to be read as if it were the short one. #check-variable-long-form
    //   short: check_variable = { my_var > 5 }
    //   long : check_variable = { var = my_var value = 5 compare = greater_than }
    // Taking the first statement that has a value picks `var = my_var` in the long form, so the variable
    // was named "Var", its own name was printed as the value, and the threshold and direction were both
    // dropped - making "> 5" and "< 100" read identically.
    check_variable: (s) => {
      const toks = tokenize(s.block || "");
      const named = (n) => { const t = toks.find((x) => lc(x.key) === n); return t ? t.value : null; };
      const v = named("var");
      if (v !== null) {
        const OPS = {
          greater_than: ">", less_than: "<", equals: "=", not_equal: "≠",
          greater_than_or_equals: "≥", less_than_or_equals: "≤",
        };
        const val = named("value");
        // No `compare` means the same default the shorthand path has always assumed.
        const op = OPS[lc(named("compare") || "")] || "≥";
        return "the variable " + humanizeId(v) + " " + op + (val === null ? "" : " " + auto(val));
      }
      const t = toks.find((x) => x.value !== null);
      return t ? ("the variable " + humanizeId(t.key) + " " + (t.op || "≥") + " " + auto(t.value)) : "a variable check";
    },
    has_dynamic_modifier: (s) => "has the modifier " + humanizeId(field(s, "modifier") || s.value)
  };

  /* -------------------------------------------------------------- the effects */
  // Each renderer receives the statement and returns an English string.
  const EFFECTS = {
    // --- resources & nation-wide stats ---
    add_political_power: (s) => "Political power " + flat(s.value),
    add_stability: (s) => "Stability " + pct(s.value),
    set_stability: (s) => "Set stability to " + pct(s.value).replace("+", ""),
    add_war_support: (s) => "War support " + pct(s.value),
    set_war_support: (s) => "Set war support to " + pct(s.value).replace("+", ""),
    add_manpower: (s) => "Manpower " + flat(s.value),
    add_command_power: (s) => "Command power " + flat(s.value),
    add_research_slot: (s) => "Research slots " + flat(s.value),
    set_research_slots: (s) => "Set research slots to " + s.value,
    army_experience: (s) => "Army experience " + flat(s.value),
    navy_experience: (s) => "Navy experience " + flat(s.value),
    air_experience: (s) => "Air experience " + flat(s.value),
    add_army_experience: (s) => "Army experience " + flat(s.value),
    add_navy_experience: (s) => "Navy experience " + flat(s.value),
    add_air_experience: (s) => "Air experience " + flat(s.value),
    add_nuke: (s) => "Nuclear bombs " + flat(s.value),
    add_political_power_gain: (s) => "Political power gain " + pct(s.value),
    add_named_threat: (s) => "World tension " + (fieldNum(s, "threat") !== null ? flat(fieldNum(s, "threat")) : "") + (field(s, "name") ? " (" + humanizeId(field(s, "name")) + ")" : ""),
    set_war_production: (s) => "Set war production",
    add_offsite_building: (s) => "Add " + (fieldNum(s, "level") || "") + " off-map " + (BUILDINGS[lc(field(s, "type"))] || humanizeId(field(s, "type"))),

    // --- advisors / commanders becoming available ---
    show_ideas_tooltip: (s) => humanizeId(s.value) + " becomes available",
    show_unit_leaders_tooltip: (s) => humanizeId(s.value) + " becomes available as a commander",
    show_unit_leader_tooltip: (s) => humanizeId(s.value) + " becomes available as a commander",
    available_political_advisor: (s) => humanizeId(s.value) + " becomes available as a political advisor",
    add_advisor: (s) => "Add advisor: " + humanizeId(field(s, "character") || s.value),
    create_corps_commander: (s) => "Add corps commander: " + (field(s, "name") || humanizeId(s.value)),
    create_field_marshal: (s) => "Add field marshal: " + (field(s, "name") || humanizeId(s.value)),
    create_navy_leader: (s) => "Add admiral: " + (field(s, "name") || humanizeId(s.value)),
    add_country_leader_trait: (s) => "Country leader gains trait: " + humanizeId(s.value),
    remove_country_leader_trait: (s) => "Country leader loses trait: " + humanizeId(s.value),
    add_country_leader_role: (s) => "Add country-leader role: " + humanizeId(field(s, "character") || s.value),
    add_unit_leader_trait: (s) => "Commander gains trait: " + humanizeId(s.value),
    add_ace: (s) => "Add a flying ace" + (field(s, "name") ? ": " + field(s, "name") + " " + (field(s, "surname") || "") : ""),

    // --- states: claims / cores ---
    add_state_claim: (s) => "Claim state " + (field(s, "state") || s.value),
    remove_state_claim: (s) => "Remove claim on state " + (field(s, "state") || s.value),
    add_state_core: (s) => "State " + (field(s, "state") || s.value) + " becomes a core",
    remove_state_core: (s) => "State " + (field(s, "state") || s.value) + " loses its core",
    build_railway: (s) => "Build a level-" + (fieldNum(s, "level") || 1) + " railway",
    add_province_modifier: () => "Add a province modifier",

    // --- factions / decisions (extra forms) ---
    create_faction_from_template: (s) => "Create a faction",
    create_equipment_variant: (s) => "Unlock an equipment variant" + (field(s, "name") ? ": " + field(s, "name") : ""),
    add_to_tech_sharing_group: (s) => "Join the tech-sharing group " + humanizeId(field(s, "tech_sharing_group") || s.value),
    add_breakthrough_progress: (s) => "Progress toward a technology breakthrough " + (s.value !== null ? pct(s.value) : ""),
    activate_targeted_decision: (s) => "Activate decision " + humanizeId(field(s, "decision") || s.value) + (field(s, "target") ? " (targeting " + humanizeId(field(s, "target")) + ")" : ""),
    unlock_decision_category_tooltip: (s) => "Unlock decisions: " + humanizeId(s.value),

    // --- AI / template definitions: not player-facing, intentionally hidden ---
    add_ai_strategy: () => "",
    division_template: () => "",
    set_province_name: () => "",
    add_to_array: () => "",
    clear_array: () => "",
    mark_focus_tree_layout_dirty: () => "",

    // --- ideas / national spirits ---
    add_ideas: (s) => "Gain national spirit: " + ideaList(s),
    add_national_spirit: (s) => "Gain national spirit: " + ideaList(s),
    remove_ideas: (s) => "Remove national spirit: " + ideaList(s),
    remove_ideas_with_trait: (s) => "Remove national spirits with trait " + humanizeId(field(s, "trait") || s.value),
    add_timed_idea: (s) => "Gain national spirit " + humanizeId(field(s, "idea") || s.value) +
      (fieldNum(s, "days") ? " for " + fieldNum(s, "days") + " days" : ""),
    swap_ideas: (s) => "Replace " + humanizeId(field(s, "remove_idea")) + " with " + humanizeId(field(s, "add_idea")),
    // Singular forms — by far the most common idea effects (add_idea = X, or the timed block
    // add_idea = { idea = X days = N }). The plurals above existed but these didn't, so every
    // `add_idea`/`remove_idea` was falling back to the raw "Add Idea: …" title-case.
    add_idea: (s) => "Gain national spirit: " + ideaList(s) + (fieldNum(s, "days") ? " for " + fieldNum(s, "days") + " days" : ""),
    remove_idea: (s) => "Remove national spirit: " + ideaList(s),
    add_dynamic_modifier: (s) => "Gain modifier: " + humanizeId(field(s, "modifier") || s.value),
    remove_dynamic_modifier: (s) => "Remove modifier: " + humanizeId(field(s, "modifier") || s.value),

    // --- research & tech ---
    set_technology: (s) => "Unlock technology: " + techList(s),
    add_tech_bonus: (s) => {
      const b = fieldNum(s, "bonus"); const cat = field(s, "category") || field(s, "technology") || field(s, "ahead_reduction");
      const uses = fieldNum(s, "uses");
      return "Research bonus" + (b ? " " + pct(b) : "") + (cat ? " to " + humanizeId(cat) : "") + (uses ? " (" + uses + " use" + (uses > 1 ? "s" : "") + ")" : "");
    },
    add_doctrine_cost_reduction: (s) => "Doctrine cost reduction" + (fieldNum(s, "cost_reduction") ? " " + pct(fieldNum(s, "cost_reduction")) : ""),
    add_mastery_bonus: (s) => "Naval mastery bonus" + (fieldNum(s, "bonus") !== null ? " " + pct(fieldNum(s, "bonus")) : "") +
      (field(s, "track") ? " to " + humanizeId(field(s, "track")) : "") + (fieldNum(s, "days") ? " for " + fieldNum(s, "days") + " days" : ""),
    add_mastery: (s) => "Naval mastery " + flat(fieldNum(s, "amount") !== null ? fieldNum(s, "amount") : s.value) + (field(s, "track") ? " (" + humanizeId(field(s, "track")) + " track)" : ""),
    // add_daily_mastery = { amount = 0.5 days = 100 name = … } — a timed naval-mastery trickle.
    add_daily_mastery: (s) => "Naval mastery " + flat(fieldNum(s, "amount")) + "/day" + (field(s, "days") ? " for " + field(s, "days") + " days" : ""),

    // --- buildings & states ---
    add_building_construction: (s) => {
      const type = field(s, "type"); const lvl = fieldNum(s, "level");
      const bn = BUILDINGS[lc(type)] || humanizeId(type);
      return "Build " + (lvl ? lvl + " " : "") + (lvl ? plural(bn, lvl) : bn);
    },
    add_extra_state_shared_building_slots: (s) => "Shared building slots " + flat(s.value),
    set_building_level: (s) => {
      const bn = BUILDINGS[lc(field(s, "type"))] || humanizeId(field(s, "type") || "building");
      return "Set " + bn + " to level " + (field(s, "level") || "?") + (field(s, "province") ? " in province " + field(s, "province") : "");
    },
    add_resource: (s) => {
      const t = field(s, "type"); const a = fieldNum(s, "amount");
      return (a !== null ? flat(a) + " " : "Add ") + (RESOURCES[lc(t)] || humanizeId(t)) + (a !== null ? "" : " production");
    },
    set_state_category: (s) => "Set state category to " + humanizeId(field(s, "category") || s.value),
    set_state_owner: (s) => "Owner becomes " + humanizeId(field(s, "add") || s.value),
    set_state_controller: (s) => "Controller becomes " + humanizeId(field(s, "add") || s.value),
    transfer_state: (s) => "Transfer state " + s.value,
    add_core_of: (s) => "Becomes a core of " + humanizeId(s.value),
    remove_core_of: (s) => "No longer a core of " + humanizeId(s.value),
    add_claim_by: (s) => "Claimed by " + humanizeId(s.value),
    remove_claim_by: (s) => "Claim removed by " + humanizeId(s.value),
    add_victory_points: (s) => "Victory points in province (" + (s.block ? s.block.trim().split(/\s+/).join(", ") : s.value) + ")",
    set_capital: (s) => "Move capital to state " + (field(s, "state") || s.value),

    // --- politics & diplomacy ---
    set_politics: (s) => {
      const rp = field(s, "ruling_party");
      return rp ? IDEOLOGY_NOUN[lc(rp)] ? "The " + IDEOLOGY_NOUN[lc(rp)] + " party takes power" : titleCase(rp) + " takes power" : "Change governing politics";
    },
    add_popularity: (s) => popularityPhrase(s),
    set_party_popularity: (s) => popularityPhrase(s),
    set_popularities: () => "Set party popularities",
    retire_country_leader: () => "The current country leader retires",
    promote_leader: () => "Promote a new country leader",
    create_country_leader: (s) => "Add country leader: " + (field(s, "name") || humanizeId(s.value)),
    set_party_name: (s) => "Rename the " + humanizeId(field(s, "ideology")) + " party",
    start_civil_war: (s) => "Start a civil war" + (field(s, "ideology") ? " (" + (IDEOLOGY_ADJ[lc(field(s, "ideology"))] || humanizeId(field(s, "ideology"))) + " rebels)" : ""),
    annex_country: (s) => "Annex " + humanizeId(field(s, "target") || s.value),
    puppet: (s) => "Puppet " + humanizeId(field(s, "target") || s.value),
    end_puppet: (s) => "Free " + humanizeId(field(s, "target") || s.value) + " from being a puppet",
    release: (s) => "Release " + humanizeId(s.value) + " as a nation",
    release_autonomy: (s) => "Change autonomy of " + humanizeId(field(s, "target") || s.value),
    release_puppet: (s) => "Release " + humanizeId(field(s, "target") || s.value) + " as a puppet",
    give_guarantee: (s) => "Guarantee the independence of " + humanizeId(field(s, "target") || s.value),
    give_military_access: (s) => "Grant military access to " + humanizeId(field(s, "target") || s.value),
    // Saves the current scope (country/state/unit) under a name you can refer to later in scripts.
    save_event_target_as: (s) => "Save this as a reusable target: \"" + (s.value || field(s, "name") || "") + "\"",
    clear_global_event_target: (s) => "Clear the global event target" + (s.value ? " \"" + humanizeId(s.value) + "\"" : ""),
    clear_global_event_targets: () => "Clear all global event targets",
    give_resource_rights: (s) => "Give resource rights" + (field(s, "state") ? " in state " + field(s, "state") : "") + (field(s, "receiver") ? " to " + humanizeId(field(s, "receiver")) : ""),
    add_power_balance_modifier: (s) => "Add a balance-of-power modifier" + (field(s, "id") ? " to \"" + humanizeId(field(s, "id")) + "\"" : ""),
    remove_power_balance: (s) => "Remove the balance of power" + (field(s, "id") ? " \"" + humanizeId(field(s, "id")) + "\"" : ""),
    add_to_faction: (s) => "Add " + humanizeId(s.value) + " to your faction",
    remove_from_faction: (s) => "Remove " + humanizeId(s.value) + " from its faction",
    create_faction: (s) => "Create a faction: " + (field(s, "name") || humanizeId(s.value)),
    set_faction_name: (s) => "Rename the faction to " + (s.value || field(s, "name") || ""),
    add_legitimacy: (s) => "Legitimacy " + flat(fieldNum(s, "legitimacy") !== null ? fieldNum(s, "legitimacy") : s.value),
    create_operative_leader: (s) => "Add an operative (spy)" + (field(s, "name") ? ": " + field(s, "name") : ""),
    event_option_tooltip: () => "",
    declare_war_on: (s) => "Declare war on " + humanizeId(field(s, "target") || s.value),
    add_to_war: (s) => "Join the war: " + humanizeId(field(s, "targeted_alliance") || field(s, "enemy") || s.value),
    create_wargoal: (s) => "Create a war goal against " + humanizeId(field(s, "target") || s.value),
    add_opinion_modifier: (s) => "Opinion modifier with " + humanizeId(field(s, "target")) + " (" + humanizeId(field(s, "modifier")) + ")",
    remove_opinion_modifier: (s) => "Remove opinion modifier with " + humanizeId(field(s, "target")),
    diplomatic_relation: (s) => "Set diplomatic relation with " + humanizeId(field(s, "country")),
    set_cosmetic_tag: (s) => "Rename the country to " + humanizeId(s.value),
    drop_cosmetic_tag: () => "Restore the country's original name",
    puppet_and_take_states: (s) => "Puppet " + humanizeId(field(s, "target") || s.value) + " and take states",
    set_autonomy: (s) => "Set " + humanizeId(field(s, "target")) + "'s autonomy to " + humanizeId(field(s, "autonomy_state") || s.value),
    // Subject autonomy: ratio moves toward freedom/integration (a fraction → %), score is a flat
    // progress value toward the next autonomy level. The `localization` sub-field is a tooltip key.
    add_autonomy_ratio: (s) => "Autonomy " + pct(field(s, "value") !== null ? field(s, "value") : s.value),
    add_autonomy_score: (s) => "Autonomy score " + flat(field(s, "value") !== null ? field(s, "value") : s.value),
    add_equipment_subsidy: (s) => "Subsidize " + humanizeId(field(s, "equipment_type") || "equipment") + " production" + (field(s, "cic") ? " (" + field(s, "cic") + " CIC)" : ""),
    // — base-game event/decision effects data-mined from 11,943 event + 5,378 decision blocks —
    clear_variable: (s) => "Clear variable: " + humanizeId(s.value),
    white_peace: (s) => "White peace with " + humanizeId(s.value),
    reverse_add_opinion_modifier: (s) => "Add opinion modifier " + humanizeId(field(s, "modifier")) + " from " + humanizeId(field(s, "target") || "the target"),
    uncomplete_national_focus: (s) => "Un-complete the focus " + humanizeId(field(s, "focus") || s.value),
    leave_faction: () => "Leave the current faction",
    dismantle_faction: () => "Dismantle the faction",
    transfer_ship: (s) => "Transfer a " + humanizeId(field(s, "type") || "ship") + (field(s, "target") ? " to " + humanizeId(field(s, "target")) : ""),
    // Gift stockpiled equipment to another country. `equipment` or `type` is the archetype,
    // `amount` the quantity, `target` the recipient.
    send_equipment: (s) => "Send " + (field(s, "amount") || "some") + " " + humanizeId(field(s, "equipment") || field(s, "type") || "equipment") + (field(s, "target") ? " to " + humanizeId(field(s, "target")) : ""),
    // Spawn a finished ship of a named variant. `creator` is the country that receives/builds it.
    create_ship: (s) => "Add a ship" + (field(s, "equipment_variant") ? ': "' + field(s, "equipment_variant") + '"' : (field(s, "type") ? " (" + humanizeId(field(s, "type")) + ")" : "")) + (field(s, "creator") ? " for " + humanizeId(field(s, "creator")) : ""),
    activate_advisor: (s) => "Activate the advisor " + humanizeId(s.value),
    remove_mission: (s) => "Remove the mission " + humanizeId(s.value),
    start_border_war: () => "Start a border war",
    cancel_border_war: () => "Cancel the border war",
    destroy_ships: (s) => "Destroy " + (field(s, "count") || "some") + " " + humanizeId(field(s, "type") || "ship") + " ships",
    delete_units: () => "Delete units of a division template",
    remove_country_leader_role: (s) => "Remove a country-leader role from " + humanizeId(field(s, "character") || "the character"),
    remove_targeted_decision: (s) => "Remove the targeted decision " + humanizeId(field(s, "decision") || s.value),
    break_embargo: (s) => "Break the embargo with " + humanizeId(s.value),
    send_embargo: (s) => "Embargo " + humanizeId(field(s, "target") || s.value),
    reduce_focus_completion_cost: (s) => "Speed up the current focus" + (fieldNum(s, "decimal") !== null ? " (" + pct(fieldNum(s, "decimal")) + ")" : (num(s.value) !== null ? " (" + pct(num(s.value)) + ")" : "")),
    delete_unit_template_and_units: (s) => "Delete the division template " + humanizeId(field(s, "division_template") || s.value) + " and its units",
    modify_building_resources: (s) => "Modify a building's resource output",
    add_faction_goal: () => "Add a faction goal",
    add_faction_goal_slot: () => "Add a faction goal slot",
    set_faction_manifest: () => "Set the faction manifest",
    gain_random_agency_upgrade: () => "Gain a random intelligence-agency upgrade",
    set_division_template_lock: (s) => "Lock the division template " + humanizeId(field(s, "division_template") || s.value),
    activate_mission_tooltip: () => "",

    // --- flags ---
    set_country_flag: (s) => "Set country flag: " + humanizeId(flagName(s)),
    clr_country_flag: (s) => "Clear country flag: " + humanizeId(flagName(s)),
    modify_country_flag: (s) => "Modify country flag: " + humanizeId(flagName(s)),
    set_global_flag: (s) => "Set global flag: " + humanizeId(flagName(s)),
    clr_global_flag: (s) => "Clear global flag: " + humanizeId(flagName(s)),
    set_state_flag: (s) => "Set state flag: " + humanizeId(flagName(s)),
    clr_state_flag: (s) => "Clear state flag: " + humanizeId(flagName(s)),

    // --- focuses / decisions / events ---
    complete_national_focus: (s) => "Instantly complete the focus " + humanizeId(s.value),
    unlock_national_focus: (s) => "Unlock the focus " + humanizeId(s.value),
    load_focus_tree: (s) => "Switch to the " + humanizeId(field(s, "tree") || s.value) + " focus tree",
    activate_mission: (s) => "Activate mission: " + humanizeId(field(s, "mission") || s.value),
    activate_decision: (s) => "Activate decision: " + humanizeId(field(s, "decision") || s.value),
    unlock_decision_category: (s) => "Unlock decision category: " + humanizeId(s.value),
    unlock_decision_tooltip: (s) => "Unlock decision: " + humanizeId(s.value),
    country_event: (s) => "Trigger event " + (field(s, "id") || humanizeId(s.value)) + eventDelay(s),
    news_event: (s) => "Trigger news event " + (field(s, "id") || humanizeId(s.value)) + eventDelay(s),
    state_event: (s) => "Trigger state event " + (field(s, "id") || humanizeId(s.value)) + eventDelay(s),

    // --- military ---
    add_equipment_to_stockpile: (s) => "Add " + (fieldNum(s, "amount") || "") + " " + humanizeId(field(s, "type")) + " to the stockpile",
    add_equipment_production: (s) => {
      // Form: add_equipment_production = { equipment = { type = X version_name = "Y" } name = "Z" … }
      let what = field(s, "name");
      if (!what) {
        const eqStmt = tokenize(s.block || "").find((x) => lc(x.key) === "equipment");
        if (eqStmt && eqStmt.block) {
          const et = tokenize(eqStmt.block);
          const vn = et.find((x) => lc(x.key) === "version_name");
          const ty = et.find((x) => lc(x.key) === "type");
          what = (vn && vn.value) || (ty ? humanizeId(ty.value) : null);
        }
      }
      return "Start production of " + (what || "equipment");
    },
    set_rule: () => "Set special country rules",
    add_doctrine_cost_reduction_: () => "Doctrine cost reduction",
    start_resistance: () => "Start resistance",

    // --- character / leaders ---
    add_corps_commander_role: (s) => "Promote " + humanizeId(field(s, "character") || s.value) + " to corps commander",
    add_field_marshal_role: (s) => "Promote " + humanizeId(field(s, "character") || s.value) + " to field marshal",
    promote_character: (s) => "Promote character " + humanizeId(field(s, "character") || s.value),
    add_advisor_role: (s) => "Add advisor: " + humanizeId(field(s, "character") || s.value),
    set_character_name: (s) => "Rename character " + humanizeId(s.value),

    // --- variables (advanced) ---
    set_variable: (s) => "Set variable " + variableDesc(s, { connector: "to", assign: true }),
    add_to_variable: (s) => "Increase variable " + variableDesc(s),
    subtract_from_variable: (s) => "Decrease variable " + variableDesc(s),
    multiply_variable: (s) => "Scale variable " + variableDesc(s),
    divide_variable: (s) => "Scale variable " + variableDesc(s),
    set_temp_variable: () => "",
    add_to_temp_variable: () => "",
    multiply_temp_variable: () => "",
    subtract_from_temp_variable: () => "",
    clamp_variable: () => "",

    // --- misc common effects ---
    add_threat: (s) => "World tension " + flat(fieldNum(s, "threat") !== null ? fieldNum(s, "threat") : s.value),
    add_trait: (s) => "Gain trait: " + humanizeId(field(s, "trait") || s.value),
    remove_trait: (s) => "Lose trait: " + humanizeId(field(s, "trait") || s.value),
    swap_ruler_traits: (s) => "Change the country leader's traits",
    set_power_balance: (s) => "Adjust the power balance" + (field(s, "id") ? " (" + humanizeId(field(s, "id")) + ")" : ""),
    add_power_balance_value: (s) => "Shift the power balance " + flat(fieldNum(s, "value")),
    add_faction_initiative: (s) => "Faction initiative " + flat(s.value),
    add_relation_modifier: (s) => "Relation modifier with " + humanizeId(field(s, "target")) + " (" + humanizeId(field(s, "modifier")) + ")",
    add_days_mission_timeout: (s) => "Extend a mission's timer by " + (field(s, "days") || s.value) + " days",
    retire_character: (s) => humanizeId(field(s, "character") || s.value) + " retires",
    kill_country_leader: () => "The country leader dies",
    set_nationality: (s) => "Change nationality to " + humanizeId(field(s, "character") || s.value),

    // --- construction / units / territory (common, were falling back to raw title-case) ---
    instant_build: () => "Instantly finish all current construction",
    create_unit: (s) => "Deploy a division" + (field(s, "owner") ? " for " + humanizeId(field(s, "owner")) : "") +
      (field(s, "division") && /location\s*=\s*(\d+)/.test(field(s, "division")) ? " in state " + field(s, "division").match(/location\s*=\s*(\d+)/)[1] : ""),
    transfer_state_to: (s) => "Give this state to " + humanizeId(s.value || field(s, "target")),
    remove_from_array: () => "", // array bookkeeping — silent, like add_to_array / the temp-variable ops

    // --- tooltip / control passthroughs (handled mostly in render) ---
    custom_effect_tooltip: (s) => tooltipText(s),
    effect_tooltip: (s) => translate(s.block || ""),
    custom_trigger_tooltip: (s) => translate(s.block || "")
  };

  /* --------------------------------------------------------- effect helpers   */

  function flagName(s) {
    if (s.value) return s.value;
    return field(s, "flag") || "";
  }
  function ideaList(s) {
    if (s.value) return humanizeId(s.value);
    if (!s.block) return "";
    const toks = tokenize(s.block);
    // form { idea = x } or { a b c } or { limit={} idea=x }
    const ideas = [];
    toks.forEach(t => { if (lc(t.key) === "idea" && t.value) ideas.push(humanizeId(t.value)); });
    if (ideas.length === 0) s.block.split(/\s+/).map(x => x.trim()).filter(x => x && x !== "=" && !/^(limit|idea)$/i.test(x)).forEach(x => ideas.push(humanizeId(x)));
    return ideas.join(", ");
  }
  function techList(s) {
    if (s.value) return humanizeId(s.value);
    if (!s.block) return "";
    return tokenize(s.block).filter(t => t.value !== null).map(t => humanizeId(t.key)).join(", ");
  }
  function variableDesc(s, opts) {
    // forms: var = N | { var = name value = N }
    // opts.connector: "by" for the delta verbs (add/subtract/scale) or "to" for set_variable, which
    // is an assignment — "Set X by +100" reads like a delta. opts.assign also drops the leading +/-
    // sign the delta formatter adds, so a set reads "to 100" rather than "to +100".
    const conn = (opts && opts.connector) || "by";
    const fmt = (opts && opts.assign) ? assignVal : auto;
    if (s.value) {
      // "varname" alone or "varname = N" already split into key/value upstream
      return humanizeId(s.value);
    }
    const v = field(s, "var"); const val = field(s, "value");
    if (v) return humanizeId(v) + (val !== null ? " " + conn + " " + fmt(val) : "");
    // pattern { some_var = 5 }
    const toks = s.block ? tokenize(s.block) : [];
    if (toks.length) return humanizeId(toks[0].key) + (toks[0].value !== null ? " " + conn + " " + fmt(toks[0].value) : "");
    return "";
  }
  // Unsigned value formatter for assignments (set_variable): mirrors auto() but without the +/- sign.
  function assignVal(v) {
    const n = num(v); if (n === null) return humanizeId(v);
    if (n !== 0 && Math.abs(n) < 1) return (Math.round(n * 1000) / 10) + "%";
    return (Math.round(n * 1000) / 1000).toString();
  }
  function tooltipText(s) {
    const key = s.value || field(s, "localization_key") || "";
    if (/skip/i.test(key)) return "";
    return humanizeId(String(key).split("|").pop().replace(/_(tt|tooltip|desc)$/i, ""));
  }
  function popularityPhrase(s) {
    const ideo = field(s, "ideology");
    // `ideology = ROOT` (vanilla pattern) means the current ruling party's ideology, not a country.
    const who = /^(ROOT|THIS|FROM|PREV|OWNER)$/i.test(String(ideo || ""))
      ? "The ruling party's"
      : (IDEOLOGY_NOUN[lc(ideo)] || humanizeId(ideo || s.value));
    const pNum = fieldNum(s, "popularity");
    const pRaw = field(s, "popularity");
    // popularity can be a number (→ %), a variable reference (→ "set to <var>"), or absent.
    const amt = pNum !== null ? " " + pct(pNum) : (pRaw ? " set to " + humanizeId(pRaw) : " changed");
    return who + " popularity" + amt;
  }

  /* ----------------------------------------------------------- the renderer   */

  // Recursion guard for scripted_effect resolution (module-level; render is synchronous).
  let _scriptedDepth = 0;
  let _scriptedTrigDepth = 0;

  // Render a list of statements (already tokenised) into a clause list.
  function renderStatements(stmts, ctx) {
    ctx = ctx || { depth: 0 };
    if (ctx.depth > 12) return [];
    const parts = [];
    for (const s of stmts) {
      const piece = renderStatement(s, ctx);
      if (piece && piece.trim()) parts.push(piece.trim());
    }
    return parts;
  }

  function renderTriggerStatements(stmts, ctx) {
    const parts = [];
    for (const s of stmts) {
      const p = renderTrigger(s, ctx);
      if (p && p.trim()) parts.push(p.trim());
    }
    return parts;
  }

  // The trigger-side twin of renderBlockBody: split a block into its `limit` and the remaining
  // TRIGGERS. renderBlockBody itself cannot be used here because it renders the rest as EFFECTS.
  function renderTriggerBlockBody(blockText, ctx) {
    const toks = tokenize(blockText || "");
    let limit = "";
    const rest = [];
    for (const t of toks) {
      if (lc(t.key) === "limit") limit = renderTriggerStatements(tokenize(t.block || ""), ctx).join(", ");
      else rest.push(t);
    }
    return { limit: limit, body: renderTriggerStatements(rest, ctx) };
  }

  // #trigger-if-drops-its-own-condition — an `if` inside a condition field used to fall through to the
  // generic block fallback, which renders the body and drops `limit` to "" (see the note on that line:
  // "handled by parent" — for an `if` there was no parent). The guard vanished and its payload was
  // promoted to a hard requirement, so vanilla's australia.txt read as demanding Dominion AND Satellite
  // status at once, with a NOT silently deleted. The effect renderer has done this correctly all along
  // via renderIf; this is the same shape for triggers.
  function renderTriggerIf(s, ctx) {
    const body = renderTriggerBlockBody(s.block, { depth: ((ctx && ctx.depth) || 0) + 1 });
    if (!body.body.length) return "";
    const payload = body.body.join(", ");
    const isElse = lc(s.key) === "else";
    if (body.limit) return (isElse ? "otherwise if " : "if ") + body.limit + ", then " + payload;
    // `else = { ... }` carries no limit of its own; it is the fallback of the if before it.
    return isElse ? "otherwise " + payload : payload;
  }
  function renderTrigger(s, ctx) {
    const k = lc(s.key);
    if (k === "limit") return ""; // consumed by renderTriggerIf, or by an effect-side renderBlockBody
    // Conditionals are TRIGGERS too — data/hoi4-spec.json lists if / else_if / else among its 566.
    // Without this they fall to the generic block fallback below, which drops the limit and states
    // the consequent as an unconditional requirement. #trigger-if-drops-its-own-condition
    if (k === "if" || k === "else_if" || k === "else") return renderTriggerIf(s, ctx);
    // display-only: a bare `tooltip = key` inside a trigger (or custom_trigger_tooltip) has no logic.
    if (k === "tooltip") return "";
    // custom_trigger_tooltip / custom_override_tooltip just wrap real triggers with a display string —
    // render the conditions inside and drop the wrapper + its `tooltip` line.
    if (k === "custom_trigger_tooltip" || k === "custom_override_tooltip") {
      const inner = renderTriggerStatements(tokenize(s.block || ""), ctx);
      return inner.length ? inner.join(", ") : "";
    }
    // hidden_trigger just hides real conditions from the tooltip — render the inner logic, drop the wrapper.
    if (k === "hidden_trigger") {
      const inner = renderTriggerStatements(tokenize(s.block || ""), ctx);
      return inner.length ? inner.join(", ") : "";
    }
    // display-only decision fields (which states to highlight on the map, hide rules) — no logic to state.
    if (k === "highlight_state_targets" || k === "highlight_states_trigger" || k === "has_hide_rule" ||
        k === "highlight_color_while_active" || k === "highlight_color_before_active") return "";
    if (k === "not") { const inner = renderTriggerStatements(tokenize(s.block || ""), ctx); return inner.length ? "not (" + inner.join(", ") + ")" : ""; }
    if (k === "and") { const inner = renderTriggerStatements(tokenize(s.block || ""), ctx); return inner.length ? "(" + inner.join(" and ") + ")" : ""; }
    if (k === "or") { const inner = renderTriggerStatements(tokenize(s.block || ""), ctx); return inner.length ? "(" + inner.join(" or ") + ")" : ""; }
    // #count-triggers-reads-as-a-list — these three shared one branch that flattened them to a comma
    // list, so three different meanings produced the same sentence. any_of ("at least one of") read
    // exactly like all_of ("all of"), which is the same failure shape as two opposite values rendering
    // identically. They are AND and OR by another name, so they reuse the style the neighbours set.
    if (k === "all_of" || k === "any_of") {
      const inner = renderTriggerStatements(tokenize(s.block || ""), ctx);
      return inner.length ? "(" + inner.join(k === "all_of" ? " and " : " or ") + ")" : "";
    }
    // count_triggers = { amount = N … } is "at least N of the following are true". `amount` is not one
    // of the conditions, and listing it as one both invented a requirement and hid the real rule.
    if (k === "count_triggers") {
      const toks = tokenize(s.block || "");
      const amt = toks.find((x) => lc(x.key) === "amount");
      const inner = renderTriggerStatements(toks.filter((x) => lc(x.key) !== "amount"), ctx);
      if (!inner.length) return "";
      const n = amt && amt.value != null ? String(amt.value) : "";
      return (n ? "at least " + n + " of " : "any of ") + "(" + inner.join(", ") + ")";
    }
    if (TRIGGERS[k]) { try { return TRIGGERS[k](s); } catch (e) { return ""; } }
    if (SCOPES[k] && s.block) {
      const inner = renderTriggerStatements(tokenize(s.block), { depth: (ctx.depth || 0) + 1 });
      return inner.length ? SCOPES[k].replace(/^In |^For /, "") + ": " + inner.join(", ") : "";
    }
    if (MODIFIERS[k] && s.value !== null) return MODIFIERS[k] + " " + modVal(k, s.value);
    // scripted_trigger resolution — a `NAME = yes` call to a custom condition defined in
    // common/scripted_triggers. Resolve only SIMPLE bodies (no $PARAM$, bounded recursion, short
    // result) and only when called positively; anything else falls through to the title-cased name.
    const ST = root.GENESIS_SCRIPTED_TRIGGERS;
    if (ST && typeof ST[s.key] === "string" && lc(s.value) === "yes" && _scriptedTrigDepth < 2 && ST[s.key].indexOf("$") === -1) {
      _scriptedTrigDepth++;
      let joined = "";
      try {
        const parts = renderTriggerStatements(tokenize(ST[s.key]), { depth: (ctx.depth || 0) + 1 });
        joined = parts.filter(Boolean).join(", ");
      } finally { _scriptedTrigDepth--; }
      if (joined && joined.length <= 200) return joined;
    }
    // numeric comparison fallback
    if (s.value !== null && s.op && s.op !== "=") return humanizeId(s.key) + " " + s.op + " " + s.value;
    if (s.value !== null) {
      // An unknown boolean condition reads far better as a plain clause than "X is Yes/No":
      //   has_resistance = yes -> "has resistance",  has_resistance = no -> "not has resistance".
      const lv = lc(s.value);
      if (lv === "yes") return lc(humanizeId(s.key));
      if (lv === "no") return "not " + lc(humanizeId(s.key));
      return humanizeId(s.key) + " is " + humanizeId(s.value);
    }
    if (s.block) { const inner = renderTriggerStatements(tokenize(s.block), ctx); return inner.length ? humanizeId(s.key) + ": " + inner.join(", ") : ""; }
    return humanizeId(s.key);
  }

  function renderStatement(s, ctx) {
    const k = lc(s.key);
    const d2 = { depth: (ctx.depth || 0) + 1 };

    // control flow
    if (k === "if" || k === "else_if") return renderIf(s, ctx);
    if (k === "else") { const body = renderBlockBody(s.block, d2); return body.body.length ? "Otherwise: " + joinClauses(body.body) : ""; }
    if (k === "hidden_effect") { const inner = renderStatements(tokenize(s.block || ""), d2); return inner.length ? joinClauses(inner) : ""; }
    if (k === "random_list") return renderRandomList(s, d2);
    // #random-states-its-odds — `chance` is the probability, not an effect. Running it through the
    // effect path produced "Chance: +50" as though it were something that happens, and left the real
    // likelihood as the word "Possibly", which reads identically for a 5% chance and a 95% one.
    if (k === "random" && s.block) {
      const toks = tokenize(s.block);
      const ch = toks.find((x) => lc(x.key) === "chance");
      const lim = toks.find((x) => lc(x.key) === "limit");
      const body = renderStatements(toks.filter((x) => lc(x.key) !== "chance" && lc(x.key) !== "limit"), d2);
      if (!body.length) return "";
      const odds = ch && ch.value != null ? String(ch.value).replace(/%$/, "") + "% chance" : "Possibly";
      const limTxt = lim ? renderTriggerStatements(tokenize(lim.block || ""), d2).join(", ") : "";
      return (limTxt ? odds + " if " + limTxt : odds) + ": " + joinClauses(body);
    }
    // #while-loop-drops-its-condition — renderBlockBody already separates the limit; this used only
    // .body and discarded .limit, so "repeat while at war" and "repeat forever" read the same. Same
    // shape as the trigger-side `if`: the controlling clause is parsed and then thrown away.
    if (k === "while_loop_effect") {
      const inner = renderBlockBody(s.block, d2);
      if (!inner.body.length) return "";
      return (inner.limit ? "While " + inner.limit + ", repeat: " : "Repeat: ") + joinClauses(inner.body);
    }
    if (k === "meta_effect") { const inner = renderStatements(tokenize(s.block || ""), d2); return inner.length ? joinClauses(inner) : ""; }

    // scopes
    if (SCOPES[k] && s.block) {
      const body = renderBlockBody(s.block, d2);
      if (body.body.length === 0) return "";
      let prefix = SCOPES[k];
      if (body.limit) prefix += " (where " + body.limit + ")";
      return prefix + ": " + joinClauses(body.body);
    }

    // numeric state scope e.g. `123 = { ... }`
    if (/^\d+$/.test(s.key) && s.block) {
      const body = renderBlockBody(s.block, d2);
      return body.body.length ? "State " + s.key + ": " + joinClauses(body.body) : "";
    }

    // country-tag / dynamic-target scope e.g. `GER = { ... }`, `ROOT = { ... }`,
    // `event_target:foo = { ... }`, `var:bar = { ... }`
    if (s.block && (/^[A-Z][A-Z0-9]{2}$/.test(s.key) || /^(ROOT|FROM|PREV|THIS|OWNER|CONTROLLER|OVERLORD)(\.[A-Z]+)*$/.test(s.key) || /^(event_target|var):/i.test(s.key))) {
      const who = /^(event_target|var):/i.test(s.key) ? humanizeId(s.key.split(":")[1]) : humanizeId(s.key);
      const body = renderBlockBody(s.block, d2);
      return body.body.length ? "For " + who + ": " + joinClauses(body.body) : "";
    }

    // known effect
    if (EFFECTS[k]) {
      try { const out = EFFECTS[k](s); return out || ""; } catch (e) { /* fall through */ }
    }

    // known modifier (spirit / dynamic modifier context)
    if (MODIFIERS[k] && s.value !== null && s.block === null) {
      return MODIFIERS[k] + " " + modVal(k, s.value);
    }

    // structural / loop-control / noise we intentionally drop (not player-facing effects)
    if (k === "tooltip" || k === "log" || k === "indent" || k === "marker" || k === "show_mio_tooltip" || k === "character_list_tooltip") return "";
    if (k === "random_select_amount" || k === "pick_random_target" || k === "ratio") return "";
    // ai_chance is the AI's option/decision WEIGHTING (factor + modifiers), not a player-facing
    // effect — when it sits beside real effects it added pure noise ("Ai Chance: Factor: +1; …").
    // It is never a standalone editable field (the makers' effect fields hold only effects).
    if (k === "ai_chance") return "";
    if (k === "limit") return ""; // shouldn't reach; handled by parent

    // scripted_effect resolution — a mod/country `NAME = yes` call to a custom effect defined in
    // common/scripted_effects. We resolve only SIMPLE wrapper bodies: no $PARAM$ substitution, bounded
    // recursion, and the rendered result must be short. Anything complex (variable math, long bodies,
    // parameterised) falls through to the title-cased name below — so this never makes output worse.
    const SE = root.GENESIS_SCRIPTED_EFFECTS;
    if (SE && typeof SE[s.key] === "string" && _scriptedDepth < 2 && SE[s.key].indexOf("$") === -1) {
      _scriptedDepth++;
      let joined = "";
      try {
        const parts = renderStatements(tokenize(SE[s.key]), { depth: (ctx.depth || 0) + 1 });
        joined = joinClauses(parts.filter(Boolean));
      } finally { _scriptedDepth--; }
      if (joined && joined.length <= 200) return joined;
    }

    // generic fallbacks
    if (s.value !== null) {
      if (lc(s.value) === "yes") return humanizeId(s.key);
      if (lc(s.value) === "no") return "Not " + lc(humanizeId(s.key));
      return humanizeId(s.key) + ": " + modVal(s.key, s.value);
    }
    if (s.block) {
      const body = renderBlockBody(s.block, d2);
      return body.body.length ? humanizeId(s.key) + ": " + joinClauses(body.body) : humanizeId(s.key);
    }
    return humanizeId(s.key);
  }

  // Split a block into its `limit` (as trigger text) and rendered effect clauses.
  function renderBlockBody(blockText, ctx) {
    const toks = tokenize(blockText || "");
    let limit = "";
    const effectToks = [];
    for (const t of toks) {
      if (lc(t.key) === "limit") {
        const lt = renderTriggerStatements(tokenize(t.block || ""), ctx);
        limit = lt.join(", ");
      } else {
        effectToks.push(t);
      }
    }
    return { limit: limit, body: renderStatements(effectToks, ctx) };
  }

  function renderIf(s, ctx) {
    const body = renderBlockBody(s.block, { depth: (ctx.depth || 0) + 1 });
    if (body.body.length === 0) return "";
    const payload = joinClauses(body.body);
    // #else-if-reads-as-a-second-if — renderIf serves both `if` and `else_if`, and used the same word for
    // each. An else_if only applies when the branch before it did NOT, so rendering it as a bare "If" made
    // mutually exclusive branches read as though both could happen at once — the same harm the trigger-side
    // `if` caused, where two branches became simultaneous requirements.
    const lead = lc(s.key) === "else_if" ? "Otherwise if " : "If ";
    if (body.limit) return lead + body.limit + ", then " + lowerFirst(payload);
    return payload;
  }

  function renderRandomList(s, ctx) {
    // random_list = { 50 = { ... } 50 = { ... } }
    const toks = tokenize(s.block || "");
    const outcomes = [];
    for (const t of toks) {
      if (/^\d+$/.test(t.key) && t.block) {
        // #random-list-outcome-conditions — an outcome's `trigger` decides whether it is possible at
        // all and `modifier` reweights how likely it is. Neither happens to a country, and both used to
        // go through the EFFECT path: "Trigger: Has War" as though it were an event, with the trigger's
        // own English never produced because it never reached the trigger renderer.
        const inner = tokenize(t.block);
        const gate = inner.find((x) => lc(x.key) === "trigger");
        const mods = inner.filter((x) => lc(x.key) === "modifier");
        const rest = inner.filter((x) => !/^(trigger|modifier|limit)$/.test(lc(x.key)));
        const body = renderStatements(rest, ctx);
        if (!body.length) continue;
        let txt = joinClauses(body);
        if (gate) {
          const cond = renderTriggerStatements(tokenize(gate.block || ""), ctx).join(", ");
          if (cond) txt = "only if " + cond + ": " + txt;
        }
        // A weight is not a certainty, so it is stated beside the outcome rather than folded into it.
        const weights = [];
        for (const m of mods) {
          const mt = tokenize(m.block || "");
          const f = mt.find((x) => lc(x.key) === "factor");
          const when = renderTriggerStatements(mt.filter((x) => lc(x.key) !== "factor"), ctx).join(", ");
          if (f && f.value != null && when) weights.push("×" + f.value + " as likely if " + when);
          else if (f && f.value != null) weights.push("×" + f.value + " as likely");
        }
        if (weights.length) txt += " [" + weights.join("; ") + "]";
        outcomes.push(txt);
      }
    }
    if (outcomes.length === 0) return "";
    if (outcomes.length === 1) return "Possibly: " + outcomes[0];
    return "Randomly one of: " + outcomes.map(o => "(" + o + ")").join(" or ");
  }

  /* ------------------------------------------------------------- formatting   */

  function lowerFirst(s) { return s ? s.charAt(0).toLowerCase() + s.slice(1) : s; }

  function joinClauses(arr) {
    const list = arr.filter(Boolean);
    if (list.length === 0) return "";
    if (list.length === 1) return list[0];
    return list.join("; ");
  }

  /* ---------------------------------------------------------------- entry pt  */

  function translate(code) {
    if (code === null || code === undefined) return "";
    if (typeof code !== "string") return String(code);
    // strip editor markers + comments handled by tokenizer; quick pre-clean
    let clean = code.replace(/#\s*focus_editor:[^\n]*/g, "").trim();
    if (!clean) return "";
    // a bare { ... } block
    if (clean.startsWith("{") && clean.endsWith("}")) clean = clean.slice(1, -1);
    const stmts = tokenize(clean);
    if (stmts.length === 0) return "";
    const parts = renderStatements(stmts, { depth: 0 });
    return parts.filter(Boolean).join("; ").replace(/\s{2,}/g, " ").replace(/;\s*;/g, ";").trim();
  }

  // Translate a block of TRIGGERS (conditions) — e.g. an `available`/`visible`/`allowed` field —
  // into plain English. Mirrors translate() but uses the trigger renderer, so phrasings read like
  // "has completed the focus X; war support ≥ 50%" instead of effect phrasings. Statements are
  // joined with "; " (an implicit AND, the Paradox default for sibling triggers).
  function translateTriggers(code) {
    if (code === null || code === undefined) return "";
    if (typeof code !== "string") return String(code);
    let clean = code.replace(/#\s*focus_editor:[^\n]*/g, "").trim();
    if (!clean) return "";
    if (clean.startsWith("{") && clean.endsWith("}")) clean = clean.slice(1, -1);
    const stmts = tokenize(clean);
    if (stmts.length === 0) return "";
    const parts = renderTriggerStatements(stmts, { depth: 0 });
    return parts.filter(Boolean).join("; ").replace(/\s{2,}/g, " ").replace(/;\s*;/g, ";").trim();
  }

  // Register the mod's + vanilla's scripted_effects (name -> body) so simple wrappers resolve to
  // English instead of a title-cased name. Safe to call repeatedly (e.g. on each tree load).
  function setScriptedEffects(map) {
    root.GENESIS_SCRIPTED_EFFECTS = (map && typeof map === "object") ? map : {};
  }

  // Same idea for the mod's + vanilla's scripted_triggers (name -> body) so custom condition calls
  // resolve to English instead of a title-cased name. Safe to call repeatedly.
  function setScriptedTriggers(map) {
    root.GENESIS_SCRIPTED_TRIGGERS = (map && typeof map === "object") ? map : {};
  }

  const api = {
    translate: translate,
    translateTriggers: translateTriggers,
    tokenize: tokenize,
    humanizeId: humanizeId,
    setScriptedEffects: setScriptedEffects,
    setScriptedTriggers: setScriptedTriggers,
    EFFECTS: EFFECTS, TRIGGERS: TRIGGERS, SCOPES: SCOPES, MODIFIERS: MODIFIERS,
    BUILDINGS: BUILDINGS, RESOURCES: RESOURCES, TAG_MAP: TAG_MAP
  };

  root.GenesisEngine = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
