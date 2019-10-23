import {createServer} from "http";
import {randomBytes} from "crypto"
import {
    Battle_Participant,
    Battle_Record,
    cheat,
    find_battle_by_id,
    get_all_battles,
    get_battle_deltas_after,
    start_battle,
    surrender_player_forces,
    try_take_turn_action
} from "./battle";
import {unreachable, XY, xy} from "./common";
import {pull_pending_chat_messages_for_player, submit_chat_message} from "./chat";
import {performance} from "perf_hooks"
import {readFileSync} from "fs";
import * as battleground from "./battleground";
import {get_debug_ai_data} from "./debug_draw";
import {check_and_try_perform_ai_actions, get_nearby_neutrals, Map_Npc, npc_by_id} from "./npc_controller";
import {
    Adventure_Room_Type,
    Ongoing_Adventure,
    adventure_by_id,
    apply_editor_action,
    create_room_entities,
    reload_adventures_from_file,
    room_by_id, editor_create_entity
} from "./adventures";

eval(readFileSync("dist/battle_sim.js", "utf8"));

const enum Result_Type {
    ok = 0,
    error = 1
}

const enum Right {
    submit_battle_action,
    log_in_with_character,
    attack_a_character,
    participate_in_a_battle,
    submit_movement,
    submit_chat_messages,
    query_battles,
    start_adventure,
    enter_adventure_room
}

export type Map_Player = {
    entity_type: Map_Entity_Type.player
    steam_id: string
    id: Player_Id;
    name: string;
    online: Map_Player_State
    active_logins: number
    deck: Card_Deck
    collection: Card_Collection
}

export type Map_Player_Login = {
    player: Map_Player
    chat_timestamp: number
    token: string
    last_used_at: number
}

type Map_Player_State = {
    state: Player_State.on_global_map
    current_location: XY
    movement_history: Movement_History_Entry[]
} | {
    state: Player_State.in_battle
    battle: Battle_Record
    battle_player: Battle_Player
    previous_state: Map_Player_State
} | {
    state: Player_State.on_adventure
    ongoing_adventure: Ongoing_Adventure
    current_location: XY
    movement_history: Movement_History_Entry[]
    previous_global_map_location: XY
} | {
    state: Player_State.not_logged_in
}

type Card_Deck = {
    heroes: Hero_Type[]
    spells: Spell_Id[]
}

type Collection_Hero_Card = {
    hero: Hero_Type
    copies: number
}

type Collection_Spell_Card = {
    spell: Spell_Id,
    copies: number
}

type Card_Collection = {
    heroes: Collection_Hero_Card[]
    spells: Collection_Spell_Card[]
}

let dev_mode = false;

const players: Map_Player[] = [];
const token_to_player_login = new Map<string, Map_Player_Login>();
const steam_id_to_player = new Map<string, Map_Player>();
const api_handlers: ((body: object) => Request_Result<object>)[] = [];

const cards_per_page = 8;
const heroes_in_deck = 3;
const spells_in_deck = 5;

let player_id_auto_increment: Player_Id = 0 as Player_Id;

export let random: () => number;
export let random_seed: number;

function generate_access_token() {
    return randomBytes(32).toString("hex");
}

function make_new_player(steam_id: string, name: string): Map_Player {
    const all_heroes = enum_values<Hero_Type>().filter(id => id != Hero_Type.sniper && id != Hero_Type.ursa);

    const heroes: Collection_Hero_Card[] = [];
    const spells: Collection_Spell_Card[] = [];

    for (const hero of all_heroes) {
        heroes.push({ hero: hero, copies: 1 });
    }

    for (const spell of enum_values<Spell_Id>()) {
        spells.push({ spell: spell, copies: 1 });
    }

    const deck: Card_Deck = {
        heroes: [
            Hero_Type.dragon_knight,
            Hero_Type.luna,
            Hero_Type.vengeful_spirit
        ],
        spells: [
            Spell_Id.buyback,
            Spell_Id.town_portal_scroll,
            Spell_Id.call_to_arms,
            Spell_Id.mekansm,
            Spell_Id.pocket_tower
        ]
    };

    return {
        entity_type: Map_Entity_Type.player,
        steam_id: steam_id,
        id: player_id_auto_increment++ as Player_Id,
        name: name,
        active_logins: 0,
        deck: deck,
        collection: {
            heroes: heroes,
            spells: spells
        },
        online: {
            state: Player_State.on_global_map,
            current_location: xy(0, 0),
            movement_history: [],
        }
    }
}

