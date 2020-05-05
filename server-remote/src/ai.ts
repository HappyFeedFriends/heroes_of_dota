import {
    Battle_Record,
    find_unoccupied_cells_in_deployment_zone_for_player,
    try_take_turn_action
} from "./battle";
import {performance} from "perf_hooks";
import {check_if_battle_is_over, random_seed} from "./server";
import {
    cell_size,
    debug,
    push_color_rescale,
    push_debug_context,
    rescale_colors,
    clear_debug_ai_data
} from "./debug_draw";

type AI = {
    battle: Battle_Record
    player: Battle_Player
    act_permission: Player_Action_Permission
    pathing_costs_by_unit: Map<Unit, Cost_Population_Result>
}

const black = 0x000000;
const red = 0xff0000;
const green = 0x00ff00;

function take_ai_battle_action(ai: AI, action: Turn_Action) {
    try_take_turn_action(ai.battle, ai.player, action);
    check_if_battle_is_over(ai.battle);
}

function ai_compute_actions_for_unit(ai: AI, actor: Unit): Turn_Action[] {
    const act_on_unit_permission = authorize_act_on_known_unit(ai.battle, actor);
    if (!act_on_unit_permission.ok) return [];

    const act_on_owned_unit_permission = authorize_act_on_owned_unit(ai.act_permission, act_on_unit_permission);
    if (!act_on_owned_unit_permission.ok) return [];

    const order_permission = authorize_order_unit(act_on_owned_unit_permission);
    if (!order_permission.ok) return [];

    push_debug_context(actor);

    const pathing = ai.pathing_costs_by_unit.get(actor)!;

    type Interesting_Cell = {
        enemy: Unit
        cell: XY
        weight: number
        costs: Cost_Population_Result
        // ability: Ability
    }

    const interesting_cells: Interesting_Cell[] = [];

    push_color_rescale();

    for (const cell of ai.battle.grid.cells) {
        for (const target of ai.battle.units) {
            const can_act_upon_target = authorize_act_on_known_unit(ai.battle, target);
            if (!can_act_upon_target.ok) continue;

            const are_allies = are_units_allies(actor, target);
            if (are_allies) continue;

            const ability = actor.attack;
            if (!ability) continue;
            if (ability.type != Ability_Type.target_unit) continue;

            const use_permission = authorize_ability_use(order_permission, ability.id);
            if (!use_permission.ok) continue;

            if (ability_targeting_fits(ai.battle, ability.targeting, cell.position, target.position)) {
                const damage = get_attack_damage(actor) - get_armor(target);
                const damage_ratio = damage / target.health;

                let weight = manhattan(cell.position, target.position) * damage_ratio;

                if (damage_ratio > 1) {
                    weight *= 2;
                }

                interesting_cells.push({
                    enemy: target,
                    cell: cell.position,
                    weight: weight,
                    costs: populate_path_costs(ai.battle, cell.position, actor.move_points, [])
                });

                const size = cell_size * 0.2;
                const offset = cell_size - size;
                const x = cell.position.x * cell_size + offset / 2;
                const y = cell.position.y * cell_size + offset / 2;

                debug.text(weight, cell.position.x * cell_size + size, cell.position.y * cell_size + size, weight.toFixed(2));
                debug.rect(weight, x, y, x + size, y + size);
            }
        }
    }

    rescale_colors(green, red);

    push_color_rescale();

    let best_cell_score = Number.MIN_SAFE_INTEGER;
    let best_cell: Cell | undefined = undefined;
    let best_cell_targets: Interesting_Cell[] = [];

    let maximum_walkable_distance = ai.battle.grid.size.x * ai.battle.grid.size.y;

    for (const cell of ai.battle.grid.cells) {
        const cell_index = grid_cell_index(ai.battle.grid, cell.position);
        const from_actor_to_cell = pathing.cell_index_to_cost[cell_index];

        let cell_score = 0;

        if (from_actor_to_cell == undefined) continue;
        if (from_actor_to_cell > actor.move_points) continue;

        let can_act_from_cell = false;
        let cell_targets: Interesting_Cell[] = [];

        for (const target of interesting_cells) {
            let from_cell_to_target;

            // If we are checking actor's cell, the from_actor_to_cell is going to be 0,
            // but target.costs.cell_index_to_cost will yield undefined, because that cell is occupied
            if (xy_equal(actor.position, cell.position)) {
                from_cell_to_target = pathing.cell_index_to_cost[grid_cell_index(ai.battle.grid, target.cell)];
            } else {
                from_cell_to_target = target.costs.cell_index_to_cost[cell_index];
            }

            let weight_multiplier = 1;

            if (xy_equal(target.cell, cell.position)) {
                can_act_from_cell = true;

                weight_multiplier += 1;

                cell_targets.push(target);
            }

            if (from_cell_to_target != undefined) {
                cell_score += ((maximum_walkable_distance - from_cell_to_target) / maximum_walkable_distance) * target.weight * weight_multiplier;
            }
        }

        const size = cell_size * 0.2;
        const offset = cell_size - size;
        const x = cell.position.x * cell_size + offset / 2;
        const y = cell.position.y * cell_size + offset / 2;

        debug.text(cell_score, cell.position.x * cell_size + size, cell.position.y * cell_size + size, cell_score.toFixed(2));
        debug.circle(cell_score, x, y, size);

        if (cell_score > best_cell_score) {
            best_cell_targets = cell_targets;
            best_cell_score = cell_score;
            best_cell = cell;
        }
    }

    rescale_colors(green, red);

    const actions: Turn_Action[] = [];

    if (best_cell) {
        actions.push({
            type: Action_Type.move,
            unit_id: actor.id,
            to: best_cell.position
        });

        debug.arrow(green, actor.position, best_cell.position);

        if (best_cell_targets.length > 0) {
            const best_weight_target = best_cell_targets.reduce((prev, val) => prev.weight > val.weight ? prev : val);

            if (actor.attack) {
                const base = {
                    unit_id: actor.id,
                    ability_id: actor.attack.id
                };

                switch (actor.attack.type) {
                    case Ability_Type.target_ground: {
                        actions.push({
                            ...base,
                            type: Action_Type.ground_target_ability,
                            to: best_weight_target.enemy.position
                        });

                        break;
                    }

                    case Ability_Type.target_unit: {
                        actions.push({
                            ...base,
                            type: Action_Type.unit_target_ability,
                            target_id: best_weight_target.enemy.id
                        });

                        break;
                    }

                    case Ability_Type.no_target: {
                        actions.push({
                            ...base,
                            type: Action_Type.use_no_target_ability
                        });

                        break;
                    }
                }
            }

            debug.arrow(red, best_cell.position, best_weight_target.enemy.position);
        }
    }

    debug.text(black, 1 * cell_size, 11 * cell_size, `Random Seed: ${random_seed}`);

    return actions;
}

