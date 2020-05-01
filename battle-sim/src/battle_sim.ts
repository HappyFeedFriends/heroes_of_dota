declare const enum Battle_Status {
    not_started = 0,
    in_progress = 1,
    finished = 2
}

declare const enum Pathing_Flag {
    ignore_runes = 0,
    pass_through_units = 1
}

type Source = {
    type: Source_Type.none
}| {
    type: Source_Type.unit
    unit: Unit
    ability_id: Ability_Id
} | {
    type: Source_Type.player
    player: Battle_Player
} | {
    type: Source_Type.item
    item_id: Item_Id
} | {
    type: Source_Type.modifier
    applied: Applied_Modifier
} | {
    type: Source_Type.adventure_item
    item_id: Adventure_Item_Id
}

type Battle = {
    state: {
        status: Battle_Status.not_started
    } | {
        status: Battle_Status.in_progress
    } | {
        status: Battle_Status.finished
        winner?: Battle_Player
    }
    delta_head: number
    units: Unit[]
    runes: Rune[]
    shops: Shop[]
    trees: Tree[]
    players: Battle_Player[]
    deltas: Delta[]
    turning_player: Battle_Player
    grid: Grid<Cell>
    receive_event: (battle: Battle, event: Battle_Event) => void
    event_queue: Battle_Event[]
    timed_effects: Active_Timed_Effect[]
}

type Battle_Player = {
    id: Battle_Player_Id
    hand: Card[]
    gold: number
    has_used_a_card_this_turn: boolean
    deployment_zone: Deployment_Zone
    map_entity: Battle_Participant_Map_Entity
}

const enum Battle_Event_Type {
    health_changed,
    modifier_applied,
    card_added_to_hand,
    unit_spawned
}

type Battle_Event = {
    type: Battle_Event_Type.health_changed
    source: Source
    target: Unit
    change: Health_Change
    dead: boolean
} | {
    type: Battle_Event_Type.modifier_applied
    target: Unit
    modifier: Applied_Modifier
} | {
    type: Battle_Event_Type.card_added_to_hand
    player: Battle_Player
    card: Card
} | {
    type: Battle_Event_Type.unit_spawned
    source: Source
    unit: Unit
    at: XY
}

type Active_Timed_Effect = {
    handle_id: Effect_Handle_Id
    duration_remaining: number
    content: Timed_Effect
}

type Cell = Cell_Like & {
    cost: number
}

type Unit_Base = Unit_Stats & Unit_Abilities & {
    id: Unit_Id
    dead: boolean
    position: XY
    has_taken_an_action_this_turn: boolean
    modifiers: Applied_Modifier[]
}

type Unit = Hero | Monster | Creep

type Hero =  Unit_Base & {
    type: Hero_Type
    supertype: Unit_Supertype.hero
    owner: Battle_Player
    level: number
}

type Monster = Unit_Base & {
    supertype: Unit_Supertype.monster
}

type Creep = Unit_Base & {
    type: Creep_Type
    supertype: Unit_Supertype.creep
    owner: Battle_Player
    is_a_summon: boolean
}

type Rune = {
    type: Rune_Type
    id: Rune_Id
    position: XY
}

type Shop = {
    id: Shop_Id
    type: Shop_Type
    position: XY
    items: Item_Id[]
}

type Tree = {
    id: Tree_Id
    position: XY
}

type Applied_Modifier = {
    handle_id: Modifier_Handle_Id
    source: Source
    modifier: Modifier
    duration_remaining?: number
}

type Cost_Population_Result = {
    cell_index_to_cost: number[]
    cell_index_to_parent_index: Cell_Index[]
}

type Grid<T extends Cell_Like> = {
    size: XY
    cells: T[]
}

type Cell_Like = {
    position: XY
    occupants: number
};

declare const enum Const {
    max_unit_level = 3,
    shop_range = 1
}

function xy(x: number, y: number): XY {
    return { x: x, y: y };
}

function xy_equal(a: XY, b: XY) {
    return a.x == b.x && a.y == b.y;
}

function xy_sub(b: XY, a: XY) {
    return xy(b.x - a.x, b.y - a.y);
}

function unreachable(x: never): never {
    throw new Error("Didn't expect to get here");
}

function grid_cell_at_raw<T extends Cell_Like>(grid: Grid<T>, x: number, y: number): T | undefined {
    if (x < 0 || x >= grid.size.x || y < 0 || y >= grid.size.y) {
        return undefined;
    }

    return grid.cells[x * grid.size.y + y];
}

function grid_cell_at<T extends Cell_Like>(grid: Grid<T>, at: XY): T | undefined {
    return grid_cell_at_raw(grid, at.x, at.y);
}

function grid_cell_index_raw<T extends Cell_Like>(grid: Grid<T>, x: number, y: number): Cell_Index | undefined {
    if (x < 0 || x >= grid.size.x || y < 0 || y >= grid.size.y) {
        return undefined;
    }

    return x * grid.size.y + y as Cell_Index;
}

function grid_cell_index<T extends Cell_Like>(grid: Grid<T>, at: XY): Cell_Index {
    return at.x * grid.size.y + at.y as Cell_Index;
}

function grid_cell_at_unchecked<T extends Cell_Like>(grid: Grid<T>, at: XY): T {
    return grid.cells[at.x * grid.size.y + at.y];
}

function grid_cell_neighbors<T extends Cell_Like>(grid: Grid<T>, at: XY): Array<T | undefined> {
    return [
        grid_cell_at_raw(grid, at.x + 1, at.y),
        grid_cell_at_raw(grid, at.x - 1, at.y),
        grid_cell_at_raw(grid, at.x, at.y + 1),
        grid_cell_at_raw(grid, at.x, at.y - 1)
    ];
}

function is_grid_occupied_at<T extends Cell_Like>(grid: Grid<T>, at: XY): boolean {
    const cell = grid_cell_at_raw(grid, at.x, at.y);
    return !cell || cell.occupants > 0;
}

function is_grid_cell_occupied<T extends Cell_Like>(cell: T): boolean {
    return cell.occupants > 0;
}

// This will only work correctly if cells are on the same line
function direction_normal_between_points(from: XY, to: XY): XY {
    const delta = xy_sub(to, from);

    return xy(Math.sign(delta.x), Math.sign(delta.y));
}

function manhattan(from: XY, to: XY) {
    return Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
}

function rectangular(from: XY, to: XY) {
    const delta_x = from.x - to.x;
    const delta_y = from.y - to.y;

    return Math.max(Math.abs(delta_x), Math.abs(delta_y));
}

function unit_at(battle: Battle, at: XY): Unit | undefined {
    return battle.units.find(unit => !unit.dead && xy_equal(at, unit.position));
}

function are_units_allies(a: Unit, b: Unit): boolean {
    /*
                    hero  creep  monster
            hero     ?      ?       -
            creep    ?      ?       -
            monster  -      -       +

            ? : check player ids
            + : are allies
            - : are enemies
     */

    if (a.supertype == Unit_Supertype.monster && b.supertype == Unit_Supertype.monster) {
        return true;
    }

    if (a.supertype != Unit_Supertype.monster && b.supertype != Unit_Supertype.monster) {
        return a.owner == b.owner;
    }

    return false;
}

function query_units_for_no_target_ability(battle: Battle, caster: Unit, selector: Ability_Area_Selector): Unit[] {
    const units: Unit[] = [];

    for (const unit of battle.units) {
        if (!authorize_act_on_known_unit(battle, unit).ok) continue;

        if (area_selector_fits(battle, selector, caster.position, caster.position, unit.position)) {
            units.push(unit);
        }
    }

    return units;
}

