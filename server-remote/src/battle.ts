import {Id_Generator, import_battle_sim, report_battle_over} from "./server";
import {XY} from "./common";
import {Random} from "./random";

import_battle_sim();

export type Battle_Record = Battle & {
    id: Battle_Id
    id_generator: Id_Generator
    random: Random
    random_seed: number
    deferred_actions: Deferred_Action[]
    monster_targets: Map<Monster, Unit>
    end_turn_queued: boolean
    world_origin: World_Origin
}

export type Battle_Participant = {
    heroes: Hero_Spawn[]
    creeps: Creep_Spawn[]
    spells: Spell_Spawn[]
    map_entity: Battle_Participant_Map_Entity
}

export type Hero_Spawn = {
    id: Unit_Id
    type: Hero_Type
    health: number
}

export type Creep_Spawn = {
    id: Unit_Id
    type: Creep_Type
    health: number
}

export type Spell_Spawn = {
    id: Card_Id
    spell: Spell_Id
}

type Deferred_Action = () => void

function defer(battle: Battle_Record, action: () => void) {
    battle.deferred_actions.push(action);
}

function defer_delta(battle: Battle_Record, supplier: () => Delta | undefined) {
    battle.deferred_actions.push(() => {
        const delta = supplier();

        if (delta) {
            battle.deltas.push(delta);
        }
    });
}

function defer_delta_by_unit(battle: Battle_Record, unit: Unit, supplier: () => Delta | undefined) {
    defer_delta(battle, () => {
        const act_on_unit_permission = authorize_act_on_known_unit(battle, unit);
        if (!act_on_unit_permission.ok) return;

        return supplier();
    })
}

type Scan_Result_Hit = {
    hit: true,
    unit: Unit
}

type Scan_Result_Missed = {
    hit: false,
    final_point: XY
}

function query_first_unit_in_line(
    battle: Battle,
    from_exclusive: XY,
    to: XY,
    line_length: number,
    direction_normal: XY = direction_normal_between_points(from_exclusive, to)
): Scan_Result_Hit | Scan_Result_Missed {
    let current_cell = xy(from_exclusive.x, from_exclusive.y);

    for (let scanned = 0; scanned < line_length; scanned++) {
        current_cell.x += direction_normal.x;
        current_cell.y += direction_normal.y;

        const unit = unit_at(battle, current_cell);

        if (unit && authorize_act_on_known_unit(battle, unit).ok) {
            return { hit: true, unit: unit };
        }

        const cell = grid_cell_at(battle.grid, current_cell);

        if (!cell) {
            return {
                hit: false,
                final_point: xy(current_cell.x - direction_normal.x, current_cell.y - direction_normal.y)
            };
        }

        if (cell.occupied) {
            return { hit: false, final_point: current_cell };
        }
    }

    return { hit: false, final_point: current_cell };
}

function query_units_for_no_target_ability(battle: Battle, caster: Unit, targeting: Ability_Targeting): Unit[] {
    const units: Unit[] = [];

    for (const unit of battle.units) {
        if (!authorize_act_on_known_unit(battle, unit).ok) continue;

        if (ability_targeting_fits(battle, targeting, caster.position, unit.position)) {
            units.push(unit);
        }
    }

    return units;
}

function query_units_with_selector(battle: Battle, from: XY, target: XY, selector: Ability_Target_Selector): Unit[] {
    const units: Unit[] = [];

    for (const unit of battle.units) {
        if (!authorize_act_on_known_unit(battle, unit).ok) continue;

        if (ability_selector_fits(battle, selector, from, target, unit.position)) {
            units.push(unit);
        }
    }

    return units;
}

function query_units_for_point_target_ability(battle: Battle, caster: Unit, target: XY, targeting: Ability_Targeting): Unit[] {
    return query_units_with_selector(battle, caster.position, target, targeting.selector);
}

function apply_ability_effect_delta<T extends Ability_Effect>(effect: T): Delta_Ability_Effect_Applied<T> {
    return {
        type: Delta_Type.ability_effect_applied,
        effect: effect
    }
}

function unit_health_change(target: Unit, change: number): Unit_Health_Change {
    return {
        change: health_change(target, change),
        target_unit_id: target.id
    }
}

function health_change(target: Unit, change: number): Health_Change {
    return {
        new_value: Math.max(0, Math.min(get_max_health(target), target.health + change)),
        value_delta: change
    }
}

function modifier(battle: Battle_Record, modifier: Modifier, duration?: number): Modifier_Application {
    return {
        modifier: modifier,
        modifier_handle_id: get_next_entity_id(battle) as Modifier_Handle_Id,
        duration: duration
    }
}

function perform_spell_cast_no_target(battle: Battle_Record, player: Battle_Player, spell: Card_Spell_No_Target): Delta_Use_No_Target_Spell {
    const base: Delta_Use_No_Target_Spell_Base = {
        type: Delta_Type.use_no_target_spell,
        player_id: player.id
    };

    switch (spell.spell_id) {
        case Spell_Id.mekansm: {
            const owned_units = battle.units.filter(unit => authorize_act_on_known_unit(battle, unit).ok && player_owns_unit(player, unit));

            return {
                ...base,
                spell_id: spell.spell_id,
                targets: owned_units.map(target => ({
                    target_unit_id: target.id,
                    change: health_change(target, spell.heal)
                }))
            }
        }

        case Spell_Id.buckler: {
            const owned_units = battle.units.filter(unit => authorize_act_on_known_unit(battle, unit).ok && player_owns_unit(player, unit));

            return {
                ...base,
                spell_id: spell.spell_id,
                targets: owned_units.map(target => ({
                    target_unit_id: target.id,
                    modifier: modifier(battle,{
                        id: Modifier_Id.spell_buckler,
                        armor: spell.armor
                    }, spell.duration)
                }))
            }
        }

        case Spell_Id.drums_of_endurance: {
            const owned_units = battle.units.filter(unit => authorize_act_on_known_unit(battle, unit).ok && player_owns_unit(player, unit));

            return {
                ...base,
                spell_id: spell.spell_id,
                targets: owned_units.map(target => ({
                    target_unit_id: target.id,
                    modifier: modifier(battle, {
                        id: Modifier_Id.spell_drums_of_endurance,
                        move_bonus: spell.move_points_bonus
                    }, 1)
                }))
            }
        }

        case Spell_Id.call_to_arms: {
            const spawn_points = battle.random.pick_n_mutable(find_unoccupied_cells_in_deployment_zone_for_player(battle, player), spell.creeps_to_summon);

            return {
                ...base,
                spell_id: spell.spell_id,
                summons: spawn_points.map(point => ({
                    at: point.position,
                    unit_id: get_next_entity_id(battle) as Unit_Id,
                    unit_type: Creep_Type.lane_creep
                }))
            }
        }
    }
}

function perform_spell_cast_unit_target(battle: Battle_Record, player: Battle_Player, target: Unit, spell: Card_Spell_Unit_Target): Delta_Use_Unit_Target_Spell {
    const base: Delta_Use_Unit_Target_Spell_Base = {
        type: Delta_Type.use_unit_target_spell,
        player_id: player.id,
        target_id: target.id
    };

    switch (spell.spell_id) {
        case Spell_Id.buyback: {
            return {
                ...base,
                spell_id: spell.spell_id,
                new_card_id: get_next_entity_id(battle) as Card_Id,
                gold_change: -get_buyback_cost(target),
                heal: { new_value: get_max_health(target), value_delta: 0 },
                modifier: modifier(battle, { id: Modifier_Id.returned_to_hand })
            }
        }

        case Spell_Id.town_portal_scroll: {
            return {
                ...base,
                spell_id: spell.spell_id,
                new_card_id: get_next_entity_id(battle) as Card_Id,
                heal: { new_value: get_max_health(target), value_delta: 0 },
                modifier: modifier(battle, { id: Modifier_Id.returned_to_hand })
            }
        }

        case Spell_Id.euls_scepter: {
            return {
                ...base,
                spell_id: spell.spell_id,
                modifier: modifier(battle, { id: Modifier_Id.spell_euls_scepter }, 1)
            }
        }

        case Spell_Id.refresher_orb: {
            const changes: {
                ability_id: Ability_Id,
                charges_remaining: number
            }[] = [];

            for (const ability of target.abilities) {
                if (ability.type != Ability_Type.passive) {
                    changes.push({
                        ability_id: ability.id,
                        charges_remaining: ability.charges
                    })
                }
            }

            return {
                ...base,
                spell_id: spell.spell_id,
                charge_changes: changes
            }
        }
    }
}

function perform_spell_cast_ground_target(battle: Battle_Record, player: Battle_Player, at: XY, spell: Card_Spell_Ground_Target): Delta_Use_Ground_Target_Spell {
    const base: Delta_Use_Ground_Target_Spell_Base = {
        type: Delta_Type.use_ground_target_spell,
        player_id: player.id,
        at: at
    };

    switch (spell.spell_id) {
        case Spell_Id.pocket_tower: {
            return {
                ...base,
                spell_id: spell.spell_id,
                new_unit_type: Creep_Type.pocket_tower,
                new_unit_id: get_next_entity_id(battle) as Unit_Id
            }
        }
    }
}

