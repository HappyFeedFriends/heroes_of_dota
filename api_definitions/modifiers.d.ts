// TODO all of these will need to be renumbered
declare const enum Modifier_Id {
    rune_double_damage = -2,
    rune_haste = -1,

    tide_gush = 0,
    skywrath_concussive_shot = 3,
    skywrath_ancient_seal = 4,
    dragon_knight_elder_dragon_form = 6,
    lion_hex = 7,
    venge_wave_of_terror = 11,
    dark_seer_ion_shell = 12,
    dark_seer_surge = 13,
    ember_searing_chains = 14,
    ember_fire_remnant_caster = 15,
    ember_fire_remnant = 16,
    shaker_enchant_totem_caster = 18,
    veno_venomous_gale = 20,
    veno_poison_nova = 21,
    bounty_hunter_shadow_walk = 22,
    bounty_hunter_jinada = 23,
    bounty_hunter_track_aura = 24,
    bounty_hunter_track = 25,

    item_heart_of_tarrasque = 101,
    item_iron_branch = 102,
    item_satanic = 103,
    item_mask_of_madness = 105,
    item_armlet = 106,
    item_morbid_mask = 110,
    item_octarine_core = 112,
    item_basher = 113,
    item_phase_boots = 114,
    item_spider_legs = 115,

    spell_euls_scepter = 200,
    spell_buckler = 201,
    spell_drums_of_endurance = 202,
    spell_moonlight_shadow = 203,

    move_speed = 300,
    armor = 301,
    attack_damage = 302,
    health = 303,
    stunned = 304,
    rooted = 305,
    replace_ability = 306,

    returned_to_hand = 400,
    aura = 1000
}

declare const enum Aura_Selector_Flag {
    allies = 0,
    enemies = 1
}

type Modifier = {
    id: Modifier_Id.attack_damage
    bonus: number
} | {
    id: Modifier_Id.armor
    bonus: number
} | {
    id: Modifier_Id.move_speed
    bonus: number
} | {
    id: Modifier_Id.health
    bonus: number
} | {
    id: Modifier_Id.stunned
} | {
    id: Modifier_Id.rooted
} | {
    id: Modifier_Id.replace_ability
    from: Ability_Id
    to: Ability_Id
} | {
    id: Modifier_Id.rune_haste
    move_bonus: number
} | {
    id: Modifier_Id.rune_double_damage
} | {
    id: Modifier_Id.tide_gush
    move_reduction: number
} | {
    id: Modifier_Id.skywrath_concussive_shot
    move_reduction: number
} | {
    id: Modifier_Id.skywrath_ancient_seal
} | {
    id: Modifier_Id.dragon_knight_elder_dragon_form
} | {
    id: Modifier_Id.lion_hex
    move_reduction: number
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
    remnant_unit_id: Unit_Id
} | {
    id: Modifier_Id.ember_fire_remnant
    remnant_owner_unit_id: Unit_Id
} | {
    id: Modifier_Id.shaker_enchant_totem_caster
} | {
    id: Modifier_Id.veno_venomous_gale
    move_reduction: number
    poison_applied: number
} | {
    id: Modifier_Id.veno_poison_nova
} | {
    id: Modifier_Id.bounty_hunter_shadow_walk
    move_bonus: number
} | {
    id: Modifier_Id.bounty_hunter_jinada
    move_reduction: number
} | {
    id: Modifier_Id.bounty_hunter_track
    move_bonus: number
} | {
    id: Modifier_Id.bounty_hunter_track_aura
    selector: Aura_Selector
    modifier: Modifier
} | {
    id: Modifier_Id.item_heart_of_tarrasque
    health: number
    regeneration_per_turn: number
} | {
    id: Modifier_Id.item_satanic
} | {
    id: Modifier_Id.item_mask_of_madness
    attack: number
} | {
    id: Modifier_Id.item_armlet
    health: number
    health_loss_per_turn: number
} | {
    id: Modifier_Id.item_morbid_mask
    health_restored_per_attack: number
} | {
    id: Modifier_Id.item_octarine_core
} | {
    id: Modifier_Id.item_basher
} | {
    id: Modifier_Id.item_iron_branch
    health_bonus: number
    attack_bonus: number
    armor_bonus: number
    moves_bonus: number
} | {
    id: Modifier_Id.item_phase_boots | Modifier_Id.item_spider_legs
    move_bonus: number
} | {
    id: Modifier_Id.spell_euls_scepter
} | {
    id: Modifier_Id.spell_buckler
    armor: number
} | {
    id: Modifier_Id.spell_drums_of_endurance
    move_bonus: number
} | {
    id: Modifier_Id.spell_moonlight_shadow
} | {
    id: Modifier_Id.returned_to_hand
} | {
    id: Modifier_Id.aura
    selector: Aura_Selector
    modifier: Modifier
}

type Aura_Selector = {
    rectangle_distance: number
    flags: Record<Aura_Selector_Flag, boolean>
}

type Delta_Modifier_Effect_Applied_Base = {
    type: Delta_Type.modifier_effect_applied
    handle_id: Modifier_Handle_Id
}

type Delta_Modifier_Effect_Applied = Delta_Modifier_Effect_Applied_Base & ({
    modifier_id: Modifier_Id.item_armlet
    change: Unit_Health_Change
} | {
    modifier_id: Modifier_Id.item_heart_of_tarrasque
    change: Unit_Health_Change
} | {
    modifier_id: Modifier_Id.item_octarine_core
    heal: Unit_Health_Change
} | {
    modifier_id: Modifier_Id.item_morbid_mask | Modifier_Id.item_satanic | Modifier_Id.item_octarine_core
    heal: Unit_Health_Change
} | {
    modifier_id: Modifier_Id.item_basher
    target_unit_id: Unit_Id
    modifier: Modifier_Application
});