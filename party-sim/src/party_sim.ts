const enum Purchase_Type {
    card,
    item
}

type Available_Purchase = {
    type: Purchase_Type.item
    item: Adventure_Merchant_Item
} | {
    type: Purchase_Type.card
    card: Adventure_Merchant_Card
}

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

function find_available_purchase_in_merchant(merchant: Adventure_Merchant, purchase_id: Adventure_Party_Entity_Id): Available_Purchase | undefined {
    const card = merchant.stock.cards.find(card => card.entity_id == purchase_id);
    if (card) {
        if (!card.sold_out) {
            return {
                type: Purchase_Type.card,
                card: card,
            };
        }

        return;
    }

    const item = merchant.stock.items.find(item => item.entity_id == purchase_id);
    if (item) {
        if (!item.sold_out) {
            return {
                type: Purchase_Type.item,
                item: item,
            };
        }

        return;
    }
}

function find_empty_party_slot_index(party: Party_Snapshot): number {
    return party.slots.findIndex(slot => slot.type == Adventure_Party_Slot_Type.empty);
}

function change_party_empty_slot(slot: number): Adventure_Party_Change {
    return {
        type: Adventure_Party_Change_Type.set_slot,
        slot_index: slot,
        slot: { type: Adventure_Party_Slot_Type.empty },
        reason: Adventure_Acquire_Reason.none
    }
}

function change_party_add_hero(slot: number, hero: Hero_Type, reason = Adventure_Acquire_Reason.none): Adventure_Party_Change {
    return {
        type: Adventure_Party_Change_Type.set_slot,
        slot_index: slot,
        slot: {
            type: Adventure_Party_Slot_Type.hero,
            hero: hero,
            base_health: hero_definition_by_type(hero).health,
            items: []
        },
        reason: reason
    }
}

function change_party_add_creep(slot: number, creep: Creep_Type, reason = Adventure_Acquire_Reason.none): Adventure_Party_Change {
    return {
        type: Adventure_Party_Change_Type.set_slot,
        slot_index: slot,
        slot: {
            type: Adventure_Party_Slot_Type.creep,
            creep: creep,
            health: creep_definition_by_type(creep).health
        },
        reason: reason
    }
}

function change_party_add_spell(slot: number, spell: Spell_Id, reason = Adventure_Acquire_Reason.none): Adventure_Party_Change {
    return {
        type: Adventure_Party_Change_Type.set_slot,
        slot_index: slot,
        slot: {
            type: Adventure_Party_Slot_Type.spell,
            spell: spell
        },
        reason: reason
    }
}

function change_party_change_health(slot: number, health: number, reason: Adventure_Health_Change_Reason): Adventure_Party_Change {
    return {
        type: Adventure_Party_Change_Type.set_health,
        slot_index: slot,
        health: health,
        reason: reason
    }
}

function change_party_add_item(item: Adventure_Item, reason = Adventure_Acquire_Reason.none): Adventure_Party_Change {
    return {
        type: Adventure_Party_Change_Type.add_item_to_bag,
        item: item,
        reason: reason
    }
}

function change_party_set_currency(amount: number, from_purchase = false): Adventure_Party_Change {
    return {
        type: Adventure_Party_Change_Type.set_currency_amount,
        amount: amount,
        from_purchase: from_purchase
    }
}

function available_purchase_to_party_changes(party: Party_Snapshot, available: Available_Purchase) {
    switch (available.type) {
        case Purchase_Type.card: {
            const free_slot = find_empty_party_slot_index(party);
            if (free_slot == -1) return;

            const card = available.card;
            if (card.cost > party.currency) return;

            const result: Adventure_Party_Change[] = [];

            switch (card.type) {
                case Adventure_Merchant_Card_Type.hero: {
                    result.push(change_party_add_hero(free_slot, card.hero, Adventure_Acquire_Reason.purchase));
                    break;
                }

                case Adventure_Merchant_Card_Type.creep: {
                    result.push(change_party_add_creep(free_slot, card.creep, Adventure_Acquire_Reason.purchase));
                    break;
                }

                case Adventure_Merchant_Card_Type.spell: {
                    result.push(change_party_add_spell(free_slot, card.spell, Adventure_Acquire_Reason.purchase));
                    break;
                }

                default: unreachable(card);
            }

            result.push(change_party_set_currency(party.currency - card.cost, true));

            return result;
        }

        case Purchase_Type.item: {
            const item = available.item;
            if (item.cost > party.currency) return;

            return [
                change_party_add_item(item.data),
                change_party_set_currency(party.currency - item.cost, true)
            ];
        }

        default: unreachable(available);
    }
}