function calculate_basic_attack_damage_to_target(source: Unit, target: Unit) {
    return Math.max(0, get_attack_damage(source) - get_armor(target));
}

function perform_ability_cast_ground(battle: Battle_Record, unit: Unit, ability: Ability_Ground_Target, target: XY): Delta_Ground_Target_Ability {
    const base: Delta_Ground_Target_Ability_Base = {
        type: Delta_Type.use_ground_target_ability,
        unit_id: unit.id,
        target_position: target,
    };

    switch (ability.id) {
        case Ability_Id.basic_attack: {
            const scan = query_first_unit_in_line(battle, unit.position, target, ability.targeting.line_length);

            if (scan.hit) {
                const damage = calculate_basic_attack_damage_to_target(unit, scan.unit);

                return {
                    ...base,
                    ability_id: ability.id,
                    result: {
                        hit: true,
                        target_unit_id: scan.unit.id,
                        damage_dealt: health_change(scan.unit, -damage)
                    }
                };
            } else {
                return {
                    ...base,
                    ability_id: ability.id,
                    result: {
                        hit: false,
                        final_point: scan.final_point
                    }
                };
            }
        }

        case Ability_Id.pudge_hook: {
            const distance = ability.targeting.line_length;
            const direction = direction_normal_between_points(unit.position, target);
            const scan = query_first_unit_in_line(battle, unit.position, target, distance, direction);

            if (scan.hit) {
                return {
                    ...base,
                    ability_id: ability.id,
                    result: {
                        hit: true,
                        target_unit_id: scan.unit.id,
                        damage_dealt: health_change(scan.unit, -ability.damage),
                        move_target_to: xy(unit.position.x + direction.x, unit.position.y + direction.y)
                    }
                };
            } else {
                return {
                    ...base,
                    ability_id: ability.id,
                    result: { hit: false, final_point: scan.final_point }
                }
            }
        }

        case Ability_Id.skywrath_mystic_flare: {
            const targets = query_units_for_point_target_ability(battle, unit, target, ability.targeting).map(target => ({
                unit: target,
                damage_applied: 0
            }));

            let remaining_targets = targets.length;
            let remaining_damage = ability.damage;

            for (; remaining_damage > 0 && remaining_targets > 0; remaining_damage--) {
                const target_index = battle.random.int_up_to(remaining_targets);
                const random_target = targets[target_index];

                random_target.damage_applied++;

                if (random_target.damage_applied == random_target.unit.health) {
                    const last_target = targets[remaining_targets - 1];

                    targets[remaining_targets - 1] = random_target;
                    targets[target_index] = last_target;

                    remaining_targets--;
                }
            }

            return {
                ...base,
                ability_id: ability.id,
                targets: targets.map(target => unit_health_change(target.unit, -target.damage_applied)),
                damage_remaining: remaining_damage
            }
        }

        case Ability_Id.dragon_knight_breathe_fire: {
            const targets = query_units_for_point_target_ability(battle, unit, target, ability.targeting)
                .map(target => unit_health_change(target, -ability.damage));

            return {
                ...base,
                ability_id: ability.id,
                targets: targets
            }
        }

        case Ability_Id.dragon_knight_elder_dragon_form_attack: {
            const targets = query_units_for_point_target_ability(battle, unit, target, ability.targeting)
                .map(target => unit_health_change(target, -calculate_basic_attack_damage_to_target(unit, target)));

            return {
                ...base,
                ability_id: ability.id,
                targets: targets
            }
        }

        case Ability_Id.lion_impale: {
            const targets = query_units_for_point_target_ability(battle, unit, target, ability.targeting).map(target => ({
                target_unit_id: target.id,
                change: health_change(target, -ability.damage),
                modifier: modifier(battle, { id: Modifier_Id.lion_impale }, 1)
            }));

            return {
                ...base,
                ability_id: ability.id,
                targets: targets
            };
        }

        case Ability_Id.mirana_arrow: {
            const scan = query_first_unit_in_line(battle, unit.position, target, ability.targeting.line_length);

            if (scan.hit) {
                return {
                    ...base,
                    ability_id: ability.id,
                    result: {
                        hit: true,
                        stun: {
                            target_unit_id: scan.unit.id,
                            modifier: modifier(battle, { id: Modifier_Id.mirana_arrow }, 1)
                        }
                    }
                };
            } else {
                return {
                    ...base,
                    ability_id: ability.id,
                    result: {
                        hit: false,
                        final_point: scan.final_point
                    }
                };
            }
        }

        case Ability_Id.mirana_leap: {
            return {
                ...base,
                ability_id: ability.id
            }
        }

        case Ability_Id.venge_wave_of_terror: {
            const targets = query_units_for_point_target_ability(battle, unit, target, ability.targeting).map(target => ({
                target_unit_id: target.id,
                change: health_change(target, -ability.damage),
                modifier: modifier(battle, {
                    id: Modifier_Id.venge_wave_of_terror,
                    armor_reduction: ability.armor_reduction
                }, ability.duration)
            }));

            return {
                ...base,
                ability_id: ability.id,
                targets: targets
            }
        }

        case Ability_Id.dark_seer_vacuum: {
            const targets = query_units_for_point_target_ability(battle, unit, target, ability.targeting);
            const sorted_by_distance_to_target = targets.sort((a, b) => {
                const a_distance = manhattan(a.position, target);
                const b_distance = manhattan(b.position, target);

                return a_distance - b_distance;
            });

            const selector = ability.targeting.selector;
            const free_cells = battle.grid.cells
                .filter(cell => !cell.occupied && ability_selector_fits(battle, selector, unit.position, target, cell.position))
                .map(cell => cell.position);

            const closest_free_cell = (for_unit_cell: XY) => {
                let closest_index: number | undefined;
                let closest_distance = Number.MAX_SAFE_INTEGER;
                const unit_to_target = manhattan(for_unit_cell, target);

                for (let index = 0; index < free_cells.length; index++) {
                    const cell = free_cells[index];
                    const cell_to_target = manhattan(target, cell);
                    const cell_to_unit = manhattan(for_unit_cell, cell);

                    if (cell_to_unit <= unit_to_target && cell_to_target <= unit_to_target && cell_to_target <= closest_distance) {
                        closest_index = index;
                        closest_distance = cell_to_target;
                    }
                }

                return closest_index;
            };

            const vacuum_targets: Vacuum_Target[] = [];

            for (const affected_target of sorted_by_distance_to_target) {
                const move_to_index = closest_free_cell(affected_target.position);

                if (move_to_index == undefined) {
                    continue;
                }

                const move_to = free_cells[move_to_index];

                free_cells[move_to_index] = affected_target.position;

                vacuum_targets.push({
                    target_unit_id: affected_target.id,
                    move_to: {
                        x: move_to.x,
                        y: move_to.y
                    }
                });
            }

            return {
                ...base,
                ability_id: ability.id,
                targets: vacuum_targets
            }
        }

        case Ability_Id.ember_fire_remnant: {
            const remnant_id = get_next_entity_id(battle) as Unit_Id;

            return {
                ...base,
                ability_id: ability.id,
                modifier: modifier(battle, {
                    id: Modifier_Id.ember_fire_remnant_caster,
                    remnant_unit_id: remnant_id
                }),
                remnant: {
                    id: remnant_id,
                    type: Creep_Type.ember_fire_remnant,
                    modifier: modifier(battle, {
                        id: Modifier_Id.ember_fire_remnant,
                        remnant_owner_unit_id: unit.id
                    })
                }
            }
        }
    }
}

