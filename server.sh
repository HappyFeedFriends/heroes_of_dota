#!/usr/bin/env bash
git pull
git submodule update
git submodule foreach git checkout master
git submodule foreach git pull origin master

pushd server-remote
npm ci
popd

pushd codegen
npm ci
npx ttsc -b ../client-web/tsconfig.json
npx ttsc -b ../server-remote/tsconfig.json
popd

cp client-web/src/game.html server-remote/dist/game.html
cp client-web/dist/web_main.js server-remote/dist/web_main.js
cp battle-sim/dist/battle_sim.js server-remote/dist/battle_sim.js
cp party-sim/dist/party_sim.js server-remote/dist/party_sim.js

pushd server-remote
kill -9 $(cat run.pid)
node dist/main.js host:cia-is.moe > server-log.txt&
echo $! > run.pid
popd
