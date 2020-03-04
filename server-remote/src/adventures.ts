import {readFileSync, writeFileSync, readdirSync} from "fs";
import {try_string_to_enum_value, unreachable} from "./common";

const storage_dir_path = "src/adventures";

export const enum Adventure_Room_Type {
    combat = 0,
    rest = 1
}

export const enum Party_Event_Type {
    add_creep = 0,
    add_spell = 1,
    activate_shrine = 2,
    add_item = 3
}

export type Adventure = {
    id: Adventure_Id
    rooms: Adventure_Room[]
}

type Adventure_Room = {
    type: Adventure_Room_Type
    id: Adventure_Room_Id
    entrance_location: XY
    entities: Adventure_Entity_Definition[]
}

type Adventure_File = {
    rooms: Array<{
        id: number
        entrance: [number, number]
        enemies?: Array<{
            type: string
            position: [number, number]
            facing: [number, number]
            creeps: string[]
            battleground: number
        }>
        items?: Array<{
            type: string
            position: [number, number]
            facing: [number, number]
            item_id: string
        }>
        other_entities?: Array<{
            type: string
            position: [number, number]
            facing: [number, number]
        }>
    }>
}

type Party_Event = {
    type: Party_Event_Type.add_creep
    creep: Creep_Type
} | {
    type: Party_Event_Type.add_spell
    spell: Spell_Id
} | {
    type: Party_Event_Type.activate_shrine
} | {
    type: Party_Event_Type.add_item
    item: Adventure_Item_Entity
}

type Entity_Interaction_Result = {
    party_events: Party_Event[]
    updated_entity: Adventure_Entity_State
}

export type Ongoing_Adventure = {
    id: Ongoing_Adventure_Id
    adventure: Adventure
    current_room: Adventure_Room
    entities: Adventure_Entity[]
}

const adventures: Adventure[] = [];

let entity_id_auto_increment = 0;

function get_next_entity_id(): Adventure_Entity_Id {
    return entity_id_auto_increment++ as Adventure_Entity_Id;
}

function room(id: number, type: Adventure_Room_Type, entrance: XY, entities: Adventure_Entity_Definition[]): Adventure_Room {
    return {
        id: id as Adventure_Room_Id,
        type: type,
        entrance_location: entrance,
        entities: entities
    }
}

function adventure_entity_from_definition(id: Adventure_Entity_Id, definition: Adventure_Entity_Definition): Adventure_Entity {
    return {
        id: id,
        definition: definition,
        alive: true
    };
}

export function adventure_by_id(adventure_id: Adventure_Id): Adventure | undefined {
    return adventures.find(adventure => adventure.id == adventure_id);
}

export function room_by_id(adventure: Adventure, room_id: Adventure_Room_Id): Adventure_Room | undefined {
    return adventure.rooms.find(room => room.id == room_id);
}

export function create_room_entities(room: Adventure_Room): Adventure_Entity[] {
    return room.entities.map(enemy => adventure_entity_from_definition(get_next_entity_id(), enemy));
}

export function load_all_adventures(): boolean {
    const files = readdirSync(storage_dir_path);
    const adventures_enum = enum_names_to_values<Adventure_Id>();
    const new_adventures: Adventure[] = [];

    for (const full_name of files) {
        if (!full_name.endsWith(".json")) {
            console.error(`Garbage file '${full_name}' in ${storage_dir_path}`);
            return false;
        }

        const just_name = full_name.substring(0, full_name.lastIndexOf("."));
        const id = try_string_to_enum_value(just_name, adventures_enum);

        if (id == undefined) {
            console.error(`Adventure with id ${just_name} not found`);
            return false;
        }

        console.log(`Loading adventure: '${just_name}'`);

        const full_path = `${storage_dir_path}/${full_name}`;
        const rooms = read_adventure_rooms_from_file(full_path);

        if (!rooms) {
            console.error(`Error while loading adventure from ${full_path}`);
            return false;
        }

        new_adventures.push({
            id: id,
            rooms: rooms
        });
    }

    adventures.length = 0;
    adventures.push(...new_adventures);

    return true;
}

