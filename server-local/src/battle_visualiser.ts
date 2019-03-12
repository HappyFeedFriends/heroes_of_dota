type XY = {
    x: number,
    y: number
}

type Battle = {
    players: Battle_Player[],
    deltas: Delta[];
    delta_paths: Move_Delta_Paths;
    delta_head: number;
    world_origin: Vector;
    units: Battle_Unit[];
    grid_size: {
        width: number,
        height: number
    };
    camera_dummy: CDOTA_BaseNPC;
    modifier_id_to_modifier_data: { [modifier_id: number]: Modifier_Data }
}

type Battle_Unit = Shared_Visualizer_Unit_Data & {
    type: Unit_Type;
    owner_remote_id: number
    handle: CDOTA_BaseNPC_Hero;
    position: XY;
    is_playing_a_delta: boolean;
}

declare const enum Shake {
    weak = 0,
    medium = 1,
    strong = 2
}

type Ranged_Attack_Spec = {
    particle_path: string;
    projectile_speed: number;
    attack_point: number;
    shake_on_attack?: Shake;
    shake_on_impact?: Shake;
}

type Modifier_Data = {
    unit_id: number
    modifier_name: string
}

declare let battle: Battle;

const battle_cell_size = 128;

function get_battle_cell_size(): number {
    return battle_cell_size;
}

function get_battle_remote_head(): number {
    return table.maxn(battle.deltas);
}

function find_unit_by_id(id: number): Battle_Unit | undefined {
    return array_find(battle.units, unit => unit.id == id);
}

function manhattan(from: XY, to: XY) {
    return Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
}

// TODO utilize this for responsiveness
function pre_visualize_action(action: Turn_Action) {
    switch (action.type) {
        // case Action_Type.attack: {
        //     const unit = find_unit_by_id(action.unit_id);
        //
        //     if (unit && !unit.is_playing_a_delta) {
        //         unit.handle.FaceTowards(battle_position_to_world_position_center(action.to));
        //     }
        //
        //     break;
        // }

        case Action_Type.move: {
            const unit = find_unit_by_id(action.unit_id);

            if (unit && !unit.is_playing_a_delta) {
                // const path = find_grid_path(unit.position, action.to);
                //
                // if (!path) {
                //     print("Couldn't find path");
                //     return;
                // }
                //
                // unit.handle.FaceTowards(battle_position_to_world_position_center(path[0]));
            }

            break;
        }
    }
}

function merge_battle_deltas(head_before_merge: number, deltas: Delta[]) {
    for (let index = 0; index < deltas.length; index++) {
        battle.deltas[head_before_merge + index] = deltas[index];
    }

    print("Merged", deltas.length, "deltas from head", head_before_merge, "new head", get_battle_remote_head());
}

function merge_delta_paths_from_client(delta_paths: Move_Delta_Paths) {
    for (const delta_index_string in delta_paths) {
        const delta_index = tonumber(delta_index_string);

        battle.delta_paths[delta_index] = from_client_array(delta_paths[delta_index_string]);
    }
}

function battle_position_to_world_position_center(position: { x: number, y: number }): Vector {
    return Vector(
        battle.world_origin.x + position.x * battle_cell_size + battle_cell_size / 2,
        battle.world_origin.y + position.y * battle_cell_size + battle_cell_size / 2
    )
}

function shake_screen(at: XY, strength: Shake) {
    const at_world = battle_position_to_world_position_center(at);

    switch (strength) {
        case Shake.weak: {
            ScreenShake(at_world, 5, 50, 0.15, 2000, 0, true);
            break;
        }

        case Shake.medium: {
            ScreenShake(at_world, 5, 100, 0.35, 3000, 0, true);
            break;
        }
        
        case Shake.strong: {
            ScreenShake(at_world, 5, 150, 0.75, 4000, 0, true);
            break;
        }

        default: unreachable(strength);
    }
}

function unit_type_to_dota_unit_name(unit_type: Unit_Type) {
    switch (unit_type) {
        case Unit_Type.ursa: return "npc_dota_hero_ursa";
        case Unit_Type.pudge: return "npc_dota_hero_pudge";
        case Unit_Type.sniper: return "npc_dota_hero_sniper";
        case Unit_Type.tidehunter: return "npc_dota_hero_tidehunter";
        case Unit_Type.luna: return "npc_dota_hero_luna";

        default: return unreachable(unit_type);
    }
}

function spawn_unit_for_battle(unit_type: Unit_Type, unit_id: number, owner_id: number, at: XY, facing: XY): Battle_Unit {
    const definition = unit_definition_by_type(unit_type);
    const world_location = battle_position_to_world_position_center(at);
    const handle = CreateUnitByName(unit_type_to_dota_unit_name(unit_type), world_location, true, null, null, DOTATeam_t.DOTA_TEAM_GOODGUYS) as CDOTA_BaseNPC_Hero;
    handle.SetControllableByPlayer(0, true);
    handle.SetBaseMoveSpeed(500);
    handle.AddNewModifier(handle, undefined, "Modifier_Battle_Unit", {});
    handle.SetForwardVector(Vector(facing.x, facing.y));

    const unit: Battle_Unit = {
        handle: handle,
        id: unit_id,
        type: unit_type,
        position: at,
        owner_remote_id: owner_id,
        is_playing_a_delta: false,
        level: 1,
        health: definition.health,
        mana: definition.mana,
        max_health: definition.health,
        max_mana: definition.mana,
        attack_bonus: 0,
        stunned_counter: 0,
        move_points: definition.move_points,
        max_move_points: definition.move_points
    };

    battle.units.push(unit);

    return unit;
}