const enum Do_With_Player_Result_Type {
    ok,
    error,
    unauthorized
}

type Do_With_Player_Ok<T> = {
    type: Do_With_Player_Result_Type.ok,
    data: T;
};

type Do_With_Player_Unauthorized = {
    type: Do_With_Player_Result_Type.unauthorized;
}

type Do_With_Player_Error = {
    type: Do_With_Player_Result_Type.error;
}

type Do_With_Player_Result<T> = Do_With_Player_Ok<T> | Do_With_Player_Error | Do_With_Player_Unauthorized;

function try_do_with_player<T>(access_token: string, do_what: (player: Map_Player, login: Map_Player_Login) => T | undefined): Do_With_Player_Result<T> {
    const player_login = token_to_player_login.get(access_token);

    if (!player_login) {
        return { type: Do_With_Player_Result_Type.unauthorized };
    }

    // TODO might want to move this logic into a separate ping request
    player_login.last_used_at = Date.now();

    const data = do_what(player_login.player, player_login);

    if (data) {
        return { type: Do_With_Player_Result_Type.ok, data: data };
    } else {
        return { type: Do_With_Player_Result_Type.error };
    }
}

function action_on_player_to_result<N>(result: Do_With_Player_Result<N>): Request_Result<N> {
    switch (result.type) {
        case Do_With_Player_Result_Type.ok: {
            return make_ok(result.data);
        }

        case Do_With_Player_Result_Type.error: {
            return make_error(400);
        }

        case Do_With_Player_Result_Type.unauthorized: {
            return make_error(403);
        }
    }
}

function player_by_id(player_id: Player_Id) {
    return players.find(player => player.id == player_id);
}

function try_authorize_steam_player_from_dedicated_server(steam_id: string, steam_name: string): [Player_Id, string] {
    let player = steam_id_to_player.get(steam_id);

    if (!player) {
       player = make_new_player(steam_id, steam_name);
       steam_id_to_player.set(steam_id, player);
       players.push(player)
    }

    const token = generate_access_token();

    const player_login: Map_Player_Login = {
        player: player,
        token: token,
        chat_timestamp: -1,
        last_used_at: Date.now()
    };

    player.active_logins++;

    token_to_player_login.set(token, player_login);

    return [player.id, token];
}

type Result_Ok<T> = {
    type: Result_Type.ok
    content: T
}

type Result_Error = {
    type: Result_Type.error
    code: number
}

function player_to_player_state_object(player: Map_Player): Player_State_Data {
    switch (player.online.state) {
        case Player_State.on_global_map: {
            return {
                state: player.online.state,
                player_position: {
                    x: player.online.current_location.x,
                    y: player.online.current_location.y
                }
            }
        }

        case Player_State.in_battle: {
            const battle = player.online.battle;

            return {
                state: player.online.state,
                battle_id: battle.id,
                battle_player_id: player.online.battle_player.id,
                random_seed: battle.random_seed,
                participants: battle.players.map(player => ({
                    id: player.id,
                    deployment_zone: player.deployment_zone,
                    map_entity: player.map_entity
                })),
                grid_size: {
                    width: battle.grid_size.x,
                    height: battle.grid_size.y
                }
            }
        }

        case Player_State.on_adventure: {
            const ongoing_adventure = player.online.ongoing_adventure;

            return {
                state: player.online.state,
                adventure_id: ongoing_adventure.adventure.id,
                current_room_id: ongoing_adventure.current_room.id,
                room_entrance: {
                    x: ongoing_adventure.current_room.entrance_location.x,
                    y: ongoing_adventure.current_room.entrance_location.y
                },
                entities: ongoing_adventure.entities
            }
        }

        case Player_State.not_logged_in: {
            return {
                state: player.online.state
            }
        }
    }
}

