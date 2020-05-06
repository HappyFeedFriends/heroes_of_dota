type Find_By_Spell_Id<Union, Type> = Union extends { spell_id: Type } ? Union : never;

type Spell_Base_Return<T> = {
    type: Find_By_Spell_Id<Card_Spell_Definition, T>["type"]
    spell_type: Find_By_Spell_Id<Card_Spell_Definition, T>["spell_type"]
    spell_id: T
};

function spell_base<T extends Spell_Id>(id: T): Spell_Base_Return<T> {
    const spells = type_of<Card_Spell_Definition>();
    if (spells.kind != Type_Kind.union) {
        throw "Card_Spell_Definition expected to be a union";
    }

    const member = find_member_of_union_by_tag(spells, "spell_id", id);
    if (!member.ok) {
        throw "Unable to find spell by spell_id " + id;
    }

    const type_type = find_object_member_type_by_name(member.data, "type");
    const spell_type_type = find_object_member_type_by_name(member.data, "spell_type");

    if (!type_type || type_type.kind != Type_Kind.enum_member) {
        throw "Card_Spell_Definition.type not found or not supported (" + type_type + ")"
    }

    if (!spell_type_type || spell_type_type.kind != Type_Kind.enum_member) {
        throw "Card_Spell_Definition.spell_type not found or not supported (" + type_type + ")"
    }

    const type_value = type_type.type;
    const spell_type_value = spell_type_type.type;
    if (type_value.kind != Type_Kind.number_literal) throw "Unsupported value kind (" + type_value.kind + ")";
    if (spell_type_value.kind != Type_Kind.number_literal) throw "Unsupported value kind (" + spell_type_value.kind + ")";

    return {
        type: type_value.value,
        spell_type: spell_type_value.value,
        spell_id: id
    } as any as Spell_Base_Return<T>
}

function spell_definition_by_id(spell_id: Spell_Id): Card_Spell_Definition {
    switch (spell_id) {
        case Spell_Id.buyback: return {
            ...spell_base(Spell_Id.buyback),
            targeting_flags: [
                Spell_Unit_Targeting_Flag.dead,
                Spell_Unit_Targeting_Flag.allies,
                Spell_Unit_Targeting_Flag.heroes
            ]
        };

        case Spell_Id.town_portal_scroll: return {
            ...spell_base(Spell_Id.town_portal_scroll),
            targeting_flags: [Spell_Unit_Targeting_Flag.allies, Spell_Unit_Targeting_Flag.heroes]
        };

        case Spell_Id.euls_scepter: return {
            ...spell_base(Spell_Id.euls_scepter),
            targeting_flags: []
        };

        case Spell_Id.mekansm: return {
            ...spell_base(Spell_Id.mekansm),
            heal: 5
        };

        case Spell_Id.buckler: return {
            ...spell_base(Spell_Id.buckler),
            armor: 2,
            duration: 3
        };

        case Spell_Id.drums_of_endurance: return {
            ...spell_base(Spell_Id.drums_of_endurance),
            move_points_bonus: 2
        };

        case Spell_Id.pocket_tower: return {
            ...spell_base(Spell_Id.pocket_tower),
            targeting: {
                type: Spell_Ground_Targeting_Type.single_cell
            }
        };

        case Spell_Id.call_to_arms: return {
            ...spell_base(Spell_Id.call_to_arms),
            creeps_to_summon: 2
        };

        case Spell_Id.refresher_orb: return {
            ...spell_base(Spell_Id.refresher_orb),
            targeting_flags: [Spell_Unit_Targeting_Flag.heroes]
        };

        case Spell_Id.quicksand: return {
            ...spell_base(Spell_Id.quicksand),
            targeting: {
                type: Spell_Ground_Targeting_Type.rectangle,
                area_radius: 1
            }
        };

        case Spell_Id.moonlight_shadow: return {
            ...spell_base(Spell_Id.moonlight_shadow),
            modifier: {id: Modifier_Id.spell_moonlight_shadow}
        };
    }
}
