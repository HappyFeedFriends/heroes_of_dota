declare const enum Spell_Id {
    buyback = 0,
    town_portal_scroll = 1,
    euls_scepter = 2,
    mekansm = 3,
    buckler = 4,
    drums_of_endurance = 5,
    pocket_tower = 6,
    call_to_arms = 7,
    refresher_orb = 8
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

type Card_Spell_Definition = Card_Spell_Unit_Target | Card_Spell_No_Target | Card_Spell_Ground_Target
type Card_Spell = Card_Spell_Definition & {
    id: Card_Id
}

type Card_Spell_Unit_Target =
    Spell_Buyback |
    Spell_Euls_Scepter |
    Spell_Town_Portal_Scroll |
    Spell_Refresher_Orb

type Card_Spell_No_Target =
    Spell_Mekansm |
    Spell_Buckler |
    Spell_Drums_Of_Endurance |
    Spell_Call_To_Arms

type Card_Spell_Ground_Target =
    Spell_Pocket_Tower

type Card_Spell_Unit_Target_Base = {
    type: Card_Type.spell
    spell_type: Spell_Type.unit_target
    targeting_flags: Spell_Unit_Targeting_Flag[]
}

type Card_Spell_Ground_Target_Base = {
    type: Card_Type.spell
    spell_type: Spell_Type.ground_target
}

type Card_Spell_No_Target_Base = {
    type: Card_Type.spell
    spell_type: Spell_Type.no_target
}

type Spell_Buyback = Card_Spell_Unit_Target_Base & {
    type: Card_Type.spell
    spell_type: Spell_Type.unit_target
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

type Delta_Use_Unit_Target_Spell =
    Delta_Spell_Buyback |
    Delta_Spell_Town_Portal_Scroll |
    Delta_Spell_Euls_Scepter |
    Delta_Spell_Refresher_Orb

type Delta_Use_No_Target_Spell =
    Delta_Spell_Mekansm |
    Delta_Spell_Buckler |
    Delta_Spell_Drums_Of_Endurance |
    Delta_Spell_Call_To_Arms

type Delta_Use_Ground_Target_Spell =
    Delta_Spell_Pocket_Tower

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
    new_unit_type: Creep_Type
    new_unit_id: Unit_Id
}

type Delta_Spell_Call_To_Arms = Delta_Use_No_Target_Spell_Base & {
    spell_id: Spell_Id.call_to_arms
    summons: {
        unit_id: Unit_Id
        unit_type: Creep_Type,
        at: {
            x: number
            y: number
        }
    }[]
}

type Delta_Spell_Refresher_Orb = Delta_Use_Unit_Target_Spell_Base & {
    spell_id: Spell_Id.refresher_orb
    charge_changes: {
        ability_id: Ability_Id
        charges_remaining: number
    }[]
}