function player_owns_unit(player: Battle_Player, unit: Unit) {
    if (unit.supertype == Unit_Supertype.monster) {
        return false;
    }

    return unit.owner == player;
}

function rune_at(battle: Battle, at: XY) : Rune | undefined {
    return battle.runes.find(rune => xy_equal(rune.position, at));
}

function shop_at(battle: Battle, at: XY) : Shop | undefined {
    return battle.shops.find(shop => xy_equal(shop.position, at));
}

function is_point_in_shop_range(xy: XY, shop: Shop) {
    return rectangular(xy, shop.position) <= Const.shop_range;
}

function is_point_in_deployment_zone(battle: Battle, xy: XY, player: Battle_Player) {
    const zone = player.deployment_zone;

    for (const unit of battle.units) {
        if (unit.dead) continue;

        const unit_x = unit.position.x;
        const unit_y = unit.position.y;

        for (const ability of unit.abilities) {
            if (ability.id == Ability_Id.deployment_zone) {
                const radius = ability.radius;

                const in_zone =
                    xy.x >= unit_x - radius &&
                    xy.y >= unit_y - radius &&
                    xy.x <= unit_x + radius &&
                    xy.y <= unit_y + radius;

                if (in_zone) {
                    return true;
                }
            }
        }
    }

    return (
        xy.x >= zone.min.x &&
        xy.y >= zone.min.y &&
        xy.x <= zone.max.x &&
        xy.y <= zone.max.y
    );
}

function find_unit_by_id(battle: Battle, id: Unit_Id): Unit | undefined {
    return battle.units.find(unit => unit.id == id);
}

function find_hero_by_id(battle: Battle, id: Unit_Id): Hero | undefined {
    const unit = find_unit_by_id(battle, id);

    if (unit && unit.supertype == Unit_Supertype.hero) {
        return unit;
    }
}

function find_player_by_id(battle: Battle, id: Battle_Player_Id): Battle_Player | undefined {
    return battle.players.find(player => player.id == id);
}

function find_rune_by_id(battle: Battle, id: Rune_Id): Rune | undefined {
    return battle.runes.find(rune => rune.id == id);
}

function find_shop_by_id(battle: Battle, id: Shop_Id): Shop | undefined {
    return battle.shops.find(shop => shop.id == id);
}

function find_player_card_by_id(player: Battle_Player, card_id: Card_Id): Card | undefined {
    return player.hand.find(card => card.id == card_id);
}

function find_modifier_by_handle_id(battle: Battle, id: Modifier_Handle_Id): [ Unit, Applied_Modifier ] | undefined {
    for (const unit of battle.units) {
        for (const modifier of unit.modifiers) {
            if (modifier.handle_id == id) {
                return [unit, modifier];
            }
        }
    }
}

function get_buyback_cost(unit: Unit) {
    if (unit.supertype == Unit_Supertype.hero) {
        return unit.level * 4;
    }

    return 0;
}

function try_consume_unit_action(unit: Unit, ability_id: Ability_Id) {
    const ability = find_unit_ability(unit, ability_id);

    if (ability && ability.type != Ability_Type.passive) {
        if (!ability_has_flag(ability ,Ability_Flag.does_not_consume_action)) {
            unit.has_taken_an_action_this_turn = true;
        }
    }
}

function ability_has_flag(ability: Ability_Active, flag: Ability_Flag) {
    return ability.flags.indexOf(flag) != -1;
}

function no_source(): Source {
    return {
        type: Source_Type.none
    }
}

function unit_source(unit: Unit, ability_id: Ability_Id): Source {
    return {
        type: Source_Type.unit,
        unit: unit,
        ability_id: ability_id
    }
}

function player_source(player: Battle_Player): Source {
    return {
        type: Source_Type.player,
        player: player
    }
}

function item_source(item_id: Item_Id): Source {
    return {
        type: Source_Type.item,
        item_id: item_id
    }
}

function modifier_source(applied: Applied_Modifier): Source {
    return {
        type: Source_Type.modifier,
        applied: applied
    }
}

function adventure_item_source(item_id: Adventure_Item_Id): Source {
    return {
        type: Source_Type.adventure_item,
        item_id: item_id
    }
}

function deserialize_source(battle: Battle, source: Delta_Source): Source | undefined {
    switch (source.type) {
        case Source_Type.unit: {
            const unit = find_unit_by_id(battle, source.unit);
            if (!unit) return;

            return unit_source(unit, source.ability_id);
        }

        case Source_Type.player: {
            const player = find_player_by_id(battle, source.player);
            if (!player) return;

            return player_source(player);
        }

        case Source_Type.modifier: {
            const result = find_modifier_by_handle_id(battle, source.handle);
            if (!result) return;

            return modifier_source(result[1]);
        }

        case Source_Type.adventure_item: return adventure_item_source(source.item);
        case Source_Type.item: return item_source(source.item);
        case Source_Type.none: return no_source();
        default: unreachable(source);
    }
}

function make_battle_player(participant: Battle_Participant_Info) {
    return {
        id: participant.id,
        deployment_zone: participant.deployment_zone,
        gold: 0,
        has_used_a_card_this_turn: false,
        hand: [],
        map_entity: participant.map_entity
    }
}

function make_battle(players: Battle_Player[], grid_width: number, grid_height: number): Battle {
    return {
        state: { status: Battle_Status.not_started },
        delta_head: 0,
        units: [],
        runes: [],
        shops: [],
        trees: [],
        players: players,
        turning_player: players[0],
        deltas: [],
        grid: {
            size: xy(grid_width, grid_height),
            cells: []
        },
        timed_effects: [],
        event_queue: [],
        receive_event: () => {}
    }
}

type Path_Iterator = {
    battle: Battle
    indices_already_checked: boolean[]
    indices_not_checked: Cell_Index[]
    flags: Pathing_Flag[]
    max_cost: number
}

const enum Neighbor_Check_Result {
    stop_checking,
    can_go,
    can_pass_through,
    can_stop_only
}

type Neighbor_Check = {
    result: Neighbor_Check_Result.can_go | Neighbor_Check_Result.can_pass_through | Neighbor_Check_Result.can_stop_only
    index: Cell_Index
} | {
    result: Neighbor_Check_Result.stop_checking
}

function path_iterator(battle: Battle, from: XY, max_cost: number, flags: Pathing_Flag[]): Path_Iterator {
    const iterator: Path_Iterator = {
        battle: battle,
        flags: flags,
        indices_already_checked: [],
        indices_not_checked: [],
        max_cost: max_cost
    };

    const from_index = grid_cell_index(battle.grid, from);

    iterator.indices_not_checked.push(from_index);
    iterator.indices_already_checked[from_index] = true;

    return iterator;
}

function path_iterator_flag(iter: Path_Iterator, flag: Pathing_Flag) {
    return iter.flags.indexOf(flag) != -1;
}

