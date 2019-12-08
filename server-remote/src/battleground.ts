import {readdirSync, readFileSync, writeFileSync, unlinkSync} from "fs";
import {try_string_to_enum_value} from "./server";

type Persistent_Battleground =  Battleground & {
    id: Battleground_Id
}

type Battleground_File = {
    world_origin: {
        x: number
        y: number
        z: number
    }

    grid_size: {
        x: number
        y: number
    }

    deployment_zones: Array<{
        min_x: number
        min_y: number
        max_x: number
        max_y: number
        face_x: number
        face_y: number
    }>

    monsters: Array<{
        x: number
        y: number
        face_x: number
        face_y: number
    }>

    runes: Array<{
        x: number
        y: number
    }>

    trees: Array<{
        x: number
        y: number
    }>

    shops: Array<{
        type: string
        x: number
        y: number
        face_x: number
        face_y: number
        items: string[]
    }>
}

const storage_dir_path = "src/battlegrounds";
const battlegrounds: Persistent_Battleground[] = [];

let id_auto_increment = 0;

export function find_battleground_by_id(id: Battleground_Id) {
    return battlegrounds.find(bg => bg.id == id);
}

export function delete_battleground_by_id(id: Battleground_Id) {
    const index = battlegrounds.findIndex(bg => bg.id == id);

    if (index != -1) {
        unlinkSync(`${storage_dir_path}/${id.toString(10)}.json`);

        battlegrounds.splice(index, 1);
    }
}

export function duplicate_battleground(battleground: Persistent_Battleground): Battleground_Id {
    const file_object = battleground_to_file_object(battleground);
    const copy = load_battleground_from_file("dummy", file_object)!;
    const new_id = fetch_new_battleground_id();

    battlegrounds.push({
        id: new_id,
        ...copy
    });

    persist_battleground_to_file_system(new_id, copy);

    return new_id;
}

export function get_all_battlegrounds() {
    return battlegrounds;
}

export function make_new_battleground(world_origin: World_Origin): Persistent_Battleground {
    const id = fetch_new_battleground_id();
    const bg = {
        id: id,
        world_origin: world_origin,
        grid_size: { x: 10, y: 10 },
        deployment_zones: [],
        spawns: []
    };

    battlegrounds.push(bg);

    persist_battleground_to_file_system(id, bg);

    return bg;
}

export function save_battleground(id: Battleground_Id, battleground: Battleground) {
    const persistent = find_battleground_by_id(id);

    if (persistent) {
        Object.assign(persistent, battleground);

        persist_battleground_to_file_system(id, battleground);
    }
}

function fetch_new_battleground_id(): Battleground_Id {
    const new_id = id_auto_increment;

    id_auto_increment++;

    writeFileSync(`${storage_dir_path}/id`, id_auto_increment.toString(10));

    return new_id as Battleground_Id;
}

export function load_all_battlegrounds(): boolean {
    const id = parseInt(readFileSync(`${storage_dir_path}/id`, "utf8"));
    const files = readdirSync(storage_dir_path);
    const new_battlegrounds: Persistent_Battleground[] = [];

    for (const full_name of files) {
        if (full_name == "id") continue;

        if (!full_name.endsWith(".json")) {
            console.error(`Garbage file '${full_name}' in ${storage_dir_path}`);
            return false;
        }

        const just_name = full_name.substring(0, full_name.lastIndexOf("."));

        if (!just_name.match(/\d+/)) {
            console.error(`Invalid battleground id: '${just_name}' in ${storage_dir_path}`);
            return false;
        }

        const id = parseInt(just_name);

        console.log(`Loading battleground #${id}`);

        const full_path = `${storage_dir_path}/${full_name}`;
        const file = JSON.parse(readFileSync(full_path, "utf8")) as Battleground_File;
        const battleground = load_battleground_from_file(full_path, file);

        if (!battleground) {
            console.error(`Error while loading battleground from '${full_path}'`);
            return false;
        }

        new_battlegrounds.push({
            id: id as Battleground_Id,
            ...battleground
        })
    }

    battlegrounds.length = 0;
    battlegrounds.push(...new_battlegrounds);

    id_auto_increment = id;

    return true;
}

