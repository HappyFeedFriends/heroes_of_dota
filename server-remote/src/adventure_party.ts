export type Map_Player_Party = Party_Snapshot & {
    currency: number
    changes: Adventure_Party_Change[]
    links: {
        heroes: Hero_Slot_To_Unit[]
        creeps: Creep_Slot_To_Unit[]
        spells: Spell_Slot_To_Card[]
    }
}

type Hero_Slot_To_Unit = {
    slot: Find_By_Type<Adventure_Party_Slot, Adventure_Party_Slot_Type.hero>
    slot_index: number
    unit: Unit_Id
}

type Creep_Slot_To_Unit = {
    slot: Find_By_Type<Adventure_Party_Slot, Adventure_Party_Slot_Type.creep>
    slot_index: number
    unit: Unit_Id
}

type Spell_Slot_To_Card = {
    slot_index: number
    card: Card_Id
}

export function find_empty_party_slot_index(party: Map_Player_Party): number {
    return party.slots.findIndex(slot => slot.type == Adventure_Party_Slot_Type.empty);
}

export function act_on_adventure_party(party: Map_Player_Party, action: Adventure_Party_Action): Adventure_Party_Response {
    consume_adventure_party_action(party, action, change => push_party_change(party, change));

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

export function change_party_empty_slot(slot: number): Adventure_Party_Change {
    return {
        type: Adventure_Party_Change_Type.set_slot,
        slot_index: slot,
        slot: { type: Adventure_Party_Slot_Type.empty }
    }
}

export function change_party_add_hero(slot: number, hero: Hero_Type): Adventure_Party_Change {
    return {
        type: Adventure_Party_Change_Type.set_slot,
        slot_index: slot,
        slot: {
            type: Adventure_Party_Slot_Type.hero,
            hero: hero,
            health: hero_definition_by_type(hero).health,
            items: []
        }
    }
}

export function change_party_add_creep(slot: number, creep: Creep_Type): Adventure_Party_Change {
    return {
        type: Adventure_Party_Change_Type.set_slot,
        slot_index: slot,
        slot: {
            type: Adventure_Party_Slot_Type.creep,
            creep: creep,
            health: creep_definition_by_type(creep).health
        }
    }
}

export function change_party_add_spell(slot: number, spell: Spell_Id): Adventure_Party_Change {
    return {
        type: Adventure_Party_Change_Type.set_slot,
        slot_index: slot,
        slot: {
            type: Adventure_Party_Slot_Type.spell,
            spell: spell
        }
    }
}

export function change_party_change_health(slot: number, health: number): Adventure_Party_Change {
    return {
        type: Adventure_Party_Change_Type.set_health,
        slot_index: slot,
        health: health
    }
}

export function change_party_add_item(item: Item_Id): Adventure_Party_Change {
    return {
        type: Adventure_Party_Change_Type.add_item_to_bag,
        item_id: item
    }
}

function collapse_adventure_party_changes(num_slots: number, changes: Adventure_Party_Change[]): Party_Snapshot {
    const party: Party_Snapshot = {
        slots: [],
        bag: []
    };

    for (; num_slots > 0; num_slots--) {
        party.slots.push({ type: Adventure_Party_Slot_Type.empty });
    }

    for (const change of changes) {
        collapse_party_change(party, change);
    }

    return party;
}
