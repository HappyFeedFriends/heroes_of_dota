const { compile, copy_sim, panorama_scripts_dir } = require("./compiler");

(async () => {
    console.time("Compile");

    await compile("battle-sim", "client-local");

    copy_sim(`${panorama_scripts_dir}/battle_sim.js`);

    console.timeEnd("Compile");
})();
