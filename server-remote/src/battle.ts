import {XY, Id_Generator, unreachable} from "./common";
import {Random} from "./random";

export type Battle_Record = Battle & {
    id: Battle_Id
    id_generator: Id_Generator
    random: Random
    random_seed: number
    monster_targets: Map<Monster, Unit>
    battleground: Battleground
}

export type Battle_Participant = {
    heroes: Hero_Spawn[]
    creeps: Creep_Spawn[]
    spells: Spell_Spawn[]
    map_entity: Battle_Participant_Map_Entity
}

export type Adventure_Item_Modifier = {
    item: Adventure_Item_Id
    modifier: Modifier
}

export type Adventure_Spawn_Effect = {
    item: Adventure_Item_Id
    effect: Adventure_Item_Combat_Start_Effect
}

type Hero_Spawn = {
    id: Unit_Id
    type: Hero_Type
    health: number
    modifiers: Adventure_Item_Modifier[]
    start_effects: Adventure_Spawn_Effect[]
}

type Creep_Spawn = {
    id: Unit_Id
    type: Creep_Type
    health: number
}

type Spell_Spawn = {
    id: Card_Id
    spell: Spell_Id
}

function query_units_with_selector(battle: Battle, from: XY, target: XY, selector: Ability_Area_Selector): Unit[] {
    const units: Unit[] = [];

    for (const unit of battle.units) {
        if (!authorize_act_on_known_unit(battle, unit).ok) continue;

        if (area_selector_fits(battle, selector, from, target, unit.position)) {
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
        ...health_change(target, change),
        target_unit_id: target.id
    }
}

function health_change(target: Unit, change: number): Health_Change {
    return {
        new_value: Math.max(0, Math.min(get_max_health(target), target.health + change)),
        value_delta: change
    }
}

function creep_spawn_effect(battle: Battle_Record, type: Creep_Type, additional_intrinsic_modifiers?: Modifier[]): Creep_Spawn_Effect {
    const built_in_modifiers = creep_definition_by_type(type).intrinsic_modifiers;
    const modifiers: Modifier[] = [
        ...(built_in_modifiers || []),
        ...(additional_intrinsic_modifiers || []),
    ];

    return {
        unit_id: get_next_entity_id(battle) as Unit_Id,
        creep_type: type,
        intrinsic_modifiers: modifiers.map(data => modifier(battle, data))
    }
}

function modifier(battle: Battle_Record, modifier: Modifier, duration?: number): Modifier_Application {
    return {
        modifier: modifier,
        modifier_handle_id: get_next_entity_id(battle) as Modifier_Handle_Id,
        duration: duration
    }
}

function timed_effect(battle: Battle_Record, content: Timed_Effect, duration: number): Timed_Effect_Application {
    const handle_id = get_next_entity_id(battle) as Effect_Handle_Id;

    return {
        effect_handle_id: handle_id,
        duration: duration,
        effect: content
    };
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
                    ...health_change(target, spell.heal)
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
                    spawn: creep_spawn_effect(battle, Creep_Type.lane_creep)
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

function submit_spell_cast_ground_target(battle: Battle_Record, player: Battle_Player, at: XY, spell: Card_Spell_Ground_Target): void {
    const base: Delta_Use_Ground_Target_Spell_Base = {
        type: Delta_Type.use_ground_target_spell,
        player_id: player.id,
        at: at
    };

    switch (spell.spell_id) {
        case Spell_Id.pocket_tower: {
            submit_battle_delta(battle, {
                ...base,
                spell_id: spell.spell_id,
                spawn: creep_spawn_effect(battle, Creep_Type.pocket_tower)
            });

            break;
        }
    }
}

function calculate_basic_attack(attack: number, target: Unit): { new_health: number, health_delta: number, blocked_by_armor: number } {
    const armor = get_armor(target);
    const damage = Math.max(0, attack - armor);
    const blocked = Math.min(attack, armor);
    const new_health = Math.max(0, Math.min(get_max_health(target), target.health - damage));

    return {
        blocked_by_armor: blocked,
        new_health: new_health,
        health_delta: -damage
    }
}

function basic_attack_health_change(source: Unit, target: Unit): Basic_Attack_Health_Change {
    const stats = calculate_basic_attack(get_attack_damage(source), target);

    return {
        blocked_by_armor: stats.blocked_by_armor,
        new_value: stats.new_health,
        value_delta: stats.health_delta
    }
}

function basic_attack_unit_health_change(source: Unit, target: Unit): Basic_Attack_Unit_Health_Change {
    return {
        target_unit_id: target.id,
        ...basic_attack_health_change(source, target)
    }
}

function submit_ability_cast_ground(battle: Battle_Record, unit: Unit, ability: Ability_Ground_Target, target: XY): void {
    const base: Delta_Ground_Target_Ability_Base = {
        type: Delta_Type.use_ground_target_ability,
        unit_id: unit.id,
        target_position: target,
    };

    switch (ability.id) {
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

            submit_battle_delta(battle, {
                ...base,
                ability_id: ability.id,
                targets: targets.map(target => unit_health_change(target.unit, -target.damage_applied)),
                damage_remaining: remaining_damage
            });

            break;
        }

        case Ability_Id.dragon_knight_breathe_fire: {
            const targets = query_units_for_point_target_ability(battle, unit, target, ability.targeting)
                .map(target => unit_health_change(target, -ability.damage));

            submit_battle_delta(battle, {
                ...base,
                ability_id: ability.id,
                targets: targets
            });

            break;
        }

        case Ability_Id.dragon_knight_elder_dragon_form_attack: {
            const targets = query_units_for_point_target_ability(battle, unit, target, ability.targeting)
                .map(target => basic_attack_unit_health_change(unit, target));

            submit_battle_delta(battle, {
                ...base,
                ability_id: ability.id,
                targets: targets
            });

            break;
        }

        case Ability_Id.lion_impale: {
            const targets = query_units_for_point_target_ability(battle, unit, target, ability.targeting).map(target => ({
                ...unit_health_change(target, -ability.damage),
                modifier: modifier(battle, { id: Modifier_Id.stunned }, 1)
            }));

            submit_battle_delta(battle, {
                ...base,
                ability_id: ability.id,
                targets: targets
            });

            break;
        }

        case Ability_Id.mirana_leap: {
            submit_battle_delta(battle, {
                ...base,
                ability_id: ability.id
            });

            break;
        }

        case Ability_Id.venge_wave_of_terror: {
            const targets = query_units_for_point_target_ability(battle, unit, target, ability.targeting).map(target => ({
                ...unit_health_change(target, -ability.damage),
                modifier: modifier(battle, {
                    id: Modifier_Id.venge_wave_of_terror,
                    armor_reduction: ability.armor_reduction
                }, ability.duration)
            }));

            submit_battle_delta(battle, {
                ...base,
                ability_id: ability.id,
                targets: targets
            });

            break;
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
                .filter(cell => !is_grid_cell_occupied(cell) && area_selector_fits(battle, selector, unit.position, target, cell.position))
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

            submit_battle_delta(battle, {
                ...base,
                ability_id: ability.id,
                targets: vacuum_targets
            });

            break;
        }

        case Ability_Id.ember_fire_remnant: {
            const remnant = creep_spawn_effect(battle, Creep_Type.ember_fire_remnant, [{
                id: Modifier_Id.ember_fire_remnant,
                remnant_owner_unit_id: unit.id
            }]);

            submit_battle_delta(battle, {
                ...base,
                ability_id: ability.id,
                modifier: modifier(battle, {
                    id: Modifier_Id.ember_fire_remnant_caster,
                    remnant_unit_id: remnant.unit_id
                }),
                remnant: remnant
            });

            break;
        }

        case Ability_Id.shaker_fissure: {
            const targets = query_units_for_point_target_ability(battle, unit, target, ability.targeting);
            const normal = xy(Math.sign(target.x - unit.position.x), Math.sign(target.y - unit.position.y)); // We only support line targeting
            const left = xy(-normal.y, normal.x);

            const start = xy(unit.position.x + normal.x, unit.position.y + normal.y);
            const finish = xy(start.x, start.y);

            const moves: Delta_Ability_Shaker_Fissure["moves"] = [];
            const modifiers: Unit_Modifier_Application[] = [];

            // Move forward checking units at every step
            //  1. If path is blocked (not by unit), stop advancing
            //  2. If a unit is on the way
            //      a. Stun them
            //      b. Try move unit to the left
            //      c. If unsuccessful, try move to the right
            //      d. If unsuccessful, stop advancing
            //  3. Otherwise, keep advancing
            let step = 0;

            while (step < ability.targeting.line_length) {
                const position = xy(start.x + normal.x * step, start.y + normal.y * step);
                const target_at = targets.find(target => xy_equal(target.position, position));

                if (!target_at) {
                    if (is_grid_occupied_at(battle.grid, position)) {
                        break;
                    } else {
                        step++;
                        continue;
                    }
                }

                let move_to: XY | undefined = undefined;

                const to_the_left = xy(position.x + left.x, position.y + left.y);

                if (!is_grid_occupied_at(battle.grid, to_the_left)) {
                    move_to = to_the_left;
                } else {
                    const to_the_right = xy(position.x - left.x, position.y - left.y);

                    if (!is_grid_occupied_at(battle.grid, to_the_right)) {
                        move_to = to_the_right;
                    }
                }

                modifiers.push({
                    target_unit_id: target_at.id,
                    modifier: modifier(battle, { id: Modifier_Id.stunned }, 1)
                });

                if (!move_to) {
                    break;
                }

                moves.push({
                    target_unit_id: target_at.id,
                    move_to: move_to
                });

                finish.x = position.x;
                finish.y = position.y;

                step++;
            }

            submit_battle_delta(battle, {
                ...base,
                ability_id: ability.id,
                modifiers: modifiers,
                moves: moves,
                block: timed_effect(battle, {
                    type: Timed_Effect_Type.shaker_fissure_block,
                    from: start,
                    normal: normal,
                    steps: step
                }, 1)
            });

            break;
        }

        case Ability_Id.venomancer_plague_wards: {
            submit_battle_delta(battle, {
                ...base,
                ability_id: ability.id,
                summon: creep_spawn_effect(battle, Creep_Type.veno_plague_ward)
            });

            break;
        }

        case Ability_Id.venomancer_venomous_gale: {
            const targets = query_units_for_point_target_ability(battle, unit, target, ability.targeting);

            submit_battle_delta(battle, {
                ...base,
                ability_id: ability.id,
                targets: targets.map(target => ({
                    target_unit_id: target.id,
                    modifier: modifier(battle, {
                        id: Modifier_Id.veno_venomous_gale,
                        poison_applied: ability.poison_applied,
                        move_reduction: ability.slow
                    }, 1)
                }))
            });

            break;
        }

        default: unreachable(ability);
    }
}

function submit_ability_cast_no_target(battle: Battle_Record, unit: Unit, ability: Ability_No_Target): void {
    const base: Delta_Use_No_Target_Ability_Base = {
        type: Delta_Type.use_no_target_ability,
        unit_id: unit.id,
    };

    switch (ability.id) {
        case Ability_Id.pudge_rot: {
            const targets = query_units_for_no_target_ability(battle, unit, ability.targeting)
                .map(target => unit_health_change(target, -ability.damage));

            submit_battle_delta(battle, {
                ...base,
                ability_id: ability.id,
                targets: targets
            });

            break;
        }

        case Ability_Id.tide_anchor_smash: {
            const targets = query_units_for_no_target_ability(battle, unit, ability.targeting).map(target => ({
                ...unit_health_change(target, -ability.damage),
                modifier: modifier(battle, {
                    id: Modifier_Id.attack_damage,
                    bonus: -ability.attack_reduction
                }, 1)
            }));

            submit_battle_delta(battle, {
                ...base,
                ability_id: ability.id,
                targets: targets
            });

            break;
        }

        case Ability_Id.tide_ravage: {
            const targets = query_units_for_no_target_ability(battle, unit, ability.targeting).map(target => ({
                ...unit_health_change(target, -ability.damage),
                modifier: modifier(battle, { id: Modifier_Id.stunned }, 1)
            }));

            submit_battle_delta(battle, {
                ...base,
                ability_id: ability.id,
                targets: targets
            });

            break;
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

            submit_battle_delta(battle, {
                ...base,
                ability_id: ability.id,
                missed_beams: remaining_beams,
                targets: effects
            });

            break;
        }

        case Ability_Id.skywrath_concussive_shot: {
            const targets = query_units_for_no_target_ability(battle, unit, ability.targeting);
            const enemies = targets.filter(target => !are_units_allies(unit, target));
            const allies = targets.filter(target => are_units_allies(unit, target));
            const target = enemies.length > 0 ? battle.random.in_array(enemies) : battle.random.in_array(allies);

            if (target) {
                submit_battle_delta(battle, {
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
                });
            } else {
                submit_battle_delta(battle, {
                    ...base,
                    ability_id: ability.id,
                    result: {
                        hit: false
                    }
                });
            }

            break;
        }

        case Ability_Id.dragon_knight_elder_dragon_form: {
            submit_battle_delta(battle, {
                ...base,
                ability_id: ability.id,
                modifier: modifier(battle, { id: Modifier_Id.dragon_knight_elder_dragon_form }),
            });

            break;
        }

        case Ability_Id.mirana_starfall: {
            {
                const targets = query_units_for_no_target_ability(battle, unit, ability.targeting);

                submit_battle_delta(battle, {
                    ...base,
                    ability_id: ability.id,
                    targets: targets.map(target => unit_health_change(target, -ability.damage))
                });
            }

            {
                const targets = query_units_for_no_target_ability(battle, unit, ability.targeting);
                const enemies = targets.filter(target => !are_units_allies(unit, target));
                const allies = targets.filter(target => are_units_allies(unit, target));
                const extra_target = enemies.length > 0 ? battle.random.in_array(enemies) : battle.random.in_array(allies);

                if (extra_target) {
                    submit_battle_delta(battle, apply_ability_effect_delta({
                        ability_id: ability.id,
                        source_unit_id: unit.id,
                        target_unit_id: extra_target.id,
                        damage_dealt: health_change(extra_target, -ability.damage)
                    }));
                }
            }

            break;
        }

        case Ability_Id.ember_searing_chains: {
            const all_targets = query_units_for_no_target_ability(battle, unit, ability.targeting);
            const enemies = battle.random.pick_n_mutable(all_targets.filter(target => !are_units_allies(unit, target)), ability.targets);
            const allies = battle.random.pick_n_mutable(all_targets.filter(target => are_units_allies(unit, target)), ability.targets);
            const targets = [...enemies, ...allies].slice(0, ability.targets);

            submit_battle_delta(battle, {
                ...base,
                ability_id: ability.id,
                targets: targets.map(target => ({
                    target_unit_id: target.id,
                    modifier: modifier(battle, { id: Modifier_Id.ember_searing_chains }, 1)
                }))
            });

            break;
        }

        case Ability_Id.ember_sleight_of_fist: {
            const targets = query_units_for_no_target_ability(battle, unit, ability.targeting);

            submit_battle_delta(battle, {
                ...base,
                ability_id: ability.id,
                targets: targets.map(target => basic_attack_unit_health_change(unit, target))
            });

            break;
        }

        case Ability_Id.ember_activate_fire_remnant: {
            for (const applied of unit.modifiers) {
                if (applied.modifier.id == Modifier_Id.ember_fire_remnant_caster) {
                    const remnant = find_unit_by_id(battle, applied.modifier.remnant_unit_id);
                    if (!remnant) break;

                    submit_battle_delta(battle, {
                        type: Delta_Type.set_ability_charges,
                        unit_id: unit.id,
                        ability_id: Ability_Id.ember_activate_fire_remnant,
                        charges: 1,
                        only_set_remaining: true,
                        source: { type: Source_Type.none }
                    });

                    submit_battle_delta(battle, {
                        type: Delta_Type.modifier_removed,
                        modifier_handle_id: applied.handle_id
                    });

                    submit_battle_delta(battle, {
                        ...base,
                        ability_id: ability.id,
                        action: {
                            remnant_id: remnant.id,
                            move_to: remnant.position
                        }
                    });

                    break;
                }
            }

            break;
        }

        case Ability_Id.shaker_enchant_totem: {
            const targets = query_units_for_no_target_ability(battle, unit, ability.targeting);

            submit_battle_delta(battle, {
                ...base,
                ability_id: ability.id,
                modifier: modifier(battle, { id: Modifier_Id.shaker_enchant_totem_caster }),
                targets: targets.map(target => ({
                    target_unit_id: target.id,
                    modifier: modifier(battle, { id: Modifier_Id.stunned }, 1)
                }))
            });

            break;
        }

        case Ability_Id.shaker_echo_slam: {
            const targets = query_units_for_no_target_ability(battle, unit, ability.targeting);
            const damage = targets.length + 1;

            submit_battle_delta(battle, {
                ...base,
                ability_id: ability.id,
                targets: targets.map(target => unit_health_change(target, -damage))
            });

            break;
        }

        case Ability_Id.venomancer_poison_nova: {
            const targets = query_units_for_no_target_ability(battle, unit, ability.targeting);

            submit_battle_delta(battle, {
                ...base,
                ability_id: ability.id,
                targets: targets.map(target => ({
                    target_unit_id: target.id,
                    modifier: modifier(battle, { id: Modifier_Id.veno_poison_nova }, 1)
                }))
            });

            break;
        }

        default: unreachable(ability);
    }
}

function perform_ability_cast_unit_target(battle: Battle_Record, unit: Unit, ability: Ability_Unit_Target, target: Unit): Delta_Unit_Target_Ability {
    const base: Delta_Unit_Target_Ability_Base = {
        type: Delta_Type.use_unit_target_ability,
        unit_id: unit.id,
        target_unit_id: target.id,
    };

    switch (ability.id) {
        case Ability_Id.basic_attack: {
            return {
                ...base,
                ability_id: ability.id,
                target: basic_attack_health_change(unit, target)
            };
        }

        case Ability_Id.pudge_hook: {
            const direction = direction_normal_between_points(unit.position, target.position);

            return {
                ...base,
                ability_id: ability.id,
                damage_dealt: health_change(target, -ability.damage),
                move_target_to: xy(unit.position.x + direction.x, unit.position.y + direction.y)
            };
        }

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
                modifier: modifier(battle, { id: Modifier_Id.stunned }, 1),
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

        case Ability_Id.mirana_arrow: {
            return {
                ...base,
                ability_id: ability.id,
                stun: modifier(battle, { id: Modifier_Id.stunned }, 1)
            };
        }

        case Ability_Id.venge_magic_missile: {
            return {
                ...base,
                ability_id: ability.id,
                modifier: modifier(battle, { id: Modifier_Id.stunned }, 1),
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

function submit_item_equip(battle: Battle_Record, hero: Hero, item_id: Item_Id): void {
    function apply_item_modifier(modifier_data: Modifier): Delta {
        return {
            type: Delta_Type.modifier_applied,
            unit_id: hero.id,
            source: {
                type: Source_Type.item,
                item: item_id
            },
            application: modifier(battle, modifier_data)
        };
    }

    switch (item_id) {
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

            submit_battle_delta(battle, {
                type: Delta_Type.equip_item,
                unit_id: hero.id,
                item_id: item_id,
                charge_changes: changes
            });

            break;
        }

        case Item_Id.enchanted_mango: {
            for (const ability of hero.abilities) {
                if (ability.type != Ability_Type.passive && ability.available_since_level == 1) {
                    submit_battle_delta(battle, {
                        type: Delta_Type.equip_item,
                        unit_id: hero.id,
                        item_id: item_id,
                        change: {
                            ability_id: ability.id,
                            charges_remaining: ability.charges_remaining + 1
                        }
                    });
                }
            }

            break;
        }

        case Item_Id.tome_of_knowledge: {
            submit_battle_delta(battle, {
                type: Delta_Type.equip_item,
                unit_id: hero.id,
                item_id: item_id,
                new_level: Math.min(hero.level + 1, Const.max_unit_level)
            });

            break;
        }

        case Item_Id.boots_of_travel: {
            submit_battle_delta(battle, apply_item_modifier({
                id: Modifier_Id.move_speed,
                bonus: 3
            }));

            break;
        }

        case Item_Id.boots_of_speed: {
            submit_battle_delta(battle, apply_item_modifier({
                id: Modifier_Id.move_speed,
                bonus: 1
            }));

            break;
        }

        case Item_Id.blades_of_attack: {
            submit_battle_delta(battle, apply_item_modifier({
                id: Modifier_Id.attack_damage,
                bonus: 2
            }));

            break;
        }

        case Item_Id.divine_rapier: {
            submit_battle_delta(battle, apply_item_modifier({
                id: Modifier_Id.attack_damage,
                bonus: 8
            }));

            break;
        }

        case Item_Id.assault_cuirass: {
            submit_battle_delta(battle, apply_item_modifier({
                id: Modifier_Id.armor,
                bonus: 4
            }));

            break;
        }

        case Item_Id.heart_of_tarrasque: {
            submit_battle_delta(battle, apply_item_modifier({
                id: Modifier_Id.item_heart_of_tarrasque,
                health: 10,
                regeneration_per_turn: 1
            }));

            break;
        }

        case Item_Id.satanic: {
            submit_battle_delta(battle, apply_item_modifier({ id: Modifier_Id.item_satanic }));

            break;
        }

        case Item_Id.mask_of_madness: {
            submit_battle_delta(battle, apply_item_modifier({
                id: Modifier_Id.item_mask_of_madness,
                attack: 4
            }));

            break;
        }

        case Item_Id.armlet: {
            submit_battle_delta(battle, apply_item_modifier({
                id: Modifier_Id.item_armlet,
                health: 10,
                health_loss_per_turn: 1
            }));

            break;
        }

        case Item_Id.belt_of_strength: {
            submit_battle_delta(battle, apply_item_modifier({
                id: Modifier_Id.health,
                bonus: 4
            }));

            break;
        }

        case Item_Id.morbid_mask: {
            submit_battle_delta(battle, apply_item_modifier({
                id: Modifier_Id.item_morbid_mask,
                health_restored_per_attack: 1
            }));

            break;
        }

        case Item_Id.octarine_core: {
            submit_battle_delta(battle, apply_item_modifier({ id: Modifier_Id.item_octarine_core }));

            break;
        }

        case Item_Id.chainmail: {
            submit_battle_delta(battle, apply_item_modifier({
                id: Modifier_Id.armor,
                bonus: 1
            }));

            break;
        }

        case Item_Id.basher: {
            submit_battle_delta(battle, apply_item_modifier({ id: Modifier_Id.item_basher }));

            break;
        }

        case Item_Id.iron_branch: {
            submit_battle_delta(battle, apply_item_modifier({
                id: Modifier_Id.item_iron_branch,
                moves_bonus: 1,
                attack_bonus: 1,
                health_bonus: 1,
                armor_bonus: 1
            }));

            break;
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
        for (const applied of source.modifiers) {
            if (applied.modifier.id == Modifier_Id.item_octarine_core) {
                submit_battle_delta(battle, {
                    type: Delta_Type.modifier_effect_applied,
                    modifier_id: applied.modifier.id,
                    handle_id: applied.handle_id,
                    heal: unit_health_change(source, damage)
                });
            }
        }
    }
}

function on_target_dealt_damage_by_attack(battle: Battle_Record, source: Unit, target: Unit, damage: number): void {
    const damage_only = Math.max(0, damage); // In case we have a healing attack, I guess;

    if (source.supertype == Unit_Supertype.hero) {
        for (const applied of source.modifiers) {
            if (applied.modifier.id == Modifier_Id.item_satanic) {
                submit_battle_delta(battle, {
                    type: Delta_Type.modifier_effect_applied,
                    modifier_id: applied.modifier.id,
                    handle_id: applied.handle_id,
                    heal: unit_health_change(source, damage_only)
                });
            }
        }

        for (const applied of source.modifiers) {
            if (applied.modifier.id == Modifier_Id.item_morbid_mask) {
                submit_battle_delta(battle, {
                    type: Delta_Type.modifier_effect_applied,
                    modifier_id: applied.modifier.id,
                    handle_id: applied.handle_id,
                    heal: unit_health_change(source, applied.modifier.health_restored_per_attack)
                });
            }
        }

        for (const applied of source.modifiers) {
            if (applied.modifier.id == Modifier_Id.item_basher) {
                submit_battle_delta(battle, {
                    type: Delta_Type.modifier_effect_applied,
                    modifier_id: applied.modifier.id,
                    handle_id: applied.handle_id,
                    target_unit_id: target.id,
                    modifier: modifier(battle, { id: Modifier_Id.stunned }, 1)
                });
            }
        }

        for (const applied of source.modifiers) {
            if (applied.modifier.id == Modifier_Id.shaker_enchant_totem_caster) {
                submit_battle_delta(battle, {
                    type: Delta_Type.modifier_removed,
                    modifier_handle_id: applied.handle_id
                });
            }
        }
    }

    for (const ability of source.abilities) {
        if (source.supertype == Unit_Supertype.hero) {
            if (source.level < ability.available_since_level) continue;
        }

        switch (ability.id) {
            case Ability_Id.luna_moon_glaive: {
                const targets = query_units_for_no_target_ability(battle, target, ability.secondary_targeting);
                const allies = targets.filter(target => are_units_allies(source, target) && target != source);
                const enemies = targets.filter(target => !are_units_allies(source, target));
                const glaive_target = enemies.length > 0 ? battle.random.in_array(enemies) : battle.random.in_array(allies);

                if (glaive_target) {
                    submit_battle_delta(battle, apply_ability_effect_delta({
                        ability_id: ability.id,
                        source_unit_id: source.id,
                        target_unit_id: glaive_target.id,
                        original_target_id: target.id,
                        damage_dealt: health_change(glaive_target, -damage)
                    }));
                }

                break;
            }

            case Ability_Id.monster_lifesteal: {
                submit_battle_delta(battle, apply_ability_effect_delta({
                    ability_id: Ability_Id.monster_lifesteal,
                    source_unit_id: source.id,
                    target_unit_id: source.id,
                    heal: health_change(source, damage_only)
                }));
            }
        }
    }
}

function submit_turn_action(battle: Battle_Record, action_permission: Player_Action_Permission, action: Turn_Action): void {
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
            type: Delta_Type.set_ability_charges,
            unit_id: unit.id,
            ability_id: ability.id,
            charges: ability.charges_remaining - 1,
            only_set_remaining: true,
            source: { type: Source_Type.none }
        }
    }

    switch (action.type) {
        case Action_Type.move: {
            const order_unit_permission = authorize_unit_for_order(action.unit_id);
            if (!order_unit_permission.ok) return;

            const flags = unit_pathing_flags(order_unit_permission.unit, false);
            const move_order_permission = authorize_move_order(order_unit_permission, action.to, flags);
            if (!move_order_permission.ok) return;

            submit_battle_delta(battle, {
                type: Delta_Type.unit_move,
                move_cost: move_order_permission.cost,
                unit_id: move_order_permission.unit.id,
                to_position: action.to
            });

            break;
        }

        case Action_Type.use_no_target_ability: {
            const ability_use_permission = authorize_unit_for_ability(action.unit_id, action.ability_id);
            if (!ability_use_permission) return;

            const { unit, ability } = ability_use_permission;

            if (ability.type != Ability_Type.no_target) return;

            submit_battle_delta(battle, decrement_charges(unit, ability));
            submit_ability_cast_no_target(battle, unit, ability);

            break;
        }

        case Action_Type.unit_target_ability: {
            const ability_use_permission = authorize_unit_for_ability(action.unit_id, action.ability_id);
            if (!ability_use_permission) return;

            const act_on_target_permission = authorize_act_on_unit(battle, action.target_id);
            if (!act_on_target_permission.ok) return;

            const use_ability_on_target_permission = authorize_unit_target_ability_use(ability_use_permission, act_on_target_permission);
            if (!use_ability_on_target_permission.ok) return;

            const { unit, ability, target } = use_ability_on_target_permission;

            submit_battle_delta(battle, decrement_charges(unit, ability));
            submit_battle_delta(battle, perform_ability_cast_unit_target(battle, unit, ability, target));

            break;
        }

        case Action_Type.ground_target_ability: {
            const ability_use_permission = authorize_unit_for_ability(action.unit_id, action.ability_id);
            if (!ability_use_permission) return;

            const ground_ability_use_permission = authorize_ground_target_ability_use(ability_use_permission, action.to);
            if (!ground_ability_use_permission.ok) return;

            const { unit, ability, target } = ground_ability_use_permission;

            submit_battle_delta(battle, decrement_charges(unit, ability));
            submit_ability_cast_ground(battle, unit, ability, target.position);

            break;
        }

        case Action_Type.use_hero_card: {
            const card_use_permission = authorize_card_use(action_permission, action.card_id);
            if (!card_use_permission.ok) return;

            const hero_card_use_permission = authorize_hero_card_use(card_use_permission, action.at);
            if (!hero_card_use_permission.ok) return;

            const { player, card } = hero_card_use_permission;

            submit_battle_delta(battle, use_card(player, card));
            submit_battle_delta(battle, spawn_hero(get_next_entity_id(battle) as Unit_Id, player, action.at, card.hero_type));

            break;
        }

        case Action_Type.use_existing_hero_card: {
            const card_use_permission = authorize_card_use(action_permission, action.card_id);
            if (!card_use_permission.ok) return;

            const hero_card_use_permission = authorize_existing_hero_card_use(card_use_permission, action.at);
            if (!hero_card_use_permission.ok) return;

            const { player, card } = hero_card_use_permission;

            submit_battle_delta(battle, use_card(player, card));
            submit_battle_delta(battle, {
                type: Delta_Type.hero_spawn_from_hand,
                source_spell_id: card.generated_by,
                hero_id: card.hero_id,
                at_position: action.at
            });

            break;
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

            submit_battle_delta(battle, use_card(player, card));
            submit_battle_delta(battle, perform_spell_cast_unit_target(battle, player, unit, spell));

            break;
        }

        case Action_Type.use_ground_target_spell_card: {
            const card_use_permission = authorize_card_use(action_permission, action.card_id);
            if (!card_use_permission.ok) return;

            const spell_use_permission = authorize_ground_target_spell_use(card_use_permission);
            if (!spell_use_permission.ok) return;

            // TODO validate location

            const { player, card, spell } = spell_use_permission;

            submit_battle_delta(battle, use_card(player, card));
            submit_spell_cast_ground_target(battle, player, action.at, spell);

            break;
        }

        case Action_Type.use_no_target_spell_card: {
            const card_use_auth = authorize_card_use(action_permission, action.card_id);
            if (!card_use_auth.ok) return;

            const spell_use_auth = authorize_no_target_card_spell_use(card_use_auth);
            if (!spell_use_auth.ok) return;

            const { player, card, spell } = spell_use_auth;

            submit_battle_delta(battle, use_card(player, card));
            submit_battle_delta(battle, perform_spell_cast_no_target(battle, player, spell));

            break;
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

            const { hero, shop, item, cost } = purchase_permission;

            submit_battle_delta(battle, {
                type: Delta_Type.purchase_item,
                unit_id: hero.id,
                shop_id: shop.id,
                item_id: item,
                gold_cost: cost
            });

            submit_item_equip(battle, hero, item);

            break;
        }

        case Action_Type.pick_up_rune: {
            const order_unit_permission = authorize_unit_for_order(action.unit_id);
            if (!order_unit_permission.ok) return;

            const rune_pickup_permission = authorize_rune_pickup_order(order_unit_permission, action.rune_id);
            if (!rune_pickup_permission.ok) return;

            const { hero, rune } = rune_pickup_permission;

            const move_order_permission = authorize_move_order(order_unit_permission, rune.position, unit_pathing_flags(hero, true));
            if (!move_order_permission.ok) return;

            submit_battle_delta(battle, pick_up_rune(battle, hero, rune, move_order_permission.cost));

            break;
        }

        case Action_Type.end_turn: {
            resolve_end_turn_effects(battle);

            submit_battle_delta(battle, {
                type: Delta_Type.end_turn,
                start_turn_of_player_id: get_next_turning_player_id(battle)
            });

            break;
        }

        default: unreachable(action);
    }
}

function spawn_hero(id: Unit_Id, owner: Battle_Player, at_position: XY, type: Hero_Type) : Delta_Hero_Spawn {
    return {
        type: Delta_Type.hero_spawn,
        at_position: at_position,
        owner_id: owner.id,
        hero_type: type,
        unit_id: id
    };
}

function spawn_creep(id: Unit_Id, owner: Battle_Player, at_position: XY, type: Creep_Type, health: number): Delta_Creep_Spawn {
    return {
        type: Delta_Type.creep_spawn,
        at_position: at_position,
        owner_id: owner.id,
        effect: {
            unit_id: id,
            creep_type: type,
            intrinsic_modifiers: []
        },
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

function draw_hero_card(battle: Battle_Record, player: Battle_Player, hero_type: Hero_Type): Delta_Draw_Card {
    return {
        type: Delta_Type.draw_card,
        player_id: player.id,
        card_id: get_next_entity_id(battle) as Card_Id,
        content: {
            type: Card_Type.hero,
            hero: hero_type
        }
    }
}

function draw_spell_card(card_id: Card_Id, player: Battle_Player, spell_id: Spell_Id): Delta_Draw_Card {
    return {
        type: Delta_Type.draw_card,
        player_id: player.id,
        card_id: card_id,
        content: {
            type: Card_Type.spell,
            spell: spell_id
        }
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

function monster_try_retaliate(battle: Battle_Record, monster: Monster, target: Unit) {
    type Attack_Intent_Result = {
        ok: true
        use_ability: Ability_Use_Permission
        order_unit: Order_Unit_Permission
        on_target: Act_On_Unit_Permission
    } | {
        ok: false
        error: Attack_Intent_Error
    };

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

        return {
            ok: true,
            use_ability: ability_use_permission,
            on_target: act_on_target_permission,
            order_unit: order_unit_permission
        }
    };

    function check_and_update_attack_intent() {
        const attack_intent = authorize_attack_intent();

        if (!attack_intent.ok && attack_intent.error == Attack_Intent_Error.fail_and_cancel) {
            battle.monster_targets.delete(monster);
        }

        return attack_intent;
    }

    const initial_intent = authorize_attack_intent();
    if (!initial_intent.ok) return;

    const costs = populate_unit_path_costs(battle, monster, false);

    for (const cell of battle.grid.cells) {
        const move_order = authorize_move_order_from_costs(initial_intent.order_unit, cell.position, costs);
        if (!move_order.ok) continue;

        if (ability_targeting_fits(battle, initial_intent.use_ability.ability.targeting, cell.position, target.position)) {
            submit_battle_delta(battle, {
                type: Delta_Type.unit_move,
                to_position: cell.position,
                unit_id: monster.id,
                move_cost: move_order.cost
            });

            const post_move_intent = check_and_update_attack_intent();
            if (!post_move_intent.ok) break;

            const use = authorize_unit_target_ability_use(post_move_intent.use_ability, post_move_intent.on_target);
            if (!use.ok) break;

            battle.monster_targets.set(monster, target);

            submit_battle_delta(battle, perform_ability_cast_unit_target(battle, monster, use.ability, target));
            break;
        }
    }
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
                const are_enemies = !are_units_allies(attacker, target);
                const target_is_a_summon = target.supertype == Unit_Supertype.creep && target.is_a_summon;

                if (are_enemies && !target_is_a_summon && attacker.supertype != Unit_Supertype.monster) {
                    const bounty = get_gold_for_killing(battle, target);

                    submit_battle_delta(battle, {
                        type: Delta_Type.gold_change,
                        player_id: attacker.owner.id,
                        change: bounty
                    });

                    if (attacker.supertype == Unit_Supertype.hero && attacker.level < Const.max_unit_level) {
                        submit_battle_delta(battle, {
                            type: Delta_Type.level_change,
                            unit_id: attacker.id,
                            new_level: attacker.level + 1,
                            source: { type: Source_Type.none }
                        });
                    }
                }
            } else {
                if (target.supertype == Unit_Supertype.monster) {
                    monster_try_retaliate(battle, target, attacker);
                }
            }
        }

        if (dead) {
            if (target.supertype != Unit_Supertype.monster) {
                for (const ability of target.abilities) {
                    switch (ability.id) {
                        case Ability_Id.monster_spawn_spiderlings: {
                            const center = target.position;
                            const from_x = Math.max(0, center.x - 2);
                            const from_y = Math.max(0, center.y - 2);
                            const to_x = Math.min(battle.grid.size.x, center.x + 2);
                            const to_y = Math.min(battle.grid.size.y, center.y + 2);
                            const free_cells: XY[] = [];

                            for (let x = from_x; x < to_x; x++) {
                                for (let y = from_y; y < to_y; y++) {
                                    const at = xy(x, y);

                                    if (!is_grid_occupied_at(battle.grid, at)) {
                                        free_cells.push(at);
                                    }
                                }
                            }

                            const target_cell = battle.random.in_array(free_cells);
                            if (!target_cell) break;

                            submit_battle_delta(battle, apply_ability_effect_delta({
                                ability_id: Ability_Id.monster_spawn_spiderlings,
                                source_unit_id: target.id,
                                summons: battle.random.pick_n_mutable(free_cells, ability.how_many).map(cell => ({
                                    owner_id: target.owner.id,
                                    spawn: creep_spawn_effect(battle, Creep_Type.spiderling),
                                    at: cell
                                }))
                            }));

                            break;
                        }
                    }
                }
            }
        }
    }
}

function resolve_end_turn_effects(battle: Battle_Record) {
    function for_units_with_ability<T extends Ability_Id>(ability_id: T, action: (unit: Unit, ability: Find_By_Id<Ability, T>) => void) {
        for (const unit of battle.units) {
            if (!authorize_act_on_known_unit(battle, unit).ok) continue;

            for (const ability of unit.abilities) {
                if (ability.id == ability_id) {
                    action(unit, ability as Find_By_Id<Ability, T>);
                }
            }
        }
    }

    function for_units_with_modifier<T extends Modifier_Id>(modifier_id: T, action: (unit: Unit, applied: Applied_Modifier, modifier: Find_By_Id<Modifier, T>) => void) {
        for (const unit of battle.units) {
            if (!authorize_act_on_known_unit(battle, unit).ok) continue;

            for (const applied of unit.modifiers) {
                if (applied.modifier.id == modifier_id) {
                    action(unit, applied, applied.modifier as Find_By_Id<Modifier, T>);
                }
            }
        }
    }

    // TODO Not sure how this interacts with new modifiers being added in case of a modifier removal
    for (const unit of battle.units) {
        for (const modifier of unit.modifiers) {
            if (modifier.duration_remaining != undefined && modifier.duration_remaining == 0) {
                submit_battle_delta(battle, {
                    type: Delta_Type.modifier_removed,
                    modifier_handle_id: modifier.handle_id
                });
            }
        }
    }

    // Not iterating backwards because presumably order actually matters here and savings would be low anyway
    for (let index = 0; index < battle.timed_effects.length; index++) {
        const effect = battle.timed_effects[index];

        if (effect.duration_remaining == 0) {
            // Careful, Ned...
            // The submission can cause timed_effects to change,
            // although I wouldn't expect elements to be removed there, so fingers crossed
            // Maybe we should push those deltas into a separate array and submit them all later
            submit_battle_delta(battle, {
                type: Delta_Type.timed_effect_expired,
                handle_id: effect.handle_id
            });

            battle.timed_effects.splice(index, 1);
            index--;
        }
    }

    for_units_with_modifier(Modifier_Id.item_heart_of_tarrasque, (unit, applied, modifier) => {
        submit_battle_delta(battle, {
            type: Delta_Type.modifier_effect_applied,
            handle_id: applied.handle_id,
            modifier_id: modifier.id,
            change: unit_health_change(unit, modifier.regeneration_per_turn)
        });
    });

    for_units_with_modifier(Modifier_Id.item_armlet, (unit, applied, modifier) => {
        submit_battle_delta(battle, {
            type: Delta_Type.modifier_effect_applied,
            handle_id: applied.handle_id,
            modifier_id: modifier.id,
            change: unit_health_change(unit, -Math.min(modifier.health_loss_per_turn, unit.health - 1))
        });
    });

    for_units_with_modifier(Modifier_Id.dark_seer_ion_shell, (unit, applied) => {
        if (applied.source.type != Source_Type.unit) return;

        for (const ability of applied.source.unit.abilities) {
            if (ability.id != Ability_Id.dark_seer_ion_shell) continue;

            const targets = query_units_for_no_target_ability(battle, unit, ability.shield_targeting);

            submit_battle_delta(battle, apply_ability_effect_delta({
                ability_id: Ability_Id.dark_seer_ion_shell,
                source_unit_id: unit.id,
                targets: targets.map(target => unit_health_change(target, -ability.damage_per_turn))
            }));
        }
    });

    for_units_with_ability(Ability_Id.plague_ward_attack, (unit, ability) => {
        if (is_unit_disarmed(unit)) return;

        const target = battle.random.in_array(
            query_units_for_no_target_ability(battle, unit, ability.targeting).filter(target => !are_units_allies(unit, target))
        );

        if (!target) return;

        const base_attack = get_attack_damage(unit);
        const result_attack = (is_unit_rooted(target) || target.bonus.max_move_points < 0) ? base_attack * 2 : base_attack;
        const basic_attack_stats = calculate_basic_attack(result_attack, target);

        submit_battle_delta(battle, apply_ability_effect_delta({
            ability_id: Ability_Id.plague_ward_attack,
            source_unit_id: unit.id,
            damage_dealt: {
                target_unit_id: target.id,
                blocked_by_armor: basic_attack_stats.blocked_by_armor,
                new_value: basic_attack_stats.new_health,
                value_delta: basic_attack_stats.health_delta
            }
        }));
    });

    for_units_with_ability(Ability_Id.pocket_tower_attack, (unit, ability) => {
        if (is_unit_disarmed(unit)) return;

        const target = battle.random.in_array(
            query_units_for_no_target_ability(battle, unit, ability.targeting).filter(target => !are_units_allies(unit, target))
        );

        if (!target) return;

        submit_battle_delta(battle, apply_ability_effect_delta({
            ability_id: Ability_Id.pocket_tower_attack,
            source_unit_id: unit.id,
            target_unit_id: target.id,
            damage_dealt: basic_attack_unit_health_change(unit, target)
        }));
    });

    for (const monster of battle.units) {
        if (monster.supertype == Unit_Supertype.monster) {
            const target = battle.monster_targets.get(monster);

            if (target) {
                monster_try_retaliate(battle, monster, target);
            }
        }
    }
}

function try_check_battle_over(battle: Battle_Record) {
    if (battle.state.status != Battle_Status.in_progress) {
        return;
    }

    type Check_Result = {
        multiple_players_alive: true
    } | {
        multiple_players_alive: false
        remaining_player?: Battle_Player
    }

    function try_compute_battle_winner(): Check_Result {
        let last_alive_unit_owner: Battle_Player | undefined = undefined;

        for (const unit of battle.units) {
            if (!unit.dead && unit.supertype != Unit_Supertype.monster) {
                if (last_alive_unit_owner == undefined) {
                    last_alive_unit_owner = unit.owner;
                } else if (last_alive_unit_owner != unit.owner) {
                    return {
                        multiple_players_alive: true
                    };
                }
            }
        }

        return {
            multiple_players_alive: false,
            remaining_player: last_alive_unit_owner
        };
    }

    const result = try_compute_battle_winner();
    if (result.multiple_players_alive) return;

    if (result.remaining_player) {
        submit_battle_delta(battle, {
            type: Delta_Type.game_over,
            result: {
                draw: false,
                winner_player_id: result.remaining_player.id
            }
        });
    } else {
        submit_battle_delta(battle, {
            type: Delta_Type.game_over,
            result: { draw: true }
        });
    }
}

export function try_take_turn_action(battle: Battle_Record, player: Battle_Player, action: Turn_Action): Delta[] | undefined {
    if (battle.state.status != Battle_Status.in_progress) {
        return;
    }

    const action_ok = authorize_action_by_player(battle, player);

    if (!action_ok.ok) return;

    const initial_head = battle.delta_head;

    submit_turn_action(battle, action_ok, action);

    try_check_battle_over(battle);

    if (initial_head != battle.delta_head) {
        return get_battle_deltas_after(battle, initial_head);
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

export function submit_external_battle_delta(battle: Battle_Record, delta: Delta) {
    submit_battle_delta(battle, delta);

    try_check_battle_over(battle);
}

function submit_battle_delta(battle: Battle_Record, delta: Delta) {
    battle.deltas.push(delta);

    while (battle.deltas.length != battle.delta_head) {
        const target_head = battle.deltas.length;

        for (; battle.delta_head < target_head; battle.delta_head++) {
            collapse_delta(battle, battle.deltas[battle.delta_head]);
        }

        drain_battle_event_queue(battle);
    }
}

export function find_unoccupied_cells_in_deployment_zone_for_player(battle: Battle_Record, player: Battle_Player) {
    return battle.grid.cells.filter(cell => !is_grid_cell_occupied(cell) && is_point_in_deployment_zone(battle, cell.position, player));
}

export function get_battle_deltas_after(battle: Battle, head: number): Delta[] {
    return battle.deltas.slice(head);
}

export function surrender_player_forces(battle: Battle_Record, battle_player: Battle_Player) {
    const player_units = battle.units.filter(unit => unit.supertype != Unit_Supertype.monster && unit.owner == battle_player);

    // TODO @Temporary Unreliable, needs a separate delta anyway
    for (const unit of player_units) {
        submit_battle_delta(battle, {
            type: Delta_Type.health_change,
            source_unit_id: unit.id,
            target_unit_id: unit.id,
            new_value: 0,
            value_delta: 0
        });
    }
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
                                   battleground: Battleground): Battle_Record {
    const battle: Battle_Record = {
        ...make_battle(players, battleground.grid_size.x, battleground.grid_size.y),
        id: battle_id,
        id_generator: id_generator,
        random: random,
        random_seed: random.int_range(0, 65536),
        monster_targets: new Map(),
        battleground: battleground,
        receive_event: on_battle_event
    };

    fill_grid(battle, battleground.disabled_cells);

    return battle;
}

export function start_battle(battle_id: Battle_Id, id_generator: Id_Generator, random: Random, participants: Battle_Participant[], bg: Battleground): Battle_Record {
    const battle_players: Battle_Player[] = [];
    const battle_player_and_participant_pairs: [Battle_Player, Battle_Participant][] = [];

    for (const participant of participants) {
        const battle_player = make_battle_player({
            id: id_generator() as Battle_Player_Id,
            deployment_zone: participant == participants[0] ? bg.deployment_zones[0] : bg.deployment_zones[1],
            map_entity: participant.map_entity
        });

        battle_player_and_participant_pairs.push([battle_player, participant]);
        battle_players.push(battle_player);
    }

    const battle = make_battle_record(battle_id, id_generator, random, battle_players, bg);

    function get_starting_gold(player: Battle_Player): Delta_Gold_Change {
        return {
            type: Delta_Type.gold_change,
            player_id: player.id,
            change: 5
        }
    }

    for (const delta of battleground_spawns_to_spawn_deltas(id_generator, random, bg.spawns)) {
        submit_battle_delta(battle, delta);
    }

    for (const [player, participant] of battle_player_and_participant_pairs) {
        const heroes = participant.heroes;
        const creeps = participant.creeps;

        // @Performance
        function random_spawn_cell() {
            return random.in_array(find_unoccupied_cells_in_deployment_zone_for_player(battle, player));
        }

        for (const hero of heroes) {
            const spawn_at = random_spawn_cell();
            if (!spawn_at) break;

            submit_battle_delta(battle, spawn_hero(hero.id, player, spawn_at.position, hero.type));

            const spawned_hero = find_hero_by_id(battle, hero.id);

            if (spawned_hero) {
                for (const from_item of hero.modifiers) {
                    submit_battle_delta(battle, {
                        type: Delta_Type.modifier_applied,
                        unit_id: hero.id,
                        application: modifier(battle, from_item.modifier),
                        source: {
                            type: Source_Type.adventure_item,
                            item: from_item.item
                        }
                    });
                }

                for (const at_start of hero.start_effects) {
                    const effect = at_start.effect;
                    switch (effect.effect_id) {
                        case Adventure_Combat_Start_Effect_Id.add_ability_charges: {
                            for (const ability of spawned_hero.abilities) {
                                if (ability.type != Ability_Type.passive && ability.available_since_level <= effect.for_abilities_with_level_less_or_equal) {
                                    submit_battle_delta(battle, {
                                        type: Delta_Type.set_ability_charges,
                                        unit_id: hero.id,
                                        ability_id: ability.id,
                                        charges: ability.charges_remaining + effect.how_many,
                                        only_set_remaining: false,
                                        source: { type: Source_Type.adventure_item, item: at_start.item}
                                    });
                                }
                            }

                            break;
                        }

                        case Adventure_Combat_Start_Effect_Id.level_up: {
                            submit_battle_delta(battle, {
                                type: Delta_Type.level_change,
                                unit_id: hero.id,
                                new_level: Math.min(Const.max_unit_level, spawned_hero.level + effect.how_many_levels),
                                source: { type: Source_Type.adventure_item, item: at_start.item}
                            });

                            break;
                        }
                    }
                }

                submit_battle_delta(battle, {
                    type: Delta_Type.health_change,
                    source_unit_id: hero.id,
                    target_unit_id: hero.id,
                    new_value: hero.health,
                    value_delta: 0
                });
            }
        }

        for (const creep of creeps) {
            const spawn_at = random_spawn_cell();
            if (!spawn_at) break;

            submit_battle_delta(battle, spawn_creep(creep.id, player, spawn_at.position, creep.type, creep.health));
        }

        submit_battle_delta(battle, get_starting_gold(player));

        for (const spell of participant.spells) {
            submit_battle_delta(battle, draw_spell_card(spell.id, player, spell.spell));
        }
    }

    submit_external_battle_delta(battle, { type: Delta_Type.game_start });

    return battle;
}

export function cheat(battle: Battle_Record, battle_player: Battle_Player, cheat: string, selected_unit_id: Unit_Id) {
    const parts = cheat.split(" ");

    function refresh_unit(battle: Battle_Record, unit: Unit) {
        submit_battle_delta(battle, {
            type: Delta_Type.health_change,
            source_unit_id: unit.id,
            target_unit_id: unit.id,
            new_value: get_max_health(unit),
            value_delta: get_max_health(unit) - unit.health
        });

        for (const ability of unit.abilities) {
            if (ability.type != Ability_Type.passive && ability.charges_remaining != ability.charges) {
                submit_battle_delta(battle, {
                    type: Delta_Type.set_ability_charges,
                    unit_id: unit.id,
                    ability_id: ability.id,
                    charges: ability.charges,
                    only_set_remaining: true,
                    source: { type: Source_Type.none }
                });
            }
        }
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

            submit_external_battle_delta(battle, {
                type: Delta_Type.set_ability_charges,
                unit_id: unit.id,
                ability_id: unit.abilities[ability_index].id,
                charges: charges,
                only_set_remaining: true,
                source: { type: Source_Type.none }
            });

            break;
        }

        case "gold": {
            submit_external_battle_delta(battle, { type: Delta_Type.gold_change, player_id: battle_player.id, change: 15 });

            break;
        }

        case "skipturn": {
            submit_external_battle_delta(battle, {
                type: Delta_Type.end_turn,
                start_turn_of_player_id: get_next_turning_player_id(battle)
            });

            break;
        }

        case "lvl": {
            const unit = find_unit_by_id(battle, selected_unit_id);

            if (!unit) break;

            const new_lvl = parseInt(parts[1]);

            submit_external_battle_delta(battle, {
                type: Delta_Type.level_change,
                unit_id: selected_unit_id,
                new_level: new_lvl,
                source: { type: Source_Type.none }
            });

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

            submit_external_battle_delta(battle, {
                type: Delta_Type.health_change,
                source_unit_id: unit.id,
                target_unit_id: unit.id,
                new_value: 0,
                value_delta: -unit.health
            });

            break;
        }

        case "killall": {
            for (const unit of battle.units) {
                if (!unit.dead) {
                    submit_external_battle_delta(battle, {
                        type: Delta_Type.health_change,
                        source_unit_id: unit.id,
                        target_unit_id: unit.id,
                        new_value: 0,
                        value_delta: -unit.health
                    });
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

            if (is_grid_occupied_at(battle.grid, at)) {
                break;
            }

            submit_external_battle_delta(battle, {
                type: Delta_Type.rune_spawn,
                rune_id: get_next_entity_id(battle) as Rune_Id,
                rune_type: rune_type(),
                at: at
            });

            break;
        }

        case "spl": {
            const spells = parse_enum_query(parts[1], enum_names_to_values<Spell_Id>());

            for (const spell of spells) {
                submit_external_battle_delta(battle, draw_spell_card(get_next_entity_id(battle) as Card_Id, battle_player, spell));
            }

            break;
        }

        case "hero": {
            const heroes = parse_enum_query(parts[1], enum_names_to_values<Hero_Type>());

            for (const hero of heroes) {
                submit_external_battle_delta(battle, draw_hero_card(battle, battle_player, hero));
            }

            break;
        }

        case "creep": {
            const creeps = parse_enum_query(parts[1], enum_names_to_values<Creep_Type>());
            const free_cells = find_unoccupied_cells_in_deployment_zone_for_player(battle, battle_player);

            for (const creep of creeps) {
                const random_cell = battle.random.pick_n_mutable(free_cells, 1);

                if (random_cell) {
                    const delta = spawn_creep(get_next_entity_id(battle) as Unit_Id, battle_player, random_cell[0].position, creep, creep_definition_by_type(creep).health);
                    submit_external_battle_delta(battle, delta);
                }
            }

            break;
        }

        case "item": {
            const unit = find_unit_by_id(battle, selected_unit_id);

            if (!unit) break;
            if (unit.supertype != Unit_Supertype.hero) break;

            const items = parse_enum_query(parts[1], enum_names_to_values<Item_Id>());

            for (const item of items) {
                submit_item_equip(battle, unit, item);
                try_check_battle_over(battle);
            }

            break;
        }

        case "gg": {
            surrender_player_forces(battle, battle_player);

            break;
        }

        case "win": {
            for (const loser of battle.players) {
                if (loser != battle_player) {
                    surrender_player_forces(battle, loser);
                }
            }

            break;
        }
    }
}