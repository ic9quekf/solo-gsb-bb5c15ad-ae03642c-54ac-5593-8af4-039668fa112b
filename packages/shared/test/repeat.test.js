import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  compareRepeatCandidates,
  extractRepeatUnit,
  findRepeatUnit,
  isRepeatPeriod,
  tileRepeatUnit,
} from '../dist/index.js';

function grid(rows) {
  return rows.map((line) => line.split(''));
}

test('全同色网格的最小单元为 1×1，压缩比等于整幅格数', () => {
  const g = grid(['AAAA', 'AAAA', 'AAAA']);
  const r = findRepeatUnit(g, 3, 4);
  assert.deepEqual(
    { rowPeriod: r.rowPeriod, colPeriod: r.colPeriod },
    { rowPeriod: 1, colPeriod: 1 },
  );
  assert.equal(r.unitCells, 1);
  assert.equal(r.gridCells, 12);
  assert.equal(r.ratio, 12);
  assert.equal(r.trivial, false);
});

test('横向条纹：列周期 1、行周期取实际不同行数', () => {
  // 行 A/B 交替，6 行 4 列 → 2×1
  const g = grid(['AAAA', 'BBBB', 'AAAA', 'BBBB', 'AAAA', 'BBBB']);
  const r = findRepeatUnit(g, 6, 4);
  assert.deepEqual(
    { rowPeriod: r.rowPeriod, colPeriod: r.colPeriod },
    { rowPeriod: 2, colPeriod: 1 },
  );
  // 竖条纹：每行都是 ABAB
  const g2 = grid(['ABAB', 'ABAB']);
  const r2 = findRepeatUnit(g2, 2, 4);
  assert.deepEqual(
    { rowPeriod: r2.rowPeriod, colPeriod: r2.colPeriod },
    { rowPeriod: 1, colPeriod: 2 },
  );
});

test('棋盘格：最小二维单元 2×2，必须两个方向都取 2', () => {
  const g = grid([
    'ABABAB',
    'BABABA',
    'ABABAB',
    'BABABA',
    'ABABAB',
  ]);
  const r = findRepeatUnit(g, 5, 6);
  assert.deepEqual(
    { rowPeriod: r.rowPeriod, colPeriod: r.colPeriod },
    { rowPeriod: 2, colPeriod: 2 },
  );
  // 1×? 与 ?×1 都不可能是棋盘格的周期
  assert.equal(isRepeatPeriod(g, 5, 6, 1, 2), false);
  assert.equal(isRepeatPeriod(g, 5, 6, 2, 1), false);
  assert.equal(isRepeatPeriod(g, 5, 6, 2, 2), true);
});

test('周期不整除行宽：末尾余出部分必须逐格验证，不能只比首块', () => {
  // 8 列，"ABC" 重复两次后余出 "AB"——真实列周期 3（1 行）
  const ok = grid(['ABCABCAB']);
  const r = findRepeatUnit(ok, 1, 8);
  assert.deepEqual(
    { rowPeriod: r.rowPeriod, colPeriod: r.colPeriod },
    { rowPeriod: 1, colPeriod: 3 },
  );
  assert.equal(r.ratio, 8 / 3); // 非整除时压缩比为小数

  // 伪造：前两块都是 "ABC"，但余数部分 "AA" 与周期不符。
  // 只比较首块（或只看 0..pw*k 整块）会把 pw=3 误判为周期，
  // 逐格映射必须否定它。
  const fake = grid(['ABCABCAA']);
  assert.equal(isRepeatPeriod(fake, 1, 8, 1, 3), false);
  // 同样不能漏检行方向的余数
  const fakeRows = grid(['AB', 'AB', 'AA']);
  assert.equal(isRepeatPeriod(fakeRows, 3, 2, 2, 2), false);
  const rf = findRepeatUnit(fakeRows, 3, 2);
  assert.deepEqual(
    { rowPeriod: rf.rowPeriod, colPeriod: rf.colPeriod },
    { rowPeriod: 3, colPeriod: 2 },
  );
  assert.equal(rf.trivial, true);
});

test('非整除尺寸的棋盘格仍识别为 2×2', () => {
  const g = grid(['ABABA', 'BABAB', 'ABABA', 'BABAB', 'ABABA']);
  const r = findRepeatUnit(g, 5, 5);
  assert.deepEqual(
    { rowPeriod: r.rowPeriod, colPeriod: r.colPeriod },
    { rowPeriod: 2, colPeriod: 2 },
  );
});

