const remote_root = IsInToolsMode() ? "http://127.0.0.1:3638" : "http://cia-is.moe:3638";

function get_dedicated_server_key() {
    return GetDedicatedServerKey("v1");
}

function remote_request_async(endpoint: string, body: any, callback: (data: any) => void, error_callback?: (code: number) => void) {
    const request = CreateHTTPRequestScriptVM("POST", remote_root + endpoint);

    request.SetHTTPRequestRawPostBody("application/json", json.encode(body));
    request.Send(response => {
        if (response.StatusCode == 200) {
            callback(json.decode(response.Body));
        } else {
            if (error_callback) {
                error_callback(response.StatusCode);
            }
        }
    });
}

function api_request<T extends Api_Request_Type>(type: T, data: Find_Request<T>): Find_Response<T> | undefined {
    let request_completed = false;
    let result: Find_Response<T> | undefined = undefined;

    remote_request_async("/api" + type, data,
        response => {
            result = response;
            request_completed = true;
        },
        (code) => {
            print(`Error executing '${enum_to_string<Api_Request_Type>(type)}' request: code ${code}`);

            result = undefined;
            request_completed = true;
        });

    wait_until(() => request_completed);

    return result;
}

function api_request_with_retry_on_403<T extends Api_Request_Type>(type: T, game: Game, data: Find_Request<T>): Find_Response<T> | undefined {
    let request_completed = false;
    let result: Find_Response<T> | undefined = undefined;

    while (true) {
        wait_until(() => game.state != Player_State.not_logged_in);

        let unauthorized = false;

        remote_request_async("/api" + type, data,
            response => {
                result = response;
                request_completed = true;
            },
            code => {
                print(`Error executing '${enum_to_string<Api_Request_Type>(type)}' request: code ${code}`);

                result = undefined;
                request_completed = true;

                // 0 means server is offline
                if (code == 403 || code == 0) {
                    unauthorized = true;
                }
            });

        wait_until(() => request_completed);

        if (unauthorized) {
            const previous_state = game.state;
            process_state_transition(game, previous_state, { state: Player_State.not_logged_in });
        } else {
            return result;
        }
    }
}