const { compile, copy_sim, copy_unit_defs, panorama_scripts_dir } = require("./compiler");

(async () => {
    console.time("Compile");

    await compile("battle-sim");

    copy_sim("client-web/dist/battle_sim.js");
    copy_sim("server-remote/dist/battle_sim.js");
    copy_sim(`${panorama_scripts_dir}/battle_sim.js`);

    copy_unit_defs();

    console.timeEnd("Compile");
})();