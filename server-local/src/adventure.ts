const enum Adventure_Creep_State {
    sit,
    get_up,
    stand,
    sit_down
}

type Adventure_Entity_Base = {
    id: Adventure_Entity_Id
    spawn_position: XY
    spawn_facing: XY
    definition: Adventure_Entity_Definition
}

type Materialize<T extends { type: Adventure_Entity_Type }> = Adventure_Entity_Base & Dead_Or_Alive<T>

type Dead_Or_Alive<T extends { type: Adventure_Entity_Type }> = (T & { alive: true }) | {
    type: T["type"]
    alive: false
}

type Adventure_Materialized_Enemy = Materialize<{
    type: Adventure_Entity_Type.enemy
    handle: CDOTA_BaseNPC
    npc_type: Npc_Type
    has_noticed_player: boolean
    noticed_particle?: FX
    issued_movement_order_at: number
    noticed_player_at: number
}>;

type Adventure_Materialized_Lost_Creep = Materialize<{
    type: Adventure_Entity_Type.lost_creep
    handle: CDOTA_BaseNPC
    state: Adventure_Creep_State
    state_entered_at: number
}>;

type Adventure_Materialized_Entity = Adventure_Materialized_Enemy | Adventure_Materialized_Lost_Creep;

type Adventure_State = {
    entities: Adventure_Materialized_Entity[]
    current_right_click_target?: Adventure_Materialized_Entity
    ongoing_adventure_id: Ongoing_Adventure_Id
    num_party_slots: number
}

function create_adventure_entity(entity: Adventure_Entity): Adventure_Materialized_Entity {
    const data = entity.definition;
    const base = {
        id: entity.id,
        spawn_facing: data.spawn_facing,
        spawn_position: data.spawn_position,
        definition: entity.definition
    };

    function transfer_editor_data(unit: CDOTA_BaseNPC) {
        unit.AddNewModifier(unit, undefined, "Modifier_Editor_Adventure_Entity_Id",  {}).SetStackCount(entity.id);
        unit.AddNewModifier(unit, undefined, "Modifier_Editor_Adventure_Entity_Type",  {}).SetStackCount(entity.definition.type);
    }

    switch (data.type) {
        case Adventure_Entity_Type.enemy: {
            if (!entity.alive) {
                return {
                    ...base,
                    type: data.type,
                    alive: false
                }
            }

            const definition = get_npc_definition(data.npc_type);
            const unit = create_map_unit_with_model(data.spawn_position, data.spawn_facing, definition.model, definition.scale);

            if (IsInToolsMode()) {
                unit.AddNewModifier(unit, undefined, "Modifier_Editor_Npc_Type",  {}).SetStackCount(data.npc_type);

                transfer_editor_data(unit);
            }

            return {
                ...base,
                type: Adventure_Entity_Type.enemy,
                alive: true,
                handle: unit,
                npc_type: data.npc_type,
                has_noticed_player: false,
                noticed_particle: undefined,
                issued_movement_order_at: 0,
                noticed_player_at: 0
            }
        }

        case Adventure_Entity_Type.lost_creep: {
            if (!entity.alive) {
                return {
                    ...base,
                    type: data.type,
                    alive: false
                }
            }

            const [model, scale] = creep_type_to_model_and_scale(Creep_Type.lane_creep);
            const unit = create_map_unit_with_model(data.spawn_position, data.spawn_facing, model, scale);

            if (IsInToolsMode()) {
                transfer_editor_data(unit);
            }

            return {
                ...base,
                alive: true,
                type: Adventure_Entity_Type.lost_creep,
                handle: unit,
                state: Adventure_Creep_State.stand,
                state_entered_at: GameRules.GetGameTime()
            }
        }
    }
}

