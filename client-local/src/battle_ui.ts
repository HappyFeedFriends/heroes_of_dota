import {current_state} from "./main_ui";

import {
    authorize_ability_use_with_error_ui,
    card_use_error_reason,
    show_action_error_ui,
    show_player_action_error_ui,
    take_battle_action,
    try_order_unit_to_move,
    try_order_unit_to_pick_up_rune,
    try_purchase_item,
    try_use_card,
    try_use_no_target_ability,
    try_use_ground_target_ability,
    try_use_unit_targeted_ability
} from "./battle_actions";

import {
    subscribe_to_custom_event,
    subscribe_to_game_net_table_key,
    api_request,
    get_access_token,
    fire_event,
    get_visualiser_delta_head,
    get_visualiser_actual_head
} from "./interop";

const enum Selection_Type {
    none,
    unit,
    ability,
    shop,
    card
}

export const enum Hover_Type {
    none = 0,
    cell = 1,
    unit = 2,
    ability = 3
}

const enum Popup_Type {
    health_change,
    ability_use,
    adventure_item_effect,
    modifier_effect
}

type Popup_Base = {
    unit_id: Unit_Id
    scheduled_at: number
    launched: boolean
}

type Popup_Data = {
    type: Popup_Type.health_change
    change: number
    blocked_by_armor: number
} | {
    type: Popup_Type.ability_use
    ability_id: Ability_Id
} | {
    type: Popup_Type.adventure_item_effect
    item_id: Adventure_Item_Id
} | {
    type: Popup_Type.modifier_effect
    modifier_handle_id: Modifier_Handle_Id
}

type Popup = Popup_Base & Popup_Data

type No_Selection = {
    type: Selection_Type.none
}

type Unit_Selection = {
    type: Selection_Type.unit
    unit: Unit
    unit_entity: EntityId
}

type Ability_Selection = {
    type: Selection_Type.ability
    unit: Unit
    ability: Ability_Ground_Target | Ability_Unit_Target

    unit_entity: EntityId
}

type Shop_Selection = {
    type: Selection_Type.shop
    unit: Unit
    shop: Shop

    unit_entity: EntityId
    shop_entity: EntityId

    arrow_particle: ParticleId
}

type Card_Selection = {
    type: Selection_Type.card

    previous_selection: Selection_State
    card_panel: Card_Panel
    targeting_fx: ParticleId
}

type Selection_State = No_Selection | Unit_Selection | Ability_Selection | Shop_Selection | Card_Selection;

type UI_Player_Data = {
    id: Battle_Player_Id
    gold: number
}

type UI_Shop_Data = {
    id: Shop_Id

    displayed_gold: number
    root_container: Panel
    items_container: Panel
    gold_text: LabelPanel

    item_buttons: Record<Item_Id, Panel>
}

type UI_Unit_Data_Base = {
    id: Unit_Id
    hidden: boolean

    stat_bar_panel: Panel

    stat_health: Stat_Indicator
    stat_attack: Stat_Indicator
    stat_armor: Stat_Indicator
    stat_move_points: Stat_Indicator
    stat_max_move_points: Stat_Indicator
    stat_max_health: Stat_Indicator

    modifier_bar: Panel
    modifier_elements: Effect_UI<Modifier_Handle_Id>[]

    circle: {
        visible: true
        particle: ParticleId
    } | {
        visible: false
    }

    stats: Unit_Stats
}

type UI_Hero_Data = UI_Unit_Data_Base & {
    supertype: Unit_Supertype.hero
    level: number
    level_bar: Level_Bar
}

type UI_Monster_Data = UI_Unit_Data_Base & {
    supertype: Unit_Supertype.monster
}

type UI_Creep_Data = UI_Unit_Data_Base & {
    supertype: Unit_Supertype.creep
}

type UI_Unit_Data = UI_Hero_Data | UI_Monster_Data | UI_Creep_Data

type UI_Battle = Battle & {
    id: Battle_Id
    started_at_delta_head: number
    entity_id_to_unit_data: Record<EntityId, UI_Unit_Data>
    entity_id_to_rune_id: Record<number, Rune_Id | undefined>
    entity_id_to_shop_id: Record<number, Shop_Id | undefined>
    unit_id_to_facing: Record<number, XY>
    shop_id_to_facing: Record<number, XY>
    modifier_handle_id_to_modifier: Record<number, Applied_Modifier | undefined>
    card_id_to_card: Record<number, Card | undefined>
    cell_index_to_unit: Unit[]
    cell_index_to_rune: Rune[]
    outline_particles: ParticleId[]
    shop_range_outline_particles: ParticleId[]
    zone_highlight_particles: ParticleId[]
    this_player: Battle_Player
    grid: UI_Grid
}

type UI_Cell = Cell & ({
    disabled: false
    associated_particle: ParticleId
} | {
    disabled: true
})

type Control_Panel = {
    panel: Panel
    unit_rows: Unit_Row[]
}

type Stat_Indicator = {
    label: LabelPanel
    displayed_value: number
    value_provider(stats: Unit_Stats): number
}

type Unit_Row = {
    unit_id: Unit_Id
    panel: Panel
    modifier_cursor: number
    modifier_bar: {
        root: Panel
        arrow_left: Panel
        arrow_right: Panel
    }
    modifier_panels: Unit_Modifier_Panel[]
    ability_buttons_panel: Panel
    ability_buttons: Unit_Ability_Button[]
    health_label: LabelPanel
    level_bar: Level_Bar
}

type Unit_Ability_Button = {
    ability: Ability_Id
    ability_panel: Panel
    ability_image: Panel
    charges_label: LabelPanel
    overlay: Panel
}

type Unit_Modifier_Panel = {
    modifier_handle_id: Modifier_Handle_Id
    panel: ImagePanel
}

type Level_Bar = {
    pips: Panel[]
}

type Card_Panel = {
    panel: Panel
    card: Card
    hovered: boolean
}

export type Hover_State = Hover_State_None | Hover_State_Cell | Hover_State_Unit | Hover_State_Ability;

export type Hover_State_None = {
    type: Hover_Type.none
}

export type Hover_State_Cell = {
    type: Hover_Type.cell
    cell: XY
}

export type Hover_State_Unit = {
    type: Hover_Type.unit
    unit: Unit
}

export type Hover_State_Ability = {
    type: Hover_Type.ability
    unit: Unit
    ability: Ability
}

type UI_Grid = World_Grid<UI_Cell>;

export let battle: UI_Battle;
let ui_player_data: UI_Player_Data[] = [];

export let selection: Selection_State = {
    type: Selection_Type.none
};

let hover: Hover_State = {
    type: Hover_Type.none
};

let ui_shop_data: UI_Shop_Data[] = [];

const current_targeted_ability_ui = $("#current_targeted_ability");
const card_selection_overlay = $("#card_selection_overlay");
const end_turn_button = $("#end_turn_button");
const popups = $("#popups");
const modifier_tooltip = $("#modifier_tooltip");
const popup_queue: Popup[] = [];
const popup_time_offset = 0.25;

export const control_panel: Control_Panel = {
    panel: $("#unit_rows"),
    unit_rows: []
};

let actual_cards_in_hand: Card_Id[] = [];
let hand: Card_Panel[] = [];

let card_error_shown_at = 0;

function set_selection(new_selection: Selection_State) {
    if (selection.type == Selection_Type.card) {
        Particles.DestroyParticleEffect(selection.targeting_fx, false);
        Particles.ReleaseParticleIndex(selection.targeting_fx);

        selection.card_panel.panel.SetHasClass("in_preview", false);
        selection.card_panel.panel.SetHasClass("targeting_something", false);
    }

    current_targeted_ability_ui.SetHasClass("visible", new_selection.type == Selection_Type.ability);

    const was_overlay_unit_selection = is_overlay_unit_selection(selection);

    selection = new_selection;

    card_selection_overlay.SetHasClass("visible", is_overlay_unit_selection(new_selection));

    if (!was_overlay_unit_selection && is_overlay_unit_selection(new_selection)) {
        recreate_overlay_unit_selection(new_selection);
    }

    for (const row of control_panel.unit_rows) {
        row.panel.SetHasClass("selected", is_unit_selection(new_selection) && new_selection.unit.id == row.unit_id);
    }
}

function is_overlay_unit_selection(selection: Selection_State): selection is Card_Selection {
    if (selection.type == Selection_Type.card) {
        const card = selection.card_panel.card;

        if (card.type == Card_Type.spell && card.spell_type == Spell_Type.unit_target) {
            return card.targeting_flags.indexOf(Spell_Unit_Targeting_Flag.dead) != -1;
        }
    }

    return false;
}

export function is_unit_selection(selection: Selection_State): selection is (Unit_Selection | Shop_Selection | Ability_Selection) {
    return selection.type == Selection_Type.unit || selection.type == Selection_Type.shop || selection.type == Selection_Type.ability;
}

function find_unit_by_entity_id(battle: UI_Battle, entity_id: EntityId | undefined): Unit | undefined {
    if (entity_id == undefined) return;

    const unit_data = battle.entity_id_to_unit_data[entity_id];

    if (!unit_data) return;

    return find_unit_by_id(battle, unit_data.id);
}

function find_rune_by_entity_id(battle: UI_Battle, entity_id: EntityId | undefined): Rune | undefined {
    if (entity_id == undefined) return;

    const rune_id = battle.entity_id_to_rune_id[entity_id];

    if (rune_id == undefined) return;

    return find_rune_by_id(battle, rune_id);
}

function find_shop_by_entity_id(battle: UI_Battle, entity_id: EntityId | undefined): Shop | undefined {
    if (entity_id == undefined) return;

    const shop_id = battle.entity_id_to_shop_id[entity_id];

    if (shop_id == undefined) return;

    return find_shop_by_id(battle, shop_id);
}

function find_unit_entity_data_by_unit_id(battle: UI_Battle, unit_id: Unit_Id): [ EntityId, UI_Unit_Data ] | undefined {
    for (const entity_id in battle.entity_id_to_unit_data) {
        const data = battle.entity_id_to_unit_data[entity_id];

        if (data.id == unit_id) {
            return [ Number(entity_id), data ];
        }
    }
}

function get_delta_path(delta: Delta): [Unit, XY[]] | undefined {
    switch (delta.type) {
        case Delta_Type.rune_pick_up: {
            const unit = find_unit_by_id(battle, delta.unit_id);
            if (!unit) break;

            const rune = find_rune_by_id(battle, delta.rune_id);
            if (!rune) break;

            const path = find_grid_path(unit, rune.position, true);
            if (!path) break;

            return [unit, path];
        }

        case Delta_Type.unit_move: {
            const unit = find_unit_by_id(battle, delta.unit_id);
            if (!unit) break;

            const path = find_grid_path(unit, delta.to_position, false);
            if (!path) break;

            return [unit, path];
        }
    }
}

function update_related_visual_data_from_delta(delta: Delta, delta_paths: Move_Delta_Paths) {
    function fill_movement_data(unit: Unit, path: XY[]) {
        delta_paths[battle.delta_head] = path;

        battle.unit_id_to_facing[unit.id] = path.length > 1
            ? xy_sub(path[path.length - 1], path[path.length - 2])
            : xy_sub(path[path.length - 1], unit.position);
    }

    const unit_path = get_delta_path(delta);
    if (unit_path) {
        fill_movement_data(unit_path[0], unit_path[1]);
        return;
    }

    switch (delta.type) {
        case Delta_Type.monster_spawn: {
            battle.unit_id_to_facing[delta.unit_id] = {
                x: delta.facing.x,
                y: delta.facing.y
            };

            break;
        }

        case Delta_Type.shop_spawn: {
            battle.shop_id_to_facing[delta.shop_id] = delta.facing;
            break;
        }

        case Delta_Type.use_unit_target_ability: {
            const unit = find_unit_by_id(battle, delta.unit_id);
            const target = find_unit_by_id(battle, delta.target_unit_id);

            if (unit && target) {
                battle.unit_id_to_facing[unit.id] = xy_sub(target.position, unit.position);
            }

            break;
        }

        case Delta_Type.use_ground_target_ability: {
            const unit = find_unit_by_id(battle, delta.unit_id);

            if (unit) {
                battle.unit_id_to_facing[unit.id] = xy_sub(delta.target_position, unit.position);
            }

            break;
        }

        case Delta_Type.purchase_item: {
            const shop_ui = ui_shop_data.find(shop_ui => shop_ui.id == delta.shop_id);

            if (!shop_ui) break;

            const item_button = shop_ui.item_buttons[delta.item_id];

            if (item_button) {
                item_button.AddClass("unavailable");
            }

            break;
        }
    }
}

function rebuild_cell_indexes() {
    battle.cell_index_to_unit = [];
    battle.cell_index_to_rune = [];

    for (const unit of battle.units) {
        if (authorize_act_on_known_unit(battle, unit).ok) {
            battle.cell_index_to_unit[grid_cell_index(battle.grid, unit.position)] = unit;
        }
    }

    for (const rune of battle.runes) {
        battle.cell_index_to_rune[grid_cell_index(battle.grid, rune.position)] = rune;
    }
}