function can_player(player: Map_Player, right: Right) {
    switch (right) {
        case Right.log_in_with_character: {
            return player.online.state == Player_State.not_logged_in;
        }

        case Right.attack_a_character: {
            return player.online.state == Player_State.on_global_map;
        }

        case Right.participate_in_a_battle: {
            return player.online.state == Player_State.on_global_map;
        }

        case Right.submit_movement: {
            return player.online.state == Player_State.on_global_map || player.online.state == Player_State.on_adventure;
        }

        case Right.submit_battle_action: {
            return player.online.state == Player_State.in_battle;
        }

        case Right.submit_chat_messages: {
            return player.online.state != Player_State.not_logged_in;
        }

        case Right.query_battles: {
            return player.online.state == Player_State.on_global_map;
        }

        case Right.start_adventure: {
            return player.online.state == Player_State.on_global_map;
        }

        case Right.enter_adventure_room: {
            // TODO check if room belongs to adventure?
            return player.online.state == Player_State.on_adventure;
        }
    }

    return unreachable(right);
}

type Verify_Type_Exists<Union, Type> = Union extends { type: Type } ? Type : never;

function register_api_handler<T extends Api_Request_Type>(type: Verify_Type_Exists<Api_Request, T>, handler: (data: Find_Request<T>) => Request_Result<Find_Response<T>>) {
    api_handlers[type] = body => handler(body as Find_Request<T>)
}

function validate_dedicated_server_key(key: string) {
    return true;
}

function player_to_battle_participant(player: Map_Player): Battle_Participant {
    return {
        type: Map_Entity_Type.player,
        id: player.id,
        heroes: player.deck.heroes,
        spells: player.deck.spells
    }
}

function npc_to_battle_participant(npc: Map_Npc): Battle_Participant {
    return {
        type: Map_Entity_Type.npc,
        id: npc.id,
        npc_type: npc.type,
        heroes: [ ],
        spells: [],
        minions: [ Minion_Type.monster_satyr_big, Minion_Type.monster_satyr_small, Minion_Type.monster_satyr_small ]
    }
}

function initiate_battle(entities: (Map_Player | Map_Npc)[]) {
    const battle = start_battle(entities.map(entity => {
        switch (entity.entity_type) {
            case Map_Entity_Type.npc: return npc_to_battle_participant(entity);
            case Map_Entity_Type.player: return player_to_battle_participant(entity);
        }
    }), battleground.forest());

    for (const battle_player of battle.players) {
        const entity = battle_player.map_entity;
        if (entity.type == Map_Entity_Type.player) {
            const map_player = entities.find(participant => participant.id == entity.player_id && participant.entity_type == entity.type);

            if (map_player && map_player.entity_type == Map_Entity_Type.player) {
                map_player.online = {
                    state: Player_State.in_battle,
                    battle: battle,
                    battle_player: battle_player,
                    previous_state: map_player.online
                };
            }
        }
    }

    check_and_try_perform_ai_actions(battle);
}

function check_and_disconnect_offline_players() {
    const now = Date.now();
    const disconnect_time = dev_mode ? 1000_000 : 20_000;

    for (const [token, login] of token_to_player_login) {
        if (now - login.last_used_at > disconnect_time) {
            token_to_player_login.delete(token);

            const player = login.player;
            player.active_logins--;

            if (player.active_logins == 0) {
                if (player.online.state == Player_State.in_battle) {
                    surrender_player_forces(player.online.battle, player.online.battle_player);
                }

                steam_id_to_player.delete(player.steam_id);

                const player_index = players.indexOf(player);

                players[player_index] = players[players.length - 1];
                players.length = players.length - 1;
            }
        }
    }
}

register_api_handler(Api_Request_Type.authorize_steam_user, req => {
    if (!validate_dedicated_server_key(req.dedicated_server_key)) {
        return make_error(403);
    }

    const [player_id, token] = try_authorize_steam_player_from_dedicated_server(req.steam_id, req.steam_user_name);

    return make_ok({
        id: player_id,
        token: token
    });
});

export function report_battle_over(battle: Battle, winner_entity: Battle_Participant_Map_Entity) {
    for (const battle_player of battle.players) {
        const entity = battle_player.map_entity;

        switch (entity.type) {
            case Map_Entity_Type.npc: {
                const npc = npc_by_id(entity.npc_id);

                if (npc) {
                    // TODO handle NPC state change
                }

                break;
            }

            case Map_Entity_Type.player: {
                const player = player_by_id(entity.player_id);

                if (player && player.online.state == Player_State.in_battle) {
                    player.online = player.online.previous_state;

                    if (entity == winner_entity) {
                        submit_chat_message(player, `Battle over! ${player.name} wins`);
                    }
                }

                break;
            }

            default: unreachable(entity);
        }
    }
}

