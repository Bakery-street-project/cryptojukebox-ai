/**
 * The memory bank: the set of fragments the dream engine can wake.
 *
 * Content is authored as tuples in this file (a data DSL, not code) and normalised
 * by the pure parseBank. Association edges are explicit and directional in the source,
 * symmetrised on load, so a fragment's remoteness is a written-down judgment rather
 * than an embedding we would have to ship.
 */

export type FragmentCategory =
  | "place"
  | "figure"
  | "object"
  | "action"
  | "emotion"
  | "sense"
  | "scene";

export interface FragmentEdge {
  readonly to: string;
  /** Association strength 0–1. ≤0.25 counts as a weak, remote link (M4). */
  readonly w: number;
}

export interface Fragment {
  readonly id: string;
  readonly cat: FragmentCategory;
  /** Valence and arousal of the fragment itself, −1…1 (M2 affective tags). */
  readonly v: number;
  readonly a: number;
  /** Surface phrasings, lowercase, no trailing punctuation. */
  readonly words: readonly string[];
  readonly edges: readonly FragmentEdge[];
}

export interface MemoryBank {
  readonly fragments: readonly Fragment[];
  readonly byId: ReadonlyMap<string, Fragment>;
}

type RawEdge = readonly [to: string, w: number];
/** A long-range weak association written between two fragments that share no cluster. */
export type RemoteLink = readonly [from: string, to: string, w: number];

export class BankError extends Error {}
type RawFragment = readonly [
  id: string,
  cat: FragmentCategory,
  v: number,
  a: number,
  words?: readonly string[] | undefined,
  edges?: readonly RawEdge[] | undefined,
];

const CATEGORIES: readonly FragmentCategory[] = [
  "place",
  "figure",
  "object",
  "action",
  "emotion",
  "sense",
  "scene",
];

function humanize(id: string): string {
  return id.replace(/_/g, " ");
}

/**
 * Pure, idempotent normalisation: dedupe, drop self-loops, symmetrise by max weight.
 * `remote` is the long-range tail register — the strange links hyperpriming runs on.
 */
export function parseBank(raw: readonly RawFragment[], remote: readonly RemoteLink[] = []): MemoryBank {
  const seed = new Map<string, Fragment>();
  for (const [id, cat, v, a, words, edges] of raw) {
    const surface = words && words.length > 0 ? words : [humanize(id)];
    seed.set(id, { id, cat, v, a, words: surface, edges: edges ? edges.map(([to, w]) => ({ to, w })) : [] });
  }

  const mutual = new Map<string, Map<string, number>>();
  const rowFor = (id: string): Map<string, number> => {
    let row = mutual.get(id);
    if (!row) {
      row = new Map();
      mutual.set(id, row);
    }
    return row;
  };
  for (const f of seed.values()) {
    for (const e of f.edges) {
      if (e.to === f.id) continue;
      // A typo'd target stays visible so validateBank reports it instead of the walk silently losing the link.
      rowFor(f.id).set(e.to, Math.max(rowFor(f.id).get(e.to) ?? 0, e.w));
      if (seed.has(e.to)) rowFor(e.to).set(f.id, Math.max(rowFor(e.to).get(f.id) ?? 0, e.w));
    }
  }
  for (const [from, to, w] of remote) {
    if (!seed.has(from)) throw new BankError(`remote link from unknown fragment ${from}`);
    if (from === to) continue;
    rowFor(from).set(to, Math.max(rowFor(from).get(to) ?? 0, w));
    if (seed.has(to)) rowFor(to).set(from, Math.max(rowFor(to).get(from) ?? 0, w));
  }

  const fragments = raw.map(([id]) => {
    const f = seed.get(id)!;
    const row = mutual.get(id);
    const edges: FragmentEdge[] = row ? [...row].map(([to, w]) => ({ to, w })) : [];
    return { ...f, edges };
  });
  return { fragments, byId: new Map(fragments.map((f) => [f.id, f])) };
}

export function validateBank(bank: MemoryBank): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const f of bank.fragments) {
    if (seen.has(f.id)) errors.push(`duplicate fragment id ${f.id}`);
    seen.add(f.id);
    if (!CATEGORIES.includes(f.cat)) errors.push(`${f.id}: unknown category ${f.cat}`);
    if (!Number.isFinite(f.v) || f.v < -1 || f.v > 1) errors.push(`${f.id}: valence ${f.v} outside −1…1`);
    if (!Number.isFinite(f.a) || f.a < -1 || f.a > 1) errors.push(`${f.id}: arousal ${f.a} outside −1…1`);
    if (f.words.length === 0 || f.words.some((w) => w.trim().length === 0)) errors.push(`${f.id}: no usable phrasing`);
    if (f.words.some((w) => w.split(/\s+/).length > 8)) errors.push(`${f.id}: phrasing longer than 8 words`);
    for (const e of f.edges) {
      if (!bank.byId.has(e.to)) errors.push(`${f.id}: edge to unknown fragment ${e.to}`);
      if (!(e.w > 0 && e.w <= 1)) errors.push(`${f.id}→${e.to}: weight ${e.w} outside 0…1`);
    }
  }
  return errors;
}

/**
 * Adjacency for the associative walk: neighbours reachable from a fragment.
 * Kept as a function so the walk never touches the map internals.
 */
export function neighborsOf(bank: MemoryBank, id: string): readonly FragmentEdge[] {
  return bank.byId.get(id)?.edges ?? [];
}