export function receive_battle_deltas(head_before_merge: number, deltas: Delta[]) {
    $.Msg(`Received ${deltas.length} new deltas`);

    for (let index = 0; index < deltas.length; index++) {
        battle.deltas[head_before_merge + index] = deltas[index];
    }

    const delta_paths: Move_Delta_Paths = {};

    for (; battle.delta_head < battle.deltas.length; battle.delta_head++) {
        const delta = battle.deltas[battle.delta_head];

        if (!delta) {
            break;
        }

        $.Msg(battle.delta_head, " ", enum_to_string(delta.type));

        update_related_visual_data_from_delta(delta, delta_paths);
        collapse_delta(battle, delta);
        drain_battle_event_queue(battle);

        if (delta.type == Delta_Type.game_start) {
            battle.started_at_delta_head = battle.delta_head;
        }

        if (delta.type == Delta_Type.hero_spawn) {
            const spawned_hero = find_hero_by_id(battle, delta.unit_id);

            if (spawned_hero && player_owns_unit(battle.this_player, spawned_hero)) {
                add_spawned_unit_to_control_panel(spawned_hero);
            }
        }

        if (delta.type == Delta_Type.shop_spawn) {
            const spawned_shop = find_shop_by_id(battle, delta.shop_id);

            if (spawned_shop) {
                ui_shop_data.push(create_ui_shop_data(spawned_shop));
            }
        }
    }

    for (const row of control_panel.unit_rows) {
        const hero = find_hero_by_id(battle, row.unit_id);

        if (hero) {
            update_hero_control_panel_state(row, hero);
        }
    }

    update_end_turn_button();

    const visualiser_head = get_visualiser_delta_head();
    const visualiser_actual_head = get_visualiser_actual_head();
    const head_relative_to_battle_start = battle.delta_head - battle.started_at_delta_head;

    if (visualiser_head != undefined && head_relative_to_battle_start - visualiser_head > 20) {
        fire_event(To_Server_Event_Type.fast_forward, make_battle_snapshot());
    } else if (deltas.length > 0) {
        fire_event(To_Server_Event_Type.put_deltas, {
            deltas: deltas,
            delta_paths: delta_paths,
            from_head: head_before_merge
        });
    } else if (visualiser_actual_head != undefined && visualiser_actual_head < battle.delta_head) {
        const paths: Move_Delta_Paths = {};

        for (let index = 0; index < battle.deltas.length; index++) {
            const unit_path = get_delta_path(battle.deltas[index]);
            if (unit_path) {
                paths[index] = unit_path[1];
            }
        }

        fire_event(To_Server_Event_Type.put_deltas, {
            deltas: battle.deltas,
            delta_paths: paths,
            from_head: 0
        });
    }

    if (battle.state.status == Battle_Status.finished) {
        hover = { type: Hover_Type.none };
        drop_selection();
    }

    if (deltas.length > 0) {
        rebuild_cell_indexes();
        update_grid_visuals();
    }
}

export function try_battle_cheat(text: string) {
    const unit = selection.type == Selection_Type.unit ? selection.unit : undefined;

    api_request(Api_Request_Type.battle_cheat, {
        access_token: get_access_token(),
        cheat: text,
        selected_unit_id: unit ? unit.id : -1 as Unit_Id
    }, request_battle_deltas);
}

function request_battle_deltas() {
    const head_before = battle.delta_head;

    api_request(Api_Request_Type.query_battle_deltas, {
        access_token: get_access_token(),
        battle_id: battle.id,
        since_delta: head_before
    }, response => {
        receive_battle_deltas(head_before, response.deltas);
    });
}

function periodically_request_battle_deltas_when_in_battle() {
    $.Schedule(2.0, periodically_request_battle_deltas_when_in_battle);

    if (current_state != Player_State.in_battle) {
        return;
    }

    request_battle_deltas();
}

function on_battle_event(battle: UI_Battle, event: Battle_Event) {
    $.Msg(`Received event ${enum_to_string(event.type)}`);

    if (event.type == Battle_Event_Type.card_added_to_hand) {
        if (event.player == battle.this_player) {
            // @Performance they are never cleared
            battle.card_id_to_card[event.card.id] = event.card;

            hand = update_hand_elements(actual_cards_in_hand);
        }
    }

    if (event.type == Battle_Event_Type.unit_spawned) {
        if (event.unit.supertype != Unit_Supertype.monster) {
            const owner = event.unit.owner;

            battle.unit_id_to_facing[event.unit.id] = {
                x: owner.deployment_zone.face.x,
                y: owner.deployment_zone.face.y
            };
        }
    }

    if (event.type == Battle_Event_Type.modifier_applied) {
        // @Performance they are never removed and carry behind a lot of data
        // consider adding a modifier removed event and tracking visualizer delta to determine the point of removal
        battle.modifier_handle_id_to_modifier[event.modifier.handle_id] = event.modifier;
    }
}

export function enter_battle_ui(new_state: Game_Net_Table_In_Battle) {
    const new_data = new_state.battle;
    const base = make_battle(new_data.participants.map(make_battle_player), new_data.grid_size.width, new_data.grid_size.height);
    const this_player = find_player_by_id(base, new_state.battle.battle_player_id);

    if (!this_player) {
        $.Msg("Error: not participating in this battle");
        return;
    }

    battle = {
        ...base,
        id: new_data.id,
        started_at_delta_head: 0,
        this_player: this_player,
        cell_index_to_unit: [],
        cell_index_to_rune: [],
        entity_id_to_unit_data: {},
        entity_id_to_rune_id: {},
        entity_id_to_shop_id: {},
        unit_id_to_facing: {},
        shop_id_to_facing: {},
        modifier_handle_id_to_modifier: {},
        card_id_to_card: {},
        outline_particles: [],
        shop_range_outline_particles: [],
        zone_highlight_particles: [],
        grid: {
            world_origin: new_data.world_origin,
            size: base.grid.size,
            cells: []
        },
        receive_event: on_battle_event as (battle: Battle, event: Battle_Event) => void // TODO poorly typed
    };

    set_selection({
        type: Selection_Type.none
    });

    ui_shop_data = [];

    const sparse_index = disabled_cell_index(new_data.disabled_cells);

    for (let x = 0; x < battle.grid.size.x; x++) {
        for (let y = 0; y < battle.grid.size.y; y++) {
            const index = grid_cell_index_raw(battle.grid, x, y);
            if (index == undefined) continue;

            const disabled = sparse_index[index];

            if (!disabled) {
                const center = battle_position_to_world_position_center(battle.grid.world_origin, xy(x, y));
                const particle = create_cell_particle_at(center);

                battle.grid.cells.push({
                    disabled: false,
                    position: xy(x, y),
                    slow_layers: 0,
                    occupants: 0,
                    cost: 1,
                    associated_particle: particle
                });

                register_particle_for_reload(particle);
            } else {
                battle.grid.cells.push({
                    disabled: true,
                    position: xy(x, y),
                    slow_layers: 0,
                    occupants: 1,
                    cost: 1,
                });
            }
        }
    }

    update_grid_visuals();
    clear_control_panel();
    clear_hand_state();

    $("#shop_panels_container").RemoveAndDeleteChildren();
    $("#stat_bar_container").RemoveAndDeleteChildren();
    $("#battle_over_container").RemoveAndDeleteChildren();

    request_battle_deltas();
}

export function exit_battle_ui() {
    for (const cell of battle.grid.cells) {
        if (!cell.disabled) {
            Particles.DestroyParticleEffect(cell.associated_particle, true);
            Particles.ReleaseParticleIndex(cell.associated_particle);
        }
    }
}

export function find_grid_path(unit: Unit, to: XY, ignore_runes: boolean): XY[] | undefined {
    const from = unit.position;
    const cell_from = grid_cell_at(battle.grid, from);
    const cell_to = grid_cell_at(battle.grid, to);

    if (!cell_from || !cell_to) {
        return;
    }

    // TODO population can exit when reaching 'to' to work in a more efficient manner
    const populated = populate_unit_path_costs(battle, unit, ignore_runes);
    return find_path_from_populated_costs(battle, populated, from, to);
}

type Grid_Selection_None = {
    type: Selection_Type.none
}

type Grid_Selection_Unit = {
    type: Selection_Type.unit
    unit: Unit
    path: Cost_Population_Result
}

type Grid_Selection_Ability = {
    type: Selection_Type.ability
    unit: Unit
    ability: Ability
}

type Grid_Selection_Shop = {
    type: Selection_Type.shop
    unit: Unit
    path: Cost_Population_Result
    shop: Shop
}

type Grid_Selection_Card = {
    type: Selection_Type.card
    card: Card
}

type Grid_Selection = Grid_Selection_None | Grid_Selection_Unit | Grid_Selection_Ability | Grid_Selection_Shop | Grid_Selection_Card;

function selection_to_grid_selection(): Grid_Selection {
    function none(): Grid_Selection_None {
        return {
            type: Selection_Type.none
        }
    }

    if (hover.type == Hover_Type.ability) {
        return {
            type: Selection_Type.ability,
            unit: hover.unit,
            ability: hover.ability
        }
    }

    switch (selection.type) {
        case Selection_Type.none: return none();

        case Selection_Type.unit: {
            const selected_entity_path = populate_unit_path_costs(battle, selection.unit, true)

            return {
                type: Selection_Type.unit,
                path: selected_entity_path,
                unit: selection.unit
            }
        }

        case Selection_Type.ability: {
            return {
                type: Selection_Type.ability,
                unit: selection.unit,
                ability: selection.ability
            }
        }

        case Selection_Type.shop: {
            return {
                type: Selection_Type.shop,
                path: populate_unit_path_costs(battle, selection.unit, false),
                unit: selection.unit,
                shop: selection.shop
            }
        }

        case Selection_Type.card: {
            return {
                type: Selection_Type.card,
                card: selection.card_panel.card
            }
        }
    }
}

function color_cell(cell: UI_Cell, color: RGB, alpha: number) {
    if (!cell.disabled) {
        Particles.SetParticleControl(cell.associated_particle, 2, color);
        Particles.SetParticleControl(cell.associated_particle, 3, [ alpha, 0, 0 ]);
    }
}

function compute_unit_indicator_color(unit_in_cell: Unit): [RGB, number] {
    const your_turn = battle.this_player == battle.turning_player;

    let cell_color: RGB;

    if (player_owns_unit(battle.this_player, unit_in_cell)) {
        if (your_turn) {
            if (unit_in_cell.has_taken_an_action_this_turn || is_unit_stunned(unit_in_cell)) {
                cell_color = color_yellow;
            } else {
                cell_color = color_green;
            }
        } else {
            cell_color = color_yellow;
        }
    } else {
        cell_color = color_red;
    }

    let alpha = 50;

    if (is_unit_selection(selection)) {
        if (selection.unit == unit_in_cell) {
            alpha = 255;
        } else {
            alpha = 20;
        }
    }

    return [ cell_color, alpha ];
}

function compute_unit_path_cell_color(unit: Unit, path: Cost_Population_Result, to: XY): [RGB, number] {
    const act = authorize_act_on_known_unit(battle, unit);

    if (act.ok) {
        const order = authorize_order_unit(act);

        if (order.ok) {
            const move = authorize_move_order_from_costs(order, to, path);

            if (move.ok) {
                return [color_green, 45];
            }
        }
    }

    const rune_in_cell = battle.cell_index_to_rune[grid_cell_index(battle.grid, to)];

    // TODO @Performance seems awfully inefficient if we have a lot of runes, consider populating paths twice and using that
    if (rune_in_cell) {
        const path_to_rune = can_find_path(battle, unit, rune_in_cell.position, unit_pathing_flags(unit, true));

        if (path_to_rune.found && path_to_rune.cost <= unit.move_points) {
            return [color_green, 45];
        }
    }

    return [color_nothing, 10];
}

function update_grid_visuals_for_ability(selection: Grid_Selection_Ability, cell_index_to_highlight: boolean[]) {
    let can_highlighted_ability_target_hovered_cell = false;
    let highlighted_ability_selector: Ability_Area_Selector | undefined;

    if (hover.type == Hover_Type.cell) {
        const ability = selection.ability;

        switch (ability.type) {
            case Ability_Type.target_ground:
            case Ability_Type.target_unit: {
                can_highlighted_ability_target_hovered_cell = ability_targeting_fits(battle, ability.targeting, selection.unit.position, hover.cell);
                highlighted_ability_selector = ability.targeting.selector;

                break;
            }

            case Ability_Type.no_target:
            case Ability_Type.passive: {
                break;
            }

            default: unreachable(ability);
        }
    }

    for (const cell of battle.grid.cells) {
        const index = grid_cell_index(battle.grid, cell.position);

        let cell_color: RGB = color_nothing;
        let alpha = 10;

        const unit_in_cell = battle.cell_index_to_unit[index];
        const ability = selection.ability;

        switch (ability.type) {
            case Ability_Type.target_ground: {
                if (ability_targeting_fits(battle, ability.targeting, selection.unit.position, cell.position)) {
                    alpha = 20;
                    cell_color = color_red;

                    cell_index_to_highlight[index] = true;
                }

                break;
            }

            case Ability_Type.target_unit: {
                if (ability_targeting_fits(battle, ability.targeting, selection.unit.position, cell.position)) {
                    if (unit_in_cell) {
                        alpha = 80;
                        cell_color = color_green;
                    } else {
                        alpha = 20;
                        cell_color = color_red;
                    }

                    cell_index_to_highlight[index] = true;
                }

                break;
            }

            case Ability_Type.no_target: {
                if (area_selector_fits(battle, ability.selector, selection.unit.position, selection.unit.position, cell.position)) {
                    alpha = 140;
                    cell_color = color_red;
                }

                break;
            }

            case Ability_Type.passive: {
                break;
            }

            default: unreachable(ability);
        }

        if (hover.type == Hover_Type.cell && can_highlighted_ability_target_hovered_cell && highlighted_ability_selector) {
            if (area_selector_fits(battle, highlighted_ability_selector, selection.unit.position, hover.cell, cell.position)) {
                alpha = 140;
                cell_color = color_red;
            }
        }

        color_cell(cell, cell_color, alpha);
    }
}