test('决胜顺序：先按面积，再按行数、最后按列数升序', () => {
  const sorted = [
    { rowPeriod: 4, colPeriod: 4 }, // 16
    { rowPeriod: 2, colPeriod: 6 }, // 12
    { rowPeriod: 3, colPeriod: 4 }, // 12
    { rowPeriod: 6, colPeriod: 2 }, // 12
    { rowPeriod: 1, colPeriod: 6 }, // 6
    { rowPeriod: 2, colPeriod: 3 }, // 6
  ].sort(compareRepeatCandidates);
  assert.deepEqual(sorted, [
    { rowPeriod: 1, colPeriod: 6 },
    { rowPeriod: 2, colPeriod: 3 },
    { rowPeriod: 2, colPeriod: 6 },
    { rowPeriod: 3, colPeriod: 4 },
    { rowPeriod: 6, colPeriod: 2 },
    { rowPeriod: 4, colPeriod: 4 },
  ]);
});

test('无更小单元时返回整幅尺寸并标记 trivial', () => {
  const g = grid(['AB', 'BA', 'AA']);
  const r = findRepeatUnit(g, 3, 2);
  assert.deepEqual(
    { rowPeriod: r.rowPeriod, colPeriod: r.colPeriod },
    { rowPeriod: 3, colPeriod: 2 },
  );
  assert.equal(r.trivial, true);
  assert.equal(r.ratio, 1);
});

test('偏移取单元：按视觉坐标循环回绕，仅平移相位不改变图案', () => {
  // 4 列条纹 ABAB，列周期 2；列偏移取 2 → 单元内容为 B A
  const g = grid(['ABAB', 'ABAB']);
  const unit = { rowPeriod: 1, colPeriod: 2 };
  assert.deepEqual(extractRepeatUnit(g, 2, 4, unit, 1, 1), [['A', 'B']]);
  assert.deepEqual(extractRepeatUnit(g, 2, 4, unit, 1, 2), [['B', 'A']]);

  // 行偏移跨行末尾回绕到顶部
  const stripe = grid(['AAAA', 'BBBB', 'AAAA', 'BBBB']); // 行周期 2
  assert.deepEqual(
    extractRepeatUnit(stripe, 4, 4, { rowPeriod: 2, colPeriod: 1 }, 2, 1),
    [['B'], ['A']],
  );
  assert.deepEqual(
    extractRepeatUnit(stripe, 4, 4, { rowPeriod: 2, colPeriod: 1 }, 3, 1),
    [['A'], ['B']],
  );
});

test('3×3 平铺逐格复制单元：偶数行同样不镜像', () => {
  // 非对称单元，若偶数行被镜像平铺会与逐格复制结果不同
  const unit = grid(['ABC', 'DEF']);
  const tiled = tileRepeatUnit(unit, 3);
  assert.equal(tiled.length, 6);
  assert.deepEqual(tiled[0], ['A', 'B', 'C', 'A', 'B', 'C', 'A', 'B', 'C']);
  assert.deepEqual(tiled[1], ['D', 'E', 'F', 'D', 'E', 'F', 'D', 'E', 'F']);
  // 第二行（偶数行）视觉上仍是 D E F 起头，绝不翻成 F E D
  assert.notEqual(tiled[1][0], 'F');
  assert.deepEqual(tiled[3], tiled[1]);
  assert.deepEqual(tiled[4], tiled[0]);
});

test('偏移后的单元再平铺，与原网格同相位的区域逐格一致（往返一致）', () => {
  // 6×6 棋盘格，取 2×2 单元、偏移 (1,1)，平铺 3×3 后应与原网格完全相同
  const g = grid([
    'ABABAB',
    'BABABA',
    'ABABAB',
    'BABABA',
    'ABABAB',
    'BABABA',
  ]);
  const found = findRepeatUnit(g, 6, 6);
  const unit = extractRepeatUnit(g, 6, 6, found, 1, 1);
  assert.deepEqual(tileRepeatUnit(unit, 3), g);
  // 偏移 (2,2) 后平铺整体相位平移，仍是合法棋盘格
  const shifted = extractRepeatUnit(g, 6, 6, found, 2, 2);
  const tiledShifted = tileRepeatUnit(shifted, 3);
  assert.deepEqual(tiledShifted[0], ['A', 'B', 'A', 'B', 'A', 'B']);
  assert.deepEqual(tiledShifted[1], ['B', 'A', 'B', 'A', 'B', 'A']);
});

test('空网格安全退化为 1×1', () => {
  const r = findRepeatUnit([], 0, 0);
  assert.deepEqual(
    { rowPeriod: r.rowPeriod, colPeriod: r.colPeriod },
    { rowPeriod: 1, colPeriod: 1 },
  );
});
