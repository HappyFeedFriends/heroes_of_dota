type Adventure_Room_Id = number & { _adventure_room_id_brand: any };
type Adventure_World_Entity_Id = number & { _adventure_world_entity_id_brand: any };
type Adventure_Party_Entity_Id = number & { _adventure_party_entity_id_brand: any };
type Ongoing_Adventure_Id = number & { _ongoing_adventure_id_brand: any };

declare const enum Adventure_Id {
    forest = 0
}

declare const enum Adventure_Entity_Type {
    enemy = 0,
    lost_creep = 1,
    shrine = 2,
    item_on_the_ground = 3,
    gold_bag = 4,
    merchant = 5
}

declare const enum Adventure_Party_Slot_Type {
    empty = 0,
    hero = 1,
    spell = 2,
    creep = 3
}

declare const enum Adventure_Party_Change_Type {
    set_slot = 0,
    set_health = 1,
    add_item_to_bag = 2,
    move_item = 3,
    remove_bag_item = 4,
    set_currency_amount = 5,
    set_state_after_combat = 6,
    add_permanent_effect = 7
}

declare const enum Adventure_Party_Action_Type {
    fetch = 0,
    drag_item_on_hero = 1,
    drag_item_on_bag = 2,
    use_consumable = 3
}

declare const enum Adventure_Item_Container_Type {
    hero = 0,
    bag = 1
}

declare const enum Adventure_Item_Type {
    equipment = 0,
    consumable = 1
}

declare const enum Adventure_Item_Effect_Type {
    in_combat = 0,
    post_combat = 1,
    combat_start = 2
}

declare const enum Adventure_Consumable_Effect_Type {
    restore_health = 0,
    add_permanent = 1
}

declare const enum Adventure_Equipment_Item_Id {
    boots_of_travel = 0,
    assault_cuirass = 1,
    divine_rapier = 2,
    mask_of_madness = 3,
    boots_of_speed = 4,
    blades_of_attack = 5,
    belt_of_strength = 6,
    chainmail = 7,
    basher = 8,
    iron_branch = 9,
    mystic_staff = 10,
    ring_of_regen = 11,
    ring_of_tarrasque = 12,
    heart_of_tarrasque = 13,
    tome_of_aghanim = 14
}

declare const enum Adventure_Combat_Start_Effect_Id {
    add_ability_charges = 0,
    level_up = 1
}

declare const enum Adventure_Post_Combat_Effect_Id {
    restore_health = 0
}

declare const enum Adventure_Consumable_Item_Id {
    healing_salve = 0,
    enchanted_mango = 1,
    tome_of_knowledge = 2,
    tome_of_strength = 3,
    tome_of_agility = 4
}

declare const enum Adventure_Constants {
    max_hero_items = 3
}

declare const enum Adventure_Health_Change_Reason {
    combat = 0,
    healing_salve = 1,
    shrine = 2
}

declare const enum Adventure_Acquire_Reason {
    none = 0,
    purchase = 1,
}

declare const enum Adventure_Merchant_Model {
    smith = 0,
    meepo = 1,
    normal = 2,
    dire = 3
}

declare const enum Adventure_Merchant_Card_Type {
    hero = 0,
    spell = 1,
    creep = 2
}

declare const enum Adventure_Room_Type {
    combat = 0,
    rest = 1
}

type Adventure_Handlers = {
    type: Api_Request_Type.start_adventure
    request: {
        adventure_id: Adventure_Id
    } & With_Token & With_Private_Key
    response: Player_State_Data
} | {
    type: Api_Request_Type.enter_adventure_room
    request: {
        room_id: Adventure_Room_Id
    } & With_Token & With_Private_Key
    response: Adventure_Room_Data
} | {
    type: Api_Request_Type.exit_adventure
    request: {} & With_Token & With_Private_Key
    response: Player_State_Data
} | {
    type: Api_Request_Type.start_adventure_enemy_fight
    request: {
        enemy_entity_id: Adventure_World_Entity_Id
    } & With_Token & With_Private_Key
    response: Player_State_Data
} | {
    type: Api_Request_Type.submit_adventure_player_movement
    request: {
        current_location: {
            x: number
            y: number
        }
        movement_history: Movement_History_Entry[]
    } & With_Token & With_Private_Key
    response: {}
} | {
    type: Api_Request_Type.interact_with_adventure_entity
    request: {
        target_entity_id: Adventure_World_Entity_Id
        current_head: number
    } & With_Token & With_Private_Key
    response: {
        party_updates: Adventure_Party_Change[]
        updated_entity: Adventure_Entity
    }
} | {
    type: Api_Request_Type.act_on_adventure_party
    request: Adventure_Party_Action & With_Token
    response: Adventure_Party_Response
} | {
    type: Api_Request_Type.purchase_merchant_item
    request: {
        current_head: number
        merchant_id: Adventure_World_Entity_Id
        purchase_id: Adventure_Party_Entity_Id
    } & With_Token & With_Private_Key
    response: {
        party_updates: Adventure_Party_Change[]
        updated_entity: Adventure_Entity
    }
} | {
    type: Api_Request_Type.adventure_party_cheat
    request: {
        current_head: number
        cheat: string
    } & With_Token
    response: {
        party_updates: Adventure_Party_Change[]
    }
}

