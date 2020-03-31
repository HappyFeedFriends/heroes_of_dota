import {
    subscribe_to_custom_event,
    get_access_token,
    api_request,
    async_api_request,
    fire_event,
    subscribe_to_net_table_key
} from "./interop";

import {
    adventure_ui_root,
    current_state,
} from "./main_ui";

const adventure_ui = {
    party_container: adventure_ui_root.FindChildTraverse("adventure_party"),
    card_container: adventure_ui_root.FindChildTraverse("adventure_cards"),
    currency_label: adventure_ui_root.FindChildTraverse("currency_remaining") as LabelPanel,
    bag_drop_layer: adventure_ui_root.FindChildTraverse("adventure_party_bag_drop_layer"),
    tooltip: {
        ...create_adventure_card_tooltip(adventure_ui_root.FindChildTraverse("adventure_card_tooltips")),
        css_class: ""
    },
    popup: {
        window: adventure_ui_root.FindChildTraverse("adventure_popup"),
        header: adventure_ui_root.FindChildTraverse("adventure_popup_header") as LabelPanel,
        text: adventure_ui_root.FindChildTraverse("adventure_popup_text") as LabelPanel,
        content: adventure_ui_root.FindChildTraverse("adventure_popup_inner_content"),
        background: adventure_ui_root.FindChildTraverse("adventure_popup_background"),
        button_yes: adventure_ui_root.FindChildTraverse("adventure_popup_yes"),
        button_no: adventure_ui_root.FindChildTraverse("adventure_popup_no")
    },
    merchant_popup: {
        window: adventure_ui_root.FindChildTraverse("adventure_merchant_popup"),
        background: adventure_ui_root.FindChildTraverse("adventure_merchant_popup_background"),
        cards: adventure_ui_root.FindChildTraverse("adventure_merchant_popup_cards"),
        items: adventure_ui_root.FindChildTraverse("adventure_merchant_popup_items"),
        button_leave: adventure_ui_root.FindChildTraverse("adventure_merchant_popup_leave")
    },
    ongoing_adventure_id: -1 as Ongoing_Adventure_Id,
};

const enum Drag_Source {
    bag,
    hero
}

type Party_UI = {
    bag: Bag_UI
    slots: Adventure_Party_Slot_UI[]
    changes: Adventure_Party_Change[]
    currency: number
    currently_playing_change_index: number
    currently_playing_a_change: boolean
    next_change_promise: () => boolean
    current_head: number
    base_head: number
    base_snapshot: Party_Snapshot
    drag_state: Inventory_Drag_State
    thanks_started_playing_at: number
}

type Inventory_Drag_State = {
    dragging: false
} | {
    dragging: true
    dragged_panel: Panel
    item: Adventure_Item
    source: Drag_Source
}

type Entity_Name_UI = {
    label: LabelPanel
    following?: Physical_Adventure_Entity
    last_followed_at: number
    previous_screen_x: number
    previous_screen_y: number
}

type Adventure_Animation_Promise = () => boolean;

type Adventure_Party_Slot_UI = { container: Panel } & ({
    type: Adventure_Party_Slot_Type.empty
} | {
    type: Adventure_Party_Slot_Type.hero
    hero: Hero_Type
    base_health: number
    items: Inventory_Item_UI[]
    ui: {
        card_panel: Panel
        stat_health: Stat_Indicator
        stat_attack: Stat_Indicator
        stat_moves: Stat_Indicator
        stat_armor: Stat_Indicator
    }
} | {
    type: Adventure_Party_Slot_Type.creep
    creep: Creep_Type
    health: number
    ui: {
        stat_health: Stat_Indicator
    }
} | {
    type: Adventure_Party_Slot_Type.spell
    spell: Spell_Id
})

type Stat_Indicator = {
    label: LabelPanel
    displayed_value: number
    value_provider(stats: Display_Stats): number
    value_updater(stat: Stat_Indicator, value: number): void
}

type Display_Stats = {
    health: number
    attack: number
    moves: number
    armor: number
}

type Base_Slot_UI = {
    container: Panel
    card_panel: Panel
    art: Panel
}

type Inventory_Item_UI = {
    item: Adventure_Wearable_Item | undefined
    panel: Panel
    drop_layer: Panel
}

type Bag_UI = {
    panel: Panel
    items: Bag_Item_UI[]
}

type Bag_Item_UI = {
    slot: number
    item: Adventure_Item
    panel: Panel
}

const party: Party_UI = {
    currency: 0,
    bag: {
        panel: $("#adventure_party_bag"),
        items: []
    },
    slots: [],
    changes: [],
    currently_playing_change_index: 0,
    currently_playing_a_change: false,
    next_change_promise: () => true,
    current_head: 0,
    base_head: 0,
    base_snapshot: {
        currency: 0,
        bag: [],
        slots: []
    },
    drag_state: default_inventory_drag_state(),
    thanks_started_playing_at: 0
};

const entity_name: Entity_Name_UI = {
    label: adventure_ui_root.FindChildTraverse("adventure_entity_name_indicator") as LabelPanel,
    last_followed_at: 0,
    previous_screen_x: 0,
    previous_screen_y: 0
};

const entities: Physical_Adventure_Entity[] = [];

export function find_adventure_entity_by_world_index(index: EntityId): Physical_Adventure_Entity | undefined {
    return entities.find(entity => entity.world_entity_id == index);
}

export function find_adventure_entity_by_id(id: Adventure_Entity_Id): Physical_Adventure_Entity | undefined {
    return entities.find(entity => entity.base.id == id);
}

hide_adventure_tooltip();

function default_inventory_drag_state(): Inventory_Drag_State {
    return { dragging: false }
}

function create_adventure_card_tooltip(root: Panel) {
    const parent = $.CreatePanel("Panel", root, "card_tooltip");
    const card = create_card_container_ui(parent, true);
    card.style.transitionDuration = "0s";

    $.CreatePanel("Panel", parent, "arrow");

    return {
        container: parent,
        card: card
    };
}