function path_iterator_check_neighbor(iter: Path_Iterator, for_cost: number, neighbor: Cell | undefined): Neighbor_Check {
    if (!neighbor) return { result: Neighbor_Check_Result.stop_checking };

    const neighbor_index = grid_cell_index(iter.battle.grid, neighbor.position);

    if (iter.indices_already_checked[neighbor_index]) return { result: Neighbor_Check_Result.stop_checking };

    const neighbor_occupied = is_grid_cell_occupied(neighbor);

    if (neighbor_occupied && path_iterator_flag(iter, Pathing_Flag.ignore_runes)) {
        const rune = rune_at(iter.battle, neighbor.position);

        if (rune != undefined) {
            iter.indices_already_checked[neighbor_index] = true;

            return { result: Neighbor_Check_Result.can_stop_only, index: neighbor_index };
        }
    }

    if (neighbor_occupied && path_iterator_flag(iter, Pathing_Flag.pass_through_units)) {
        const unit = unit_at(iter.battle, neighbor.position);

        if (unit != undefined) {
            iter.indices_already_checked[neighbor_index] = true;

            return { result: Neighbor_Check_Result.can_pass_through, index: neighbor_index };
        }
    }

    iter.indices_already_checked[neighbor_index] = true;

    if (neighbor_occupied) {
        return { result: Neighbor_Check_Result.stop_checking };
    } else {
        return { result: Neighbor_Check_Result.can_go, index: neighbor_index };
    }
}

// TODO replace with a more efficient A* implementation
function can_find_path(battle: Battle, unit: Unit, to: XY, flags: Pathing_Flag[]): { found: false } | { found: true, cost: number } {
    const iterator = path_iterator(battle, unit.position, unit.move_points, flags);

    // @Performance can check if the target cell is occupied right away, just need to account for runes
    for (let current_cost = 0; iterator.indices_not_checked.length > 0; current_cost++) {
        const new_indices: Cell_Index[] = [];

        for (const index of iterator.indices_not_checked) {
            const cell = battle.grid.cells[index];
            const neighbors = grid_cell_neighbors(battle.grid, cell.position);

            for (const neighbor of neighbors) {
                if (!neighbor) continue;

                const check = path_iterator_check_neighbor(iterator, current_cost + 1, neighbor);

                switch (check.result) {
                    case Neighbor_Check_Result.can_go: {
                        if (xy_equal(to, neighbor.position)) {
                            return { found: true, cost: current_cost + 1 }
                        } else {
                            new_indices.push(check.index);
                        }

                        break;
                    }

                    case Neighbor_Check_Result.can_pass_through: {
                        if (xy_equal(to, neighbor.position)) {
                            return { found: false }
                        } else {
                            new_indices.push(check.index);
                        }

                        break;
                    }

                    case Neighbor_Check_Result.can_stop_only: {
                        if (xy_equal(to, neighbor.position)) {
                            return { found: true, cost: current_cost + 1 }
                        }
                    }

                    case Neighbor_Check_Result.stop_checking: break;
                }
            }
        }

        iterator.indices_not_checked = new_indices;
    }

    return { found: false };
}

function find_path_from_populated_costs(battle: Battle, costs: Cost_Population_Result, from: XY, to: XY) {
    let current_cell_index = costs.cell_index_to_parent_index[grid_cell_index(battle.grid, to)];
    if (current_cell_index == undefined) return;

    const to_index = grid_cell_index(battle.grid, from);
    const path = [];

    path.push(to);

    while (to_index != current_cell_index) {
        if (current_cell_index == undefined) {
            return;
        }

        path.push(battle.grid.cells[current_cell_index].position);
        current_cell_index = costs.cell_index_to_parent_index[current_cell_index];
    }

    return path.reverse();
}

function populate_unit_path_costs(battle: Battle, unit: Unit, to_grab_rune: boolean) {
    return populate_path_costs(battle, unit.position, unit.move_points, unit_pathing_flags(unit, to_grab_rune));
}

// This specific overload is only used in AI in a weird way
function populate_path_costs(battle: Battle, from: XY, max_cost: number, flags: Pathing_Flag[]): Cost_Population_Result {
    const cell_index_to_cost: number[] = [];
    const cell_index_to_parent_index: Cell_Index[] = [];
    const from_index = grid_cell_index(battle.grid, from);
    cell_index_to_cost[from_index] = 0;

    const iterator = path_iterator(battle, from, max_cost, flags);

    for (let current_cost = 0; iterator.indices_not_checked.length > 0; current_cost++) {
        const new_indices: Cell_Index[] = [];

        for (const index of iterator.indices_not_checked) {
            const cell = battle.grid.cells[index];
            const at = cell.position;

            const neighbors = grid_cell_neighbors(battle.grid, at);

            for (const neighbor of neighbors) {
                const check = path_iterator_check_neighbor(iterator, current_cost + 1, neighbor);

                if (check.result == Neighbor_Check_Result.stop_checking) {
                    continue;
                }

                switch (check.result) {
                    case Neighbor_Check_Result.can_go: {
                        new_indices.push(check.index);
                        cell_index_to_parent_index[check.index] = index;
                        cell_index_to_cost[check.index] = current_cost + 1;

                        break;
                    }

                    case Neighbor_Check_Result.can_pass_through: {
                        new_indices.push(check.index);
                        cell_index_to_parent_index[check.index] = index;
                        cell_index_to_cost[check.index] = Number.MAX_SAFE_INTEGER;

                        break;
                    }

                    case Neighbor_Check_Result.can_stop_only: {
                        cell_index_to_parent_index[check.index] = index;
                        cell_index_to_cost[check.index] = current_cost + 1;

                        break;
                    }
                }
            }
        }

        iterator.indices_not_checked = new_indices;
    }

    return {
        cell_index_to_cost: cell_index_to_cost,
        cell_index_to_parent_index: cell_index_to_parent_index
    };
}

function unit_pathing_flags(unit: Unit, to_grab_rune: boolean): Pathing_Flag[] {
    const flags: Pathing_Flag[] = [];

    if (to_grab_rune) {
        flags.push(Pathing_Flag.ignore_runes);
    }

    if (is_unit_phased(unit)) {
        flags.push(Pathing_Flag.pass_through_units);
    }

    return flags;
}

const enum Scan_Result_Type {
    nothing,
    unit,
    obstacle
}

type Scan_Result = {
    hit: Scan_Result_Type.nothing
} | {
    hit: Scan_Result_Type.unit
    at: XY
} | {
    hit: Scan_Result_Type.obstacle
    at: XY
}

function scan_line_for_first_unit(battle: Battle, from: XY, to: XY, line_length: number): Scan_Result {
    const direction_normal = direction_normal_between_points(from, to);
    const current_cell = xy(from.x, from.y);

    for (let scanned = 0; scanned < line_length; scanned++) {
        current_cell.x += direction_normal.x;
        current_cell.y += direction_normal.y;

        const unit = unit_at(battle, current_cell);

        if (unit && authorize_act_on_known_unit(battle, unit).ok) {
            return { hit: Scan_Result_Type.unit, at: current_cell };
        }

        if (is_grid_occupied_at(battle.grid, current_cell)) {
            return { hit: Scan_Result_Type.obstacle, at: current_cell };
        }
    }

    return { hit: Scan_Result_Type.nothing };
}