function perform_ability_cast_no_target(battle: Battle_Record, unit: Unit, ability: Ability_No_Target): Delta_Use_No_Target_Ability {
    const base: Delta_Use_No_Target_Ability_Base = {
        type: Delta_Type.use_no_target_ability,
        unit_id: unit.id,
    };

    switch (ability.id) {
        case Ability_Id.pudge_rot: {
            const targets = query_units_for_no_target_ability(battle, unit, ability.targeting)
                .map(target => unit_health_change(target, -ability.damage));

            return {
                ...base,
                ability_id: ability.id,
                targets: targets
            }
        }

        case Ability_Id.tide_anchor_smash: {
            const targets = query_units_for_no_target_ability(battle, unit, ability.targeting).map(target => ({
                target_unit_id: target.id,
                change: health_change(target, -ability.damage),
                modifier: modifier(battle, {
                    id: Modifier_Id.tide_anchor_smash,
                    attack_reduction: ability.attack_reduction
                }, 1)
            }));

            return {
                ...base,
                ability_id: ability.id,
                targets: targets
            };
        }

        case Ability_Id.tide_ravage: {
            const targets = query_units_for_no_target_ability(battle, unit, ability.targeting).map(target => ({
                target_unit_id: target.id,
                change: health_change(target, -ability.damage),
                modifier: modifier(battle, { id: Modifier_Id.tide_ravage }, 1)
            }));

            return {
                ...base,
                ability_id: ability.id,
                targets: targets
            };
        }

        case Ability_Id.luna_eclipse: {
            const targets = query_units_for_no_target_ability(battle, unit, ability.targeting).map(target => ({
                unit: target,
                beams_applied: 0
            }));

            let remaining_targets = targets.length;
            let remaining_beams = ability.total_beams;

            for (; remaining_beams > 0 && remaining_targets > 0; remaining_beams--) {
                const target_index = battle.random.int_up_to(remaining_targets);
                const random_target = targets[target_index];

                random_target.beams_applied++;

                if (random_target.beams_applied == random_target.unit.health) {
                    const last_target = targets[remaining_targets - 1];

                    targets[remaining_targets - 1] = random_target;
                    targets[target_index] = last_target;

                    remaining_targets--;
                }
            }

            const effects = targets
                .filter(target => target.beams_applied > 0)
                .map(target => unit_health_change(target.unit, -target.beams_applied));

            return {
                ...base,
                ability_id: ability.id,
                missed_beams: remaining_beams,
                targets: effects
            };
        }

        case Ability_Id.skywrath_concussive_shot: {
            const targets = query_units_for_no_target_ability(battle, unit, ability.targeting);
            const enemies = targets.filter(target => !are_units_allies(unit, target));
            const allies = targets.filter(target => are_units_allies(unit, target));
            const target = enemies.length > 0 ? battle.random.in_array(enemies) : battle.random.in_array(allies);

            if (target) {
                return {
                    ...base,
                    ability_id: ability.id,
                    result: {
                        hit: true,
                        target_unit_id: target.id,
                        damage: health_change(target, -ability.damage),
                        modifier: modifier(battle, {
                                id: Modifier_Id.skywrath_concussive_shot,
                                move_reduction: ability.move_points_reduction
                        }, ability.duration)
                    }
                }
            } else {
                return {
                    ...base,
                    ability_id: ability.id,
                    result: {
                        hit: false
                    }
                }
            }
        }

        case Ability_Id.dragon_knight_elder_dragon_form: {
            return {
                ...base,
                ability_id: ability.id,
                modifier: modifier(battle, { id: Modifier_Id.dragon_knight_elder_dragon_form }, ability.duration),
            }
        }

        case Ability_Id.mirana_starfall: {
            defer_delta(battle, () => {
                const targets = query_units_for_no_target_ability(battle, unit, ability.targeting);
                const enemies = targets.filter(target => !are_units_allies(unit, target));
                const allies = targets.filter(target => are_units_allies(unit, target));
                const extra_target = enemies.length > 0 ? battle.random.in_array(enemies) : battle.random.in_array(allies);

                if (extra_target) {
                    return apply_ability_effect_delta({
                        ability_id: ability.id,
                        source_unit_id: unit.id,
                        target_unit_id: extra_target.id,
                        damage_dealt: health_change(extra_target, -ability.damage)
                    });
                }
            });

            const targets = query_units_for_no_target_ability(battle, unit, ability.targeting);

            return {
                ...base,
                ability_id: ability.id,
                targets: targets.map(target => ({
                    target_unit_id: target.id,
                    change: health_change(target, -ability.damage)
                }))
            }
        }

        case Ability_Id.ember_searing_chains: {
            const all_targets = query_units_for_no_target_ability(battle, unit, ability.targeting);
            const enemies = battle.random.pick_n_mutable(all_targets.filter(target => !are_units_allies(unit, target)), ability.targets);
            const allies = battle.random.pick_n_mutable(all_targets.filter(target => are_units_allies(unit, target)), ability.targets);
            const targets = [...enemies, ...allies].slice(0, ability.targets);

            return {
                ...base,
                ability_id: ability.id,
                targets: targets.map(target => ({
                    target_unit_id: target.id,
                    modifier: modifier(battle, { id: Modifier_Id.ember_searing_chains }, 1)
                }))
            }
        }

        case Ability_Id.ember_sleight_of_fist: {
            const targets = query_units_for_no_target_ability(battle, unit, ability.targeting);

            return {
                ...base,
                ability_id: ability.id,
                targets: targets.map(target => unit_health_change(target, -calculate_basic_attack_damage_to_target(unit, target)))
            }
        }

        case Ability_Id.ember_activate_fire_remnant: {
            for (const applied of unit.modifiers) {
                if (applied.modifier.id == Modifier_Id.ember_fire_remnant_caster) {
                    const remnant = find_unit_by_id(battle, applied.modifier.remnant_unit_id);
                    if (!remnant) break;

                    defer_delta(battle, () => ({
                        type: Delta_Type.set_ability_charges_remaining,
                        unit_id: unit.id,
                        ability_id: Ability_Id.ember_activate_fire_remnant,
                        charges_remaining: 1
                    }));

                    defer_delta(battle, () => ({
                        type: Delta_Type.modifier_removed,
                        modifier_handle_id: applied.handle_id
                    }));

                    return {
                        ...base,
                        ability_id: ability.id,
                        action: {
                            remnant_id: remnant.id,
                            move_to: remnant.position
                        }
                    }
                }
            }

            return {
                ...base,
                ability_id: ability.id
            } ;
        }
    }
}

function perform_ability_cast_unit_target(battle: Battle_Record, unit: Unit, ability: Ability_Unit_Target, target: Unit): Delta_Unit_Target_Ability {
    const base: Delta_Unit_Target_Ability_Base = {
        type: Delta_Type.use_unit_target_ability,
        unit_id: unit.id,
        target_unit_id: target.id,
    };

    switch (ability.id) {
        case Ability_Id.pudge_dismember: {
            return {
                ...base,
                ability_id: ability.id,
                damage_dealt: health_change(target, -ability.damage),
                health_restored: health_change(target, ability.damage)
            };
        }

        case Ability_Id.tide_gush: {
            return {
                ...base,
                ability_id: ability.id,
                modifier: modifier(battle, {
                    id: Modifier_Id.tide_gush,
                    move_reduction: ability.move_points_reduction
                }, 1),
                damage_dealt: health_change(target, -ability.damage),
            };
        }

        case Ability_Id.luna_lucent_beam: {
            return {
                ...base,
                ability_id: ability.id,
                damage_dealt: health_change(target, -ability.damage)
            };
        }

        case Ability_Id.skywrath_ancient_seal: {
            return {
                ...base,
                ability_id: ability.id,
                modifier: modifier(battle, { id: Modifier_Id.skywrath_ancient_seal }, ability.duration),
            }
        }

        case Ability_Id.dragon_knight_dragon_tail: {
            return {
                ...base,
                ability_id: ability.id,
                modifier: modifier(battle, { id: Modifier_Id.dragon_knight_dragon_tail }, 1),
                damage_dealt: health_change(target, -ability.damage)
            }
        }

        case Ability_Id.lion_hex: {
            return {
                ...base,
                ability_id: ability.id,
                modifier: modifier(battle, {
                    id: Modifier_Id.lion_hex,
                    move_reduction: ability.move_points_reduction
                }, ability.duration)
            }
        }

        case Ability_Id.lion_finger_of_death: {
            return {
                ...base,
                ability_id: ability.id,
                damage_dealt: health_change(target, -ability.damage)
            }
        }

        case Ability_Id.venge_magic_missile: {
            return {
                ...base,
                ability_id: ability.id,
                modifier: modifier(battle, { id: Modifier_Id.venge_magic_missile }, 1),
                damage_dealt: health_change(target, -ability.damage)
            }
        }

        case Ability_Id.venge_nether_swap: {
            return {
                ...base,
                ability_id: ability.id
            }
        }

        case Ability_Id.dark_seer_ion_shell: {
            return {
                ...base,
                ability_id: ability.id,
                modifier: modifier(battle, { id: Modifier_Id.dark_seer_ion_shell }, ability.duration)
            }
        }

        case Ability_Id.dark_seer_surge: {
            return {
                ...base,
                ability_id: ability.id,
                modifier: modifier(battle, {
                    id: Modifier_Id.dark_seer_surge,
                    move_bonus: ability.move_points_bonus
                }, 1),
            }
        }
    }
}

