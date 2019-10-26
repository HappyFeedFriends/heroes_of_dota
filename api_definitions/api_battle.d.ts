declare const enum Delta_Type {
    hero_spawn = 0,
    creep_spawn = 1,
    minion_spawn = 2,
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

    draw_hero_card = 15,
    draw_spell_card = 16,
    use_card = 17,

    hero_spawn_from_hand = 18,
    unit_move = 19,
    modifier_removed = 20,
    set_ability_charges_remaining = 21,
    ability_effect_applied = 22,
    item_effect_applied = 23,
    rune_pick_up = 24,
    purchase_item = 25,
    equip_item = 26,

    end_turn = 27,
    game_start = 28,
    game_over = 29,
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
    dark_seer = 10
}

declare const enum Minion_Type {
    pocket_tower = 0,
    lane_minion = 1,

    monster_satyr_big = 100,
    monster_satyr_small = 101,
    monster_small_spider = 102,
    monster_large_spider = 103,
    monster_spider_matriarch = 104,
    monster_spiderling = 105
}

declare const enum Shop_Type {
    normal = 0,
    secret = 1
}

declare const enum Unit_Supertype {
    hero = 0,
    creep = 1,
    minion = 2
}

declare const enum Modifier_Field {
    health_bonus = 1,
    attack_bonus = 2,
    armor_bonus = 3,
    move_points_bonus = 4,
    state_silenced_counter = 5,
    state_stunned_counter = 6,
    state_disarmed_counter = 7,
    state_out_of_the_game_counter = 8
}

declare const enum Rune_Type {
    double_damage = 0,
    regeneration = 1,
    bounty = 2,
    haste = 3
}

declare const enum Ability_Targeting_Type {
    line = 0,
    unit_in_manhattan_distance = 2,
    rectangular_area_around_caster = 3,
    any_free_cell = 4
}

