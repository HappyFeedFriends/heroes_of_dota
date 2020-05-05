declare const enum Spell_Id {
    buyback = 0,
    town_portal_scroll = 1,
    euls_scepter = 2,
    mekansm = 3,
    buckler = 4,
    drums_of_endurance = 5,
    pocket_tower = 6,
    call_to_arms = 7,
    refresher_orb = 8,
    quicksand = 9,
    moonlight_shadow = 10
}

declare const enum Spell_Type {
    no_target = 0,
    unit_target = 1,
    ground_target = 2
}

declare const enum Spell_Unit_Targeting_Flag {
    dead = 0,
    heroes = 1,
    allies = 2
}

declare const enum Spell_Ground_Targeting_Type {
    single_cell = 0,
    rectangle = 1
}

type Spell_Ground_Targeting = {
    type: Spell_Ground_Targeting_Type.single_cell
}| {
    type: Spell_Ground_Targeting_Type.rectangle
    area_radius: number
}

type Card_Spell_Definition =
    Spell_Buyback |
    Spell_Euls_Scepter |
    Spell_Town_Portal_Scroll |
    Spell_Refresher_Orb |
    Spell_Mekansm |
    Spell_Buckler |
    Spell_Drums_Of_Endurance |
    Spell_Call_To_Arms |
    Spell_Pocket_Tower |
    Spell_Quicksand |
    Spell_Moonlight_Shadow

type Card_Spell = Card_Spell_Definition & {
    id: Card_Id
}

type Find_By_Spell_Type<Union, Type> = Union extends { spell_type: Type } ? Union : never;

type Card_Spell_Unit_Target = Find_By_Spell_Type<Card_Spell_Definition, Spell_Type.unit_target>
type Card_Spell_No_Target = Find_By_Spell_Type<Card_Spell_Definition, Spell_Type.no_target>
type Card_Spell_Ground_Target = Find_By_Spell_Type<Card_Spell_Definition, Spell_Type.ground_target>

type Card_Spell_Unit_Target_Base = {
    type: Card_Type.spell
    spell_type: Spell_Type.unit_target
    targeting_flags: Spell_Unit_Targeting_Flag[]
}

type Card_Spell_Ground_Target_Base = {
    type: Card_Type.spell
    spell_type: Spell_Type.ground_target
    targeting: Spell_Ground_Targeting
}

type Card_Spell_No_Target_Base = {
    type: Card_Type.spell
    spell_type: Spell_Type.no_target
}

type Spell_Buyback = Card_Spell_Unit_Target_Base & {
    type: Card_Type.spell
    spell_id: Spell_Id.buyback
}

type Spell_Town_Portal_Scroll = Card_Spell_Unit_Target_Base & {
    spell_id: Spell_Id.town_portal_scroll
}

type Spell_Euls_Scepter = Card_Spell_Unit_Target_Base & {
    spell_id: Spell_Id.euls_scepter
}

type Spell_Mekansm = Card_Spell_No_Target_Base & {
    spell_id: Spell_Id.mekansm
    heal: number
}

type Spell_Buckler = Card_Spell_No_Target_Base & {
    spell_id: Spell_Id.buckler
    armor: number
    duration: number
}

type Spell_Drums_Of_Endurance = Card_Spell_No_Target_Base & {
    spell_id: Spell_Id.drums_of_endurance
    move_points_bonus: number
}

type Spell_Pocket_Tower = Card_Spell_Ground_Target_Base & {
    spell_id: Spell_Id.pocket_tower
}

type Spell_Call_To_Arms = Card_Spell_No_Target_Base & {
    spell_id: Spell_Id.call_to_arms
    creeps_to_summon: number
}

type Spell_Refresher_Orb = Card_Spell_Unit_Target_Base & {
    spell_id: Spell_Id.refresher_orb
}

type Spell_Quicksand = Card_Spell_Ground_Target_Base & {
    spell_id: Spell_Id.quicksand
}

