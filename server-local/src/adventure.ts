const enum Adventure_Creep_State {
    sit,
    get_up,
    stand,
    sit_down
}

type Adventure_World_Entity_Base = {
    base: Adventure_Entity
}

type Adventure_World_Enemy = Adventure_World_Entity_Base & { type: Adventure_Entity_Type.enemy } & ({
    alive: true
    handle: CDOTA_BaseNPC
    npc_type: Npc_Type
    has_noticed_player: boolean
    noticed_particle?: FX
    issued_movement_order_at: number
    noticed_player_at: number
} | {
    alive: false
})

type Adventure_World_Lost_Creep = Adventure_World_Entity_Base & { type: Adventure_Entity_Type.lost_creep } & ({
    alive: true
    handle: CDOTA_BaseNPC
    state: Adventure_Creep_State
    state_entered_at: number
} | {
    alive: false
})

type Adventure_World_Shrine = Adventure_World_Entity_Base & { type: Adventure_Entity_Type.shrine } & ({
    alive: true
    handle: CDOTA_BaseNPC
    obstruction: CBaseEntity
    ambient_fx: FX
} | {
    alive: false
    handle: CDOTA_BaseNPC
    obstruction: CBaseEntity
})

type Adventure_World_Item_On_The_Ground = Adventure_World_Entity_Base & { type: Adventure_Entity_Type.item_on_the_ground } & ({
    alive: true
    handle: CDOTA_BaseNPC
} | {
    alive: false
})

type Adventure_World_Gold_Bag = Adventure_World_Entity_Base & { type: Adventure_Entity_Type.gold_bag } & ({
    alive: true
    handle: CDOTA_BaseNPC
} | {
    alive: false
})

type Adventure_World_Merchant = Adventure_World_Entity_Base & { type: Adventure_Entity_Type.merchant } & ({
    handle: CDOTA_BaseNPC
    started_waving_at: number
    just_saw_player: boolean
})

type Adventure_World_Entity =
    Adventure_World_Enemy |
    Adventure_World_Lost_Creep |
    Adventure_World_Shrine |
    Adventure_World_Item_On_The_Ground |
    Adventure_World_Gold_Bag |
    Adventure_World_Merchant

type Adventure_State = {
    entities: Adventure_World_Entity[]
    current_right_click_target?: Adventure_World_Entity
    ongoing_adventure_id: Ongoing_Adventure_Id
    num_party_slots: number
}

function adventure_wearable_item_id_to_model(id: Adventure_Wearable_Item_Id): string {
    switch (id) {
        case Adventure_Wearable_Item_Id.divine_rapier: return "models/props_gameplay/divine_rapier.vmdl";
        case Adventure_Wearable_Item_Id.boots_of_speed: return "models/props_gameplay/boots_of_speed.vmdl";
        case Adventure_Wearable_Item_Id.iron_branch: return "models/props_gameplay/branch.vmdl";
    }

    return "models/props_gameplay/neutral_box.vmdl";
}

function adventure_consumable_item_id_to_model(id: Adventure_Consumable_Item_Id): string {
    switch (id) {
        case Adventure_Consumable_Item_Id.healing_salve: return "models/props_gameplay/salve.vmdl";
        case Adventure_Consumable_Item_Id.enchanted_mango: return "models/props_gameplay/mango.vmdl";
    }

    return "models/props_gameplay/neutral_box.vmdl";
}

function adventure_item_to_model(item: Adventure_Item) {
    switch (item.type) {
        case Adventure_Item_Type.wearable: return adventure_wearable_item_id_to_model(item.item_id);
        case Adventure_Item_Type.consumable: return adventure_consumable_item_id_to_model(item.item_id);
    }
}

