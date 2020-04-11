function get_adventure_equipment_item_icon(id: Adventure_Equipment_Item_Id): string {
    switch (id) {
        case Adventure_Equipment_Item_Id.boots_of_travel: return get_item_icon(Item_Id.boots_of_travel);
        case Adventure_Equipment_Item_Id.assault_cuirass: return get_item_icon(Item_Id.assault_cuirass);
        case Adventure_Equipment_Item_Id.divine_rapier: return get_item_icon(Item_Id.divine_rapier);
        case Adventure_Equipment_Item_Id.mask_of_madness: return get_item_icon(Item_Id.mask_of_madness);
        case Adventure_Equipment_Item_Id.boots_of_speed: return get_item_icon(Item_Id.boots_of_speed);
        case Adventure_Equipment_Item_Id.blades_of_attack: return get_item_icon(Item_Id.blades_of_attack);
        case Adventure_Equipment_Item_Id.belt_of_strength: return get_item_icon(Item_Id.belt_of_strength);
        case Adventure_Equipment_Item_Id.chainmail: return get_item_icon(Item_Id.chainmail);
        case Adventure_Equipment_Item_Id.basher: return get_item_icon(Item_Id.basher);
        case Adventure_Equipment_Item_Id.iron_branch: return get_item_icon(Item_Id.iron_branch);
    }
}

function get_adventure_consumable_item_icon(id: Adventure_Consumable_Item_Id): string {
    function get_consumable_icon_name(id: Adventure_Consumable_Item_Id): string {
        switch (id) {
            case Adventure_Consumable_Item_Id.enchanted_mango: return "enchanted_mango";
            case Adventure_Consumable_Item_Id.healing_salve: return "salve";
            case Adventure_Consumable_Item_Id.tome_of_knowledge: return "tome_of_knowledge";
        }
    }

    return `file://{images}/items/${get_consumable_icon_name(id)}.png`;
}

function get_adventure_item_icon(item: Adventure_Item): string {
    switch (item.type) {
        case Adventure_Item_Type.equipment: {
            return get_adventure_equipment_item_icon(item.item_id);
        }

        case Adventure_Item_Type.consumable: {
            return get_adventure_consumable_item_icon(item.item_id);
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
            case Item_Id.iron_branch: return "branches";
        }
    }

    return `file://{images}/items/${get_item_icon_name(id)}.png`;
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

function get_full_hero_icon_path(type: Hero_Type): string {
    return `file://{images}/heroes/npc_dota_hero_${get_hero_dota_name(type)}.png`;
}

function get_full_creep_icon_path(type: Creep_Type): string {
    switch (type) {
        case Creep_Type.pocket_tower: return "";
        case Creep_Type.lane_creep: return "";
        case Creep_Type.satyr_big: return "";
        case Creep_Type.satyr_small: return "";
        case Creep_Type.small_spider: return "";
        case Creep_Type.large_spider: return "";
        case Creep_Type.spider_matriarch: return "";
        case Creep_Type.spiderling: return "";
        case Creep_Type.ember_fire_remnant: return "";
    }
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

function create_deck_card_panel(parent: Panel, type: string, text: string, image_path: string) {
    const card = $.CreatePanel("Panel", parent, "");
    card.AddClass("deck_card");
    card.AddClass(type);

    const flash = $.CreatePanel("Panel", card, "");
    flash.AddClass("animate_add_to_deck_flash");

    const label = $.CreatePanel("Label", card, "name");
    label.text = text;

    const image = $.CreatePanel("Panel", card, "image");
    safely_set_panel_background_image(image, image_path);

    return card;
}
