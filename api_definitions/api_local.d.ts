declare const enum Local_Api_Request_Type {
    list_battle_locations = 0,
    get_ground_z = 1,
    reroll_merchant_stock = 2
}

declare const enum To_Server_Event_Type {
    adventure_interact_with_entity = 0,
    put_deltas = 1,
    fast_forward = 2,
    editor_action = 3,
    adventure_purchase_merchant_item = 4
}

declare const enum To_Client_Event_Type {
    adventure_receive_party_changes = 0,
    adventure_display_entity_popup = 1,
    grid_highlight_targeted_ability = 2,
    grid_highlight_no_target_ability = 3,
    show_start_turn_ui = 4,
    show_game_over_ui = 5,
    log_chat_debug_message = 6
}

declare const enum Prefixes {
    to_server_event = "to_server_",
    to_client_event = "to_client_",
    local_api_request = "local_api_request",
    local_api_response = "local_api_response"
}

type To_Server_Event = {
    type: To_Server_Event_Type.adventure_interact_with_entity
    payload: {
        entity_id: Adventure_World_Entity_Id
        current_head: number
    }
} | {
    type: To_Server_Event_Type.adventure_purchase_merchant_item
    payload: {
        merchant_id: Adventure_World_Entity_Id
        purchase_id: Adventure_Party_Entity_Id
        current_head: number
    }
} | {
    type: To_Server_Event_Type.put_deltas
    payload: {
        deltas: Delta[]
        delta_paths: Move_Delta_Paths
        from_head: number
    }
} | {
    type: To_Server_Event_Type.fast_forward
    payload: Battle_Snapshot
} | {
    type: To_Server_Event_Type.editor_action
    payload: Editor_Action
}

type To_Client_Event = {
    type: To_Client_Event_Type.adventure_receive_party_changes
    payload: {
        changes: Adventure_Party_Change[]
        current_head: number
    }
} | {
    type: To_Client_Event_Type.adventure_display_entity_popup
    payload: {
        entity: Adventure_Entity
    }
} | {
    type: To_Client_Event_Type.grid_highlight_targeted_ability
    payload: {
        unit_id: Unit_Id
        ability_id: Ability_Id
        from: XY
        to: XY
    }
} | {
    type: To_Client_Event_Type.grid_highlight_no_target_ability
    payload: {
        unit_id: Unit_Id
        ability_id: Ability_Id
        from: XY
    }
} | {
    type: To_Client_Event_Type.show_start_turn_ui
    payload: {}
} | {
    type: To_Client_Event_Type.show_game_over_ui
    payload: {
        winner_player_id?: Battle_Player_Id
    }
} | {
    type: To_Client_Event_Type.log_chat_debug_message
    payload: {
        message: string
    }
}

type Local_Api_Request = {
    type: Local_Api_Request_Type.list_battle_locations
    request: {
    }

    response: {
        name: string
        origin: World_Origin
        theme: Battleground_Theme
    }[]
} | {
    type: Local_Api_Request_Type.get_ground_z
    request: {
        x: number
        y: number
    }

    response: {
        z: number
    }
} | {
    type: Local_Api_Request_Type.reroll_merchant_stock
    request: {
        merchant: Adventure_World_Entity_Id
    }

    response: Adventure_Merchant_Stock
}

type Local_Api_Request_Packet = {
    type: Local_Api_Request_Type
    request_id: Local_Api_Request_Id
    body: Local_Api_Request["request"]
}

type Local_Api_Response_Packet = {
    request_id: Local_Api_Request_Id
    body: object
}

type Local_Api_Request_Id = number & { _player_id_brand: any };

type Find_Local_Request<T> = Find_By_Type<Local_Api_Request, T>["request"]
type Find_Local_Response<T> = Find_By_Type<Local_Api_Request, T>["response"]

type Find_To_Server_Payload<T> = Find_By_Type<To_Server_Event, T>["payload"]
type Find_To_Client_Payload<T> = Find_By_Type<To_Client_Event, T>["payload"]

type Move_Delta_Paths = Record<number, XY[]>

type Visualizer_Unit_Data_Base = Unit_Stats & {
    id: Unit_Id
    modifiers: Modifier_Handle_Id[]
    hidden: boolean
}

type Visualizer_Hero_Data = Visualizer_Unit_Data_Base & {
    supertype: Unit_Supertype.hero
    level: number
}

type Visualizer_Monster_Data = Visualizer_Unit_Data_Base & {
    supertype: Unit_Supertype.monster
}

type Visualizer_Creep_Data = Visualizer_Unit_Data_Base & {
    supertype: Unit_Supertype.creep
}

type Visualizer_Unit_Data = Visualizer_Hero_Data | Visualizer_Monster_Data | Visualizer_Creep_Data

type Visualizer_Player_Data = {
    id: Battle_Player_Id
    gold: number
}

type Physical_Adventure_Entity = {
    world_entity_id: number
    base: Adventure_Entity
}

type Modifier_Data = {
    modifier_handle_id: Modifier_Handle_Id
    modifier: Modifier
}

type Player_Net_Table_Base = {
    id: Player_Id
    token: string
}

