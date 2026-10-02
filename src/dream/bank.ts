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
  ["hum", "action", 0.0, 0.25, ["hum"], [["hum_in_the_wall", 0.7], ["copper_throat", 0.5]]],
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
  ["the_ninth_waterfall_stops", "scene", 0.2, 0.1, ["the ninth waterfall stopping"], [["cold_pride", 0.5], ["softness_about_the_edges", 0.45]]],
  ["audition_for_the_archive", "scene", 0.15, 0.4, ["an audition for the archive"], [["feeding_the_archive", 0.6], ["the_courage_of_witnesses", 0.5]]],
  ["riding_the_wrong_mine_lift", "scene", -0.3, 0.45, ["riding the wrong mine lift"], [["salt_mine_of_bells", 0.6], ["fear_of_the_quiet_part", 0.45]]],
  ["one_more_cup_poured", "scene", 0.3, -0.3, ["one more cup poured"], [["the_fourteenth_cup", 0.6], ["homes_for_a_stranger", 0.35]]],
  ["the_room_takes_a_name", "scene", 0.1, 0.15, ["the room taking a name"], [["name_the_child", 0.55], ["being_the_room", 0.5]]],
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
];

export const DEFAULT_BANK: MemoryBank = parseBank(BANK, REMOTE_TAIL);
