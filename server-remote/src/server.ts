import {createServer} from "http";
import {randomBytes} from "crypto"
import {start_battle} from "./battle";
import {unreachable, XY, xy} from "./common";

type Request_Handler = (body: string) => Request_Result;

const enum Result_Type {
    ok = 0,
    error = 1
}

const enum Right {
    submit_battle_action,
    log_in_with_character,
    attack_a_character,
    submit_movement
}

export interface Player {
    id: number;
    characters: Character[];
    current_character: Character | undefined;
    current_location: XY;
    movement_history: Movement_History_Entry[];
    state: Player_State;
}

interface Character {
    id: number;
}

const players: Player[] = [];
const token_to_player = new Map<string, Player>();
const steam_id_to_player = new Map<string, Player>();

let player_id_auto_increment = 0;
let character_id_auto_increment = 0;

 // TODO remove
    const test_player = make_new_player();
    players.push(test_player);
    test_player.movement_history = [{
        location_x: 0,
        location_y: 0,
        order_x: 0,
        order_y: 0
    }];


function generate_access_token() {
    return randomBytes(32).toString("hex");
}

function make_new_player(): Player {
    return {
        id: player_id_auto_increment++,
        state: Player_State.not_logged_in,
        characters: [],
        current_character: undefined,
        current_location: xy(0, 0),
        movement_history: []
    }
}