function fill_adventure_base_slot_ui(container: Panel): Base_Slot_UI {
    const card_panel = $.CreatePanel("Panel", container, "adventure_card");
    const art = $.CreatePanel("Panel", card_panel, "adventure_card_art");

    container.ClearPanelEvent(PanelEvent.ON_MOUSE_OVER);
    container.ClearPanelEvent(PanelEvent.ON_MOUSE_OUT);

    return {
        container: container,
        card_panel: card_panel,
        art: art,
    }
}

function compute_hero_display_health(items: Inventory_Item_UI[], base_hp: number) {
    const hp_bonus = compute_adventure_hero_inventory_field_bonus(items.map(item => item.item), Modifier_Field.health_bonus);

    return Math.max(0, base_hp + hp_bonus);
}

function compute_hero_display_stats(hero: Hero_Type, items: Inventory_Item_UI[], base_hp: number) {
    function compute_hero_display_attack(items: Inventory_Item_UI[], hero: Hero_Type) {
        const base = hero_definition_by_type(hero).attack_damage;
        const bonus = compute_adventure_hero_inventory_field_bonus(items.map(item => item.item), Modifier_Field.attack_bonus);
        return base + bonus;
    }

    function compute_hero_display_move_points(items: Inventory_Item_UI[], hero: Hero_Type) {
        const base = hero_definition_by_type(hero).move_points;
        const bonus = compute_adventure_hero_inventory_field_bonus(items.map(item => item.item), Modifier_Field.move_points_bonus);
        return base + bonus;
    }

    function compute_hero_display_armor(items: Inventory_Item_UI[]) {
        return compute_adventure_hero_inventory_field_bonus(items.map(item => item.item), Modifier_Field.armor_bonus);
    }

    return {
        health: compute_hero_display_health(items, base_hp),
        attack: compute_hero_display_attack(items, hero),
        moves: compute_hero_display_move_points(items, hero),
        armor: compute_hero_display_armor(items)
    }
}

function show_and_prepare_adventure_tooltip(parent: Panel, css_class: string) {
    const screen_ratio = Game.GetScreenHeight() / 1080;
    const window_position = parent.GetPositionWithinWindow();

    // Unfortunately actuallayoutwidth/height are not updated before a panel is shown so we have to hardcode the values
    const card_width = 150 * 1.25;
    const card_height = 225 * 1.25;

    const tooltip = adventure_ui.tooltip.container;
    const card = adventure_ui.tooltip.card;

    tooltip.style.opacity = "1";

    card.RemoveClass(adventure_ui.tooltip.css_class);
    card.AddClass(css_class);
    card.RemoveAndDeleteChildren();

    adventure_ui.tooltip.css_class = css_class;

    const position_x = Math.round((window_position.x + parent.actuallayoutwidth / 2) / screen_ratio - card_width / 2);
    const position_y = Math.round(window_position.y / screen_ratio - card_height) - 50;

    tooltip.style.x = position_x + "px";
    tooltip.style.y = position_y + "px";
}

function set_up_adventure_slot_tooltip(panel: Panel, css_class: string, filler: (tooltip: Panel) => void) {
    panel.SetPanelEvent(PanelEvent.ON_MOUSE_OUT, hide_adventure_tooltip);
    panel.SetPanelEvent(PanelEvent.ON_MOUSE_OVER, () => {
        show_and_prepare_adventure_tooltip(panel, css_class);
        filler(adventure_ui.tooltip.card);
    });
}

function hide_adventure_tooltip() {
    adventure_ui.tooltip.container.style.opacity = "0";
}

function create_adventure_empty_slot(root: Panel): Adventure_Party_Slot_UI {
    const container = $.CreatePanel("Panel", root, "");
    container.AddClass("adventure_card_container");

    return fill_adventure_empty_slot(container);
}

function fill_adventure_empty_slot(container: Panel): Adventure_Party_Slot_UI {
    const base_ui = fill_adventure_base_slot_ui(container);

    return {
        type: Adventure_Party_Slot_Type.empty,
        container: base_ui.container
    }
}

function add_bag_item(item: Adventure_Item, slot_index = party.bag.items.length): Bag_Item_UI {
    const item_panel = $.CreatePanel("Panel", party.bag.panel, "");
    item_panel.AddClass("item");
    item_panel.SetDraggable(true);
    safely_set_panel_background_image(item_panel, get_adventure_item_icon(item));

    const slot = {
        slot: slot_index,
        item: item,
        panel: item_panel
    };

    register_slot_drag_events(item_panel, item, Drag_Source.bag);

    party.bag.items[slot_index] = slot;

    return slot;
}

function remove_bag_item(ui: Bag_Item_UI) {
    ui.panel.DeleteAsync(0);

    party.bag.items.splice(ui.slot, 1);

    for (let index = 0; index < party.bag.items.length; index++) {
        party.bag.items[index].slot = index;
    }
}

function set_drag_state(state: Inventory_Drag_State) {
    party.drag_state = state;

    if (state.dragging) {
        hide_adventure_tooltip();

        adventure_ui.party_container.AddClass("dragging_item");
    } else {
        adventure_ui.party_container.RemoveClass("dragging_item");
        adventure_ui.party_container.RemoveClass("has_drop_target");
    }
}

function register_slot_drag_events(slot: Panel, item: Adventure_Item, source: Drag_Source) {
    const image = get_adventure_item_icon(item);

    // This fixes a bug, where if a draggable panel is clicked on
    // the input focus is moved to a seemingly random panel on the screen
    slot.SetPanelEvent(PanelEvent.ON_LEFT_CLICK, () => {});

    $.RegisterEventHandler("DragStart", slot, (id, drag) => {
        const dragged_panel = $.CreatePanel("Panel", slot, "");
        dragged_panel.AddClass("dragged_inventory_slot");
        dragged_panel.hittest = false;
        safely_set_panel_background_image(dragged_panel, image);

        const [w, h] = [slot.actuallayoutwidth, slot.actuallayoutheight];

        drag.displayPanel = dragged_panel;
        drag.offsetX = w;
        drag.offsetY = h;

        set_drag_state({
            dragging: true,
            item: item,
            dragged_panel: dragged_panel,
            source: source
        });

        slot.AddClass("being_dragged");
        slot.style.backgroundImage = "none";

        return true;
    });

    $.RegisterEventHandler("DragEnd", slot, (id, dragged) => {
        dragged.DeleteAsync(0);

        set_drag_state({ dragging: false });

        slot.RemoveClass("drop_hover");
        slot.RemoveClass("being_dragged");
        safely_set_panel_background_image(slot, image);

        return true;
    });
}

