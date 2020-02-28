function get_hero_name(hero: Hero_Type): string {
    const enum_string = enum_to_string(hero);

    return enum_string.split("_")
        .map(word => word[0].toUpperCase() + word.slice(1))
        .reduce((prev, value) => prev + " " + value);
}

function get_creep_name(creep: Creep_Type) {
    const enum_string = enum_to_string(creep);

    return enum_string.split("_")
        .map(word => word[0].toUpperCase() + word.slice(1))
        .reduce((prev, value) => prev + " " + value);
}

function get_adventure_wearable_item_icon(id: Adventure_Wearable_Item_Id): string {
    switch (id) {
        case Adventure_Wearable_Item_Id.boots_of_travel: return get_item_icon(Item_Id.boots_of_travel);
        case Adventure_Wearable_Item_Id.assault_cuirass: return get_item_icon(Item_Id.assault_cuirass);
        case Adventure_Wearable_Item_Id.divine_rapier: return get_item_icon(Item_Id.divine_rapier);
        case Adventure_Wearable_Item_Id.mask_of_madness: return get_item_icon(Item_Id.mask_of_madness);
        case Adventure_Wearable_Item_Id.boots_of_speed: return get_item_icon(Item_Id.boots_of_speed);
        case Adventure_Wearable_Item_Id.blades_of_attack: return get_item_icon(Item_Id.blades_of_attack);
        case Adventure_Wearable_Item_Id.belt_of_strength: return get_item_icon(Item_Id.belt_of_strength);
        case Adventure_Wearable_Item_Id.chainmail: return get_item_icon(Item_Id.chainmail);
        case Adventure_Wearable_Item_Id.basher: return get_item_icon(Item_Id.basher);
    }
}

function get_adventure_item_icon(item: Adventure_Item): string {
    function get_consumable_icon_name(id: Adventure_Consumable_Item_Id): string {
        switch (id) {
            case Adventure_Consumable_Item_Id.enchanted_mango: return "enchanted_mango";
            case Adventure_Consumable_Item_Id.healing_salve: return "salve";
            case Adventure_Consumable_Item_Id.tome_of_knowledge: return "tome_of_knowledge";
        }
    }

    switch (item.type) {
        case Adventure_Item_Type.wearable: {
            return get_adventure_wearable_item_icon(item.item_id);
        }

        case Adventure_Item_Type.consumable: {
            return `file://{images}/items/${get_consumable_icon_name(item.item_id)}.png`;
        }
    }
}

