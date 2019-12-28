import {unreachable} from "./common";
import {import_battle_sim} from "./server";

export type Map_Player_Party = {
    currency: number
    slots: Map_Player_Party_Slot[]
    changes: Adventure_Party_Change[]
}

export type Map_Player_Party_Slot = {
    type: Adventure_Party_Slot_Type.empty
} | {
    type: Adventure_Party_Slot_Type.hero
    hero: Hero_Type
    health: number
    battle_unit_id: Unit_Id
} | {
    type: Adventure_Party_Slot_Type.creep
    creep: Creep_Type
    health: number
    battle_unit_id: Unit_Id
} | {
    type: Adventure_Party_Slot_Type.spell
    spell: Spell_Id
    card_id: Card_Id
}

import_battle_sim();

export function find_empty_party_slot_index(party: Map_Player_Party): number {
    return party.slots.findIndex(slot => slot.type == Adventure_Party_Slot_Type.empty);
}

export function push_party_change(party: Map_Player_Party, change: Adventure_Party_Change) {
    function set_slot(index: number, slot: Adventure_Party_Slot) {
        switch (slot.type) {
            case Adventure_Party_Slot_Type.spell: {
                party.slots[index] = {
                    type: Adventure_Party_Slot_Type.spell,
                    card_id: -1 as Card_Id, // TODO ugh
                    spell: slot.spell
                };

                break;
            }

            case Adventure_Party_Slot_Type.hero: {
                party.slots[index] = {
                    type: Adventure_Party_Slot_Type.hero,
                    hero: slot.hero,
                    health: slot.health,
                    battle_unit_id: -1 as Unit_Id, // TODO ugh
                };

                break;
            }

            case Adventure_Party_Slot_Type.creep: {
                party.slots[index] = {
                    type: Adventure_Party_Slot_Type.creep,
                    creep: slot.creep,
                    health: slot.health,
                    battle_unit_id: -1 as Unit_Id, // TODO ugh
                };

                break;
            }

            case Adventure_Party_Slot_Type.empty: {
                party.slots[index] = slot;

                break;
            }

            default: unreachable(slot);
        }
    }

    switch (change.type) {
        case Adventure_Party_Change_Type.set_slot: {
            set_slot(change.slot_index, change.slot);

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

        default: unreachable(change);
    }

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
            health: hero_definition_by_type(hero).health
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
