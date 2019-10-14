const enum Adventure_Room_Type {
    combat = 0,
    rest = 1
}

export type Adventure = {
    id: Adventure_Id
    rooms: Adventure_Room[]
}

export type Adventure_Room = {
    type: Adventure_Room_Type.combat
    id: Adventure_Room_Id
} | {
    type: Adventure_Room_Type.rest
    id: Adventure_Room_Id
}

const adventures: Record<Adventure_Id, Adventure> = {
    [Adventure_Id.forest]: {
        id: Adventure_Id.forest,
        rooms: [
            room(1, Adventure_Room_Type.combat)
        ]
    }
};

function room(id: number, type: Adventure_Room_Type): Adventure_Room {
    return {
        id: id as Adventure_Room_Id,
        type: type
    }
}

export function adventure_by_id(adventure_id: Adventure_Id): Adventure {
    return adventures[adventure_id];
}

export function room_by_id(adventure: Adventure, room_id: Adventure_Room_Id): Adventure_Room | undefined {
    return adventure.rooms.find(room => room.id == room_id);
}