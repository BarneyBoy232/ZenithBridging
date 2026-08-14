/**
 * Works out the slab and stair names that go with a block.
 *
 * Minecraft's naming is regular enough to derive rather than look up, which
 * means this keeps working for blocks added in versions that did not exist
 * when this was written. It cannot know whether a given block actually has a
 * slab or stair variant, so the app says where that matters.
 */

export function normaliseBlock(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/^minecraft:/, '')
    .replace(/\s+/g, '_');
}

/** The shared part of the name that variants are built from. */
function stem(block) {
  let s = normaliseBlock(block);
  // quartz_block -> quartz, oak_planks -> oak
  s = s.replace(/_block$/, '').replace(/_planks$/, '');
  // stone_bricks -> stone_brick, deepslate_tiles -> deepslate_tile
  s = s.replace(/bricks$/, 'brick').replace(/tiles$/, 'tile');
  return s;
}

export function blockVariants(block) {
  const base = normaliseBlock(block) || 'stone_bricks';
  const s = stem(base);
  return {
    full: base,
    slab: `${s}_slab`,
    stair: `${s}_stairs`,
  };
}

/** The name to place for a given row of the bridge. */
export function blockForKind(block, kind) {
  const v = blockVariants(block);
  return v[kind] || v.full;
}