function tracking_projectile_to_unit(source: Battle_Unit, target: Battle_Unit, particle_path: string, speed: number, out_attach: string = "attach_attack1") {
    const in_attach = "attach_hitloc";
    const particle = fx(particle_path)
        .to_unit_attach_point(0, source, out_attach)
        .to_unit_attach_point(1, target, in_attach)
        .with_point_value(2, speed)
        .to_unit_attach_point(3, target, in_attach);

    const world_distance = (attachment_world_origin(source.handle, out_attach) - attachment_world_origin(target.handle, in_attach) as Vector).Length();

    wait(world_distance / speed);

    particle.destroy_and_release(false);
}

function tracking_projectile_to_point(source: Battle_Unit, target: XY, particle_path: string, speed: number) {
    const out_attach = "attach_attack1";
    const world_location = battle_position_to_world_position_center(target) + Vector(0, 0, 128) as Vector;

    const particle = fx(particle_path)
        .to_unit_attach_point(0, source, out_attach)
        .with_vector_value(1, world_location)
        .with_point_value(2, speed)
        .with_vector_value(3, world_location);

    const world_distance = (attachment_world_origin(source.handle, out_attach) - world_location as Vector).Length();

    wait(world_distance / speed);

    particle.destroy_and_release(false);
}

function pudge_hook(main_player: Main_Player, pudge: Battle_Unit, cast: Delta_Ability_Pudge_Hook) {
    function is_hook_hit(
        cast: Delta_Ability_Pudge_Hook_Deltas_Hit | Delta_Ability_Line_Ability_Miss
    ): cast is Delta_Ability_Pudge_Hook_Deltas_Hit {
        return cast.hit as any as number == 1; // Panorama passes booleans this way, meh
    }

    const target = cast.target_position;
    const hook_offset = Vector(0, 0, 96);
    const pudge_origin = pudge.handle.GetAbsOrigin() + hook_offset as Vector;
    const travel_direction = Vector(target.x - pudge.position.x, target.y - pudge.position.y).Normalized();
    const travel_speed = 1600;

    let travel_target: XY;

    if (is_hook_hit(cast.result)) {
        const [damage] = from_client_tuple(cast.result.deltas);
        const target = find_unit_by_id(damage.target_unit_id);

        if (!target) {
            log_chat_debug_message("Error, Pudge DAMAGE TARGET not found");
            return;
        }

        travel_target = target.position;
    } else {
        travel_target = cast.result.final_point;
    }

    turn_unit_towards_target(pudge, target);

    const chain_sound = "Hero_Pudge.AttackHookExtend";
    const hook_wearable = pudge.handle.GetTogglableWearable(DOTASlotType_t.DOTA_LOADOUT_TYPE_WEAPON);

    pudge.handle.StartGesture(GameActivity_t.ACT_DOTA_OVERRIDE_ABILITY_1);
    pudge.handle.EmitSound(chain_sound);

    hook_wearable.AddEffects(Effects.EF_NODRAW);

    wait(0.15);

    const distance_to_travel = battle_cell_size * Math.max(Math.abs(travel_target.x - pudge.position.x), Math.abs(travel_target.y - pudge.position.y));
    const time_to_travel = distance_to_travel / travel_speed;

    const chain = fx("particles/units/heroes/hero_pudge/pudge_meathook.vpcf")
        .to_unit_attach_point(0, pudge, "attach_weapon_chain_rt")
        .with_vector_value(1, pudge_origin + travel_direction * distance_to_travel as Vector)
        .with_point_value(2, travel_speed, distance_to_travel, 64)
        .with_point_value(3, time_to_travel * 2)
        .with_point_value(4, 1)
        .with_point_value(5)
        .to_unit_custom_origin(7, pudge);

    if (is_hook_hit(cast.result)) {
        const [damage, move] = from_client_tuple(cast.result.deltas);
        const target = find_unit_by_id(damage.target_unit_id);

        if (!target) {
            log_chat_debug_message("Error, Pudge DAMAGE TARGET not found");
            return;
        }

        wait(time_to_travel);
        play_delta(main_player, damage);

        pudge.handle.StopSound(chain_sound);

        unit_emit_sound(target, "Hero_Pudge.AttackHookImpact");
        unit_emit_sound(target, chain_sound);

        target.handle.StartGesture(GameActivity_t.ACT_DOTA_FLAIL);

        const move_target = find_unit_by_id(move.unit_id);

        if (!move_target) {
            log_chat_debug_message("Error, Pudge MOVE TARGET not found");
            return;
        }

        fx("particles/units/heroes/hero_pudge/pudge_meathook_impact.vpcf")
            .to_unit_attach_point(0, move_target, "attach_hitloc")
            .release();

        chain.to_unit_attach_point(1, move_target, "attach_hitloc", move_target.handle.GetOrigin() + hook_offset as Vector);

        const travel_start_time = GameRules.GetGameTime();
        const target_world_position = battle_position_to_world_position_center(move.to_position);
        const travel_position_start = move_target.handle.GetAbsOrigin();
        const travel_position_finish = GetGroundPosition(Vector(target_world_position.x, target_world_position.y), move_target.handle);

        while (true) {
            const now = GameRules.GetGameTime();
            const progress = Math.min(1, (now - travel_start_time) / time_to_travel);
            const travel_position = (travel_position_finish - travel_position_start) * progress + travel_position_start as Vector;

            move_target.handle.SetAbsOrigin(travel_position);

            if (now >= travel_start_time + time_to_travel) {
                break;
            }

            wait_one_frame();
        }

        target.handle.StopSound(chain_sound);
        target.handle.FadeGesture(GameActivity_t.ACT_DOTA_FLAIL);

        move_target.position = move.to_position;
    } else {
        wait(time_to_travel);

        chain.with_vector_value(1, pudge_origin);

        pudge.handle.StopSound(chain_sound);
        EmitSoundOnLocationWithCaster(battle_position_to_world_position_center(travel_target), "Hero_Pudge.AttackHookRetractStop", pudge.handle);

        wait(time_to_travel);
    }

    hook_wearable.RemoveEffects(Effects.EF_NODRAW);
    pudge.handle.FadeGesture(GameActivity_t.ACT_DOTA_OVERRIDE_ABILITY_1);

    chain.release();
}

