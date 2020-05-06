declare const enum Ability_Id {
    basic_attack = -1,
    pudge_hook = 0,
    pudge_rot = 1,
    pudge_dismember = 3,
    tide_gush = 4,
    tide_anchor_smash = 5,
    tide_ravage = 7,
    luna_lucent_beam = 8,
    luna_moon_glaive = 9,
    luna_eclipse = 11,
    skywrath_concussive_shot = 12,
    skywrath_ancient_seal = 13,
    skywrath_mystic_flare = 14,
    dragon_knight_breathe_fire = 15,
    dragon_knight_dragon_tail = 16,
    dragon_knight_elder_dragon_form = 17,
    dragon_knight_elder_dragon_form_attack = 18,
    lion_hex = 19,
    lion_impale = 20,
    lion_finger_of_death = 21,
    mirana_starfall = 22,
    mirana_arrow = 23,
    mirana_leap = 24,
    venge_magic_missile = 25,
    venge_wave_of_terror = 26,
    venge_nether_swap = 27,
    dark_seer_ion_shell = 28,
    dark_seer_surge = 29,
    dark_seer_vacuum = 30,
    ember_searing_chains = 31,
    ember_sleight_of_fist = 32,
    ember_fire_remnant = 33,
    ember_activate_fire_remnant = 34,
    shaker_fissure = 35,
    shaker_enchant_totem = 36,
    shaker_enchant_totem_attack = 37,
    shaker_echo_slam = 38,
    venomancer_plague_wards = 39,
    venomancer_venomous_gale = 40,
    venomancer_poison_nova = 41,
    plague_ward_attack = 42,
    bounty_hunter_shadow_walk = 43,
    bounty_hunter_jinada = 44,
    bounty_hunter_jinada_attack = 45,
    bounty_hunter_track = 46,

    pocket_tower_attack = 1000,
    deployment_zone = 1001,

    monster_lifesteal = 2000,
    monster_spawn_spiderlings = 2001,
}

declare const enum Ability_Flag {
    does_not_consume_action = 0
}

type With_Charges_And_Flags = {
    charges_remaining: number
    flags: Ability_Flag[]
}

type Ability_Active = Ability_Ground_Target | Ability_Unit_Target | Ability_No_Target

type Ability = Ability_Passive | Ability_Active

type Ability_Definition_Ground_Target = Find_By_Type<Ability_Stats, Ability_Type.target_ground> & Ability_Definition_Active_Base
type Ability_Definition_Unit_Target = Find_By_Type<Ability_Stats, Ability_Type.target_unit> & Ability_Definition_Active_Base
type Ability_Definition_No_Target = Find_By_Type<Ability_Stats, Ability_Type.no_target> & Ability_Definition_Active_Base
type Ability_Definition_Passive = Find_By_Type<Ability_Stats, Ability_Type.passive> & Ability_Definition_Passive_Base

type Ability_Ground_Target = Ability_Definition_Ground_Target & With_Charges_And_Flags
type Ability_Unit_Target = Ability_Definition_Unit_Target & With_Charges_And_Flags
type Ability_No_Target = Ability_Definition_No_Target & With_Charges_And_Flags

type Ability_Passive = Ability_Definition_Passive & {
    intrinsic_modifiers: Modifier[]
}

type Ability_Definition_Active =
    Ability_Definition_Ground_Target |
    Ability_Definition_Unit_Target |
    Ability_Definition_No_Target

type Ability_Definition = Ability_Definition_Active | Ability_Definition_Passive

