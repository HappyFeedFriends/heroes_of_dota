const { compile, copy_sim } = require("./compiler");

(async () => {
    let ok =   await compile("battle-sim");
    ok = ok && await compile("server-remote");

    copy_sim("server-remote/dist/battle_sim.js");

    if (!ok) process.exit(1);
})();