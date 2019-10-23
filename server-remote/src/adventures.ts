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

type Adventure_Room_Base = {
    id: Adventure_Room_Id
    entrance_location: XY
}

type Adventure_Room_Combat = Adventure_Room_Base & {
    type: Adventure_Room_Type.combat
    enemies: Adventure_Enemy_Definition[]
}

type Adventure_Room_Rest = Adventure_Room_Base & {
    type: Adventure_Room_Type.rest
}

type Adventure_Enemy_Definition = Adventure_Entity_Definition_Base & {
    type: Npc_Type
}

type Adventure_Entity_Definition_Base = {
    spawn_position: XY
    spawn_facing: XY
}

type Adventure_Enemy = {
    type: Adventure_Entity_Type.enemy
    id: Adventure_Entity_Id
    definition: Adventure_Enemy_Definition
}

type Adventure_Lost_Creep = {
    type: Adventure_Entity_Type.lost_creep
    id: Adventure_Entity_Id
    definition: Adventure_Entity_Definition_Base
}

type Adventure_Entity = Adventure_Enemy | Adventure_Lost_Creep

type Adventures_File = {
    adventures: Array<{
        id: string
        combat_rooms: Array<{
            id: number
            entrance: [number, number]
            enemies: Array<{
                type: string
                position: [number, number]
                facing: [number, number]
            }>
        }>
    }>
}

export type Adventure_Room = Adventure_Room_Combat | Adventure_Room_Rest

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

function combat_room(id: number, entrance: XY, enemies: Adventure_Enemy_Definition[]): Adventure_Room {
    return {
        id: id as Adventure_Room_Id,
        type: Adventure_Room_Type.combat,
        entrance_location: entrance,
        enemies: enemies
    }
}

function adventure_enemy_from_definition(id: Adventure_Entity_Id, enemy: Adventure_Enemy_Definition): Adventure_Enemy {
    return {
        id: id,
        type: Adventure_Entity_Type.enemy,
        definition: enemy
    };
}

export function adventure_by_id(adventure_id: Adventure_Id): Adventure | undefined {
    return adventures.find(adventure => adventure.id == adventure_id);
}

export function room_by_id(adventure: Adventure, room_id: Adventure_Room_Id): Adventure_Room | undefined {
    return adventure.rooms.find(room => room.id == room_id);
}

export function create_room_entities(room: Adventure_Room_Combat): Adventure_Entity[] {
    return room.enemies.map(enemy => adventure_enemy_from_definition(get_next_entity_id(), enemy));
}

export function reload_adventures_from_file() {
    const file = JSON.parse(readFileSync(storage_file_path, "utf8")) as Adventures_File;
    const adventures_enum = enum_names_to_values<Adventure_Id>();
    const npc_enum = enum_names_to_values<Npc_Type>();
    const new_adventures: Adventure[] = [];

    out:
    for (const adventure of file.adventures) {
        const result = adventures_enum.find(([name]) => adventure.id == name);

        if (!result) {
            console.error(`Adventure with id ${adventure.id} not found`);
            continue;
        }

        const [, id] = result;

        const rooms: Adventure_Room[] = [];

        for (const source_room of adventure.combat_rooms) {
            const entrance = {
                x: source_room.entrance[0],
                y: source_room.entrance[1]
            };

            const enemies: Adventure_Enemy_Definition[] = [];

            for (const source_enemy of source_room.enemies) {
                const result = npc_enum.find(([name]) => source_enemy.type == name);

                if (!result) {
                    console.error(`${adventure.id}: npc with type ${source_enemy.type} not found`);
                    continue out;
                }

                const [, npc_type] = result;

                enemies.push({
                    type: npc_type,
                    spawn_position: {
                        x: source_enemy.position[0],
                        y: source_enemy.position[1]
                    },
                    spawn_facing: {
                        x: source_enemy.facing[0],
                        y: source_enemy.facing[1]
                    }
                })
            }

            rooms.push(combat_room(source_room.id, entrance, enemies));
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
            const combat_rooms: Adventures_File["adventures"][0]["combat_rooms"] = [];

            for (const room of adventure.rooms) {
                if (room.type == Adventure_Room_Type.combat) {
                    combat_rooms.push({
                        id: room.id,
                        entrance: [room.entrance_location.x, room.entrance_location.y],
                        enemies: room.enemies.map(enemy => ({
                            type: enum_to_string(enemy.type),
                            position: [enemy.spawn_position.x, enemy.spawn_position.y],
                            facing: [enemy.spawn_facing.x, enemy.spawn_facing.y]
                        }))
                    });
                }
            }

            return ({
                id: enum_to_string(adventure.id),
                combat_rooms: combat_rooms
            });
        })
    };

    writeFileSync(storage_file_path, JSON.stringify(file, (key, value) => value, "    "));
}

function find_enemy_and_associated_definition_indices(adventure: Ongoing_Adventure, id: Adventure_Entity_Id): [number, number, Adventure_Room_Combat] | undefined {
    if (adventure.current_room.type != Adventure_Room_Type.combat) return;

    const entity_index = adventure.entities.findIndex(entity => entity.id == id);
    if (entity_index == -1) return;

    const entity = adventure.entities[entity_index];
    if (entity.type != Adventure_Entity_Type.enemy) return;

    const definition_index = adventure.current_room.enemies.indexOf(entity.definition);
    if (definition_index == -1) return;

    return [entity_index, definition_index, adventure.current_room];
}

export function apply_editor_action(adventure: Ongoing_Adventure, action: Editor_Action) {
    switch (action.type) {
        case Editor_Action_Type.set_entrance: {
            adventure.current_room.entrance_location = action.entrance;
            break;
        }

        case Editor_Action_Type.add_enemy: {
            const enemy: Adventure_Enemy_Definition = {
                type: action.npc_type,
                spawn_facing: action.facing,
                spawn_position: action.position
            };

            if (adventure.current_room.type == Adventure_Room_Type.combat) {
                adventure.current_room.enemies.push(enemy);
                adventure.entities.push(adventure_enemy_from_definition(get_next_entity_id(), enemy));

                save_adventures_to_file();
            }

            break;
        }

        case Editor_Action_Type.delete_entity: {
            // TODO try to inline this gnarly method
            const result = find_enemy_and_associated_definition_indices(adventure, action.entity_id);
            if (!result) return;

            const [enemy_index, definition_index, room] = result;

            room.enemies.splice(definition_index, 1);
            adventure.entities.splice(enemy_index, 1);
            break;
        }

        case Editor_Action_Type.edit_enemy: {
            const enemy = adventure.entities.find(entity => entity.id == action.entity_id);
            if (!enemy) return;
            if (enemy.type != Adventure_Entity_Type.enemy) return;

            enemy.definition.type = action.npc_type;
            enemy.definition.spawn_position = action.new_position;
            enemy.definition.spawn_facing = action.new_facing;

            break;
        }

        default: unreachable(action);
    }

    save_adventures_to_file();
}