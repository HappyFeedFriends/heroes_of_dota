type Ability_Base_Return<T extends Ability_Id> = {
    id: T
    type: Find_By_Type<Ability_Stats, T>["type"]
}

function ability_base<T extends Ability_Id>(id: T): Ability_Base_Return<T> {
    const ability_stats = type_of<Ability_Stats>();
    if (ability_stats.kind != Type_Kind.union) {
        throw "Ability_Stats expected to be a union";
    }

    const member = find_member_of_union_by_tag(ability_stats, "id", id);
    if (!member.ok) {
        throw "Unable to find ability by id " + id;
    }

    const type_type = find_object_member_type_by_name(member.data, "type");
    if (!type_type || type_type.kind != Type_Kind.enum_member) {
        throw "Ability_Stats.type not found or not supported (" + type_type + ")"
    }

    const type_value = type_type.type;
    if (type_value.kind != Type_Kind.number_literal) {
        throw "Unsupported value kind (" + type_value.kind + ")"
    }

    return {
        id: id,
        type: type_value.value as Find_By_Type<Ability_Stats, T>["type"]
    }
}

type Unit_Abilities = {
    attack?: Ability_Active
    abilities: Ability[]
    ability_bench: Ability[]
    ability_overrides: Ability_Override[]
}

function instantiate_unit_abilities(definition: Unit_Definition): Unit_Abilities {
    function ability_definition_to_ability(definition: Ability_Definition): Ability {
        if (definition.type == Ability_Type.passive) {
            return {
                ...definition,
                intrinsic_modifiers: definition.intrinsic_modifiers ? definition.intrinsic_modifiers : []
            }
        }

        if (definition.type == Ability_Type.target_unit) {
            return {
                ...definition,
                charges_remaining: definition.charges,
                flags: definition.flags ? definition.flags : [],
                target_flags: definition.target_flags ? definition.target_flags : []
            }
        }

        return {
            ...definition,
            charges_remaining: definition.charges,
            flags: definition.flags ? definition.flags : []
        }
    }

    const attack = definition.attack ? ability_definition_to_ability(definition.attack) as Ability_Active : undefined;
    const abilities = definition.abilities ? definition.abilities.map(ability => ability_definition_to_ability(ability)) : [];
    const ability_bench = definition.ability_bench ? definition.ability_bench.map(ability => ability_definition_to_ability(ability)) : [];

    if (attack) abilities.unshift(attack);

    return {
        attack: attack,
        abilities: abilities,
        ability_bench: ability_bench,
        ability_overrides: []
    }
}

function default_targeting_flags(): Ability_Targeting_Flag_Field {
    return {
        [Ability_Targeting_Flag.include_caster]: false,
        [Ability_Targeting_Flag.only_free_cells]: false
    };
}

function target_line(length: number, selector: Ability_Area_Selector = single_target()) {
    return {
        type: Ability_Targeting_Type.line,
        line_length: length,
        selector: selector,
        flags: default_targeting_flags(),
    } as const;
}

function target_first_in_line(length: number, selector: Ability_Area_Selector = single_target()) {
    return {
        type: Ability_Targeting_Type.first_in_line,
        line_length: length,
        selector: selector,
        flags: default_targeting_flags(),
    } as const
}

function single_target(): Ability_Area_Selector {
    return {
        type: Ability_Target_Selector_Type.single_target,
        flags: default_targeting_flags()
    }
}

function select_in_rectangle(radius: number, ...flags: Ability_Targeting_Flag[]): Ability_Area_Selector {
    const result_flags = default_targeting_flags();

    for (const flag of flags) {
        result_flags[flag] = true;
    }

    return {
        type: Ability_Target_Selector_Type.rectangle,
        area_radius: radius,
        flags: result_flags
    }
}

function select_in_line(length: number): Ability_Area_Selector {
    return {
        type: Ability_Target_Selector_Type.line,
        length: length,
        flags: default_targeting_flags()
    }
}

function target_in_manhattan_distance(distance: number, selector: Ability_Area_Selector = single_target(), ...flags: Ability_Targeting_Flag[]): Ability_Targeting {
    const result_flags = default_targeting_flags();

    for (const flag of flags) {
        result_flags[flag] = true;
    }

    return {
        type: Ability_Targeting_Type.unit_in_manhattan_distance,
        distance: distance,
        selector: selector,
        flags: result_flags
    }
}