function equip_item(battle: Battle_Record, hero: Hero, item: Item): Delta_Equip_Item {
    switch (item.id) {
        case Item_Id.refresher_shard: {
            const changes: {
                ability_id: Ability_Id,
                charges_remaining: number
            }[] = [];

            for (const ability of hero.abilities) {
                if (ability.type != Ability_Type.passive) {
                    changes.push({
                        ability_id: ability.id,
                        charges_remaining: ability.charges
                    })
                }
            }

            return {
                type: Delta_Type.equip_item,
                unit_id: hero.id,
                item_id: item.id,
                charge_changes: changes
            }
        }

        case Item_Id.enchanted_mango: {
            for (const ability of hero.abilities) {
                if (ability.type != Ability_Type.passive && ability.available_since_level == 1) {
                    return {
                        type: Delta_Type.equip_item,
                        unit_id: hero.id,
                        item_id: item.id,
                        change: {
                            ability_id: ability.id,
                            charges_remaining: ability.charges_remaining + item.bonus_charges
                        }
                    }
                }
            }

            return {
                type: Delta_Type.equip_item,
                unit_id: hero.id,
                item_id: item.id,
                change: undefined
            }
        }

        case Item_Id.boots_of_travel: {
            return {
                type: Delta_Type.equip_item,
                unit_id: hero.id,
                item_id: item.id,
                modifier: modifier(battle, {
                    id: Modifier_Id.item_boots_of_travel,
                    move_bonus: item.move_points_bonus
                })
            }
        }

        case Item_Id.boots_of_speed: {
            return {
                type: Delta_Type.equip_item,
                unit_id: hero.id,
                item_id: item.id,
                modifier: modifier(battle, {
                    id: Modifier_Id.item_boots_of_speed,
                    move_bonus: item.move_points_bonus
                })
            }
        }

        case Item_Id.blades_of_attack: {
            return {
                type: Delta_Type.equip_item,
                unit_id: hero.id,
                item_id: item.id,
                modifier: modifier(battle, {
                    id: Modifier_Id.item_blades_of_attack,
                    attack: item.damage_bonus
                })
            }
        }

        case Item_Id.divine_rapier: {
            return {
                type: Delta_Type.equip_item,
                unit_id: hero.id,
                item_id: item.id,
                modifier: modifier(battle, {
                    id: Modifier_Id.item_divine_rapier,
                    attack: item.damage_bonus
                })
            }
        }

        case Item_Id.assault_cuirass: {
            return {
                type: Delta_Type.equip_item,
                unit_id: hero.id,
                item_id: item.id,
                modifier: modifier(battle, {
                    id: Modifier_Id.item_assault_cuirass,
                    armor: item.armor_bonus
                })
            }
        }

        case Item_Id.tome_of_knowledge: {
            return {
                type: Delta_Type.equip_item,
                unit_id: hero.id,
                item_id: item.id,
                new_level: Math.min(hero.level + 1, max_unit_level)
            }
        }

        case Item_Id.heart_of_tarrasque: {
            return {
                type: Delta_Type.equip_item,
                unit_id: hero.id,
                item_id: item.id,
                modifier: modifier(battle, {
                    id: Modifier_Id.item_heart_of_tarrasque,
                    health: item.health_bonus,
                    regeneration_per_turn: item.regeneration_per_turn
                })
            }
        }

        case Item_Id.satanic: {
            return {
                type: Delta_Type.equip_item,
                unit_id: hero.id,
                item_id: item.id,
                modifier: modifier(battle, { id: Modifier_Id.item_satanic })
            }
        }

        case Item_Id.mask_of_madness: {
            return {
                type: Delta_Type.equip_item,
                unit_id: hero.id,
                item_id: item.id,
                modifier: modifier(battle, {
                    id: Modifier_Id.item_mask_of_madness,
                    attack: item.damage_bonus
                })
            }
        }

        case Item_Id.armlet: {
            return {
                type: Delta_Type.equip_item,
                unit_id: hero.id,
                item_id: item.id,
                modifier: modifier(battle, {
                    id: Modifier_Id.item_armlet,
                    health: item.health_bonus,
                    health_loss_per_turn: item.health_loss_per_turn
                })
            }
        }

        case Item_Id.belt_of_strength: {
            return {
                type: Delta_Type.equip_item,
                unit_id: hero.id,
                item_id: item.id,
                modifier: modifier(battle, {
                    id: Modifier_Id.item_belt_of_strength,
                    health: item.health_bonus
                })
            }
        }

        case Item_Id.morbid_mask: {
            return {
                type: Delta_Type.equip_item,
                unit_id: hero.id,
                item_id: item.id,
                modifier: modifier(battle, {
                    id: Modifier_Id.item_morbid_mask,
                    health_restored_per_attack: item.health_restored_per_attack
                })
            }
        }

        case Item_Id.octarine_core: {
            return {
                type: Delta_Type.equip_item,
                unit_id: hero.id,
                item_id: item.id,
                modifier: modifier(battle, { id: Modifier_Id.item_octarine_core })
            }
        }

        case Item_Id.chainmail: {
            return {
                type: Delta_Type.equip_item,
                unit_id: hero.id,
                item_id: item.id,
                modifier: modifier(battle, {
                    id: Modifier_Id.item_chainmail,
                    armor: item.armor_bonus
                })
            }
        }

        case Item_Id.basher: {
            return {
                type: Delta_Type.equip_item,
                unit_id: hero.id,
                item_id: item.id,
                modifier: modifier(battle, { id: Modifier_Id.item_basher_bearer })
            }
        }

    }
}

function pick_up_rune(battle: Battle_Record, hero: Hero, rune: Rune, move_cost: number): Delta_Rune_Pick_Up {
    const base = {
        unit_id: hero.id,
        rune_id: rune.id,
        at: rune.position,
        move_cost: move_cost
    };

    switch (rune.type) {
        case Rune_Type.bounty: {
            return {
                ...base,
                type: Delta_Type.rune_pick_up,
                rune_type: rune.type,
                gold_gained: 10
            };
        }

        case Rune_Type.regeneration: {
            return {
                ...base,
                type: Delta_Type.rune_pick_up,
                rune_type: rune.type,
                heal: health_change(hero, get_max_health(hero) - hero.health)
            };
        }

        case Rune_Type.haste: {
            return {
                ...base,
                type: Delta_Type.rune_pick_up,
                rune_type: rune.type,
                modifier: modifier(battle, {
                    id: Modifier_Id.rune_haste,
                    move_bonus: 3
                })
            };
        }

        case Rune_Type.double_damage: {
            return {
                ...base,
                type: Delta_Type.rune_pick_up,
                rune_type: rune.type,
                modifier: modifier(battle, { id: Modifier_Id.rune_double_damage })
            };
        }
    }
}

function on_target_dealt_damage_by_ability(battle: Battle_Record, source: Unit, target: Unit, damage: number): void {
    if (source.supertype == Unit_Supertype.hero) {
        defer_delta(battle, () => {
            for (const applied of source.modifiers) {
                if (applied.modifier.id == Modifier_Id.item_octarine_core) {
                    return {
                        type: Delta_Type.modifier_effect_applied,
                        modifier_id: applied.modifier.id,
                        handle_id: applied.handle_id,
                        heal: unit_health_change(source, damage)
                    };
                }
            }
        });
    }
}

function on_target_dealt_damage_by_attack(battle: Battle_Record, source: Unit, target: Unit, damage: number): void {
    const damage_only = Math.max(0, damage); // In case we have a healing attack, I guess;

    if (source.supertype == Unit_Supertype.hero) {
        defer_delta(battle, () => {
            for (const applied of source.modifiers) {
                if (applied.modifier.id == Modifier_Id.item_satanic) {
                    return {
                        type: Delta_Type.modifier_effect_applied,
                        modifier_id: applied.modifier.id,
                        handle_id: applied.handle_id,
                        heal: unit_health_change(source, damage_only)
                    };
                }
            }
        });

        defer_delta(battle, () => {
            for (const applied of source.modifiers) {
                if (applied.modifier.id == Modifier_Id.item_morbid_mask) {
                    return {
                        type: Delta_Type.modifier_effect_applied,
                        modifier_id: applied.modifier.id,
                        handle_id: applied.handle_id,
                        heal: unit_health_change(source, applied.modifier.health_restored_per_attack)
                    };
                }
            }
        });

        defer_delta(battle, () => {
            for (const applied of source.modifiers) {
                if (applied.modifier.id == Modifier_Id.item_basher_bearer) {
                    return {
                        type: Delta_Type.modifier_effect_applied,
                        modifier_id: applied.modifier.id,
                        handle_id: applied.handle_id,
                        target_unit_id: target.id,
                        modifier: modifier(battle, { id: Modifier_Id.item_basher_target }, 1)
                    };
                }
            }
        });
    }

    for (const ability of source.abilities) {
        if (source.supertype == Unit_Supertype.hero) {
            if (source.level < ability.available_since_level) continue;
        }

        switch (ability.id) {
            case Ability_Id.luna_moon_glaive: {
                defer_delta(battle, () => {
                    const targets = query_units_for_no_target_ability(battle, target, ability.secondary_targeting);
                    const allies = targets.filter(target => are_units_allies(source, target) && target != source);
                    const enemies = targets.filter(target => !are_units_allies(source, target));
                    const glaive_target = enemies.length > 0 ? battle.random.in_array(enemies) : battle.random.in_array(allies);

                    if (glaive_target) {
                        return apply_ability_effect_delta({
                            ability_id: ability.id,
                            source_unit_id: source.id,
                            target_unit_id: glaive_target.id,
                            original_target_id: target.id,
                            damage_dealt: health_change(glaive_target, -damage)
                        });
                    }
                });

                break;
            }

            case Ability_Id.monster_lifesteal: {
                defer_delta(battle, () => apply_ability_effect_delta({
                    ability_id: Ability_Id.monster_lifesteal,
                    source_unit_id: source.id,
                    target_unit_id: source.id,
                    heal: health_change(source, damage_only)
                }));
            }
        }
    }
}

