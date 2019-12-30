const { compile, copy_sim } = require("./compiler");

(async () => {
    await compile("battle-sim");
    await compile("server-remote");

    copy_sim("server-remote/dist/battle_sim.js");
})();