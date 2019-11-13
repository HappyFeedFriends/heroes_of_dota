declare const enum Adventure_Editor_Action_Type {
    set_entity_position = 0,
    set_entity_facing = 1,
    delete_entity = 2,
    set_entrance = 3,
    edit_enemy_deck = 4
}

type Editor_Handlers = {
    type: Api_Request_Type.editor_action
    request: Editor_Action & With_Token
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
}

type Editor_Action = {
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