register_api_handler(Api_Request_Type.get_player_state, req => {
    const player_state = try_do_with_player(req.access_token, player_to_player_state_object);

    return action_on_player_to_result(player_state);
});

register_api_handler(Api_Request_Type.get_player_name, req => {
    const player_state = try_do_with_player(req.access_token, requesting_player => {
        const player = player_by_id(req.player_id);

        if (player) {
            return {
                name: player.name
            }
        }
    });

    return action_on_player_to_result(player_state);
});

register_api_handler(Api_Request_Type.submit_player_movement, req => {
    if (!validate_dedicated_server_key(req.dedicated_server_key)) {
        return make_error(403);
    }

    const ok = try_do_with_player(req.access_token, player => {
        if (!can_player(player, Right.submit_movement)) {
            return;
        }

        if (player.online.state != Player_State.on_global_map && player.online.state != Player_State.on_adventure) return;

        player.online.current_location = xy(req.current_location.x, req.current_location.y);
        player.online.movement_history = req.movement_history.map(entry => ({
            order_x: entry.order_x,
            order_y: entry.order_y,
            location_x: entry.location_x,
            location_y: entry.location_y
        }));

        return true;
    });

    const result = action_on_player_to_result(ok);

    if (result.type == Result_Type.ok) {
        return make_ok({});
    }

    return result;
});

register_api_handler(Api_Request_Type.query_entity_movement, req => {
    if (!validate_dedicated_server_key(req.dedicated_server_key)) {
        return make_error(403);
    }

    const player_locations = try_do_with_player(req.access_token, requesting_player => {
        if (!can_player(requesting_player, Right.submit_movement)) {
            return;
        }

        if (requesting_player.online.state == Player_State.on_adventure) {
            const adventure = requesting_player.online.ongoing_adventure;
            const player_movement: Player_Movement_Data[] = [];

            if (adventure.current_room.type == Adventure_Room_Type.rest) {
                for (const player of players) {
                    if (player != requesting_player && can_player(player, Right.submit_movement)) {
                        if (player.online.state != Player_State.on_adventure) continue;

                        if (player.online.ongoing_adventure.current_room == adventure.current_room) {
                            player_movement.push({
                                id: player.id,
                                movement_history: player.online.movement_history,
                                current_location: player.online.current_location
                            });
                        }
                    }
                }
            }

            return {
                players: player_movement,
                neutrals: []
            }
        } else {
            const player_movement: Player_Movement_Data[] = [];

            for (const player of players) {
                if (player != requesting_player && can_player(player, Right.submit_movement)) {
                    if (player.online.state != Player_State.on_global_map) continue;

                    player_movement.push({
                        id: player.id,
                        movement_history: player.online.movement_history,
                        current_location: player.online.current_location
                    });
                }
            }

            const nearby_neutrals = get_nearby_neutrals(requesting_player);
            const npc_movement: NPC_Movement_Data[] = nearby_neutrals.map(npc => ({
                id: npc.id,
                type: npc.type,
                movement_history: npc.movement_history,
                current_location: npc.current_location,
                spawn_facing: npc.spawn_facing
            }));

            return {
                players: player_movement,
                neutrals: npc_movement
            };
        }
    });

    return action_on_player_to_result(player_locations);
});

register_api_handler(Api_Request_Type.attack_player, req => {
    if (!validate_dedicated_server_key(req.dedicated_server_key)) {
        return make_error(403);
    }

    const player_state = try_do_with_player(req.access_token, player => {
        if (!can_player(player, Right.attack_a_character)) {
            return;
        }

        const other_player = player_by_id(req.target_player_id);

        if (!other_player) {
            return;
        }

        if (!can_player(other_player, Right.participate_in_a_battle)) {
            return;
        }

        initiate_battle([ player, other_player ]);

        return player_to_player_state_object(player);
    });

    return action_on_player_to_result(player_state);
});

register_api_handler(Api_Request_Type.attack_npc, req => {
    if (!validate_dedicated_server_key(req.dedicated_server_key)) {
        return make_error(403);
    }

    const player_state = try_do_with_player(req.access_token, player => {
        if (!can_player(player, Right.attack_a_character)) {
            return;
        }

        const npc = npc_by_id(req.target_npc_id);

        if (!npc) {
            return;
        }

        // TODO check if npc is already in battle
        initiate_battle([ player, npc ]);

        return player_to_player_state_object(player);
    });

    return action_on_player_to_result(player_state);
});

