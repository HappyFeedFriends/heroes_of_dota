declare const enum Player_State {
    on_global_map = 0,
    in_battle = 1,
    not_logged_in = 2
}

declare const enum Api_Request_Type {
    authorize_steam_user = 0,

    submit_chat_message = 1,
    pull_chat_messages = 2,

    get_player_state = 3,
    query_battles = 4,
    attack_player = 5,
    query_players_movement = 6,
    submit_player_movement = 7,

    take_battle_action = 8,
    query_battle_deltas = 9,

    get_collection_page = 10,
    get_deck = 11,
    save_deck = 12,

    battle_cheat = 50,
    get_debug_ai_data = 100
}

type Movement_History_Entry = {
    order_x: number
    order_y: number
    location_x: number
    location_y: number
}

type Player_State_Not_Logged_In_Data = {
    state: Player_State.not_logged_in
}

type Player_State_On_Global_Map_Data = {
    state: Player_State.on_global_map
    player_position: {
        x: number
        y: number
    }
}

type Player_State_In_Battle_Data = {
    state: Player_State.in_battle
    battle_id: number
    random_seed: number
    grid_size: {
        width: number
        height: number
    }
    participants: Battle_Participant_Info[]
}

type Player_State_Data = Player_State_Not_Logged_In_Data | Player_State_On_Global_Map_Data | Player_State_In_Battle_Data

type With_Token = {
    access_token: string
}

type With_Private_Key = {
    dedicated_server_key: string
}

type Api_Request = {
    type: Api_Request_Type.submit_chat_message

    request: {
        message: string
    } & With_Token

    response: {
        messages: Chat_Message[]
    }
} | {
    type: Api_Request_Type.pull_chat_messages

    request: With_Token

    response: {
        messages: Chat_Message[]
    }
} | {
    type: Api_Request_Type.battle_cheat

    request: {
        cheat: string
        selected_unit_id: number
    } & With_Token

    response: {
    }
} | {
    type: Api_Request_Type.get_collection_page

    request: {
        page: number
    } & With_Token

    response: Collection_Page
} | {
    type: Api_Request_Type.take_battle_action

    request: {
        action: Turn_Action
    } & With_Token

    response: {
        previous_head: number
        deltas: Delta[]
    }
} | {
    type: Api_Request_Type.query_battle_deltas

    request: {
        battle_id: number
        since_delta: number
    } & With_Token

    response: {
        deltas: Delta[]
    }
} | {
    type: Api_Request_Type.query_battles

    request: With_Token
    response: {
        battles: Battle_Info[]
    }
} | {
    type: Api_Request_Type.get_player_state

    request: With_Token
    response: Player_State_Data
} | {
    type: Api_Request_Type.authorize_steam_user

    request: {
        steam_id: string
        steam_user_name: string
        dedicated_server_key: string
    }

    response: {
        id: number
        token: string
    }
} | {
    type: Api_Request_Type.query_players_movement

    request: With_Token & With_Private_Key
    response: Player_Movement_Data[]
} | {
    type: Api_Request_Type.submit_player_movement

    request: {
        current_location: {
            x: number
            y: number
        }
        movement_history: Movement_History_Entry[]
    } & With_Token & With_Private_Key

    response: {}
} | {
    type: Api_Request_Type.attack_player

    request: {
        target_player_id: number
    } & With_Token & With_Private_Key

    response: Player_State_Data
} | {
    type: Api_Request_Type.get_deck

    request: With_Token
    response: Deck_Contents
} | {
    type: Api_Request_Type.save_deck

    request: Deck_Contents & With_Token
    response: {}
} | {
    type: Api_Request_Type.get_debug_ai_data

    request: {}
    response: Debug_AI_Data
}

type Collection_Page = {
    cards: Collection_Card[]
    hero_pages: number
    spell_pages: number
    total_pages: number
}

type Collection_Card = {
    type: Card_Type.hero
    hero: Hero_Type
    copies: number
} | {
    type: Card_Type.spell
    spell: Spell_Id
    copies: number
}

type Deck_Contents = {
    heroes: Hero_Type[]
    spells: Spell_Id[]
}

type Player_Movement_Data = {
    id: number
    player_name: string // TODO might want to move id:name connection into a separate request
    movement_history: Movement_History_Entry[]
    current_location: {
        x: number
        y: number
    }
}

type Chat_Message = {
    from_player_id: number
    from_player_name: string
    message: string
    timestamp: number
}

type Battle_Info = {
    id: number
    grid_size: {
        width: number
        height: number
    }
    random_seed: number
    participants: Battle_Participant_Info[]
}

type Debug_AI_Data = {
    unit_debug: {
        unit_id: number
        cmds: Debug_Draw_Cmd[]
    }[]
}

declare const enum Debug_Draw_Cmd_Type {
    line = 0,
    circle = 1,
    text = 2,
    rect = 3
}

type Debug_Draw_Cmd = {
    type: Debug_Draw_Cmd_Type.circle
    clr: number
    x: number
    y: number
    r: number
} | {
    type: Debug_Draw_Cmd_Type.line
    clr: number
    x1: number
    y1: number
    x2: number
    y2: number
} | {
    type: Debug_Draw_Cmd_Type.rect
    clr: number
    x1: number
    y1: number
    x2: number
    y2: number
} | {
    type: Debug_Draw_Cmd_Type.text
    clr: number
    x: number
    y: number
    text: string
}

type Find_By_Id<Union, Id> = Union extends { id: Id } ? Union : never;
type Find_By_Type<Union, Type> = Union extends { type: Type } ? Union : never;
type Find_Request<T> = Find_By_Type<Api_Request, T>["request"]
type Find_Response<T> = Find_By_Type<Api_Request, T>["response"]

declare function copy<T>(arg: T): T;
declare function enum_to_string(enum_member: any): string;
declare function enum_values<T>(): T[];
declare function enum_names_to_values<T>(): [string, T][];