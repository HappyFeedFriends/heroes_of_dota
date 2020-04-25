declare const enum Delta_Type {
    hero_spawn = 0,
    monster_spawn = 1,
    creep_spawn = 2,
    tree_spawn = 3,
    rune_spawn = 4,
    shop_spawn = 5,

    gold_change = 6,
    health_change = 7,
    level_change = 8,

    use_ground_target_spell = 9,
    use_unit_target_spell = 10,
    use_no_target_spell = 11,

    use_ground_target_ability = 12,
    use_unit_target_ability = 13,
    use_no_target_ability = 14,

    draw_card = 15,
    use_card = 17,

    hero_spawn_from_hand = 18,
    unit_move = 19,
    modifier_applied = 20,
    modifier_removed = 21,
    set_ability_charges = 22,
    ability_effect_applied = 23,
    modifier_effect_applied = 24,
    timed_effect_expired = 25,
    rune_pick_up = 26,
    purchase_item = 27,
    equip_item = 28,

    end_turn = 50,
    game_start = 51,
    game_over = 52,
}

declare const enum Action_Type {
    move = 2,
    end_turn = 3,
    ground_target_ability = 4,
    unit_target_ability = 5,
    use_no_target_ability = 6,
    use_hero_card = 7,
    use_existing_hero_card = 8,
    pick_up_rune = 9,
    purchase_item = 10,
    use_no_target_spell_card = 11,
    use_unit_target_spell_card = 12,
    use_ground_target_spell_card = 13
}

declare const enum Hero_Type {
    ursa = 0,
    sniper = 1,
    pudge = 2,
    tidehunter = 3,
    luna = 4,
    skywrath_mage = 5,
    dragon_knight = 6,
    lion = 7,
    mirana = 8,
    vengeful_spirit = 9,
    dark_seer = 10,
    ember_spirit = 11,
    earthshaker = 12
}

declare const enum Creep_Type {
    pocket_tower = 0,
    lane_creep = 1,

    satyr_big = 100,
    satyr_small = 101,
    small_spider = 102,
    large_spider = 103,
    spider_matriarch = 104,
    spiderling = 105,
    hardened_spider = 106,
    evil_eye = 107,

    ember_fire_remnant = 1000
}

declare const enum Shop_Type {
    normal = 0,
    secret = 1
}

declare const enum Unit_Supertype {
    hero = 0,
    monster = 1,
    creep = 2
}

declare const enum Rune_Type {
    double_damage = 0,
    regeneration = 1,
    bounty = 2,
    haste = 3
}

declare const enum Ability_Targeting_Type {
    line = 0,
    first_in_line = 1,
    unit_in_manhattan_distance = 2,
    rectangular_area_around_caster = 3,
    any_cell = 4
}

declare const enum Ability_Target_Selector_Type {
    single_target = 0,
    rectangle = 1,
    line = 2,
    t_shape = 3
}

declare const enum Ability_Type {
    passive = 0,
    no_target = 1,
    target_ground = 2,
    target_unit = 3
}

declare const enum Card_Type {
    unknown = 0,
    hero = 1,
    spell = 2,
    existing_hero = 3
}

declare const enum Source_Type {
    none = 0,
    unit = 1,
    player = 2,
    item = 3,
    modifier = 4,
    adventure_item = 5
}

declare const enum Timed_Effect_Type {
    shaker_fissure_block = 0
}

type Unit_Id = number & { _unit_id_brand: any };
type Card_Id = number & { _card_id_brand: any };
type Shop_Id = number & { _shop_id_brand: any };
type Rune_Id = number & { _rune_id_brand: any };
type Tree_Id = number & { _tree_id_brand: any };
type Modifier_Handle_Id = number & { _modifier_handle_id_brand: any };
type Effect_Handle_Id = number & { _effect_handle_id_brand: any };
type Battle_Player_Id = number & { _battle_player_id_brand: any };
type Cell_Index = number & { _cell_index_brand: any };

type XY = {
    x: number
    y: number
}

declare const enum Unit_Status {
    rooted = 0,
    silenced = 1,
    stunned = 2,
    disarmed = 3,
    out_of_the_game = 4,
    unselectable = 5,
    phased = 6
}

