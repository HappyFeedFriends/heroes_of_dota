declare const enum Item_Id {
    boots_of_travel = 0,
    heart_of_tarrasque = 1,
    assault_cuirass = 2,
    satanic = 3,
    divine_rapier = 4,
    tome_of_knowledge = 5,
    refresher_shard = 6,
    mask_of_madness = 7,
    armlet = 8,
    boots_of_speed = 9,
    blades_of_attack = 10,
    belt_of_strength = 11,
    morbid_mask = 12,
    chainmail = 13,
    enchanted_mango = 14,
    octarine_core = 15,
    basher = 16,
    iron_branch = 17
}

type Equip_Item =
    Equip_Tome_Of_Knowledge |
    Equip_Refresher_Shard |
    Equip_Enchanted_Mango

type Equip_Tome_Of_Knowledge = {
    item_id: Item_Id.tome_of_knowledge
    new_level: number
}

type Equip_Refresher_Shard = {
    item_id: Item_Id.refresher_shard
    charge_changes: {
        ability_id: Ability_Id
        charges_remaining: number
    }[]
}

type Equip_Enchanted_Mango = {
    item_id: Item_Id.enchanted_mango
    change: {
        ability_id: Ability_Id
        charges_remaining: number
    }
}