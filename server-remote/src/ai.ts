import {readFileSync} from "fs";
import {
    Battle_Record,
    find_unoccupied_cell_in_deployment_zone_for_player,
    random_in_array,
    try_take_turn_action
} from "./battle";

eval(readFileSync("dist/battle_sim.js", "utf8"));

type AI = {
    battle: Battle_Record
    player: Battle_Player
    act_permission: Player_Action_Permission
    pathing_costs_by_unit: Map<Unit, Cost_Population_Result>
}

function try_work_with_unit(ai: AI, actor: Unit) {
    const act_on_unit_permission = authorize_act_on_known_unit(ai.battle, actor);
    if (!act_on_unit_permission.ok) return;

    const act_on_owned_unit_permission = authorize_act_on_owned_unit(ai.act_permission, act_on_unit_permission);
    if (!act_on_owned_unit_permission.ok) return;

    const order_permission = authorize_order_unit(act_on_owned_unit_permission);
    if (!order_permission.ok) return;

    const pathing = ai.pathing_costs_by_unit.get(actor)!;

    type Interesting_Cell = {
        enemy: Unit
        cell: XY
        weight: number
        costs: Cost_Population_Result
        // ability: Ability
    }

    const interesting_cells: Interesting_Cell[] = [];

    for (const cell of ai.battle.cells) {
        for (const target of ai.battle.units) {
            const can_act_upon_target = authorize_act_on_known_unit(ai.battle, target);
            if (!can_act_upon_target.ok) continue;

            const are_allies = are_units_allies(actor, target);
            if (are_allies) continue;

            const ability = actor.attack;

            if (!ability) continue;
            if (ability.type != Ability_Type.target_ground) continue;

            const use_permission = authorize_ability_use(order_permission, ability.id);
            if (!use_permission.ok) continue;

            if (ability_targeting_fits(ai.battle, ability.targeting, cell.position, target.position)) {
                const damage = actor.attack_damage + actor.attack_bonus - target.armor;

                let weight = damage / target.health;

                if (weight > 1) {
                    weight *= 2;
                }

                interesting_cells.push({
                    enemy: target,
                    cell: cell.position,
                    weight: weight,
                    costs: populate_path_costs(ai.battle, cell.position)!
                })
            }
        }
    }

    let best_cell_score = Number.MIN_SAFE_INTEGER;
    let best_cell: Cell | undefined = undefined;
    let best_cell_targets: Interesting_Cell[] = [];

    for (const cell of ai.battle.cells) {
        const cell_index = grid_cell_index(ai.battle, cell.position);
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
                from_cell_to_target = pathing.cell_index_to_cost[grid_cell_index(ai.battle, target.cell)];
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
                cell_score += -from_cell_to_target + ((actor.max_move_points + actor.move_points_bonus) * target.weight * weight_multiplier);
            }
        }

        if (cell_score > best_cell_score) {
            best_cell_targets = cell_targets;
            best_cell_score = cell_score;
            best_cell = cell;
        }
    }

    if (best_cell) {
        try_take_turn_action(ai.battle, ai.player, {
            type: Action_Type.move,
            unit_id: actor.id,
            to: best_cell.position
        });

        if (best_cell_targets.length > 0) {
            const best_weight_target = best_cell_targets.reduce((prev, val) => prev.weight > val.weight ? prev : val);

            try_take_turn_action(ai.battle, ai.player, {
                type: Action_Type.ground_target_ability,
                unit_id: actor.id,
                ability_id: actor.attack!.id,
                to: best_weight_target.enemy.position
            });
        }
    }
}

function try_use_any_card(battle: Battle_Record, ai: Battle_Player) {
    const random_hero_card = random_in_array(ai.hand.filter(card => card.type == Card_Type.hero));

    if (random_hero_card) {
        const random_unoccupied_position = random_in_array(find_unoccupied_cell_in_deployment_zone_for_player(battle, ai));

        if (random_unoccupied_position) {
            try_take_turn_action(battle, ai, {
                type: Action_Type.use_hero_card,
                card_id: random_hero_card.id,
                at: random_unoccupied_position.position
            });
        }
    }
}

export function take_ai_action(battle: Battle_Record, player: Battle_Player) {
    const act_permission = authorize_action_by_player(battle, player);
    if (!act_permission.ok) return;

    const ai: AI = {
        battle: battle,
        player: player,
        pathing_costs_by_unit: new Map<Unit, Cost_Population_Result>(),
        act_permission: act_permission
    };

    for (const unit of battle.units) {
        const costs = populate_path_costs(battle, unit.position)!;

        ai.pathing_costs_by_unit.set(unit, costs);
    }

    if (ai.player.hand.length > 0) {
        try_use_any_card(battle, ai.player);
    }

    for (const unit of battle.units) {
        try_work_with_unit(ai, unit);
    }

    try_take_turn_action(battle, ai.player, {
        type: Action_Type.end_turn
    })
}