type Unit_Stats = {
    health: number
    move_points: number
    status: Record<Unit_Status, boolean>

    base: {
        readonly armor: number
        readonly max_health: number
        readonly attack_damage: number
        readonly max_move_points: number
    }

    bonus: {
        armor: number
        max_health: number
        attack_damage: number
        max_move_points: number
    }
}

type Unit_Definition = {
    health: number
    attack_damage: number
    move_points: number
    armor?: number
    attack?: Ability_Definition_Active
    abilities?: Ability_Definition[]
    ability_bench?: Ability_Definition[]
}

declare const enum Ability_Targeting_Flag {
    only_free_cells = 0,
    include_caster = 1
}

type Ability_Targeting_Flag_Field = Record<Ability_Targeting_Flag, boolean>

type Ability_Targeting = {
    type: Ability_Targeting_Type.line
    line_length: number
    flags: Ability_Targeting_Flag_Field
    selector: Ability_Area_Selector
} | {
    type: Ability_Targeting_Type.first_in_line
    line_length: number
    flags: Ability_Targeting_Flag_Field
    selector: Ability_Area_Selector
} | {
    type: Ability_Targeting_Type.unit_in_manhattan_distance
    distance: number
    flags: Ability_Targeting_Flag_Field
    selector: Ability_Area_Selector
} | {
    type: Ability_Targeting_Type.rectangular_area_around_caster
    area_radius: number
    flags: Ability_Targeting_Flag_Field
    selector: Ability_Area_Selector
} | {
    type: Ability_Targeting_Type.any_cell
    flags: Ability_Targeting_Flag_Field
    selector: Ability_Area_Selector
}

type Ability_Area_Selector = {
    type: Ability_Target_Selector_Type.single_target
} | {
    type: Ability_Target_Selector_Type.rectangle
    area_radius: number
} | {
    type: Ability_Target_Selector_Type.line
    length: number
} | {
    type: Ability_Target_Selector_Type.t_shape
    stem_length: number
    arm_length: number
}

type Action_Move = {
    type: Action_Type.move
    unit_id: Unit_Id
    to: XY
}

type Action_End_Turn = {
    type: Action_Type.end_turn
}

type Action_Ground_Target_Ability = {
    type: Action_Type.ground_target_ability
    ability_id: Ability_Id
    unit_id: Unit_Id
    to: XY
}

type Action_Unit_Target_Ability = {
    type: Action_Type.unit_target_ability
    ability_id: Ability_Id
    unit_id: Unit_Id
    target_id: Unit_Id
}

type Action_No_Target_Ability = {
    type: Action_Type.use_no_target_ability
    ability_id: Ability_Id
    unit_id: Unit_Id
}

type Action_Use_Hero_Card = {
    type: Action_Type.use_hero_card
    card_id: Card_Id
    at: XY
}

type Action_Use_Existing_Hero_Card = {
    type: Action_Type.use_existing_hero_card
    card_id: Card_Id
    at: XY
}

type Action_Use_No_Target_Spell = {
    type: Action_Type.use_no_target_spell_card
    card_id: Card_Id
}

type Action_Use_Unit_Target_Spell = {
    type: Action_Type.use_unit_target_spell_card
    card_id: Card_Id
    unit_id: Unit_Id
}

type Action_Use_Ground_Target_Spell = {
    type: Action_Type.use_ground_target_spell_card
    card_id: Card_Id
    at: XY
}

type Action_Pick_Up_Rune = {
    type: Action_Type.pick_up_rune
    unit_id: Unit_Id
    rune_id: Rune_Id
}

type Action_Purchase_Item = {
    type: Action_Type.purchase_item
    unit_id: Unit_Id
    shop_id: Shop_Id
    item_id: Item_Id
}

type Turn_Action =
    Action_Move |
    Action_Use_Unit_Target_Spell |
    Action_Use_No_Target_Spell |
    Action_Use_Ground_Target_Spell |
    Action_Ground_Target_Ability |
    Action_Unit_Target_Ability |
    Action_No_Target_Ability |
    Action_Use_Hero_Card |
    Action_Use_Existing_Hero_Card |
    Action_Pick_Up_Rune |
    Action_Purchase_Item |
    Action_End_Turn

type Card_Unknown = {
    type: Card_Type.unknown
    id: Card_Id
}

