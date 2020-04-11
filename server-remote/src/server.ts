import {readFileSync} from "fs";
import {createServer} from "http";
import {randomBytes} from "crypto"
import {performance} from "perf_hooks"

import {
    XY,
    Id_Generator,
    xy,
    unreachable
} from "./common";

import {Random} from "./random";

import {check_and_try_perform_ai_actions} from "./ai";
import {pull_pending_chat_messages_for_player, submit_chat_message} from "./chat";
import {get_debug_ai_data} from "./debug_draw";
import {get_nearby_neutrals} from "./npc_controller";

import {
    Adventure_Item_Modifier,
    Battle_Participant,
    Battle_Record,
    start_battle,
    try_take_turn_action,
    get_battle_deltas_after,
    surrender_player_forces,
    cheat
} from "./battle";

import {
    Party_Event_Type,
    Ongoing_Adventure,
    load_all_adventures,
    adventure_by_id,
    room_by_id,
    create_room_entities,
    interact_with_entity,
    apply_editor_action,
    editor_create_entity,
    find_available_purchase_by_id,
    mark_available_purchase_as_sold_out
} from "./adventures";

import {
    Map_Player_Party,
    push_party_change,
    act_on_adventure_party,
    adventure_equipment_item_id_to_item,
    adventure_consumable_item_id_to_item
} from "./adventure_party";

import {
    get_all_battlegrounds,
    load_all_battlegrounds,
    make_new_battleground,
    save_battleground,
    find_battleground_by_id,
    delete_battleground_by_id,
    duplicate_battleground
} from "./battleground";

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

type Adventure_Player_Bucket_Id = number & { _adventure_player_bucket_id_brand: any };

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
    in_playtest: boolean
} | {
    state: Player_State.not_logged_in
} | Map_Player_On_Adventure

type Map_Player_On_Adventure = {
    state: Player_State.on_adventure
    ongoing_adventure: Ongoing_Adventure
    current_location: XY
    current_bucket?: Adventure_Player_Bucket
    movement_history: Movement_History_Entry[]
    previous_global_map_location: XY
    party: Map_Player_Party
}

