import { ItemStack, system, world } from "@minecraft/server";

const CACHE = "gooncraft:infinity_cache";
const VACUUM = "gooncraft:vacuum_hopper";
const BOOSTER = "gooncraft:crop_booster";
const HARVESTER = "gooncraft:harvester_core";
const COMPOSTER = "gooncraft:compost_engine";
const DUPLICATOR = "gooncraft:duplication_barrel";
const HOPPER = "minecraft:hopper";
const INSERT_SOUND = "random.pop";
const MAX_CACHE_COUNT = 9007199254740991;
const stores = new Map(JSON.parse(world.getDynamicProperty("gooncraft:cache_stores") ?? "[]"));
const duplicators = new Map(JSON.parse(world.getDynamicProperty("gooncraft:duplicator_stores") ?? "[]"));

const keyOf = (block) => `${block.dimension.id}:${block.location.x},${block.location.y},${block.location.z}`;
const saveStores = () => world.setDynamicProperty("gooncraft:cache_stores", JSON.stringify([...stores]));
const saveDuplicators = () => world.setDynamicProperty("gooncraft:duplicator_stores", JSON.stringify([...duplicators]));
const blockCenter = (block) => ({ x: block.location.x + 0.5, y: block.location.y + 0.5, z: block.location.z + 0.5 });
const playInsertSound = (dimension, location) => dimension.playSound?.(INSERT_SOUND, location);
const cropSeeds = new Map([
  ["minecraft:wheat", "minecraft:wheat_seeds"],
  ["minecraft:carrots", "minecraft:carrot"],
  ["minecraft:potatoes", "minecraft:potato"],
  ["minecraft:beetroot", "minecraft:beetroot_seeds"]
]);
const organic = new Set(["minecraft:wheat_seeds", "minecraft:wheat", "minecraft:carrot", "minecraft:potato", "minecraft:beetroot", "minecraft:beetroot_seeds", "minecraft:melon_slice", "minecraft:pumpkin", "minecraft:cactus", "minecraft:sugar_cane", "minecraft:kelp"]);

world.afterEvents.playerInteractWithBlock.subscribe((event) => {
  const { block, itemStack, player } = event;
  if (block.typeId === DUPLICATOR) {
    interactWithDuplicator(block, itemStack, player);
    return;
  }
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
  player.playSound(INSERT_SOUND);
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
    if (block.typeId === CACHE) serviceCacheHoppers(block);
    if (block.typeId === DUPLICATOR) serviceDuplicator(block);
    if (block.typeId === VACUUM) vacuumItems(block);
    if (block.typeId === BOOSTER) boostCrops(block);
    if (block.typeId === HARVESTER) harvestCrops(block);
    if (block.typeId === COMPOSTER) compostDrops(block);
  }
}

function interactWithDuplicator(block, itemStack, player) {
  const key = keyOf(block);
  const store = duplicators.get(key) ?? { input: undefined, output: undefined };
  if (!itemStack) {
    const stack = takeFromSlot(store, "output", 64);
    if (!stack) {
      player.sendMessage("Duplication Barrel output is empty.");
      return;
    }
    player.getComponent("inventory").container.addItem(stack);
    if (isDuplicatorEmpty(store)) duplicators.delete(key); else duplicators.set(key, store);
    saveDuplicators();
    return;
  }

  const inv = player.getComponent("inventory").container;
  let moved = 0;
  for (let slot = 0; slot < inv.size; slot++) {
    const stack = inv.getItem(slot);
    if (!stack || stack.typeId !== itemStack.typeId) continue;
    const accepted = addToSlot(store, "input", stack);
    if (accepted <= 0) continue;
    moved += accepted;
    inv.setItem(slot, stack.amount === accepted ? undefined : new ItemStack(stack.typeId, stack.amount - accepted));
  }
  if (moved > 0) {
    duplicators.set(key, store);
    saveDuplicators();
    player.playSound(INSERT_SOUND);
  }
}

function serviceDuplicator(block) {
  const key = keyOf(block);
  const store = duplicators.get(key) ?? { input: undefined, output: undefined };
  let changed = false;

  const inputHopper = block.above();
  if (inputHopper?.typeId === HOPPER) {
    const input = inputHopper.getComponent("inventory")?.container;
    if (input) {
      for (let slot = 0; slot < input.size; slot++) {
        const stack = input.getItem(slot);
        if (!stack) continue;
        const moved = addToSlot(store, "input", stack);
        if (moved <= 0) continue;
        input.setItem(slot, stack.amount === moved ? undefined : new ItemStack(stack.typeId, stack.amount - moved));
        playInsertSound(block.dimension, blockCenter(block));
        changed = true;
      }
    }
  }

  if (isPowered(block) && store.input?.typeId) {
    const moved = addToSlot(store, "output", new ItemStack(store.input.typeId, 1));
    changed = changed || moved > 0;
  }

  const outputHopper = block.below();
  const output = outputHopper?.typeId === HOPPER ? outputHopper.getComponent("inventory")?.container : undefined;
  if (output && store.output?.typeId && store.output.count > 0) {
    const stack = takeFromSlot(store, "output", 64);
    const leftover = output.addItem(stack);
    if (leftover?.amount) addToSlot(store, "output", leftover);
    changed = true;
  }

  if (!changed) return;
  if (isDuplicatorEmpty(store)) duplicators.delete(key); else duplicators.set(key, store);
  saveDuplicators();
}

