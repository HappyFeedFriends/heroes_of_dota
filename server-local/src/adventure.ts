type Adventure_Entity_Base = {
    id: Adventure_Entity_Id
    spawn_position: XY
    spawn_facing: XY
}

type Adventure_Materialized_Entity = Adventure_Entity_Base & ({
    type: Adventure_Entity_Type.enemy
    handle: CDOTA_BaseNPC
    npc_type: Npc_Type
    has_noticed_player: boolean
    noticed_particle?: FX
    issued_movement_order_at: number
    noticed_player_at: number
} | {
    type: Adventure_Entity_Type.lost_creep
    id: Adventure_Entity_Id
    handle: CDOTA_BaseNPC
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
            const definition = get_npc_definition(data.npc_type);
            const unit = create_map_unit_with_model(data.spawn_position, data.spawn_facing, definition.model, definition.scale);

            if (IsInToolsMode()) {
                unit.AddNewModifier(unit, undefined, "Modifier_Editor_Npc_Type",  {}).SetStackCount(data.npc_type);
            }

            return {
                ...base,
                type: Adventure_Entity_Type.enemy,
                handle: unit,
                npc_type: data.npc_type,
                has_noticed_player: false,
                noticed_particle: undefined,
                issued_movement_order_at: 0,
                noticed_player_at: 0
            }
        }

        case Adventure_Entity_Type.lost_creep: {
            const [model, scale] = minion_type_to_model_and_scale(Minion_Type.lane_minion);

            return {
                ...base,
                type: Adventure_Entity_Type.lost_creep,
                handle: create_map_unit_with_model(data.spawn_position, data.spawn_facing, model, scale)
            }
        }
    }
}

function adventure_enemy_movement_loop(game: Game) {
    while (true) {
        wait_until(() => game.state == Player_State.on_adventure);

        for (const enemy of game.adventure.entities) {
            if (enemy.type != Adventure_Entity_Type.enemy) continue;

            const player_handle = game.player.hero_unit;
            const enemy_handle = enemy.handle;
            const enemy_spawn_location = Vector(enemy.spawn_position.x, enemy.spawn_position.y);
            const enemy_actual_location = enemy_handle.GetAbsOrigin();
            const player_location = player_handle.GetAbsOrigin();
            const player_can_see_enemy = player_handle.CanEntityBeSeenByMyTeam(enemy_handle);
            const from_spawn_to_player = (enemy_spawn_location - player_location as Vector).Length2D();
            const from_enemy_to_player = (enemy_actual_location - player_location as Vector).Length2D();
            const now = GameRules.GetGameTime();
            const sight_range = enemy.has_noticed_player ? 650 : 500;

            if (from_spawn_to_player <= sight_range && player_can_see_enemy) {
                if (!enemy.has_noticed_player) {
                    enemy.has_noticed_player = true;
                    enemy.noticed_particle = fx_by_unit("particles/map/msg_noticed.vpcf", enemy).follow_unit_overhead(0, enemy);
                    enemy.noticed_player_at = now;

                    enemy_handle.EmitSound(get_npc_definition(enemy.npc_type).notice_sound);
                }

                if (from_enemy_to_player <= 96) {
                    lock_state_transition(() => {
                        enemy_handle.Stop();

                        const stun = player_handle.AddNewModifier(player_handle, undefined, "modifier_stunned", {});
                        const animation = fork(() => {
                            enemy_handle.EmitSound(get_npc_definition(enemy.npc_type).attack_sound);
                            enemy_handle.StartGestureWithPlaybackRate(GameActivity_t.ACT_DOTA_ATTACK, 1);
                            wait(0.6);
                            enemy_handle.EmitSound(get_npc_definition(enemy.npc_type).hit_sound);
                            wait(0.5);
                            enemy_handle.FadeGesture(GameActivity_t.ACT_DOTA_ATTACK);
                        });

                        const new_state = api_request(Api_Request_Type.start_adventure_enemy_fight, {
                            enemy_entity_id: enemy.id,
                            access_token: game.token,
                            dedicated_server_key: get_dedicated_server_key()
                        });

                        if (new_state) {
                            wait_for_all_forks([ animation ]);

                            try_submit_state_transition(game, new_state);
                        }

                        stun.Destroy();
                    });
                } else if (now - enemy.issued_movement_order_at > 0.1) {
                    if (now - enemy.noticed_player_at > 0.25) {
                        enemy_handle.MoveToPosition(player_location);
                    } else {
                        enemy_handle.FaceTowards(player_location);
                    }

                    enemy.issued_movement_order_at = now;
                }
            } else {
                enemy.has_noticed_player = false;

                if (enemy.noticed_particle) {
                    enemy.noticed_particle.destroy_and_release(false);
                    enemy.noticed_particle = undefined;
                }

                if ((enemy_actual_location - enemy_spawn_location as Vector).Length2D() >= 32) {
                    if (now - enemy.issued_movement_order_at > 0.1) {
                        enemy_handle.MoveToPosition(enemy_spawn_location);

                        enemy.issued_movement_order_at = now;
                    }
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

function submit_adventure_movement_loop(game: Game) {
    while (true) {
        wait_until(() => game.state == Player_State.on_adventure);
        wait(0.7);

        const request = {
            ...get_player_movement(game.player),
            access_token: game.token,
            dedicated_server_key: get_dedicated_server_key()
        };

        api_request_with_retry_on_403(Api_Request_Type.submit_adventure_player_movement, game, request);
    }
}

function cleanup_adventure_entity(entity: Adventure_Materialized_Entity) {
    entity.handle.RemoveSelf();

    if (entity.type == Adventure_Entity_Type.enemy && entity.noticed_particle) {
        entity.noticed_particle.destroy_and_release(true);
    }
}

function cleanup_adventure(adventure: Adventure_State) {
    for (const entity of adventure.entities) {
        cleanup_adventure_entity(entity);
    }

    adventure.entities = [];
}