function get_item_icon(id: Item_Id) {
    function get_item_icon_name(id: Item_Id): string {
        switch (id) {
            case Item_Id.satanic: return "satanic";
            case Item_Id.heart_of_tarrasque: return "heart";
            case Item_Id.tome_of_knowledge: return "tome_of_knowledge";
            case Item_Id.assault_cuirass: return "assault";
            case Item_Id.divine_rapier: return "rapier";
            case Item_Id.boots_of_travel: return "travel_boots";
            case Item_Id.refresher_shard: return "refresher_shard";
            case Item_Id.mask_of_madness: return "mask_of_madness";
            case Item_Id.armlet: return "armlet_active";
            case Item_Id.boots_of_speed: return "boots";
            case Item_Id.blades_of_attack: return "blades_of_attack";
            case Item_Id.belt_of_strength: return "belt_of_strength";
            case Item_Id.morbid_mask: return "lifesteal";
            case Item_Id.chainmail: return "chainmail";
            case Item_Id.enchanted_mango: return "enchanted_mango";
            case Item_Id.octarine_core: return "octarine_core";
            case Item_Id.basher: return "basher";
        }
    }

    return `file://{images}/items/${get_item_icon_name(id)}.png`;
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

function get_hero_card_art(hero_type: Hero_Type) {
    return `file://{images}/custom_game/heroes/${get_hero_dota_name(hero_type)}.jpg`;
}

function get_creep_card_art(creep_type: Creep_Type) {
    const folder = "file://{images}/custom_game/creeps";

    switch (creep_type) {
        case Creep_Type.lane_creep: return `${folder}/lane_creep_good.jpg`;

        default: return ``;
    }
}

function get_full_unit_icon_path(type: Hero_Type): string {
    return `file://{images}/heroes/npc_dota_hero_${get_hero_dota_name(type)}.png`;
}

function get_spell_card_art(spell_id: Spell_Id): string {
    function get_spell_card_art_file(spell_id: Spell_Id): string {
        switch (spell_id) {
            case Spell_Id.buyback: return "profile_badges/level_46.png";
            case Spell_Id.euls_scepter: return "profile_badges/level_71.png";
            case Spell_Id.mekansm: return "profile_badges/level_45.png";
            case Spell_Id.buckler: return "profile_badges/level_21.png";
            case Spell_Id.drums_of_endurance: return "profile_badges/level_42.png";
            case Spell_Id.town_portal_scroll: return "custom_game/spells/teleport_scroll.png";
            case Spell_Id.pocket_tower: return "custom_game/spells/pocket_tower.png";
            case Spell_Id.call_to_arms: return "custom_game/spells/call_to_arms.png";
            case Spell_Id.refresher_orb: return "profile_badges/level_95.png";
        }
    }
    
    return `file://{images}/${get_spell_card_art_file(spell_id)}`;
}

function create_card_container_ui(parent: Panel, in_preview: boolean, type?: Card_Type) {
    const card = $.CreatePanel("Panel", parent, "");
    card.AddClass("card");

    if (in_preview) {
        card.AddClass("in_preview");
    }

    if (type != undefined) {
        switch (type) {
            case Card_Type.existing_hero:
            case Card_Type.hero: {
                card.AddClass("hero");
                break
            }

            case Card_Type.spell: {
                card.AddClass("spell");
                break;
            }
        }
    }

    return card;
}

function create_stat_container(parent: Panel, id: string, value: number) {
    const stat_container = $.CreatePanel("Panel", parent, id);
    stat_container.AddClass("stat_container");

    $.CreatePanel("Panel", stat_container, "icon");

    const value_label = $.CreatePanel("Label", stat_container, "value");
    value_label.text = value.toString();

    return value_label;
}

function create_unit_card_ui_base(container: Panel, name: string, art_file: string, health: number, attack: number, move: number, armor = 0) {
    const art = $.CreatePanel("Image", container, "card_art");
    art.SetScaling(ScalingFunction.STRETCH_TO_FIT_Y_PRESERVE_ASPECT);
    art.SetImage(art_file);

    const name_panel = $.CreatePanel("Panel", container, "name_panel");
    const unit_name = $.CreatePanel("Label", name_panel, "");

    unit_name.text = name;

    const stat_panel = $.CreatePanel("Panel", container, "hero_card_stats");
    stat_panel.SetHasClass("no_armor", armor == 0);

    create_stat_container(stat_panel, "health", health);
    create_stat_container(stat_panel, "attack", attack);
    create_stat_container(stat_panel, "move_points", move);
    create_stat_container(stat_panel, "armor", armor);
}

function create_hero_card_ui_base(container: Panel, hero_type: Hero_Type, health: number, attack: number, move: number, armor = 0) {
    create_unit_card_ui_base(container, get_hero_name(hero_type), get_hero_card_art(hero_type), health, attack, move, armor);
}

function create_spell_card_ui_base(container: Panel, spell: Spell_Id, spell_text: string) {
    const name_panel = $.CreatePanel("Panel", container, "name_panel");
    const spell_name = $.CreatePanel("Label", name_panel, "");
    spell_name.text = get_spell_name(spell);

    const art = $.CreatePanel("Image", container, "card_art");
    art.SetScaling(ScalingFunction.STRETCH_TO_FIT_X_PRESERVE_ASPECT);
    art.SetImage(get_spell_card_art(spell));

    const text_container = $.CreatePanel("Panel", container, "card_text");
    const text = $.CreatePanel("Label", text_container, "");

    text.text = spell_text;
}
