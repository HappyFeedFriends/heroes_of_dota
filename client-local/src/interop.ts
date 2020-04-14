import {
    adventure_net_table_parser,
    client_event_payload_parser,
    game_net_table_parser,
    local_api_response_parser
} from "./reflection";

type Player_Name_Callback = (name: string) => void;

const remote_root = Game.IsInToolsMode() ? "http://127.0.0.1:3638" : "http://cia-is.moe:3638";
const player_name_storage: Record<number, string> = {};
const player_name_requests: Record<number, Player_Name_Callback[]> = {};

type Api_Response<T> = {
    ok: true
    body: T
} | {
    ok: false
}

let local_request_id_counter = 0;

const ongoing_local_requests: Record<number, (body: object) => void> = {};

function next_local_request_id() {
    return local_request_id_counter++ as Local_Api_Request_Id;
}

function get_net_table<T>(table_name: string, key: string): T {
    return CustomNetTables.GetTableValue(table_name, key) as T;
}

export function get_visualiser_delta_head(): number | undefined {
    const net_table = get_net_table<Game_Net_Table>("main", "game");

    if (net_table.state == Player_State.in_battle) {
        return net_table.battle.current_visual_head;
    }

    return undefined;
}

export function get_access_token() {
    const net_table = get_net_table<Game_Net_Table>("main", "game");

    if (net_table.state == Player_State.not_logged_in) {
        return "";
    }

    return net_table.token;
}

export function api_request<T extends Api_Request_Type>(type: T, body: Find_Request<T>, callback: (response: Find_Response<T>) => void, fail?: () => void) {
    $.AsyncWebRequest(remote_root + "/api" + type, {
        type: "POST",
        data: { json_data: JSON.stringify(body) },
        timeout: 10000,
        success: response => callback(JSON.parse(response)),
        error: () => {
            if (fail) {
                fail();
            }
        }
    });
}

export function async_api_request<T extends Api_Request_Type>(type: T, body: Find_Request<T>): Promise<Find_Response<T>> {
    const promise = new Promise<Find_Response<T>>((resolve, reject) => {
        $.AsyncWebRequest(remote_root + "/api" + type, {
            type: "POST",
            data: { json_data: JSON.stringify(body) },
            timeout: 10000,
            success: response => resolve(JSON.parse(response)),
            error: () => {
                reject();
            }
        });
    });

    promise.catch(error => $.Msg("Error", error));

    return promise;
}

const parser_cache: Record<number, (data: object) => any> = {};

function get_or_create_api_request_parser<T extends Local_Api_Request_Type>(type: T) {
    const existing = parser_cache[type];

    if (existing) {
        return existing;
    }

    const new_parser = local_api_response_parser(type);
    parser_cache[type] = new_parser;
    return new_parser;
}

export function async_local_api_request<T extends Local_Api_Request_Type>(type: T, body: Find_Local_Request<T>): Promise<Api_Response<Find_Local_Response<T>>> {
    const parser = get_or_create_api_request_parser(type);

    const packet: Local_Api_Request_Packet = {
        type: type,
        body: body,
        request_id: next_local_request_id()
    };

    if (type != Local_Api_Request_Type.editor_action) {
        $.Msg(`Request ${packet.request_id}/${enum_to_string<Local_Api_Request_Type>(type)}`);
    }

    const promise = new Promise<Api_Response<Find_Local_Response<T>>>(resolve => {
        const timeout = $.Schedule(10, () => {
            if (!ongoing_local_requests[packet.request_id]) {
                return;
            }

            delete ongoing_local_requests[packet.request_id];

            $.Msg(`Request timeout in ${packet.request_id}/${enum_to_string<Local_Api_Request_Type>(type)}`);

            resolve({ ok: false });
        });

        ongoing_local_requests[packet.request_id] = (body: any) => {
            if (type != Local_Api_Request_Type.editor_action) {
                $.Msg(`Response for ${enum_to_string<Local_Api_Request_Type>(type)}: ${body}`);
            }

            resolve({
                ok: true,
                body: parser(body)
            });

            delete ongoing_local_requests[packet.request_id];

            $.CancelScheduled(timeout);
        };

        GameEvents.SendCustomGameEventToServer(Prefixes.local_api_request, packet);
    });

    promise.catch(error => $.Msg("Error", error));

    return promise;
}

export function async_get_player_name(player_id: Player_Id, callback: Player_Name_Callback): void {
    const cached_name = player_name_storage[player_id];

    if (cached_name) {
        callback(cached_name);
        return;
    }

    let callbacks = player_name_requests[player_id];

    if (!callbacks) {
        callbacks = [ callback ];

        player_name_requests[player_id] = callbacks;
    } else {
        callbacks.push(callback);
    }

    api_request(Api_Request_Type.get_player_name, { access_token: get_access_token(), player_id: player_id }, data => {
        const callbacks = player_name_requests[player_id];

        if (callbacks) {
            for (const callback of callbacks) {
                callback(data.name);
            }

            delete player_name_requests[player_id];
        }

        player_name_storage[player_id] = data.name;
    }, () => delete player_name_requests[player_id]);
}

export function fire_event<T extends To_Server_Event_Type>(type: T, data: Find_To_Server_Payload<T>) {
    GameEvents.SendCustomGameEventToServer(`${Prefixes.to_server_event}${type}`, data);
}

export function subscribe_to_custom_event<T extends To_Client_Event_Type>(type: T, handler: (data: Find_To_Client_Payload<T>) => void) {
    const parser = client_event_payload_parser(type);

    GameEvents.Subscribe(`${Prefixes.to_client_event}${type}`, event_data => {
        handler(parser(event_data));
    })
}

export function subscribe_to_adventure_net_table(table: string, key: string, callback: (data: Adventure_Net_Table) => void) {
    const parser = adventure_net_table_parser();

    subscribe_to_net_table_key(table, key, object => {
        callback(parser(object));
    });
}

export function subscribe_to_game_net_table_key(table: string, key: string, callback: (data: Game_Net_Table) => void) {
    const parser = game_net_table_parser();

    subscribe_to_net_table_key(table, key, object => {
        callback(parser(object));
    });
}

function subscribe_to_net_table_key(table: string, key: string, callback: (data: object) => void){
    const listener = CustomNetTables.SubscribeNetTableListener(table, function(table, table_key, data){
        if (key == table_key){
            if (!data) {
                return;
            }

            callback(data);
        }
    });

    $.Schedule(0, () => {
        const data = CustomNetTables.GetTableValue(table, key);

        if (data) {
            callback(data);
        }
    });

    return listener;
}

function subscribe_to_raw_custom_event<T extends object>(event_name: string, handler: (data: T) => void) {
    GameEvents.Subscribe(event_name, event_data => {
        handler(event_data as T);
    })
}

subscribe_to_raw_custom_event<Local_Api_Response_Packet>(Prefixes.local_api_response, packet => {
    const handler = ongoing_local_requests[packet.request_id];

    if (handler) {
        handler(packet.body);
    }
});
