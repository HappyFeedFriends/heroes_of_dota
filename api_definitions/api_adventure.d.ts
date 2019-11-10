type Adventure_Room_Id = number & { _adventure_room_id_brand: any };
type Adventure_Entity_Id = number & { _adventure_entity_id_brand: any };

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

declare const enum Adventure_Editor_Action_Type {
    set_entity_position = 0,
    set_entity_facing = 1,
    delete_entity = 2,
    set_entrance = 3,
    edit_enemy_deck = 4
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

type Adventure_Party_State = {
    currency: number
    slots: Adventure_Party_Slot[]
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