function turn_action_to_new_deltas(battle: Battle_Record, action_permission: Player_Action_Permission, action: Turn_Action): Delta[] | undefined {
    function authorize_unit_for_order(unit_id: Unit_Id): Order_Unit_Auth {
        const act_on_unit_permission = authorize_act_on_unit(battle, unit_id);
        if (!act_on_unit_permission.ok) return { ok: false, kind: Order_Unit_Error.other };

        const act_on_owned_unit_permission = authorize_act_on_owned_unit(action_permission, act_on_unit_permission);
        if (!act_on_owned_unit_permission.ok) return { ok: false, kind: Order_Unit_Error.other };

        return authorize_order_unit(act_on_owned_unit_permission);
    }

    function authorize_unit_for_ability(unit_id: Unit_Id, ability_id: Ability_Id): Ability_Use_Permission | undefined {
        const order_unit_permission = authorize_unit_for_order(unit_id);
        if (!order_unit_permission.ok) return;

        const ability_use_permission = authorize_ability_use(order_unit_permission, ability_id);
        if (!ability_use_permission.ok) return;

        return ability_use_permission;
    }

    function decrement_charges(unit: Unit, ability: Ability_Active): Delta_Set_Ability_Charges_Remaining {
        return {
            type: Delta_Type.set_ability_charges_remaining,
            unit_id: unit.id,
            ability_id: ability.id,
            charges_remaining: ability.charges_remaining - 1
        }
    }

    switch (action.type) {
        case Action_Type.move: {
            const order_unit_permission = authorize_unit_for_order(action.unit_id);
            if (!order_unit_permission.ok) return;

            const move_order_permission = authorize_move_order(order_unit_permission, action.to, false);
            if (!move_order_permission.ok) return;

            return [{
                type: Delta_Type.unit_move,
                move_cost: move_order_permission.cost,
                unit_id: move_order_permission.unit.id,
                to_position: action.to
            }];
        }

        case Action_Type.use_no_target_ability: {
            const ability_use_permission = authorize_unit_for_ability(action.unit_id, action.ability_id);
            if (!ability_use_permission) return;

            const { unit, ability } = ability_use_permission;

            if (ability.type != Ability_Type.no_target) return;

            return [
                decrement_charges(unit, ability),
                perform_ability_cast_no_target(battle, unit, ability)
            ]
        }

        case Action_Type.unit_target_ability: {
            const ability_use_permission = authorize_unit_for_ability(action.unit_id, action.ability_id);
            if (!ability_use_permission) return;

            const act_on_target_permission = authorize_act_on_unit(battle, action.target_id);
            if (!act_on_target_permission.ok) return;

            const use_ability_on_target_permission = authorize_unit_target_ability_use(ability_use_permission, act_on_target_permission);
            if (!use_ability_on_target_permission.ok) return;

            const { unit, ability, target } = use_ability_on_target_permission;

            return [
                decrement_charges(unit, ability),
                perform_ability_cast_unit_target(battle, unit, ability, target)
            ]
        }

        case Action_Type.ground_target_ability: {
            const ability_use_permission = authorize_unit_for_ability(action.unit_id, action.ability_id);
            if (!ability_use_permission) return;

            const ground_ability_use_permission = authorize_ground_target_ability_use(ability_use_permission, action.to);
            if (!ground_ability_use_permission.ok) return;

            const { unit, ability, target } = ground_ability_use_permission;

            return [
                decrement_charges(unit, ability),
                perform_ability_cast_ground(battle, unit, ability, target.position)
            ];
        }

        case Action_Type.use_hero_card: {
            const card_use_permission = authorize_card_use(action_permission, action.card_id);
            if (!card_use_permission.ok) return;

            const hero_card_use_permission = authorize_hero_card_use(card_use_permission, action.at);
            if (!hero_card_use_permission.ok) return;

            const { player, card } = hero_card_use_permission;

            return [
                use_card(player, card),
                spawn_hero(get_next_entity_id(battle) as Unit_Id, player, action.at, card.hero_type, hero_definition_by_type(card.hero_type).health)
            ]
        }

        case Action_Type.use_existing_hero_card: {
            const card_use_permission = authorize_card_use(action_permission, action.card_id);
            if (!card_use_permission.ok) return;

            const hero_card_use_permission = authorize_existing_hero_card_use(card_use_permission, action.at);
            if (!hero_card_use_permission.ok) return;

            const { player, card } = hero_card_use_permission;

            return [
                use_card(player, card),
                {
                    type: Delta_Type.hero_spawn_from_hand,
                    source_spell_id: card.generated_by,
                    hero_id: card.hero_id,
                    at_position: action.at
                }
            ]
        }

        case Action_Type.use_unit_target_spell_card: {
            const card_use_permission = authorize_card_use(action_permission, action.card_id);
            if (!card_use_permission.ok) return;

            const spell_use_permission = authorize_unit_target_spell_use(card_use_permission);
            if (!spell_use_permission.ok) return;

            const spell_use_on_unit_permission = authorize_unit_target_for_spell_card_use(spell_use_permission, action.unit_id);
            if (!spell_use_on_unit_permission.ok) return;

            if (!authorize_spell_use_buyback_check(spell_use_on_unit_permission)) return;

            const { player, card, spell, unit } = spell_use_on_unit_permission;

            return [
                use_card(player, card),
                perform_spell_cast_unit_target(battle, player, unit, spell)
            ]
        }

        case Action_Type.use_ground_target_spell_card: {
            const card_use_permission = authorize_card_use(action_permission, action.card_id);
            if (!card_use_permission.ok) return;

            const spell_use_permission = authorize_ground_target_spell_use(card_use_permission);
            if (!spell_use_permission.ok) return;

            // TODO validate location

            const { player, card, spell } = spell_use_permission;

            return [
                use_card(player, card),
                perform_spell_cast_ground_target(battle, player, action.at, spell)
            ]
        }

        case Action_Type.use_no_target_spell_card: {
            const card_use_auth = authorize_card_use(action_permission, action.card_id);
            if (!card_use_auth.ok) return;

            const spell_use_auth = authorize_no_target_card_spell_use(card_use_auth);
            if (!spell_use_auth.ok) return;

            const { player, card, spell } = spell_use_auth;

            return [
                use_card(player, card),
                perform_spell_cast_no_target(battle, player, spell)
            ]
        }

        case Action_Type.purchase_item: {
            const act_on_unit_permission = authorize_act_on_unit(battle, action.unit_id);
            if (!act_on_unit_permission.ok) return;

            const act_on_owned_unit_permission = authorize_act_on_owned_unit(action_permission, act_on_unit_permission);
            if (!act_on_owned_unit_permission.ok) return;

            const use_shop_permission = authorize_shop_use(act_on_owned_unit_permission, action.shop_id);
            if (!use_shop_permission.ok) return;

            const purchase_permission = authorize_item_purchase(use_shop_permission, action.item_id);
            if (!purchase_permission.ok) return;

            const { hero, shop, item } = purchase_permission;

            const purchase: Delta = {
                type: Delta_Type.purchase_item,
                unit_id: hero.id,
                shop_id: shop.id,
                item_id: item.id,
                gold_cost: item.gold_cost
            };

            const equip = equip_item(battle, hero, item);

            return [purchase, equip];
        }

        case Action_Type.pick_up_rune: {
            const order_unit_permission = authorize_unit_for_order(action.unit_id);
            if (!order_unit_permission.ok) return;

            const rune_pickup_permission = authorize_rune_pickup_order(order_unit_permission, action.rune_id);
            if (!rune_pickup_permission.ok) return;

            const { hero, rune } = rune_pickup_permission;

            const move_order_permission = authorize_move_order(order_unit_permission, rune.position, true);
            if (!move_order_permission.ok) return;

            return [
                pick_up_rune(battle, hero, rune, move_order_permission.cost)
            ];
        }

        case Action_Type.end_turn: {
            resolve_end_turn_effects(battle);

            battle.end_turn_queued = true;

            return [];
        }

        default: unreachable(action);
    }
}

function spawn_hero(id: Unit_Id, owner: Battle_Player, at_position: XY, type: Hero_Type, health: number) : Delta_Hero_Spawn {
    return {
        type: Delta_Type.hero_spawn,
        at_position: at_position,
        owner_id: owner.id,
        hero_type: type,
        unit_id: id,
        health: health
    };
}

