type Battle = {
    id: Battle_Id
    this_player_id: Battle_Player_Id
    random_seed: number
    participants: Battle_Participant_Info[]
    players: Battle_Player[]
    deltas: Delta[]
    delta_paths: Move_Delta_Paths
    delta_head: number
    world_origin: Vector
    units: Unit[]
    runes: Rune[]
    shops: Shop[]
    trees: Tree[]
    grid_size: {
        width: number
        height: number
    };
    has_started: boolean
    is_over: boolean
    camera_dummy: CDOTA_BaseNPC
    applied_modifier_visuals: Applied_Modifier_Visuals[]
    timed_effect_visuals: Active_Timed_Effect_Visuals[];
}

type Battle_Player = {
    id: Battle_Player_Id
    gold: number
}

type Unit_Base = Unit_Stats & {
    id: Unit_Id
    handle: CDOTA_BaseNPC_Hero
    position: XY;
    modifiers: Modifier_Data[]
    dead: boolean
    hidden: boolean
}

type Hero = Unit_Base & {
    supertype: Unit_Supertype.hero
    owner_remote_id: Battle_Player_Id
    level: number
    type: Hero_Type
}

type Monster = Unit_Base & {
    supertype: Unit_Supertype.monster
}

type Creep = Unit_Base & {
    supertype: Unit_Supertype.creep
    owner_remote_id: Battle_Player_Id
    type: Creep_Type
}

type Unit = Hero | Monster | Creep

type Tree = {
    id: Tree_Id
    handle: CBaseEntity
    position: XY
}

type Rune = {
    id: Rune_Id
    type: Rune_Type
    handle: CDOTA_BaseNPC
    position: XY

    highlight_fx: FX
    rune_fx: FX
}

type Shop = {
    id: Shop_Id
    type: Shop_Type
    handle: CDOTA_BaseNPC
    position: XY
}

const enum Shake {
    weak,
    medium,
    strong
}

type Ranged_Attack_Spec = {
    particle_path: string
    projectile_speed: number
    attack_point: number
    shake_on_attack?: Shake
    shake_on_impact?: Shake
}

type Applied_Modifier_Visuals = {
    unit_id: Unit_Id
    visuals: Modifier_Visuals_Container[]
    modifier_handle_id: Modifier_Handle_Id
}

type Active_Timed_Effect_Visuals = {
    effect_handle_id: Effect_Handle_Id
    visuals: FX[]
}

type Modifier_Visuals_Container = {
    from_buff: true
    buff: CDOTA_Buff
} | {
    from_buff: false
    fx: FX
}

type Started_Gesture = {
    fade(): void
    remove(): void
}

type Started_Sound = {
    stop(): void
}

type Unit_Creation_Info = {
    supertype: Unit_Supertype.hero
    type: Hero_Type
} | {
    supertype: Unit_Supertype.creep
    type: Creep_Type
} | {
    supertype: Unit_Supertype.monster
}

declare let battle: Battle;

declare const enum Const {
    battle_cell_size = 144,
    rune_highlight = "particles/world_environmental_fx/rune_ambient_01.vpcf"
}

function get_battle_remote_head(): number {
    return table.maxn(battle.deltas);
}

function find_unit_by_id(id: Unit_Id): Unit | undefined {
    return array_find(battle.units, unit => unit.id == id);
}

function find_hero_by_id(id: Unit_Id): Hero | undefined {
    const unit = find_unit_by_id(id);

    if (unit && unit.supertype == Unit_Supertype.hero) {
        return unit;
    }
}

function find_player_deployment_zone_facing(id: Battle_Player_Id): XY | undefined {
    const participant = array_find(battle.participants, participant => participant.id == id);

    if (!participant) return;

    return {
        x: participant.deployment_zone.face.x,
        y: participant.deployment_zone.face.y
    };
}

function are_units_allies(a: Unit, b: Unit): boolean {
    if (a.supertype == Unit_Supertype.monster && b.supertype == Unit_Supertype.monster) {
        return true;
    }

    if (a.supertype != Unit_Supertype.monster && b.supertype != Unit_Supertype.monster) {
        return a.owner_remote_id == b.owner_remote_id;
    }

    return false;
}

function manhattan(from: XY, to: XY) {
    return Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
}

function parabolic(x: number) {
    const nx = (x * 2 - 1);
    return 1 - nx * nx;
}

function merge_battle_deltas(battle: Battle, head_before_merge: number, deltas: Delta[]) {
    for (let index = 0; index < deltas.length; index++) {
        battle.deltas[head_before_merge + index] = deltas[index];
    }

    print("Merged", deltas.length, "deltas from head", head_before_merge, "new head", get_battle_remote_head());
}

function merge_delta_paths_from_client(battle: Battle, delta_paths: Move_Delta_Paths) {
    for (const delta_index_string in delta_paths) {
        const delta_index = tonumber(delta_index_string);

        battle.delta_paths[delta_index] = from_client_array(delta_paths[delta_index_string]);
    }
}

function no_source(): Modifier_Data_Source {
    return { type: Source_Type.none };
}

function unit_source(unit: Unit, ability: Ability_Id): Modifier_Data_Source {
    return {
        type: Source_Type.unit,
        unit_id: unit.id,
        ability_id: ability
    }
}

function player_source(player: Battle_Player): Modifier_Data_Source {
    return {
        type: Source_Type.player,
        player_id: player.id
    }
}

function battle_position_to_world_position_center(world_origin: Vector, position: XY): Vector {
    const x = world_origin.x + position.x * Const.battle_cell_size + Const.battle_cell_size / 2;
    const y = world_origin.y + position.y * Const.battle_cell_size + Const.battle_cell_size / 2;

    return Vector(x, y, GetGroundHeight(Vector(x, y), undefined));
}

