const enum Modifier_Change_Type {
    field_change,
    ability_override,
    apply_status,
    apply_special_state
}

const enum Modifier_Field {
    health_bonus,
    attack_bonus,
    armor_bonus,
    move_points_bonus,
    applied_poison
}

const enum Special_Modifier_State {
    damage_doubled,
    damage_double_against_movement_impaired
}

type Modifier_Change = {
    type: Modifier_Change_Type.field_change
    field: Modifier_Field
    delta: number
} | {
    type: Modifier_Change_Type.ability_override
    original_ability: Ability_Id
    override_with: Ability_Id
} | {
    type: Modifier_Change_Type.apply_status
    status: Unit_Status
} | {
    type: Modifier_Change_Type.apply_special_state
    state: Special_Modifier_State
}

type Ability_Override = {
    original: Ability_Id
    override: Ability_Id
}

type Recalculated_Stats = {
    health: number
    move_points: number

    bonus: {
        armor: number
        max_health: number
        attack_damage: number
        max_move_points: number
        poison: number
    }

    status: Record<Unit_Status, boolean>

    overrides: Ability_Override[]
}

function get_attack_damage(stats: Unit_Stats) {
    return stats.base.attack_damage + stats.bonus.attack_damage;
}

function get_armor(stats: Unit_Stats) {
    return stats.base.armor + stats.bonus.armor;
}

function get_max_health(stats: Unit_Stats) {
    return stats.base.max_health + stats.bonus.max_health;
}

function get_max_move_points(stats: Unit_Stats) {
    return stats.base.max_move_points + stats.bonus.max_move_points;
}

function is_unit_out_of_the_game(unit: Unit_Stats) {
    return unit.status[Unit_Status.out_of_the_game];
}

function is_unit_stunned(unit: Unit_Stats) {
    return unit.status[Unit_Status.stunned];
}

function is_unit_rooted(unit: Unit_Stats) {
    return unit.status[Unit_Status.rooted];
}

function is_unit_silenced(unit: Unit_Stats) {
    return unit.status[Unit_Status.silenced];
}

function is_unit_disarmed(unit: Unit_Stats) {
    return unit.status[Unit_Status.disarmed];
}

function is_unit_phased(unit: Unit_Stats) {
    return unit.status[Unit_Status.phased];
}

function starting_unit_status(): Record<Unit_Status, boolean> {
    return {
        [Unit_Status.rooted]: false,
        [Unit_Status.stunned]: false,
        [Unit_Status.silenced]: false,
        [Unit_Status.disarmed]: false,
        [Unit_Status.unselectable]: false,
        [Unit_Status.out_of_the_game]: false,
        [Unit_Status.phased]: false
    };
}

function recalculate_unit_stats_from_modifiers(source: Unit_Stats, modifiers: Modifier[]): Recalculated_Stats {
    const new_bonus = {
        armor: 0,
        max_health: 0,
        attack_damage: 0,
        max_move_points: 0,
        poison: 0
    };

    const new_status = starting_unit_status();
    const new_overrides: Ability_Override[] = [];
    const special_states: Record<Special_Modifier_State, boolean> = {
        [Special_Modifier_State.damage_doubled]: false,
        [Special_Modifier_State.damage_double_against_movement_impaired]: false
    };

    for (const modifier of modifiers) {
        const changes = calculate_modifier_changes(modifier);

        for (const change of changes) {
            switch (change.type) {
                case Modifier_Change_Type.field_change: {
                    switch (change.field) {
                        case Modifier_Field.armor_bonus: new_bonus.armor += change.delta; break;
                        case Modifier_Field.attack_bonus: new_bonus.attack_damage += change.delta; break;
                        case Modifier_Field.health_bonus: new_bonus.max_health += change.delta; break;
                        case Modifier_Field.move_points_bonus: new_bonus.max_move_points += change.delta; break;
                        case Modifier_Field.applied_poison: new_bonus.poison += change.delta; break;
                        default: unreachable(change.field);
                    }

                    break;
                }

                case Modifier_Change_Type.apply_status: {
                    new_status[change.status] = true;
                    break;
                }

                case Modifier_Change_Type.ability_override: {
                    new_overrides.push({
                        original: change.original_ability,
                        override: change.override_with
                    });

                    break;
                }

                case Modifier_Change_Type.apply_special_state: {
                    special_states[change.state] = true;
                    break;
                }

                default: unreachable(change);
            }
        }
    }

    if (special_states[Special_Modifier_State.damage_doubled]) {
        const target_damage = (source.base.attack_damage + new_bonus.attack_damage) * 2;

        new_bonus.attack_damage = target_damage - source.base.attack_damage;
    }

    let new_health = source.health;
    let new_move_points = source.move_points;

    const max_health_delta = new_bonus.max_health - source.bonus.max_health;

    if (max_health_delta > 0) {
        new_health = source.health + max_health_delta;
    } else if (max_health_delta < 0) {
        const new_max_health = source.base.max_health + new_bonus.max_health;

        new_health = Math.min(new_max_health, source.health);
    }

    const max_move_points_delta = new_bonus.max_move_points - source.bonus.max_move_points;

    if (max_move_points_delta > 0) {
        new_move_points = source.move_points + max_move_points_delta;
    } else if (max_move_points_delta < 0) {
        const new_max_move_points = source.base.max_move_points + new_bonus.max_move_points;

        new_move_points = Math.min(new_max_move_points, source.move_points);
    }

    return {
        health: new_health,
        move_points: new_move_points,
        bonus: new_bonus,
        status: new_status,
        overrides: new_overrides
    };
}