type Adventure_Player_Bucket = {
    id: Adventure_Player_Bucket_Id
    adventure_id: Adventure_Id
    room_id: Adventure_Room_Id
    players: Map_Player[]
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
const battles: Battle_Record[] = [];
const adventure_player_buckets: Adventure_Player_Bucket[] = [];
const token_to_player_login = new Map<string, Map_Player_Login>();
const steam_id_to_player = new Map<string, Map_Player>();
const api_handlers: ((body: object) => Request_Result<object>)[] = [];

const cards_per_page = 8;
const heroes_in_deck = 3;
const spells_in_deck = 5;

const player_id_generator = typed_sequential_id_generator<Player_Id>();
const ongoing_adventure_id_generator = typed_sequential_id_generator<Ongoing_Adventure_Id>();
const battle_id_generator = typed_sequential_id_generator<Battle_Id>();
const bucket_id_generator = typed_sequential_id_generator<Adventure_Player_Bucket_Id>();

let random: Random;
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
        id: player_id_generator(),
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

function with_player_on_adventure<T>(req: With_Token, do_what: (player: Map_Player, state: Map_Player_On_Adventure) => T | undefined) {
    return action_on_player_to_result(try_do_with_player(req.access_token, player => {
        if (player.online.state != Player_State.on_adventure) return;

        return do_what(player, player.online);
    }))
}

// @Performance
function player_by_id(player_id: Player_Id) {
    return players.find(player => player.id == player_id);
}

// @Performance
function battle_by_id(id: Battle_Id): Battle_Record | undefined {
    return battles.find(battle => battle.id == id);
}

function push_player_into_adventure_bucket(adventure_id: Adventure_Id, room_id: Adventure_Room_Id, player: Map_Player) {
    const max_players_in_bucket = 5;

    //@Performance
    const vacant_bucket = adventure_player_buckets.find(bucket =>
        bucket.adventure_id == adventure_id &&
        bucket.room_id == room_id &&
        bucket.players.length < max_players_in_bucket
    );

    if (vacant_bucket) {
        vacant_bucket.players.push(player);

        return vacant_bucket;
    } else {
        const new_bucket: Adventure_Player_Bucket = {
            id: bucket_id_generator(),
            adventure_id: adventure_id,
            room_id: room_id,
            players: [ player ]
        };

        adventure_player_buckets.push(new_bucket);

        return new_bucket;
    }
}

function remove_player_from_adventure_bucket(bucket: Adventure_Player_Bucket, player: Map_Player) {
    //@Performance
    const bucket_index = adventure_player_buckets.findIndex(bucket => bucket.id == bucket.id);
    if (bucket_index == -1) return;

    const player_index = bucket.players.indexOf(player);
    if (player_index == -1) return;

    bucket.players.splice(player_index, 1);

    if (bucket.players.length == 0) {
        adventure_player_buckets.splice(bucket_index, 1);
    }
}

function typed_sequential_id_generator<T extends number>(): () => T {
    let id = 0;

    return () => id++ as T;
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

function set_player_state(player: Map_Player, new_state: Map_Player_State) {
    const old_state = player.online;

    if (old_state.state == Player_State.on_adventure) {
        if (old_state.current_bucket) {
            remove_player_from_adventure_bucket(old_state.current_bucket, player);
        }
    }

    player.online = new_state;
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
                battleground_theme: battle.theme,
                participants: battle.players.map(player => ({
                    id: player.id,
                    deployment_zone: player.deployment_zone,
                    map_entity: player.map_entity
                })),
                grid_size: {
                    width: battle.grid.size.x,
                    height: battle.grid.size.y
                },
                battle_world_origin: battle.world_origin
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
                room: {
                    entities: ongoing_adventure.entities,
                    camera_restriction_zones: ongoing_adventure.current_room.camera_restriction_zones,
                    entrance: ongoing_adventure.current_room.entrance_location,
                    exits: ongoing_adventure.current_room.exits
                },
                player_position: {
                    x: player.online.current_location.x,
                    y: player.online.current_location.y
                }
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

function player_to_battle_participant(next_id: Id_Generator, player: Map_Player): Battle_Participant {
    return {
        map_entity: {
            type: Map_Entity_Type.player,
            player_id: player.id
        },
        heroes: player.deck.heroes.map(type => ({
            id: next_id() as Unit_Id,
            type: type,
            health: hero_definition_by_type(type).health,
            modifiers: []
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

    // TODO this function mutates player state, bad, just return it?
    const links = player_on_adventure.party.links;

    for (const [index, slot] of player_on_adventure.party.slots.entries()) {
        switch (slot.type) {
            case Adventure_Party_Slot_Type.hero: {
                const health_bonus = compute_adventure_hero_inventory_field_bonus(slot.items, Modifier_Field.health_bonus);
                const actual_health = slot.base_health + health_bonus;

                if (actual_health > 0) {
                    const id = next_id() as Unit_Id;
                    const modifiers: Adventure_Item_Modifier[] = [];

                    for (const item of slot.items) {
                        if (item && item.type == Adventure_Item_Type.equipment) {
                            modifiers.push({
                                item: item.item_id,
                                modifier: item.modifier
                            })
                        }
                    }

                    links.heroes.push({
                        slot: slot,
                        slot_index: index,
                        unit: id
                    });

                    participant.heroes.push({
                        id: id,
                        health: actual_health,
                        type: slot.hero,
                        modifiers: modifiers
                    });
                }

                break;
            }

            case Adventure_Party_Slot_Type.creep: {
                if (slot.health > 0) {
                    const id = next_id() as Unit_Id;

                    links.creeps.push({
                        slot: slot,
                        slot_index: index,
                        unit: id
                    });

                    participant.creeps.push({
                        id: id,
                        health: slot.health,
                        type: slot.creep
                    });
                }

                break;
            }

            case Adventure_Party_Slot_Type.spell: {
                const id = next_id() as Unit_Id;

                links.spells.push({
                    slot_index: index,
                    card: id
                });

                participant.spells.push({
                    id: id,
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

type Adventure_Enemy_Definition = Find_By_Type<Adventure_Entity_Definition, Adventure_Entity_Type.enemy>;

function adventure_enemy_to_battle_participant(next_id: Id_Generator, id: Adventure_World_Entity_Id, definition: Adventure_Enemy_Definition): Battle_Participant {
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

function transition_player_to_battle(player: Map_Player, battle: Battle_Record, for_playtest = false) {
    for (const battle_player of battle.players) {
        const entity = battle_player.map_entity;
        if (entity.type == Map_Entity_Type.player && entity.player_id == player.id) {
            set_player_state(player, {
                state: Player_State.in_battle,
                battle: battle,
                battle_player: battle_player,
                previous_state: player.online,
                in_playtest: for_playtest
            });
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
                } else if (player.online.state == Player_State.on_adventure) {
                    if (player.online.current_bucket) {
                        remove_player_from_adventure_bucket(player.online.current_bucket, player);
                    }
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

export function check_if_battle_is_over(battle: Battle_Record) {
    if (battle.state.status == Battle_Status.finished) {
        report_battle_over(battle, battle.state.winner?.map_entity);
    }
}

function report_battle_over(battle: Battle_Record, winner_entity?: Battle_Participant_Map_Entity) {
    function defeat_adventure_enemies(adventure: Ongoing_Adventure): Creep_Type[] {
        const defeated: Creep_Type[] = [];

        for (const defeated_player of battle.players) {
            const defeated_entity = defeated_player.map_entity;

            if (defeated_entity != winner_entity && defeated_entity.type == Map_Entity_Type.adventure_enemy) {
                const defeated_adventure_entity = adventure.entities.find(adventure_entity => adventure_entity.id == defeated_entity.entity_id);

                if (defeated_adventure_entity && defeated_adventure_entity.type == Adventure_Entity_Type.enemy) {
                    defeated_adventure_entity.alive = false;

                    defeated.push(...defeated_adventure_entity.creeps);
                }
            }
        }

        return defeated;
    }

    function update_player_adventure_state_from_battle(player: Map_Player_On_Adventure, battle_counterpart: Battle_Player, defeated: Creep_Type[]) {
        const links = player.party.links;
        const change: Find_By_Type<Adventure_Party_Change, Adventure_Party_Change_Type.set_state_after_combat> = {
            type: Adventure_Party_Change_Type.set_state_after_combat,
            slots_removed: [],
            slot_health_changes: [],
            enemy: {
                heroes: [],
                creeps: defeated,
                spells: []
            }
        };

        for (const link of links.heroes) {
            const slot = link.slot;
            const unit_id = link.unit;
            const source_unit = battle.units.find(unit => unit.id == unit_id);
            if (!source_unit) continue;

            // Base health can go into negatives
            // Display health or health in combat = health bonus + base health
            const health_bonus = compute_adventure_hero_inventory_field_bonus(slot.items, Modifier_Field.health_bonus);
            const post_combat_health = source_unit.health;
            const max_base_health = hero_definition_by_type(slot.hero).health;
            const new_base_health = post_combat_health - health_bonus;
            const clamped_base_health = Math.min(new_base_health, max_base_health);

            if (clamped_base_health != slot.base_health) {
                change.slot_health_changes.push({
                    index: link.slot_index,
                    health_before: slot.base_health,
                    health_now: clamped_base_health
                });
            }
        }

        for (const link of links.creeps) {
            const unit_id = link.unit;
            const source_unit = battle.units.find(unit => unit.id == unit_id);
            if (!source_unit) continue;

            if (source_unit.health > 0) {
                const slot = link.slot;

                if (slot.health != source_unit.health) {
                    const max_health = creep_definition_by_type(slot.creep).health;
                    const new_health = source_unit.health;

                    change.slot_health_changes.push({
                        index: link.slot_index,
                        health_before: slot.health,
                        health_now: Math.min(new_health, max_health)
                    });
                }
            } else {
                change.slots_removed.push(link.slot_index);
            }
        }

        for (const link of links.spells) {
            const card = battle_counterpart.hand.find(card => card.id == link.card);

            if (!card) {
                change.slots_removed.push(link.slot_index);
            }
        }

        push_party_change(player.party, change);

        player.party.links = {
            heroes: [],
            creeps: [],
            spells: []
        };
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
                    const was_a_playtest = player.online.in_playtest;
                    const next_state = player.online.previous_state;

                    set_player_state(player, next_state);

                    if (!was_a_playtest) {
                        if (next_state.state == Player_State.on_adventure) {
                            if (player_won) {
                                const defeated = defeat_adventure_enemies(next_state.ongoing_adventure);
                                update_player_adventure_state_from_battle(next_state, battle_player, defeated);
                            } else {
                                submit_chat_message(player, `${player.name} lost, their adventure is over`);
                                set_player_state(player, {
                                    state: Player_State.on_global_map,
                                    current_location: next_state.previous_global_map_location,
                                    movement_history: []
                                });
                            }
                        }

                        if (entity == winner_entity) {
                            submit_chat_message(player, `Battle over! ${player.name} wins`);
                        }
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

    return with_player_on_adventure(req, (player, state) => {
        if (!can_player(player, Right.submit_movement)) {
            return;
        }

        state.current_location = req.current_location;
        state.movement_history = req.movement_history;

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
            const bucket = requesting_player.online.current_bucket;
            const player_movement: Player_Movement_Data[] = [];

            if (!bucket) {
                return { players: [], neutrals: [] };
            }

            for (const player of bucket.players) {
                if (player != requesting_player && can_player(player, Right.submit_movement)) {
                    if (player.online.state != Player_State.on_adventure) continue;

                    player_movement.push({
                        id: player.id,
                        movement_history: player.online.movement_history,
                        current_location: player.online.current_location
                    });
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

        const battle = start_battle(battle_id_generator(), id_generator, random, [
            player_to_battle_participant(id_generator, player),
            player_to_battle_participant(id_generator, other_player)
        ], battleground);

        battles.push(battle);

        transition_player_to_battle(player, battle);
        transition_player_to_battle(other_player, battle);

        return player_to_player_state_object(player);
    });
});

register_api_handler(Api_Request_Type.query_battle_deltas, req => {
    return with_player_in_request(req, () => {
        const battle = battle_by_id(req.battle_id);

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

        check_if_battle_is_over(battle);
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
            battles: battles.map(battle => ({
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
        check_if_battle_is_over(player.online.battle);

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
            changes: [],
            bag: [],
            links: {
                heroes: [],
                creeps: [],
                spells: []
            }
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

        const new_adventure: Ongoing_Adventure = {
            id: ongoing_adventure_id_generator(),
            adventure: adventure,
            current_room: starting_room,
            entities: [],
            next_party_entity_id: typed_sequential_id_generator<Adventure_Party_Entity_Id>(),
            random: random
        };

        new_adventure.entities = create_room_entities(new_adventure, starting_room);

        set_player_state(player, {
            state: Player_State.on_adventure,
            ongoing_adventure: new_adventure,
            current_location: starting_room.entrance_location,
            movement_history: [],
            previous_global_map_location: player.online.current_location,
            party: party
        });

        return player_to_player_state_object(player);
    });
});

register_api_handler(Api_Request_Type.enter_adventure_room, req => {
    if (!validate_dedicated_server_key(req.dedicated_server_key)) {
        return make_error(403);
    }

    return with_player_on_adventure(req, (player, state) => {
        if (!can_player(player, Right.enter_adventure_room)) return;

        const ongoing_adventure = state.ongoing_adventure;
        const next_room = room_by_id(ongoing_adventure.adventure, req.room_id);
        if (!next_room) return;

        if (state.current_bucket) {
            remove_player_from_adventure_bucket(state.current_bucket, player);
        }

        const entities = create_room_entities(ongoing_adventure, next_room);

        ongoing_adventure.current_room = next_room;
        ongoing_adventure.entities = entities;

        if (next_room.type == Adventure_Room_Type.rest) {
            state.current_bucket = push_player_into_adventure_bucket(ongoing_adventure.adventure.id, next_room.id, player);
        } else {
            state.current_bucket = undefined;
        }

        state.movement_history = [];
        state.current_location = next_room.entrance_location;

        return {
            entities: entities,
            entrance: next_room.entrance_location,
            camera_restriction_zones: next_room.camera_restriction_zones,
            exits: next_room.exits
        };
    });
});

register_api_handler(Api_Request_Type.start_adventure_enemy_fight, req => {
    if (!validate_dedicated_server_key(req.dedicated_server_key)) {
        return make_error(403);
    }

    return with_player_on_adventure(req, (player, state) => {
        const entity = state.ongoing_adventure.entities.find(entity => entity.id == req.enemy_entity_id);

        if (!entity) return;
        if (entity.definition.type != Adventure_Entity_Type.enemy) return;

        const battleground = find_battleground_by_id(entity.definition.battleground);

        if (!battleground) {
            return;
        }

        const id_generator = sequential_id_generator();

        const battle = start_battle(battle_id_generator(), id_generator, random, [
            player_to_adventure_battle_participant(id_generator, player.id, state),
            adventure_enemy_to_battle_participant(id_generator, entity.id, entity.definition)
        ], battleground);

        battles.push(battle);

        transition_player_to_battle(player, battle);

        return player_to_player_state_object(player);
    });
});

register_api_handler(Api_Request_Type.act_on_adventure_party, req => {
    return with_player_on_adventure(req, (player, state) => {
        return act_on_adventure_party(state.party, req);
    });
});

register_api_handler(Api_Request_Type.exit_adventure, req => {
    if (!validate_dedicated_server_key(req.dedicated_server_key)) {
        return make_error(403);
    }

    return with_player_on_adventure(req, (player, state) => {
        set_player_state(player, {
            state: Player_State.on_global_map,
            current_location: state.previous_global_map_location,
            movement_history: []
        });

        return player_to_player_state_object(player);
    });
});

register_api_handler(Api_Request_Type.interact_with_adventure_entity, req => {
    return with_player_on_adventure(req, (player, state) => {
        const result = interact_with_entity(state.ongoing_adventure, req.target_entity_id);
        if (!result) return;

        const party = state.party;

        for (const event of result.party_events) {
            switch (event.type) {
                case Party_Event_Type.add_creep: {
                    const slot_index = find_empty_party_slot_index(party);
                    if (slot_index != -1) {
                        push_party_change(party, change_party_add_creep(slot_index, event.creep));
                    }

                    break;
                }

                case Party_Event_Type.add_spell: {
                    const slot_index = find_empty_party_slot_index(party);
                    if (slot_index != -1) {
                        push_party_change(party, change_party_add_spell(slot_index, event.spell));
                    }

                    break;
                }

                case Party_Event_Type.add_item: {
                    push_party_change(party, change_party_add_item(event.item));
                    break;
                }

                case Party_Event_Type.activate_shrine: {
                    for (const [index, slot] of party.slots.entries()) {
                        switch (slot.type) {
                            case Adventure_Party_Slot_Type.hero: {
                                if (is_party_hero_dead(slot)) break;

                                const max_health = hero_definition_by_type(slot.hero).health;
                                const change = change_party_set_health(index, max_health, Adventure_Health_Change_Reason.shrine);

                                push_party_change(party, change);

                                break;
                            }

                            case Adventure_Party_Slot_Type.creep: {
                                if (is_party_creep_dead(slot)) break;

                                const max_health = creep_definition_by_type(slot.creep).health;
                                const change = change_party_set_health(index, max_health, Adventure_Health_Change_Reason.shrine);

                                push_party_change(party, change);

                                break;
                            }

                            case Adventure_Party_Slot_Type.spell:
                            case Adventure_Party_Slot_Type.empty: {
                                break;
                            }

                            default: unreachable(slot);
                        }
                    }

                    break;
                }

                case Party_Event_Type.add_currency: {
                    push_party_change(party, change_party_set_currency(party.currency + event.amount));

                    break;
                }

                default: unreachable(event);
            }
        }

        return {
            party_updates: party.changes.slice(req.current_head),
            updated_entity: result.updated_entity
        };
    });
});

register_api_handler(Api_Request_Type.purchase_merchant_item, req => {
    validate_dedicated_server_key(req.dedicated_server_key);

    return with_player_on_adventure(req, (player, state) => {
        const party = state.party;
        const available = find_available_purchase_by_id(state.ongoing_adventure, req.merchant_id, req.purchase_id);
        if (!available) {
            return;
        }

        switch (available.found.type) {
            case Purchase_Type.card: {
                const free_slot = find_empty_party_slot_index(party);
                if (free_slot == -1) return;

                const card = available.found.card;
                if (card.cost > party.currency) return;

                switch (card.type) {
                    case Adventure_Merchant_Card_Type.hero: {
                        push_party_change(party, change_party_add_hero(free_slot, card.hero, Adventure_Acquire_Reason.purchase));
                        break;
                    }

                    case Adventure_Merchant_Card_Type.creep: {
                        push_party_change(party, change_party_add_creep(free_slot, card.creep, Adventure_Acquire_Reason.purchase));
                        break;
                    }

                    case Adventure_Merchant_Card_Type.spell: {
                        push_party_change(party, change_party_add_spell(free_slot, card.spell, Adventure_Acquire_Reason.purchase));
                        break;
                    }

                    default: unreachable(card);
                }

                push_party_change(party, change_party_set_currency(party.currency - card.cost, true));

                break;
            }

            case Purchase_Type.item: {
                const item = available.found.item;
                if (item.cost > party.currency) return;

                push_party_change(party, change_party_add_item(item.data));
                push_party_change(party, change_party_set_currency(party.currency - item.cost, true));

                break;
            }

            default: unreachable(available.found);
        }

        mark_available_purchase_as_sold_out(available.merchant, req.purchase_id);

        return {
            party_updates: party.changes.slice(req.current_head),
            updated_entity: available.merchant
        }
    });
});

function register_dev_handlers() {
    register_api_handler(Api_Request_Type.get_debug_ai_data, req => {
        return make_ok(get_debug_ai_data());
    });

    register_api_handler(Api_Request_Type.editor_create_battleground, req => {
        const created = make_new_battleground(req.name, req.world_origin, req.theme);

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
        if (req.id == 0) {
            return make_error(400); // Some things rely on 0th bg existing
        }

        delete_battleground_by_id(req.id);

        return make_ok({});
    });

    register_api_handler(Api_Request_Type.editor_duplicate_battleground, req => {
        const battleground = find_battleground_by_id(req.id);

        if (!battleground) {
            return make_error(400);
        }

        const new_id = duplicate_battleground(battleground);

        return make_ok({
            new_id: new_id
        });
    });

    register_api_handler(Api_Request_Type.editor_list_battlegrounds, req => {
        const battlegrounds = get_all_battlegrounds().map(bg => ({
            id: bg.id,
            name: bg.name,
            size: {
                x: bg.grid_size.x,
                y: bg.grid_size.y
            }
        }));

        return make_ok({
            battlegrounds: battlegrounds
        });
    });

    register_api_handler(Api_Request_Type.editor_playtest_battleground, req => {
        return with_player_on_adventure(req, (player, state) => {
            const entity = state.ongoing_adventure.entities.find(entity => entity.id == req.enemy);

            if (!entity) return;
            if (entity.definition.type != Adventure_Entity_Type.enemy) return;

            const battleground = find_battleground_by_id(req.battleground);

            if (!battleground) {
                return;
            }

            const id_generator = sequential_id_generator();

            const battle = start_battle(battle_id_generator(), id_generator, random, [
                player_to_adventure_battle_participant(id_generator, player.id, state),
                adventure_enemy_to_battle_participant(id_generator, entity.id, entity.definition)
            ], battleground);

            battles.push(battle);

            transition_player_to_battle(player, battle, true);

            return player_to_player_state_object(player);
        });
    });

    register_api_handler(Api_Request_Type.editor_action, req => {
        return with_player_on_adventure(req, (player, state) => {
            apply_editor_action(state.ongoing_adventure, req);

            return {};
        });
    });

    register_api_handler(Api_Request_Type.editor_get_room_details, req => {
        return with_player_on_adventure(req, (player, state) => {
            const current_room = state.ongoing_adventure.current_room;

            return {
                id: current_room.id,
                type: current_room.type,
                name: current_room.name,
                camera_restriction_zones: current_room.camera_restriction_zones,
                entrance_location: {
                    x: current_room.entrance_location.x,
                    y: current_room.entrance_location.y
                },
                exits: current_room.exits.map(exit => ({
                    ...exit,
                    name: room_by_id(state.ongoing_adventure.adventure, exit.to)!.name
                }))
            };
        });
    });

    register_api_handler(Api_Request_Type.editor_create_entity, req => {
        return with_player_on_adventure(req, (player, state) => {
            return editor_create_entity(state.ongoing_adventure, req.definition);
        });
    });

    register_api_handler(Api_Request_Type.editor_get_merchant_stock, req => {
        return with_player_on_adventure(req, (player, state) => {
            const merchant = state.ongoing_adventure.entities.find(entity => entity.id == req.merchant);

            if (!merchant) return;
            if (merchant.definition.type != Adventure_Entity_Type.merchant) return;

            return merchant.definition.stock;
        });
    });

    register_api_handler(Api_Request_Type.editor_reroll_merchant_stock, req => {
        return with_player_on_adventure(req, (player, state) => {
            const merchant = state.ongoing_adventure.entities.find(entity => entity.id == req.merchant);

            if (!merchant) return;
            if (merchant.type != Adventure_Entity_Type.merchant) return;

            apply_editor_action(state.ongoing_adventure, {
                type: Adventure_Editor_Action_Type.reroll_merchant_stock,
                entity_id: merchant.id
            });

            return merchant.stock;
        });
    });

    register_api_handler(Api_Request_Type.editor_list_rooms, req => {
        return with_player_on_adventure(req, (player, state) => {
            const rooms = state.ongoing_adventure.adventure.rooms.map(room => ({
                id: room.id,
                name: room.name
            }));

            return {
                rooms
            }
        });
    });

    register_api_handler(Api_Request_Type.adventure_party_cheat, req => {
        return with_player_on_adventure(req, (player, state) => {
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
            const party = state.party;

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

                case "item": {
                    const equipment = parse_enum_query(parts[1], enum_names_to_values<Adventure_Equipment_Item_Id>());
                    const consumables = parse_enum_query(parts[1], enum_names_to_values<Adventure_Consumable_Item_Id>());

                    for (const id of equipment) {
                        const entity_id = state.ongoing_adventure.next_party_entity_id();
                        push_party_change(party, change_party_add_item(adventure_equipment_item_id_to_item(entity_id, id)));
                    }

                    for (const id of consumables) {
                        const entity_id = state.ongoing_adventure.next_party_entity_id();
                        push_party_change(party, change_party_add_item(adventure_consumable_item_id_to_item(entity_id, id)));
                    }

                    break;
                }

                case "hp": {
                    const health = parseInt(parts[2]);
                    const targets = parse_enum_query(parts[1], enum_names_to_values<Hero_Type>());

                    for (const [index, slot] of party.slots.entries()) {
                        if (slot.type == Adventure_Party_Slot_Type.hero && targets.indexOf(slot.hero) != -1) {
                            push_party_change(party, change_party_set_health(index, health, Adventure_Health_Change_Reason.combat));
                        }
                    }

                    break;
                }

                case "rm": {
                    for (let index = 1; index < parts.length; index++) {
                        const slot = parseInt(parts[index]) - 1;

                        push_party_change(party, change_party_empty_slot(slot));
                    }

                    break;
                }

                case "gold": {
                    const gold = parseInt(parts[1]);

                    push_party_change(party, change_party_set_currency(party.currency + gold));

                    break;
                }
            }

            return {
                party_updates: party.changes.slice(req.current_head)
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
    eval.call(global, readFileSync("dist/battle_sim.js", "utf8"));
    eval.call(global, readFileSync("dist/party_sim.js", "utf8"));

    dev_mode = dev;

    // TODO this is xorshift32, replace with a better algo
    //      https://github.com/bryc/code/blob/master/jshash/PRNGs.md
    random = new Random(function(a) {
        return function() {
            a ^= a << 25; a ^= a >>> 7; a ^= a << 2;
            return (a >>> 0) / 4294967296;
        }
    }(seed));

    random_seed = seed;

    {
        const ok = load_all_battlegrounds();

        if (ok) {
            console.log("Battlegrounds loaded");
        } else {
            console.error("Unable to load battlegrounds");
            process.exit(-1);
        }
    }

    {
        const ok = load_all_adventures();

        if (ok) {
            console.log("Adventures loaded");
        } else {
            console.error("Unable to load adventures");
            process.exit(-1);
        }
    }

    const game_html = static_file("dist/game.html");
    const battle_sim = static_file("dist/battle_sim.js");
    const web_main = static_file("dist/web_main.js");

    setInterval(check_and_disconnect_offline_players, 1000);

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