type Adventure_Room_Data = {
    entrance: XY
    entities: Adventure_Entity[]
    camera_restriction_zones: Camera_Restriction_Zone[]
    exits: Adventure_Room_Exit[]
}

type Adventure_Room_Exit = {
    at: XY
    to: Adventure_Room_Id
}

type Adventure_Entity_Definition_Base = {
    spawn_position: {
        x: number
        y: number
    }
    spawn_facing: {
        x: number
        y: number
    }
}

type Adventure_Entity_Definition = Adventure_Entity_Definition_Base & ({
    type: Adventure_Entity_Type.enemy
    npc_type: Npc_Type
    creeps: Creep_Type[]
    battleground: Battleground_Id
} | {
    type: Adventure_Entity_Type.lost_creep
} | {
    type: Adventure_Entity_Type.shrine
} | {
    type: Adventure_Entity_Type.item_on_the_ground
    item: Adventure_Item_Definition
} | {
    type: Adventure_Entity_Type.gold_bag
    amount: number
} | {
    type: Adventure_Entity_Type.merchant
    model: Adventure_Merchant_Model
    stock: Adventure_Merchant_Stock_Definition
})

type Adventure_Item_Definition = {
    type: Adventure_Item_Type.consumable
    id: Adventure_Consumable_Item_Id
} | {
    type: Adventure_Item_Type.equipment
    id: Adventure_Equipment_Item_Id
}

type Adventure_Entity_Base = Adventure_Entity_Definition_Base & {
    id: Adventure_World_Entity_Id
}

type Adventure_Entity = Adventure_Entity_Base & ({
    type: Adventure_Entity_Type.enemy
    npc_type: Npc_Type
    creeps: Creep_Type[]
    battleground: Battleground_Id
    alive: boolean
} | {
    type: Adventure_Entity_Type.lost_creep
    alive: boolean
} | {
    type: Adventure_Entity_Type.shrine
    alive: boolean
} | {
    type: Adventure_Entity_Type.item_on_the_ground
    item: Adventure_Item
    alive: boolean
} | {
    type: Adventure_Entity_Type.gold_bag
    amount: number
    alive: boolean
} | {
    type: Adventure_Entity_Type.merchant
    model: Adventure_Merchant_Model
    stock: Adventure_Merchant_Stock
})

type Adventure_Merchant = Find_By_Type<Adventure_Entity, Adventure_Entity_Type.merchant>

type Adventure_Merchant_Stock = {
    cards: Adventure_Merchant_Card[]
    items: Adventure_Merchant_Item[]
}

type Adventure_Merchant_Entry_Base = {
    entity_id: Adventure_Party_Entity_Id
    sold_out: boolean
    cost: number
}

type Adventure_Merchant_Card = Adventure_Merchant_Entry_Base & ({
    type: Adventure_Merchant_Card_Type.hero
    hero: Hero_Type
} | {
    type: Adventure_Merchant_Card_Type.creep
    creep: Creep_Type
} | {
    type: Adventure_Merchant_Card_Type.spell
    spell: Spell_Id
})

type Adventure_Merchant_Item = Adventure_Merchant_Entry_Base & {
    data: Adventure_Item
}

type Adventure_Merchant_Stock_Definition = {
    heroes: Hero_Type[]
    creeps: Creep_Type[]
    spells: Spell_Id[]
    items: Adventure_Item_Definition[]
}

type Adventure_Party_Slot = {
    type: Adventure_Party_Slot_Type.empty
} | {
    type: Adventure_Party_Slot_Type.hero
    hero: Hero_Type
    base_health: number // Can be negative, if compensated by item bonuses
    items: Adventure_Hero_Inventory
    permanents: Adventure_Item_Effect_From_Source[]
} | {
    type: Adventure_Party_Slot_Type.creep
    creep: Creep_Type
    health: number
} | {
    type: Adventure_Party_Slot_Type.spell
    spell: Spell_Id
}

type Adventure_Party_Hero_Slot = Find_By_Type<Adventure_Party_Slot, Adventure_Party_Slot_Type.hero>
type Adventure_Party_Creep_Slot = Find_By_Type<Adventure_Party_Slot, Adventure_Party_Slot_Type.creep>