function try_use_any_card(ai: AI) {
    const battle = ai.battle;
    const random_hero_card = battle.random.in_array(ai.player.hand.filter(card => card.type == Card_Type.hero));

    if (random_hero_card) {
        const random_unoccupied_position = battle.random.in_array(find_unoccupied_cells_in_deployment_zone_for_player(battle, ai.player));

        if (random_unoccupied_position) {
            take_ai_battle_action(ai, {
                type: Action_Type.use_hero_card,
                card_id: random_hero_card.id,
                at: random_unoccupied_position.position
            });
        }
    }
}

function try_perform_ai_action(battle: Battle_Record, player: Battle_Player) {
    const act_permission = authorize_action_by_player(battle, player);
    if (!act_permission.ok) return;

    const start_time = performance.now();

    const ai: AI = {
        battle: battle,
        player: player,
        pathing_costs_by_unit: new Map<Unit, Cost_Population_Result>(),
        act_permission: act_permission
    };

    if (player.hand.length > 0) {
        try_use_any_card(ai);
    }

    clear_debug_ai_data();

    for (const unit of battle.units) {
        ai.pathing_costs_by_unit.clear();

        for (const unit of battle.units) {
            const costs = populate_unit_path_costs(battle, unit, false);

            ai.pathing_costs_by_unit.set(unit, costs);
        }

        const actions = ai_compute_actions_for_unit(ai, unit);

        for (const action of actions) {
            take_ai_battle_action(ai, action);
        }
    }

    take_ai_battle_action(ai, {
        type: Action_Type.end_turn
    });

    console.log(`try_perform_ai_action: ${performance.now() - start_time}ms`);
}

export function check_and_try_perform_ai_actions(battle: Battle_Record) {
    if (battle.turning_player.map_entity.type != Map_Entity_Type.player) {
        try_perform_ai_action(battle, battle.turning_player)
    }
}