function shake_screen(at: XY, strength: Shake) {
    const at_world = battle_position_to_world_position_center(battle.world_origin, at);

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

function unit_start_gesture(unit: Unit, gesture: GameActivity_t, playback_rate?: number): Started_Gesture {
    if (playback_rate != undefined) {
        unit.handle.StartGestureWithPlaybackRate(gesture, playback_rate);
    } else {
        unit.handle.StartGesture(gesture);
    }

    return {
        fade(): void {
            unit.handle.FadeGesture(gesture)
        },
        remove(): void {
            unit.handle.RemoveGesture(gesture)
        }
    }
}

function hero_type_to_dota_unit_name(hero_type: Hero_Type): string {
    return `npc_dota_hero_${get_hero_dota_name(hero_type)}`;
}

function creep_type_to_model_and_scale(creep_type: Creep_Type): [string, number] {
    const neutrals = "models/creeps/neutral_creeps";

    switch (creep_type) {
        case Creep_Type.satyr_small: return [
            `${neutrals}/n_creep_satyr_c/n_creep_satyr_c.mdl`,
            0.8
        ];
        case Creep_Type.satyr_big: return [
            `${neutrals}/n_creep_satyr_a/n_creep_satyr_a.mdl`,
            1
        ];
        case Creep_Type.lane_creep: return [
            "models/creeps/lane_creeps/creep_radiant_melee/radiant_melee.mdl",
            1
        ];
        case Creep_Type.pocket_tower: return [
            "models/props_structures/rock_golem/tower_radiant_rock_golem.vmdl",
            1
        ];
        case Creep_Type.small_spider: return [
            "models/heroes/broodmother/spiderling.vmdl",
            0.6
        ];
        case Creep_Type.spider_matriarch: return [
            "models/items/broodmother/spiderling/virulent_matriarchs_spiderling/virulent_matriarchs_spiderling.vmdl",
            0.6
        ];
        case Creep_Type.large_spider: return [
            "models/items/broodmother/spiderling/elder_blood_heir_of_elder_blood/elder_blood_heir_of_elder_blood.vmdl",
            0.6
        ];
        case Creep_Type.spiderling: return [
            "models/heroes/broodmother/spiderling.vmdl",
            0.4
        ];
        case Creep_Type.ember_fire_remnant: return [
            `models/development/invisiblebox.vmdl`,
            1
        ];
    }
}

function monster_type_to_model_and_scale(): [string, number] {
    return ["models/creeps/neutral_creeps/n_creep_centaur_lrg/n_creep_centaur_lrg.vmdl", 1];
}

function create_world_handle_for_battle_unit(world_origin: Vector, info: Unit_Creation_Info, at: XY, facing: XY): CDOTA_BaseNPC_Hero {
    function get_dota_unit_name(): string {
        if (info.supertype == Unit_Supertype.hero) {
            return hero_type_to_dota_unit_name(info.type);
        }

        return "hod_unit";
    }

    const world_location = battle_position_to_world_position_center(world_origin, at);
    const handle = CreateUnitByName(get_dota_unit_name(), world_location, false, null, null, DOTATeam_t.DOTA_TEAM_GOODGUYS) as CDOTA_BaseNPC_Hero;
    handle.SetBaseMoveSpeed(500);
    handle.AddNewModifier(handle, undefined, "Modifier_Battle_Unit", {});
    handle.SetForwardVector(Vector(facing.x, facing.y));
    handle.SetUnitCanRespawn(true);

    function set_model_and_scale(model_scale: [string, number]) {
        const [model, scale] = model_scale;

        handle.SetModel(model);
        handle.SetOriginalModel(model);
        handle.SetModelScale(scale);
    }

    switch (info.supertype) {
        case Unit_Supertype.monster: {
            set_model_and_scale(monster_type_to_model_and_scale());
            break;
        }

        case Unit_Supertype.creep: {
            set_model_and_scale(creep_type_to_model_and_scale(info.type));

            if (info.type == Creep_Type.pocket_tower) {
                add_activity_override({ handle: handle }, GameActivity_t.ACT_DOTA_CUSTOM_TOWER_IDLE);
            }

            break;
        }

        case Unit_Supertype.hero: {
            break;
        }

        default: unreachable(info);
    }

    return handle;
}

function create_world_handle_for_rune(world_origin: Vector, type: Rune_Type, at: XY): CDOTA_BaseNPC {
    const world_location = battle_position_to_world_position_center(world_origin, at);
    const handle = CreateUnitByName("npc_dummy_unit", world_location, false, null, null, DOTATeam_t.DOTA_TEAM_GOODGUYS);
    handle.AddNewModifier(handle, undefined, "Modifier_Battle_Unit", {});
    handle.SetUnitCanRespawn(true);

    function rune_model(): string {
        switch (type) {
            case Rune_Type.regeneration: return "models/props_gameplay/rune_regeneration01.vmdl";
            case Rune_Type.bounty: return "models/props_gameplay/rune_goldxp.vmdl";
            case Rune_Type.double_damage: return "models/props_gameplay/rune_doubledamage01.vmdl";
            case Rune_Type.haste: return "models/props_gameplay/rune_haste01.vmdl";
        }
    }

    const model = rune_model();

    handle.SetModel(model);
    handle.SetOriginalModel(model);
    handle.StartGesture(GameActivity_t.ACT_DOTA_IDLE);

    return handle;
}

function create_world_handle_for_shop(world_origin: Vector, type: Shop_Type, at: XY, facing: XY): CDOTA_BaseNPC {
    const shop_models: Record<Shop_Type, string> = {
        [Shop_Type.normal]: "models/heroes/shopkeeper/shopkeeper.vmdl",
        [Shop_Type.secret]: "models/heroes/shopkeeper_dire/shopkeeper_dire.vmdl"
    };

    const world_location = battle_position_to_world_position_center(world_origin, at);
    const handle = CreateUnitByName("npc_dummy_unit", world_location, false, null, null, DOTATeam_t.DOTA_TEAM_GOODGUYS);
    const model = shop_models[type];
    handle.AddNewModifier(handle, undefined, "Modifier_Battle_Unit", {});
    handle.SetModel(model);
    handle.SetOriginalModel(model);
    handle.StartGesture(GameActivity_t.ACT_DOTA_IDLE);
    handle.SetForwardVector(Vector(facing.x, facing.y));
    handle.SetUnitCanRespawn(true);

    return handle;
}

function create_world_handle_for_tree(world_origin: Vector, seed: number, tree_id: Tree_Id, at: XY): CBaseEntity {
    const models = [
        "models/props_tree/cypress/tree_cypress010.vmdl",
        "models/props_tree/cypress/tree_cypress008.vmdl"
    ];

    const r_variance = ((seed + tree_id) * 2) % 20 - 10;
    const g_variance = ((seed + tree_id) * 3) % 20 - 10;
    const random_model = models[(seed + tree_id) % models.length];

    const entity = SpawnEntityFromTableSynchronous("prop_dynamic", {
        origin: battle_position_to_world_position_center(world_origin, at),
        model: random_model
    }) as CBaseModelEntity;

    const angle = (seed + tree_id) % 16 * (360 / 16) * (Math.PI / 180);
    entity.SetForwardVector(Vector(Math.cos(angle), Math.sin(angle)));
    entity.SetRenderColor(80 + r_variance, 90 + g_variance, 30);

    return entity;
}

function create_fx_for_rune_handle(type: Rune_Type, handle: Handle_Provider): FX {
    switch (type) {
        case Rune_Type.regeneration: return fx_follow_unit("particles/generic_gameplay/rune_regeneration.vpcf", handle);
        case Rune_Type.bounty: return fx("particles/generic_gameplay/rune_bounty_first.vpcf")
            .follow_unit_origin(0, handle)
            .follow_unit_origin(1, handle)
            .follow_unit_origin(2, handle);
        case Rune_Type.double_damage: return fx_follow_unit("particles/generic_gameplay/rune_doubledamage.vpcf", handle);
        case Rune_Type.haste: return fx_follow_unit("particles/generic_gameplay/rune_haste.vpcf", handle);
    }
}

function destroy_rune(rune: Rune, destroy_effects_instantly: boolean) {
    rune.handle.RemoveSelf();
    rune.highlight_fx.destroy_and_release(destroy_effects_instantly);
    rune.rune_fx.destroy_and_release(destroy_effects_instantly);
}

function unit_base(unit_id: Unit_Id, info: Unit_Creation_Info, definition: Unit_Definition, at: XY, facing: XY): Unit_Base {
    return {
        handle: create_world_handle_for_battle_unit(battle. world_origin, info, at, facing),
        id: unit_id,
        position: at,
        base: {
            armor: 0,
            attack_damage: definition.attack_damage,
            max_health: definition.health,
            max_move_points: definition.move_points
        },
        bonus: {
            armor: 0,
            attack_damage: 0,
            max_health: 0,
            max_move_points: 0
        },
        health: definition.health,
        status: starting_unit_status(),
        move_points: definition.move_points,
        modifiers: [],
        dead: false,
        hidden: false
    };
}

function spawn_monster_for_battle(unit_id: Unit_Id, definition: Unit_Definition, at: XY, facing: XY): Monster {
    const base = unit_base(unit_id, { supertype: Unit_Supertype.monster }, definition, at, facing);

    return {
        ...base,
        supertype: Unit_Supertype.monster
    }
}

function spawn_hero_for_battle(hero_type: Hero_Type, unit_id: Unit_Id, owner_id: Battle_Player_Id, at: XY, facing: XY): Hero {
    const definition = hero_definition_by_type(hero_type);
    const base = unit_base(unit_id, { supertype: Unit_Supertype.hero, type: hero_type }, definition, at, facing);

    return {
        ...base,
        supertype: Unit_Supertype.hero,
        type: hero_type,
        owner_remote_id: owner_id,
        level: 1
    };
}

function register_unit(battle: Battle, unit: Unit) {
    battle.units.push(unit);
}

function spawn_creep_for_battle(type: Creep_Type, unit_id: Unit_Id, owner_id: Battle_Player_Id, at: XY, facing: XY): Creep {
    const definition = creep_definition_by_type(type);
    const base = unit_base(unit_id, { supertype: Unit_Supertype.creep, type: type }, definition, at, facing);

    return {
        ...base,
        supertype: Unit_Supertype.creep,
        type: type,
        owner_remote_id: owner_id,
    };
}

function tracking_projectile_from_point_to_unit(world_point: Vector, target: Unit, particle_path: string, speed: number) {
    const in_attach = "attach_hitloc";
    const particle = fx(particle_path)
        .with_vector_value(0, world_point)
        .to_unit_attach_point(1, target, in_attach)
        .with_point_value(2, speed)
        .to_unit_attach_point(3, target, in_attach);

    const world_distance = (world_point - attachment_world_origin(target.handle, in_attach) as Vector).Length();

    wait(world_distance / speed);

    particle.destroy_and_release(false);
}

function tracking_projectile_to_unit(source: Unit, target: Unit, particle_path: string, speed: number, out_attach: string = "attach_attack1") {
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

function tracking_projectile_to_point(source: Unit, target: XY, particle_path: string, speed: number) {
    const out_attach = "attach_attack1";
    const world_location = battle_position_to_world_position_center(battle.world_origin, target) + Vector(0, 0, 128) as Vector;

    const particle = fx(particle_path)
        .to_unit_attach_point(0, source, out_attach)
        .with_vector_value(1, world_location)
        .with_point_value(2, speed)
        .with_vector_value(3, world_location);

    const world_distance = (attachment_world_origin(source.handle, out_attach) - world_location as Vector).Length();

    wait(world_distance / speed);

    particle.destroy_and_release(false);
}

function do_each_frame_for(time: number, action: (progress: number) => void) {
    const start_time = GameRules.GetGameTime();

    while (true) {
        const now = GameRules.GetGameTime();
        const progress = Math.min(1, (now - start_time) / time);

        action(progress);

        if (progress == 1) {
            break;
        }

        wait_one_frame();
    }
}

function toss_target_up(target: Unit) {
    const toss_time = 0.4;
    const start_origin = target.handle.GetAbsOrigin();
    const gesture = unit_start_gesture(target, GameActivity_t.ACT_DOTA_FLAIL);

    do_each_frame_for(toss_time, progress => {
        const current_height = Math.sin(progress * Math.PI) * 260;

        target.handle.SetAbsOrigin(start_origin + Vector(0, 0, current_height) as Vector);
    });

    gesture.fade();
}

function linear_projectile_end_to_end(from: XY, to: XY, travel_speed: number, fx_path: string): [FX, number] {
    const world_from = battle_position_to_world_position_center(battle.world_origin, from);
    const world_to = battle_position_to_world_position_center(battle.world_origin, to);
    const world_delta = Vector(world_to.x - world_from.x, world_to.y - world_from.y);
    const direction = world_delta.Normalized();
    const travel_distance = world_delta.Length();
    const time_to_travel = travel_distance / travel_speed;

    const particle = fx(fx_path)
        .with_vector_value(0, world_from)
        .with_forward_vector(0, direction)
        .with_vector_value(1, direction * travel_speed as Vector);

    return [particle, time_to_travel];
}

function linear_projectile_with_targets<T>(
    from: XY,
    towards: XY,
    travel_speed: number,
    distance_in_cells: number,
    fx_path: string,
    targets: T[],
    position_getter: (target: T) => Vector,
    action: (target: T) => void
) {
    const start_time = GameRules.GetGameTime();
    const time_to_travel = distance_in_cells * Const.battle_cell_size / travel_speed;
    const world_from = battle_position_to_world_position_center(battle.world_origin, from);
    const direction = Vector(towards.x - from.x, towards.y - from.y).Normalized();

    const particle = fx(fx_path)
        .with_vector_value(0, world_from)
        .with_forward_vector(0, direction)
        .with_vector_value(1, direction * travel_speed as Vector);

    type Target_Record = {
        target: T
        was_hit: boolean
    }

    const target_records: Target_Record[] = [];

    for (const target of targets) {
        target_records.push({
            target: target,
            was_hit: false
        })
    }

    while (true) {
        const travelled_for = GameRules.GetGameTime() - start_time;
        const distance_travelled = travelled_for * travel_speed;

        if (travelled_for >= time_to_travel && target_records.every(target => target.was_hit)) {
            break;
        }

        for (const record of target_records) {
            if (record.was_hit) continue;

            if (distance_travelled > (position_getter(record.target) - world_from as Vector).Length2D()) {
                action(record.target);

                record.was_hit = true;
            }
        }

        wait_one_frame();
    }

    particle.destroy_and_release(false);
}

type Replace_Target_Unit_Id<T> = Omit<T, "target_unit_id"> & { unit: Unit };

function filter_and_map_existing_units<T extends { target_unit_id: Unit_Id }>(array: T[]): Replace_Target_Unit_Id<T>[] {
    const result: Replace_Target_Unit_Id<T>[] = [];

    for (const member of from_client_array(array)) {
        const unit = find_unit_by_id(member.target_unit_id);

        if (unit) {
            result.push({
                ...member,
                unit: unit
            });
        }
    }

    return result;
}

function pudge_hook(game: Game, pudge: Unit, cast: Delta_Ability_Pudge_Hook) {
    function is_hook_hit(cast: Pudge_Hook_Hit | Line_Ability_Miss): cast is Pudge_Hook_Hit {
        return from_client_bool(cast.hit); // @PanoramaBool
    }

    const target = cast.target_position;
    const hook_offset = Vector(0, 0, 96);
    const pudge_origin = pudge.handle.GetAbsOrigin() + hook_offset as Vector;
    const travel_direction = Vector(target.x - pudge.position.x, target.y - pudge.position.y).Normalized();
    const travel_speed = 1600;

    let travel_target: XY;

    if (is_hook_hit(cast.result)) {
        const target = find_unit_by_id(cast.result.target_unit_id);

        if (!target) {
            log_chat_debug_message("Error, Pudge DAMAGE TARGET not found");
            return;
        }

        travel_target = target.position;
    } else {
        travel_target = cast.result.final_point;
    }

    turn_unit_towards_target(pudge, target);

    const hook_wearable = pudge.handle.GetTogglableWearable(DOTASlotType_t.DOTA_LOADOUT_TYPE_WEAPON);
    const pudge_gesture = unit_start_gesture(pudge, GameActivity_t.ACT_DOTA_OVERRIDE_ABILITY_1);
    const chain_sound = unit_emit_sound(pudge, "Hero_Pudge.AttackHookExtend");

    hook_wearable.AddEffects(Effects.EF_NODRAW);

    wait(0.15);

    const distance_to_travel = Const.battle_cell_size * Math.max(Math.abs(travel_target.x - pudge.position.x), Math.abs(travel_target.y - pudge.position.y));
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
        const target = find_unit_by_id(cast.result.target_unit_id);

        if (!target) {
            log_chat_debug_message("Error, Pudge DAMAGE TARGET not found");
            return;
        }

        wait(time_to_travel);
        change_health(game, pudge, target, cast.result.damage_dealt);

        chain_sound.stop();

        unit_emit_sound(target, "Hero_Pudge.AttackHookImpact");

        const target_chain_sound = unit_emit_sound(target, "Hero_Pudge.AttackHookExtend");
        const target_flail = unit_start_gesture(target, GameActivity_t.ACT_DOTA_FLAIL);

        fx("particles/units/heroes/hero_pudge/pudge_meathook_impact.vpcf")
            .to_unit_attach_point(0, target, "attach_hitloc")
            .release();

        chain.to_unit_attach_point(1, target, "attach_hitloc", target.handle.GetOrigin() + hook_offset as Vector);

        const target_world_position = battle_position_to_world_position_center(battle.world_origin, cast.result.move_target_to);
        const travel_position_start = target.handle.GetAbsOrigin();
        const travel_position_finish = GetGroundPosition(Vector(target_world_position.x, target_world_position.y), target.handle);

        do_each_frame_for(time_to_travel, progress => {
            const travel_position = (travel_position_finish - travel_position_start) * progress + travel_position_start as Vector;

            target.handle.SetAbsOrigin(travel_position);
        });

        target_chain_sound.stop();
        target_flail.fade();

        target.position = cast.result.move_target_to;
    } else {
        wait(time_to_travel);

        chain.with_vector_value(1, pudge_origin);

        chain_sound.stop();

        EmitSoundOnLocationWithCaster(battle_position_to_world_position_center(battle.world_origin, travel_target), "Hero_Pudge.AttackHookRetractStop", pudge.handle);

        wait(time_to_travel);
    }

    hook_wearable.RemoveEffects(Effects.EF_NODRAW);
    pudge_gesture.fade();

    chain.release();
}

function starfall_drop_star_on_unit(game: Game, caster: Unit, target: Unit, change: Health_Change) {
    const fx = fx_by_unit("particles/units/heroes/hero_mirana/mirana_starfall_attack.vpcf", target);

    wait(0.5);

    unit_emit_sound(caster, "Ability.StarfallImpact");
    change_health(game, caster, target, change);

    fx.destroy_and_release(false);
}

function tide_ravage(game: Game, caster: Unit, cast: Delta_Ability_Tide_Ravage) {
    const caster_gesture = unit_start_gesture(caster, GameActivity_t.ACT_DOTA_CAST_ABILITY_4);

    wait(0.1);

    unit_emit_sound(caster, "Ability.Ravage");
    shake_screen(caster.position, Shake.strong);

    type Ravage_Target = (Unit_Health_Change & Unit_Modifier_Application);

    const fx = fx_by_unit("particles/tide_ravage/tide_ravage.vpcf", caster);
    const particle_delay = 0.1;
    const deltas_by_distance: Ravage_Target[][] = [];

    // @HardcodedConstant
    for (let distance = 1; distance <= 5; distance++) {
        fx.with_point_value(distance, distance * Const.battle_cell_size * 0.85);
    }

    fx.release();

    for (const target_data of from_client_array(cast.targets)) {
        const target = find_unit_by_id(target_data.target_unit_id);

        if (!target) {
            log_chat_debug_message(`Target with id ${target_data.target_unit_id} not found`);
            continue;
        }

        const from = caster.position;
        const to = target.position;
        const manhattan_distance = Math.abs(from.x - to.x) + Math.abs(from.y - to.y);

        let by_distance = deltas_by_distance[manhattan_distance];

        if (!by_distance) {
            by_distance = [];
            deltas_by_distance[manhattan_distance] = by_distance;
        }

        by_distance.push(target_data);
    }

    const forks: Fork[] = [];

    for (let distance = 1; distance <= 5; distance++) {
        const by_distance = deltas_by_distance[distance];

        if (!by_distance) continue;

        for (const target_data of by_distance) {
            const target = find_unit_by_id(target_data.target_unit_id);

            if (!target) {
                log_chat_debug_message(`Target with id ${target_data.target_unit_id} not found`);
                continue;
            }

            forks.push(fork(() => {
                fx_by_unit("particles/units/heroes/hero_tidehunter/tidehunter_spell_ravage_hit.vpcf", target).release();
                unit_emit_sound(target, "Hero_Tidehunter.RavageDamage");
                toss_target_up(target);
            }));

            change_health(game, caster, target, target_data.change);
            apply_modifier(game, target, target_data.modifier, unit_source(caster, cast.ability_id));
        }

        wait(particle_delay);
    }

    caster_gesture.fade();

    wait_for_all_forks(forks);
}

function get_ranged_attack_spec(unit: Unit): Ranged_Attack_Spec | undefined {
    switch (unit.supertype) {
        case Unit_Supertype.hero: {
            switch (unit.type) {
                case Hero_Type.sniper: return {
                    particle_path: "particles/units/heroes/hero_sniper/sniper_base_attack.vpcf",
                    projectile_speed: 1600,
                    attack_point: 0.1,
                    shake_on_attack: Shake.weak
                };

                case Hero_Type.luna: return {
                    particle_path: "particles/units/heroes/hero_luna/luna_moon_glaive.vpcf",
                    projectile_speed: 900,
                    attack_point: 0.4
                };

                case Hero_Type.skywrath_mage: return {
                    particle_path: "particles/units/heroes/hero_skywrath_mage/skywrath_mage_base_attack.vpcf",
                    projectile_speed: 800,
                    attack_point: 0.5
                };

                case Hero_Type.lion: return {
                    particle_path: "particles/units/heroes/hero_lion/lion_base_attack.vpcf",
                    projectile_speed: 1200,
                    attack_point: 0.4
                };

                case Hero_Type.mirana: return {
                    particle_path: "particles/units/heroes/hero_mirana/mirana_base_attack.vpcf",
                    projectile_speed: 1400,
                    attack_point: 0.3
                };

                case Hero_Type.vengeful_spirit: return {
                    particle_path: "particles/units/heroes/hero_vengeful/vengeful_base_attack.vpcf",
                    projectile_speed: 1400,
                    attack_point: 0.3
                }
            }

            break;
        }

        case Unit_Supertype.monster: {
            return;
        }
    }
}

function try_play_random_sound_for_hero(unit: Unit, supplier: (sounds: Hero_Sounds) => string[], target: Unit = unit) {
    if (unit.supertype != Unit_Supertype.hero) {
        return;
    }

    // TODO use pseudo @Random
    const sounds = supplier(hero_sounds_by_hero_type(unit.type));
    const random_sound = sounds[RandomInt(0, sounds.length - 1)];

    unit_emit_sound(target, random_sound);
}

function try_play_sound_for_hero(unit: Unit, supplier: (hero: Hero) => string | undefined, target: Unit = unit) {
    if (unit.supertype != Unit_Supertype.hero) {
        return;
    }

    const sound = supplier(unit);

    if (sound) {
        unit_emit_sound(target, sound);
    }
}

function highlight_grid_for_targeted_ability(unit: Unit, ability: Ability_Id, to: XY) {
    fire_event(To_Client_Event_Type.grid_highlight_targeted_ability, {
        unit_id: unit.id,
        ability_id: ability,
        from: unit.position,
        to: to
    })
}

function highlight_grid_for_no_target_ability(unit: Unit, ability: Ability_Id) {
    fire_event(To_Client_Event_Type.grid_highlight_no_target_ability, {
        unit_id: unit.id,
        ability_id: ability,
        from: unit.position,
    })
}

function perform_basic_attack(game: Game, unit: Unit, cast: Delta_Ability_Basic_Attack) {
    const target = cast.target_position;

    function get_hero_pre_attack_sound(hero: Hero): string | undefined {
        switch (hero.type) {
            case Hero_Type.pudge: return "Hero_Pudge.PreAttack";
            case Hero_Type.ursa: return "Hero_Ursa.PreAttack";
            case Hero_Type.tidehunter: return "hero_tidehunter.PreAttack";
            case Hero_Type.skywrath_mage: return "Hero_SkywrathMage.PreAttack";
            case Hero_Type.dragon_knight: return "Hero_DragonKnight.PreAttack";
            case Hero_Type.dark_seer: return "Hero_DarkSeer.PreAttack";
            case Hero_Type.ember_spirit: return "Hero_EmberSpirit.PreAttack";
            case Hero_Type.earthshaker: return "Hero_EarthShaker.PreAttack";
        }
    }

    function get_hero_attack_sound(hero: Hero): string {
        switch (hero.type) {
            case Hero_Type.pudge: return "Hero_Pudge.Attack";
            case Hero_Type.ursa: return "Hero_Ursa.Attack";
            case Hero_Type.sniper: return "Hero_Sniper.attack";
            case Hero_Type.luna: return "Hero_Luna.Attack";
            case Hero_Type.tidehunter: return "hero_tidehunter.Attack";
            case Hero_Type.skywrath_mage: return "Hero_SkywrathMage.Attack";
            case Hero_Type.dragon_knight: return "Hero_DragonKnight.Attack";
            case Hero_Type.lion: return "Hero_Lion.Attack";
            case Hero_Type.mirana: return "Hero_Mirana.Attack";
            case Hero_Type.vengeful_spirit: return "Hero_VengefulSpirit.Attack";
            case Hero_Type.dark_seer: return "Hero_DarkSeer.Attack";
            case Hero_Type.ember_spirit: return "Hero_EmberSpirit.Attack";
            case Hero_Type.earthshaker: return hero.modifiers.some(applied => applied.modifier.id == Modifier_Id.shaker_enchant_totem_caster)
                ? "Hero_EarthShaker.Totem.Attack"
                : "Hero_EarthShaker.Attack";
        }
    }

    function get_hero_ranged_impact_sound(hero: Hero): string | undefined {
        switch (hero.type) {
            case Hero_Type.sniper: return "Hero_Sniper.ProjectileImpact";
            case Hero_Type.luna: return "Hero_Luna.ProjectileImpact";
            case Hero_Type.skywrath_mage: return "Hero_SkywrathMage.ProjectileImpact";
            case Hero_Type.lion: return "Hero_Lion.ProjectileImpact";
            case Hero_Type.mirana: return "Hero_Mirana.ProjectileImpact";
            case Hero_Type.vengeful_spirit: return "Hero_VengefulSpirit.ProjectileImpact";
        }
    }

    const ranged_attack_spec = get_ranged_attack_spec(unit);

    function is_attack_hit(cast: Basic_Attack_Hit | Line_Ability_Miss): cast is Basic_Attack_Hit {
        return from_client_bool(cast.hit); // @PanoramaBool
    }

    if (ranged_attack_spec) {
        try_play_sound_for_hero(unit, get_hero_pre_attack_sound);
        unit_play_activity(unit, GameActivity_t.ACT_DOTA_ATTACK, ranged_attack_spec.attack_point);
        try_play_sound_for_hero(unit, get_hero_attack_sound);

        if (ranged_attack_spec.shake_on_attack) {
            shake_screen(unit.position, ranged_attack_spec.shake_on_attack);
        }

        if (is_attack_hit(cast.result)) {
            const target_unit = find_unit_by_id(cast.result.target_unit_id);

            if (!target_unit) {
                log_chat_debug_message(`Error: unit ${cast.result.target_unit_id} not found`);
                return;
            }

            tracking_projectile_to_unit(unit, target_unit, ranged_attack_spec.particle_path, ranged_attack_spec.projectile_speed);
            change_health(game, unit, target_unit, cast.result.damage_dealt);
            try_play_sound_for_hero(unit, get_hero_ranged_impact_sound, target_unit);

            if (ranged_attack_spec.shake_on_impact) {
                shake_screen(target_unit.position, ranged_attack_spec.shake_on_impact);
            }
        } else {
            tracking_projectile_to_point(unit, cast.result.final_point, ranged_attack_spec.particle_path, ranged_attack_spec.projectile_speed);
        }
    } else {
        // TODO @SoundSystem
        if (unit.supertype == Unit_Supertype.creep && unit.type == Creep_Type.lane_creep) {
            unit_emit_sound(unit, "Creep_Good_Melee.PreAttack");
        }

        try_play_sound_for_hero(unit, get_hero_pre_attack_sound);
        unit_play_activity(unit, GameActivity_t.ACT_DOTA_ATTACK);

        if (is_attack_hit(cast.result)) {
            const target_unit = find_unit_by_id(cast.result.target_unit_id);

            if (target_unit) {
                change_health(game, unit, target_unit, cast.result.damage_dealt);
            }

            shake_screen(target, Shake.weak);
            try_play_sound_for_hero(unit, get_hero_attack_sound);

            // TODO @SoundSystem
            if (unit.supertype == Unit_Supertype.creep && unit.type == Creep_Type.lane_creep) {
                unit_emit_sound(unit, "Creep_Good_Melee.Attack");
            }
        }
    }
}

function attachment_world_origin(unit: CDOTA_BaseNPC, attachment_name: string) {
    return unit.GetAttachmentOrigin(unit.ScriptLookupAttachment(attachment_name));
}

function play_ground_target_ability_delta(game: Game, unit: Unit, cast: Delta_Ground_Target_Ability) {
    highlight_grid_for_targeted_ability(unit, cast.ability_id, cast.target_position);

    const world_from = battle_position_to_world_position_center(battle.world_origin, unit.position);
    const world_to = battle_position_to_world_position_center(battle.world_origin, cast.target_position);
    const distance = ((world_to - world_from) as Vector).Length2D();
    const direction = ((world_to - world_from) as Vector).Normalized();

    const source = unit_source(unit, cast.ability_id);

    turn_unit_towards_target(unit, cast.target_position);

    switch (cast.ability_id) {
        case Ability_Id.basic_attack: {
            perform_basic_attack(game, unit, cast);
            break;
        }

        case Ability_Id.pudge_hook: {
            pudge_hook(game, unit, cast);
            break;
        }

        case Ability_Id.skywrath_mystic_flare: {
            const caster_gesture = unit_start_gesture(unit, GameActivity_t.ACT_DOTA_CAST_ABILITY_4);

            unit_emit_sound(unit, "vo_skywrath_mage_mystic_flare");
            unit_emit_sound(unit, "Hero_SkywrathMage.MysticFlare.Cast");
            wait(0.5);

            const targets = from_client_array(cast.targets);
            const tick_time = 0.12;

            let total_time = cast.damage_remaining * tick_time;

            for (const target of targets) {
                total_time += tick_time * (-target.change.value_delta);
            }

            const world_target = battle_position_to_world_position_center(battle.world_origin, cast.target_position);

            EmitSoundOnLocationWithCaster(world_target, "Hero_SkywrathMage.MysticFlare", unit.handle);

            // @HardcodedConstant
            const square_side = 3;
            const circle_radius = square_side * Const.battle_cell_size / 2;
            const arbitrary_long_duration = 100;
            const spell_fx = fx("particles/units/heroes/hero_skywrath_mage/skywrath_mage_mystic_flare_ambient.vpcf")
                .with_point_value(0, world_target.x, world_target.y, world_target.z)
                .with_point_value(1, circle_radius, arbitrary_long_duration, tick_time);

            const damaged_units = targets.map(target => ({
                unit_id: target.target_unit_id,
                damage_remaining: -target.change.value_delta
            }));

            while (damaged_units.length > 0) {
                const random_index = RandomInt(0, damaged_units.length - 1);
                const random_target = damaged_units[random_index];
                const target_unit = find_unit_by_id(random_target.unit_id);

                random_target.damage_remaining--;

                if (target_unit) {
                    fx_by_unit("particles/units/heroes/hero_skywrath_mage/skywrath_mage_mystic_flare.vpcf", target_unit).release();
                    unit_emit_sound(target_unit, "Hero_SkywrathMage.MysticFlare.Target");
                    change_health(game, unit, target_unit, { new_value: target_unit.health - 1, value_delta: -1 });
                }

                if (random_target.damage_remaining == 0) {
                    damaged_units.splice(random_index, 1);
                }

                wait(tick_time);
            }

            if (cast.damage_remaining > 0) {
                wait(cast.damage_remaining * tick_time);
            }

            StopSoundOn("Hero_SkywrathMage.MysticFlare", unit.handle);

            caster_gesture.fade();
            spell_fx.destroy_and_release(false);

            break;
        }

        case Ability_Id.dragon_knight_breathe_fire: {
            unit_play_activity(unit, GameActivity_t.ACT_DOTA_CAST_ABILITY_1, 0.3);
            unit_emit_sound(unit, "Hero_DragonKnight.BreathFire");

            function fire_breath_projectile(distance_in_cells: number, from: Vector, direction: Vector) {
                const speed = 1500;
                const travel_time = Const.battle_cell_size * distance_in_cells  / speed;
                const particle_velocity = direction * speed as Vector;

                const particle = fx("particles/units/heroes/hero_dragon_knight/dragon_knight_breathe_fire.vpcf")
                    .with_vector_value(0, from)
                    .with_forward_vector(0, direction)
                    .with_vector_value(1, particle_velocity);

                wait(travel_time);

                particle.destroy_and_release(false);
            }

            const stem_length = 3; // @HardcodedConstant
            const final_position = world_from + direction * (stem_length * Const.battle_cell_size) as Vector;

            fire_breath_projectile(stem_length, world_from, direction);

            for (const target of from_client_array(cast.targets)) {
                const target_unit = find_unit_by_id(target.target_unit_id);

                if (target_unit) {
                    change_health(game, unit, target_unit, target.change);
                }
            }

            const arm_length = 2; // @HardcodedConstant
            const direction_left = Vector(-direction.y, direction.x, direction.z);

            let left_complete = false, right_complete = false;

            fork(() => {
                fire_breath_projectile(arm_length, final_position, direction_left);
                
                left_complete = true;
            });

            fork(() => {
                fire_breath_projectile(arm_length, final_position, -direction_left as Vector);

                right_complete = true;
            });
            
            wait_until(() => left_complete && right_complete);

            break;
        }

        case Ability_Id.dragon_knight_elder_dragon_form_attack: {
            unit_emit_sound(unit, "Hero_DragonKnight.ElderDragonShoot3.Attack");
            unit_play_activity(unit, GameActivity_t.ACT_DOTA_ATTACK);
            tracking_projectile_to_point(unit, cast.target_position, "particles/units/heroes/hero_dragon_knight/dragon_knight_dragon_tail_dragonform_proj.vpcf", 1200);

            for (const target of from_client_array(cast.targets)) {
                const target_unit = find_unit_by_id(target.target_unit_id);

                if (target_unit) {
                    change_health(game, unit, target_unit, target.change);
                }
            }

            unit_emit_sound(unit, "Hero_DragonKnight.ElderDragonShoot3.Attack");

            EmitSoundOnLocationWithCaster(battle_position_to_world_position_center(battle.world_origin, cast.target_position), "Hero_DragonKnight.ProjectileImpact", unit.handle);

            shake_screen(cast.target_position, Shake.medium);

            break;
        }

        case Ability_Id.lion_impale: {
            unit_play_activity(unit, GameActivity_t.ACT_DOTA_CAST_ABILITY_1, 0.3);
            unit_emit_sound(unit, "Hero_Lion.Impale");

            // TODO @VoiceOver

            const targets = filter_and_map_existing_units(cast.targets);
            const forks: Fork[] = [];

            // @HardcodedConstant
            const distance = 3;
            const fx = "particles/units/heroes/hero_lion/lion_spell_impale.vpcf";
            const from = unit.position;
            const to = cast.target_position;

            linear_projectile_with_targets(from, to, 1500, distance, fx, targets, target => target.unit.handle.GetAbsOrigin(), target => {
                change_health(game, unit, target.unit, target.change);
                apply_modifier(game, target.unit, target.modifier, source);

                forks.push(fork(() => {
                    unit_emit_sound(target.unit, "Hero_Lion.ImpaleHitTarget");
                    toss_target_up(target.unit);
                    unit_emit_sound(target.unit, "Hero_Lion.ImpaleTargetLand");
                }));
            });

            wait_for_all_forks(forks);

            break;
        }

        case Ability_Id.mirana_arrow: {
            function is_arrow_hit(cast: Mirana_Arrow_Hit | Line_Ability_Miss): cast is Mirana_Arrow_Hit {
                return from_client_bool(cast.hit); // @PanoramaBool
            }

            unit_play_activity(unit, GameActivity_t.ACT_DOTA_CAST_ABILITY_2);

            let travel_target: XY;

            if (is_arrow_hit(cast.result)) {
                const target = find_unit_by_id(cast.result.stun.target_unit_id);

                if (!target) {
                    log_chat_debug_message("Mirana arrow target not found");
                    return;
                }

                travel_target = target.position;
            } else {
                travel_target = cast.result.final_point;
            }

            const world_to = battle_position_to_world_position_center(battle.world_origin, travel_target);
            const distance = (world_to - world_from as Vector).Length2D();

            const travel_speed = 1300;
            const time_to_travel = distance / travel_speed;
            const particle = fx("particles/units/heroes/hero_mirana/mirana_spell_arrow.vpcf")
                .to_location(0, unit.position)
                .with_vector_value(1, direction * travel_speed as Vector)
                .with_forward_vector(0, unit.handle.GetForwardVector());

            unit_emit_sound(unit, "Hero_Mirana.ArrowCast");
            const loop_sound = unit_emit_sound(unit, "Hero_Mirana.Arrow");

            wait(time_to_travel);

            if (is_arrow_hit(cast.result)) {
                const target = find_unit_by_id(cast.result.stun.target_unit_id);

                if (target) {
                    apply_modifier(game, target, cast.result.stun.modifier, source);
                }

                unit_emit_sound(unit, "Hero_Mirana.ArrowImpact");
            }

            // TODO @VoiceOver hit/miss voicelines
            loop_sound.stop();

            particle.destroy_and_release(false);

            break;
        }

        case Ability_Id.mirana_leap: {
            const travel_speed = 2400;
            const time_to_travel = distance / travel_speed;
            const peak_height = Math.min(250, distance / 5);
            const animation_length = 0.5;
            const animation_speed = animation_length / time_to_travel;

            unit_emit_sound(unit, "Ability.Leap");

            const leap = unit_start_gesture(unit, GameActivity_t.ACT_DOTA_OVERRIDE_ABILITY_3, animation_speed);

            do_each_frame_for(time_to_travel, progress => {
                const position_now = world_from + (direction * distance * progress) as Vector;
                position_now.z = world_from.z + parabolic(progress) * peak_height;

                unit.handle.SetAbsOrigin(position_now);
            });

            leap.fade();

            const leap_end = unit_start_gesture(unit, GameActivity_t.ACT_MIRANA_LEAP_END);

            unit.handle.SetAbsOrigin(world_to);
            unit.position = cast.target_position;

            fx_by_unit("particles/dev/library/base_dust_hit.vpcf", unit).release();
            unit_emit_sound(unit, "eul_scepter_drop");

            wait(0.5);

            leap_end.fade();

            break;
        }

        case Ability_Id.venge_wave_of_terror: {
            unit_play_activity(unit, GameActivity_t.ACT_DOTA_CAST_ABILITY_2);
            unit_emit_sound(unit, "Hero_VengefulSpirit.WaveOfTerror");

            // @HardcodedConstant
            const distance = 5;
            const fx = "particles/units/heroes/hero_vengeful/vengeful_wave_of_terror.vpcf";
            const from = unit.position;
            const to = cast.target_position;
            const targets = filter_and_map_existing_units(cast.targets);

            linear_projectile_with_targets(from, to, 2000, distance, fx, targets, target => target.unit.handle.GetAbsOrigin(), target => {
                change_health(game, unit, target.unit, target.change);
                apply_modifier(game, target.unit, target.modifier, source);
            });

            break;
        }

        case Ability_Id.dark_seer_vacuum: {
            unit_play_activity(unit, GameActivity_t.ACT_DOTA_CAST_ABILITY_1);
            unit_emit_sound(unit, "Hero_Dark_Seer.Vacuum");

            // @HardcodedConstant
            const radius = 2;

            fx("particles/units/heroes/hero_dark_seer/dark_seer_vacuum.vpcf")
                .with_vector_value(0, world_to)
                .with_point_value(1, (radius + 0.5) * Const.battle_cell_size)
                .release();

            const targets = filter_and_map_existing_units(cast.targets);

            wait_for_all_forks(targets.map(target => fork(() => {
                const world_from = target.unit.handle.GetAbsOrigin();
                const world_to_actual = battle_position_to_world_position_center(battle.world_origin, target.move_to);
                const distance_to_cast_point = (world_to - world_from as Vector).Length2D();
                const distance_to_actual_position = (world_to - world_to_actual as Vector).Length2D();

                if (distance_to_cast_point != 0) {
                    const travel_speed_to_cast_point = 1000;

                    do_each_frame_for(distance_to_cast_point / travel_speed_to_cast_point, progress => {
                        target.unit.handle.SetAbsOrigin(world_from + (world_to - world_from) * progress as Vector);
                    });
                }

                if (distance_to_actual_position != 0) {
                    const travel_speed_to_actual_position = 800;

                    do_each_frame_for(distance_to_actual_position / travel_speed_to_actual_position, progress => {
                        target.unit.handle.SetAbsOrigin(world_to + (world_to_actual - world_to) * progress as Vector);
                    });
                }

                target.unit.position = target.move_to;
                target.unit.handle.SetAbsOrigin(world_to_actual);
            })));

            break;
        }

        case Ability_Id.ember_fire_remnant: {
            // TODO Should be able to cast this ability as a monster as well
            if (unit.supertype == Unit_Supertype.monster) break;

            unit_play_activity(unit, GameActivity_t.ACT_DOTA_CAST_ABILITY_4, 0);
            unit_emit_sound(unit, "Hero_EmberSpirit.FireRemnant.Cast");

            const particle_path = "particles/units/heroes/hero_ember_spirit/ember_spirit_fire_remnant_trail.vpcf";
            const [fx, travel_time] = linear_projectile_end_to_end(unit.position, cast.target_position, 1000, particle_path);

            fx.follow_unit_origin(0, unit);

            wait(travel_time);

            fx.destroy_and_release(false);

            const remnant = spawn_creep_for_battle(cast.remnant.type, cast.remnant.id, unit.owner_remote_id, cast.target_position, direction);
            register_unit(battle, remnant);
            apply_modifier(game, remnant, cast.remnant.modifier, source);
            apply_modifier(game, unit, cast.modifier, source);
            unit_emit_sound(remnant, "Hero_EmberSpirit.FireRemnant.Create");

            break;
        }

        case Ability_Id.shaker_fissure: {
            unit_play_activity(unit, GameActivity_t.ACT_DOTA_CAST_ABILITY_1);
            unit_emit_sound(unit, "Hero_EarthShaker.Fissure.Cast");

            for (const modifier of filter_and_map_existing_units(cast.modifiers)) {
                apply_modifier(game, modifier.unit, modifier.modifier, source);
            }

            for (const move of filter_and_map_existing_units(cast.moves)) {
                move.unit.position = move.move_to;
                move.unit.handle.SetAbsOrigin(battle_position_to_world_position_center(battle.world_origin, move.move_to));
            }

            create_timed_effect(cast.block.effect_handle_id, cast.block.effect);

            break;
        }

        default: unreachable(cast);
    }
}

function modifier_to_visuals(target: Unit, modifier: Modifier): Modifier_Visuals_Container[] | undefined {
    function one_from_buff(name: string): Modifier_Visuals_Container {
        const buff = target.handle.AddNewModifier(target.handle, undefined, name, {});

        return {
            from_buff: true,
            buff: buff
        }
    }

    function one_from_fx(fx: FX): Modifier_Visuals_Container {
        return {
            from_buff: false,
            fx: fx
        }
    }

    function one_from_activity_translation(translation: Activity_Translation): Modifier_Visuals_Container {
        const buff = add_activity_translation(target, translation);

        return {
            from_buff: true,
            buff: buff
        }
    }

    function from_buff(name: string): Modifier_Visuals_Container[] {
        return [one_from_buff(name)];
    }

    function from_fx(fx: FX): Modifier_Visuals_Container[] {
        return [one_from_fx(fx)];
    }

    function follow(path: string) {
        return from_fx(fx_follow_unit(path, target));
    }

    switch (modifier.id) {
        case Modifier_Id.tide_gush: return from_buff("Modifier_Tide_Gush");
        case Modifier_Id.skywrath_ancient_seal: return from_fx(
            fx("particles/units/heroes/hero_skywrath_mage/skywrath_mage_ancient_seal_debuff.vpcf")
                .follow_unit_overhead(0, target)
                .follow_unit_origin(1, target)
        );
        case Modifier_Id.skywrath_concussive_shot: return follow("particles/units/heroes/hero_skywrath_mage/skywrath_mage_concussive_shot_slow_debuff.vpcf");
        case Modifier_Id.dragon_knight_elder_dragon_form: return from_buff("Modifier_Dragon_Knight_Elder_Dragon");
        case Modifier_Id.lion_hex: return from_buff("Modifier_Lion_Hex");
        case Modifier_Id.venge_wave_of_terror: return follow("particles/units/heroes/hero_vengeful/vengeful_wave_of_terror_recipient.vpcf");
        case Modifier_Id.dark_seer_ion_shell: return from_fx(
             fx("particles/units/heroes/hero_dark_seer/dark_seer_ion_shell.vpcf")
                .to_unit_attach_point(0, target, "attach_hitloc")
                .with_point_value(1, 50, 50, 50)
        );
        case Modifier_Id.dark_seer_surge: return follow("particles/units/heroes/hero_dark_seer/dark_seer_surge.vpcf");
        case Modifier_Id.ember_searing_chains: return follow("particles/units/heroes/hero_ember_spirit/ember_spirit_searing_chains_debuff.vpcf");
        case Modifier_Id.rune_double_damage: return follow("particles/generic_gameplay/rune_doubledamage_owner.vpcf");
        case Modifier_Id.rune_haste: return follow("particles/generic_gameplay/rune_haste_owner.vpcf");
        case Modifier_Id.item_satanic: return follow("particles/items2_fx/satanic_buff.vpcf");
        case Modifier_Id.item_mask_of_madness: return follow("particles/items2_fx/mask_of_madness.vpcf");
        case Modifier_Id.item_armlet: return follow("particles/items_fx/armlet.vpcf");
        case Modifier_Id.spell_euls_scepter: return from_buff("Modifier_Euls_Scepter");
        case Modifier_Id.spell_buckler: return follow("particles/items_fx/buckler.vpcf");
        case Modifier_Id.spell_drums_of_endurance: return follow("particles/items_fx/drum_of_endurance_buff.vpcf");
        case Modifier_Id.ember_fire_remnant: {
            // TODO proper predictable @Random
            const animations = [39, 40, 41]; // Sequence numbers of GameActivity_t.ACT_DOTA_OVERRIDE_ABILITY_4 for ember
            const fx = fx_follow_unit("particles/units/heroes/hero_ember_spirit/ember_spirit_fire_remnant.vpcf", target)
                .with_point_value(2, animations[RandomInt(0, animations.length)]);

            const owner = find_unit_by_id(modifier.remnant_owner_unit_id);

            if (owner) {
                fx.follow_unit_origin(1, owner);
            }

            return from_fx(fx);
        }

        case Modifier_Id.shaker_enchant_totem_caster: return [
            one_from_activity_translation(Activity_Translation.enchant_totem),
            one_from_fx(fx_by_unit("particles/units/heroes/hero_earthshaker/earthshaker_totem_buff.vpcf", target)
                    .to_unit_attach_point(0, target, "attach_totem"))
        ]
    }
}

function try_apply_modifier_visuals(target: Unit, handle_id: Modifier_Handle_Id, modifier: Modifier) {
    const visuals = modifier_to_visuals(target, modifier);
    if (!visuals) return;

    battle.applied_modifier_visuals.push({
        unit_id: target.id,
        modifier_handle_id: handle_id,
        visuals: visuals
    });
}

function try_remove_modifier_visuals(target: Unit, handle_id: Modifier_Handle_Id) {
    const index = array_find_index(battle.applied_modifier_visuals, visual =>
        visual.modifier_handle_id == handle_id &&
        visual.unit_id == target.id
    );

    if (index == -1) return;

    const container = battle.applied_modifier_visuals[index];

    for (const visual of container.visuals) {
        if (visual.from_buff) {
            visual.buff.Destroy();
        } else {
            visual.fx.destroy_and_release(false);
        }
    }

    battle.applied_modifier_visuals.splice(index, 1);
}

function update_unit_state_from_modifiers(unit: Unit) {
    const recalculated = recalculate_unit_stats_from_modifiers(unit, unit.modifiers.map(applied => applied.modifier));

    unit.bonus = recalculated.bonus;
    unit.status = recalculated.status;
    unit.health = recalculated.health;
    unit.move_points = recalculated.move_points;

    update_state_visuals(unit);
}

function apply_modifier(game: Game, target: Unit, application: Modifier_Application, source: Modifier_Data_Source) {
    print(`Apply and record ${application.modifier_handle_id} to ${target.handle.GetName()}`);

    try_apply_modifier_visuals(target, application.modifier_handle_id, application.modifier);

    target.modifiers.push({
        modifier: application.modifier,
        modifier_handle_id: application.modifier_handle_id,
        source: source
    });

    update_unit_state_from_modifiers(target);
    update_game_net_table(game);
}

function unit_emit_sound(unit: Handle_Provider, sound: string): Started_Sound {
    unit.handle.EmitSound(sound);

    return {
        stop(): void {
            unit.handle.StopSound(sound)
        }
    }
}

function unit_stop_sound(unit: Unit, sound: string) {
    unit.handle.StopSound(sound);
}

function battle_emit_sound(sound: string) {
    EmitSoundOnLocationWithCaster(battle.camera_dummy.GetAbsOrigin(), sound, battle.camera_dummy);
}

function spawn_unit_with_fx<T extends Unit>(at: XY, supplier: () => T): T {
    fx("particles/hero_spawn.vpcf")
        .to_location(0, at)
        .release();

    wait(0.25);

    shake_screen(at, Shake.medium);

    const new_unit = supplier();

    unit_emit_sound(new_unit, "hero_spawn");
    show_damage_effect_on_target(new_unit);
    fx_by_unit("particles/dev/library/base_dust_hit.vpcf", new_unit).release();

    register_unit(battle, new_unit);

    return new_unit;
}

function play_unit_target_ability_delta(game: Game, caster: Unit, cast: Delta_Unit_Target_Ability, target: Unit) {
    const source = unit_source(caster, cast.ability_id);

    turn_unit_towards_target(caster, target.position);
    highlight_grid_for_targeted_ability(caster, cast.ability_id, target.position);

    switch (cast.ability_id) {
        case Ability_Id.pudge_dismember: {
            function loop_health_change(target: Unit, change: Health_Change) {
                const loops = 4;
                const length = Math.abs(change.new_value - target.health);
                const direction = change.value_delta / length;
                const change_per_loop = Math.ceil(length / loops);

                let remaining = length;

                while (remaining != 0) {
                    const delta = (remaining > change_per_loop ? change_per_loop : remaining) * direction;

                    change_health(game, caster, target, { new_value: target.health + delta, value_delta: delta });

                    remaining = Math.max(0, remaining - change_per_loop);

                    wait(0.6);
                }
            }

            const channel = unit_start_gesture(caster, GameActivity_t.ACT_DOTA_CHANNEL_ABILITY_4);

            wait_for_all_forks([
                fork(() => loop_health_change(target, cast.damage_dealt)),
                fork(() => loop_health_change(caster, cast.health_restored))
            ]);

            channel.fade();

            break;
        }

        case Ability_Id.tide_gush: {
            const fx = "particles/units/heroes/hero_tidehunter/tidehunter_gush.vpcf";

            unit_play_activity(caster, GameActivity_t.ACT_DOTA_CAST_ABILITY_1, 0.2);
            unit_emit_sound(caster, "Ability.GushCast");
            tracking_projectile_to_unit(caster, target, fx, 3000, "attach_attack2");
            unit_emit_sound(caster, "Ability.GushImpact");
            shake_screen(target.position, Shake.medium);
            apply_modifier(game, target, cast.modifier, source);
            change_health(game, caster, target, cast.damage_dealt);

            break;
        }

        case Ability_Id.luna_lucent_beam: {
            unit_emit_sound(caster, "Hero_Luna.LucentBeam.Cast");
            unit_play_activity(caster, GameActivity_t.ACT_DOTA_CAST_ABILITY_1, 0.6);

            fx("particles/units/heroes/hero_luna/luna_lucent_beam.vpcf")
                .to_unit_origin(0, target)
                .to_unit_origin(1, target)
                .to_unit_origin(5, target)
                .to_unit_origin(6, caster)
                .release();

            shake_screen(target.position, Shake.medium);
            unit_emit_sound(caster, "Hero_Luna.LucentBeam.Target");
            change_health(game, caster, target, cast.damage_dealt);

            break;
        }

        case Ability_Id.skywrath_ancient_seal: {
            unit_play_activity(caster, GameActivity_t.ACT_DOTA_CAST_ABILITY_3, 0.4);
            unit_emit_sound(target, "Hero_SkywrathMage.AncientSeal.Target");
            apply_modifier(game, target, cast.modifier, source);

            break;
        }

        case Ability_Id.dragon_knight_dragon_tail: {
            fx("particles/units/heroes/hero_dragon_knight/dragon_knight_dragon_tail.vpcf")
                .to_unit_attach_point(2, caster, "attach_attack2")
                .with_vector_value(3, caster.handle.GetForwardVector())
                .to_unit_attach_point(4, target, "attach_hitloc")
                .release();

            unit_play_activity(caster, GameActivity_t.ACT_DOTA_CAST_ABILITY_2, 0.4);
            unit_emit_sound(target, "Hero_DragonKnight.DragonTail.Target");
            apply_modifier(game, target, cast.modifier, source);
            change_health(game, caster, target, cast.damage_dealt);
            shake_screen(target.position, Shake.medium);

            break;
        }

        case Ability_Id.lion_hex: {
            unit_play_activity(caster, GameActivity_t.ACT_DOTA_CAST_ABILITY_2, 0.4);
            unit_emit_sound(target, "Hero_Lion.Voodoo");
            unit_emit_sound(target, "Hero_Lion.Hex.Target");
            apply_modifier(game, target, cast.modifier, source);
            shake_screen(target.position, Shake.weak);
            fx_by_unit("particles/units/heroes/hero_lion/lion_spell_voodoo.vpcf", target).release();

            break;
        }

        case Ability_Id.lion_finger_of_death: {
            unit_play_activity(caster, GameActivity_t.ACT_DOTA_CAST_ABILITY_4, 0.4);
            unit_emit_sound(caster, "Hero_Lion.FingerOfDeath");

            fx("particles/units/heroes/hero_lion/lion_spell_finger_of_death.vpcf")
                .to_unit_attach_point(0, caster, "attach_attack2")
                .to_unit_attach_point(1, target, "attach_hitloc")
                .to_unit_attach_point(2, target, "attach_hitloc")
                .release();

            wait(0.1);

            unit_emit_sound(target, "Hero_Lion.FingerOfDeathImpact");
            change_health(game, caster, target, cast.damage_dealt);
            shake_screen(target.position, Shake.medium);

            break;
        }

        case Ability_Id.venge_magic_missile: {
            const projectile_fx = "particles/units/heroes/hero_vengeful/vengeful_magic_missle.vpcf";

            unit_play_activity(caster, GameActivity_t.ACT_DOTA_CAST_ABILITY_1, 0.4);
            unit_emit_sound(caster, "Hero_VengefulSpirit.MagicMissile");
            tracking_projectile_to_unit(caster, target, projectile_fx, 1400, "attach_attack2");
            unit_emit_sound(target, "Hero_VengefulSpirit.MagicMissileImpact");
            change_health(game, caster, target, cast.damage_dealt);
            apply_modifier(game, target, cast.modifier, source);
            shake_screen(target.position, Shake.medium);

            break;
        }

        case Ability_Id.venge_nether_swap: {
            unit_play_activity(caster, GameActivity_t.ACT_DOTA_CAST_ABILITY_4);
            unit_emit_sound(caster, "Hero_VengefulSpirit.NetherSwap");

            fx("particles/units/heroes/hero_vengeful/vengeful_nether_swap.vpcf")
                .to_unit_origin(0, caster)
                .to_unit_origin(1, target);

            fx("particles/units/heroes/hero_vengeful/vengeful_nether_swap_target.vpcf")
                .to_unit_origin(0, target)
                .to_unit_origin(1, caster);

            const caster_position = caster.position;
            const target_position = target.position;

            const caster_world_position = caster.handle.GetAbsOrigin();
            const target_world_position = target.handle.GetAbsOrigin();

            target.position = caster_position;
            caster.position = target_position;

            target.handle.SetAbsOrigin(caster_world_position);
            caster.handle.SetAbsOrigin(target_world_position);

            const channel = unit_start_gesture(caster, GameActivity_t.ACT_DOTA_CHANNEL_END_ABILITY_4);

            wait(0.7);

            channel.fade();

            break;
        }

        case Ability_Id.dark_seer_ion_shell: {
            unit_play_activity(caster, GameActivity_t.ACT_DOTA_CAST_ABILITY_2);
            unit_emit_sound(target, "Hero_Dark_Seer.Ion_Shield_Start");
            apply_modifier(game, target, cast.modifier, source);

            break;
        }

        case Ability_Id.dark_seer_surge: {
            unit_play_activity(caster, GameActivity_t.ACT_DOTA_CAST_ABILITY_3);
            unit_emit_sound(caster, "Hero_Dark_Seer.Surge");
            apply_modifier(game, target, cast.modifier, source);

            break;
        }

        default: unreachable(cast);
    }
}

function play_no_target_ability_delta(game: Game, unit: Unit, cast: Delta_Use_No_Target_Ability) {
    const source = unit_source(unit, cast.ability_id);

    highlight_grid_for_no_target_ability(unit, cast.ability_id);

    switch (cast.ability_id) {
        case Ability_Id.pudge_rot: {
            const particle = fx_follow_unit("particles/units/heroes/hero_pudge/pudge_rot.vpcf", unit).with_point_value(1, 300, 1, 1);
            const cast_gesture = unit_start_gesture(unit, GameActivity_t.ACT_DOTA_CAST_ABILITY_ROT);
            const cast_sound = unit_emit_sound(unit, "pudge_ability_rot");

            wait(0.2);

            for (const target_data of from_client_array(cast.targets)) {
                const target = find_unit_by_id(target_data.target_unit_id);

                if (target) {
                    change_health(game, unit, target, target_data.change);
                }
            }

            wait(1.0);

            cast_sound.stop();
            cast_gesture.fade();
            particle.destroy_and_release(false);

            break;
        }

        case Ability_Id.tide_anchor_smash: {
            const cast_gesture = unit_start_gesture(unit, GameActivity_t.ACT_DOTA_CAST_ABILITY_3);

            wait(0.2);

            fx_by_unit("particles/units/heroes/hero_tidehunter/tidehunter_anchor_hero.vpcf", unit).release();
            unit_emit_sound(unit, "Hero_Tidehunter.AnchorSmash");
            shake_screen(unit.position, Shake.weak);

            wait(0.2);

            for (const effect of from_client_array(cast.targets)) {
                const target = find_unit_by_id(effect.target_unit_id);

                if (target) {
                    change_health(game, unit, target, effect.change);
                    apply_modifier(game, target, effect.modifier, source);
                }
            }

            wait(1);

            cast_gesture.fade();

            break;
        }

        case Ability_Id.tide_ravage: {
            tide_ravage(game, unit, cast);

            break;
        }

        case Ability_Id.luna_eclipse: {
            const day_time = GameRules.GetTimeOfDay();

            const cast_gesture = unit_start_gesture(unit, GameActivity_t.ACT_DOTA_CAST_ABILITY_4);

            unit_emit_sound(unit, "vo_luna_eclipse");
            wait(0.6);
            unit_emit_sound(unit, "Hero_Luna.Eclipse.Cast");

            GameRules.SetTimeOfDay(0);

            const eclipse_fx = fx_by_unit("particles/units/heroes/hero_luna/luna_eclipse.vpcf", unit)
                .with_point_value(1, 500)
                .to_unit_origin(2, unit)
                .to_unit_origin(3, unit);

            const beam_targets = filter_and_map_existing_units(cast.targets)
                .filter(target => target.change.value_delta != 0)
                .map(target => ({
                    target: target,
                    beams_remaining: -target.change.value_delta
                }));

            while (beam_targets.length > 0) {
                const random_index = RandomInt(0, beam_targets.length - 1);
                const random_target = beam_targets[random_index];
                const target_unit = random_target.target.unit;

                random_target.beams_remaining--;

                if (target_unit) {
                    fx("particles/units/heroes/hero_luna/luna_eclipse_impact.vpcf")
                        .to_unit_origin(0, target_unit)
                        .to_unit_origin(1, target_unit)
                        .to_unit_origin(5, target_unit)
                        .release();

                    unit_emit_sound(target_unit, "Hero_Luna.Eclipse.Target");
                    change_health(game, unit, target_unit, { new_value: target_unit.health - 1, value_delta: -1 });
                    shake_screen(target_unit.position, Shake.weak);
                }

                if (random_target.beams_remaining == 0) {
                    beam_targets.splice(random_index, 1);
                }

                wait(0.3);
            }

            if (cast.missed_beams > 0) {
                // @HardcodedConstant
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

                    EmitSoundOnLocationWithCaster(battle_position_to_world_position_center(battle.world_origin, position), "Hero_Luna.Eclipse.NoTarget", unit.handle);

                    wait(0.3);
                }
            }

            cast_gesture.fade();

            eclipse_fx.destroy_and_release(false);

            GameRules.SetTimeOfDay(day_time);

            break;
        }

        case Ability_Id.skywrath_concussive_shot: {
            function is_shot_hit(cast: Concussive_Shot_Hit | Concussive_Shot_Miss): cast is Concussive_Shot_Hit {
                return from_client_bool(cast.hit); // @PanoramaBool
            }

            const projectile_fx = "particles/units/heroes/hero_skywrath_mage/skywrath_mage_concussive_shot.vpcf";

            unit_play_activity(unit, GameActivity_t.ACT_DOTA_CAST_ABILITY_2, 0.1);
            unit_emit_sound(unit, "Hero_SkywrathMage.ConcussiveShot.Cast");

            if (is_shot_hit(cast.result)) {
                const target = find_unit_by_id(cast.result.target_unit_id);

                if (target) {
                    tracking_projectile_to_unit(unit, target, projectile_fx, 1200, "attach_attack2");
                    unit_emit_sound(target, "Hero_SkywrathMage.ConcussiveShot.Target");
                    change_health(game, unit, target, cast.result.damage);
                    apply_modifier(game, target, cast.result.modifier, source);
                    shake_screen(target.position, Shake.weak);
                }
            } else {
                const failure_fx = "particles/units/heroes/hero_skywrath_mage/skywrath_mage_concussive_shot_failure.vpcf";

                fx_follow_unit(failure_fx, unit).release();
            }

            break;
        }

        case Ability_Id.dragon_knight_elder_dragon_form: {
            unit_emit_sound(unit, "vo_dragon_knight_elder_dragon_form");
            unit_play_activity(unit, GameActivity_t.ACT_DOTA_CAST_ABILITY_1, 0.8);
            fx_by_unit("particles/units/heroes/hero_dragon_knight/dragon_knight_transform_red.vpcf", unit).release();
            unit_emit_sound(unit, "Hero_DragonKnight.ElderDragonForm");
            apply_modifier(game, unit, cast.modifier, source);

            break;
        }

        case Ability_Id.mirana_starfall: {
            unit_play_activity(unit, GameActivity_t.ACT_DOTA_CAST_ABILITY_1, 0.8);
            fx_by_unit("particles/units/heroes/hero_mirana/mirana_starfall_circle.vpcf", unit).release();
            unit_emit_sound(unit, "Ability.Starfall");

            wait_for_all_forks(filter_and_map_existing_units(cast.targets).map(target => fork(() => {
                starfall_drop_star_on_unit(game, unit, target.unit, target.change);
            })));

            break;
        }

        case Ability_Id.ember_searing_chains: {
            unit_play_activity(unit, GameActivity_t.ACT_DOTA_CAST_ABILITY_1, 0.2);
            unit_emit_sound(unit, "Hero_EmberSpirit.SearingChains.Cast");
            fx_by_unit("particles/units/heroes/hero_ember_spirit/ember_spirit_searing_chains_cast.vpcf", unit)
                .with_point_value(1, 300)
                .release();

            // Forking here is not really required since all projectiles arrive at the same point, but w/e
            wait_for_all_forks(filter_and_map_existing_units(cast.targets).map(target => fork(() => {
                fx("particles/units/heroes/hero_ember_spirit/ember_spirit_searing_chains_start.vpcf")
                    .to_unit_attach_point(0, unit, "attach_hitloc")
                    .to_unit_attach_point(1, target.unit, "attach_hitloc")
                    .release();

                wait(0.25);
                apply_modifier(game, target.unit, target.modifier, source);
                unit_emit_sound(target.unit, "Hero_EmberSpirit.SearingChains.Target");
            })));

            break;
        }

        case Ability_Id.ember_sleight_of_fist: {
            // TODO @VoiceOver

            const remnant_fx = fx("particles/units/heroes/hero_ember_spirit/ember_spirit_sleight_of_fist_caster.vpcf")
                .with_vector_value(0, unit.handle.GetAbsOrigin())
                .with_forward_vector(1, unit.handle.GetForwardVector())
                .follow_unit_origin(1, unit);

            unit.handle.AddNoDraw();

            unit_emit_sound(unit, "Hero_EmberSpirit.SleightOfFist.Cast");

            const targets = filter_and_map_existing_units(cast.targets).map(target => ({
                ...target,
                particle: fx_by_unit("particles/units/heroes/hero_ember_spirit/ember_spirit_sleight_of_fist_targetted_marker.vpcf", target.unit)
                    .follow_unit_overhead(0, target.unit)
            }));

            for (let index = 0; index < targets.length; index++) {
                wait(0.2);

                const previous_target = index == 0 ? unit : targets[index - 1].unit;
                const target = targets[index];

                unit_emit_sound(target.unit, "Hero_EmberSpirit.SleightOfFist.Damage");

                fx_follow_unit("particles/units/heroes/hero_ember_spirit/ember_spirit_sleightoffist_tgt.vpcf", target.unit)
                    .release();

                fx("particles/units/heroes/hero_ember_spirit/ember_spirit_sleightoffist_trail.vpcf")
                    .to_location(0, previous_target.position)
                    .to_location(1, target.unit.position)
                    .release();

                target.particle.destroy_and_release(false);

                change_health(game, unit, target.unit, target.change);
            }

            remnant_fx.destroy_and_release(false);
            unit.handle.RemoveNoDraw();

            break;
        }

        case Ability_Id.ember_activate_fire_remnant: {
            const world_from = battle_position_to_world_position_center(battle.world_origin, unit.position);
            const world_to = battle_position_to_world_position_center(battle.world_origin, cast.action.move_to);
            const world_delta = world_to - world_from as Vector;
            const distance = world_delta.Length();
            const direction = world_delta.Normalized();
            const time_to_travel = 0.3;
            const peak_height = Math.min(250, distance / 5);

            turn_unit_towards_target(unit, cast.action.move_to);

            const particle = fx("particles/units/heroes/hero_ember_spirit/ember_spirit_remnant_dash.vpcf")
                .follow_unit_origin(0, unit)
                .follow_unit_origin(1, unit);

            unit_emit_sound(unit, "Hero_EmberSpirit.FireRemnant.Activate");

            unit.handle.AddNoDraw();

            do_each_frame_for(time_to_travel, progress => {
                const position_now = world_from + (direction * distance * progress) as Vector;
                position_now.z = world_from.z + parabolic(progress) * peak_height;

                unit.handle.SetAbsOrigin(position_now);
            });

            unit_emit_sound(unit, "Hero_EmberSpirit.FireRemnant.Explode");
            unit_emit_sound(unit, "Hero_EmberSpirit.FireRemnant.Stop");

            const remnant = find_unit_by_id(cast.action.remnant_id);

            if (remnant) {
                kill_unit(remnant, remnant);
            }

            unit.handle.RemoveNoDraw();

            particle.destroy_and_release(false);

            unit.position = cast.action.move_to;
            unit.handle.SetAbsOrigin(world_to);

            break;
        }

        case Ability_Id.shaker_enchant_totem: {
            unit_play_activity(unit, GameActivity_t.ACT_DOTA_CAST_ABILITY_2);
            unit_emit_sound(unit, "Hero_EarthShaker.Totem");

            const targets = filter_and_map_existing_units(cast.targets);

            fx_by_unit("particles/units/heroes/hero_earthshaker/earthshaker_totem_leap_impact.vpcf", unit).release();

            apply_modifier(game, unit, cast.modifier, source);

            for (const target of targets) {
                apply_modifier(game, target.unit, target.modifier, source);
            }

            break;
        }

        case Ability_Id.shaker_echo_slam: {
            unit_play_activity(unit, GameActivity_t.ACT_DOTA_CAST_ABILITY_4, 0);

            // TODO @VoiceOver

            const targets = filter_and_map_existing_units(cast.targets);

            if (targets.length > 1) {
                unit_emit_sound(unit, "Hero_EarthShaker.EchoSlam");
            } else {
                unit_emit_sound(unit, "Hero_EarthShaker.EchoSlamSmall");
            }

            fx_by_unit("particles/units/heroes/hero_earthshaker/earthshaker_echoslam_start.vpcf", unit)
                .with_point_value(1, 10)
                .release();

            wait_for_all_forks(targets.map(target => fork(() => {
                const projectile = "particles/units/heroes/hero_earthshaker/earthshaker_echoslam.vpcf";

                tracking_projectile_to_unit(unit, target.unit, projectile, 800, "attach_hitloc");
                change_health(game, unit, target.unit, target.change);
                unit_emit_sound(target.unit, "Hero_EarthShaker.EchoSlamEcho");
            })));

            break;
        }

        default: unreachable(cast);
    }
}

