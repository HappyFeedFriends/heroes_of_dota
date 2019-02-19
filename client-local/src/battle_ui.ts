let current_selected_entity: EntityId | undefined = undefined;
let current_state = Player_State.not_logged_in;
let this_player_id: number;
let battle: UI_Battle;
let current_targeted_ability: AbilityId | undefined;
let current_hovered_ability: Ability_Id | undefined;

const current_targeted_ability_ui = $("#current_targeted_ability");

const control_panel: Control_Panel = {
    panel: $("#hero_rows"),
    hero_rows: []
};

const battle_cell_size = 128;

type UI_Unit_Data = {
    id: number
    level: number

    stat_bar_panel: Panel,
    level_ticks: Panel[],

    stat_health: Stat_Indicator
    stat_mana: Stat_Indicator
    stat_attack: Stat_Indicator
    stat_move_points: Stat_Indicator
    stat_max_move_points: Stat_Indicator
    stat_max_health: Stat_Indicator
    stat_max_mana: Stat_Indicator
}

type UI_Battle = Battle & {
    world_origin: XY;
    entity_id_to_unit_data: { [entity_id: number]: UI_Unit_Data },
    unit_id_to_facing: { [unit_id: number]: XY };
    cells: UI_Cell[];
    cell_index_to_unit: Unit[];
    outline_particles: ParticleId[];
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
    value: number
    displayed_value: number
    formatter(unit: Unit, value: number): string
}

type Hero_Panel_Stat_Indicator = {
    label: LabelPanel;
}

type Hero_Row = {
    unit_id: number;
    ability_buttons: Hero_Ability_Button[];
    health: Hero_Panel_Stat_Indicator;
    mana: Hero_Panel_Stat_Indicator;
    level: Hero_Panel_Stat_Indicator;
}

type Hero_Ability_Button = {
    ability: AbilityId;
    ability_panel: Panel;
    cooldown_layer: Panel;
}

type Cost_Population_Result = {
    cell_index_to_cost: number[];
    cell_index_to_parent_index: number[];
}