declare const enum Ability_Target_Selector_Type {
    single_target = 0,
    rectangle = 1,
    line = 2,
    t_shape = 3,
    first_in_line = 4
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

declare const enum Modifier_Change_Type {
    field_change = 0,
    ability_swap = 1
}

declare const enum Unit_Id_Brand { _ = "" }
type Unit_Id = number & Unit_Id_Brand;

declare const enum Card_Id_Brand { _ = "" }
type Card_Id = number & Card_Id_Brand;

declare const enum Shop_Id_Brand { _ = "" }
type Shop_Id = number & Shop_Id_Brand;

declare const enum Rune_Id_Brand { _ = "" }
type Rune_Id = number & Rune_Id_Brand;

declare const enum Tree_Id_Brand { _ = "" }
type Tree_Id = number & Tree_Id_Brand;

declare const enum Modifier_Handle_Id_Brand { _ = "" }
type Modifier_Handle_Id = number & Modifier_Handle_Id_Brand;

declare const enum Battle_Player_Id_Brand { _ = "" }
type Battle_Player_Id = number & Battle_Player_Id_Brand;

type Unit_Stats = {
    armor: number
    health: number
    max_health: number
    attack_damage: number
    move_points: number
    move_points_bonus: number
    max_move_points: number
    attack_bonus: number
    state_stunned_counter: number
    state_silenced_counter: number
    state_disarmed_counter: number
    state_out_of_the_game_counter: number
}

type Unit_Definition = {
    health: number
    attack_damage: number
    move_points: number
    attack?: Ability_Definition_Active
    abilities?: Ability_Definition[]
    ability_bench?: Ability_Definition[]
}

type Ability_Targeting_Line = {
    type: Ability_Targeting_Type.line
    line_length: number
    selector: Ability_Target_Selector
}

type Ability_Targeting_Target_In_Manhattan_Distance = {
    type: Ability_Targeting_Type.unit_in_manhattan_distance
    distance: number
    include_caster: boolean
    selector: Ability_Target_Selector
}

type Ability_Targeting_Rectangular_Area_Around_Caster = {
    type: Ability_Targeting_Type.rectangular_area_around_caster
    area_radius: number
    selector: Ability_Target_Selector
}

type Ability_Targeting_Any_Free_Cell = {
    type: Ability_Targeting_Type.any_free_cell
    selector: Ability_Target_Selector
}

type Ability_Target_Selector_Single_Target = {
    type: Ability_Target_Selector_Type.single_target
}

type Ability_Target_Selector_Rectangle = {
    type: Ability_Target_Selector_Type.rectangle
    area_radius: number
}

type Ability_Target_Selector_Line = {
    type: Ability_Target_Selector_Type.line
    length: number
}

type Ability_Target_Selector_T_Shape = {
    type: Ability_Target_Selector_Type.t_shape
    stem_length: number
    arm_length: number
}

type Ability_Target_Selector_First_In_Line = {
    type: Ability_Target_Selector_Type.first_in_line
    length: number
}

type Ability_Target_Selector =
    Ability_Target_Selector_Single_Target |
    Ability_Target_Selector_Rectangle |
    Ability_Target_Selector_Line |
    Ability_Target_Selector_First_In_Line |
    Ability_Target_Selector_T_Shape

type Ability_Targeting =
    Ability_Targeting_Line |
    Ability_Targeting_Target_In_Manhattan_Distance |
    Ability_Targeting_Rectangular_Area_Around_Caster |
    Ability_Targeting_Any_Free_Cell

type Action_Move = {
    type: Action_Type.move
    unit_id: Unit_Id
    to: {
        x: number
        y: number
    }
}

type Action_End_Turn = {
    type: Action_Type.end_turn
}

type Action_Ground_Target_Ability = {
    type: Action_Type.ground_target_ability
    ability_id: Ability_Id
    unit_id: Unit_Id
    to: {
        x: number
        y: number
    }
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
    at: {
        x: number
        y: number
    }
}

type Action_Use_Existing_Hero_Card = {
    type: Action_Type.use_existing_hero_card
    card_id: Card_Id
    at: {
        x: number
        y: number
    }
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
    at: {
        x: number
        y: number
    }
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
    min_x: number
    min_y: number
    max_x: number
    max_y: number
    face_x: number
    face_y: number
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
    entity_id: Adventure_Entity_Id
    npc_type: Npc_Type
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
    to_position: {
        x: number
        y: number
    }
}

type Delta_Hero_Spawn = {
    type: Delta_Type.hero_spawn
    hero_type: Hero_Type
    unit_id: Unit_Id
    owner_id: Battle_Player_Id
    at_position: {
        x: number
        y: number
    }
}

type Delta_Hero_Spawn_From_Hand = {
    type: Delta_Type.hero_spawn_from_hand
    source_spell_id: Spell_Id
    hero_id: Unit_Id
    at_position: {
        x: number
        y: number
    }
}

type Delta_Creep_Spawn = {
    type: Delta_Type.creep_spawn
    unit_id: Unit_Id
    at_position: {
        x: number
        y: number
    }
    facing: {
        x: number
        y: number
    }
}

type Delta_Minion_Spawn = {
    type: Delta_Type.minion_spawn
    minion_type: Minion_Type
    unit_id: Unit_Id
    owner_id: Battle_Player_Id
    at_position: {
        x: number
        y: number
    }
}

type Delta_Tree_Spawn = {
    type: Delta_Type.tree_spawn
    tree_id: Tree_Id
    at_position: {
        x: number
        y: number
    }
}

type Delta_Ground_Target_Ability_Base = {
    type: Delta_Type.use_ground_target_ability
    unit_id: Unit_Id
    target_position: {
        x: number
        y: number
    }
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
}

type Delta_Modifier_Removed = {
    type: Delta_Type.modifier_removed
    modifier_handle_id: Modifier_Handle_Id
}

type Delta_Set_Ability_Charges_Remaining = {
    type: Delta_Type.set_ability_charges_remaining
    unit_id: Unit_Id
    ability_id: Ability_Id
    charges_remaining: number
}

type Delta_Ability_Effect_Applied<T extends Ability_Effect> = {
    type: Delta_Type.ability_effect_applied
    effect: T
}

type Delta_Draw_Hero_Card = {
    type: Delta_Type.draw_hero_card
    player_id: Battle_Player_Id
    card_id: Card_Id
    hero_type: Hero_Type
}

type Delta_Draw_Spell_Card = {
    type: Delta_Type.draw_spell_card
    player_id: Battle_Player_Id
    card_id: Card_Id
    spell_id: Spell_Id
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

type Delta_Shop_Spawn = {
    type: Delta_Type.shop_spawn
    shop_type: Shop_Type
    shop_id: Shop_Id
    item_pool: Item_Id[]
    at: {
        x: number
        y: number
    }
    facing: {
        x: number
        y: number
    }
}

type Delta_Rune_Spawn = {
    type: Delta_Type.rune_spawn
    rune_type: Rune_Type
    rune_id: Rune_Id
    at: {
        x: number
        y: number
    }
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
    winner_player_id: Battle_Player_Id
}

type Delta =
    Delta_Health_Change |
    Delta_Move |
    Delta_Hero_Spawn |
    Delta_Creep_Spawn |
    Delta_Minion_Spawn |
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
    Delta_Modifier_Removed |
    Delta_Set_Ability_Charges_Remaining |
    Delta_Ability_Effect_Applied<Ability_Effect> |
    Delta_Item_Effect_Applied |
    Delta_Rune_Pick_Up |
    Delta_Draw_Hero_Card |
    Delta_Draw_Spell_Card |
    Delta_Use_Card |
    Delta_Purchase_Item |
    Delta_Equip_Item |
    Delta_Gold_Change |
    Delta_End_Turn |
    Delta_Game_Start |
    Delta_Game_Over

type Modifier_Change_Field_Change = {
    type: Modifier_Change_Type.field_change
    field: Modifier_Field
    delta: number
}

type Modifier_Change_Ability_Swap = {
    type: Modifier_Change_Type.ability_swap
    original_ability: Ability_Id
    swap_to: Ability_Id
}

type Modifier_Change = Modifier_Change_Field_Change | Modifier_Change_Ability_Swap

type Modifier_Application = {
    modifier_handle_id: Modifier_Handle_Id
    modifier_id: Modifier_Id
    changes: Modifier_Change[]
    duration?: number
}