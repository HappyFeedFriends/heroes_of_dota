import {readFileSync, writeFileSync, readdirSync} from "fs";
import {try_string_to_enum_value, unreachable} from "./common";

const storage_dir_path = "src/adventures";

export const enum Adventure_Room_Type {
    combat = 0,
    rest = 1
}

export const enum Party_Event_Type {
    add_creep,
    add_spell,
    activate_shrine,
    add_item,
    add_currency
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

type File_Entity_Base = {
    position: [number, number]
    facing: [number, number]
}

type Adventure_File = {
    rooms: Array<{
        id: number
        entrance: [number, number]
        enemies?: Array<File_Entity_Base & {
            type: string
            creeps: string[]
            battleground: number
        }>
        items?: Array<File_Entity_Base & {
            type: string
            item_id: string
        }>
        gold_bags?: Array<File_Entity_Base & {
            amount: number
        }>
        merchants?: Array<File_Entity_Base & {
            model: string
        }>
        other_entities?: Array<File_Entity_Base & {
            type: string
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
} | {
    type: Party_Event_Type.add_currency
    amount: number
}

type Entity_Interaction_Result = {
    party_events: Party_Event[]
    updated_entity: Adventure_Entity
}

export type Ongoing_Adventure = {
    id: Ongoing_Adventure_Id
    adventure: Adventure
    current_room: Adventure_Room
    entities: Adventure_Entity_With_Definition[]
}

type Adventure_Entity_With_Definition = Adventure_Entity & {
    definition: Adventure_Entity_Definition
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

function adventure_entity_from_definition(id: Adventure_Entity_Id, definition: Adventure_Entity_Definition): Adventure_Entity_With_Definition {
    switch (definition.type) {
        case Adventure_Entity_Type.enemy: return {
            ...definition,
            definition: definition,
            type: definition.type,
            id: id,
            alive: true
        };

        case Adventure_Entity_Type.lost_creep: return {
            ...definition,
            definition: definition,
            type: definition.type,
            id: id,
            alive: true
        };

        case Adventure_Entity_Type.shrine: return {
            ...definition,
            definition: definition,
            type: definition.type,
            id: id,
            alive: true
        };

        case Adventure_Entity_Type.item_on_the_ground: return {
            ...definition,
            definition: definition,
            type: definition.type,
            id: id,
            alive: true
        };

        case Adventure_Entity_Type.gold_bag: return {
            ...definition,
            definition: definition,
            type: definition.type,
            id: id,
            alive: true
        };

        case Adventure_Entity_Type.merchant: return {
            ...definition,
            definition: definition,
            type: definition.type,
            id: id,
            assortment: {
                heroes: [ Hero_Type.earthshaker ],
                creeps: [ Creep_Type.lane_creep ],
                spells: [ Spell_Id.town_portal_scroll ],
                consumables: [
                    Adventure_Consumable_Item_Id.tome_of_knowledge,
                    Adventure_Consumable_Item_Id.enchanted_mango,
                    Adventure_Consumable_Item_Id.healing_salve
                ],
                wearables: [
                    Adventure_Wearable_Item_Id.boots_of_speed,
                    Adventure_Wearable_Item_Id.belt_of_strength,
                    Adventure_Wearable_Item_Id.chainmail
                ]
            }
        };
    }
}

export function adventure_by_id(adventure_id: Adventure_Id): Adventure | undefined {
    return adventures.find(adventure => adventure.id == adventure_id);
}

export function room_by_id(adventure: Adventure, room_id: Adventure_Room_Id): Adventure_Room | undefined {
    return adventure.rooms.find(room => room.id == room_id);
}

export function create_room_entities(room: Adventure_Room): Adventure_Entity_With_Definition[] {
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

    function read_base(source: File_Entity_Base) {
        return {
            spawn_position: {
                x: source.position[0],
                y: source.position[1]
            },
            spawn_facing: {
                x: source.facing[0],
                y: source.facing[1]
            }
        };
    }

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
                ...read_base(source_enemy),
                type: Adventure_Entity_Type.enemy,
                npc_type: npc_type,
                battleground: source_enemy.battleground as Battleground_Id,
                creeps: creeps
            })
        }

        for (const source_entity of source_room.items || []) {
            const item_type = try_string_to_enum_value(source_entity.type, enum_names_to_values<Adventure_Item_Type>());

            if (item_type == undefined) {
                console.error(`Item type ${source_entity.type} not found while parsing ${file_path}`);
                return;
            }

            switch (item_type) {
                case Adventure_Item_Type.consumable: {
                    const item_id = try_string_to_enum_value(source_entity.item_id, enum_names_to_values<Adventure_Consumable_Item_Id>());
                    if (item_id == undefined) {
                        console.error(`Item id ${source_entity.item_id} not found while parsing ${file_path}`);
                        return;
                    }

                    entities.push({
                        ...read_base(source_entity),
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
                        ...read_base(source_entity),
                        type: Adventure_Entity_Type.item_on_the_ground,
                        item: { type: item_type, id: item_id }
                    });

                    break;
                }

                default: unreachable(item_type);
            }
        }

        for (const source_bag of source_room.gold_bags || []) {
            entities.push({
                ...read_base(source_bag),
                type: Adventure_Entity_Type.gold_bag,
                amount: source_bag.amount
            });
        }

        for (const source of source_room.merchants || []) {
            const model = try_string_to_enum_value(source.model, enum_names_to_values<Adventure_Merchant_Model>());

            if (model == undefined) {
                console.error(`Model type ${source.model} not found while parsing ${file_path}`);
                return;
            }

            entities.push({
                ...read_base(source),
                type: Adventure_Entity_Type.merchant,
                model: model
            });
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
                    const to_entity = (): Adventure_Entity_Definition => {
                        switch (entity_type) {
                            case Adventure_Entity_Type.lost_creep: return {
                                type: entity_type,
                                ...read_base(source_entity),
                            };

                            case Adventure_Entity_Type.shrine: return {
                                type: entity_type,
                                ...read_base(source_entity),
                            };
                        }
                    };

                    entities.push(to_entity());
                    break;
                }

                default: {
                    console.error(`Unsupported entity type ${source_entity.type} while parsing ${file_path}`);
                    return;
                }
            }
        }

        rooms.push(room(source_room.id, Adventure_Room_Type.combat, entrance, entities));
    }

    return rooms;
}

