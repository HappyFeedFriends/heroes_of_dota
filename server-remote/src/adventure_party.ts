export type Map_Player_Party = Party_Snapshot & {
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
            base_health: hero_definition_by_type(hero).health,
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

export function change_party_change_health(slot: number, health: number, reason: Adventure_Health_Change_Reason): Adventure_Party_Change {
    return {
        type: Adventure_Party_Change_Type.set_health,
        slot_index: slot,
        health: health,
        reason: reason
    }
}

export function change_party_add_item(item: Adventure_Item): Adventure_Party_Change {
    return {
        type: Adventure_Party_Change_Type.add_item_to_bag,
        item: item
    }
}

export function change_party_set_currency(amount: number): Adventure_Party_Change {
    return {
        type: Adventure_Party_Change_Type.set_currency_amount,
        amount: amount
    }
}

export function adventure_wearable_item_id_to_item(id: Adventure_Wearable_Item_Id): Adventure_Item {
    switch (id) {
        case Adventure_Wearable_Item_Id.boots_of_travel: return {
            type: Adventure_Item_Type.wearable,
            item_id: id,
            modifier: {
                id: Modifier_Id.move_speed,
                bonus :3
            }
        };

        case Adventure_Wearable_Item_Id.assault_cuirass: return {
            type: Adventure_Item_Type.wearable,
            item_id: id,
            modifier: {
                id: Modifier_Id.armor,
                bonus: 4
            }
        };

        case Adventure_Wearable_Item_Id.divine_rapier: return {
            type: Adventure_Item_Type.wearable,
            item_id: id,
            modifier: {
                id: Modifier_Id.attack_damage,
                bonus: 8
            }
        };

        case Adventure_Wearable_Item_Id.mask_of_madness: return {
            type: Adventure_Item_Type.wearable,
            item_id: id,
            modifier: {
                id: Modifier_Id.item_mask_of_madness,
                attack: 4
            }
        };

        case Adventure_Wearable_Item_Id.boots_of_speed: return {
            type: Adventure_Item_Type.wearable,
            item_id: id,
            modifier: {
                id: Modifier_Id.move_speed,
                bonus: 1
            }
        };

        case Adventure_Wearable_Item_Id.blades_of_attack: return {
            type: Adventure_Item_Type.wearable,
            item_id: id,
            modifier: {
                id: Modifier_Id.attack_damage,
                bonus: 2
            }
        };

        case Adventure_Wearable_Item_Id.belt_of_strength: return {
            type: Adventure_Item_Type.wearable,
            item_id: id,
            modifier: {
                id: Modifier_Id.health,
                bonus: 4
            }
        };

        case Adventure_Wearable_Item_Id.chainmail: return {
            type: Adventure_Item_Type.wearable,
            item_id: id,
            modifier: {
                id: Modifier_Id.armor,
                bonus: 1
            }
        };

        case Adventure_Wearable_Item_Id.basher: return {
            type: Adventure_Item_Type.wearable,
            item_id: id,
            modifier: {
                id: Modifier_Id.item_basher
            }
        };

        case Adventure_Wearable_Item_Id.iron_branch: return {
            type: Adventure_Item_Type.wearable,
            item_id: id,
            modifier: {
                id: Modifier_Id.item_iron_branch,
                armor_bonus: 1,
                attack_bonus: 1,
                health_bonus: 1,
                moves_bonus: 1
            }
        }
    }
}

export function adventure_consumable_item_id_to_item(id: Adventure_Consumable_Item_Id): Adventure_Item {
    switch (id) {
        case Adventure_Consumable_Item_Id.enchanted_mango: return {
            type: Adventure_Item_Type.consumable,
            item_id: id
        };

        case Adventure_Consumable_Item_Id.tome_of_knowledge: return {
            type: Adventure_Item_Type.consumable,
            item_id: id
        };

        case Adventure_Consumable_Item_Id.healing_salve: return {
            type: Adventure_Item_Type.consumable,
            item_id: id
        };
    }
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
