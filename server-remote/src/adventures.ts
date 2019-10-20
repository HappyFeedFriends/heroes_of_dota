import {Map_Npc} from "./npc_controller";
import {readFileSync, writeFileSync} from "fs";

const storage_file_path = "src/adventures.json";

let npc_id_auto_increment = 0;

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
    enemies: Adventure_Enemy[]
}

type Adventure_Room_Rest = Adventure_Room_Base & {
    type: Adventure_Room_Type.rest
}

type Adventure_Enemy = {
    type: Npc_Type
    spawn_position: XY
    facing: XY
}

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
    neutrals: Map_Npc[]
}

const adventures: Adventure[] = [];

function get_next_npc_id(): Npc_Id {
    return npc_id_auto_increment++ as Npc_Id;
}

function combat_room(id: number, entrance: XY, enemies: Adventure_Enemy[]): Adventure_Room {
    return {
        id: id as Adventure_Room_Id,
        type: Adventure_Room_Type.combat,
        entrance_location: entrance,
        enemies: enemies
    }
}

function adventure_enemy_to_npc(id: Npc_Id, enemy: Adventure_Enemy): Map_Npc {
    return {
        entity_type: Map_Entity_Type.npc,
        id: id,
        type: enemy.type,
        current_location: enemy.spawn_position,
        spawn_facing: enemy.facing,
        movement_history: []
    }
}

export function adventure_by_id(adventure_id: Adventure_Id): Adventure | undefined {
    return adventures.find(adventure => adventure.id == adventure_id);
}

export function room_by_id(adventure: Adventure, room_id: Adventure_Room_Id): Adventure_Room | undefined {
    return adventure.rooms.find(room => room.id == room_id);
}

export function create_room_neutrals(room: Adventure_Room_Combat): Map_Npc[] {
    return room.enemies.map(enemy => adventure_enemy_to_npc(get_next_npc_id(), enemy));
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

            const enemies: Adventure_Enemy[] = [];

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
                    facing: {
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
                            facing: [enemy.facing.x, enemy.facing.y]
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

export function edit_npc(adventure: Ongoing_Adventure, id: Npc_Id, enemy: Adventure_Enemy) {
    const npc_index = adventure.neutrals.findIndex(npc => npc.id == id);
    if (npc_index == -1) return;

    const npc = adventure.neutrals[npc_index];

    if (adventure.current_room.type == Adventure_Room_Type.combat) {
        // Weird and brittle, but works for now for Map_Npc <-> Adventure_Enemy association
        const enemy_index = adventure.current_room.enemies.findIndex(e => e.spawn_position.x == npc.current_location.x && e.spawn_position.y == npc.current_location.y);

        if (enemy_index != -1) {
            adventure.current_room.enemies[enemy_index] = enemy;
            adventure.neutrals[npc_index] = adventure_enemy_to_npc(id, enemy);
        }
    }

    save_adventures_to_file();

}