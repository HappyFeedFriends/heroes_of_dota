import {Map_Player} from "./server";
import {XY} from "./common";

export type Map_Npc = {
    id: Npc_Id
    type: Npc_Type
    current_location: XY
    movement_history: Movement_History_Entry[]
}

const test_npc: Map_Npc = {
    id: 10000 as Npc_Id,
    type: Npc_Type.satyr,
    current_location: {
        x: 500,
        y: 100
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