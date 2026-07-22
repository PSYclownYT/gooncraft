import { ItemStack, system, world } from "@minecraft/server";

const CACHE = "gooncraft:infinity_cache";
const VACUUM = "gooncraft:vacuum_hopper";
const BOOSTER = "gooncraft:crop_booster";
const HARVESTER = "gooncraft:harvester_core";
const COMPOSTER = "gooncraft:compost_engine";
const MAX_CACHE_COUNT = 9007199254740991;
const stores = new Map(JSON.parse(world.getDynamicProperty("gooncraft:cache_stores") ?? "[]"));

const keyOf = (block) => `${block.dimension.id}:${block.location.x},${block.location.y},${block.location.z}`;
const saveStores = () => world.setDynamicProperty("gooncraft:cache_stores", JSON.stringify([...stores]));
const cropSeeds = new Map([
  ["minecraft:wheat", "minecraft:wheat_seeds"],
  ["minecraft:carrots", "minecraft:carrot"],
  ["minecraft:potatoes", "minecraft:potato"],
  ["minecraft:beetroot", "minecraft:beetroot_seeds"]
]);
const organic = new Set(["minecraft:wheat_seeds", "minecraft:wheat", "minecraft:carrot", "minecraft:potato", "minecraft:beetroot", "minecraft:beetroot_seeds", "minecraft:melon_slice", "minecraft:pumpkin", "minecraft:cactus", "minecraft:sugar_cane", "minecraft:kelp"]);

world.afterEvents.playerInteractWithBlock.subscribe((event) => {
  const { block, itemStack, player } = event;
  if (block.typeId !== CACHE) return;
  const key = keyOf(block);
  const store = stores.get(key) ?? { typeId: undefined, count: 0 };

  if (!itemStack) {
    if (player.isSneaking && store.count === 0) {
      stores.delete(key);
      player.sendMessage("Infinity Cache cleared.");
      saveStores();
      return;
    }
    if (!store.typeId || store.count <= 0) {
      player.sendMessage("Infinity Cache is empty.");
      return;
    }
    const amount = Math.min(64, store.count);
    player.getComponent("inventory").container.addItem(new ItemStack(store.typeId, amount));
    store.count -= amount;
    if (store.count <= 0) stores.delete(key); else stores.set(key, store);
    saveStores();
    player.sendMessage(`Withdrew ${amount} ${store.typeId}. Stored: ${store.count}`);
    return;
  }

  if (store.typeId && store.typeId !== itemStack.typeId) {
    player.sendMessage(`This cache is locked to ${store.typeId}.`);
    return;
  }
  const inv = player.getComponent("inventory").container;
  let moved = 0;
  for (let slot = 0; slot < inv.size; slot++) {
    const stack = inv.getItem(slot);
    if (!stack || stack.typeId !== itemStack.typeId) continue;
    moved += stack.amount;
    inv.setItem(slot, undefined);
  }
  stores.set(key, { typeId: itemStack.typeId, count: Math.min(MAX_CACHE_COUNT, store.count + moved) });
  saveStores();
  player.sendMessage(`Stored ${moved} ${itemStack.typeId}. Total: ${stores.get(key).count}`);
});

world.afterEvents.playerBreakBlock.subscribe((event) => {
  if (event.brokenBlockPermutation.type.id !== CACHE) return;
  const store = stores.get(keyOf({ dimension: event.dimension, location: event.block.location }));
  if (store?.typeId && store.count > 0) event.player.sendMessage(`Infinity Cache retained ${store.count} ${store.typeId}; place it back at the same spot to access it.`);
});

system.runInterval(() => {
  for (const dimension of [world.getDimension("overworld"), world.getDimension("nether"), world.getDimension("the_end")]) {
    for (const player of dimension.getPlayers()) {
      scanFarmBlocks(dimension, player.location);
    }
  }
}, 40);

function scanFarmBlocks(dimension, center) {
  for (let x = -8; x <= 8; x++) for (let y = -4; y <= 4; y++) for (let z = -8; z <= 8; z++) {
    const block = dimension.getBlock({ x: Math.floor(center.x) + x, y: Math.floor(center.y) + y, z: Math.floor(center.z) + z });
    if (!block) continue;
    if (block.typeId === VACUUM) vacuumItems(block);
    if (block.typeId === BOOSTER) boostCrops(block);
    if (block.typeId === HARVESTER) harvestCrops(block);
    if (block.typeId === COMPOSTER) compostDrops(block);
  }
}

function vacuumItems(block) {
  const below = block.below();
  const container = below?.getComponent("inventory")?.container;
  if (!container) return;
  for (const entity of block.dimension.getEntities({ type: "minecraft:item", location: block.center(), maxDistance: 5 })) {
    const stack = entity.getComponent("item")?.itemStack;
    if (stack && !container.addItem(stack)) entity.remove();
  }
}

function boostCrops(block) {
  for (let i = 0; i < 8; i++) {
    const target = block.offset({ x: Math.floor(Math.random() * 7) - 3, y: Math.floor(Math.random() * 3) - 1, z: Math.floor(Math.random() * 7) - 3 });
    target?.applyBoneMeal?.();
  }
}

function harvestCrops(block) {
  for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) {
    const crop = block.offset({ x, y: 0, z });
    const age = crop?.permutation.getState("growth") ?? crop?.permutation.getState("growth_state");
    if (!cropSeeds.has(crop?.typeId) || age < 7) continue;
    const seed = cropSeeds.get(crop.typeId);
    crop.dimension.runCommandAsync(`setblock ${crop.location.x} ${crop.location.y} ${crop.location.z} ${crop.typeId}`);
    crop.dimension.spawnItem(new ItemStack(seed, 1), crop.center());
  }
}

function compostDrops(block) {
  let fed = 0;
  for (const entity of block.dimension.getEntities({ type: "minecraft:item", location: block.center(), maxDistance: 4 })) {
    const stack = entity.getComponent("item")?.itemStack;
    if (!stack || !organic.has(stack.typeId)) continue;
    fed += stack.amount;
    entity.remove();
  }
  if (fed) block.dimension.spawnItem(new ItemStack("minecraft:bone_meal", Math.min(64, Math.ceil(fed / 3))), block.above().center());
}