function read_adventure_rooms_from_file(file_path: string): Adventure_Room[] | undefined {
    const adventure = JSON.parse(readFileSync(file_path, "utf8")) as Adventure_File;
    const npc_enum = enum_names_to_values<Npc_Type>();
    const creeps_enum = enum_names_to_values<Creep_Type>();
    const entities_enum = enum_names_to_values<Adventure_Entity_Type>();

    const rooms: Adventure_Room[] = [];

    for (const source_room of adventure.rooms) {
        const entrance = {
            x: source_room.entrance[0],
            y: source_room.entrance[1]
        };

        const entities: Adventure_Entity_Definition[] = [];

        for (const source_enemy of source_room.enemies || []) {
            const npc_type = try_string_to_enum_value(source_enemy.type, npc_enum);

            if (npc_type == undefined) {
                console.error(`Npc type ${source_enemy.type} not found while parsing ${file_path}`);
                return;
            }

            const creeps: Creep_Type[] = [];

            for (const creep of source_enemy.creeps) {
                const creep_type = try_string_to_enum_value(creep, creeps_enum);

                if (creep_type == undefined) {
                    console.error(`Creep type ${creep} not found while parsing ${file_path}`);
                    return;
                }

                creeps.push(creep_type);
            }

            entities.push({
                type: Adventure_Entity_Type.enemy,
                npc_type: npc_type,
                battleground: source_enemy.battleground as Battleground_Id,
                spawn_position: {
                    x: source_enemy.position[0],
                    y: source_enemy.position[1]
                },
                spawn_facing: {
                    x: source_enemy.facing[0],
                    y: source_enemy.facing[1]
                },
                creeps: creeps
            })
        }

        for (const source_entity of source_room.items || []) {
            const item_type = try_string_to_enum_value(source_entity.type, enum_names_to_values<Adventure_Item_Type>());

            if (item_type == undefined) {
                console.error(`Item type ${source_entity.type} not found while parsing ${file_path}`);
                return;
            }

            const base = {
                spawn_position: {
                    x: source_entity.position[0],
                    y: source_entity.position[1]
                },
                spawn_facing: {
                    x: source_entity.facing[0],
                    y: source_entity.facing[1]
                }
            };

            switch (item_type) {
                case Adventure_Item_Type.consumable: {
                    const item_id = try_string_to_enum_value(source_entity.item_id, enum_names_to_values<Adventure_Consumable_Item_Id>());
                    if (item_id == undefined) {
                        console.error(`Item id ${source_entity.item_id} not found while parsing ${file_path}`);
                        return;
                    }

                    entities.push({
                        ...base,
                        type: Adventure_Entity_Type.item_on_the_ground,
                        item: { type: item_type, id: item_id }
                    });

                    break;
                }

                case Adventure_Item_Type.wearable: {
                    const item_id = try_string_to_enum_value(source_entity.item_id, enum_names_to_values<Adventure_Wearable_Item_Id>());
                    if (item_id == undefined) {
                        console.error(`Item id ${source_entity.item_id} not found while parsing ${file_path}`);
                        return;
                    }

                    entities.push({
                        ...base,
                        type: Adventure_Entity_Type.item_on_the_ground,
                        item: { type: item_type, id: item_id }
                    });

                    break;
                }

                default: unreachable(item_type);
            }
        }

        for (const source_entity of source_room.other_entities || []) {
            const entity_type = try_string_to_enum_value(source_entity.type, entities_enum);

            if (entity_type == undefined) {
                console.error(`Entity type ${source_entity.type} not found while parsing ${file_path}`);
                return;
            }

            switch (entity_type) {
                case Adventure_Entity_Type.shrine:
                case Adventure_Entity_Type.lost_creep: {
                    const base = {
                        spawn_position: {
                            x: source_entity.position[0],
                            y: source_entity.position[1]
                        },
                        spawn_facing: {
                            x: source_entity.facing[0],
                            y: source_entity.facing[1]
                        }
                    };

                    const to_entity = (): Adventure_Entity_Definition => {
                        switch (entity_type) {
                            case Adventure_Entity_Type.lost_creep: return {
                                type: entity_type,
                                ...base
                            };

                            case Adventure_Entity_Type.shrine: return {
                                type: entity_type,
                                ...base
                            };
                        }
                    };

                    entities.push(to_entity());
                    break;
                }
            }
        }

        rooms.push(room(source_room.id, Adventure_Room_Type.combat, entrance, entities));
    }

    return rooms;
}

function persist_adventure_to_file_system(adventure: Adventure) {
    const file: Adventure_File = {
        rooms: adventure.rooms.map(room => {
            const enemies: Adventure_File["rooms"][0]["enemies"] = [];
            const other_entities: Adventure_File["rooms"][0]["other_entities"] = [];
            const items: Adventure_File["rooms"][0]["items"] = [];

            for (const entity of room.entities) {
                switch (entity.type) {
                    case Adventure_Entity_Type.enemy: {
                        enemies.push({
                            type: enum_to_string(entity.npc_type),
                            position: [entity.spawn_position.x, entity.spawn_position.y],
                            facing: [entity.spawn_facing.x, entity.spawn_facing.y],
                            creeps: entity.creeps.map(type => enum_to_string<Creep_Type>(type)),
                            battleground: entity.battleground
                        });

                        break;
                    }

                    case Adventure_Entity_Type.item_on_the_ground: {
                        const item_id = () => {
                            switch (entity.item.type) {
                                case Adventure_Item_Type.wearable: return enum_to_string(entity.item.id);
                                case Adventure_Item_Type.consumable: return enum_to_string(entity.item.id);
                            }
                        };

                        items.push({
                            type: enum_to_string(entity.item.type),
                            position: [entity.spawn_position.x, entity.spawn_position.y],
                            facing: [entity.spawn_facing.x, entity.spawn_facing.y],
                            item_id: item_id()
                        });

                        break;
                    }

                    default: {
                        other_entities.push({
                            type: enum_to_string(entity.type),
                            position: [entity.spawn_position.x, entity.spawn_position.y],
                            facing: [entity.spawn_facing.x, entity.spawn_facing.y],
                        });

                        break;
                    }
                }
            }

            return {
                id: room.id,
                entrance: [room.entrance_location.x, room.entrance_location.y],
                enemies: enemies,
                items: items,
                other_entities: other_entities
            };
        })
    };

    const path = `${storage_dir_path}/${enum_to_string(adventure.id)}.json`;

    console.log(`Saving ${path}`);

    writeFileSync(path, JSON.stringify(file, (key, value) => value, "    "));
}

