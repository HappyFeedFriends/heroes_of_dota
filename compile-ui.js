const { compile, copy_sim, copy_party_sim, panorama_scripts_dir } = require("./compiler");

(async () => {
    console.time("Compile");

    const ok = await compile("client-local");

    copy_party_sim(`${panorama_scripts_dir}/party_sim.js`);
    copy_sim(`${panorama_scripts_dir}/battle_sim.js`);

    console.timeEnd("Compile");

    if (!ok) process.exit(1);
})();