function play_no_target_spell_delta(game: Game, caster: Battle_Player, cast: Delta_Use_No_Target_Spell) {
    const source = player_source(caster);

    switch (cast.spell_id) {
        case Spell_Id.mekansm: {
            battle_emit_sound("DOTA_Item.Mekansm.Activate");

            for (const target of filter_and_map_existing_units(cast.targets)) {
                fx_follow_unit("particles/items2_fx/mekanism.vpcf", target.unit).release();
                unit_emit_sound(target.unit, "DOTA_Item.Mekansm.Target");
                change_health(game, target.unit, target.unit, target.change);
            }

            break;
        }
        
        case Spell_Id.buckler: {
            battle_emit_sound("DOTA_Item.Buckler.Activate");

            for (const target of filter_and_map_existing_units(cast.targets)) {
                apply_modifier(game, target.unit, target.modifier, source);
            }

            break;
        }

        case Spell_Id.drums_of_endurance: {
            battle_emit_sound("DOTA_Item.DoE.Activate");

            for (const target of filter_and_map_existing_units(cast.targets)) {
                apply_modifier(game, target.unit, target.modifier, source);
            }

            break;
        }

        case Spell_Id.call_to_arms: {
            const facing = find_player_deployment_zone_facing(cast.player_id);

            if (!facing) break;

            battle_emit_sound("call_to_arms");

            for (const summon of from_client_array(cast.summons)) {
                const creep = spawn_unit_with_fx(summon.at, () => spawn_creep_for_battle(summon.unit_type, summon.unit_id, cast.player_id, summon.at, facing));

                add_activity_override(creep, GameActivity_t.ACT_DOTA_SHARPEN_WEAPON, 1.0);
            }

            break;
        }

        default: unreachable(cast);
    }
}

