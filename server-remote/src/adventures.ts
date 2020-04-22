import {readFileSync, writeFileSync, mkdirSync, existsSync} from "fs";
import {try_string_to_enum_value, unreachable} from "./common";
import {Entry_With_Weight, Random} from "./random";

const storage_dir_path = "src/adventures";

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
    name: string
    entrance_location: XY
    entrance_facing: XY
    entities: Adventure_Entity_Definition[]
    environment: Environment
    camera_restriction_zones: Camera_Restriction_Zone[]
    exits: Adventure_Room_Exit[]
}

type File_Entity_Base = {
    position: [number, number]
    facing: [number, number]
}

type Adventure_File = {
    rooms: number[]
}

type Room_File = {
    id: number
    name: string
    type: string
    entrance: [number, number]
    entrance_facing: [number, number]
    environment: string
    enemies?: Array<File_Entity_Base & {
        type: string
        creeps: string[]
        battleground: number
    }>
    items?: Array<File_Entity_Base & {
        item_id: string
    }>
    gold_bags?: Array<File_Entity_Base & {
        amount: number
    }>
    merchants?: Array<File_Entity_Base & {
        model: string
        heroes: string[]
        creeps: string[]
        spells: string[]
        items: string[]
    }>
    other_entities?: Array<File_Entity_Base & {
        type: string
    }>
    camera_restriction_zones?: Array<{
        points: [number, number][]
    }>
    exits?: Array<{
        at: [number, number]
        to: number
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
    item: Adventure_Item
} | {
    type: Party_Event_Type.add_currency
    amount: number
}

type Purchase_Search_Result = {
    merchant: Adventure_Merchant
    found: Available_Purchase
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
    next_party_entity_id: () => Adventure_Party_Entity_Id
    random: Random
}

type Adventure_Entity_With_Definition = Adventure_Entity & {
    definition: Adventure_Entity_Definition
}

const adventures: Adventure[] = [];

let entity_id_auto_increment = 0;

function get_next_entity_id(): Adventure_World_Entity_Id {
    return entity_id_auto_increment++ as Adventure_World_Entity_Id;
}

function create_adventure_entity_from_definition(ongoing: Ongoing_Adventure, definition: Adventure_Entity_Definition): Adventure_Entity_With_Definition {
    const id = get_next_entity_id();

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

        case Adventure_Entity_Type.item_on_the_ground: {
            const base = {
                spawn_position: definition.spawn_position,
                spawn_facing: definition.spawn_facing,
                definition: definition,
                id: id,
                alive: true
            };

            return {
                ...base,
                type: definition.type,
                item: adventure_item_id_to_item(ongoing, definition.item)
            };
        }

        case Adventure_Entity_Type.gold_bag: return {
            ...definition,
            definition: definition,
            type: definition.type,
            id: id,
            alive: true
        };

        case Adventure_Entity_Type.merchant: {
            return {
                ...definition,
                definition: definition,
                type: definition.type,
                id: id,
                stock: populate_merchant_stock(ongoing, definition.stock)
            };
        }
    }
}

function populate_merchant_stock(ongoing: Ongoing_Adventure, definition: Adventure_Merchant_Stock_Definition): Adventure_Merchant_Stock {
    function hero_card(hero: Hero_Type, cost: number): Adventure_Merchant_Card {
        return {
            type: Adventure_Merchant_Card_Type.hero,
            entity_id: ongoing.next_party_entity_id(),
            hero: hero,
            sold_out: false,
            cost: cost
        };
    }

    function spell_card(spell: Spell_Id, cost: number): Adventure_Merchant_Card {
        return {
            type: Adventure_Merchant_Card_Type.spell,
            entity_id: ongoing.next_party_entity_id(),
            spell: spell,
            sold_out: false,
            cost: cost
        };
    }

    function creep_card(creep: Creep_Type, cost: number): Adventure_Merchant_Card {
        return {
            type: Adventure_Merchant_Card_Type.creep,
            entity_id: ongoing.next_party_entity_id(),
            creep: creep,
            sold_out: false,
            cost: cost
        };
    }

    const item_entries = definition.items.map(id => {
        return {
            data: adventure_item_id_to_item(ongoing, id),
            entity_id: ongoing.next_party_entity_id(),
            cost: item_cost(id),
            sold_out: false
        }
    });

    const card_entries: Entry_With_Weight<Adventure_Merchant_Card>[] = [
        ...definition.heroes.map(hero => hero_card(hero, merchant_hero_cost(hero))),
        ...definition.creeps.map(creep => creep_card(creep, merchant_creep_cost(creep))),
        ...definition.spells.map(spell => spell_card(spell, merchant_spell_cost(spell)))
    ].map(card => {
        function card_weight() {
            switch (card.type) {
                case Adventure_Merchant_Card_Type.spell: return 3;
                case Adventure_Merchant_Card_Type.creep: return 2;
                case Adventure_Merchant_Card_Type.hero: return 1;
            }
        }

        return {
            element: card,
            weight: card_weight()
        }
    });

    const cards = ongoing.random.pick_n_weighted_mutable(card_entries, 3);
    const items = ongoing.random.pick_n_mutable(item_entries, 4);

    return {
        cards, items
    }
}