type Card_Hero = {
    type: Card_Type.hero
    hero_type: Hero_Type
    id: Card_Id
}

type Card_Existing_Hero = {
    type: Card_Type.existing_hero
    generated_by: Spell_Id
    id: Card_Id
    hero_id: Unit_Id
}

type Card = Card_Unknown | Card_Hero | Card_Existing_Hero | Card_Spell

type Deployment_Zone = {
    min: XY
    max: XY
    face: XY
}

type Battle_Participant_Map_Entity = {
    type: Map_Entity_Type.player
    player_id: Player_Id
} | {
    type: Map_Entity_Type.npc
    npc_id: Npc_Id
    npc_type: Npc_Type
} | {
    type: Map_Entity_Type.adventure_enemy
    entity_id: Adventure_World_Entity_Id
    world_model: Creep_Type
}

type Battle_Participant_Info = {
    id: Battle_Player_Id
    deployment_zone: Deployment_Zone
    map_entity: Battle_Participant_Map_Entity
}

type Delta_Health_Change = {
    type: Delta_Type.health_change
    source_unit_id: Unit_Id
    target_unit_id: Unit_Id
    new_value: number
    value_delta: number
}

type Delta_Move = {
    type: Delta_Type.unit_move
    unit_id: Unit_Id
    move_cost: number
    to_position: XY
}

type Delta_Hero_Spawn = {
    type: Delta_Type.hero_spawn
    hero_type: Hero_Type
    unit_id: Unit_Id
    owner_id: Battle_Player_Id
    at_position: XY
}

type Delta_Hero_Spawn_From_Hand = {
    type: Delta_Type.hero_spawn_from_hand
    source_spell_id: Spell_Id
    hero_id: Unit_Id
    at_position: XY
}

type Delta_Monster_Spawn = {
    type: Delta_Type.monster_spawn
    unit_id: Unit_Id
    at_position: XY
    facing: XY
}

type Delta_Creep_Spawn = {
    type: Delta_Type.creep_spawn
    creep_type: Creep_Type
    unit_id: Unit_Id
    owner_id: Battle_Player_Id
    health: number
    at_position: XY
}

type Delta_Tree_Spawn = {
    type: Delta_Type.tree_spawn
    tree_id: Tree_Id
    at_position: XY
}

type Delta_Ground_Target_Ability_Base = {
    type: Delta_Type.use_ground_target_ability
    unit_id: Unit_Id
    target_position: XY
}

type Delta_Unit_Target_Ability_Base = {
    type: Delta_Type.use_unit_target_ability
    unit_id: Unit_Id
    target_unit_id: Unit_Id
}

type Delta_Use_No_Target_Ability_Base = {
    type: Delta_Type.use_no_target_ability
    unit_id: Unit_Id
}

type Delta_End_Turn = {
    type: Delta_Type.end_turn
    start_turn_of_player_id: Battle_Player_Id
}

type Delta_Level_Change = {
    type: Delta_Type.level_change
    unit_id: Unit_Id
    new_level: number
    source: Change_Source
}

type Delta_Modifier_Applied = {
    type: Delta_Type.modifier_applied
    unit_id: Unit_Id
    application: Modifier_Application
    source: Change_Source
}

type Delta_Modifier_Removed = {
    type: Delta_Type.modifier_removed
    modifier_handle_id: Modifier_Handle_Id
}

type Delta_Set_Ability_Charges_Remaining = {
    type: Delta_Type.set_ability_charges
    unit_id: Unit_Id
    ability_id: Ability_Id
    charges: number
    only_set_remaining: boolean
    source: Change_Source
}

type Delta_Ability_Effect_Applied<T extends Ability_Effect> = {
    type: Delta_Type.ability_effect_applied
    effect: T
}

type Delta_Draw_Card = {
    type: Delta_Type.draw_card
    player_id: Battle_Player_Id
    card_id: Card_Id
    content: {
        type: Card_Type.hero
        hero: Hero_Type
    } | {
        type: Card_Type.spell
        spell: Spell_Id
    }
}

type Delta_Use_Card = {
    type: Delta_Type.use_card
    player_id: Battle_Player_Id
    card_id: Card_Id
}