function ability_targeting_fits(battle: Battle, targeting: Ability_Targeting, from: XY, check_at: XY): boolean {
    if (!targeting.flags[Ability_Targeting_Flag.include_caster] && xy_equal(from, check_at)) {
        return false;
    }

    if (targeting.flags[Ability_Targeting_Flag.only_free_cells]) {
        if (is_grid_occupied_at(battle.grid, check_at)) {
            return false;
        }
    }

    switch (targeting.type) {
        case Ability_Targeting_Type.line: {
            if (!are_points_on_the_same_line(from, check_at)) {
                return false;
            }

            const distance = distance_between_points_on_the_same_line(from, check_at);
            return distance >= 0 && distance <= targeting.line_length;
        }

        case Ability_Targeting_Type.first_in_line: {
            // @Performance the scans are redundant
            if (are_points_on_the_same_line(from, check_at)) {
                const distance = distance_between_points_on_the_same_line(from, check_at);
                const fits_distance = distance > 0 && distance <= targeting.line_length;

                if (fits_distance) {
                    const first_unit_scan = scan_line_for_first_unit(battle, from, check_at, targeting.line_length);

                    switch (first_unit_scan.hit) {
                        case Scan_Result_Type.nothing: return true; // Highlight all points fitting the line
                        case Scan_Result_Type.unit: {
                            const distance_to_first_unit = distance_between_points_on_the_same_line(from, first_unit_scan.at);
                            return distance <= distance_to_first_unit; // Highlight all points between source and first unit (inclusive)
                        }

                        case Scan_Result_Type.obstacle: {
                            const distance_to_first_unit = distance_between_points_on_the_same_line(from, first_unit_scan.at);
                            return distance < distance_to_first_unit; // Highlight all points between source and first obstacle (exclusive)
                        }

                        default: unreachable(first_unit_scan);
                    }
                }
            }

            return false;
        }

        case Ability_Targeting_Type.rectangular_area_around_caster: {
            const distance = rectangular(from, check_at);
            return distance <= targeting.area_radius;
        }

        case Ability_Targeting_Type.unit_in_manhattan_distance: {
            const distance = manhattan(from, check_at);
            return distance <= targeting.distance;
        }

        case Ability_Targeting_Type.any_cell: {
            return true;
        }
    }
}

function area_selector_fits(battle: Battle, selector: Ability_Area_Selector, caster_at: XY, cursor_at: XY, check_what: XY): boolean {
    function points_on_the_same_line(a: XY, b: XY, c: XY) {
        return are_points_on_the_same_line(a, b) && are_points_on_the_same_line(a, c) && are_points_on_the_same_line(b, c);
    }

    function get_line_segment_end(length: number, direction: XY = direction_normal_between_points(caster_at, cursor_at)): XY {
        return xy(caster_at.x + direction.x * length, caster_at.y + direction.y * length);
    }

    function fits_line(length: number): boolean {
        const head = get_line_segment_end(length);
        const from_tail_to_point = distance_between_points_on_the_same_line(check_what, caster_at);
        const from_head_to_point = distance_between_points_on_the_same_line(check_what, head);
        return from_tail_to_point > 0 && from_tail_to_point <= length && from_head_to_point <= length;
    }

    switch (selector.type) {
        case Ability_Target_Selector_Type.single_target: {
            return xy_equal(cursor_at, check_what);
        }

        case Ability_Target_Selector_Type.rectangle: {
            return rectangular(cursor_at, check_what) <= selector.area_radius;
        }

        case Ability_Target_Selector_Type.line: {
            if (points_on_the_same_line(caster_at, cursor_at, check_what)) {
                return fits_line(selector.length);
            }

            return false;
        }

        case Ability_Target_Selector_Type.t_shape: {
            if (points_on_the_same_line(caster_at, cursor_at, check_what)) {
                return fits_line(selector.stem_length);
            }

            const direction = direction_normal_between_points(caster_at, cursor_at);
            const head = get_line_segment_end(selector.stem_length, direction);
            const direction_left = xy(-direction.y, direction.x);
            const left_arm_end = xy(head.x + direction_left.x * selector.arm_length, head.y + direction_left.y * selector.arm_length);

            if (points_on_the_same_line(left_arm_end, check_what, head)) {
                return distance_between_points_on_the_same_line(head, check_what) <= selector.arm_length;
            }

            return false;
        }
    }
}

function disabled_cell_index(disabled_cells: Cell_Index[]) {
    const sparse_index: Record<number, boolean> = [];

    for (const index of disabled_cells) {
        sparse_index[index] = true;
    }

    return sparse_index;
}

function fill_grid(battle: Battle, disabled_cells: Cell_Index[]) {
    const sparse_index = disabled_cell_index(disabled_cells);

    for (let x = 0; x < battle.grid.size.x; x++) {
        for (let y = 0; y < battle.grid.size.y; y++) {
            const index = grid_cell_index_raw(battle.grid, x, y);
            if (index == undefined) continue;

            const occupied = sparse_index[index];

            battle.grid.cells.push({
                position: xy(x, y),
                occupants: occupied ? 1 : 0,
                cost: 1
            });
        }
    }
}

function move_unit(battle: Battle, unit: Unit, to: XY) {
    const cell_from = grid_cell_at_unchecked(battle.grid, unit.position);
    const cell_to = grid_cell_at_unchecked(battle.grid, to);
    const from_was_occupied = is_grid_cell_occupied(cell_from);

    free_cell(cell_from);

    if (from_was_occupied) {
        occupy_cell(cell_to);
    }

    unit.position = to;
}

function are_points_on_the_same_line(a: XY, b: XY): boolean {
    return a.x == b.x || a.y == b.y;
}

function distance_between_points_on_the_same_line(a: XY, b: XY): number {
    return Math.abs(a.y - b.y) + Math.abs(a.x - b.x);
}

function drain_battle_event_queue(battle: Battle) {
    while (battle.event_queue.length != 0) {
        const processing_events = battle.event_queue.slice();
        battle.event_queue.length = 0;

        for (const event of processing_events) {
            battle.receive_event(battle, event);
        }
    }
}

function find_unit_ability(unit: Unit, ability_id: Ability_Id): Ability | undefined {
    return unit.abilities.find(ability => ability.id == ability_id);
}

function end_turn(battle: Battle, next_turning_player: Battle_Player) {
    for (const effect of battle.timed_effects) {
        if (effect.duration_remaining > 0) {
            effect.duration_remaining--;
        }
    }

    for (const unit of battle.units) {
        for (const modifier of unit.modifiers) {
            if (modifier.duration_remaining != undefined) {
                if (modifier.duration_remaining > 0) {
                    modifier.duration_remaining--;
                }
            }
        }
    }

    for (const player of battle.players) {
        player.has_used_a_card_this_turn = false;
    }

    battle.turning_player = next_turning_player;
}

function change_health(battle: Battle, source: Source, target: Unit, change: Health_Change) {
    const event_base = {
        source: source,
        target: target,
        change: change
    };

    target.health = change.new_value;

    if (!target.dead && change.new_value == 0) {
        free_cell_at(battle, target.position);

        target.dead = true;

        push_event(battle, {
            type: Battle_Event_Type.health_changed,
            ...event_base,
            dead: true
        });

        return true;
    }

    push_event(battle, {
        type: Battle_Event_Type.health_changed,
        ...event_base,
        dead: false
    });

    return false;
}

function change_gold(player: Battle_Player, gold_change: number) {
    player.gold += gold_change;
}

function add_card_to_hand(battle: Battle, player: Battle_Player, card: Card) {
    player.hand.push(card);

    push_event(battle, {
        type: Battle_Event_Type.card_added_to_hand,
        player: player,
        card: card
    })
}

function occupy_cell_at(battle: Battle, at: XY) {
    const cell = grid_cell_at(battle.grid, at);

    if (cell) {
        occupy_cell(cell);
    }
}

function free_cell_at(battle: Battle, at: XY) {
    const cell = grid_cell_at(battle.grid, at);

    if (cell) {
        free_cell(cell);
    }
}