function play_ground_target_spell_delta(game: Game, cast: Delta_Use_Ground_Target_Spell) {
    switch (cast.spell_id) {
        case Spell_Id.pocket_tower: {
            const facing = find_player_deployment_zone_facing(cast.player_id);

            if (!facing) break;

            spawn_unit_with_fx(cast.at, () => spawn_creep_for_battle(cast.new_unit_type, cast.new_unit_id, cast.player_id, cast.at, facing));

            break;
        }

        default: unreachable(cast.spell_id);
    }
}

function play_unit_target_spell_delta(game: Game, caster: Battle_Player, target: Unit, cast: Delta_Use_Unit_Target_Spell) {
    const source = player_source(caster);

    switch (cast.spell_id) {
        case Spell_Id.buyback: {
            target.dead = false;

            battle_emit_sound("buyback_use");
            change_gold(game, caster, cast.gold_change);
            change_health(game, target, target, cast.heal);
            apply_modifier(game, target, cast.modifier, source);

            break;
        }

        case Spell_Id.town_portal_scroll: {
            const particle = fx("particles/items2_fx/teleport_start.vpcf")
                .with_vector_value(0, target.handle.GetAbsOrigin())
                .with_point_value(2, 255, 255, 255);

            const teleport_gesture = unit_start_gesture(target, GameActivity_t.ACT_DOTA_TELEPORT);
            const loop_sound = unit_emit_sound(target, "Portal.Loop_Disappear");

            wait(3);

            unit_emit_sound(target, "Portal.Hero_Disappear");
            change_health(game, target, target, cast.heal);
            apply_modifier(game, target, cast.modifier, source);

            loop_sound.stop();
            teleport_gesture.fade();
            particle.destroy_and_release(false);

            break;
        }

        case Spell_Id.euls_scepter: {
            unit_emit_sound(target, "DOTA_Item.Cyclone.Activate");
            apply_modifier(game, target, cast.modifier, source);

            break;
        }

        case Spell_Id.refresher_orb: {
            fx("particles/items2_fx/refresher.vpcf").to_unit_attach_point(0, target, "attach_hitloc").release();
            unit_emit_sound(target, "equip_refresher");

            break;
        }

        default: unreachable(cast);
    }
}

