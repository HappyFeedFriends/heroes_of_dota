const collection_ui = $("#collection");
const collection_page_root = collection_ui.FindChildTraverse("page");
const deck_content_root = collection_ui.FindChildTraverse("deck_content");

let deck_contents: Deck_Contents = {
    spells: [],
    heroes: []
};

function refresh_collection_hero_page(heroes: { hero: Hero_Type, copies: number }[]) {
    collection_page_root.RemoveAndDeleteChildren();

    for (const hero of heroes) {
        const definition = hero_definition_by_type(hero.hero);
        const card_panel = $.CreatePanel("Panel", collection_page_root, "");
        card_panel.AddClass("card");
        card_panel.AddClass("hero");
        card_panel.AddClass("in_preview");

        create_hero_card_ui_base(card_panel, hero.hero, definition.health, definition.attack_damage, definition.move_points);

        card_panel.SetPanelEvent(PanelEvent.ON_LEFT_CLICK, () => {
            deck_contents.heroes.push(hero.hero);
            refresh_deck_contents(deck_contents);

            // TODO pre request animate
            api_request(Api_Request_Type.save_deck, {
                access_token: get_access_token(),
                ...deck_contents
            }, () => {});
        });
    }
}

function refresh_deck_contents(deck: Deck_Contents) {
    deck_content_root.RemoveAndDeleteChildren();

    for (const hero of deck.heroes) {
        const card = $.CreatePanel("Panel", deck_content_root, "");
        card.AddClass("deck_card");
        card.AddClass("hero");

        const label = $.CreatePanel("Label", card, "name");
        label.text = get_hero_name(hero);

        const image = $.CreatePanel("Panel", card, "image");
        safely_set_panel_background_image(image, get_full_unit_icon_path(hero));
    }

    for (const spell of deck.spells) {
        const card = $.CreatePanel("Panel", deck_content_root, "");
        card.AddClass("deck_card");
        card.AddClass("spell");

        const label = $.CreatePanel("Label", card, "name");
        label.text = get_spell_name(spell);

        const image = $.CreatePanel("Panel", card, "image");
        safely_set_panel_background_image(image, `file://{images}/${get_spell_card_art(spell)}`);
    }
}

function ui_toggle_collection() {
    collection_ui.ToggleClass("visible");

    if (collection_ui.BHasClass("visible")) {
        const request = {
            access_token: get_access_token(),
            page: 0
        };

        api_request(Api_Request_Type.get_hero_collection, request, response => {
            refresh_collection_hero_page(response.heroes);
        });

        api_request(Api_Request_Type.get_deck, {
            access_token: get_access_token(),
        }, response => {
            deck_contents = response;

            refresh_deck_contents(deck_contents);
        });
    }
}