function occupy_cell<T extends Cell_Like>(cell: T) {
    cell.occupants++;
}

function free_cell<T extends Cell_Like>(cell: T) {
    cell.occupants--;
}

function unit_base(id: Unit_Id, definition: Unit_Definition, at: XY): Unit_Base {
    return {
        id: id,
        position: at,
        move_points: definition.move_points,
        health: definition.health,
        dead: false,
        has_taken_an_action_this_turn: false,
        modifiers: [],
        ability_overrides: [],
        status: starting_unit_status(),
        base: {
            armor: definition.armor != undefined ? definition.armor : 0,
            attack_damage: definition.attack_damage,
            max_health: definition.health,
            max_move_points: definition.move_points
        },
        bonus: {
            armor: 0,
            attack_damage: 0,
            max_health: 0,
            max_move_points: 0
        },
        ...instantiate_unit_abilities(definition)
    }
}

function push_event(battle: Battle, event: Battle_Event) {
    battle.event_queue.push(event);
}

function unit_spawn_event(source: Source, unit: Unit, at: XY): Battle_Event {
    return {
        type: Battle_Event_Type.unit_spawned,
        source: source,
        unit: unit,
        at: at
    }
}

function create_creep(battle: Battle, source: Source, owner: Battle_Player, spawn: Creep_Spawn_Effect, at: XY, summoned: boolean): Creep {
    const creep: Creep = {
        ...unit_base(spawn.unit_id, creep_definition_by_type(spawn.creep_type), at),
        supertype: Unit_Supertype.creep,
        type: spawn.creep_type,
        owner: owner,
        is_a_summon: summoned
    };

    battle.units.push(creep);

    occupy_cell_at(battle, at);

    push_event(battle, unit_spawn_event(source, creep, at));

    for (const modifier of spawn.intrinsic_modifiers) {
        apply_modifier(battle, source, creep, modifier);
    }

    return creep;
}

function update_unit_modifier_state(unit: Unit) {
    let max_ability_level;

    switch (unit.supertype) {
        case Unit_Supertype.hero: max_ability_level = unit.level; break;
        case Unit_Supertype.creep: max_ability_level = 0; break;
        case Unit_Supertype.monster: max_ability_level = 0; break;
    }

    update_unit_stats_and_abilities_from_modifiers(unit, max_ability_level, unit.modifiers.map(applied => applied.modifier));
}

function set_hero_level(hero: Hero, new_level: number) {
    hero.level = new_level;
    update_unit_modifier_state(hero);
}

function apply_modifier(battle: Battle, source: Source, target: Unit, application: Modifier_Application) {
    const applied: Applied_Modifier = {
        handle_id: application.modifier_handle_id,
        source: source,
        modifier: application.modifier,
        duration_remaining: application.duration
    };

    target.modifiers.push(applied);

    update_unit_modifier_state(target);

    push_event(battle, {
        type: Battle_Event_Type.modifier_applied,
        target: target,
        modifier: applied
    });
}

function create_timed_effect(battle: Battle, application: Timed_Effect_Application) {
    const effect = application.effect;

    battle.timed_effects.push({
        handle_id: application.effect_handle_id,
        content: effect,
        duration_remaining: application.duration
    });

    switch (effect.type) {
        case Timed_Effect_Type.shaker_fissure_block: {
            for (let step = 0; step < effect.steps; step++) {
                const position = xy(effect.from.x + effect.normal.x * step, effect.from.y + effect.normal.y * step);

                occupy_cell_at(battle, position);
            }

            break;
        }

        default: unreachable(effect.type);
    }
}

function expire_timed_effect(battle: Battle, effect: Timed_Effect) {
    switch (effect.type) {
        case Timed_Effect_Type.shaker_fissure_block: {
            for (let step = 0; step < effect.steps; step++) {
                const position = xy(effect.from.x + effect.normal.x * step, effect.from.y + effect.normal.y * step);

                free_cell_at(battle, position);
            }

            break;
        }

        default: unreachable(effect.type);
    }
}

function collapse_modifier_effect(battle: Battle, effect: Delta_Modifier_Effect_Applied) {
    const found = find_modifier_by_handle_id(battle, effect.handle_id);
    if (!found) return;

    const [, applied] = found;

    const source = modifier_source(applied);

    switch (effect.modifier_id) {
        case Modifier_Id.item_heart_of_tarrasque: {
            change_unit_health(battle, source, effect.change);
            break;
        }

        case Modifier_Id.item_armlet: {
            change_unit_health(battle, source, effect.change);
            break;
        }

        case Modifier_Id.item_basher: {
            const target = find_unit_by_id(battle, effect.target_unit_id);

            if (target) {
                apply_modifier(battle, source, target, effect.modifier);
            }

            break;
        }

        case Modifier_Id.item_satanic:
        case Modifier_Id.item_octarine_core:
        case Modifier_Id.item_morbid_mask: {
            const target = find_unit_by_id(battle, effect.heal.target_unit_id);

            if (target) {
                change_health(battle, source, target, effect.heal);
            }

            break;
        }

        default: unreachable(effect);
    }
}

function collapse_ability_effect(battle: Battle, effect: Ability_Effect) {
    switch (effect.ability_id) {
        case Ability_Id.luna_moon_glaive: {
            const source = find_unit_by_id(battle, effect.source_unit_id);
            const target = find_unit_by_id(battle, effect.target_unit_id);

            if (source && target) {
                change_health(battle, unit_source(source, effect.ability_id), target, effect.damage_dealt);
            }

            break;
        }

        case Ability_Id.mirana_starfall: {
            const source = find_unit_by_id(battle, effect.source_unit_id);
            const target = find_unit_by_id(battle, effect.target_unit_id);

            if (source && target) {
                change_health(battle, unit_source(source, effect.ability_id), target, effect.damage_dealt);
            }

            break;
        }

        case Ability_Id.dark_seer_ion_shell: {
            const source = find_unit_by_id(battle, effect.source_unit_id);

            if (source) {
                change_health_multiple(battle, unit_source(source, effect.ability_id), effect.targets);
            }

            break;
        }

        case Ability_Id.pocket_tower_attack: {
            const source = find_unit_by_id(battle, effect.source_unit_id);
            const target = find_unit_by_id(battle, effect.damage_dealt.target_unit_id);

            if (source && target) {
                change_health(battle, unit_source(source, effect.ability_id), target, effect.damage_dealt);
            }

            break;
        }

        case Ability_Id.monster_lifesteal: {
            const source = find_unit_by_id(battle, effect.source_unit_id);
            const target = find_unit_by_id(battle, effect.target_unit_id);

            if (source && target) {
                change_health(battle, unit_source(source, effect.ability_id), target, effect.heal);
            }

            break;
        }

        case Ability_Id.monster_spawn_spiderlings: {
            const source = find_unit_by_id(battle, effect.source_unit_id);
            if (!source) return;

            // @MonsterOwner
            if (source.supertype == Unit_Supertype.monster) return;

            for (const summon of effect.summons) {
                create_creep(battle, unit_source(source, effect.ability_id), source.owner, summon.spawn, summon.at, true);
            }

            break;
        }

        case Ability_Id.plague_ward_attack: {
            const source = find_unit_by_id(battle, effect.source_unit_id);
            const target = find_unit_by_id(battle, effect.damage_dealt.target_unit_id);

            if (source && target) {
                change_health(battle, unit_source(source, effect.ability_id), target, effect.damage_dealt);
            }

            break;
        }

        default: unreachable(effect);
    }
}