function tide_ravage(main_player: Main_Player, unit: Battle_Unit, cast: Delta_Ability_Tide_Ravage) {
    unit.handle.StartGesture(GameActivity_t.ACT_DOTA_CAST_ABILITY_4);

    wait(0.1);

    unit_emit_sound(unit, "Ability.Ravage");
    shake_screen(unit.position, Shake.strong);

    const fx = fx_by_unit("particles/tide_ravage/tide_ravage.vpcf", unit);
    const particle_delay = 0.1;
    const deltas_by_distance: Delta_Modifier_Applied<Ability_Effect_Tide_Ravage>[][] = [];
    const deltas = from_client_array(cast.deltas);

    for (let distance = 1; distance <= 5; distance++) {
        fx.with_point_value(distance, distance * battle_cell_size * 0.85);
    }

    fx.release();

    for (const delta of deltas) {
        const target = find_unit_by_id(delta.target_unit_id);

        if (!target) {
            log_chat_debug_message(`Target with id ${delta.target_unit_id} not found`);
            continue;
        }

        const from = target.position;
        const to = unit.position;
        const manhattan_distance = Math.abs(from.x - to.x) + Math.abs(from.y - to.y);

        let by_distance = deltas_by_distance[manhattan_distance];

        if (!by_distance) {
            by_distance = [];
            deltas_by_distance[manhattan_distance] = by_distance;
        }

        by_distance.push(delta);
    }

    function toss_target_up(target: Battle_Unit) {
        const toss_start_time = GameRules.GetGameTime();
        const toss_time = 0.4;
        const start_origin = target.handle.GetAbsOrigin();

        target.handle.StartGesture(GameActivity_t.ACT_DOTA_FLAIL);

        while (true) {
            const now = GameRules.GetGameTime();
            const progress = Math.min(1, (now - toss_start_time) / toss_time);
            const current_height = Math.sin(progress * Math.PI) * 260;

            target.handle.SetAbsOrigin(start_origin + Vector(0, 0, current_height) as Vector);

            if (now >= toss_start_time + toss_time) {
                break;
            }

            wait_one_frame();
        }

        target.handle.FadeGesture(GameActivity_t.ACT_DOTA_FLAIL);
    }

    let delta_id_counter = 0;

    const delta_completion_status: boolean[] = [];

    for (let distance = 1; distance <= 5; distance++) {
        const by_distance = deltas_by_distance[distance];

        if (!by_distance) continue;

        for (const delta of by_distance) {
            const effect = delta.effect;

            const [damage, stun] = from_client_tuple(effect.deltas);
            const target = find_unit_by_id(damage.target_unit_id);

            if (!target) {
                log_chat_debug_message(`Unit with id ${damage.target_unit_id} not found`);
                return;
            }

            const delta_id = delta_id_counter++;

            delta_completion_status[delta_id] = false;

            fork(() => {
                fx_by_unit("particles/units/heroes/hero_tidehunter/tidehunter_spell_ravage_hit.vpcf", target).release();
                unit_emit_sound(target, "Hero_Tidehunter.RavageDamage");
                toss_target_up(target);

                delta_completion_status[delta_id] = true;
            });

            play_delta(main_player, damage);
            play_delta(main_player, stun);
        }

        wait(particle_delay);
    }

    unit.handle.FadeGesture(GameActivity_t.ACT_DOTA_CAST_ABILITY_4);

    wait_until(() => delta_completion_status.every(value => value));
}

function get_ranged_attack_spec(type: Unit_Type): Ranged_Attack_Spec | undefined {
    switch (type) {
        case Unit_Type.sniper: return {
            particle_path: "particles/units/heroes/hero_sniper/sniper_base_attack.vpcf",
            projectile_speed: 1600,
            attack_point: 0.1,
            shake_on_attack: Shake.weak
        };

        case Unit_Type.luna: return {
            particle_path: "particles/units/heroes/hero_luna/luna_moon_glaive.vpcf",
            projectile_speed: 900,
            attack_point: 0.4
        };
    }
}

