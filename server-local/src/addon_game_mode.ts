declare function GetDedicatedServerKey(version: string): string;

declare namespace json {
    function decode(input: string): object;
    function encode(input: object): string;
}

declare interface Coroutine<T> {}

declare namespace coroutine {
    function create<T>(code: () => T): Coroutine<T>;
    function yield<T>(coroutine: Coroutine<T>, result?: T): T;
    function resume<T>(coroutine: Coroutine<T>, result?: T): T;
    function running<T>(): Coroutine<T> | undefined;
}


// End declarations

function Activate() { main(); }
function Precache(context: CScriptPrecacheContext) {
    PrecacheResource("", "", context);
}

interface Player {
    id: number;
    hero_unit: CDOTA_BaseNPC_Hero;
    movement_history: Movement_History_Entry[]
}

interface Main_Player {
    token: string;
    player_id: PlayerID;
    last_submitted_movement_history_at: number;
    last_updated_movement_history_at: number;
    hero_unit?: CDOTA_BaseNPC_Hero; // TODO shouldn't be optional
    movement_history: Movement_History_Entry[]
    current_order_x: number;
    current_order_y: number;
}

interface Character {
    id: number;
}

let main_player: Main_Player;

const players: { [id: string]: Player } = {};
const movement_history_submit_rate = 0.7;
const movement_history_length = 30;

function get_dedicated_server_key() {
    return GetDedicatedServerKey("v1");
}

function main() {
    const mode = GameRules.GetGameModeEntity();

    mode.SetCustomGameForceHero("npc_dota_hero_lina");
    mode.SetFogOfWarDisabled(true);

    GameRules.SetPreGameTime(0);
    GameRules.SetCustomGameSetupAutoLaunchDelay(0);
    GameRules.SetCustomGameSetupTimeout(0);
    GameRules.SetCustomGameSetupRemainingTime(0);

    ListenToGameEvent("game_rules_state_change", () => {
        const new_state = GameRules.State_Get();

        if (new_state == DOTA_GameState.DOTA_GAMERULES_STATE_GAME_IN_PROGRESS) {
            start_game();
        }
    }, null);

    ListenToGameEvent("player_connect_full", event => {
        const id = event.PlayerID;

        coroutine.resume(coroutine.create(() => {
            on_player_connected(id);
        }));
    }, null);
}

function submit_player_movement(hero_unit: CDOTA_BaseNPC_Hero) {
    const current_location = hero_unit.GetAbsOrigin();
    const request: Submit_Player_Movement_Request = {
        access_token: main_player.token,
        current_location: {
            x: current_location.x,
            y: current_location.y
        },
        movement_history: main_player.movement_history.map(entry => ({
            order_x: entry.order_x,
            order_y: entry.order_y,
            location_x: entry.location_x,
            location_y: entry.location_y
        })),
        dedicated_server_key: get_dedicated_server_key()
    };

    remote_request_async("/trusted/submit_player_movement", request, () => {});
}

function on_player_order(event: ExecuteOrderEvent) {
    if (!main_player.hero_unit) {
        return;
    }

    for (let index in event.units) {
        if (event.units[index] == main_player.hero_unit.entindex()) {
            main_player.current_order_x = event.position_x;
            main_player.current_order_y = event.position_y;

            break;
        }
    }
}

function create_new_player_from_response(response: Player_Movement_Data): Player {
    const current_location = response.movement_history[response.movement_history.length - 1];

    return {
        id: response.id,
        movement_history: response.movement_history,
        hero_unit: CreateUnitByName(
            "npc_dota_hero_lina",
            Vector(current_location.location_x, current_location.location_y),
            true,
            null,
            null,
            DOTATeam_t.DOTA_TEAM_GOODGUYS
        ) as CDOTA_BaseNPC_Hero
    };
}

function update_player_from_movement_history(player: Player) {
    const current_unit_position = player.hero_unit.GetAbsOrigin();
    const snap_distance = 400;
    const snap_distance_squared = snap_distance * snap_distance;

    let closest_entry: Movement_History_Entry | undefined;
    let minimum_distance = 1e6;
    let closest_entry_index = 0;

    player.movement_history.forEach((entry, entry_index) => {
        const delta = current_unit_position - Vector(entry.location_x, entry.location_y) as Vec;
        const distance = delta.Length2D();

        if (distance <= snap_distance_squared && distance <= minimum_distance) {
            minimum_distance = distance;
            closest_entry = entry;
            closest_entry_index = entry_index;
        }
    });

    // player.hero_unit.SetBaseMoveSpeed(295 + (movement_history_length - closest_entry_index) * 20);

    if (closest_entry) {
        player.hero_unit.MoveToPosition(Vector(closest_entry.order_x, closest_entry.order_y));
    } else {
        const last_entry = player.movement_history[player.movement_history.length - 1];

        player.hero_unit.SetAbsOrigin(Vector(last_entry.location_x, last_entry.location_y));
        player.hero_unit.MoveToPosition(Vector(last_entry.order_x, last_entry.order_y));

    }
}

