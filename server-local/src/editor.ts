type Editor_State = {
    map_revealed: boolean
    camera_dummy: CDOTA_BaseNPC
    battleground_entities: Indexed_Entities
    theme: Battleground_Theme
    auto_tree_id: Tree_Id
}

type Editor_Battleground_Entity = Battleground_Spawn & {
    handle: CBaseEntity
}

type Indexed_Entities = Record<number, Record<number, Editor_Battleground_Entity>>

function update_editor_battleground(editor: Editor_State, origin: Vector, theme: Battleground_Theme, spawns: Battleground_Spawn[]) {
    function set_entity_at(index: Indexed_Entities, xy: XY, spawn: Editor_Battleground_Entity) {
        let by_x = index[xy.x];

        if (!by_x) {
            by_x = {};
            index[xy.x] = by_x;
        }

        by_x[xy.y] = spawn;
    }

    function remove_entity_at(index: Indexed_Entities, xy: XY) {
        const by_x = index[xy.x];

        if (by_x) {
            delete by_x[xy.y];
        }
    }

    function entity_at(index: Indexed_Entities, xy: XY) {
        const by_x = index[xy.x];

        if (by_x) {
            return by_x[xy.y];
        }
    }

    function spawn_to_entity(spawn: Battleground_Spawn): Editor_Battleground_Entity {
        switch (spawn.type) {
            case Spawn_Type.monster: return {
                ...spawn,
                handle: create_world_handle_for_battle_unit(origin, { supertype: Unit_Supertype.monster }, spawn.at, spawn.facing)
            };

            case Spawn_Type.rune: return {
                ...spawn,
                handle: create_world_handle_for_rune(origin, Rune_Type.bounty, spawn.at)
            };

            case Spawn_Type.shop: return {
                ...spawn,
                handle: create_world_handle_for_shop(origin, spawn.shop_type, spawn.at, spawn.facing)
            };

            case Spawn_Type.tree: return {
                ...spawn,
                handle: create_world_handle_for_tree(origin, theme, 0, editor.auto_tree_id++ as Tree_Id, spawn.at)
            };
        }
    }

    function entities_are_essentially_the_same(left: Battleground_Spawn, right: Battleground_Spawn) {
        switch (left.type) {
            case Spawn_Type.tree: return theme == editor.theme && left.type == right.type;
            case Spawn_Type.rune: return left.type == right.type;
            case Spawn_Type.monster: return left.type == right.type;
            case Spawn_Type.shop: {
                if (left.type == right.type) {
                    return left.shop_type == right.shop_type;
                }

                return false;
            }
        }
    }

    const old_index = editor.battleground_entities;
    const new_index: Indexed_Entities = {};

    for (const spawn of spawns) {
        const existing_entity = entity_at(old_index, spawn.at);

        if (existing_entity && entities_are_essentially_the_same(existing_entity, spawn)) {
            remove_entity_at(old_index, existing_entity.at);
            set_entity_at(new_index, existing_entity.at, existing_entity);

            const world_location = battle_position_to_world_position_center(origin, spawn.at);
            existing_entity.handle.SetAbsOrigin(world_location);

            if (spawn.type == Spawn_Type.monster || spawn.type == Spawn_Type.shop) {
                existing_entity.handle.SetForwardVector(Vector(spawn.facing.x, spawn.facing.y));
            }
        } else {
            set_entity_at(new_index, spawn.at, spawn_to_entity(spawn));
        }
    }

    for (const x in old_index) {
        const by_x = old_index[x];

        if (by_x) {
            for (const y in by_x) {
                const entity = by_x[y];

                if (entity) {
                    entity.handle.RemoveSelf();
                }
            }
        }
    }

    editor.theme = theme;
    editor.battleground_entities = new_index;
}