function get_unit_deny_voice_line(type: Unit_Type): string | undefined {
    switch (type) {
        case Unit_Type.pudge: return "vo_pudge_deny";
        case Unit_Type.tidehunter: return "vo_tidehunter_deny";
        case Unit_Type.luna: return "vo_luna_deny";
        case Unit_Type.sniper: return "vo_sniper_deny";
    }
}

function try_play_sound_for_unit(unit: Battle_Unit, supplier: (type: Unit_Type) => string | undefined, target: Battle_Unit = unit) {
    const sound = supplier(unit.type);

    if (sound) {
        unit_emit_sound(target, sound);
    }
}

function perform_basic_attack(main_player: Main_Player, unit: Battle_Unit, cast: Delta_Ability_Basic_Attack) {
    const target = cast.target_position;

    function get_unit_pre_attack_sound(type: Unit_Type): string | undefined {
        switch (type) {
            case Unit_Type.pudge: return "Hero_Pudge.PreAttack";
            case Unit_Type.ursa: return "Hero_Ursa.PreAttack";
            case Unit_Type.tidehunter: return "hero_tidehunter.PreAttack";
        }
    }

    function get_unit_attack_sound(type: Unit_Type): string | undefined {
        switch (type) {
            case Unit_Type.pudge: return "Hero_Pudge.Attack";
            case Unit_Type.ursa: return "Hero_Ursa.Attack";
            case Unit_Type.sniper: return "Hero_Sniper.attack";
            case Unit_Type.luna: return "Hero_Luna.Attack";
            case Unit_Type.tidehunter: return "hero_tidehunter.Attack";
        }
    }

    function get_unit_ranged_impact_sound(type: Unit_Type): string | undefined {
        switch (type) {
            case Unit_Type.sniper: return "Hero_Sniper.ProjectileImpact";
            case Unit_Type.luna: return "Hero_Luna.ProjectileImpact";
        }
    }

    function get_unit_attack_vo(type: Unit_Type): string | undefined {
        switch (type) {
            case Unit_Type.sniper: return "vo_sniper_attack";
            case Unit_Type.luna: return "vo_luna_attack";
            case Unit_Type.pudge: return "vo_pudge_attack";
            case Unit_Type.tidehunter: return "vo_tide_attack";
        }
    }

    const ranged_attack_spec = get_ranged_attack_spec(unit.type);

    function is_attack_hit(
        cast: Delta_Ability_Basic_Attack_Deltas_Hit | Delta_Ability_Line_Ability_Miss
    ): cast is Delta_Ability_Basic_Attack_Deltas_Hit {
        return cast.hit as any as number == 1; // Panorama passes booleans this way, meh
    }

    if (ranged_attack_spec) {
        try_play_sound_for_unit(unit, get_unit_attack_vo);
        turn_unit_towards_target(unit, target);
        wait(0.2);
        try_play_sound_for_unit(unit, get_unit_pre_attack_sound);
        unit_play_activity(unit, GameActivity_t.ACT_DOTA_ATTACK, ranged_attack_spec.attack_point);
        try_play_sound_for_unit(unit, get_unit_attack_sound);

        if (ranged_attack_spec.shake_on_attack) {
            shake_screen(unit.position, ranged_attack_spec.shake_on_attack);
        }

        if (is_attack_hit(cast.result)) {
            const delta = cast.result.delta;
            const target_unit = find_unit_by_id(delta.target_unit_id);

            if (!target_unit) {
                log_chat_debug_message(`Error: unit ${delta.target_unit_id} not found`);
                return;
            }

            tracking_projectile_to_unit(unit, target_unit, ranged_attack_spec.particle_path, ranged_attack_spec.projectile_speed);
            play_delta(main_player, delta);
            try_play_sound_for_unit(unit, get_unit_ranged_impact_sound, target_unit);

            if (ranged_attack_spec.shake_on_impact) {
                shake_screen(target_unit.position, ranged_attack_spec.shake_on_impact);
            }
        } else {
            tracking_projectile_to_point(unit, cast.result.final_point, ranged_attack_spec.particle_path, ranged_attack_spec.projectile_speed);
        }
    } else {
        try_play_sound_for_unit(unit, get_unit_attack_vo);
        turn_unit_towards_target(unit, target);
        wait(0.2);
        try_play_sound_for_unit(unit, get_unit_pre_attack_sound);
        unit_play_activity(unit, GameActivity_t.ACT_DOTA_ATTACK);

        if (is_attack_hit(cast.result)) {
            play_delta(main_player, cast.result.delta);
            shake_screen(target, Shake.weak);
            try_play_sound_for_unit(unit, get_unit_attack_sound);
        }
    }
}

function attachment_world_origin(unit: CDOTA_BaseNPC, attachment_name: string) {
    return unit.GetAttachmentOrigin(unit.ScriptLookupAttachment(attachment_name));
}

function play_ground_target_ability_delta(main_player: Main_Player, unit: Battle_Unit, cast: Delta_Ground_Target_Ability) {
    switch (cast.ability_id) {
        case Ability_Id.basic_attack: {
            perform_basic_attack(main_player, unit, cast);
            break;
        }

        case Ability_Id.pudge_hook: {
            pudge_hook(main_player, unit, cast);
            break;
        }

        default: unreachable(cast);
    }
}

