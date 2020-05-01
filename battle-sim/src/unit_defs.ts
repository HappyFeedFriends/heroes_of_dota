type Ability_Active_Discriminator = {
    id: Ability_Id,
    type: Ability_Type,
}

type Ability_Passive_Discriminator = {
    id: Ability_Id,
    type: Ability_Type,
}

type Active_Ability_Stats<T extends Ability_Definition_Active> = Pick<T, Exclude<keyof T, keyof Ability_Active_Discriminator>>
type Passive_Ability_Stats<T extends Ability_Definition_Passive> = Pick<T, Exclude<keyof T, keyof Ability_Passive_Discriminator>>;

declare function active_ability<T extends Ability_Definition_Active>(stats: Active_Ability_Stats<T>): T;
declare function passive_ability<T extends Ability_Definition_Passive>(stats: Passive_Ability_Stats<T>): T;

// That works instead of active/passive ability and allows us to collapse many types
// declare function ability<T extends Ability_Id>(id: T, stats: Omit<Find_By_Id<Ability_Definition, T>, keyof Ability_Active_Discriminator>): Find_By_Id<Ability_Definition, T>;

function target_line(length: number, selector: Ability_Area_Selector = single_target()) {
    return {
        type: Ability_Targeting_Type.line,
        line_length: length,
        selector: selector,
        flags: {
            [Ability_Targeting_Flag.include_caster]: false,
            [Ability_Targeting_Flag.only_free_cells]: false
        }
    } as const;
}

function target_first_in_line(length: number, selector: Ability_Area_Selector = single_target()) {
    return {
        type: Ability_Targeting_Type.first_in_line,
        line_length: length,
        selector: selector,
        flags: {
            [Ability_Targeting_Flag.include_caster]: false,
            [Ability_Targeting_Flag.only_free_cells]: false
        }
    } as const
}

function single_target(): Ability_Area_Selector {
    return {
        type: Ability_Target_Selector_Type.single_target
    }
}

function select_in_rectangle(radius: number): Ability_Area_Selector {
    return {
        type: Ability_Target_Selector_Type.rectangle,
        area_radius: radius
    }
}

function select_in_line(length: number): Ability_Area_Selector {
    return {
        type: Ability_Target_Selector_Type.line,
        length: length
    }
}

function target_in_manhattan_distance(distance: number, selector: Ability_Area_Selector = single_target(), ...flags: Ability_Targeting_Flag[]): Ability_Targeting {
    const result_flags: Ability_Targeting_Flag_Field = {
        [Ability_Targeting_Flag.include_caster]: false,
        [Ability_Targeting_Flag.only_free_cells]: false
    };

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
        flags: {
            [Ability_Targeting_Flag.include_caster]: false,
            [Ability_Targeting_Flag.only_free_cells]: false
        }
    }
}

