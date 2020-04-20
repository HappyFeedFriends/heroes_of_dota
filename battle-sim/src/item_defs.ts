function item_gold_cost(item_id: Item_Id): number {
    switch (item_id) {
        case Item_Id.refresher_shard: return 8;
        case Item_Id.tome_of_knowledge: return 6;
        case Item_Id.divine_rapier: return 14;
        case Item_Id.satanic: return 10;
        case Item_Id.assault_cuirass: return 10;
        case Item_Id.heart_of_tarrasque: return 12;
        case Item_Id.boots_of_travel: return 8;
        case Item_Id.mask_of_madness: return 6;
        case Item_Id.armlet: return 8;
        case Item_Id.octarine_core: return 8;
        case Item_Id.basher: return 14;
        case Item_Id.boots_of_speed: return 2;
        case Item_Id.blades_of_attack: return 2;
        case Item_Id.belt_of_strength: return 2;
        case Item_Id.morbid_mask: return 2;
        case Item_Id.chainmail: return 2;
        case Item_Id.enchanted_mango: return 2;
        case Item_Id.iron_branch: return 4
    }
}