function apply_and_record_modifier(target: Battle_Unit, modifier_id: number, modifier_name: string) {
    print("Apply and record", modifier_id, modifier_name, "to", target.handle.GetName());
    target.handle.AddNewModifier(target.handle, undefined, modifier_name, {});
    battle.modifier_id_to_modifier_data[modifier_id] = {
        unit_id: target.id,
        modifier_name: modifier_name
    };
}

function unit_emit_sound(unit: Battle_Unit, sound: string) {
    unit.handle.EmitSound(sound);
}

function play_unit_target_ability_delta(main_player: Main_Player, unit: Battle_Unit, cast: Delta_Unit_Target_Ability, target: Battle_Unit) {
    turn_unit_towards_target(unit, target.position);

    switch (cast.ability_id) {
        case Ability_Id.pudge_dismember: {
            unit_play_activity(unit, GameActivity_t.ACT_DOTA_CHANNEL_ABILITY_4);

            play_delta(main_player, cast.damage_delta);
            play_delta(main_player, cast.heal_delta);

            break;
        }

        case Ability_Id.tide_gush: {
            const fx = "particles/units/heroes/hero_tidehunter/tidehunter_gush.vpcf";

            unit_play_activity(unit, GameActivity_t.ACT_DOTA_CAST_ABILITY_1, 0.2);
            unit_emit_sound(unit, "Ability.GushCast");
            tracking_projectile_to_unit(unit, target, fx, 3000, "attach_attack2");
            unit_emit_sound(unit, "Ability.GushImpact");
            shake_screen(target.position, Shake.medium);

            const modifier_delta = cast.delta;
            const [damage] = from_client_tuple(modifier_delta.effect.deltas);

            apply_and_record_modifier(target, modifier_delta.modifier_id, "Modifier_Tide_Gush");

            play_delta(main_player, damage);

            break;
        }

        case Ability_Id.luna_lucent_beam: {
            unit_emit_sound(unit, "Hero_Luna.LucentBeam.Cast");
            unit_play_activity(unit, GameActivity_t.ACT_DOTA_CAST_ABILITY_1, 0.6);

            fx("particles/units/heroes/hero_luna/luna_lucent_beam.vpcf")
                .to_unit_origin(0, target)
                .to_unit_origin(1, target)
                .to_unit_origin(5, target)
                .to_unit_origin(6, unit)
                .release();

            shake_screen(target.position, Shake.medium);
            unit_emit_sound(unit, "Hero_Luna.LucentBeam.Target");
            play_delta(main_player, cast.delta);

            break;
        }

        default: unreachable(cast);
    }
}

function play_no_target_ability_delta(main_player: Main_Player, unit: Battle_Unit, cast: Delta_Use_No_Target_Ability) {
    switch (cast.ability_id) {
        case Ability_Id.pudge_rot: {
            const particle = fx("particles/units/heroes/hero_pudge/pudge_rot.vpcf")
                .follow_unit_origin(0, unit)
                .with_point_value(1, 300, 1, 1);
            
            const sound = "pudge_ability_rot";

            unit.handle.StartGesture(GameActivity_t.ACT_DOTA_CAST_ABILITY_ROT);
            unit.handle.EmitSound(sound);

            wait(0.2);

            for (const delta of from_client_array(cast.deltas)) {
                play_delta(main_player, delta);
            }

            wait(1.0);

            unit.handle.StopSound(sound);
            unit.handle.FadeGesture(GameActivity_t.ACT_DOTA_CAST_ABILITY_ROT);

            particle.destroy_and_release(false);

            break;
        }

        case Ability_Id.tide_anchor_smash: {
            unit.handle.StartGesture(GameActivity_t.ACT_DOTA_CAST_ABILITY_3);

            wait(0.2);

            fx_by_unit("particles/units/heroes/hero_tidehunter/tidehunter_anchor_hero.vpcf", unit).release();
            unit_emit_sound(unit, "Hero_Tidehunter.AnchorSmash");
            shake_screen(unit.position, Shake.weak);

            wait(0.2);

            for (const delta of from_client_array(cast.deltas)) {
                for (const effect of from_client_tuple(delta.effect.deltas)) {
                    play_delta(main_player, effect);
                }
            }

            wait(1);

            unit.handle.FadeGesture(GameActivity_t.ACT_DOTA_CAST_ABILITY_3);

            break;
        }

        case Ability_Id.tide_ravage: {
            tide_ravage(main_player, unit, cast);

            break;
        }

        case Ability_Id.luna_eclipse: {
            const day_time = GameRules.GetTimeOfDay();

            unit.handle.StartGesture(GameActivity_t.ACT_DOTA_CAST_ABILITY_4);

            unit_emit_sound(unit, "vo_luna_eclipse");
            wait(0.6);
            unit_emit_sound(unit, "Hero_Luna.Eclipse.Cast");

            GameRules.SetTimeOfDay(0);

            const eclipse_fx = fx_by_unit("particles/units/heroes/hero_luna/luna_eclipse.vpcf", unit)
                .with_point_value(1, 500)
                .to_unit_origin(2, unit)
                .to_unit_origin(3, unit);

            const deltas = from_client_array(cast.deltas);
            const beam_targets = deltas.map(delta => ({
                delta: delta,
                beams_remaining: -delta.value_delta
            }));

            while (beam_targets.length > 0) {
                const random_index = RandomInt(0, beam_targets.length - 1);
                const random_target = beam_targets[random_index];
                const target_unit = find_unit_by_id(random_target.delta.target_unit_id);

                random_target.beams_remaining--;

                if (target_unit) {
                    fx("particles/units/heroes/hero_luna/luna_eclipse_impact.vpcf")
                        .to_unit_origin(0, target_unit)
                        .to_unit_origin(1, target_unit)
                        .to_unit_origin(5, target_unit)
                        .release();

                    unit_emit_sound(target_unit, "Hero_Luna.Eclipse.Target");
                    change_health(main_player, unit, target_unit, target_unit.health - 1, -1);
                    shake_screen(target_unit.position, Shake.weak);
                }

                if (random_target.beams_remaining == 0) {
                    beam_targets.splice(random_index, 1);
                }

                wait(0.3);
            }

            if (cast.missed_beams > 0) {
                const distance = 4;

                const cells: XY[] = [];

                const unit_x = unit.position.x;
                const unit_y = unit.position.y;

                const min_x = Math.max(0, unit_x - distance);
                const min_y = Math.max(0, unit_y - distance);

                const max_x = Math.min(battle.grid_size.width, unit_x + distance);
                const max_y = Math.min(battle.grid_size.height, unit_y + distance);

                for (let x = min_x; x < max_x; x++) {
                    for (let y = min_y; y < max_y; y++) {
                        const xy = { x: x, y: y };

                        if ((x != unit_x || y != unit_y) && manhattan(xy, { x: unit_x, y: unit_y }) < distance) {
                            cells.push(xy);
                        }
                    }
                }

                for (let beams_remaining = cast.missed_beams; beams_remaining > 0; beams_remaining--) {
                    const position = cells[RandomInt(0, cells.length - 1)];

                    fx("particles/units/heroes/hero_luna/luna_eclipse_impact_notarget.vpcf")
                        .to_location(0, position)
                        .to_location(1, position)
                        .to_location(5, position)
                        .release();

                    EmitSoundOnLocationWithCaster(battle_position_to_world_position_center(position), "Hero_Luna.Eclipse.NoTarget", unit.handle);

                    wait(0.3);
                }
            }

            unit.handle.FadeGesture(GameActivity_t.ACT_DOTA_CAST_ABILITY_4);

            eclipse_fx.destroy_and_release(false);

            GameRules.SetTimeOfDay(day_time);

            break;
        }

        default: unreachable(cast);
    }
}