function update_hero_inventory_item_ui(ui: Inventory_Item_UI, hero_slot_index: number, inventory_slot_index: number, item_in_slot: Adventure_Wearable_Item | undefined) {
    const item_panel = ui.panel;

    ui.item = item_in_slot;

    item_panel.SetHasClass("empty", item_in_slot == undefined);

    if (item_in_slot == undefined) {
        item_panel.style.backgroundImage = "none";
        item_panel.SetDraggable(false);
    } else {
        item_panel.SetDraggable(true);

        const image = get_adventure_item_icon(item_in_slot);
        safely_set_panel_background_image(item_panel, image);
        register_slot_drag_events(item_panel, item_in_slot, Drag_Source.hero);
    }
}

function update_drag_and_drop_styles(for_panel: Panel, dragging_onto_that_panel: boolean) {
    if (!party.drag_state.dragging) return;

    const dragged_panel = party.drag_state.dragged_panel;

    adventure_ui.party_container.SetHasClass("has_drop_target", dragging_onto_that_panel);
    for_panel.SetHasClass("drop_hover", dragging_onto_that_panel);
    dragged_panel.SetHasClass("drop_hover", dragging_onto_that_panel);
}

function register_bag_drop_events(bag_panel: Panel) {
    $.RegisterEventHandler("DragEnter", bag_panel, () => {
        if (party.drag_state.dragging && party.drag_state.source == Drag_Source.hero) {
            update_drag_and_drop_styles(bag_panel, true);
        }

        return true;
    });

    $.RegisterEventHandler("DragLeave", bag_panel, () => {
        if (party.drag_state.dragging && party.drag_state.source == Drag_Source.hero) {
            update_drag_and_drop_styles(bag_panel, false);
        }

        return true;
    });

    $.RegisterEventHandler("DragDrop", bag_panel, () => {
        const drag_state = party.drag_state;

        if (drag_state.dragging && drag_state.source == Drag_Source.hero) {
            const head_before = party.current_head;

            perform_adventure_party_action({
                type: Adventure_Party_Action_Type.drag_item_on_bag,
                item_entity: drag_state.item.entity_id,
                current_head: head_before
            })
        }
    });

}

function create_slot_stat_indicators(parent: Panel, stats: Display_Stats) {
    const stat_panel = $.CreatePanel("Panel", parent, "hero_card_stats");

    const health_label = create_stat_container(stat_panel, "health", stats.health);
    const attack_label = create_stat_container(stat_panel, "attack", stats.attack);
    const moves_label = create_stat_container(stat_panel, "move_points", stats.moves);
    const armor_label = create_stat_container(stat_panel, "armor", stats.armor);

    stat_panel.SetHasClass("no_armor", stats.armor == 0);

    function stat_indicator(
        label: LabelPanel,
        value_provider: (stats: Display_Stats) => number,
        value_updater: (stat: Stat_Indicator, value: number) => void
    ): Stat_Indicator {
        return {
            displayed_value: value_provider(stats),
            label: label,
            value_updater: value_updater,
            value_provider: value_provider
        }
    }

    function update_stat_indicator_from_value(stat: Stat_Indicator, value: number) {
        stat.displayed_value = value;
        stat.label.text = value.toString(10);
    }

    return {
        health: stat_indicator(health_label, stats => stats.health, (stat, value) => {
            parent.SetHasClass("dead", value == 0);
            update_stat_indicator_from_value(stat, value);
        }),
        attack: stat_indicator(attack_label, stats => stats.attack, update_stat_indicator_from_value),
        moves: stat_indicator(moves_label, stats => stats.moves, update_stat_indicator_from_value),
        armor: stat_indicator(armor_label, stats => stats.armor, (stat, value) => {
            stat_panel.SetHasClass("no_armor", value == 0);
            update_stat_indicator_from_value(stat, value);
        }),
    };
}

function fill_adventure_hero_slot(container: Panel, slot_index: number, hero: Hero_Type, base_health: number, items: Adventure_Hero_Inventory): Adventure_Party_Slot_UI {
    const base = fill_adventure_base_slot_ui(container);
    base.art.AddClass("hero");
    safely_set_panel_background_image(base.art, get_hero_card_art(hero));

    const inventory_parent = $.CreatePanel("Panel", base.card_panel, "inventory");
    const item_panels: Inventory_Item_UI[] = [];

    for (let item_index = 0; item_index < Adventure_Constants.max_hero_items; item_index++) {
        const item_in_slot = items[item_index];
        const item_panel = $.CreatePanel("Panel", inventory_parent, "");

        item_panel.AddClass("slot");

        const drop_layer = $.CreatePanel("Panel", item_panel, "drop_layer");
        drop_layer.hittest = false;

        const item_ui = {
            item: item_in_slot,
            panel: item_panel,
            slot_index: item_index,
            drop_layer: drop_layer
        };

        update_hero_inventory_item_ui(item_ui, slot_index, item_index, item_in_slot);

        item_panels.push(item_ui);
    }

    const stats = compute_hero_display_stats(hero, item_panels, base_health);
    const stats_ui = create_slot_stat_indicators(base.card_panel, stats);

    base.card_panel.SetHasClass("dead", stats.health == 0);

    const drop_overlay = $.CreatePanel("Panel", base.card_panel, "drop_overlay");

    $.RegisterEventHandler("DragEnter", drop_overlay, (id, panel) => {
        update_drag_and_drop_styles(drop_overlay, true);
        return true;
    });

    $.RegisterEventHandler("DragLeave", drop_overlay, () => {
        update_drag_and_drop_styles(drop_overlay, false);
        return true;
    });

    $.RegisterEventHandler("DragDrop", drop_overlay, () => {
        const drag_state = party.drag_state;
        if (!drag_state.dragging) return true;

        const head_before = party.current_head;

        if (drag_state.item.type == Adventure_Item_Type.wearable) {
            perform_adventure_party_action({
                type: Adventure_Party_Action_Type.drag_item_on_hero,
                item_entity: drag_state.item.entity_id,
                party_slot: slot_index,
                current_head: head_before
            });
        } else {
            perform_adventure_party_action({
                type: Adventure_Party_Action_Type.use_consumable,
                item_entity: drag_state.item.entity_id,
                party_slot: slot_index,
                current_head: head_before
            });
        }
    });

    $.CreatePanel("Panel", base.card_panel, "dead_overlay");

    const slot = {
        type: Adventure_Party_Slot_Type.hero,
        hero: hero,
        base_health: base_health,
        display_stats: stats,
        container: base.container,
        items: item_panels,
        ui: {
            card_panel: base.card_panel,
            stat_health: stats_ui.health,
            stat_attack: stats_ui.attack,
            stat_moves: stats_ui.moves,
            stat_armor: stats_ui.armor
        }
    } as const;

    set_up_adventure_slot_tooltip(base.container, "hero", tooltip => {
        const stats = compute_hero_display_stats(slot.hero, slot.items, slot.base_health);

        create_hero_card_ui_base(tooltip, hero, stats.health, stats.attack, stats.moves, stats.armor);
    });

    return slot;
}

