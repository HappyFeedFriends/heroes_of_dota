type Deck_Counter = {
    root: Panel;
    current: LabelPanel;
    max: LabelPanel;
}

const collection_ui = $("#collection");
const page_overlay = collection_ui.FindChildTraverse("page_overlay");
const page_root = collection_ui.FindChildTraverse("page");
const deck_content_root = collection_ui.FindChildTraverse("deck_content");
const deck_footer = collection_ui.FindChildTraverse("deck_footer");

const deck_counter_heroes = make_deck_counter(deck_footer, "heroes");
const deck_counter_spells = make_deck_counter(deck_footer, "spells");

const collection_left_page_switch = collection_ui.FindChildTraverse("page_switch_left");
const collection_right_page_switch = collection_ui.FindChildTraverse("page_switch_right");

collection_left_page_switch.SetPanelEvent(PanelEvent.ON_LEFT_CLICK, () => {
    if (current_page > 0) {
        current_page--;

        request_current_page();
    }
});

collection_right_page_switch.SetPanelEvent(PanelEvent.ON_LEFT_CLICK, () => {
    if (current_page < total_pages) {
        current_page++;

        request_current_page();
    }
});

let deck_contents: Deck_Contents = {
    spells: [],
    heroes: []
};

let current_page = 0;
let total_pages = 0;

let page_requests_in_flight = 0;

function make_deck_counter(parent: Panel, type: string): Deck_Counter {
    const root = $.CreatePanel("Panel", parent, "");
    root.AddClass("deck_counter");

    const icon = $.CreatePanel("Panel", root, "deck_counter_icon");
    icon.AddClass(type);

    const current = $.CreatePanel("Label", root, "");
    $.CreatePanel("Label", root, "deck_counter_delim").text = "/";
    const max = $.CreatePanel("Label", root, "");

    return {
        root: root,
        current: current,
        max: max
    }
}

function refresh_collection_hero_page(page: Collection_Page) {
    page_root.RemoveAndDeleteChildren();

    for (const card of page.cards) {
        switch (card.type) {
            case Card_Type.spell: {
                const card_panel = $.CreatePanel("Panel", page_root, "");
                card_panel.AddClass("card");
                card_panel.AddClass("spell");
                card_panel.AddClass("in_preview");

                create_spell_card_ui_base(card_panel, card.spell, get_spell_text(spell_definition_by_id(card.spell)));

                card_panel.SetPanelEvent(PanelEvent.ON_LEFT_CLICK, () => {
                    deck_contents.spells.push(card.spell);
                    refresh_deck_contents(deck_contents);

                    // TODO pre request animate
                    api_request(Api_Request_Type.save_deck, {
                        access_token: get_access_token(),
                        ...deck_contents
                    }, () => {});
                });

                break;
            }

            case Card_Type.hero: {
                const definition = hero_definition_by_type(card.hero);
                const card_panel = $.CreatePanel("Panel", page_root, "");
                card_panel.AddClass("card");
                card_panel.AddClass("hero");
                card_panel.AddClass("in_preview");

                create_hero_card_ui_base(card_panel, card.hero, definition.health, definition.attack_damage, definition.move_points);

                card_panel.SetPanelEvent(PanelEvent.ON_LEFT_CLICK, () => {
                    deck_contents.heroes.push(card.hero);
                    refresh_deck_contents(deck_contents);

                    // TODO pre request animate
                    api_request(Api_Request_Type.save_deck, {
                        access_token: get_access_token(),
                        ...deck_contents
                    }, () => {});
                });

                break;
            }

            default: unreachable(card);
        }
    }
}

function refresh_deck_contents(deck: Deck_Contents) {
    deck_content_root.RemoveAndDeleteChildren();

    deck_counter_heroes.current.text = deck.heroes.length.toString(10);
    deck_counter_spells.current.text = deck.spells.length.toString(10);

    // TODO hardcoded values
    deck_counter_heroes.max.text = "3";
    deck_counter_spells.max.text = "5";

    for (const hero of deck.heroes) {
        const card = $.CreatePanel("Panel", deck_content_root, "");
        card.AddClass("deck_card");
        card.AddClass("hero");

        const label = $.CreatePanel("Label", card, "name");
        label.text = get_hero_name(hero);

        const image = $.CreatePanel("Panel", card, "image");
        safely_set_panel_background_image(image, get_full_unit_icon_path(hero));

        card.SetPanelEvent(PanelEvent.ON_LEFT_CLICK, () => {
            const index = deck_contents.heroes.indexOf(hero);

            if (index != -1) {
                deck_contents.heroes.splice(index, 1);
                refresh_deck_contents(deck_contents);
            }
        });
    }

    for (const spell of deck.spells) {
        const card = $.CreatePanel("Panel", deck_content_root, "");
        card.AddClass("deck_card");
        card.AddClass("spell");

        const label = $.CreatePanel("Label", card, "name");
        label.text = get_spell_name(spell);

        const image = $.CreatePanel("Panel", card, "image");
        safely_set_panel_background_image(image, `file://{images}/${get_spell_card_art(spell)}`);

        card.SetPanelEvent(PanelEvent.ON_LEFT_CLICK, () => {
            const index = deck_contents.spells.indexOf(spell);

            if (index != -1) {
                deck_contents.spells.splice(index, 1);
                refresh_deck_contents(deck_contents);
            }
        });
    }
}

function update_page_switchers() {
    collection_left_page_switch.SetHasClass("hidden", current_page == 0);
    collection_right_page_switch.SetHasClass("hidden", current_page >= total_pages - 1);
}

function request_current_page() {
    const request = {
        access_token: get_access_token(),
        page: current_page
    };

    update_page_switchers();

    page_requests_in_flight++;
    page_overlay.SetHasClass("loading", page_requests_in_flight > 0);

    api_request(Api_Request_Type.get_collection_page, request, response => {
        refresh_collection_hero_page(response);

        total_pages = response.total_pages;

        // TODO infinite loading if request errors out
        page_requests_in_flight--;
        page_overlay.SetHasClass("loading", page_requests_in_flight > 0);

        update_page_switchers();
    });
}

function ui_toggle_collection() {
    collection_ui.ToggleClass("visible");

    if (collection_ui.BHasClass("visible")) {
        request_current_page();

        api_request(Api_Request_Type.get_deck, {
            access_token: get_access_token(),
        }, response => {
            deck_contents = response;

            refresh_deck_contents(deck_contents);
        });
    }
}