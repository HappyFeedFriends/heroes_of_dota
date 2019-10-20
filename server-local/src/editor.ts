type Editor_State = {
    map_revealed: boolean
    camera_unlocked: boolean
}

function on_editor_event(main_player: Main_Player, map: Map_State, state: Editor_State, event: Editor_Event) {
    function find_npc_by_entity_id(id: EntityID) {
        for (const npc_id in map.neutrals) {
            const npc = map.neutrals[npc_id as Npc_Id];

            if (npc.unit.entindex() == id) {
                return npc;
            }
        }
    }

    switch (event.type) {
        case Editor_Event_Type.toggle_map_vision: {
            state.map_revealed = !state.map_revealed;
            GameRules.GetGameModeEntity().SetUnseenFogOfWarEnabled(!state.map_revealed);

            break;
        }

        case Editor_Event_Type.toggle_camera_lock: {
            state.camera_unlocked = !state.camera_unlocked;

            if (state.camera_unlocked) {
                PlayerResource.SetCameraTarget(0, undefined);
            } else {
                PlayerResource.SetCameraTarget(0, main_player.hero_unit);
            }

            break;
        }

        case Editor_Event_Type.delete_npc: {
            const npc = find_npc_by_entity_id(event.entity_id);
            if (!npc) break;

            api_request(Api_Request_Type.editor_delete_npc, {
                npc_id: npc.id,
                access_token: main_player.token,
                dedicated_server_key: get_dedicated_server_key()
            });

            query_other_entities_movement(main_player, map);

            break;
        }

        case Editor_Event_Type.add_npc: {
            api_request(Api_Request_Type.editor_add_npc, {
                npc_type: event.npc_type,
                position: event.position,
                facing: event.facing,
                access_token: main_player.token,
                dedicated_server_key: get_dedicated_server_key()
            });

            break;
        }

        case Editor_Event_Type.edit_npc: {
            const npc = find_npc_by_entity_id(event.entity_id);
            if (!npc) break;

            FindClearSpaceForUnit(npc.unit, Vector(event.position.x, event.position.y), true);
            npc.unit.SetForwardVector(Vector(event.facing.x, event.facing.y));

            api_request(Api_Request_Type.editor_edit_npc, {
                npc_id: npc.id,
                npc_type: npc.type,
                new_facing: event.facing,
                new_position: event.position,
                access_token: main_player.token,
                dedicated_server_key: get_dedicated_server_key()
            });

            break;
        }

        case Editor_Event_Type.start_adventure: {
            const new_state = api_request(Api_Request_Type.start_adventure, {
                access_token: main_player.token,
                dedicated_server_key: get_dedicated_server_key(),
                adventure_id: event.adventure
            });

            if (new_state) {
                try_submit_state_transition(main_player, new_state);
            }

            break;
        }
    }
}

function subscribe_to_editor_events(main_player: Main_Player, map: Map_State) {
    const state: Editor_State =  {
        map_revealed: false,
        camera_unlocked: false
    };

    on_custom_event_async<Editor_Event>("editor_event", event => on_editor_event(main_player, map, state, event));

    fork(() => {
        while (true) {
            if (state.map_revealed) {
                const radius = 3000;
                const entity = PlayerResource.GetSelectedHeroEntity(0);
                const center = entity.GetAbsOrigin();

                for (let x = -3; x < 3; x++) {
                    for (let y = -3; y < 3; y++) {
                        AddFOWViewer(DOTATeam_t.DOTA_TEAM_GOODGUYS, center + Vector(x * radius, y * radius) as Vector, radius, 1, false);
                    }
                }
            }

            wait(1);
        }
    })
}