function create_timed_effect(handle_id: Effect_Handle_Id, effect: Timed_Effect) {
    switch (effect.type) {
        case Timed_Effect_Type.shaker_fissure_block: {
            function add_normal(to: XY, scale: number) {
                return { x: to.x + effect.normal.x * scale, y: to.y + effect.normal.y * scale };
            }

            const from = effect.from;
            const to = add_normal(effect.from, effect.steps - 1);

            const particle = fx("particles/units/heroes/hero_earthshaker/earthshaker_fissure.vpcf")
                .to_location(0, from)
                .to_location(1, to)
                .with_point_value(2, 60 * 60 * 5); // Lifetime. Not infinite!

            if (effect.steps == 0) {
                particle.with_point_value(2, 0.5).release();
            } else {
                battle.timed_effect_visuals.push({
                    effect_handle_id: handle_id,
                    visuals: [ particle ]
                });
            }

            break;
        }

        default: unreachable(effect.type);
    }
}

function expire_timed_effect(id: Effect_Handle_Id) {
    const index = array_find_index(battle.timed_effect_visuals, effect => effect.effect_handle_id == id);
    if (index == -1) return;

    const effect = battle.timed_effect_visuals[index];

    for (const fx of effect.visuals) {
        fx.destroy_and_release(false);
    }

    battle.timed_effect_visuals.splice(index, 1);
}

