// TODO all of these will need to be renumbered
declare const enum Modifier_Id {
    rune_double_damage = -2,
    rune_haste = -1,

    tide_gush = 0,
    tide_anchor_smash = 1,
    tide_ravage = 2,
    skywrath_concussive_shot = 3,
    skywrath_ancient_seal = 4,
    dragon_knight_dragon_tail = 5,
    dragon_knight_elder_dragon_form = 6,
    lion_hex = 7,
    lion_impale = 8,
    mirana_arrow = 9,
    venge_magic_missile = 10,
    venge_wave_of_terror = 11,
    dark_seer_ion_shell = 12,
    dark_seer_surge = 13,
    ember_searing_chains = 14,
    ember_fire_remnant_caster = 15,
    ember_fire_remnant = 16,

    item_boots_of_travel = 100,
    item_heart_of_tarrasque = 101,
    item_assault_cuirass = 102,
    item_satanic = 103,
    item_divine_rapier = 104,
    item_mask_of_madness = 105,
    item_armlet = 106,
    item_boots_of_speed = 107,
    item_blades_of_attack = 108,
    item_belt_of_strength = 109,
    item_morbid_mask = 110,
    item_chainmail = 111,
    item_octarine_core = 112,
    item_basher_bearer = 113,
    item_basher_target = 114,

    spell_euls_scepter = 200,
    spell_buckler = 201,
    spell_drums_of_endurance = 202,

    returned_to_hand = 1000
}

type Modifier = {
    id: Modifier_Id.rune_haste
    move_bonus: number
} | {
    id: Modifier_Id.rune_double_damage
} | {
    id: Modifier_Id.tide_gush
    move_reduction: number
} | {
    id: Modifier_Id.tide_anchor_smash
    attack_reduction: number
} | {
    id: Modifier_Id.tide_ravage
} | {
    id: Modifier_Id.skywrath_concussive_shot
    move_reduction: number
} | {
    id: Modifier_Id.skywrath_ancient_seal
} | {
    id: Modifier_Id.dragon_knight_dragon_tail
} | {
    id: Modifier_Id.dragon_knight_elder_dragon_form
} | {
    id: Modifier_Id.lion_hex
    move_reduction: number
} | {
    id: Modifier_Id.lion_impale
} | {
    id: Modifier_Id.mirana_arrow
} | {
    id: Modifier_Id.venge_magic_missile
} | {
    id: Modifier_Id.venge_wave_of_terror
    armor_reduction: number
} | {
    id: Modifier_Id.dark_seer_ion_shell
} | {
    id: Modifier_Id.dark_seer_surge
    move_bonus: number
} | {
    id: Modifier_Id.ember_searing_chains
} | {
    id: Modifier_Id.ember_fire_remnant_caster
} | {
    id: Modifier_Id.ember_fire_remnant
} | {
    id: Modifier_Id.item_boots_of_travel
    move_bonus: number
} | {
    id: Modifier_Id.item_heart_of_tarrasque
    health: number
} | {
    id: Modifier_Id.item_assault_cuirass
    armor: number
} | {
    id: Modifier_Id.item_satanic
} | {
    id: Modifier_Id.item_divine_rapier
    attack: number
} | {
    id: Modifier_Id.item_mask_of_madness
    attack: number
} | {
    id: Modifier_Id.item_armlet
    health: number
} | {
    id: Modifier_Id.item_boots_of_speed
    move_bonus: number
} | {
    id: Modifier_Id.item_blades_of_attack
    attack: number
} | {
    id: Modifier_Id.item_belt_of_strength
    health: number
} | {
    id: Modifier_Id.item_morbid_mask
} | {
    id: Modifier_Id.item_chainmail
    armor: number
} | {
    id: Modifier_Id.item_octarine_core
} | {
    id: Modifier_Id.item_basher_bearer
} | {
    id: Modifier_Id.item_basher_target
} | {
    id: Modifier_Id.spell_euls_scepter
} | {
    id: Modifier_Id.spell_buckler
    armor: number
} | {
    id: Modifier_Id.spell_drums_of_endurance
    move_bonus: number
} | {
    id: Modifier_Id.returned_to_hand
}