// ——— the corpus ———
// [id, cat, v, a, words?, edges?]
export const BANK: readonly RawFragment[] = [
  // places: water and tide
  ["estuary", "place", 0.3, 0.1, ["the estuary"], [["tidal_pool", 0.6], ["folded_sea", 0.5], ["wet_cavern", 0.2]]],
  ["tidal_pool", "place", 0.4, 0.05, ["a tidal pool"], [["black_coral", 0.55], ["salt_flat", 0.4]]],
  ["black_coral", "place", -0.35, 0.25, ["black coral"], [["wet_cavern", 0.5], ["pressure_before_sound", 0.2]]],
  ["salt_flat", "place", 0.2, -0.25, ["the salt flats"], [["long_staircase", 0.25], ["light_under_the_door", 0.15]]],
  ["folded_sea", "place", 0.15, 0.1, ["a sea folded like linen"], [["linen_circuit", 0.4], ["flood_rehearsal", 0.3]]],
  ["wet_cavern", "place", -0.3, 0.3, ["a wet cavern"], [["drip_of_a_name", 0.45], ["undercroft", 0.5]]],
  ["flooded_chapel", "place", -0.2, -0.3, ["the flooded chapel"], [["being_forgiven", 0.5], ["pier_lanterns", 0.35]]],
  ["pier_lanterns", "place", 0.4, 0.2, ["the pier lanterns"], [["market_of_echoes", 0.4], ["glass_diver", 0.25]]],

  // places: stone and height
  ["bell_tower", "place", 0.2, 0.5, ["the bell tower"], [["ring_out", 0.6], ["the_conductor", 0.45], ["hollow_monolith", 0.3]]],
  ["hollow_monolith", "place", -0.5, 0.1, ["a hollow monolith"], [["silence_after_siren", 0.45], ["quarry", 0.35]]],
  ["long_staircase", "place", 0.1, 0.4, ["an endless staircase"], [["losing_a_stair_underfoot", 0.6], ["ascend", 0.5]]],
  ["undercroft", "place", -0.45, -0.1, ["the undercroft"], [["dream_archive", 0.55], ["wedding_in_undercroft", 0.5]]],
  ["quarry", "place", 0.05, 0.35, ["the quarry"], [["iron_garden", 0.45], ["apologize_to_stone", 0.5]]],
  ["iron_garden", "place", -0.4, 0.35, ["an iron garden"], [["brass_seed", 0.55], ["gardener_of_wires", 0.6]]],
  ["glass_attic", "place", 0.3, -0.25, ["the glass attic"], [["brightness_behind_eyelids", 0.5], ["house_with_extra_room", 0.5]]],
  ["rooftop_no_wind", "place", 0.1, -0.4, ["a rooftop with no wind"], [["shame_of_height", 0.55], ["train_yard_at_night", 0.3]]],
  ["market_of_echoes", "place", 0.25, 0.5, ["a market of echoes"], [["the_crowd_turns_to_listen", 0.6], ["hum_in_the_wall", 0.3]]],
  ["train_yard_at_night", "place", -0.15, 0.4, ["the train yard at night"], [["waiting_for_train_that_left", 0.7], ["radio_without_station", 0.4]]],
  ["observatory_deck", "place", 0.4, 0.1, ["the observatory deck"], [["telescope_reversed", 0.6], ["wonder_open", 0.5]]],
  ["orchard", "place", 0.55, 0.2, ["an orchard"], [["bloom", 0.6], ["glass_fruit_bowl", 0.5], ["greenhouse", 0.5]]],
  ["greenhouse", "place", 0.5, 0.15, ["the greenhouse"], [["moth_witch", 0.45], ["smell_of_greenhouse", 0.7]]],
  ["archive_of_doors", "place", -0.05, -0.2, ["an archive of doors"], [["a_door_in_a_field", 0.55], ["dream_archive", 0.6]]],
  ["sugar_mill", "place", 0.3, 0.45, ["the sugar mill"], [["crystallize", 0.6], ["doubled_mother", 0.25]]],
  ["field_with_one_tree", "place", 0.15, -0.15, ["a field with one tree"], [["a_door_in_a_field", 0.6], ["second_childhood", 0.35]]],

  // figures
  ["the_conductor", "figure", 0.1, 0.55, ["the conductor"], [["ring_out", 0.5], ["the_crowd_turns_to_listen", 0.55]]],
  ["choir_child", "figure", 0.5, 0.2, ["a choir child"], [["ring_out", 0.45], ["being_taught_by_animal", 0.3]]],
  ["widow_with_lantern", "figure", -0.35, -0.1, ["the widow with the lantern"], [["grief_with_sunlight", 0.6], ["long_handshake", 0.4]]],
  ["glass_diver", "figure", 0.05, 0.45, ["a glass diver"], [["cold_glass_against_lip", 0.5], ["folded_sea", 0.4]]],
  ["twin_shadow", "figure", -0.3, 0.2, ["a shadow with my face"], [["mirror_tender", 0.6], ["guilt_of_survivor", 0.45]]],
  ["old_surveyor", "figure", -0.1, -0.3, ["the old surveyor"], [["quarry", 0.5], ["cartographer_of_sleep", 0.55]]],
  ["moth_witch", "figure", 0.15, 0.5, ["the moth witch"], [["atlas_moth", 0.7], ["greenhouse", 0.4]]],
  ["stranger_returning", "figure", 0.3, -0.15, ["someone returning, changed"], [["love_without_address", 0.55], ["long_handshake", 0.5]]],
  ["mirror_tender", "figure", 0.0, 0.2, ["the keeper of mirrors"], [["second_childhood", 0.45], ["broken_compass", 0.3]]],
  ["ferryman", "figure", -0.1, -0.2, ["the ferryman"], [["estuary", 0.55], ["wait_in_line", 0.35]]],
  ["child_who_stays", "figure", 0.25, -0.35, ["the child who stayed"], [["second_childhood", 0.6], ["flat_calm", 0.4]]],
  ["bride_of_static", "figure", -0.2, 0.5, ["the bride of static"], [["radio_without_station", 0.55], ["anger_white", 0.4]]],
  ["gardener_of_wires", "figure", 0.2, 0.35, ["the gardener of wires"], [["linen_circuit", 0.6], ["iron_garden", 0.5]]],
  ["humming_sergeant", "figure", 0.1, 0.5, ["the sergeant who hums"], [["hum_in_the_wall", 0.6], ["pride_of_craft", 0.45]]],
  ["one_without_face", "figure", -0.45, 0.15, ["a figure with no face"], [["shame_of_height", 0.4], ["panic_minor_key", 0.5]]],
  ["doubled_mother", "figure", 0.35, -0.2, ["my mother, twice"], [["tenderness_for_machines", 0.5], ["grief_with_sunlight", 0.45]]],
  ["sleepwalker", "figure", 0.0, -0.4, ["a sleepwalker"], [["being_the_room", 0.55], ["long_staircase", 0.4]]],
  ["cartographer_of_sleep", "figure", 0.2, 0.25, ["the cartographer of sleep"], [["folded_sea", 0.5], ["map_of_a_song", 0.6]]],

  // objects
  ["atlas_moth", "object", 0.2, 0.45, ["an atlas moth"], [["weight_of_a_sleeper", 0.4], ["sound_of_many_wings", 0.6]]],
  ["forgive_engine", "object", -0.1, 0.3, ["the forgiveness engine"], [["being_forgiven", 0.7], ["cathedral_battery", 0.5]]],
  ["salted_harp", "object", 0.15, 0.2, ["a salt-stained harp"], [["ring_out", 0.5], ["tidal_pool", 0.4]]],
  ["pocket_of_rain", "object", 0.1, 0.15, ["a pocket full of rain"], [["taste_of_tin", 0.45], ["train_yard_at_night", 0.35]]],
  ["copper_throat", "object", -0.15, 0.45, ["a copper throat"], [["hum_in_the_wall", 0.5], ["metronome_in_case", 0.4]]],
  ["brass_seed", "object", 0.35, 0.3, ["a brass seed"], [["bloom", 0.55], ["greenhouse", 0.4]]],
  ["broken_compass", "object", -0.3, -0.1, ["a broken compass"], [["longing_blue", 0.55], ["old_surveyor", 0.4]]],
  ["wet_photograph", "object", -0.35, -0.25, ["a wet photograph"], [["grief_with_sunlight", 0.5], ["archive_of_doors", 0.4]]],
  ["linen_circuit", "object", 0.2, 0.1, ["a circuit woven in linen"], [["touch_of_wet_linen", 0.6], ["forgive_engine", 0.4]]],
  ["sugar_glass_skull", "object", -0.2, 0.3, ["a skull of sugar glass"], [["crystallize", 0.5], ["funeral_that_is_a_harvest", 0.55]]],
  ["nine_cups", "object", 0.25, -0.2, ["nine cups, one still full"], [["searching_a_familiar_pocket", 0.4], ["doubled_mother", 0.4]]],
  ["telescope_reversed", "object", 0.15, 0.3, ["a telescope run backwards"], [["distance_that_walks", 0.6], ["observatory_deck", 0.5]]],
  ["metronome_in_case", "object", 0.0, 0.4, ["a metronome in its case"], [["hunger_old", 0.35], ["the_exam_already_passed", 0.3]]],
  ["cathedral_battery", "object", 0.1, 0.4, ["the cathedral battery"], [["voltage_of_a_hymn", 0.6], ["flooded_chapel", 0.45]]],
  ["hourglass_of_ash", "object", -0.4, -0.15, ["an hourglass of ash"], [["guilt_of_survivor", 0.5], ["silence_after_siren", 0.4]]],
  ["open_cage", "object", 0.15, 0.2, ["an open cage"], [["take_flight", 0.7], ["second_childhood", 0.3]]],
  ["ladder_of_teeth", "object", -0.25, 0.4, ["a ladder made of teeth"], [["losing_a_stair_underfoot", 0.5], ["cold_glass_against_lip", 0.25]]],
  ["radio_without_station", "object", -0.3, -0.35, ["a radio with no station"], [["pressure_before_sound", 0.55], ["longing_blue", 0.5]]],
  ["glass_fruit_bowl", "object", 0.35, 0.1, ["a bowl of glass fruit"], [["brightness_behind_eyelids", 0.45], ["orchard", 0.5]]],
  ["moth_ledger", "object", 0.05, -0.2, ["the moth ledger"], [["dream_archive", 0.6], ["atlas_moth", 0.5]]],
  ["map_of_a_song", "object", 0.3, 0.3, ["a map of this song"], [["unfold", 0.6], ["cartographer_of_sleep", 0.5]]],
  ["salt_lamp", "object", 0.3, -0.3, ["a salt lamp"], [["relief_after_fall", 0.5], ["flooded_chapel", 0.35]]],
  ["drip_of_a_name", "object", -0.2, 0.1, ["the drip of a name"], [["wet_cavern", 0.45], ["color_that_has_no_name", 0.4]]],

  // actions
  ["bloom", "action", 0.6, 0.35, ["bloom"], [["crystallize", 0.4], ["wonder_open", 0.55]]],
  ["unfold", "action", 0.45, 0.2, ["unfold"], [["map_of_a_song", 0.55], ["take_flight", 0.4]]],
  ["ring_out", "action", 0.5, 0.6, ["ring out"], [["shame_of_height", 0.25], ["the_crowd_turns_to_listen", 0.5]]],
  ["ascend", "action", 0.35, 0.5, ["ascend"], [["long_staircase", 0.6], ["distance_that_walks", 0.4]]],
  ["crystallize", "action", 0.3, 0.3, ["crystallize"], [["sugar_mill", 0.55], ["cold_glass_against_lip", 0.4]]],
  ["take_flight", "action", 0.5, 0.55, ["take flight"], [["sky_opens_indoors", 0.65], ["open_cage", 0.6]]],
  ["dissolve", "action", -0.35, -0.35, ["dissolve"], [["estuary", 0.5], ["flat_calm", 0.45]]],
  ["hum", "action", 0.0, 0.25, ["hum under your breath"], [["hum_in_the_wall", 0.7], ["copper_throat", 0.5]]],
  ["surface", "action", 0.1, 0.4, ["surface"], [["black_coral", 0.45], ["arrival_that_was_left", 0.35]]],
  ["convulse", "action", -0.5, 0.7, ["convulse"], [["anger_white", 0.6], ["sky_opens_indoors", 0.4]]],
  ["metabolize", "action", -0.15, 0.2, ["metabolize"], [["iron_garden", 0.35], ["hunger_old", 0.5]]],
  ["echo_back", "action", 0.05, 0.3, ["echo back"], [["market_of_echoes", 0.65], ["pressure_before_sound", 0.35]]],
  ["count_the_windows", "action", -0.1, -0.25, ["count the windows"], [["house_with_extra_room", 0.6], ["flat_calm", 0.35]]],
  ["confess_to_water", "action", 0.15, 0.25, ["confess to the water"], [["being_forgiven", 0.65], ["tidal_pool", 0.45]]],
  ["carry_the_lantern", "action", 0.25, 0.15, ["carry the lantern"], [["pier_lanterns", 0.6], ["widow_with_lantern", 0.55]]],
  ["mend_the_net", "action", 0.3, -0.2, ["mend the net"], [["pride_of_craft", 0.6], ["folded_sea", 0.45]]],
  ["name_the_child", "action", 0.2, 0.35, ["name the child"], [["color_that_has_no_name", 0.5], ["second_childhood", 0.45]]],
  ["wait_in_line", "action", -0.25, -0.3, ["wait in a line"], [["the_exam_already_passed", 0.5], ["train_yard_at_night", 0.4]]],
  ["fold_the_map", "action", 0.1, 0.1, ["fold the map"], [["map_of_a_song", 0.6], ["distance_that_walks", 0.45]]],
  ["swallow_the_bell", "action", -0.3, 0.45, ["swallow the bell"], [["silence_after_siren", 0.6], ["copper_throat", 0.45]]],
  ["apologize_to_stone", "action", -0.2, 0.15, ["apologize to the stone"], [["quarry", 0.55], ["guilt_of_survivor", 0.45]]],
  ["learn_the_language", "action", 0.35, 0.3, ["learn the language"], [["being_taught_by_animal", 0.6], ["voltage_of_a_hymn", 0.35]]],

  // emotions
  ["being_forgiven", "emotion", 0.6, -0.25, ["being forgiven, finally"], [["relief_after_fall", 0.55], ["tenderness_for_machines", 0.4]]],
  ["dread_before_door", "emotion", -0.6, 0.5, ["dread at the door"], [["panic_minor_key", 0.6], ["a_door_in_a_field", 0.55]]],
  ["joy_unexpected", "emotion", 0.75, 0.6, ["unexpected joy"], [["wonder_open", 0.6], ["sky_opens_indoors", 0.5]]],
  ["flat_calm", "emotion", 0.05, -0.6, ["a level calm"], [["cold_water_taste", 0.4], ["calm_underwater", 0.65]]],
  ["grief_with_sunlight", "emotion", 0.15, -0.3, ["grief in good light"], [["longing_blue", 0.55], ["relief_after_fall", 0.4]]],
  ["shame_of_height", "emotion", -0.5, 0.4, ["the shame of height"], [["one_without_face", 0.45], ["rooftop_no_wind", 0.55]]],
  ["tenderness_for_machines", "emotion", 0.4, -0.15, ["tenderness for machines"], [["linen_circuit", 0.55], ["hum_in_the_wall", 0.4]]],
  ["hunger_old", "emotion", -0.05, 0.35, ["an old hunger"], [["metronome_in_case", 0.4], ["second_childhood", 0.4]]],
  ["relief_after_fall", "emotion", 0.45, -0.45, ["relief after the fall"], [["losing_a_stair_underfoot", 0.55], ["flat_calm", 0.4]]],
  ["anger_white", "emotion", -0.4, 0.7, ["white anger"], [["convulse", 0.6], ["voltage_of_a_hymn", 0.4]]],
  ["longing_blue", "emotion", -0.25, -0.25, ["a blue longing"], [["radio_without_station", 0.5], ["arrival_that_was_left", 0.55]]],
  ["wonder_open", "emotion", 0.5, 0.5, ["open wonder"], [["color_that_has_no_name", 0.55], ["observatory_deck", 0.5]]],
  ["guilt_of_survivor", "emotion", -0.55, -0.1, ["the survivor's guilt"], [["twin_shadow", 0.5], ["hourglass_of_ash", 0.5]]],
  ["calm_underwater", "emotion", 0.2, -0.55, ["calm, underwater"], [["dissolve", 0.5], ["pressure_before_sound", 0.4]]],
  ["panic_minor_key", "emotion", -0.55, 0.6, ["panic in a minor key"], [["losing_a_stair_underfoot", 0.6], ["pressure_before_sound", 0.5]]],
  ["pride_of_craft", "emotion", 0.45, 0.3, ["pride of craft"], [["mend_the_net", 0.55], ["humming_sergeant", 0.45]]],
  ["love_without_address", "emotion", 0.35, -0.1, ["love with no address"], [["stranger_returning", 0.55], ["wet_photograph", 0.45]]],
  ["distance_that_walks", "emotion", 0.1, 0.25, ["distance that walks toward me"], [["telescope_reversed", 0.55], ["folded_sea", 0.4]]],

  // senses
  ["taste_of_tin", "sense", -0.1, 0.3, ["the taste of tin"], [["copper_throat", 0.5], ["pressure_before_sound", 0.45]]],
  ["smell_of_greenhouse", "sense", 0.4, -0.1, ["the smell of the greenhouse"], [["greenhouse", 0.65], ["bloom", 0.45]]],
  ["sound_of_many_wings", "sense", 0.1, 0.5, ["the sound of many wings"], [["atlas_moth", 0.6], ["panic_minor_key", 0.35]]],
  ["touch_of_wet_linen", "sense", 0.25, -0.35, ["the feel of wet linen"], [["linen_circuit", 0.55], ["grief_with_sunlight", 0.35]]],
  ["color_that_has_no_name", "sense", 0.1, 0.4, ["a colour that has no name"], [["wonder_open", 0.5], ["sky_opens_indoors", 0.45]]],
  ["cold_glass_against_lip", "sense", 0.05, 0.2, ["cold glass against the lip"], [["glass_fruit_bowl", 0.55], ["voltage_of_a_hymn", 0.35]]],
  ["weight_of_a_sleeper", "sense", 0.3, -0.5, ["the weight of a sleeper"], [["sleepwalker", 0.55], ["being_the_room", 0.45]]],
  ["light_under_the_door", "sense", 0.35, 0.05, ["light under the door"], [["archive_of_doors", 0.55], ["dread_before_door", 0.5]]],
  ["hum_in_the_wall", "sense", 0.0, 0.3, ["a hum inside the wall"], [["cathedral_battery", 0.5], ["longing_blue", 0.35]]],
  ["taste_of_the_end_of_a_song", "sense", 0.2, 0.1, ["the taste of the end of a song"], [["arrival_that_was_left", 0.55], ["ring_out", 0.4]]],
  ["pressure_before_sound", "sense", -0.15, 0.45, ["the pressure before sound"], [["silence_after_siren", 0.6], ["dread_before_door", 0.45]]],
  ["brightness_behind_eyelids", "sense", 0.45, 0.15, ["brightness behind closed eyelids"], [["color_that_has_no_name", 0.5], ["calm_underwater", 0.4]]],
  ["smell_of_a_station_at_night", "sense", -0.2, -0.2, ["the smell of a station at night"], [["train_yard_at_night", 0.6], ["longing_blue", 0.45]]],
  ["silence_after_siren", "sense", -0.3, -0.4, ["the silence after the siren"], [["flat_calm", 0.5], ["hollow_monolith", 0.45]]],
  ["voltage_of_a_hymn", "sense", 0.25, 0.45, ["the voltage of a hymn"], [["cathedral_battery", 0.55], ["ring_out", 0.45]]],
  ["cold_water_taste", "sense", 0.1, -0.3, ["the taste of cold water"], [["tidal_pool", 0.5], ["calm_underwater", 0.5]]],

  // scenes
  ["waiting_for_train_that_left", "scene", -0.3, -0.2, ["waiting for a train that already left"], [["longing_blue", 0.6], ["smell_of_a_station_at_night", 0.5]]],
  ["the_exam_already_passed", "scene", 0.35, -0.3, ["the exam I already passed"], [["relief_after_fall", 0.55], ["pride_of_craft", 0.4]]],
  ["house_with_extra_room", "scene", 0.1, 0.1, ["the house with one room too many"], [["archive_of_doors", 0.55], ["count_the_windows", 0.5]]],
  ["being_taught_by_animal", "scene", -0.05, 0.4, ["being taught by an animal"], [["atlas_moth", 0.5], ["learn_the_language", 0.6]]],
  ["wedding_in_undercroft", "scene", -0.2, 0.25, ["a wedding in the undercroft"], [["doubled_mother", 0.5], ["voltage_of_a_hymn", 0.45]]],
  ["searching_a_familiar_pocket", "scene", 0.05, -0.1, ["searching a familiar pocket"], [["loss_of_the_object_held", 0.6], ["nine_cups", 0.45]]],
  ["flood_rehearsal", "scene", -0.3, 0.4, ["the flood rehearsal"], [["estuary", 0.55], ["panic_minor_key", 0.5]]],
  ["feeding_the_archive", "scene", 0.3, 0.1, ["feeding the archive"], [["dream_archive", 0.65], ["moth_ledger", 0.55]]],
  ["the_crowd_turns_to_listen", "scene", -0.05, 0.5, ["the crowd turns to listen"], [["pressure_before_sound", 0.5], ["joy_unexpected", 0.4]]],
  ["climbing_inside_a_chord", "scene", 0.25, 0.45, ["climbing inside a chord"], [["ascend", 0.6], ["voltage_of_a_hymn", 0.5]]],
  ["losing_a_stair_underfoot", "scene", -0.5, 0.5, ["losing a stair underfoot"], [["panic_minor_key", 0.6], ["relief_after_fall", 0.5]]],
  ["a_door_in_a_field", "scene", -0.05, 0.2, ["a door standing in a field"], [["field_with_one_tree", 0.6], ["dread_before_door", 0.55]]],
  ["second_childhood", "scene", -0.25, -0.3, ["a second childhood"], [["child_who_stays", 0.6], ["grief_with_sunlight", 0.45]]],
  ["city_that_rearranges", "scene", -0.15, 0.35, ["the city rearranges itself"], [["market_of_echoes", 0.5], ["a_door_in_a_field", 0.45]]],
  ["funeral_that_is_a_harvest", "scene", 0.15, 0.2, ["a funeral that is also a harvest"], [["orchard", 0.55], ["being_forgiven", 0.5]]],
  ["being_the_room", "scene", -0.1, -0.4, ["being the room rather than the guest"], [["sleepwalker", 0.55], ["calm_underwater", 0.45]]],
  ["long_handshake", "scene", -0.2, 0.1, ["a handshake that will not end"], [["stranger_returning", 0.5], ["guilt_of_survivor", 0.4]]],
  ["teaching_the_wide_ocean", "scene", 0.2, 0.3, ["teaching the wide ocean"], [["folded_sea", 0.6], ["confess_to_water", 0.55]]],
  ["sky_opens_indoors", "scene", 0.3, 0.5, ["the sky opening indoors"], [["color_that_has_no_name", 0.55], ["wonder_open", 0.55]]],
  ["loss_of_the_object_held", "scene", -0.45, 0.25, ["the thing I was holding is gone"], [["guilt_of_survivor", 0.5], ["open_cage", 0.4]]],
  ["arrival_that_was_left", "scene", 0.05, -0.25, ["arriving where I once left"], [["longing_blue", 0.6], ["grief_with_sunlight", 0.5]]],
  ["dream_archive", "scene", -0.15, -0.3, ["the archive of dreams"], [["feeding_the_archive", 0.6], ["moth_ledger", 0.5]]],

  // ——— second stratum: more remote tail, more low-arousal dark, more loud bright ———

  // places
  ["canal_of_stone_beds", "place", 0.05, -0.35, ["a canal between stone beds"], [["wet_cavern", 0.5], ["taste_of_tin", 0.12]]],
  ["the_room_above_the_band", "place", 0.3, 0.3, ["the room above the band"], [["voltage_of_a_hymn", 0.55], ["salt_lamp", 0.15]]],
  ["threshing_floor", "place", 0.35, 0.4, ["the threshing floor"], [["funeral_that_is_a_harvest", 0.6], ["sugar_mill", 0.4]]],
  ["low_bridge_at_dawn", "place", 0.25, -0.15, ["a low bridge at dawn"], [["longing_blue", 0.35], ["canal_of_stone_beds", 0.3]]],
  ["reservoir_under_stairs", "place", -0.25, -0.2, ["a reservoir under the stairs"], [["long_staircase", 0.55], ["pressure_before_sound", 0.3]]],
  ["the_unlit_corridor", "place", -0.4, -0.3, ["an unlit corridor"], [["archive_of_doors", 0.6], ["dread_before_door", 0.45]]],
  ["salt_mine_of_bells", "place", -0.1, 0.45, ["a salt mine full of bells"], [["swallow_the_bell", 0.6], ["salt_flat", 0.5]]],
  ["attic_of_warm_wire", "place", 0.2, 0.2, ["an attic of warm wire"], [["gardener_of_wires", 0.55], ["glass_attic", 0.5]]],
  ["moonlit_tank_house", "place", -0.05, 0.15, ["the moonlit tank house"], [["folded_sea", 0.45], ["observatory_deck", 0.2]]],
  ["orchard_of_locks", "place", 0.1, 0.3, ["an orchard of locks"], [["searching_a_familiar_pocket", 0.5], ["open_cage", 0.35]]],
  ["the_reverse_ferry", "place", -0.2, 0.25, ["the ferry running backwards"], [["arrival_that_was_left", 0.6], ["ferryman", 0.65]]],
  ["dam_of_stolen_light", "place", -0.35, 0.35, ["a dam of stolen light"], [["light_under_the_door", 0.5], ["city_that_rearranges", 0.18]]],
  ["field_hospital_of_maps", "place", 0.0, 0.1, ["a field hospital of maps"], [["map_of_a_song", 0.6], ["cartographer_of_sleep", 0.55]]],
  ["the_ninth_waterfall", "place", 0.4, 0.5, ["the ninth waterfall"], [["teaching_the_wide_ocean", 0.55], ["confess_to_water", 0.4]]],
  ["cold_marble_station", "place", -0.3, -0.25, ["a cold marble station"], [["smell_of_a_station_at_night", 0.6], ["wait_in_line", 0.4]]],

  // figures
  ["the_auditor_of_rain", "figure", -0.15, 0.2, ["the auditor of rain"], [["pocket_of_rain", 0.55], ["count_the_windows", 0.4]]],
  ["sister_of_the_locks", "figure", 0.15, 0.15, ["my sister of the locks"], [["orchard_of_locks", 0.6], ["mirror_tender", 0.4]]],
  ["the_band_master_drowned", "figure", -0.4, 0.3, ["the drowned band master"], [["the_room_above_the_band", 0.55], ["swallow_the_bell", 0.45]]],
  ["old_husband_of_doors", "figure", -0.25, -0.3, ["the old husband of doors"], [["the_unlit_corridor", 0.55], ["long_handshake", 0.4]]],
  ["child_of_two_fires", "figure", 0.05, 0.55, ["a child of two fires"], [["anger_white", 0.5], ["threshing_floor", 0.4]]],
  ["the_lathe_tender", "figure", 0.2, 0.35, ["the lathe tender"], [["pride_of_craft", 0.6], ["copper_throat", 0.45]]],
  ["woman_making_the_tide", "figure", 0.35, 0.25, ["the woman making the tide"], [["estuary", 0.55], ["teaching_the_wide_ocean", 0.5]]],
  ["the_smallest_witness", "figure", -0.2, 0.1, ["the smallest witness"], [["guilt_of_survivor", 0.55], ["wedding_in_undercroft", 0.25]]],
  ["choir_of_two", "figure", 0.3, 0.3, ["a choir of two"], [["choir_child", 0.65], ["climbing_inside_a_chord", 0.5]]],
  ["the_man_who_is_lost", "figure", -0.45, -0.2, ["a man who is lost"], [["broken_compass", 0.55], ["being_the_room", 0.2]]],
  ["nurse_of_the_extra_room", "figure", 0.25, -0.35, ["the nurse of the extra room"], [["house_with_extra_room", 0.6], ["tenderness_for_machines", 0.35]]],
  ["the_third_parent", "figure", 0.0, -0.15, ["a third parent"], [["doubled_mother", 0.6], ["second_childhood", 0.5]]],

  // objects
  ["lantern_of_small_bones", "object", -0.3, 0.25, ["a lantern of small bones"], [["carry_the_lantern", 0.55], ["widow_with_lantern", 0.5]]],
  ["key_of_warm_glass", "object", 0.2, 0.1, ["a key of warm glass"], [["orchard_of_locks", 0.55], ["sister_of_the_locks", 0.5]]],
  ["the_band_of_the_drowned", "object", -0.35, 0.15, ["the drowned band's last reel"], [["the_band_master_drowned", 0.6], ["voltage_of_a_hymn", 0.25]]],
  ["sewing_box_of_storms", "object", 0.1, 0.2, ["a sewing box of storms"], [["mend_the_net", 0.6], ["anger_white", 0.2]]],
  ["wire_spool_of_a_child", "object", 0.25, -0.1, ["a child's spool of wire"], [["attic_of_warm_wire", 0.6], ["gardener_of_wires", 0.5]]],
  ["wet_slate_of_names", "object", -0.15, -0.2, ["a wet slate of names"], [["name_the_child", 0.6], ["drip_of_a_name", 0.55]]],
  ["brass_lung", "object", -0.3, 0.4, ["a brass lung"], [["copper_throat", 0.6], ["pressure_before_sound", 0.45]]],
  ["sugar_cube_microscope", "object", 0.3, 0.35, ["a sugar-cube microscope"], [["crystallize", 0.5], ["telescope_reversed", 0.55]]],
  ["the_unclaimed_umbrella", "object", -0.25, -0.3, ["the unclaimed umbrella"], [["pocket_of_rain", 0.5], ["cold_marble_station", 0.45]]],
  ["half_a_wheel", "object", 0.0, 0.25, ["half a wheel"], [["the_reverse_ferry", 0.5], ["metronome_in_case", 0.3]]],
  ["mirror_of_household_water", "object", 0.15, -0.25, ["a mirror of household water"], [["touch_of_wet_linen", 0.5], ["second_childhood", 0.35]]],
  ["book_of_cold_fire", "object", -0.2, 0.3, ["a book of cold fire"], [["child_of_two_fires", 0.55], ["field_hospital_of_maps", 0.25]]],
  ["the_fourteenth_cup", "object", 0.2, 0.0, ["a cup nobody poured"], [["nine_cups", 0.65], ["searching_a_familiar_pocket", 0.4]]],
  ["engine_of_slow_rain", "object", -0.1, -0.15, ["an engine of slow rain"], [["forgive_engine", 0.6], ["the_auditor_of_rain", 0.5]]],
  ["stair_carpet_of_ash", "object", -0.4, -0.1, ["a stair carpet of ash"], [["hourglass_of_ash", 0.6], ["reservoir_under_stairs", 0.5]]],
  ["the_nth_telegraph", "object", 0.05, 0.35, ["a telegraph still tapping"], [["radio_without_station", 0.55], ["echo_back", 0.5]]],

  // actions
  ["kneel_in_water", "action", 0.15, 0.2, ["kneel in the water"], [["confess_to_water", 0.55], ["flood_rehearsal", 0.4]]],
  ["carry_the_thief", "action", -0.35, 0.15, ["carry the thief who took your room"], [["long_handshake", 0.35], ["being_the_room", 0.4]]],
  ["stitch_the_horizon", "action", 0.25, 0.3, ["stitch the horizon shut"], [["mend_the_net", 0.6], ["teaching_the_wide_ocean", 0.35]]],
  ["forget_on_purpose", "action", -0.15, -0.3, ["forget something on purpose"], [["guilt_of_survivor", 0.5], ["loss_of_the_object_held", 0.45]]],
  ["answer_in_a_minor_key", "action", -0.2, 0.25, ["answer in a minor key"], [["panic_minor_key", 0.6], ["climbing_inside_a_chord", 0.4]]],
  ["set_the_table_again", "action", 0.3, -0.25, ["set the table again"], [["doubled_mother", 0.5], ["funeral_that_is_a_harvest", 0.4]]],
  ["run_the_warm_wire", "action", 0.1, 0.4, ["run the warm wire"], [["attic_of_warm_wire", 0.6], ["cathedral_battery", 0.5]]],
  ["hold_the_two_fires", "action", -0.05, 0.6, ["hold both fires apart"], [["child_of_two_fires", 0.6], ["anger_white", 0.45]]],
  ["read_the_wet_slate", "action", -0.2, -0.15, ["read the wet slate"], [["wet_slate_of_names", 0.65], ["name_the_child", 0.5]]],
  ["count_until_the_light", "action", 0.15, -0.1, ["count until the light comes"], [["light_under_the_door", 0.55], ["wait_in_line", 0.45]]],
  ["refuse_the_ferry", "action", -0.3, 0.35, ["refuse the ferry"], [["the_reverse_ferry", 0.6], ["ferryman", 0.55]]],
  ["unlearn_the_song", "action", -0.35, 0.1, ["unlearn the song"], [["taste_of_the_end_of_a_song", 0.55], ["forget_on_purpose", 0.4]]],
  ["open_every_door_at_once", "action", 0.2, 0.65, ["open every door at once"], [["archive_of_doors", 0.6], ["joy_unexpected", 0.5]]],
  ["water_the_locked_room", "action", 0.0, -0.4, ["water the locked room"], [["reservoir_under_stairs", 0.55], ["house_with_extra_room", 0.5]]],

  // emotions
  ["homes_for_a_stranger", "emotion", 0.15, -0.2, ["homesickness for a place you never lived"], [["longing_blue", 0.6], ["city_that_rearranges", 0.35]]],
  ["the_pity_you_survived", "emotion", -0.3, -0.35, ["the pity that you survived"], [["guilt_of_survivor", 0.6], ["relief_after_fall", 0.4]]],
  ["fear_of_the_quiet_part", "emotion", -0.45, 0.4, ["fear of the quiet part"], [["silence_after_siren", 0.6], ["panic_minor_key", 0.5]]],
  ["delight_of_small_machines", "emotion", 0.4, 0.25, ["delight in small machines"], [["tenderness_for_machines", 0.6], ["the_nth_telegraph", 0.35]]],
  ["being_known_too_well", "emotion", -0.1, 0.15, ["being known too well"], [["mirror_tender", 0.5], ["shame_of_height", 0.35]]],
  ["rage_of_a_good_tool", "emotion", -0.3, 0.65, ["the rage of a good tool"], [["anger_white", 0.6], ["pride_of_craft", 0.45]]],
  ["peace_after_the_verdict", "emotion", 0.35, -0.5, ["peace after the verdict"], [["being_forgiven", 0.6], ["the_exam_already_passed", 0.45]]],
  ["the_warmth_of_debt", "emotion", 0.25, 0.1, ["the warmth of owing something"], [["long_handshake", 0.45], ["love_without_address", 0.5]]],
  ["cold_pride", "emotion", -0.2, 0.3, ["a cold pride"], [["humming_sergeant", 0.5], ["hollow_monolith", 0.3]]],
  ["tiredness_that_sings", "emotion", 0.2, 0.35, ["a tiredness that sings"], [["climbing_inside_a_chord", 0.5], ["pride_of_craft", 0.3]]],
  ["surprise_of_the_repeated_day", "emotion", 0.1, 0.25, ["surprise at the repeated day"], [["city_that_rearranges", 0.55], ["wonder_open", 0.4]]],
  ["grief_for_a_room", "emotion", -0.4, -0.25, ["grief for a room"], [["being_the_room", 0.55], ["grief_with_sunlight", 0.5]]],
  ["the_courage_of_witnesses", "emotion", 0.2, 0.45, ["the courage of witnesses"], [["the_smallest_witness", 0.6], ["the_crowd_turns_to_listen", 0.45]]],
  ["softness_about_the_edges", "emotion", 0.3, -0.45, ["a softness about the edges"], [["flat_calm", 0.55], ["calm_underwater", 0.5]]],

  // senses
  ["smell_of_hot_dust", "sense", 0.1, 0.3, ["the smell of hot dust"], [["threshing_floor", 0.55], ["quarry", 0.45]]],
  ["sound_of_a_room_choosing", "sense", 0.05, 0.2, ["the sound of a room choosing"], [["house_with_extra_room", 0.55], ["pressure_before_sound", 0.4]]],
  ["taste_of_a_stolen_name", "sense", -0.3, 0.15, ["the taste of a stolen name"], [["wet_slate_of_names", 0.5], ["drip_of_a_name", 0.45]]],
  ["feel_of_the_wire_waking", "sense", 0.15, 0.4, ["the feel of a wire waking"], [["attic_of_warm_wire", 0.55], ["run_the_warm_wire", 0.5]]],
  ["sight_of_light_learning_you", "sense", 0.35, 0.2, ["light learning your face"], [["brightness_behind_eyelids", 0.6], ["being_known_too_well", 0.35]]],
  ["smell_of_two_fires", "sense", -0.15, 0.45, ["the smell of two fires"], [["child_of_two_fires", 0.6], ["book_of_cold_fire", 0.5]]],
  ["sound_of_the_drowned_playing", "sense", -0.35, 0.25, ["the drowned band playing"], [["the_band_of_the_drowned", 0.6], ["voltage_of_a_hymn", 0.45]]],
  ["weight_of_an_apology", "sense", -0.25, -0.1, ["the weight of an apology"], [["apologize_to_stone", 0.6], ["peace_after_the_verdict", 0.4]]],
  ["taste_of_the_bridge_rail", "sense", 0.05, -0.2, ["the taste of the bridge rail"], [["low_bridge_at_dawn", 0.6], ["taste_of_tin", 0.5]]],
  ["light_on_the_unclaimed_seat", "sense", 0.2, -0.3, ["light on an unclaimed seat"], [["the_unclaimed_umbrella", 0.55], ["cold_marble_station", 0.5]]],
  ["feel_of_a_chord_under_skin", "sense", 0.25, 0.5, ["a chord moving under the skin"], [["climbing_inside_a_chord", 0.6], ["hum_in_the_wall", 0.5]]],
  ["smell_of_rain_stored", "sense", 0.1, -0.4, ["the smell of stored rain"], [["reservoir_under_stairs", 0.55], ["engine_of_slow_rain", 0.55]]],

  // scenes
  ["the_locks_all_open", "scene", 0.35, 0.4, ["every lock opening at once"], [["sister_of_the_locks", 0.6], ["open_every_door_at_once", 0.65]]],
  ["rehearsing_the_apology", "scene", -0.25, -0.15, ["rehearsing an apology"], [["weight_of_an_apology", 0.6], ["the_warmth_of_debt", 0.45]]],
  ["class_that_never_ends", "scene", -0.35, -0.2, ["a class that never ends"], [["second_childhood", 0.5], ["count_until_the_light", 0.4]]],
  ["the_drowned_concert", "scene", -0.3, 0.3, ["the drowned concert"], [["sound_of_the_drowned_playing", 0.65], ["salt_mine_of_bells", 0.45]]],
  ["ferry_crossing_backwards", "scene", -0.2, 0.2, ["the ferry crossing backwards"], [["refuse_the_ferry", 0.6], ["arrival_that_was_left", 0.5]]],
  ["kitchen_of_the_second_house", "scene", 0.25, -0.25, ["the kitchen of the second house"], [["set_the_table_again", 0.6], ["grief_for_a_room", 0.4]]],
  ["the_wire_learns_to_sing", "scene", 0.3, 0.45, ["the wire learning to sing"], [["feel_of_the_wire_waking", 0.6], ["tiredness_that_sings", 0.5]]],
  ["waiting_room_of_tides", "scene", -0.1, -0.35, ["the waiting room of the tides"], [["woman_making_the_tide", 0.55], ["wait_in_line", 0.45]]],
  ["the_field_reads_you", "scene", 0.0, 0.25, ["the field reading you aloud"], [["sight_of_light_learning_you", 0.6], ["being_known_too_well", 0.5]]],
  ["harvest_in_the_stairwell", "scene", -0.15, 0.3, ["a harvest in the stairwell"], [["stair_carpet_of_ash", 0.55], ["funeral_that_is_a_harvest", 0.55]]],
  ["court_of_small_bones", "scene", -0.4, 0.2, ["a court of small bones"], [["lantern_of_small_bones", 0.6], ["the_smallest_witness", 0.55]]],
  ["the_ninth_waterfall_stops", "scene", 0.2, 0.1, ["waterfall nine, holding its breath"], [["cold_pride", 0.5], ["softness_about_the_edges", 0.45]]],
  ["audition_for_the_archive", "scene", 0.15, 0.4, ["an audition for the archive"], [["feeding_the_archive", 0.6], ["the_courage_of_witnesses", 0.5]]],
  ["riding_the_wrong_mine_lift", "scene", -0.3, 0.45, ["riding the wrong mine lift"], [["salt_mine_of_bells", 0.6], ["fear_of_the_quiet_part", 0.45]]],
  ["one_more_cup_poured", "scene", 0.3, -0.3, ["one more cup poured"], [["the_fourteenth_cup", 0.6], ["homes_for_a_stranger", 0.35]]],
  ["the_room_takes_a_name", "scene", 0.1, 0.15, ["the room taking a name"], [["name_the_child", 0.55], ["being_the_room", 0.5]]],

  // ——— phase-10 growth: frozen interiors ———
  ["freezer_aisle", "place", -0.15, -0.25, ["the freezer aisle"], [["aisle_that_grows_colder", 0.6], ["the_thaw_inspector", 0.5], ["frost_on_the_inside", 0.45], ["cold_marble_station", 0.4]]],
  ["aisle_that_grows_colder", "place", -0.35, -0.1, ["an aisle growing colder the further you walk"], [["the_unlit_corridor", 0.5], ["longing_blue", 0.45]]],
  ["ice_under_the_carpet", "place", 0.0, 0.25, ["ice laid under the carpet"], [["rink_under_the_kitchen", 0.6], ["being_the_room", 0.45]]],
  ["rink_under_the_kitchen", "scene", 0.2, 0.35, ["the kitchen floor opening into a skating rink"], [["skate_until_the_lights", 0.6], ["kitchen_of_the_second_house", 0.5], ["ice_under_the_carpet", 0.5]]],
  ["skate_until_the_lights", "action", 0.15, -0.2, ["skate until the lights change"], [["light_on_the_unclaimed_seat", 0.45], ["count_until_the_light", 0.45]]],
  ["the_thaw_inspector", "figure", 0.05, 0.2, ["the inspector of the thaw"], [["a_thaw_permit", 0.6], ["humming_sergeant", 0.4], ["the_great_thaw_of_the_whole_country", 0.45]]],
  ["a_thaw_permit", "object", 0.2, -0.1, ["a thaw permit, already signed"], [["wait_in_line", 0.5], ["the_form_you_half_remember", 0.55]]],
  ["frost_on_the_inside", "sense", 0.1, 0.1, ["frost grown on the inside of the glass"], [["glass_attic", 0.5], ["sight_of_light_learning_you", 0.45]]],
  ["breath_you_cannot_finish", "sense", -0.3, 0.15, ["a breath you cannot finish"], [["panic_minor_key", 0.5], ["the_pulse_under_the_stone", 0.45]]],
  ["the_lake_that_stayed", "place", 0.1, -0.4, ["a lake that never left the ice"], [["calm_underwater", 0.6], ["stillness_that_follows_you", 0.5]]],
  ["stillness_that_follows_you", "emotion", -0.25, 0.1, ["the stillness that follows you indoors"], [["flat_calm", 0.5], ["one_without_face", 0.4]]],
  ["snow_inside_the_wardrobe", "scene", -0.1, 0.25, ["snow found inside the wardrobe"], [["house_with_extra_room", 0.55], ["wardrobe_season", 0.55]]],
  ["wardrobe_season", "emotion", 0.25, -0.2, ["the wrong season living in your clothes", "a second-hand frost"], [["homes_for_a_stranger", 0.5], ["touch_of_wet_linen", 0.5], ["laundry_hung_for_the_tide", 0.5]]],
  ["the_frozen_postman", "figure", -0.1, 0.35, ["the postman rimed from head to foot"], [["dead_letter_room", 0.55], ["sorting_the_unsent", 0.5], ["snow_inside_the_wardrobe", 0.4]]],
  ["icicle_harp", "object", 0.15, 0.3, ["a harp strung with icicles"], [["salted_harp", 0.6], ["ring_out", 0.45]]],
  ["the_great_thaw_of_the_whole_country", "scene", 0.3, 0.4, ["the thaw of the whole country in spring"], [["joy_unexpected", 0.5], ["freezer_aisle", 0.45], ["rain_of_small_facts", 0.4]]],
  ["a_moon_on_the_floor", "scene", 0.35, -0.35, ["a moon you found on the floor"], [["light_under_the_door", 0.55], ["softness_about_the_edges", 0.5], ["the_lake_that_stayed", 0.4]]],
  ["thaw_in_the_ceiling", "place", -0.35, -0.05, ["a thaw dripping in the ceiling"], [["reservoir_under_stairs", 0.55], ["fear_of_the_quiet_part", 0.45], ["thaw_water_under_a_door", 0.5]]],
  ["the_stove_that_remembers", "object", 0.3, 0.15, ["a stove that remembers every winter"], [["book_of_cold_fire", 0.55], ["doubled_mother", 0.45], ["winter_of_the_waiting_room", 0.4]]],
  ["warmth_you_must_declare", "emotion", 0.45, -0.35, ["warmness you have to declare out loud"], [["being_known_too_well", 0.5], ["peace_after_the_verdict", 0.45]]],
  ["the_first_drift", "place", 0.3, 0.2, ["the first drift of the season", "the first snow of the year"], [["train_yard_at_night", 0.45], ["smell_of_hot_dust", 0.15], ["winter_of_the_waiting_room", 0.4]]],
  ["fur_on_the_inside", "sense", 0.0, 0.25, ["fur grown on the inside of your coat"], [["wardrobe_season", 0.5], ["the_frozen_postman", 0.2]]],
  ["the_ice_that_hums", "sense", -0.05, 0.3, ["ice humming under its own weight"], [["hum_in_the_wall", 0.55], ["pressure_before_sound", 0.5]]],
  ["winter_of_the_waiting_room", "place", -0.2, -0.3, ["the winter of the waiting room"], [["waiting_room_of_tides", 0.6], ["wait_in_line", 0.5]]],
  ["a_sun_you_left_running", "object", -0.4, -0.2, ["a sun you left running somewhere"], [["hourglass_of_ash", 0.5], ["guilt_of_survivor", 0.45], ["sun_under_a_blanket", 0.55]]],
  ["cold_as_a_favour", "emotion", -0.2, 0.3, ["cold handed out as a favour"], [["the_courage_of_witnesses", 0.4], ["the_thaw_inspector", 0.45]]],
  ["the_sled_arriving_uphill", "object", 0.05, 0.3, ["a sled arriving uphill"], [["the_reverse_ferry", 0.5], ["half_a_wheel", 0.45]]],
  ["the_ice_house_in_the_back_room", "place", 0.1, 0.35, ["the ice house in the back room"], [["ice_under_the_carpet", 0.45], ["being_the_room", 0.5]]],
  ["thaw_water_under_a_door", "sense", 0.0, -0.15, ["thaw water running under a door"], [["light_under_the_door", 0.55], ["dread_before_door", 0.45]]],
  ["the_first_melt", "emotion", 0.5, 0.2, ["the joy of the first melt"], [["joy_unexpected", 0.6], ["thaw_water_under_a_door", 0.5]]],

  // ——— phase-10 growth: letters and impossible offices ———
  ["post_office_of_nobody", "place", -0.1, -0.2, ["the post office of nobody"], [["the_queue_that_becomes_a_room", 0.6], ["cold_marble_station", 0.45], ["dead_letter_room", 0.5]]],
  ["the_form_you_half_remember", "object", -0.3, -0.15, ["a form you only half remember"], [["wait_in_line", 0.55], ["window_that_only_opens_inward", 0.5]]],
  ["stamp_of_your_own_house", "object", 0.2, 0.25, ["a stamp bearing your own house"], [["write_the_number_from_memory", 0.55], ["house_with_extra_room", 0.55]]],
  ["letter_from_your_previous_room", "scene", -0.25, 0.15, ["a letter from the room you lived in"], [["grief_for_a_room", 0.6], ["return_address_that_moves", 0.5]]],
  ["the_clerk_of_second_class", "figure", -0.1, 0.2, ["the clerk of second class"], [["second_sorting_office", 0.6], ["humming_sergeant", 0.45]]],
  ["sorting_the_unsent", "action", 0.1, 0.3, ["sort the letters nobody sent", "sorting the unsent letters"], [["dead_letter_room", 0.6], ["franking_machine_all_night", 0.5]]],
  ["dead_letter_room", "place", -0.35, -0.1, ["the dead letter office"], [["loss_of_the_object_held", 0.5], ["the_frozen_postman", 0.5]]],
  ["return_address_that_moves", "object", 0.0, 0.3, ["a return address that moves when read"], [["city_that_rearranges", 0.55], ["hole_in_your_envelope", 0.45]]],
  ["the_queue_that_becomes_a_room", "scene", -0.3, -0.2, ["the queue that has become a room"], [["wait_in_line", 0.6], ["house_with_extra_room", 0.5]]],
  ["wax_seal_of_a_breath", "object", -0.1, -0.25, ["a wax seal pressed with a breath"], [["pressure_before_sound", 0.45], ["weight_of_correspondence", 0.5]]],
  ["franking_machine_all_night", "object", -0.25, 0.1, ["the franking machine that goes all night"], [["half_a_wheel", 0.5], ["the_ice_that_hums", 0.2]]],
  ["window_that_only_opens_inward", "place", -0.3, -0.15, ["a counter window that only opens inward"], [["archive_of_doors", 0.5], ["dread_before_door", 0.5]]],
  ["pencil_that_is_also_a_widow", "object", -0.25, -0.1, ["a pencil that is also a widow"], [["widow_with_lantern", 0.55], ["wet_slate_of_names", 0.45]]],
  ["postmark_of_the_wrong_town", "object", 0.1, 0.25, ["a postmark from the wrong town"], [["homes_for_a_stranger", 0.5], ["the_nth_telegraph", 0.4]]],
  ["registered_to_someone_else", "scene", -0.35, -0.1, ["registered to someone else"], [["love_without_address", 0.55], ["the_man_who_is_lost", 0.45]]],
  ["weight_of_correspondence", "emotion", -0.2, -0.35, ["the weight of all this correspondence"], [["longing_blue", 0.5], ["being_known_too_well", 0.4]]],
  ["copied_on_a_letter_from_the_sea", "scene", 0.35, -0.1, ["copied on a letter from the sea", "being copied on a letter from the sea"], [["teaching_the_wide_ocean", 0.5], ["folded_sea", 0.5]]],
  ["hole_in_your_envelope", "object", 0.05, 0.25, ["a hole punched into your own envelope"], [["loss_of_the_object_held", 0.45], ["stamp_of_your_own_house", 0.4]]],
  ["write_the_number_from_memory", "action", 0.2, -0.25, ["write the number from memory"], [["metronome_in_case", 0.4], ["postmark_of_the_wrong_town", 0.45]]],
  ["the_box_that_answers", "place", 0.1, 0.3, ["the box that answers when addressed"], [["a_door_in_a_field", 0.5], ["sound_of_a_room_choosing", 0.5]]],
  ["second_sorting_office", "place", -0.2, 0.25, ["the second sorting office, at night"], [["train_yard_at_night", 0.45], ["one_without_face", 0.4]]],
  ["pigeon_of_public_business", "figure", 0.05, 0.35, ["the pigeon with the municipal chain"], [["court_of_small_bones", 0.45], ["the_smallest_witness", 0.4]]],
  ["ink_that_only_reads_wet", "sense", 0.15, -0.3, ["ink that is only black while wet"], [["taste_of_tin", 0.4], ["touch_of_wet_linen", 0.4]]],
  ["the_letter_you_meant_to_send", "scene", -0.35, -0.15, ["the letter you meant to send"], [["forget_on_purpose", 0.6], ["love_without_address", 0.5]]],
  ["stamped_but_never_mailed", "object", -0.3, -0.2, ["stamped but never mailed"], [["the_letter_you_meant_to_send", 0.55], ["wait_in_line", 0.4], ["ink_that_only_reads_wet", 0.35]]],
  ["being_expected_by_a_stranger", "emotion", 0.35, -0.1, ["being expected by a stranger"], [["stranger_returning", 0.55], ["one_more_cup_poured", 0.45]]],
  ["the_deliverer_at_the_wrong_door", "scene", -0.1, 0.3, ["the deliverer at the wrong door"], [["open_every_door_at_once", 0.5], ["dread_before_door", 0.45]]],
  ["telegram_of_your_own_wedding", "scene", 0.25, 0.3, ["the telegram announcing your own wedding"], [["voltage_of_a_hymn", 0.45], ["wedding_in_undercroft", 0.5]]],
  ["the_parcel_you_did_not_order", "object", 0.1, 0.3, ["a parcel you did not order"], [["the_unclaimed_umbrella", 0.45], ["second_childhood", 0.2]]],

  // ——— phase-10 growth: teeth, hair and the borrowed body ———
  ["the_tooth_that_remembers", "object", -0.15, 0.3, ["the tooth that remembers being bone"], [["ladder_of_teeth", 0.65], ["court_of_small_bones", 0.55]]],
  ["teeth_in_a_tea_cup", "scene", -0.5, 0.45, ["finding your teeth in a teacup"], [["the_tooth_that_remembers", 0.6], ["nine_cups", 0.5]]],
  ["a_hand_you_outgrew", "object", -0.3, -0.2, ["a hand you stopped growing into"], [["second_childhood", 0.5], ["growing_past_the_doorframe", 0.45]]],
  ["hair_that_grows_into_rope", "sense", -0.35, 0.35, ["hair braiding itself into rope"], [["mend_the_net", 0.45], ["the_moorings_beyond_the_house", 0.4]]],
  ["the_pulse_under_the_stone", "sense", -0.05, 0.5, ["a pulse under the stone"], [["quarry", 0.6], ["apologize_to_stone", 0.5]]],
  ["growing_past_the_doorframe", "action", 0.3, 0.35, ["grow taller than the doorframe"], [["house_with_extra_room", 0.5], ["child_who_stays", 0.45]]],
  ["the_nails_of_a_room", "object", -0.1, 0.15, ["the nails holding the room together"], [["being_the_room", 0.55], ["house_with_extra_room", 0.4]]],
  ["a_back_that_stops_being_shelves", "scene", -0.4, -0.25, ["your back quietly becoming shelves"], [["dream_archive", 0.5], ["the_reading_you_cannot_put_down", 0.45]]],
  ["the_wound_you_interview", "object", -0.25, 0.3, ["the wound you sit down and interview"], [["panic_minor_key", 0.45], ["the_deliverer_at_the_wrong_door", 0.2]]],
  ["hair_in_the_drain_that_sings", "scene", -0.45, 0.05, ["a drain singing through its hair"], [["drip_of_a_name", 0.5], ["hum_in_the_wall", 0.5]]],
  ["the_knee_that_announces", "action", -0.05, 0.45, ["announce yourself through your knee"], [["ring_out", 0.5], ["the_crowd_turns_to_listen", 0.45]]],
  ["shoulder_of_a_stranger", "object", -0.15, -0.3, ["a stranger's shoulder you keep wearing"], [["long_handshake", 0.5], ["homes_for_a_stranger", 0.45]]],
  ["the_sweat_of_another_sleep", "sense", -0.3, 0.1, ["someone else's sleep on your skin"], [["sleepwalker", 0.55], ["weight_of_a_sleeper", 0.5]]],
  ["ribs_of_a_warehouse", "scene", -0.1, 0.25, ["warehouse ribs you are breathing in"], [["brass_lung", 0.55], ["being_the_room", 0.45]]],
  ["a_voice_you_lent_back", "object", -0.2, -0.3, ["the voice you lent and never asked back"], [["taste_of_the_end_of_a_song", 0.45], ["the_pity_you_survived", 0.45]]],
  ["the_hiccup_of_the_household", "scene", -0.05, 0.4, ["the household hiccuping in unison"], [["sound_of_a_room_choosing", 0.5], ["fear_of_the_quiet_part", 0.45]]],
  ["the_body_as_a_waiting_room", "scene", -0.3, -0.3, ["a body that is mostly a waiting room"], [["waiting_room_of_tides", 0.5], ["the_box_that_answers", 0.4]]],
  ["fingernail_moonlight", "sense", 0.35, 0.1, ["the crescent moon of a fingernail"], [["brightness_behind_eyelids", 0.45], ["moonlit_tank_house", 0.5]]],
  ["your_height_taken_as_a_favour", "action", -0.4, -0.15, ["have your own height measured away"], [["old_surveyor", 0.55], ["the_auditor_of_rain", 0.4]]],
  ["the_tooth_fairy_of_small_sins", "figure", -0.25, 0.25, ["the collector of small sin's teeth"], [["the_smallest_witness", 0.55], ["the_tooth_that_remembers", 0.5]]],
  ["returning_a_borrowed_pulse", "action", -0.3, -0.25, ["return a pulse you were borrowing"], [["half_a_wheel", 0.4], ["hourglass_of_ash", 0.45]]],
  ["the_molar_in_the_garden", "object", 0.0, 0.2, ["one molar planted in the garden"], [["orchard_of_locks", 0.5], ["bloom", 0.45]]],
  ["the_arm_that_governs", "object", -0.05, 0.55, ["the arm that governs the others"], [["rage_of_a_good_tool", 0.5], ["the_knee_that_announces", 0.4]]],
  ["a_hairbrush_of_weddings", "object", -0.3, -0.05, ["a hairbrush full of wedding hair"], [["wedding_in_undercroft", 0.55], ["touch_of_wet_linen", 0.45]]],
  ["the_ear_that_stays_warm", "sense", 0.2, -0.3, ["an ear that stays warm indoors"], [["the_room_above_the_band", 0.45], ["radio_without_station", 0.45]]],
  ["my_blood_keeping_time", "emotion", 0.35, 0.55, ["your own blood keeping the tempo"], [["metronome_in_case", 0.55], ["the_pulse_under_the_stone", 0.5]]],
  ["the_face_your_parents_matched", "emotion", 0.4, -0.1, ["a face your parents keep matching to yours"], [["doubled_mother", 0.55], ["child_who_stays", 0.5], ["mirror_tender", 0.45]]],
  ["an_appearance_you_maintained", "emotion", 0.1, -0.4, ["an appearance you keep up for the house"], [["hum_in_the_wall", 0.35], ["pride_of_craft", 0.4]]],

  // ——— phase-10 growth: deep desert, dry reserves and walking wells ———
  ["well_that_learns_to_walk", "place", -0.1, 0.3, ["a well that has learned to walk"], [["the_keeper_of_dry_wells", 0.6], ["wet_cavern", 0.5]]],
  ["the_dry_reserve", "place", -0.3, -0.25, ["the dry reserve"], [["salt_flat", 0.55], ["a_well_with_two_ropes", 0.5]]],
  ["cistern_of_unused_names", "object", -0.15, 0.2, ["a cistern of names never used"], [["wet_slate_of_names", 0.55], ["drip_of_a_name", 0.5]]],
  ["mirage_of_a_running_bath", "scene", -0.25, 0.35, ["a mirage of a bath running somewhere"], [["kitchen_of_the_second_house", 0.45], ["the_keeper_of_dry_wells", 0.4]]],
  ["bus_stop_in_the_open_desert", "place", -0.2, -0.3, ["a bus stop in the open desert"], [["the_last_nightbus_arrives_early", 0.55], ["waiting_for_train_that_left", 0.5]]],
  ["the_wind_that_takes_the_records", "sense", -0.35, 0.45, ["a wind that takes the records"], [["second_sorting_office", 0.4], ["dream_archive", 0.55]]],
  ["sand_in_the_ledger", "object", -0.25, -0.15, ["sand worked into the ledger"], [["moth_ledger", 0.6], ["feeding_the_archive", 0.45]]],
  ["a_well_with_two_ropes", "object", 0.15, 0.25, ["a well laid with two ropes"], [["well_that_learns_to_walk", 0.6], ["mend_the_net", 0.4]]],
  ["sun_under_a_blanket", "object", 0.2, 0.3, ["the sun tucked under a blanket"], [["brightness_behind_eyelids", 0.55], ["a_sun_you_left_running", 0.55]]],
  ["the_bones_of_a_rainstorm", "object", -0.3, -0.3, ["the bones of a rainstorm"], [["hourglass_of_ash", 0.5], ["pocket_of_rain", 0.55]]],
  ["desert_of_folded_shirts", "scene", -0.25, -0.2, ["a desert of folded shirts"], [["touch_of_wet_linen", 0.55], ["laundry_hung_for_the_tide", 0.5]]],
  ["the_keeper_of_dry_wells", "figure", -0.15, -0.35, ["the keeper of the dry wells"], [["well_that_learns_to_walk", 0.55], ["old_surveyor", 0.5]]],
  ["water_that_only_visits", "emotion", -0.2, -0.25, ["water that only ever visits"], [["calm_underwater", 0.5], ["homes_for_a_stranger", 0.45]]],
  ["khamsin_hour", "scene", 0.1, 0.25, ["at the hour of the sand wind"], [["the_wind_that_takes_the_records", 0.6], ["hunger_old", 0.45]]],
  ["the_cistern_lid", "object", 0.05, -0.3, ["the stone lid of the cistern"], [["cistern_of_unused_names", 0.6], ["archive_of_doors", 0.45]]],
  ["a_date_palm_in_the_undercroft", "scene", 0.15, 0.2, ["a date palm growing through the cellar roof"], [["undercroft", 0.6], ["orchard", 0.5]]],
  ["thirst_with_a_good_name", "emotion", -0.35, 0.1, ["thirst that answers to a good name"], [["hunger_old", 0.6], ["the_name_you_survived", 0.35]]],
  ["the_salvage_sun", "object", 0.35, -0.2, ["a sun put out for salvage"], [["salt_flat", 0.45], ["the_unclaimed_umbrella", 0.35]]],
  ["dune_of_slow_spoons", "object", 0.25, 0.15, ["a dune made of slow spoons"], [["set_the_table_again", 0.5], ["crystallize", 0.45]]],
  ["the_rain_tax", "place", -0.2, 0.2, ["the counting house of the rain tax"], [["the_auditor_of_rain", 0.55], ["window_that_only_opens_inward", 0.5]]],
  ["a_map_of_thirst", "object", -0.3, -0.1, ["a map drawn entirely in thirst"], [["map_of_a_song", 0.5], ["cartographer_of_sleep", 0.55]]],
  ["the_desert_will_visit", "scene", -0.05, 0.3, ["the desert meaning to visit you"], [["the_deliverer_at_the_wrong_door", 0.5], ["salt_flat", 0.45]]],
  ["hour_of_open_flap", "scene", 0.0, 0.4, ["an hour of open flap and dust"], [["market_of_echoes", 0.45], ["the_wind_that_takes_the_records", 0.45]]],
  ["the_dust_that_set_the_table", "scene", -0.4, -0.1, ["dust setting itself a place at the table"], [["set_the_table_again", 0.55], ["fear_of_the_quiet_part", 0.45]]],
  ["salt_of_a_finer_kind", "object", -0.1, -0.25, ["salt of a different, finer sort"], [["salt_flat", 0.55], ["salt_lamp", 0.5]]],
  ["the_cool_theories_of_ice", "emotion", 0.15, -0.35, ["the cool theories of ice"], [["wardrobe_season", 0.45], ["a_sun_you_left_running", 0.3]]],
  ["a_well_that_only_returns_buckets", "object", -0.35, 0.0, ["a well that only returns the bucket"], [["well_that_learns_to_walk", 0.5], ["the_parcel_you_did_not_order", 0.35]]],
  ["the_heat_that_follows_a_person", "emotion", -0.2, 0.4, ["heat that seems to follow one person"], [["child_of_two_fires", 0.5], ["the_smallest_witness", 0.45]]],
  ["rain_of_small_facts", "scene", 0.1, 0.3, ["a rain made of small facts"], [["feeding_the_archive", 0.5], ["smell_of_rain_stored", 0.5]]],

  // ——— phase-10 growth: sleeping vehicles and night lines ———
  ["sleeper_car_of_the_local_line", "place", 0.2, -0.3, ["a sleeper car on the local line"], [["train_yard_at_night", 0.6], ["waiting_for_train_that_left", 0.5]]],
  ["the_tram_in_the_flower_bed", "object", 0.15, 0.15, ["a tram asleep in the flower bed"], [["orchard", 0.5], ["bloom", 0.5]]],
  ["the_bus_that_is_a_corridor", "scene", -0.35, 0.2, ["the bus that keeps being a corridor"], [["the_unlit_corridor", 0.6], ["house_with_extra_room", 0.45]]],
  ["engine_warm_for_nobody", "sense", -0.3, -0.2, ["an engine left warm for no one"], [["the_engine_running_in_the_wing", 0.55], ["the_stove_that_remembers", 0.4]]],
  ["the_last_nightbus_arrives_early", "scene", -0.15, 0.35, ["the last night bus arriving early"], [["the_bus_that_is_a_corridor", 0.55], ["count_until_the_light", 0.45]]],
  ["berth_under_the_wing", "place", 0.25, -0.2, ["a berth built under a wing"], [["the_wing_over_the_back_room", 0.55], ["sleepwalker", 0.45]]],
  ["the_smell_of_diesel_at_dusk", "sense", -0.1, -0.25, ["the smell of diesel at dusk"], [["train_yard_at_night", 0.55], ["engine_warm_for_nobody", 0.5]]],
  ["the_pilot_who_never_existed", "figure", -0.35, 0.25, ["a pilot who never actually existed"], [["the_man_who_is_lost", 0.5], ["wonder_open", 0.4]]],
  ["the_back_seat_that_continues", "object", -0.2, 0.2, ["the back seat of a car that continues"], [["searching_a_familiar_pocket", 0.5], ["the_unclaimed_umbrella", 0.45]]],
  ["the_engine_asleep_still_ticking", "scene", 0.05, -0.4, ["the engine asleep and still ticking"], [["engine_warm_for_nobody", 0.5], ["half_a_wheel", 0.5]]],
  ["let_the_car_drive_itself", "action", 0.3, -0.3, ["let the car remember the driving"], [["the_engine_running_in_the_wing", 0.5], ["pride_of_craft", 0.4]]],
  ["the_garage_that_hums", "place", 0.2, 0.15, ["the garage that hums all night"], [["hum_in_the_wall", 0.55], ["brass_lung", 0.4]]],
  ["the_ship_mirror_sleeping", "place", -0.3, -0.15, ["the ship asleep on its own image"], [["folded_sea", 0.6], ["the_dry_reserve", 0.45]]],
  ["anchor_of_folded_towels", "object", -0.1, -0.3, ["an anchor made of folded towels"], [["the_ship_mirror_sleeping", 0.5], ["touch_of_wet_linen", 0.5]]],
  ["the_sail_hung_out_to_dry", "object", 0.25, -0.2, ["the sail hung out to dry"], [["folded_sea", 0.5], ["mend_the_net", 0.45]]],
  ["driven_by_something_older", "emotion", -0.35, 0.3, ["being driven by something older"], [["humming_sergeant", 0.45], ["the_engine_asleep_still_ticking", 0.4]]],
  ["the_staircase_hanging_in_a_tree", "place", -0.05, 0.4, ["a staircase hanging loose in a tree"], [["long_staircase", 0.6], ["orchard", 0.5]]],
  ["the_station_clock_runs_on_sleep", "scene", -0.25, -0.15, ["the station clock running on sleep"], [["metronome_in_case", 0.5], ["smell_of_a_station_at_night", 0.5]]],
  ["every_signal_set_to_arrive", "scene", 0.3, 0.35, ["every signal set to arrive"], [["arrival_that_was_left", 0.6], ["the_courage_of_witnesses", 0.4]]],
  ["the_tunnel_only_runs_downhill", "place", -0.4, 0.2, ["the tunnel that only runs downhill"], [["wet_cavern", 0.5], ["dissolve", 0.45]]],
  ["the_crossing_of_a_long_memory", "place", -0.25, -0.2, ["the level crossing of a long memory"], [["second_childhood", 0.55], ["waiting_for_train_that_left", 0.5]]],
  ["a_rail_warm_from_a_thought", "sense", 0.1, -0.35, ["a rail still warm from a thought"], [["feel_of_the_wire_waking", 0.55], ["tenderness_for_machines", 0.5]]],
  ["the_road_that_takes_you_to_yourself", "action", 0.4, -0.45, ["take the road that only goes home"], [["arrival_that_was_left", 0.55], ["distance_that_walks", 0.5]]],
  ["the_wheel_you_keep_holding", "object", -0.3, -0.25, ["the wheel you have to keep holding"], [["being_the_room", 0.45], ["half_a_wheel", 0.55]]],
  ["last_one_home_pulling_in", "scene", 0.25, -0.35, ["the last one home, pulling in"], [["relief_after_fall", 0.55], ["light_under_the_door", 0.5]]],
  ["the_engine_room_of_your_own_body", "scene", -0.15, 0.25, ["you are the engine room of a ship"], [["ribs_of_a_warehouse", 0.6], ["brass_lung", 0.5]]],
  ["smell_of_the_bus_after_rain", "sense", 0.15, -0.15, ["the smell of a bus after rain"], [["pocket_of_rain", 0.5], ["the_bus_that_is_a_corridor", 0.5]]],
  ["the_wing_over_the_back_room", "place", 0.35, 0.4, ["a wing over the back room"], [["house_with_extra_room", 0.55], ["sky_opens_indoors", 0.5]]],
  ["the_engine_running_in_the_wing", "sense", -0.05, 0.35, ["the engine running in an empty wing"], [["the_wing_over_the_back_room", 0.55], ["pressure_before_sound", 0.5]]],

  // ——— phase-10 growth: tide clocks, night museums, animals in office, washdays ———
  ["the_tide_clock", "object", 0.15, -0.25, ["a tide clock in the pantry", "the clock that only tells the tide"], [["woman_making_the_tide", 0.55], ["waiting_room_of_tides", 0.5]]],
  ["the_badger_clerk", "figure", -0.1, 0.3, ["the badger with the municipal stamp"], [["window_that_only_opens_inward", 0.5], ["the_smallest_witness", 0.4]]],
  ["the_ox_judge", "figure", -0.05, 0.15, ["the ox that hears every case"], [["court_of_small_bones", 0.6], ["weight_of_an_apology", 0.45]]],
  ["the_wasp_choir", "figure", -0.4, 0.55, ["the wasp choir in the clock tower"], [["climbing_inside_a_chord", 0.5], ["fear_of_the_quiet_part", 0.45]]],
  ["crow_registrar", "figure", -0.1, 0.4, ["the crow who keeps the register"], [["dream_archive", 0.55], ["feeding_the_archive", 0.5]]],
  ["the_museum_of_sleep", "place", -0.1, -0.4, ["an evening at the museum of sleep", "the museum of sleep after closing"], [["hall_of_sleeping_machines", 0.6], ["case_after_case_opened", 0.55], ["sleeper_car_of_the_local_line", 0.45]]],
  ["laundry_hung_for_the_tide", "scene", 0.2, -0.3, ["laundry hung for the tide"], [["woman_making_the_tide", 0.55], ["touch_of_wet_linen", 0.5]]],
  ["hall_of_sleeping_machines", "place", -0.25, -0.2, ["the hall of sleeping machines"], [["tenderness_for_machines", 0.6], ["engine_warm_for_nobody", 0.5]]],
  ["the_display_coffin", "object", -0.35, -0.1, ["a corridor of glass coffins"], [["hourglass_of_ash", 0.45], ["undercroft", 0.5]]],
  ["the_morgue_attendant", "figure", -0.3, -0.35, ["the curator of the closed hours"], [["flooded_chapel", 0.5], ["salt_lamp", 0.35]]],
  ["case_after_case_opened", "scene", 0.0, 0.3, ["a label rewritten while you read it"], [["the_museum_of_sleep", 0.6], ["color_that_has_no_name", 0.45]]],
  ["ward_round", "scene", -0.3, 0.25, ["you are read aloud to the ward"], [["the_smallest_witness", 0.55], ["reading_aloud_in_the_stacks", 0.6]]],
  ["the_linen_cupboard_of_weathers", "place", 0.0, -0.1, ["the linen cupboard that knows the weather"], [["touch_of_wet_linen", 0.55], ["wardrobe_season", 0.5]]],
  ["sheets_taken_in_before_rain", "action", 0.15, -0.3, ["sheets taken in before the rain"], [["washday_with_the_sea", 0.5], ["pocket_of_rain", 0.4]]],
  ["the_heron_ticket_inspector", "figure", -0.1, 0.5, ["the heron checking tickets at dawn"], [["the_crossing_of_a_long_memory", 0.5], ["wait_in_line", 0.45]]],
  ["wasp_nest_civic_record", "object", -0.15, 0.45, ["the wasp nest as civic record"], [["feeding_the_archive", 0.5], ["the_wasp_choir", 0.6]]],
  ["court_of_the_ox", "scene", -0.2, 0.05, ["the judge who is also an ox"], [["the_ox_judge", 0.65], ["peace_after_the_verdict", 0.5]]],
  ["the_tide_clock_stops_being_wrong", "scene", 0.2, -0.3, ["the tide coming in by clockwork"], [["tide_table_of_small_wonders", 0.55], ["flat_calm", 0.45]]],
  ["the_animal_turnstile", "object", -0.2, 0.35, ["the animal turnstile", "the moth turnstile counting you"], [["cold_marble_station", 0.5], ["pay_your_respect_to_the_turnstile", 0.55]]],
  ["pay_your_respect_to_the_turnstile", "action", -0.1, 0.3, ["to pay your respect to the turnstile"], [["the_animal_turnstile", 0.6], ["the_badger_clerk", 0.45]]],
  ["washday_with_the_sea", "scene", 0.25, 0.1, ["a washday with the sea"], [["laundry_hung_for_the_tide", 0.6], ["teaching_the_wide_ocean", 0.5]]],
  ["the_sheet_line_over_the_estuary", "object", 0.2, -0.15, ["a shirt dried on the tidal line"], [["estuary", 0.6], ["sheets_taken_in_before_rain", 0.5]]],
  ["the_night_the_exhibits_moved", "scene", 0.0, 0.4, ["the night the exhibits moved house", "exhibits quietly moving house at night"], [["case_after_case_opened", 0.55], ["crow_registrar", 0.4]]],
  ["the_elephant_who_stamps_your_card", "action", -0.15, 0.4, ["the elephant who stamps your card"], [["postmark_of_the_wrong_town", 0.5], ["the_animal_turnstile", 0.45]]],
  ["animal_office_after_hours", "place", -0.2, -0.25, ["the animal office after hours", "an office for animal business"], [["the_badger_clerk", 0.55], ["second_sorting_office", 0.5]]],
  ["the_parrot_of_lost_property", "figure", 0.0, 0.2, ["the parrot of the lost property office"], [["searching_a_familiar_pocket", 0.5], ["loss_of_the_object_held", 0.5]]],
  ["the_zoo_of_things_not_seen", "place", -0.3, 0.1, ["a room full of un-met animals"], [["dread_before_door", 0.45], ["one_without_face", 0.45]]],
  ["the_name_you_survived", "object", -0.35, -0.2, ["the name you survived"], [["wet_slate_of_names", 0.6], ["guilt_of_survivor", 0.5]]],
  ["the_reading_you_cannot_put_down", "object", 0.25, -0.3, ["a book that reads back"], [["feeding_the_archive", 0.45], ["reading_aloud_in_the_stacks", 0.6]]],
  ["reading_aloud_in_the_stacks", "scene", 0.1, -0.25, ["reading aloud in the stacks of the museum"], [["the_museum_of_sleep", 0.55], ["the_crowd_turns_to_listen", 0.45]]],
  ["a_child_raising_its_own_stillness", "emotion", 0.3, 0.4, ["a child raising its own stillness"], [["child_who_stays", 0.55], ["second_childhood", 0.5]]],
  ["the_stone_honeycomb", "object", 0.2, 0.2, ["a honeycomb cut in stone"], [["hollow_monolith", 0.55], ["brass_seed", 0.5]]],
  ["the_stone_masons_beemaster", "figure", 0.1, 0.35, ["the bee master of the stone masons"], [["the_stone_honeycomb", 0.6], ["quarry", 0.5]]],
  ["mother_of_the_laundry", "figure", 0.35, 0.25, ["your own mother inside the linen"], [["doubled_mother", 0.55], ["sheets_taken_in_before_rain", 0.5]]],
  ["the_smell_of_the_yard_at_dawn", "sense", 0.1, -0.3, ["the smell of the yard at dawn"], [["train_yard_at_night", 0.6], ["last_one_home_pulling_in", 0.4]]],
  ["your_face_you_wore_at_nine", "object", 0.2, -0.35, ["the face you wore at nine years old"], [["second_childhood", 0.55], ["the_face_your_parents_matched", 0.5]]],
  ["an_earring_of_anchor_chain", "object", -0.1, 0.5, ["a hairpin forged from anchor chain"], [["hair_that_grows_into_rope", 0.55], ["anchor_of_folded_towels", 0.5]]],
  ["the_pulse_of_a_horse_next_door", "sense", -0.1, -0.35, ["the pulse of a horse in another yard"], [["the_pulse_under_the_stone", 0.5], ["smell_of_a_station_at_night", 0.4]]],
  ["your_tongue_printing_your_name", "action", 0.25, 0.25, ["feel your tongue printing your own name"], [["name_the_child", 0.5], ["the_name_you_survived", 0.5]]],
  ["the_child_who_lives_there", "figure", -0.25, -0.2, ["the child who lives in the waiting room"], [["waiting_room_of_tides", 0.55], ["class_that_never_ends", 0.45]]],
  ["a_swing_for_the_smallest_witness", "object", 0.2, 0.1, ["a swing installed for the very smallest"], [["the_smallest_witness", 0.6], ["being_taught_by_animal", 0.4]]],
  ["the_sheep_under_the_table", "scene", -0.15, 0.3, ["the sheep kept under the table"], [["set_the_table_again", 0.5], ["court_of_the_ox", 0.45]]],
  ["a_room_of_laughter_late", "scene", -0.35, -0.2, ["a room of laughter you arrived late to"], [["the_crowd_turns_to_listen", 0.5], ["homes_for_a_stranger", 0.45]]],
  ["the_sky_you_learned_by_heart", "emotion", 0.4, -0.35, ["the sky you knew from one window"], [["sky_opens_indoors", 0.5], ["glass_attic", 0.5]]],
  ["an_ox_yoke_on_a_pupil", "object", -0.4, 0.15, ["an ox yoke resting on a school child"], [["the_child_who_lives_there", 0.5], ["class_that_never_ends", 0.5]]],
  ["a_bell_that_needs_no_tower", "object", 0.45, 0.3, ["a bell that no longer needs its tower"], [["bell_tower", 0.6], ["the_wing_over_the_back_room", 0.4]]],
  ["the_moorings_beyond_the_house", "place", 0.15, -0.2, ["the moorings beyond the house"], [["house_with_extra_room", 0.5], ["anchor_of_folded_towels", 0.45]]],
  ["tide_table_of_small_wonders", "object", 0.35, -0.15, ["a tide table of small wonders"], [["wait_in_line", 0.4], ["wonder_open", 0.5]]],
];