function play_modifier_effect_delta(game: Game, delta: Delta_Modifier_Effect_Applied) {
    switch (delta.modifier_id) {
        case Modifier_Id.item_heart_of_tarrasque:
        case Modifier_Id.item_armlet: {
            const target = find_unit_by_id(delta.change.target_unit_id);
            if (!target) break;

            change_health(game, target, target, delta.change.change);

            break;
        }

        case Modifier_Id.item_octarine_core: {
            const target = find_unit_by_id(delta.heal.target_unit_id);
            if (!target) break;

            change_health(game, target, target, delta.heal.change);
            fx_by_unit("particles/items3_fx/octarine_core_lifesteal.vpcf", target).release();

            break;
        }

        case Modifier_Id.item_morbid_mask:
        case Modifier_Id.item_satanic: {
            const target = find_unit_by_id(delta.heal.target_unit_id);
            if (!target) break;

            change_health(game, target, target, delta.heal.change);
            fx_by_unit("particles/generic_gameplay/generic_lifesteal.vpcf", target).release();

            break;
        }

        case Modifier_Id.item_basher_bearer: {
            const target = find_unit_by_id(delta.target_unit_id);
            if (!target) break;

            unit_emit_sound(target, "DOTA_Item.SkullBasher");
            apply_modifier(game, target, delta.modifier, {
                type: Source_Type.modifier,
                modifier_id: delta.modifier_id
            });

            break;
        }

        default: unreachable(delta);
    }

    wait(0.2);
}

function play_ability_effect_delta(game: Game, effect: Ability_Effect) {
    switch (effect.ability_id) {
        case Ability_Id.luna_moon_glaive: {
            const source = find_unit_by_id(effect.source_unit_id);
            const target = find_unit_by_id(effect.target_unit_id);
            const original_target = find_unit_by_id(effect.original_target_id);

            if (source && target && original_target) {
                const spec = get_ranged_attack_spec(source);

                if (spec) {
                    tracking_projectile_to_unit(original_target, target, spec.particle_path, spec.projectile_speed, "attach_hitloc");
                    unit_emit_sound(target, "Hero_Luna.MoonGlaive.Impact");
                }

                change_health(game, source, target, effect.damage_dealt);
            }

            break;
        }

        case Ability_Id.mirana_starfall: {
            const source = find_unit_by_id(effect.source_unit_id);
            const target = find_unit_by_id(effect.target_unit_id);

            if (source && target) {
                wait(0.25);
                starfall_drop_star_on_unit(game, source, target, effect.damage_dealt);
            }

            break;
        }

        case Ability_Id.dark_seer_ion_shell: {
            const source = find_unit_by_id(effect.source_unit_id);

            if (source) {
                for (const target of filter_and_map_existing_units(effect.targets)) {
                    change_health(game, source, target.unit, target.change);
                    fx("particles/units/heroes/hero_dark_seer/dark_seer_ion_shell_damage.vpcf")
                        .follow_unit_origin(0, source)
                        .to_unit_attach_point(1, target.unit, "attach_hitloc")
                        .release();
                }

                wait(1);
            }

            break;
        }

        case Ability_Id.pocket_tower_attack: {
            const source = find_unit_by_id(effect.source_unit_id);
            const target = find_unit_by_id(effect.target_unit_id);

            if (source && target) {
                turn_unit_towards_target(source, target.position);
                add_activity_override(source, GameActivity_t.ACT_DOTA_CUSTOM_TOWER_ATTACK);

                wait(0.5);

                const attack_particle = "particles/econ/world/towers/rock_golem/radiant_rock_golem_attack.vpcf";

                unit_emit_sound(source, "pocket_tower_attack");
                tracking_projectile_from_point_to_unit(source.handle.GetAbsOrigin() + Vector(0, 0, 200) as Vector, target, attack_particle, 1600);
                shake_screen(target.position, Shake.medium);
                add_activity_override(source, GameActivity_t.ACT_DOTA_CUSTOM_TOWER_IDLE);
                change_health(game, source, target, effect.damage_dealt);
                unit_emit_sound(target, "Tower.HeroImpact");
            }

            break;
        }

        case Ability_Id.monster_lifesteal: {
            const target = find_unit_by_id(effect.target_unit_id);
            if (!target) break;

            change_health(game, target, target, effect.heal);
            fx_by_unit("particles/generic_gameplay/generic_lifesteal.vpcf", target).release();

            break;
        }

        case Ability_Id.monster_spawn_spiderlings: {
            const source = find_unit_by_id(effect.source_unit_id);
            if (!source) break;

            unit_emit_sound(source, "spawn_spiderlings");

            fx("particles/units/heroes/hero_broodmother/broodmother_spiderlings_spawn.vpcf")
                .with_vector_value(0, battle_position_to_world_position_center(battle.world_origin, source.position))
                .release();

            const spawn_at = source.position;
            const forks: Fork[] = [];

            for (const summon of from_client_array(effect.summons)) {
                forks.push(fork(() => {
                    const direction = (Vector(summon.at.x, summon.at.y) - Vector(spawn_at.x, spawn_at.y) as Vector).Normalized();

                    if (direction.Length2D() == 0) {
                        const creep = spawn_creep_for_battle(summon.creep_type, summon.unit_id, summon.owner_id, spawn_at, RandomVector(1));
                        register_unit(battle, creep);

                        return;
                    }

                    const creep = spawn_creep_for_battle(summon.creep_type, summon.unit_id, summon.owner_id, spawn_at, { x: direction.x, y: direction.y });
                    const world_target = battle_position_to_world_position_center(battle.world_origin, summon.at);

                    register_unit(battle, creep);

                    while (true) {
                        creep.handle.MoveToPosition(world_target);

                        wait(0.1);

                        if ((creep.handle.GetAbsOrigin() - world_target as Vector).Length2D() <= 32) {
                            wait(0.1);
                            break;
                        }
                    }

                    creep.position = summon.at;
                }));
            }

            update_game_net_table(game);
            wait_for_all_forks(forks);

            break;
        }

        default: unreachable(effect);
    }
}