function spawn_creep(id: Unit_Id, owner: Battle_Player, at_position: XY, type: Creep_Type, health: number): Delta_Creep_Spawn {
    return {
        type: Delta_Type.creep_spawn,
        at_position: at_position,
        owner_id: owner.id,
        creep_type: type,
        unit_id: id,
        health: health
    };
}

function spawn_monster(id: Unit_Id, at_position: XY, facing: XY): Delta_Monster_Spawn {
    return {
        type: Delta_Type.monster_spawn,
        at_position: at_position,
        facing: facing,
        unit_id: id
    };
}

function spawn_tree(id: Tree_Id, at_position: XY): Delta_Tree_Spawn {
    return {
        type: Delta_Type.tree_spawn,
        tree_id: id,
        at_position: at_position
    }
}

function draw_hero_card(battle: Battle_Record, player: Battle_Player, hero_type: Hero_Type): Delta_Draw_Hero_Card {
    return {
        type: Delta_Type.draw_hero_card,
        player_id: player.id,
        hero_type: hero_type,
        card_id: get_next_entity_id(battle) as Card_Id
    }
}

function draw_spell_card(card_id: Card_Id, player: Battle_Player, spell_id: Spell_Id): Delta_Draw_Spell_Card {
    return {
        type: Delta_Type.draw_spell_card,
        player_id: player.id,
        spell_id: spell_id,
        card_id: card_id
    }
}

function use_card(player: Battle_Player, card: Card): Delta_Use_Card {
    return {
        type: Delta_Type.use_card,
        player_id: player.id,
        card_id: card.id
    }
}

function get_next_entity_id(battle: Battle_Record) {
    return battle.id_generator();
}

function try_compute_battle_winner(battle: Battle_Record): Battle_Player | undefined {
    if (!battle.has_started) {
        return undefined;
    }

    let last_alive_unit_owner: Battle_Player | undefined = undefined;

    for (const unit of battle.units) {
        if (!unit.dead && unit.supertype != Unit_Supertype.monster) {
            if (last_alive_unit_owner == undefined) {
                last_alive_unit_owner = unit.owner;
            } else if (last_alive_unit_owner != unit.owner) {
                return undefined;
            }
        }
    }

    return last_alive_unit_owner;
}

function get_gold_for_killing(battle: Battle_Record, target: Unit): number {
    switch (target.supertype) {
        case Unit_Supertype.hero: {
            return 4 * target.level;
        }

        case Unit_Supertype.creep: {
            return 4;
        }

        case Unit_Supertype.monster: {
            return battle.random.int_range(4, 6);
        }
    }
}

function defer_monster_try_retaliate(battle: Battle_Record, monster: Monster, target: Unit) {
    type Attack_Intent_Result = { ok: true, ability: Ability_Active } | { ok: false, error: Attack_Intent_Error };

    const enum Attack_Intent_Error {
        ok,
        fail_and_cancel,
        fail_and_continue_trying
    }

    const authorize_attack_intent = (): Attack_Intent_Result => {
        function error(error: Attack_Intent_Error): { ok: false, error: Attack_Intent_Error } {
            return { ok: false, error: error };
        }

        const act_on_unit_permission = authorize_act_on_known_unit(battle, monster);
        if (!act_on_unit_permission.ok) return error(Attack_Intent_Error.fail_and_cancel);

        const order_unit_permission = authorize_order_unit(act_on_unit_permission);
        if (!order_unit_permission.ok) {
            if (order_unit_permission.kind == Order_Unit_Error.unit_has_already_acted_this_turn) {
                return error(Attack_Intent_Error.fail_and_continue_trying);
            }

            return error(Attack_Intent_Error.fail_and_cancel);
        }

        const act_on_target_permission = authorize_act_on_known_unit(battle, target);
        if (!act_on_target_permission.ok) return error(Attack_Intent_Error.fail_and_cancel);

        if (!monster.attack) return error(Attack_Intent_Error.fail_and_cancel);

        const ability_use_permission = authorize_ability_use(order_unit_permission, monster.attack.id);
        if (!ability_use_permission.ok) return error(Attack_Intent_Error.fail_and_continue_trying);

        return ability_use_permission;
    };

    const defer_attack = () => defer_delta(battle, () => {
        const attack_intent = authorize_attack_intent();

        if (!attack_intent.ok) {
            if (attack_intent.error == Attack_Intent_Error.fail_and_cancel) {
                battle.monster_targets.delete(monster);
            }

            return;
        }

        const attack = attack_intent.ability;

        if (attack.type == Ability_Type.target_ground) {
            battle.monster_targets.set(monster, target);

            return perform_ability_cast_ground(battle, monster, attack, target.position);
        }
    });

    const defer_move = () => defer(battle, () => {
        const attack_intent = authorize_attack_intent();

        if (!attack_intent.ok) {
            if (attack_intent.error == Attack_Intent_Error.fail_and_cancel) {
                battle.monster_targets.delete(monster);
            }

            return;
        }

        const costs = populate_path_costs(battle, monster.position);

        for (const cell of battle.grid.cells) {
            const index = grid_cell_index(battle.grid, cell.position);
            const move_cost = costs.cell_index_to_cost[index];

            if (move_cost <= monster.move_points) {
                if (ability_targeting_fits(battle, attack_intent.ability.targeting, cell.position, target.position)) {
                    defer_delta(battle, () => ({
                        type: Delta_Type.unit_move,
                        to_position: cell.position,
                        unit_id: monster.id,
                        move_cost: move_cost
                    }));

                    defer_attack();

                    break;
                }
            }
        }
    });

    defer_move();
}

function on_battle_event(battle_base: Battle, event: Battle_Event) {
    // TODO figure out how to make this properly typed
    const battle: Battle_Record = battle_base as Battle_Record;

    if (event.type == Battle_Event_Type.health_changed) {
        const { source, target, change, dead } = event;

        if (source.type == Source_Type.unit) {
            const attacker = source.unit;

            if (attacker.attack && source.ability_id == attacker.attack.id) {
                on_target_dealt_damage_by_attack(battle, attacker, target, -change.value_delta);
            } else if (change.value_delta < 0) {
                on_target_dealt_damage_by_ability(battle, attacker, target, -change.value_delta);
            }

            if (dead) {
                if (!are_units_allies(attacker, target) && attacker.supertype != Unit_Supertype.monster) {
                    const bounty = get_gold_for_killing(battle, target);

                    defer_delta(battle, () => ({
                        type: Delta_Type.gold_change,
                        player_id: attacker.owner.id,
                        change: bounty
                    }));

                    if (attacker.supertype == Unit_Supertype.hero) {
                        defer_delta(battle, () => {
                            if (attacker.level < max_unit_level) {
                                return {
                                    type: Delta_Type.level_change,
                                    unit_id: attacker.id,
                                    new_level: attacker.level + 1
                                };
                            }
                        });
                    }
                }
            } else {
                if (target.supertype == Unit_Supertype.monster) {
                    defer_monster_try_retaliate(battle, target, attacker);
                }
            }
        }

        if (dead) {
            if (target.supertype != Unit_Supertype.monster) {
                for (const ability of target.abilities) {
                    switch (ability.id) {
                        case Ability_Id.monster_spawn_spiderlings: {
                            defer_delta(battle, () => {
                                const center = target.position;
                                const from_x = Math.max(0, center.x - 2);
                                const from_y = Math.max(0, center.y - 2);
                                const to_x = Math.min(battle.grid.size.x, center.x + 2);
                                const to_y = Math.min(battle.grid.size.y, center.y + 2);
                                const free_cells: XY[] = [];

                                for (let x = from_x; x < to_x; x++) {
                                    for (let y = from_y; y < to_y; y++) {
                                        const cell = grid_cell_at_unchecked(battle.grid, xy(x, y));

                                        if (!cell.occupied) {
                                            free_cells.push(cell.position);
                                        }
                                    }
                                }

                                const target_cell = battle.random.in_array(free_cells);

                                if (target_cell) {
                                    return apply_ability_effect_delta({
                                        ability_id: Ability_Id.monster_spawn_spiderlings,
                                        source_unit_id: target.id,
                                        summons: battle.random.pick_n_mutable(free_cells, ability.how_many).map(cell => ({
                                            owner_id: target.owner.id,
                                            unit_id: get_next_entity_id(battle) as Unit_Id,
                                            creep_type: Creep_Type.spiderling,
                                            at: cell
                                        }))
                                    })
                                }
                            });

                            break;
                        }
                    }
                }
            }
        }
    }
}