function persist_adventure_to_file_system(adventure: Adventure) {
    function non_empty_or_none<T>(source: T[]): T[] | undefined {
        return source.length == 0 ? undefined : source;
    }

    const file: Adventure_File = {
        rooms: adventure.rooms.map(room => {
            type File_Room = Adventure_File["rooms"][0];

            const enemies: File_Room["enemies"] = [];
            const other_entities: File_Room["other_entities"] = [];
            const gold_bags: File_Room["gold_bags"] = [];
            const items: File_Room["items"] = [];
            const merchants: File_Room["merchants"] = [];

            for (const entity of room.entities) {
                const base: File_Entity_Base = {
                    position: [entity.spawn_position.x, entity.spawn_position.y],
                    facing: [entity.spawn_facing.x, entity.spawn_facing.y],
                };

                switch (entity.type) {
                    case Adventure_Entity_Type.enemy: {
                        enemies.push({
                            ...base,
                            type: enum_to_string(entity.npc_type),
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
                            ...base,
                            type: enum_to_string(entity.item.type),
                            item_id: item_id()
                        });

                        break;
                    }

                    case Adventure_Entity_Type.gold_bag: {
                        gold_bags.push({
                            ...base,
                            amount: entity.amount
                        });

                        break;
                    }

                    case Adventure_Entity_Type.merchant: {
                        merchants.push({
                            ...base,
                            model: enum_to_string(entity.model)
                        });

                        break;
                    }

                    case Adventure_Entity_Type.lost_creep:
                    case Adventure_Entity_Type.shrine: {
                        other_entities.push({
                            ...base,
                            type: enum_to_string(entity.type)
                        });

                        break;
                    }

                    default: unreachable(entity);
                }
            }

            return {
                id: room.id,
                entrance: [room.entrance_location.x, room.entrance_location.y],
                enemies: non_empty_or_none(enemies),
                items: non_empty_or_none(items),
                gold_bags: non_empty_or_none(gold_bags),
                merchants: non_empty_or_none(merchants),
                other_entities: non_empty_or_none(other_entities)
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
    if (entity.type == Adventure_Entity_Type.merchant) return;
    if (!entity.alive) return;

    const generate_event = (): Party_Event | undefined => {
        switch (entity.type) {
            case Adventure_Entity_Type.lost_creep: return {
                type: Party_Event_Type.add_creep,
                creep: Creep_Type.lane_creep
            };

            case Adventure_Entity_Type.shrine: return {
                type: Party_Event_Type.activate_shrine
            };

            case Adventure_Entity_Type.item_on_the_ground: return {
                type: Party_Event_Type.add_item,
                item: entity.item
            };

            case Adventure_Entity_Type.gold_bag: return {
                type: Party_Event_Type.add_currency,
                amount: entity.amount
            }
        }
    };

    const event = generate_event();

    if (event) {
        entity.alive = false;

        return {
            updated_entity: entity,
            party_events: [ event ]
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
            if (enemy.type != Adventure_Entity_Type.enemy) return;
            if (enemy.definition.type != Adventure_Entity_Type.enemy) return;

            enemy.definition.battleground = action.battleground;

            break;
        }

        case Adventure_Editor_Action_Type.set_item_data: {
            const item = ongoing.entities.find(entity => entity.id == action.entity_id);
            if (!item) return;
            if (item.type != Adventure_Entity_Type.item_on_the_ground) return;
            if (item.definition.type != Adventure_Entity_Type.item_on_the_ground) return;

            item.definition.item = action.item;

            break;
        }

        default: unreachable(action);
    }

    persist_adventure_to_file_system(ongoing.adventure);
}