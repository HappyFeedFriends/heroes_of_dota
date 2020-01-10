const { compile, copy_sim } = require("./compiler");
const exec = require("child_process").exec;

(async () => {
    console.time("Compile");

    const ok = await compile("battle-sim", "server-remote");

    copy_sim("server-remote/dist/battle_sim.js");

    console.timeEnd("Compile");

    if (!ok) process.exit(1);

    console.time("Run tests");

    const emitter = exec(`node dist/tests.js`, { cwd: "server-remote" });

    emitter.stdout.on("data", data => process.stdout.write(data.toString()));
    emitter.stderr.on("data", data => process.stderr.write(data.toString()));

    emitter.on("exit", function (code) {
        console.timeEnd("Run tests");

        process.exit(code);
    });
})();