function perform_editor_action(game: Game, editor: Editor_State, event: Editor_Action) {
    function find_entity_by_id(id: Adventure_Entity_Id) {
        return array_find(game.adventure.entities, entity => entity.base.id == id);
    }

    function find_entity_index_by_id(id: Adventure_Entity_Id) {
        return array_find_index(game.adventure.entities, entity => entity.base.id == id);
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
                const origin = event.camera.world_origin;
                const look_at = get_camera_look_at_for_battle(Vector(origin.x, origin.y, origin.z), event.camera.grid_size.x, event.camera.grid_size.y);
                editor.camera_dummy.SetAbsOrigin(look_at);

                set_camera_override(editor.camera_dummy, 0.15);

                AddFOWViewer(DOTATeam_t.DOTA_TEAM_GOODGUYS, look_at, 3000, 0.5, true);
            }

            break;
        }

        case Editor_Action_Type.move_camera: {
            editor_set_camera_location_to_point_blocking(game.player.player_id, Vector(event.to.x, event.to.y, event.to.z));

            break;
        }

        case Editor_Action_Type.delete_entity: {
            const index = find_entity_index_by_id(event.entity_id);
            if (index == -1) break;

            const entity = game.adventure.entities[index];

            cleanup_adventure_entity(entity);

            game.adventure.entities.splice(index, 1);

            api_request(Api_Request_Type.editor_action, {
                type: Adventure_Editor_Action_Type.delete_entity,
                entity_id: entity.base.id,
                access_token: game.token
            });

            break;
        }

        case Editor_Action_Type.create_entity: {
            const created_entity = api_request(Api_Request_Type.editor_create_entity, {
                definition: event.definition,
                access_token: game.token
            });

            if (created_entity) {
                game.adventure.entities.push(create_adventure_entity(created_entity));

                update_adventure_net_table(game.adventure);
            }

            break;
        }

        case Editor_Action_Type.set_entity_position: {
            const entity = find_entity_by_id(event.entity_id);
            if (!entity) break;

            entity.base.spawn_position = event.position;

            switch (entity.type) {
                case Adventure_Entity_Type.shrine: {
                    FindClearSpaceForUnit(entity.handle, Vector(event.position.x, event.position.y), true);
                    entity.obstruction.RemoveSelf();
                    entity.obstruction = setup_building_obstruction(entity.handle);

                    break;
                }

                default: {
                    if (entity.type == Adventure_Entity_Type.merchant || entity.alive) {
                        FindClearSpaceForUnit(entity.handle, Vector(event.position.x, event.position.y), true);
                    }

                    break;
                }
            }

            api_request(Api_Request_Type.editor_action, {
                type: Adventure_Editor_Action_Type.set_entity_position,
                entity_id: entity.base.id,
                new_position: event.position,
                access_token: game.token
            });

            break;
        }

        case Editor_Action_Type.set_entity_facing: {
            const entity = find_entity_by_id(event.entity_id);
            if (!entity) break;

            entity.base.spawn_facing = event.facing;

            function set_unit_facing_fast(handle: CDOTA_BaseNPC, facing: XY) {
                // SetForwardVector + FaceTowards achieves both fast and correct rotation
                handle.SetForwardVector(Vector(facing.x, facing.y));
                handle.FaceTowards(handle.GetAbsOrigin() + Vector(facing.x, facing.y) as Vector);
            }

            switch (entity.type) {
                case Adventure_Entity_Type.shrine: {
                    set_unit_facing_fast(entity.handle, event.facing);
                    break;
                }

                default: {
                    if (entity.type == Adventure_Entity_Type.merchant || entity.alive) {
                        set_unit_facing_fast(entity.handle, event.facing);
                    }

                    break;
                }
            }

            api_request(Api_Request_Type.editor_action, {
                type: Adventure_Editor_Action_Type.set_entity_facing,
                entity_id: entity.base.id,
                new_facing: event.facing,
                access_token: game.token
            });

            break;
        }

        case Editor_Action_Type.edit_item_data: {
            const entity = find_entity_by_id(event.entity_id);
            if (!entity) break;
            if (entity.type != Adventure_Entity_Type.item_on_the_ground) break;

            api_request(Api_Request_Type.editor_action, {
                type: Adventure_Editor_Action_Type.set_item_data,
                entity_id: entity.base.id,
                item: event.item,
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

        case Editor_Action_Type.submit_battleground: {
            const origin = Vector(event.origin.x, event.origin.y, event.origin.z);

            update_editor_battleground(editor, origin, event.theme, from_client_array(event.spawns));

            break;
        }

        case Editor_Action_Type.playtest_battleground: {
            const new_state = api_request(Api_Request_Type.editor_playtest_battleground, {
                battleground: event.battleground,
                enemy: event.enemy,
                access_token: game.token
            });

            if (new_state) {
                try_submit_state_transition(game, new_state);
            }

            break;
        }

        default: unreachable(event);
    }
}

function subscribe_to_editor_events(game: Game) {
    const camera_entity = CreateUnitByName("npc_dummy_unit", Vector(), true, null, null, DOTATeam_t.DOTA_TEAM_GOODGUYS);
    camera_entity.AddNewModifier(camera_entity, undefined, "Modifier_Dummy", {});

    const state: Editor_State =  {
        map_revealed: false,
        camera_dummy: camera_entity,
        battleground_entities: [],
        theme: Battleground_Theme.forest,
        auto_tree_id: 0 as Tree_Id
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
