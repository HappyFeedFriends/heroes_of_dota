const adventure_ui = {
    game_state: Player_State.not_logged_in,
    card_container: $("#adventure_cards"),
    currency_label: $("#currency_remaining") as LabelPanel,
    tooltip: {
        ...create_adventure_card_tooltip($("#adventure_card_tooltips")),
        css_class: ""
    }
};

const max_adventure_slots = 10;

type Adventure_Cart_Slot = {
    container: Panel
    card_panel: Panel
    art: Panel
    banned_overlay: Panel
}

hide_adventure_tooltip();

function create_adventure_card_tooltip(root: Panel) {
    const parent = $.CreatePanel("Panel", root, "card_tooltip");

    const card = $.CreatePanel("Panel", parent, "");
    card.style.transitionDuration = "0s";
    card.AddClass("card");
    card.AddClass("in_preview");

    $.CreatePanel("Panel", parent, "arrow");

    return {
        container: parent,
        card: card
    };
}

function create_adventure_card_slot(root: Panel): Adventure_Cart_Slot {
    const container = $.CreatePanel("Panel", root, "");
    container.AddClass("adventure_card_container");

    const card_panel = $.CreatePanel("Panel", container, "adventure_card");
    const art = $.CreatePanel("Panel", card_panel, "adventure_card_art");
    const banned_overlay = $.CreatePanel("Panel", card_panel, "banned_overlay");

    return {
        container: container,
        card_panel: card_panel,
        art: art,
        banned_overlay: banned_overlay
    }
}

function show_and_prepare_adventure_tooltip(slot: Adventure_Cart_Slot, css_class: string) {
    const screen_ratio = Game.GetScreenHeight() / 1080;
    const window_position = slot.container.GetPositionWithinWindow();

    // Unfortunately actuallayoutwidth/height are not update before a panel is shown so we have to hardcode the values
    const card_width = 150 * 1.25;
    const card_height = 225 * 1.25;

    const tooltip = adventure_ui.tooltip.container;
    const card = adventure_ui.tooltip.card;

    tooltip.style.opacity = "1";

    card.RemoveClass(adventure_ui.tooltip.css_class);
    card.AddClass(css_class);
    card.RemoveAndDeleteChildren();

    adventure_ui.tooltip.css_class = css_class;

    const position_x = Math.round((window_position.x + slot.container.actuallayoutwidth / 2) / screen_ratio - card_width / 2);
    const position_y = Math.round(window_position.y / screen_ratio - card_height) - 50;

    tooltip.style.x = position_x + "px";
    tooltip.style.y = position_y + "px";
}

function hide_adventure_tooltip() {
    adventure_ui.tooltip.container.style.opacity = "0";
}

function create_adventure_hero_panel(root: Panel, hero: Hero_Type, health: number) {
    const slot = create_adventure_card_slot(root);
    slot.art.AddClass("hero");
    safely_set_panel_background_image(slot.art, get_hero_card_art(hero));

    slot.card_panel.SetHasClass("dead", health == 0);

    const health_label = $.CreatePanel("Label", slot.card_panel, "health_number");
    health_label.text = health.toString(10);

    slot.container.SetPanelEvent(PanelEvent.ON_MOUSE_OVER, () => {
        const def = hero_definition_by_type(hero);

        show_and_prepare_adventure_tooltip(slot, "hero");
        create_hero_card_ui_base(adventure_ui.tooltip.card, hero, def.health, def.attack_damage, def.move_points);
    });

    slot.container.SetPanelEvent(PanelEvent.ON_MOUSE_OUT, hide_adventure_tooltip);
}

function create_adventure_spell_panel(root: Panel, spell: Spell_Id) {
    const slot = create_adventure_card_slot(root);
    slot.art.AddClass("spell");
    safely_set_panel_background_image(slot.art, get_spell_card_art(spell));

    slot.container.SetPanelEvent(PanelEvent.ON_MOUSE_OVER, () => {
        show_and_prepare_adventure_tooltip(slot, "spell");
        create_spell_card_ui_base(adventure_ui.tooltip.card, spell, get_spell_text(spell_definition_by_id(spell)));
    });

    slot.container.SetPanelEvent(PanelEvent.ON_MOUSE_OUT, hide_adventure_tooltip);
}

function create_adventure_ui(party: Adventure_Party_State) {
    const card_container = adventure_ui.card_container;

    card_container.RemoveAndDeleteChildren();

    let empty_slots = max_adventure_slots;

    for (const hero of party.heroes) {
        create_adventure_hero_panel(card_container, hero.type, hero.health);

        empty_slots--;
    }

    for (const spell of party.spells) {
        create_adventure_spell_panel(card_container, spell);

        empty_slots--;
    }

    for (; empty_slots >= 0; empty_slots--) {
        create_adventure_card_slot(card_container);
    }

    adventure_ui.currency_label.text = party.currency.toString(10);
}

subscribe_to_net_table_key<Game_Net_Table>("main", "game", data => {
    if (adventure_ui.game_state != data.state) {
        adventure_ui.game_state = data.state;

        if (data.state == Player_State.on_adventure) {
            const party: Adventure_Party_State = {
                currency: data.party.currency,
                heroes: from_server_array(data.party.heroes),
                spells: from_server_array(data.party.spells),
                minions: from_server_array(data.party.minions)
            };

            create_adventure_ui(party);
        }
    }
});