function play_modifier_applied_delta(main_player: Main_Player, source: Battle_Unit, target: Battle_Unit, effect: Ability_Effect) {
    switch (effect.ability_id) {
        default: {
            log_chat_debug_message(`Error no modifier effect for ability ${effect.ability_id} found`);
        }
    }
}

function play_ability_effect_delta(main_player: Main_Player, effect: Ability_Effect) {
    switch (effect.ability_id) {
        case Ability_Id.tide_kraken_shell: {
            const unit = find_unit_by_id(effect.unit_id);

            if (unit) {
                fx_by_unit("particles/units/heroes/hero_tidehunter/tidehunter_krakenshell_purge.vpcf", unit).release();
                unit_emit_sound(unit, "Hero_Tidehunter.KrakenShell");
            }

            break;
        }

        case Ability_Id.pudge_flesh_heap: {
            const [ health_bonus, heal ] = from_client_tuple(effect.deltas);
            const unit = find_unit_by_id(health_bonus.target_unit_id);

            if (unit) {
                fx_by_unit("particles/econ/items/bloodseeker/bloodseeker_eztzhok_weapon/bloodseeker_bloodbath_eztzhok.vpcf", unit)
                    .to_unit_origin(1, unit)
                    .release();

                unit_emit_sound(unit, "pudge_ability_flesh_heap");

                play_delta(main_player, health_bonus);
                play_delta(main_player, heal);
            }

            break;
        }

        case Ability_Id.luna_moon_glaive: {
            const delta = effect.delta;
            const source = find_unit_by_id(delta.source_unit_id);
            const target = find_unit_by_id(delta.target_unit_id);
            const original_target = find_unit_by_id(effect.original_target_id);

            if (source && target && original_target) {
                const spec = get_ranged_attack_spec(source.type);

                if (spec) {
                    tracking_projectile_to_unit(original_target, target, spec.particle_path, spec.projectile_speed, "attach_hitloc");
                    unit_emit_sound(target, "Hero_Luna.MoonGlaive.Impact");
                }

                play_delta(main_player, delta);
            }

            break;
        }

        case Ability_Id.luna_lunar_blessing: {
            play_delta(main_player, effect.delta);

            break;
        }

        default: {
            log_chat_debug_message(`Error no ability effect for ability ${effect.ability_id} found`);
        }
    }
}

function turn_unit_towards_target(unit: Battle_Unit, towards: XY) {
    const towards_world_position = battle_position_to_world_position_center(towards);
    const desired_forward = ((towards_world_position - unit.handle.GetAbsOrigin()) * Vector(1, 1, 0) as Vector).Normalized();

    {
        // TODO guarded_wait_until
        const guard_hit = guarded_wait_until(3, () => {
            unit.handle.FaceTowards(towards_world_position);

            return desired_forward.Dot(unit.handle.GetForwardVector()) > 0.95;
        });

        if (guard_hit) {
            log_chat_debug_message(`Failed waiting on FaceTowards`);
        }
    }
    /*while (true) {
        unit.handle.FaceTowards(attacked_world_position);

        if (desired_forward.Dot(unit.handle.GetForwardVector()) > 0.95) {
            break;
        }

        wait_one_frame();
    }*/
}

