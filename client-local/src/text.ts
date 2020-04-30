function get_hero_name(hero: Hero_Type): string {
    return snake_case_to_capitalized_words(enum_to_string(hero));
}

function get_creep_name(creep: Creep_Type) {
    return snake_case_to_capitalized_words(enum_to_string(creep));
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
        case Item_Id.blades_of_attack: return "Blades of Attack";
        case Item_Id.belt_of_strength: return "Belt of Strength";
        case Item_Id.morbid_mask: return "Morbid Mask";
        case Item_Id.chainmail: return "Chainmail";
        case Item_Id.enchanted_mango: return "Enchanted Mango";
        case Item_Id.octarine_core: return "Octarine Core";
        case Item_Id.basher: return "Basher";
        case Item_Id.iron_branch: return "Iron Branch";
    }
}

function get_adventure_item_name(item: Adventure_Item): string {
    return get_adventure_item_name_by_id(item.item_id)
}

function get_adventure_item_name_by_id(item_id: Adventure_Item_Id) {
    switch (item_id) {
        case Adventure_Item_Id.boots_of_travel: return get_item_name(Item_Id.boots_of_travel);
        case Adventure_Item_Id.assault_cuirass: return get_item_name(Item_Id.assault_cuirass);
        case Adventure_Item_Id.divine_rapier: return get_item_name(Item_Id.divine_rapier);
        case Adventure_Item_Id.mask_of_madness: return get_item_name(Item_Id.mask_of_madness);
        case Adventure_Item_Id.boots_of_speed: return get_item_name(Item_Id.boots_of_speed);
        case Adventure_Item_Id.blades_of_attack: return get_item_name(Item_Id.blades_of_attack);
        case Adventure_Item_Id.belt_of_strength: return get_item_name(Item_Id.belt_of_strength);
        case Adventure_Item_Id.chainmail: return get_item_name(Item_Id.chainmail);
        case Adventure_Item_Id.basher: return get_item_name(Item_Id.basher);
        case Adventure_Item_Id.iron_branch: return get_item_name(Item_Id.iron_branch);
        case Adventure_Item_Id.mystic_staff: return "Mystic Staff";
        case Adventure_Item_Id.ring_of_regen: return "Ring of Regen";
        case Adventure_Item_Id.ring_of_tarrasque: return "Ring of Tarrasque";
        case Adventure_Item_Id.heart_of_tarrasque: return get_item_name(Item_Id.heart_of_tarrasque);
        case Adventure_Item_Id.tome_of_aghanim: return "Tome of Aghanim";
        case Adventure_Item_Id.spider_legs: return "Spider Legs";

        case Adventure_Item_Id.healing_salve: return "Healing Salve";
        case Adventure_Item_Id.enchanted_mango: return get_item_name(Item_Id.enchanted_mango);
        case Adventure_Item_Id.tome_of_knowledge: return get_item_name(Item_Id.tome_of_knowledge);
        case Adventure_Item_Id.tome_of_strength: return "Tome of Strength";
        case Adventure_Item_Id.tome_of_agility: return "Tome of Agility";
        case Adventure_Item_Id.elixir_of_vitality: return "Elixir of Vitality";
        case Adventure_Item_Id.potion_of_iron: return "Potion of Iron";
        case Adventure_Item_Id.spider_blood_extract: return "Spider Blood Extract";
        case Adventure_Item_Id.strengthening_balm: return "Strengthening Balm";
    }
}

function get_adventure_entity_name(entity: Adventure_Entity): string {
    switch (entity.type) {
        case Adventure_Entity_Type.enemy: return get_creep_name(entity.world_model);
        case Adventure_Entity_Type.lost_creep: return "Lost Creep";
        case Adventure_Entity_Type.shrine: return "Shrine";
        case Adventure_Entity_Type.gold_bag: return "Bag of Gold";
        case Adventure_Entity_Type.item_on_the_ground: return "Item";
        case Adventure_Entity_Type.merchant: return "Merchant";
    }
}

function get_combat_result_string(result: Combat_Result): string {
    switch (result) {
        case Combat_Result.victory: return "victory";
        case Combat_Result.defeat: return "defeat";
        case Combat_Result.draw: return "draw";
    }
}

function get_field_name(field: Modifier_Field): string {
    switch (field) {
        case Modifier_Field.armor_bonus: return "armor";
        case Modifier_Field.health_bonus: return "health";
        case Modifier_Field.attack_bonus: return "attack";
        case Modifier_Field.move_points_bonus: return "moves";
    }
}

function get_status_text(status: Unit_Status) {
    switch (status) {
        case Unit_Status.rooted: return "rooted";
        case Unit_Status.silenced: return "silenced";
        case Unit_Status.stunned: return "stunned";
        case Unit_Status.disarmed: return "disarmed";
        case Unit_Status.out_of_the_game: return "out of the game";
        case Unit_Status.unselectable: return "unselectable";
        case Unit_Status.phased: return "phased";
    }
}

function em(text: any) {
    return `<span class="tooltip_emphasis"><b>${text}</b></span>`
}

function get_special_modifier_text(modifier: Modifier) {
    const health = (how_much: number) => {
        return `${em(how_much)}${field_ui(Modifier_Field.health_bonus)}`;
    };

    switch (modifier.id) {
        case Modifier_Id.item_armlet: return `Lose ${health(modifier.health_loss_per_turn)} at the end of each turn. Non-lethal`;
        case Modifier_Id.item_basher: return `Basic attack ${em("stuns")} targets for 1 turn`;
        case Modifier_Id.item_morbid_mask: return `Basic attack restores ${health(modifier.health_restored_per_attack)}`;
        case Modifier_Id.item_octarine_core: return `Abilties restore ${health(1)} per each point of damage dealt`;
        case Modifier_Id.item_satanic: return `Basic attack restores ${health(1)} per each point of damage dealt`;
        case Modifier_Id.item_heart_of_tarrasque: return `Restore ${health(modifier.regeneration_per_turn)} at the end of each turn`;
    }
}