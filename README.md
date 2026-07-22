# Gooncraft Farm Utilities

A Minecraft: Bedrock Edition add-on that adds compact farm utility blocks, including an infinite single-item storage block for large farms.

## Blocks

- **Infinity Cache** (`gooncraft:infinity_cache`): Stores an effectively infinite amount of one item type. Interact with an item to deposit matching stacks, interact with an empty hand to withdraw one stack, and sneak-interact with an empty hand to clear the stored item type when empty. A hopper above inserts matching items, and a hopper below extracts stored items.
- **Vacuum Hopper** (`gooncraft:vacuum_hopper`): Pulls nearby item entities into inventories placed directly below it.
- **Crop Booster** (`gooncraft:crop_booster`): Periodically applies random-tick style growth to nearby crops and saplings.
- **Harvester Core** (`gooncraft:harvester_core`): Harvests mature crops in a small area and replants them automatically when seeds are available from the drops.
- **Compost Engine** (`gooncraft:compost_engine`): Converts nearby organic item drops into bone meal.

## Recipes

- **Infinity Cache**: Ender pearls, obsidian, diamonds, and a chest.
- **Vacuum Hopper**: Iron ingots, redstone, and a hopper.
- **Crop Booster**: Bone meal, gold ingots, and lapis lazuli.
- **Harvester Core**: Shears, iron ingots, redstone, and a dispenser.
- **Compost Engine**: Bone meal, composters, redstone, and a hopper.
- **Farm Tuner**: Sticks and an iron ingot.

## Installation

Import both packs into a Bedrock world and enable the Beta APIs / scripting experiment required by the `@minecraft/server` script module.

## Development

The behavior pack contains all gameplay logic in `behavior_packs/gooncraft_farm_utils/scripts/main.js`. The resource pack supplies localization and client block definitions while reusing vanilla texture names so the add-on stays text-only.
