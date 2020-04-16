export type Map_Player_Party = Party_Snapshot & {
    changes: Adventure_Party_Change[]
    links: Map_Player_Party_Links
}

export type Map_Player_Party_Links = {
    heroes: Hero_Slot_To_Unit[]
    creeps: Creep_Slot_To_Unit[]
    spells: Spell_Slot_To_Card[]
}

type Hero_Slot_To_Unit = {
    slot: Adventure_Party_Hero_Slot
    slot_index: number
    unit: Unit_Id
}

type Creep_Slot_To_Unit = {
    slot: Adventure_Party_Creep_Slot
    slot_index: number
    unit: Unit_Id
}

type Spell_Slot_To_Card = {
    slot_index: number
    card: Card_Id
}

export function act_on_adventure_party(party: Map_Player_Party, action: Adventure_Party_Action): Adventure_Party_Response {
    const changes = adventure_party_action_to_changes(party, action);

    for (const change of changes) {
        push_party_change(party, change);
    }

    const all_changes = party.changes;
    const origin_head = all_changes.length;
    const delta = origin_head - action.current_head;

    if (delta > 20) {
        const collapsed_state = collapse_adventure_party_changes(party.slots.length, all_changes);

        return {
            snapshot: true,
            content: collapsed_state,
            origin_head: origin_head
        }
    } else {
        const result = all_changes.slice(action.current_head);

        return {
            snapshot: false,
            changes: result,
            apply_to_head: action.current_head
        }
    }
}

export function push_party_change(party: Map_Player_Party, change: Adventure_Party_Change) {
    collapse_party_change(party, change);

    party.changes.push(change);

    return change;
}

function collapse_adventure_party_changes(num_slots: number, changes: Adventure_Party_Change[]): Party_Snapshot {
    const party: Party_Snapshot = {
        slots: [],
        bag: [],
        currency: 0
    };

    for (; num_slots > 0; num_slots--) {
        party.slots.push({ type: Adventure_Party_Slot_Type.empty });
    }

    for (const change of changes) {
        collapse_party_change(party, change);
    }

    return party;
}