type Game_Net_Table_Not_Logged_In = {
    state: Player_State.not_logged_in
}

type Game_Net_Table_On_Global_Map = Player_Net_Table_Base & {
    state: Player_State.on_global_map
}

type Game_Net_Table_On_Adventure = Player_Net_Table_Base & {
    state: Player_State.on_adventure
    ongoing_adventure_id: Ongoing_Adventure_Id
    num_party_slots: number
}

type Game_Net_Table_In_Battle = Player_Net_Table_Base & {
    state: Player_State.in_battle
    battle: {
        id: Battle_Id
        battle_player_id: Battle_Player_Id
        participants: Battle_Participant_Info[]
        players: Visualizer_Player_Data[]
        world_origin: {
            x: number
            y: number
            z: number
        }
        grid_size: {
            width: number
            height: number
        }
        entity_id_to_unit_data: Record<number, Visualizer_Unit_Data>
        entity_id_to_rune_id: Record<number, Rune_Id>
        entity_id_to_shop_id: Record<number, Shop_Id>
        current_visual_head: number
    }
}

type Game_Net_Table =
    Game_Net_Table_On_Global_Map |
    Game_Net_Table_On_Adventure |
    Game_Net_Table_In_Battle |
    Game_Net_Table_Not_Logged_In

type Adventure_Net_Table = {
    entities: Physical_Adventure_Entity[]
}

type Player_Snapshot = {
    id: Battle_Player_Id
    gold: number
}

type Unit_Snapshot_Base = Unit_Stats & {
    id: Unit_Id
    modifiers: Modifier_Data[]
    position: XY
    facing: XY
}

type Hero_Snapshot = Unit_Snapshot_Base & {
    supertype: Unit_Supertype.hero
    level: number
    owner_id: Battle_Player_Id
    type: Hero_Type
}

type Monster_Snapshot = Unit_Snapshot_Base & {
    supertype: Unit_Supertype.monster
}

type Creep_Snapshot = Unit_Snapshot_Base & {
    supertype: Unit_Supertype.creep
    type: Creep_Type
    owner_id: Battle_Player_Id
}

type Unit_Snapshot = Hero_Snapshot | Monster_Snapshot | Creep_Snapshot

type Rune_Snapshot = {
    id: Rune_Id
    type: Rune_Type
    position: XY
}

type Shop_Snapshot = {
    id: Shop_Id
    type: Shop_Type
    position: XY
    facing: XY
}

type Tree_Snapshot = {
    id: Tree_Id
    position: XY
}

type Timed_Effect_Snapshot = {
    handle_id: Effect_Handle_Id
    content: Timed_Effect
}

type Battle_Snapshot = {
    has_started: boolean
    effects: Timed_Effect_Snapshot[]
    players: Player_Snapshot[]
    units: Unit_Snapshot[]
    runes: Rune_Snapshot[]
    shops: Shop_Snapshot[]
    trees: Tree_Snapshot[]
    delta_head: number
}

declare const enum Editor_Action_Type {
    toggle_map_vision = 0,
    start_adventure = 1,
    set_camera = 2,
    create_entity = 3,
    delete_entity = 4,
    set_entity_facing = 5,
    set_entity_position = 6,
    teleport = 7,
    exit_adventure = 8,
    submit_battleground = 9,
    playtest_battleground = 10,
    edit_item_data = 11,
    move_camera = 12,
    set_camera_restriction_zones = 13,
    enter_adventure_room = 14
}

type Editor_Action = {
    type: Editor_Action_Type.toggle_map_vision
} | {
    type: Editor_Action_Type.start_adventure
    adventure: Adventure_Id
} | {
    type: Editor_Action_Type.set_camera
    camera: {
        free: true
    } | {
        free: false
        world_origin: World_Origin
        grid_size: XY
    }
} | {
    type: Editor_Action_Type.move_camera
    to: World_Origin
} | {
    type: Editor_Action_Type.set_entity_position
    entity_id: Adventure_World_Entity_Id
    position: {
        x: number
        y: number
    }
} | {
    type: Editor_Action_Type.set_entity_facing
    entity_id: Adventure_World_Entity_Id
    facing: {
        x: number
        y: number
    }
} | {
    type: Editor_Action_Type.delete_entity
    entity_id: Adventure_World_Entity_Id
} | {
    type: Editor_Action_Type.create_entity
    definition: Adventure_Entity_Definition
} | {
    type: Editor_Action_Type.teleport
    position: {
        x: number
        y: number
    }
} | {
    type: Editor_Action_Type.exit_adventure
} | {
    type: Editor_Action_Type.submit_battleground
    origin: World_Origin
    theme: Battleground_Theme
    spawns: Battleground_Spawn[]
} | {
    type: Editor_Action_Type.playtest_battleground
    battleground: Battleground_Id
    enemy: Adventure_World_Entity_Id
} | {
    type: Editor_Action_Type.edit_item_data
    entity_id: Adventure_World_Entity_Id
    item: Adventure_Item_Definition
} | {
    type: Editor_Action_Type.set_camera_restriction_zones
    zones: Camera_Restriction_Zone[]
} | {
    type: Editor_Action_Type.enter_adventure_room
    room_id: Adventure_Room_Id
}