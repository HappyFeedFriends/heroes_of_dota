type Entity_With_Movement = {
    movement_history: Movement_History_Entry[]
    last_recorded_x: number
    last_recorded_y: number
    unit: CDOTA_BaseNPC
}

type Map_Npc = {
    id: Npc_Id
    type: Npc_Type
    spawn_facing: XY
} & Entity_With_Movement

type Map_Player = {
    id: Player_Id
} & Entity_With_Movement

type Map_State = {
    players: Record<number, Map_Player>
    neutrals: Record<number, Map_Npc>
}

type Npc_Definition = {
    model: string
    scale: number
    notice_sound: string
    attack_sound: string
    hit_sound: string
}

declare const enum Const {
    movement_history_submit_rate = 0.7,
    movement_history_length = 30
}

function get_npc_definition(npc_type: Npc_Type): Npc_Definition {
    switch (npc_type) {
        case Npc_Type.satyr: return {
            model: "models/creeps/neutral_creeps/n_creep_satyr_a/n_creep_satyr_a.mdl",
            scale: 1,
            notice_sound: "",
            attack_sound: "",
            hit_sound: ""
        };
    }
}

function process_player_global_map_order(game: Game, map: Map_State, order: ExecuteOrderEvent): boolean {
    function try_find_entity_by_unit<T extends Entity_With_Movement>(entities: Record<number, T>, query: CBaseEntity): T | undefined {
        for (let entity_id in entities) {
            const entity = entities[entity_id];

            if (entity.unit == query) {
                return entity;
            }
        }
    }

    for (let index in order.units) {
        if (order.units[index] == game.player.hero_unit.entindex()) {
            if (order.order_type == DotaUnitOrder_t.DOTA_UNIT_ORDER_MOVE_TO_POSITION) {
                game.player.current_order_x = order.position_x;
                game.player.current_order_y = order.position_y;
            } else if (order.order_type == DotaUnitOrder_t.DOTA_UNIT_ORDER_ATTACK_TARGET) {
                const clicked_entity = EntIndexToHScript(order.entindex_target);

                const attacked_player = try_find_entity_by_unit(map.players, clicked_entity);
                const attacked_npc = try_find_entity_by_unit(map.neutrals, clicked_entity);

                if (attacked_player) {
                    fork(() => attack_player(game, attacked_player));
                } else if (attacked_npc) {
                    fork(() => attack_npc(game, attacked_npc));
                }

                return false;
            } else {
                return false;
            }

            break;
        }
    }

    return true;
}

function create_new_player_from_movement_data(data: Player_Movement_Data): Map_Player {
    return {
        id: data.id,
        movement_history: data.movement_history,
        unit: create_map_unit("npc_dota_hero_chaos_knight", data.current_location),
        last_recorded_x: data.current_location.x,
        last_recorded_y: data.current_location.y
    };
}

function create_new_npc_from_movement_data(data: NPC_Movement_Data): Map_Npc {
    const definition = get_npc_definition(data.type);
    const unit = create_map_unit_with_model(data.current_location, data.spawn_facing, definition.model, definition.scale);

    return {
        id: data.id,
        type: data.type,
        movement_history: data.movement_history,
        unit: unit,
        last_recorded_x: data.current_location.x,
        last_recorded_y: data.current_location.y,
        spawn_facing: data.spawn_facing
    };
}

function update_entity_from_movement_history(entity: Entity_With_Movement) {
    const current_unit_position = entity.unit.GetAbsOrigin();
    const snap_distance = 400;

    let closest_entry: Movement_History_Entry | undefined;
    let minimum_distance = 1e6;
    let closest_entry_index = 0;

    entity.movement_history.forEach((entry, entry_index) => {
        const delta = current_unit_position - Vector(entry.location_x, entry.location_y) as Vector;
        const distance = delta.Length2D();

        if (distance <= snap_distance && distance <= minimum_distance) {
            minimum_distance = distance;
            closest_entry = entry;
            closest_entry_index = entry_index;
        }
    });

    // player.hero_unit.SetBaseMoveSpeed(295 + (movement_history_length - closest_entry_index) * 20);

    if (closest_entry) {
        if (minimum_distance > 0) {
            entity.unit.MoveToPosition(Vector(closest_entry.order_x, closest_entry.order_y));
        }
    } else if (entity.movement_history.length > 0) {
        const last_entry = entity.movement_history[entity.movement_history.length - 1];

        FindClearSpaceForUnit(entity.unit, Vector(last_entry.location_x, last_entry.location_y), true);
        entity.unit.MoveToPosition(Vector(last_entry.order_x, last_entry.order_y));
    } else {
        FindClearSpaceForUnit(entity.unit, Vector(entity.last_recorded_x, entity.last_recorded_y), true);
    }
}

function query_other_entities_movement(game: Game, map: Map_State) {
    const response = api_request_with_retry_on_403(Api_Request_Type.query_entity_movement, game, {
        access_token: game.token,
        dedicated_server_key: get_dedicated_server_key()
    });

    if (!response) {
        return;
    }

    type All_Movement_Data = Player_Movement_Data | NPC_Movement_Data;

    function process_received_movement<T extends All_Movement_Data>(entities: Record<number, Entity_With_Movement>, received: T[], maker: (data: T) => Entity_With_Movement) {
        const received_movement_history_this_frame: Record<number, boolean> = {};

        for (const id in entities) {
            received_movement_history_this_frame[id] = false;
        }

        received.forEach(entity_data => {
            const entity = entities[entity_data.id];

            received_movement_history_this_frame[entity_data.id] = true;

            if (entity) {
                entity.movement_history = entity_data.movement_history;
                entity.last_recorded_x = entity_data.current_location.x;
                entity.last_recorded_y = entity_data.current_location.y;

                update_entity_from_movement_history(entity);
            } else {
                const new_entity = maker(entity_data);

                entities[entity_data.id] = new_entity;

                update_entity_from_movement_history(new_entity);
            }
        });

        for (const id in entities) {
            const entity = entities[id];
            const should_be_kept = received_movement_history_this_frame[id];

            if (!should_be_kept) {
                delete entities[id];

                entity.unit.RemoveSelf();
            }
        }
    }

    process_received_movement(map.players, response.players, create_new_player_from_movement_data);
    process_received_movement(map.neutrals, response.neutrals, create_new_npc_from_movement_data);
}

function update_main_player_movement_history(main_player: Main_Player) {
    const location = main_player.hero_unit.GetAbsOrigin();

    main_player.movement_history.push({
        order_x: main_player.current_order_x,
        order_y: main_player.current_order_y,
        location_x: location.x,
        location_y: location.y
    });

    if (main_player.movement_history.length > Const.movement_history_length) {
        main_player.movement_history.shift();
    }
}

function attack_player(game: Game, player: Map_Player) {
    const new_player_state = api_request(Api_Request_Type.attack_player, {
        access_token: game.token,
        dedicated_server_key: get_dedicated_server_key(),
        target_player_id: player.id
    });

    if (new_player_state) {
        try_submit_state_transition(game, new_player_state);
    }
}

function attack_npc(game: Game, npc: Map_Npc) {
    const new_player_state = api_request(Api_Request_Type.attack_npc, {
        access_token: game.token,
        dedicated_server_key: get_dedicated_server_key(),
        target_npc_id: npc.id
    });

    if (new_player_state) {
        try_submit_state_transition(game, new_player_state);
    }
}