type Ability_Stats =
    Ability_Basic_Attack |

    Ability_Skywrath_Concussive_Shot |
    Ability_Skywrath_Ancient_Seal |
    Ability_Skywrath_Mystic_Flare |

    Ability_Dragon_Knight_Breathe_Fire |
    Ability_Dragon_Knight_Dragon_Tail |
    Ability_Dragon_Knight_Elder_Dragon_Form |
    Ability_Dragon_Knight_Elder_Dragon_Form_Attack |

    Ability_Lion_Impale |
    Ability_Lion_Hex |
    Ability_Lion_Finger_Of_Death |

    Ability_Mirana_Starfall |
    Ability_Mirana_Arrow |
    Ability_Mirana_Leap |

    Ability_Venge_Magic_Missile |
    Ability_Venge_Wave_Of_Terror |
    Ability_Venge_Nether_Swap |

    Ability_Dark_Seer_Surge |
    Ability_Dark_Seer_Ion_Shell |
    Ability_Dark_Seer_Vacuum |

    Ability_Shaker_Fissure |
    Ability_Shaker_Enchant_Totem |
    Ability_Shaker_Enchant_Totem_Attack |
    Ability_Shaker_Echo_Slam |

    Ability_Pudge_Hook |
    Ability_Pudge_Rot |
    Ability_Pudge_Dismember |

    Ability_Tide_Gush |
    Ability_Tide_Anchor_Smash |
    Ability_Tide_Ravage |

    Ability_Luna_Lucent_Beam |
    Ability_Luna_Moon_Glaive |
    Ability_Luna_Eclipse |

    Ability_Ember_Searing_Chains |
    Ability_Ember_Sleight_Of_Fist |
    Ability_Ember_Fire_Remnant |
    Ability_Ember_Activate_Fire_Remnant |

    Venomancer_Abilities |

    Bounty_Hunter_Abilities |

    Ability_Pocket_Tower_Attack |
    Ability_Deployment_Zone |
    Ability_Monster_Lifesteal |
    Ability_Monster_Spawn_Spiderlings

type Ability_Effect =
    Ability_Effect_Luna_Moon_Glaive |
    Ability_Effect_Mirana_Starfall |
    Ability_Effect_Dark_Seer_Ion_Shell |
    Ability_Effect_Pocket_Tower_Attack |
    Ablity_Effect_Monster_Lifesteal |
    Ablity_Effect_Monster_Spawn_Spiderlings |
    Ability_Effect_Plague_Ward_Attack

type Ability_Definition_Active_Base = {
    available_since_level: number
    charges: number
    flags?: Ability_Flag[]
}

type Ability_Definition_Passive_Base = {
    type: Ability_Type.passive
    available_since_level: number
    intrinsic_modifiers?: Modifier[]
}

type Ability_Basic_Attack = {
    id: Ability_Id.basic_attack
    type: Ability_Type.target_unit
    targeting: Ability_Targeting
}

type Ability_Pudge_Hook = {
    id: Ability_Id.pudge_hook
    type: Ability_Type.target_unit
    targeting: Ability_Targeting
    damage: number
}

type Ability_Pudge_Rot = {
    id: Ability_Id.pudge_rot
    type: Ability_Type.no_target
    selector: Ability_Area_Selector
    damage: number
}

type Ability_Pudge_Dismember = {
    id: Ability_Id.pudge_dismember
    type: Ability_Type.target_unit
    targeting: Ability_Targeting
    damage: number
}

type Ability_Tide_Gush = {
    id: Ability_Id.tide_gush
    type: Ability_Type.target_unit
    targeting: Ability_Targeting
    damage: number
    move_points_reduction: number
}

type Ability_Tide_Anchor_Smash = {
    id: Ability_Id.tide_anchor_smash
    type: Ability_Type.no_target
    selector: Ability_Area_Selector
    damage: number
    attack_reduction: number
}

type Ability_Tide_Ravage = {
    id: Ability_Id.tide_ravage
    type: Ability_Type.no_target
    selector: Ability_Area_Selector
    damage: number
}

type Ability_Luna_Lucent_Beam = {
    id: Ability_Id.luna_lucent_beam
    type: Ability_Type.target_unit
    targeting: Ability_Targeting
    damage: number
}

type Ability_Luna_Moon_Glaive = Ability_Definition_Passive_Base & {
    id: Ability_Id.luna_moon_glaive
    secondary_selector: Ability_Area_Selector
}

type Ability_Luna_Eclipse = {
    id: Ability_Id.luna_eclipse
    type: Ability_Type.no_target
    selector: Ability_Area_Selector
    total_beams: number
}

type Ability_Skywrath_Concussive_Shot = {
    id: Ability_Id.skywrath_concussive_shot
    type: Ability_Type.no_target
    selector: Ability_Area_Selector
    damage: number
    move_points_reduction: number
    duration: number
}

type Ability_Skywrath_Ancient_Seal = {
    id: Ability_Id.skywrath_ancient_seal
    type: Ability_Type.target_unit
    targeting: Ability_Targeting
    duration: number
}

