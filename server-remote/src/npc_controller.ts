import {Map_Player} from "./server";
import {XY} from "./common";
import {take_ai_action} from "./ai";
import {Battle_Record} from "./battle";

export type Map_Npc = {
    entity_type: Map_Entity_Type.npc
    id: Npc_Id
    type: Npc_Type
    current_location: XY
    spawn_facing: XY
    movement_history: Movement_History_Entry[]
}

const test_npc: Map_Npc = {
    entity_type: Map_Entity_Type.npc,
    id: 10000 as Npc_Id,
    type: Npc_Type.satyr,
    current_location: {
        x: 500,
        y: 100
    },
    spawn_facing: {
        x: 1,
        y: 0
    },
    movement_history: []
};

export function get_nearby_neutrals(player: Map_Player): Map_Npc[] {
    return [ test_npc ];
}

export function npc_by_id(id: Npc_Id): Map_Npc | undefined {
    if (id == 10000) {
        return test_npc;
    }
}

export function check_and_try_perform_ai_actions(battle: Battle_Record) {
    if (battle.turning_player.map_entity.type == Map_Entity_Type.npc) {
        take_ai_action(battle, battle.turning_player)
    }
}