function change_health_multiple(battle: Battle, source: Source, changes: Unit_Health_Change[]) {
    for (const change of changes) {
        const target = find_unit_by_id(battle, change.target_unit_id);

        if (target) {
            change_health(battle, source, target, change);
        }
    }
}

function change_unit_health(battle: Battle, source: Source, change: Unit_Health_Change) {
    const target = find_unit_by_id(battle, change.target_unit_id);

    if (target) {
        change_health(battle, source, target, change);
    }
}

function apply_modifier_multiple(battle: Battle, source: Source, applications: Unit_Modifier_Application[]) {
    for (const application of applications) {
        const target = find_unit_by_id(battle, application.target_unit_id);

        if (target) {
            apply_modifier(battle, source, target, application.modifier);
        }
    }
}

function change_health_and_apply_modifier_multiple(battle: Battle, source: Source, changes: (Unit_Health_Change & Unit_Modifier_Application)[]) {
    for (const change of changes) {
        const target = find_unit_by_id(battle, change.target_unit_id);

        if (target) {
            change_health(battle, source, target, change);
            apply_modifier(battle, source, target, change.modifier);
        }
    }
}

function collapse_unit_target_ability_use(battle: Battle, caster: Unit, target: Unit, cast: Delta_Unit_Target_Ability) {
    const source = unit_source(caster, cast.ability_id);

    switch (cast.ability_id) {
        case Ability_Id.basic_attack: {
            change_health(battle, source, target, cast.target);

            break;
        }

        case Ability_Id.pudge_hook: {
            move_unit(battle, target, cast.move_target_to);
            change_health(battle, source, target, cast.damage_dealt);

            break;
        }

        case Ability_Id.mirana_arrow: {
            apply_modifier(battle, source, target, cast.stun);

            break;
        }

        case Ability_Id.pudge_dismember: {
            change_health(battle, source, caster, cast.health_restored);
            change_health(battle, source, target, cast.damage_dealt);

            break;
        }

        case Ability_Id.luna_lucent_beam: {
            change_health(battle, source, target, cast.damage_dealt);

            break;
        }

        case Ability_Id.tide_gush: {
            change_health(battle, source, target, cast.damage_dealt);
            apply_modifier(battle, source, target, cast.modifier);

            break;
        }

        case Ability_Id.skywrath_ancient_seal: {
            apply_modifier(battle, source, target, cast.modifier);
            break;
        }

        case Ability_Id.dragon_knight_dragon_tail: {
            change_health(battle, source, target, cast.damage_dealt);
            apply_modifier(battle, source, target, cast.modifier);

            break;
        }

        case Ability_Id.lion_hex: {
            apply_modifier(battle, source, target, cast.modifier);
            break;
        }

        case Ability_Id.lion_finger_of_death: {
            change_health(battle, source, target, cast.damage_dealt);
            break;
        }

        case Ability_Id.venge_magic_missile: {
            change_health(battle, source, target, cast.damage_dealt);
            apply_modifier(battle, source, target, cast.modifier);

            break;
        }

        case Ability_Id.venge_nether_swap: {
            const caster_position = caster.position;
            const target_position = target.position;

            caster.position = target_position;
            target.position = caster_position;

            break;
        }

        case Ability_Id.dark_seer_ion_shell: {
            apply_modifier(battle, source, target, cast.modifier);
            break;
        }

        case Ability_Id.dark_seer_surge: {
            apply_modifier(battle, source, target, cast.modifier);
            break;
        }

        case Ability_Id.bounty_hunter_jinada_attack: {
            change_health(battle, source, target, cast.target);
            apply_modifier(battle, source, target, cast.modifier);
            break;
        }

        default: unreachable(cast);
    }
}

function collapse_no_target_ability_use(battle: Battle, unit: Unit, cast: Delta_Use_No_Target_Ability) {
    const source = unit_source(unit, cast.ability_id);

    switch (cast.ability_id) {
        case Ability_Id.tide_ravage: {
            change_health_and_apply_modifier_multiple(battle, source, cast.targets);

            break;
        }

        case Ability_Id.luna_eclipse: {
            change_health_multiple(battle, source, cast.targets);

            break;
        }

        case Ability_Id.tide_anchor_smash: {
            change_health_and_apply_modifier_multiple(battle, source, cast.targets);

            break;
        }

        case Ability_Id.pudge_rot: {
            change_health_multiple(battle, source, cast.targets);

            break;
        }

        case Ability_Id.skywrath_concussive_shot: {
            if (cast.result.hit) {
                const target = find_unit_by_id(battle, cast.result.target_unit_id);

                if (target) {
                    change_health(battle, source, target, cast.result.damage);
                    apply_modifier(battle, source, target, cast.result.modifier);
                }
            }

            break;
        }

        case Ability_Id.dragon_knight_elder_dragon_form: {
            apply_modifier(battle, source, unit, cast.modifier);

            break;
        }

        case Ability_Id.mirana_starfall: {
            change_health_multiple(battle, source, cast.targets);

            break;
        }

        case Ability_Id.ember_searing_chains: {
            apply_modifier_multiple(battle, source, cast.targets);

            break;
        }

        case Ability_Id.ember_sleight_of_fist: {
            change_health_multiple(battle, source, cast.targets);

            break;
        }

        case Ability_Id.ember_activate_fire_remnant: {
            const remnant = find_unit_by_id(battle, cast.action.remnant_id);
            if (!remnant) return;

            change_health(battle, no_source(), remnant, { new_value: 0, value_delta: -remnant.health });
            move_unit(battle, unit, cast.action.move_to);

            break;
        }

        case Ability_Id.shaker_enchant_totem: {
            apply_modifier(battle, source, unit, cast.modifier);
            apply_modifier_multiple(battle, source, cast.targets);

            break;
        }

        case Ability_Id.shaker_echo_slam: {
            change_health_multiple(battle, source, cast.targets);

            break;
        }

        case Ability_Id.venomancer_poison_nova: {
            apply_modifier_multiple(battle, source, cast.targets);

            break;
        }

        case Ability_Id.bounty_hunter_shadow_walk: {
            apply_modifier(battle, source, unit, cast.modifier);
            break;
        }

        default: unreachable(cast);
    }
}

function collapse_ground_target_ability_use(battle: Battle, caster: Unit, at: Cell, cast: Delta_Ground_Target_Ability) {
    const source = unit_source(caster, cast.ability_id);

    switch (cast.ability_id) {
        case Ability_Id.skywrath_mystic_flare: {
            change_health_multiple(battle, source, cast.targets);
            break;
        }

        case Ability_Id.dragon_knight_breathe_fire: {
            change_health_multiple(battle, source, cast.targets);
            break;
        }

        case Ability_Id.dragon_knight_elder_dragon_form_attack: {
            change_health_multiple(battle, source, cast.targets);
            break;
        }

        case Ability_Id.lion_impale: {
            change_health_and_apply_modifier_multiple(battle, source, cast.targets);
            break;
        }

        case Ability_Id.mirana_leap: {
            move_unit(battle, caster, cast.target_position);
            break;
        }

        case Ability_Id.venge_wave_of_terror: {
            change_health_and_apply_modifier_multiple(battle, source, cast.targets);

            break;
        }

        case Ability_Id.dark_seer_vacuum: {
            for (const target of cast.targets) {
                const target_unit = find_unit_by_id(battle, target.target_unit_id);

                if (target_unit) {
                    move_unit(battle, target_unit, target.move_to);
                }
            }

            break;
        }

        case Ability_Id.ember_fire_remnant: {
            // @MonsterOwner
            if (caster.supertype == Unit_Supertype.monster) return;

            const remnant = create_creep(battle, source, caster.owner, cast.remnant, cast.target_position, true);
            apply_modifier(battle, source, caster, cast.modifier);

            break;
        }

        case Ability_Id.shaker_fissure: {
            apply_modifier_multiple(battle, source, cast.modifiers);

            for (const move of cast.moves) {
                const unit = find_unit_by_id(battle, move.target_unit_id);

                if (unit) {
                    move_unit(battle, unit, move.move_to);
                }
            }

            create_timed_effect(battle, cast.block);

            break;
        }

        case Ability_Id.venomancer_plague_wards: {
            // @MonsterOwner
            if (caster.supertype == Unit_Supertype.monster) return;

            create_creep(battle, source, caster.owner, cast.summon, cast.target_position, true);

            break;
        }

        case Ability_Id.venomancer_venomous_gale: {
            apply_modifier_multiple(battle, source, cast.targets);

            break;
        }

        default: unreachable(cast);
    }
}