type Ability_Skywrath_Mystic_Flare = {
    id: Ability_Id.skywrath_mystic_flare
    type: Ability_Type.target_ground
    targeting: Ability_Targeting
    damage: number
}

type Ability_Dragon_Knight_Breathe_Fire = {
    id: Ability_Id.dragon_knight_breathe_fire
    type: Ability_Type.target_ground
    targeting: Ability_Targeting
    damage: number
}

type Ability_Dragon_Knight_Dragon_Tail = {
    id: Ability_Id.dragon_knight_dragon_tail
    type: Ability_Type.target_unit
    targeting: Ability_Targeting
    damage: number
}

type Ability_Dragon_Knight_Elder_Dragon_Form = {
    id: Ability_Id.dragon_knight_elder_dragon_form
    type: Ability_Type.no_target
    selector: Ability_Area_Selector
}

type Ability_Dragon_Knight_Elder_Dragon_Form_Attack = {
    id: Ability_Id.dragon_knight_elder_dragon_form_attack
    type: Ability_Type.target_ground
    targeting: Ability_Targeting
}

type Ability_Lion_Hex = {
    id: Ability_Id.lion_hex
    type: Ability_Type.target_unit
    targeting: Ability_Targeting
    duration: number
    move_points_reduction: number
}

type Ability_Lion_Impale = {
    id: Ability_Id.lion_impale
    type: Ability_Type.target_ground
    targeting: Ability_Targeting
    damage: number
}

type Ability_Lion_Finger_Of_Death = {
    id: Ability_Id.lion_finger_of_death
    type: Ability_Type.target_unit
    targeting: Ability_Targeting
    damage: number
}

type Ability_Mirana_Starfall = {
    id: Ability_Id.mirana_starfall
    type: Ability_Type.no_target
    selector: Ability_Area_Selector
    damage: number
}

type Ability_Mirana_Arrow = {
    id: Ability_Id.mirana_arrow
    type: Ability_Type.target_unit
    targeting: Ability_Targeting
}

type Ability_Mirana_Leap = {
    id: Ability_Id.mirana_leap
    type: Ability_Type.target_ground
    targeting: Ability_Targeting
}

type Ability_Venge_Magic_Missile = {
    id: Ability_Id.venge_magic_missile
    type: Ability_Type.target_unit
    targeting: Ability_Targeting
    damage: number
}

type Ability_Venge_Wave_Of_Terror = {
    id: Ability_Id.venge_wave_of_terror
    type: Ability_Type.target_ground
    targeting: Ability_Targeting
    damage: number
    armor_reduction: number
    duration: number
}

type Ability_Venge_Nether_Swap = {
    id: Ability_Id.venge_nether_swap
    type: Ability_Type.target_unit
    targeting: Ability_Targeting
}

type Ability_Dark_Seer_Ion_Shell = {
    id: Ability_Id.dark_seer_ion_shell
    type: Ability_Type.target_unit
    targeting: Ability_Targeting
    damage_per_turn: number
    duration: number
    shield_selector: Ability_Area_Selector
}

type Ability_Dark_Seer_Surge = {
    id: Ability_Id.dark_seer_surge
    type: Ability_Type.target_unit
    targeting: Ability_Targeting
    move_points_bonus: number
}

type Ability_Dark_Seer_Vacuum = {
    id: Ability_Id.dark_seer_vacuum
    type: Ability_Type.target_ground
    targeting: Ability_Targeting
}

type Ability_Ember_Searing_Chains = {
    id: Ability_Id.ember_searing_chains
    type: Ability_Type.no_target
    selector: Ability_Area_Selector
    targets: number
}

type Ability_Ember_Sleight_Of_Fist = {
    id: Ability_Id.ember_sleight_of_fist
    type: Ability_Type.no_target
    selector: Ability_Area_Selector
}

type Ability_Ember_Fire_Remnant = {
    id: Ability_Id.ember_fire_remnant
    type: Ability_Type.target_ground
    targeting: Ability_Targeting
}

type Ability_Ember_Activate_Fire_Remnant = {
    id: Ability_Id.ember_activate_fire_remnant
    type: Ability_Type.no_target
    selector: Ability_Area_Selector
}

