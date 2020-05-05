type Spell_Discriminator = {
    type: Card_Type,
    spell_type: Spell_Type
    spell_id: Spell_Id
}

type Spell_Stats<T extends Card_Spell_Definition> = Pick<T, Exclude<keyof T, keyof Spell_Discriminator>>

declare function spell<T extends Card_Spell_Definition>(stats: Spell_Stats<T>): T;

function spell_definition_by_id(spell_id: Spell_Id): Card_Spell_Definition {
    switch (spell_id) {
        case Spell_Id.buyback: {
            return spell<Spell_Buyback>({
                targeting_flags: [
                    Spell_Unit_Targeting_Flag.dead,
                    Spell_Unit_Targeting_Flag.allies,
                    Spell_Unit_Targeting_Flag.heroes
                ]
            })
        }

        case Spell_Id.town_portal_scroll: {
            return spell<Spell_Town_Portal_Scroll>({
                targeting_flags: [ Spell_Unit_Targeting_Flag.allies, Spell_Unit_Targeting_Flag.heroes ]
            })
        }

        case Spell_Id.euls_scepter: {
            return spell<Spell_Euls_Scepter>({
                targeting_flags: []
            });
        }

        case Spell_Id.mekansm: {
            return spell<Spell_Mekansm>({
                heal: 5
            })
        }

        case Spell_Id.buckler: {
            return spell<Spell_Buckler>({
                armor: 2,
                duration: 3
            })
        }

        case Spell_Id.drums_of_endurance: {
            return spell<Spell_Drums_Of_Endurance>({
                move_points_bonus: 2
            })
        }

        case Spell_Id.pocket_tower: {
            return spell<Spell_Pocket_Tower>({
                targeting: {
                    type: Spell_Ground_Targeting_Type.single_cell
                }
            })
        }

        case Spell_Id.call_to_arms: {
            return spell<Spell_Call_To_Arms>({
                creeps_to_summon: 2
            })
        }

        case Spell_Id.refresher_orb: {
            return spell<Spell_Refresher_Orb>({
                targeting_flags: [ Spell_Unit_Targeting_Flag.heroes ]
            })
        }

        case Spell_Id.quicksand: {
            return spell<Spell_Quicksand>({
                targeting: {
                    type: Spell_Ground_Targeting_Type.rectangle,
                    area_radius: 1
                }
            })
        }
    }
}
