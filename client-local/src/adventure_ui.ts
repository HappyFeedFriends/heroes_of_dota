import {
    subscribe_to_custom_event,
    subscribe_to_net_table_key,
    get_access_token, async_api_request, fire_event,
} from "./interop";
import {get_item_icon} from "./battle_ui";
import {
    create_card_container_ui,
    create_hero_card_ui_base,
    create_spell_card_ui_base,
    create_unit_card_ui_base,
    get_creep_card_art,
    get_hero_card_art,
    get_spell_card_art,
    get_spell_text
} from "./card_ui";
import {emit_random_sound} from "./battle_actions";
import {api_request} from "./interop";
import {
    adventure_ui_root,
    current_state,
    get_creep_name
} from "./main_ui";
import {from_server_array, safely_set_panel_background_image} from "./commons";

const adventure_ui = {
    party_container: adventure_ui_root.FindChildTraverse("adventure_party"),
    card_container: adventure_ui_root.FindChildTraverse("adventure_cards"),
    currency_label: adventure_ui_root.FindChildTraverse("currency_remaining") as LabelPanel,
    tooltip: {
        ...create_adventure_card_tooltip(adventure_ui_root.FindChildTraverse("adventure_card_tooltips")),
        css_class: ""
    },
    popup: {
        window: adventure_ui_root.FindChildTraverse("adventure_popup"),
        text: adventure_ui_root.FindChildTraverse("adventure_popup_text") as LabelPanel,
        content: adventure_ui_root.FindChildTraverse("adventure_popup_inner_content"),
        background: adventure_ui_root.FindChildTraverse("window_background"),
        button_yes: adventure_ui_root.FindChildTraverse("adventure_popup_yes"),
        button_no: adventure_ui_root.FindChildTraverse("adventure_popup_no")
    },
    party: {
        slots: new Array<Adventure_Party_Slot_UI>(),
        changes: new Array<Adventure_Party_Change>(),
        currently_playing_change_index: 0,
        currently_playing_a_change: false,
        next_change_promise: () => true,
        current_head: 0,
        base_head: 0
    },
    ongoing_adventure_id: -1 as Ongoing_Adventure_Id,
    drag_state: default_inventory_drag_state()
};

type Inventory_Drag_State = {
    dragging: false
} | {
    dragging: true
    dragged_panel: Panel
    item: Item_Id
}

type Adventure_Animation_Promise = () => boolean;

type Adventure_Party_Slot_UI = { container: Panel } & ({
    type: Adventure_Party_Slot_Type.empty
} | {
    type: Adventure_Party_Slot_Type.hero
    hero: Hero_Type
    health: number
    items: Item_Panel_UI[]
    ui: {
        card_panel: Panel
        health_number: LabelPanel
    }
} | {
    type: Adventure_Party_Slot_Type.creep
    creep: Creep_Type
    health: number
    ui: {
        health_number: LabelPanel
    }
} | {
    type: Adventure_Party_Slot_Type.spell
    spell: Spell_Id
})

type Base_Slot_UI = {
    container: Panel
    card_panel: Panel
    art: Panel
}