type Ability_Shaker_Fissure = {
    id: Ability_Id.shaker_fissure
    type: Ability_Type.target_ground
    targeting: Find_By_Type<Ability_Targeting, Ability_Targeting_Type.line>
}

type Ability_Shaker_Enchant_Totem = {
    id: Ability_Id.shaker_enchant_totem
    type: Ability_Type.no_target
    selector: Ability_Area_Selector
    modifier: Modifier
}

type Ability_Shaker_Enchant_Totem_Attack = {
    id: Ability_Id.shaker_enchant_totem_attack
    type: Ability_Type.target_unit
    targeting: Ability_Targeting
}

type Ability_Shaker_Echo_Slam = {
    id: Ability_Id.shaker_echo_slam
    type: Ability_Type.no_target
    selector: Ability_Area_Selector
}

type Venomancer_Abilities = {
    id: Ability_Id.venomancer_plague_wards
    type: Ability_Type.target_ground
    targeting: Ability_Targeting
} | {
    id: Ability_Id.venomancer_venomous_gale
    type: Ability_Type.target_ground
    targeting: Ability_Targeting
    slow: number
    poison_applied: number
} | {
    id: Ability_Id.venomancer_poison_nova
    type: Ability_Type.no_target
    selector: Ability_Area_Selector
} | {
    id: Ability_Id.plague_ward_attack
    type: Ability_Type.passive
    selector: Ability_Area_Selector
}

type Bounty_Hunter_Abilities = {
    id: Ability_Id.bounty_hunter_shadow_walk
    type: Ability_Type.no_target
    selector: Ability_Area_Selector
    modifier: Modifier
} | {
    id: Ability_Id.bounty_hunter_jinada
    type: Ability_Type.passive
} | {
    id: Ability_Id.bounty_hunter_jinada_attack
    type: Ability_Type.target_unit
    targeting: Ability_Targeting
    modifier: Modifier
} | {
    id: Ability_Id.bounty_hunter_track
    type: Ability_Type.target_unit
    targeting: Ability_Targeting
    modifier: Modifier
}

type Ability_Pocket_Tower_Attack = Ability_Definition_Passive_Base & {
    id: Ability_Id.pocket_tower_attack
    selector: Ability_Area_Selector
}

type Ability_Deployment_Zone = Ability_Definition_Passive_Base & {
    id: Ability_Id.deployment_zone
    radius: number
}

type Ability_Monster_Lifesteal = Ability_Definition_Passive_Base & {
    id: Ability_Id.monster_lifesteal
}

type Ability_Monster_Spawn_Spiderlings = Ability_Definition_Passive_Base & {
    id: Ability_Id.monster_spawn_spiderlings
    how_many: number
}

type Delta_Cast_Ability =
    Delta_Ability_Basic_Attack |

    Delta_Ability_Pudge_Hook |
    Delta_Ability_Pudge_Rot |
    Delta_Ability_Pudge_Dismember |

    Delta_Ability_Tide_Gush |
    Delta_Ability_Tide_Anchor_Smash |
    Delta_Ability_Tide_Ravage |

    Delta_Ability_Skywrath_Concussive_Shot |
    Delta_Ability_Skywrath_Ancient_Seal |
    Delta_Ability_Skywrath_Mystic_Flare |

    Delta_Ability_Dragon_Knight_Breathe_Fire |
    Delta_Ability_Dragon_Knight_Dragon_Tail |
    Delta_Ability_Dragon_Knight_Elder_Dragon_Form |
    Delta_Ability_Dragon_Knight_Elder_Dragon_Form_Attack |

    Delta_Ability_Lion_Hex |
    Delta_Ability_Lion_Impale |
    Delta_Ability_Lion_Finger_Of_Death |

    Delta_Ability_Mirana_Starfall |
    Delta_Ability_Mirana_Arrow |
    Delta_Ability_Mirana_Leap |

    Delta_Ability_Luna_Lucent_Beam |
    Delta_Ability_Luna_Eclipse |

    Delta_Ability_Venge_Magic_Missile |
    Delta_Ability_Venge_Wave_Of_Terror |
    Delta_Ability_Venge_Nether_Swap |

    Delta_Ability_Ember_Searing_Chains |
    Delta_Ability_Ember_Sleight_Of_Fist |
    Delta_Ability_Ember_Fire_Remnant |
    Delta_Ability_Ember_Activate_Fire_Remnant |

    Delta_Ability_Shaker_Fissure |
    Delta_Ability_Shaker_Enchant_Totem |
    Delta_Ability_Shaker_Enchant_Totem_Attack |
    Delta_Ability_Shaker_Echo_Slam |

    Delta_Ability_Dark_Seer_Vacuum |
    Delta_Ability_Dark_Seer_Ion_Shell |
    Delta_Ability_Dark_Seer_Surge |

    Venomancer_Ability_Deltas |
    Bounty_Hunter_Ability_Deltas


