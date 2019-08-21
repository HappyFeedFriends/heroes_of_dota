const enum Selection_Type {
    none,
    unit,
    ability,
    shop,
    card
}

const enum Hover_Type {
    none = 0,
    cell = 1,
    unit = 2,
    ability = 3
}

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
    ability: Ability

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
    id: number
    gold: number
}

type UI_Shop_Data = {
    id: number

    displayed_gold: number
    root_container: Panel
    items_container: Panel
    gold_text: LabelPanel

    item_buttons: Record<Item_Id, Panel>
}

type UI_Unit_Data_Base = {
    id: number
    hidden: boolean

    stat_bar_panel: Panel,

    stat_health: Stat_Indicator
    stat_attack: Stat_Indicator
    stat_move_points: Stat_Indicator
    stat_max_move_points: Stat_Indicator
    stat_max_health: Stat_Indicator

    modifiers: Modifier_Id[]
    modifier_bar: Panel

    stats: Unit_Stats
}

type UI_Hero_Data = UI_Unit_Data_Base & {
    supertype: Unit_Supertype.hero
    level: number
    level_bar: Level_Bar
}

type UI_Creep_Data = UI_Unit_Data_Base & {
    supertype: Unit_Supertype.creep
}

type UI_Minion_Data = UI_Unit_Data_Base & {
    supertype: Unit_Supertype.minion
}

type UI_Unit_Data = UI_Hero_Data | UI_Creep_Data | UI_Minion_Data;

type UI_Battle = Battle & {
    id: number
    world_origin: XY
    entity_id_to_unit_data: Record<EntityId, UI_Unit_Data>
    entity_id_to_rune_id: Record<number, number>
    entity_id_to_shop_id: Record<number, number>
    unit_id_to_facing: Record<number, XY>
    shop_id_to_facing: Record<number, XY>
    cells: UI_Cell[]
    cell_index_to_unit: Unit[]
    cell_index_to_rune: Rune[]
    outline_particles: ParticleId[]
    shop_range_outline_particles: ParticleId[]
    zone_highlight_particles: ParticleId[]
    this_player: Battle_Player
}

type UI_Cell = Cell & {
    associated_particle: ParticleId;
}

type Control_Panel = {
    panel: Panel;
    hero_rows: Hero_Row[];
}

type Stat_Indicator = {
    label: LabelPanel
    displayed_value: number
    value_provider(unit: Unit_Stats): number
}

type Hero_Row = {
    unit_id: number
    panel: Panel
    ability_buttons: Hero_Ability_Button[]
    health_label: LabelPanel
    level_bar: Level_Bar
}

type Hero_Ability_Button = {
    ability: Ability_Id;
    ability_panel: Panel;
    charges_label: LabelPanel
    overlay: Panel
}

type Level_Bar = {
    pips: Panel[]
}

type Card_Panel = {
    panel: Panel
    card: Card
    hovered: boolean
}

type Hover_State = Hover_State_None | Hover_State_Cell | Hover_State_Unit | Hover_State_Ability;

type Hover_State_None = {
    type: Hover_Type.none
}

type Hover_State_Cell = {
    type: Hover_Type.cell
    cell: XY
}

type Hover_State_Unit = {
    type: Hover_Type.unit
    unit: Unit
}

type Hover_State_Ability = {
    type: Hover_Type.ability
    unit: Unit
    ability: Ability
}

let current_state = Player_State.not_logged_in;
let battle: UI_Battle;
let ui_player_data: UI_Player_Data[] = [];

let selection: Selection_State = {
    type: Selection_Type.none
};

let hover: Hover_State = {
    type: Hover_Type.none
};

let ui_shop_data: UI_Shop_Data[] = [];

const current_targeted_ability_ui = $("#current_targeted_ability");
const card_selection_overlay = $("#card_selection_overlay");

const control_panel: Control_Panel = {
    panel: $("#hero_rows"),
    hero_rows: []
};

const hand_base_x = 400;
const hand_base_y = 957;

const battle_cell_size = 144;
const hand: Card_Panel[] = [];

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