function fill_adventure_spell_slot(container: Panel, spell: Spell_Id): Adventure_Party_Slot_UI {
    const base = fill_adventure_base_slot_ui(container);
    base.art.AddClass("spell");
    safely_set_panel_background_image(base.art, get_spell_card_art(spell));

    set_up_adventure_slot_tooltip(base.container, "spell", tooltip => {
        create_spell_card_ui_base(tooltip, spell, get_spell_text(spell_definition_by_id(spell)));
    });

    return {
        type: Adventure_Party_Slot_Type.spell,
        spell: spell,
        container: base.container
    }
}

function fill_adventure_creep_slot(container: Panel, creep: Creep_Type, health: number): Adventure_Party_Slot_UI {
    const base = fill_adventure_base_slot_ui(container);
    base.art.AddClass("creep");
    safely_set_panel_background_image(base.art, get_creep_card_art(creep));

    const def = creep_definition_by_type(creep);
    const stats: Display_Stats = {
        health: def.health,
        attack: def.attack_damage,
        moves: def.move_points,
        armor: 0
    };

    const stats_ui = create_slot_stat_indicators(base.card_panel, stats);

    set_up_adventure_slot_tooltip(base.container, "creep", tooltip => {
        create_unit_card_ui_base(tooltip, get_creep_name(creep), get_creep_card_art(creep), def.health, def.attack_damage, def.move_points);
    });

    return {
        type: Adventure_Party_Slot_Type.creep,
        creep: creep,
        health: health,
        container: base.container,
        ui: {
            stat_health: stats_ui.health
        }
    }
}

function reinitialize_adventure_ui(slots: number) {
    const card_container = adventure_ui.card_container;
    card_container.RemoveAndDeleteChildren();

    adventure_ui.currency_label.text = "0";

    party.currency = 0;

    party.bag.panel.RemoveAndDeleteChildren();
    party.bag.items = [];

    party.slots = [];

    for (; slots > 0; slots--) {
        party.slots.push(create_adventure_empty_slot(card_container));
    }
}

function set_adventure_party_slot(slot_index: number, slot: Adventure_Party_Slot): Adventure_Party_Slot_UI {
    function make_new_slot(slot: Adventure_Party_Slot, container: Panel): Adventure_Party_Slot_UI {
        switch (slot.type) {
            case Adventure_Party_Slot_Type.hero: return fill_adventure_hero_slot(container, slot_index, slot.hero, slot.base_health, slot.items);
            case Adventure_Party_Slot_Type.creep: return fill_adventure_creep_slot(container, slot.creep, slot.health);
            case Adventure_Party_Slot_Type.spell: return fill_adventure_spell_slot(container, slot.spell);
            case Adventure_Party_Slot_Type.empty: return fill_adventure_empty_slot(container);
        }
    }

    const old_slot = party.slots[slot_index];
    const container = old_slot.container;
    container.RemoveAndDeleteChildren();

    const new_slot = make_new_slot(slot, container);

    party.slots[slot_index] = new_slot;

    return new_slot;
}

function fill_entity_popup_content(entity: Adventure_Entity) {
    const popup = adventure_ui.popup;

    switch (entity.type) {
        case Adventure_Entity_Type.lost_creep: {
            popup.header.text = "Ally";
            popup.text.text = "Lost Creep would like to join your party";

            const creep = Creep_Type.lane_creep;
            const def = creep_definition_by_type(creep);
            const container = create_card_container_ui(adventure_ui.popup.content, false);
            create_unit_card_ui_base(container, get_creep_name(creep), get_creep_card_art(creep), def.health, def.attack_damage, def.move_points);
            container.AddClass("creep");

            break;
        }

        case Adventure_Entity_Type.shrine: {
            popup.header.text = "Shrine";
            popup.text.text = "This magical shrine can restore your party members' health";

            const icon = $.CreatePanel("Image", popup.content, "");
            icon.AddClass("icon");
            icon.SetImage("file://{images}/spellicons/filler_ability.png");

            break;
        }

        case Adventure_Entity_Type.item_on_the_ground: {
            const item_name = get_adventure_item_name(entity.item);

            popup.header.text = "Item found";
            popup.text.text = snake_case_to_capitalized_words(item_name);

            const icon = $.CreatePanel("Image", popup.content, "");
            icon.AddClass("item_icon");
            icon.SetImage(get_adventure_item_icon(entity.item));
            icon.SetScaling(ScalingFunction.STRETCH_TO_COVER_PRESERVE_ASPECT);

            break;
        }

        case Adventure_Entity_Type.gold_bag: {
            popup.header.text = "Gold Bag";
            popup.text.text = "You've found a bag full of gold";

            const icon = $.CreatePanel("Image", popup.content, "");
            icon.AddClass("no_border_icon");
            icon.SetImage("file://{images}/compendium/compendiumcoins_ti5.png");

            break;
        }

        case Adventure_Entity_Type.merchant: {
            break;
        }

        case Adventure_Entity_Type.enemy: {
            break;
        }

        default: unreachable(entity)
    }
}

