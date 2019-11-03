type Game = {
    token: string
    state: Player_State
    player: Main_Player
    adventure: Adventure_State
}

type Main_Player = {
    remote_id: Player_Id
    player_id: PlayerID
    hero_unit: CDOTA_BaseNPC_Hero
    current_order_x: number
    current_order_y: number
    movement_history: Movement_History_Entry[]
}

let state_transition: Player_State_Data | undefined = undefined;

declare let can_transition_into_next_state: boolean;

function print_table(a: object, indent: string = "") {
    let [index, value] = next(a, undefined);

    while (index != undefined) {
        print(indent, `${index} (${type(index)})`, value);

        if (type(value) == "table") {
            print_table(value, indent + "    ");
        }

        [index, value] = next(a, index);
    }
}

function from_client_bool(source: boolean): source is true {
    return source as any as number == 1;
}

// Panorama arrays are passed as dictionaries with string indices
function from_client_array<T>(array: Array<T>): Array<T> {
    let [index, value] = next(array, undefined);

    const result: Array<T> = [];

    while (index != undefined) {
        result[tonumber(index.toString())] = value;

        [index, value] = next(array, index);
    }

    return result
}

function from_client_tuple<T>(array: T): T {
    let [index, value] = next(array, undefined);

    const result = [];

    while (index != undefined) {
        result[tonumber(index.toString())] = value;

        [index, value] = next(array, index);
    }

    return result as any as T;
}

function unreachable(x: never): never {
    throw "Didn't expect to get here";
}

function array_find<T>(array: Array<T>, predicate: (element: T) => boolean): T | undefined {
    for (const element of array) {
        if (predicate(element)) {
            return element;
        }
    }

    return undefined;
}

function array_find_index<T>(array: Array<T>, predicate: (element: T) => boolean): number {
    for (let index = 0; index < array.length; index++) {
        if (predicate(array[index])) {
            return index;
        }
    }

    return -1;
}

function game_time_formatted() {
    return string.format("%.2f", GameRules.GetGameTime());
}

function log_message(message: string) {
    const final_message = `[${game_time_formatted()}] ${message}`;

    CustomGameEventManager.Send_ServerToAllClients("log_message", { message: final_message });

    print(final_message);
}

function log_chat_debug_message(message: string) {
    const final_message = `Debug@[${game_time_formatted()}] ${message}`;
    const event: Debug_Chat_Message_Event = { message: final_message };

    CustomGameEventManager.Send_ServerToAllClients("log_chat_debug_message", event);
}

function lock_state_transition(code: () => void) {
    if (!can_transition_into_next_state) {
        print("Failed to lock state transition");
        return;
    }

    can_transition_into_next_state = false;
    code();
    can_transition_into_next_state = true;
}

function create_map_unit(dota_name: string, location: XY) {
    const unit = CreateUnitByName(
        dota_name,
        Vector(location.x, location.y),
        true,
        null,
        null,
        DOTATeam_t.DOTA_TEAM_GOODGUYS
    );

    unit.AddNewModifier(unit, undefined, "Modifier_Map_Unit", {});

    return unit;
}

function create_map_unit_with_model(at: XY, facing: XY, model: string, scale: number) {
    const unit = create_map_unit("hod_unit", at);

    unit.SetOriginalModel(model);
    unit.SetModel(model);
    unit.SetModelScale(scale);
    unit.SetForwardVector(Vector(facing.x, facing.y));

    return unit;
}

function unit_to_visualizer_unit_data(unit: Unit): Visualizer_Unit_Data {
    // TODO some of those properties are not actually needed
    const base: Visualizer_Unit_Data_Base = {
        ...copy(unit as Unit_Stats),
        id: unit.id,
        modifiers: unit.modifiers.map(data => data.modifier_id),
        hidden: unit.hidden
    };

    switch (unit.supertype) {
        case Unit_Supertype.hero: {
            return {
                ...base,
                supertype: Unit_Supertype.hero,
                level: unit.level
            }
        }

        case Unit_Supertype.creep: {
            return {
                ...base,
                supertype: Unit_Supertype.creep
            }
        }

        case Unit_Supertype.minion: {
            return {
                ...base,
                supertype: Unit_Supertype.minion
            }
        }
    }
}

