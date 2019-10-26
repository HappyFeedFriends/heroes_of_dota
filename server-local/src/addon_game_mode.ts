require("game_loop");
require("global_map");
require("adventure");
require("battle_visualiser");
require("scheduler");
require("requests");
require("unit_defs");
require("particles");
require("modifier_logic");
require("hero_sounds");
require("editor");

function Activate() { main(); }
function Precache(context: CScriptPrecacheContext) {
    function precache_model_and_log(model_scale: [string, number]) {
        PrecacheModel(model_scale[0], context);
        print("Preaching", model_scale[0])
    }

    for (const hero_type of enum_values<Hero_Type>()) {
        const hero_name = get_hero_dota_name(hero_type);
        const unit_name = hero_type_to_dota_unit_name(hero_type);

        PrecacheUnitByNameSync(unit_name, context);
        PrecacheResource("soundfile", hero_sounds_by_hero_type(hero_type).file, context);
        PrecacheResource("soundfile", `soundevents/game_sounds_heroes/game_sounds_${hero_name}.vsndevts`, context);

        print("Precaching", unit_name);
    }

    for (const minion_type of enum_values<Minion_Type>()) {
        precache_model_and_log(minion_type_to_model_and_scale(minion_type));
    }

    for (const npc_type of enum_values<Npc_Type>()) {
        const definition = get_npc_definition(npc_type);
        precache_model_and_log([definition.model, definition.scale]);
    }

    precache_model_and_log(creep_type_to_model_and_scale());

    PrecacheResource("soundfile", "soundevents/custom_game/game_sounds.vsndevts", context);
    PrecacheResource("soundfile", "soundevents/game_sounds_creeps.vsndevts", context);
    PrecacheResource("soundfile", "soundevents/game_sounds_ui_imported.vsndevts", context);
}