function resolve_end_turn_effects(battle: Battle_Record) {
    const item_to_units = new Map<Item_Id, [Hero, Item][]>();
    const modifiers_to_units = new Map<Modifier_Id, [Unit, Applied_Modifier, Modifier][]>();
    const ability_to_units = new Map<Ability_Id, [Unit, Ability][]>();

    for (const unit of battle.units) {
        if (unit.supertype == Unit_Supertype.hero) {
            for (const item of unit.items) {
                let item_units = item_to_units.get(item.id);

                if (!item_units) {
                    item_units = [];

                    item_to_units.set(item.id, item_units);
                }

                item_units.push([unit, item]);
            }
        }

        for (const applied of unit.modifiers) {
            let modifier_units = modifiers_to_units.get(applied.modifier.id);

            if (!modifier_units) {
                modifier_units = [];

                modifiers_to_units.set(applied.modifier.id, modifier_units);
            }

            modifier_units.push([unit, applied, applied.modifier]);
        }

        for (const ability of unit.abilities) {
            let ability_units = ability_to_units.get(ability.id);

            if (!ability_units) {
                ability_units = [];

                ability_to_units.set(ability.id, ability_units);
            }

            ability_units.push([unit, ability]);
        }
    }

    function for_heroes_with_item<T extends Item_Id>(item_id: T, action: (hero: Hero, item: Find_By_Id<Item, T>) => void) {
        const item_units = item_to_units.get(item_id);

        if (item_units) {
            for (const [hero, item] of item_units) {
                action(hero, item as Find_By_Id<Item, T>);
            }
        }
    }

    function for_heroes_with_ability<T extends Ability_Id>(ability_id: T, action: (unit: Unit, ability: Find_By_Id<Ability, T>) => void) {
        const ability_units = ability_to_units.get(ability_id);

        if (ability_units) {
            for (const [unit, ability] of ability_units) {
                action(unit, ability as Find_By_Id<Ability, T>);
            }
        }
    }

    function for_units_with_modifier<T extends Modifier_Id>(modifier_id: T, action: (unit: Unit, applied: Applied_Modifier, modifier: Find_By_Id<Modifier, T>) => void) {
        const modifier_units = modifiers_to_units.get(modifier_id);

        if (modifier_units) {
            for (const [unit, applied, modifier] of modifier_units) {
                action(unit, applied, modifier as Find_By_Id<Modifier, T>);
            }
        }
    }

    for (const unit of battle.units) {
        for (const modifier of unit.modifiers) {
            if (modifier.duration_remaining != undefined && modifier.duration_remaining == 0) {
                defer_delta(battle, () => ({
                    type: Delta_Type.modifier_removed,
                    modifier_handle_id: modifier.handle_id
                }));
            }
        }
    }

    for_units_with_modifier(Modifier_Id.item_heart_of_tarrasque, (unit, applied, modifier) => {
        defer_delta_by_unit(battle, unit, () => ({
            type: Delta_Type.modifier_effect_applied,
            handle_id: applied.handle_id,
            modifier_id: modifier.id,
            change: unit_health_change(unit, modifier.regeneration_per_turn)
        }));
    });

    for_units_with_modifier(Modifier_Id.item_armlet, (unit, applied, modifier) => {
        defer_delta_by_unit(battle, unit, () => ({
            type: Delta_Type.modifier_effect_applied,
            handle_id: applied.handle_id,
            modifier_id: modifier.id,
            change: unit_health_change(unit, -Math.min(modifier.health_loss_per_turn, unit.health - 1))
        }));
    });

    for_units_with_modifier(Modifier_Id.dark_seer_ion_shell, (unit, applied) => {
        defer_delta_by_unit(battle, unit, () => {
            if (applied.source.type != Source_Type.unit) return;

            for (const ability of applied.source.unit.abilities) {
                if (ability.id != Ability_Id.dark_seer_ion_shell) continue;

                const targets = query_units_for_no_target_ability(battle, unit, ability.shield_targeting);

                return apply_ability_effect_delta({
                    ability_id: Ability_Id.dark_seer_ion_shell,
                    source_unit_id: unit.id,
                    targets: targets.map(target => ({
                        target_unit_id: target.id,
                        change: health_change(target, -ability.damage_per_turn)
                    }))
                });
            }
        });
    });

    for_heroes_with_ability(Ability_Id.pocket_tower_attack, (unit, ability) => {
        defer_delta_by_unit(battle, unit, () => {
            if (is_unit_disarmed(unit)) return;

            const target = battle.random.in_array(
                query_units_for_no_target_ability(battle, unit, ability.targeting).filter(target => !are_units_allies(unit, target))
            );

            if (!target) return;

            const damage = calculate_basic_attack_damage_to_target(unit, target);

            return apply_ability_effect_delta({
                ability_id: Ability_Id.pocket_tower_attack,
                source_unit_id: unit.id,
                target_unit_id: target.id,
                damage_dealt: health_change(target, -damage)
            });
        });
    });

    for (const monster of battle.units) {
        if (monster.supertype == Unit_Supertype.monster) {
            const target = battle.monster_targets.get(monster);

            if (target) {
                defer_monster_try_retaliate(battle, monster, target);
            }
        }
    }
}

function finish_battle(battle: Battle_Record, winner: Battle_Player) {
    submit_battle_deltas(battle, [{
        type: Delta_Type.game_over,
        winner_player_id: winner.id
    }]);

    report_battle_over(battle, winner.map_entity);
}

function check_battle_over(battle: Battle_Record) {
    const possible_winner = try_compute_battle_winner(battle);

    if (possible_winner != undefined) {
        finish_battle(battle, possible_winner);
    }
}

export function try_take_turn_action(battle: Battle_Record, player: Battle_Player, action: Turn_Action): Delta[] | undefined {
    if (battle.has_finished) {
        return;
    }

    const action_ok = authorize_action_by_player(battle, player);

    if (!action_ok.ok) return;

    const initial_head = battle.delta_head;
    const new_deltas = turn_action_to_new_deltas(battle, action_ok, action);

    if (new_deltas) {
        submit_battle_deltas(battle, new_deltas);

        return get_battle_deltas_after(battle, initial_head);
    } else {
        return;
    }
}

function get_next_turning_player_id(battle: Battle_Record): Battle_Player_Id {
    const current_index = battle.players.indexOf(battle.turning_player);
    const next_index = current_index + 1;

    if (next_index == battle.players.length) {
        return battle.players[0].id;
    }

    return battle.players[next_index].id;
}

export function submit_battle_deltas(battle: Battle_Record, battle_deltas: Delta[]) {
    battle.deltas.push(...battle_deltas);

    while (battle.deltas.length != battle.delta_head || battle.deferred_actions.length > 0) {
        catch_up_to_head(battle);

        const action = battle.deferred_actions.shift();

        if (action) {
            action();
        }
    }

    if (battle.end_turn_queued) {
        battle.end_turn_queued = false;

        submit_battle_deltas(battle, [{
            type: Delta_Type.end_turn,
            start_turn_of_player_id: get_next_turning_player_id(battle)
        }]);
    }

    if (!battle.has_finished) {
        check_battle_over(battle);
    }
}

export function find_unoccupied_cells_in_deployment_zone_for_player(battle: Battle_Record, player: Battle_Player) {
    return battle.grid.cells.filter(cell => !cell.occupied && is_point_in_deployment_zone(battle, cell.position, player));
}

export function get_battle_deltas_after(battle: Battle, head: number): Delta[] {
    return battle.deltas.slice(head);
}

export function surrender_player_forces(battle: Battle_Record, battle_player: Battle_Player) {
    const player_units = battle.units.filter(unit => unit.supertype != Unit_Supertype.monster && unit.owner == battle_player);

    submit_battle_deltas(battle, player_units.map(unit => {
        const delta: Delta = {
            type: Delta_Type.health_change,
            source_unit_id: unit.id,
            target_unit_id: unit.id,
            new_value: 0,
            value_delta: 0
        };

        return delta;
    }));
}

function battleground_spawns_to_spawn_deltas(next_id: Id_Generator, random: Random, spawns: Battleground_Spawn[]): Delta[] {
    const spawn_deltas: Delta[] = [];

    for (const spawn of spawns) {
        switch (spawn.type) {
            case Spawn_Type.rune: {
                const random_rune = random.in_array(enum_values<Rune_Type>())!;

                spawn_deltas.push({
                    type: Delta_Type.rune_spawn,
                    rune_type: random_rune,
                    rune_id: next_id() as Rune_Id,
                    at: spawn.at
                });

                break;
            }

            case Spawn_Type.shop: {
                const items = random.pick_n(spawn.item_pool, 3);

                spawn_deltas.push({
                    type: Delta_Type.shop_spawn,
                    shop_type: spawn.shop_type,
                    shop_id: next_id() as Shop_Id,
                    item_pool: items,
                    at: spawn.at,
                    facing: spawn.facing
                });

                break;
            }

            case Spawn_Type.monster: {
                spawn_deltas.push(spawn_monster(next_id() as Unit_Id, spawn.at, spawn.facing));

                break;
            }

            case Spawn_Type.tree: {
                spawn_deltas.push(spawn_tree(next_id() as Tree_Id, spawn.at));

                break
            }

            default: unreachable(spawn);
        }
    }

    return spawn_deltas;
}