function game_net_table(game: Game): Game_Net_Table {
    switch (game.state) {
        case Player_State.in_battle: {
            const entity_id_to_unit_data: Record<EntityID, Visualizer_Unit_Data> = {};
            const entity_id_to_rune_id: Record<number, Rune_Id> = {};
            const entity_id_to_shop_id: Record<number, Shop_Id> = {};

            for (const unit of battle.units) {
                entity_id_to_unit_data[unit.handle.entindex()] = unit_to_visualizer_unit_data(unit);
            }

            for (const rune of battle.runes) {
                entity_id_to_rune_id[rune.handle.entindex()] = rune.id;
            }

            for (const shop of battle.shops) {
                entity_id_to_shop_id[shop.handle.entindex()] = shop.id;
            }

            return {
                state: game.state,
                id: game.player.remote_id,
                token: game.token,
                battle: {
                    id: battle.id,
                    battle_player_id: battle.this_player_id,
                    participants: battle.participants,
                    players: battle.players.map(player => ({
                        id: player.id,
                        gold: player.gold
                    })),
                    world_origin: {
                        x: battle.world_origin.x,
                        y: battle.world_origin.y,
                        z: battle.world_origin.z
                    },
                    grid_size: battle.grid_size,
                    current_visual_head: battle.delta_head,
                    entity_id_to_unit_data: entity_id_to_unit_data,
                    entity_id_to_rune_id: entity_id_to_rune_id,
                    entity_id_to_shop_id: entity_id_to_shop_id
                }
            };
        }

        case Player_State.not_logged_in: {
            return {
                state: game.state
            };
        }

        case Player_State.on_global_map: {
            return {
                state: game.state,
                id: game.player.remote_id,
                token: game.token
            };
        }

        case Player_State.on_adventure: {
            return {
                state: game.state,
                id: game.player.remote_id,
                token: game.token,
                party: game.adventure.party
            };
        }

        default: return unreachable(game.state);
    }
}

function update_game_net_table(game: Game) {
    CustomNetTables.SetTableValue("main", "game", game_net_table(game));
}

function on_player_connected_async(callback: (player_id: PlayerID) => void) {
    ListenToGameEvent("player_connect_full", event => callback(event.PlayerID), null);
}

function on_player_hero_spawned_async(player_id: PlayerID, callback: (entity: CDOTA_BaseNPC_Hero) => void) {
    ListenToGameEvent("npc_spawned", event => {
        const entity = EntIndexToHScript(event.entindex) as CDOTA_BaseNPC;

        if (entity.IsRealHero() && entity.GetPlayerID() == player_id) {
            entity.AddNewModifier(entity, undefined, "Modifier_Map_Unit", {});

            callback(entity);
        }

    }, null);
}

function on_player_order_async(callback: (event: ExecuteOrderEvent) => boolean) {
    const mode = GameRules.GetGameModeEntity();

    mode.SetExecuteOrderFilter((context, event) => {
        return callback(event);
    }, mode);
}

function on_custom_event_async<T>(event_name: string, callback: (data: T) => void) {
    CustomGameEventManager.RegisterListener(event_name, (user_id, event) => fork(() => callback(event as T)));
}

function process_state_transition(game: Game, current_state: Player_State, next_state: Player_State_Data) {
    print(`State transition ${enum_to_string(current_state)} => ${enum_to_string(next_state.state)}`);

    if (next_state.state == Player_State.on_global_map) {
        FindClearSpaceForUnit(game.player.hero_unit, Vector(next_state.player_position.x, next_state.player_position.y), true);
        game.player.hero_unit.Interrupt();
        game.player.current_order_x = next_state.player_position.x;
        game.player.current_order_y = next_state.player_position.y;
    }

    if (current_state == Player_State.on_adventure) {
        cleanup_adventure(game.adventure);
    }

    if (current_state == Player_State.in_battle) {
        print("Battle over");

        clean_battle_world_handles(battle);
        reinitialize_battle(battle.world_origin, battle.camera_dummy);
    }

    if (next_state.state == Player_State.on_global_map) {
        PlayerResource.SetCameraTarget(game.player.player_id, game.player.hero_unit);
        wait_one_frame();
        PlayerResource.SetCameraTarget(game.player.player_id, undefined);
    }

    if (next_state.state == Player_State.in_battle) {
        print("Battle started");

        clean_battle_world_handles(battle);
        reinitialize_battle(battle.world_origin, battle.camera_dummy);

        battle.id = next_state.battle_id;
        battle.random_seed = next_state.random_seed;
        battle.this_player_id = next_state.battle_player_id;
        battle.players = next_state.participants.map(participant => ({
            id: participant.id,
            gold: 0
        }));
        battle.participants = next_state.participants;
        battle.grid_size = next_state.grid_size;
        battle.is_over = false;

        const camera_look_at = battle.world_origin + Vector(next_state.grid_size.width, next_state.grid_size.height - 2) * get_battle_cell_size() / 2 as Vector;

        battle.camera_dummy.SetAbsOrigin(camera_look_at);

        PlayerResource.SetCameraTarget(game.player.player_id, battle.camera_dummy);

        battle_emit_sound("combat_start");
    }

    if (next_state.state == Player_State.on_adventure) {
        const start = Vector(next_state.player_position.x, next_state.player_position.y);

        FindClearSpaceForUnit(game.player.hero_unit, start, true);
        game.player.hero_unit.Interrupt();

        PlayerResource.SetCameraTarget(game.player.player_id, game.player.hero_unit);

        game.player.current_order_x = start.x;
        game.player.current_order_y = start.y;
        game.player.movement_history = [{
            location_x: start.x,
            location_y: start.y,
            order_x: start.x,
            order_y: start.y
        }];

        for (const entity of next_state.entities) {
            game.adventure.entities.push(create_adventure_entity(entity));
        }

        game.adventure.party = next_state.party;
    }

    game.state = next_state.state;

    update_game_net_table(game);
}