function calculate_modifier_changes(modifier: Modifier): Modifier_Change[] {
    function field(field: Modifier_Field, delta: number): Modifier_Change {
        return {
            type: Modifier_Change_Type.field_change,
            field: field,
            delta: delta
        }
    }

    function status(status: Unit_Status): Modifier_Change {
        return {
            type: Modifier_Change_Type.apply_status,
            status: status
        }
    }

    function override_ability(original: Ability_Id, override: Ability_Id): Modifier_Change {
        return {
            type: Modifier_Change_Type.ability_override,
            original_ability: original,
            override_with: override
        }
    }

    function special_state(state: Special_Modifier_State): Modifier_Change {
        return {
            type: Modifier_Change_Type.apply_special_state,
            state: state
        }
    }

    switch (modifier.id) {
        case Modifier_Id.armor: return [
            field(Modifier_Field.armor_bonus, modifier.bonus)
        ];

        case Modifier_Id.attack_damage: return [
            field(Modifier_Field.attack_bonus, modifier.bonus)
        ];

        case Modifier_Id.move_speed: return [
            field(Modifier_Field.move_points_bonus, modifier.bonus)
        ];

        case Modifier_Id.health: return [
            field(Modifier_Field.health_bonus, modifier.bonus)
        ];

        case Modifier_Id.stunned: return [
            status(Unit_Status.stunned)
        ];

        case Modifier_Id.rooted: return [
            status(Unit_Status.rooted)
        ];

        case Modifier_Id.rune_double_damage: return [
            special_state(Special_Modifier_State.damage_doubled)
        ];

        case Modifier_Id.rune_haste: return [
            field(Modifier_Field.move_points_bonus, modifier.move_bonus)
        ];

        case Modifier_Id.tide_gush: return [
            field(Modifier_Field.move_points_bonus, -modifier.move_reduction)
        ];

        case Modifier_Id.skywrath_concussive_shot: return [
            field(Modifier_Field.move_points_bonus, -modifier.move_reduction)
        ];

        case Modifier_Id.skywrath_ancient_seal: return [
            status(Unit_Status.silenced)
        ];

        case Modifier_Id.dragon_knight_elder_dragon_form: return [
            override_ability(Ability_Id.basic_attack, Ability_Id.dragon_knight_elder_dragon_form_attack)
        ];

        case Modifier_Id.lion_hex: return [
            status(Unit_Status.silenced),
            status(Unit_Status.disarmed),
            field(Modifier_Field.move_points_bonus, -modifier.move_reduction)
        ];

        case Modifier_Id.venge_wave_of_terror: return [
            field(Modifier_Field.armor_bonus, -modifier.armor_reduction)
        ];

        case Modifier_Id.dark_seer_ion_shell: return [
        ];

        case Modifier_Id.dark_seer_surge: return [
            field(Modifier_Field.move_points_bonus, modifier.move_bonus)
        ];

        case Modifier_Id.ember_searing_chains: return [
            status(Unit_Status.rooted)
        ];

        case Modifier_Id.ember_fire_remnant_caster: return [
            override_ability(Ability_Id.ember_fire_remnant, Ability_Id.ember_activate_fire_remnant)
        ];

        case Modifier_Id.ember_fire_remnant: return [
            status(Unit_Status.out_of_the_game),
            status(Unit_Status.unselectable)
        ];

        case Modifier_Id.shaker_enchant_totem_caster: return [
            special_state(Special_Modifier_State.damage_doubled)
        ];

        case Modifier_Id.veno_plague_ward: return [
            special_state(Special_Modifier_State.damage_double_against_movement_impaired),
            status(Unit_Status.rooted)
        ];

        case Modifier_Id.veno_venomous_gale: return [
            field(Modifier_Field.move_points_bonus, -modifier.move_reduction),
            field(Modifier_Field.applied_poison, modifier.poison_applied)
        ];

        case Modifier_Id.veno_poison_nova: return [
            status(Unit_Status.rooted),
            status(Unit_Status.disarmed)
        ];

        case Modifier_Id.item_heart_of_tarrasque: return [
            field(Modifier_Field.health_bonus, modifier.health)
        ];

        case Modifier_Id.item_satanic: return [
        ];

        case Modifier_Id.item_mask_of_madness: return [
            status(Unit_Status.silenced),
            field(Modifier_Field.attack_bonus, modifier.attack)
        ];

        case Modifier_Id.item_armlet: return [
            field(Modifier_Field.health_bonus, modifier.health)
        ];

        case Modifier_Id.item_morbid_mask: return [
        ];

        case Modifier_Id.item_octarine_core: return [
        ];

        case Modifier_Id.item_basher: return [
        ];

        case Modifier_Id.item_spider_legs:
        case Modifier_Id.item_phase_boots: return [
            field(Modifier_Field.move_points_bonus, modifier.move_bonus),
            status(Unit_Status.phased)
        ];

        case Modifier_Id.item_iron_branch: return [
            field(Modifier_Field.armor_bonus, modifier.armor_bonus),
            field(Modifier_Field.health_bonus, modifier.health_bonus),
            field(Modifier_Field.attack_bonus, modifier.attack_bonus),
            field(Modifier_Field.move_points_bonus, modifier.moves_bonus)
        ];

        case Modifier_Id.spell_euls_scepter: return [
            status(Unit_Status.out_of_the_game)
        ];

        case Modifier_Id.spell_buckler: return [
            field(Modifier_Field.armor_bonus, modifier.armor)
        ];

        case Modifier_Id.spell_drums_of_endurance: return [
            field(Modifier_Field.move_points_bonus, modifier.move_bonus)
        ];

        case Modifier_Id.returned_to_hand: return [
            status(Unit_Status.out_of_the_game)
        ];

        default: unreachable(modifier);
    }

    return [];
}