function collapse_no_target_spell_use(battle: Battle, caster: Battle_Player, cast: Delta_Use_No_Target_Spell) {
    const source = player_source(caster);

    switch (cast.spell_id) {
        case Spell_Id.mekansm: {
            change_health_multiple(battle, source, cast.targets);

            break;
        }

        case Spell_Id.buckler: {
            apply_modifier_multiple(battle, source, cast.targets);
            break;
        }

        case Spell_Id.drums_of_endurance: {
            apply_modifier_multiple(battle, source, cast.targets);
            break;
        }

        case Spell_Id.call_to_arms: {
            for (const summon of cast.summons) {
                create_creep(battle, source, caster, summon.spawn, summon.at, true);
            }

            break;
        }

        default: unreachable(cast);
    }
}

function collapse_ground_target_spell_use(battle: Battle, caster: Battle_Player, at: XY, cast: Delta_Use_Ground_Target_Spell) {
    switch (cast.spell_id) {
        case Spell_Id.pocket_tower: {
            create_creep(battle, player_source(caster), caster, cast.spawn, at, true);

            break;
        }

        default: unreachable(cast.spell_id);
    }
}

function collapse_unit_target_spell_use(battle: Battle, caster: Battle_Player, target: Unit, cast: Delta_Use_Unit_Target_Spell) {
    const source = player_source(caster);

    switch (cast.spell_id) {
        case Spell_Id.buyback: {
            add_card_to_hand(battle, caster, {
                type: Card_Type.existing_hero,
                id: cast.new_card_id,
                hero_id: cast.target_id,
                generated_by: cast.spell_id
            });

            target.dead = false;

            change_gold(caster, cast.gold_change);
            change_health(battle, source, target, cast.heal);
            apply_modifier(battle, source, target, cast.modifier);

            break;
        }

        case Spell_Id.town_portal_scroll: {
            add_card_to_hand(battle, caster, {
                type: Card_Type.existing_hero,
                id: cast.new_card_id,
                hero_id: cast.target_id,
                generated_by: cast.spell_id
            });

            change_health(battle, source, target, cast.heal);
            apply_modifier(battle, source, target, cast.modifier);
            free_cell_at(battle, target.position);

            break;
        }

        case Spell_Id.euls_scepter: {
            apply_modifier(battle, source, target, cast.modifier);

            break;
        }

        case Spell_Id.refresher_orb: {
            for (const change of cast.charge_changes) {
                const ability = find_unit_ability(target, change.ability_id);

                if (ability && ability.type != Ability_Type.passive) {
                    ability.charges_remaining = change.charges_remaining;
                }
            }

            break;
        }

        default: unreachable(cast);
    }
}

function collapse_item_equip(battle: Battle, hero: Hero, equip: Equip_Item) {
    switch (equip.item_id) {
        case Item_Id.refresher_shard: {
            for (const change of equip.charge_changes) {
                const ability = find_unit_ability(hero, change.ability_id);

                if (ability && ability.type != Ability_Type.passive) {
                    ability.charges_remaining = change.charges_remaining;
                }
            }

            break;
        }

        case Item_Id.enchanted_mango: {
            if (!equip.change) break;

            const ability = find_unit_ability(hero, equip.change.ability_id);

            if (ability && ability.type != Ability_Type.passive) {
                ability.charges_remaining = equip.change.charges_remaining;
            }

            break;
        }

        case Item_Id.tome_of_knowledge: {
            set_hero_level(hero, equip.new_level);
            break;
        }

        default: unreachable(equip);
    }
}