function update_stun_visuals(unit: Battle_Unit) {
    if (unit.stunned_counter > 0) {
        print("Stun unit", unit.handle.GetName());
        unit.handle.AddNewModifier(unit.handle, undefined, "modifier_stunned", {});
    } else {
        print("Unstun unit", unit.handle.GetName());
        unit.handle.RemoveModifierByName("modifier_stunned");
    }
}

function unit_play_activity(unit: Battle_Unit, activity: GameActivity_t, wait_up_to = 0.4): number {
    unit.handle.StopFacing();
    unit.handle.Stop();
    unit.handle.ForcePlayActivityOnce(activity);

    const sequence = unit.handle.GetSequence();
    const sequence_duration = unit.handle.SequenceDuration(sequence);
    const start_time = GameRules.GetGameTime();

    while (GameRules.GetGameTime() - start_time < sequence_duration * wait_up_to) {
        if (unit.handle.GetSequence() != sequence) {
            unit.handle.ForcePlayActivityOnce(activity);
        }

        wait_one_frame();
    }

    const time_passed = GameRules.GetGameTime() - start_time;

    return sequence_duration - time_passed;
}

function change_health(main_player: Main_Player, source: Battle_Unit, target: Battle_Unit, new_value: number, value_delta: number) {
    function number_particle(amount: number, r: number, g: number, b: number) {
        fx("particles/msg_damage.vpcf")
            .to_unit_origin(0, target)
            .with_point_value(1, 0, amount)
            .with_point_value(2, Math.max(1, amount / 1.5), 1)
            .with_point_value(3, r, g, b)
            .release()
    }

    if (value_delta > 0) {
        number_particle(value_delta,100, 255, 50);
    } else if (value_delta < 0) {
        target.handle.AddNewModifier(target.handle, undefined, "Modifier_Damage_Effect", { duration: 0.2 });

        number_particle(-value_delta, 250, 70, 70);
    }

    target.health = new_value;

    update_player_state_net_table(main_player);

    if (new_value == 0) {
        if (source.owner_remote_id == target.owner_remote_id) {
            try_play_sound_for_unit(source, get_unit_deny_voice_line);
        }

        target.handle.ForceKill(false);
    }
}