function try_submit_state_transition(game: Game, new_state: Player_State_Data) {
    if (new_state.state != game.state) {
        print(`Well I have a new state transition and it is ${enum_to_string(game.state)} -> ${enum_to_string(new_state.state)}`);

        state_transition = new_state;
    }
}

function get_default_battleground_data(): [Vector, CDOTA_BaseNPC] {
    const origin = Entities.FindByName(undefined, "battle_bottom_left").GetAbsOrigin();

    const camera_entity = CreateModifierThinker(
        undefined,
        undefined,
        "",
        {},
        Vector(),
        DOTATeam_t.DOTA_TEAM_GOODGUYS,
        false
    ) as CDOTA_BaseNPC;

    return [origin, camera_entity];
}

function get_player_movement(player: Main_Player) {
    const current_location = player.hero_unit.GetAbsOrigin();
    return {
        current_location: {
            x: current_location.x,
            y: current_location.y
        },
        movement_history: player.movement_history,
    };
}

function reconnect_loop(game: Game) {
    function try_authorize_user(id: PlayerID, dedicated_server_key: string) {
        const steam_id = PlayerResource.GetSteamID(id).toString();

        return api_request(Api_Request_Type.authorize_steam_user, {
            steam_id: steam_id,
            steam_user_name: PlayerResource.GetPlayerName(id),
            dedicated_server_key: dedicated_server_key
        });
    }

    function try_with_delays_until_success<T>(delay: number, producer: () => T | undefined): T {
        let result: T | undefined;

        while((result = producer()) == undefined) wait(delay);

        return result;
    }

    while (true) {
        if (game.state == Player_State.not_logged_in) {
            const auth = try_authorize_user(game.player.player_id, get_dedicated_server_key());

            if (auth) {
                game.player.remote_id = auth.id;
                game.token = auth.token;

                print(`Authorized with id ${game.player.remote_id}`);

                const player_state = try_with_delays_until_success(1, () => api_request(Api_Request_Type.get_player_state, {
                    access_token: game.token
                }));

                print(`State received`);

                process_state_transition(game, Player_State.not_logged_in, player_state);
            } else {
                wait(3);
            }
        }

        wait_one_frame();
    }
}

function main() {
    function link_modifier(name: string, path: string) {
        LinkLuaModifier(name, path, LuaModifierType.LUA_MODIFIER_MOTION_NONE);
    }

    const mode = GameRules.GetGameModeEntity();

    mode.SetCustomGameForceHero("npc_dota_hero_chaos_knight");
    mode.SetFogOfWarDisabled(false);
    mode.SetUnseenFogOfWarEnabled(true);

    GameRules.SetPreGameTime(0);
    GameRules.SetCustomGameSetupAutoLaunchDelay(0);
    GameRules.SetCustomGameSetupTimeout(0);
    GameRules.SetCustomGameSetupRemainingTime(0);

    link_modifier("Modifier_Map_Unit", "modifiers/modifier_map_unit");
    link_modifier("Modifier_Battle_Unit", "modifiers/modifier_battle_unit");
    link_modifier("Modifier_Tide_Gush", "modifiers/modifier_tide_gush");
    link_modifier("Modifier_Damage_Effect", "modifiers/modifier_damage_effect");
    link_modifier("Modifier_Dragon_Knight_Elder_Dragon", "modifiers/modifier_dragon_knight_elder_dragon");
    link_modifier("Modifier_Lion_Hex", "modifiers/modifier_lion_hex");
    link_modifier("Modifier_Euls_Scepter", "modifiers/modifier_euls_scepter");
    link_modifier("Modifier_Activity_Translation", "modifiers/modifier_activity_translation");
    link_modifier("Modifier_Activity_Override", "modifiers/modifier_activity_override");

    if (IsInToolsMode()) {
        link_modifier("Modifier_Editor_Npc_Type", "modifiers/modifier_editor");
        link_modifier("Modifier_Editor_Adventure_Entity_Id", "modifiers/modifier_editor");
        link_modifier("Modifier_Editor_Adventure_Entity_Type", "modifiers/modifier_editor");
    }

    mode.SetContextThink("scheduler_think", () => {
        update_scheduler();
        return 0;
    }, 0);

    fork(game_loop);
}