type Adventure_Party_Change = {
    type: Adventure_Party_Change_Type.set_slot
    slot: Adventure_Party_Slot
    slot_index: number
    reason: Adventure_Acquire_Reason
} | {
    type: Adventure_Party_Change_Type.set_health
    slot_index: number
    health: number
    non_clamped_health: number
    reason: Adventure_Health_Change_Reason
} | {
    type: Adventure_Party_Change_Type.add_item_to_bag
    item: Adventure_Item
    reason: Adventure_Acquire_Reason
} | {
    type: Adventure_Party_Change_Type.move_item
    source: Adventure_Item_Container
    target: Adventure_Item_Container
} | {
    type: Adventure_Party_Change_Type.remove_bag_item
    slot_index: number
} | {
    type: Adventure_Party_Change_Type.set_currency_amount
    amount: number
    from_purchase: boolean
} | {
    type: Adventure_Party_Change_Type.set_state_after_combat
    slots_removed: number[]
    slot_health_changes: {
        index: number
        health_before: number
        health_now: number
    }[]
    enemy: {
        heroes: Hero_Type[]
        creeps: Creep_Type[]
        spells: Spell_Id[]
    }
} | {
    type: Adventure_Party_Change_Type.add_permanent_effect
    hero_slot_index: number
    effect: Adventure_Item_Effect_From_Source
}

type Adventure_Item_Container = {
    type: Adventure_Item_Container_Type.hero
    hero_slot_index: number
    item_slot_index: number
} | {
    type: Adventure_Item_Container_Type.bag
    bag_slot_index: number
}

type Adventure_Party_Action = { current_head: number } & ({
    type: Adventure_Party_Action_Type.fetch
} | {
    type: Adventure_Party_Action_Type.drag_item_on_hero
    item_entity: Adventure_Party_Entity_Id
    party_slot: number
} | {
    type: Adventure_Party_Action_Type.drag_item_on_bag
    item_entity: Adventure_Party_Entity_Id
} | {
    type: Adventure_Party_Action_Type.use_consumable
    item_entity: Adventure_Party_Entity_Id
    party_slot: number
})

type Adventure_Party_Response = {
    snapshot: true
    content: Party_Snapshot
    origin_head: number
} | {
    snapshot: false
    changes: Adventure_Party_Change[]
    apply_to_head: number
}

type Adventure_Item = Adventure_Consumable_Item | Adventure_Equipment_Item

type Adventure_Consumable_Item = {
    type: Adventure_Item_Type.consumable
    entity_id: Adventure_Party_Entity_Id
    item_id: Adventure_Consumable_Item_Id
    effect: Adventure_Consumable_Effect
}

type Adventure_Equipment_Item = {
    type: Adventure_Item_Type.equipment
    entity_id: Adventure_Party_Entity_Id
    item_id: Adventure_Equipment_Item_Id
    effects: Adventure_Item_Effect[]
}

type Adventure_Item_Effect = {
    type: Adventure_Item_Effect_Type.in_combat
    modifier: Modifier
} | {
    type: Adventure_Item_Effect_Type.combat_start
    effect_id: Adventure_Combat_Start_Effect_Id.add_ability_charges
    how_many: number
} | {
    type: Adventure_Item_Effect_Type.combat_start
    effect_id: Adventure_Combat_Start_Effect_Id.level_up
    how_many_levels: number
} | {
    type: Adventure_Item_Effect_Type.post_combat
    effect_id: Adventure_Post_Combat_Effect_Id.restore_health
    how_much: number
}

type Adventure_Consumable_Effect = {
    type: Adventure_Consumable_Effect_Type.restore_health
    reason: Adventure_Health_Change_Reason
    how_much: number
} | {
    type: Adventure_Consumable_Effect_Type.add_permanent
    permanent: Adventure_Item_Effect
}

type Adventure_Item_Effect_From_Source = Adventure_Item_Effect & {
    source_item_id: Adventure_Consumable_Item_Id
}

type Adventure_Item_Combat_Start_Effect = Find_By_Type<Adventure_Item_Effect, Adventure_Item_Effect_Type.combat_start>

type Adventure_Hero_State = {
    items: Adventure_Hero_Inventory
    permanents: Adventure_Item_Effect_From_Source[]
}

type Adventure_Hero_Inventory = Array<Adventure_Equipment_Item | undefined> // Sparse array

type Party_Snapshot = {
    currency: number
    slots: Adventure_Party_Slot[]
    bag: Adventure_Item[]
}

type Camera_Restriction_Zone = {
    points: XY[]
}