function is_party_hero_dead(slot: Find_By_Type<Adventure_Party_Slot, Adventure_Party_Slot_Type.hero>) {
    const health_bonus = compute_adventure_hero_inventory_field_bonus(slot.items, Modifier_Field.health_bonus);
    const actual_health = slot.base_health + health_bonus;
    return actual_health <= 0;
}

function is_party_creep_dead(slot: Find_By_Type<Adventure_Party_Slot, Adventure_Party_Slot_Type.creep>) {
    return slot.health == 0;
}

// TODO This is wack, because we change the snapshot we pass on server when consuming changes, but not on the client
//      this function could be made pure, if it doesn't cause any problems
function consume_adventure_party_action(party: Party_Snapshot, action: Adventure_Party_Action, change_consumer: (change: Adventure_Party_Change) => void) {
    function find_item_by_entity_id(id: Adventure_Party_Entity_Id): [Adventure_Item_Container, Adventure_Item] | undefined {
        const index_in_bag = party.bag.findIndex(item => item.entity_id == id);
        if (index_in_bag != -1) {
            const item = party.bag[index_in_bag];

            return [{
                type: Adventure_Item_Container_Type.bag,
                bag_slot_index: index_in_bag
            }, item]
        }

        for (let slot_index = 0; slot_index < party.slots.length; slot_index++) {
            const slot = party.slots[slot_index];
            if (slot.type == Adventure_Party_Slot_Type.hero) {
                for (let item_index = 0; item_index < Adventure_Constants.max_hero_items; item_index++) {
                    const item = slot.items[item_index];
                    if (item && item.entity_id == id) {
                        return [{
                            type: Adventure_Item_Container_Type.hero,
                            item_slot_index: item_index,
                            hero_slot_index: slot_index
                        }, item]
                    }
                }
            }
        }
    }

    switch (action.type) {
        case Adventure_Party_Action_Type.drag_item_on_hero: {
            const result = find_item_by_entity_id(action.item_entity);
            if (!result) break;

            const [container, item] = result;
            if (item.type != Adventure_Item_Type.equipment) break;

            const slot = party.slots[action.party_slot];
            if (!slot) break;
            if (slot.type != Adventure_Party_Slot_Type.hero) break;
            if (is_party_hero_dead(slot)) break;

            for (let index = 0; index < Adventure_Constants.max_hero_items; index++) {
                const item_slot = slot.items[index];

                if (!item_slot) {
                    change_consumer({
                        type: Adventure_Party_Change_Type.move_item,
                        source: container,
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

        case Adventure_Party_Action_Type.drag_item_on_bag: {
            const result = find_item_by_entity_id(action.item_entity);
            if (!result) break;

            const [container] = result;

            change_consumer({
                type: Adventure_Party_Change_Type.move_item,
                source: container,
                target: {
                    type: Adventure_Item_Container_Type.bag,
                    bag_slot_index: party.bag.length // Insert into a new slot at the end
                }
            });

            break;
        }

        case Adventure_Party_Action_Type.use_consumable: {
            const target = party.slots[action.party_slot];
            if (!target) break;
            if (target.type != Adventure_Party_Slot_Type.hero) break;
            if (is_party_hero_dead(target)) break;

            const result = find_item_by_entity_id(action.item_entity);
            if (!result) break;

            const [container, item] = result;
            if (container.type != Adventure_Item_Container_Type.bag) break;
            if (item.type != Adventure_Item_Type.consumable) break;

            change_consumer({
                type: Adventure_Party_Change_Type.remove_bag_item,
                slot_index: container.bag_slot_index
            });

            switch (item.item_id) {
                case Adventure_Consumable_Item_Id.healing_salve: {
                    const max_health = hero_definition_by_type(target.hero).health;
                    const new_health = Math.min(target.base_health + 5, max_health);

                    change_consumer({
                        type: Adventure_Party_Change_Type.set_health,
                        slot_index: action.party_slot,
                        health: new_health,
                        reason: Adventure_Health_Change_Reason.healing_salve
                    });

                    break;
                }

                case Adventure_Consumable_Item_Id.tome_of_knowledge: {
                    break;
                }

                case Adventure_Consumable_Item_Id.enchanted_mango: {
                    break;
                }

                default: unreachable(item.item_id);
            }


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
        case Adventure_Party_Change_Type.set_currency_amount: {
            party.currency = change.amount;

            break;
        }

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

        case Adventure_Party_Change_Type.remove_bag_item: {
            party.bag.splice(change.slot_index, 1);

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
                        if (item.type != Adventure_Item_Type.equipment) return;

                        hero_slot.items[target.item_slot_index] = item;

                        break;
                    }

                    default: unreachable(target);
                }
            }

            const item_from_slot = get_and_remove_item_from_slot(change.source);
            if (!item_from_slot) break;

            put_item_in_slot(change.target, item_from_slot);

            break;
        }

        default: unreachable(change);
    }
}