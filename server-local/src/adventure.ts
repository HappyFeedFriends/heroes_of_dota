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
    traits: Creep_Traits
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

type Adventure_World_Room_Exit = {
    to: Adventure_Room_Id
    at: Vector
    fx: FX
}

type Adventure_State = {
    environment: Environment
    entities: Adventure_World_Entity[]
    current_right_click_target?: Adventure_World_Entity
    ongoing_adventure_id: Ongoing_Adventure_Id
    camera_restriction_zones: Camera_Restriction_Zone[]
    exits: Adventure_World_Room_Exit[]
    camera_dummy: CDOTA_BaseNPC
    last_ordered_dummy_to_move_at: number
    num_party_slots: number
    deciding_to_exit_at?: Adventure_World_Room_Exit
    attacking_enemy?: {
        enemy: Adventure_World_Enemy
        animation: Fork<void>
        new_state: Fork<Player_State_Data | undefined>
    }
}

const debug_camera = false;

function adventure_item_id_to_model(id: Adventure_Item_Id): string {
    switch (id) {
        case Adventure_Item_Id.divine_rapier: return "models/props_gameplay/divine_rapier.vmdl";
        case Adventure_Item_Id.boots_of_speed: return "models/props_gameplay/boots_of_speed.vmdl";
        case Adventure_Item_Id.iron_branch: return "models/props_gameplay/branch.vmdl";

        case Adventure_Item_Id.healing_salve: return "models/props_gameplay/salve.vmdl";
        case Adventure_Item_Id.enchanted_mango: return "models/props_gameplay/mango.vmdl";
        case Adventure_Item_Id.tome_of_strength: return "models/gameplay/attrib_tome_str.vmdl";
        case Adventure_Item_Id.tome_of_agility: return "models/gameplay/attrib_tome_agi.vmdl";
    }

    return "models/props_gameplay/neutral_box.vmdl";
}

