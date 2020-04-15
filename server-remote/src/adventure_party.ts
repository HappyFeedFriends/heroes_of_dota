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

export function adventure_equipment_item_id_to_item(entity_id: Adventure_Party_Entity_Id, item_id: Adventure_Equipment_Item_Id): Adventure_Item {
    const base = {
        type: Adventure_Item_Type.equipment,
        entity_id: entity_id
    } as const;

    function in_combat_effect(modifier: Modifier): Adventure_Item_Effect {
        return {
            type: Adventure_Item_Effect_Type.in_combat,
            modifier: modifier
        };
    }

    switch (item_id) {
        case Adventure_Equipment_Item_Id.boots_of_travel: return {
            ...base,
            item_id: item_id,
            effects: [in_combat_effect({
                id: Modifier_Id.move_speed,
                bonus: 3
            })]
        };

        case Adventure_Equipment_Item_Id.assault_cuirass: return {
            ...base,
            item_id: item_id,
            effects: [in_combat_effect({
                id: Modifier_Id.armor,
                bonus: 4
            })]
        };

        case Adventure_Equipment_Item_Id.divine_rapier: return {
            ...base,
            item_id: item_id,
            effects: [in_combat_effect({
                id: Modifier_Id.attack_damage,
                bonus: 8
            })]
        };

        case Adventure_Equipment_Item_Id.mask_of_madness: return {
            ...base,
            item_id: item_id,
            effects: [in_combat_effect({
                id: Modifier_Id.item_mask_of_madness,
                attack: 4
            })]
        };

        case Adventure_Equipment_Item_Id.boots_of_speed: return {
            ...base,
            item_id: item_id,
            effects: [in_combat_effect({
                id: Modifier_Id.move_speed,
                bonus: 1
            })]
        };

        case Adventure_Equipment_Item_Id.blades_of_attack: return {
            ...base,
            item_id: item_id,
            effects: [in_combat_effect({
                id: Modifier_Id.attack_damage,
                bonus: 2
            })]
        };

        case Adventure_Equipment_Item_Id.belt_of_strength: return {
            ...base,
            item_id: item_id,
            effects: [in_combat_effect({
                id: Modifier_Id.health,
                bonus: 4
            })]
        };

        case Adventure_Equipment_Item_Id.chainmail: return {
            ...base,
            item_id: item_id,
            effects: [in_combat_effect({
                id: Modifier_Id.armor,
                bonus: 1
            })]
        };

        case Adventure_Equipment_Item_Id.basher: return {
            ...base,
            item_id: item_id,
            effects: [in_combat_effect({
                id: Modifier_Id.item_basher
            })]
        };

        case Adventure_Equipment_Item_Id.iron_branch: return {
            ...base,
            item_id: item_id,
            effects: [in_combat_effect({
                id: Modifier_Id.item_iron_branch,
                armor_bonus: 1,
                attack_bonus: 1,
                health_bonus: 1,
                moves_bonus: 1
            })]
        };

        case Adventure_Equipment_Item_Id.mystic_staff: return {
            ...base,
            item_id: item_id,
            effects: [{
                type: Adventure_Item_Effect_Type.combat_start,
                effect_id: Adventure_Combat_Start_Effect_Id.add_ability_charges,
                how_many: 1
            }]
        };

        case Adventure_Equipment_Item_Id.ring_of_regen: return {
            ...base,
            item_id: item_id,
            effects: [{
                type: Adventure_Item_Effect_Type.post_combat,
                effect_id: Adventure_Post_Combat_Effect_Id.restore_health,
                how_much: 1
            }]
        };

        case Adventure_Equipment_Item_Id.ring_of_tarrasque: return {
            ...base,
            item_id: item_id,
            effects: [
                {
                    type: Adventure_Item_Effect_Type.post_combat,
                    effect_id: Adventure_Post_Combat_Effect_Id.restore_health,
                    how_much: 3
                },
                in_combat_effect({
                    id: Modifier_Id.health,
                    bonus: 2
                })
            ]
        };

        case Adventure_Equipment_Item_Id.heart_of_tarrasque: return {
            ...base,
            item_id: item_id,
            effects: [
                {
                    type: Adventure_Item_Effect_Type.post_combat,
                    effect_id: Adventure_Post_Combat_Effect_Id.restore_health,
                    how_much: 5
                },
                in_combat_effect({
                    id: Modifier_Id.health,
                    bonus: 5
                })
            ]
        };

        case Adventure_Equipment_Item_Id.tome_of_aghanim: return {
            ...base,
            item_id: item_id,
            effects: [{
                type: Adventure_Item_Effect_Type.combat_start,
                effect_id: Adventure_Combat_Start_Effect_Id.level_up,
                how_many_levels: 1
            }]
        }
    }
}

export function adventure_consumable_item_id_to_item(entity_id: Adventure_Party_Entity_Id, item_id: Adventure_Consumable_Item_Id): Adventure_Item {
    const base = {
        type: Adventure_Item_Type.consumable,
        entity_id: entity_id
    } as const;

    switch (item_id) {
        case Adventure_Consumable_Item_Id.enchanted_mango: return {
            ...base,
            item_id: item_id,
        };

        case Adventure_Consumable_Item_Id.tome_of_knowledge: return {
            ...base,
            item_id: item_id
        };

        case Adventure_Consumable_Item_Id.healing_salve: return {
            ...base,
            item_id: item_id
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