function item_cost(id: Adventure_Item_Id): number {
    switch (id) {
        case Adventure_Item_Id.boots_of_travel: return 10;
        case Adventure_Item_Id.assault_cuirass: return 10;
        case Adventure_Item_Id.divine_rapier: return 10;
        case Adventure_Item_Id.mask_of_madness: return 10;
        case Adventure_Item_Id.boots_of_speed: return 10;
        case Adventure_Item_Id.blades_of_attack: return 10;
        case Adventure_Item_Id.belt_of_strength: return 10;
        case Adventure_Item_Id.chainmail: return 10;
        case Adventure_Item_Id.basher: return 10;
        case Adventure_Item_Id.iron_branch: return 10;
        case Adventure_Item_Id.ring_of_regen: return 10;
        case Adventure_Item_Id.mystic_staff: return 10;
        case Adventure_Item_Id.ring_of_tarrasque: return 10;
        case Adventure_Item_Id.heart_of_tarrasque: return 10;
        case Adventure_Item_Id.tome_of_aghanim: return 10;
        case Adventure_Item_Id.spider_legs: return 10;

        case Adventure_Item_Id.healing_salve: return 5;
        case Adventure_Item_Id.enchanted_mango: return 5;
        case Adventure_Item_Id.tome_of_knowledge: return 5;
        case Adventure_Item_Id.tome_of_strength: return 5;
        case Adventure_Item_Id.tome_of_agility: return 5;

    }
}

function merchant_hero_cost(type: Hero_Type) {
    return 40;
}

function merchant_spell_cost(id: Spell_Id) {
    return 20;
}

function merchant_creep_cost(type: Creep_Type) {
    return 10;
}

export function adventure_by_id(adventure_id: Adventure_Id): Adventure | undefined {
    return adventures.find(adventure => adventure.id == adventure_id);
}

export function room_by_id(adventure: Adventure, room_id: Adventure_Room_Id): Adventure_Room | undefined {
    return adventure.rooms.find(room => room.id == room_id);
}

export function create_room_entities(ongoing: Ongoing_Adventure, room: Adventure_Room): Adventure_Entity_With_Definition[] {
    return room.entities.map(enemy => create_adventure_entity_from_definition(ongoing, enemy));
}