type Delta_Ground_Target_Ability = Find_By_Type<Delta_Cast_Ability, Delta_Type.use_ground_target_ability>
type Delta_Unit_Target_Ability = Find_By_Type<Delta_Cast_Ability, Delta_Type.use_unit_target_ability>
type Delta_Use_No_Target_Ability = Find_By_Type<Delta_Cast_Ability, Delta_Type.use_no_target_ability>

type Basic_Attack_Health_Change = Health_Change & {
    blocked_by_armor: number
}

type Basic_Attack_Unit_Health_Change = Unit_Health_Change & {
    blocked_by_armor: number
}

type Delta_Ability_Basic_Attack = Delta_Unit_Target_Ability_Base & {
    ability_id: Ability_Id.basic_attack
    target: Basic_Attack_Health_Change
}

type Delta_Ability_Pudge_Hook = Delta_Unit_Target_Ability_Base & {
    ability_id: Ability_Id.pudge_hook
    target_unit_id: Unit_Id
    damage_dealt: Health_Change
    move_target_to: XY
}

type Delta_Ability_Pudge_Rot = Delta_Use_No_Target_Ability_Base & {
    ability_id: Ability_Id.pudge_rot
    targets: Unit_Health_Change[]
}

type Health_Change = {
    new_value: number
    value_delta: number
}

type Unit_Health_Change = Health_Change & {
    target_unit_id: Unit_Id
}

type Unit_Modifier_Application = {
    target_unit_id: Unit_Id
    modifier: Modifier_Application
}

type Delta_Ability_Pudge_Dismember = Delta_Unit_Target_Ability_Base & {
    ability_id: Ability_Id.pudge_dismember
    health_restored: Health_Change
    damage_dealt: Health_Change
}

type Delta_Ability_Tide_Gush = Delta_Unit_Target_Ability_Base & {
    ability_id: Ability_Id.tide_gush
    modifier: Modifier_Application
    damage_dealt: Health_Change
}

type Delta_Ability_Tide_Anchor_Smash = Delta_Use_No_Target_Ability_Base & {
    ability_id: Ability_Id.tide_anchor_smash
    targets: (Unit_Health_Change & Unit_Modifier_Application)[]
}

type Delta_Ability_Tide_Ravage = Delta_Use_No_Target_Ability_Base & {
    ability_id: Ability_Id.tide_ravage
    targets: (Unit_Health_Change & Unit_Modifier_Application)[]
}

type Delta_Ability_Luna_Lucent_Beam = Delta_Unit_Target_Ability_Base & {
    ability_id: Ability_Id.luna_lucent_beam
    damage_dealt: Health_Change
}

type Concussive_Shot_Hit = {
    hit: true
    target_unit_id: Unit_Id
    damage: Health_Change
    modifier: Modifier_Application
}

type Concussive_Shot_Miss = {
    hit: false
}

type Delta_Ability_Skywrath_Concussive_Shot = Delta_Use_No_Target_Ability_Base & {
    ability_id: Ability_Id.skywrath_concussive_shot
    result: Concussive_Shot_Hit | Concussive_Shot_Miss
}

type Delta_Ability_Skywrath_Ancient_Seal = Delta_Unit_Target_Ability_Base & {
    ability_id: Ability_Id.skywrath_ancient_seal
    modifier: Modifier_Application
}

type Delta_Ability_Skywrath_Mystic_Flare = Delta_Ground_Target_Ability_Base & {
    ability_id: Ability_Id.skywrath_mystic_flare
    damage_remaining: number
    targets: Unit_Health_Change[]
}