register_api_handler(Api_Request_Type.query_battle_deltas, req => {
    const result = try_do_with_player(req.access_token, player => {
        const battle = find_battle_by_id(req.battle_id);

        if (!battle) {
            console.error(`Battle #${req.battle_id} was not found`);
            return;
        }

        return {
            deltas: get_battle_deltas_after(battle, req.since_delta),
        };
    });

    return action_on_player_to_result(result);
});

register_api_handler(Api_Request_Type.take_battle_action, req => {
    const result = try_do_with_player(req.access_token, player => {
        if (!can_player(player, Right.submit_battle_action)) {
            return;
        }

        if (player.online.state != Player_State.in_battle) return;

        const battle = player.online.battle;
        const previous_head = battle.deltas.length;
        const deltas = try_take_turn_action(battle, player.online.battle_player, req.action);

        check_and_try_perform_ai_actions(battle);

        if (deltas) {
            return {
                deltas: deltas,
                previous_head: previous_head
            }
        }
    });

    return action_on_player_to_result(result);
});

register_api_handler(Api_Request_Type.query_battles, req => {
    const result = try_do_with_player(req.access_token, player => {
        if (!can_player(player, Right.query_battles)) {
            return;
        }

        return {
            battles: get_all_battles().map(battle => ({
                id: battle.id,
                random_seed: battle.random_seed,
                grid_size: {
                    width: battle.grid_size.x,
                    height: battle.grid_size.y
                },
                participants: battle.players.map(player => ({
                    id: player.id,
                    deployment_zone: player.deployment_zone,
                    map_entity: player.map_entity
                }))
            }))
        };
    });

    return action_on_player_to_result(result);
});

register_api_handler(Api_Request_Type.battle_cheat, req => {
    // TODO validate admin profile

    const result = try_do_with_player<true>(req.access_token, player => {
        if (player.online.state != Player_State.in_battle) return;

        cheat(player.online.battle, player.online.battle_player, req.cheat, req.selected_unit_id);

        return true;
    });

    return action_on_player_to_result(result);
});

register_api_handler(Api_Request_Type.submit_chat_message, req => {
    const result = try_do_with_player(req.access_token, (player, login) => {
        if (!can_player(player, Right.submit_chat_messages)) {
            return;
        }

        // TODO validate message size

        submit_chat_message(player, req.message);

        return {
            messages: pull_pending_chat_messages_for_player(login)
        }
    });

    return action_on_player_to_result(result);
});

register_api_handler(Api_Request_Type.pull_chat_messages, req => {
    const result = try_do_with_player(req.access_token, (player, login) => {
        return {
            messages: pull_pending_chat_messages_for_player(login)
        };
    });

    return action_on_player_to_result(result);
});

function get_array_page<T>(array: T[], page: number, elements_per_page: number) {
    const start = page * elements_per_page;
    return array.slice(start, start + elements_per_page);
}

register_api_handler(Api_Request_Type.get_collection_page, req => {
    const collection = try_do_with_player(req.access_token, player => {
        const heroes = player.collection.heroes;
        const spells = player.collection.spells;

        const hero_pages = Math.ceil(heroes.length / cards_per_page);
        const spell_pages = Math.ceil(spells.length / cards_per_page);
        const total_pages = hero_pages + spell_pages;

        let cards: Collection_Card[] = [];

        if (req.page >= 0) {
            if (req.page < hero_pages) {
                for (const hero_card of get_array_page(heroes, req.page, cards_per_page)) {
                    cards.push({
                        type: Card_Type.hero,
                        hero: hero_card.hero,
                        copies: hero_card.copies
                    });
                }
            } else if (req.page < total_pages) {
                for (const spell_card of get_array_page(spells, req.page - hero_pages, cards_per_page)) {
                    cards.push({
                        type: Card_Type.spell,
                        spell: spell_card.spell,
                        copies: spell_card.copies
                    });
                }
            }
        }

        const result: Collection_Page = {
            cards: cards,
            hero_pages: hero_pages,
            spell_pages: spell_pages,
            total_pages: total_pages
        };

        return result;
    });

    return action_on_player_to_result(collection);
});

