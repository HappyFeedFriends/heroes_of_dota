import {unreachable} from "./common";
import {import_battle_sim} from "./server";

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

import_battle_sim();

export function find_empty_party_slot_index(party: Map_Player_Party): number {
    return party.slots.findIndex(slot => slot.type == Adventure_Party_Slot_Type.empty);
}

function collapse_party_change(party: Party_Snapshot, change: Adventure_Party_Change) {
    switch (change.type) {
        case Adventure_Party_Change_Type.set_slot: {
            party.slots[change.slot_index] = change.slot;

            break;
        }

        case Adventure_Party_Change_Type.set_health: {
            const slot = party.slots[change.slot_index];
            if (!slot) return;

            switch (slot.type) {
                case Adventure_Party_Slot_Type.hero:
                case Adventure_Party_Slot_Type.creep: {
                    slot.health = change.health;
                    break;
                }

                case Adventure_Party_Slot_Type.spell:
                case Adventure_Party_Slot_Type.empty: {
                    break;
                }

                default: unreachable(slot);
            }

            break;
        }

        case Adventure_Party_Change_Type.add_item_to_bag: {
            party.bag.push(change.item_id);

            break;
        }

        case Adventure_Party_Change_Type.move_item: {
            function get_and_remove_item_from_slot(source: Adventure_Party_Item_Container): Item_Id | undefined {
                switch (source.type) {
                    case Adventure_Party_Item_Container_Type.bag: {
                        const bag_slot = party.bag[source.bag_slot_index];
                        if (bag_slot == undefined) return;

                        party.bag.splice(source.bag_slot_index, 1);

                        return bag_slot;
                    }

                    case Adventure_Party_Item_Container_Type.hero: {
                        const hero_slot = party.slots[source.hero_slot_index];
                        if (!hero_slot) return;
                        if (hero_slot.type != Adventure_Party_Slot_Type.hero) return;

                        const item = hero_slot.items[source.item_slot_index];
                        if (item == undefined) return;

                        delete hero_slot.items[source.item_slot_index];

                        return item;
                    }
                }
            }

            function put_item_in_slot(target: Adventure_Party_Item_Container, item: Item_Id) {
                switch (target.type) {
                    case Adventure_Party_Item_Container_Type.bag: {
                        party.bag[target.bag_slot_index] = item;

                        break;
                    }

                    case Adventure_Party_Item_Container_Type.hero: {
                        const hero_slot = party.slots[target.hero_slot_index];
                        if (!hero_slot) return;
                        if (hero_slot.type != Adventure_Party_Slot_Type.hero) return;

                        hero_slot.items[target.item_slot_index] = item;

                        break;
                    }

                    default: unreachable(target);
                }
            }

            const item_from_slot = get_and_remove_item_from_slot(change.source);
            if (item_from_slot == undefined) break;

            put_item_in_slot(change.target, item_from_slot);

            break;
        }

        default: unreachable(change);
    }
}

export function act_on_adventure_party(party: Map_Player_Party, action: Adventure_Party_Action): Adventure_Party_Response {
    switch (action.type) {
        case Adventure_Party_Action_Type.drag_bag_item_on_hero: {
            const item = party.bag[action.bag_slot];
            const slot = party.slots[action.party_slot];

            // TODO somehow figure out a way to handle this common error in meta.ts
            if (item == undefined) break;
            if (!slot) break;
            if (slot.type != Adventure_Party_Slot_Type.hero) break;

            for (let index = 0; index < Adventure_Constants.max_hero_items; index++) {
                const item_slot = slot.items[index];

                if (item_slot == undefined) {
                    push_party_change(party, {
                        type: Adventure_Party_Change_Type.move_item,
                        source: {
                            type: Adventure_Party_Item_Container_Type.bag,
                            bag_slot_index: action.bag_slot
                        },
                        target: {
                            type: Adventure_Party_Item_Container_Type.hero,
                            hero_slot_index: action.party_slot,
                            item_slot_index: index
                        }
                    });

                    break;
                }
            }

            break;
        }

        case Adventure_Party_Action_Type.drag_hero_item_on_hero: {
            const source_hero = party.slots[action.source_hero_slot];
            if (!source_hero) break;
            if (source_hero.type != Adventure_Party_Slot_Type.hero) break;

            const source_item = source_hero.items[action.source_hero_item_slot];
            if (source_item == undefined) break;

            const target_hero = party.slots[action.target_hero_slot];
            if (!target_hero) break;
            if (target_hero.type != Adventure_Party_Slot_Type.hero) break;

            for (let item_index = 0; item_index < Adventure_Constants.max_hero_items; item_index++) {
                const item_slot = target_hero.items[item_index];

                if (item_slot == undefined) {
                    push_party_change(party, {
                        type: Adventure_Party_Change_Type.move_item,
                        source: {
                            type: Adventure_Party_Item_Container_Type.hero,
                            hero_slot_index: action.source_hero_slot,
                            item_slot_index: action.source_hero_item_slot
                        },
                        target: {
                            type: Adventure_Party_Item_Container_Type.hero,
                            hero_slot_index: action.target_hero_slot,
                            item_slot_index: item_index
                        }
                    });

                    break;
                }
            }

            break;
        }

        case Adventure_Party_Action_Type.fetch: {
            break;
        }

        default: unreachable(action);
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
            changes: result
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