export function make_battle_record(battle_id: Battle_Id,
                                   id_generator: Id_Generator,
                                   random: Random,
                                   players: Battle_Player[],
                                   grid_size: XY,
                                   world_origin: World_Origin): Battle_Record {
    const battle: Battle_Record = {
        ...make_battle(players, grid_size.x, grid_size.y),
        id: battle_id,
        id_generator: id_generator,
        deferred_actions: [],
        random: random,
        random_seed: random.int_range(0, 65536),
        monster_targets: new Map(),
        end_turn_queued: false,
        world_origin: world_origin,
        receive_event: on_battle_event
    };

    fill_grid(battle);

    return battle;
}

export function start_battle(battle_id: Battle_Id, id_generator: Id_Generator, random: Random, participants: Battle_Participant[], battleground: Battleground): Battle_Record {
    const battle_players: Battle_Player[] = [];
    const battle_player_and_participant_pairs: [Battle_Player, Battle_Participant][] = [];

    for (const participant of participants) {
        const battle_player = make_battle_player({
            id: id_generator() as Battle_Player_Id,
            deployment_zone: participant == participants[0] ? battleground.deployment_zones[0] : battleground.deployment_zones[1],
            map_entity: participant.map_entity
        });

        battle_player_and_participant_pairs.push([battle_player, participant]);
        battle_players.push(battle_player);
    }

    const battle = make_battle_record(battle_id, id_generator, random, battle_players, battleground.grid_size, battleground.world_origin);

    function get_starting_gold(player: Battle_Player): Delta_Gold_Change {
        return {
            type: Delta_Type.gold_change,
            player_id: player.id,
            change: 5
        }
    }

    const spawn_deltas: Delta[] = [];

    spawn_deltas.push(...battleground_spawns_to_spawn_deltas(id_generator, random, battleground.spawns));

    for (const [player, participant] of battle_player_and_participant_pairs) {
        const heroes = participant.heroes;
        const creeps = participant.creeps;

        // TODO this code is unsound
        //      1. Doesn't account for trees or any obstacles (at this point trees haven't spawned yet)
        //      2. Doesn't account for intersection deployment zones or players sharing the same zone
        //      The solution here is deferring each spawn or making separate deltas which figure out
        //      where to spawn by themselves
        const free_cells = find_unoccupied_cells_in_deployment_zone_for_player(battle, player);
        const hero_spawn_points = battle.random.pick_n_mutable(free_cells, heroes.length);
        const creep_spawn_points = battle.random.pick_n_mutable(free_cells, creeps.length);

        for (let index = 0; index < hero_spawn_points.length; index++) {
            const hero = heroes[index];
            spawn_deltas.push(spawn_hero(hero.id, player, hero_spawn_points[index].position, hero.type, hero.health));
        }

        for (let index = 0; index < creep_spawn_points.length; index++) {
            const creep = creeps[index];
            spawn_deltas.push(spawn_creep(creep.id, player, creep_spawn_points[index].position, creep.type, creep.health));
        }

        spawn_deltas.push(get_starting_gold(player));
        spawn_deltas.push(...participant.spells.map(spell => draw_spell_card(spell.id, player, spell.spell)));
    }

    spawn_deltas.push({ type: Delta_Type.game_start });

    submit_battle_deltas(battle, spawn_deltas);

    return battle;
}

export function cheat(battle: Battle_Record, battle_player: Battle_Player, cheat: string, selected_unit_id: Unit_Id) {
    const parts = cheat.split(" ");

    function refresh_unit(battle: Battle_Record, unit: Unit) {
        const deltas: Delta[] = [
            {
                type: Delta_Type.health_change,
                source_unit_id: unit.id,
                target_unit_id: unit.id,
                new_value: get_max_health(unit),
                value_delta: get_max_health(unit) - unit.health
            }
        ];

        for (const ability of unit.abilities) {
            if (ability.type != Ability_Type.passive && ability.charges_remaining != ability.charges) {
                deltas.push({
                    type: Delta_Type.set_ability_charges_remaining,
                    unit_id: unit.id,
                    ability_id: ability.id,
                    charges_remaining: (ability as Ability_Active).charges
                });
            }
        }

        submit_battle_deltas(battle, deltas);
    }

    function parse_enum_query<T extends number>(query: string | undefined, enum_data: [string, T][]): T[] {
        if (!query) {
            return enum_data.map(([, value]) => value);
        } else {
            if (/\d+/.test(query)) {
                return [ parseInt(query) as T ];
            } else {
                return enum_data
                    .filter(([name]) => name.toLowerCase().includes(query.toLowerCase()))
                    .map(([, id]) => id);
            }
        }
    }

    switch (parts[0]) {
        case "charges": {
            const unit = find_unit_by_id(battle, selected_unit_id);

            if (!unit) break;

            const ability_index = parseInt(parts[1]);
            const charges = parseInt(parts[2] || "20");

            submit_battle_deltas(battle, [{
                type: Delta_Type.set_ability_charges_remaining,
                unit_id: unit.id,
                ability_id: unit.abilities[ability_index].id,
                charges_remaining: charges
            }]);

            break;
        }

        case "gold": {
            submit_battle_deltas(battle, [ { type: Delta_Type.gold_change, player_id: battle_player.id, change: 15 }]);

            break;
        }

        case "skipturn": {
            battle.end_turn_queued = true;
            submit_battle_deltas(battle, []);

            break;
        }

        case "lvl": {
            const unit = find_unit_by_id(battle, selected_unit_id);

            if (!unit) break;

            const new_lvl = parseInt(parts[1]);

            submit_battle_deltas(battle, [{
                type: Delta_Type.level_change,
                unit_id: selected_unit_id,
                new_level: new_lvl,
            }]);

            break;
        }

        case "ref": {
            const unit = find_unit_by_id(battle, selected_unit_id);

            if (!unit) break;

            refresh_unit(battle, unit);

            break;
        }

        case "refall": {
            for (const unit of battle.units) {
                if (!unit.dead) {
                    refresh_unit(battle, unit);
                }
            }

            break;
        }

        case "kill": {
            const unit = find_unit_by_id(battle, selected_unit_id);

            if (!unit) break;

            submit_battle_deltas(battle, [{
                type: Delta_Type.health_change,
                source_unit_id: unit.id,
                target_unit_id: unit.id,
                new_value: 0,
                value_delta: -unit.health
            }]);

            break;
        }

        case "killall": {
            for (const unit of battle.units) {
                if (!unit.dead) {
                    const delta: Delta_Health_Change = {
                        type: Delta_Type.health_change,
                        source_unit_id: unit.id,
                        target_unit_id: unit.id,
                        new_value: 0,
                        value_delta: -unit.health
                    };

                    submit_battle_deltas(battle, [ delta ]);
                }
            }

            break;
        }

        case "rune": {
            function rune_type(): Rune_Type {
                switch (parts[1]) {
                    case "h": return Rune_Type.haste;
                    case "r": return Rune_Type.regeneration;
                    case "d": return Rune_Type.double_damage;
                    case "b": return Rune_Type.bounty;
                    default: return battle.random.in_array(enum_values<Rune_Type>())!
                }
            }

            const at = xy(4, 4);

            if (grid_cell_at_unchecked(battle.grid, at).occupied) {
                break;
            }

            const delta: Delta_Rune_Spawn = {
                type: Delta_Type.rune_spawn,
                rune_id: get_next_entity_id(battle) as Rune_Id,
                rune_type: rune_type(),
                at: at
            };

            submit_battle_deltas(battle, [ delta ]);

            break;
        }

        case "spl": {
            const spells = parse_enum_query(parts[1], enum_names_to_values<Spell_Id>());

            submit_battle_deltas(battle, spells.map(spell => draw_spell_card(get_next_entity_id(battle) as Card_Id, battle_player, spell)));

            break;
        }

        case "hero": {
            const heroes = parse_enum_query(parts[1], enum_names_to_values<Hero_Type>());

            submit_battle_deltas(battle, heroes.map(type => draw_hero_card(battle, battle_player, type)));

            break;
        }

        case "creep": {
            const creeps = parse_enum_query(parts[1], enum_names_to_values<Creep_Type>());
            const free_cells = find_unoccupied_cells_in_deployment_zone_for_player(battle, battle_player);
            const deltas: Delta[] = [];

            for (const creep of creeps) {
                const random_cell = battle.random.pick_n_mutable(free_cells, 1);

                if (random_cell) {
                    deltas.push(spawn_creep(get_next_entity_id(battle) as Unit_Id, battle_player, random_cell[0].position, creep, creep_definition_by_type(creep).health));
                }
            }

            submit_battle_deltas(battle, deltas);

            break;
        }

        case "item": {
            const unit = find_unit_by_id(battle, selected_unit_id);

            if (!unit) break;
            if (unit.supertype != Unit_Supertype.hero) break;

            const items = parse_enum_query(parts[1], enum_names_to_values<Item_Id>());

            submit_battle_deltas(battle, items.map(item_id_to_item).map(item => equip_item(battle, unit, item)));

            break;
        }

        case "gg": {
            surrender_player_forces(battle, battle_player);

            break;
        }
    }
}