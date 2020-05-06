const { compile, copy_shared_code, deploy_web_version } = require("./compiler");

(async () => {
    console.time("Compile");

    const ok = await compile("client-web", "server-remote");

    copy_shared_code("client-web/dist");
    copy_shared_code("server-remote/dist");

    deploy_web_version();

    console.timeEnd("Compile");

    if (!ok) process.exit(1);
})();