register_api_handler(Api_Request_Type.get_deck, req => {
    const deck = try_do_with_player(req.access_token, player => {
        return {
            heroes: player.deck.heroes,
            spells: player.deck.spells
        }
    });

    return action_on_player_to_result(deck);
});

register_api_handler(Api_Request_Type.save_deck, req => {
    return action_on_player_to_result(try_do_with_player(req.access_token, player => {
        if (req.heroes.length != heroes_in_deck) {
            return;
        }

        if (req.spells.length != spells_in_deck) {
            return;
        }

        if (new Set(req.heroes).size != heroes_in_deck) {
            return;
        }

        if (new Set(req.spells).size != spells_in_deck) {
            return;
        }

        player.deck.heroes = req.heroes;
        player.deck.spells = req.spells;

        return {};
    }));
});

register_api_handler(Api_Request_Type.start_adventure, req => {
    if (!validate_dedicated_server_key(req.dedicated_server_key)) {
        return make_error(403);
    }

    return action_on_player_to_result(try_do_with_player(req.access_token, player => {
        if (!can_player(player, Right.start_adventure)) return;

        const adventure = adventure_by_id(req.adventure_id);
        if (!adventure) return;

        if (player.online.state != Player_State.on_global_map) return;

        const starting_room = adventure.rooms[0];

        player.online = {
            state: Player_State.on_adventure,
            ongoing_adventure: {
                adventure: adventure,
                current_room: starting_room,
                entities: starting_room.type == Adventure_Room_Type.combat ? create_room_entities(starting_room) : [],
            },
            current_location: starting_room.entrance_location,
            movement_history: [],
            previous_global_map_location: player.online.current_location
        };

        return player_to_player_state_object(player);
    }));
});

register_api_handler(Api_Request_Type.enter_adventure_room, req => {
    if (!validate_dedicated_server_key(req.dedicated_server_key)) {
        return make_error(403);
    }

    return action_on_player_to_result(try_do_with_player(req.access_token, player => {
        if (!can_player(player, Right.enter_adventure_room)) return;
        if (player.online.state != Player_State.on_adventure) return;

        const ongoing_adventure = player.online.ongoing_adventure;
        const room = room_by_id(ongoing_adventure.adventure, req.room_id);

        if (!room) return;

        ongoing_adventure.current_room = room;
        ongoing_adventure.entities = room.type == Adventure_Room_Type.combat ? create_room_entities(room) : [];

        player.online.movement_history = [];
        player.online.current_location = room.entrance_location;

        return {};
    }));
});

register_api_handler(Api_Request_Type.exit_adventure, req => {
    if (!validate_dedicated_server_key(req.dedicated_server_key)) {
        return make_error(403);
    }

    return action_on_player_to_result(try_do_with_player(req.access_token, player => {
        if (player.online.state != Player_State.on_adventure) return;

        player.online = {
            state: Player_State.on_global_map,
            current_location: player.online.previous_global_map_location,
            movement_history: []
        };

        return player_to_player_state_object(player);
    }));
});

function register_dev_handlers() {
    register_api_handler(Api_Request_Type.get_debug_ai_data, req => {
        return make_ok(get_debug_ai_data());
    });

    register_api_handler(Api_Request_Type.editor_action, req => {
        return action_on_player_to_result(try_do_with_player(req.access_token, player => {
            if (player.online.state != Player_State.on_adventure) return;

            apply_editor_action(player.online.ongoing_adventure, req);

            return {};
        }));
    });

    register_api_handler(Api_Request_Type.editor_get_room_details, req => {
        return action_on_player_to_result(try_do_with_player(req.access_token, player => {
            if (player.online.state != Player_State.on_adventure) return;

            const current_room = player.online.ongoing_adventure.current_room;

            return {
                entrance_location: {
                    x: current_room.entrance_location.x,
                    y: current_room.entrance_location.y
                }
            };
        }));
    });

    register_api_handler(Api_Request_Type.editor_create_entity, req => {
        return action_on_player_to_result(try_do_with_player(req.access_token, player => {
            if (player.online.state != Player_State.on_adventure) return;

            return editor_create_entity(player.online.ongoing_adventure, req.definition);
        }));
    });
}

type Request_Result<T> = Result_Ok<T> | Result_Error;

