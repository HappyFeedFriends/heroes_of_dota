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
import {get_nearby_neutrals} from "./npc_controller";
import {
    Adventure_Room_Type,
    Ongoing_Adventure,
    adventure_by_id,
    apply_editor_action,
    create_room_entities,
    load_all_adventures,
    room_by_id, editor_create_entity, interact_with_entity, Party_Event_Type
} from "./adventures";
import {check_and_try_perform_ai_actions} from "./ai";
import {
    change_party_add_creep, change_party_add_hero,
    change_party_add_spell,
    find_empty_party_slot_index, push_party_change,
    Map_Player_Party, change_party_change_health, change_party_empty_slot
} from "./adventure_party";
import {
    delete_battleground_by_id,
    find_battleground_by_id, get_all_battlegrounds,
    load_all_battlegrounds,
    make_new_battleground,
    save_battleground
} from "./battleground";

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

export type Map_Player_On_Adventure = {
    state: Player_State.on_adventure
    ongoing_adventure: Ongoing_Adventure
    current_location: XY
    movement_history: Movement_History_Entry[]
    previous_global_map_location: XY
    party: Map_Player_Party
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

const player_id_generator = sequential_id_generator();
const ongoing_adventure_id_generator = sequential_id_generator();

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
        id: player_id_generator() as Player_Id,
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

export function try_string_to_enum_value<T>(value: string, enum_values: [string, T][]): T | undefined {
    const result = enum_values.find(([name]) => value == name);

    if (!result) {
        return undefined;
    }

    return result[1];
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
                    width: battle.grid.size.x,
                    height: battle.grid.size.y
                }
            }
        }

        case Player_State.on_adventure: {
            const ongoing_adventure = player.online.ongoing_adventure;

            return {
                state: player.online.state,
                adventure_id: ongoing_adventure.adventure.id,
                current_room_id: ongoing_adventure.current_room.id,
                ongoing_adventure_id: ongoing_adventure.id,
                num_party_slots: player.online.party.slots.length,
                player_position: {
                    x: player.online.current_location.x,
                    y: player.online.current_location.y
                },
                entities: ongoing_adventure.entities,
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
        spells: player.deck.spells.map(spell => ({
            id: next_id() as Card_Id,
            spell: spell
        })),
        creeps: []
    }
}

function player_to_adventure_battle_participant(next_id: Id_Generator, id: Player_Id, player_on_adventure: Map_Player_On_Adventure): Battle_Participant {
    const participant: Battle_Participant =  {
        map_entity: {
            type: Map_Entity_Type.player,
            player_id: id
        },
        spells: [],
        heroes: [],
        creeps: [],
    };

    for (const slot of player_on_adventure.party.slots) {
        switch (slot.type) {
            case Adventure_Party_Slot_Type.hero: {
                if (slot.health > 0) {
                    slot.battle_unit_id = next_id() as Unit_Id;

                    participant.heroes.push({
                        id: slot.battle_unit_id,
                        health: slot.health,
                        type: slot.hero
                    });
                }

                break;
            }

            case Adventure_Party_Slot_Type.creep: {
                if (slot.health > 0) {
                    slot.battle_unit_id = next_id() as Unit_Id;

                    participant.creeps.push({
                        id: slot.battle_unit_id,
                        health: slot.health,
                        type: slot.creep
                    });
                }

                break;
            }

            case Adventure_Party_Slot_Type.spell: {
                slot.card_id = next_id() as Card_Id;

                participant.spells.push({
                    id: slot.card_id,
                    spell: slot.spell
                });

                break;
            }

            case Adventure_Party_Slot_Type.empty: break;

            default: unreachable(slot);
        }
    }

    return participant;
}

