import {
    safely_set_panel_background_image,
    get_hero_name,
    global_map_ui_root
} from "./main_ui";
import {
    create_card_container_ui,
    create_hero_card_ui_base,
    create_spell_card_ui_base,
    get_spell_card_art,
    get_spell_name,
    get_spell_text
} from "./card_ui";
import {get_full_unit_icon_path} from "./battle_ui";
import {show_generic_error} from "./battle_actions";
import {api_request, get_access_token} from "./interop";

type Deck_Counter = {
    root: Panel;
    current: LabelPanel;
    max: LabelPanel;
}

type Deck_UI = {
    heroes: Deck_Hero[]
    spells: Deck_Spell[]
}

type Deck_Hero = {
    type: Hero_Type
    panel: Panel
}

type Deck_Spell = {
    id: Spell_Id
    panel: Panel
}

type Collection_Card_UI = Collection_Card & {
    panel: Panel
}

const window_background = global_map_ui_root.FindChildTraverse("window_background");
const collection_ui = global_map_ui_root.FindChildTraverse("collection_window");
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

declare const enum Const {
    cards_in_row = 4,
    card_rows = 2
}

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

let deck_ui: Deck_UI = {
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

function save_deck() {
    const request = {
        access_token: get_access_token(),
        heroes: deck_ui.heroes.map(hero => hero.type),
        spells: deck_ui.spells.map(spell => spell.id)
    };

    api_request(Api_Request_Type.save_deck, request, () => {});
}

function is_card_already_in_the_deck(card: Collection_Card): boolean {
    switch (card.type) {
        case Card_Type.hero: {
            return deck_ui.heroes.find(hero => hero.type == card.hero) != undefined;
        }

        case Card_Type.spell: {
            return deck_ui.spells.find(spell => spell.id == card.spell) != undefined;
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

    function attach_add_to_deck_handler<T extends Collection_Card>(card_panel: Panel, card: T) {
        card_panel.SetPanelEvent(PanelEvent.ON_LEFT_CLICK, () => {
            if (is_card_already_in_the_deck(card)) {
                show_generic_error("This card is already in your deck");

                return;
            }

            if (deck_ui.spells.length + deck_ui.heroes.length == heroes_in_deck + spells_in_deck) {
                show_generic_error("Deck is full");

                return;
            }

            create_deck_card_panel_from_card(card);
            refresh_card_availability();
            update_deck_counters();
            save_deck();
        });
    }

    for (let index = 0; index < Const.card_rows * Const.cards_in_row; index++) {
        if (index % Const.cards_in_row == 0) {
            current_row = $.CreatePanel("Panel", page_root, "");
            current_row.AddClass("page_row");
        }

        // Filling the layout
        if (index >= page.cards.length) {
            const card_panel = create_card_container_ui(current_row, true);
            card_panel.style.opacity = "0";

            continue;
        }

        const card = page.cards[index];
        const card_panel = create_card_container_ui(current_row, true, card.type);

        page_contents.push({
            ...card,
            panel: card_panel
        });

        switch (card.type) {
            case Card_Type.spell: {
                create_spell_card_ui_base(card_panel, card.spell, get_spell_text(spell_definition_by_id(card.spell)));
                attach_add_to_deck_handler(card_panel, card);

                break;
            }

            case Card_Type.hero: {
                const definition = hero_definition_by_type(card.hero);
                create_hero_card_ui_base(card_panel, card.hero, definition.health, definition.attack_damage, definition.move_points);
                attach_add_to_deck_handler(card_panel, card);

                break;
            }

            default: unreachable(card);
        }
    }

    refresh_card_availability();
}

function create_deck_card_panel_from_card(card: Collection_Card): Panel {
    switch (card.type) {
        case Card_Type.spell: return create_deck_spell_card_panel(card.spell);
        case Card_Type.hero: return create_deck_hero_card_panel(card.hero);
    }
}

function create_deck_hero_card_panel(hero: Hero_Type) {
    const panel = create_deck_card_panel("hero", get_hero_name(hero), get_full_unit_icon_path(hero), panel => ({
        type: hero,
        panel: panel
    }), deck_ui.heroes);

    const this_is_the_first_hero_panel_added = deck_ui.heroes.length == 1;
    if (this_is_the_first_hero_panel_added) {
        panel.GetParent().MoveChildBefore(panel, panel.GetParent().GetChild(0));
    }

    return panel;
}

function create_deck_spell_card_panel(spell: Spell_Id) {
    return create_deck_card_panel("spell", get_spell_name(spell), get_spell_card_art(spell), panel => ({
        id: spell,
        panel: panel
    }), deck_ui.spells);
}

function create_deck_card_panel<T extends { panel: Panel }>(type: string, text: string, image_path: string, creator: (panel: Panel) => T, target: T[]) {
    const card = $.CreatePanel("Panel", deck_content_root, "");
    card.AddClass("deck_card");
    card.AddClass(type);

    const flash = $.CreatePanel("Panel", card, "");
    flash.AddClass("animate_add_to_deck_flash");

    const label = $.CreatePanel("Label", card, "name");
    label.text = text;

    const image = $.CreatePanel("Panel", card, "image");
    safely_set_panel_background_image(image, image_path);

    if (target.length > 0) {
        deck_content_root.MoveChildAfter(card, target[target.length - 1].panel);
    }

    const creation = creator(card);

    target.push(creation);

    card.SetPanelEvent(PanelEvent.ON_LEFT_CLICK, () => {
        const index = target.indexOf(creation);

        if (index != -1) {
            target.splice(index, 1);
        }

        card.DeleteAsync(0.0);
        refresh_card_availability();
        update_deck_counters();
    });

    return card;
}

function update_deck_counters() {
    deck_counter_heroes.current.text = deck_ui.heroes.length.toString(10);
    deck_counter_spells.current.text = deck_ui.spells.length.toString(10);

    deck_counter_heroes.max.text = heroes_in_deck.toString(10);
    deck_counter_spells.max.text = spells_in_deck.toString(10);

    deck_counter_heroes.root.SetHasClass("incomplete", deck_ui.heroes.length != heroes_in_deck);
    deck_counter_spells.root.SetHasClass("incomplete", deck_ui.spells.length != spells_in_deck);
}

function refresh_deck_contents(deck: Deck_Contents) {
    deck_content_root.RemoveAndDeleteChildren();

    deck_ui.heroes = [];
    deck_ui.spells = [];

    for (const hero of deck.heroes) {
        create_deck_hero_card_panel(hero);
    }

    for (const spell of deck.spells) {
        create_deck_spell_card_panel(spell);
    }

    refresh_card_availability();
    update_deck_counters();
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
            refresh_deck_contents(response);
        });

        window_background.SetPanelEvent(PanelEvent.ON_LEFT_CLICK, () => {
            ui_toggle_collection();
        })
    }
}
$("#collection_button").SetPanelEvent(PanelEvent.ON_LEFT_CLICK, ui_toggle_collection);