function update_grid_visuals_for_card_selection(selection: Grid_Selection_Card, cell_index_to_highlight: boolean[], cell_index_to_zone_highlight: boolean[]) {
    const card = selection.card;

    for (const cell of battle.grid.cells) {
        const index = grid_cell_index(battle.grid, cell.position);

        if (card.type == Card_Type.hero || card.type == Card_Type.existing_hero) {
            if (is_point_in_deployment_zone(battle, cell.position, battle.this_player)) {
                cell_index_to_zone_highlight[index] = true;
            }
        }

        if (card.type == Card_Type.spell) {
            if (hover.type == Hover_Type.cell && card.spell_type == Spell_Type.ground_target) {
                if (ground_targeting_spell_fits(card.targeting, hover.cell, cell.position)) {
                    cell_index_to_highlight[index] = true;
                }
            }
        }

        color_cell(cell, color_nothing, 10);
    }

    if (card.type == Card_Type.spell && card.spell_type == Spell_Type.unit_target) {
        for (const unit of battle.units) {
            const index = grid_cell_index(battle.grid, unit.position);
            const cell = battle.grid.cells[index];
            color_cell(cell, color_green, 50);
        }
    }
}

function update_unit_indicators() {
    function set_circle_color_alpha(particle: ParticleId, color: RGB, alpha: number) {
        Particles.SetParticleControl(particle, 2, color);
        Particles.SetParticleControl(particle, 3, [ alpha, 0, 0 ]);
    }

    for (const [entity, unit_ui] of Object.entries(battle.entity_id_to_unit_data)) {
        const unit = find_unit_by_id(battle, unit_ui.id);
        if (!unit) continue;

        const [color, alpha] = compute_unit_indicator_color(unit);
        const should_hide = unit_ui.hidden || unit.dead;

        if (unit_ui.circle.visible) {
            if (should_hide) {
                destroy_fx(unit_ui.circle.particle);
                unit_ui.circle = { visible: false };
            } else {
                set_circle_color_alpha(unit_ui.circle.particle, color, alpha);
            }
        } else {
            if (!should_hide) {
                unit_ui.circle = {
                    visible: true,
                    particle: -1 as ParticleId
                };

                // The particle won't show without that wait if the unit was just created
                $.Schedule(0.1, () => {
                    if (unit_ui.circle.visible && unit_ui.circle.particle == -1) {
                        const new_particle = Particles.CreateParticle("particles/ui/circle.vpcf", ParticleAttachment_t.PATTACH_ABSORIGIN_FOLLOW, parseInt(entity));

                        Particles.SetParticleControl(new_particle, 1, [64, 0, 0]); // Size

                        set_circle_color_alpha(new_particle, color, alpha);
                        register_particle_for_reload(new_particle);

                        unit_ui.circle.particle = new_particle;
                    }
                });
            }
        }
    }
}

function update_grid_visuals() {
    $.Msg("Update grid visuals");

    update_unit_indicators();

    const selection = selection_to_grid_selection();
    const cell_index_to_highlight: boolean[] = [];
    const cell_index_to_shop_highlight: boolean[] = [];
    const cell_index_to_zone_highlight: boolean[] = [];

    let hovered_shop: Shop | undefined;

    if (selection.type == Selection_Type.shop) {
        hovered_shop = selection.shop;
    } else {
        if (hover.type == Hover_Type.cell) {
            hovered_shop = shop_at(battle, hover.cell);
        } else {
            hovered_shop = undefined;
        }
    }

    for (const cell of battle.grid.cells) {
        const index = grid_cell_index(battle.grid, cell.position);

        if (hovered_shop && is_point_in_shop_range(cell.position, hovered_shop)) {
            cell_index_to_shop_highlight[index] = true;
        }
    }

    switch (selection.type) {
        case Selection_Type.none: {
            for (const cell of battle.grid.cells) {
                color_cell(cell, color_nothing, 10);
            }

            break;
        }

        case Selection_Type.shop:
        case Selection_Type.unit: {
            for (const cell of battle.grid.cells) {
                let [cell_color, alpha] = compute_unit_path_cell_color(selection.unit, selection.path, cell.position);

                color_cell(cell, cell_color, alpha);
            }

            break;
        }

        case Selection_Type.ability: {
            update_grid_visuals_for_ability(selection, cell_index_to_highlight);
            break;
        }

        case Selection_Type.card: {
            update_grid_visuals_for_card_selection(selection, cell_index_to_highlight, cell_index_to_zone_highlight);
            break;
        }

        default: unreachable(selection);
    }

    for (const cell of battle.grid.cells) {
        if (hover.type == Hover_Type.cell && xy_equal(hover.cell, cell.position)) {
            color_cell(cell, color_green, 80);
        }
    }

    battle.outline_particles = update_outline(battle.grid, battle.outline_particles, cell_index_to_highlight, color_red);
    battle.shop_range_outline_particles = update_outline(battle.grid, battle.shop_range_outline_particles, cell_index_to_shop_highlight, color_yellow);
    battle.zone_highlight_particles = update_outline(battle.grid, battle.zone_highlight_particles, cell_index_to_zone_highlight, color_green);
}

function periodically_drop_selection_in_battle() {
    $.Schedule(0, periodically_drop_selection_in_battle);

    if (current_state != Player_State.in_battle) {
        return;
    }

    const local_player = Players.GetLocalPlayer();
    const selected_entities = Players.GetSelectedEntities(local_player);
    const hero = Players.GetPlayerHeroEntityIndex(local_player);

    if (selected_entities.length > 0 && selected_entities[0] != hero) {
        GameUI.SelectUnit(-1, false);
    }
}

function create_ui_shop_data(shop: Shop): UI_Shop_Data {
    const root = $("#shop_panels_container");
    const shop_panel = $.CreatePanel("Panel", root, "");
    shop_panel.AddClass("shop_panel");

    const header = $.CreatePanel("Panel", shop_panel, "header");

    const title = $.CreatePanel("Label", header, "title");
    title.text = "ITEM SHOP";

    const gold_root = $.CreatePanel("Panel", header, "gold");

    $.CreatePanel("Panel", gold_root, "icon");

    const gold_text = $.CreatePanel("Label", gold_root, "amount");

    const items_container = $.CreatePanel("Panel", shop_panel, "items");

    const item_button_map: Record<number, Panel> = {};

    for (const item of shop.items) {
        const item_button = $.CreatePanel("Button", items_container, "");
        const item_image = $.CreatePanel("Image", item_button, "image");
        const item_cost = $.CreatePanel("Label", item_button, "cost");

        item_image.SetImage(get_item_icon(item));

        item_button.AddClass("item_button");
        item_button.SetPanelEvent(PanelEvent.ON_RIGHT_CLICK, () => {
            if (selection.type == Selection_Type.shop) {
                try_purchase_item(selection.unit, selection.shop, item, () => item_button.AddClass("unavailable"));
            }
        });

        item_button.SetPanelEvent(PanelEvent.ON_MOUSE_OVER, () => {
            // TODO re-implement this
            // $.DispatchEvent("DOTAShowTextTooltip", item_button, get_item_tooltip(item));
        });

        item_button.SetPanelEvent(PanelEvent.ON_MOUSE_OUT, () => {
            $.DispatchEvent("DOTAHideTextTooltip");
        });

        item_cost.text = item_gold_cost(item).toString(10);

        item_button_map[item] = item_button;
    }

    return {
        id: shop.id,
        displayed_gold: 0,
        gold_text: gold_text,
        items_container: items_container,
        root_container: shop_panel,
        item_buttons: item_button_map
    }
}

function create_ui_unit_data(data: Visualizer_Unit_Data): UI_Unit_Data {
    const root = $("#stat_bar_container");

    const top_level = $.CreatePanel("Panel", root, "");
    top_level.AddClass("unit_stat_bar");

    function create_health_indicator() {
        const [ label, max_label ] = current_max_stat_indicator(
            "health_container",
            "health_icon",
            "health_label",
            "max_health_label"
        );

        return [
            stat_indicator(label, unit => unit.health),
            stat_indicator(max_label, get_max_health)
        ];
    }

    function create_move_points_indicator() {
        const [ label, max_label ] = current_max_stat_indicator(
            "move_points_container",
            "move_points_icon",
            "move_points_label",
            "max_move_points_label"
        );

        return [
            stat_indicator(label, unit => unit.move_points),
            stat_indicator(max_label, get_max_move_points)
        ];
    }

    function create_attack_indicator(): Stat_Indicator {
        const container = $.CreatePanel("Panel", top_level, "attack_container");
        const label = $.CreatePanel("Label", container, "attack_label");
        $.CreatePanel("Panel", container, "attack_icon").AddClass("stat_icon");
        container.AddClass("container");

        return stat_indicator(label, get_attack_damage);
    }

    function create_armor_indicator(): Stat_Indicator {
        const container = $.CreatePanel("Panel", top_level, "armor_container");
        const label = $.CreatePanel("Label", container, "armor_label");
        $.CreatePanel("Panel", container, "armor_icon").AddClass("stat_icon");
        container.AddClass("container");

        return stat_indicator(label, get_armor);
    }

    function create_modifier_container(): Panel {
        const bar = $.CreatePanel("Panel", root, "");

        bar.AddClass("unit_modifier_bar");
        bar.AddClass("effects_bar");

        return bar;
    }

    function stat_indicator(label: LabelPanel, value_provider: (stats: Unit_Stats) => number): Stat_Indicator {
        return {
            displayed_value: value_provider(data),
            value_provider: value_provider,
            label: label
        }
    }

    function current_max_stat_indicator(container_id: string, icon_id: string, label_id: string, max_label_id: string) {
        const container = $.CreatePanel("Panel", top_level, container_id);
        const value_label = $.CreatePanel("Label", container, label_id);

        $.CreatePanel("Label", container, "separator").text = "/";

        const max_value_label = $.CreatePanel("Label", container, max_label_id);

        container.AddClass("container");
        value_label.AddClass("value_label");
        max_value_label.AddClass("value_label");

        $.CreatePanel("Panel", container, icon_id).AddClass("stat_icon");

        return [ value_label, max_value_label ];
    }

    const base = {
        id: data.id,
        modifiers: data.modifiers,
        stats: data,
        hidden: data.hidden,
        stat_bar_panel: top_level,
    };

    function create_default_indicators() {
        const [ health, max_health ] = create_health_indicator();
        const [ move_points, max_move_points ] = create_move_points_indicator();
        const attack = create_attack_indicator();
        const armor = create_armor_indicator();
        const modifiers = create_modifier_container();

        return {
            stat_health: health,
            stat_attack: attack,
            stat_armor: armor,
            stat_move_points: move_points,
            stat_max_move_points: max_move_points,
            stat_max_health: max_health,
            modifier_bar: modifiers,
            modifier_elements: [],
            circle: {
                visible: false
            } as const
        }
    }

    switch (data.supertype) {
        case Unit_Supertype.hero: {
            const level_bar = create_level_bar(top_level, "level_bar");
            const default_indicators = create_default_indicators();

            return {
                ...base,
                ...default_indicators,
                supertype: data.supertype,
                level: data.level,
                level_bar: level_bar,
            }
        }

        case Unit_Supertype.monster: {
            const default_indicators = create_default_indicators();

            return {
                ...base,
                ...default_indicators,
                supertype: data.supertype,
            }
        }

        case Unit_Supertype.creep: {
            const default_indicators = create_default_indicators();

            return {
                ...base,
                ...default_indicators,
                supertype: data.supertype,
            }
        }
    }
}

function update_unit_stat_bar_data(ui: UI_Unit_Data, new_data: Visualizer_Unit_Data) {
    function update_modifier_elements() {
        const new_modifiers: Effect_UI<Modifier_Handle_Id>[] = [];

        for (const handle of new_data.modifiers) {
            const existing = ui.modifier_elements.find(existing_element => existing_element.effect == handle);

            if (existing) {
                new_modifiers.push(existing);
            } else {
                new_modifiers.push({ effect: handle });
            }
        }

        for (const existing of ui.modifier_elements) {
            // @Performance a tad inefficient, but it's going to be fine if our lists are somewhat small
            const exists_in_new_list = new_modifiers.some(new_modifier => new_modifier.effect == existing.effect);

            if (!exists_in_new_list) {
                if (existing.panel) {
                    existing.panel.AddClass("being_removed");
                    existing.panel.DeleteAsync(0.5);
                }
            }
        }

        return new_modifiers;
    }

    if (ui.supertype == Unit_Supertype.hero && new_data.supertype == Unit_Supertype.hero) {
        ui.level = new_data.level;
    }

    ui.modifier_elements = update_modifier_elements();
    ui.stats = new_data;
    ui.hidden = new_data.hidden;

    ui.modifier_bar.SetHasClass("hidden", ui.hidden);
    ui.stat_bar_panel.SetHasClass("hidden", ui.hidden);

    ui.stat_bar_panel.SetHasClass("large_additional_stats", false);
    ui.stat_bar_panel.SetHasClass("large_full_stats", false);

    for (const stat of [ui.stat_health, ui.stat_attack]) {
        if (stat.value_provider(ui.stats) >= 10) {
            ui.stat_bar_panel.SetHasClass("large_additional_stats", true);
            break;
        }
    }

    for (const stat of [ui.stat_health, ui.stat_max_health, ui.stat_move_points, ui.stat_max_move_points]) {
        if (stat.value_provider(ui.stats) >= 10) {
            ui.stat_bar_panel.SetHasClass("large_full_stats", true);
            break;
        }
    }

    update_effects_elements(ui.modifier_bar, ui.modifier_elements, (parent, modifier_handle) => {
        const modifier = battle.modifier_handle_id_to_modifier[modifier_handle];
        if (!modifier) {
            $.Msg(`Modifier handle ${modifier_handle} not found`);
            return;
        }

        safely_set_panel_background_image(parent, get_modifier_icon(modifier));
    });

    const health_stat_value = ui.stat_health.value_provider(ui.stats);

    if (health_stat_value != ui.stat_health.displayed_value) {
        const which_animation = health_stat_value < ui.stat_health.displayed_value ? "animate_damage" : "animate_heal";

        ui.stat_health.label.RemoveClass("animate_damage");
        ui.stat_health.label.RemoveClass("animate_heal");
        ui.stat_health.label.AddClass(which_animation);
    }

    if (ui.supertype == Unit_Supertype.hero) {
        update_level_bar(ui.level_bar, ui.level);
    }

    function try_find_and_update_associated_unit() {
        const unit = find_unit_by_id(battle, ui.id);

        if (unit) {
            try_update_stat_bar_display(ui, true);

            ui.stat_bar_panel.SetHasClass("enemy", !player_owns_unit(battle.this_player, unit));
        } else {
            $.Schedule(0, try_find_and_update_associated_unit);
        }
    }

    try_find_and_update_associated_unit();
}

