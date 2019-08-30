function ui_toggle_collection() {
    const request = {
        access_token: get_access_token(),
        page: 0
    };

    remote_request<Get_Hero_Collection["request"], Get_Hero_Collection["response"]>("/get_hero_collection", request, response => {
        $.Msg(response);
    });
}