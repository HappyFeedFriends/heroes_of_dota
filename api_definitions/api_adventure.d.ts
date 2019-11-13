type Adventure_Room_Id = number & { _adventure_room_id_brand: any };
type Adventure_Entity_Id = number & { _adventure_entity_id_brand: any };
type Ongoing_Adventure_Id = number & { _ongoing_adventure_id_brand: any };

declare const enum Adventure_Id {
    forest = 0
}

declare const enum Adventure_Entity_Type {
    enemy = 0,
    lost_creep = 1
}

declare const enum Adventure_Party_Slot_Type {
    empty = 0,
    hero = 1,
    spell = 2,
    creep = 3
}

declare const enum Adventure_Party_Change_Type {
    set_slot = 0,
    set_health = 1
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
    type: Api_Request_Type.query_adventure_entity_states
    request: {} & With_Token & With_Private_Key
    response: {
        states: Adventure_Entity_State[]
    }
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
        starting_change_index: number
    } & With_Token & With_Private_Key
    response: {
        party_updates: Adventure_Party_Change[]
        updated_entity: Adventure_Entity_State
    }
} | {
    type: Api_Request_Type.get_adventure_party_changes
    request: {
        starting_change_index: number
    } & With_Token
    response: {
        changes: Adventure_Party_Change[]
    }
} | {
    type: Api_Request_Type.adventure_party_cheat
    request: {
        starting_change_index: number
        cheat: string
    } & With_Token
    response: {
        party_updates: Adventure_Party_Change[]
    }
}

type Adventure_Entity = Adventure_Entity_State & {
    definition: Adventure_Entity_Definition
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

type Adventure_Enemy_Definition = Adventure_Entity_Definition_Base & {
    type: Adventure_Entity_Type.enemy
    npc_type: Npc_Type
    creeps: Creep_Type[]
}

type Adventure_Lost_Creep_Definition = Adventure_Entity_Definition_Base & {
    type: Adventure_Entity_Type.lost_creep
}

type Adventure_Entity_Definition = Adventure_Enemy_Definition | Adventure_Lost_Creep_Definition

type Adventure_Entity_State = {
    id: Adventure_Entity_Id
    alive: boolean
}

type Adventure_Party_Slot = {
    type: Adventure_Party_Slot_Type.empty
} | {
    type: Adventure_Party_Slot_Type.hero
    hero: Hero_Type
    health: number
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
}