function dispose_of_ui_unit_data(data: UI_Unit_Data) {
    data.stat_bar_panel.DeleteAsync(0);

    if (data.circle.visible) {
        destroy_fx(data.circle.particle);
    }
}

function update_hand_elements(source: Card_Id[]) {
    const new_hand: Card_Panel[] = [];

    for (const card_id of source) {
        const existing = hand.find(existing_element => existing_element.card.id == card_id);

        if (existing) {
            new_hand.push(existing);
        } else {
            const source_card = battle.card_id_to_card[card_id];
            if (source_card) {
                new_hand.push(create_card_panel(source_card));
            }
        }
    }

    for (const current of hand) {
        // @Performance a tad inefficient, but it's going to be fine if our lists are somewhat small
        const exists_in_new_list = new_hand.some(new_card => new_card.card.id == current.card.id);

        if (!exists_in_new_list) {
            delete_card_panel_element(current);
        }
    }

    return new_hand;
}

function battle_process_state_update(battle: UI_Battle, state: Game_Net_Table_In_Battle) {
    ui_player_data = state.battle.players;

    actual_cards_in_hand = state.battle.this_player_hand;
    hand = update_hand_elements(actual_cards_in_hand);

    battle.entity_id_to_rune_id = {};

    for (const entity_id in state.battle.entity_id_to_rune_id) {
        battle.entity_id_to_rune_id[entity_id] = state.battle.entity_id_to_rune_id[entity_id];
    }

    battle.entity_id_to_shop_id = {};

    for (const entity_id in state.battle.entity_id_to_shop_id) {
        battle.entity_id_to_shop_id[entity_id] = state.battle.entity_id_to_shop_id[entity_id];
    }

    const leftover_entity_ids = Object.keys(battle.entity_id_to_unit_data);

    for (const entity_id in state.battle.entity_id_to_unit_data) {
        const new_data = state.battle.entity_id_to_unit_data[entity_id];
        const existing_data = battle.entity_id_to_unit_data[entity_id];
        const present_id_index = leftover_entity_ids.indexOf(entity_id);

        if (present_id_index != -1) {
            leftover_entity_ids.splice(present_id_index, 1);
        }

        if (existing_data && new_data.supertype == existing_data.supertype) {
            update_unit_stat_bar_data(existing_data, new_data);
        } else if (!new_data.status[Unit_Status.unselectable]) {
            const created_data = create_ui_unit_data(new_data);
            update_unit_stat_bar_data(created_data, new_data);

            battle.entity_id_to_unit_data[entity_id] = created_data;
        }
    }

    if (leftover_entity_ids.length > 0) {
        $.Msg(`Cleaning up ${leftover_entity_ids.length} unit data entries`);
    }

    for (const leftover_id_string of leftover_entity_ids) {
        const leftover_id = Number(leftover_id_string);

        if (is_unit_selection(selection) && selection.unit_entity == leftover_id) {
            const old_selected_unit_data = battle.entity_id_to_unit_data[leftover_id];

            for (const new_entity_id in state.battle.entity_id_to_unit_data) {
                const new_data = state.battle.entity_id_to_unit_data[new_entity_id];

                if (new_data.id == old_selected_unit_data.id) {
                    select_unit(Number(new_entity_id));

                    break;
                }
            }
        }

        dispose_of_ui_unit_data(battle.entity_id_to_unit_data[leftover_id]);

        delete battle.entity_id_to_unit_data[Number(leftover_id)];
    }
}

function move_order_particle(world_position: XYZ) {
    const particle = Particles.CreateParticle("particles/ui_mouseactions/clicked_moveto.vpcf", ParticleAttachment_t.PATTACH_CUSTOMORIGIN, 0);

    Particles.SetParticleControl(particle, 0, [ world_position.x, world_position.y, world_position.z + 32 ]);
    Particles.SetParticleControl(particle, 1, [ 128, 255, 128 ]);

    Particles.ReleaseParticleIndex(particle);
}

function make_battle_snapshot(): Battle_Snapshot {
    return {
        has_started: battle.state.status == Battle_Status.in_progress,
        player_hand: hand.map(ui => ui.card.id),
        players: battle.players.map(player => ({
            id: player.id,
            gold: player.gold
        })),
        effects: battle.timed_effects.map(effect => ({
            handle_id: effect.handle_id,
            content: effect.content
        })),
        units: battle.units
            .map(unit => {
                const snapshot_base = {
                    ...copy(unit as Unit_Stats),
                    id: unit.id,
                    position: unit.position,
                    facing: battle.unit_id_to_facing[unit.id],
                    base: unit.base,
                    bonus: unit.bonus,
                    modifiers: unit.modifiers.map(modifier => ({
                        modifier_handle_id: modifier.handle_id,
                        modifier: modifier.modifier
                    }))
                };

                switch (unit.supertype) {
                    case Unit_Supertype.hero: {
                        return {
                            ...snapshot_base,
                            supertype: Unit_Supertype.hero,
                            type: unit.type,
                            level: unit.level,
                            owner_id: unit.owner.id
                        };
                    }

                    case Unit_Supertype.monster: {
                        return {
                            ...snapshot_base,
                            supertype: Unit_Supertype.monster
                        };
                    }

                    case Unit_Supertype.creep: {
                        return {
                            ...snapshot_base,
                            supertype: Unit_Supertype.creep,
                            type: unit.type,
                            owner_id: unit.owner.id
                        };
                    }
                }
            }),
        runes: battle.runes.map(rune => ({
            id: rune.id,
            position: rune.position,
            type: rune.type
        })),
        shops: battle.shops.map(shop => ({
            id: shop.id,
            type: shop.type,
            position: shop.position,
            facing: battle.shop_id_to_facing[shop.id]
        })),
        trees: battle.trees.map(tree => ({
            id: tree.id,
            position: tree.position
        })),
        delta_head: battle.delta_head
    }
}

function clear_control_panel() {
    $("#unit_rows").RemoveAndDeleteChildren();

    control_panel.unit_rows = [];
}

function clear_hand_state() {
    $("#hand_ui").RemoveAndDeleteChildren();
    hand.length = 0;

    drop_card_selection();
}

function drop_card_selection() {
    if (selection.type == Selection_Type.card) {
        set_selection(selection.previous_selection);

        update_grid_visuals();
    }
}

/* TODO re-implement this
function get_item_tooltip(i: Item): string {
    switch (i.id) {
        case Item_Id.assault_cuirass: return `+${i.armor_bonus} armor`;
        case Item_Id.boots_of_travel: return `+${i.move_points_bonus} move points`;
        case Item_Id.boots_of_speed: return `+${i.move_points_bonus} move points`;
        case Item_Id.divine_rapier: return `+${i.damage_bonus} attack damage`;
        case Item_Id.blades_of_attack: return `+${i.damage_bonus} attack damage`;
        case Item_Id.heart_of_tarrasque: return `+${i.health_bonus} health, restores ${i.regeneration_per_turn} health at the end of each turn`;
        case Item_Id.refresher_shard: return `Restore charges of all abilities once`;
        case Item_Id.satanic: return `Restore health per damage point dealt by basic attack`;
        case Item_Id.tome_of_knowledge: return `Gain a level`;
        case Item_Id.mask_of_madness: return `+${i.damage_bonus} damage, but silence yourself`;
        case Item_Id.armlet: return `+${i.health_bonus} health, lose ${i.health_loss_per_turn} health per turn`;
        case Item_Id.belt_of_strength: return `+${i.health_bonus} health`;
        case Item_Id.morbid_mask: return `Restore ${i.health_restored_per_attack} health when attacking`;
        case Item_Id.chainmail: return `+${i.armor_bonus} armor`;
        case Item_Id.enchanted_mango: return `+${i.bonus_charges} charge to a level 1 ability`;
        case Item_Id.octarine_core: return `Restore health per damage point dealt by abilities`;
        case Item_Id.basher: return `Stun attacked targets for 1 turn`;
        case Item_Id.iron_branch: return `+${i.stat_bonus} move points<br/>+${i.stat_bonus} attack<br/>+${i.stat_bonus} health<br/>+${i.stat_bonus} armor`;
    }
}
*/

function get_ability_name(id: Ability_Id): string {
    switch (id) {
        case Ability_Id.basic_attack: return "Attack";
        case Ability_Id.pudge_hook: return "Meat Hook";
        case Ability_Id.pudge_rot: return "Rot";
        case Ability_Id.pudge_dismember: return "Dismember";
        case Ability_Id.tide_gush: return "Gush";
        case Ability_Id.tide_anchor_smash: return "Anchor Smash";
        case Ability_Id.tide_ravage: return "Ravage";
        case Ability_Id.luna_lucent_beam: return "Lucent Beam";
        case Ability_Id.luna_moon_glaive: return "Moon Glaive";
        case Ability_Id.luna_eclipse: return "Eclipse";
        case Ability_Id.skywrath_concussive_shot: return "Concussive Shot";
        case Ability_Id.skywrath_ancient_seal: return "Ancient Seal";
        case Ability_Id.skywrath_mystic_flare: return "Mystic Flare";
        case Ability_Id.dragon_knight_breathe_fire: return "Breathe Fire";
        case Ability_Id.dragon_knight_dragon_tail: return "Dragon Tail";
        case Ability_Id.dragon_knight_elder_dragon_form: return "Elder Dragon Form";
        case Ability_Id.dragon_knight_elder_dragon_form_attack: return "Dragon Form Attack";
        case Ability_Id.lion_hex: return "Hex";
        case Ability_Id.lion_impale: return "Impale";
        case Ability_Id.lion_finger_of_death: return "Finger of Death";
        case Ability_Id.mirana_starfall: return "Starstorm";
        case Ability_Id.mirana_arrow: return "Sacred Arrow";
        case Ability_Id.mirana_leap: return "Leap";
        case Ability_Id.venge_magic_missile: return "Magic Missile";
        case Ability_Id.venge_wave_of_terror: return "Wave of Terror";
        case Ability_Id.venge_nether_swap: return "Nether Swap";
        case Ability_Id.dark_seer_ion_shell: return "Ion Shell";
        case Ability_Id.dark_seer_surge: return "Surge";
        case Ability_Id.dark_seer_vacuum: return "Vacuum";
        case Ability_Id.ember_searing_chains: return "Searing Chains";
        case Ability_Id.ember_sleight_of_fist: return "Sleight of Fist";
        case Ability_Id.ember_fire_remnant: return "Fire Remnant";
        case Ability_Id.ember_activate_fire_remnant: return "Activate Fire Remnant";
        case Ability_Id.shaker_fissure: return "Fissure";
        case Ability_Id.shaker_enchant_totem: return "Enchant Totem";
        case Ability_Id.shaker_enchant_totem_attack: return "Enchant Totem Attack";
        case Ability_Id.shaker_echo_slam: return "Echo Slam";
        case Ability_Id.venomancer_plague_wards: return "Plague Ward";
        case Ability_Id.venomancer_venomous_gale: return "Venomous Gale";
        case Ability_Id.venomancer_poison_nova: return "Poison Nova";
        case Ability_Id.plague_ward_attack: return "Attack";
        case Ability_Id.bounty_hunter_shadow_walk: return "Shadow Walk";
        case Ability_Id.bounty_hunter_jinada: return "Jinada";
        case Ability_Id.bounty_hunter_jinada_attack: return "Jinada";
        case Ability_Id.bounty_hunter_track: return "Track";
        case Ability_Id.pocket_tower_attack: return "Attack";
        case Ability_Id.deployment_zone: return "Deployment zone";
        case Ability_Id.monster_lifesteal: return "Lifesteal";
        case Ability_Id.monster_spawn_spiderlings: return "Offspring";
    }
}

