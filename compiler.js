const exec = require("child_process").exec;
const fs = require("fs");
const path = require("path");
const performance = require('perf_hooks').performance;

function copy(from, to) {
    const dir_name = path.dirname(to);

    if (!fs.existsSync(dir_name)) {
        fs.mkdirSync(dir_name, {recursive: true});
    }

    fs.copyFileSync(from, to);
}

function compile_file(module) {
    return new Promise(resolve => {
        const bright = "\x1b[1m";
        const red = "\x1b[31m";
        const yellow = "\x1b[33m";
        const reset = "\x1b[0m";

        const yellow_module_name = `${bright}${yellow}${module}${reset}`;
        const red_module_name = `${bright}${red}${module}${reset}`;

        console.log("Compiling", yellow_module_name);

        const compiler = module === "server-local" ? "tstl -p" : "ttsc -b";
        const start_time = performance.now();
        const no_npm_update = Object.assign({ "NO_UPDATE_NOTIFIER": "1" }, process.env);
        const emitter = exec(`npx ${compiler} ${path.normalize(`../${module}/tsconfig.json`)} --pretty`, { cwd: "codegen", env: no_npm_update });

        emitter.stdout.on("data", data => process.stdout.write(data.toString()));
        emitter.stderr.on("data", data => process.stderr.write(data.toString()));

        emitter.on("exit", function (code) {
            resolve({
                ok: code === 0,
                message: `${code === 0 ? yellow_module_name : red_module_name}: ${Number((performance.now() - start_time) / 1000).toFixed(2)}s`
            });

            if (code !== 0) {
                console.error(`${bright}${red}Error${reset} when compiling module ${yellow_module_name}`);
            }
        });
    });
}

exports.panorama_scripts_dir = "dist/content/panorama/scripts/custom_game";

exports.compile = function(...modules) {
    return Promise.all(modules.map(compile_file)).then(results => {
        results.forEach(result => console.log(result.message));

        return results.every(result => result.ok);
    })
};

exports.copy_party_sim = function(to) {
    const source_file = "party-sim/dist/party_sim.js";

    copy(source_file, to);
};

exports.copy_sim = function(to) {
    const source_file = "battle-sim/dist/battle_sim.js";

    copy(source_file, to);

    const source_map = JSON.parse(fs.readFileSync("battle-sim/dist/battle_sim.js.map", "utf8"));
    const source_files = source_map.sources;
    const source_directory = path.dirname(source_file);
    const target_directory = path.dirname(to);

    source_map.sources = source_files
        .map(source_file => path.relative(target_directory, path.resolve(source_directory, source_file)));

    const new_source_map = JSON.stringify(source_map);

    fs.writeFileSync(`${to}.map`, new_source_map);
};

exports.deploy_web_version = function() {
    copy("client-web/src/game.html", "server-remote/dist/game.html");
    copy("client-web/dist/web_main.js", "server-remote/dist/web_main.js")
};

exports.copy_code_shared_with_lua = function() {
    copy("battle-sim/src/modifier_logic.ts", "server-local/src/modifier_logic.ts");
    copy("battle-sim/src/unit_defs.ts", "server-local/src/unit_defs.ts");
    copy("client-local/src/hero_sounds.ts", "server-local/src/hero_sounds.ts");
};