type Delta_Purchase_Item = {
    type: Delta_Type.purchase_item
    unit_id: Unit_Id
    shop_id: Shop_Id
    gold_cost: number
    item_id: Item_Id
}

type Delta_Equip_Item = Equip_Item & {
    type: Delta_Type.equip_item
    unit_id: Unit_Id
}

type Delta_Shop_Spawn = {
    type: Delta_Type.shop_spawn
    shop_type: Shop_Type
    shop_id: Shop_Id
    item_pool: Item_Id[]
    at: XY
    facing: XY
}

type Delta_Rune_Spawn = {
    type: Delta_Type.rune_spawn
    rune_type: Rune_Type
    rune_id: Rune_Id
    at: XY
}

type Delta_Rune_Pick_Up_Base = {
    type: Delta_Type.rune_pick_up
    unit_id: Unit_Id
    rune_id: Rune_Id
    move_cost: number
}

type Delta_Regeneration_Rune_Pick_Up = Delta_Rune_Pick_Up_Base & {
    rune_type: Rune_Type.regeneration
    heal: Health_Change
}

type Delta_Double_Damage_Rune_Pick_Up = Delta_Rune_Pick_Up_Base & {
    rune_type: Rune_Type.double_damage
    modifier: Modifier_Application
}

type Delta_Haste_Rune_Pick_Up = Delta_Rune_Pick_Up_Base & {
    rune_type: Rune_Type.haste
    modifier: Modifier_Application
}

type Delta_Bounty_Rune_Pick_Up = Delta_Rune_Pick_Up_Base & {
    rune_type: Rune_Type.bounty
    gold_gained: number
}

type Delta_Timed_Effect_Expired = {
    type: Delta_Type.timed_effect_expired
    handle_id: Effect_Handle_Id
}

type Delta_Rune_Pick_Up =
    Delta_Regeneration_Rune_Pick_Up |
    Delta_Double_Damage_Rune_Pick_Up |
    Delta_Haste_Rune_Pick_Up |
    Delta_Bounty_Rune_Pick_Up

type Delta_Gold_Change = {
    type: Delta_Type.gold_change
    player_id: Battle_Player_Id
    change: number
}

type Delta_Game_Start = {
    type: Delta_Type.game_start
}

type Delta_Game_Over = {
    type: Delta_Type.game_over
    result: {
        draw: false
        winner_player_id: Battle_Player_Id
    } | {
        draw: true
    }
}

type Delta =
    Delta_Health_Change |
    Delta_Move |
    Delta_Hero_Spawn |
    Delta_Monster_Spawn |
    Delta_Creep_Spawn |
    Delta_Tree_Spawn |
    Delta_Rune_Spawn |
    Delta_Shop_Spawn |
    Delta_Hero_Spawn_From_Hand |
    Delta_Ground_Target_Ability |
    Delta_Unit_Target_Ability |
    Delta_Use_No_Target_Ability |
    Delta_Use_Unit_Target_Spell |
    Delta_Use_Ground_Target_Spell |
    Delta_Use_No_Target_Spell |
    Delta_Level_Change |
    Delta_Modifier_Applied |
    Delta_Modifier_Removed |
    Delta_Set_Ability_Charges_Remaining |
    Delta_Ability_Effect_Applied<Ability_Effect> |
    Delta_Modifier_Effect_Applied |
    Delta_Timed_Effect_Expired |
    Delta_Rune_Pick_Up |
    Delta_Draw_Card |
    Delta_Use_Card |
    Delta_Purchase_Item |
    Delta_Equip_Item |
    Delta_Gold_Change |
    Delta_End_Turn |
    Delta_Game_Start |
    Delta_Game_Over

type Change_Source = {
    type: Source_Type.none
} | {
    type: Source_Type.adventure_item
    item: Adventure_Item_Id
} | {
    type: Source_Type.item
    item: Item_Id
}

type Modifier_Application = {
    modifier_handle_id: Modifier_Handle_Id
    modifier: Modifier
    duration?: number
}

type Timed_Effect_Application = {
    effect_handle_id: Effect_Handle_Id
    effect: Timed_Effect
    duration: number
}

type Timed_Effect = {
    type: Timed_Effect_Type.shaker_fissure_block
    from: XY
    normal: XY
    steps: number
}