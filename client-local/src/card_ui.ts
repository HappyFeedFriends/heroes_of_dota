import { get_hero_name } from "./main_ui";

export function get_spell_name(spell_id: Spell_Id): string {
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

export function get_spell_text(spell: Card_Spell_Definition): string {
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

export function get_hero_card_art(hero_type: Hero_Type) {
    return `file://{images}/custom_game/heroes/${get_hero_dota_name(hero_type)}.jpg`;
}

export function get_creep_card_art(creep_type: Creep_Type) {
    const folder = "file://{images}/custom_game/creeps";

    switch (creep_type) {
        case Creep_Type.lane_creep: return `${folder}/lane_creep_good.jpg`;

        default: return ``;
    }
}

export function get_spell_card_art(spell_id: Spell_Id): string {
    return `file://{images}/${get_spell_card_art_file(spell_id)}`;
}

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

export function create_card_container_ui(parent: Panel, in_preview: boolean, type?: Card_Type) {
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

export function create_unit_card_ui_base(container: Panel, name: string, art_file: string, health: number, attack: number, move: number) {
    function create_stat_container(parent: Panel, id: string, value: number) {
        const stat_container = $.CreatePanel("Panel", parent, id);
        stat_container.AddClass("stat_container");

        $.CreatePanel("Panel", stat_container, "icon");

        const value_label = $.CreatePanel("Label", stat_container, "value");
        value_label.text = value.toString();
    }

    const art = $.CreatePanel("Image", container, "card_art");
    art.SetScaling(ScalingFunction.STRETCH_TO_FIT_Y_PRESERVE_ASPECT);
    art.SetImage(art_file);

    const name_panel = $.CreatePanel("Panel", container, "name_panel");
    const unit_name = $.CreatePanel("Label", name_panel, "");

    unit_name.text = name;

    const stat_panel = $.CreatePanel("Panel", container, "stat_panel");

    create_stat_container(stat_panel, "health", health);
    create_stat_container(stat_panel, "attack", attack);
    create_stat_container(stat_panel, "move_points", move);
}

export function create_hero_card_ui_base(container: Panel, hero_type: Hero_Type, health: number, attack: number, move: number) {
    create_unit_card_ui_base(container, get_hero_name(hero_type), get_hero_card_art(hero_type), health, attack, move);
}

export function create_spell_card_ui_base(container: Panel, spell: Spell_Id, spell_text: string) {
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