function create_adventure_entity(entity: Adventure_Entity): Adventure_World_Entity {
    const base = {
        id: entity.id,
        base: entity
    } as const;

    function create_adventure_unit(model: string, scale: number) {
        return create_map_unit_with_model(entity.spawn_position, entity.spawn_facing, model, scale);
    }

    switch (entity.type) {
        case Adventure_Entity_Type.enemy: {
            if (!entity.alive) return { ...base, type: entity.type, alive: false };

            const definition = get_npc_definition(entity.npc_type);
            const unit = create_adventure_unit(definition.model, definition.scale);

            return {
                ...base,
                type: entity.type,
                alive: true,
                handle: unit,
                npc_type: entity.npc_type,
                has_noticed_player: false,
                noticed_particle: undefined,
                issued_movement_order_at: 0,
                noticed_player_at: 0
            }
        }

        case Adventure_Entity_Type.item_on_the_ground: {
            if (!entity.alive) return { ...base, type: entity.type, alive: false };

            const model = adventure_item_to_model(entity.item);
            const unit = create_adventure_unit(model, 1.0);

            return {
                ...base,
                type: entity.type,
                alive: true,
                handle: unit
            };
        }

        case Adventure_Entity_Type.gold_bag: {
            if (!entity.alive) return { ...base, type: entity.type, alive: false };

            const unit = create_adventure_unit("models/props_gameplay/gold_bag.vmdl", 1.0);

            return {
                ...base,
                type: entity.type,
                alive: true,
                handle: unit
            };
        }

        case Adventure_Entity_Type.lost_creep: {
            if (!entity.alive) return { ...base, type: entity.type, alive: false };

            const [model, scale] = creep_type_to_model_and_scale(Creep_Type.lane_creep);
            const unit = create_adventure_unit(model, scale);

            return {
                ...base,
                type: entity.type,
                alive: true,
                handle: unit,
                state: Adventure_Creep_State.stand,
                state_entered_at: GameRules.GetGameTime()
            }
        }

        case Adventure_Entity_Type.merchant: {
            function merchant_model_path(model: Adventure_Merchant_Model): string {
                switch (model) {
                    case Adventure_Merchant_Model.normal: return "models/heroes/shopkeeper/shopkeeper.vmdl";
                    case Adventure_Merchant_Model.dire: return "models/heroes/shopkeeper_dire/shopkeeper_dire.vmdl";
                    case Adventure_Merchant_Model.meepo: return "models/props_gameplay/npc/shopkeeper_the_lost_meepo/shopkeeper_the_lost_meepo.vmdl";
                    case Adventure_Merchant_Model.smith: return "models/props_gameplay/shopkeeper_fountain/shopkeeper_fountain.vmdl";
                }
            }

            const model = merchant_model_path(entity.model);
            const unit = create_adventure_unit(model, 1.0);

            return {
                ...base,
                type: entity.type,
                alive: true,
                handle: unit,
                started_waving_at: 0,
                just_saw_player: false
            }
        }

        case Adventure_Entity_Type.shrine: {
            const [model, scale] = [
                "models/props_structures/radiant_statue001.vmdl",
                1.0
            ];

            const unit = create_adventure_unit(model, scale);
            const obstruction = setup_building_obstruction(unit);

            const child = {
                type: Adventure_Entity_Type.shrine,
                handle: unit,
                obstruction: obstruction
            } as const;

            if (entity.alive) {
                const ambient_fx = fx_follow_unit("particles/world_shrine/radiant_shrine_ambient.vpcf", { handle: unit });

                return {
                    ...base,
                    ...child,
                    alive: entity.alive,
                    ambient_fx: ambient_fx
                };
            } else {
                return {
                    ...base,
                    ...child,
                    alive: entity.alive
                };
            }
        }
    }
}

function update_adventure_enemy(game: Game, enemy: Adventure_World_Enemy) {
    if (!enemy.alive) return;

    const player_handle = game.player.hero_unit;
    const enemy_handle = enemy.handle;
    const enemy_spawn_location = Vector(enemy.base.spawn_position.x, enemy.base.spawn_position.y);
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

                const stun = player_handle.AddNewModifier(player_handle, undefined, "Modifier_Stunned", {});
                player_handle.FaceTowards(enemy_actual_location);
                add_activity_override({ handle: player_handle }, GameActivity_t.ACT_DOTA_ATTACK, 1.0);

                const animation = fork(() => {
                    enemy_handle.EmitSound(get_npc_definition(enemy.npc_type).attack_sound);
                    enemy_handle.StartGestureWithPlaybackRate(GameActivity_t.ACT_DOTA_ATTACK, 1);
                    wait(0.6);
                    enemy_handle.EmitSound(get_npc_definition(enemy.npc_type).hit_sound);
                    wait(0.5);
                    enemy_handle.FadeGesture(GameActivity_t.ACT_DOTA_ATTACK);
                });

                const new_state = api_request(Api_Request_Type.start_adventure_enemy_fight, {
                    enemy_entity_id: enemy.base.id,
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
            const desired_facing = Vector(enemy.base.spawn_facing.x, enemy.base.spawn_facing.y);
            const actual_facing = enemy_handle.GetForwardVector();

            if (desired_facing.Dot(actual_facing) < 0.95) {
                enemy_handle.FaceTowards(enemy_actual_location + desired_facing as Vector);
            }
        }
    }
}