function addToSlot(store, slotName, stack) {
  const slot = store[slotName];
  if (slot?.typeId && slot.typeId !== stack.typeId) return 0;
  const count = Math.min(64, (slot?.count ?? 0) + stack.amount);
  const moved = count - (slot?.count ?? 0);
  store[slotName] = { typeId: stack.typeId, count };
  return moved;
}

function takeFromSlot(store, slotName, maxAmount) {
  const slot = store[slotName];
  if (!slot?.typeId || slot.count <= 0) return undefined;
  const amount = Math.min(maxAmount, slot.count);
  slot.count -= amount;
  const stack = new ItemStack(slot.typeId, amount);
  if (slot.count <= 0) store[slotName] = undefined;
  return stack;
}

function isDuplicatorEmpty(store) {
  return (!store.input || store.input.count <= 0) && (!store.output || store.output.count <= 0);
}

function isPowered(block) {
  const power = block.getRedstonePower?.();
  if (power && power > 0) return true;
  return [
    block.above(),
    block.below(),
    block.offset({ x: 1, y: 0, z: 0 }),
    block.offset({ x: -1, y: 0, z: 0 }),
    block.offset({ x: 0, y: 0, z: 1 }),
    block.offset({ x: 0, y: 0, z: -1 })
  ].some((neighbor) => neighbor?.typeId === "minecraft:redstone_block");
}

function serviceCacheHoppers(block) {
  const key = keyOf(block);
  const store = stores.get(key) ?? { typeId: undefined, count: 0 };
  let changed = false;

  const inputHopper = block.above();
  if (inputHopper?.typeId === HOPPER) {
    const input = inputHopper.getComponent("inventory")?.container;
    if (input) {
      for (let slot = 0; slot < input.size; slot++) {
        const stack = input.getItem(slot);
        if (!stack) continue;
        if (store.typeId && store.typeId !== stack.typeId) continue;
        store.typeId = stack.typeId;
        store.count = Math.min(MAX_CACHE_COUNT, store.count + stack.amount);
        input.setItem(slot, undefined);
        changed = true;
        playInsertSound(block.dimension, blockCenter(block));
      }
    }
  }

  const outputHopper = block.below();
  const output = outputHopper?.typeId === HOPPER ? outputHopper.getComponent("inventory")?.container : undefined;
  if (output && store.typeId && store.count > 0) {
    const amount = Math.min(64, store.count);
    const leftover = output.addItem(new ItemStack(store.typeId, amount));
    const moved = amount - (leftover?.amount ?? 0);
    if (moved > 0) {
      store.count -= moved;
      changed = true;
    }
  }

  if (!changed) return;
  if (store.count <= 0) stores.delete(key); else stores.set(key, store);
  saveStores();
}

function vacuumItems(block) {
  const below = block.below();
  const container = below?.getComponent("inventory")?.container;
  if (!container) return;
  for (const entity of block.dimension.getEntities({ type: "minecraft:item", location: blockCenter(block), maxDistance: 5 })) {
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
    emitItem(block, new ItemStack(seed, 1), blockCenter(crop));
    emitItem(block, new ItemStack(cropDropFor(crop.typeId), 1), blockCenter(crop));
    crop.dimension.runCommandAsync(`setblock ${crop.location.x} ${crop.location.y} ${crop.location.z} ${crop.typeId}`);
  }
}

function cropDropFor(typeId) {
  if (typeId === "minecraft:wheat") return "minecraft:wheat";
  if (typeId === "minecraft:beetroot") return "minecraft:beetroot";
  if (typeId === "minecraft:carrots") return "minecraft:carrot";
  if (typeId === "minecraft:potatoes") return "minecraft:potato";
  return typeId;
}

function emitItem(sourceBlock, stack, fallbackLocation) {
  const output = sourceBlock.below()?.typeId === HOPPER ? sourceBlock.below().getComponent("inventory")?.container : undefined;
  const leftover = output?.addItem(stack);
  if (!output || leftover?.amount) sourceBlock.dimension.spawnItem(leftover ?? stack, fallbackLocation);
}

function compostDrops(block) {
  let fed = 0;
  for (const entity of block.dimension.getEntities({ type: "minecraft:item", location: blockCenter(block), maxDistance: 4 })) {
    const stack = entity.getComponent("item")?.itemStack;
    if (!stack || !organic.has(stack.typeId)) continue;
    fed += stack.amount;
    entity.remove();
  }
  if (fed) block.dimension.spawnItem(new ItemStack("minecraft:bone_meal", Math.min(64, Math.ceil(fed / 3))), blockCenter(block.above()));
}