export function load_all_adventures(): boolean {
    const adventures_enum = enum_names_to_values<Adventure_Id>();
    const new_adventures: Adventure[] = [];

    for (const [name, id] of adventures_enum) {
        console.log(`Loading adventure: '${name}'`);

        const directory = `${storage_dir_path}/${name}`;

        if (!existsSync(directory)) {
            console.error(`Adventure folder ${directory} not found`);
            return false;
        }

        const main_file = `${directory}/adventure.json`;

        if (!existsSync(main_file)) {
            console.error(`Main adventure file ${main_file} not found`);
            return false;
        }

        const contents = JSON.parse(readFileSync(main_file, "utf8")) as Adventure_File;
        const rooms: Adventure_Room[] = [];

        for (const room_id of contents.rooms) {
            const room_path = `${directory}/room_${room_id}.json`;
            if (!existsSync(room_path)) {
                console.error(`Room file ${room_path} not found`);
                return false;
            }

            const room_file = JSON.parse(readFileSync(room_path, "utf8")) as Room_File;
            const room = adventure_room_from_file(room_file, room_path);

            if (!room) {
                console.error(`Failed to load room ${room_id}`);
                return false;
            }

            rooms.push(room);

            console.log(`Loaded room '${room.name}'`);
        }

        for (const room of rooms) {
            for (const exit of room.exits) {
                if (!rooms.some(queried => queried.id == exit.to)) {
                    console.error(`Exit from ${room.name} to #${exit.to} not found`);
                    return false;
                }
            }
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

function adventure_room_from_file(source_room: Room_File, file_path: string) {
    const creeps_enum = enum_names_to_values<Creep_Type>();
    const items_enum = enum_names_to_values<Adventure_Item_Id>();
    const entities_enum = enum_names_to_values<Adventure_Entity_Type>();

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

    const room_type = try_string_to_enum_value(source_room.type, enum_names_to_values<Adventure_Room_Type>());
    if (room_type == undefined) {
        console.error(`Room type ${source_room.type} not found while parsing ${file_path}`);
        return;
    }

    const environment = try_string_to_enum_value(source_room.environment, enum_names_to_values<Environment>());
    if (environment == undefined) {
        console.error(`Environment type ${source_room.environment} not found while parsing ${file_path}`);
        return;
    }

    const entrance = {
        x: source_room.entrance[0],
        y: source_room.entrance[1]
    };

    const entrance_facing = {
        x: source_room.entrance_facing[0],
        y: source_room.entrance_facing[1]
    };

    const entities: Adventure_Entity_Definition[] = [];

    for (const source_enemy of source_room.enemies || []) {
        const npc_type = try_string_to_enum_value(source_enemy.type, creeps_enum);

        if (npc_type == undefined) {
            console.error(`Creep type ${source_enemy.type} not found while parsing ${file_path}`);
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
            world_model: npc_type,
            battleground: source_enemy.battleground as Battleground_Id,
            creeps: creeps
        })
    }

    for (const source_entity of source_room.items || []) {
        const item = try_string_to_enum_value(source_entity.item_id, items_enum);

        if (!item) {
            console.error(`Item type ${item_source} not found while parsing ${file_path}`);
            return;
        }

        entities.push({
            ...read_base(source_entity),
            type: Adventure_Entity_Type.item_on_the_ground,
            item: item
        });
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

        const spells: Spell_Id[] = [];
        const creeps: Creep_Type[] = [];
        const heroes: Hero_Type[] = [];
        const items: Adventure_Item_Id[] = [];

        for (const spell_string of source.spells) {
            const spell_id = try_string_to_enum_value(spell_string, enum_names_to_values<Spell_Id>());

            if (spell_id == undefined) {
                console.error(`Spell id ${spell_id} not found while parsing ${file_path}`);
                return;
            }

            spells.push(spell_id);
        }

        for (const hero_string of source.heroes) {
            const hero_type = try_string_to_enum_value(hero_string, enum_names_to_values<Hero_Type>());

            if (hero_type == undefined) {
                console.error(`Hero type ${hero_type} not found while parsing ${file_path}`);
                return;
            }

            heroes.push(hero_type);
        }

        for (const creep_string of source.creeps) {
            const creep_type = try_string_to_enum_value(creep_string, creeps_enum);

            if (creep_type == undefined) {
                console.error(`Creep type ${creep_type} not found while parsing ${file_path}`);
                return;
            }

            creeps.push(creep_type);
        }

        for (const item_source of source.items) {
            const item = try_string_to_enum_value(item_source, items_enum);

            if (!item) {
                console.error(`Item type ${item_source} not found while parsing ${file_path}`);
                return;
            }

            items.push(item);
        }

        entities.push({
            ...read_base(source),
            type: Adventure_Entity_Type.merchant,
            model: model,
            stock: {
                items,
                creeps,
                heroes,
                spells,
            }
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

    const zones: Camera_Restriction_Zone[] = [];
    for (const source_zone of source_room.camera_restriction_zones || []) {
        zones.push({
            points: source_zone.points.map(p => xy(...p))
        })
    }

    const exits: Adventure_Room_Exit[] = [];
    for (const exit of source_room.exits || []) {
        exits.push({
            at: xy(...exit.at),
            to: exit.to as Adventure_Room_Id
        })
    }

    return {
        id: source_room.id as Adventure_Room_Id,
        name: source_room.name,
        type: room_type,
        environment: environment,
        entrance_location: entrance,
        entrance_facing: entrance_facing,
        entities: entities,
        camera_restriction_zones: zones,
        exits: exits
    };
}

function persist_adventure_to_file_system(adventure: Adventure) {
    function non_empty_or_none<T>(source: T[]): T[] | undefined {
        return source.length == 0 ? undefined : source;
    }

    const folder_path = `${storage_dir_path}/${enum_to_string(adventure.id)}`;

    if (!existsSync(folder_path)) {
        mkdirSync(folder_path);
    }

    const main_file = `${folder_path}/adventure.json`;
    const adventure_file: Adventure_File = {
        rooms: adventure.rooms.map(room => room.id)
    };

    writeFileSync(main_file, JSON.stringify(adventure_file, (key, value) => value, "    "));

    for (const room of adventure.rooms) {
        const file = room_to_file(room);
        const file_path = `${folder_path}/room_${room.id}.json`;

        writeFileSync(file_path, JSON.stringify(file, (key, value) => value, "    "));

        console.log(`Saving ${file_path}`);
    }

    function room_to_file(room: Adventure_Room) {
        const enemies: Room_File["enemies"] = [];
        const other_entities: Room_File["other_entities"] = [];
        const gold_bags: Room_File["gold_bags"] = [];
        const items: Room_File["items"] = [];
        const merchants: Room_File["merchants"] = [];
        const camera_restriction_zones: Room_File["camera_restriction_zones"] = [];
        const exits: Room_File["exits"] = [];

        for (const entity of room.entities) {
            const base: File_Entity_Base = {
                position: [entity.spawn_position.x, entity.spawn_position.y],
                facing: [entity.spawn_facing.x, entity.spawn_facing.y],
            };

            switch (entity.type) {
                case Adventure_Entity_Type.enemy: {
                    enemies.push({
                        ...base,
                        type: enum_to_string(entity.world_model),
                        creeps: entity.creeps.map(type => enum_to_string<Creep_Type>(type)),
                        battleground: entity.battleground
                    });

                    break;
                }

                case Adventure_Entity_Type.item_on_the_ground: {
                    items.push({
                        ...base,
                        item_id: enum_to_string(entity.item)
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
                    const merchant_items: string[] = [];

                    for (const item of entity.stock.items) {
                        merchant_items.push(enum_to_string(item));
                    }

                    merchants.push({
                        ...base,
                        model: enum_to_string(entity.model),
                        items: merchant_items,
                        creeps: entity.stock.creeps.map(creep => enum_to_string(creep)),
                        heroes: entity.stock.heroes.map(hero => enum_to_string(hero)),
                        spells: entity.stock.spells.map(spell => enum_to_string(spell))
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

        for (const zone of room.camera_restriction_zones) {
            camera_restriction_zones.push({
                points: zone.points.map(p => [p.x, p.y])
            });
        }

        for (const exit of room.exits) {
            exits.push({
                to: exit.to,
                at: [exit.at.x, exit.at.y]
            });
        }

        return {
            id: room.id,
            name: room.name,
            type: enum_to_string(room.type),
            environment: enum_to_string(room.environment),
            entrance: [room.entrance_location.x, room.entrance_location.y],
            entrance_facing: [room.entrance_facing.x, room.entrance_facing.y],
            enemies: non_empty_or_none(enemies),
            items: non_empty_or_none(items),
            gold_bags: non_empty_or_none(gold_bags),
            merchants: non_empty_or_none(merchants),
            other_entities: non_empty_or_none(other_entities),
            camera_restriction_zones: non_empty_or_none(camera_restriction_zones),
            exits: non_empty_or_none(exits)
        };
    }
}

export function find_available_purchase_by_id(adventure: Ongoing_Adventure, merchant_id: Adventure_World_Entity_Id, purchase_id: Adventure_Party_Entity_Id): Purchase_Search_Result | undefined {
    const merchant = adventure.entities.find(entity => entity.id == merchant_id);
    if (!merchant) return;
    if (merchant.type != Adventure_Entity_Type.merchant) return;

    const available = find_available_purchase_in_merchant(merchant, purchase_id);
    if (!available) return;

    return {
        merchant: merchant,
        found: available
    }
}

export function mark_available_purchase_as_sold_out(merchant: Adventure_Merchant, purchase_id: Adventure_Party_Entity_Id) {
    const available = find_available_purchase_in_merchant(merchant, purchase_id);
    if (!available) return;

    switch (available.type) {
        case Purchase_Type.item: {
            available.item.sold_out = true;
            break;
        }

        case Purchase_Type.card: {
            available.card.sold_out = true;
            break;
        }
    }
}

export function interact_with_entity(adventure: Ongoing_Adventure, entity_id: Adventure_World_Entity_Id): Entity_Interaction_Result | undefined {
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
    const new_entity = create_adventure_entity_from_definition(ongoing, definition);

    ongoing.current_room.entities.push(definition);
    ongoing.entities.push(new_entity);

    persist_adventure_to_file_system(ongoing.adventure);

    return new_entity;
}

export function apply_editor_action(ongoing: Ongoing_Adventure, action: Adventure_Editor_Action) {
    switch (action.type) {
        case Adventure_Editor_Action_Type.set_room_details: {
            const current_room = ongoing.current_room;

            current_room.entrance_facing = action.entrance_facing;
            current_room.type = action.room_type;
            current_room.environment = action.environment;
            current_room.name = action.name;
            current_room.entrance_location = action.entrance;
            current_room.camera_restriction_zones = action.zones;
            current_room.exits = action.exits;

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

        case Adventure_Editor_Action_Type.set_merchant_stock: {
            const merchant = ongoing.entities.find(entity => entity.id == action.entity_id);
            if (!merchant) return;
            if (merchant.type != Adventure_Entity_Type.merchant) return;
            if (merchant.definition.type != Adventure_Entity_Type.merchant) return;

            merchant.definition.stock = action.stock;

            break;
        }

        case Adventure_Editor_Action_Type.reroll_merchant_stock: {
            const merchant = ongoing.entities.find(entity => entity.id == action.entity_id);
            if (!merchant) return;
            if (merchant.type != Adventure_Entity_Type.merchant) return;
            if (merchant.definition.type != Adventure_Entity_Type.merchant) return;

            merchant.stock = populate_merchant_stock(ongoing, merchant.definition.stock);

            break;
        }

        default: unreachable(action);
    }

    persist_adventure_to_file_system(ongoing.adventure);
}

export function adventure_item_id_to_item(ongoing: Ongoing_Adventure, item_id: Adventure_Item_Id): Adventure_Item {
    const item_entity_id = ongoing.next_party_entity_id();
    
    const equipment = {
        type: Adventure_Item_Type.equipment,
        entity_id: item_entity_id
    } as const;

    const consumable = {
        type: Adventure_Item_Type.consumable,
        entity_id: item_entity_id
    } as const;

    function in_combat_effect(modifier: Modifier): Adventure_Item_Effect {
        return {
            type: Adventure_Item_Effect_Type.in_combat,
            modifier: modifier
        };
    }

    switch (item_id) {
        case Adventure_Item_Id.boots_of_travel: return {
            ...equipment,
            item_id: item_id,
            effects: [in_combat_effect({
                id: Modifier_Id.move_speed,
                bonus: 3
            })]
        };

        case Adventure_Item_Id.assault_cuirass: return {
            ...equipment,
            item_id: item_id,
            effects: [in_combat_effect({
                id: Modifier_Id.armor,
                bonus: 4
            })]
        };

        case Adventure_Item_Id.divine_rapier: return {
            ...equipment,
            item_id: item_id,
            effects: [in_combat_effect({
                id: Modifier_Id.attack_damage,
                bonus: 8
            })]
        };

        case Adventure_Item_Id.mask_of_madness: return {
            ...equipment,
            item_id: item_id,
            effects: [in_combat_effect({
                id: Modifier_Id.item_mask_of_madness,
                attack: 4
            })]
        };

        case Adventure_Item_Id.boots_of_speed: return {
            ...equipment,
            item_id: item_id,
            effects: [in_combat_effect({
                id: Modifier_Id.move_speed,
                bonus: 1
            })]
        };

        case Adventure_Item_Id.blades_of_attack: return {
            ...equipment,
            item_id: item_id,
            effects: [in_combat_effect({
                id: Modifier_Id.attack_damage,
                bonus: 2
            })]
        };

        case Adventure_Item_Id.belt_of_strength: return {
            ...equipment,
            item_id: item_id,
            effects: [in_combat_effect({
                id: Modifier_Id.health,
                bonus: 4
            })]
        };

        case Adventure_Item_Id.chainmail: return {
            ...equipment,
            item_id: item_id,
            effects: [in_combat_effect({
                id: Modifier_Id.armor,
                bonus: 1
            })]
        };

        case Adventure_Item_Id.basher: return {
            ...equipment,
            item_id: item_id,
            effects: [in_combat_effect({
                id: Modifier_Id.item_basher
            })]
        };

        case Adventure_Item_Id.iron_branch: return {
            ...equipment,
            item_id: item_id,
            effects: [in_combat_effect({
                id: Modifier_Id.item_iron_branch,
                armor_bonus: 1,
                attack_bonus: 1,
                health_bonus: 1,
                moves_bonus: 1
            })]
        };

        case Adventure_Item_Id.mystic_staff: return {
            ...equipment,
            item_id: item_id,
            effects: [{
                type: Adventure_Item_Effect_Type.combat_start,
                effect_id: Adventure_Combat_Start_Effect_Id.add_ability_charges,
                for_abilities_with_level_less_or_equal: 3,
                how_many: 1
            }]
        };

        case Adventure_Item_Id.ring_of_regen: return {
            ...equipment,
            item_id: item_id,
            effects: [{
                type: Adventure_Item_Effect_Type.post_combat,
                effect_id: Adventure_Post_Combat_Effect_Id.restore_health,
                how_much: 1
            }]
        };

        case Adventure_Item_Id.ring_of_tarrasque: return {
            ...equipment,
            item_id: item_id,
            effects: [
                {
                    type: Adventure_Item_Effect_Type.post_combat,
                    effect_id: Adventure_Post_Combat_Effect_Id.restore_health,
                    how_much: 3
                },
                in_combat_effect({
                    id: Modifier_Id.health,
                    bonus: 2
                })
            ]
        };

        case Adventure_Item_Id.heart_of_tarrasque: return {
            ...equipment,
            item_id: item_id,
            effects: [
                {
                    type: Adventure_Item_Effect_Type.post_combat,
                    effect_id: Adventure_Post_Combat_Effect_Id.restore_health,
                    how_much: 5
                },
                in_combat_effect({
                    id: Modifier_Id.health,
                    bonus: 5
                })
            ]
        };

        case Adventure_Item_Id.tome_of_aghanim: return {
            ...equipment,
            item_id: item_id,
            effects: [{
                type: Adventure_Item_Effect_Type.combat_start,
                effect_id: Adventure_Combat_Start_Effect_Id.level_up,
                how_many_levels: 1
            }]
        };

        case Adventure_Item_Id.spider_legs: return {
            ...equipment,
            item_id: item_id,
            effects: [{
                type: Adventure_Item_Effect_Type.in_combat,
                modifier: {
                    id: Modifier_Id.item_spider_legs,
                    move_bonus: 3
                }
            }]
        };

        case Adventure_Item_Id.enchanted_mango: return {
            ...consumable,
            item_id: item_id,
            action: {
                type: Adventure_Consumable_Action_Type.add_effect,
                permanent: false,
                effect: {
                    type: Adventure_Item_Effect_Type.combat_start,
                    effect_id: Adventure_Combat_Start_Effect_Id.add_ability_charges,
                    for_abilities_with_level_less_or_equal: 1,
                    how_many: 1
                }
            }
        };

        case Adventure_Item_Id.tome_of_knowledge: return {
            ...consumable,
            item_id: item_id,
            action: {
                type: Adventure_Consumable_Action_Type.add_effect,
                permanent: false,
                effect: {
                    type: Adventure_Item_Effect_Type.combat_start,
                    effect_id: Adventure_Combat_Start_Effect_Id.level_up,
                    how_many_levels: 1
                }
            }
        };

        case Adventure_Item_Id.healing_salve: return {
            ...consumable,
            item_id: item_id,
            action: {
                type: Adventure_Consumable_Action_Type.restore_health,
                how_much: 5,
                reason: Adventure_Health_Change_Reason.healing_salve
            }
        };

        case Adventure_Item_Id.tome_of_strength: return {
            ...consumable,
            item_id: item_id,
            action: {
                type: Adventure_Consumable_Action_Type.add_effect,
                permanent: true,
                effect: {
                    type: Adventure_Item_Effect_Type.in_combat,
                    modifier: {
                        id: Modifier_Id.health,
                        bonus: 2
                    }
                }
            }
        };

        case Adventure_Item_Id.tome_of_agility: return {
            ...consumable,
            item_id: item_id,
            action: {
                type: Adventure_Consumable_Action_Type.add_effect,
                permanent: true,
                effect: {
                    type: Adventure_Item_Effect_Type.in_combat,
                    modifier: {
                        id: Modifier_Id.attack_damage,
                        bonus: 1
                    }
                }
            }
        };
    }
}