function update_merchant(game: Game, merchant: Adventure_World_Merchant) {
    const player_handle = game.player.hero_unit;
    const player_location = player_handle.GetAbsOrigin();
    const spawn_location = Vector(merchant.base.spawn_position.x, merchant.base.spawn_position.y);
    const distance_to_player = (spawn_location - player_location as Vector).Length2D();
    const now = GameRules.GetGameTime();

    if (distance_to_player <= 700) {
        if (!merchant.just_saw_player && now - merchant.started_waving_at >= 5.0) {
            merchant.started_waving_at = now;

            add_activity_override(merchant, GameActivity_t.ACT_DOTA_TAUNT, 3.0);
        }

        merchant.just_saw_player = true;
    } else {
        merchant.just_saw_player = false;
    }
}

function update_lost_creep(game: Game, creep: Adventure_World_Lost_Creep) {
    if (!creep.alive) return;

    const player_handle = game.player.hero_unit;
    const spawn_location = Vector(creep.base.spawn_position.x, creep.base.spawn_position.y);
    const spawn_facing = Vector(creep.base.spawn_facing.x, creep.base.spawn_facing.y);
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
    function try_find_entity_by_unit<T extends Entity_With_Movement>(query: CBaseEntity): Adventure_World_Entity | undefined {
        return array_find(game.adventure.entities, entity => {
            if (entity.type == Adventure_Entity_Type.merchant) {
                return entity.handle == query;
            }

            return entity.alive && entity.handle == query;
        });
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
        if (right_click_target && (right_click_target.type == Adventure_Entity_Type.merchant || right_click_target.alive)) {
            const delta = right_click_target.handle.GetAbsOrigin() - game.player.hero_unit.GetAbsOrigin() as Vector;

            if (!game.player.hero_unit.IsMoving() && delta.Length2D() <= 300) {
                game.adventure.current_right_click_target = undefined;

                // In case hero is already close to the target we stop them so camera doesn't move behind the popup
                game.player.hero_unit.Stop();
                game.player.hero_unit.FaceTowards(right_click_target.handle.GetAbsOrigin());

                fire_event(To_Client_Event_Type.adventure_display_entity_popup, {
                    entity: right_click_target.base
                });
            }
        }

        for (const entity of game.adventure.entities) {
            switch (entity.type) {
                case Adventure_Entity_Type.enemy: {
                    update_adventure_enemy(game, entity);
                    break;
                }

                case Adventure_Entity_Type.lost_creep: {
                    update_lost_creep(game, entity);
                    break;
                }

                case Adventure_Entity_Type.merchant: {
                    update_merchant(game, entity);
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

function adventure_interact_with_entity(game: Game, entity_id: Adventure_Entity_Id, current_head: number) {
    const entity_index = array_find_index(game.adventure.entities, entity => entity.base.id == entity_id);
    if (entity_index == -1) return;

    const entity = game.adventure.entities[entity_index];
    if (entity.type == Adventure_Entity_Type.merchant) return;
    if (!entity.alive) return;

    const entity_world_position = entity.handle.GetAbsOrigin();
    const distance_to_player = (game.player.hero_unit.GetAbsOrigin() - entity_world_position as Vector).Length2D();
    if (distance_to_player > 500) return;

    const state_update = api_request(Api_Request_Type.interact_with_adventure_entity, {
        target_entity_id: entity_id,
        access_token: game.token,
        dedicated_server_key: get_dedicated_server_key(),
        current_head: current_head
    });

    if (state_update) {
        const hero = { handle: game.player.hero_unit };

        if (entity.type == Adventure_Entity_Type.gold_bag) {
            unit_emit_sound(hero, "gold_bag_activate");

            fx("particles/items2_fx/hand_of_midas.vpcf")
                .to_unit_origin(0, entity)
                .to_unit_attach_point(1, hero, "attach_hitloc")
                .release();
        }

        game.adventure.entities[entity_index] = update_entity_state(entity, state_update.updated_entity);

        fire_event(To_Client_Event_Type.adventure_receive_party_changes, {
            changes: state_update.party_updates,
            current_head: current_head
        });

        if (entity.type == Adventure_Entity_Type.shrine) {
            unit_emit_sound(entity, "shrine_activate");
            fx_follow_unit("particles/world_shrine/radiant_shrine_active.vpcf", entity).release();

            fork(() => {
                const hero_fx = fx_by_unit("particles/world_shrine/radiant_shrine_regen.vpcf", hero)
                    .to_unit_attach_point(0, hero, "attach_hitloc");

                wait(3);
                hero_fx.destroy_and_release(false);
            });
        }

        update_adventure_net_table(game.adventure);
    }
}

function update_entity_state(from: Adventure_World_Entity, to: Adventure_Entity): Adventure_World_Entity {
    if (from.type == Adventure_Entity_Type.merchant) {
        return from;
    }

    if (to.type == Adventure_Entity_Type.merchant) {
        return create_adventure_entity(to);
    }

    if (!from.alive) {
        cleanup_adventure_entity(from);
        return create_adventure_entity(to);
    }

    // from.alive == true here
    if (to.alive) {
        return from;
    }

    const base = {
        handle: from.handle,
        base: from.base
    };

    switch (from.type) {
        case Adventure_Entity_Type.shrine: {
            from.ambient_fx.destroy_and_release(false);

            return {
                ...base,
                type: from.type,
                alive: false,
                handle: from.handle,
                obstruction: from.obstruction
            };
        }

        case Adventure_Entity_Type.item_on_the_ground: {
            from.handle.RemoveSelf();

            return {
                ...base,
                type: from.type,
                alive: false
            };
        }

        case Adventure_Entity_Type.gold_bag: {
            from.handle.RemoveSelf();

            return {
                ...base,
                type: from.type,
                alive: false
            };
        }

        case Adventure_Entity_Type.lost_creep: {
            from.handle.RemoveSelf();

            return {
                ...base,
                type: from.type,
                alive: false
            };
        }

        case Adventure_Entity_Type.enemy: {
            from.handle.RemoveSelf();

            if (from.noticed_particle) {
                from.noticed_particle.destroy_and_release(true);
            }

            return {
                ...base,
                type: from.type,
                alive: false
            };
        }

        default: unreachable(from);
    }
}

function cleanup_adventure_entity(entity: Adventure_World_Entity) {
    switch (entity.type) {
        case Adventure_Entity_Type.lost_creep: {
            if (entity.alive) {
                entity.handle.RemoveSelf();
            }

            break;
        }

        case Adventure_Entity_Type.shrine: {
            if (entity.alive) {
                entity.ambient_fx.destroy_and_release(true);
            }

            entity.obstruction.RemoveSelf();
            entity.handle.RemoveSelf();

            break;
        }

        case Adventure_Entity_Type.enemy: {
            if (!entity.alive) break;

            entity.handle.RemoveSelf();

            if (entity.noticed_particle) {
                entity.noticed_particle.destroy_and_release(true);
            }

            break;
        }

        case Adventure_Entity_Type.item_on_the_ground: {
            if (!entity.alive) break;
            entity.handle.RemoveSelf();
            break;
        }

        case Adventure_Entity_Type.gold_bag: {
            if (!entity.alive) break;
            entity.handle.RemoveSelf();
            break;
        }

        case Adventure_Entity_Type.merchant: {
            entity.handle.RemoveSelf();
            break;
        }

        default: unreachable(entity);
    }
}

function cleanup_adventure(adventure: Adventure_State) {
    for (const entity of adventure.entities) {
        cleanup_adventure_entity(entity);
    }

    adventure.entities = [];
    delete adventure.current_right_click_target;
}

function update_adventure_net_table(adventure: Adventure_State) {
    const physical_entity = (entity: Adventure_World_Entity): Physical_Adventure_Entity | undefined => {
        switch (entity.type) {
            case Adventure_Entity_Type.merchant:
            case Adventure_Entity_Type.shrine: {
                return {
                    world_entity_id: entity.handle.entindex(),
                    base: entity.base
                }
            }

            default: {
                if (!entity.alive) return;

                return {
                    world_entity_id: entity.handle.entindex(),
                    base: entity.base
                }
            }
        }
    };

    const physical_entities: Physical_Adventure_Entity[] = [];

    for (const entity of adventure.entities) {
        const physical = physical_entity(entity);

        if (physical) {
            physical_entities.push(physical);
        }
    }

    const table: Adventure_Net_Table = {
        entities: physical_entities
    };

    CustomNetTables.SetTableValue("adventure", "table", table);
}