function target_rect_area_around_caster(area_radius: number, selector: Ability_Area_Selector = single_target()): Ability_Targeting {
    return {
        type: Ability_Targeting_Type.rectangular_area_around_caster,
        area_radius: area_radius,
        selector: selector,
        flags: default_targeting_flags(),
    }
}

function basic_attack(range: number): Ability_Definition_Active {
    return {
        ...ability_base(Ability_Id.basic_attack),
        available_since_level: 0,
        targeting: target_first_in_line(range),
        charges: 1
    };
}

function hero_definition_by_type(type: Hero_Type): Unit_Definition {
    switch (type) {
        case Hero_Type.ursa: return {
            health: 15,
            attack_damage: 5,
            move_points: 4,
            attack: basic_attack(1),
            abilities: [
            ]
        };

        case Hero_Type.sniper: return {
            health: 12,
            move_points: 3,
            attack_damage: 4,
            attack: basic_attack(4),
            abilities: [
            ]
        };

        case Hero_Type.pudge: return {
            health: 16,
            move_points: 2,
            attack_damage: 5,
            attack: basic_attack(1),
            abilities: [
                {
                    ...ability_base(Ability_Id.pudge_hook),
                    available_since_level: 1,
                    targeting: target_first_in_line(5),
                    charges: 1,
                    damage: 3
                },
                {
                    ...ability_base(Ability_Id.pudge_rot),
                    available_since_level: 2,
                    selector: select_in_rectangle(1),
                    charges: 1,
                    damage: 5
                },
                {
                    ...ability_base(Ability_Id.pudge_dismember),
                    available_since_level: 3,
                    targeting: target_in_manhattan_distance(1),
                    charges: 1,
                    damage: 10
                }
            ]
        };

        case Hero_Type.tidehunter: return {
            health: 16,
            move_points: 2,
            attack_damage: 5,
            attack: basic_attack(1),
            abilities: [
                {
                    ...ability_base(Ability_Id.tide_gush),
                    available_since_level: 1,
                    targeting: target_in_manhattan_distance(5),
                    charges: 1,
                    damage: 3,
                    move_points_reduction: 2
                },
                {
                    ...ability_base(Ability_Id.tide_anchor_smash),
                    available_since_level: 2,
                    selector: select_in_rectangle(1),
                    charges: 2,
                    damage: 4,
                    attack_reduction: 2
                },
                {
                    ...ability_base(Ability_Id.tide_ravage),
                    available_since_level: 3,
                    selector: select_in_rectangle(5),
                    damage: 5,
                    charges: 1,
                }
            ]
        };

        case Hero_Type.luna: return {
            health: 12,
            move_points: 4,
            attack_damage: 4,
            attack: basic_attack(2),
            abilities: [
                {
                    ...ability_base(Ability_Id.luna_lucent_beam),
                    available_since_level: 1,
                    targeting: target_in_manhattan_distance(5),
                    charges: 1,
                    damage: 4
                },
                {
                    ...ability_base(Ability_Id.luna_moon_glaive),
                    available_since_level: 2,
                    secondary_selector: select_in_rectangle(2)
                },
                {
                    ...ability_base(Ability_Id.luna_eclipse),
                    available_since_level: 3,
                    selector: select_in_rectangle(3),
                    total_beams: 14,
                    charges: 1,
                }
            ]
        };

        case Hero_Type.skywrath_mage: return {
            health: 10,
            move_points: 3,
            attack_damage: 3,
            attack: basic_attack(3),
            abilities: [
                {
                    ...ability_base(Ability_Id.skywrath_ancient_seal),
                    available_since_level: 1,
                    targeting: target_in_manhattan_distance(3),
                    charges: 1,
                    duration: 3
                },
                {
                    ...ability_base(Ability_Id.skywrath_concussive_shot),
                    available_since_level: 2,
                    selector: select_in_rectangle(3),
                    charges: 1,
                    move_points_reduction: 2,
                    damage: 4,
                    duration: 2
                },
                {
                    ...ability_base(Ability_Id.skywrath_mystic_flare),
                    available_since_level: 3,
                    targeting: target_in_manhattan_distance(5, select_in_rectangle(1, Ability_Targeting_Flag.include_caster), Ability_Targeting_Flag.include_caster),
                    charges: 1,
                    damage: 10
                }
            ]
        };

        case Hero_Type.dragon_knight: return {
            health: 14,
            move_points: 3,
            attack_damage: 4,
            attack: basic_attack(1),
            abilities: [
                {
                    ...ability_base(Ability_Id.dragon_knight_breathe_fire),
                    available_since_level: 1,
                    targeting: target_line(3, {
                        type: Ability_Target_Selector_Type.t_shape,
                        stem_length: 3,
                        arm_length: 2,
                        flags: default_targeting_flags()
                    }),
                    charges: 1,
                    damage: 5
                },
                {
                    ...ability_base(Ability_Id.dragon_knight_dragon_tail),
                    available_since_level: 2,
                    targeting: target_in_manhattan_distance(1),
                    charges: 1,
                    damage: 3
                },
                {
                    ...ability_base(Ability_Id.dragon_knight_elder_dragon_form),
                    available_since_level: 3,
                    selector: single_target(),
                    charges: 1
                }
            ],
            ability_bench: [
                {
                    ...ability_base(Ability_Id.dragon_knight_elder_dragon_form_attack),
                    available_since_level: 0,
                    targeting: target_line(4, select_in_rectangle(1, Ability_Targeting_Flag.include_caster)),
                    charges: 1
                }
            ]
        };

        case Hero_Type.lion: return {
            health: 9,
            move_points: 3,
            attack_damage: 3,
            attack: basic_attack(3),
            abilities: [
                {
                    ...ability_base(Ability_Id.lion_hex),
                    available_since_level: 1,
                    targeting: target_in_manhattan_distance(3),
                    charges: 1,
                    duration: 2,
                    move_points_reduction: 1
                },
                {
                    ...ability_base(Ability_Id.lion_impale),
                    available_since_level: 2,
                    targeting: target_line(3, select_in_line(3)),
                    charges: 1,
                    damage: 4
                },
                {
                    ...ability_base(Ability_Id.lion_finger_of_death),
                    available_since_level: 3,
                    targeting: target_in_manhattan_distance(4),
                    charges: 1,
                    damage: 8
                }
            ]
        };

        case Hero_Type.mirana: return {
            health: 10,
            move_points: 3,
            attack_damage: 4,
            attack: basic_attack(3),
            abilities: [
                {
                    ...ability_base(Ability_Id.mirana_starfall),
                    available_since_level: 1,
                    selector: select_in_rectangle(2),
                    charges: 1,
                    damage: 3
                },
                {
                    ...ability_base(Ability_Id.mirana_arrow),
                    available_since_level: 2,
                    targeting: target_first_in_line(7),
                    charges: 1
                },
                {
                    ...ability_base(Ability_Id.mirana_leap),
                    available_since_level: 3,
                    targeting: {
                        type: Ability_Targeting_Type.any_cell,
                        selector: single_target(),
                        flags: {
                            [Ability_Targeting_Flag.include_caster]: false,
                            [Ability_Targeting_Flag.only_free_cells]: true
                        }
                    },
                    flags: [ Ability_Flag.does_not_consume_action ],
                    charges: 1
                }
            ]
        };

        case Hero_Type.vengeful_spirit: return {
            health: 9,
            move_points: 3,
            attack_damage: 3,
            attack: basic_attack(3),
            abilities: [
                {
                    ...ability_base(Ability_Id.venge_magic_missile),
                    available_since_level: 1,
                    targeting: target_in_manhattan_distance(3),
                    charges: 1,
                    damage: 3
                },
                {
                    ...ability_base(Ability_Id.venge_wave_of_terror),
                    available_since_level: 2,
                    targeting: target_line(5, select_in_line(5)),
                    charges: 1,
                    damage: 3,
                    armor_reduction: 2,
                    duration: 2
                },
                {
                    ...ability_base(Ability_Id.venge_nether_swap),
                    available_since_level: 3,
                    targeting: target_in_manhattan_distance(65536),
                    charges: 1
                }
            ]
        };

        case Hero_Type.dark_seer: return {
            health: 11,
            move_points: 3,
            attack_damage: 4,
            attack: basic_attack(1),
            abilities: [
                {
                    ...ability_base(Ability_Id.dark_seer_ion_shell),
                    available_since_level: 1,
                    targeting: target_in_manhattan_distance(5, single_target(), Ability_Targeting_Flag.include_caster),
                    flags: [ Ability_Flag.does_not_consume_action ],
                    charges: 1,
                    damage_per_turn: 1,
                    duration: 5,
                    shield_selector: select_in_rectangle(1)
                },
                {
                    ...ability_base(Ability_Id.dark_seer_surge),
                    available_since_level: 2,
                    targeting: target_in_manhattan_distance(5, single_target(), Ability_Targeting_Flag.include_caster),
                    flags: [ Ability_Flag.does_not_consume_action ],
                    charges: 2,
                    move_points_bonus: 3
                },
                {
                    ...ability_base(Ability_Id.dark_seer_vacuum),
                    available_since_level: 3,
                    targeting: target_in_manhattan_distance(4, select_in_rectangle(2, Ability_Targeting_Flag.include_caster)),
                    flags: [ ],
                    charges: 1,
                },
            ]
        };

        case Hero_Type.ember_spirit: return {
            health: 10,
            attack: basic_attack(1),
            attack_damage: 3,
            move_points: 3,
            abilities: [
                {
                    ...ability_base(Ability_Id.ember_searing_chains),
                    available_since_level: 1,
                    selector: select_in_rectangle(2),
                    charges: 1,
                    targets: 2
                },
                {
                    ...ability_base(Ability_Id.ember_sleight_of_fist),
                    available_since_level: 2,
                    selector: select_in_rectangle(2),
                    charges: 1
                },
                {
                    ...ability_base(Ability_Id.ember_fire_remnant),
                    available_since_level: 3,
                    targeting: target_in_manhattan_distance(7, single_target(), Ability_Targeting_Flag.only_free_cells),
                    charges: 1
                }
            ],
            ability_bench: [
                {
                    ...ability_base(Ability_Id.ember_activate_fire_remnant),
                    available_since_level: 3,
                    charges: 1,
                    selector: single_target(),
                    flags: [ Ability_Flag.does_not_consume_action ]
                }
            ]
        };

        case Hero_Type.earthshaker: return {
            health: 10,
            attack_damage: 3,
            move_points: 2,
            attack: basic_attack(1),
            abilities: [
                {
                    ...ability_base(Ability_Id.shaker_fissure),
                    available_since_level: 1,
                    charges: 1,
                    targeting: target_line(5, select_in_line(5))
                },
                {
                    ...ability_base(Ability_Id.shaker_enchant_totem),
                    available_since_level: 2,
                    charges: 1,
                    selector: select_in_rectangle(1),
                    modifier: { id: Modifier_Id.shaker_enchant_totem_caster },
                    flags: [ Ability_Flag.does_not_consume_action ]
                },
                {
                    ...ability_base(Ability_Id.shaker_echo_slam),
                    available_since_level: 3,
                    charges: 1,
                    selector: select_in_rectangle(2)
                }
            ],
            ability_bench: [
                {
                    ...ability_base(Ability_Id.shaker_enchant_totem_attack),
                    available_since_level: 0,
                    targeting: target_in_manhattan_distance(1),
                    charges: 1
                }
            ]
        };

        case Hero_Type.venomancer: return {
            health: 8,
            attack_damage: 3,
            move_points: 3,
            attack: basic_attack(2),
            abilities: [
                {
                    ...ability_base(Ability_Id.venomancer_plague_wards),
                    targeting: target_in_manhattan_distance(4),
                    available_since_level: 1,
                    charges: 3
                },
                {
                    ...ability_base(Ability_Id.venomancer_venomous_gale),
                    targeting: target_line(4, select_in_line(4)),
                    available_since_level: 2,
                    charges: 1,
                    slow: 2,
                    poison_applied: 2
                },
                {
                    ...ability_base(Ability_Id.venomancer_poison_nova),
                    selector: select_in_rectangle(2),
                    available_since_level: 3,
                    charges: 1
                }
            ]
        };

        case Hero_Type.bounty_hunter: return {
            health: 8,
            attack_damage: 3,
            move_points: 2,
            attack: basic_attack(1),
            abilities: [
                {
                    ...ability_base(Ability_Id.bounty_hunter_shadow_walk),
                    charges: 2,
                    available_since_level: 1,
                    selector: single_target(),
                    modifier: {
                        id: Modifier_Id.bounty_hunter_shadow_walk,
                        move_bonus: 2
                    },
                    flags: [ Ability_Flag.does_not_consume_action ]
                },
                {
                    ...ability_base(Ability_Id.bounty_hunter_jinada),
                    available_since_level: 2,
                    intrinsic_modifiers: [{
                        id: Modifier_Id.replace_ability,
                        from: Ability_Id.basic_attack,
                        to: Ability_Id.bounty_hunter_jinada_attack
                    }]
                },
                {
                    ...ability_base(Ability_Id.bounty_hunter_track),
                    targeting: target_in_manhattan_distance(5),
                    available_since_level: 3,
                    charges: 1,
                    target_flags: [ Ability_Unit_Target_Flag.only_enemies ],
                    modifier: {
                        id: Modifier_Id.bounty_hunter_track_aura,
                        selector: {
                            rectangle_distance: 99,
                            flags: {
                                [Aura_Selector_Flag.enemies]: true,
                                [Aura_Selector_Flag.allies]: false
                            }
                        },
                        modifier: {
                            id: Modifier_Id.bounty_hunter_track,
                            move_bonus: 2
                        }
                    }
                }
            ],
            ability_bench: [
                {
                    ...ability_base(Ability_Id.bounty_hunter_jinada_attack),
                    targeting: target_first_in_line(1),
                    available_since_level: 0,
                    charges: 1,
                    modifier: {
                        id: Modifier_Id.bounty_hunter_jinada,
                        move_reduction: 1
                    }
                }
            ]
        };

        default: return unreachable(type);
    }
}