type Ability_Effect_Luna_Moon_Glaive = {
    ability_id: Ability_Id.luna_moon_glaive
    source_unit_id: Unit_Id
    target_unit_id: Unit_Id
    original_target_id: Unit_Id
    damage_dealt: Health_Change
}

type Ability_Effect_Mirana_Starfall = {
    ability_id: Ability_Id.mirana_starfall
    source_unit_id: Unit_Id
    target_unit_id: Unit_Id
    damage_dealt: Health_Change
}

type Ability_Effect_Dark_Seer_Ion_Shell = {
    ability_id: Ability_Id.dark_seer_ion_shell
    source_unit_id: Unit_Id
    targets: Unit_Health_Change[]
}

type Ability_Effect_Pocket_Tower_Attack = {
    ability_id: Ability_Id.pocket_tower_attack
    source_unit_id: Unit_Id
    damage_dealt: Basic_Attack_Unit_Health_Change
}

type Ability_Effect_Plague_Ward_Attack = {
    ability_id: Ability_Id.plague_ward_attack
    source_unit_id: Unit_Id
    damage_dealt: Basic_Attack_Unit_Health_Change
}

type Ablity_Effect_Monster_Lifesteal = {
    ability_id: Ability_Id.monster_lifesteal
    source_unit_id: Unit_Id
    target_unit_id: Unit_Id
    heal: Health_Change
}

type Ablity_Effect_Monster_Spawn_Spiderlings = {
    ability_id: Ability_Id.monster_spawn_spiderlings
    source_unit_id: Unit_Id
    summons: {
        spawn: Creep_Spawn_Effect
        at: XY
    }[]
}

type Delta_Ability_Luna_Eclipse = Delta_Use_No_Target_Ability_Base & {
    ability_id: Ability_Id.luna_eclipse
    missed_beams: number
    targets: Unit_Health_Change[]
}

type Delta_Ability_Dragon_Knight_Breathe_Fire = Delta_Ground_Target_Ability_Base & {
    ability_id: Ability_Id.dragon_knight_breathe_fire
    targets: Unit_Health_Change[]
}

type Delta_Ability_Dragon_Knight_Dragon_Tail = Delta_Unit_Target_Ability_Base & {
    ability_id: Ability_Id.dragon_knight_dragon_tail
    damage_dealt: Health_Change
    modifier: Modifier_Application
}

type Delta_Ability_Dragon_Knight_Elder_Dragon_Form = Delta_Use_No_Target_Ability_Base & {
    ability_id: Ability_Id.dragon_knight_elder_dragon_form
    modifier: Modifier_Application
}

type Delta_Ability_Dragon_Knight_Elder_Dragon_Form_Attack = Delta_Ground_Target_Ability_Base & {
    ability_id: Ability_Id.dragon_knight_elder_dragon_form_attack
    targets: Basic_Attack_Unit_Health_Change[]
}

type Delta_Ability_Lion_Hex = Delta_Unit_Target_Ability_Base & {
    ability_id: Ability_Id.lion_hex
    modifier: Modifier_Application
}

type Delta_Ability_Lion_Impale = Delta_Ground_Target_Ability_Base & {
    ability_id: Ability_Id.lion_impale
    targets: (Unit_Health_Change & Unit_Modifier_Application)[]
}

type Delta_Ability_Lion_Finger_Of_Death = Delta_Unit_Target_Ability_Base & {
    ability_id: Ability_Id.lion_finger_of_death
    damage_dealt: Health_Change
}

type Delta_Ability_Mirana_Starfall = Delta_Use_No_Target_Ability_Base & {
    ability_id: Ability_Id.mirana_starfall
    targets: Unit_Health_Change[]
}

type Delta_Ability_Ember_Searing_Chains = Delta_Use_No_Target_Ability_Base & {
    ability_id: Ability_Id.ember_searing_chains
    targets: Unit_Modifier_Application[]
}

type Delta_Ability_Ember_Sleight_Of_Fist = Delta_Use_No_Target_Ability_Base & {
    ability_id: Ability_Id.ember_sleight_of_fist
    targets: Basic_Attack_Unit_Health_Change[]
}

