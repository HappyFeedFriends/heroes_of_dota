import {Map_Player} from "./server";
import {XY} from "./common";

export type Map_NPC = {
    id: number;
    type: NPC_Type
    current_location: XY;
    movement_history: Movement_History_Entry[];
}

const test_npc: Map_NPC = {
    id: 10000,
    type: NPC_Type.satyr,
    current_location: {
        x: 500,
        y: 100
    },
    movement_history: []
};

export function get_nearby_neutrals(player: Map_Player): Map_NPC[] {
    return [ test_npc ];
}

export function npc_by_id(id: number): Map_NPC | undefined {
    if (id == 10000) {
        return test_npc;
    }
}