type Spell_Moonlight_Shadow = Card_Spell_No_Target_Base & {
    spell_id: Spell_Id.moonlight_shadow
    modifier: Modifier
}

type Delta_Use_Spell =
    Delta_Spell_Buyback |
    Delta_Spell_Town_Portal_Scroll |
    Delta_Spell_Euls_Scepter |
    Delta_Spell_Refresher_Orb |
    Delta_Spell_Mekansm |
    Delta_Spell_Buckler |
    Delta_Spell_Drums_Of_Endurance |
    Delta_Spell_Call_To_Arms |
    Delta_Spell_Pocket_Tower |
    Delta_Spell_Quicksand |
    Delta_Spell_Moonlight_Shadow

type Delta_Use_Unit_Target_Spell = Find_By_Type<Delta_Use_Spell, Delta_Type.use_unit_target_spell>
type Delta_Use_No_Target_Spell = Find_By_Type<Delta_Use_Spell, Delta_Type.use_no_target_spell>
type Delta_Use_Ground_Target_Spell = Find_By_Type<Delta_Use_Spell, Delta_Type.use_ground_target_spell>

type Delta_Use_Unit_Target_Spell_Base = {
    type: Delta_Type.use_unit_target_spell
    player_id: Battle_Player_Id
    target_id: Unit_Id
}

type Delta_Use_Ground_Target_Spell_Base = {
    type: Delta_Type.use_ground_target_spell
    player_id: Battle_Player_Id
    at: XY
}

type Delta_Use_No_Target_Spell_Base = {
    type: Delta_Type.use_no_target_spell
    player_id: Battle_Player_Id
}

type Delta_Spell_Buyback = Delta_Use_Unit_Target_Spell_Base & {
    spell_id: Spell_Id.buyback
    gold_change: number
    heal: Health_Change
    modifier: Modifier_Application
    new_card_id: Card_Id
}

type Delta_Spell_Town_Portal_Scroll = Delta_Use_Unit_Target_Spell_Base & {
    spell_id: Spell_Id.town_portal_scroll
    heal: Health_Change
    modifier: Modifier_Application
    new_card_id: Card_Id
}

type Delta_Spell_Euls_Scepter = Delta_Use_Unit_Target_Spell_Base & {
    spell_id: Spell_Id.euls_scepter
    modifier: Modifier_Application
}

type Delta_Spell_Mekansm = Delta_Use_No_Target_Spell_Base & {
    spell_id: Spell_Id.mekansm
    targets: Unit_Health_Change[]
}

type Delta_Spell_Buckler = Delta_Use_No_Target_Spell_Base & {
    spell_id: Spell_Id.buckler
    targets: Unit_Modifier_Application[]
}

type Delta_Spell_Drums_Of_Endurance = Delta_Use_No_Target_Spell_Base & {
    spell_id: Spell_Id.drums_of_endurance
    targets: Unit_Modifier_Application[]
}

type Delta_Spell_Pocket_Tower = Delta_Use_Ground_Target_Spell_Base & {
    spell_id: Spell_Id.pocket_tower
    spawn: Creep_Spawn_Effect
}

type Delta_Spell_Call_To_Arms = Delta_Use_No_Target_Spell_Base & {
    spell_id: Spell_Id.call_to_arms
    summons: {
        spawn: Creep_Spawn_Effect
        at: XY
    }[]
}

type Delta_Spell_Refresher_Orb = Delta_Use_Unit_Target_Spell_Base & {
    spell_id: Spell_Id.refresher_orb
    charge_changes: {
        ability_id: Ability_Id
        charges_remaining: number
    }[]
}

type Delta_Spell_Quicksand = Delta_Use_Ground_Target_Spell_Base & {
    spell_id: Spell_Id.quicksand
    effect: Persistent_Effect_Application
}

type Delta_Spell_Moonlight_Shadow = Delta_Use_No_Target_Spell_Base & {
    spell_id: Spell_Id.moonlight_shadow
    targets: Unit_Modifier_Application[]
}