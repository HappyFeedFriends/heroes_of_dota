export const enum Spawn_Type {
    rune ,
    shop,
    monster,
    tree
}

type Rune_Spawn = {
    type: Spawn_Type.rune
    at: XY
}

type Shop_Spawn = {
    type: Spawn_Type.shop
    shop_type: Shop_Type
    at: XY
    facing: XY
    item_pool: Item_Id[]
}

type Monster_Spawn = {
    type: Spawn_Type.monster
    at: XY
    facing: XY
}

type Tree_Spawn = {
    type: Spawn_Type.tree
    at: XY
}

type Battleground_Spawn = Rune_Spawn | Shop_Spawn | Monster_Spawn | Tree_Spawn;

export type Battleground = {
    grid_size: XY
    deployment_zones: Deployment_Zone[]
    spawns: Battleground_Spawn[]
}

export function forest(): Battleground {
    function xy(x: number, y: number): XY {
        return { x: x, y: y };
    }

    function monster(x: number, y: number, facing: XY): Monster_Spawn {
        return {
            type: Spawn_Type.monster,
            at: xy(x, y),
            facing: facing
        }
    }

    function shop(x: number, y: number, facing: XY, shop_type: Shop_Type, items: Item_Id[]): Shop_Spawn {
        return {
            type: Spawn_Type.shop,
            shop_type: shop_type,
            at: xy(x, y),
            facing: facing,
            item_pool: items
        }
    }

    function tree(x: number, y: number): Tree_Spawn {
        return {
            type: Spawn_Type.tree,
            at: xy(x, y)
        }
    }

    function rune(x: number, y: number): Rune_Spawn {
        return {
            type: Spawn_Type.rune,
            at: xy(x, y)
        }
    }
    
    const grid_size = xy(13, 10);
    const deployment_zone_width = 3;

    const up = xy(0, 1);
    const down = xy(0, -1);
    const left = xy(-1, 0);
    const right = xy(1, 0);

    return {
        grid_size: grid_size,
        deployment_zones: [
            {
                min_x: 0,
                min_y: 5,
                max_x: deployment_zone_width,
                max_y: grid_size.y - 1,
                face_x: 1,
                face_y: 0
            },
            {
                min_x: grid_size.x - deployment_zone_width,
                min_y: 1,
                max_x: grid_size.x,
                max_y: grid_size.y - 5,
                face_x: -1,
                face_y: 0
            }
        ],
        spawns: [
            tree(0, 2),
            tree(2, 2),
            tree(3, 0),
            tree(8, 1),
            tree(1, 2),
            tree(0, 1),
            tree(1, 0),
            tree(0, 0),
            tree(10, 6),
            tree(11, 6),
            tree(12, 7),
            tree(4, 3),
            tree(4, 9),
            tree(4, 8),
            shop(6, 8, down, Shop_Type.secret, [
                Item_Id.boots_of_travel,
                Item_Id.heart_of_tarrasque,
                Item_Id.assault_cuirass,
                Item_Id.satanic,
                Item_Id.divine_rapier,
                Item_Id.tome_of_knowledge,
                Item_Id.refresher_shard,
                Item_Id.mask_of_madness,
                Item_Id.armlet,
                Item_Id.octarine_core,
                Item_Id.basher
            ]),
            shop(1, 3, up, Shop_Type.normal, [
                Item_Id.belt_of_strength,
                Item_Id.blades_of_attack,
                Item_Id.boots_of_speed,
                Item_Id.morbid_mask,
                Item_Id.chainmail,
                Item_Id.enchanted_mango
            ]),
            shop(11, 5, down, Shop_Type.normal, [
                Item_Id.belt_of_strength,
                Item_Id.blades_of_attack,
                Item_Id.boots_of_speed,
                Item_Id.morbid_mask,
                Item_Id.chainmail,
                Item_Id.enchanted_mango
            ]),
            monster(5, 1, right),
            rune(1, 1),
            monster(10, 8, left)
        ]
    }
}