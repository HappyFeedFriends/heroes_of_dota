declare const enum Player_State {
    on_global_map = 0,
    in_battle = 1,
    on_adventure = 2,
    not_logged_in = 3
}

declare const enum Api_Request_Type {
    authorize_steam_user = 0,

    submit_chat_message = 1,
    pull_chat_messages = 2,

    get_player_state = 3,
    query_battles = 4,
    attack_player = 5,
    attack_npc = 6,
    query_entity_movement = 7,
    submit_player_movement = 8,
    get_player_name = 9,

    take_battle_action = 10,
    query_battle_deltas = 11,

    get_collection_page = 12,
    get_deck = 13,
    save_deck = 14,

    start_adventure = 200,
    enter_adventure_room = 201,
    exit_adventure = 202,
    start_adventure_enemy_fight = 204,
    submit_adventure_player_movement = 205,
    interact_with_adventure_entity = 206,
    act_on_adventure_party = 207,
    purchase_merchant_item = 208,

    battle_cheat = 50,
    map_cheat = 51,
    adventure_party_cheat = 52,
    get_debug_ai_data = 100,

    editor_action = 1000,
    editor_get_room_details = 1001,
    editor_create_entity = 1002,
    editor_create_battleground = 1004,
    editor_submit_battleground = 1005,
    editor_get_battleground = 1006,
    editor_list_battlegrounds = 1007,
    editor_delete_battleground = 1008,
    editor_duplicate_battleground = 1009,
    editor_playtest_battleground = 1010,
    editor_get_merchant_stock = 1011,
    editor_reroll_merchant_stock = 1012,
    editor_list_rooms = 1013,
    editor_get_entity_definition = 1014
}

declare const enum Map_Entity_Type {
    player = 0,
    npc = 1,
    adventure_enemy = 2
}

declare const enum Npc_Type {
    satyr = 0,
    spider = 1
}

declare const enum Battleground_Theme {
    forest = 0,
    forest_dead = 1,
    garden = 2
}

type Player_Id = number & { _player_id_brand: any };
type Npc_Id = number & { _npc_id_brand: any };
type Battle_Id = number & { _battle_id_brand: any };
type Battleground_Id = number & { _battleground_id_brand: any };

type Movement_History_Entry = {
    order_x: number
    order_y: number
    location_x: number
    location_y: number
}

type Player_State_Not_Logged_In = {
    state: Player_State.not_logged_in
}

type Player_State_On_Global_Map = {
    state: Player_State.on_global_map
    player_position: {
        x: number
        y: number
    }
}

type Player_State_On_Adventure = {
    state: Player_State.on_adventure
    adventure_id: Adventure_Id
    current_room_id: Adventure_Room_Id
    ongoing_adventure_id: Ongoing_Adventure_Id
    num_party_slots: number
    room: Adventure_Room_Data
    player_position: {
        x: number
        y: number
    }
}

type Player_State_In_Battle = {
    state: Player_State.in_battle
    battle_id: Battle_Id
    battle_player_id: Battle_Player_Id
    random_seed: number
    grid_size: {
        width: number
        height: number
    }
    participants: Battle_Participant_Info[]
    battle_world_origin: World_Origin
    battleground_theme: Battleground_Theme
    disabled_cell_indices: Cell_Index[]
}

type Player_State_Data =
    Player_State_Not_Logged_In |
    Player_State_On_Global_Map |
    Player_State_On_Adventure |
    Player_State_In_Battle

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
        selected_unit_id: Unit_Id
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
        battle_id: Battle_Id
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
    type: Api_Request_Type.get_player_name
    request: { player_id: Player_Id } & With_Token
    response: {
        name: string
    }
} | {
    type: Api_Request_Type.authorize_steam_user

    request: {
        steam_id: string
        steam_user_name: string
        dedicated_server_key: string
    }

    response: {
        id: Player_Id
        token: string
    }
} | {
    type: Api_Request_Type.query_entity_movement

    request: With_Token & With_Private_Key
    response: {
        players: Player_Movement_Data[]
        neutrals: NPC_Movement_Data[]
    }
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
        target_player_id: Player_Id
    } & With_Token & With_Private_Key

    response: Player_State_Data
} | {
    type: Api_Request_Type.attack_npc

    request: {
        target_npc_id: Npc_Id
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
} | Adventure_Handlers | Editor_Handlers

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

type Movement_Data = {
    movement_history: Movement_History_Entry[]
    current_location: {
        x: number
        y: number
    }
}

type Player_Movement_Data = Movement_Data & {
    id: Player_Id
}

type NPC_Movement_Data = Movement_Data & {
    id: Npc_Id
    type: Npc_Type
    spawn_facing: XY
}

type Chat_Message = {
    from_player_id: Player_Id
    message: string
    timestamp: number
}

type Battle_Info = {
    id: Battle_Id
    grid_size: {
        width: number
        height: number
    }
    random_seed: number
    participants: Battle_Participant_Info[]
}

type World_Origin = { x: number, y: number, z: number }

type Debug_AI_Data = {
    unit_debug: {
        unit_id: Unit_Id
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
declare function enum_to_string<T>(enum_member: T): string;
declare function enum_values<T>(): T[];
declare function enum_names_to_values<T>(): [string, T][];