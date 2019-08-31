const collection_ui = $("#collection");
const collection_page_root = collection_ui.FindChildTraverse("page");

function refresh_collection_contents(heroes: { hero: Hero_Type, copies: number }[]) {
    collection_page_root.RemoveAndDeleteChildren();

    for (const hero of heroes) {
        const definition = hero_definition_by_type(hero.hero);
        const card_panel = $.CreatePanel("Panel", collection_page_root, "");
        card_panel.AddClass("card");
        card_panel.AddClass("hero");
        card_panel.AddClass("in_preview");

        create_hero_card_ui_base(card_panel, hero.hero, definition.health, definition.attack_damage, definition.move_points);
    }
}

function ui_toggle_collection() {
    collection_ui.ToggleClass("visible");

    if (collection_ui.BHasClass("visible")) {
        const request = {
            access_token: get_access_token(),
            page: 0
        };

        remote_request<Get_Hero_Collection["request"], Get_Hero_Collection["response"]>("/get_hero_collection", request, response => {
            refresh_collection_contents(response.heroes);
        });
    }
}