function fixup_merchant_server_data(merchant: Find_By_Type<Adventure_Entity, Adventure_Entity_Type.merchant>) {
    merchant.stock.cards = from_server_array(merchant.stock.cards);
    merchant.stock.items = from_server_array(merchant.stock.items);
}

function show_merchant_popup(merchant: Find_By_Type<Adventure_Entity, Adventure_Entity_Type.merchant>) {
    const popup = adventure_ui.merchant_popup;

    function hide_popup() {
        popup.window.SetHasClass("visible", false);
        popup.background.SetHasClass("visible", false);
    }

    popup.window.SetPanelEvent(PanelEvent.ON_LEFT_CLICK, () => {});

    popup.window.SetHasClass("visible", true);
    popup.background.SetHasClass("visible", true);

    popup.cards.RemoveAndDeleteChildren();
    popup.items.RemoveAndDeleteChildren();

    function cost_container(parent: Panel, cost: number) {
        const cost_container = $.CreatePanel("Panel", parent, "");
        cost_container.AddClass("entity_cost");

        $.CreatePanel("Panel", cost_container, "icon");

        const label = $.CreatePanel("Label", cost_container, "cost");
        label.text = cost.toString(10);
    }

    function card_container(type: string, cost: number) {
        const wrapper = $.CreatePanel("Panel", popup.cards, "");
        wrapper.AddClass("card_with_cost_wrapper");

        const card_with_cost = $.CreatePanel("Panel", wrapper, "card_with_cost");

        const purchase_overlay = $.CreatePanel("Panel", wrapper, "");
        purchase_overlay.AddClass("purchase_overlay");

        const card_container = create_card_container_ui(card_with_cost, false);
        card_container.AddClass(type);
        card_container.AddClass("no_hover");

        cost_container(card_with_cost, cost);

        return card_container;
    }

    function item_container(icon: string, cost: number) {
        const wrapper = $.CreatePanel("Panel", popup.items, "");
        wrapper.AddClass("item_with_cost_wrapper");

        const item_with_cost = $.CreatePanel("Panel", wrapper, "item_with_cost");

        const purchase_overlay = $.CreatePanel("Panel", wrapper, "");
        purchase_overlay.AddClass("purchase_overlay");

        const item = $.CreatePanel("Image", item_with_cost, "item_icon");
        item.SetImage(icon);
        item.SetScaling(ScalingFunction.STRETCH_TO_COVER_PRESERVE_ASPECT);

        cost_container(item_with_cost, cost);
    }

    for (const card of merchant.stock.cards) {
        switch (card.type) {
            case Adventure_Merchant_Card_Type.hero: {
                const hero = card.hero;
                const def = hero_definition_by_type(hero);
                const container = card_container("hero", card.cost);
                create_hero_card_ui_base(container, hero, def.health, def.attack_damage, def.move_points);

                break;
            }

            case Adventure_Merchant_Card_Type.spell: {
                const spell = card.spell;
                const def = spell_definition_by_id(spell);
                const container = card_container("spell", card.cost);
                create_spell_card_ui_base(container, spell, get_spell_text(def));

                break;
            }

            case Adventure_Merchant_Card_Type.creep: {
                const creep = card.creep;
                const def = creep_definition_by_type(creep);
                const container = card_container("creep", card.cost);
                create_unit_card_ui_base(container, get_creep_name(creep), get_creep_card_art(creep), def.health, def.attack_damage, def.move_points);

                break;
            }

            default: unreachable(card);
        }
    }

    for (const item of merchant.stock.items) {
        item_container(get_adventure_item_icon(item.data), item.cost);
    }

    popup.background.SetPanelEvent(PanelEvent.ON_LEFT_CLICK, () => {
        hide_popup();
    });

    popup.button_leave.SetPanelEvent(PanelEvent.ON_LEFT_CLICK, () => {
        Game.EmitSound("click_simple");

        hide_popup();
    });
}

function show_entity_popup(entity: Adventure_Entity) {
    const popup = adventure_ui.popup;

    function hide_popup() {
        popup.window.SetHasClass("visible", false);
        popup.background.SetHasClass("visible", false);
    }

    popup.window.SetHasClass("visible", true);
    popup.background.SetHasClass("visible", true);

    popup.header.text = "";
    popup.text.text = "";
    popup.content.RemoveAndDeleteChildren();

    fill_entity_popup_content(entity);

    popup.window.SetPanelEvent(PanelEvent.ON_LEFT_CLICK, () => {});

    popup.button_yes.SetPanelEvent(PanelEvent.ON_LEFT_CLICK, () => {
        Game.EmitSound("adventure_popup_ok");

        fire_event(To_Server_Event_Type.adventure_interact_with_entity, {
            entity_id: entity.id,
            current_head: party.current_head
        });

        hide_popup();
    });

    popup.button_no.SetPanelEvent(PanelEvent.ON_LEFT_CLICK, () => {
        Game.EmitSound("click_simple");

        hide_popup();
    });

    popup.background.SetPanelEvent(PanelEvent.ON_LEFT_CLICK, () => {
        hide_popup();
    });

    Game.EmitSound("adventure_popup_open");
}

function changes_equal(left: Adventure_Party_Change, right: Adventure_Party_Change) {
    function objects_equal(left: Record<string, any>, right: Record<string, any>): boolean {
        // TODO doesn't work with arrays or nulls

        const left_keys = Object.keys(left);
        const right_keys = Object.keys(right);

        if (left_keys.length != right_keys.length) {
            return false;
        }

        for (const key of left_keys) {
            const left_value = left[key];
            const right_value = right[key];

            if (typeof left_value != typeof right_value) {
                return false;
            }

            if (typeof left_value == "object") {
                const children_equal = objects_equal(left_value, right_value);
                if (!children_equal) {
                    return false;
                }
            } else if (left_value !== right_value) {
                return false;
            }
        }

        return true;
    }

    return objects_equal(left, right);
}