type Delta_Ability_Ember_Fire_Remnant = Delta_Ground_Target_Ability_Base & {
    ability_id: Ability_Id.ember_fire_remnant
    modifier: Modifier_Application
    remnant: Creep_Spawn_Effect
}

type Delta_Ability_Ember_Activate_Fire_Remnant = Delta_Use_No_Target_Ability_Base & {
    ability_id: Ability_Id.ember_activate_fire_remnant
    action: {
        remnant_id: Unit_Id
        move_to: XY
    }
}

type Delta_Ability_Mirana_Arrow = Delta_Unit_Target_Ability_Base & {
    ability_id: Ability_Id.mirana_arrow
    stun: Modifier_Application
}

type Delta_Ability_Mirana_Leap = Delta_Ground_Target_Ability_Base & {
    ability_id: Ability_Id.mirana_leap
}

type Delta_Ability_Venge_Magic_Missile = Delta_Unit_Target_Ability_Base & {
    ability_id: Ability_Id.venge_magic_missile
    damage_dealt: Health_Change
    modifier: Modifier_Application
}

type Delta_Ability_Venge_Wave_Of_Terror = Delta_Ground_Target_Ability_Base & {
    ability_id: Ability_Id.venge_wave_of_terror
    targets: (Unit_Health_Change & Unit_Modifier_Application)[]
}

type Delta_Ability_Venge_Nether_Swap = Delta_Unit_Target_Ability_Base & {
    ability_id: Ability_Id.venge_nether_swap
}

type Delta_Ability_Dark_Seer_Ion_Shell = Delta_Unit_Target_Ability_Base & {
    ability_id: Ability_Id.dark_seer_ion_shell
    modifier: Modifier_Application
}

type Delta_Ability_Dark_Seer_Surge = Delta_Unit_Target_Ability_Base & {
    ability_id: Ability_Id.dark_seer_surge
    modifier: Modifier_Application
}

type Vacuum_Target = {
    target_unit_id: Unit_Id
    move_to: XY
}

type Delta_Ability_Dark_Seer_Vacuum = Delta_Ground_Target_Ability_Base & {
    ability_id: Ability_Id.dark_seer_vacuum
    targets: Vacuum_Target[]
}

type Delta_Ability_Shaker_Fissure = Delta_Ground_Target_Ability_Base & {
    ability_id: Ability_Id.shaker_fissure
    moves: {
        target_unit_id: Unit_Id
        move_to: XY
    }[]

    modifiers: Unit_Modifier_Application[]

    block: Persistent_Effect_Application
}

type Delta_Ability_Shaker_Enchant_Totem = Delta_Use_No_Target_Ability_Base & {
    ability_id: Ability_Id.shaker_enchant_totem
    modifier: Modifier_Application
    targets: Unit_Modifier_Application[]
}

type Delta_Ability_Shaker_Enchant_Totem_Attack = Delta_Unit_Target_Ability_Base & {
    ability_id: Ability_Id.shaker_enchant_totem_attack
    target: Basic_Attack_Health_Change
}

type Delta_Ability_Shaker_Echo_Slam = Delta_Use_No_Target_Ability_Base & {
    ability_id: Ability_Id.shaker_echo_slam
    targets: Unit_Health_Change[]
}

type Venomancer_Ability_Deltas = (Delta_Ground_Target_Ability_Base & {
    ability_id: Ability_Id.venomancer_plague_wards
    summon: Creep_Spawn_Effect
}) | (Delta_Ground_Target_Ability_Base & {
    ability_id: Ability_Id.venomancer_venomous_gale
    targets: Unit_Modifier_Application[]
}) | (Delta_Use_No_Target_Ability_Base & {
    ability_id: Ability_Id.venomancer_poison_nova
    targets: Unit_Modifier_Application[]
})

type Bounty_Hunter_Ability_Deltas = (Delta_Use_No_Target_Ability_Base & {
    ability_id: Ability_Id.bounty_hunter_shadow_walk
    modifier: Modifier_Application
}) | (Delta_Unit_Target_Ability_Base & {
    ability_id: Ability_Id.bounty_hunter_jinada_attack
    target: Basic_Attack_Health_Change
    modifier: Modifier_Application
} | (Delta_Unit_Target_Ability_Base & {
    ability_id: Ability_Id.bounty_hunter_track
    modifier: Modifier_Application
}))