function monster_definition(): Unit_Definition {
    return {
        attack: basic_attack(1),
        attack_damage: 3,
        health: 6,
        move_points: 3
    }
}

function creep_definition_by_type(creep_type: Creep_Type): Unit_Definition {
    switch (creep_type) {
        case Creep_Type.pocket_tower: return {
            attack_damage: 2,
            health: 7,
            move_points: 0,
            abilities: [
                {
                    ...ability_base(Ability_Id.pocket_tower_attack),
                    available_since_level: 0,
                    selector: select_in_rectangle(2)
                },
                {
                    ...ability_base(Ability_Id.deployment_zone),
                    available_since_level: 0,
                    radius: 1
                },
            ],
            intrinsic_modifiers: [{ id: Modifier_Id.rooted }]
        };

        case Creep_Type.veno_plague_ward: return {
            attack_damage: 1,
            health: 3,
            move_points: 0,
            abilities: [
                {
                    ...ability_base(Ability_Id.plague_ward_attack),
                    available_since_level: 0,
                    selector: select_in_rectangle(3)
                },
            ],
            intrinsic_modifiers: [{ id: Modifier_Id.rooted }]
        };

        case Creep_Type.lane_creep: return {
            attack_damage: 3,
            health: 3,
            move_points: 3,
            attack: basic_attack(1)
        };

        case Creep_Type.satyr_big: return {
            attack_damage: 6,
            health: 12,
            move_points: 2,
            attack: basic_attack(1)
        };

        case Creep_Type.satyr_small: return {
            attack_damage: 3,
            health: 6,
            move_points: 3,
            attack: basic_attack(1)
        };

        case Creep_Type.small_spider: return {
            attack_damage: 3,
            health: 5,
            move_points: 3,
            attack: basic_attack(1)
        };

        case Creep_Type.large_spider: return {
            attack_damage: 4,
            health: 10,
            move_points: 3,
            attack: basic_attack(1),
            abilities: [
                {
                    ...ability_base(Ability_Id.monster_lifesteal),
                    available_since_level: 0
                }
            ]
        };

        case Creep_Type.spider_matriarch: return {
            attack_damage: 2,
            health: 10,
            move_points: 2,
            attack: basic_attack(1),
            abilities: [
                {
                    ...ability_base(Ability_Id.monster_spawn_spiderlings),
                    available_since_level: 0,
                    how_many: 3
                }
            ]
        };

        case Creep_Type.spiderling: return {
            attack_damage: 2,
            health: 2,
            move_points: 3,
            attack: basic_attack(1),
            abilities: []
        };

        case Creep_Type.hardened_spider: return {
            attack_damage: 3,
            health: 5,
            armor: 2,
            move_points: 2,
            attack: basic_attack(1),
            abilities: []
        };

        case Creep_Type.evil_eye: return {
            attack_damage: 2,
            health: 4,
            move_points: 3,
            attack: basic_attack(4)
        };

        case Creep_Type.ember_fire_remnant: return {
            attack_damage: 0,
            health: 1,
            move_points: 0
        };
    }
}