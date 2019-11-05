import {readFileSync, writeFileSync} from "fs";

const storage_file_path = "src/adventures.json";

export const enum Adventure_Room_Type {
    combat = 0,
    rest = 1
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

type Adventures_File = {
    adventures: Array<{
        id: string
        rooms: Array<{
            id: number
            entrance: [number, number]
            enemies?: Array<{
                type: string
                position: [number, number]
                facing: [number, number],
                creeps: string[]
            }>
            other_entities?: Array<{
                type: string
                position: [number, number]
                facing: [number, number],
            }>
        }>
    }>
}

export type Ongoing_Adventure = {
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

export function reload_adventures_from_file() {
    const file = JSON.parse(readFileSync(storage_file_path, "utf8")) as Adventures_File;
    const adventures_enum = enum_names_to_values<Adventure_Id>();
    const npc_enum = enum_names_to_values<Npc_Type>();
    const creeps_enum = enum_names_to_values<Creep_Type>();
    const entities_enum = enum_names_to_values<Adventure_Entity_Type>();
    const new_adventures: Adventure[] = [];

    function try_string_to_enum_value<T>(value: string, enum_values: [string, T][]): T | undefined {
        const result = enum_values.find(([name]) => value == name);

        if (!result) {
            return undefined;
        }

        return result[1];
    }

    out:
    for (const adventure of file.adventures) {
        const id = try_string_to_enum_value(adventure.id, adventures_enum);

        if (id == undefined) {
            console.error(`Adventure with id ${adventure.id} not found`);
            continue;
        }

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
                    console.error(`${adventure.id}: npc with type ${source_enemy.type} not found`);
                    continue out;
                }

                const creeps: Creep_Type[] = [];

                for (const creep of source_enemy.creeps) {
                    const creep_type = try_string_to_enum_value(creep, creeps_enum);

                    if (creep_type == undefined) {
                        console.error(`${adventure.id}: creep with type ${creep} not found`);
                        continue out;
                    }

                    creeps.push(creep_type);
                }

                entities.push({
                    type: Adventure_Entity_Type.enemy,
                    npc_type: npc_type,
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

            for (const source_entity of source_room.other_entities || []) {
                const entity_type = try_string_to_enum_value(source_entity.type, entities_enum);

                if (entity_type == undefined) {
                    console.error(`${adventure.id}: entity with type ${source_entity.type} not found`);
                    continue out;
                }

                if (entity_type != Adventure_Entity_Type.enemy) {
                    entities.push({
                        type: entity_type,
                        spawn_position: {
                            x: source_entity.position[0],
                            y: source_entity.position[1]
                        },
                        spawn_facing: {
                            x: source_entity.facing[0],
                            y: source_entity.facing[1]
                        }
                    })
                }
            }

            rooms.push(room(source_room.id, Adventure_Room_Type.combat, entrance, entities));
        }

        new_adventures.push({
            id: id,
            rooms: rooms
        })
    }

    adventures.length = 0;
    adventures.push(...new_adventures);

    save_adventures_to_file();
}

function save_adventures_to_file() {
    const file: Adventures_File = {
        adventures: adventures.map(adventure => {
            const rooms: Adventures_File["adventures"][0]["rooms"] = [];

            for (const room of adventure.rooms) {
                const enemies: Adventures_File["adventures"][0]["rooms"][0]["enemies"] = [];

                for (const entity of room.entities) {
                    if (entity.type == Adventure_Entity_Type.enemy) {
                        enemies.push({
                            type: enum_to_string(entity.npc_type),
                            position: [entity.spawn_position.x, entity.spawn_position.y],
                            facing: [entity.spawn_facing.x, entity.spawn_facing.y],
                            creeps: entity.creeps.map(type => enum_to_string<Creep_Type>(type))
                        })
                    }
                }

                const other_entities: Adventures_File["adventures"][0]["rooms"][0]["other_entities"] = [];

                for (const entity of room.entities) {
                    if (entity.type != Adventure_Entity_Type.enemy) {
                        other_entities.push({
                            type: enum_to_string(entity.type),
                            position: [entity.spawn_position.x, entity.spawn_position.y],
                            facing: [entity.spawn_facing.x, entity.spawn_facing.y],
                        })
                    }
                }

                rooms.push({
                    id: room.id,
                    entrance: [room.entrance_location.x, room.entrance_location.y],
                    enemies: enemies,
                    other_entities: other_entities
                });
            }

            return ({
                id: enum_to_string(adventure.id),
                rooms: rooms
            });
        })
    };

    writeFileSync(storage_file_path, JSON.stringify(file, (key, value) => value, "    "));
}

// TODO do not mutate the party, instead return a sequence of mutations
export function interact_with_entity(adventure: Ongoing_Adventure, party: Adventure_Party_State, entity_id: Adventure_Entity_Id): Adventure_Entity_State | undefined {
    const entity = adventure.entities.find(entity => entity.id == entity_id);
    if (!entity) return;
    if (!entity.alive) return;

    switch (entity.definition.type) {
        case Adventure_Entity_Type.lost_creep: {
            party.spells.push(Spell_Id.call_to_arms);
            break;
        }
    }

    entity.alive = false;
    
    return {
        id: entity.id,
        alive: entity.alive
    }
}

export function editor_create_entity(adventure: Ongoing_Adventure, definition: Adventure_Entity_Definition): Adventure_Entity {
    const new_entity = adventure_entity_from_definition(get_next_entity_id(), definition);

    adventure.current_room.entities.push(definition);
    adventure.entities.push(new_entity);

    save_adventures_to_file();

    return new_entity;
}

export function apply_editor_action(adventure: Ongoing_Adventure, action: Editor_Action) {
    switch (action.type) {
        case Adventure_Editor_Action_Type.set_entrance: {
            adventure.current_room.entrance_location = action.entrance;
            break;
        }

        case Adventure_Editor_Action_Type.delete_entity: {
            const entity_index = adventure.entities.findIndex(entity => entity.id == action.entity_id);
            if (entity_index == -1) return;

            const definition_index = adventure.current_room.entities.indexOf(adventure.entities[entity_index].definition);
            if (definition_index == -1) return;

            adventure.current_room.entities.splice(entity_index, 1);
            adventure.entities.splice(definition_index, 1);
            break;
        }

        case Adventure_Editor_Action_Type.set_entity_position: {
            const entity = adventure.entities.find(entity => entity.id == action.entity_id);
            if (!entity) return;

            entity.definition.spawn_position = action.new_position;

            break;
        }

        case Adventure_Editor_Action_Type.set_entity_facing: {
            const entity = adventure.entities.find(entity => entity.id == action.entity_id);
            if (!entity) return;

            entity.definition.spawn_facing = action.new_facing;

            break;
        }

        case Adventure_Editor_Action_Type.edit_enemy_deck: {
            const enemy = adventure.entities.find(entity => entity.id == action.entity_id);
            if (!enemy) return;
            if (enemy.definition.type != Adventure_Entity_Type.enemy) return;

            enemy.definition.creeps = action.creeps;

            break;
        }

        default: unreachable(action);
    }

    save_adventures_to_file();
}