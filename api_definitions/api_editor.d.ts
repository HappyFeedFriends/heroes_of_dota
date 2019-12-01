declare const enum Adventure_Editor_Action_Type {
    set_entity_position = 0,
    set_entity_facing = 1,
    delete_entity = 2,
    set_entrance = 3,
    edit_enemy_deck = 4
}

type Editor_Handlers = {
    type: Api_Request_Type.editor_action
    request: Adventure_Editor_Action & With_Token
    response: {}
} | {
    type: Api_Request_Type.editor_get_room_details
    request: {} & With_Token
    response: {
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
    type: Api_Request_Type.editor_get_enemy_deck
    request: {
        entity_id: Adventure_Entity_Id
    } & With_Token
    response: {
        creeps: Creep_Type[]
    }
} | {
    type: Api_Request_Type.editor_create_battleground
    request: {}
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
}

type Adventure_Editor_Action = {
    type: Adventure_Editor_Action_Type.set_entrance
    entrance: {
        x: number
        y: number
    }
} | {
    type: Adventure_Editor_Action_Type.delete_entity
    entity_id: Adventure_Entity_Id
} | {
    type: Adventure_Editor_Action_Type.set_entity_position
    entity_id: Adventure_Entity_Id
    new_position: {
        x: number
        y: number
    }
} | {
    type: Adventure_Editor_Action_Type.set_entity_facing
    entity_id: Adventure_Entity_Id
    new_facing: {
        x: number
        y: number
    }
} | {
    type: Adventure_Editor_Action_Type.edit_enemy_deck
    entity_id: Adventure_Entity_Id
    creeps: Creep_Type[]
}

declare const enum Spawn_Type {
    rune = 0 ,
    shop = 1,
    monster = 2,
    tree = 3
}

type Battleground_Spawn = {
    type: Spawn_Type.rune
    at: {
        x: number
        y: number
    }
} | {
    type: Spawn_Type.shop
    shop_type: Shop_Type
    at: {
        x: number
        y: number
    }
    facing: {
        x: number
        y: number
    }
    item_pool: Item_Id[]
} | {
    type: Spawn_Type.monster
    at: {
        x: number
        y: number
    }
    facing: {
        x: number
        y: number
    }
} | {
    type: Spawn_Type.tree
    at: {
        x: number
        y: number
    }
}

type Battleground = {
    grid_size: XY
    deployment_zones: Deployment_Zone[]
    spawns: Battleground_Spawn[]
}