function item_id_to_item(item_id: Item_Id): Item {
    switch (item_id) {
        case Item_Id.refresher_shard: return {
            id: item_id,
            gold_cost: 8
        };

        case Item_Id.tome_of_knowledge: return {
            id: item_id,
            gold_cost: 6
        };

        case Item_Id.divine_rapier: return {
            id: item_id,
            damage_bonus: 8,
            gold_cost: 14
        };

        case Item_Id.satanic: return {
            id: item_id,
            gold_cost: 10
        };

        case Item_Id.assault_cuirass: return {
            id: item_id,
            armor_bonus: 4,
            gold_cost: 10
        };

        case Item_Id.heart_of_tarrasque: return {
            id: item_id,
            health_bonus: 10,
            regeneration_per_turn: 1,
            gold_cost: 12
        };

        case Item_Id.boots_of_travel: return {
            id: item_id,
            move_points_bonus: 3,
            gold_cost: 8
        };

        case Item_Id.mask_of_madness: return {
            id: item_id,
            damage_bonus: 4,
            gold_cost: 6
        };

        case Item_Id.armlet: return {
            id: item_id,
            health_bonus: 10,
            health_loss_per_turn: 1,
            gold_cost: 8
        };

        case Item_Id.octarine_core: return {
            id: item_id,
            gold_cost: 8
        };

        case Item_Id.boots_of_speed: return {
            id: item_id,
            move_points_bonus: 1,
            gold_cost: 2
        };

        case Item_Id.blades_of_attack: return {
            id: item_id,
            damage_bonus: 2,
            gold_cost: 2
        };

        case Item_Id.belt_of_strength: return {
            id: item_id,
            health_bonus: 4,
            gold_cost: 2
        };

        case Item_Id.morbid_mask: return {
            id: item_id,
            health_restored_per_attack: 1,
            gold_cost: 2
        };

        case Item_Id.chainmail: return {
            id: item_id,
            armor_bonus: 1,
            gold_cost: 2
        };

        case Item_Id.enchanted_mango: return {
            id: item_id,
            bonus_charges: 1,
            gold_cost: 2
        };
    }
}