function game_loop() {
    let player_id: PlayerID | undefined = undefined;
    let player_unit: CDOTA_BaseNPC_Hero | undefined = undefined;

    can_transition_into_next_state = true;

    const map: Map_State = {
        players: {},
        neutrals: {}
    };

    reinitialize_battle(...get_default_battleground_data());

    on_player_connected_async(id => player_id = id);

    while (player_id == undefined) wait_one_frame();

    print(`Player ${PlayerResource.GetSteamID(player_id).toString()} has connected`);

    PlayerResource.GetPlayer(player_id).SetTeam(DOTATeam_t.DOTA_TEAM_GOODGUYS);

    // We hope that hero spawn happens strictly after player connect, otherwise it doesn't make sense anyway
    on_player_hero_spawned_async(player_id, entity => player_unit = entity);
    while (player_unit == undefined) wait_one_frame();

    print(`Hero handle found`);

    const player: Main_Player = {
        remote_id: -1 as Player_Id,
        player_id: player_id,
        hero_unit: player_unit,
        movement_history: [],
        current_order_x: 0,
        current_order_y: 0,
    };

    const game: Game = {
        player: player,
        token: "",
        state: Player_State.not_logged_in,
        adventure: {
            entities: [],
            party: {
                currency: 0,
                heroes: [],
                minions: [],
                spells: []
            }
        }
    };

    update_game_net_table(game);

    fork(() => reconnect_loop(game));

    wait_until(() => game.state != Player_State.not_logged_in);

    on_player_order_async(order => {
        if (game.state == Player_State.on_adventure) {
            return process_player_adventure_order(game, order);
        }

        if (game.state == Player_State.on_global_map) {
            return process_player_global_map_order(game, map, order);
        }

        return false;
    });

    on_custom_event_async<Put_Deltas_Event>("put_battle_deltas", event => {
        merge_battle_deltas(battle, event.from_head, from_client_array(event.deltas));
        merge_delta_paths_from_client(battle, event.delta_paths);
    });

    on_custom_event_async<Fast_Forward_Event>("fast_forward", event => {
        fast_forward_from_snapshot(battle, {
            has_started: from_client_bool(event.has_started),
            players: from_client_array(event.players),
            units: from_client_array(event.units),
            runes: from_client_array(event.runes),
            shops: from_client_array(event.shops),
            trees: from_client_array(event.trees),
            delta_head: event.delta_head
        });

        update_game_net_table(game);
    });

    on_custom_event_async<Adventure_Interact_With_Entity_Event>("adventure_interact_with_entity", event => {
        if (game.state == Player_State.on_adventure) {
            adventure_interact_with_entity(game, event.entity_id);
        }
    });

    if (IsInToolsMode()) {
        SendToServerConsole("r_farz 10000");

        subscribe_to_editor_events(game);

        on_custom_event_async<Battle_Cheat_Event>("cheat", event => {
            use_cheat(battle, event.message);
        });
    }

    fork(() => submit_adventure_movement_loop(game));
    fork(() => adventure_update_loop(game));
    fork(() => submit_and_query_movement_loop(game, map));
    fork(() => {
        while(true) {
            const state_data = api_request_with_retry_on_403(Api_Request_Type.get_player_state, game, {
                access_token: game.token
            });

            if (state_data) {
                try_submit_state_transition(game, state_data);
            }

            wait(2);
        }
    });

    fork(() => {
        while(true) {
            update_main_player_movement_history(player);
            wait_one_frame();
        }
    });

    fork(() => {
        while(true) {
            if (game.state == Player_State.in_battle) {
                periodically_update_battle();
            }

            wait_one_frame();
        }
    });

    while (true) {
        if (state_transition) {
            wait_until(() => can_transition_into_next_state);
            process_state_transition(game, game.state, state_transition);
            state_transition = undefined;
        }

        switch (game.state) {
            case Player_State.on_global_map: {
                update_main_player_movement_history(player);

                break;
            }

            case Player_State.in_battle: {
                while (!battle.is_over) {
                    const target_head = get_battle_remote_head();

                    for (; battle.delta_head < target_head; battle.delta_head++) {
                        const delta = battle.deltas[battle.delta_head];

                        if (!delta) break;

                        print(`Playing delta ${enum_to_string(delta.type)} (#${battle.delta_head})`);

                        play_delta(game, battle, delta, battle.delta_head);
                        update_game_net_table(game);
                    }

                    wait_one_frame();
                }

                break;
            }
        }

        wait_one_frame();
    }
}