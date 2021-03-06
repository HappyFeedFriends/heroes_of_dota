import {Map_Player, Map_Player_Login} from "./server";

const chat_message_history: Chat_Message[] = [];

export function pull_pending_chat_messages_for_player(player_login: Map_Player_Login): Chat_Message[] {
    const result: Chat_Message[] = [];
    const now = Date.now();

    for (const message of chat_message_history) {
        if (message.timestamp > player_login.chat_timestamp) {
            result.push(message);
        }
    }

    player_login.chat_timestamp = now;

    return result;
}

export function submit_chat_message(player: Map_Player, message: string) {
    const new_message: Chat_Message = {
        from_player_id: player.id,
        message: message,
        timestamp: Date.now()
    };

    chat_message_history.push(new_message);
}