type Item_Panel_UI = {
    item: Item_Id | undefined
    slot_index: number
    panel: Panel
    drop_layer: Panel
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

function update_item_panel_ui(ui: Item_Panel_UI, item_in_slot: Item_Id | undefined) {
    const item_panel = ui.panel;

    item_panel.SetHasClass("empty", item_in_slot == undefined);

    if (item_in_slot == undefined) {
        item_panel.style.backgroundImage = "none";
    } else {
        const image = `file://{images}/${get_item_icon(item_in_slot)}.png`;
        safely_set_panel_background_image(item_panel, image);

        $.RegisterEventHandler("DragStart", item_panel, (id, drag) => {
            const dragged_panel = $.CreatePanel("Panel", item_panel, "");
            dragged_panel.AddClass("dragged_inventory_slot");
            dragged_panel.hittest = false;
            safely_set_panel_background_image(dragged_panel, image);

            const [w, h] = [item_panel.actuallayoutwidth, item_panel.actuallayoutheight];

            drag.displayPanel = dragged_panel;
            drag.offsetX = w;
            drag.offsetY = h;

            adventure_ui.drag_state = {
                dragging: true,
                item: item_in_slot,
                dragged_panel: dragged_panel
            };

            item_panel.AddClass("being_dragged");
            item_panel.style.backgroundImage = "none";

            adventure_ui.party_container.AddClass("dragging_item");

            return true;
        });

        $.RegisterEventHandler("DragEnd", item_panel, (id, dragged) => {
            dragged.DeleteAsync(0);

            adventure_ui.party_container.RemoveClass("dragging_item");
            adventure_ui.party_container.RemoveClass("has_drop_target");
            adventure_ui.drag_state = { dragging: false };

            item_panel.RemoveClass("drop_hover");
            item_panel.RemoveClass("being_dragged");
            safely_set_panel_background_image(item_panel, image);

            return true;
        });
    }

    $.RegisterEventHandler("DragEnter", item_panel, (id, panel) => {
        if (!adventure_ui.drag_state.dragging) return true;

        const dragged_item_image = `file://{images}/${get_item_icon(adventure_ui.drag_state.item)}.png`;
        const dragged_panel = adventure_ui.drag_state.dragged_panel;

        adventure_ui.party_container.AddClass("has_drop_target");
        item_panel.AddClass("drop_hover");
        dragged_panel.AddClass("drop_hover");

        safely_set_panel_background_image(ui.drop_layer, dragged_item_image);

        return true;
    });

    $.RegisterEventHandler("DragLeave", item_panel, () => {
        if (!adventure_ui.drag_state.dragging) return true;

        const dragged_panel = adventure_ui.drag_state.dragged_panel;

        adventure_ui.party_container.RemoveClass("has_drop_target");
        dragged_panel.RemoveClass("drop_hover");
        item_panel.RemoveClass("drop_hover");

        return true;
    });
}

function fill_adventure_hero_slot(container: Panel, hero: Hero_Type, health: number, items: Item_Id[]): Adventure_Party_Slot_UI {
    const base = fill_adventure_base_slot_ui(container);
    base.art.AddClass("hero");
    safely_set_panel_background_image(base.art, get_hero_card_art(hero));

    base.card_panel.SetHasClass("dead", health == 0);

    const inventory_parent = $.CreatePanel("Panel", base.card_panel, "inventory");
    const item_panels: Item_Panel_UI[] = [];

    for (let index = 0; index < Adventure_Constants.max_hero_items; index++) {
        const item_in_slot = items[index];
        const item_panel = $.CreatePanel("Panel", inventory_parent, "");

        item_panel.AddClass("slot");
        item_panel.SetDraggable(true);

        const drop_layer = $.CreatePanel("Panel", item_panel, "drop_layer");
        drop_layer.hittest = false;

        const item_ui = {
            item: item_in_slot,
            panel: item_panel,
            slot_index: index,
            drop_layer: drop_layer
        };

        update_item_panel_ui(item_ui, item_in_slot);

        item_panels.push(item_ui);
    }

    $.CreatePanel("Panel", base.card_panel, "dead_overlay");

    const health_label = $.CreatePanel("Label", base.card_panel, "health_number");
    health_label.text = health.toString(10);

    const def = hero_definition_by_type(hero);

    set_up_adventure_slot_tooltip(base.container, "hero", tooltip => {
        create_hero_card_ui_base(tooltip, hero, def.health, def.attack_damage, def.move_points);
    });

    return {
        type: Adventure_Party_Slot_Type.hero,
        hero: hero,
        health: health,
        container: base.container,
        items: item_panels,
        ui: {
            card_panel: base.card_panel,
            health_number: health_label
        }
    }
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

    const health_label = $.CreatePanel("Label", base.card_panel, "health_number");
    health_label.text = health.toString(10);

    const def = creep_definition_by_type(creep);

    set_up_adventure_slot_tooltip(base.container, "creep", tooltip => {
        create_unit_card_ui_base(tooltip, get_creep_name(creep), get_creep_card_art(creep), def.health, def.attack_damage, def.move_points);
    });

    return {
        type: Adventure_Party_Slot_Type.creep,
        creep: creep,
        health: health,
        container: base.container,
        ui: {
            health_number: health_label
        }
    }
}

function reinitialize_adventure_ui(slots: number) {
    const card_container = adventure_ui.card_container;
    card_container.RemoveAndDeleteChildren();

    adventure_ui.party.slots = [];

    for (; slots > 0; slots--) {
        adventure_ui.party.slots.push(create_adventure_empty_slot(card_container));
    }
}

function set_adventure_party_slot(slot_index: number, slot: Adventure_Party_Slot): Adventure_Party_Slot_UI {
    function make_new_slot(slot: Adventure_Party_Slot, container: Panel): Adventure_Party_Slot_UI {
        switch (slot.type) {
            case Adventure_Party_Slot_Type.hero: return fill_adventure_hero_slot(container, slot.hero, slot.health, slot.items);
            case Adventure_Party_Slot_Type.creep: return fill_adventure_creep_slot(container, slot.creep, slot.health);
            case Adventure_Party_Slot_Type.spell: return fill_adventure_spell_slot(container, slot.spell);
            case Adventure_Party_Slot_Type.empty: return fill_adventure_empty_slot(container);
        }
    }

    const old_slot = adventure_ui.party.slots[slot_index];
    const container = old_slot.container;
    container.RemoveAndDeleteChildren();

    const new_slot = make_new_slot(slot, container);

    adventure_ui.party.slots[slot_index] = new_slot;

    return new_slot;
}

function fill_adventure_popup_content(entity: Adventure_Entity_Definition) {
    const popup = adventure_ui.popup;

    switch (entity.type) {
        case Adventure_Entity_Type.lost_creep: {
            popup.text.text = "Lost Creep would like to join your party";

            const creep = Creep_Type.lane_creep;
            const def = creep_definition_by_type(creep);
            const container = create_card_container_ui(adventure_ui.popup.content, false);
            create_unit_card_ui_base(container, get_creep_name(creep), get_creep_card_art(creep), def.health, def.attack_damage, def.move_points);
            container.AddClass("creep");

            break;
        }

        case Adventure_Entity_Type.enemy: {
            break;
        }

        default: unreachable(entity)
    }
}

function show_adventure_popup(entity_id: Adventure_Entity_Id, entity: Adventure_Entity_Definition) {
    const popup = adventure_ui.popup;

    popup.window.SetHasClass("visible", true);
    popup.background.SetHasClass("visible", true);

    popup.text.text = "";
    popup.content.RemoveAndDeleteChildren();

    fill_adventure_popup_content(entity);

    popup.window.SetPanelEvent(PanelEvent.ON_LEFT_CLICK, () => {});

    popup.button_yes.SetPanelEvent(PanelEvent.ON_LEFT_CLICK, () => {
        fire_event(To_Server_Event_Type.adventure_interact_with_entity, {
            entity_id: entity_id,
            current_head: adventure_ui.party.current_head
        });

        hide_adventure_popup();
    });

    popup.button_no.SetPanelEvent(PanelEvent.ON_LEFT_CLICK, () => {
        hide_adventure_popup();
    });

    popup.background.SetPanelEvent(PanelEvent.ON_LEFT_CLICK, () => {
        hide_adventure_popup();
    });
}

function merge_adventure_party_changes(head_before_merge: number, changes: Adventure_Party_Change[]) {
    $.Msg(`Received ${changes.length} party changes, inserting after ${head_before_merge}`);

    for (let index = 0; index < changes.length; index++) {
        adventure_ui.party.changes[head_before_merge + index - adventure_ui.party.base_head] = changes[index];
    }

    adventure_ui.party.current_head = head_before_merge + changes.length;
}

export function try_adventure_cheat(text: string) {
    const head = adventure_ui.party.current_head;

    api_request(Api_Request_Type.adventure_party_cheat, {
        access_token: get_access_token(),
        cheat: text,
        current_head: head
    }, response => merge_adventure_party_changes(head, response.party_updates));
}

function hide_adventure_popup() {
    adventure_ui.popup.window.SetHasClass("visible", false);
    adventure_ui.popup.background.SetHasClass("visible", false);
}

export function adventure_filter_mouse_click(event: MouseEvent, button: MouseButton | WheelScroll): boolean {
    return false;
}

function play_adventure_party_change(change: Adventure_Party_Change): Adventure_Animation_Promise {
    function fixed_duration(duration: number): Adventure_Animation_Promise {
        const finish_at = Game.Time() + duration;
        return () => Game.Time() >= finish_at;
    }

    function animate_integer(start_from: number, finish_on: number, consumer: (value: number) => void): Adventure_Animation_Promise {
        let finished_updating = false;
        let current_value = start_from;

        const normal = Math.sign(finish_on - start_from);

        function update_number() {
            if (current_value == finish_on || current_state != Player_State.on_adventure) {
                finished_updating = true;
                return;
            }

            $.Schedule(0.03, update_number);

            current_value += normal;

            consumer(current_value);
        }

        update_number();

        return () => finished_updating;
    }

    function both(a: Adventure_Animation_Promise, b: Adventure_Animation_Promise): Adventure_Animation_Promise {
        return () => a() && b();
    }

    function proceed() {
        return true;
    }

    function animate_health_change(container: Panel, from: number, to: number) {
        if (to < from) {
            const damage = $.CreatePanel("Panel", container, "");
            damage.AddClass("animation");
            damage.AddClass("animate_damage");
            damage.DeleteAsync(0.3);
        } else if (to > from) {
            const heal = $.CreatePanel("Panel", container, "");
            heal.AddClass("animation");
            heal.AddClass("animate_heal");
            heal.DeleteAsync(0.3);
        }
    }

    switch (change.type) {
        case Adventure_Party_Change_Type.set_slot: {
            const new_slot = set_adventure_party_slot(change.slot_index, change.slot);

            const flash = $.CreatePanel("Panel", new_slot.container, "");
            flash.AddClass("animate_add_to_deck_flash");
            flash.hittest = false;

            return fixed_duration(0.2);
        }

        case Adventure_Party_Change_Type.set_hero_item: {
            const slot = adventure_ui.party.slots[change.slot_index];
            if (!slot) return proceed;
            if (slot.type != Adventure_Party_Slot_Type.hero) return proceed;

            const item_panel = slot.items[change.item_slot_index];
            if (!item_panel) return proceed;

            update_item_panel_ui(item_panel, change.item_id);

            return fixed_duration(0.2);
        }

        case Adventure_Party_Change_Type.set_health: {
            const slot = adventure_ui.party.slots[change.slot_index];
            if (!slot) return proceed;

            switch (slot.type) {
                case Adventure_Party_Slot_Type.hero: {
                    if (change.health < slot.health) {
                        emit_random_sound(hero_sounds_by_hero_type(slot.hero).pain);
                    }

                    animate_health_change(slot.container, slot.health, change.health);

                    return both(fixed_duration(1.0), animate_integer(slot.health, change.health, value => {
                        slot.health = value;
                        slot.ui.card_panel.SetHasClass("dead", slot.health == 0);

                        return slot.ui.health_number.text = value.toString(10);
                    }));
                }

                case Adventure_Party_Slot_Type.creep: {
                    animate_health_change(slot.container, slot.health, change.health);

                    return both(fixed_duration(1.0), animate_integer(slot.health, change.health, value => {
                        slot.health = value;

                        return slot.ui.health_number.text = value.toString(10);
                    }));
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

    const party = adventure_ui.party;
    const current_change = party.changes[party.currently_playing_change_index];

    if (current_change) {
        if (!party.currently_playing_a_change) {
            party.currently_playing_a_change = true;
            party.next_change_promise = play_adventure_party_change(current_change);
        }

        if (party.next_change_promise()) {
            party.currently_playing_a_change = false;
            party.currently_playing_change_index++;
        }
    }
}

periodically_update_party_ui();

subscribe_to_net_table_key<Game_Net_Table>("main", "game", async data => {
    if (data.state == Player_State.on_adventure) {
        const reinitialize_ui = adventure_ui.ongoing_adventure_id != data.ongoing_adventure_id;
        const head_before_merge = reinitialize_ui ? 0 : adventure_ui.party.current_head;

        if (reinitialize_ui) {
            reinitialize_adventure_ui(data.num_party_slots);
        }

        const result = await async_api_request(Api_Request_Type.get_adventure_party_changes, {
            access_token: get_access_token(),
            current_head: head_before_merge
        });

        if (reinitialize_ui || result.snapshot) {
            adventure_ui.ongoing_adventure_id = data.ongoing_adventure_id;
            adventure_ui.party.currently_playing_change_index = 0;
            adventure_ui.party.changes = [];
            adventure_ui.party.current_head = 0;
            adventure_ui.party.base_head = 0;

            reinitialize_adventure_ui(result.snapshot ? result.slots.length : data.num_party_slots);
        }

        if (result.snapshot) {
            $.Msg(`Restoring head ${result.origin_head} from snapshot`);

            for (let index = 0; index < result.slots.length; index++) {
                set_adventure_party_slot(index, result.slots[index]);
            }

            adventure_ui.party.base_head = result.origin_head;
            adventure_ui.party.current_head = result.origin_head;
        } else {
            merge_adventure_party_changes(head_before_merge, result.changes);
        }
    }
});

subscribe_to_custom_event(To_Client_Event_Type.adventure_display_entity_popup, event => {
    if (event.entity.type == Adventure_Entity_Type.lost_creep) {
        show_adventure_popup(event.entity_id, event.entity);
    }
});

subscribe_to_custom_event(To_Client_Event_Type.adventure_receive_party_changes, event => {
    merge_adventure_party_changes(event.current_head, from_server_array(event.changes));
});