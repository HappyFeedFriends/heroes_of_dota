function try_authorize_user(id: PlayerID, dedicated_server_key: string) {
    const steam_id = PlayerResource.GetSteamID(id).toString();

    return api_request(Api_Request_Type.authorize_steam_user, {
        steam_id: steam_id,
        steam_user_name: PlayerResource.GetPlayerName(id),
        dedicated_server_key: dedicated_server_key
    });
}

function try_get_player_state(main_player: Main_Player) {
    return api_request_with_retry_on_403(Api_Request_Type.get_player_state, main_player, {
        access_token: main_player.token
    });
}

function try_with_delays_until_success<T>(delay: number, producer: () => T | undefined): T {
    let result: T | undefined;

    while((result = producer()) == undefined) wait(delay);

    return result;
}