function get_ability_tooltip(caster: Unit, a: Ability): string {
    switch (a.id) {
        case Ability_Id.basic_attack: return `Basic attack`;
        case Ability_Id.pudge_hook: return `Hook, deals ${a.damage} damage`;
        case Ability_Id.pudge_rot: return `Deal ${a.damage} damage in an AoE`;
        case Ability_Id.pudge_dismember: return `Deal ${a.damage} damage<br/>Restore ${a.damage} health`;
        case Ability_Id.tide_gush: return `Deal ${a.damage} damage<br/>Slow for ${a.move_points_reduction}`;
        case Ability_Id.tide_anchor_smash: return `Deal ${a.damage} damage<br/>Reduce attack by ${a.attack_reduction}`;
        case Ability_Id.tide_ravage: return `Stun, ${a.damage} damage`;
        case Ability_Id.luna_lucent_beam: return `Deal ${a.damage} damage`;
        case Ability_Id.luna_moon_glaive: return `Attack bounces to nearby targets`;
        case Ability_Id.luna_eclipse: return `Deal ${a.total_beams} damage randomly split between nearby targets`;
        case Ability_Id.skywrath_concussive_shot: return `Deal ${a.damage} damage and slow random target (prioritizes enemies) by ${a.move_points_reduction} for ${a.duration} turns`;
        case Ability_Id.skywrath_ancient_seal: return `Silence target for ${a.duration} turns`;
        case Ability_Id.skywrath_mystic_flare: return `Deal ${a.damage} split between targets in an area`;
        case Ability_Id.dragon_knight_breathe_fire: return `Deal ${a.damage} damage to all targets`;
        case Ability_Id.dragon_knight_dragon_tail: return `Deal ${a.damage} and stun chosen target`;
        case Ability_Id.dragon_knight_elder_dragon_form: return `Transform, gain additional attack range and splash attack`;
        case Ability_Id.dragon_knight_elder_dragon_form_attack: return `Elder dragon form attack`;
        case Ability_Id.lion_hex: return `Hex target enemy, silencing, disarming and slowing them by ${a.move_points_reduction} for ${a.duration} turns`;
        case Ability_Id.lion_impale: return `Deal ${a.damage} and stun targets in a line`;
        case Ability_Id.lion_finger_of_death: return `Deal ${a.damage} damage to target`;
        case Ability_Id.mirana_starfall: return `Deal ${a.damage} damage to targets. One target takes additional ${a.damage} damage`;
        case Ability_Id.mirana_arrow: return `Stun target`;
        case Ability_Id.mirana_leap: return `Leap to a point`;
        case Ability_Id.venge_magic_missile: return `Deal ${a.damage} to a target and stun it`;
        case Ability_Id.venge_wave_of_terror: return `Deal ${a.damage} to all targets and reduce their armor by ${a.armor_reduction} for ${a.duration} turns`;
        case Ability_Id.venge_nether_swap: return `Swap places with target`;
        case Ability_Id.dark_seer_ion_shell: return `Apply a shield which deals ${a.damage_per_turn} damage per turn to the targets around the carrier for ${a.duration} turns`;
        case Ability_Id.dark_seer_surge: return `Give target ${a.move_points_bonus} move points for their turn`;
        case Ability_Id.dark_seer_vacuum: return `Pull all targets in the area towards point`;
        case Ability_Id.ember_searing_chains: return `Root ${a.targets} random targets in the area. Prioritizes enemies`;
        case Ability_Id.ember_sleight_of_fist: return `Attack all targets around`;
        case Ability_Id.ember_fire_remnant: return `Launch a fire remnant to the target location. Reactivate to move to that remnant`;
        case Ability_Id.ember_activate_fire_remnant: return `Instantly move to the fire remnant location`;
        case Ability_Id.shaker_fissure: return `Stun targets in the line, pushing them to the sides and blocking path until the end of next turn`;
        case Ability_Id.shaker_enchant_totem: return `Stun targets around until the end of next turn, gain double damage for the next attack`;
        case Ability_Id.shaker_enchant_totem_attack: return `Basic attack`;
        case Ability_Id.shaker_echo_slam: {
            const targets = query_units_for_no_target_ability(battle, caster, a.selector).length;
            return `Deal damage equal to number of units in the area (<font color="#ddd">${targets + 1}</font>) to targets in the area`;
        }

        case Ability_Id.venomancer_plague_wards: return `Plant a plague ward which attacks enemies at the end of each turn. Plague wards deal double damage to rooted and slowed targets`;
        case Ability_Id.venomancer_venomous_gale: return `Slow all units in the line by ${a.slow} points and apply ${a.poison_applied} poison to them`;
        case Ability_Id.venomancer_poison_nova: return `Paralyze all units in the area, rooting and disarming them`;

        // @AbilityTooltip
        case Ability_Id.bounty_hunter_shadow_walk: return assemble_modifier_tooltip_strings(a.modifier).join("<br/>");
        case Ability_Id.bounty_hunter_track: return "Target enemy receives<br/>" + assemble_modifier_tooltip_strings(a.modifier).join("<br/>");

        // @AbilityTooltip
        case Ability_Id.bounty_hunter_jinada: return `Replace basic attack with Jinada`;
        case Ability_Id.bounty_hunter_jinada_attack: return `Attack applies: <br/>${assemble_modifier_tooltip_strings(a.modifier).join("<br/>")}`;

        // TODO these are not visible right now, but might be later
        case Ability_Id.pocket_tower_attack: return "";
        case Ability_Id.plague_ward_attack: return "";
        case Ability_Id.deployment_zone: return "";
        case Ability_Id.monster_lifesteal: return "";
        case Ability_Id.monster_spawn_spiderlings: return "";
    }
}

function get_modifier_icon(applied: Applied_Modifier): string {
    function maybe_from_modifier_id() {
        switch (applied.modifier.id) {
            case Modifier_Id.spell_euls_scepter: return "items/cyclone";
            case Modifier_Id.spell_buckler: return "items/buckler";
            case Modifier_Id.spell_drums_of_endurance: return "items/ancient_janggo";
            case Modifier_Id.spell_moonlight_shadow: return "spellicons/mirana_invis";

            case Modifier_Id.rune_double_damage: return "spellicons/rune_doubledamage";
            case Modifier_Id.rune_haste: return "spellicons/rune_haste";

            case Modifier_Id.returned_to_hand: return "items/tpscroll";
        }
    }

    const maybe_icon = maybe_from_modifier_id();

    if (maybe_icon) {
        return `file://{images}/${maybe_icon}.png`
    }

    if (applied.source.type == Source_Type.item) {
        return get_item_icon(applied.source.item_id);
    }

    if (applied.source.type == Source_Type.unit) {
        return get_full_ability_icon_path(applied.source.ability_id);
    }

    if (applied.source.type == Source_Type.adventure_item) {
        return get_adventure_item_icon_by_id(applied.source.item_id);
    }

    if (applied.source.type == Source_Type.modifier) {
        return get_modifier_icon(applied.source.applied);
    }

    return "";
}

function get_full_ability_icon_path(id: Ability_Id): string {

    function get_ability_icon(ability_id: Ability_Id): string {
        switch (ability_id) {
            case Ability_Id.basic_attack: return "juggernaut_blade_dance";
            case Ability_Id.pudge_hook: return "pudge_meat_hook";
            case Ability_Id.pudge_rot: return "pudge_rot";
            case Ability_Id.pudge_dismember: return "pudge_dismember";
            case Ability_Id.tide_gush: return "tidehunter_gush";
            case Ability_Id.tide_anchor_smash: return "tidehunter_anchor_smash";
            case Ability_Id.tide_ravage: return "tidehunter_ravage";
            case Ability_Id.luna_lucent_beam: return "luna_lucent_beam";
            case Ability_Id.luna_moon_glaive: return "luna_moon_glaive";
            case Ability_Id.luna_eclipse: return "luna_eclipse";
            case Ability_Id.skywrath_concussive_shot: return "skywrath_mage_concussive_shot";
            case Ability_Id.skywrath_ancient_seal: return "skywrath_mage_ancient_seal";
            case Ability_Id.skywrath_mystic_flare: return "skywrath_mage_mystic_flare";
            case Ability_Id.dragon_knight_breathe_fire: return "dragon_knight_breathe_fire";
            case Ability_Id.dragon_knight_dragon_tail: return "dragon_knight_dragon_tail";
            case Ability_Id.dragon_knight_elder_dragon_form: return "dragon_knight_elder_dragon_form";
            case Ability_Id.dragon_knight_elder_dragon_form_attack: return "dragon_knight_elder_dragon_form";
            case Ability_Id.lion_hex: return "lion_voodoo";
            case Ability_Id.lion_impale: return "lion_impale";
            case Ability_Id.lion_finger_of_death: return "lion_finger_of_death";
            case Ability_Id.mirana_starfall: return "mirana_starfall";
            case Ability_Id.mirana_arrow: return "mirana_arrow";
            case Ability_Id.mirana_leap: return "mirana_leap";
            case Ability_Id.venge_magic_missile: return "vengefulspirit_magic_missile";
            case Ability_Id.venge_wave_of_terror: return "vengefulspirit_wave_of_terror";
            case Ability_Id.venge_nether_swap: return "vengefulspirit_nether_swap";
            case Ability_Id.dark_seer_ion_shell: return "dark_seer_ion_shell";
            case Ability_Id.dark_seer_surge: return "dark_seer_surge";
            case Ability_Id.dark_seer_vacuum: return "dark_seer_vacuum";
            case Ability_Id.ember_searing_chains: return "ember_spirit_searing_chains";
            case Ability_Id.ember_sleight_of_fist: return "ember_spirit_sleight_of_fist";
            case Ability_Id.ember_fire_remnant: return "ember_spirit_fire_remnant";
            case Ability_Id.ember_activate_fire_remnant: return "ember_spirit_activate_fire_remnant";
            case Ability_Id.shaker_fissure: return "earthshaker_fissure";
            case Ability_Id.shaker_enchant_totem: return "earthshaker_enchant_totem";
            case Ability_Id.shaker_enchant_totem_attack: return "earthshaker_enchant_totem";
            case Ability_Id.shaker_echo_slam: return "earthshaker_echo_slam";
            case Ability_Id.venomancer_plague_wards: return "venomancer_plague_ward";
            case Ability_Id.plague_ward_attack: return "venomancer_plague_ward";
            case Ability_Id.venomancer_venomous_gale: return "venomancer_venomous_gale";
            case Ability_Id.venomancer_poison_nova: return "venomancer_poison_nova";
            case Ability_Id.bounty_hunter_shadow_walk: return "bounty_hunter_wind_walk";
            case Ability_Id.bounty_hunter_jinada: return "bounty_hunter_jinada";
            case Ability_Id.bounty_hunter_jinada_attack: return "bounty_hunter_jinada";
            case Ability_Id.bounty_hunter_track: return "bounty_hunter_track";

            case Ability_Id.monster_spawn_spiderlings: return "broodmother_spawn_spiderlings";
            case Ability_Id.pocket_tower_attack: return "tiny_toss";
            case Ability_Id.monster_lifesteal: return "life_stealer_feast";
            case Ability_Id.deployment_zone: return "kunkka_x_marks_the_spot";
        }
    }

    return `file://{images}/spellicons/${get_ability_icon(id)}.png`;
}

function modifier_source_to_name(id: Modifier_Id, source: Source): string {
    switch (source.type) {
        case Source_Type.adventure_item: return get_adventure_item_name_by_id(source.item_id);
        case Source_Type.item: return get_item_name(source.item_id);
        case Source_Type.modifier: return modifier_source_to_name(id, source.applied.source);
        case Source_Type.unit: return get_ability_name(source.ability_id);

        default: return snake_case_to_capitalized_words(enum_to_string(id));
    }
}

function create_level_bar(parent: Panel, id: string): Level_Bar {
    const panel = $.CreatePanel("Panel", parent, id);
    panel.AddClass("level_bar");

    const level_bar: Level_Bar = {
        pips: []
    };

    for (let index = 0; index < Const.max_unit_level; index++) {
        const pip = $.CreatePanel("Panel", panel, "");
        pip.AddClass("level_pip");
        level_bar.pips.push(pip);
    }

    return level_bar;
}

function update_level_bar(level_bar: Level_Bar, level: number) {
    level_bar.pips.forEach((tick, index) => {
        tick.SetHasClass("active", index < level);
    });
}

function sync_ability_buttons_with_abilities(row: Unit_Row, hero: Unit) {
    function create_hero_ability_button(ability: Ability): Unit_Ability_Button {
        const ability_panel = $.CreatePanel("Button", row.ability_buttons_panel, "");
        ability_panel.AddClass("ability_button");

        const ability_image = $.CreatePanel("Panel", ability_panel, "ability_image");
        safely_set_panel_background_image(ability_image, get_full_ability_icon_path(ability.id));

        const charges_label = $.CreatePanel("Label", ability_panel, "charges");
        charges_label.hittest = false;

        const overlay = $.CreatePanel("Panel", ability_panel, "overlay");

        return {
            ability: ability.id,
            ability_panel: ability_panel,
            ability_image: ability_image,
            charges_label: charges_label,
            overlay: overlay
        };
    }

    const abilities = hero.abilities.filter(ability => ability != hero.attack);

    for (let index = 0; index < abilities.length; index++) {
        const ability = abilities[index];

        if (index >= row.ability_buttons.length) {
            const button = create_hero_ability_button(ability);
            update_ability_button_ui(button, hero, ability);

            row.ability_buttons.push(button);
        } else {
            const button = row.ability_buttons[index];

            if (button.ability != ability.id) {
                update_ability_button_ui(button, hero, ability);

                button.ability = ability.id;
            }
        }
    }

    const remaining_buttons = row.ability_buttons.splice(abilities.length);

    for (const button of remaining_buttons) {
        button.ability_panel.DeleteAsync(0);
    }
}

function update_ability_button_ui(button: Unit_Ability_Button, hero: Unit, ability: Ability) {
    const ability_panel = button.ability_panel;

    ability_panel.SetPanelEvent(PanelEvent.ON_LEFT_CLICK, () => {
        const entity_data = find_unit_entity_data_by_unit_id(battle, hero.id);

        if (entity_data) {
            const [ id ] = entity_data;

            select_unit(id);
            try_select_unit_ability(hero, ability);
        }
    });

    ability_panel.SetPanelEvent(PanelEvent.ON_MOUSE_OVER, () => {
        if (!hero.dead) {
            hover = {
                type: Hover_Type.ability,
                unit: hero,
                ability: ability
            };

            update_grid_visuals();
        }

        $.DispatchEvent("DOTAShowTextTooltip", ability_panel, get_ability_tooltip(hero, ability));
    });

    ability_panel.SetPanelEvent(PanelEvent.ON_MOUSE_OUT, () => {
        if (hover.type == Hover_Type.ability && hover.ability == ability) {
            hover = { type: Hover_Type.none };

            update_grid_visuals();
        }

        $.DispatchEvent("DOTAHideTextTooltip");
    });

    safely_set_panel_background_image(button.ability_image, get_full_ability_icon_path(ability.id));
}

