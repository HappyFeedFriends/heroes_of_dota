type Active_Ability_Stats<T extends Ability_Definition_Active> = Pick<T, keyof Ability_Definition_Active_Base> & { targeting: T["targeting"] };
type Passive_Ability_Stats<T extends Ability_Definition_Passive> = Pick<T, keyof Ability_Definition_Passive_Base>;

declare function active_ability<T extends Ability_Definition_Active>(stats: Active_Ability_Stats<T>): Ability_Definition;
declare function passive_ability<T extends Ability_Definition_Passive>(stats: Passive_Ability_Stats<T>): Ability_Definition;

function unit_definition_by_type(type: Unit_Type): Unit_Definition {
    function target_line(length: number): Ability_Targeting_Line {
        return {
            type: Ability_Targeting_Type.line,
            line_length: length,
            stop_at_first_obstacle_hit: false
        }
    }

    function target_unit_in_manhattan_distance(distance: number): Ability_Targeting_Unit_In_Manhattan_Distance {
        return {
            type: Ability_Targeting_Type.unit_in_manhattan_distance,
            distance: distance
        }
    }

    function target_rect_area_around_caster(area_radius: number): Ability_Targeting_Rectangular_Area_Around_Caster {
        return {
            type: Ability_Targeting_Type.rectangular_area_around_caster,
            area_radius: area_radius
        }
    }

    switch (type) {
        case Unit_Type.ursa: {
            return {
                health: 30,
                mana: 10,
                move_points: 4,
                attack_damage: 6,
                attack_range: 1,
                abilities: [
                ]
            }
        }

        case Unit_Type.sniper: {
            return {
                health: 24,
                mana: 10,
                move_points: 3,
                attack_damage: 5,
                attack_range: 4,
                abilities: [
                ]
            }
        }

        case Unit_Type.pudge: {
            return {
                health: 35,
                mana: 10,
                move_points: 2,
                attack_damage: 7,
                attack_range: 1,
                abilities: [
                    active_ability<Ability_Pudge_Hook>({
                        available_since_level: 1,
                        targeting: target_line(5),
                        cooldown: 2,
                        mana_cost: 3
                    }),
                    active_ability<Ability_Pudge_Rot>({
                        available_since_level: 2,
                        targeting: target_rect_area_around_caster(1),
                        cooldown: 1,
                        mana_cost: 1
                    }),
                    passive_ability<Ability_Pudge_Flesh_Heap>({
                        available_since_level: 3,
                    }),
                    active_ability<Ability_Pudge_Dismember>({
                        available_since_level: 4,
                        targeting: target_unit_in_manhattan_distance(1),
                        cooldown: 2,
                        mana_cost: 4
                    })
                ]
            }
        }

        default: return unreachable(type);
    }
}