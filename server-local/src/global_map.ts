type Entity_With_Movement = {
    movement_history: Movement_History_Entry[]
    last_recorded_x: number
    last_recorded_y: number
    unit: CDOTA_BaseNPC
}

type Map_NPC = {
    id: Npc_Id
    type: Npc_Type
} & Entity_With_Movement

type Map_Player = {
    id: Player_Id
} & Entity_With_Movement

type Main_Player = {
    token: string
    remote_id: Player_Id
    player_id: PlayerID
    hero_unit: CDOTA_BaseNPC_Hero
    movement_history: Movement_History_Entry[]
    current_order_x: number
    current_order_y: number
    state: Player_State
}

type Map_State = {
    players: Record<number, Map_Player>
    neutrals: Record<number, Map_NPC>
}

const movement_history_submit_rate = 0.7;
const movement_history_length = 30;

function submit_player_movement(main_player: Main_Player) {
    const current_location = main_player.hero_unit.GetAbsOrigin();
    const request = {
        access_token: main_player.token,
        current_location: {
            x: current_location.x,
            y: current_location.y
        },
        movement_history: main_player.movement_history.map(entry => ({
            order_x: entry.order_x,
            order_y: entry.order_y,
            location_x: entry.location_x,
            location_y: entry.location_y
        })),
        dedicated_server_key: get_dedicated_server_key()
    };

    api_request_with_retry_on_403(Api_Request_Type.submit_player_movement, main_player, request);
}

function get_npc_model(npc_type: Npc_Type): [string, number] {
    switch (npc_type) {
        case Npc_Type.satyr: return [ "models/creeps/neutral_creeps/n_creep_satyr_a/n_creep_satyr_a.mdl", 1 ];
        case Npc_Type.spider: return [ "models/heroes/broodmother/spiderling.vmdl", 0.7 ];
    }
}

function process_player_global_map_order(main_player: Main_Player, map: Map_State, order: ExecuteOrderEvent): boolean {
    function try_find_entity_by_unit<T extends Entity_With_Movement>(entities: Record<number, T>, query: CBaseEntity): T | undefined {
        for (let entity_id in entities) {
            const entity = entities[entity_id];

            if (entity.unit == query) {
                return entity;
            }
        }
    }

    for (let index in order.units) {
        if (order.units[index] == main_player.hero_unit.entindex()) {
            if (order.order_type == DotaUnitOrder_t.DOTA_UNIT_ORDER_MOVE_TO_POSITION) {
                main_player.current_order_x = order.position_x;
                main_player.current_order_y = order.position_y;
            } else if (order.order_type == DotaUnitOrder_t.DOTA_UNIT_ORDER_ATTACK_TARGET) {
                const clicked_entity = EntIndexToHScript(order.entindex_target);

                const attacked_player = try_find_entity_by_unit(map.players, clicked_entity);
                const attacked_npc = try_find_entity_by_unit(map.neutrals, clicked_entity);

                if (attacked_player) {
                    fork(() => attack_player(main_player, attacked_player));
                } else if (attacked_npc) {
                    fork(() => attack_npc(main_player, attacked_npc));
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

function create_map_unit(dota_name: string, location: XY) {
    return CreateUnitByName(
        dota_name,
        Vector(location.x, location.y),
        true,
        null,
        null,
        DOTATeam_t.DOTA_TEAM_GOODGUYS
    );
}

function create_new_player_from_movement_data(data: Player_Movement_Data): Map_Player {
    return {
        id: data.id,
        movement_history: data.movement_history,
        unit: create_map_unit("npc_dota_hero_lina", data.current_location),
        last_recorded_x: data.current_location.x,
        last_recorded_y: data.current_location.y
    };
}

function create_new_npc_from_movement_data(data: NPC_Movement_Data): Map_NPC {
    const unit = create_map_unit("hod_unit", data.current_location);
    const [model, scale] = get_npc_model(data.type);

    unit.SetOriginalModel(model);
    unit.SetModel(model);
    unit.SetModelScale(scale);
    unit.SetForwardVector(Vector(data.spawn_facing.x, data.spawn_facing.y));

    if (IsInToolsMode()) {
        unit.AddNewModifier(unit, undefined, "Modifier_Editor_Npc_Type",  {}).SetStackCount(data.type);
    }

    return {
        id: data.id,
        type: data.type,
        movement_history: data.movement_history,
        unit: unit,
        last_recorded_x: data.current_location.x,
        last_recorded_y: data.current_location.y
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

function query_other_entities_movement(main_player: Main_Player, map: Map_State) {
    const response = api_request_with_retry_on_403(Api_Request_Type.query_entity_movement, main_player, {
        access_token: main_player.token,
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

    if (main_player.movement_history.length > movement_history_length) {
        main_player.movement_history.shift();
    }
}

function submit_and_query_movement_loop(main_player: Main_Player, map: Map_State) {
    while (true) {
        wait_until(() => main_player.state == Player_State.on_global_map || main_player.state == Player_State.on_adventure);
        wait(movement_history_submit_rate);

        fork(() => submit_player_movement(main_player));
        fork(() => query_other_entities_movement(main_player, map));
    }
}

function attack_player(main_player: Main_Player, player: Map_Player) {
    const new_player_state = api_request(Api_Request_Type.attack_player, {
        access_token: main_player.token,
        dedicated_server_key: get_dedicated_server_key(),
        target_player_id: player.id
    });

    if (new_player_state) {
        try_submit_state_transition(main_player, new_player_state);
    }
}

function attack_npc(main_player: Main_Player, npc: Map_NPC) {
    const new_player_state = api_request(Api_Request_Type.attack_npc, {
        access_token: main_player.token,
        dedicated_server_key: get_dedicated_server_key(),
        target_npc_id: npc.id
    });

    if (new_player_state) {
        try_submit_state_transition(main_player, new_player_state);
    }
}