function add_spawned_unit_to_control_panel(unit: Unit) {
    function create_indicator(parent: Panel, id: string, value: number): LabelPanel {
        const indicator = $.CreatePanel("Panel", parent, id);
        const label = $.CreatePanel("Label", indicator, "");

        indicator.AddClass("indicator");
        label.text = value.toString();

        return label;
    }

    const unit_row = $.CreatePanel("Panel", control_panel.panel, "");
    unit_row.AddClass("unit_row");
    unit_row.SetPanelEvent(PanelEvent.ON_LEFT_CLICK, () => {
        const entity_id_and_unit_ui = find_unit_entity_data_by_unit_id(battle, unit.id);

        if (entity_id_and_unit_ui) {
            const already_selected = selection.type == Selection_Type.unit && selection.unit.id == unit.id;

            Game.EmitSound("click_simple");
            select_unit(entity_id_and_unit_ui[0], already_selected);
            update_grid_visuals();
        }
    });

    const death_overlay = $.CreatePanel("Panel", unit_row, "death_overlay");
    death_overlay.hittest = false;

    const content_container = $.CreatePanel("Panel", unit_row, "container");

    const main_content = $.CreatePanel("Panel", content_container, "main_content");
    const modifier_bar = $.CreatePanel("Panel", content_container, "modifier_bar");
    const arrow_left = $.CreatePanel("Panel", modifier_bar, "arrow_left");
    const arrow_right = $.CreatePanel("Panel", modifier_bar, "arrow_right");

    const portrait = $.CreatePanel("Panel", main_content, "portrait");
    const abilities = $.CreatePanel("Panel", main_content, "ability_row");

    if (unit.supertype == Unit_Supertype.hero) {
        safely_set_panel_background_image(portrait, get_full_hero_icon_path(unit.type));
    }

    const indicators = $.CreatePanel("Panel", portrait, "indicators");
    const health = create_indicator(indicators, "health_indicator", unit.health);
    const level = create_level_bar(indicators, "level_indicator");
    const new_row: Unit_Row = {
        panel: unit_row,
        unit_id: unit.id,
        ability_buttons_panel: abilities,
        ability_buttons: [],
        modifier_cursor: 0,
        modifier_bar: {
            root: modifier_bar,
            arrow_left: arrow_left,
            arrow_right: arrow_right
        },
        modifier_panels: [],
        health_label: health,
        level_bar: level
    };

    sync_ability_buttons_with_abilities(new_row, unit);

    control_panel.unit_rows.push(new_row);
}

function update_end_turn_button() {
    const player_act_permission = authorize_action_by_player(battle, battle.this_player);
    end_turn_button.SetHasClass("cant_end_turn", !player_act_permission.ok);
}

function update_hero_control_panel_state(row: Unit_Row, hero: Hero) {
    row.panel.SetHasClass("dead", hero.dead);
    row.health_label.text = hero.health.toString();

    update_level_bar(row.level_bar, hero.level);
    sync_ability_buttons_with_abilities(row, hero);

    for (const ability_button of row.ability_buttons) {
        const ability = find_unit_ability(hero, ability_button.ability);

        if (!ability) continue;
        if (ability.id == Ability_Id.basic_attack) continue;

        const is_available = hero.level >= ability.available_since_level;

        ability_button.ability_panel.SetHasClass("not_learned", !is_available);

        if (ability.type != Ability_Type.passive) {
            const not_enough_charges = ability.charges_remaining < 1;

            ability_button.ability_panel.SetHasClass("not_enough_charges", is_available && not_enough_charges);
            ability_button.charges_label.text = ability.charges_remaining.toString();
            ability_button.ability_panel.SetHasClass("silence", is_available && is_unit_silenced(hero));
        }
    }

    try_layout_modifiers();

    function try_layout_modifiers() {
        if (row.panel.actuallayoutwidth == 0) {
            $.Schedule(0, try_layout_modifiers);
        }

        type Remove_Flag<T> = {
            should_remove: boolean
            data: T
        }

        const existing_panels: Remove_Flag<Unit_Modifier_Panel>[] = row.modifier_panels.map(panel => ({
            should_remove: true,
            data: panel
        }));

        function show_modifier_tooltip(panel: Panel, applied: Applied_Modifier) {
            const root = modifier_tooltip;
            root.RemoveAndDeleteChildren();

            const { section, header, text } = create_and_show_titled_effect_tooltip(
                root,
                panel,
                get_modifier_icon(applied),
                modifier_source_to_name(applied.modifier.id, applied.source)
            );

            const main = section();
            header(main, "Effects");

            const strings = assemble_modifier_tooltip_strings(applied.modifier);

            for (const string of strings) {
                text(main, string);
            }
        }

        const one_modifier = 28;
        const max_width = to_layout_space(row.panel.actuallayoutwidth);
        const updated_panels: Unit_Modifier_Panel[] = [];
        const modifiers_visible = Math.floor(max_width / one_modifier);

        row.modifier_bar.arrow_left.SetHasClass("hidden", row.modifier_cursor == 0);
        row.modifier_bar.arrow_right.SetHasClass("hidden", row.modifier_cursor + modifiers_visible >= hero.modifiers.length);

        row.modifier_bar.arrow_left.SetPanelEvent(PanelEvent.ON_LEFT_CLICK, () => {
            row.modifier_cursor = Math.max(0, row.modifier_cursor - modifiers_visible + 2);
            update_hero_control_panel_state(row, hero);
        });

        row.modifier_bar.arrow_right.SetPanelEvent(PanelEvent.ON_LEFT_CLICK, () => {
            row.modifier_cursor += modifiers_visible - 2;
            update_hero_control_panel_state(row, hero);
        });

        for (const applied of hero.modifiers) {
            const existing = existing_panels.find(ui => ui.data.modifier_handle_id == applied.handle_id);

            if (existing) {
                existing.should_remove = false;

                updated_panels.unshift(existing.data);
            } else {
                const panel = $.CreatePanel("Image", row.modifier_bar.root, "");
                panel.AddClass("modifier");
                panel.SetImage(get_modifier_icon(applied));
                panel.SetScaling(ScalingFunction.STRETCH_TO_FIT_Y_PRESERVE_ASPECT);
                panel.SetPanelEvent(PanelEvent.ON_MOUSE_OVER, () => show_modifier_tooltip(panel, applied));
                panel.SetPanelEvent(PanelEvent.ON_MOUSE_OUT, () => {
                    modifier_tooltip.style.opacity = "0";
                });

                updated_panels.unshift({
                    panel: panel,
                    modifier_handle_id: applied.handle_id
                });
            }
        }

        for (const existing of existing_panels) {
            if (existing.should_remove) {
                existing.data.panel.AddClass("being_removed");
                existing.data.panel.DeleteAsync(1);
            }
        }

        let x = -row.modifier_cursor * one_modifier;

        for (const ui of updated_panels) {
            ui.panel.style.x = x + "px";

            x += one_modifier;
        }

        row.modifier_panels = updated_panels;
    }
}

function deselect_ability(selection: Ability_Selection) {
    select_unit(selection.unit_entity);

    update_grid_visuals();
}

function select_unit_ability(unit: Unit, ability: Ability_Ground_Target | Ability_Unit_Target) {
    if (selection.type == Selection_Type.ability) {
        if (selection.unit == unit && selection.ability.id == ability.id) {
            return;
        }
    }

    const entity_data = find_unit_entity_data_by_unit_id(battle, unit.id);
    if (!entity_data) return;

    if (unit.supertype == Unit_Supertype.hero) {
        safely_set_panel_background_image(current_targeted_ability_ui.FindChild("hero"), get_full_hero_icon_path(unit.type));
    } else {
        safely_set_panel_background_image(current_targeted_ability_ui.FindChild("hero"), "");
    }

    safely_set_panel_background_image(current_targeted_ability_ui.FindChild("image"), get_full_ability_icon_path(ability.id));

    set_selection({
        type: Selection_Type.ability,
        unit: unit,
        unit_entity: entity_data[0],
        ability: ability
    });

    update_grid_visuals();
}

function before_unit_selection_change() {
    if (is_unit_selection(selection)) {
        const unit_data = battle.entity_id_to_unit_data[selection.unit_entity];

        if (unit_data) {
            unit_data.stat_bar_panel.RemoveClass("show_additional_stats");
            unit_data.stat_bar_panel.RemoveClass("show_full_stats");
        }

        if (selection.type == Selection_Type.shop) {
            const shop_id = battle.entity_id_to_shop_id[selection.shop_entity];
            const shop_ui = ui_shop_data.find(shop => shop.id == shop_id);

            if (shop_ui) {
                shop_ui.root_container.RemoveClass("open");
            }

            destroy_fx(selection.arrow_particle);
        }
    }
}


function drop_selection() {
    before_unit_selection_change();

    if (selection.type == Selection_Type.shop) {
        set_selection({
            type: Selection_Type.unit,
            unit: selection.unit,
            unit_entity: selection.unit_entity
        });
    } else {
        set_selection({
            type: Selection_Type.none
        });
    }
}

function shop_particle(new_entity_id: EntityId) {
    const fx = Particles.CreateParticle("particles/shop_arrow.vpcf", ParticleAttachment_t.PATTACH_OVERHEAD_FOLLOW, new_entity_id);
    register_particle_for_reload(fx);
    return fx;
}

function select_unit(new_entity_id: EntityId, full_stats = false) {
    before_unit_selection_change();

    const unit_data = battle.entity_id_to_unit_data[new_entity_id];
    if (!unit_data) return;

    const unit = find_unit_by_id(battle, unit_data.id);
    if (!unit) return;

    set_selection({
        type: Selection_Type.unit,
        unit: unit,
        unit_entity: new_entity_id
    });

    unit_data.stat_bar_panel.AddClass("show_additional_stats");
    unit_data.stat_bar_panel.SetHasClass("show_full_stats", full_stats);
}

function select_shop(new_entity_id: EntityId) {
    before_unit_selection_change();

    const shop_id = battle.entity_id_to_shop_id[new_entity_id];
    const shop_ui = ui_shop_data.find(shop => shop.id == shop_id);
    if (!shop_ui) return;

    const shop = find_shop_by_id(battle, shop_ui.id);
    if (!shop) return;

    if (is_unit_selection(selection)) {
        shop_ui.root_container.AddClass("open");
        Game.EmitSound("Shop.Available");

        set_selection({
            type: Selection_Type.shop,
            unit: selection.unit,
            unit_entity: selection.unit_entity,
            shop: shop,
            shop_entity: new_entity_id,
            arrow_particle: shop_particle(selection.unit_entity)
        });
    } else {
        const ally_units_in_shop_range = battle.units
            .filter(unit => {
                    const player_act_permission: Player_Action_Permission = {
                        ok: true,
                        battle: battle,
                        player: battle.this_player
                    };

                    const act_on_unit_permission = authorize_act_on_known_unit(battle, unit);
                    if (!act_on_unit_permission.ok) return false;

                    const act_on_owned_unit_permission = authorize_act_on_owned_unit(player_act_permission, act_on_unit_permission);
                    if (!act_on_owned_unit_permission.ok) return false;

                    const use_shop_permission = authorize_shop_use(act_on_owned_unit_permission, shop.id);
                    return use_shop_permission.ok;
                }
            );

        if (ally_units_in_shop_range.length == 0) {
            show_generic_error("No heroes in shop range");

            return;
        }

        const new_customer = ally_units_in_shop_range[0];
        const new_customer_data = find_unit_entity_data_by_unit_id(battle, new_customer.id);

        if (new_customer_data) {
            shop_ui.root_container.AddClass("open");

            Game.EmitSound("Shop.Available");

            set_selection({
                type: Selection_Type.shop,
                unit: new_customer,
                unit_entity: new_customer_data[0],
                shop: shop,
                shop_entity: new_entity_id,
                arrow_particle: shop_particle(new_customer_data[0])
            });
        }
    }
}

function update_current_ability_based_on_cursor_state() {
    const click_behaviors = GameUI.GetClickBehaviors();

    if (is_unit_selection(selection) && click_behaviors == CLICK_BEHAVIORS.DOTA_CLICK_BEHAVIOR_ATTACK && selection.unit.attack) {
        if (selection.unit.attack.type != Ability_Type.no_target) {
            select_unit_ability(selection.unit, selection.unit.attack);
        }

        return;
    }

    if (selection.type == Selection_Type.ability && selection.unit.attack && selection.ability.id == selection.unit.attack.id) {
        deselect_ability(selection);
        return;
    }
}

function try_update_stat_bar_display(ui_data: UI_Unit_Data, force = false) {
    const try_update_stat_indicator = function (stat_indicator: Stat_Indicator) {
        if (force) {
            stat_indicator.label.text = stat_indicator.displayed_value.toString();
        } else {
            const value = stat_indicator.value_provider(ui_data.stats);

            if (value != stat_indicator.displayed_value) {
                const direction = Math.sign(value - stat_indicator.displayed_value);

                stat_indicator.displayed_value += direction;
                stat_indicator.label.text = stat_indicator.displayed_value.toString();
            }
        }
    };

    try_update_stat_indicator(ui_data.stat_armor);
    try_update_stat_indicator(ui_data.stat_attack);
    try_update_stat_indicator(ui_data.stat_health);
    try_update_stat_indicator(ui_data.stat_max_health);
    try_update_stat_indicator(ui_data.stat_move_points);
    try_update_stat_indicator(ui_data.stat_max_move_points);

    ui_data.stat_bar_panel.SetHasClass("dead", ui_data.stat_health.displayed_value == 0);
    ui_data.modifier_bar.SetHasClass("dead", ui_data.stat_health.displayed_value == 0);
}

function position_panel_over_entity_in_the_world(panel: Panel, entity_id: EntityId, offset_x: number, offset_z: number) {
    const entity_origin = Entities.GetAbsOrigin(entity_id);
    if (!entity_origin) return;

    position_panel_over_position_in_the_world(panel, xyz(entity_origin[0] + offset_x, entity_origin[1], entity_origin[2] + offset_z), Align_H.center, Align_V.bottom);
}

