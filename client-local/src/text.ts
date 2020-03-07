function get_hero_name(hero: Hero_Type): string {
    return snake_case_to_capitalized_words(enum_to_string(hero));
}

function get_creep_name(creep: Creep_Type) {
    return snake_case_to_capitalized_words(enum_to_string(creep));
}

function get_npc_name(npc: Npc_Type) {
    return snake_case_to_capitalized_words(enum_to_string(npc));
}

function snake_case_to_capitalized_words(source: string) {
    return source.split("_")
        .map(word => word[0].toUpperCase() + word.slice(1))
        .reduce((prev, value) => prev + " " + value);
}

function get_spell_name(spell_id: Spell_Id): string {
    switch (spell_id) {
        case Spell_Id.buyback: return "Buyback";
        case Spell_Id.euls_scepter: return "Eul's Scepter";
        case Spell_Id.mekansm: return "Mekansm";
        case Spell_Id.buckler: return "Buckler";
        case Spell_Id.drums_of_endurance: return "Drums of Endurance";
        case Spell_Id.town_portal_scroll: return "Town Portal Scroll";
        case Spell_Id.pocket_tower: return "Pocket Tower";
        case Spell_Id.call_to_arms: return "Call to Arms";
        case Spell_Id.refresher_orb: return "Refresher Orb";
    }
}

function get_spell_text(spell: Card_Spell_Definition): string {
    switch (spell.spell_id) {
        case Spell_Id.buyback: return `Spend gold to return a dead ally hero to your hand`;
        case Spell_Id.euls_scepter: return `Make target untargetable until next turn`;
        case Spell_Id.mekansm: return `Restore ${spell.heal} health to all allies`;
        case Spell_Id.buckler: return `Give allies ${spell.armor} armor for ${spell.duration} turns`;
        case Spell_Id.drums_of_endurance: return `Give allies ${spell.move_points_bonus} move points this turn`;
        case Spell_Id.town_portal_scroll: return `Restore hero's health and return them to your hand`;
        case Spell_Id.pocket_tower: return `Summon a tower to attack a random enemy each turn. Extends deployment zone`;
        case Spell_Id.call_to_arms: return `Summon ${spell.creeps_to_summon} lane creeps in your deployment zone`;
        case Spell_Id.refresher_orb: return `Restore charges of all abilities for target`;
    }
}

function get_item_name(item: Item_Id): string {
    switch (item) {
        case Item_Id.boots_of_travel: return "Boots of Travel";
        case Item_Id.heart_of_tarrasque: return "Heart of Tarrasque";
        case Item_Id.assault_cuirass: return "Assault Cuirass";
        case Item_Id.satanic: return "Satanic";
        case Item_Id.divine_rapier: return "Divine Rapier";
        case Item_Id.tome_of_knowledge: return "Tome of Knowledge";
        case Item_Id.refresher_shard: return "Refresher Shard";
        case Item_Id.mask_of_madness: return "Mask of Madness";
        case Item_Id.armlet: return "Armlet";
        case Item_Id.boots_of_speed: return "Boots of Speed";
        case Item_Id.blades_of_attack: return "Blade of Attack";
        case Item_Id.belt_of_strength: return "Belt of Strength";
        case Item_Id.morbid_mask: return "Morbid Mask";
        case Item_Id.chainmail: return "Chainmail";
        case Item_Id.enchanted_mango: return "Enchanted Mango";
        case Item_Id.octarine_core: return "Octarine Core";
        case Item_Id.basher: return "Basher";
        case Item_Id.iron_branch: return "Iron Branch";
    }
}

function get_adventure_wearable_item_name(id: Adventure_Wearable_Item_Id): string {
    switch (id) {
        case Adventure_Wearable_Item_Id.boots_of_travel: return get_item_name(Item_Id.boots_of_travel);
        case Adventure_Wearable_Item_Id.assault_cuirass: return get_item_name(Item_Id.assault_cuirass);
        case Adventure_Wearable_Item_Id.divine_rapier: return get_item_name(Item_Id.divine_rapier);
        case Adventure_Wearable_Item_Id.mask_of_madness: return get_item_name(Item_Id.mask_of_madness);
        case Adventure_Wearable_Item_Id.boots_of_speed: return get_item_name(Item_Id.boots_of_speed);
        case Adventure_Wearable_Item_Id.blades_of_attack: return get_item_name(Item_Id.blades_of_attack);
        case Adventure_Wearable_Item_Id.belt_of_strength: return get_item_name(Item_Id.belt_of_strength);
        case Adventure_Wearable_Item_Id.chainmail: return get_item_name(Item_Id.chainmail);
        case Adventure_Wearable_Item_Id.basher: return get_item_name(Item_Id.basher);
        case Adventure_Wearable_Item_Id.iron_branch: return get_item_name(Item_Id.iron_branch);
    }
}

function get_adventure_consumable_item_name(id: Adventure_Consumable_Item_Id): string {
    switch (id) {
        case Adventure_Consumable_Item_Id.healing_salve: return "Healing Salve";
        case Adventure_Consumable_Item_Id.enchanted_mango: return get_item_name(Item_Id.enchanted_mango);
        case Adventure_Consumable_Item_Id.tome_of_knowledge: return get_item_name(Item_Id.tome_of_knowledge);
    }
}

function get_adventure_entity_name(entity: Adventure_Entity_Definition_Data): string {
    switch (entity.type) {
        case Adventure_Entity_Type.enemy: return get_npc_name(entity.npc_type);
        case Adventure_Entity_Type.lost_creep: return "Lost Creep";
        case Adventure_Entity_Type.shrine: return "Shrine";
        case Adventure_Entity_Type.gold_bag: return "Bag of Gold";
        case Adventure_Entity_Type.item_on_the_ground: return "Item";
    }
}