type Adventure_Entity_Base = {
    id: Adventure_Entity_Id
    spawn_position: XY
    spawn_facing: XY
}

type Adventure_Materialized_Entity = Adventure_Entity_Base & ({
    type: Adventure_Entity_Type.enemy
    unit: CDOTA_BaseNPC
    npc_type: Npc_Type
} | {
    type: Adventure_Entity_Type.lost_creep
    id: Adventure_Entity_Id
    unit: CDOTA_BaseNPC
})

type Adventure_State = {
    entities: Adventure_Materialized_Entity[]
}

function create_adventure_entity(entity: Adventure_Entity): Adventure_Materialized_Entity {
    const data = entity.definition;
    const base = {
        id: entity.id,
        spawn_facing: data.spawn_facing,
        spawn_position: data.spawn_position
    };

    switch (data.type) {
        case Adventure_Entity_Type.enemy: {
            const [model, scale] = get_npc_model(data.npc_type);
            const unit = create_unit_with_model(data.spawn_position, data.spawn_facing, model, scale);

            if (IsInToolsMode()) {
                unit.AddNewModifier(unit, undefined, "Modifier_Editor_Npc_Type",  {}).SetStackCount(data.npc_type);
            }

            return {
                ...base,
                type: Adventure_Entity_Type.enemy,
                unit: unit,
                npc_type: data.npc_type
            }
        }

        case Adventure_Entity_Type.lost_creep: {
            const [model, scale] = minion_type_to_model_and_scale(Minion_Type.lane_minion);

            return {
                ...base,
                type: Adventure_Entity_Type.lost_creep,
                unit: create_unit_with_model(data.spawn_position, data.spawn_facing, model, scale)
            }
        }
    }
}

function adventure_enemy_movement_loop(game: Game) {
    while (true) {
        wait_until(() => game.state == Player_State.on_adventure);

        for (const enemy of game.adventure.entities) {
            if (enemy.type != Adventure_Entity_Type.enemy) continue;

            const enemy_handle = enemy.unit;

            const enemy_spawn_location = Vector(enemy.spawn_position.x, enemy.spawn_position.y);
            const enemy_actual_location = enemy_handle.GetAbsOrigin();
            const player_location = game.player.hero_unit.GetAbsOrigin();
            const player_can_see_enemy = game.player.hero_unit.CanEntityBeSeenByMyTeam(enemy_handle);
            const distance_to_player = (enemy_spawn_location - player_location as Vector).Length2D();

            if (distance_to_player <= 500 && player_can_see_enemy) {
                enemy_handle.MoveToPosition(player_location);

                wait(0.1);
            } else {
                if ((enemy_actual_location - enemy_spawn_location as Vector).Length2D() >= 32) {
                    enemy_handle.MoveToPosition(enemy_spawn_location);
                    wait(0.1);
                } else {
                    const desired_facing = Vector(enemy.spawn_facing.x, enemy.spawn_facing.y);
                    const actual_facing = enemy_handle.GetForwardVector();

                    if (desired_facing.Dot(actual_facing) < 0.95) {
                        enemy_handle.FaceTowards(enemy_actual_location + Vector(enemy.spawn_facing.x, enemy.spawn_facing.y) as Vector);
                    }
                }
            }
        }

        wait_one_frame();
    }
}

function cleanup_adventure_entity(entity: Adventure_Materialized_Entity) {
    entity.unit.RemoveSelf();
}

function cleanup_adventure(adventure: Adventure_State) {
    for (const entity of adventure.entities) {
        cleanup_adventure_entity(entity);
    }

    adventure.entities = [];
}