function update_stat_bar_positions() {
    // TODO with the fixed camera we can have the luxury of updating only when units actually move
    for (const entity_id_string in battle.entity_id_to_unit_data) {
        const entity_id = Number(entity_id_string); // TODO holy shit why javascript, why
        const unit_data = battle.entity_id_to_unit_data[entity_id_string];

        position_panel_over_entity_in_the_world(unit_data.modifier_bar, entity_id, 30, 120);
        position_panel_over_entity_in_the_world(unit_data.stat_bar_panel, entity_id, 30, -40);
    }
}

function queue_popup(unit: Unit_Id, popup: Popup_Data) {
    let new_time = Game.Time();

    for (const popup of popup_queue) {
        if (popup.unit_id == unit) {
            new_time = Math.max(popup.scheduled_at + popup_time_offset, new_time);
        }
    }

    popup_queue.push({
        unit_id: unit,
        scheduled_at: new_time,
        launched: false,
        ...popup
    });

    update_popup_queue();
}

function try_launch_popup(popup: Popup) {
    const unit_data = find_unit_entity_data_by_unit_id(battle, popup.unit_id);
    if (!unit_data) return;

    const [entity_id] = unit_data;

    switch (popup.type) {
        case Popup_Type.health_change: {
            show_health_change_popup(entity_id, popup.change, popup.blocked_by_armor);
            break;
        }

        case Popup_Type.ability_use: {
            show_title_icon_popup(entity_id, get_ability_name(popup.ability_id), get_full_ability_icon_path(popup.ability_id));
            break;
        }

        case Popup_Type.adventure_item_effect: {
            show_title_icon_popup(entity_id, get_adventure_item_name_by_id(popup.item_id), get_adventure_item_icon_by_id(popup.item_id));
            break;
        }

        case Popup_Type.modifier_effect: {
            const applied = battle.modifier_handle_id_to_modifier[popup.modifier_handle_id];
            if (!applied) break;

            show_title_icon_popup(entity_id, modifier_source_to_name(applied.modifier.id, applied.source), get_modifier_icon(applied));

            break;
        }

        default: unreachable(popup);
    }
}

function update_popup_queue() {
    const now = Game.Time();

    for (let index = popup_queue.length - 1; index >= 0; index--) {
        const popup = popup_queue[index];

        if (now >= popup.scheduled_at) {
            if (!popup.launched) {
                try_launch_popup(popup);
                popup.launched = true;
            } else if (now >= popup.scheduled_at + popup_time_offset) {
                popup_queue.splice(index, 1);
            }
        }
    }
}

function periodically_update_ui() {
    $.Schedule(0, periodically_update_ui);

    if (current_state != Player_State.in_battle) return;

    update_stat_bar_positions();

    if (battle.state.status == Battle_Status.finished) return;

    update_current_ability_based_on_cursor_state();
    update_hovered_cell();
    update_hand();
    update_popup_queue();

    for (const shop_data of ui_shop_data) {
        for (const entity_id_string in battle.entity_id_to_shop_id) {
            const entity_id = Number(entity_id_string);
            const shop_id = battle.entity_id_to_shop_id[entity_id_string];

            if (shop_id == shop_data.id) {
                position_panel_over_entity_in_the_world(shop_data.root_container, entity_id, 0, 250);

                break;
            }
        }
    }

    if (is_unit_selection(selection)) {
        const data = find_unit_entity_data_by_unit_id(battle, selection.unit.id);

        if (data && data[1].hidden) {
            drop_selection();
        }
    }

    if (selection.type == Selection_Type.ability) {
        const [ cursor_x, cursor_y ] = GameUI.GetCursorPosition();
        const { x, y } = current_targeted_ability_ui.GetPositionWithinWindow();
        const width = current_targeted_ability_ui.actuallayoutwidth;
        const height = current_targeted_ability_ui.actuallayoutheight;

        const cursor_in_bounds = (cursor_x >= x && cursor_y >= y && cursor_x <= x + width && cursor_y <= y + height);

        current_targeted_ability_ui.SetHasClass("under_cursor", cursor_in_bounds);
    }
}

function periodically_update_stat_bar_display() {
    $.Schedule(0.05, periodically_update_stat_bar_display);

    if (current_state != Player_State.in_battle) return;

    for (const id in battle.entity_id_to_unit_data) {
        try_update_stat_bar_display(battle.entity_id_to_unit_data[id]);
    }

    const this_player_ui_data = ui_player_data.find(player => player.id == battle.this_player.id);

    if (this_player_ui_data) {
        for (const shop_data of ui_shop_data) {
            const actual_gold = this_player_ui_data.gold;

            if (actual_gold != shop_data.displayed_gold) {
                const direction = Math.sign(actual_gold - shop_data.displayed_gold);

                shop_data.displayed_gold += direction;
                shop_data.gold_text.text = shop_data.displayed_gold.toString();
            }
        }
    }
}

export function battle_filter_mouse_click(event: MouseEvent, button: MouseButton | WheelScroll): boolean {
    function valid_unit_at(at: XY) {
        return battle.units.find(unit => xy_equal(at, unit.position) && authorize_act_on_known_unit(battle, unit).ok);
    }

    if (event == "pressed" || event == "doublepressed") {
        if (battle.state.status == Battle_Status.finished) return true;

        const click_behaviors = GameUI.GetClickBehaviors();
        const cursor = GameUI.GetCursorPosition();
        const world_position = get_screen_world_position(cursor);
        if (!world_position) return true;

        const battle_position = world_position_to_battle_position(battle.grid.world_origin, world_position);
        const cursor_entity = get_entity_under_cursor(cursor);
        const cursor_entity_unit = find_unit_by_entity_id(battle, cursor_entity);
        const cursor_entity_shop = find_shop_by_entity_id(battle, cursor_entity);

        if (button == MouseButton.LEFT && selection.type == Selection_Type.none && cursor_entity == null) {
            const particle = Particles.CreateParticle("particles/ui/ground_click.vpcf", ParticleAttachment_t.PATTACH_WORLDORIGIN, 0);
            Particles.SetParticleControl(particle, 0, xyz_to_array(world_position));
            Particles.ReleaseParticleIndex(particle);
        }

        if (selection.type == Selection_Type.ability) {
            const wants_to_use_ability = button == MouseButton.LEFT;
            const wants_to_cancel = button == MouseButton.RIGHT;

            if (wants_to_cancel) {
                deselect_ability(selection);

                if (click_behaviors != CLICK_BEHAVIORS.DOTA_CLICK_BEHAVIOR_NONE) {
                    return false;
                }
            } else if (wants_to_use_ability) {
                const success = (() => {
                    switch (selection.ability.type) {
                        case Ability_Type.target_ground: return try_use_ground_target_ability(selection.unit, selection.ability, battle_position);
                        case Ability_Type.target_unit: return try_use_unit_targeted_ability(selection.unit, selection.ability, cursor_entity_unit);
                    }
                })();

                if (success) {
                    deselect_ability(selection);
                } else {
                    return true;
                }
            }

            return true;
        }

        const wants_to_cancel_current_behavior =
            button == MouseButton.RIGHT &&
            click_behaviors != CLICK_BEHAVIORS.DOTA_CLICK_BEHAVIOR_NONE;

        if (wants_to_cancel_current_behavior) {
            return false;
        }

        const wants_to_select_entity =
            button == MouseButton.LEFT &&
            click_behaviors == CLICK_BEHAVIORS.DOTA_CLICK_BEHAVIOR_NONE;

        if (wants_to_select_entity) {
            if (cursor_entity) {
                if (cursor_entity_unit) {
                    select_unit(cursor_entity, event == "doublepressed");

                    const particle = Particles.CreateParticle("particles/ui_mouseactions/select_unit.vpcf", ParticleAttachment_t.PATTACH_ABSORIGIN_FOLLOW, cursor_entity);

                    Particles.SetParticleControl(particle, 1, [255, 255, 255]);
                    Particles.SetParticleControl(particle, 2, [64, 255, 0]);
                    Particles.ReleaseParticleIndex(particle);

                    Game.EmitSound("click_simple");
                }

                if (cursor_entity_shop) {
                    select_shop(cursor_entity);

                    Game.EmitSound("click_simple");
                }
            } else {
                drop_selection();
            }

            update_grid_visuals();

            return true;
        }

        if (selection.type == Selection_Type.unit) {
            const wants_to_perform_automatic_action =
                button == MouseButton.RIGHT &&
                click_behaviors == CLICK_BEHAVIORS.DOTA_CLICK_BEHAVIOR_NONE;

            const wants_to_move_unconditionally =
                button == MouseButton.LEFT &&
                click_behaviors == CLICK_BEHAVIORS.DOTA_CLICK_BEHAVIOR_MOVE;

            if (wants_to_perform_automatic_action) {
                const unit_at_cursor_position = valid_unit_at(battle_position);
                const rune_at_cursor_position = rune_at(battle, battle_position);

                if (unit_at_cursor_position) {
                    if (unit_at_cursor_position != selection.unit) {
                        if (selection.unit.attack) {
                            switch (selection.unit.attack.type) {
                                case Ability_Type.target_ground: { try_use_ground_target_ability(selection.unit, selection.unit.attack, battle_position, true); break; }
                                case Ability_Type.target_unit: { try_use_unit_targeted_ability(selection.unit, selection.unit.attack, cursor_entity_unit, true); break; }
                                case Ability_Type.no_target: { try_use_no_target_ability(selection.unit, selection.unit.attack); break; }
                                default: unreachable(selection.unit.attack);
                            }
                        } else {
                            show_error_ui(custom_error("Can't attack"));
                        }
                    }
                } else if (rune_at_cursor_position) {
                    try_order_unit_to_pick_up_rune(selection.unit, rune_at_cursor_position);
                    move_order_particle(world_position);
                } else {
                    try_order_unit_to_move(selection.unit, battle_position);
                    move_order_particle(world_position);
                }
            } else if (wants_to_move_unconditionally) {
                try_order_unit_to_move(selection.unit, battle_position);
                move_order_particle(world_position);
            }
        }
    }

    return true;
}

function create_card_ui(root: Panel, card: Card) {
    const container = create_card_container_ui(root, false, card.type);
    container.style.position = `${Const.hand_base_x - 400}px ${Const.hand_base_y}px 0`;
    container.AddClass("smooth_position_change");

    switch (card.type) {
        case Card_Type.hero: {
            const definition = hero_definition_by_type(card.hero_type);

            create_hero_card_ui_base(container, card.hero_type, definition.health, definition.attack_damage, definition.move_points);

            break;
        }

        case Card_Type.existing_hero: {
            const unit = find_hero_by_id(battle, card.hero_id);

            if (unit) {
                create_hero_card_ui_base(container, unit.type, unit.base.max_health, unit.base.attack_damage, unit.base.max_move_points);
            }

            break;
        }

        case Card_Type.spell: {
            create_spell_card_ui_base(container, card.spell_id, get_spell_text(card));

            break;
        }

        case Card_Type.unknown: {
            break;
        }

        default: unreachable(card);
    }

    return container;
}

function create_card_panel(card: Card): Card_Panel {
    const ui = create_card_ui($("#hand_ui"), card);
    const card_panel: Card_Panel = {
        panel: ui,
        card: card,
        hovered: false
    };

    ui.SetPanelEvent(PanelEvent.ON_MOUSE_OVER, () => {
        card_panel.hovered = true;
    });

    ui.SetPanelEvent(PanelEvent.ON_MOUSE_OUT, () => {
        card_panel.hovered = false;
    });

    return card_panel;
}

function get_hovered_battle_position(): XY | undefined {
    if (is_overlay_unit_selection(selection)) {
        return;
    }

    for (const shop of ui_shop_data) {
        if (shop.root_container.BHasHoverStyle()) {
            return;
        }
    }

    if (control_panel.panel.BHasHoverStyle()) {
        return;
    }

    const cursor = GameUI.GetCursorPosition();

    if (!is_unit_selection(selection)) {
        const cursor_entity = get_entity_under_cursor(cursor);
        const cursor_entity_unit = find_unit_by_entity_id(battle, cursor_entity);

        if (cursor_entity_unit) {
            return cursor_entity_unit.position;
        }
    }

    const world_position = get_screen_world_position(cursor);

    if (!world_position) {
        return;
    }

    const battle_position = world_position_to_battle_position(battle.grid.world_origin, world_position);

    const is_position_valid = battle_position.x >= 0 && battle_position.x < battle.grid.size.x && battle_position.y >= 0 && battle_position.y < battle.grid.size.y;

    if (!is_position_valid) {
        return;
    }

    return battle_position;
}

function update_hovered_cell() {
    const battle_position = get_hovered_battle_position();

    if (battle_position) {
        if (hover.type == Hover_Type.cell) {
            if (!xy_equal(hover.cell, battle_position)) {
                hover.cell = battle_position;
                update_grid_visuals();
            }
        } else {
            hover = { type: Hover_Type.cell, cell: battle_position };
            update_grid_visuals();
        }
    } else if (hover.type == Hover_Type.cell) {
        hover = { type: Hover_Type.none };
        update_grid_visuals();
    }
}