function basic_attack(range: number): Ability_Basic_Attack {
    return active_ability<Ability_Basic_Attack>({
        available_since_level: 0,
        targeting: target_first_in_line(range),
        charges: 1
    });
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
                active_ability<Ability_Pudge_Hook>({
                    available_since_level: 1,
                    targeting: target_first_in_line(5),
                    charges: 1,
                    damage: 3
                }),
                active_ability<Ability_Pudge_Rot>({
                    available_since_level: 2,
                    targeting: target_rect_area_around_caster(1),
                    charges: 1,
                    damage: 5
                }),
                active_ability<Ability_Pudge_Dismember>({
                    available_since_level: 3,
                    targeting: target_in_manhattan_distance(1),
                    charges: 1,
                    damage: 10
                })
            ]
        };

        case Hero_Type.tidehunter: return {
            health: 16,
            move_points: 2,
            attack_damage: 5,
            attack: basic_attack(1),
            abilities: [
                active_ability<Ability_Tide_Gush>({
                    available_since_level: 1,
                    targeting: target_in_manhattan_distance(5),
                    charges: 1,
                    damage: 3,
                    move_points_reduction: 2
                }),
                active_ability<Ability_Tide_Anchor_Smash>({
                    available_since_level: 2,
                    targeting: target_rect_area_around_caster(1),
                    charges: 2,
                    damage: 4,
                    attack_reduction: 2
                }),
                active_ability<Ability_Tide_Ravage>({
                    available_since_level: 3,
                    targeting: target_in_manhattan_distance(5),
                    damage: 5,
                    charges: 1,
                })
            ]
        };

        case Hero_Type.luna: return {
            health: 12,
            move_points: 4,
            attack_damage: 4,
            attack: basic_attack(2),
            abilities: [
                active_ability<Ability_Luna_Lucent_Beam>({
                    available_since_level: 1,
                    targeting: target_in_manhattan_distance(5),
                    charges: 1,
                    damage: 4
                }),
                passive_ability<Ability_Luna_Moon_Glaive>({
                    available_since_level: 2,
                    secondary_targeting: target_rect_area_around_caster(2)
                }),
                active_ability<Ability_Luna_Eclipse>({
                    available_since_level: 3,
                    targeting: target_rect_area_around_caster(3),
                    total_beams: 14,
                    charges: 1,
                })
            ]
        };

        case Hero_Type.skywrath_mage: return {
            health: 10,
            move_points: 3,
            attack_damage: 3,
            attack: basic_attack(3),
            abilities: [
                active_ability<Ability_Skywrath_Ancient_Seal>({
                    available_since_level: 1,
                    targeting: target_in_manhattan_distance(3),
                    charges: 1,
                    duration: 3
                }),
                active_ability<Ability_Skywrath_Concussive_Shot>({
                    available_since_level: 2,
                    targeting: target_rect_area_around_caster(3),
                    charges: 1,
                    move_points_reduction: 2,
                    damage: 4,
                    duration: 2
                }),
                active_ability<Ability_Skywrath_Mystic_Flare>({
                    available_since_level: 3,
                    targeting: target_in_manhattan_distance(5, select_in_rectangle(1), Ability_Targeting_Flag.include_caster),
                    charges: 1,
                    damage: 10
                })
            ]
        };

        case Hero_Type.dragon_knight: return {
            health: 14,
            move_points: 3,
            attack_damage: 4,
            attack: basic_attack(1),
            abilities: [
                active_ability<Ability_Dragon_Knight_Breathe_Fire>({
                    available_since_level: 1,
                    targeting: target_line(3, {
                        type: Ability_Target_Selector_Type.t_shape,
                        stem_length: 3,
                        arm_length: 2
                    }),
                    charges: 1,
                    damage: 5
                }),
                active_ability<Ability_Dragon_Knight_Dragon_Tail>({
                    available_since_level: 2,
                    targeting: target_in_manhattan_distance(1),
                    charges: 1,
                    damage: 3
                }),
                active_ability<Ability_Dragon_Knight_Elder_Dragon_Form>({
                    available_since_level: 3,
                    targeting: target_in_manhattan_distance(0),
                    charges: 1
                })
            ],
            ability_bench: [
                active_ability<Ability_Dragon_Knight_Elder_Dragon_Form_Attack>({
                    available_since_level: 0,
                    targeting: target_line(4, select_in_rectangle(1)),
                    charges: 1
                })
            ]
        };

        case Hero_Type.lion: return {
            health: 9,
            move_points: 3,
            attack_damage: 3,
            attack: basic_attack(3),
            abilities: [
                active_ability<Ability_Lion_Hex>({
                    available_since_level: 1,
                    targeting: target_in_manhattan_distance(3),
                    charges: 1,
                    duration: 2,
                    move_points_reduction: 1
                }),
                active_ability<Ability_Lion_Impale>({
                    available_since_level: 2,
                    targeting: target_line(3, select_in_line(3)),
                    charges: 1,
                    damage: 4
                }),
                active_ability<Ability_Lion_Finger_Of_Death>({
                    available_since_level: 3,
                    targeting: target_in_manhattan_distance(4),
                    charges: 1,
                    damage: 8
                })
            ]
        };

        case Hero_Type.mirana: return {
            health: 10,
            move_points: 3,
            attack_damage: 4,
            attack: basic_attack(3),
            abilities: [
                active_ability<Ability_Mirana_Starfall>({
                    available_since_level: 1,
                    targeting: target_rect_area_around_caster(2),
                    charges: 1,
                    damage: 3
                }),
                active_ability<Ability_Mirana_Arrow>({
                    available_since_level: 2,
                    targeting: target_first_in_line(7),
                    charges: 1
                }),
                active_ability<Ability_Mirana_Leap>({
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
                })
            ]
        };

        case Hero_Type.vengeful_spirit: return {
            health: 9,
            move_points: 3,
            attack_damage: 3,
            attack: basic_attack(3),
            abilities: [
                active_ability<Ability_Venge_Magic_Missile>({
                    available_since_level: 1,
                    targeting: target_in_manhattan_distance(3),
                    charges: 1,
                    damage: 3
                }),
                active_ability<Ability_Venge_Wave_Of_Terror>({
                    available_since_level: 2,
                    targeting: target_line(5, select_in_line(5)),
                    charges: 1,
                    damage: 3,
                    armor_reduction: 2,
                    duration: 2
                }),
                active_ability<Ability_Venge_Nether_Swap>({
                    available_since_level: 3,
                    targeting: target_in_manhattan_distance(65536),
                    charges: 1
                })
            ]
        };

        case Hero_Type.dark_seer: return {
            health: 11,
            move_points: 3,
            attack_damage: 4,
            attack: basic_attack(1),
            abilities: [
                active_ability<Ability_Dark_Seer_Ion_Shell>({
                    available_since_level: 1,
                    targeting: target_in_manhattan_distance(5, single_target(), Ability_Targeting_Flag.include_caster),
                    flags: [ Ability_Flag.does_not_consume_action ],
                    charges: 1,
                    damage_per_turn: 1,
                    duration: 5,
                    shield_targeting: target_rect_area_around_caster(1)
                }),
                active_ability<Ability_Dark_Seer_Surge>({
                    available_since_level: 2,
                    targeting: target_in_manhattan_distance(5, single_target(), Ability_Targeting_Flag.include_caster),
                    flags: [ Ability_Flag.does_not_consume_action ],
                    charges: 2,
                    move_points_bonus: 3
                }),
                active_ability<Ability_Dark_Seer_Vacuum>({
                    available_since_level: 3,
                    targeting: target_in_manhattan_distance(4, select_in_rectangle(2)),
                    flags: [ ],
                    charges: 1,
                }),
            ]
        };

        case Hero_Type.ember_spirit: return {
            health: 10,
            attack: basic_attack(1),
            attack_damage: 3,
            move_points: 3,
            abilities: [
                active_ability<Ability_Ember_Searing_Chains>({
                    available_since_level: 1,
                    targeting: target_rect_area_around_caster(2),
                    charges: 1,
                    targets: 2
                }),
                active_ability<Ability_Ember_Sleight_Of_Fist>({
                    available_since_level: 2,
                    targeting: target_rect_area_around_caster(2),
                    charges: 1
                }),
                active_ability<Ability_Ember_Fire_Remnant>({
                    available_since_level: 3,
                    targeting: target_in_manhattan_distance(7, single_target(), Ability_Targeting_Flag.only_free_cells),
                    charges: 1
                })
            ],
            ability_bench: [
                active_ability<Ability_Ember_Activate_Fire_Remnant>({
                    available_since_level: 3,
                    charges: 1,
                    targeting: target_in_manhattan_distance(0),
                    flags: [ Ability_Flag.does_not_consume_action ]
                })
            ]
        };

        case Hero_Type.earthshaker: return {
            health: 10,
            attack_damage: 3,
            move_points: 2,
            attack: basic_attack(1),
            abilities: [
                active_ability<Ability_Shaker_Fissure>({
                    available_since_level: 1,
                    charges: 1,
                    targeting: target_line(5, select_in_line(5))
                }),
                active_ability<Ability_Shaker_Enchant_Totem>({
                    available_since_level: 2,
                    charges: 1,
                    targeting: target_rect_area_around_caster(1),
                    flags: [ Ability_Flag.does_not_consume_action ]
                }),
                active_ability<Ability_Shaker_Echo_Slam>({
                    available_since_level: 3,
                    charges: 1,
                    targeting: target_rect_area_around_caster(2)
                })
            ]
        };

        case Hero_Type.venomancer: return {
            health: 8,
            attack_damage: 3,
            move_points: 3,
            attack: basic_attack(2),
            abilities: [
                {
                    id: Ability_Id.venomancer_plague_wards,
                    type: Ability_Type.target_ground,
                    targeting: target_in_manhattan_distance(4),
                    available_since_level: 1,
                    charges: 3
                },
                {
                    id: Ability_Id.venomancer_venomous_gale,
                    type: Ability_Type.target_ground,
                    targeting: target_line(4, select_in_line(4)),
                    available_since_level: 2,
                    charges: 1,
                    slow: 2,
                    poison_applied: 2
                },
                {
                    id: Ability_Id.venomancer_poison_nova,
                    type: Ability_Type.no_target,
                    targeting: target_rect_area_around_caster(2, select_in_rectangle(2)),
                    available_since_level: 3,
                    charges: 1
                }
            ]
        };

        case Hero_Type.bounty_hunter: return {
            health: 8,
            attack_damage: 3,
            move_points: 3,
            attack: basic_attack(2),
            abilities: []
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
                passive_ability<Ability_Pocket_Tower_Attack>({
                    available_since_level: 0,
                    targeting: target_rect_area_around_caster(2)
                }),
                passive_ability<Ability_Deployment_Zone>({
                    available_since_level: 0,
                    radius: 1
                }),
            ],
            intrinsic_modifiers: [{ id: Modifier_Id.rooted }]
        };

        case Creep_Type.veno_plague_ward: return {
            attack_damage: 1,
            health: 3,
            move_points: 0,
            abilities: [
                {
                    id: Ability_Id.plague_ward_attack,
                    type: Ability_Type.passive,
                    available_since_level: 0,
                    targeting: target_rect_area_around_caster(3)
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
                passive_ability<Ability_Monster_Lifesteal>({
                    available_since_level: 0
                }),
            ]
        };

        case Creep_Type.spider_matriarch: return {
            attack_damage: 2,
            health: 10,
            move_points: 2,
            attack: basic_attack(1),
            abilities: [
                passive_ability<Ability_Monster_Spawn_Spiderlings>({
                    available_since_level: 0,
                    how_many: 3
                })
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