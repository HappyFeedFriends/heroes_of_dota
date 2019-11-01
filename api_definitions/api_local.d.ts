type Move_Delta_Paths = Record<number, { x: number, y: number }[]>

type Visualizer_Unit_Data_Base = Unit_Stats & {
    id: Unit_Id
    modifiers: Modifier_Id[]
    hidden: boolean
}

type Visualizer_Hero_Data = Visualizer_Unit_Data_Base & {
    supertype: Unit_Supertype.hero
    level: number
}

type Visualizer_Creep_Data = Visualizer_Unit_Data_Base & {
    supertype: Unit_Supertype.creep
}

type Visualizer_Minion_Data = Visualizer_Unit_Data_Base & {
    supertype: Unit_Supertype.minion
}

type Visualizer_Unit_Data = Visualizer_Hero_Data | Visualizer_Creep_Data | Visualizer_Minion_Data

type Visualizer_Player_Data = {
    id: Battle_Player_Id
    gold: number
}

type Modifier_Data = {
    modifier_id: Modifier_Id
    modifier_handle_id: Modifier_Handle_Id
    changes: Modifier_Change[]
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

type Put_Deltas_Event = {
    deltas: Delta[]
    delta_paths: Move_Delta_Paths
    from_head: number
}

type Debug_Chat_Message_Event = {
    message: string
}

type Battle_Cheat_Event = {
    message: string
}

type Fast_Forward_Event = Battle_Snapshot

type Grid_Highlight_Targeted_Ability_Event = {
    unit_id: Unit_Id
    ability_id: Ability_Id
    from: {
        x: number
        y: number
    }
    to: {
        x: number
        y: number
    }
}

type Grid_Highlight_No_Target_Ability_Event = {
    unit_id: Unit_Id
    ability_id: Ability_Id
    from: {
        x: number
        y: number
    }
}

type Game_Over_Event = {
    winner_player_id: Battle_Player_Id
}

type Player_Snapshot = {
    id: Battle_Player_Id
    gold: number
}

type Unit_Snapshot_Base = Unit_Stats & {
    id: Unit_Id
    modifiers: Modifier_Data[]
    position: {
        x: number
        y: number
    }
    facing: {
        x: number
        y: number
    }
}

type Hero_Snapshot = Unit_Snapshot_Base & {
    supertype: Unit_Supertype.hero
    level: number
    owner_id: Battle_Player_Id
    type: Hero_Type
}

type Creep_Snapshot = Unit_Snapshot_Base & {
    supertype: Unit_Supertype.creep
}

type Minion_Snapshot = Unit_Snapshot_Base & {
    supertype: Unit_Supertype.minion
    type: Minion_Type
    owner_id: Battle_Player_Id
}

type Unit_Snapshot = Hero_Snapshot | Creep_Snapshot | Minion_Snapshot

type Rune_Snapshot = {
    id: Rune_Id
    type: Rune_Type
    position: {
        x: number
        y: number
    }
}

type Shop_Snapshot = {
    id: Shop_Id
    type: Shop_Type
    position: {
        x: number
        y: number
    }
    facing: {
        x: number
        y: number
    }
}

type Tree_Snapshot = {
    id: Tree_Id
    position: {
        x: number
        y: number
    }
}

type Battle_Snapshot = {
    has_started: boolean
    players: Player_Snapshot[]
    units: Unit_Snapshot[]
    runes: Rune_Snapshot[]
    shops: Shop_Snapshot[]
    trees: Tree_Snapshot[]
    delta_head: number
}

declare const enum Editor_Event_Type {
    toggle_map_vision = 0,
    start_adventure = 1,
    toggle_camera_lock = 2,
    create_entity = 3,
    delete_entity = 4,
    set_entity_facing = 5,
    set_entity_position = 6,
    teleport = 7,
    exit_adventure = 8
}

type Editor_Event = {
    type: Editor_Event_Type.toggle_map_vision
} | {
    type: Editor_Event_Type.start_adventure
    adventure: Adventure_Id
} | {
    type: Editor_Event_Type.toggle_camera_lock
} | {
    type: Editor_Event_Type.set_entity_position
    entity_id: Adventure_Entity_Id
    position: {
        x: number
        y: number
    }
} | {
    type: Editor_Event_Type.set_entity_facing
    entity_id: Adventure_Entity_Id
    facing: {
        x: number
        y: number
    }
} | {
    type: Editor_Event_Type.delete_entity
    entity_id: Adventure_Entity_Id
} | {
    type: Editor_Event_Type.create_entity
    definition: Adventure_Entity_Definition
} | {
    type: Editor_Event_Type.teleport
    position: {
        x: number
        y: number
    }
} | {
    type: Editor_Event_Type.exit_adventure
}