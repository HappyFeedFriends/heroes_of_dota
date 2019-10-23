type Editor_State = {
    map_revealed: boolean
    camera_unlocked: boolean
}

function on_editor_event(main_player: Main_Player, editor: Editor_State, event: Editor_Event) {
    function find_entity_by_entity_index(id: EntityID) {
        return array_find(main_player.adventure.entities, entity => entity.unit.entindex() == id);
    }

    switch (event.type) {
        case Editor_Event_Type.toggle_map_vision: {
            editor.map_revealed = !editor.map_revealed;
            GameRules.GetGameModeEntity().SetUnseenFogOfWarEnabled(!editor.map_revealed);

            break;
        }

        case Editor_Event_Type.toggle_camera_lock: {
            editor.camera_unlocked = !editor.camera_unlocked;

            if (editor.camera_unlocked) {
                PlayerResource.SetCameraTarget(0, undefined);
            } else {
                PlayerResource.SetCameraTarget(0, main_player.hero_unit);
            }

            break;
        }

        case Editor_Event_Type.delete_entity: {
            const entity = find_entity_by_entity_index(event.entity_id);
            if (!entity) break;

            api_request(Api_Request_Type.editor_action, {
                type: Editor_Action_Type.delete_entity,
                entity_id: entity.id,
                access_token: main_player.token
            });

            // TODO
            // query_other_entities_movement(main_player, map);

            break;
        }

        case Editor_Event_Type.add_enemy: {
            api_request(Api_Request_Type.editor_action, {
                type: Editor_Action_Type.add_enemy,
                npc_type: event.npc_type,
                position: event.position,
                facing: event.facing,
                access_token: main_player.token
            });

            break;
        }

        case Editor_Event_Type.edit_enemy: {
            const entity = find_entity_by_entity_index(event.entity_id);
            if (!entity) break;

            if (entity.type != Adventure_Entity_Type.enemy) break;

            entity.unit.SetForwardVector(Vector(event.facing.x, event.facing.y));

            api_request(Api_Request_Type.editor_action, {
                type: Editor_Action_Type.edit_enemy,
                entity_id: entity.id,
                npc_type: entity.npc_type,
                new_facing: event.facing,
                new_position: event.position,
                access_token: main_player.token
            });

            FindClearSpaceForUnit(entity.unit, Vector(event.position.x, event.position.y), true);

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

        case Editor_Event_Type.teleport: {
            FindClearSpaceForUnit(PlayerResource.GetSelectedHeroEntity(0), Vector(event.position.x, event.position.y), true);
            break;
        }

        case Editor_Event_Type.exit_adventure: {
            const new_state = api_request(Api_Request_Type.exit_adventure, {
                access_token: main_player.token,
                dedicated_server_key: get_dedicated_server_key()
            });

            if (new_state) {
                try_submit_state_transition(main_player, new_state);
            }

            break;
        }
    }
}

function subscribe_to_editor_events(main_player: Main_Player) {
    const state: Editor_State =  {
        map_revealed: false,
        camera_unlocked: false
    };

    on_custom_event_async<Editor_Event>("editor_event", event => on_editor_event(main_player, state, event));

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