function battleground_to_file_object(battleground: Battleground) {
    const file: Battleground_File = {
        world_origin: copy<Battleground_File["world_origin"]>(battleground.world_origin),
        grid_size: copy<Battleground_File["grid_size"]>(battleground.grid_size),
        deployment_zones: battleground.deployment_zones.map(zone => copy<Battleground_File["deployment_zones"][0]>(zone)),
        trees: [],
        shops: [],
        runes: [],
        monsters: []
    };

    for (const spawn of battleground.spawns) {
        switch (spawn.type) {
            case Spawn_Type.monster: {
                file.monsters.push({
                    x: spawn.at.x,
                    y: spawn.at.y,
                    face_x: spawn.facing.x,
                    face_y: spawn.facing.y
                });

                break;
            }

            case Spawn_Type.rune: {
                file.runes.push({
                    x: spawn.at.x,
                    y: spawn.at.y
                });

                break;
            }

            case Spawn_Type.shop: {
                file.shops.push({
                    x: spawn.at.x,
                    y: spawn.at.y,
                    face_x: spawn.facing.x,
                    face_y: spawn.facing.y,
                    type: enum_to_string(spawn.shop_type),
                    items: spawn.item_pool.map(item => enum_to_string(item))
                });

                break;
            }

            case Spawn_Type.tree: {
                file.trees.push({
                    x: spawn.at.x,
                    y: spawn.at.y
                });

                break;
            }

            default: unreachable(spawn);
        }
    }

    return file;
}

function persist_battleground_to_file_system(id: Battleground_Id, battleground: Battleground) {
    const file = battleground_to_file_object(battleground);
    const path = `${storage_dir_path}/${id.toString(10)}.json`;

    console.log(`Saving ${path}`);

    writeFileSync(path, JSON.stringify(file, (key, value) => value, "    "));
}

function load_battleground_from_file(file_path: string, battleground: Battleground_File): Battleground | undefined {
    const spawns: Battleground_Spawn[] = [];
    const shop_types = enum_names_to_values<Shop_Type>();
    const item_ids = enum_names_to_values<Item_Id>();

    for (const monster of battleground.monsters) {
        spawns.push({
            type: Spawn_Type.monster,
            at: {
                x: monster.x,
                y: monster.y
            },
            facing: {
                x: monster.face_x,
                y: monster.face_y
            }
        })
    }

    for (const rune of battleground.runes) {
        spawns.push({
            type: Spawn_Type.rune,
            at: {
                x: rune.x,
                y: rune.y
            }
        })
    }

    for (const tree of battleground.trees) {
        spawns.push({
            type: Spawn_Type.tree,
            at: {
                x: tree.x,
                y: tree.y
            }
        })
    }

    for (const shop of battleground.shops) {
        const items: Item_Id[] = [];

        for (const item of shop.items) {
            const item_id = try_string_to_enum_value(item, item_ids);

            if (item_id == undefined) {
                console.error(`Item ID '${item}' not found while parsing ${file_path}`);
                return;
            }

            items.push(item_id);
        }

        const shop_type = try_string_to_enum_value(shop.type, shop_types);

        if (shop_type == undefined) {
            console.error(`Shop type '${shop.type}' not found while parsing ${file_path}`);
            return;
        }

        spawns.push({
            type: Spawn_Type.shop,
            shop_type: shop_type,
            item_pool: items,
            at: {
                x: shop.x,
                y: shop.y
            },
            facing: {
                x: shop.face_x,
                y: shop.face_y
            }
        })
    }

    return {
        world_origin: battleground.world_origin,
        grid_size: battleground.grid_size,
        deployment_zones: battleground.deployment_zones,
        spawns: spawns
    }
}