function make_error(code: number): Result_Error {
    return { type: Result_Type.error, code: code };
}

function make_ok<T>(result: T): Result_Ok<T> {
    return { type: Result_Type.ok, content: result };
}

function request_body(data: string) {
    const json_data_key = "json_data=";

    if (data.startsWith(json_data_key)) {
        return decodeURIComponent(data.substring(json_data_key.length).replace(/\+/g, "%20"));
    } else {
        return data;
    }
}

function try_extract_request_type(url: string): Api_Request_Type | undefined {
    const api_start = "/api";

    if (url.startsWith(api_start)) {
        return parseInt(url.substr(api_start.length), 10);
    }

    return;
}

function handle_api_request(handler: (body: object) => Request_Result<object>, data: string) {
    const result = handler(JSON.parse(request_body(data)));

    if (result.type == Result_Type.ok) {
        return make_ok(JSON.stringify(result.content));
    }

    return result;
}

function static_file(path: string): () => string {
    if (dev_mode) {
        return () => readFileSync(path, "utf8");
    }

    const contents = readFileSync(path, "utf8");

    return () => contents;
}

export function start_server(dev: boolean, seed: number) {
    dev_mode = dev;

    // TODO this is xorshift32, replace with a better algo
    //      https://github.com/bryc/code/blob/master/jshash/PRNGs.md
    random = function(a) {
        return function() {
            a ^= a << 25; a ^= a >>> 7; a ^= a << 2;
            return (a >>> 0) / 4294967296;
        }
    }(seed);

    random_seed = seed;

    const game_html = static_file("dist/game.html");
    const battle_sim = static_file("dist/battle_sim.js");
    const web_main = static_file("dist/web_main.js");

    setInterval(check_and_disconnect_offline_players, 1000);

    reload_adventures_from_file();

    if (dev_mode){
        register_dev_handlers();
    }

    const server = createServer((req, res) => {
        const url = req.url;
        const time_start = performance.now();

        if (!url) {
            req.connection.destroy();
            return;
        }

        let body = "";

        req.on("data", (data: any) => {
            const data_limit = 1e6;

            if (data.length > data_limit || body.length > data_limit) {
                req.connection.destroy();
            } else {
                body += data;
            }
        });

        req.on("end", () => {
            const headers: Record<string, string> = {
                "Access-Control-Allow-Origin": "*"
            };

            if (req.method == "GET") {
                switch (url) {
                    case "/": {
                        res.writeHead(200);
                        res.end(game_html());
                        break;
                    }

                    case "/battle_sim.js": {
                        res.writeHead(200);
                        res.end(battle_sim());

                        break;
                    }

                    case "/web_main.js": {
                        res.writeHead(200);
                        res.end(web_main());
                        break;
                    }

                    default: {
                        res.writeHead(404);
                        res.end("Not found");
                    }
                }

                return;
            }

            if (req.method == "OPTIONS") {
                res.writeHead(200, headers);
                res.end();
                return;
            }

            let url_name = url;

            const handle_start = performance.now();

            let result: Request_Result<string>;

            try {
                const request_type = try_extract_request_type(url);

                if (request_type != undefined) {
                    url_name = enum_to_string(request_type);

                    const handler = api_handlers[request_type];

                    if (handler) {
                        result = handle_api_request(handler, body);
                    } else {
                        result = make_error(404);
                    }
                } else {
                    result = make_error(404);
                }
            } catch (error) {
                console.log(error);
                console.log(error.stack);

                result = make_error(500);
            }

            const handle_time = performance.now() - handle_start;

            switch (result.type) {
                case Result_Type.ok: {
                    headers["Content-Type"] = "text/json";

                    res.writeHead(200, headers);
                    res.end(result.content);
                    break;
                }

                case Result_Type.error: {
                    res.writeHead(result.code, headers);
                    res.end();
                    break;
                }
            }

            const time = performance.now() - time_start;
            console.log(`${url_name} -> ${result.type == Result_Type.ok ? 'ok' : result.code}, took ${time.toFixed(2)}ms total, handle: ${handle_time.toFixed(2)}ms`)
        });
    }).listen(3638);

    server.on("listening", () => {
        const address = server.address();

        if (typeof address == "object") {
            console.log(`Started at http://${address.address}:${address.port}`)
        }
    });
}