function play_rune_pickup_delta(game: Game, unit: Hero, delta: Delta_Rune_Pick_Up) {
    switch (delta.rune_type) {
        case Rune_Type.bounty: {
            fx("particles/generic_gameplay/rune_bounty_owner.vpcf")
                .follow_unit_origin(0, unit)
                .follow_unit_origin(1, unit)
                .release();

            const player = array_find(battle.players, player => player.id == unit.owner_remote_id);

            if (player) {
                change_gold(game, player, delta.gold_gained);
            }

            unit_emit_sound(unit, "Rune.Bounty");
            wait(0.5);

            break;
        }

        case Rune_Type.double_damage: {
            unit_emit_sound(unit, "Rune.DD");
            apply_modifier(game, unit, delta.modifier, no_source());
            wait(0.5);

            break;
        }

        case Rune_Type.haste: {
            unit_emit_sound(unit, "Rune.Haste");
            apply_modifier(game, unit, delta.modifier, no_source());
            wait(0.5);

            break;
        }

        case Rune_Type.regeneration: {
            const target = delta.heal.new_value;
            const direction = delta.heal.value_delta / Math.abs(delta.heal.value_delta);
            const particle = fx("particles/generic_gameplay/rune_regen_owner.vpcf")
                .follow_unit_origin(0, unit)
                .follow_unit_origin(1, unit);

            unit_emit_sound(unit, "Rune.Regen");

            while (unit.health != target) {
                change_health(game, unit, unit, { value_delta: direction, new_value: unit.health + direction });

                wait(0.25);
            }

            particle.destroy_and_release(false);

            wait(0.25);

            break;
        }
    }
}

function apply_item_equip_effects(game: Game, hero: Hero, equip: Equip_Item) {
    const source: Modifier_Data_Source = {
        type: Source_Type.item,
        item_id: equip.item_id
    };

    switch (equip.item_id) {
        case Item_Id.assault_cuirass: {
            apply_modifier(game, hero, equip.modifier, source);
            break;
        }

        case Item_Id.boots_of_travel: {
            apply_modifier(game, hero, equip.modifier, source);
            break;
        }

        case Item_Id.boots_of_speed: {
            apply_modifier(game, hero, equip.modifier, source);
            break;
        }

        case Item_Id.blades_of_attack: {
            apply_modifier(game, hero, equip.modifier, source);
            break;
        }

        case Item_Id.divine_rapier: {
            apply_modifier(game, hero, equip.modifier, source);
            break;
        }

        case Item_Id.heart_of_tarrasque: {
            apply_modifier(game, hero, equip.modifier, source);
            break;
        }

        case Item_Id.satanic: {
            apply_modifier(game, hero, equip.modifier, source);
            unit_emit_sound(hero, "equip_satanic");
            break;
        }

        case Item_Id.tome_of_knowledge: {
            change_hero_level(game, hero, equip.new_level);
            break;
        }

        case Item_Id.refresher_shard: {
            fx("particles/items2_fx/refresher.vpcf").to_unit_attach_point(0, hero, "attach_hitloc").release();
            unit_emit_sound(hero, "equip_refresher");

            break;
        }

        case Item_Id.mask_of_madness: {
            apply_modifier(game, hero, equip.modifier, source);
            unit_emit_sound(hero, "DOTA_Item.MaskOfMadness.Activate");

            break;
        }

        case Item_Id.armlet: {
            apply_modifier(game, hero, equip.modifier, source);
            unit_emit_sound(hero, "DOTA_Item.Armlet.Activate");

            break;
        }

        case Item_Id.belt_of_strength: {
            apply_modifier(game, hero, equip.modifier, source);

            break;
        }

        case Item_Id.morbid_mask: {
            apply_modifier(game, hero, equip.modifier, source);

            break;
        }

        case Item_Id.chainmail: {
            apply_modifier(game, hero, equip.modifier, source);
            break;
        }

        case Item_Id.octarine_core: {
            apply_modifier(game, hero, equip.modifier, source);
            break;
        }

        case Item_Id.basher: {
            apply_modifier(game, hero, equip.modifier, source);
            break;
        }

        case Item_Id.enchanted_mango: {
            fx_by_unit("particles/items3_fx/mango_active.vpcf", hero).release();
            unit_emit_sound(hero, "DOTA_Item.Mango.Activate");

            break;
        }

        default: unreachable(equip);
    }
}

function play_item_equip_delta(game: Game, hero: Hero, equip: Equip_Item) {
    wait(0.3);

    unit_emit_sound(hero, "Item.PickUpShop");
    try_play_random_sound_for_hero(hero, sounds => sounds.purchase);
    apply_item_equip_effects(game, hero, equip);

    wait(1.2);
}

function turn_unit_towards_target(unit: Unit, towards: XY) {
    const towards_world_position = battle_position_to_world_position_center(battle.world_origin, towards);
    const desired_forward = ((towards_world_position - unit.handle.GetAbsOrigin()) * Vector(1, 1, 0) as Vector).Normalized();

    if (desired_forward.Length2D() == 0) {
        return;
    }

    while (true) {
        unit.handle.FaceTowards(towards_world_position);

        if (desired_forward.Dot(unit.handle.GetForwardVector()) > 0.95) {
            break;
        }

        wait_one_frame();
    }
}

function update_specific_state_visuals(unit: Unit, flag: boolean, associated_modifier: string) {
    if (flag) {
        if (!unit.handle.HasModifier(associated_modifier)) {
            unit.handle.AddNewModifier(unit.handle, undefined, associated_modifier, {});
        }
    } else {
        unit.handle.RemoveModifierByName(associated_modifier);
    }
}

function update_state_visuals(unit: Unit) {
    update_specific_state_visuals(unit, is_unit_stunned(unit), "Modifier_Battle_Stunned");
    update_specific_state_visuals(unit, is_unit_silenced(unit), "modifier_silence");

    const was_hidden = unit.hidden;

    let unit_hidden = false;

    for (const applied of unit.modifiers) {
        if (applied.modifier.id == Modifier_Id.returned_to_hand) {
            unit_hidden = true;
        }
    }

    unit.hidden = unit_hidden;
    unit.handle.SetBaseMoveSpeed(Math.max(100, 500 + unit.bonus.max_move_points * 100));

    if (was_hidden != unit_hidden) {
        if (unit_hidden) {
            unit.handle.AddNoDraw();
        } else {
            unit.handle.RemoveNoDraw();
        }
    }
}

function unit_play_activity(unit: Unit, activity: GameActivity_t, wait_up_to = 0.4): number {
    // The combination of .Stop() and .ForcePlayActivityOnce() makes it so
    //     the activity starts playing but is then immediately cancelled the next frame
    //     but we can still get the sequence_duration (even though technically different
    //      sequences in an activity can have different duration!!!)
    //     then we use that duration to apply an actual animation override buff
    unit.handle.StopFacing();
    unit.handle.Stop();
    unit.handle.ForcePlayActivityOnce(activity);

    const sequence = unit.handle.GetSequence();
    const sequence_duration = unit.handle.SequenceDuration(sequence);
    const start_time = GameRules.GetGameTime();

    add_activity_override(unit, activity, sequence_duration);

    while (GameRules.GetGameTime() - start_time < sequence_duration * wait_up_to) {
        wait_one_frame();
    }

    const time_passed = GameRules.GetGameTime() - start_time;

    return sequence_duration - time_passed;
}

function apply_special_death_effects(target: Unit) {
    if (target.supertype == Unit_Supertype.creep && target.type == Creep_Type.pocket_tower) {
        target.handle.AddNoDraw();

        unit_emit_sound(target, "Building_RadiantTower.Destruction");

        fx("particles/econ/world/towers/rock_golem/radiant_rock_golem_destruction.vpcf")
            .with_vector_value(0, target.handle.GetAbsOrigin())
            .with_forward_vector(1, target.handle.GetForwardVector())
            .release();
    }

    if (target.supertype == Unit_Supertype.creep && target.type == Creep_Type.spider_matriarch) {
        fork(() => {
            wait(1);

            if (IsValidEntity(target.handle)) {
                target.handle.AddNoDraw();
            }
        })
    }
}

function kill_unit(source: Unit, target: Unit) {
    // TODO gold earning could have an actual source, it's probably where we should spawn the particle
    if (source.supertype != Unit_Supertype.monster && !are_units_allies(source, target)) {
        fx("particles/generic_gameplay/lasthit_coins.vpcf").to_unit_origin(1, target).release();
        fx_follow_unit("particles/generic_gameplay/lasthit_coins_local.vpcf", source)
            .to_unit_origin(1, target)
            .to_unit_attach_point(2, source, "attach_hitloc")
            .release();
    }

    if (source.supertype != Unit_Supertype.monster && target.supertype != Unit_Supertype.monster) {
        if (source.owner_remote_id == target.owner_remote_id) {
            try_play_random_sound_for_hero(source, sounds => sounds.deny);
        }
    }

    for (const applied of target.modifiers) {
        try_remove_modifier_visuals(target, applied.modifier_handle_id);
    }

    try_play_random_sound_for_hero(source, sounds => sounds.kill);
    apply_special_death_effects(target);

    target.handle.ForceKill(false);
    target.dead = true;
}

function change_health(game: Game, source: Unit, target: Unit, change: Health_Change) {
    function number_particle(amount: number, r: number, g: number, b: number) {
        fx("particles/msg_damage.vpcf")
            .to_unit_origin(0, target)
            .with_point_value(1, 0, amount)
            .with_point_value(2, Math.max(1, amount / 1.5), 2)
            .with_point_value(3, r, g, b)
            .release()
    }

    const value_delta = change.value_delta;

    if (value_delta > 0) {
        number_particle(value_delta,100, 255, 50);
    } else if (value_delta < 0) {
        show_damage_effect_on_target(target);

        // TODO @SoundSystem unify this into a singular sound system for all unit types
        if (target.supertype == Unit_Supertype.creep && target.type == Creep_Type.pocket_tower) {
            unit_emit_sound(target, "pocket_tower_pain");
        } else {
            try_play_random_sound_for_hero(target, sounds => sounds.pain);
        }

        number_particle(-value_delta, 250, 70, 70);
    }

    target.health = Math.max(0, Math.min(get_max_health(target), change.new_value));

    update_game_net_table(game);

    if (target.health == 0 && !target.dead) {
        kill_unit(source, target);
    }
}

function move_unit(game: Game, unit: Unit, path: XY[]) {
    for (const cell of path) {
        const world_position = battle_position_to_world_position_center(battle.world_origin, cell);

        unit.handle.MoveToPosition(world_position);

        wait_until(() => {
            return (unit.handle.GetAbsOrigin() - world_position as Vector).Length2D() < unit.handle.GetBaseMoveSpeed() / 10;
        });

        unit.move_points = unit.move_points - 1;

        update_game_net_table(game);
    }
}

function change_hero_level(game: Game, hero: Hero, new_level: number) {
    hero.level = new_level;

    unit_emit_sound(hero, "hero_level_up");
    fx_by_unit("particles/generic_hero_status/hero_levelup.vpcf", hero).release();
    try_play_random_sound_for_hero(hero, sounds => sounds.level_up);

    update_game_net_table(game);
}

function change_gold(game: Game, player: Battle_Player, change: number) {
    if (player.id == battle.this_player_id && battle.has_started) {
        battle_emit_sound("General.Coins");
    }

    player.gold += change;

    update_game_net_table(game);
}

function on_modifier_removed(unit: Unit, modifier_id: Modifier_Id) {
    if (modifier_id == Modifier_Id.spell_euls_scepter) {
        const handle = unit.handle;
        const ground = battle_position_to_world_position_center(battle.world_origin, unit.position);
        const delta_z = handle.GetAbsOrigin().z - ground.z;
        const fall_time = 0.45;

        function f(x: number) {
            return ((1 - Math.sin(x * 6 - 6)/(x * 6 - 6)) + (1 - x * x)) / 2;
        }

        do_each_frame_for(fall_time, progress => {
            handle.SetAbsOrigin(Vector(ground.x, ground.y, f(progress) * delta_z + ground.z));
        });

        handle.SetAbsOrigin(ground);

        unit_emit_sound(unit, "eul_scepter_drop");
        fx_by_unit("particles/dev/library/base_dust_hit.vpcf", unit).release();
    }

    if (modifier_id == Modifier_Id.dark_seer_ion_shell) {
        unit_emit_sound(unit, "Hero_Dark_Seer.Ion_Shield_end");
    }
}

function remove_modifier(game: Game, unit: Unit, applied: Modifier_Data, array_index: number) {
    print(`Remove modifier ${enum_to_string(applied.modifier.id)} from ${unit.handle.GetName()}`);

    try_remove_modifier_visuals(unit, applied.modifier_handle_id);
    on_modifier_removed(unit, applied.modifier.id);

    unit.modifiers.splice(array_index, 1);

    update_unit_state_from_modifiers(unit);
}

function add_activity_translation(target: Unit, translation: Activity_Translation, duration?: number) {
    const parameters: Modifier_Activity_Translation_Params = {
        translation: translation,
        duration: duration
    };

    return target.handle.AddNewModifier(target.handle, undefined, "Modifier_Activity_Translation", parameters);
}

function add_activity_override(target: Handle_Provider, activity: GameActivity_t, duration?: number): CDOTA_Buff {
    if (target.handle.HasModifier("Modifier_Activity_Override")) {
        target.handle.RemoveModifierByName("Modifier_Activity_Override");
    }

    const parameters: Modifier_Activity_Override_Params = {
        activity: activity,
        duration: duration
    };

    return target.handle.AddNewModifier(target.handle, undefined, "Modifier_Activity_Override", parameters);
}

function show_damage_effect_on_target(target: Handle_Provider) {
    target.handle.AddNewModifier(target.handle, undefined, "Modifier_Damage_Effect", { duration: 0.2 });
}