function query_other_players_movement() {
    const request: Query_Players_Movement_Request = {
        access_token: main_player.token,
        dedicated_server_key: get_dedicated_server_key()
    };

    remote_request_async<Query_Players_Movement_Request, Query_Players_Movement_Response>("/trusted/query_players_movement", request, response => {
        response.forEach(player_data => {
            const player = players[player_data.id] as Player | undefined;

            if (player) {
                player.movement_history = player_data.movement_history;

                update_player_from_movement_history(player);
            } else {
                const new_player = create_new_player_from_response(player_data);

                players[new_player.id] = new_player;

                update_player_from_movement_history(new_player);
            }
        })
    });
}

function update_main_player_movement_history(hero_unit: CDOTA_BaseNPC_Hero) {
    const location = hero_unit.GetAbsOrigin();

    main_player.movement_history.push({
        order_x: main_player.current_order_x,
        order_y: main_player.current_order_y,
        location_x: location.x,
        location_y: location.y
    });

    if (main_player.movement_history.length > movement_history_length) {
        main_player.movement_history.shift();
    }
}

function update() {
    const time_now = GameRules.GetGameTime();
    const hero_unit = main_player.hero_unit;

    // TODO we can subscribe to hero spawn
    if (!hero_unit) {
        const player_handle = PlayerResource.GetPlayer(main_player.player_id);
        const assigned_hero = player_handle.GetAssignedHero();

        if (assigned_hero) {
            main_player.hero_unit = assigned_hero;
        }

        return;
    }

    update_main_player_movement_history(hero_unit);

    if (time_now >= main_player.last_submitted_movement_history_at + movement_history_submit_rate) {
        main_player.last_submitted_movement_history_at = time_now;

        submit_player_movement(hero_unit);
        query_other_players_movement();
    }
}

const remote_root = "http://127.0.0.1:3637";

function init_player_related_handlers() {
    const mode = GameRules.GetGameModeEntity();

    mode.SetContextThink("main_think", () => {
        update();
        return 0;
    }, 0);

    mode.SetExecuteOrderFilter((context, event) => {
        on_player_order(event);

        return true;
    }, mode);
}

function on_player_connected(id: PlayerID) {
    PlayerResource.GetPlayer(id).SetTeam(DOTATeam_t.DOTA_TEAM_GOODGUYS);

    const token_result = remote_request<Authorize_Steam_User_Request, Authorize_Steam_User_Response>("/trusted/try_authorize_steam_user", {
        steam_id: PlayerResource.GetSteamID(id).toString(),
        dedicated_server_key: get_dedicated_server_key()
    });

    if (!token_result) {
        throw "Unable to acquire token for player";
    }

    const token = token_result.token;

    main_player = {
        player_id: id,
        token: token,
        last_submitted_movement_history_at: 0,
        last_updated_movement_history_at: 0,
        movement_history: [],
        current_order_x: 0,
        current_order_y: 0
    };

    const characters = remote_request<Get_Player_Characters_Request, Character[]>("/get_player_characters", { access_token: token });

    if (!characters) {
        throw "Unable to acquire characters";
    }

    if (characters.length == 0) {
        const new_character = remote_request<Create_New_Character_Request, Character>("/create_new_character", { access_token: token });

        print(new_character);
    } else {
        remote_request("/login_with_character", {
            access_token: token,
            character_id: characters[0].id
        });

        print("Characters", characters);
    }

    init_player_related_handlers();
}


function remote_request_async<T extends Object, N extends Object>(endpoint: string, body: T, callback: (data: N) => void) {
    const request = CreateHTTPRequestScriptVM("POST", remote_root + endpoint);

    request.SetHTTPRequestRawPostBody("application/json", json.encode(body));
    request.Send(response => {
        if (response.StatusCode == 200) {
            callback(json.decode(response.Body) as N);
        } else {
            print("Error executing request to", endpoint, response.StatusCode, response.Body);
        }
    });
}

function remote_request<T extends Object, N extends Object>(endpoint: string, body: T): N | undefined {
    const request = CreateHTTPRequestScriptVM("POST", remote_root + endpoint);
    const current_coroutine = coroutine.running() as Coroutine<N>;

    if (!current_coroutine) {
        throw "Not in a coroutine!";
    }

    request.SetHTTPRequestRawPostBody("application/json", json.encode(body));
    request.Send(response => {
        if (response.StatusCode == 200) {
            coroutine.resume(current_coroutine, json.decode(response.Body) as N);
        } else {
            print("Error executing request to", endpoint, response.StatusCode, response.Body);
            coroutine.resume(current_coroutine, undefined);
        }
    });

    return coroutine.yield(current_coroutine);
}

function start_game() {
    // CreateHTTPRequestScriptVM("GET", "http://127.0.0.1:3637/trusted/try_authorize_steam_user")

    print("DOGS AND RATS");
}