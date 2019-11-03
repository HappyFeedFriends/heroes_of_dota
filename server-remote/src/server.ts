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
import {get_nearby_neutrals, Map_Npc, npc_by_id} from "./npc_controller";
import {
    Adventure_Room_Type,
    Ongoing_Adventure,
    adventure_by_id,
    apply_editor_action,
    create_room_entities,
    reload_adventures_from_file,
    room_by_id, editor_create_entity, interact_with_entity
} from "./adventures";
import {check_and_try_perform_ai_actions} from "./ai";

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
    state: Player_State.not_logged_in
} | Map_Player_On_Adventure

type Map_Player_On_Adventure = {
    state: Player_State.on_adventure
    ongoing_adventure: Ongoing_Adventure
    current_location: XY
    movement_history: Movement_History_Entry[]
    previous_global_map_location: XY
    party: {
        currency: number
        heroes: {
            battle_unit_id: Unit_Id
            type: Hero_Type
            health: number
        }[]
        minions: {
            battle_unit_id: Unit_Id
            type: Minion_Type
            health: number
        }[]
        spells: Spell_Id[]
    }
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

export type Id_Generator = () => number;

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

type Do_With_Player_Result<T> ={
    type: Do_With_Player_Result_Type.ok,
    data: T;
} | {
    type: Do_With_Player_Result_Type.error;
} | {
    type: Do_With_Player_Result_Type.unauthorized;
};

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

function with_player_in_request<T>(req: With_Token, do_what: (player: Map_Player, login: Map_Player_Login) => T | undefined): Request_Result<T> {
    return action_on_player_to_result(try_do_with_player(req.access_token, do_what))
}

function player_by_id(player_id: Player_Id) {
    return players.find(player => player.id == player_id);
}

function sequential_id_generator(): Id_Generator {
    let id = 0;

    return () => id++;
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
                player_position: {
                    x: player.online.current_location.x,
                    y: player.online.current_location.y
                },
                entities: ongoing_adventure.entities,
                party: player.online.party
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
            return player.online.state == Player_State.on_global_map;
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

function player_to_battle_participant(next_id: Id_Generator, player: Map_Player): Battle_Participant {
    return {
        map_entity: {
            type: Map_Entity_Type.player,
            player_id: player.id
        },
        heroes: player.deck.heroes.map(type => ({
            id: next_id() as Unit_Id,
            type: type,
            health: hero_definition_by_type(type).health
        })),
        spells: player.deck.spells,
        minions: []
    }
}

function player_to_adventure_battle_participant(next_id: Id_Generator, id: Player_Id, player_on_adventure: Map_Player_On_Adventure): Battle_Participant {
    const alive_heroes = player_on_adventure.party.heroes.filter(hero => hero.health > 0);
    const alive_minions = player_on_adventure.party.minions.filter(minion => minion.health > 0);

    for (const hero of alive_heroes) {
        hero.battle_unit_id = next_id() as Unit_Id;
    }

    for (const minion of alive_minions) {
        minion.battle_unit_id = next_id() as Unit_Id;
    }

    return {
        map_entity: {
            type: Map_Entity_Type.player,
            player_id: id
        },
        spells: player_on_adventure.party.spells,
        heroes: alive_heroes.map(hero => ({
            id: hero.battle_unit_id,
            type: hero.type,
            health: hero.health
        })),
        minions: alive_minions.map(minion => ({
            id: minion.battle_unit_id,
            type: minion.type,
            health: minion.health
        }))
    }
}

function adventure_enemy_to_battle_participant(next_id: Id_Generator, id: Adventure_Entity_Id, definition: Adventure_Enemy_Definition): Battle_Participant {
    return {
        map_entity: {
            type: Map_Entity_Type.adventure_enemy,
            entity_id: id,
            npc_type: definition.npc_type
        },
        heroes: [],
        minions: definition.minions.map(minion => ({
            id: next_id() as Unit_Id,
            type: minion,
            health: minion_definition_by_type(minion).health
        })),
        spells: []
    }
}

function transition_player_to_battle(player: Map_Player, battle: Battle_Record) {
    for (const battle_player of battle.players) {
        const entity = battle_player.map_entity;
        if (entity.type == Map_Entity_Type.player) {
            player.online = {
                state: Player_State.in_battle,
                battle: battle,
                battle_player: battle_player,
                previous_state: player.online
            };
        }
    }
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

export function report_battle_over(battle: Battle_Record, winner_entity: Battle_Participant_Map_Entity) {
    function defeat_adventure_enemies(adventure: Ongoing_Adventure) {
        for (const defeated_player of battle.players) {
            const defeated_entity = defeated_player.map_entity;

            if (defeated_entity != winner_entity && defeated_entity.type == Map_Entity_Type.adventure_enemy) {
                const defeated_adventure_entity = adventure.entities.find(adventure_entity => adventure_entity.id == defeated_entity.entity_id);

                if (defeated_adventure_entity && defeated_adventure_entity.definition.type == Adventure_Entity_Type.enemy) {
                    defeated_adventure_entity.alive = false;
                }
            }
        }
    }

    function update_player_adventure_state_from_battle(player: Map_Player_On_Adventure, battle_counterpart: Battle_Player) {
        for (const hero of player.party.heroes) {
            const source_unit = battle.units.find(unit => unit.id == hero.battle_unit_id);

            if (source_unit) {
                hero.health = Math.min(source_unit.health, hero_definition_by_type(hero.type).health);
                hero.battle_unit_id = -1 as Unit_Id;
            }
        }

        for (const minion of player.party.minions) {
            const source_unit = battle.units.find(unit => unit.id == minion.battle_unit_id);

            if (source_unit) {
                minion.health = Math.min(source_unit.health, minion_definition_by_type(minion.type).health);
                minion.battle_unit_id = -1 as Unit_Id;
            }
        }

        player.party.spells = [];

        for (const card of battle_counterpart.hand) {
            if (card.type == Card_Type.spell) {
                player.party.spells.push(card.spell_id);
            }
        }
    }

    for (const battle_player of battle.players) {
        const entity = battle_player.map_entity;

        switch (entity.type) {
            case Map_Entity_Type.npc: {
                break;
            }

            case Map_Entity_Type.adventure_enemy: {
                break;
            }

            case Map_Entity_Type.player: {
                const player = player_by_id(entity.player_id);
                const player_won = entity == winner_entity;

                if (player && player.online.state == Player_State.in_battle) {
                    player.online = player.online.previous_state;

                    if (player.online.state == Player_State.on_adventure) {
                        if (player_won) {
                            defeat_adventure_enemies(player.online.ongoing_adventure);
                            update_player_adventure_state_from_battle(player.online, battle_player);
                        } else {
                            submit_chat_message(player, `${player.name} lost, their adventure is over`);

                            player.online = {
                                state: Player_State.on_global_map,
                                current_location: player.online.previous_global_map_location,
                                movement_history: []
                            }
                        }
                    }

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
    return with_player_in_request(req, player_to_player_state_object);
});

register_api_handler(Api_Request_Type.get_player_name, req => {
    return with_player_in_request(req, () => {
        const player = player_by_id(req.player_id);

        if (player) {
            return {
                name: player.name
            }
        }
    });
});

register_api_handler(Api_Request_Type.submit_player_movement, req => {
    if (!validate_dedicated_server_key(req.dedicated_server_key)) {
        return make_error(403);
    }

    return with_player_in_request(req, player => {
        if (!can_player(player, Right.submit_movement)) {
            return;
        }

        if (player.online.state != Player_State.on_global_map) return;

        player.online.current_location = req.current_location;
        player.online.movement_history = req.movement_history;

        return {};
    });
});

register_api_handler(Api_Request_Type.submit_adventure_player_movement, req => {
    if (!validate_dedicated_server_key(req.dedicated_server_key)) {
        return make_error(403);
    }

    return with_player_in_request(req, player => {
        if (player.online.state != Player_State.on_adventure) return;

        player.online.current_location = req.current_location;
        player.online.movement_history = req.movement_history;

        return {};
    });
});

register_api_handler(Api_Request_Type.query_entity_movement, req => {
    if (!validate_dedicated_server_key(req.dedicated_server_key)) {
        return make_error(403);
    }

    return with_player_in_request(req, requesting_player => {
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
});

register_api_handler(Api_Request_Type.attack_player, req => {
    if (!validate_dedicated_server_key(req.dedicated_server_key)) {
        return make_error(403);
    }

    return with_player_in_request(req, player => {
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

        const id_generator = sequential_id_generator();

        const battle = start_battle(id_generator, [
            player_to_battle_participant(id_generator, player),
            player_to_battle_participant(id_generator, other_player)
        ], battleground.forest());

        transition_player_to_battle(player, battle);
        transition_player_to_battle(other_player, battle);

        return player_to_player_state_object(player);
    });
});

register_api_handler(Api_Request_Type.query_battle_deltas, req => {
    return with_player_in_request(req, () => {
        const battle = find_battle_by_id(req.battle_id);

        if (!battle) {
            console.error(`Battle #${req.battle_id} was not found`);
            return;
        }

        return {
            deltas: get_battle_deltas_after(battle, req.since_delta),
        };
    });
});

register_api_handler(Api_Request_Type.take_battle_action, req => {
    return with_player_in_request(req, player => {
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
});

register_api_handler(Api_Request_Type.query_battles, req => {
    return with_player_in_request(req, player => {
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
});

register_api_handler(Api_Request_Type.battle_cheat, req => {
    // TODO validate admin profile

    return with_player_in_request(req, player => {
        if (player.online.state != Player_State.in_battle) return;

        cheat(player.online.battle, player.online.battle_player, req.cheat, req.selected_unit_id);

        return true;
    });
});

register_api_handler(Api_Request_Type.submit_chat_message, req => {
    return with_player_in_request(req, (player, login) => {
        if (!can_player(player, Right.submit_chat_messages)) {
            return;
        }

        // TODO validate message size

        submit_chat_message(player, req.message);

        return {
            messages: pull_pending_chat_messages_for_player(login)
        }
    });
});

register_api_handler(Api_Request_Type.pull_chat_messages, req => {
    return with_player_in_request(req, (player, login) => {
        return {
            messages: pull_pending_chat_messages_for_player(login)
        };
    });
});

function get_array_page<T>(array: T[], page: number, elements_per_page: number) {
    const start = page * elements_per_page;
    return array.slice(start, start + elements_per_page);
}

register_api_handler(Api_Request_Type.get_collection_page, req => {
    return with_player_in_request(req, player => {
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
});

register_api_handler(Api_Request_Type.get_deck, req => {
    return with_player_in_request(req, player => {
        return {
            heroes: player.deck.heroes,
            spells: player.deck.spells
        }
    });
});

register_api_handler(Api_Request_Type.save_deck, req => {
    return with_player_in_request(req, player => {
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
    });
});

register_api_handler(Api_Request_Type.start_adventure, req => {
    if (!validate_dedicated_server_key(req.dedicated_server_key)) {
        return make_error(403);
    }

    return with_player_in_request(req, player => {
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
            previous_global_map_location: player.online.current_location,
            party: {
                currency: 0,
                heroes: [
                    Hero_Type.dragon_knight,
                    Hero_Type.vengeful_spirit,
                    Hero_Type.mirana
                ].map(type => ({
                    type: type,
                    battle_unit_id: -1 as Unit_Id, // TODO ugh
                    health: hero_definition_by_type(type).health
                })),
                minions: [],
                spells: [
                    Spell_Id.mekansm,
                    Spell_Id.town_portal_scroll,
                    Spell_Id.euls_scepter
                ]
            }
        };

        return player_to_player_state_object(player);
    });
});

register_api_handler(Api_Request_Type.enter_adventure_room, req => {
    if (!validate_dedicated_server_key(req.dedicated_server_key)) {
        return make_error(403);
    }

    return with_player_in_request(req, player => {
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
    });
});

register_api_handler(Api_Request_Type.start_adventure_enemy_fight, req => {
    if (!validate_dedicated_server_key(req.dedicated_server_key)) {
        return make_error(403);
    }
    return with_player_in_request(req, player => {
        if (player.online.state != Player_State.on_adventure) return;

        const entity = player.online.ongoing_adventure.entities.find(entity => entity.id == req.enemy_entity_id);

        if (!entity) return;
        if (entity.definition.type != Adventure_Entity_Type.enemy) return;

        const id_generator = sequential_id_generator();

        const battle = start_battle(id_generator, [
            player_to_adventure_battle_participant(id_generator, player.id, player.online),
            adventure_enemy_to_battle_participant(id_generator, entity.id, entity.definition)
        ], battleground.forest());

        transition_player_to_battle(player, battle);

        return player_to_player_state_object(player);
    });
});

register_api_handler(Api_Request_Type.exit_adventure, req => {
    if (!validate_dedicated_server_key(req.dedicated_server_key)) {
        return make_error(403);
    }

    return with_player_in_request(req, player => {
        if (player.online.state != Player_State.on_adventure) return;

        player.online = {
            state: Player_State.on_global_map,
            current_location: player.online.previous_global_map_location,
            movement_history: []
        };

        return player_to_player_state_object(player);
    });
});

register_api_handler(Api_Request_Type.interact_with_adventure_entity, req => {
    return with_player_in_request(req, player => {
        if (player.online.state != Player_State.on_adventure) return;

        interact_with_entity(player.online.ongoing_adventure, player.online.party, req.target_entity_id);

        return player.online.party;
    });
});

function register_dev_handlers() {
    register_api_handler(Api_Request_Type.get_debug_ai_data, req => {
        return make_ok(get_debug_ai_data());
    });

    register_api_handler(Api_Request_Type.editor_action, req => {
        return with_player_in_request(req, player => {
            if (player.online.state != Player_State.on_adventure) return;

            apply_editor_action(player.online.ongoing_adventure, req);

            return {};
        });
    });

    register_api_handler(Api_Request_Type.editor_get_room_details, req => {
        return with_player_in_request(req, player => {
            if (player.online.state != Player_State.on_adventure) return;

            const current_room = player.online.ongoing_adventure.current_room;

            return {
                entrance_location: {
                    x: current_room.entrance_location.x,
                    y: current_room.entrance_location.y
                }
            };
        });
    });

    register_api_handler(Api_Request_Type.editor_create_entity, req => {
        return with_player_in_request(req, player => {
            if (player.online.state != Player_State.on_adventure) return;

            return editor_create_entity(player.online.ongoing_adventure, req.definition);
        });
    });

    register_api_handler(Api_Request_Type.editor_get_enemy_deck, req => {
        return with_player_in_request(req, player => {
            if (player.online.state != Player_State.on_adventure) return;

            const entity = player.online.ongoing_adventure.entities.find(entity => entity.id == req.entity_id);
            if (!entity) return;
            if (entity.definition.type != Adventure_Entity_Type.enemy) return;

            return {
                minions: entity.definition.minions
            };
        });
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