function adventure_enemy_to_battle_participant(next_id: Id_Generator, id: Adventure_Entity_Id, definition: Adventure_Enemy_Definition): Battle_Participant {
    return {
        map_entity: {
            type: Map_Entity_Type.adventure_enemy,
            entity_id: id,
            npc_type: definition.npc_type
        },
        heroes: [],
        creeps: definition.creeps.map(creep => ({
            id: next_id() as Unit_Id,
            type: creep,
            health: creep_definition_by_type(creep).health
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
        for (let index = 0; index < player.party.slots.length; index++) {
            const slot = player.party.slots[index];

            switch (slot.type) {
                case Adventure_Party_Slot_Type.hero: {
                    const unit_id = slot.battle_unit_id;
                    const source_unit = battle.units.find(unit => unit.id == unit_id);

                    slot.battle_unit_id = -1 as Unit_Id;

                    if (!source_unit) break;

                    if (slot.health != source_unit.health) {
                        const new_health = Math.min(source_unit.health, hero_definition_by_type(slot.hero).health);
                        push_party_change(player.party, change_party_change_health(index, new_health));
                    }

                    break;
                }

                case Adventure_Party_Slot_Type.creep: {
                    const unit_id = slot.battle_unit_id;
                    const source_unit = battle.units.find(unit => unit.id == unit_id);

                    slot.battle_unit_id = -1 as Unit_Id;

                    if (!source_unit) break;

                    if (source_unit.health > 0) {
                        if (slot.health != source_unit.health) {
                            const new_health = Math.min(source_unit.health, creep_definition_by_type(slot.creep).health);
                            push_party_change(player.party, change_party_change_health(index, new_health));
                        }
                    } else {
                        push_party_change(player.party, change_party_empty_slot(index));
                    }

                    break;
                }

                case Adventure_Party_Slot_Type.spell: {
                    const card = battle_counterpart.hand.find(card => card.id == slot.card_id);

                    if (!card) {
                        push_party_change(player.party, change_party_empty_slot(index));
                    }

                    slot.card_id = -1 as Card_Id;
                }
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

        const battleground = find_battleground_by_id(0 as Battleground_Id);

        if (!battleground) {
            return;
        }

        const id_generator = sequential_id_generator();

        const battle = start_battle(id_generator, [
            player_to_battle_participant(id_generator, player),
            player_to_battle_participant(id_generator, other_player)
        ], battleground);

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
                    width: battle.grid.size.x,
                    height: battle.grid.size.y
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

        const party: Map_Player_Party = {
            currency: 0,
            slots: [],
            changes: []
        };

        for (let empty = 10; empty > 0; empty--) {
            party.slots.push({ type: Adventure_Party_Slot_Type.empty });
        }

        add_change(slot => change_party_add_hero(slot, Hero_Type.dragon_knight));
        add_change(slot => change_party_add_hero(slot, Hero_Type.vengeful_spirit));
        add_change(slot => change_party_add_hero(slot, Hero_Type.mirana));
        add_change(slot => change_party_add_spell(slot, Spell_Id.mekansm));
        add_change(slot => change_party_add_spell(slot, Spell_Id.town_portal_scroll));
        add_change(slot => change_party_add_spell(slot, Spell_Id.euls_scepter));

        function add_change(supplier: (slot: number) => Adventure_Party_Change) {
            const slot_index = find_empty_party_slot_index(party);
            if (slot_index != -1) {
                push_party_change(party, supplier(slot_index));
            }
        }

        player.online = {
            state: Player_State.on_adventure,
            ongoing_adventure: {
                id: ongoing_adventure_id_generator() as Ongoing_Adventure_Id,
                adventure: adventure,
                current_room: starting_room,
                entities: starting_room.type == Adventure_Room_Type.combat ? create_room_entities(starting_room) : [],
            },
            current_location: starting_room.entrance_location,
            movement_history: [],
            previous_global_map_location: player.online.current_location,
            party: party
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

        const battleground = find_battleground_by_id(0 as Battleground_Id);

        if (!battleground) {
            return;
        }

        const id_generator = sequential_id_generator();

        const battle = start_battle(id_generator, [
            player_to_adventure_battle_participant(id_generator, player.id, player.online),
            adventure_enemy_to_battle_participant(id_generator, entity.id, entity.definition)
        ], battleground);

        transition_player_to_battle(player, battle);

        return player_to_player_state_object(player);
    });
});

register_api_handler(Api_Request_Type.get_adventure_party_changes, req => {
    return with_player_in_request(req, player => {
        if (player.online.state != Player_State.on_adventure) return;

        const all_changes = player.online.party.changes;
        const result = all_changes.slice(req.starting_change_index);

        return {
            ongoing_adventure_id: player.online.ongoing_adventure.id,
            party_slots: player.online.party.slots.length,
            changes: result
        }
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

        const result = interact_with_entity(player.online.ongoing_adventure, req.target_entity_id);
        if (!result) return;

        for (const event of result.party_events) {
            switch (event.type) {
                case Party_Event_Type.add_creep: {
                    const slot_index = find_empty_party_slot_index(player.online.party);
                    if (slot_index != -1) {
                        push_party_change(player.online.party, change_party_add_creep(slot_index, event.creep));
                    }

                    break;
                }

                case Party_Event_Type.add_spell: {
                    const slot_index = find_empty_party_slot_index(player.online.party);
                    if (slot_index != -1) {
                        push_party_change(player.online.party, change_party_add_spell(slot_index, event.spell));
                    }

                    break;
                }

                default: unreachable(event);
            }
        }

        return {
            party_updates: player.online.party.changes.slice(req.starting_change_index),
            updated_entity: result.updated_entity
        };
    });
});

function register_dev_handlers() {
    register_api_handler(Api_Request_Type.get_debug_ai_data, req => {
        return make_ok(get_debug_ai_data());
    });

    register_api_handler(Api_Request_Type.editor_create_battleground, req => {
        const created = make_new_battleground();

        return make_ok({
            id: created.id,
            battleground: copy<Battleground>(created)
        });
    });

    register_api_handler(Api_Request_Type.editor_submit_battleground, req => {
        save_battleground(req.id, req.battleground);

        return make_ok({});
    });

    register_api_handler(Api_Request_Type.editor_get_battleground, req => {
        const battleground = find_battleground_by_id(req.id);

        if (!battleground) {
            return make_error(400);
        }

        return make_ok({
            battleground: battleground
        });
    });

    register_api_handler(Api_Request_Type.editor_delete_battleground, req => {
        delete_battleground_by_id(req.id);

        return make_ok({});
    });

    register_api_handler(Api_Request_Type.editor_list_battlegrounds, req => {
        const battlegrounds = get_all_battlegrounds().map(bg => ({
            id: bg.id,
            size: {
                x: bg.grid_size.x,
                y: bg.grid_size.y
            }
        }));

        return make_ok({
            battlegrounds: battlegrounds
        });
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
                creeps: entity.definition.creeps
            };
        });
    });

    register_api_handler(Api_Request_Type.adventure_party_cheat, req => {
        return with_player_in_request(req, player => {
            if (player.online.state != Player_State.on_adventure) return;

            function parse_enum_query<T extends number>(query: string, enum_data: [string, T][]): T[] {
                return enum_data
                    .filter(([name]) => {
                        const actual_query = query.toLowerCase();
                        const name_lowercase = name.toLowerCase();
                        const has_substring = name_lowercase.includes(actual_query);
                        const abbreviation = name_lowercase.split("_").filter(str => str.length > 0).map(str => str[0]).join("");

                        return has_substring || abbreviation == actual_query;
                    })
                    .map(([, id]) => id);
            }

            const parts = req.cheat.split(" ");
            const party = player.online.party;

            function changes_from_cheat<T extends number>(from_enum: [string, T][], changer: (slot: number, value: T) => Adventure_Party_Change) {
                const elements = parse_enum_query(parts[1], from_enum);

                for (const element of elements) {
                    const slot_index = find_empty_party_slot_index(party);
                    if (slot_index != -1) {
                        push_party_change(party, changer(slot_index, element));
                    }
                }
            }

            switch (parts[0]) {
                case "hero": {
                    changes_from_cheat(enum_names_to_values<Hero_Type>(), change_party_add_hero);
                    break;
                }

                case "spl": {
                    changes_from_cheat(enum_names_to_values<Spell_Id>(), change_party_add_spell);
                    break;
                }

                case "crp": {
                    changes_from_cheat(enum_names_to_values<Creep_Type>(), change_party_add_creep);
                    break;
                }

                case "hp": {
                    const health = parseInt(parts[2]);
                    const targets = parse_enum_query(parts[1], enum_names_to_values<Hero_Type>());

                    for (const [index, slot] of party.slots.entries()) {
                        if (slot.type == Adventure_Party_Slot_Type.hero && targets.indexOf(slot.hero) != -1) {
                            push_party_change(party, change_party_change_health(index, health));
                        }
                    }

                    break;
                }

                case "rm": {
                    for (let index = 1; index < parts.length; index++) {
                        const slot = parseInt(parts[index]) - 1;

                        push_party_change(player.online.party, change_party_empty_slot(slot));
                    }

                    break;
                }
            }

            return {
                party_updates: player.online.party.changes.slice(req.starting_change_index)
            }
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

    {
        const ok = load_all_battlegrounds();

        if (ok) {
            console.log("Battlegrounds loaded");
        } else {
            console.error("Unable to load battlegrounds");
            return;
        }
    }

    {
        const ok = load_all_adventures();

        if (ok) {
            console.log("Adventures loaded");
        } else {
            console.error("Unable to load adventures");
            return;
        }
    }

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