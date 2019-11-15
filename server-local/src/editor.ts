type Editor_State = {
    map_revealed: boolean
    camera_dummy: CDOTA_BaseNPC
}

function perform_editor_action(game: Game, editor: Editor_State, event: Editor_Action) {
    function find_entity_by_id(id: Adventure_Entity_Id) {
        return array_find(game.adventure.entities, entity => entity.id == id);
    }

    switch (event.type) {
        case Editor_Action_Type.toggle_map_vision: {
            editor.map_revealed = !editor.map_revealed;
            GameRules.GetGameModeEntity().SetUnseenFogOfWarEnabled(!editor.map_revealed);

            break;
        }

        case Editor_Action_Type.set_camera: {
            event.camera.free = from_client_bool(event.camera.free);

            if (event.camera.free) {
                set_camera_override(undefined, 0.15);
            } else {
                const look_at = get_camera_look_at_for_battle(battle.world_origin, event.camera.grid_size.x, event.camera.grid_size.y);
                editor.camera_dummy.SetAbsOrigin(look_at);

                set_camera_override(editor.camera_dummy, 0.15);

                AddFOWViewer(DOTATeam_t.DOTA_TEAM_GOODGUYS, look_at, 3000, 0.5, true);
            }

            break;
        }

        case Editor_Action_Type.delete_entity: {
            const entity = find_entity_by_id(event.entity_id);
            if (!entity) break;

            const ok = api_request(Api_Request_Type.editor_action, {
                type: Adventure_Editor_Action_Type.delete_entity,
                entity_id: entity.id,
                access_token: game.token
            });

            if (ok) {
                const index = array_find_index(game.adventure.entities, candidate => candidate == entity);

                if (index != -1) {
                    cleanup_adventure_entity(entity);

                    game.adventure.entities.splice(index, 1);
                }
            }

            break;
        }

        case Editor_Action_Type.create_entity: {
            const created_entity = api_request(Api_Request_Type.editor_create_entity, {
                definition: event.definition,
                access_token: game.token
            });

            if (created_entity) {
                game.adventure.entities.push(create_adventure_entity(created_entity));
            }

            break;
        }

        case Editor_Action_Type.set_entity_position: {
            const entity = find_entity_by_id(event.entity_id);
            if (!entity) break;
            if (!entity.alive) break;

            entity.spawn_position = event.position;

            FindClearSpaceForUnit(entity.handle, Vector(event.position.x, event.position.y), true);

            api_request(Api_Request_Type.editor_action, {
                type: Adventure_Editor_Action_Type.set_entity_position,
                entity_id: entity.id,
                new_position: event.position,
                access_token: game.token
            });

            break;
        }

        case Editor_Action_Type.set_entity_facing: {
            const entity = find_entity_by_id(event.entity_id);
            if (!entity) break;
            if (!entity.alive) break;

            entity.spawn_facing = event.facing;

            entity.handle.SetForwardVector(Vector(event.facing.x, event.facing.y));

            api_request(Api_Request_Type.editor_action, {
                type: Adventure_Editor_Action_Type.set_entity_facing,
                entity_id: entity.id,
                new_facing: event.facing,
                access_token: game.token
            });

            break;
        }

        case Editor_Action_Type.start_adventure: {
            const new_state = api_request(Api_Request_Type.start_adventure, {
                access_token: game.token,
                dedicated_server_key: get_dedicated_server_key(),
                adventure_id: event.adventure
            });

            if (new_state) {
                try_submit_state_transition(game, new_state);
            }

            break;
        }

        case Editor_Action_Type.teleport: {
            FindClearSpaceForUnit(PlayerResource.GetSelectedHeroEntity(0), Vector(event.position.x, event.position.y), true);
            break;
        }

        case Editor_Action_Type.exit_adventure: {
            const new_state = api_request(Api_Request_Type.exit_adventure, {
                access_token: game.token,
                dedicated_server_key: get_dedicated_server_key()
            });

            if (new_state) {
                try_submit_state_transition(game, new_state);
            }

            break;
        }
    }
}

function subscribe_to_editor_events(game: Game) {
    const camera_entity = CreateUnitByName("npc_dummy_unit", Vector(), true, null, null, DOTATeam_t.DOTA_TEAM_GOODGUYS);
    camera_entity.AddNewModifier(camera_entity, undefined, "Modifier_Dummy", {});

    const state: Editor_State =  {
        map_revealed: false,
        camera_dummy: camera_entity
    };

    on_custom_event_async(To_Server_Event_Type.editor_action, event => perform_editor_action(game, state, event));

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
