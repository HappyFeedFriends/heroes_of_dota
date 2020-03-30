type Adventure_Room_Id = number & { _adventure_room_id_brand: any };
type Adventure_Entity_Id = number & { _adventure_entity_id_brand: any };
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
    set_currency_amount = 5
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
    wearable = 0,
    consumable = 1
}

declare const enum Adventure_Wearable_Item_Id {
    boots_of_travel = 0,
    assault_cuirass = 1,
    divine_rapier = 2,
    mask_of_madness = 3,
    boots_of_speed = 4,
    blades_of_attack = 5,
    belt_of_strength = 6,
    chainmail = 7,
    basher = 8,
    iron_branch = 9
}

declare const enum Adventure_Consumable_Item_Id {
    healing_salve = 0,
    enchanted_mango = 1,
    tome_of_knowledge = 2
}

declare const enum Adventure_Constants {
    max_hero_items = 3
}

declare const enum Adventure_Health_Change_Reason {
    combat = 0,
    healing_salve = 1,
    shrine = 2
}

declare const enum Adventure_Merchant_Model {
    smith = 0,
    meepo = 1,
    normal = 2,
    dire = 3
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
    response: {}
} | {
    type: Api_Request_Type.exit_adventure
    request: {} & With_Token & With_Private_Key
    response: Player_State_Data
} | {
    type: Api_Request_Type.start_adventure_enemy_fight
    request: {
        enemy_entity_id: Adventure_Entity_Id
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
        target_entity_id: Adventure_Entity_Id
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
    type: Api_Request_Type.adventure_party_cheat
    request: {
        current_head: number
        cheat: string
    } & With_Token
    response: {
        party_updates: Adventure_Party_Change[]
    }
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

type Adventure_Entity_Definition_Data = {
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
    item: Adventure_Item_Entity
} | {
    type: Adventure_Entity_Type.gold_bag
    amount: number
} | {
    type: Adventure_Entity_Type.merchant
    model: Adventure_Merchant_Model
}

type Adventure_Entity_Definition = Adventure_Entity_Definition_Base & Adventure_Entity_Definition_Data

type Adventure_Item_Entity = {
    type: Adventure_Item_Type.consumable
    id: Adventure_Consumable_Item_Id
} | {
    type: Adventure_Item_Type.wearable
    id: Adventure_Wearable_Item_Id
}

type Adventure_Entity_Base = Adventure_Entity_Definition_Base & {
    id: Adventure_Entity_Id
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
    item: Adventure_Item_Entity
    alive: boolean
} | {
    type: Adventure_Entity_Type.gold_bag
    amount: number
    alive: boolean
} | {
    type: Adventure_Entity_Type.merchant
    model: Adventure_Merchant_Model
    assortment: {
        heroes: Hero_Type[]
        creeps: Creep_Type[]
        spells: Spell_Id[]
        wearables: Adventure_Wearable_Item_Id[]
        consumables: Adventure_Consumable_Item_Id[]
    }
})

type Adventure_Party_Slot = {
    type: Adventure_Party_Slot_Type.empty
} | {
    type: Adventure_Party_Slot_Type.hero
    hero: Hero_Type
    base_health: number // Can be negative, if compensated by item bonuses
    items: Adventure_Hero_Inventory
} | {
    type: Adventure_Party_Slot_Type.creep
    creep: Creep_Type
    health: number
} | {
    type: Adventure_Party_Slot_Type.spell
    spell: Spell_Id
}

type Adventure_Party_Change = {
    type: Adventure_Party_Change_Type.set_slot
    slot: Adventure_Party_Slot
    slot_index: number
} | {
    type: Adventure_Party_Change_Type.set_health
    slot_index: number
    health: number
    reason: Adventure_Health_Change_Reason
} | {
    type: Adventure_Party_Change_Type.add_item_to_bag
    item: Adventure_Item
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

type Adventure_Item = Adventure_Consumable_Item | Adventure_Wearable_Item

type Adventure_Consumable_Item = {
    type: Adventure_Item_Type.consumable
    entity_id: Adventure_Party_Entity_Id
    item_id: Adventure_Consumable_Item_Id
}

type Adventure_Wearable_Item = {
    type: Adventure_Item_Type.wearable
    entity_id: Adventure_Party_Entity_Id
    item_id: Adventure_Wearable_Item_Id
    modifier: Modifier
}

type Adventure_Hero_Inventory = Array<Adventure_Wearable_Item | undefined> // Sparse array

type Party_Snapshot = {
    currency: number
    slots: Adventure_Party_Slot[]
    bag: Adventure_Item[]
}