function play_delta(main_player: Main_Player, delta: Delta, head: number = 0) {
    print(`Well delta type is: ${delta.type}`);

    switch (delta.type) {
        case Delta_Type.unit_spawn: {
            fx("particles/hero_spawn.vpcf")
                .to_location(0, delta.at_position)
                .release();

            wait(0.25);

            shake_screen(delta.at_position, Shake.medium);

            const facing = delta.owner_id == main_player.remote_id ? { x: 0, y: 1 } : { x: 0, y : -1 };
            const unit = spawn_unit_for_battle(delta.unit_type, delta.unit_id, delta.owner_id, delta.at_position, facing);

            unit_emit_sound(unit, "hero_spawn");

            fx_by_unit("particles/dev/library/base_dust_hit.vpcf", unit).release();

            unit.is_playing_a_delta = true;

            wait(0.25);

            unit.is_playing_a_delta = false;

            break;
        }

        case Delta_Type.unit_move: {
            const unit = find_unit_by_id(delta.unit_id);

            if (unit) {
                unit.is_playing_a_delta = true;

                const path = battle.delta_paths[head];

                if (!path) {
                    print("Couldn't find path");
                    break;
                }

                unit.position = delta.to_position;

                for (const cell of path) {
                    const world_position = battle_position_to_world_position_center(cell);

                    unit.handle.MoveToPosition(world_position);

                    // TODO guarded_wait_until
                    const guard_hit = guarded_wait_until(3, () => {
                        return (unit.handle.GetAbsOrigin() - world_position as Vector).Length2D() < battle_cell_size / 4;
                    });

                    if (guard_hit) {
                        log_chat_debug_message(`Failed waiting on MoveToPosition ${world_position.x}/${world_position.y}`);
                    }

                    unit.move_points = unit.move_points - 1;

                    update_player_state_net_table(main_player);
                }

                unit.is_playing_a_delta = false;
            }

            break;
        }

        case Delta_Type.use_ground_target_ability: {
            const attacker = find_unit_by_id(delta.unit_id);

            if (attacker) {
                attacker.is_playing_a_delta = true;

                play_ground_target_ability_delta(main_player, attacker, delta);

                attacker.is_playing_a_delta = false;
            }

            break;
        }

        case Delta_Type.use_unit_target_ability: {
            const attacker = find_unit_by_id(delta.unit_id);
            const target = find_unit_by_id(delta.target_unit_id);

            if (attacker && target) {
                attacker.is_playing_a_delta = true;

                play_unit_target_ability_delta(main_player, attacker, delta, target);

                attacker.is_playing_a_delta = false;
            }

            break;
        }

        case Delta_Type.use_no_target_ability: {
            const attacker = find_unit_by_id(delta.unit_id);

            if (attacker) {
                attacker.is_playing_a_delta = true;

                play_no_target_ability_delta(main_player, attacker, delta);

                attacker.is_playing_a_delta = false;
            }

            break;
        }

        case Delta_Type.unit_force_move: {
            const unit = find_unit_by_id(delta.unit_id);
            const to = battle_position_to_world_position_center(delta.to_position);

            if (unit) {
                FindClearSpaceForUnit(unit.handle, to,  true);

                unit.position = delta.to_position;
            }

            break;
        }

        case Delta_Type.start_turn: {
            for (const unit of battle.units) {
                unit.move_points = unit.max_move_points;
            }

            break;
        }

        case Delta_Type.end_turn: {
            break;
        }

        case Delta_Type.unit_field_change: {
            const unit = find_unit_by_id(delta.target_unit_id);

            print("Changing field of", delta.target_unit_id, unit ? unit.handle.GetName() : "none", delta.field, "new value", delta.new_value);

            if (unit) {
                switch (delta.field) {
                    case Unit_Field.state_stunned_counter: {
                        unit.stunned_counter = delta.new_value;

                        update_stun_visuals(unit);
                        break;
                    }

                    case Unit_Field.attack_bonus: { unit.attack_bonus = delta.new_value; update_player_state_net_table(main_player); break; }
                    case Unit_Field.max_health: { unit.max_health = delta.new_value; update_player_state_net_table(main_player); break; }
                    case Unit_Field.max_mana: { unit.max_mana = delta.new_value; update_player_state_net_table(main_player); break; }
                    case Unit_Field.max_move_points: { unit.max_move_points = delta.new_value; update_player_state_net_table(main_player); break; }

                    case Unit_Field.level: {
                        unit.level = delta.new_value;

                        unit_emit_sound(unit, "hero_level_up");
                        fx_by_unit("particles/generic_hero_status/hero_levelup.vpcf", unit).release();
                        update_player_state_net_table(main_player);

                        break;
                    }
                }
            }

            break;
        }

        case Delta_Type.mana_change: {
            const unit = find_unit_by_id(delta.unit_id);

            if (unit) {
                unit.mana = delta.new_mana;

                if (delta.mana_change != 0) {
                    const player = PlayerResource.GetPlayer(main_player.player_id);

                    SendOverheadEventMessage(player, Overhead_Event_Type.OVERHEAD_ALERT_MANA_LOSS, unit.handle, delta.mana_change, player);
                }

                update_player_state_net_table(main_player);
            }

            break;
        }

        case Delta_Type.health_change: {
            const source = find_unit_by_id(delta.source_unit_id);
            const target = find_unit_by_id(delta.target_unit_id);

            if (source && target) {
                change_health(main_player, source, target, delta.new_value, delta.value_delta);
            }

            break;
        }

        case Delta_Type.modifier_appled: {
            const source = find_unit_by_id(delta.source_unit_id);
            const target = find_unit_by_id(delta.target_unit_id);

            if (source && target) {
                play_modifier_applied_delta(main_player, source, target, delta.effect);

                update_player_state_net_table(main_player);
            }

            break;
        }

        case Delta_Type.modifier_removed: {
            const modifier_data = battle.modifier_id_to_modifier_data[delta.modifier_id];

            if (modifier_data) {
                const unit = find_unit_by_id(modifier_data.unit_id);

                if (unit) {
                    print("Remove modifier", delta.modifier_id, modifier_data.modifier_name, "from", unit.handle.GetName());

                    unit.handle.RemoveModifierByName(modifier_data.modifier_name);

                    delete battle.modifier_id_to_modifier_data[delta.modifier_id];
                }
            }

            break;
        }

        case Delta_Type.ability_effect_applied: {
            play_ability_effect_delta(main_player, delta.effect);

            break;
        }

        case Delta_Type.draw_card: {
            break;
        }

        case Delta_Type.use_card: {
            break;
        }

        case Delta_Type.set_ability_cooldown_remaining: break;

        default: unreachable(delta);
    }
}

function load_battle_data() {
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

    battle = {
        deltas: [],
        players: [],
        delta_paths: {},
        delta_head: 0,
        world_origin: origin,
        units: [],
        grid_size: {
            width: 0,
            height: 0
        },
        camera_dummy: camera_entity,
        modifier_id_to_modifier_data: {}
    };
}

function fast_forward_from_snapshot(main_player: Main_Player, snapshot: Battle_Snapshot) {
    print("Fast forwarding from snapshot, new head", snapshot.delta_head);

    for (const unit of battle.units) {
        unit.handle.RemoveSelf();
    }

    battle.units = snapshot.units.map(unit => {
        const new_unit = spawn_unit_for_battle(unit.type, unit.id, unit.owner_id, unit.position, unit.facing);

        // TODO we need this to be typesafe, codegen a copy<T extends U, U>(source: T, target: U) function
        new_unit.health = unit.health;
        new_unit.level = unit.level;
        new_unit.mana = unit.mana;
        new_unit.stunned_counter = unit.stunned_counter;
        new_unit.attack_bonus = unit.attack_bonus;
        new_unit.max_health = unit.max_health;
        new_unit.max_mana = unit.max_mana;
        new_unit.move_points = unit.move_points;
        new_unit.max_move_points = unit.max_move_points;
        new_unit.handle.SetForwardVector(Vector(unit.facing.x, unit.facing.y));

        return new_unit;
    });

    battle.delta_head = snapshot.delta_head;

    update_player_state_net_table(main_player);

    // Otherwise the animations won't apply
    
    wait_one_frame();
    wait_one_frame();

    for (const unit of battle.units) {
        update_stun_visuals(unit);
    }
}