/**
 * The remote tail (M4): associations no clustering would produce — the reason a dream
 * can put a wedding next to a telegraph and expect you to accept it. All weights ≤0.25.
 */
export const REMOTE_TAIL: readonly RemoteLink[] = [
  ["wedding_in_undercroft", "radio_without_station", 0.12],
  ["wedding_in_undercroft", "metronome_in_case", 0.1],
  ["the_conductor", "hourglass_of_ash", 0.14],
  ["the_conductor", "the_smallest_witness", 0.11],
  ["orchard", "cold_marble_station", 0.13],
  ["orchard", "brass_lung", 0.09],
  ["greenhouse", "the_unclaimed_umbrella", 0.12],
  ["greenhouse", "stair_carpet_of_ash", 0.1],
  ["estuary", "sewing_box_of_storms", 0.15],
  ["estuary", "court_of_small_bones", 0.08],
  ["bell_tower", "mirror_of_household_water", 0.12],
  ["bell_tower", "wire_spool_of_a_child", 0.1],
  ["hollow_monolith", "tiredness_that_sings", 0.13],
  ["hollow_monolith", "kitchen_of_the_second_house", 0.11],
  ["long_staircase", "smell_of_two_fires", 0.12],
  ["undercroft", "light_on_the_unclaimed_seat", 0.14],
  ["quarry", "the_wire_learns_to_sing", 0.1],
  ["iron_garden", "grief_for_a_room", 0.13],
  ["iron_garden", "one_more_cup_poured", 0.09],
  ["glass_attic", "class_that_never_ends", 0.12],
  ["market_of_echoes", "weight_of_an_apology", 0.15],
  ["market_of_echoes", "read_the_wet_slate", 0.1],
  ["train_yard_at_night", "the_ninth_waterfall_stops", 0.12],
  ["observatory_deck", "the_locks_all_open", 0.11],
  ["sugar_mill", "rehearsing_the_apology", 0.13],
  ["field_with_one_tree", "engine_of_slow_rain", 0.1],
  ["archive_of_doors", "smell_of_hot_dust", 0.14],
  ["flooded_chapel", "delight_of_small_machines", 0.12],
  ["flooded_chapel", "the_field_reads_you", 0.1],
  ["salt_flat", "feel_of_a_chord_under_skin", 0.13],
  ["pier_lanterns", "the_pity_you_survived", 0.11],
  ["wet_cavern", "book_of_cold_fire", 0.12],
  ["rooftop_no_wind", "waiting_room_of_tides", 0.14],
  ["atlas_moth", "half_a_wheel", 0.1],
  ["forgive_engine", "taste_of_a_stolen_name", 0.13],
  ["salted_harp", "harvest_in_the_stairwell", 0.11],
  ["pocket_of_rain", "cold_pride", 0.12],
  ["broken_compass", "being_known_too_well", 0.14],
  ["wet_photograph", "the_drowned_concert", 0.1],
  ["nine_cups", "audition_for_the_archive", 0.12],
  ["telescope_reversed", "lantern_of_small_bones", 0.11],
  ["open_cage", "homes_for_a_stranger", 0.13],
  ["ladder_of_teeth", "taste_of_the_bridge_rail", 0.1],
  ["map_of_a_song", "nurse_of_the_extra_room", 0.12],
  ["cathedral_battery", "the_man_who_is_lost", 0.14],
  ["drip_of_a_name", "softness_about_the_edges", 0.1],
  ["confess_to_water", "rage_of_a_good_tool", 0.13],
  ["count_the_windows", "the_courage_of_witnesses", 0.11],
  ["name_the_child", "riding_the_wrong_mine_lift", 0.12],
  ["wait_in_line", "surprise_of_the_repeated_day", 0.1],
  ["swallow_the_bell", "peace_after_the_verdict", 0.14],
  ["learn_the_language", "salt_mine_of_bells", 0.1],
  ["bloom", "forget_on_purpose", 0.12],
  ["convulse", "set_the_table_again", 0.11],
  ["echo_back", "water_the_locked_room", 0.13],
  ["hum", "moonlit_tank_house", 0.1],
  ["surface", "threshing_floor", 0.12],
  ["metabolize", "the_third_parent", 0.11],
  ["joy_unexpected", "court_of_small_bones", 0.1],
  ["flat_calm", "child_of_two_fires", 0.13],
  ["longing_blue", "the_band_of_the_drowned", 0.12],
  ["wonder_open", "key_of_warm_glass", 0.1],
  ["panic_minor_key", "one_more_cup_poured", 0.11],
  ["pride_of_craft", "ferry_crossing_backwards", 0.13],
  ["love_without_address", "canal_of_stone_beds", 0.1],
  ["distance_that_walks", "old_husband_of_doors", 0.12],
  ["brightness_behind_eyelids", "sister_of_the_locks", 0.11],
  ["silence_after_siren", "sight_of_light_learning_you", 0.1],
  ["voltage_of_a_hymn", "the_auditor_of_rain", 0.13],
  ["cold_water_taste", "the_lathe_tender", 0.1],
  ["sound_of_many_wings", "the_room_above_the_band", 0.12],
  ["taste_of_the_end_of_a_song", "moonlit_tank_house", 0.1],
  ["being_the_room", "kneel_in_water", 0.11],
  ["city_that_rearranges", "sugar_cube_microscope", 0.12],
  ["second_childhood", "the_room_takes_a_name", 0.1],
  ["arrival_that_was_left", "wire_spool_of_a_child", 0.13],
  ["loss_of_the_object_held", "answer_in_a_minor_key", 0.1],
  // phase-10 growth: the new clusters' strange long-range hooks into the old corpus
  ["freezer_aisle", "voltage_of_a_hymn", 0.12],
  ["the_frozen_postman", "arrival_that_was_left", 0.13],
  ["icicle_harp", "sound_of_many_wings", 0.11],
  ["the_museum_of_sleep", "dream_archive", 0.14],
  ["the_display_coffin", "loss_of_the_object_held", 0.1],
  ["hall_of_sleeping_machines", "the_engine_asleep_still_ticking", 0.12],
  ["the_zoo_of_things_not_seen", "fear_of_the_quiet_part", 0.13],
  ["the_name_you_survived", "grief_with_sunlight", 0.11],
  ["a_bell_that_needs_no_tower", "silence_after_siren", 0.12],
  ["tide_table_of_small_wonders", "pier_lanterns", 0.1],
  ["the_animal_turnstile", "waiting_for_train_that_left", 0.13],
  ["snow_inside_the_wardrobe", "homes_for_a_stranger", 0.12],
];

export const DEFAULT_BANK: MemoryBank = parseBank(BANK, REMOTE_TAIL);