function copy_snapshot(snapshot: Party_Snapshot) {
    function copy_value<T extends any>(source: T): T {
        if (source == null) {
            return source;
        }

        if (typeof source == "object") {
            if (Array.isArray(source)) {
                return source.map((value: any) => copy_value(value));
            } else {
                const result: Record<any, string> = {};
                const keys = Object.keys(source);

                for (const key of keys) {
                    result[key] = copy_value(source[key]);
                }

                return result;
            }
        } else {
            return source;
        }
    }

    return copy_value(snapshot);
}

function merge_adventure_party_changes(head_before_merge: number, changes: Adventure_Party_Change[]) {
    log(`\tReceived ${changes.length} party changes, inserting after ${head_before_merge}`);

    let merge_conflict = false;

    for (let index = 0; index < changes.length; index++) {
        const change_location = head_before_merge + index - party.base_head;
        if (change_location < 0) continue;

        const existing_change = party.changes[change_location];
        const new_change = changes[index];

        log(`\t#${head_before_merge + index}: ${enum_to_string(new_change.type)}: ${JSON.stringify(new_change)}`);

        if (!merge_conflict && existing_change && !changes_equal(existing_change, new_change)) {
            merge_conflict = true;

            log(`\tDetected merge conflict at change ${head_before_merge + index}`);
        }

        party.changes[change_location] = new_change;
    }

    party.current_head = head_before_merge + changes.length;
    party.changes.length = party.current_head - party.base_head;

    if (merge_conflict) {
        restore_ui_state_from_party_state();

        log(`\tState restored from snapshot after merge conflict`);
    }
}

function restore_ui_state_from_party_state() {
    const snapshot = copy_snapshot(party.base_snapshot);

    for (const change of party.changes) {
        collapse_party_change(snapshot, change);
    }

    reinitialize_adventure_ui(party.slots.length);
    fill_ui_from_snapshot(snapshot);

    party.currently_playing_change_index = party.changes.length;
    party.currently_playing_a_change = false;
}

function perform_adventure_party_action(action: Adventure_Party_Action) {
    const predicted_local_state = copy_snapshot(party.base_snapshot);

    for (const change of party.changes) {
        collapse_party_change(predicted_local_state, change);
    }

    let predicted_changes = 0;

    consume_adventure_party_action(predicted_local_state, action, change => {
        // There are cases where the game crashes without that schedule, presumably because of DnD
        // Might be so deleting panels can't happen during drag and drop or whatever
        $.Schedule(0, () => {
            log(`Merging local changes after ${party.current_head}`);
            merge_adventure_party_changes(party.current_head, [change]);

            predicted_changes++;
        })
    });

    api_request(Api_Request_Type.act_on_adventure_party, {
        access_token: get_access_token(),
        ...action,
    }, response => {
        log(`Merging remote changes`);

        accept_adventure_party_response(response);

        // The number of changes doesn't match so it's definitely a conflict
        if (!response.snapshot && response.changes.length < predicted_changes) {
            log(`\tChange number mismatch, restoring from snapshot`);

            restore_ui_state_from_party_state();
        }
    });
}

export function try_adventure_cheat(text: string) {
    const head = party.current_head;

    api_request(Api_Request_Type.adventure_party_cheat, {
        access_token: get_access_token(),
        cheat: text,
        current_head: head
    }, response => merge_adventure_party_changes(head, response.party_updates));
}

export function adventure_filter_mouse_click(event: MouseEvent, button: MouseButton | WheelScroll): boolean {
    return false;
}