export function interact_with_entity(adventure: Ongoing_Adventure, entity_id: Adventure_Entity_Id): Entity_Interaction_Result | undefined {
    const entity = adventure.entities.find(entity => entity.id == entity_id);
    if (!entity) return;
    if (!entity.alive) return;

    const entity_state = (): Adventure_Entity_State => ({
        id: entity.id,
        alive: entity.alive
    });

    switch (entity.definition.type) {
        case Adventure_Entity_Type.lost_creep: {
            entity.alive = false;

            return {
                updated_entity: entity_state(),
                party_events: [{
                    type: Party_Event_Type.add_creep,
                    creep: Creep_Type.lane_creep
                }]
            }
        }

        case Adventure_Entity_Type.shrine: {
            entity.alive = false;

            return {
                updated_entity: entity_state(),
                party_events: [{
                    type: Party_Event_Type.activate_shrine
                }]
            };
        }

        case Adventure_Entity_Type.item_on_the_ground: {
            entity.alive = false;

            return {
                updated_entity: entity_state(),
                party_events: [{
                    type: Party_Event_Type.add_item,
                    item: entity.definition.item
                }]
            };
        }
    }
}

export function editor_create_entity(ongoing: Ongoing_Adventure, definition: Adventure_Entity_Definition): Adventure_Entity {
    const new_entity = adventure_entity_from_definition(get_next_entity_id(), definition);

    ongoing.current_room.entities.push(definition);
    ongoing.entities.push(new_entity);

    persist_adventure_to_file_system(ongoing.adventure);

    return new_entity;
}

export function apply_editor_action(ongoing: Ongoing_Adventure, action: Adventure_Editor_Action) {
    switch (action.type) {
        case Adventure_Editor_Action_Type.set_entrance: {
            ongoing.current_room.entrance_location = action.entrance;
            break;
        }

        case Adventure_Editor_Action_Type.delete_entity: {
            const entity_index = ongoing.entities.findIndex(entity => entity.id == action.entity_id);
            if (entity_index == -1) return;

            const definition_index = ongoing.current_room.entities.indexOf(ongoing.entities[entity_index].definition);
            if (definition_index == -1) return;

            ongoing.current_room.entities.splice(entity_index, 1);
            ongoing.entities.splice(definition_index, 1);
            break;
        }

        case Adventure_Editor_Action_Type.set_entity_position: {
            const entity = ongoing.entities.find(entity => entity.id == action.entity_id);
            if (!entity) return;

            entity.definition.spawn_position = action.new_position;

            break;
        }

        case Adventure_Editor_Action_Type.set_entity_facing: {
            const entity = ongoing.entities.find(entity => entity.id == action.entity_id);
            if (!entity) return;

            entity.definition.spawn_facing = action.new_facing;

            break;
        }

        case Adventure_Editor_Action_Type.edit_enemy_deck: {
            const enemy = ongoing.entities.find(entity => entity.id == action.entity_id);
            if (!enemy) return;
            if (enemy.definition.type != Adventure_Entity_Type.enemy) return;

            enemy.definition.creeps = action.creeps;

            break;
        }

        case Adventure_Editor_Action_Type.set_enemy_battleground: {
            const enemy = ongoing.entities.find(entity => entity.id == action.entity_id);
            if (!enemy) return;
            if (enemy.definition.type != Adventure_Entity_Type.enemy) return;

            enemy.definition.battleground = action.battleground;

            break;
        }

        case Adventure_Editor_Action_Type.set_item_data: {
            const item = ongoing.entities.find(entity => entity.id == action.entity_id);
            if (!item) return;
            if (item.definition.type != Adventure_Entity_Type.item_on_the_ground) return;

            item.definition.item = action.item;

            break;
        }

        default: unreachable(action);
    }

    persist_adventure_to_file_system(ongoing.adventure);
}