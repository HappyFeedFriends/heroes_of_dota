const { compile, copy_shared_code, copy_code_shared_with_lua, panorama_scripts_dir } = require("./compiler");

(async () => {
    console.time("Compile");

    copy_code_shared_with_lua();

    const ok = await compile("client-local", "server-remote", "server-local");

    copy_shared_code("server-remote/dist");
    copy_shared_code(panorama_scripts_dir);

    console.timeEnd("Compile");

    if (!ok) process.exit(1);
})();