function adventure_item_to_model(item: Adventure_Item) {
    return adventure_item_id_to_model(item.item_id);
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

            const traits = creep_traits_by_type(entity.world_model);
            const unit = create_adventure_unit(traits.model, traits.scale);

            return {
                ...base,
                type: entity.type,
                alive: true,
                handle: unit,
                traits: traits,
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

            const traits = creep_traits_by_type(Creep_Type.lane_creep);
            const unit = create_adventure_unit(traits.model, traits.scale);

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
            const path_to_player = GridNav.FindPathLength(enemy_spawn_location, player_location);
            if (path_to_player <= sight_range) {
                enemy.has_noticed_player = true;
                enemy.noticed_particle = fx_by_unit("particles/map/msg_noticed.vpcf", enemy).follow_unit_overhead(0, enemy);
                enemy.noticed_player_at = now;

                enemy_handle.EmitSound(enemy.traits.sounds.notice);
            }
        }

        if (enemy.has_noticed_player) {
            if (from_enemy_to_player <= 96) {
                const attack = game.adventure.attacking_enemy;
                if (!attack) {
                    enemy_handle.Stop();

                    player_handle.AddNewModifier(player_handle, undefined, "Modifier_Stunned", {});
                    player_handle.FaceTowards(enemy_actual_location);
                    add_activity_override({handle: player_handle}, GameActivity_t.ACT_DOTA_ATTACK, 1.0);

                    const animation = fork(() => {
                        enemy_handle.EmitSound(enemy.traits.sounds.pre_attack);
                        enemy_handle.StartGestureWithPlaybackRate(GameActivity_t.ACT_DOTA_ATTACK, 1);
                        wait(0.6);
                        enemy_handle.EmitSound(enemy.traits.sounds.attack);
                        wait(0.5);
                        enemy_handle.FadeGesture(GameActivity_t.ACT_DOTA_ATTACK);
                    });

                    const new_state = fork(() => api_request(Api_Request_Type.start_adventure_enemy_fight, {
                        enemy_entity_id: enemy.base.id,
                        access_token: game.token,
                        dedicated_server_key: get_dedicated_server_key()
                    }));

                    game.adventure.attacking_enemy = {
                        enemy: enemy,
                        animation: animation,
                        new_state: new_state
                    };
                } else if (attack.animation.has_finished && attack.new_state.has_finished) {
                    if (attack.new_state.result) {
                        try_submit_state_transition(game, attack.new_state.result);
                    }

                    player_handle.RemoveModifierByName("Modifier_Stunned");
                    game.adventure.attacking_enemy = undefined;
                }
            } else if (now - enemy.issued_movement_order_at > 0.1) {
                if (now - enemy.noticed_player_at > 0.25) {
                    enemy_handle.MoveToPosition(player_location);
                } else {
                    enemy_handle.FaceTowards(player_location);
                }

                enemy.issued_movement_order_at = now;
            }
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

function is_point_inside_zone(zone: Camera_Restriction_Zone, query: Vector) {
    const points = zone.points.map(point => Vector(point.x, point.y));

    function cross_2d(a: Vector, b: Vector) {
        return (a.x * b.y) - (a.y * b.x);
    }

    for (let index = 0; index < points.length; index++) {
        const this_point = points[index];
        const next_point = points[(index + 1) % points.length];
        const cross = cross_2d(next_point - this_point as Vector, query - next_point as Vector);

        if (cross < 0) {
            return false;
        }
    }

    return true;
}

function find_closest_point_on_zone_edge_for_point(zone: Camera_Restriction_Zone, query: Vector) {
    const points = zone.points.map(point => Vector(point.x, point.y));

    let closest_point: Vector | undefined = undefined;
    let smallest_distance = 100_000;

    for (let index = 0; index < points.length; index++) {
        const edge_start = points[index];
        const edge_end = points[(index + 1) % points.length];
        const edge = edge_end - edge_start as Vector;
        const edge_direction = edge.Normalized();
        const segment = query - edge_start as Vector;
        const projection = segment.Dot(edge_direction);

        let projected_onto_edge: Vector;

        if (projection <= 0) {
            projected_onto_edge = edge_start;
        } else if (projection >= edge.Length()) {
            projected_onto_edge = edge_end;
        } else {
            projected_onto_edge = edge_start + edge_direction * projection as Vector
        }

        const perpendicular_length = (query - projected_onto_edge as Vector).Length();

        if (perpendicular_length < smallest_distance) {
            closest_point = projected_onto_edge;
            smallest_distance = perpendicular_length;
        }
    }

    return closest_point;
}

function update_adventure_camera(adventure: Adventure_State, player: Main_Player) {
    function get_desired_camera_position() {
        const player_position = player.hero_unit.GetAbsOrigin();

        for (const zone of adventure.camera_restriction_zones) {
            if (is_point_inside_zone(zone, player_position)) {
                const closest = find_closest_point_on_zone_edge_for_point(zone, player_position);

                if (closest) {
                    return closest;
                }
            }
        }

        return player_position;
    }

    const camera = adventure.camera_dummy;
    const actual_camera_position = camera.GetAbsOrigin();
    const desired_camera_position = get_desired_camera_position();
    camera.SetBaseMoveSpeed((desired_camera_position - actual_camera_position as Vector).Length2D() * 2);

    if (GameRules.GetGameTime() - adventure.last_ordered_dummy_to_move_at > FrameTime() * 2) {
        camera.MoveToPosition(desired_camera_position);
        adventure.last_ordered_dummy_to_move_at = GameRules.GetGameTime();
    }

    if (debug_camera) {
        const center = GetGroundPosition(desired_camera_position, undefined) + Vector(0, 0, 32) as Vector;
        DebugDrawSphere(center, Vector(255, 0, 0), 128, 64, false, FrameTime());
    }

    if ((actual_camera_position - desired_camera_position as Vector).Length2D() > 500) {
        camera.SetAbsOrigin(desired_camera_position);
    }
}

function update_adventure_room_exit_logic(player: Main_Player, adventure: Adventure_State, token: string) {
    const player_at = player.hero_unit.GetAbsOrigin();
    const exit_distance_threshold = 200;

    if (adventure.deciding_to_exit_at) {
        const to_exit = (adventure.deciding_to_exit_at.at - player_at as Vector).Length2D();

        if (to_exit > exit_distance_threshold) {
            adventure.deciding_to_exit_at = undefined;
        }
    } else {
        for (const exit of adventure.exits) {
            const to_exit = (exit.at - player_at as Vector).Length2D();

            if (to_exit <= exit_distance_threshold) {
                adventure.deciding_to_exit_at = exit;

                player.hero_unit.Stop();

                fire_event(To_Client_Event_Type.adventure_display_room_exit_popup, {
                    room_id: exit.to
                });
            }
        }
    }
}

function draw_zones_debug(game: Game) {
    for (const zone of game.adventure.camera_restriction_zones) {
        const points = zone.points.map(point => GetGroundPosition(Vector(point.x, point.y), undefined));

        for (let index = 0; index < points.length; index++) {
            const this_point = points[index];
            const next_point = points[(index + 1) % points.length];
            DebugDrawLine(this_point, next_point, 255, 0, 0, false, 1);
        }
    }
}

function update_adventure(game: Game) {
    if (debug_camera) {
        draw_zones_debug(game);
    }

    update_adventure_camera(game.adventure, game.player);

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

    update_adventure_room_exit_logic(game.player, game.adventure, game.token);
}

function handle_in_interactive_distance(player: Main_Player, handle: CDOTA_BaseNPC) {
    const entity_world_position = handle.GetAbsOrigin();
    const distance_to_player = (player.hero_unit.GetAbsOrigin() - entity_world_position as Vector).Length2D();
    return distance_to_player <= 500;
}

function adventure_try_purchase_merchant_item(game: Game, merchant_id: Adventure_World_Entity_Id, purchase_id: Adventure_Party_Entity_Id, current_head: number) {
    const entity_index = array_find_index(game.adventure.entities, entity => entity.base.id == merchant_id);
    if (entity_index == -1) return;

    const entity = game.adventure.entities[entity_index];
    if (entity.type != Adventure_Entity_Type.merchant) return;
    if (!handle_in_interactive_distance(game.player, entity.handle)) return;

    const purchase = api_request(Api_Request_Type.purchase_merchant_item, {
        current_head: current_head,
        merchant_id: merchant_id,
        purchase_id: purchase_id,
        access_token: game.token,
        dedicated_server_key: get_dedicated_server_key()
    });

    if (!purchase) return;

    game.adventure.entities[entity_index].base = purchase.updated_entity;

    fire_event(To_Client_Event_Type.adventure_receive_party_changes, {
        changes: purchase.party_updates,
        current_head: current_head
    });

    update_adventure_net_table(game.adventure);
}

function adventure_make_room_exit_decision(game: Game, map: Map_State) {
    const exit = game.adventure.deciding_to_exit_at;

    if (exit) {
        const room = api_request(Api_Request_Type.enter_adventure_room, {
            room_id: exit.to,
            access_token: game.token,
            dedicated_server_key: get_dedicated_server_key()
        });

        if (room) {
            cleanup_adventure(game.adventure);
            enter_adventure_room(game.player, game.adventure, room);
            query_other_entities_movement(game, map);
        }
    }
}

function adventure_interact_with_entity(game: Game, entity_id: Adventure_World_Entity_Id, current_head: number) {
    const entity_index = array_find_index(game.adventure.entities, entity => entity.base.id == entity_id);
    if (entity_index == -1) return;

    const entity = game.adventure.entities[entity_index];
    if (entity.type == Adventure_Entity_Type.merchant) return;
    if (!entity.alive) return;
    if (!handle_in_interactive_distance(game.player, entity.handle)) return;

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

        if (entity.type == Adventure_Entity_Type.lost_creep) {
            fx("particles/adventures/lost_creep_disappearing.vpcf")
                .to_unit_origin(0, entity)
                .with_forward_vector(0, entity.handle.GetForwardVector())
                .release();
        }

        if (entity.type == Adventure_Entity_Type.item_on_the_ground) {
            fx("particles/ui/ui_game_start_hero_spawn.vpcf")
                .to_unit_origin(0, entity)
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

                fork(() => {
                    wait(3);
                    hero_fx.destroy_and_release(false);
                });
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

function create_world_room_exit(exit: Adventure_Room_Exit): Adventure_World_Room_Exit {
    const position = GetGroundPosition(Vector(exit.at.x, exit.at.y), undefined);

    return {
        to: exit.to,
        at: position,
        fx: fx("particles/room_exit.vpcf").with_vector_value(0, position)
    };
}

function enter_adventure_room(player: Main_Player, adventure: Adventure_State, room: Adventure_Room_Data, override_position?: XY) {
    const start = override_position ? Vector(override_position.x, override_position.y) : Vector(room.entrance.x, room.entrance.y);

    FindClearSpaceForUnit(player.hero_unit, start, true);
    player.hero_unit.SetForwardVector(Vector(room.entrance_facing.x, room.entrance_facing.y));
    player.hero_unit.Interrupt();
    adventure.camera_dummy.SetAbsOrigin(player.hero_unit.GetAbsOrigin());

    player.current_order_x = start.x;
    player.current_order_y = start.y;
    player.movement_history = [{
        location_x: start.x,
        location_y: start.y,
        order_x: start.x,
        order_y: start.y
    }];

    adventure.environment = room.environment;
    adventure.entities = room.entities.map(entity => create_adventure_entity(entity));
    adventure.exits = room.exits.map(exit => create_world_room_exit(exit));
    adventure.camera_restriction_zones = room.camera_restriction_zones;

    set_camera_location_on_unit_blocking(player.player_id, adventure.camera_dummy);
    update_adventure_net_table(adventure);
}

function cleanup_adventure(adventure: Adventure_State) {
    for (const entity of adventure.entities) {
        cleanup_adventure_entity(entity);
    }

    for (const exit of adventure.exits) {
        exit.fx.destroy_and_release(false);
    }

    adventure.deciding_to_exit_at = undefined;
    adventure.exits = [];
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