type Deck_Counter = {
    root: Panel;
    current: LabelPanel;
    max: LabelPanel;
}

type Collection_Card_UI = Collection_Card & {
    panel: Panel
}

const window_background = $("#window_background");
const collection_ui = $("#collection_window");
const page_overlay = collection_ui.FindChildTraverse("page_overlay");
const page_root = collection_ui.FindChildTraverse("page");
const deck_content_root = collection_ui.FindChildTraverse("deck_content");
const deck_footer = collection_ui.FindChildTraverse("deck_footer");

// Makes it impossible to click through, so background doesn't receive a click event and dismiss the window
collection_ui.SetPanelEvent(PanelEvent.ON_LEFT_CLICK, () => {});

// TODO hardcoded values
const heroes_in_deck = 3;
const spells_in_deck = 5;

const deck_counter_heroes = make_deck_counter(deck_footer, "heroes", `A deck requires exactly ${heroes_in_deck} heroes`);
const deck_counter_spells = make_deck_counter(deck_footer, "spells", `A deck requires exactly ${spells_in_deck} spells`);

const collection_left_page_switch = collection_ui.FindChildTraverse("page_switch_left");
const collection_right_page_switch = collection_ui.FindChildTraverse("page_switch_right");

const cards_in_row = 4;
const card_rows = 2;

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

let page_contents: Collection_Card_UI[] = [];

let current_page = 0;
let total_pages = 0;

let page_requests_in_flight = 0;

function attach_tooltip(target: Panel, text: string) {
    target.SetPanelEvent(PanelEvent.ON_MOUSE_OVER, () => {
        $.DispatchEvent("DOTAShowTextTooltip", target, text);
    });

    target.SetPanelEvent(PanelEvent.ON_MOUSE_OUT, () => {
        $.DispatchEvent("DOTAHideTextTooltip");
    });
}

function make_deck_counter(parent: Panel, type: string, tooltip: string): Deck_Counter {
    const root = $.CreatePanel("Panel", parent, "");
    root.AddClass("deck_counter");

    const icon = $.CreatePanel("Panel", root, "deck_counter_icon");
    icon.AddClass(type);

    const current = $.CreatePanel("Label", root, "");
    $.CreatePanel("Label", root, "deck_counter_delim").text = "/";
    const max = $.CreatePanel("Label", root, "");

    attach_tooltip(root, tooltip);

    return {
        root: root,
        current: current,
        max: max
    }
}

function save_deck(contents: Deck_Contents) {
    api_request(Api_Request_Type.save_deck, {
        access_token: get_access_token(),
        ...contents
    }, () => {});
}

function is_card_already_in_the_deck(card: Collection_Card): boolean {
    switch (card.type) {
        case Card_Type.hero: {
            return deck_contents.heroes.indexOf(card.hero) != -1;
        }

        case Card_Type.spell: {
            return deck_contents.spells.indexOf(card.spell) != -1;
        }
    }
}

function refresh_card_availability() {
    for (let card of page_contents) {
        card.panel.SetHasClass("unavailable", is_card_already_in_the_deck(card));
    }
}

function refresh_collection_hero_page(page: Collection_Page) {
    page_root.RemoveAndDeleteChildren();

    page_contents.splice(0);

    let current_row: Panel = page_root; // Assign to dummy value, we are going to reassign on first iteration

    function attach_card_to_deck_pusher<T extends Collection_Card>(card_panel: Panel, card: T, pusher: (card: T) => void) {
        card_panel.SetPanelEvent(PanelEvent.ON_LEFT_CLICK, () => {
            if (is_card_already_in_the_deck(card)) {
                show_generic_error("Already in the deck");

                return;
            }

            if (deck_contents.spells.length + deck_contents.heroes.length == heroes_in_deck + spells_in_deck) {
                show_generic_error("Deck is full");

                return;
            }

            pusher(card);
            refresh_deck_contents(deck_contents);
            save_deck(deck_contents);
        });
    }

    for (let index = 0; index < card_rows * cards_in_row; index++) {
        if (index % cards_in_row == 0) {
            current_row = $.CreatePanel("Panel", page_root, "");
            current_row.AddClass("page_row");
        }

        // Filling the layout
        if (index >= page.cards.length) {
            const card_panel = $.CreatePanel("Panel", current_row, "");
            card_panel.AddClass("card");
            card_panel.AddClass("in_preview");
            card_panel.style.opacity = "0";

            continue;
        }

        const card = page.cards[index];

        const card_panel = $.CreatePanel("Panel", current_row, "");
        card_panel.AddClass("card");
        card_panel.AddClass("in_preview");

        page_contents.push({
            ...card,
            panel: card_panel
        });

        switch (card.type) {
            case Card_Type.spell: {
                card_panel.AddClass("spell");

                create_spell_card_ui_base(card_panel, card.spell, get_spell_text(spell_definition_by_id(card.spell)));
                attach_card_to_deck_pusher(card_panel, card, card => deck_contents.spells.push(card.spell));

                break;
            }

            case Card_Type.hero: {
                const definition = hero_definition_by_type(card.hero);
                card_panel.AddClass("hero");

                create_hero_card_ui_base(card_panel, card.hero, definition.health, definition.attack_damage, definition.move_points);
                attach_card_to_deck_pusher(card_panel, card, card => deck_contents.heroes.push(card.hero));

                break;
            }

            default: unreachable(card);
        }
    }

    refresh_card_availability();
}

function refresh_deck_contents(deck: Deck_Contents) {
    deck_content_root.RemoveAndDeleteChildren();

    deck_counter_heroes.current.text = deck.heroes.length.toString(10);
    deck_counter_spells.current.text = deck.spells.length.toString(10);

    deck_counter_heroes.max.text = heroes_in_deck.toString(10);
    deck_counter_spells.max.text = spells_in_deck.toString(10);

    deck_counter_heroes.root.SetHasClass("incomplete", deck.heroes.length != heroes_in_deck);
    deck_counter_spells.root.SetHasClass("incomplete", deck.spells.length != spells_in_deck);

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

    refresh_card_availability();
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
    const now_visible = !collection_ui.BHasClass("visible");

    collection_ui.SetHasClass("visible", now_visible);
    window_background.SetHasClass("visible", now_visible);

    if (now_visible) {
        request_current_page();

        api_request(Api_Request_Type.get_deck, {
            access_token: get_access_token(),
        }, response => {
            deck_contents = response;

            refresh_deck_contents(deck_contents);
        });

        window_background.SetPanelEvent(PanelEvent.ON_LEFT_CLICK, () => {
            ui_toggle_collection();
        })
    }
}