function is_unit_selection(selection: Selection_State): selection is (Unit_Selection | Shop_Selection | Ability_Selection) {
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

function find_unit_entity_data_by_unit_id(battle: UI_Battle, unit_id: number): [ EntityId, UI_Unit_Data ] | undefined {
    for (const entity_id in battle.entity_id_to_unit_data) {
        const data = battle.entity_id_to_unit_data[entity_id];

        if (data.id == unit_id) {
            return [ Number(entity_id), data ];
        }
    }
}

function update_related_visual_data_from_delta(delta: Delta, delta_paths: Move_Delta_Paths) {
    function fill_movement_data(unit: Unit, moved_to: XY, path: XY[]) {
        delta_paths[battle.delta_head] = path;

        battle.unit_id_to_facing[unit.id] = path.length > 1
            ? xy_sub(moved_to, path[path.length - 2])
            : xy_sub(moved_to, unit.position);
    }

    switch (delta.type) {
        case Delta_Type.hero_spawn: {
            const owner = find_player_by_id(battle, delta.owner_id);

            if (!owner) break;

            battle.unit_id_to_facing[delta.unit_id] = {
                x: owner.deployment_zone.face_x,
                y: owner.deployment_zone.face_y
            };

            break;
        }

        case Delta_Type.hero_spawn_from_hand: {
            const hero = find_hero_by_id(battle, delta.hero_id);

            if (!hero) break;

            battle.unit_id_to_facing[delta.hero_id] = {
                x: hero.owner.deployment_zone.face_x,
                y: hero.owner.deployment_zone.face_y
            };

            break;
        }

        case Delta_Type.creep_spawn: {
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

        case Delta_Type.rune_pick_up: {
            const unit = find_unit_by_id(battle, delta.unit_id);

            if (!unit) break;

            const rune = find_rune_by_id(battle, delta.rune_id);

            if (!rune) break;

            const path = find_grid_path(unit.position, rune.position, true);

            if (!path) break;

            fill_movement_data(unit, rune.position, path);

            break;
        }

        case Delta_Type.unit_move: {
            const unit = find_unit_by_id(battle, delta.unit_id);

            if (!unit) break;

            const path = find_grid_path(unit.position, delta.to_position);

            if (!path) break;

            fill_movement_data(unit, delta.to_position, path);

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

        case Delta_Type.use_card: {
            if (delta.player_id == battle.this_player.id) {
                const card_index = hand.findIndex(card => card.card.id == delta.card_id);

                if (card_index != undefined) {
                    const card = hand[card_index];
                    card.panel.DeleteAsync(0);

                    hand.splice(card_index, 1);
                }
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
            battle.cell_index_to_unit[grid_cell_index(battle, unit.position)] = unit;
        }
    }

    for (const rune of battle.runes) {
        battle.cell_index_to_rune[grid_cell_index(battle, rune.position)] = rune;
    }
}

function receive_battle_deltas(head_before_merge: number, deltas: Delta[]) {
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

        if (delta.type == Delta_Type.hero_spawn) {
            const spawned_hero = find_hero_by_id(battle, delta.unit_id);

            if (spawned_hero && player_owns_unit(battle.this_player, spawned_hero)) {
                add_spawned_hero_to_control_panel(spawned_hero);
            }
        }

        if (delta.type == Delta_Type.shop_spawn) {
            const spawned_shop = find_shop_by_id(battle, delta.shop_id);

            if (spawned_shop) {
                ui_shop_data.push(create_ui_shop_data(spawned_shop));
            }
        }
    }

    for (const hero_row of control_panel.hero_rows) {
        const hero = find_hero_by_id(battle, hero_row.unit_id);

        if (hero) {
            update_hero_control_panel_state(hero_row, hero);
        }
    }

    update_current_turning_player_indicator();

    const visualiser_head = get_visualiser_delta_head();

    if (visualiser_head != undefined && battle.delta_head - visualiser_head > 40) {
        fire_event<Fast_Forward_Event>("fast_forward", make_battle_snapshot());
    } else if (deltas.length > 0) {
        fire_event<Put_Deltas_Event>("put_battle_deltas", {
            deltas: deltas,
            delta_paths: delta_paths,
            from_head: head_before_merge
        });
    }

    if (deltas.length > 0) {
        rebuild_cell_indexes();
        update_grid_visuals();
    }
}

function cheat(cheat: string) {
    GameEvents.SendCustomGameEventToServer("cheat", <Battle_Cheat_Event> {
        message: cheat
    });
}

function periodically_request_battle_deltas_when_in_battle() {
    $.Schedule(2.0, periodically_request_battle_deltas_when_in_battle);

    if (current_state != Player_State.in_battle) {
        return;
    }

    const head_before = battle.delta_head;
    const request: Query_Deltas_Request = {
        access_token: get_access_token(),
        battle_id: battle.id,
        since_delta: head_before
    };

    remote_request<Query_Deltas_Request, Query_Deltas_Response>("/query_battle_deltas", request, response => {
        receive_battle_deltas(head_before, response.deltas);
    });
}

function create_cell_particle_at(position: XYZ) {
    const particle = Particles.CreateParticle("particles/ui/square_overlay.vpcf", ParticleAttachment_t.PATTACH_CUSTOMORIGIN, 0);

    Particles.SetParticleControl(particle, 0, position);
    Particles.SetParticleControl(particle, 1, [battle_cell_size / 2, 0, 0]);
    Particles.SetParticleControl(particle, 2, [255, 255, 255]);
    Particles.SetParticleControl(particle, 3, [50, 0, 0]);

    return particle;
}

function on_card_added(player: Battle_Player, card: Card) {
    add_card_to_hand_default(player, card);

    if (player == battle.this_player) {
        add_card_panel(card);
    }
}

function on_minion_spawned(battle: UI_Battle, owner: Battle_Player, unit_id: number, type: Minion_Type, at: XY): Minion {
    const minion = spawn_minion_default(battle, owner, unit_id, type, at);

    battle.unit_id_to_facing[unit_id] = {
        x: 0,
        y: -1
    };

    return minion;
}

function process_state_transition(from: Player_State, new_state: Player_Net_Table) {
    $.Msg(`Transition from ${from} to2 ${new_state.state}`);

    if (from == Player_State.in_battle) {
        for (const cell of battle.cells) {
            Particles.DestroyParticleEffect(cell.associated_particle, true);
            Particles.ReleaseParticleIndex(cell.associated_particle);
        }
    }

    if (new_state.state == Player_State.in_battle) {
        const new_data = new_state.battle;
        const base = make_battle(from_server_array(new_data.participants), new_data.grid_size.width, new_data.grid_size.height);
        const this_player = find_player_by_id(base, new_state.id);

        if (!this_player) {
            $.Msg("Error: not participating in this battle");
            return;
        }

        battle = {
            ...base,
            id: new_data.id,
            this_player: this_player,
            world_origin: new_data.world_origin,
            cells: [],
            cell_index_to_unit: [],
            cell_index_to_rune: [],
            entity_id_to_unit_data: {},
            entity_id_to_rune_id: {},
            entity_id_to_shop_id: {},
            unit_id_to_facing: {},
            shop_id_to_facing: {},
            outline_particles: [],
            shop_range_outline_particles: [],
            zone_highlight_particles: [],
            add_card_to_hand: on_card_added,
            spawn_minion: on_minion_spawned
        };

        set_selection({
            type: Selection_Type.none
        });

        ui_shop_data = [];

        const particle_bottom_left_origin: XYZ = [
            battle.world_origin.x + battle_cell_size / 2,
            battle.world_origin.y + battle_cell_size / 2,
            128
        ];

        for (let x = 0; x < battle.grid_size.x; x++) {
            for (let y = 0; y < battle.grid_size.y; y++) {
                const particle = create_cell_particle_at([
                    particle_bottom_left_origin[0] + x * battle_cell_size,
                    particle_bottom_left_origin[1] + y * battle_cell_size,
                    particle_bottom_left_origin[2]
                ]);

                battle.cells.push({
                    position: xy(x, y),
                    occupied: false,
                    cost: 1,
                    associated_particle: particle
                });

                register_particle_for_reload(particle);
            }
        }

        update_grid_visuals();
        clear_control_panel();
        clear_hand_state();

        $("#shop_panels_container").RemoveAndDeleteChildren();
        $("#stat_bar_container").RemoveAndDeleteChildren();
    }
}

function find_grid_path(from: XY, to: XY, ignore_runes = false): XY[] | undefined {
    const cell_from = grid_cell_at(battle, from);
    const cell_to = grid_cell_at(battle, to);

    if (!cell_from || !cell_to) {
        return;
    }

    const populated = populate_path_costs(battle, from, to, ignore_runes);

    if (!populated) {
        return;
    }

    let current_cell_index = populated.cell_index_to_parent_index[grid_cell_index(battle, to)];
    const to_index = grid_cell_index(battle, from);
    const path = [];

    path.push(to);

    while (to_index != current_cell_index) {
        if (current_cell_index == undefined) {
            return;
        }

        path.push(battle.cells[current_cell_index].position);
        current_cell_index = populated.cell_index_to_parent_index[current_cell_index];
    }

    // path.push(from);

    return path.reverse();
}

const color_nothing: XYZ = [ 255, 255, 255 ];
const color_green: XYZ = [ 128, 255, 128 ];
const color_red: XYZ = [ 255, 128, 128 ];
const color_yellow: XYZ = [ 255, 255, 0 ];

function highlight_outline(cell_index_to_highlight: boolean[], color: XYZ): ParticleId[] {
    const cell_index_to_edges: Array<{ edge: Edge, from: XY, to: XY, deleted: boolean }[]> = [];
    const unique_edges: { edge: Edge, from: XY, to: XY, deleted: boolean }[] = [];

    function merge_edges(at: XY, going_towards: Edge, right_relative: number | undefined, left_relative: number | undefined, index: number) {
        const right_neighbor = right_relative != undefined && cell_index_to_edges[right_relative];
        const right_edge = right_neighbor && right_neighbor.find(old => old.edge == going_towards);
        const left_neighbor = left_relative != undefined && cell_index_to_edges[left_relative];
        const left_edge = left_neighbor && left_neighbor.find(old => old.edge == going_towards);

        if (right_edge && left_edge) {
            right_edge.to = left_edge.to;
            left_edge.deleted = true;
            cell_index_to_edges[index].push(right_edge);
        } else {
            if (right_edge) {
                right_edge.to = at;
                cell_index_to_edges[index].push(right_edge);
            }

            if (left_edge) {
                left_edge.from = at;
                cell_index_to_edges[index].push(left_edge);
            }
        }

        if (!right_edge && !left_edge) {
            const new_edge = { edge: going_towards, from: at, to: at, deleted: false };
            cell_index_to_edges[index].push(new_edge);
            unique_edges.push(new_edge);
        }
    }

    for (let index = 0; index < cell_index_to_highlight.length; index++) {
        const is_highlighted = cell_index_to_highlight[index];

        if (!is_highlighted) continue;

        const cell = battle.cells[index];
        const at = cell.position;

        const right = grid_cell_index_raw(battle, at.x + 1, at.y);
        const left = grid_cell_index_raw(battle, at.x - 1, at.y);
        const top = grid_cell_index_raw(battle, at.x, at.y + 1);
        const bottom = grid_cell_index_raw(battle, at.x, at.y - 1);

        const edge_side_right_left: [Edge, number | undefined, number | undefined, number | undefined][] = [
            [ Edge.top, top, right, left ],
            [ Edge.bottom, bottom, left, right ],
            [ Edge.right, right, bottom, top ],
            [ Edge.left, left, top, bottom ]
        ];

        for (const [ edge, side, right, left ] of edge_side_right_left) {
            if (side == undefined || !cell_index_to_highlight[side]) {
                if (!cell_index_to_edges[index]) {
                    cell_index_to_edges[index] = [];
                }

                merge_edges(at, edge, right, left, index);
            }
        }
    }

    const half = battle_cell_size / 2;
    const height = 160;

    const particles: ParticleId[] = [];

    for (const { edge, from, to, deleted } of unique_edges) {
        if (deleted) continue;

        const fx = Particles.CreateParticle("particles/ui/highlight_rope.vpcf", ParticleAttachment_t.PATTACH_CUSTOMORIGIN, 0);

        const [fr_x, fr_y, fr_z] = battle_position_to_world_position_center(from);
        const [to_x, to_y, to_z] = battle_position_to_world_position_center(to);

        switch (edge) {
            case Edge.bottom: {
                Particles.SetParticleControl(fx, 0, [fr_x - half, fr_y - half, fr_z + height]);
                Particles.SetParticleControl(fx, 1, [to_x + half, to_y - half, to_z + height]);

                break;
            }

            case Edge.top: {
                Particles.SetParticleControl(fx, 0, [fr_x + half, fr_y + half, fr_z + height]);
                Particles.SetParticleControl(fx, 1, [to_x - half, to_y + half, to_z + height]);

                break;
            }

            case Edge.left: {
                Particles.SetParticleControl(fx, 0, [fr_x - half, fr_y + half, fr_z + height]);
                Particles.SetParticleControl(fx, 1, [to_x - half, to_y - half, to_z + height]);

                break;
            }

            case Edge.right: {
                Particles.SetParticleControl(fx, 0, [fr_x + half, fr_y - half, fr_z + height]);
                Particles.SetParticleControl(fx, 1, [to_x + half, to_y + half, to_z + height]);

                break;
            }
        }

        Particles.SetParticleControl(fx, 2, color);

        particles.push(fx);
    }

    return particles;
}

function highlight_outline_temporarily(cell_index_to_highlight: boolean[], color: XYZ, highlight_time: number) {
    const particles = highlight_outline(cell_index_to_highlight, color);

    $.Schedule(highlight_time, () => {
        for (const particle of particles) {
            Particles.DestroyParticleEffect(particle, false);
            Particles.ReleaseParticleIndex(particle);
        }
    });
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
            const selected_entity_path = populate_path_costs(battle, selection.unit.position)!;

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
                path: populate_path_costs(battle, selection.unit.position)!,
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

function color_cell(cell: UI_Cell, color: XYZ, alpha: number) {
    Particles.SetParticleControl(cell.associated_particle, 2, color);
    Particles.SetParticleControl(cell.associated_particle, 3, [ alpha, 0, 0 ]);
}

function compute_unit_cell_color(unit_in_cell: Unit): [ XYZ, number ] {
    const your_turn = battle.this_player == battle.turning_player;

    let cell_color: XYZ;

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

    if (is_unit_selection(selection) && selection.unit == unit_in_cell) {
        alpha = 255;
    }

    return [ cell_color, alpha ];
}

function compute_unit_path_cell_color(unit: Unit, path: Cost_Population_Result, cell_index: number): [XYZ, number] {
    const rune_in_cell = battle.cell_index_to_rune[cell_index];
    const cost = path.cell_index_to_cost[cell_index];

    if (cost <= unit.move_points && !unit.has_taken_an_action_this_turn) {
        return [color_green, 35];
    }

    if (rune_in_cell) {
        const [can_go, cost] = can_find_path(battle, unit.position, rune_in_cell.position, true);

        if (can_go && cost <= unit.move_points) {
            return [color_green, 35];
        }
    }

    return [color_nothing, 20];
}

function update_outline(storage: ParticleId[], cell_index_to_highlight: boolean[], color: XYZ): ParticleId[] {
    for (const old_particle of storage) {
        Particles.DestroyParticleEffect(old_particle, false);
        Particles.ReleaseParticleIndex(old_particle);
    }

    if (cell_index_to_highlight.length > 0) {
        const result = highlight_outline(cell_index_to_highlight, color);

        for (const particle of result) {
            register_particle_for_reload(particle);
        }

        return result;
    } else {
        return [];
    }
}

function update_grid_visuals_for_ability(selection: Grid_Selection_Ability, cell_index_to_highlight: boolean[]) {
    let can_highlighted_ability_target_hovered_cell = false;
    let highlighted_ability_selector: Ability_Target_Selector | undefined;

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

    for (const cell of battle.cells) {
        const index = grid_cell_index(battle, cell.position);

        let cell_color: XYZ = color_nothing;
        let alpha = 20;

        const unit_in_cell = battle.cell_index_to_unit[index];
        const ability = selection.ability;

        if (unit_in_cell) {
            [cell_color, alpha] = compute_unit_cell_color(unit_in_cell);
        }

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
                        alpha = 140;
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
                if (ability_targeting_fits(battle, ability.targeting, selection.unit.position, cell.position)) {
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
            if (ability_selector_fits(highlighted_ability_selector, selection.unit.position, hover.cell, cell.position)) {
                alpha = 140;
                cell_color = color_red;
            }
        }

        color_cell(cell, cell_color, alpha);
    }
}

function update_grid_visuals_for_unit_selection(selection: Grid_Selection_Unit, cell_index_to_shop_highlight: boolean[]) {
    const hovered_shop = hover.type == Hover_Type.cell && shop_at(battle, hover.cell);

    for (const cell of battle.cells) {
        const index = grid_cell_index(battle, cell.position);
        const unit_in_cell = battle.cell_index_to_unit[index];

        let [cell_color, alpha] = compute_unit_path_cell_color(selection.unit, selection.path, index);

        if (unit_in_cell) {
            [cell_color, alpha] = compute_unit_cell_color(unit_in_cell);
        }

        if (hovered_shop && is_point_in_shop_range(cell.position, hovered_shop)) {
            cell_index_to_shop_highlight[index] = true;
        }

        color_cell(cell, cell_color, alpha);
    }
}

function update_grid_visuals_for_shop_selection(selection: Grid_Selection_Shop, cell_index_to_shop_highlight: boolean[]) {
    for (const cell of battle.cells) {
        const index = grid_cell_index(battle, cell.position);
        const unit_in_cell = battle.cell_index_to_unit[index];

        let [cell_color, alpha] = compute_unit_path_cell_color(selection.unit, selection.path, index);

        if (unit_in_cell) {
            [cell_color, alpha] = compute_unit_cell_color(unit_in_cell);
        }

        if (is_point_in_shop_range(cell.position, selection.shop)) {
            cell_index_to_shop_highlight[index] = true;
        }

        color_cell(cell, cell_color, alpha);
    }
}

function update_grid_visuals_for_card_selection(selection: Grid_Selection_Card, cell_index_to_zone_highlight: boolean[]) {
    for (const cell of battle.cells) {
        const index = grid_cell_index(battle, cell.position);
        const unit_in_cell = battle.cell_index_to_unit[index];

        let cell_color: XYZ = color_nothing;
        let alpha = 20;

        if (unit_in_cell) {
            [cell_color, alpha] = compute_unit_cell_color(unit_in_cell);
        }

        if (selection.card.type == Card_Type.hero || selection.card.type == Card_Type.existing_hero) {
            if (is_point_in_deployment_zone(battle, cell.position, battle.this_player)) {
                cell_index_to_zone_highlight[index] = true;
            }
        }

        color_cell(cell, cell_color, alpha);
    }
}

function update_grid_visuals_for_no_selection(cell_index_to_shop_highlight: boolean[]) {
    const hovered_shop = hover.type == Hover_Type.cell && shop_at(battle, hover.cell);

    for (const cell of battle.cells) {
        const index = grid_cell_index(battle, cell.position);
        const unit_in_cell = battle.cell_index_to_unit[index];

        let cell_color: XYZ = color_nothing;
        let alpha = 20;

        if (unit_in_cell) {
            [cell_color, alpha] = compute_unit_cell_color(unit_in_cell);
        }

        if (hovered_shop && is_point_in_shop_range(cell.position, hovered_shop)) {
            cell_index_to_shop_highlight[index] = true;
        }

        color_cell(cell, cell_color, alpha);
    }
}

function update_grid_visuals() {
    $.Msg("Update grid visuals");

    const selection = selection_to_grid_selection();
    const cell_index_to_highlight: boolean[] = [];
    const cell_index_to_shop_highlight: boolean[] = [];
    const cell_index_to_zone_highlight: boolean[] = [];

    switch (selection.type) {
        case Selection_Type.none: {
            update_grid_visuals_for_no_selection(cell_index_to_shop_highlight);
            break;
        }

        case Selection_Type.unit: {
            update_grid_visuals_for_unit_selection(selection, cell_index_to_shop_highlight);
            break;
        }

        case Selection_Type.ability: {
            update_grid_visuals_for_ability(selection, cell_index_to_highlight);
            break;
        }

        case Selection_Type.shop: {
            update_grid_visuals_for_shop_selection(selection, cell_index_to_shop_highlight);
            break;
        }

        case Selection_Type.card: {
            update_grid_visuals_for_card_selection(selection, cell_index_to_zone_highlight);
            break;
        }

        default: unreachable(selection);
    }

    for (const cell of battle.cells) {
        const index = grid_cell_index(battle, cell.position);

        if (hover.type == Hover_Type.cell && xy_equal(hover.cell, cell.position)) {
            if (selection.type == Selection_Type.card) {
                cell_index_to_highlight[index] = true;
            } else {
                color_cell(cell, color_green, 140);
            }
        }
    }

    battle.outline_particles = update_outline(battle.outline_particles, cell_index_to_highlight, color_red);
    battle.shop_range_outline_particles = update_outline(battle.shop_range_outline_particles, cell_index_to_shop_highlight, color_yellow);
    battle.zone_highlight_particles = update_outline(battle.zone_highlight_particles, cell_index_to_zone_highlight, color_green);
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

// Used from XML
function ui_end_turn() {
    take_battle_action({
        type: Action_Type.end_turn
    });
}

function get_item_icon_name(id: Item_Id): string {
    switch (id) {
        case Item_Id.satanic: return "satanic";
        case Item_Id.heart_of_tarrasque: return "heart";
        case Item_Id.tome_of_knowledge: return "tome_of_knowledge";
        case Item_Id.assault_cuirass: return "assault";
        case Item_Id.divine_rapier: return "rapier";
        case Item_Id.boots_of_travel: return "travel_boots";
        case Item_Id.refresher_shard: return "refresher_shard";
        case Item_Id.mask_of_madness: return "mask_of_madness";
        case Item_Id.armlet: return "armlet_active";
        case Item_Id.boots_of_speed: return "boots";
        case Item_Id.blades_of_attack: return "blades_of_attack";
        case Item_Id.belt_of_strength: return "belt_of_strength";
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

        item_image.SetImage(`file://{images}/items/${get_item_icon_name(item.id)}.png`);

        item_button.AddClass("item_button");
        item_button.SetPanelEvent(PanelEvent.ON_RIGHT_CLICK, () => {
            if (selection.type == Selection_Type.shop) {
                try_purchase_item(selection.unit, selection.shop, item.id, () => item_button.AddClass("unavailable"));
            }
        });

        item_button.SetPanelEvent(PanelEvent.ON_MOUSE_OVER, () => {
            $.DispatchEvent("DOTAShowTextTooltip", item_button, get_item_tooltip(item));
        });

        item_button.SetPanelEvent(PanelEvent.ON_MOUSE_OUT, () => {
            $.DispatchEvent("DOTAHideTextTooltip");
        });

        item_cost.text = item.gold_cost.toString();

        item_button_map[item.id] = item_button;
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
            stat_indicator(max_label, unit => unit.max_health)
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
            stat_indicator(max_label, unit => unit.max_move_points + unit.move_points_bonus)
        ];
    }

    function create_attack_indicator(): Stat_Indicator {
        const attack_container = $.CreatePanel("Panel", top_level, "attack_container");
        const attack_label = $.CreatePanel("Label", attack_container, "attack_label");
        $.CreatePanel("Panel", attack_container, "attack_icon").AddClass("stat_icon");
        attack_container.AddClass("container");

        return stat_indicator(attack_label, unit => unit.attack_damage + unit.attack_bonus);
    }

    function create_modifier_container(): Panel {
        const bar = $.CreatePanel("Panel", root, "");

        bar.AddClass("unit_modifier_bar");

        return bar;
    }

    function stat_indicator(label: LabelPanel, value_provider: (unit: Unit_Stats) => number): Stat_Indicator {
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
        modifiers: from_server_array(data.modifiers),
        stats: data,
        hidden: data.hidden,
        stat_bar_panel: top_level,
    };

    function create_default_indicators() {
        const [ health, max_health ] = create_health_indicator();
        const [ move_points, max_move_points ] = create_move_points_indicator();
        const attack = create_attack_indicator();
        const modifiers = create_modifier_container();

        return {
            stat_health: health,
            stat_attack: attack,
            stat_move_points: move_points,
            stat_max_move_points: max_move_points,
            stat_max_health: max_health,
            modifier_bar: modifiers
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

        case Unit_Supertype.creep: {
            const default_indicators = create_default_indicators();

            return {
                ...base,
                ...default_indicators,
                supertype: data.supertype,
            }
        }

        case Unit_Supertype.minion: {
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
    if (ui.supertype == Unit_Supertype.hero && new_data.supertype == Unit_Supertype.hero) {
        ui.level = new_data.level;
    }

    ui.modifiers = from_server_array(new_data.modifiers);
    ui.stats = new_data;
    ui.hidden = new_data.hidden;

    ui.modifier_bar.SetHasClass("hidden", ui.hidden);
    ui.stat_bar_panel.SetHasClass("hidden", ui.hidden);

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

    for (const child of ui.modifier_bar.Children()) {
        child.DeleteAsync(0);
    }

    for (const modifier of ui.modifiers) {
        const modifier_panel = $.CreatePanel("Panel", ui.modifier_bar, "");
        const modifier_image = $.CreatePanel("Image", modifier_panel, "image");

        modifier_image.SetImage(`file://{images}/${get_modifier_icon(modifier)}.png`);
        modifier_image.SetScaling(ScalingFunction.STRETCH_TO_FIT_Y_PRESERVE_ASPECT);

        modifier_panel.AddClass("modifier");
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

function dispose_of_unit_stat_bar_data(data: UI_Unit_Data) {
    data.stat_bar_panel.DeleteAsync(0);
}

function process_state_update(state: Player_Net_Table) {
    if (state.state == Player_State.not_logged_in) {
        return;
    }

    if (battle && state.state == Player_State.in_battle) {
        ui_player_data = from_server_array(state.battle.players).map(player => ({
            id: player.id,
            gold: player.gold
        }));

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
            } else {
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

            dispose_of_unit_stat_bar_data(battle.entity_id_to_unit_data[leftover_id]);

            delete battle.entity_id_to_unit_data[Number(leftover_id)];
        }
    }
}

function world_position_to_battle_position(position: XYZ): XY {
    return {
        x: Math.floor((position[0] - battle.world_origin.x) / battle_cell_size),
        y: Math.floor((position[1] - battle.world_origin.y) / battle_cell_size)
    }
}

function battle_position_to_world_position_center(position: XY): XYZ {
    return [
        battle.world_origin.x + position.x * battle_cell_size + battle_cell_size / 2,
        battle.world_origin.y + position.y * battle_cell_size + battle_cell_size / 2,
        0
    ]
}

function move_order_particle(world_position: XYZ) {
    const particle = Particles.CreateParticle("particles/ui_mouseactions/clicked_moveto.vpcf", ParticleAttachment_t.PATTACH_CUSTOMORIGIN, 0);

    Particles.SetParticleControl(particle, 0, [ world_position[0], world_position[1], world_position[2] + 32 ]);
    Particles.SetParticleControl(particle, 1, [ 128, 255, 128 ]);

    Particles.ReleaseParticleIndex(particle);
}

function make_battle_snapshot(): Battle_Snapshot {
    return {
        has_started: battle.has_started,
        players: battle.players.map(player => ({
            id: player.id,
            gold: player.gold
        })),
        units: battle.units
            .filter(unit => !unit.dead)
            .map(unit => {
                const snapshot_base: Unit_Snapshot_Base = {
                    ...copy(unit as Unit_Stats),
                    id: unit.id,
                    position: unit.position,
                    facing: battle.unit_id_to_facing[unit.id],
                    modifiers: unit.modifiers.map(modifier => ({
                        modifier_id: modifier.id,
                        modifier_handle_id: modifier.handle_id,
                        changes: modifier.changes
                    }))
                };

                switch (unit.supertype) {
                    case Unit_Supertype.hero: {
                        const hero: Hero_Snapshot = {
                            ...snapshot_base,
                            supertype: Unit_Supertype.hero,
                            type: unit.type,
                            level: unit.level,
                            owner_id: unit.owner.id
                        };

                        return hero;
                    }

                    case Unit_Supertype.creep: {
                        const creep: Creep_Snapshot = {
                            ...snapshot_base,
                            supertype: Unit_Supertype.creep
                        };

                        return creep;
                    }

                    case Unit_Supertype.minion: {
                        const minion: Minion_Snapshot = {
                            ...snapshot_base,
                            supertype: Unit_Supertype.minion,
                            type: unit.type,
                            owner_id: unit.owner.id
                        };

                        return minion;
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
    $("#hero_rows").RemoveAndDeleteChildren();

    control_panel.hero_rows = [];
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

function get_spell_card_art(spell_id: Spell_Id): string {
    switch (spell_id) {
        case Spell_Id.buyback: return "profile_badges/level_46.png";
        case Spell_Id.euls_scepter: return "profile_badges/level_71.png";
        case Spell_Id.mekansm: return "profile_badges/level_45.png";
        case Spell_Id.buckler: return "profile_badges/level_21.png";
        case Spell_Id.drums_of_endurance: return "profile_badges/level_42.png";
        case Spell_Id.town_portal_scroll: return "custom_game/spells/teleport_scroll.png";
        case Spell_Id.pocket_tower: return "custom_game/spells/pocket_tower.png";
    }
}

function get_spell_name(spell_id: Spell_Id): string {
    switch (spell_id) {
        case Spell_Id.buyback: return "Buyback";
        case Spell_Id.euls_scepter: return "Eul's Scepter";
        case Spell_Id.mekansm: return "Mekansm";
        case Spell_Id.buckler: return "Buckler";
        case Spell_Id.drums_of_endurance: return "Drums of Endurance";
        case Spell_Id.town_portal_scroll: return "Town Portal Scroll";
        case Spell_Id.pocket_tower: return "Pocket Tower";
    }
}

function get_spell_text(spell: Card_Spell): string {
    switch (spell.spell_id) {
        case Spell_Id.buyback: return `Spend gold to return a dead ally hero to your hand`;
        case Spell_Id.euls_scepter: return `Make target untargetable until next turn`;
        case Spell_Id.mekansm: return `Restore ${spell.heal} health to all allies`;
        case Spell_Id.buckler: return `Give allies ${spell.armor} armor for ${spell.duration} turns`;
        case Spell_Id.drums_of_endurance: return `Give allies ${spell.move_points_bonus} move points this turn`;
        case Spell_Id.town_portal_scroll: return `Restore hero's health and return them to your hand`;
        case Spell_Id.pocket_tower: return `Summon a tower to attack a random enemy each turn. Extends deployment zone`;
    }
}

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
    }
}

function get_ability_tooltip(a: Ability): string {
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
        case Ability_Id.dragon_knight_elder_dragon_form: return `Transform, gain additional attack range and splash attack for ${a.duration} turns`;
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

        // TODO these are not visible right now, but might be later
        case Ability_Id.pocket_tower_attack: return "";
        case Ability_Id.deployment_zone: return "";
    }
}

function get_ability_icon(ability_id: Ability_Id): string {
    switch (ability_id) {
        case Ability_Id.basic_attack: return "juggernaut_blade_dance";
        case Ability_Id.pudge_hook: return "pudge_meat_hook";
        case Ability_Id.pudge_rot: return "pudge_rot";
        case Ability_Id.pudge_dismember: return "pudge_dismember";
        case Ability_Id.sniper_shrapnel: return "sniper_shrapnel";
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

        // TODO these are not visible right now, but might be later
        case Ability_Id.pocket_tower_attack: return "";
        case Ability_Id.deployment_zone: return "";
    }
}

function get_modifier_icon(modifier_id: Modifier_Id): string {
    function from_ability(ability_id: Ability_Id): string {
        return `spellicons/${get_ability_icon(ability_id)}`
    }

    function from_item(item_id: Item_Id): string {
        return `items/${get_item_icon_name(item_id)}`;
    }

    switch (modifier_id) {
        case Modifier_Id.item_assault_cuirass: return from_item(Item_Id.assault_cuirass);
        case Modifier_Id.item_boots_of_travel: return from_item(Item_Id.boots_of_travel);
        case Modifier_Id.item_divine_rapier: return from_item(Item_Id.divine_rapier);
        case Modifier_Id.item_heart_of_tarrasque: return from_item(Item_Id.heart_of_tarrasque);
        case Modifier_Id.item_mask_of_madness: return from_item(Item_Id.mask_of_madness);
        case Modifier_Id.item_satanic: return from_item(Item_Id.satanic);
        case Modifier_Id.item_armlet: return from_item(Item_Id.armlet);
        case Modifier_Id.item_boots_of_speed: return from_item(Item_Id.boots_of_speed);
        case Modifier_Id.item_blades_of_attack: return from_item(Item_Id.blades_of_attack);
        case Modifier_Id.item_belt_of_strength: return from_item(Item_Id.belt_of_strength);

        case Modifier_Id.dragon_knight_dragon_tail: return from_ability(Ability_Id.dragon_knight_dragon_tail);
        case Modifier_Id.dragon_knight_elder_dragon_form: return from_ability(Ability_Id.dragon_knight_elder_dragon_form);
        case Modifier_Id.lion_hex: return from_ability(Ability_Id.lion_hex);
        case Modifier_Id.lion_impale: return from_ability(Ability_Id.lion_impale);
        case Modifier_Id.skywrath_ancient_seal: return from_ability(Ability_Id.skywrath_ancient_seal);
        case Modifier_Id.skywrath_concussive_shot: return from_ability(Ability_Id.skywrath_concussive_shot);
        case Modifier_Id.tide_anchor_smash: return from_ability(Ability_Id.tide_anchor_smash);
        case Modifier_Id.tide_gush: return from_ability(Ability_Id.tide_gush);
        case Modifier_Id.tide_ravage: return from_ability(Ability_Id.tide_ravage);
        case Modifier_Id.mirana_arrow: return from_ability(Ability_Id.mirana_arrow);
        case Modifier_Id.venge_magic_missile: return from_ability(Ability_Id.venge_magic_missile);
        case Modifier_Id.venge_wave_of_terror: return from_ability(Ability_Id.venge_wave_of_terror);
        case Modifier_Id.dark_seer_ion_shell: return from_ability(Ability_Id.dark_seer_ion_shell);
        case Modifier_Id.dark_seer_surge: return from_ability(Ability_Id.dark_seer_surge);

        case Modifier_Id.spell_euls_scepter: return "items/cyclone";
        case Modifier_Id.spell_buckler: return "items/buckler";
        case Modifier_Id.spell_drums_of_endurance: return "items/ancient_janggo";

        case Modifier_Id.rune_double_damage: return "spellicons/rune_doubledamage";
        case Modifier_Id.rune_haste: return "spellicons/rune_haste";

        case Modifier_Id.returned_to_hand: return "items/tpscroll";
    }
}

function safely_set_panel_background_image(panel: Panel, image: string) {
    panel.style.backgroundImage = `url('${image}')`;
    panel.AddClass("fix_bg");
    panel.RemoveClass("fix_bg");
}

function get_full_ability_icon_path(id: Ability_Id): string {
    return `file://{images}/spellicons/${get_ability_icon(id)}.png`;
}

function get_full_unit_icon_path(type: Hero_Type): string {
    return `file://{images}/heroes/npc_dota_hero_${get_hero_dota_name(type)}.png`;
}

function create_level_bar(parent: Panel, id: string): Level_Bar {
    const panel = $.CreatePanel("Panel", parent, id);
    panel.AddClass("level_bar");

    const level_bar: Level_Bar = {
        pips: []
    };

    for (let index = 0; index < max_unit_level; index++) {
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

function add_spawned_hero_to_control_panel(hero: Hero) {
    function create_indicator(parent: Panel, id: string, value: number): LabelPanel {
        const indicator = $.CreatePanel("Panel", parent, id);
        const label = $.CreatePanel("Label", indicator, "");

        indicator.AddClass("indicator");
        label.text = value.toString();

        return label;
    }

    const hero_row = $.CreatePanel("Panel", control_panel.panel, "");
    hero_row.AddClass("hero_row");

    const death_overlay = $.CreatePanel("Panel", hero_row, "death_overlay");
    death_overlay.hittest = false;

    const content_container = $.CreatePanel("Panel", hero_row, "container");

    const portrait = $.CreatePanel("Panel", content_container, "hero_portrait");
    const abilities = $.CreatePanel("Panel", content_container, "ability_row");

    safely_set_panel_background_image(portrait, get_full_unit_icon_path(hero.type));

    const indicators = $.CreatePanel("Panel", portrait, "indicators");
    const health = create_indicator(indicators, "health_indicator", hero.health);
    const level = create_level_bar(indicators, "level_indicator");

    const ability_buttons: Hero_Ability_Button[] = [];

    for (const ability of hero.abilities) {
        const ability_panel = $.CreatePanel("Button", abilities, "");
        ability_panel.AddClass("ability_button");

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

            $.DispatchEvent("DOTAShowTextTooltip", ability_panel, get_ability_tooltip(ability));
        });

        ability_panel.SetPanelEvent(PanelEvent.ON_MOUSE_OUT, () => {
            if (hover.type == Hover_Type.ability && hover.ability == ability) {
                hover = { type: Hover_Type.none };

                update_grid_visuals();
            }

            $.DispatchEvent("DOTAHideTextTooltip");
        });

        const ability_image = $.CreatePanel("Panel", ability_panel, "ability_image");
        safely_set_panel_background_image(ability_image, get_full_ability_icon_path(ability.id));

        const charges_label = $.CreatePanel("Label", ability_panel, "charges");
        charges_label.hittest = false;

        const overlay = $.CreatePanel("Panel", ability_panel, "overlay");

        ability_buttons.push({
            ability: ability.id,
            ability_panel: ability_panel,
            charges_label: charges_label,
            overlay: overlay
        })
    }

    const new_row: Hero_Row = {
        panel: hero_row,
        unit_id: hero.id,
        ability_buttons: ability_buttons,
        health_label: health,
        level_bar: level
    };

    control_panel.hero_rows.push(new_row);
}

function update_current_turning_player_indicator() {
    const label = $("#current_turning_player_label") as LabelPanel;

    label.text = `${battle.turning_player.name}'s turn`;
}

function update_hero_control_panel_state(row: Hero_Row, hero: Hero) {
    row.panel.SetHasClass("dead", hero.dead);
    row.health_label.text = hero.health.toString();

    update_level_bar(row.level_bar, hero.level);

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
}

function deselect_ability(selection: Ability_Selection) {
    select_unit(selection.unit_entity);

    update_grid_visuals();
}

function select_unit_ability(unit: Unit, ability: Ability) {
    if (selection.type == Selection_Type.ability) {
        if (selection.unit == unit && selection.ability.id == ability.id) {
            return;
        }
    }

    const entity_data = find_unit_entity_data_by_unit_id(battle, unit.id);

    if (!entity_data) return;

    if (unit.supertype == Unit_Supertype.hero) {
        safely_set_panel_background_image(current_targeted_ability_ui.FindChild("hero"), get_full_unit_icon_path(unit.type));
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

            Particles.DestroyParticleEffect(selection.arrow_particle, false);
            Particles.ReleaseParticleIndex(selection.arrow_particle);
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

    if (selection.type == Selection_Type.shop) {
        drop_selection();
        return;
    }

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
        select_unit_ability(selection.unit, selection.unit.attack);
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

    try_update_stat_indicator(ui_data.stat_attack);
    try_update_stat_indicator(ui_data.stat_health);
    try_update_stat_indicator(ui_data.stat_max_health);
    try_update_stat_indicator(ui_data.stat_move_points);
    try_update_stat_indicator(ui_data.stat_max_move_points);

    ui_data.stat_bar_panel.SetHasClass("dead", ui_data.stat_health.displayed_value == 0);
}

function position_panel_over_entity_in_the_world(panel: Panel, entity_id: EntityId, offset_x: number, offset_z: number) {
    const screen_ratio = Game.GetScreenHeight() / 1080;
    const entity_origin = Entities.GetAbsOrigin(entity_id);

    if (!entity_origin) return;

    const screen_x = Game.WorldToScreenX(entity_origin[0] + offset_x, entity_origin[1], entity_origin[2] + offset_z);
    const screen_y = Game.WorldToScreenY(entity_origin[0] + offset_x, entity_origin[1], entity_origin[2] + offset_z);

    if (screen_x == -1 || screen_y == -1) {
        return;
    }

    panel.style.x = Math.floor(screen_x / screen_ratio - panel.actuallayoutwidth / 2.0) + "px";
    panel.style.y = Math.floor(screen_y / screen_ratio) + "px";
}

function update_stat_bar_positions() {
    // TODO with the fixed camera we can have the luxury of updating only when units actually move
    for (const entity_id_string in battle.entity_id_to_unit_data) {
        const entity_id = Number(entity_id_string); // TODO holy shit why javascript, why
        const unit_data = battle.entity_id_to_unit_data[entity_id_string];

        position_panel_over_entity_in_the_world(unit_data.modifier_bar, entity_id, 30, 30);
        position_panel_over_entity_in_the_world(unit_data.stat_bar_panel, entity_id, 30, -40);
    }
}

function periodically_update_ui() {
    $.Schedule(0, periodically_update_ui);

    if (current_state != Player_State.in_battle) return;

    update_current_ability_based_on_cursor_state();
    update_stat_bar_positions();
    update_hovered_cell();
    update_hand();

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

declare const enum Edge {
    top = 0,
    bottom = 1,
    left = 2,
    right = 3
}

function get_entity_under_cursor(cursor: [ number, number ]): EntityId | undefined {
    const entities_under_cursor = GameUI.FindScreenEntities(cursor);

    for (const entity of entities_under_cursor) {
        if (entity.accurateCollision) {
            return entity.entityIndex;
        }
    }

    if (entities_under_cursor.length > 0) {
        return entities_under_cursor[0].entityIndex;
    }

    return undefined;
}

function filter_mouse_click(event: MouseEvent, button: MouseButton | WheelScroll): boolean {
    if (current_state != Player_State.in_battle) {
        return false;
    }

    if (event == "pressed" || event == "doublepressed") {
        const click_behaviors = GameUI.GetClickBehaviors();
        const cursor = GameUI.GetCursorPosition();
        const world_position = GameUI.GetScreenWorldPosition(cursor);

        if (!world_position) {
            return true;
        }

        const battle_position = world_position_to_battle_position(world_position);
        const cursor_entity = get_entity_under_cursor(cursor);
        const cursor_entity_unit = find_unit_by_entity_id(battle, cursor_entity);
        const cursor_entity_shop = find_shop_by_entity_id(battle, cursor_entity);

        if (button == MouseButton.LEFT && selection.type == Selection_Type.none && cursor_entity == null) {
            const particle = Particles.CreateParticle("particles/ui/ground_click.vpcf", ParticleAttachment_t.PATTACH_WORLDORIGIN, 0);
            Particles.SetParticleControl(particle, 0, world_position);
            Particles.ReleaseParticleIndex(particle);
        }

        if (button == MouseButton.LEFT && selection.type == Selection_Type.none) {
            if (Game.IsInToolsMode()) {
                if (GameUI.IsShiftDown()) {
                    cheat(`tree ${battle_position.x} ${battle_position.y}`);
                } else if (GameUI.IsAltDown()) {
                    cheat(`rune ${battle_position.x} ${battle_position.y}`);
                } else if (GameUI.IsControlDown()) {
                    cheat(`shop ${battle_position.x} ${battle_position.y}`);
                }
            }
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
                const success = try_use_targeted_ability(selection.unit, selection.ability, battle_position, cursor_entity_unit);

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
                }

                if (cursor_entity_shop) {
                    select_shop(cursor_entity);
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

            const wants_to_attack_unconditionally =
                button == MouseButton.LEFT &&
                click_behaviors == CLICK_BEHAVIORS.DOTA_CLICK_BEHAVIOR_ATTACK;

            if (wants_to_perform_automatic_action) {
                const unit_at_cursor_position = unit_at(battle, battle_position);
                const rune_at_cursor_position = rune_at(battle, battle_position);

                if (unit_at_cursor_position) {
                    if (unit_at_cursor_position != selection.unit) {
                        try_attack_target(selection.unit, battle_position, true);
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
            } else if (wants_to_attack_unconditionally) {
                try_attack_target(selection.unit, battle_position, false);
            }
        }
    }

    return true;
}

function setup_mouse_filter() {
    GameUI.SetMouseCallback((event, button) => {
        try {
            return filter_mouse_click(event, button);
        } catch (e) {
            $.Msg(e);

            return true;
        }
    });
}

function create_hero_card_ui_base(container: Panel, hero_type: Hero_Type, health: number, attack: number, move: number) {
    function create_stat_container(parent: Panel, id: string, value: number) {
        const stat_container = $.CreatePanel("Panel", parent, id);
        stat_container.AddClass("stat_container");

        $.CreatePanel("Panel", stat_container, "icon");

        const value_label = $.CreatePanel("Label", stat_container, "value");
        value_label.text = value.toString();
    }

    const art = $.CreatePanel("Image", container, "card_art");
    art.SetScaling(ScalingFunction.STRETCH_TO_FIT_Y_PRESERVE_ASPECT);
    art.SetImage(`file://{images}/custom_game/heroes/${get_hero_dota_name(hero_type)}.jpg`);

    const name_panel = $.CreatePanel("Panel", container, "name_panel");
    const hero_name = $.CreatePanel("Label", name_panel, "");

    hero_name.text = get_hero_dota_name(hero_type);

    const stat_panel = $.CreatePanel("Panel", container, "stat_panel");

    create_stat_container(stat_panel, "health", health);
    create_stat_container(stat_panel, "attack", attack);
    create_stat_container(stat_panel, "move_points", move);
}


function create_card_ui(root: Panel, card: Card) {
    const container = $.CreatePanel("Panel", root, "");
    container.style.position = `${hand_base_x - 400}px ${hand_base_y}px 0`;
    container.AddClass("card");

    switch (card.type) {
        case Card_Type.hero: {
            container.AddClass("hero");

            const definition = hero_definition_by_type(card.hero_type);

            create_hero_card_ui_base(container, card.hero_type, definition.health, definition.attack_damage, definition.move_points);

            break;
        }

        case Card_Type.existing_hero: {
            container.AddClass("hero");

            const unit = find_hero_by_id(battle, card.hero_id);

            if (unit) {
                create_hero_card_ui_base(container, unit.type, unit.max_health, unit.attack_damage, unit.max_move_points);
            }

            break;
        }

        case Card_Type.spell: {
            container.AddClass("spell");

            const name_panel = $.CreatePanel("Panel", container, "name_panel");
            const spell_name = $.CreatePanel("Label", name_panel, "");
            spell_name.text = get_spell_name(card.spell_id);

            const art = $.CreatePanel("Image", container, "card_art");
            art.SetScaling(ScalingFunction.STRETCH_TO_FIT_X_PRESERVE_ASPECT);
            art.SetImage(`file://{images}/${get_spell_card_art(card.spell_id)}`);

            const text_container = $.CreatePanel("Panel", container, "card_text");
            const text = $.CreatePanel("Label", text_container, "");

            text.text = get_spell_text(card);

            break;
        }

        case Card_Type.unknown: {
            break;
        }

        default: unreachable(card);
    }

    return container;
}

function add_card_panel(card: Card) {
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

    hand.push(card_panel);
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

    const cursor = GameUI.GetCursorPosition();

    if (!is_unit_selection(selection)) {
        const cursor_entity = get_entity_under_cursor(cursor);
        const cursor_entity_unit = find_unit_by_entity_id(battle, cursor_entity);

        if (cursor_entity_unit) {
            return cursor_entity_unit.position;
        }
    }

    const world_position = GameUI.GetScreenWorldPosition(cursor);

    if (!world_position) {
        return;
    }

    const battle_position = world_position_to_battle_position(world_position);

    const is_position_valid = battle_position.x >= 0 && battle_position.x < battle.grid_size.x && battle_position.y >= 0 && battle_position.y < battle.grid_size.y;

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
            const card_panel = $.CreatePanel("Panel", container, "");
            card_panel.AddClass("card");
            card_panel.AddClass("hero");
            card_panel.AddClass("in_preview");

            create_hero_card_ui_base(card_panel, unit.type, unit.max_health, unit.attack_damage, unit.max_move_points);

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

function update_hand() {
    const cursor = GameUI.GetCursorPosition();
    const [ cursor_x, cursor_y ] = cursor;

    let index = 0;

    if (selection.type == Selection_Type.card && !GameUI.IsMouseDown(0)) {
        if (hover.type == Hover_Type.cell || hover.type == Hover_Type.unit) {
            const card = selection.card_panel.card;

            try_use_card(card, hover, () => {
                for (let index = 0; index < hand.length; index++) {
                    if (hand[index].card.id == card.id) {
                        const card_panel = hand[index];

                        if (selection.type == Selection_Type.card && selection.card_panel == card_panel) {
                            drop_card_selection();
                        }

                        hand.splice(index, 1);

                        card_panel.panel.AddClass("override");
                        card_panel.panel.AddClass("disappearing_transition");
                        card_panel.panel.AddClass("disappearing");
                        card_panel.panel.DeleteAsync(0.4);

                        break;
                    }
                }
            });
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
        const y = this_card_hovered ? hand_base_y - 175 : hand_base_y ;
        card.panel.style.position = `${hand_base_x + index * 100 - (this_card_hovered ? 50 : 0)}px ${y}px 0`;

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

function highlight_grid_for_unit_ability_with_predicate(unit_id: number, ability_id: AbilityId, predicate: (ability: Ability_Active, cell: Cell) => boolean) {
    const unit = find_unit_by_id(battle, unit_id);

    if (!unit) return;

    const ability = find_unit_ability(unit, ability_id);

    if (!ability) return;

    if (ability.type == Ability_Type.passive) return;

    const outline: boolean[] = [];

    for (const cell of battle.cells) {
        if (predicate(ability, cell)) {
            outline[grid_cell_index(battle, cell.position)] = true;
        }
    }

    highlight_outline_temporarily(outline, color_red, 0.75);
}

function highlight_grid_for_targeted_ability(event: Grid_Highlight_Targeted_Ability_Event) {
    highlight_grid_for_unit_ability_with_predicate(
        event.unit_id,
        event.ability_id,
        (ability, cell) => ability_selector_fits(ability.targeting.selector, event.from, event.to, cell.position)
    );
}

function highlight_grid_for_no_target_ability(event: Grid_Highlight_No_Target_Ability_Event) {
    highlight_grid_for_unit_ability_with_predicate(
        event.unit_id,
        event.ability_id,
        (ability, cell) => ability_targeting_fits(battle, ability.targeting, event.from, cell.position)
    );
}

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

function try_select_unit_ability(unit: Unit, ability: Ability) {
    const ability_use = authorize_ability_use_with_error_ui(unit, ability);
    if (!ability_use) {
        return;
    }

    $.Msg("clicked ", get_ability_icon(ability.id));

    if (ability.type == Ability_Type.no_target) {
        take_battle_action({
            type: Action_Type.use_no_target_ability,
            unit_id: unit.id,
            ability_id: ability.id
        })
    } else {
        select_unit_ability(unit, ability);
    }
}

function setup_custom_ability_hotkeys() {
    // TODO check that unit belongs to the player

    function bind_ability_at_index_to_command(command: string, index: number) {
        GameUI.CustomUIConfig().register_key_bind(command, () => {
            if (selection.type == Selection_Type.unit) {
                const ability = selection.unit.abilities[index];

                if (!ability) return;

                try_select_unit_ability(selection.unit, ability);
            }
        });
    }

    bind_ability_at_index_to_command("AbilityPrimary1", 0);
    bind_ability_at_index_to_command("AbilityPrimary2", 1);
    bind_ability_at_index_to_command("AbilityPrimary3", 2);
    bind_ability_at_index_to_command("AbilityUltimate", 3);
}

function subscribe_to_custom_event<T extends object>(event_name: string, handler: (data: T) => void) {
    GameEvents.Subscribe(event_name, event_data => {
        handler(event_data as T);
    })
}

subscribe_to_net_table_key<Player_Net_Table>("main", "player", data => {
    if (current_state != data.state) {
        process_state_transition(current_state, data);

        current_state = data.state;
    }

    process_state_update(data);

    if (data.state == Player_State.in_battle) {
        update_grid_visuals();
    }
});

setup_mouse_filter();
setup_custom_ability_hotkeys();
periodically_update_ui();
periodically_update_stat_bar_display();
periodically_request_battle_deltas_when_in_battle();
subscribe_to_custom_event<Grid_Highlight_Targeted_Ability_Event>("grid_highlight_targeted_ability", highlight_grid_for_targeted_ability);
subscribe_to_custom_event<Grid_Highlight_No_Target_Ability_Event>("grid_highlight_no_target_ability", highlight_grid_for_no_target_ability);
subscribe_to_custom_event("show_start_turn_ui", show_start_turn_ui);