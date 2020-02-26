function compute_adventure_hero_inventory_field_bonus(inventory: Adventure_Hero_Inventory, field: Modifier_Field) {
    let bonus = 0;

    for (const item of inventory) {
        if (!item) continue;

        const changes = calculate_modifier_changes(item.modifier);

        for (const change of changes) {
            if (change.type == Modifier_Change_Type.field_change) {
                if (change.field == field) {
                    bonus += change.delta;
                }
            }
        }
    }

    return bonus;
}

// TODO This is wack, because we change the snapshot we pass on server when consuming changes, but not on the client
//      this function could be made pure, if it doesn't cause any problems
function consume_adventure_party_action(party: Party_Snapshot, action: Adventure_Party_Action, change_consumer: (change: Adventure_Party_Change) => void) {
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
                    change_consumer({
                        type: Adventure_Party_Change_Type.move_item,
                        source: {
                            type: Adventure_Item_Container_Type.bag,
                            bag_slot_index: action.bag_slot
                        },
                        target: {
                            type: Adventure_Item_Container_Type.hero,
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
                    change_consumer({
                        type: Adventure_Party_Change_Type.move_item,
                        source: {
                            type: Adventure_Item_Container_Type.hero,
                            hero_slot_index: action.source_hero_slot,
                            item_slot_index: action.source_hero_item_slot
                        },
                        target: {
                            type: Adventure_Item_Container_Type.hero,
                            hero_slot_index: action.target_hero_slot,
                            item_slot_index: item_index
                        }
                    });

                    break;
                }
            }

            break;
        }

        case Adventure_Party_Action_Type.drag_hero_item_on_bag: {
            const source_hero = party.slots[action.source_hero_slot];
            if (!source_hero) break;
            if (source_hero.type != Adventure_Party_Slot_Type.hero) break;

            const source_item = source_hero.items[action.source_hero_item_slot];
            if (source_item == undefined) break;

            change_consumer({
                type: Adventure_Party_Change_Type.move_item,
                source: {
                    type: Adventure_Item_Container_Type.hero,
                    hero_slot_index: action.source_hero_slot,
                    item_slot_index: action.source_hero_item_slot
                },
                target: {
                    type: Adventure_Item_Container_Type.bag,
                    bag_slot_index: party.bag.length // Insert into a new slot at the end
                }
            });

            break;
        }

        case Adventure_Party_Action_Type.fetch: {
            break;
        }

        default: unreachable(action);
    }
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
                case Adventure_Party_Slot_Type.hero: {
                    slot.base_health = change.health;
                    break;
                }

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
            party.bag.push(change.item);

            break;
        }

        case Adventure_Party_Change_Type.move_item: {
            function get_and_remove_item_from_slot(source: Adventure_Item_Container): Adventure_Item | undefined {
                switch (source.type) {
                    case Adventure_Item_Container_Type.bag: {
                        const bag_slot = party.bag[source.bag_slot_index];
                        if (!bag_slot) return;

                        party.bag.splice(source.bag_slot_index, 1);

                        return bag_slot;
                    }

                    case Adventure_Item_Container_Type.hero: {
                        const hero_slot = party.slots[source.hero_slot_index];
                        if (!hero_slot) return;
                        if (hero_slot.type != Adventure_Party_Slot_Type.hero) return;

                        const item = hero_slot.items[source.item_slot_index];
                        if (!item) return;

                        delete hero_slot.items[source.item_slot_index];

                        return item;
                    }
                }
            }

            function put_item_in_slot(target: Adventure_Item_Container, item: Adventure_Item) {
                switch (target.type) {
                    case Adventure_Item_Container_Type.bag: {
                        party.bag[target.bag_slot_index] = item;

                        break;
                    }

                    case Adventure_Item_Container_Type.hero: {
                        const hero_slot = party.slots[target.hero_slot_index];
                        if (!hero_slot) return;
                        if (hero_slot.type != Adventure_Party_Slot_Type.hero) return;
                        if (item.type != Adventure_Item_Type.wearable) return;

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