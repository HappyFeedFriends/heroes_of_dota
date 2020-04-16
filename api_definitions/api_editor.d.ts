declare const enum Adventure_Editor_Action_Type {
    set_entity_position = 0,
    set_entity_facing = 1,
    delete_entity = 2,
    set_room_details = 3,
    edit_enemy_deck = 4,
    set_enemy_battleground = 5,
    set_item_data = 6,
    set_merchant_stock = 7,
    reroll_merchant_stock = 8
}

type Editor_Handlers = {
    type: Api_Request_Type.editor_action
    request: Adventure_Editor_Action & With_Token
    response: {}
} | {
    type: Api_Request_Type.editor_get_room_details
    request: {} & With_Token
    response: {
        id: Adventure_Room_Id
        type: Adventure_Room_Type
        name: string
        exits: Array<Adventure_Room_Exit & {
            name: string
        }>
        camera_restriction_zones: Camera_Restriction_Zone[]
        entrance_location: {
            x: number
            y: number
        }
    }
} | {
    type: Api_Request_Type.editor_create_entity
    request: {
        definition: Adventure_Entity_Definition
    } & With_Token
    response: Adventure_Entity
} | {
    type: Api_Request_Type.editor_create_battleground
    request: {
        name: string
        world_origin: World_Origin
        theme: Battleground_Theme
    }
    response: {
        id: Battleground_Id
        battleground: Battleground
    }
} | {
    type: Api_Request_Type.editor_submit_battleground
    request: {
        id: Battleground_Id
        battleground: Battleground
    }
    response: {}
} | {
    type: Api_Request_Type.editor_get_battleground
    request: {
        id: Battleground_Id
    }
    response: {
        battleground: Battleground
    }
} | {
    type: Api_Request_Type.editor_list_battlegrounds
    request: {}
    response: {
        battlegrounds: {
            id: Battleground_Id
            name: string
            size: XY
        }[]
    }
} | {
    type: Api_Request_Type.editor_delete_battleground
    request: {
        id: Battleground_Id
    }
    response: {}
} | {
    type: Api_Request_Type.editor_duplicate_battleground
    request: {
        id: Battleground_Id
    }
    response: {
        new_id: Battleground_Id
    }
} | {
    type: Api_Request_Type.editor_playtest_battleground
    request: {
        enemy: Adventure_World_Entity_Id
        battleground: Battleground_Id
    } & With_Token
    response: Player_State_Data
} | {
    type: Api_Request_Type.editor_get_merchant_stock
    request: {
        merchant: Adventure_World_Entity_Id
    } & With_Token
    response: Adventure_Merchant_Stock_Definition
} | {
    type: Api_Request_Type.editor_reroll_merchant_stock
    request: {
        merchant: Adventure_World_Entity_Id
    } & With_Token
    response: Adventure_Merchant_Stock
} | {
    type: Api_Request_Type.editor_list_rooms
    request: {} & With_Token
    response: {
        rooms: {
            id: Adventure_Room_Id
            name: string
        }[]
    }
} | {
    type: Api_Request_Type.editor_get_entity_definition
    request: {
        entity: Adventure_World_Entity_Id
    } & With_Token
    response: {
        definition: Adventure_Entity_Definition
    }
}

type Adventure_Editor_Action = {
    type: Adventure_Editor_Action_Type.set_room_details
    room_type: Adventure_Room_Type
    name: string
    zones: Camera_Restriction_Zone[]
    exits: Adventure_Room_Exit[]
    entrance: {
        x: number
        y: number
    }
} | {
    type: Adventure_Editor_Action_Type.delete_entity
    entity_id: Adventure_World_Entity_Id
} | {
    type: Adventure_Editor_Action_Type.set_entity_position
    entity_id: Adventure_World_Entity_Id
    new_position: {
        x: number
        y: number
    }
} | {
    type: Adventure_Editor_Action_Type.set_entity_facing
    entity_id: Adventure_World_Entity_Id
    new_facing: {
        x: number
        y: number
    }
} | {
    type: Adventure_Editor_Action_Type.edit_enemy_deck
    entity_id: Adventure_World_Entity_Id
    creeps: Creep_Type[]
} | {
    type: Adventure_Editor_Action_Type.set_enemy_battleground
    entity_id: Adventure_World_Entity_Id
    battleground: Battleground_Id
} | {
    type: Adventure_Editor_Action_Type.set_item_data
    entity_id: Adventure_World_Entity_Id
    item: Adventure_Item_Id
} | {
    type: Adventure_Editor_Action_Type.set_merchant_stock
    entity_id: Adventure_World_Entity_Id
    stock: Adventure_Merchant_Stock_Definition
} | {
    type: Adventure_Editor_Action_Type.reroll_merchant_stock
    entity_id: Adventure_World_Entity_Id
}

declare const enum Spawn_Type {
    rune = 0 ,
    shop = 1,
    monster = 2,
    tree = 3
}

type Battleground_Spawn = {
    type: Spawn_Type.rune
    at: XY
} | {
    type: Spawn_Type.shop
    shop_type: Shop_Type
    at: XY
    facing: XY
    item_pool: Item_Id[]
} | {
    type: Spawn_Type.monster
    at: XY
    facing: XY
} | {
    type: Spawn_Type.tree
    at: XY
}

type Battleground = {
    name: string
    theme: Battleground_Theme
    world_origin: World_Origin
    grid_size: XY
    deployment_zones: Deployment_Zone[]
    spawns: Battleground_Spawn[]
    disabled_cells: Cell_Index[]
}