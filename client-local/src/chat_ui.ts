import {
    subscribe_to_custom_event,
    subscribe_to_game_net_table_key,
    async_get_player_name,
    api_request,
    get_access_token,
} from "./interop";

import {try_adventure_cheat} from "./adventure_ui";
import {try_battle_cheat} from "./battle_ui";
import {current_state} from "./main_ui";

function add_new_chat_messages(messages: Chat_Message[]) {
    const messages_panel = $("#chat_messages");

    for (const message of messages) {
        const message_panel = $.CreatePanel("Label", messages_panel, "");

        message_panel.text = `...: ${message.message}`;

        async_get_player_name(message.from_player_id, name => {
            message_panel.text = `${name}: ${message.message}`;
        });
    }

    const children = messages_panel.Children();
    const message_limit = 15;

    if (children.length > message_limit) {
        for (let index = 0; index < children.length - message_limit; index++) {
            children[index].DeleteAsync(0);
        }
    }
}

function periodically_pull_chat_messages() {
    $.Schedule(1.5, periodically_pull_chat_messages);

    const request = {
        access_token: get_access_token()
    };

    api_request(Api_Request_Type.pull_chat_messages, request, response => {
        add_new_chat_messages(response.messages);
    });
}

function hack_into_game_chat() {
    function find_chat_top_level_panel() {
        const top_element = $.GetContextPanel().GetParent().GetParent().GetParent();
        const hud = top_element.FindChild("HUDElements");

        hud.FindChild("topbar").FindChild("DayGlow").style.visibility = "collapse";

        return hud.FindChild("HudChat");
    }

    function hide_default_chat_box(hud_chat: Panel) {
        const chat_controls = hud_chat.FindChildTraverse("ChatControls");

        for (const child of hud_chat.FindChildTraverse("ChatMainPanel").Children()) {
            if (child != chat_controls) {
                child.style.visibility = "collapse";
            }
        }
    }

    function register_custom_chat_input_event(chat_input: TextEntry) {
        chat_input.SetPanelEvent(PanelEvent.ON_INPUT_SUBMIT, function() {
            const text = chat_input.text;

            if (text.length > 0) {
                if (text.charAt(0) == "-") {
                    if (text == "-ping") {
                        Game.ServerCmd("dota_ping");
                    } else {
                        if (current_state == Player_State.in_battle) {
                            try_battle_cheat(text.substring(1));
                        } else if (current_state == Player_State.on_adventure) {
                            try_adventure_cheat(text.substring(1));
                        }
                    }
                } else {
                    api_request(Api_Request_Type.submit_chat_message, {
                        access_token: get_access_token(),
                        message: text
                    }, response => add_new_chat_messages(response.messages));
                }
            }

            chat_input.text = "";

            const time = Game.Time();
            if (Game.Time() - (chat_visible_at || time) > 0.1) {
                $.DispatchEvent("DropInputFocus", chat_input);
                chat_visible_at = undefined;
                return;
            }
        });
    }

    function update_chat_box_visibility_state() {
        const is_visible_now = hud_chat.BHasClass("Active");

        if (!chat_was_visible && is_visible_now) {
            chat_visible_at = Game.Time();
        }

        if (chat_was_visible && !is_visible_now) {
            chat_visible_at = undefined;
        }

        if (chat_was_visible != is_visible_now) {
            // $("#GameChat").SetHasClass("ChatVisible", is_visible_now);
        }

        chat_was_visible = is_visible_now;

        $.Schedule(0, update_chat_box_visibility_state);
    }

    const hud_chat = find_chat_top_level_panel();
    const chat_input = hud_chat.FindChildTraverse("ChatInput") as TextEntry;

    let chat_was_visible = false;
    let chat_visible_at: number | undefined = undefined;

    hide_default_chat_box(hud_chat);
    register_custom_chat_input_event(chat_input);
    update_chat_box_visibility_state();
}

function subscribe_to_debug_message_event() {
    subscribe_to_custom_event(To_Client_Event_Type.log_chat_debug_message, event => {
        api_request(Api_Request_Type.submit_chat_message, {
            access_token: get_access_token(),
            message: event.message
        }, response => add_new_chat_messages(response.messages));
    });
}

let chat_initialized = false;

subscribe_to_game_net_table_key("main", "game", () => {
    if (!chat_initialized) {
        hack_into_game_chat();
        periodically_pull_chat_messages();
        subscribe_to_debug_message_event();

        chat_initialized = true;
    }
});