function recreate_overlay_unit_selection(selection: Card_Selection) {
    const container = card_selection_overlay.FindChildTraverse("card_container");

    container.RemoveAndDeleteChildren();

    const action_permission = authorize_action_by_player(battle, battle.this_player);
    if (!action_permission.ok) return;

    const card_use_permission = authorize_card_use(action_permission, selection.card_panel.card.id);
    if (!card_use_permission.ok) return;

    const spell_use_permission = authorize_unit_target_spell_use(card_use_permission);
    if (!spell_use_permission.ok) return;

    for (const unit of battle.units) {
        const spell_use_on_unit_permission = authorize_known_unit_target_for_spell_card_use(spell_use_permission, unit);
        if (!spell_use_on_unit_permission.ok) continue;

        if (unit.supertype == Unit_Supertype.hero) {
            const card_panel = create_card_container_ui(container, true, Card_Type.hero);
            create_hero_card_ui_base(card_panel, unit.type, unit.base.max_health, unit.base.attack_damage, unit.base.max_move_points);

            if (spell_use_on_unit_permission.spell.spell_id == Spell_Id.buyback) {
                const cost_panel = $.CreatePanel("Panel", card_panel, "gold_cost");

                $.CreatePanel("Panel", cost_panel, "icon");
                $.CreatePanel("Label", cost_panel, "amount").text = get_buyback_cost(unit).toString();
            }

            card_panel.SetPanelEvent(PanelEvent.ON_MOUSE_OVER, () => {
                card_panel.SetHasClass("can_use", true);

                hover = { type: Hover_Type.unit, unit: unit };
            });

            card_panel.SetPanelEvent(PanelEvent.ON_MOUSE_OUT, () => {
                card_panel.SetHasClass("can_use", false);

                hover = { type: Hover_Type.none };
            });
        }
    }
}

function delete_card_panel_element(card_panel: Card_Panel) {
    card_panel.panel.RemoveClass("smooth_position_change");
    card_panel.panel.AddClass("disappearing_transition");
    card_panel.panel.AddClass("disappearing");
    card_panel.panel.DeleteAsync(0.4);
}

function try_delete_card_from_hand(card_id: Card_Id) {
    const index = hand.findIndex(existing => existing.card.id == card_id);
    if (index == -1) {
        return;
    }

    const card_panel = hand[index];

    if (selection.type == Selection_Type.card && selection.card_panel == card_panel) {
        drop_card_selection();
    }

    hand.splice(index, 1);

    delete_card_panel_element(card_panel);
}

function update_hand() {
    const cursor = GameUI.GetCursorPosition();
    const [ cursor_x, cursor_y ] = cursor;

    let index = 0;

    if (selection.type == Selection_Type.card && !GameUI.IsMouseDown(0)) {
        if (hover.type == Hover_Type.cell || hover.type == Hover_Type.unit) {
            const card = selection.card_panel.card;

            if (try_use_card(card, hover)) {
                try_delete_card_from_hand(card.id);
            }
        }

        drop_card_selection();
    }

    for (const card of hand) {
        const any_targets_available = (card_use_permission: Card_Use_Permission): boolean => {
            const card = card_use_permission.card;

            if (card.type == Card_Type.spell && card.spell_type == Spell_Type.unit_target) {
                const spell_use_permission = authorize_unit_target_spell_use(card_use_permission);
                if (!spell_use_permission.ok) return false;

                return battle.units.find(target => authorize_known_unit_target_for_spell_card_use(spell_use_permission, target).ok) != undefined;
            }

            return true;
        };

        const can_use_card = (() => {
            const action_permission = authorize_action_by_player(battle, battle.this_player);
            if (!action_permission.ok) return false;

            const card_use_permission = authorize_card_use(action_permission, card.card.id);
            if (!card_use_permission.ok) return false;

            return any_targets_available(card_use_permission);
        });

        card.panel.SetHasClass("can_use", can_use_card());

        if (selection.type == Selection_Type.card && card == selection.card_panel) {
            index++;
            continue;
        }

        const this_card_hovered = (selection.type != Selection_Type.card && card.hovered);
        const y = this_card_hovered ? Const.hand_base_y - 150 : Const.hand_base_y ;
        card.panel.style.position = `${Const.hand_base_x + index * 100 - (this_card_hovered ? 50 : 0)}px ${y}px 0`;

        if (selection.type != Selection_Type.card && GameUI.IsMouseDown(0) && card.panel.BHasHoverStyle()) {
            (() => {
                const rate_limit = (action: () => void) => {
                    if (card_error_shown_at < Game.Time() - 0.5) {
                        action();
                        card_error_shown_at = Game.Time();
                    }
                };

                const action_permission = authorize_action_by_player(battle, battle.this_player);
                if (!action_permission.ok) return rate_limit(() => show_player_action_error_ui(action_permission));

                const card_use_permission = authorize_card_use(action_permission, card.card.id);
                if (!card_use_permission.ok) return rate_limit(() => show_action_error_ui(card_use_permission, card_use_error_reason));

                if (!any_targets_available(card_use_permission)) return rate_limit(() => show_error_ui(custom_error("No valid targets")));

                set_selection({
                    type: Selection_Type.card,
                    previous_selection: selection,
                    card_panel: card,
                    targeting_fx: Particles.CreateParticle("particles/units/heroes/hero_puck/puck_dreamcoil_tether.vpcf", ParticleAttachment_t.PATTACH_CUSTOMORIGIN, 0)
                });

                card.panel.SetHasClass("in_preview", true);
            })();
        }

        index++;
    }

    if (selection.type == Selection_Type.card) {
        const panel = selection.card_panel.panel;

        const position = panel.GetPositionWithinWindow();
        const card_position = GameUI.GetScreenWorldPosition([position.x + panel.actuallayoutwidth / 2, position.y  + panel.actuallayoutheight / 2]);
        const cursor_world = GameUI.GetScreenWorldPosition([cursor_x, cursor_y]);

        if (card_position && cursor_world) {
            Particles.SetParticleControl(selection.targeting_fx, 0, cursor_world);
            Particles.SetParticleControl(selection.targeting_fx, 1, [card_position[0], card_position[1], card_position[2] + 100]);
        }

        panel.SetHasClass("targeting_something", hover.type == Hover_Type.cell);
    }
}

function highlight_grid_deployment_zone(player_id: Battle_Player_Id) {
    const player = find_player_by_id(battle, player_id);
    if (!player) return;

    const outline: boolean[] = [];

    for (const cell of battle.grid.cells) {
        const index = grid_cell_index(battle.grid, cell.position);

        if (is_point_in_deployment_zone(battle, cell.position, player)) {
            outline[index] = true;
        }
    }

    highlight_outline_temporarily(battle.grid, outline, color_green, 1.2);
}

function highlight_grid_for_unit_ability_with_predicate(unit_id: Unit_Id, ability_id: AbilityId, predicate: (ability: Ability_Active, cell: Cell) => boolean) {
    const unit = find_unit_by_id(battle, unit_id);
    if (!unit) return;

    const ability = find_unit_ability(unit, ability_id);
    if (!ability) return;
    if (ability.type == Ability_Type.passive) return;

    const outline: boolean[] = [];

    for (const cell of battle.grid.cells) {
        if (predicate(ability, cell)) {
            outline[grid_cell_index(battle.grid, cell.position)] = true;
        }
    }

    highlight_outline_temporarily(battle.grid, outline, color_red, 0.75);
}

function show_health_change_popup(entity_id: EntityId, change: number, blocked_by_armor: number) {
    const parent = $.CreatePanel("Panel", popups, "");
    parent.AddClass("health_change_popup");
    parent.AddClass("popup");
    parent.AddClass("active");

    const health_label = $.CreatePanel("Label", parent, "health");
    health_label.text = (change > 0 ? "+" : "") + change.toString(10);
    health_label.SetHasClass("damage", change < 0);
    health_label.SetHasClass("heal", change > 0);

    if (blocked_by_armor) {
        const armor_label = $.CreatePanel("Label", parent, "armor");
        armor_label.text = blocked_by_armor.toString(10);

        $.CreatePanel("Panel", parent, "armor_icon");
    }

    position_panel_over_entity_in_the_world(parent, entity_id, -30, 150);

    parent.DeleteAsync(1.5);
}

function show_title_icon_popup(entity_id: EntityId, text: string, icon: string) {
    const parent = $.CreatePanel("Panel", popups, "");
    parent.AddClass("popup");
    parent.AddClass("icon_text_popup");
    parent.AddClass("active");

    const icon_panel = $.CreatePanel("Image", parent, "icon");
    icon_panel.SetImage(icon);
    icon_panel.SetScaling(ScalingFunction.STRETCH_TO_COVER_PRESERVE_ASPECT);

    const text_panel = $.CreatePanel("Label", parent, "text");
    text_panel.text = text;

    position_panel_over_entity_in_the_world(parent, entity_id, -60, 150);

    parent.DeleteAsync(2);
}

subscribe_to_custom_event(To_Client_Event_Type.grid_highlight_targeted_ability, event => {
    highlight_grid_for_unit_ability_with_predicate(
        event.unit_id,
        event.ability_id,
        (ability, cell) => {
            return ability.type != Ability_Type.no_target && area_selector_fits(battle, ability.targeting.selector, event.from, event.to, cell.position)
        }
    );
});

subscribe_to_custom_event(To_Client_Event_Type.grid_highlight_no_target_ability, event => {
    highlight_grid_for_unit_ability_with_predicate(
        event.unit_id,
        event.ability_id,
        (ability, cell) => {
            return ability.type == Ability_Type.no_target && area_selector_fits(battle, ability.selector, event.from, event.from, cell.position);
        }
    );
});

subscribe_to_custom_event(To_Client_Event_Type.grid_highlight_deployment_zone, event => {
    highlight_grid_deployment_zone(event.for_player_id);
});

function show_start_turn_ui() {
    Game.EmitSound("your_turn");

    const root = $("#your_turn_ui");

    root.RemoveClass("animate_your_turn_fade");
    root.AddClass("visible");
    root.AddClass("animate_your_turn");

    $.Schedule(1.2, () => {
        root.AddClass("animate_your_turn_fade");
        root.RemoveClass("visible");
        root.RemoveClass("animate_your_turn");
    });
}

function show_game_over_ui(result: Combat_Result) {
    const root = $("#battle_over_container");
    const fade = $.CreatePanel("Panel", root, "fade");
    const text = $.CreatePanel("Label", root, "result_text");
    const continue_text = $.CreatePanel("Label", root, "continue_text");

    text.SetHasClass("defeat", result == Combat_Result.defeat);
    text.SetHasClass("victory", result == Combat_Result.victory);
    text.SetHasClass("draw", result == Combat_Result.draw);
    text.text = get_combat_result_string(result);
    text.hittest = false;

    continue_text.text = "CLICK TO CONTINUE";
    continue_text.hittest = false;

    for (const panel of [text, continue_text, fade]) {
        panel.SetHasClass("visible", true);
    }

    function emit_sound() {
        switch (result) {
            case Combat_Result.victory: return Game.EmitSound("game_over_victory");
            case Combat_Result.defeat: return Game.EmitSound("game_over_defeat");
            case Combat_Result.draw: return;
        }
    }

    const sound = emit_sound();

    $.Schedule(1, () => {
        fade.SetPanelEvent(PanelEvent.ON_LEFT_CLICK, () => {
            fire_event(To_Server_Event_Type.skip_combat_result_screen, {});

            if (sound != undefined) {
                Game.StopSound(sound);
            }
        });
    });
}

function try_select_unit_ability(unit: Unit, ability: Ability) {
    const ability_use = authorize_ability_use_with_error_ui(unit, ability);
    if (!ability_use) {
        return;
    }

    Game.EmitSound("click_simple");

    const active = ability_use.ability;
    if (active.type == Ability_Type.no_target) {
        try_use_no_target_ability(unit, active);
    } else {
        select_unit_ability(unit, active);
    }
}

function setup_custom_ability_hotkeys() {
    // TODO check that unit belongs to the player

    function bind_ability_at_index_to_command(command: string, index: number) {
        GameUI.CustomUIConfig().register_key_bind(command, () => {
            if (selection.type == Selection_Type.unit) {
                const unit = selection.unit;
                const abilities = unit.abilities.filter(ability => ability != unit.attack);
                const ability = abilities[index];

                try_select_unit_ability(selection.unit, ability);
            }
        });
    }

    bind_ability_at_index_to_command("AbilityPrimary1", 0);
    bind_ability_at_index_to_command("AbilityPrimary2", 1);
    bind_ability_at_index_to_command("AbilityPrimary3", 2);
    bind_ability_at_index_to_command("AbilityUltimate", 3);
}

end_turn_button.SetPanelEvent(PanelEvent.ON_LEFT_CLICK, () => {
    const player_act_permission = authorize_action_by_player(battle, battle.this_player);
    if (!player_act_permission.ok) return show_player_action_error_ui(player_act_permission);

    take_battle_action({
        type: Action_Type.end_turn
    });
});

subscribe_to_game_net_table_key("main", "game", data => {
    if (battle && data.state == Player_State.in_battle) {
        battle_process_state_update(battle, data);
        update_grid_visuals();
    }
});

setup_custom_ability_hotkeys();
periodically_update_ui();
periodically_update_stat_bar_display();
periodically_request_battle_deltas_when_in_battle();
subscribe_to_custom_event(To_Client_Event_Type.show_start_turn_ui, show_start_turn_ui);
subscribe_to_custom_event(To_Client_Event_Type.show_game_over_ui, event => show_game_over_ui(event.result));

subscribe_to_custom_event(To_Client_Event_Type.health_change_popup, event => {
    queue_popup(event.over_unit, {
        type: Popup_Type.health_change,
        change: event.change,
        blocked_by_armor: event.blocked_by_armor
    });
});

subscribe_to_custom_event(To_Client_Event_Type.adventure_item_effect_popup, event => {
    queue_popup(event.over_unit, {
        type: Popup_Type.adventure_item_effect,
        item_id: event.item_id
    });
});

subscribe_to_custom_event(To_Client_Event_Type.ability_use_popup, event => {
    queue_popup(event.over_unit, {
        type: Popup_Type.ability_use,
        ability_id: event.ability_id
    });
});

subscribe_to_custom_event(To_Client_Event_Type.modifier_effect_popup, event => {
    queue_popup(event.over_unit, {
        type: Popup_Type.modifier_effect,
        modifier_handle_id: event.modifier_handle_id
    });
});