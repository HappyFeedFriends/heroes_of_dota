const { compile, copy_sim, copy_party_sim, copy_code_shared_with_lua, panorama_scripts_dir } = require("./compiler");

(async () => {
    console.time("Compile");

    copy_code_shared_with_lua();

    const ok = await compile("client-local", "server-remote", "server-local");

    copy_sim("server-remote/dist/battle_sim.js");
    copy_sim(`${panorama_scripts_dir}/battle_sim.js`);

    copy_party_sim("server-remote/dist/party_sim.js");

    console.timeEnd("Compile");

    if (!ok) process.exit(1);
})();
