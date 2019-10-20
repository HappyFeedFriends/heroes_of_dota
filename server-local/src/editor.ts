type Editor_State = {
    camera_unlocked: boolean
}

function on_editor_event(main_player: Main_Player, map: Map_State, state: Editor_State, event: Editor_Event) {
    switch (event.type) {
        case Editor_Event_Type.toggle_map_vision: {
            const mode = GameRules.GetGameModeEntity();
            const state = !mode.GetFogOfWarDisabled();
            mode.SetFogOfWarDisabled(state);
            mode.SetUnseenFogOfWarEnabled(state);

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

        case Editor_Event_Type.edit_npc: {
            for (const npc_id in map.neutrals) {
                const npc = map.neutrals[npc_id as Npc_Id];

                if (npc.unit.entindex() == event.entity_id) {
                    FindClearSpaceForUnit(npc.unit, Vector(event.position.x, event.position.y), true);
                    npc.unit.SetForwardVector(Vector(event.facing.x, event.facing.y));

                    api_request(Api_Request_Type.editor_edit_npc, {
                        npc_id: npc.id,
                        npc_type: event.npc_type,
                        new_facing: event.facing,
                        new_position: event.position,
                        access_token: main_player.token,
                        dedicated_server_key: get_dedicated_server_key()
                    });

                    break;
                }
            }

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
        camera_unlocked: false
    };

    on_custom_event_async<Editor_Event>("editor_event", event => on_editor_event(main_player, map, state, event));
}