function find_unit_by_entity_id(battle: UI_Battle, entity_id: EntityId | undefined): Unit | undefined {
    if (entity_id == undefined) return;

    const unit_data = battle.entity_id_to_unit_data[entity_id];

    if (!unit_data) return;

    return find_unit_by_id(battle, unit_data.id);
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
    switch (delta.type) {
        case Delta_Type.unit_spawn: {
            battle.unit_id_to_facing[delta.unit_id] = delta.owner_id == this_player_id ? xy(0, 1) : xy(0, -1);

            break;
        }

        case Delta_Type.unit_move: {
            const unit = find_unit_by_id(battle, delta.unit_id);

            if (unit) {
                const path = find_grid_path(unit.position, delta.to_position);

                if (path) {
                    delta_paths[battle.delta_head] = path;

                    const to = delta.to_position;

                    battle.unit_id_to_facing[unit.id] = path.length > 1
                        ? xy_sub(to, path[path.length - 2])
                        : xy_sub(to, unit.position);
                }
            }

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
    }
}

function rebuild_cell_index_to_unit() {
    battle.cell_index_to_unit = [];

    for (const unit of battle.units) {
        if (!unit.dead) {
            battle.cell_index_to_unit[grid_cell_index(battle, unit.position)] = unit;
        }
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

        const flat_deltas = flatten_deltas([ delta ]);

        // $.Msg(flat_deltas);

        for (let flat_delta of flat_deltas) {
            update_related_visual_data_from_delta(flat_delta, delta_paths);
            collapse_delta(battle, flat_delta);

            if (flat_delta.type == Delta_Type.unit_spawn) {
                const spawned_unit = find_unit_by_id(battle, flat_delta.unit_id);

                if (spawned_unit && spawned_unit.owner_player_id == this_player_id) {
                    add_spawned_hero_to_control_panel(spawned_unit);
                }
            }
        }
    }

    for (const unit of battle.units) {
        update_hero_control_panel_state(unit);
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
        rebuild_cell_index_to_unit();
        update_grid_visuals();
    }
}

function take_battle_action(action: Turn_Action) {
    const request = {
        access_token: get_access_token(),
        action: action
    };

    remote_request<Take_Battle_Action_Request, Take_Battle_Action_Response>("/take_battle_action", request, response => {
        receive_battle_deltas(response.previous_head, response.deltas);
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

function process_state_transition(from: Player_State, new_state: Player_Net_Table) {
    $.Msg(`Transition from ${from} to ${new_state.state}`);

    if (from == Player_State.in_battle) {
        for (const cell of battle.cells) {
            Particles.DestroyParticleEffect(cell.associated_particle, true);
            Particles.ReleaseParticleIndex(cell.associated_particle);
        }
    }

    if (new_state.state == Player_State.in_battle) {
        battle = {
            players: from_server_array(new_state.battle.participants),
            units: [],
            delta_head: 0,
            grid_size: xy(new_state.battle.grid_size.width, new_state.battle.grid_size.height),
            turning_player_index: 0,
            deltas: [],
            world_origin: new_state.battle.world_origin,
            cells: [],
            cell_index_to_unit: [],
            entity_id_to_unit_data: {},
            unit_id_to_facing: {},
            outline_particles: []
        };

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

        $("#stat_bar_container").RemoveAndDeleteChildren();
    }
}

function populate_path_costs(from: XY, to: XY | undefined = undefined): Cost_Population_Result | undefined {
    const cell_index_to_cost: number[] = [];
    const cell_index_to_parent_index: number[] = [];
    const indices_already_checked: boolean[] = [];
    const from_index = grid_cell_index(battle, from);

    let indices_not_checked: number[] = [];

    indices_not_checked.push(from_index);
    indices_already_checked[from_index] = true;
    cell_index_to_cost[from_index] = 0;

    for (let current_cost = 0; indices_not_checked.length > 0; current_cost++) {
        const new_indices: number[] = [];

        for (const index of indices_not_checked) {
            const cell = battle.cells[index];
            const at = cell.position;

            cell_index_to_cost[index] = current_cost;

            if (to && xy_equal(to, at)) {
                return {
                    cell_index_to_cost: cell_index_to_cost,
                    cell_index_to_parent_index: cell_index_to_parent_index
                };
            }

            const neighbors = grid_cell_neighbors(battle, at);

            for (const neighbor of neighbors) {
                if (!neighbor) continue;

                const neighbor_cell_index = grid_cell_index(battle, neighbor.position);

                if (indices_already_checked[neighbor_cell_index]) continue;
                if (neighbor.occupied) {
                    indices_already_checked[neighbor_cell_index] = true;
                    continue;
                }

                new_indices.push(neighbor_cell_index);

                cell_index_to_parent_index[neighbor_cell_index] = index;
                indices_already_checked[neighbor_cell_index] = true;
            }
        }

        indices_not_checked = new_indices;
    }

    if (to) {
        return undefined;
    } else {
        return {
            cell_index_to_cost: cell_index_to_cost,
            cell_index_to_parent_index: cell_index_to_parent_index
        };
    }
}

function find_grid_path(from: XY, to: XY): XY[] | undefined {
    const cell_from = grid_cell_at(battle, from);
    const cell_to = grid_cell_at(battle, to);

    if (!cell_from || !cell_to) {
        return;
    }

    const populated = populate_path_costs(from, to);

    if (!populated) {
        return;
    }

    let current_cell_index = populated.cell_index_to_parent_index[grid_cell_index(battle, to)];
    const to_index = grid_cell_index(battle, from);
    const path = [];

    path.push(to);

    while (to_index != current_cell_index) {
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

function get_current_highlight_ability_id(): Ability_Id | undefined {
    return current_targeted_ability != undefined ? current_targeted_ability : current_hovered_ability;
}

function highlight_outline(cell_index_to_highlight: boolean[], color: XYZ): ParticleId[] {
    const cell_index_to_edges: Array<{ edge: Edge, from: XY, to: XY, deleted: boolean }[]> = [];
    const unique_edges: { edge: Edge, from: XY, to: XY, deleted: boolean }[] = [];

    function merge_edges(at: XY, going_towards: Edge, right_relative: number | undefined, left_relative: number | undefined, index: number) {
        const right_neighbor = right_relative && cell_index_to_edges[right_relative];
        const right_edge = right_neighbor && right_neighbor.find(old => old.edge == going_towards);
        const left_neighbor = left_relative && cell_index_to_edges[left_relative];
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

                merge_edges(cell.position, edge, right, left, index);
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

function update_grid_visuals() {
    $.Msg("Update grid visuals");

    const highlighted_ability = get_current_highlight_ability_id();
    const selected_unit = find_unit_by_entity_id(battle, current_selected_entity);
    const selected_entity_path = selected_unit ? populate_path_costs(selected_unit.position) : undefined;

    function color_cell(cell: UI_Cell, color: XYZ, alpha: number) {
        Particles.SetParticleControl(cell.associated_particle, 2, color);
        Particles.SetParticleControl(cell.associated_particle, 3, [ alpha, 0, 0 ]);
    }

    const your_turn = this_player_id == battle.players[battle.turning_player_index].id;

    const cell_index_to_highlight: boolean[] = [];

    for (const cell of battle.cells) {
        const index = grid_cell_index(battle, cell.position);

        let cell_color: XYZ = color_nothing;
        let alpha = 20;

        if (selected_unit && selected_entity_path && highlighted_ability == undefined) {
            const cost = selected_entity_path.cell_index_to_cost[index];

            if (cost <= selected_unit.move_points && !selected_unit.has_taken_an_action_this_turn) {
                cell_color = color_green;
                alpha = 35;
            }
        }

        const unit_in_cell = battle.cell_index_to_unit[index];

        if (unit_in_cell) {
            const is_ally = unit_in_cell.owner_player_id == this_player_id;

            if (is_ally) {
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

            alpha = 50;

            if (selected_unit == unit_in_cell) {
                alpha = 255;
            }
        }

        if (selected_unit && highlighted_ability != undefined) {
            const ability = find_unit_ability(selected_unit, highlighted_ability);

            if (ability) {
                switch (ability.type) {
                    case Ability_Type.target_ground: {
                        if (can_ability_be_cast_at_target_from_source(ability.targeting, selected_unit.position, cell.position)) {
                            alpha = 20;
                            cell_color = color_red;

                            cell_index_to_highlight[index] = true;
                        }

                        break;
                    }

                    case Ability_Type.target_unit: {
                        if (can_ability_be_cast_at_target_from_source(ability.targeting, selected_unit.position, cell.position)) {
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
                        const targeting = ability.targeting;

                        switch (targeting.type) {
                            case Ability_Targeting_Type.rectangular_area_around_caster: {
                                if (rectangular(selected_unit.position, cell.position) <= targeting.area_radius) {
                                    alpha = 140;
                                    cell_color = color_red;
                                }

                                break;
                            }

                            case Ability_Targeting_Type.unit_in_manhattan_distance: {
                                if (manhattan(selected_unit.position, cell.position) <= targeting.distance) {
                                    alpha = 140;
                                    cell_color = color_red;
                                }

                                break;
                            }

                            default: unreachable(targeting);
                        }
                    }
                }
            }
        }

        color_cell(cell, cell_color, alpha);
    }

    for (const old_particle of battle.outline_particles) {
        Particles.DestroyParticleEffect(old_particle, false);
        Particles.ReleaseParticleIndex(old_particle);
    }

    if (cell_index_to_highlight.length > 0) {
        battle.outline_particles = highlight_outline(cell_index_to_highlight, color_red);

        for (const particle of battle.outline_particles) {
            register_particle_for_reload(particle);
        }
    } else {
        battle.outline_particles = [];
    }
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
function end_turn() {
    take_battle_action({
        type: Action_Type.end_turn
    });
}

function create_ui_unit_data(data: Shared_Visualizer_Unit_Data): UI_Unit_Data {
    const panel = $.CreatePanel("Panel", $("#stat_bar_container"), "");
    panel.AddClass("unit_stat_bar");

    const level_bar = $.CreatePanel("Panel", panel, "level_bar");
    const [ health, max_health ] = stat_indicator_ui(
        data.health,
        data.max_health,
        "health_container",
        "health_icon",
        "health_label",
        "max_health_label"
    );

    const [ mana, max_mana ] = stat_indicator_ui(
        data.mana,
        data.max_mana,
        "mana_container",
        "mana_icon",
        "mana_label",
        "max_mana_label"
    );

    const [ move_points, max_move_points ] = stat_indicator_ui(
        data.move_points,
        data.max_move_points,
        "move_points_container",
        "move_points_icon",
        "move_points_label",
        "max_move_points_label"
    );

    const attack_container = $.CreatePanel("Panel", panel, "attack_container");
    const attack_label = $.CreatePanel("Label", attack_container, "attack_label");
    $.CreatePanel("Panel", attack_container, "attack_icon").AddClass("stat_icon");
    attack_container.AddClass("container");

    const level_ticks: Panel[] = [];

    function stat_indicator(label: LabelPanel, value: number): Stat_Indicator {
        return {
            displayed_value: value,
            value: value,
            label: label,
            formatter: (unit, value) => value.toString()
        }
    }

    function stat_indicator_ui(value: number, max_value: number, container_id: string, icon_id: string, label_id: string, max_label_id: string) {
        const container = $.CreatePanel("Panel", panel, container_id);
        const value_label = $.CreatePanel("Label", container, label_id);

        $.CreatePanel("Label", container, "separator").text = "/";

        const max_value_label = $.CreatePanel("Label", container, max_label_id);

        container.AddClass("container");
        value_label.AddClass("value_label");
        max_value_label.AddClass("value_label");

        $.CreatePanel("Panel", container, icon_id).AddClass("stat_icon");

        return [
            stat_indicator(value_label, value),
            stat_indicator(max_value_label, max_value)
        ]
    }

    for (let index = 0; index < max_unit_level; index++) {
        const level_tick = $.CreatePanel("Panel", level_bar, "");
        level_tick.AddClass("level_tick");
        level_ticks.push(level_tick);
    }

    return {
        id: data.id,
        stat_health: health,
        stat_mana: mana,
        stat_attack: {
            displayed_value: data.attack_bonus,
            value: data.attack_bonus,
            label: attack_label,
            formatter: (unit, value) => get_unit_attack_value(unit, value).toString()
        },
        stat_move_points: move_points,
        stat_max_move_points: max_move_points,
        stat_max_health: max_health,
        stat_max_mana: max_mana,
        level: data.level,
        stat_bar_panel: panel,
        level_ticks: level_ticks
    }
}

function update_unit_stat_bar_data(data: UI_Unit_Data) {
    if (data.stat_health.value != data.stat_health.displayed_value) {
        const which_animation = data.stat_health.value < data.stat_health.displayed_value ? "animate_damage" : "animate_heal";

        data.stat_health.label.RemoveClass("animate_damage");
        data.stat_health.label.RemoveClass("animate_heal");
        data.stat_health.label.AddClass(which_animation);
    }

    data.level_ticks.forEach((tick, index) => {
        tick.SetHasClass("active", index < data.level);
    });

    function try_find_and_update_associated_unit() {
        const unit = find_unit_by_id(battle, data.id);

        if (unit) {
            try_update_stat_bar_display(data, true);

            data.stat_bar_panel.SetHasClass("enemy", unit.owner_player_id != this_player_id);
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

    this_player_id = state.id;

    if (battle && state.state == Player_State.in_battle) {
        const leftover_entity_ids = Object.keys(battle.entity_id_to_unit_data);

        for (const entity_id in state.battle.entity_id_to_unit_data) {
            const new_data = state.battle.entity_id_to_unit_data[entity_id];
            const existing_data = battle.entity_id_to_unit_data[entity_id];
            const present_id_index = leftover_entity_ids.indexOf(entity_id);

            if (present_id_index != -1) {
                leftover_entity_ids.splice(present_id_index, 1);
            }

            if (existing_data) {
                existing_data.level = new_data.level;
                existing_data.stat_health.value = new_data.health;
                existing_data.stat_max_health.value = new_data.max_health;
                existing_data.stat_mana.value = new_data.mana;
                existing_data.stat_max_mana.value = new_data.max_mana;
                existing_data.stat_move_points.value = new_data.move_points;
                existing_data.stat_max_move_points.value = new_data.max_move_points;
                existing_data.stat_attack.value = new_data.attack_bonus;

                update_unit_stat_bar_data(existing_data);
            } else {
                const created_data = create_ui_unit_data(new_data);
                update_unit_stat_bar_data(created_data);

                battle.entity_id_to_unit_data[entity_id] = created_data;
            }
        }

        if (leftover_entity_ids.length > 0) {
            $.Msg(`Cleaning up ${leftover_entity_ids.length} unit data entries`);
        }

        for (const leftover_id_string of leftover_entity_ids) {
            const leftover_id = Number(leftover_id_string);

            if (current_selected_entity == leftover_id) {
                const old_selected_unit_data = battle.entity_id_to_unit_data[leftover_id];

                for (const new_entity_id in state.battle.entity_id_to_unit_data) {
                    const new_data = state.battle.entity_id_to_unit_data[new_entity_id];

                    if (new_data.id == old_selected_unit_data.id) {
                        set_current_selected_entity(Number(new_entity_id));

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

function try_order_unit_to_move(unit: Unit, move_where: XY) {
    const path = find_grid_path(unit.position, move_where);

    if (path && path.length <= unit.move_points) {
        take_battle_action({
            type: Action_Type.move,
            to: move_where,
            unit_id: unit.id
        });

        const cell_index_to_highlight: boolean[] = [];

        for (const point of path) {
            cell_index_to_highlight[grid_cell_index(battle, point)] = true;
        }

        highlight_outline_temporarily(cell_index_to_highlight, color_green, 0.5);
    } else {
        show_generic_error("Out of move range");
    }
}

function make_battle_snapshot(): Battle_Snapshot {
    return {
        units: battle.units
            .filter(unit => !unit.dead)
            .map(unit => ({
                id: unit.id,
                level: unit[Unit_Field.level],
                health: unit.health,
                max_health: unit[Unit_Field.max_health],
                max_mana: unit[Unit_Field.max_mana],
                move_points: unit.move_points,
                max_move_points: unit[Unit_Field.max_move_points],
                mana: unit.mana,
                position: unit.position,
                type: unit.type,
                facing: battle.unit_id_to_facing[unit.id],
                stunned_counter: unit[Unit_Field.state_stunned_counter],
                owner_id: unit.owner_player_id,
                attack_bonus: unit[Unit_Field.attack_bonus]
            })),
        delta_head: battle.delta_head
    }
}

function clear_control_panel() {
    $("#hero_rows").RemoveAndDeleteChildren();

    control_panel.hero_rows = [];
}

function get_ability_icon(ability_id: Ability_Id): string {
    switch (ability_id) {
        case Ability_Id.basic_attack: return "juggernaut_blade_dance";
        case Ability_Id.pudge_hook: return "pudge_meat_hook";
        case Ability_Id.pudge_rot: return "pudge_rot";
        case Ability_Id.pudge_flesh_heap: return "pudge_flesh_heap";
        case Ability_Id.pudge_dismember: return "pudge_dismember";
        case Ability_Id.sniper_shrapnel: return "sniper_shrapnel";
        case Ability_Id.tide_gush: return "tidehunter_gush";
        case Ability_Id.tide_anchor_smash: return "tidehunter_anchor_smash";
        case Ability_Id.tide_kraken_shell: return "tidehunter_kraken_shell";
        case Ability_Id.tide_ravage: return "tidehunter_ravage";
        case Ability_Id.luna_lucent_beam: return "luna_lucent_beam";
        case Ability_Id.luna_moon_glaive: return "luna_moon_glaive";
        case Ability_Id.luna_lunar_blessing: return "luna_lunar_blessing";
        case Ability_Id.luna_eclipse: return "luna_eclipse";
    }

    return unreachable(ability_id);
}

function get_hero_name(type: Unit_Type): string {
    switch (type) {
        case Unit_Type.sniper: return "sniper";
        case Unit_Type.pudge: return "pudge";
        case Unit_Type.ursa: return "ursa";
        case Unit_Type.tidehunter: return "tidehunter";
        case Unit_Type.luna: return "luna";

        default: return unreachable(type);
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

function get_full_unit_icon_path(type: Unit_Type): string {
    return `file://{images}/heroes/npc_dota_hero_${get_hero_name(type)}.png`;
}

function add_spawned_hero_to_control_panel(unit: Unit) {
    function create_indicator(parent: Panel, id: string, value: number): Hero_Panel_Stat_Indicator {
        const indicator = $.CreatePanel("Panel", parent, id);
        const label = $.CreatePanel("Label", indicator, "");

        indicator.AddClass("indicator");
        label.text = value.toString();

        return {
            label: label
        }
    }

    const hero_row = $.CreatePanel("Panel", control_panel.panel, "");
    hero_row.AddClass("hero_row");

    const portrait = $.CreatePanel("Panel", hero_row, "hero_portrait");
    const abilities = $.CreatePanel("Panel", hero_row, "ability_row");

    safely_set_panel_background_image(portrait, get_full_unit_icon_path(unit.type));

    const indicators = $.CreatePanel("Panel", portrait, "indicators");

    const level = create_indicator(indicators, "level_indicator", unit[Unit_Field.level]);
    const health = create_indicator(indicators, "health_indicator", unit.health);
    const mana = create_indicator(indicators, "mana_indicator", unit.mana);

    const ability_buttons: Hero_Ability_Button[] = [];

    for (const ability of unit.abilities) {
        const ability_panel = $.CreatePanel("Button", abilities, "");
        ability_panel.AddClass("ability_button");

        ability_panel.SetPanelEvent(PanelEvent.ON_LEFT_CLICK, () => {
            const entity_data = find_unit_entity_data_by_unit_id(battle, unit.id);

            if (entity_data) {
                const [ id ] = entity_data;

                set_current_selected_entity(id);
                try_select_unit_ability(unit, ability);
            }
        });

        ability_panel.SetPanelEvent(PanelEvent.ON_MOUSE_OVER, () => {
            const selected = find_unit_by_entity_id(battle, current_selected_entity);

            if (selected && selected.id == unit.id) {
                set_current_hovered_ability(ability.id);
            }
        });

        ability_panel.SetPanelEvent(PanelEvent.ON_MOUSE_OUT, () => {
            if (current_hovered_ability == ability.id) {
                set_current_hovered_ability(undefined);
            }
        });

        const ability_image = $.CreatePanel("Panel", ability_panel, "ability_image");
        safely_set_panel_background_image(ability_image, get_full_ability_icon_path(ability.id));

        const cooldown_layer = $.CreatePanel("Panel", ability_panel, "cooldown_layer");

        ability_buttons.push({
            ability: ability.id,
            ability_panel: ability_panel,
            cooldown_layer: cooldown_layer
        })
    }

    const new_row: Hero_Row = {
        unit_id: unit.id,
        ability_buttons: ability_buttons,
        health: health,
        mana: mana,
        level: level
    };

    control_panel.hero_rows.push(new_row);
}

function update_current_turning_player_indicator() {
    const label = $("#current_turning_player_label") as LabelPanel;

    label.text = `${battle.players[battle.turning_player_index].name}'s turn`;
}

function update_hero_control_panel_state(unit: Unit) {
    const row = control_panel.hero_rows.find(row => row.unit_id == unit.id);

    if (!row) return;

    // TODO Might be worth it to try and granularly update labels. But probably not
    row.health.label.text = unit.health.toString();
    row.mana.label.text = unit.mana.toString();
    row.level.label.text = unit[Unit_Field.level].toString();

    for (const ability_button of row.ability_buttons) {
        const ability = find_unit_ability(unit, ability_button.ability);

        if (!ability) continue;
        if (ability.id == Ability_Id.basic_attack) continue;

        const is_available = unit[Unit_Field.level] >= ability.available_since_level;

        ability_button.ability_panel.SetHasClass("not_learned", !is_available);

        if (is_available && ability.type != Ability_Type.passive) {
            const on_cooldown = ability.cooldown_remaining > 0;
            const not_enough_mana = ability.mana_cost > unit.mana;

            ability_button.ability_panel.SetHasClass("on_cooldown", on_cooldown);
            ability_button.ability_panel.SetHasClass("not_enough_mana", !on_cooldown && not_enough_mana);
        }
    }
}

function set_current_targeted_ability(new_ability_id: Ability_Id | undefined) {
    const should_update = current_targeted_ability != new_ability_id;

    current_targeted_ability = new_ability_id;

    if (!should_update) {
        return;
    }

    update_grid_visuals();

    const is_ui_visible = current_targeted_ability != undefined;

    current_targeted_ability_ui.SetHasClass("visible", is_ui_visible);

    if (is_ui_visible) {
        const selected_unit = find_unit_by_entity_id(battle, current_selected_entity);

        if (selected_unit) {
            safely_set_panel_background_image(current_targeted_ability_ui.FindChild("hero"), get_full_unit_icon_path(selected_unit.type));
            safely_set_panel_background_image(current_targeted_ability_ui.FindChild("image"), get_full_ability_icon_path(current_targeted_ability!));
        }
    }
}

function set_current_selected_entity(new_entity_id: EntityId | undefined, full_stats = false) {
    if (current_selected_entity) {
        const unit_data = battle.entity_id_to_unit_data[current_selected_entity];

        if (unit_data) {
            unit_data.stat_bar_panel.RemoveClass("show_additional_stats");
            unit_data.stat_bar_panel.RemoveClass("show_full_stats");
        }
    }

    current_selected_entity = new_entity_id;

    if (current_selected_entity) {
        const unit_data = battle.entity_id_to_unit_data[current_selected_entity];

        if (unit_data) {
            unit_data.stat_bar_panel.AddClass("show_additional_stats");
            unit_data.stat_bar_panel.SetHasClass("show_full_stats", full_stats);
        }
    } else {
        set_current_targeted_ability(undefined);
    }
}

function set_current_hovered_ability(new_ability_id: Ability_Id | undefined) {
    current_hovered_ability = new_ability_id;

    update_grid_visuals();
}

function update_current_ability_based_on_cursor_state() {
    const click_behaviors = GameUI.GetClickBehaviors();

    switch (click_behaviors) {
        case CLICK_BEHAVIORS.DOTA_CLICK_BEHAVIOR_ATTACK: {
            if (current_selected_entity != undefined) {
                set_current_targeted_ability(Ability_Id.basic_attack);
            }

            break;
        }

        default: {
            if (current_targeted_ability == Ability_Id.basic_attack) {
                set_current_targeted_ability(undefined);
            }

            break;
        }
    }
}

function get_unit_attack_value(unit: Unit, bonus: number) {
    const base_value = unit.attack.id == Ability_Id.basic_attack ? unit.attack.damage : 0;

    return base_value + bonus;
}

function try_update_stat_bar_display(ui_data: UI_Unit_Data, force = false) {
    const unit = find_unit_by_id(battle, ui_data.id);

    if (!unit) return;

    function try_update_stat_indicator(stat_indicator: Stat_Indicator) {
        if (force) {
            stat_indicator.label.text = stat_indicator.formatter(unit!, stat_indicator.displayed_value);
        } else if (stat_indicator.value != stat_indicator.displayed_value) {
            const direction = Math.sign(stat_indicator.value - stat_indicator.displayed_value);

            stat_indicator.displayed_value += direction;
            stat_indicator.label.text = stat_indicator.formatter(unit!, stat_indicator.displayed_value);
        }
    }

    try_update_stat_indicator(ui_data.stat_attack);
    try_update_stat_indicator(ui_data.stat_health);
    try_update_stat_indicator(ui_data.stat_max_health);
    try_update_stat_indicator(ui_data.stat_mana);
    try_update_stat_indicator(ui_data.stat_max_mana);
    try_update_stat_indicator(ui_data.stat_move_points);
    try_update_stat_indicator(ui_data.stat_max_move_points);
}

function update_stat_bar_positions() {
    const screen_ratio = Game.GetScreenHeight() / 1080;

    // TODO with the fixed camera we can have the luxury of updating only when units actually move
    for (const entity_id_string in battle.entity_id_to_unit_data) {
        const entity_id = Number(entity_id_string); // TODO holy shit why javascript, why
        const unit_data = battle.entity_id_to_unit_data[entity_id_string];
        const entity_origin = Entities.GetAbsOrigin(entity_id);

        if (!entity_origin) continue;

        const offset = -40;

        const screen_x = Game.WorldToScreenX(entity_origin[0] + 30, entity_origin[1], entity_origin[2] + offset);
        const screen_y = Game.WorldToScreenY(entity_origin[0] + 30, entity_origin[1], entity_origin[2] + offset);

        if (screen_x == -1 || screen_y == -1) {
            continue
        }

        unit_data.stat_bar_panel.style.x = Math.floor(screen_x / screen_ratio) - unit_data.stat_bar_panel.actuallayoutwidth / 2.0 + "px";
        unit_data.stat_bar_panel.style.y = Math.floor(screen_y / screen_ratio) + "px";
    }
}

function periodically_update_ui() {
    $.Schedule(0, periodically_update_ui);

    if (current_state != Player_State.in_battle) return;

    update_current_ability_based_on_cursor_state();
    update_stat_bar_positions();

    if (current_targeted_ability != undefined) {
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

function try_attack_target(source: Unit, target: XY, flash_ground_on_error: boolean) {
    if (source.attack.type == Ability_Type.target_ground) {
        if (!can_ability_be_cast_at_target_from_source(source.attack.targeting, source.position, target)) {
            show_ability_error(Ability_Error.invalid_target);

            if (flash_ground_on_error) {
                const cell_index_to_highlight: boolean[] = [];

                for (const cell of battle.cells) {
                    const index = grid_cell_index(battle, cell.position);

                    if (can_ability_be_cast_at_target_from_source(source.attack.targeting, source.position, cell.position)) {
                        cell_index_to_highlight[index] = true;
                    }
                }

                highlight_outline_temporarily(cell_index_to_highlight, color_red, 0.2);
            }

            return;
        }
    }

    take_battle_action({
        type: Action_Type.ground_target_ability,
        ability_id: source.attack.id,
        unit_id: source.id,
        to: target
    })
}

function setup_mouse_filter() {
    GameUI.SetMouseCallback((event, button) => {
        if (current_state != Player_State.in_battle) {
            return false;
        }

        if (event == "pressed" || event == "doublepressed") {
            const click_behaviors = GameUI.GetClickBehaviors();
            const cursor = GameUI.GetCursorPosition();
            const world_position = GameUI.GetScreenWorldPosition(cursor);
            const battle_position = world_position_to_battle_position(world_position);
            const cursor_entity = get_entity_under_cursor(cursor);
            const cursor_entity_unit = find_unit_by_entity_id(battle, cursor_entity);
            const selected_unit = find_unit_by_entity_id(battle, current_selected_entity);

            if (current_selected_entity != undefined && current_targeted_ability != undefined) {
                const wants_to_use_ability =
                    button == MouseButton.LEFT;

                const wants_to_cancel =
                    button == MouseButton.RIGHT;

                if (!selected_unit) {
                    return true;
                }

                if (wants_to_cancel) {
                    set_current_targeted_ability(undefined);

                    if (click_behaviors != CLICK_BEHAVIORS.DOTA_CLICK_BEHAVIOR_NONE) {
                        return false;
                    }
                } else if (wants_to_use_ability) {
                    if (!selected_unit) return true;

                    const ability = find_unit_ability(selected_unit, current_targeted_ability);

                    if (!ability) return true;

                    switch (ability.type) {
                        case Ability_Type.target_ground: {
                            if (can_ability_be_cast_at_target_from_source(ability.targeting, selected_unit.position, battle_position)) {
                                take_battle_action({
                                    type: Action_Type.ground_target_ability,
                                    unit_id: selected_unit.id,
                                    ability_id: current_targeted_ability,
                                    to: battle_position
                                });
                            } else {
                                show_ability_error(Ability_Error.invalid_target);

                                return true;
                            }

                            break;
                        }

                        case Ability_Type.target_unit: {
                            if (can_ability_be_cast_at_target_from_source(ability.targeting, selected_unit.position, battle_position) && cursor_entity_unit) {
                                take_battle_action({
                                    type: Action_Type.unit_target_ability,
                                    unit_id: selected_unit.id,
                                    ability_id: current_targeted_ability,
                                    target_id: cursor_entity_unit.id
                                });
                            } else {
                                show_ability_error(Ability_Error.invalid_target);

                                return true;
                            }
                        }

                        case Ability_Type.no_target:
                        case Ability_Type.passive: {
                            break;
                        }

                        default: unreachable(ability);
                    }

                    set_current_targeted_ability(undefined);
                }

                return true;
            }

            const wants_to_select_unit =
                button == MouseButton.LEFT &&
                click_behaviors == CLICK_BEHAVIORS.DOTA_CLICK_BEHAVIOR_NONE;

            const wants_to_perform_automatic_action =
                button == MouseButton.RIGHT &&
                click_behaviors == CLICK_BEHAVIORS.DOTA_CLICK_BEHAVIOR_NONE;

            const wants_to_move_unconditionally =
                current_selected_entity != undefined &&
                button == MouseButton.LEFT &&
                click_behaviors == CLICK_BEHAVIORS.DOTA_CLICK_BEHAVIOR_MOVE;

            const wants_to_attack_unconditionally =
                current_selected_entity != undefined &&
                button == MouseButton.LEFT &&
                click_behaviors == CLICK_BEHAVIORS.DOTA_CLICK_BEHAVIOR_ATTACK;

            const wants_to_cancel_current_behavior =
                button == MouseButton.RIGHT &&
                click_behaviors != CLICK_BEHAVIORS.DOTA_CLICK_BEHAVIOR_NONE;

            if (wants_to_cancel_current_behavior) {
                return false;
            }

            if (wants_to_select_unit) {
                set_current_selected_entity(cursor_entity, event == "doublepressed");

                if (cursor_entity) {
                    const particle = Particles.CreateParticle("particles/ui_mouseactions/select_unit.vpcf", ParticleAttachment_t.PATTACH_ABSORIGIN_FOLLOW, cursor_entity);

                    Particles.SetParticleControl(particle, 1, [ 255, 255, 255 ]);
                    Particles.SetParticleControl(particle, 2, [ 64, 255, 0 ]);
                    Particles.ReleaseParticleIndex(particle);
                }

                update_grid_visuals();

                return true;
            }

            if (!selected_unit) {
                return true;
            }

            // TODO before taking an action we should first check if we can perform it and display an error if not
            if (wants_to_perform_automatic_action) {
                if (cursor_entity_unit) {
                    if (cursor_entity != current_selected_entity) {
                        try_attack_target(selected_unit, cursor_entity_unit.position, true);
                    }
                } else {
                    try_order_unit_to_move(selected_unit, battle_position);
                    move_order_particle(world_position);
                }
            } else if (wants_to_move_unconditionally) {
                try_order_unit_to_move(selected_unit, battle_position);
                move_order_particle(world_position);
            } else if (wants_to_attack_unconditionally) {
                try_attack_target(selected_unit, battle_position, false);
            }
        }

        return true;
    });
}


type Ability_Error_Reason = {
    reason: number,
    message?: string
};

function ability_error_to_reason(error: Ability_Error): Ability_Error_Reason {
    // 24 - silenced
    // 25 - can't move
    // 30 - can't be attacked
    // 41 - can't attack
    // 46 - target out of range
    // 48 - can't target that
    // 62 - secret shop not in range
    // 63 - not enough gold
    // 74 - can't act
    // 75 - muted
    // 77 - target immune to magic
    // 80 - custom "message" argument
    function native(reason: number, message?: string): Ability_Error_Reason {
        return { reason: reason, message: message };
    }

    function custom(message: string) {
        return { reason: 80, message: message };
    }

    switch (error) {
        case Ability_Error.other: return native(0); // TODO
        case Ability_Error.dead: return native(20);
        case Ability_Error.no_mana: return native(14);
        case Ability_Error.on_cooldown: return native(15);
        case Ability_Error.invalid_target: return custom("Target is out of range");
        case Ability_Error.not_learned_yet: return native(16);
        case Ability_Error.already_acted_this_turn: return custom("Already acted this turn");
        case Ability_Error.stunned: return custom("Stunned");

        default: return unreachable(error);
    }
}

function show_ability_error(error: Ability_Error) {
    GameEvents.SendEventClientSide("dota_hud_error_message", ability_error_to_reason(error));
}

function show_generic_error(error: string) {
    GameEvents.SendEventClientSide("dota_hud_error_message", { reason: 80, message: error });
}

function try_select_unit_ability(unit: Unit, ability: Ability) {
    const ability_use = authorize_ability_use_by_unit(unit, ability.id);

    $.Msg("clicked ", get_ability_icon(ability.id), " ", ability_use);

    if (ability_use.success) {
        if (ability.type == Ability_Type.no_target) {
            take_battle_action({
                type: Action_Type.use_no_target_ability,
                unit_id: unit.id,
                ability_id: ability.id
            })
        } else {
            set_current_targeted_ability(ability.id);
        }
    } else {
        show_ability_error(ability_use.error);
    }
}

function setup_custom_ability_hotkeys() {
    // TODO check that unit belongs to the player

    function bind_ability_at_index_to_command(command: string, index: number) {
        GameUI.CustomUIConfig().register_key_bind(command, () => {
            const unit = find_unit_by_entity_id(battle, current_selected_entity);

            if (!unit) {
                return;
            }

            const ability = unit.abilities[index];

            if (!ability) return;

            try_select_unit_ability(unit, ability);
        });
    }

    bind_ability_at_index_to_command("AbilityPrimary1", 0);
    bind_ability_at_index_to_command("AbilityPrimary2", 1);
    bind_ability_at_index_to_command("AbilityPrimary3", 2);
    bind_ability_at_index_to_command("AbilityUltimate", 3);
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