function play_adventure_party_change(change: Adventure_Party_Change): Adventure_Animation_Promise {
    function fixed_duration(duration: number): Adventure_Animation_Promise {
        const finish_at = Game.Time() + duration;
        return () => Game.Time() >= finish_at;
    }

    function animate_integer(start_from: number, finish_on: number, period: number, consumer: (value: number) => void): Adventure_Animation_Promise {
        let finished_updating = false;
        let current_value = start_from;

        const normal = Math.sign(finish_on - start_from);

        function update_number() {
            if (current_value == finish_on || current_state != Player_State.on_adventure) {
                finished_updating = true;
                return;
            }

            $.Schedule(period, update_number);

            current_value += normal;

            consumer(current_value);
        }

        update_number();

        return () => finished_updating;
    }

    function both(a: Adventure_Animation_Promise, b: Adventure_Animation_Promise): Adventure_Animation_Promise {
        return () => a() && b();
    }

    function all(promises: Adventure_Animation_Promise[]) {
        return () => promises.every(promise => promise())
    }

    function proceed() {
        return true;
    }

    function flash_slot_damaged(slot: Adventure_Party_Slot_UI, duration: number) {
        const damage = $.CreatePanel("Panel", slot.container, "");
        damage.style.animationDuration = duration + "s";
        damage.AddClass("animation");
        damage.AddClass("animate_damage");
        damage.DeleteAsync(1);
    }

    function flash_slot_health_restored(slot: Adventure_Party_Slot_UI, duration: number) {
        const heal = $.CreatePanel("Panel", slot.container, "");
        heal.style.animationDuration = duration + "s";
        heal.AddClass("animation");
        heal.AddClass("animate_heal");
        heal.DeleteAsync(1);
    }

    function flash_panel(panel: Panel) {
        const flash = $.CreatePanel("Panel", panel, "");
        flash.AddClass("animate_add_to_deck_flash");
        flash.hittest = false;

        flash.DeleteAsync(2);
    }

    function get_and_remove_item_from_slot(source: Adventure_Item_Container): Adventure_Item | undefined {
        log(`Remove from ${enum_to_string(source.type)}`);

        switch (source.type) {
            case Adventure_Item_Container_Type.bag: {
                const bag_slot = party.bag.items[source.bag_slot_index];
                if (!bag_slot) return;

                remove_bag_item(bag_slot);

                return bag_slot.item;
            }

            case Adventure_Item_Container_Type.hero: {
                const hero_slot = party.slots[source.hero_slot_index];
                if (!hero_slot) return;
                if (hero_slot.type != Adventure_Party_Slot_Type.hero) return;

                const item = hero_slot.items[source.item_slot_index];
                if (item == undefined) return;

                const item_panel = hero_slot.items[source.item_slot_index];
                if (!item_panel) return;

                const previous_item = item.item;

                update_hero_inventory_item_ui(item_panel, source.hero_slot_index, source.item_slot_index, undefined);

                return previous_item;
            }
        }
    }

    function put_item_in_slot(target: Adventure_Item_Container, item: Adventure_Item) {
        switch (target.type) {
            case Adventure_Item_Container_Type.bag: {
                add_bag_item(item, target.bag_slot_index);

                Game.EmitSound("party_bag_item_pickup");

                break;
            }

            case Adventure_Item_Container_Type.hero: {
                const hero_slot = party.slots[target.hero_slot_index];
                if (!hero_slot) return;
                if (hero_slot.type != Adventure_Party_Slot_Type.hero) return;
                if (item.type != Adventure_Item_Type.wearable) return;

                const item_panel = hero_slot.items[target.item_slot_index];
                if (!item_panel) return;

                flash_panel(hero_slot.container);
                update_hero_inventory_item_ui(item_panel, target.hero_slot_index, target.item_slot_index, item);

                Game.EmitSound("party_hero_item_pickup");

                const now = Game.Time();
                if (now - party.thanks_started_playing_at > 3) {
                    emit_random_sound(hero_sounds_by_hero_type(hero_slot.hero).thanks);

                    party.thanks_started_playing_at = now;
                }

                break;
            }

            default: unreachable(target);
        }
    }

    function maybe_animate_hero_stat_change_after_inventory_change(container: Adventure_Item_Container): Adventure_Animation_Promise | undefined {
        if (container.type != Adventure_Item_Container_Type.hero) return;

        const slot = party.slots[container.hero_slot_index];
        if (!slot) return;
        if (slot.type != Adventure_Party_Slot_Type.hero) return;

        const new_stats = compute_hero_display_stats(slot.hero, slot.items, slot.base_health);
        const animations: Adventure_Animation_Promise[] = [];

        const maybe_animate_stat = (stat: Stat_Indicator) => {
            const old_value = stat.displayed_value;
            const new_value = stat.value_provider(new_stats);

            if (old_value != new_value) {
                animations.push(animate_integer(old_value, new_value, 0.04, value => stat.value_updater(stat, value)))
            }
        };

        maybe_animate_stat(slot.ui.stat_health);
        maybe_animate_stat(slot.ui.stat_attack);
        maybe_animate_stat(slot.ui.stat_moves);
        maybe_animate_stat(slot.ui.stat_armor);

        return all(animations);
    }

    function health_change_animation_period(reason: Adventure_Health_Change_Reason): number {
        switch (reason) {
            case Adventure_Health_Change_Reason.combat: return 0.03;
            case Adventure_Health_Change_Reason.healing_salve: return 0.1;
            case Adventure_Health_Change_Reason.shrine: return 0.07;
        }
    }

    switch (change.type) {
        case Adventure_Party_Change_Type.set_currency_amount: {
            const start_at = party.currency;
            const direction = Math.sign(change.amount - start_at);

            party.currency = change.amount;

            return animate_integer(start_at, change.amount, 0.05, value => {
                adventure_ui.currency_label.text = value.toString(10);

                if (direction == 1) {
                    Game.EmitSound("gold_increment");
                }
            });
        }

        case Adventure_Party_Change_Type.set_slot: {
            const new_slot = set_adventure_party_slot(change.slot_index, change.slot);
            flash_panel(new_slot.container);

            return fixed_duration(0.2);
        }

        case Adventure_Party_Change_Type.add_item_to_bag: {
            const ui = add_bag_item(change.item);
            flash_panel(ui.panel);

            Game.EmitSound("party_bag_item_pickup");

            break;
        }

        case Adventure_Party_Change_Type.remove_bag_item: {
            const bag_slot = party.bag.items[change.slot_index];

            if (bag_slot) {
                remove_bag_item(bag_slot);
            }

            break;
        }

        case Adventure_Party_Change_Type.move_item: {
            const item = get_and_remove_item_from_slot(change.source);
            if (item == undefined) return proceed;

            put_item_in_slot(change.target, item);

            const animations: Adventure_Animation_Promise[] = [];

            animations.push(fixed_duration(0.2));

            const animate_source = maybe_animate_hero_stat_change_after_inventory_change(change.source);
            const animate_target = maybe_animate_hero_stat_change_after_inventory_change(change.target);

            if (animate_source) animations.push(animate_source);
            if (animate_target) animations.push(animate_target);

            return all(animations);
        }

        case Adventure_Party_Change_Type.set_health: {
            const slot = party.slots[change.slot_index];
            if (!slot) return proceed;

            const period = health_change_animation_period(change.reason);
            const flash_duration = period * 10;

            switch (slot.type) {
                case Adventure_Party_Slot_Type.hero: {
                    const old_health = slot.ui.stat_health.displayed_value;
                    const new_health = compute_hero_display_health(slot.items, change.health);
                    const period = health_change_animation_period(change.reason);

                    if (change.reason == Adventure_Health_Change_Reason.healing_salve) {
                        emit_sound("healing_salve");
                    }

                    if (new_health < old_health) {
                        emit_random_sound(hero_sounds_by_hero_type(slot.hero).pain);
                        flash_slot_damaged(slot, flash_duration);
                    } else {
                        flash_slot_health_restored(slot, flash_duration);
                    }

                    slot.base_health = change.health;

                    const ui_updater = slot.ui.stat_health.value_updater;

                    return both(fixed_duration(1.0), animate_integer(old_health, new_health, period, value => ui_updater(slot.ui.stat_health, value)));
                }

                case Adventure_Party_Slot_Type.creep: {
                    if (change.health < slot.health) {
                        flash_slot_damaged(slot, flash_duration);
                    } else {
                        flash_slot_health_restored(slot, flash_duration);
                    }

                    const ui_updater = slot.ui.stat_health.value_updater;

                    return both(fixed_duration(1.0), animate_integer(slot.health, change.health, period, value => ui_updater(slot.ui.stat_health, value)));
                }

                case Adventure_Party_Slot_Type.spell:
                case Adventure_Party_Slot_Type.empty: {
                    break;
                }

                default: unreachable(slot);
            }

            break;
        }

        default: unreachable(change);
    }

    return proceed;
}

