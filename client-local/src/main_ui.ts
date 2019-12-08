type XYZ = { x: number, y: number, z: number };
type RGB = [ number, number, number ] & { _color_id_brand: any };
type Player_Name_Callback = (name: string) => void;

$.Msg("TS initialized");

const remote_root = Game.IsInToolsMode() ? "http://127.0.0.1:3638" : "http://cia-is.moe:3638";
const player_name_storage: Record<number, string> = {};
const player_name_requests: Record<number, Player_Name_Callback[]> = {};
const map_camera_height = 1300;

let current_state = Player_State.not_logged_in;

const global_map_ui_root = $("#global_map_ui");
const adventure_ui_root = $("#adventure_ui");

let local_request_id_counter = 0;

const ongoing_local_requests: Record<number, (body: object) => void> = {};

function next_local_request_id() {
    return local_request_id_counter++ as Local_Api_Request_Id;
}

function api_request<T extends Api_Request_Type>(type: T, body: Find_Request<T>, callback: (response: Find_Response<T>) => void, fail?: () => void) {
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

function async_api_request<T extends Api_Request_Type>(type: T, body: Find_Request<T>): Promise<Find_Response<T>> {
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

function async_local_api_request<T extends Local_Api_Request_Type>(type: T, body: Find_Local_Request<T>): Promise<Find_Local_Response<T>> {
    const packet: Local_Api_Request_Packet = {
        type: type,
        body: body,
        request_id: next_local_request_id()
    };

    $.Msg(`Request ${enum_to_string<Local_Api_Request_Type>(type)}`);

    const promise = new Promise<Find_Local_Response<T>>((resolve, reject) => {
        const timeout = $.Schedule(10, () => {
            if (!ongoing_local_requests[packet.request_id]) {
                return;
            }

            delete ongoing_local_requests[packet.request_id];

            reject();
        });

        ongoing_local_requests[packet.request_id] = (body: any) => {
            $.Msg(`Response for ${enum_to_string<Local_Api_Request_Type>(type)}: ${body}`);

            resolve(body);

            delete ongoing_local_requests[packet.request_id];

            $.CancelScheduled(timeout);
        };

        GameEvents.SendCustomGameEventToServer(Prefixes.local_api_request, packet);
    });

    promise.catch(error => $.Msg("Error", error));

    return promise;
}

function async_get_player_name(player_id: Player_Id, callback: Player_Name_Callback): void {
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

function fire_event<T extends To_Server_Event_Type>(type: T, data: Find_To_Server_Payload<T>) {
    GameEvents.SendCustomGameEventToServer(`${Prefixes.to_server_event}${type}`, data);
}

function get_net_table<T>(table_name: string, key: string): T {
    return CustomNetTables.GetTableValue(table_name, key) as T;
}

function get_access_token() {
    const net_table = get_net_table<Game_Net_Table>("main", "game");

    if (net_table.state == Player_State.not_logged_in) {
        return "";
    }

    return net_table.token;
}

function get_visualiser_delta_head(): number | undefined {
    const net_table = get_net_table<Game_Net_Table>("main", "game");

    if (net_table.state == Player_State.in_battle) {
        return net_table.battle.current_visual_head;
    }

    return undefined;
}

function xyz(x: number, y: number, z: number): XYZ {
    return { x: x, y: y, z: z };
}

function xyz_to_array(xyz: XYZ): [ number, number, number ] {
    return [xyz.x, xyz.y, xyz.z];
}

function rgb(r: number, g: number, b: number): RGB {
    return [r, g, b] as RGB;
}

function get_screen_world_position(cursor: [number, number]): XYZ | undefined {
    const position = GameUI.GetScreenWorldPosition(cursor);

    if (!position) {
        return;
    }

    return xyz(position[0], position[1], position[2]);
}

function subscribe_to_raw_custom_event<T extends object>(event_name: string, handler: (data: T) => void) {
    GameEvents.Subscribe(event_name, event_data => {
        handler(event_data as T);
    })
}

function subscribe_to_custom_event<T extends To_Client_Event_Type>(type: T, handler: (data: Find_To_Client_Payload<T>) => void) {
    GameEvents.Subscribe(`${Prefixes.to_client_event}${type}`, event_data => {
        handler(event_data as Find_To_Client_Payload<T>);
    })
}

function subscribe_to_net_table_key<T>(table: string, key: string, callback: (data: T) => void){
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

function get_hero_name(hero: Hero_Type): string {
    const enum_string = enum_to_string(hero);

    return enum_string.split("_")
        .map(word => word[0].toUpperCase() + word.slice(1))
        .reduce((prev, value) => prev + " " + value);
}

function get_creep_name(creep: Creep_Type) {
    const enum_string = enum_to_string(creep);

    return enum_string.split("_")
        .map(word => word[0].toUpperCase() + word.slice(1))
        .reduce((prev, value) => prev + " " + value);
}

if (Game.IsInToolsMode()) {
    Error.prototype.toString = function (this: Error) {
        this.stack = this.stack!.replace(/\.vjs_c/g, '.js');

        // toString is called by panorama with empty call stack
        if (new Error().stack!.match(/\n/g)!.length !== 1) return this.stack;

        return this.stack;
    };
}

function safely_set_panel_background_image(panel: Panel, image: string) {
    panel.style.backgroundImage = `url('${image}')`;
    panel.AddClass("fix_bg");
    panel.RemoveClass("fix_bg");
}

function from_server_array<T>(array: Array<T>): Array<T> {
    const result: Array<T> = [];

    for (const index in array) {
        result[parseInt(index) - 1] = array[index];
    }

    return result;
}

interface Temporary_Storage_Panel extends Panel {
    temporary_particles: ParticleId[] | undefined;
}

function register_particle_for_reload(particle: ParticleId) {
    if (!Game.IsInToolsMode()) {
        return;
    }

    const storage = $.GetContextPanel() as Temporary_Storage_Panel;

    let array: ParticleId[] | undefined = storage.temporary_particles;

    if (!array) {
        array = [];
        storage.temporary_particles = array;
    }

    array.push(particle);
}

function destroy_fx(id: ParticleId) {
    Particles.DestroyParticleEffect(id, false);
    Particles.ReleaseParticleIndex(id);
}

function clean_up_particles_after_reload() {
    if (!Game.IsInToolsMode()) {
        return;
    }

    const storage = $.GetContextPanel() as Temporary_Storage_Panel;

    if (storage.temporary_particles) {
        for (const particle of storage.temporary_particles) {
            Particles.DestroyParticleEffect(particle, true);
            Particles.ReleaseParticleIndex(particle);
        }

        $.Msg(`Cleaned up ${storage.temporary_particles.length} temporary particles`);

        storage.temporary_particles = [];
    }
}

const enum Align_H { left, center, right}
const enum Align_V { top, center, bottom}

function position_panel_over_position_in_the_world(panel: Panel, position: XYZ, h: Align_H, v: Align_V) {
    const screen_ratio = Game.GetScreenHeight() / 1080;

    const screen_x = Game.WorldToScreenX(position.x, position.y, position.z);
    const screen_y = Game.WorldToScreenY(position.x, position.y, position.z);

    if (screen_x == -1 || screen_y == -1) {
        return;
    }

    let panel_offset_x = 0;
    let panel_offset_y = 0;

    if (h == Align_H.center) panel_offset_x = panel.actuallayoutwidth / 2.0;
    if (h == Align_H.left) panel_offset_x = panel.actuallayoutwidth;

    if (v == Align_V.center) panel_offset_y = panel.actuallayoutheight / 2.0;
    if (v == Align_V.top) panel_offset_y = panel.actuallayoutheight;

    panel.style.x = Math.floor(screen_x / screen_ratio - panel_offset_x) + "px";
    panel.style.y = Math.floor(screen_y / screen_ratio - panel_offset_y) + "px";
}

function setup_mouse_filter() {
    GameUI.SetMouseCallback((event, button) => {
        try {
            if (editor.type == Editor_Type.adventure) {
                const should_consume = adventure_editor_filter_mouse_click(editor, event, button);

                if (should_consume) {
                    return true;
                }
            }

            if (editor.type == Editor_Type.battleground) {
                battleground_editor_filter_mouse_click(editor, event, button);

                return true;
            }

            switch (current_state) {
                case Player_State.in_battle: return battle_filter_mouse_click(event, button);
                case Player_State.on_adventure: return adventure_filter_mouse_click(event, button);
            }

            return false;
        } catch (e) {
            $.Msg(e);

            return true;
        }
    });
}

function hide_default_ui() {
    GameUI.SetDefaultUIEnabled(DotaDefaultUIElement_t.DOTA_DEFAULT_UI_TOP_TIMEOFDAY, false);
    GameUI.SetDefaultUIEnabled(DotaDefaultUIElement_t.DOTA_DEFAULT_UI_TOP_HEROES, false);
    GameUI.SetDefaultUIEnabled(DotaDefaultUIElement_t.DOTA_DEFAULT_UI_FLYOUT_SCOREBOARD, false);
    GameUI.SetDefaultUIEnabled(DotaDefaultUIElement_t.DOTA_DEFAULT_UI_ACTION_MINIMAP, false);
    GameUI.SetDefaultUIEnabled(DotaDefaultUIElement_t.DOTA_DEFAULT_UI_ACTION_PANEL, false);
    GameUI.SetDefaultUIEnabled(DotaDefaultUIElement_t.DOTA_DEFAULT_UI_INVENTORY_PANEL, false);
    GameUI.SetDefaultUIEnabled(DotaDefaultUIElement_t.DOTA_DEFAULT_UI_INVENTORY_SHOP, false);
    GameUI.SetDefaultUIEnabled(DotaDefaultUIElement_t.DOTA_DEFAULT_UI_INVENTORY_ITEMS, false);
    GameUI.SetDefaultUIEnabled(DotaDefaultUIElement_t.DOTA_DEFAULT_UI_INVENTORY_QUICKBUY, false);
    GameUI.SetDefaultUIEnabled(DotaDefaultUIElement_t.DOTA_DEFAULT_UI_INVENTORY_COURIER, false);
    GameUI.SetDefaultUIEnabled(DotaDefaultUIElement_t.DOTA_DEFAULT_UI_INVENTORY_PROTECT, false);
    GameUI.SetDefaultUIEnabled(DotaDefaultUIElement_t.DOTA_DEFAULT_UI_INVENTORY_GOLD, false);
    GameUI.SetDefaultUIEnabled(DotaDefaultUIElement_t.DOTA_DEFAULT_UI_SHOP_SUGGESTEDITEMS, false);
    GameUI.SetDefaultUIEnabled(DotaDefaultUIElement_t.DOTA_DEFAULT_UI_HERO_SELECTION_TEAMS, false);
    GameUI.SetDefaultUIEnabled(DotaDefaultUIElement_t.DOTA_DEFAULT_UI_HERO_SELECTION_GAME_NAME, false);
    GameUI.SetDefaultUIEnabled(DotaDefaultUIElement_t.DOTA_DEFAULT_UI_HERO_SELECTION_CLOCK, false);
    GameUI.SetDefaultUIEnabled(DotaDefaultUIElement_t.DOTA_DEFAULT_UI_TOP_BAR_BACKGROUND, false);
    GameUI.SetDefaultUIEnabled(DotaDefaultUIElement_t.DOTA_DEFAULT_UI_TOP_MENU_BUTTONS, false);
    GameUI.SetDefaultUIEnabled(DotaDefaultUIElement_t.DOTA_DEFAULT_UI_ENDGAME, false);
    GameUI.SetDefaultUIEnabled(DotaDefaultUIElement_t.DOTA_DEFAULT_UI_ENDGAME_CHAT, false);
}

clean_up_particles_after_reload();
hide_default_ui();
setup_mouse_filter();

subscribe_to_raw_custom_event<Local_Api_Response_Packet>(Prefixes.local_api_response, packet => {
    const handler = ongoing_local_requests[packet.request_id];

    if (handler) {
        handler(packet.body);
    }
});

subscribe_to_net_table_key<Game_Net_Table>("main", "game", data => {
    global_map_ui_root.SetHasClass("active", data.state == Player_State.on_global_map);
    adventure_ui_root.SetHasClass("active", data.state == Player_State.on_adventure);
    $("#battle_ui").SetHasClass("active", data.state == Player_State.in_battle);
    $("#disconnected_ui").SetHasClass("active", data.state == Player_State.not_logged_in);

    if (data.state == Player_State.in_battle) {
        GameUI.SetCameraDistance(1400);
        GameUI.SetCameraYaw(0);
        GameUI.SetCameraPitchMin(60);
        GameUI.SetCameraPitchMax(60);
    } else if (data.state == Player_State.on_adventure) {
        GameUI.SetCameraDistance(1600);
        GameUI.SetCameraYaw(0);
        GameUI.SetCameraPitchMin(60);
        GameUI.SetCameraPitchMax(60);
    } else {
        GameUI.SetCameraDistance(map_camera_height);
        GameUI.SetCameraYaw(0);
        GameUI.SetCameraPitchMin(60);
        GameUI.SetCameraPitchMax(60);
    }

    if (current_state != data.state) {
        battle_process_state_transition(current_state, data);

        current_state = data.state;
    }
});