function collapse_delta(battle: Battle, delta: Delta): void {
    switch (delta.type) {
        case Delta_Type.game_start: {
            battle.state = { status: Battle_Status.in_progress };
            break;
        }

        case Delta_Type.unit_move: {
            const unit = find_unit_by_id(battle, delta.unit_id);

            if (unit) {
                move_unit(battle, unit, delta.to_position);

                unit.move_points -= delta.move_cost;
            }

            break;
        }

        case Delta_Type.rune_pick_up: {
            const unit = find_hero_by_id(battle, delta.unit_id);
            const rune_index = battle.runes.findIndex(rune => rune.id == delta.rune_id);

            if (!unit) break;
            if (rune_index == -1) break;

            const rune = battle.runes[rune_index];

            move_unit(battle, unit, rune.position);

            unit.move_points -= delta.move_cost;

            switch (delta.rune_type) {
                case Rune_Type.double_damage: {
                    apply_modifier(battle, no_source(), unit, delta.modifier);
                    break;
                }

                case Rune_Type.haste: {
                    apply_modifier(battle, no_source(), unit, delta.modifier);
                    break;
                }

                case Rune_Type.regeneration: {
                    change_health(battle, no_source(), unit, delta.heal);
                    break;
                }

                case Rune_Type.bounty: {
                    change_gold(unit.owner, delta.gold_gained);

                    break;
                }

                default: unreachable(delta);
            }

            battle.runes.splice(rune_index, 1);
            free_cell_at(battle, rune.position);

            break;
        }

        case Delta_Type.hero_spawn: {
            const owner = find_player_by_id(battle, delta.owner_id);

            if (!owner) break;

            const hero: Hero = {
                ...unit_base(delta.unit_id, hero_definition_by_type(delta.hero_type), delta.at_position),
                supertype: Unit_Supertype.hero,
                type: delta.hero_type,
                owner: owner,
                level: 1
            };

            battle.units.push(hero);

            occupy_cell_at(battle, delta.at_position);

            push_event(battle, unit_spawn_event(no_source(), hero, delta.at_position));

            break;
        }

        case Delta_Type.monster_spawn: {
            const monster: Monster = {
                ...unit_base(delta.unit_id, monster_definition(), delta.at_position),
                supertype: Unit_Supertype.monster
            };

            battle.units.push(monster);

            occupy_cell_at(battle, delta.at_position);

            push_event(battle, unit_spawn_event(no_source(), monster, delta.at_position));

            break;
        }

        case Delta_Type.creep_spawn: {
            const owner = find_player_by_id(battle, delta.owner_id);
            if (!owner) break;

            const creep = create_creep(battle, no_source(), owner, delta.effect, delta.at_position, false);
            creep.health = delta.health;

            break;
        }

        case Delta_Type.hero_spawn_from_hand: {
            const hero = find_hero_by_id(battle, delta.hero_id);
            if (!hero) break;

            const in_hand_modifier = hero.modifiers.findIndex(applied => applied.modifier.id == Modifier_Id.returned_to_hand);
            if (in_hand_modifier == -1) break;

            hero.modifiers.splice(in_hand_modifier, 1);

            update_unit_modifier_state(hero);
            hero.position = delta.at_position;
            occupy_cell_at(battle, delta.at_position);

            break;
        }

        case Delta_Type.health_change: {
            const source = deserialize_source(battle, delta.source);
            const target = find_unit_by_id(battle, delta.change.target_unit_id);

            if (source && target) {
                change_health(battle, source, target, delta.change);
            }

            break;
        }

        case Delta_Type.rune_spawn: {
            battle.runes.push({
                id: delta.rune_id,
                type: delta.rune_type,
                position: delta.at
            });

            occupy_cell_at(battle, delta.at);

            break;
        }

        case Delta_Type.shop_spawn: {
            battle.shops.push({
                id: delta.shop_id,
                type: delta.shop_type,
                items: delta.item_pool,
                position: delta.at
            });

            occupy_cell_at(battle, delta.at);

            break;
        }

        case Delta_Type.tree_spawn: {
            battle.trees.push({
                id: delta.tree_id,
                position: delta.at_position
            });

            occupy_cell_at(battle, delta.at_position);

            break;
        }

        case Delta_Type.use_no_target_ability: {
            const unit = find_unit_by_id(battle, delta.unit_id);

            if (!unit) break;

            try_consume_unit_action(unit, delta.ability_id);
            collapse_no_target_ability_use(battle, unit, delta);

            break;
        }

        case Delta_Type.use_ground_target_ability: {
            const unit = find_unit_by_id(battle, delta.unit_id);
            const target = grid_cell_at(battle.grid, delta.target_position);

            if (!unit) break;
            if (!target) break;

            try_consume_unit_action(unit, delta.ability_id);
            collapse_ground_target_ability_use(battle, unit, target, delta);

            break;
        }

        case Delta_Type.use_unit_target_ability: {
            const unit = find_unit_by_id(battle, delta.unit_id);
            const target = find_unit_by_id(battle, delta.target_unit_id);

            if (!unit) break;
            if (!target) break;

            try_consume_unit_action(unit, delta.ability_id);
            collapse_unit_target_ability_use(battle, unit, target, delta);

            break;
        }

        case Delta_Type.use_no_target_spell: {
            const player = find_player_by_id(battle, delta.player_id);
            if (!player) break;

            collapse_no_target_spell_use(battle, player, delta);

            break;
        }

        case Delta_Type.use_unit_target_spell: {
            const player = find_player_by_id(battle, delta.player_id);
            const target = find_unit_by_id(battle, delta.target_id);

            if (!player) break;
            if (!target) break;

            collapse_unit_target_spell_use(battle, player, target, delta);

            break;
        }

        case Delta_Type.use_ground_target_spell: {
            const player = find_player_by_id(battle, delta.player_id);
            if (!player) break;

            collapse_ground_target_spell_use(battle, player, delta.at, delta);

            break;
        }

        case Delta_Type.end_turn: {
            const next_player = find_player_by_id(battle, delta.start_turn_of_player_id);

            if (!next_player) break;

            end_turn(battle, next_player);

            for (const unit of battle.units) {
                if (unit.attack) {
                    unit.attack.charges_remaining = unit.attack.charges;
                }

                unit.move_points = get_max_move_points(unit);
                unit.has_taken_an_action_this_turn = false;
            }

            break;
        }

        case Delta_Type.level_change: {
            const unit = find_hero_by_id(battle, delta.unit_id);

            if (unit) {
                set_hero_level(unit, delta.new_level);
            }

            break;
        }

        case Delta_Type.modifier_applied: {
            const unit = find_unit_by_id(battle, delta.unit_id);
            if (!unit) break;

            const source = deserialize_source(battle, delta.source);
            if (!source) break;

            apply_modifier(battle, source, unit, delta.application);

            break;
        }

        case Delta_Type.modifier_removed: {
            const result = find_modifier_by_handle_id(battle, delta.modifier_handle_id);

            if (result) {
                const [unit, modifier] = result;
                const index = unit.modifiers.indexOf(modifier);

                unit.modifiers.splice(index, 1);

                update_unit_modifier_state(unit);
            }

            break;
        }

        case Delta_Type.set_ability_charges: {
            const unit = find_unit_by_id(battle, delta.unit_id);

            if (unit) {
                const ability = find_unit_ability(unit, delta.ability_id);

                if (ability && ability.type != Ability_Type.passive) {
                    ability.charges_remaining = delta.charges;

                    if (!delta.only_set_remaining) {
                        ability.charges = delta.charges;
                    }
                }
            }

            break;
        }

        case Delta_Type.ability_effect_applied: {
            collapse_ability_effect(battle, delta.effect);

            break;
        }

        case Delta_Type.modifier_effect_applied: {
            collapse_modifier_effect(battle, delta);

            break;
        }

        case Delta_Type.timed_effect_expired: {
            const index = battle.timed_effects.findIndex(effect => effect.handle_id == delta.handle_id);
            if (index == -1) break;

            const effect = battle.timed_effects[index];

            expire_timed_effect(battle, effect.content);

            battle.timed_effects.splice(index, 1);

            break;
        }

        case Delta_Type.draw_card: {
            const player = find_player_by_id(battle, delta.player_id);
            if (!player) break;

            switch (delta.content.type) {
                case Card_Type.hero: {
                    add_card_to_hand(battle, player, {
                        type: Card_Type.hero,
                        id: delta.card_id,
                        hero_type: delta.content.hero
                    });

                    break;
                }

                case Card_Type.spell: {
                    add_card_to_hand(battle, player, {
                        id: delta.card_id,
                        ...spell_definition_by_id(delta.content.spell)
                    });

                    break;
                }

                default: unreachable(delta.content);
            }

            break;
        }

        case Delta_Type.use_card: {
            const player = find_player_by_id(battle, delta.player_id);
            if (!player) break;

            const card_index = player.hand.findIndex(in_hand => in_hand.id == delta.card_id);
            if (card_index == -1) break;

            player.hand.splice(card_index, 1);
            player.has_used_a_card_this_turn = true;

            break;
        }

        case Delta_Type.purchase_item: {
            const unit = find_hero_by_id(battle, delta.unit_id);
            const shop = find_shop_by_id(battle, delta.shop_id);

            if (!unit) break;
            if (!shop) break;

            const item_index = shop.items.indexOf(delta.item_id);
            if (item_index == -1) break;

            shop.items.splice(item_index, 1);
            unit.owner.gold -= delta.gold_cost;

            break;
        }

        case Delta_Type.equip_item: {
            const hero = find_hero_by_id(battle, delta.unit_id);

            if (hero) {
                collapse_item_equip(battle, hero, delta);
            }

            break;
        }

        case Delta_Type.gold_change: {
            const player = find_player_by_id(battle, delta.player_id);

            if (player) {
                change_gold(player, delta.change);
            }

            break;
        }

        case Delta_Type.game_over: {
            if (delta.result.draw) {
                battle.state = {
                    status: Battle_Status.finished,
                };
            } else {
                const player = find_player_by_id(battle, delta.result.winner_player_id);
                if (!player) break;

                battle.state = {
                    status: Battle_Status.finished,
                    winner: player
                }
            }

            break;
        }

        default: unreachable(delta);
    }
}