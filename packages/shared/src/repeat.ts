import type { RepeatSearchResult, RepeatUnit } from './types.js';

/**
 * 循环花版：在当前网格上搜索能生成整幅图案的最小二维重复单元。
 *
 * 判定方式：给定行周期 ph、列周期 pw 后，网格中的每一格
 *   grid[r][c] 必须等于 grid[r % ph][c % pw]
 * ——即“单元内坐标映射、逐格验证”。周期不要求整除行宽/行数，
 * 网格末尾非整块的余出行/列同样参与比较，因此不能只验证左上角
 * 第一块（那样余数部分的差异会被漏掉，导致误判）。
 *
 * 全部比较都在视觉坐标上进行，与奇偶行的编织方向无关；
 * 偶数行绝不镜像。
 */

/** 候选单元的决胜顺序：先按面积升序，再按行数、列数升序 */
export function compareRepeatCandidates(
  a: RepeatUnit,
  b: RepeatUnit,
): number {
  return (
    a.rowPeriod * a.colPeriod - b.rowPeriod * b.colPeriod ||
    a.rowPeriod - b.rowPeriod ||
    a.colPeriod - b.colPeriod
  );
}

/**
 * 按单元内坐标映射逐格验证 (rowPeriod, colPeriod) 是否构成重复周期。
 * 非整除网格（末尾不足一整块的部分）同样逐格检查。
 */
export function isRepeatPeriod(
  grid: string[][],
  rows: number,
  cols: number,
  rowPeriod: number,
  colPeriod: number,
): boolean {
  for (let r = 0; r < rows; r += 1) {
    const row = grid[r] ?? [];
    const unitRow = grid[r % rowPeriod] ?? [];
    for (let c = 0; c < cols; c += 1) {
      if (row[c] !== unitRow[c % colPeriod]) return false;
    }
  }
  return true;
}

/**
 * 搜索生成整幅图案的最小二维重复单元。
 * 候选按 面积 → 行数 → 列数 升序枚举，第一个逐格验证通过的即为答案；
 * 因此也覆盖“面积相同、行/列数不同”的决胜场景。
 *
 * 退化情形：空网格（rows 或 cols 为 0）返回 1×1；未发现更小单元时
 * 返回整个网格本身（trivial = true）。
 */
export function findRepeatUnit(
  grid: string[][],
  rows: number,
  cols: number,
): RepeatSearchResult {
  const candidates: RepeatUnit[] = [];
  for (let ph = 1; ph <= rows; ph += 1) {
    for (let pw = 1; pw <= cols; pw += 1) {
      candidates.push({ rowPeriod: ph, colPeriod: pw });
    }
  }
  candidates.sort(compareRepeatCandidates);

  const best =
    rows > 0 && cols > 0
      ? (candidates.find((u) =>
          isRepeatPeriod(grid, rows, cols, u.rowPeriod, u.colPeriod),
        ) ?? { rowPeriod: rows, colPeriod: cols })
      : { rowPeriod: 1, colPeriod: 1 };

  const unitCells = best.rowPeriod * best.colPeriod;
  const gridCells = rows * cols;
  return {
    ...best,
    rows,
    cols,
    unitCells,
    gridCells,
    ratio: unitCells > 0 ? gridCells / unitCells : 0,
    trivial: best.rowPeriod === rows && best.colPeriod === cols,
  };
}

/**
 * 按视觉行/列偏移（均为 1 基、且取值在对应周期内）取出“循环单元”。
 *
 * 网格视为按单元无限循环：视觉第 rowOffset 行、第 colOffset 列即单元
 * 左上角 (0,0)，单元内第 i 行第 j 列映射回网格
 *   grid[(rowOffset - 1 + i) % rows][(colOffset - 1 + j) % cols]
 * （偏移后的行回到顶部、列回到左侧衔接，等价于相位平移，不改变周期）。
 *
 * 全程使用视觉坐标，不做任何镜像（偶数行也保持原样）。
 */
export function extractRepeatUnit(
  grid: string[][],
  rows: number,
  cols: number,
  unit: RepeatUnit,
  rowOffset: number,
  colOffset: number,
): string[][] {
  const r0 = ((rowOffset - 1) % rows + rows) % rows;
  const c0 = ((colOffset - 1) % cols + cols) % cols;
  const out: string[][] = [];
  for (let i = 0; i < unit.rowPeriod; i += 1) {
    const row: string[] = [];
    const sr = grid[(r0 + i) % rows] ?? [];
    for (let j = 0; j < unit.colPeriod; j += 1) {
      row.push(sr[(c0 + j) % cols] ?? '');
    }
    out.push(row);
  }
  return out;
}

/**
 * 把单元按视觉坐标原样平铺成 count×count 的预览。
 * 每一块都逐格复制单元内容——偶数行同样不镜像、不翻转。
 */
export function tileRepeatUnit(unitCells: string[][], count = 3): string[][] {
  const ph = unitCells.length;
  const pw = unitCells[0]?.length ?? 0;
  const out: string[][] = [];
  for (let tr = 0; tr < count; tr += 1) {
    for (let i = 0; i < ph; i += 1) {
      const row: string[] = [];
      const src = unitCells[i] ?? [];
      for (let tc = 0; tc < count; tc += 1) {
        for (let j = 0; j < pw; j += 1) row.push(src[j] ?? '');
      }
      out.push(row);
    }
  }
  return out;
}