function play_delta(game: Game, battle: Battle, delta: Delta, head: number) {
    switch (delta.type) {
        case Delta_Type.hero_spawn: {
            const owner = array_find(battle.participants, player => player.id == delta.owner_id);
            if (!owner) break;

            spawn_unit_with_fx(delta.at_position, () => {
                const facing = { x: owner.deployment_zone.face.x, y: owner.deployment_zone.face.y };
                const unit = spawn_hero_for_battle(delta.hero_type, delta.unit_id, delta.owner_id, delta.at_position, facing);
                unit.health = delta.health;

                if (delta.hero_type == Hero_Type.mirana) {
                    add_activity_translation(unit, Activity_Translation.ti8, 1.0);
                }

                unit.handle.ForcePlayActivityOnce(GameActivity_t.ACT_DOTA_SPAWN);

                if (battle.has_started) {
                    try_play_random_sound_for_hero(unit, sounds => sounds.spawn);
                }

                return unit;
            });

            update_game_net_table(game);

            if (battle.has_started) {
                wait(1.5);
            } else {
                wait(0.25);
            }

            break;
        }

        case Delta_Type.creep_spawn: {
            const owner = array_find(battle.participants, player => player.id == delta.owner_id);
            if (!owner) break;

            spawn_unit_with_fx(delta.at_position, () => {
                const facing = { x: owner.deployment_zone.face.x, y: owner.deployment_zone.face.y };
                const unit = spawn_creep_for_battle(delta.creep_type, delta.unit_id, delta.owner_id, delta.at_position, facing);
                unit.health = delta.health;
                unit.handle.ForcePlayActivityOnce(GameActivity_t.ACT_DOTA_SPAWN);
                return unit;
            });

            update_game_net_table(game);

            if (battle.has_started) {
                wait(1.5);
            } else {
                wait(0.25);
            }

            break;
        }

        case Delta_Type.monster_spawn: {
            const unit = spawn_monster_for_battle(delta.unit_id, monster_definition(), delta.at_position, delta.facing);

            show_damage_effect_on_target(unit);

            register_unit(battle, unit);

            wait(0.25);

            break;
        }

        case Delta_Type.rune_spawn: {
            const handle = create_world_handle_for_rune(battle.world_origin, delta.rune_type, delta.at);

            battle.runes.push({
                id: delta.rune_id,
                type: delta.rune_type,
                position: delta.at,
                handle: handle,
                highlight_fx: fx_follow_unit(Const.rune_highlight, { handle: handle }),
                rune_fx: create_fx_for_rune_handle(delta.rune_type, { handle: handle })
            });

            break;
        }

        case Delta_Type.shop_spawn: {
            battle.shops.push({
                id: delta.shop_id,
                type: delta.shop_type,
                handle: create_world_handle_for_shop(battle.world_origin, delta.shop_type, delta.at, delta.facing),
                position: delta.at
            });

            break;
        }

        case Delta_Type.tree_spawn: {
            const tree_handle = create_world_handle_for_tree(battle.world_origin, battle.random_seed, delta.tree_id, delta.at_position);
            const tree = {
                id: delta.tree_id,
                handle: tree_handle,
                position: delta.at_position
            };

            battle.trees.push(tree);

            const world_target = battle_position_to_world_position_center(battle.world_origin, delta.at_position);

            fork(() => {
                do_each_frame_for(0.12, progress => {
                    tree_handle.SetAbsOrigin(Vector(world_target.x, world_target.y, (1 - progress) * 1000 + world_target.z))
                });

                tree_handle.SetAbsOrigin(world_target);
                tree_handle.EmitSound("tree_spawn");
            });

            wait(0.05);

            break;
        }

        case Delta_Type.hero_spawn_from_hand: {
            const unit = find_hero_by_id(delta.hero_id);
            if (!unit) break;

            const facing = find_player_deployment_zone_facing(unit.owner_remote_id);
            if (!facing) break;

            const in_hand_modifier = array_find_index(unit.modifiers, modifier => modifier.modifier.id == Modifier_Id.returned_to_hand);
            if (in_hand_modifier == -1) break;

            if (!unit.handle.IsAlive()) {
                unit.handle.RespawnHero(false, false);

                for (const applied of unit.modifiers) {
                    try_apply_modifier_visuals(unit, applied.modifier_handle_id, applied.modifier);
                }
            }

            const world_at = battle_position_to_world_position_center(battle.world_origin, delta.at_position);

            if (delta.source_spell_id == Spell_Id.town_portal_scroll) {
                const particle = fx("particles/items2_fx/teleport_end.vpcf")
                    .with_vector_value(0, world_at)
                    .with_vector_value(1, world_at)
                    .with_point_value(2, 255, 255, 255)
                    .to_unit_custom_origin(3, unit)
                    .with_point_value(4, 0.75, 0, 0)
                    .with_vector_value(5, world_at);

                unit_emit_sound(unit, "Portal.Loop_Appear");

                wait(3);

                unit_stop_sound(unit, "Portal.Loop_Appear");
                unit_emit_sound(unit, "Portal.Hero_Appear");

                particle.destroy_and_release(false);
            }

            if (delta.source_spell_id == Spell_Id.buyback) {
                const particle = fx("particles/buyback_start.vpcf")
                    .to_location(0, delta.at_position);

                unit_emit_sound(unit, "buyback_respawn");

                wait(2.5);

                fx_by_unit("particles/items_fx/aegis_respawn.vpcf", unit).release();

                particle.destroy_and_release(false);
            }

            remove_modifier(game, unit, unit.modifiers[in_hand_modifier], in_hand_modifier);

            FindClearSpaceForUnit(unit.handle, world_at, true);
            unit.handle.FaceTowards(unit.handle.GetAbsOrigin() + Vector(facing.x, facing.y) * 100 as Vector);

            update_game_net_table(game);

            const gesture = (() => {
                if (delta.source_spell_id == Spell_Id.town_portal_scroll) return GameActivity_t.ACT_DOTA_TELEPORT_END;
                if (delta.source_spell_id == Spell_Id.buyback) return GameActivity_t.ACT_DOTA_SPAWN;
            })();

            if (gesture != undefined) {
                unit.handle.StartGesture(gesture);
                wait(1.5);
                unit.handle.FadeGesture(gesture);
            }

            break;
        }

        case Delta_Type.unit_move: {
            const unit = find_unit_by_id(delta.unit_id);
            const path = battle.delta_paths[head];

            if (!unit) break;
            if (!path) break;

            unit.position = delta.to_position;

            move_unit(game, unit, path);

            break;
        }

        case Delta_Type.rune_pick_up: {
            const unit = find_hero_by_id(delta.unit_id);
            const rune_index = array_find_index(battle.runes, rune => rune.id == delta.rune_id);
            const path = battle.delta_paths[head];

            if (rune_index == -1) break;
            if (!unit) break;
            if (!path) break;

            const rune = battle.runes[rune_index];

            unit.position = rune.position;

            move_unit(game, unit, path);
            destroy_rune(rune, false);

            battle.runes.splice(rune_index, 1);

            play_rune_pickup_delta(game, unit, delta);

            break;
        }

        case Delta_Type.gold_change: {
            const player = array_find(battle.players, player => player.id == delta.player_id);

            if (player) {
                change_gold(game, player, delta.change);
            }

            break;
        }

        case Delta_Type.purchase_item: {
            const unit = find_hero_by_id(delta.unit_id);

            if (!unit) break;

            const player = array_find(battle.players, player => player.id == unit.owner_remote_id);

            if (!player) break;

            player.gold -= delta.gold_cost;

            break;
        }

        case Delta_Type.equip_item: {
            const hero = find_hero_by_id(delta.unit_id);

            if (hero) {
                play_item_equip_delta(game, hero, delta);
            }

            break;
        }

        case Delta_Type.equip_items: {
            const hero = find_hero_by_id(delta.unit_id);
            if (!hero) break;

            for (const equip of from_client_array(delta.items)) {
                apply_item_equip_effects(game, hero, equip);
            }

            update_game_net_table(game);

            break;
        }

        case Delta_Type.use_ground_target_ability: {
            const attacker = find_unit_by_id(delta.unit_id);

            if (attacker) {
                play_ground_target_ability_delta(game, attacker, delta);
            }

            break;
        }

        case Delta_Type.use_unit_target_ability: {
            const attacker = find_unit_by_id(delta.unit_id);
            const target = find_unit_by_id(delta.target_unit_id);

            if (attacker && target) {
                play_unit_target_ability_delta(game, attacker, delta, target);
            }

            break;
        }

        case Delta_Type.use_no_target_ability: {
            const attacker = find_unit_by_id(delta.unit_id);

            if (attacker) {
                play_no_target_ability_delta(game, attacker, delta);
            }

            break;
        }

        case Delta_Type.use_unit_target_spell: {
            const player = array_find(battle.players, player => player.id == delta.player_id);
            const target = find_unit_by_id(delta.target_id);

            if (player && target) {
                play_unit_target_spell_delta(game, player, target, delta);
            }

            break;
        }

        case Delta_Type.use_no_target_spell: {
            const player = array_find(battle.players, player => player.id == delta.player_id);

            if (player) {
                play_no_target_spell_delta(game, player, delta);
            }

            break;
        }

        case Delta_Type.use_ground_target_spell: {
            play_ground_target_spell_delta(game, delta);

            break;
        }

        case Delta_Type.end_turn: {
            for (const unit of battle.units) {
                unit.move_points = get_max_move_points(unit);
            }

            update_game_net_table(game);

            if (delta.start_turn_of_player_id == battle.this_player_id) {
                fire_event(To_Client_Event_Type.show_start_turn_ui, {});
            }

            break;
        }

        case Delta_Type.level_change: {
            const hero = find_hero_by_id(delta.unit_id);

            if (hero) {
                change_hero_level(game, hero, delta.new_level);
                update_game_net_table(game);
                wait(1);
            }

            break;
        }

        case Delta_Type.health_change: {
            const source = find_unit_by_id(delta.source_unit_id);
            const target = find_unit_by_id(delta.target_unit_id);

            if (source && target) {
                change_health(game, source, target, delta); // TODO use Health_Change
            }

            break;
        }

        case Delta_Type.modifier_applied: {
            const unit = find_unit_by_id(delta.unit_id);
            if (!unit) break;

            apply_modifier(game, unit, delta.application, no_source());

            break;
        }

        case Delta_Type.modifier_removed: {
            // TODO uncomment break to label once TSTL supports it and code is migrated to the newer version
            // modifier_search: {
                for (const unit of battle.units) {
                    for (let index = 0; index < unit.modifiers.length; index++) {
                        const modifier = unit.modifiers[index];

                        if (modifier.modifier_handle_id == delta.modifier_handle_id) {
                            remove_modifier(game, unit, modifier, index);

                            // break modifier_search;
                        }
                    }
                }
            // }

            break;
        }

        case Delta_Type.ability_effect_applied: {
            play_ability_effect_delta(game, delta.effect);

            break;
        }

        case Delta_Type.modifier_effect_applied: {
            play_modifier_effect_delta(game, delta);

            break;
        }

        case Delta_Type.timed_effect_expired: {
            expire_timed_effect(delta.handle_id);

            break;
        }

        case Delta_Type.draw_spell_card: break;
        case Delta_Type.draw_hero_card: break;
        case Delta_Type.use_card: break;
        case Delta_Type.set_ability_charges_remaining: break;

        case Delta_Type.game_start: {
            battle.has_started = true;
            break;
        }

        case Delta_Type.game_over: {
            fire_event(To_Client_Event_Type.show_game_over_ui, {
                winner_player_id: delta.result.draw ? undefined : delta.result.winner_player_id
            });

            wait(5);

            battle.is_over = true;

            break;
        }

        default: unreachable(delta);
    }
}

function periodically_update_battle() {
    for (const rune of battle.runes) {
        // Double damage rune doesn't spin by itself because Valve
        if (rune.type == Rune_Type.double_damage) {
            const current_angle = ((GameRules.GetGameTime() * -2.0) % (Math.PI * 2));
            rune.handle.SetForwardVector(Vector(Math.cos(current_angle), Math.sin(current_angle)));
        }
    }
}

function clean_battle_world_handles(battle: Battle) {
    for (const unit of battle.units) {
        unit.handle.RemoveSelf();
    }

    for (const rune of battle.runes) {
        destroy_rune(rune, true);
    }

    for (const shop of battle.shops) {
        shop.handle.RemoveSelf();
    }

    for (const tree of battle.trees) {
        tree.handle.Kill();
    }

    for (const applied of battle.applied_modifier_visuals) {
        for (const visual of applied.visuals) {
            if (!visual.from_buff) {
                visual.fx.destroy_and_release(true);
            }
        }
    }

    for (const effect of battle.timed_effect_visuals) {
        for (const visual of effect.visuals) {
            visual.destroy_and_release(true);
        }
    }

    battle.units = [];
    battle.shops = [];
    battle.runes = [];
    battle.trees = [];
    battle.applied_modifier_visuals = [];
    battle.timed_effect_visuals = [];
}

function reinitialize_battle(world_origin: Vector, camera_entity: CDOTA_BaseNPC) {
    battle = {
        id: -1 as Battle_Id,
        this_player_id: -1 as Battle_Player_Id,
        random_seed: 0,
        deltas: [],
        players: [],
        participants: [],
        delta_paths: {},
        delta_head: 0,
        world_origin: world_origin,
        units: [],
        runes: [],
        shops: [],
        trees: [],
        grid_size: {
            width: 0,
            height: 0
        },
        has_started: false,
        is_over: true,
        camera_dummy: camera_entity,
        applied_modifier_visuals: [],
        timed_effect_visuals: []
    };
}

function fast_forward_from_snapshot(battle: Battle, snapshot: Battle_Snapshot) {
    print("Fast forwarding from snapshot, new head", snapshot.delta_head);

    clean_battle_world_handles(battle);

    battle.has_started = snapshot.has_started;

    battle.players = snapshot.players.map(player => ({
        id: player.id,
        gold: player.gold
    }));

    battle.units = snapshot.units.map(unit => {
        const base: Unit_Base = {
            id: unit.id,
            dead: unit.health <= 0,
            position: unit.position,
            handle: create_world_handle_for_battle_unit(battle.world_origin, unit, unit.position, unit.facing),
            modifiers: from_client_array(unit.modifiers),
            hidden: false, // We will update it in update_state_visuals,

            health: unit.health,
            move_points: unit.move_points,
            base: unit.base,
            bonus: unit.bonus,

            // We will recalculate stats and update those at the end
            status: starting_unit_status()
        };

        switch (unit.supertype) {
            case Unit_Supertype.hero: {
                return {
                    ...base,
                    supertype: Unit_Supertype.hero,
                    level: unit.level,
                    type: unit.type,
                    owner_remote_id: unit.owner_id
                };
            }

            case Unit_Supertype.monster: {
                return {
                    ...base,
                    supertype: Unit_Supertype.monster
                };
            }

            case Unit_Supertype.creep: {
                return {
                    ...base,
                    supertype: Unit_Supertype.creep,
                    type: unit.type,
                    owner_remote_id: unit.owner_id
                };
            }
        }
    });

    battle.runes = snapshot.runes.map(rune => {
        const handle = create_world_handle_for_rune(battle.world_origin, rune.type, rune.position);
        return {
            id: rune.id,
            type: rune.type,
            handle: handle,
            position: rune.position,
            highlight_fx: fx_follow_unit(Const.rune_highlight, { handle: handle }),
            rune_fx: create_fx_for_rune_handle(rune.type, { handle: handle })
        };
    });

    battle.shops = snapshot.shops.map(shop => ({
        id: shop.id,
        type: shop.type,
        handle: create_world_handle_for_shop(battle.world_origin, shop.type, shop.position, shop.facing),
        position: shop.position
    }));

    battle.trees = snapshot.trees.map(tree => ({
        id: tree.id,
        handle: create_world_handle_for_tree(battle.world_origin, battle.random_seed, tree.id, tree.position),
        position: tree.position
    }));

    for (const effect of snapshot.effects) {
        create_timed_effect(effect.handle_id, effect.content);
    }

    battle.delta_head = snapshot.delta_head;

    // Otherwise the animations won't apply
    
    wait_one_frame();
    wait_one_frame();

    for (const unit of battle.units) {
        update_unit_state_from_modifiers(unit);

        for (const applied of unit.modifiers) {
            try_apply_modifier_visuals(unit, applied.modifier_handle_id, applied.modifier);
        }
    }
}