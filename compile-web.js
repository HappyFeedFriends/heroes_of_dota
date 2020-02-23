const { compile, copy_sim, copy_party_sim, deploy_web_version } = require("./compiler");

(async () => {
    console.time("Compile");

    const ok = await compile("client-web", "server-remote");

    copy_sim("client-web/dist/battle_sim.js");
    copy_sim("server-remote/dist/battle_sim.js");

    copy_party_sim("server-remote/dist/party_sim.js");

    deploy_web_version();

    console.timeEnd("Compile");

    if (!ok) process.exit(1);
})();
