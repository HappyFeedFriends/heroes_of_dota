import {
    adventure_editor_filter_mouse_click,
    battleground_editor_filter_mouse_click,
    editor,
    Editor_Type
} from "./editor_ui";
import {battle_filter_mouse_click, battle_process_state_transition} from "./battle_ui";
import {adventure_filter_mouse_click} from "./adventure_ui";
import {subscribe_to_net_table_key} from "./interop";

export let current_state = Player_State.not_logged_in;

export const global_map_ui_root = $("#global_map_ui");
export const adventure_ui_root = $("#adventure_ui");

if (Game.IsInToolsMode()) {
    Error.prototype.toString = function (this: Error) {
        this.stack = this.stack!.replace(/\.vjs_c/g, '.js');

        // toString is called by panorama with empty call stack
        if (new Error().stack!.match(/\n/g)!.length !== 1) return this.stack;

        return this.stack;
    };
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

hide_default_ui();
setup_mouse_filter();
clean_up_particles_after_reload();

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
        GameUI.SetCameraDistance(Const.map_camera_height);
        GameUI.SetCameraYaw(0);
        GameUI.SetCameraPitchMin(60);
        GameUI.SetCameraPitchMax(60);
    }

    if (current_state != data.state) {
        battle_process_state_transition(current_state, data);

        current_state = data.state;
    }
});