function make_character(): Character {
    return {
        id: character_id_auto_increment++
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

function try_do_with_player<T>(access_token: string, do_what: (player: Player) => T | undefined): Do_With_Player_Result<T> {
    const player = token_to_player.get(access_token);

    if (!player) {
        return { type: Do_With_Player_Result_Type.unauthorized };
    }

    const data = do_what(player);

    if (data) {
        return { type: Do_With_Player_Result_Type.ok, data: data };
    } else {
        return { type: Do_With_Player_Result_Type.error };
    }
}

function player_action_to_result<N, T>(result: Do_With_Player_Result<N>, map?: (data: N) => T): Request_Result {
    switch (result.type) {
        case Do_With_Player_Result_Type.ok: {
            if (map) {
                return make_ok_json<T>(map(result.data));
            } else {
                return make_ok_json<N>(result.data);
            }
        }

        case Do_With_Player_Result_Type.error: {
            return make_error(400);
        }

        case Do_With_Player_Result_Type.unauthorized: {
            return make_error(403);
        }
    }
}

function player_by_id(player_id: number) {
    return players.find(player => player.id == player_id);
}

function create_new_character_for_player(player: Player): Character {
    const new_character = make_character();

    player.characters.push(new_character);

    return new_character;
}

function try_authorize_steam_player_from_dedicated_server(steam_id: string) {
    let player = steam_id_to_player.get(steam_id);

    if (!player) {
       player = make_new_player();
       steam_id_to_player.set(steam_id, player);
       players.push(player)
    }

    const token = generate_access_token();
    token_to_player.set(token, player);

    return token;
}

function get_player_characters(player: Player) {
    return player.characters;
}

function login_with_character(player: Player, character_id: number) {
    const character = player.characters.find(character => character.id == character_id);

    if (!character) {
        return undefined;
    }

    player.current_character = character;
    player.state = Player_State.on_global_map;

    return character;
}

interface Result_Ok {
    type: Result_Type.ok;
    content?: string;
}

interface Result_Error {
    type: Result_Type.error;
    code: number;
}

const handlers = new Map<string, Request_Handler>();

function character_to_json_object(character: Character): Character_Data {
    return {
        id: character.id
    };
}

function player_to_player_state_object(player: Player): Player_State_Data {
    return {
        state: player.state,
        player_position: {
            x: player.current_location.x,
            y: player.current_location.y
        }
    }
}

function can_player(player: Player, right: Right) {
    switch (right) {
        case Right.log_in_with_character: {
            return player.state == Player_State.not_logged_in;
        }

        case Right.attack_a_character: {
            return player.state == Player_State.on_global_map;
        }

        case Right.submit_movement: {
            return player.state == Player_State.on_global_map;
        }

        case Right.submit_battle_action: {
            return player.state == Player_State.in_battle;
        }

    }

    return unreachable(right);
}

function validate_dedicated_server_key(key: string) {
    return true;
}

// TODO automatically validate dedicated key on /trusted path
// TODO don't forget that elements in JSON array can be null
handlers.set("/trusted/try_authorize_steam_user", body => {
    const request = JSON.parse(body) as {
        dedicated_server_key: string,
        steam_id: string
    };

    if (!validate_dedicated_server_key(request.dedicated_server_key)) {
        return make_error(403);
    }

    const token = try_authorize_steam_player_from_dedicated_server(request.steam_id);

    return make_ok_json({
        token: token
    });
});

handlers.set("/get_player_state", body => {
    const request = JSON.parse(body) as Get_Player_State_Request;
    const player_state = try_do_with_player(request.access_token, player_to_player_state_object);

    return player_action_to_result(player_state);
});

handlers.set("/get_player_characters", body => {
    const request = JSON.parse(body) as Get_Player_Characters_Request;
    const characters = try_do_with_player(request.access_token, get_player_characters);

    return player_action_to_result<Character[], Get_Player_Characters_Response>(characters, characters => characters.map(character_to_json_object));
});

handlers.set("/create_new_character", body => {
    const request = JSON.parse(body) as Create_New_Character_Request;
    const character = try_do_with_player(request.access_token, create_new_character_for_player);

    return player_action_to_result<Character, Create_New_Character_Response>(character, character_to_json_object);
});

handlers.set("/login_with_character", body => {
    type Player_With_Character = { player: Player, character: Character };

    const request = JSON.parse(body) as Login_With_Character_Request;
    const result = try_do_with_player<Player_With_Character>(request.access_token, player => {
        if (!can_player(player, Right.log_in_with_character)) {
            return undefined;
        }

        const character = login_with_character(player, request.character_id);

        if (character) {
            return {
                player: player,
                character: character
            }
        }
    });

    return player_action_to_result<Player_With_Character, Player_State_Data>(result, result => player_to_player_state_object(result.player));
});

handlers.set("/trusted/submit_player_movement", body => {
    const request = JSON.parse(body) as Submit_Player_Movement_Request;

    if (!validate_dedicated_server_key(request.dedicated_server_key)) {
        return make_error(403);
    }

    const ok = try_do_with_player(request.access_token, player => {
        if (!can_player(player, Right.submit_movement)) {
            return undefined;
        }

        player.current_location = xy(request.current_location.x, request.current_location.y);
        player.movement_history = request.movement_history.map(entry => ({
            order_x: entry.order_x,
            order_y: entry.order_y,
            location_x: entry.location_x,
            location_y: entry.location_y
        }));

        if (true) {
            test_player.current_location = xy(request.current_location.x + 800, request.current_location.y);
            test_player.movement_history = request.movement_history.map(entry => ({
                order_x: entry.order_x + 800,
                order_y: entry.order_y,
                location_x: entry.location_x + 800,
                location_y: entry.location_y
            }));
        }

        return true;
    });

    return player_action_to_result<boolean, Submit_Player_Movement_Response>(ok, () => ({}));
});

// TODO not necessarily has to be trusted, right? It's just a read, though might be a heavy one
handlers.set("/trusted/query_players_movement", body => {
    const request = JSON.parse(body) as Query_Players_Movement_Request;

    if (!validate_dedicated_server_key(request.dedicated_server_key)) {
        return make_error(403);
    }

    const player_locations = try_do_with_player<Query_Players_Movement_Response>(request.access_token, requesting_player => {
        return players.filter(player => player != requesting_player).map(player => ({
            id: player.id,
            movement_history: player.movement_history.map(entry => ({
                order_x: entry.order_x,
                order_y: entry.order_y,
                location_x: entry.location_x,
                location_y: entry.location_y
            })),
            current_location: {
                x: player.current_location.x,
                y: player.current_location.y
            }
        }))
    });

    return player_action_to_result(player_locations);
});

handlers.set("/trusted/attack_player", body => {
    const request = JSON.parse(body) as Attack_Player_Request;

    if (!validate_dedicated_server_key(request.dedicated_server_key)) {
        return make_error(403);
    }

    const ok = try_do_with_player(request.access_token, player => {
        if (!can_player(player, Right.attack_a_character)) {
            return undefined;
        }

        const other_player = player_by_id(request.target_player_id);

        if (!other_player) {
            return false;
        }

        player.state = Player_State.in_battle;
        other_player.state = Player_State.in_battle;

        start_battle([
            player,
            other_player
        ]);

        return true;
    });

    return player_action_to_result<boolean, Attack_Player_Response>(ok, () => ({}));
});

type Request_Result = Result_Ok | Result_Error;

function make_error(code: number): Result_Error {
    return { type: Result_Type.error, code: code };
}

function make_ok(result: string): Result_Ok {
    return { type: Result_Type.ok, content: result };
}

function make_ok_json<T>(data: T): Result_Ok {
    return make_ok(JSON.stringify(data));
}

function handle_request(url: string, data: string): Request_Result {
    try {
        const handler = handlers.get(url);

        if (handler) {
            return handler(data);
        } else {
            return make_error(404);
        }
    } catch (error) {
        console.log(error);
        console.log(error.stack);

        return make_error(500);
    }
}

export function start_server() {
    createServer((req, res) => {
        const url = req.url;

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
            console.log(url, body);

            const result = handle_request(url, body);

            switch (result.type) {
                case Result_Type.ok: {
                    res.writeHead(200, { "Content-Type": "text/json" });
                    res.end(result.content);
                    break;
                }

                case Result_Type.error: {
                    res.writeHead(result.code);
                    res.end();
                    break;
                }
            }
        });
    }).listen(3638);
}


/*
flow:
    try_auth -> token
    get_player_characters(token) -> characters

    if wants_to_create_new_character {
        create_new_character(token)
    }

    login_with_character(token, char) -> position

    while(true)
        if in_world {
            report_player_movement(token, current_position)
            query_players_movement(token) -> other_player_with_movement
        }

        if wants_to_battle {
            start_battle(token, other_player_id)
        }

        if in_battle {
            query_battle_actions(token, latest_action_we_have) -> actions_after_specified

            if wants_to_act {
                send_battle_action(token, action)
            }
        }
 */