function periodically_update_party_ui() {
    $.Schedule(0, periodically_update_party_ui);

    const current_change = party.changes[party.currently_playing_change_index];

    if (current_change) {
        if (!party.currently_playing_a_change) {
            log(`Playing change #${party.currently_playing_change_index}`);

            party.currently_playing_a_change = true;
            party.next_change_promise = play_adventure_party_change(current_change);
        }

        if (party.next_change_promise()) {
            party.currently_playing_a_change = false;
            party.currently_playing_change_index++;
        }
    }
}

function reset_party_state() {
    party.currently_playing_change_index = 0;
    party.changes = [];
    party.current_head = 0;
    party.base_head = 0;
}

function fill_ui_from_snapshot(snapshot: Party_Snapshot) {
    adventure_ui.currency_label.text = snapshot.currency.toString(10);

    for (const item of snapshot.bag) {
        add_bag_item(item);
    }

    for (let index = 0; index < snapshot.slots.length; index++) {
        set_adventure_party_slot(index, snapshot.slots[index]);
    }
}

function restore_from_snapshot(snapshot: Party_Snapshot, origin_head: number) {
    reset_party_state();
    reinitialize_adventure_ui(snapshot.slots.length);

    log(`Restoring head ${origin_head} from snapshot`);

    fill_ui_from_snapshot(snapshot);

    party.base_head = origin_head;
    party.current_head = origin_head;
    party.base_snapshot = snapshot;
}

function accept_adventure_party_response(response: Adventure_Party_Response) {
    if (response.snapshot) {
        restore_from_snapshot(response.content, response.origin_head);
    } else {
        merge_adventure_party_changes(response.apply_to_head, response.changes);
    }
}

function periodically_update_entity_ui() {
    $.Schedule(0, periodically_update_entity_ui);

    const entity_under_cursor = get_entity_under_cursor(GameUI.GetCursorPosition());

    let entity_found = false;

    function entity_type_to_z_offset(type: Adventure_Entity_Type): number {
        switch (type) {
            case Adventure_Entity_Type.gold_bag: return 120;
            case Adventure_Entity_Type.enemy: return 180;
            case Adventure_Entity_Type.lost_creep: return 180;
            case Adventure_Entity_Type.item_on_the_ground: return 120;
            case Adventure_Entity_Type.shrine: return 300;
            case Adventure_Entity_Type.merchant: return 300;
        }
    }

    const now = Game.Time();

    for (const entity of entities) {
        if (entity.world_entity_id == entity_under_cursor) {
            entity_found = true;

            entity_name.label.text = get_adventure_entity_name(entity.base);
            entity_name.last_followed_at = now;
            entity_name.following = entity;

            break;
        }
    }

    entity_name.label.SetHasClass("visible", entity_found);

    const lingering = now - entity_name.last_followed_at < 0.2;

    if (!entity_found && !lingering) {
        entity_name.following = undefined;
    }

    if (entity_name.following && lingering) {
        const entity_origin = Entities.GetAbsOrigin(entity_name.following.world_entity_id);
        if (!entity_origin) return;

        const panel_world_origin = xyz(entity_origin[0], entity_origin[1], entity_origin[2] + entity_type_to_z_offset(entity_name.following.base.type));

        const screen_x = Game.WorldToScreenX(panel_world_origin.x, panel_world_origin.y, panel_world_origin.z);
        const screen_y = Game.WorldToScreenY(panel_world_origin.x, panel_world_origin.y, panel_world_origin.z);

        const camera_is_not_moving = entity_name.previous_screen_x == screen_x && entity_name.previous_screen_y == screen_y;

        entity_name.previous_screen_x = screen_x;
        entity_name.previous_screen_y = screen_y;

        position_panel_over_position_in_the_world(entity_name.label, panel_world_origin, Align_H.center, Align_V.center, camera_is_not_moving);
    }
}

periodically_update_entity_ui();
periodically_update_party_ui();

export async function enter_adventure_ui(data: Game_Net_Table_On_Adventure) {
    const reinitialize_ui = adventure_ui.ongoing_adventure_id != data.ongoing_adventure_id;
    const head_before_merge = reinitialize_ui ? 0 : party.current_head;

    if (reinitialize_ui) {
        reinitialize_adventure_ui(data.num_party_slots);
    }

    const result = await async_api_request(Api_Request_Type.act_on_adventure_party, {
        type: Adventure_Party_Action_Type.fetch,
        access_token: get_access_token(),
        current_head: head_before_merge
    });

    if (result.snapshot) {
        restore_from_snapshot(result.content, result.origin_head);
    } else {
        // A safety net in case things are still happening with the old UI
        if (reinitialize_ui) {
            reinitialize_adventure_ui(data.num_party_slots);
            reset_party_state();
        }

        merge_adventure_party_changes(head_before_merge, result.changes);
    }

    adventure_ui.ongoing_adventure_id = data.ongoing_adventure_id;
}

subscribe_to_net_table_key<Adventure_Net_Table>("adventure", "table", table => {
    entities.length = 0;
    entities.push(...from_server_array(table.entities));

    // Array fixup
    for (const entity of entities) {
        if (entity.base.type == Adventure_Entity_Type.enemy) {
            entity.base.creeps = from_server_array(entity.base.creeps);
        }

        if (entity.base.type == Adventure_Entity_Type.merchant) {
            fixup_merchant_server_data(entity.base);
        }
    }
});

subscribe_to_custom_event(To_Client_Event_Type.adventure_display_entity_popup, event => {
    // TODO it's weird that we even send that for enemies
    if (event.entity.type == Adventure_Entity_Type.enemy) {
        return;
    }

    if (event.entity.type == Adventure_Entity_Type.merchant) {
        fixup_merchant_server_data(event.entity);
        show_merchant_popup(event.entity);
    } else {
        show_entity_popup(event.entity);
    }
});

subscribe_to_custom_event(To_Client_Event_Type.adventure_receive_party_changes, event => {
    merge_adventure_party_changes(event.current_head, from_server_array(event.changes));
});

register_bag_drop_events(adventure_ui.bag_drop_layer);