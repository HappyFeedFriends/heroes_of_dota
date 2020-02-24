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
    basher = 16
}

type Item =
    Item_Boots_Of_Travel |
    Item_Heart_Of_Tarrasque |
    Item_Assault_Cuirass |
    Item_Satanic |
    Item_Divine_Rapier |
    Item_Tome_Of_Knowledge |
    Item_Refresher_Shard |
    Item_Mask_Of_Madness |
    Item_Armlet |
    Item_Boots_Of_Speed |
    Item_Blades_Of_Attack |
    Item_Belt_Of_Strength |
    Item_Morbid_Mask |
    Item_Chainmail |
    Item_Enchanted_Mango |
    Item_Octarine_Core |
    Item_Basher

type Equip_Item =
    Equip_Item_With_Modifier |
    Equip_Tome_Of_Knowledge |
    Equip_Refresher_Shard |
    Equip_Enchanted_Mango

type Item_Base = {
    gold_cost: number
}

type Item_Boots_Of_Travel = Item_Base & {
    id: Item_Id.boots_of_travel
    move_points_bonus: number
}

type Item_Heart_Of_Tarrasque = Item_Base & {
    id: Item_Id.heart_of_tarrasque
    regeneration_per_turn: number
    health_bonus: number
}

type Item_Assault_Cuirass = Item_Base & {
    id: Item_Id.assault_cuirass
    armor_bonus: number
}

type Item_Satanic = Item_Base & {
    id: Item_Id.satanic
}

type Item_Divine_Rapier = Item_Base & {
    id: Item_Id.divine_rapier
    damage_bonus: number
}

type Item_Tome_Of_Knowledge = Item_Base & {
    id: Item_Id.tome_of_knowledge
}

type Item_Refresher_Shard = Item_Base & {
    id: Item_Id.refresher_shard
}

type Item_Mask_Of_Madness = Item_Base & {
    id: Item_Id.mask_of_madness
    damage_bonus: number
}

type Item_Armlet = Item_Base & {
    id: Item_Id.armlet
    health_bonus: number
    health_loss_per_turn: number
}

type Item_Boots_Of_Speed = Item_Base & {
    id: Item_Id.boots_of_speed
    move_points_bonus: number
}

type Item_Blades_Of_Attack = Item_Base & {
    id: Item_Id.blades_of_attack
    damage_bonus: number
}

type Item_Belt_Of_Strength = Item_Base & {
    id: Item_Id.belt_of_strength
    health_bonus: number
}

type Item_Morbid_Mask = Item_Base & {
    id: Item_Id.morbid_mask
    health_restored_per_attack: number
}

type Item_Chainmail = Item_Base & {
    id: Item_Id.chainmail,
    armor_bonus: number
}

type Item_Enchanted_Mango = Item_Base & {
    id: Item_Id.enchanted_mango
    bonus_charges: number
}

type Item_Octarine_Core = Item_Base & {
    id: Item_Id.octarine_core
}

type Item_Basher = Item_Base & {
    id: Item_Id.basher
}

type Equip_Item_With_Modifier = {
    item_id:
        Item_Id.satanic |
        Item_Id.heart_of_tarrasque |
        Item_Id.divine_rapier |
        Item_Id.boots_of_travel |
        Item_Id.assault_cuirass |
        Item_Id.mask_of_madness |
        Item_Id.armlet |
        Item_Id.boots_of_speed |
        Item_Id.blades_of_attack |
        Item_Id.belt_of_strength |
        Item_Id.morbid_mask |
        Item_Id.chainmail |
        Item_Id.octarine_core |
        Item_Id.basher

    modifier: Modifier_Application
}

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
    } | undefined
}