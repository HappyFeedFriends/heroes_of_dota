const { compile, copy_sim, copy_party_sim, copy_code_shared_with_lua, panorama_scripts_dir, deploy_web_version } = require("./compiler");

(async () => {
    console.time("Compile");

    copy_code_shared_with_lua();

    const ok = await compile("client-web", "client-local", "server-remote", "server-local");

    copy_sim("client-web/dist/battle_sim.js");
    copy_sim("server-remote/dist/battle_sim.js");
    copy_sim(`${panorama_scripts_dir}/battle_sim.js`);

    copy_party_sim(`${panorama_scripts_dir}/party_sim.js`);
    copy_party_sim("server-remote/dist/party_sim.js");

    deploy_web_version();

    console.timeEnd("Compile");

    if (!ok) process.exit(1);
})();
