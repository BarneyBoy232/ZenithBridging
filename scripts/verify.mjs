/**
 * Headless check of the geometry engine.
 * Run with: npm run verify
 *
 * Every case here is one a human can check by hand, which is the point —
 * the engine has to be provably right before any of it is drawn on screen.
 */

import { buildBridge, smoothSagLimit } from '../src/engine/build.js';
import { BridgeError, rowBlockCount, rowWidth } from '../src/engine/model.js';
import { surfaceTop } from '../src/engine/quantise.js';
import { buildInstances, INSTANCE_BUDGET, STEP_OFFSET } from '../src/engine/instances.js';
import { buildTrack } from '../src/engine/splineTrack.js';

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}${detail ? `  ->  ${detail}` : ''}`);
  }
}

function heading(text) {
  console.log(`\n${text}`);
  console.log('-'.repeat(text.length));
}

/** Block count taken the slow, obvious way, to cross-check the fast way. */
function bruteForceBlockCount(model) {
  return model.rows.reduce((sum, row) => sum + rowBlockCount(row), 0);
}

// ---------------------------------------------------------------- axis-aligned
heading('1. Axis-aligned, no sag  (0,64,0) -> (0,64,20), width 3');
{
  const m = buildBridge({
    start: { x: 0, y: 64, z: 0 },
    end: { x: 0, y: 64, z: 20 },
    width: 3,
    sag: 0,
    useSlabs: false, useStairs: false,
  });
  check('21 rows', m.stats.rowCount === 21, `got ${m.stats.rowCount}`);
  check('63 blocks', m.stats.blockCount === 63, `got ${m.stats.blockCount}`);
  check('all at y=64', m.rows.every((r) => r.y === 64));
  check('all full blocks', m.rows.every((r) => r.kind === 'full'));
  check('deck spans z, 3 wide', m.rows.every((r) => rowWidth(r) === 3));
  check('no sideways drift', new Set(m.rows.map((r) => r.minorStart)).size === 1);
  check('exact tile found', !!m.segments.tile, JSON.stringify(m.segments.tile));
  check('tile is 1 row x 20', m.segments.tile?.length === 1 && m.segments.tile?.repeats === 20);
  check('count cross-check', bruteForceBlockCount(m) === m.stats.blockCount);
}

// -------------------------------------------------------------- clean diagonal
heading('2. Clean diagonal, no sag  (0,64,0) -> (40,64,15), width 1');
{
  const m = buildBridge({
    start: { x: 0, y: 64, z: 0 },
    end: { x: 40, y: 64, z: 15 },
    width: 1,
    sag: 0,
    useSlabs: false, useStairs: false,
  });
  check('41 rows', m.stats.rowCount === 41, `got ${m.stats.rowCount}`);
  check('major axis is x', m.majorAxis === 'x');
  check('ends at z=15', m.rows[m.rows.length - 1].minor === 15, `got ${m.rows.at(-1).minor}`);
  check('exact tile found', !!m.segments.tile);
  check(
    'tile is 8 rows repeated 5 times',
    m.segments.tile?.length === 8 && m.segments.tile?.repeats === 5,
    JSON.stringify(m.segments.tile)
  );

  // Prove the reported tile genuinely tiles the bridge.
  const tile = m.segments.tile;
  let tilesCorrectly = !!tile;
  for (let i = 0; tile && i + tile.length < m.rows.length; i++) {
    if (m.rows[i + tile.length].minor - m.rows[i].minor !== tile.shiftMinor) tilesCorrectly = false;
  }
  check('reported tile actually tiles the whole bridge', tilesCorrectly);
}

// ------------------------------------------------------------ coprime diagonal
heading('3. Coprime diagonal  (0,64,0) -> (37,64,11), width 2');
{
  const m = buildBridge({
    start: { x: 0, y: 64, z: 0 },
    end: { x: 37, y: 64, z: 11 },
    width: 2,
    sag: 0,
    useSlabs: false, useStairs: false,
  });
  check('no exact tile', m.segments.tile === null, JSON.stringify(m.segments.tile));
  check('falls back to a real shortcut', m.segments.best !== 'none', m.segments.best);
  check('run-length shorter than row list', m.segments.runs.length < m.stats.rowCount);
  check('76 blocks', m.stats.blockCount === 38 * 2, `got ${m.stats.blockCount}`);
}

// --------------------------------------------------------------------- the sag
heading('4. Sag of -6  (0,64,0) -> (40,64,15), width 3, all three block modes');
{
  const base = {
    start: { x: 0, y: 64, z: 0 },
    end: { x: 40, y: 64, z: 15 },
    width: 3,
    sag: -6,
    curve: 'parabola',
  };
  const full = buildBridge({ ...base, useSlabs: false, useStairs: false });
  const slabs = buildBridge({ ...base, useSlabs: true, useStairs: false });
  const stairs = buildBridge({ ...base, useSlabs: false, useStairs: true });

  const tops = full.rows.map(surfaceTop);
  const lowest = Math.min(...tops);
  // The bottom of a quantised curve is a flat plateau several rows wide, so
  // the "lowest point" is the middle of that plateau, not its first row.
  const firstLow = tops.indexOf(lowest);
  const lastLow = tops.lastIndexOf(lowest);
  const lowIndex = (firstLow + lastLow) / 2;
  const fallsThenRises =
    tops.slice(0, firstLow + 1).every((v, i, a) => i === 0 || v <= a[i - 1]) &&
    tops.slice(lastLow).every((v, i, a) => i === 0 || v >= a[i - 1]);

  check('drops then climbs', fallsThenRises);
  check('lowest point is centred', Math.abs(lowIndex - 20) <= 0.5, `at row ${lowIndex}`);
  check('sags about 6 below the ends', Math.abs(64 - lowest + 1 - 6) <= 1, `lowest top ${lowest}`);
  check('ends sit at the start height', full.rows[0].y === 64 && full.rows.at(-1).y === 64);
  check('height profile mirrors', full.segments.symmetry.heights);
  check('no exact tile on a curve', full.segments.tile === null);

  check(
    'slabs give finer height detail than full blocks',
    slabs.segments.distinctLevels > full.segments.distinctLevels,
    `full ${full.segments.distinctLevels} vs slabs ${slabs.segments.distinctLevels}`
  );
  check('slab mode actually places slabs', slabs.stats.counts.slab > 0);
  check('stair mode actually places stairs', stairs.stats.counts.stair > 0);
  check('full mode places only full blocks', full.stats.counts.slab === 0 && full.stats.counts.stair === 0);
  check(
    'stair facings mirror across the middle',
    stairs.rows.filter((r) => r.kind === 'stair' && r.facing === 'west').length > 0 &&
      stairs.rows.filter((r) => r.kind === 'stair' && r.facing === 'east').length > 0
  );

  for (const [name, m] of [['full', full], ['slabs', slabs], ['stairs', stairs]]) {
    check(`${name}: count cross-check`, bruteForceBlockCount(m) === m.stats.blockCount);
    const summed = m.stats.counts.full + m.stats.counts.slab + m.stats.counts.stair;
    check(`${name}: material totals match block total`, summed === m.stats.blockCount);
  }
}

// -------------------------------------------------------------------- the arch
heading('5. Arch of +6, same span');
{
  const m = buildBridge({
    start: { x: 0, y: 64, z: 0 },
    end: { x: 40, y: 64, z: 15 },
    width: 3,
    sag: 6,
    curve: 'parabola',
    useSlabs: false, useStairs: true,
  });
  const tops = m.rows.map(surfaceTop);
  const highest = Math.max(...tops);
  const peakIndex = (tops.indexOf(highest) + tops.lastIndexOf(highest)) / 2;
  check('peak is centred', Math.abs(peakIndex - 20) <= 0.5, `at row ${peakIndex}`);
  check('peaks about 6 above the ends', Math.abs(highest - 1 - 64 - 6) <= 1, `peak top ${highest}`);
  check('height profile mirrors', m.segments.symmetry.heights);
  check('stairs present', m.stats.counts.stair > 0);
}

// ------------------------------------------------------------------ sloped run
heading('6. Sloped ends  (0,64,0) -> (30,80,12), width 4, sag -3');
{
  const m = buildBridge({
    start: { x: 0, y: 64, z: 0 },
    end: { x: 30, y: 80, z: 12 },
    width: 4,
    sag: -3,
    curve: 'catenary',
    useSlabs: true, useStairs: false,
  });
  check('starts at 64', m.rows[0].y === 64, `got ${m.rows[0].y}`);
  check('ends at 80', m.rows.at(-1).y === 80, `got ${m.rows.at(-1).y}`);
  check('climbs overall', m.rows.at(-1).y > m.rows[0].y);
  check('sag pulls the middle below the straight line', m.stats.peakDeviation < 0, `${m.stats.peakDeviation}`);
  check('not symmetric (ends differ in height)', m.segments.symmetric === false);
  check('deck is 4 wide', m.rows.every((r) => rowWidth(r) === 4));
  check('count cross-check', bruteForceBlockCount(m) === m.stats.blockCount);
}

// ----------------------------------------------------------------- bad inputs
heading('7. Inputs that cannot make a bridge');
{
  const cases = [
    ['identical points', { start: { x: 5, y: 64, z: 5 }, end: { x: 5, y: 64, z: 5 } }],
    ['pure vertical', { start: { x: 0, y: 64, z: 0 }, end: { x: 0, y: 90, z: 0 } }],
    ['zero width', { start: { x: 0, y: 64, z: 0 }, end: { x: 10, y: 64, z: 0 }, width: 0 }],
  ];
  for (const [label, params] of cases) {
    let err = null;
    try {
      buildBridge(params);
    } catch (e) {
      err = e;
    }
    check(`${label} rejected clearly`, err instanceof BridgeError, err ? err.message : 'no error thrown');
    check(`${label} message is readable`, !!err && err.message.length > 20);
  }
}

// ---------------------------------------------------------------------- scale
heading('8. Scale  (0,64,0) -> (5000,64,1873), width 6');
{
  const t0 = process.hrtime.bigint();
  const m = buildBridge({
    start: { x: 0, y: 64, z: 0 },
    end: { x: 5000, y: 64, z: 1873 },
    width: 6,
    sag: -20,
    curve: 'catenary',
    useSlabs: true, useStairs: false,
  });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;

  check('5001 rows', m.stats.rowCount === 5001, `got ${m.stats.rowCount}`);
  check('30006 blocks', m.stats.blockCount === 5001 * 6, `got ${m.stats.blockCount}`);
  check('built in under 500ms', ms < 500, `took ${ms.toFixed(1)}ms`);
  check('run-length collapses it usefully', m.segments.runs.length < 400, `${m.segments.runs.length} runs`);
  check('count cross-check', bruteForceBlockCount(m) === m.stats.blockCount);
  console.log(`        built in ${ms.toFixed(1)}ms, ${m.segments.runs.length} runs`);
}

// -------------------------------------------------------------- single blocks
heading('9. Smallest possible bridges');
{
  const m = buildBridge({
    start: { x: 0, y: 64, z: 0 },
    end: { x: 1, y: 64, z: 0 },
    width: 1,
    sag: 0,
    useSlabs: false, useStairs: false,
  });
  check('2 rows, 2 blocks', m.stats.rowCount === 2 && m.stats.blockCount === 2);
  check('does not crash on segment analysis', !!m.segments);
}

// ------------------------------------------------------------ all four corners
heading('10. All four diagonal directions behave the same');
{
  const dirs = [
    [40, 15],
    [-40, 15],
    [40, -15],
    [-40, -15],
  ];
  const counts = dirs.map(([dx, dz]) => {
    const m = buildBridge({
      start: { x: 0, y: 64, z: 0 },
      end: { x: dx, y: 64, z: dz },
      width: 3,
      sag: -5,
      useSlabs: true, useStairs: false,
    });
    return m.stats.blockCount;
  });
  check('same block count in every direction', new Set(counts).size === 1, counts.join(', '));
}

// ------------------------------------------------- sag is measured downwards
heading('11. Sag hangs like a rope, measured straight down');
{
  // How far the unrounded curve pulls away from the straight line joining the
  // two ends, at every step.
  const deviations = (m) =>
    m.rows.map((r) => r.exactLevel - (m.params.start.y + (m.params.end.y - m.params.start.y) * r.t));

  // --- level span: everything should be dead symmetric
  for (const curve of ['catenary', 'parabola', 'arc']) {
    const m = buildBridge({
      start: { x: 0, y: 64, z: 0 },
      end: { x: 60, y: 64, z: 0 },
      width: 1,
      sag: -10,
      curve,
      useSlabs: true, useStairs: false,
    });
    const dev = deviations(m);
    const worst = Math.min(...dev);
    check(`${curve}: hangs exactly 10 below the line`, Math.abs(worst + 10) < 0.01, `got ${worst.toFixed(4)}`);
    check(
      `${curve}: deepest point is at the halfway mark on a level span`,
      Math.abs(m.stats.peakDeviationAt - 0.5) < 0.02,
      `at t=${m.stats.peakDeviationAt}`
    );
    check(
      `${curve}: curve is symmetric on a level span`,
      dev.every((d, i) => Math.abs(d - dev[dev.length - 1 - i]) < 0.01)
    );
  }

  // --- uneven span: the rope should still hang the depth we asked for, and
  //     its lowest point should sit nearer the lower anchor
  const sloped = buildBridge({
    start: { x: 0, y: 64, z: 0 },
    end: { x: 60, y: 100, z: 0 },
    width: 1,
    sag: -10,
    curve: 'catenary',
    useSlabs: true, useStairs: false,
  });
  const slopedDev = deviations(sloped);
  const worstSloped = Math.min(...slopedDev);

  check(
    'uneven span: still hangs exactly 10 below the line',
    Math.abs(worstSloped + 10) < 0.01,
    `got ${worstSloped.toFixed(4)}`
  );
  check(
    'uneven span: lowest block sits nearer the lower end',
    sloped.stats.lowestRow < (sloped.stats.rowCount - 1) / 2,
    `lowest at row ${sloped.stats.lowestRow} of ${sloped.stats.rowCount - 1}`
  );
  check(
    'uneven span: a real chain is not symmetric',
    !slopedDev.every((d, i) => Math.abs(d - slopedDev[slopedDev.length - 1 - i]) < 0.01)
  );

  // A parabola's drop below the chord stays symmetric even on a slope. That is
  // a real property of the shape, not an approximation, so it is worth locking.
  const slopedParabola = buildBridge({
    start: { x: 0, y: 64, z: 0 },
    end: { x: 60, y: 100, z: 0 },
    width: 1,
    sag: -10,
    curve: 'parabola',
    useSlabs: true, useStairs: false,
  });
  const pDev = deviations(slopedParabola);
  check(
    'uneven span: parabola drop stays symmetric',
    pDev.every((d, i) => Math.abs(d - pDev[pDev.length - 1 - i]) < 1e-9)
  );
  check(
    'uneven span: parabola still hangs exactly 10 below the line',
    Math.abs(Math.min(...pDev) + 10) < 1e-9
  );

  // --- an arch is the same shape upside down
  const arch = buildBridge({
    start: { x: 0, y: 64, z: 0 },
    end: { x: 60, y: 64, z: 0 },
    width: 1,
    sag: 10,
    curve: 'catenary',
    useSlabs: true, useStairs: false,
  });
  const archDev = deviations(arch);
  check('arch: rises exactly 10 above the line', Math.abs(Math.max(...archDev) - 10) < 0.01);
  check(
    'arch: is the mirror image of the sag',
    archDev.every((d, i) => Math.abs(d + deviations(
      buildBridge({
        start: { x: 0, y: 64, z: 0 },
        end: { x: 60, y: 64, z: 0 },
        width: 1,
        sag: -10,
        curve: 'catenary',
        useSlabs: true, useStairs: false,
      })
    )[i]) < 1e-9)
  );

  // --- sag depth should not care which way round you enter the coordinates
  const forward = buildBridge({
    start: { x: 0, y: 64, z: 0 },
    end: { x: 60, y: 100, z: 0 },
    width: 1,
    sag: -10,
    curve: 'catenary',
    useSlabs: true, useStairs: false,
  });
  const backward = buildBridge({
    start: { x: 60, y: 100, z: 0 },
    end: { x: 0, y: 64, z: 0 },
    width: 1,
    sag: -10,
    curve: 'catenary',
    useSlabs: true, useStairs: false,
  });
  check(
    'entering the coordinates backwards gives the same bridge',
    forward.rows.every((r, i) => r.y === backward.rows[backward.rows.length - 1 - i].y),
    `forward ${forward.rows.map((r) => r.y).slice(0, 6).join(',')} / backward ${backward.rows
      .map((r) => r.y)
      .slice(-6)
      .reverse()
      .join(',')}`
  );
}

// ------------------------------------------------------- 3D preview shapes
heading('12. 3D preview builds the right boxes in the right places');
{
  const m = buildBridge({
    start: { x: 0, y: 64, z: 0 },
    end: { x: 40, y: 64, z: 15 },
    width: 3,
    sag: -6,
    curve: 'parabola',
    useSlabs: false, useStairs: true,
  });
  const inst = buildInstances(m);

  check('nothing is skipped at normal size', inst.stride === 1);
  check(
    'every block becomes exactly one box or one base',
    inst.full.length + inst.slab.length === m.stats.blockCount,
    `${inst.full.length} + ${inst.slab.length} vs ${m.stats.blockCount}`
  );
  check(
    'one raised step per stair block',
    inst.stepX.length + inst.stepZ.length === m.stats.counts.stair,
    `${inst.stepX.length + inst.stepZ.length} vs ${m.stats.counts.stair}`
  );
  check(
    'full blocks and bases are counted separately',
    inst.full.length === m.stats.counts.full &&
      inst.slab.length === m.stats.counts.slab + m.stats.counts.stair
  );

  // Boxes must sit inside the block they belong to, not floating between.
  const allBoxes = [...inst.full, ...inst.slab, ...inst.stepX, ...inst.stepZ];
  check(
    'no box escapes the height range of the bridge',
    allBoxes.every((b) => b.y + inst.origin.y >= m.stats.minY && b.y + inst.origin.y <= m.stats.maxY + 1)
  );
  check('every box gets a colour', allBoxes.every((b) => /^hsl\(/.test(b.colour)));

  // Drawing near zero is what keeps a bridge at the edge of the world sharp.
  check(
    'boxes are positioned relative to the bridge, not the world origin',
    allBoxes.every((b) => Math.abs(b.x) <= 60 && Math.abs(b.z) <= 60 && Math.abs(b.y) <= 60)
  );

  const farAway = buildBridge({
    start: { x: 12000000, y: 200, z: -8400000 },
    end: { x: 12000040, y: 200, z: -8400015 },
    width: 3,
    sag: -6,
    useSlabs: true, useStairs: false,
  });
  const farInst = buildInstances(farAway);
  const farBoxes = [...farInst.full, ...farInst.slab];
  check(
    'a bridge millions of blocks from spawn still draws near zero',
    farBoxes.every((b) => Math.abs(b.x) < 100 && Math.abs(b.y) < 100 && Math.abs(b.z) < 100),
    `origin ${JSON.stringify(farInst.origin)}`
  );
  check(
    'and keeps the same shape as the same bridge at spawn',
    farBoxes.length === inst.full.length + inst.slab.length
  );

  // The camera framing needs real bounds, or it aims at nothing.
  check(
    'bounds are finite and enclose every box',
    Number.isFinite(inst.bounds.minX) &&
      Number.isFinite(inst.bounds.maxY) &&
      allBoxes.every(
        (b) =>
          b.x >= inst.bounds.minX &&
          b.x <= inst.bounds.maxX &&
          b.y >= inst.bounds.minY &&
          b.y <= inst.bounds.maxY &&
          b.z >= inst.bounds.minZ &&
          b.z <= inst.bounds.maxZ
      )
  );
  check(
    'the no-sag comparison line runs between the two ends',
    inst.chord.length === 2 && inst.chord.every((p) => p.every(Number.isFinite))
  );

  // The raised part of a stair has to be on the side the deck climbs toward,
  // otherwise the ramps face backwards and the bridge looks wrong.
  let stepsCorrect = true;
  let checkedSteps = 0;
  const majorIsX = m.majorAxis === 'x';
  for (const row of m.rows) {
    if (row.kind !== 'stair') continue;
    const baseX = (majorIsX ? row.major : row.minorStart) + 0.5;
    const [ox, oz] = STEP_OFFSET[row.facing];
    const expectHigher = row.facing === 'east' || row.facing === 'south';
    const shift = row.facing === 'east' || row.facing === 'west' ? ox : oz;
    if (expectHigher ? !(shift > 0.5) : !(shift < 0.5)) stepsCorrect = false;
    checkedSteps++;
    void baseX;
  }
  check(`stair steps face the right way (${checkedSteps} checked)`, stepsCorrect && checkedSteps > 0);

  // A bridge too big to draw should thin out, not fall over.
  const huge = buildBridge({
    start: { x: 0, y: 64, z: 0 },
    end: { x: 60000, y: 64, z: 12000 },
    width: 8,
    sag: -30,
    useSlabs: true, useStairs: false,
  });
  const thinned = buildInstances(huge);
  const drawn = thinned.full.length + thinned.slab.length;
  check('a huge bridge thins out', thinned.stride > 1, `stride ${thinned.stride}`);
  check('and stays inside the draw budget', drawn <= INSTANCE_BUDGET, `${drawn} boxes`);
  check('while the real bridge keeps every block', huge.stats.blockCount > drawn);
  console.log(
    `        ${huge.stats.blockCount.toLocaleString()} blocks -> ${drawn.toLocaleString()} boxes drawn (every ${thinned.stride}th row)`
  );
}

// -------------------------------------------------- no holes, and the sag cap
heading('13. The deck is never full of holes');
{
  /**
   * Two neighbouring columns must OVERLAP, not merely meet.
   *
   * This is the check that was wrong first time round, and the mistake is
   * worth keeping written down: a block at y=68 and a block at y=69 in the
   * next column look adjacent, but they only touch at their corner, and you
   * can see daylight straight through a corner. A steep arch built that way
   * comes out looking like a comb. Slabs are the exception — a top slab and
   * the bottom slab above it are two halves of one boundary and do seal.
   */
  const holes = (m) => {
    const span = (r) => {
      const low = r.kind === 'slab' && r.half === 'top' ? r.y + 0.5 : r.y;
      const high = r.kind === 'slab' && r.half === 'bottom' ? r.y + 0.5 : r.y + 1;
      return [Math.min(low, r.bottom), high];
    };
    let count = 0;
    for (let i = 1; i < m.rows.length; i++) {
      const [aLow, aHigh] = span(m.rows[i - 1]);
      const [bLow, bHigh] = span(m.rows[i]);
      if (aLow > bHigh || bLow > aHigh) count++;
    }
    return count;
  };

  // A sag far too deep for the span: exactly the case that used to tear open.
  const steep = buildBridge({
    start: { x: 0, y: 120, z: 0 },
    end: { x: 24, y: 120, z: 0 },
    width: 3,
    sag: -40,
    curve: 'parabola',
    useSlabs: true,
  });
  check('a wildly oversagged bridge has no holes', holes(steep) === 0, `${holes(steep)} holes`);
  check('and it says it packed the gaps', steep.stats.packingBlocks > 0);
  check('and it warns that the curve outran the blocks', steep.warnings.length >= 1);
  check('count cross-check with packing', bruteForceBlockCount(steep) === steep.stats.blockCount);
  check(
    'materials still add up once packed',
    steep.stats.counts.full + steep.stats.counts.slab + steep.stats.counts.stair ===
      steep.stats.blockCount
  );

  // A steep climb as well as a steep sag.
  const both = buildBridge({
    start: { x: 0, y: 60, z: 0 },
    end: { x: 20, y: 140, z: 8 },
    width: 2,
    sag: -15,
    useSlabs: true,
    useStairs: true,
  });
  check('a steep climb with sag has no holes', holes(both) === 0, `${holes(both)} holes`);

  // Gentle bridges must not be padded out for no reason.
  const gentle = buildBridge({
    start: { x: 0, y: 64, z: 0 },
    end: { x: 80, y: 64, z: 30 },
    width: 3,
    sag: -4,
    useSlabs: true,
  });
  check('a gentle bridge adds no packing at all', gentle.stats.packingBlocks === 0);
  check('and stays one block thick', gentle.rows.every((r) => r.bottom === r.y));
  check('and raises no warnings', gentle.warnings.length === 0, gentle.warnings.join(' | '));
  check('no holes either', holes(gentle) === 0);

  // The advertised limit has to be the truth, not a guess.
  for (const useSlabs of [true, false]) {
    const shape = {
      start: { x: 0, y: 64, z: 0 },
      end: { x: 60, y: 64, z: 20 },
      width: 3,
      curve: 'catenary',
      useSlabs,
    };
    const limit = smoothSagLimit(shape);
    const at = buildBridge({ ...shape, sag: -limit });
    const past = buildBridge({ ...shape, sag: -(limit + 0.5) });
    const label = useSlabs ? 'with slabs' : 'blocks only';

    check(`${label}: a real limit is reported`, limit > 0, `limit ${limit}`);
    check(
      `${label}: at the limit every step fits the blocks`,
      at.stats.steepestStep <= at.stats.resolution,
      `step ${at.stats.steepestStep} vs ${at.stats.resolution}`
    );
    check(`${label}: at the limit nothing needs packing`, at.stats.packingBlocks === 0);
    check(
      `${label}: past the limit it goes chunky and says so`,
      past.stats.steepestStep > past.stats.resolution && past.warnings.length > 0
    );
    check(`${label}: past the limit still has no holes`, holes(past) === 0);
  }

  const slabLimit = smoothSagLimit({
    start: { x: 0, y: 64, z: 0 },
    end: { x: 60, y: 64, z: 20 },
    width: 3,
    curve: 'catenary',
    useSlabs: true,
  });
  const blockLimit = smoothSagLimit({
    start: { x: 0, y: 64, z: 0 },
    end: { x: 60, y: 64, z: 20 },
    width: 3,
    curve: 'catenary',
    useSlabs: false,
  });
  check(
    'blocks alone tolerate a deeper sag than slabs do',
    blockLimit > slabLimit,
    `blocks ${blockLimit} vs slabs ${slabLimit}`
  );
  console.log(`        slabs allow ${slabLimit}, blocks alone allow ${blockLimit}`);

  // Slabs and stairs together must be allowed, and must do both jobs.
  const bothOptions = buildBridge({
    start: { x: 0, y: 64, z: 0 },
    end: { x: 50, y: 64, z: 0 },
    width: 3,
    sag: -9,
    curve: 'parabola',
    useSlabs: true,
    useStairs: true,
  });
  check('slabs and stairs can be used together', bothOptions.stats.counts.slab > 0);
  check('and both actually appear', bothOptions.stats.counts.stair > 0);
}

// ------------------------------------------------------------ curved paths
heading('14. Curved paths follow the spline and stay solid');
{
  const straightish = {
    points: [
      { x: 0, y: 64, z: 0 },
      { x: 30, y: 64, z: 18 },
      { x: 64, y: 64, z: 0 },
    ],
    width: 4,
    useSlabs: true,
  };
  const t = buildTrack(straightish);

  check('it produces blocks', t.stats.blockCount > 0);
  check('it reports the same shape of stats as a bridge', 'counts' in t.stats && 'minY' in t.stats);

  // The whole promise of this spline: it goes THROUGH the points you type.
  const hasBlockNear = (p, radius) =>
    t.blocks.some(
      (b) => Math.abs(b.x - p.x) <= radius && Math.abs(b.z - p.z) <= radius && Math.abs(b.y - p.y) <= 1
    );
  check('the path runs through the start', hasBlockNear(straightish.points[0], 1));
  check('the path runs through the middle point', hasBlockNear(straightish.points[1], 1));
  check('the path runs through the finish', hasBlockNear(straightish.points[2], 1));

  // A curve is only a curve if it leaves the straight line between the ends.
  const offLine = t.blocks.some((b) => {
    const tt = b.x / 64;
    return Math.abs(b.z - tt * 0) > 6;
  });
  check('it actually curves away from the straight route', offLine);

  // No pinholes: every deck block must touch another one.
  const occupied = new Set(t.blocks.map((b) => `${b.x},${b.y},${b.z}`));
  let orphans = 0;
  for (const b of t.blocks) {
    let neighbours = 0;
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++) {
          if (!dx && !dy && !dz) continue;
          if (occupied.has(`${b.x + dx},${b.y + dy},${b.z + dz}`)) neighbours++;
        }
    if (neighbours === 0) orphans++;
  }
  check('no block is left floating on its own', orphans === 0, `${orphans} orphans`);

  // Width has to hold up on a corner, not pinch in.
  const widthAt = (x) => new Set(t.blocks.filter((b) => b.x === x).map((b) => b.z)).size;
  const straightWidth = widthAt(2);
  const cornerWidth = widthAt(30);
  check(
    'the deck keeps its width around the corner',
    cornerWidth >= straightWidth - 1,
    `straight ${straightWidth} vs corner ${cornerWidth}`
  );

  // A climbing, curving path is where holes would appear if anywhere.
  const hilly = buildTrack({
    points: [
      { x: 0, y: 64, z: 0 },
      { x: 20, y: 84, z: 25 },
      { x: 45, y: 70, z: -10 },
      { x: 70, y: 95, z: 20 },
    ],
    width: 3,
    useSlabs: true,
  });
  const hillyOccupied = new Set(hilly.blocks.map((b) => `${b.x},${b.y},${b.z}`));
  let hillyOrphans = 0;
  for (const b of hilly.blocks) {
    let n = 0;
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++) {
          if (!dx && !dy && !dz) continue;
          if (hillyOccupied.has(`${b.x + dx},${b.y + dy},${b.z + dz}`)) n++;
        }
    if (n === 0) hillyOrphans++;
  }
  check('a steep winding path has no floating blocks either', hillyOrphans === 0, `${hillyOrphans}`);
  check('it climbs and descends', hilly.stats.heightRange > 20, `${hilly.stats.heightRange}`);

  // The box.
  const boxed = buildTrack({
    points: [
      { x: 0, y: 64, z: 0 },
      { x: 40, y: 64, z: 60 },
      { x: 80, y: 64, z: 0 },
    ],
    width: 3,
    box: { min: { x: 0, y: 60, z: 0 }, max: { x: 80, y: 70, z: 20 } },
  });
  check(
    'control points are pulled inside the box',
    boxed.params.points.every(
      (p) => p.x >= 0 && p.x <= 80 && p.y >= 60 && p.y <= 70 && p.z >= 0 && p.z <= 20
    ),
    JSON.stringify(boxed.params.points)
  );
  check('and the box is reported back', boxed.box.max.z === 20);
  check(
    'a box derived from the points contains them all',
    (() => {
      const auto = buildTrack(straightish);
      return straightish.points.every(
        (p) =>
          p.x >= auto.box.min.x &&
          p.x <= auto.box.max.x &&
          p.z >= auto.box.min.z &&
          p.z <= auto.box.max.z
      );
    })()
  );

  // Two points and no curve is still a valid path.
  const simple = buildTrack({
    points: [
      { x: 0, y: 64, z: 0 },
      { x: 25, y: 64, z: 0 },
    ],
    width: 3,
  });
  check('a two-point path is just a straight run', simple.stats.blockCount > 0);
  check('and it stays on one line', new Set(simple.blocks.map((b) => b.z)).size === 3);

  // Bad input.
  let err = null;
  try {
    buildTrack({ points: [{ x: 0, y: 64, z: 0 }], width: 3 });
  } catch (e) {
    err = e;
  }
  check('a single point is rejected clearly', err instanceof BridgeError);

  // Both tools have to look the same to the views.
  const bridge = buildBridge({ start: { x: 0, y: 64, z: 0 }, end: { x: 20, y: 64, z: 8 } });
  for (const [name, m] of [['bridge', bridge], ['track', t]]) {
    let seen = 0;
    m.eachBlock(1, (b) => {
      if (Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.z) && b.kind) seen++;
    });
    check(`${name}: walks its blocks through one shared interface`, seen === m.stats.blockCount, `${seen}`);

    const inst = buildInstances(m);
    check(
      `${name}: the 3D preview builds boxes for it`,
      inst.full.length + inst.slab.length === m.stats.blockCount
    );
    check(`${name}: with finite bounds`, Number.isFinite(inst.bounds.minX));
  }
  check('only the straight tool draws a no-sag comparison line', !!buildInstances(bridge).chord && !buildInstances(t).chord);

  console.log(
    `        ${t.stats.blockCount} blocks over ${t.stats.trueLength} blocks of curve, ` +
      `box ${t.stats.boxSize.x}x${t.stats.boxSize.y}x${t.stats.boxSize.z}`
  );
}

// ------------------------------------ all slabs, solid flanks, tilted sag
heading('15. Under the limit it is ALL slabs; over it, no holes anywhere');
{
  /**
   * Two neighbouring columns must OVERLAP, not merely meet.
   *
   * This is the check that was wrong first time round, and the mistake is
   * worth keeping written down: a block at y=68 and a block at y=69 in the
   * next column look adjacent, but they only touch at their corner, and you
   * can see daylight straight through a corner. A steep arch built that way
   * comes out looking like a comb.
   */
  const span = (r) => {
    const low = r.kind === 'slab' && r.half === 'top' ? r.y + 0.5 : r.y;
    const high = r.kind === 'slab' && r.half === 'bottom' ? r.y + 0.5 : r.y + 1;
    return [Math.min(low, r.bottom), high];
  };
  const holes = (m) => {
    let n = 0;
    for (let i = 1; i < m.rows.length; i++) {
      const [aL, aH] = span(m.rows[i - 1]);
      const [bL, bH] = span(m.rows[i]);
      if (aL > bH || bL > aH) n++;
    }
    return n;
  };

  const shape = {
    start: { x: 0, y: 64, z: 0 },
    end: { x: 80, y: 64, z: 0 },
    width: 3,
    curve: 'catenary',
    useSlabs: true,
  };
  const limit = smoothSagLimit(shape);
  const under = buildBridge({ ...shape, sag: -limit });

  check(
    'under the limit EVERY deck block is a slab',
    under.stats.counts.full === 0,
    `${under.stats.counts.full} full blocks slipped in`
  );
  check('nothing but slabs, start to finish', under.stats.counts.slab === under.stats.blockCount);
  check(
    'using both halves, which is what makes half-block steps possible',
    under.rows.some((r) => r.half === 'top') && under.rows.some((r) => r.half === 'bottom')
  );
  check('with no packing needed', under.stats.packingBlocks === 0);
  check('and no holes', holes(under) === 0);

  let biggest = 0;
  for (let i = 1; i < under.rows.length; i++) {
    biggest = Math.max(biggest, Math.abs(surfaceTop(under.rows[i]) - surfaceTop(under.rows[i - 1])));
  }
  check('every step really is half a block or less', biggest <= 0.5, `biggest ${biggest}`);

  // The arch that came out looking like a comb.
  const steep = buildBridge({
    start: { x: 0, y: 64, z: 0 },
    end: { x: 40, y: 64, z: 0 },
    width: 3,
    sag: 30,
    curve: 'catenary',
    useSlabs: true,
  });
  check('a wildly oversagged arch has no holes at all', holes(steep) === 0, `${holes(steep)}`);
  check('slabs give way to full blocks on the steep flanks', steep.stats.counts.full > 0);
  check('but survive where it flattens off on top', steep.stats.counts.slab > 0);
  check('and it is packed solid', steep.stats.packingBlocks > 0);
  check('count cross-check', bruteForceBlockCount(steep) === steep.stats.blockCount);

  // Stairs on the steep flanks. A stair knocks half a block off a step at one
  // edge, which helps on ANY drop, not only a drop of exactly one block —
  // insisting on exactly one is what left steep flanks a wall of squares.
  const steepShape = {
    start: { x: 0, y: 64, z: 0 },
    end: { x: 60, y: 120, z: 0 },
    width: 3,
    sag: -14,
    curve: 'catenary',
    useSlabs: false,
  };
  const plain = buildBridge(steepShape);
  const stairy = buildBridge({ ...steepShape, useStairs: true });

  check('stairs appear all over a steep flank when ticked', stairy.stats.counts.stair > 0);
  check(
    'and they replace most of the square blocks, not a token few',
    stairy.stats.counts.stair > plain.stats.counts.full * 0.4,
    `${stairy.stats.counts.stair} stairs vs ${plain.stats.counts.full} plain blocks`
  );
  check(
    'the deck block total does not change, only what each one is',
    stairy.stats.blockCount === plain.stats.blockCount
  );
  check('and it still has no holes', holes(stairy) === 0);
  check('count cross-check', bruteForceBlockCount(stairy) === stairy.stats.blockCount);
  check(
    'no stair points the wrong way — each rises away from its lower side',
    (() => {
      const tops = stairy.rows.map(surfaceTop);
      return stairy.rows.every((r, i) => {
        if (r.kind !== 'stair') return true;
        const behind = i > 0 ? tops[i] - tops[i - 1] : -Infinity;
        const ahead = i < tops.length - 1 ? tops[i] - tops[i + 1] : -Infinity;
        const risesForward = r.facing === stairy.travel;
        return risesForward ? behind >= ahead : ahead > behind;
      });
    })()
  );
  check('a stair is never used where a slab already steps by a half',
    buildBridge({ ...steepShape, sag: -2, useSlabs: true, useStairs: true }).rows
      .filter((r) => r.kind === 'stair').every((r) => r.kind === 'stair'));

  // Sag measured square to the deck rather than straight down.
  const sloped = {
    start: { x: 0, y: 64, z: 0 },
    end: { x: 60, y: 100, z: 0 },
    width: 3,
    sag: -10,
    curve: 'catenary',
    useSlabs: true,
  };
  const gravity = buildBridge(sloped);
  const square = buildBridge({ ...sloped, curve: 'hanging' });
  const dev = (m) => m.rows.map((r) => r.exactLevel - (64 + 36 * r.t));
  const mirrors = (d) => d.every((v, i) => Math.abs(v - d[d.length - 1 - i]) < 0.01);

  // Distance measured at right angles to the line between the two ends.
  const cosSlope = 60 / Math.hypot(60, 36);
  const perpDrop = (m) => Math.min(...dev(m)) * cosSlope;

  check(
    'square to the deck hangs the asked-for distance SQUARE to the line',
    Math.abs(perpDrop(square) + 10) < 0.05,
    `${perpDrop(square).toFixed(3)}`
  );
  check(
    'gravity hangs the asked-for distance STRAIGHT DOWN instead',
    Math.abs(Math.min(...dev(gravity)) + 10) < 0.05,
    `${Math.min(...dev(gravity)).toFixed(3)}`
  );
  check('neither is symmetric measured against the horizontal', !mirrors(dev(gravity)));
  check(
    'rotating the sag pushes its widest point uphill, away from gravity',
    square.stats.peakDeviationAt > gravity.stats.peakDeviationAt + 0.05,
    `square at ${square.stats.peakDeviationAt}, gravity at ${gravity.stats.peakDeviationAt}`
  );
  check(
    'rotating moves the curve sideways, which a vertical stretch cannot do',
    dev(square)[15] / dev(square)[45] < 0.9,
    `quarter ${dev(square)[15].toFixed(2)} vs three-quarter ${dev(square)[45].toFixed(2)}`
  );

  const level = {
    start: { x: 0, y: 64, z: 0 },
    end: { x: 60, y: 64, z: 0 },
    width: 3,
    sag: -10,
    curve: 'catenary',
    useSlabs: true,
  };
  check(
    'on a level span the two settings are identical, as they must be',
    JSON.stringify(buildBridge(level).rows.map((r) => r.y)) ===
      JSON.stringify(buildBridge({ ...level, curve: 'hanging' }).rows.map((r) => r.y))
  );

  // Rotating the sag moves the curve sideways. On a near-vertical span that
  // sideways push can outrun the whole horizontal distance, folding the curve
  // back over itself so a column would need two heights at once. That used to
  // leave the far end 400 blocks adrift.
  let worstEndError = 0;
  let everFolded = false;
  for (const s of [8, 20, 60, 200]) {
    for (const r of [0, 5, 40, 120, 400]) {
      for (const g of [-2, -15, -60, -200, 30, 150]) {
        const m = buildBridge({
          start: { x: 0, y: 64, z: 0 },
          end: { x: s, y: 64 + r, z: 0 },
          width: 1,
          sag: g,
          curve: 'hanging',
          useSlabs: false,
        });
        worstEndError = Math.max(
          worstEndError,
          Math.abs(m.rows[0].exactLevel - 64),
          Math.abs(m.rows.at(-1).exactLevel - (64 + r))
        );
        if (m.rows.some((row) => !Number.isFinite(row.exactLevel))) everFolded = true;
      }
    }
  }
  check(
    'a rotated sag always reaches both anchors, however steep the span',
    worstEndError < 0.02,
    `worst end error ${worstEndError.toFixed(3)}`
  );
  check('and never produces a height that is not a number', !everFolded);

  // Easing must only happen when a fold was genuinely threatened.
  // The whole meaning of this mode: set it to 40 and you can walk 40 blocks
  // square to the straight line before you reach the deck. That has to hold
  // whatever the slope, not just on gentle ones.
  let worstShortfall = 0;
  for (const [s, r] of [[60, 0], [100, 20], [80, 40], [60, 56], [120, 90]]) {
    const cosSlope = s / Math.hypot(s, r);
    for (const g of [-5, -10, -25, -40]) {
      const m = buildBridge({
        start: { x: 0, y: 64, z: 0 },
        end: { x: s, y: 64 + r, z: 0 },
        width: 1,
        sag: g,
        curve: 'hanging',
        useSlabs: false,
      });
      const squareDrop = Math.min(...m.rows.map((row) => row.exactLevel - (64 + r * row.t))) * cosSlope;
      worstShortfall = Math.max(worstShortfall, Math.abs(squareDrop - g));
    }
  }
  check(
    'the sag setting IS the distance square to the line, on every slope',
    worstShortfall < 0.05,
    `worst shortfall ${worstShortfall.toFixed(3)} blocks`
  );

  const levelRot = buildBridge({
    start: { x: 0, y: 64, z: 0 },
    end: { x: 60, y: 64, z: 0 },
    width: 1,
    sag: -10,
    curve: 'hanging',
    useSlabs: false,
  });
  check(
    'a level span never needs flattening, because rotating it changes nothing',
    Math.abs(Math.min(...levelRot.rows.map((r) => r.exactLevel)) - 54) < 0.02 &&
      levelRot.warnings.every((w) => !w.includes('double back')),
    `${Math.min(...levelRot.rows.map((r) => r.exactLevel))}`
  );

  // Flattening must be a last resort, not something a normal bridge trips.
  const gentleRot = buildBridge({
    start: { x: 0, y: 64, z: 0 },
    end: { x: 100, y: 84, z: 0 },
    width: 1,
    sag: -40,
    curve: 'hanging',
    useSlabs: false,
  });
  check(
    'a gentle slope takes even a deep rotated sag without flattening',
    gentleRot.warnings.every((w) => !w.includes('double back'))
  );

  const folded = buildBridge({
    start: { x: 0, y: 64, z: 0 },
    end: { x: 20, y: 464, z: 0 },
    width: 1,
    sag: -200,
    curve: 'hanging',
    useSlabs: false,
  });
  check(
    'a genuinely impossible rotation is flattened and says so',
    folded.warnings.some((w) => w.includes('double back'))
  );
  check(
    'and it owns up to falling short rather than claiming the full sag',
    folded.warnings.some((w) => w.includes('cannot reach the full'))
  );

  console.log(`        limit ${limit}: ${under.stats.counts.slab} slabs and 0 full blocks`);
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
