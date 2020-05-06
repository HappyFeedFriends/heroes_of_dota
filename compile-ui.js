const { compile, copy_shared_code, panorama_scripts_dir } = require("./compiler");

(async () => {
    console.time("Compile");

    const ok = await compile("client-local");

    copy_shared_code(panorama_scripts_dir);

    console.timeEnd("Compile");

    if (!ok) process.exit(1);
})();