function update_adventure_enemy(game: Game, enemy: Adventure_Materialized_Enemy) {
    if (!enemy.alive) return;

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

function update_lost_creep(game: Game, creep: Adventure_Materialized_Lost_Creep) {
    if (!creep.alive) return;

    const player_handle = game.player.hero_unit;
    const spawn_location = Vector(creep.spawn_position.x, creep.spawn_position.y);
    const spawn_facing = Vector(creep.spawn_facing.x, creep.spawn_facing.y);
    const player_location = player_handle.GetAbsOrigin();
    const player_can_see_creep = player_handle.CanEntityBeSeenByMyTeam(creep.handle);
    const from_creep_to_player = (spawn_location - player_location as Vector).Length2D();
    const now = GameRules.GetGameTime();

    const state_animation: Record<Adventure_Creep_State, GameActivity_t> = {
        [Adventure_Creep_State.get_up]: GameActivity_t.ACT_DOTA_RELAX_END,
        [Adventure_Creep_State.sit]: GameActivity_t.ACT_DOTA_RELAX_LOOP,
        [Adventure_Creep_State.sit_down]: GameActivity_t.ACT_DOTA_RELAX_START,
        [Adventure_Creep_State.stand]: GameActivity_t.ACT_DOTA_IDLE
    };

    const set_state = (state: Adventure_Creep_State) => {
        creep.handle.FadeGesture(state_animation[creep.state]);
        creep.handle.StartGesture(state_animation[state]);
        creep.state = state;
        creep.state_entered_at = now;
    };

    const should_stand = player_can_see_creep && from_creep_to_player <= 450;

    switch (creep.state) {
        case Adventure_Creep_State.sit_down: {
            if (now - creep.state_entered_at >= 0.5) {
                set_state(Adventure_Creep_State.sit);
            }

            creep.handle.FaceTowards(spawn_location + spawn_facing as Vector);

            break;
        }

        case Adventure_Creep_State.get_up: {
            if (now - creep.state_entered_at >= 0.7) {
                set_state(Adventure_Creep_State.stand);
            }

            creep.handle.FaceTowards(player_location);

            break;
        }

        case Adventure_Creep_State.sit: {
            if (should_stand) {
                set_state(Adventure_Creep_State.get_up);
            }

            break;
        }

        case Adventure_Creep_State.stand: {
            if (!should_stand) {
                set_state(Adventure_Creep_State.sit_down);
            } else {
                creep.handle.FaceTowards(player_location);
            }

            break;
        }
    }
}
function process_player_adventure_order(game: Game, order: ExecuteOrderEvent): boolean {
    function try_find_entity_by_unit<T extends Entity_With_Movement>(query: CBaseEntity): Adventure_Materialized_Entity | undefined {
        return array_find(game.adventure.entities, entity => entity.alive && entity.handle == query);
    }

    for (let index in order.units) {
        if (order.units[index] == game.player.hero_unit.entindex()) {
            game.adventure.current_right_click_target = undefined;

            if (order.order_type == DotaUnitOrder_t.DOTA_UNIT_ORDER_MOVE_TO_POSITION) {
                game.player.current_order_x = order.position_x;
                game.player.current_order_y = order.position_y;
            } else if (order.order_type == DotaUnitOrder_t.DOTA_UNIT_ORDER_ATTACK_TARGET) {
                const clicked_entity = try_find_entity_by_unit(EntIndexToHScript(order.entindex_target));

                if (clicked_entity) {
                    game.adventure.current_right_click_target = clicked_entity;
                }
            } else {
                return false;
            }

            break;
        }
    }

    return true;
}

function adventure_update_loop(game: Game) {
    while (true) {
        wait_until(() => game.state == Player_State.on_adventure);

        const right_click_target = game.adventure.current_right_click_target;
        if (right_click_target && right_click_target.alive) {
            const delta = right_click_target.handle.GetAbsOrigin() - game.player.hero_unit.GetAbsOrigin() as Vector;

            if (!game.player.hero_unit.IsMoving() && delta.Length2D() <= 300) {
                game.adventure.current_right_click_target = undefined;

                // In case hero is already close to the target we stop them so camera doesn't move behind the popup
                game.player.hero_unit.Stop();
                game.player.hero_unit.FaceTowards(right_click_target.handle.GetAbsOrigin());

                const event: Adventure_Popup_Event = {
                    entity_id: right_click_target.id,
                    entity: right_click_target.definition
                };

                CustomGameEventManager.Send_ServerToAllClients("show_adventure_popup", event);
            }
        }

        for (const entity of game.adventure.entities) {
            if (!entity.alive) continue;
            switch (entity.type) {

                case Adventure_Entity_Type.enemy: {
                    update_adventure_enemy(game, entity);
                    break;
                }

                case Adventure_Entity_Type.lost_creep: {
                    update_lost_creep(game, entity);
                    break;
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

function adventure_interact_with_entity(game: Game, entity_id: Adventure_Entity_Id, last_change_index: number) {
    const entity_index = array_find_index(game.adventure.entities, entity => entity.id == entity_id);
    if (entity_index == -1) return;

    const entity = game.adventure.entities[entity_index];
    if (!entity.alive) return;

    const state_update = api_request(Api_Request_Type.interact_with_adventure_entity, {
        target_entity_id: entity_id,
        access_token: game.token,
        dedicated_server_key: get_dedicated_server_key(),
        starting_change_index: last_change_index
    });

    if (state_update) {
        cleanup_adventure_entity(entity);

        game.adventure.entities[entity_index] = create_adventure_entity({
            ...state_update.updated_entity,
            definition: entity.definition
        });

        const event: Adventure_Receive_Party_Changes_Event = {
            changes: state_update.party_updates,
            last_change_index: last_change_index
        };

        CustomGameEventManager.Send_ServerToAllClients("receive_party_changes", event);

    }
}

function cleanup_adventure_entity(entity: Adventure_Materialized_Entity) {
    if (!entity.alive) return;

    switch (entity.type) {
        case Adventure_Entity_Type.lost_creep: {
            entity.handle.RemoveSelf();

            break;
        }

        case Adventure_Entity_Type.enemy: {
            entity.handle.RemoveSelf();

            if (entity.noticed_particle) {
                entity.noticed_particle.destroy_and_release(true);
            }

            break;
        }
    }
}

function cleanup_adventure(adventure: Adventure_State) {
    for (const entity of adventure.entities) {
        cleanup_adventure_entity(entity);
    }

    adventure.entities = [];
}