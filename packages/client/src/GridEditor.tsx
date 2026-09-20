import { useEffect, useMemo, useRef } from 'react';
import type { FloatSpan, RepeatUnit } from '@jacquard/shared';

/**
 * 循环花版边界信息（视觉坐标）：
 * rowPeriod/colPeriod 为最小重复单元尺寸；
 * rowOffset/colOffset 为单元左上角所在的视觉行/列（1 基，周期内取值）。
 * 偶数行同样按视觉坐标处理，绝不镜像。
 */
export interface RepeatTile {
  unit: RepeatUnit;
  /** 1 基视觉行：单元顶边所在行 */
  rowOffset: number;
  /** 1 基视觉列：单元左边所在列 */
  colOffset: number;
}

interface GridEditorProps {
  width: number;
  height: number;
  grid: string[][];
  rowIssueMap: Map<number, string>; // 1 基行号 -> 错误简述
  appliedRows: number[];
  /** 超过阈值的浮线区间（视觉坐标） */
  floatRisks: FloatSpan[];
  /** 当前在风险列表中选中的浮线（来自同一 floatRisks 数组，按引用比较） */
  selectedFloat: FloatSpan | null;
  /** 循环花版：在原网格上描出重复单元边界；null 时不绘制 */
  tile: RepeatTile | null;
  onPaint: (row: number, col: number) => void;
}

const SYMBOL_CLASS: Record<string, string> = {
  A: 'sym-a',
  B: 'sym-b',
  C: 'sym-c',
};

interface FloatMark {
  /** 是否为某段浮线的起/止列（同色针脚） */
  anchor: boolean;
  /** 是否属于当前选中的浮线 */
  selected: boolean;
  /** 覆盖该格的第一段浮线说明（用于悬浮提示） */
  tip: string;
}

/** 循环花版在单格上的描边信息（四边是否落在单元分界线上） */
interface TileMark {
  top: boolean;
  right: boolean;
  bottom: boolean;
  left: boolean;
  /** 是否为单元起点（偏移指定的左上角） */
  anchor: boolean;
}

/** 分界线描边色（与浮线红、主色蓝区分） */
const TILE_LINE = '#0e9488';

/**
 * 定宽符号网格。
 * 关键约束：视觉坐标恒定——列 0 始终在最左；
 * 偶数行行首用 ← 标注实际编织方向，但该行绝不做视觉镜像。
 * 浮线风险同样按视觉坐标标注：起止列描边、区间下划红线，不随偶数行翻转。
 * 循环花版边界也按视觉坐标的行/列偏移取模描边，偶数行不镜像。
 */
export default function GridEditor({
  width,
  height,
  grid,
  rowIssueMap,
  appliedRows,
  floatRisks,
  selectedFloat,
  tile,
  onPaint,
}: GridEditorProps) {
  const painting = useRef(false);
  const tableRef = useRef<HTMLTableElement>(null);

  /** 格子（0 基 "r-c"）→ 浮线标注；不同颜色的浮线区间可能重叠，逐格合并 */
  const floatMarks = useMemo(() => {
    const marks = new Map<string, FloatMark>();
    for (const span of floatRisks) {
      const isSelected = span === selectedFloat;
      const tip = `浮线风险：符号 ${span.symbol} 第 ${span.startCol}–${span.endCol} 列，跨 ${span.length} 针`;
      for (let c1 = span.startCol; c1 <= span.endCol; c1 += 1) {
        const key = `${span.row - 1}-${c1 - 1}`;
        const prev = marks.get(key);
        marks.set(key, {
          anchor:
            (prev?.anchor ?? false) ||
            c1 === span.startCol ||
            c1 === span.endCol,
          selected: (prev?.selected ?? false) || isSelected,
          tip: prev?.tip ?? tip,
        });
      }
    }
    return marks;
  }, [floatRisks, selectedFloat]);

  /**
   * 循环花版边界：对每个视觉格判断其四条边是否落在单元分界线上。
   * 分界线条件（r 为 0 基视觉行、c 为 0 基视觉列，偏移也是 0 基）：
   *   水平边（行方向）：(r - rowOffset0) 对行周期取模 === 0
   *   垂直边（列方向）：(c - colOffset0) 对列周期取模 === 0
   * 取模对非整除行宽同样成立；周期为 1 时每个格之间都有分界线。
   * 全程视觉坐标，偶数行不做任何翻转。
   */
  const tileMarks = useMemo(() => {
    const marks = new Map<string, TileMark>();
    if (!tile || width === 0 || height === 0) return marks;
    const ph = tile.unit.rowPeriod;
    const pw = tile.unit.colPeriod;
    const r0 = ((tile.rowOffset - 1) % height + height) % height;
    const c0 = ((tile.colOffset - 1) % width + width) % width;
    const onH = (r: number) => ((r - r0) % ph + ph) % ph === 0;
    const onV = (c: number) => ((c - c0) % pw + pw) % pw === 0;
    for (let r = 0; r < height; r += 1) {
      for (let c = 0; c < width; c += 1) {
        const mark: TileMark = {
          top: onH(r),
          bottom: onH(r + 1),
          left: onV(c),
          right: onV(c + 1),
          anchor: r === r0 && c === c0,
        };
        if (mark.top || mark.bottom || mark.left || mark.right) {
          marks.set(`${r}-${c}`, mark);
        }
      }
    }
    return marks;
  }, [tile, width, height]);

  /** 单元分界线与错误行红框共用 inset shadow，避免互相覆盖 */
  const tileShadow = (r: number, c: number, hasError: boolean): string => {
    const m = tileMarks.get(`${r}-${c}`);
    const shadows: string[] = [];
    if (m) {
      if (m.top) shadows.push(`inset 0 2px 0 0 ${TILE_LINE}`);
      if (m.bottom) shadows.push(`inset 0 -2px 0 0 ${TILE_LINE}`);
      if (m.left) shadows.push(`inset 2px 0 0 0 ${TILE_LINE}`);
      if (m.right) shadows.push(`inset -2px 0 0 0 ${TILE_LINE}`);
    }
    if (hasError) shadows.push('inset 0 0 0 2px rgba(214, 69, 69, 0.55)');
    return shadows.join(', ');
  };

  /** 选中风险条目后，把该浮线起始列滚动到可视区域 */
  useEffect(() => {
    if (!selectedFloat) return;
    const el = tableRef.current?.querySelector(
      `[data-cell="${selectedFloat.row - 1}-${selectedFloat.startCol - 1}"]`,
    );
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [selectedFloat]);

  const rowClass = (r1: number) => {
    const classes: string[] = [];
    if (rowIssueMap.has(r1)) classes.push('row-error');
    if (appliedRows.includes(r1)) classes.push('row-applied');
    if (selectedFloat && selectedFloat.row === r1)
      classes.push('row-float-selected');
    return classes.join(' ');
  };

  return (
    <div className="grid-scroll">
      <table
        ref={tableRef}
        className="grid-table"
        onPointerDown={() => {
          painting.current = true;
        }}
        onPointerUp={() => {
          painting.current = false;
        }}
        onPointerLeave={() => {
          painting.current = false;
        }}
      >
        <thead>
          <tr>
            <th className="corner-head">行</th>
            {Array.from({ length: width }, (_, c) => (
              <th key={c} className="col-head">
                {c + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: height }, (_, r) => {
            const r1 = r + 1;
            const isOdd = r1 % 2 === 1;
            const issue = rowIssueMap.get(r1);
            return (
              <tr key={r} className={rowClass(r1)}>
                <th className="row-head" title={isOdd ? '奇数行：自左向右 →' : '偶数行：自右向左 ←'}>
                  <span className="row-no">{String(r1).padStart(2, '0')}</span>
                  <span className={`dir-arrow ${isOdd ? 'odd' : 'even'}`}>
                    {isOdd ? '→' : '←'}
                  </span>
                </th>
                {Array.from({ length: width }, (_, c) => {
                  const symbol = grid[r]?.[c] ?? '';
                  const mark = floatMarks.get(`${r}-${c}`);
                  const tmark = tileMarks.get(`${r}-${c}`);
                  const cellClasses = ['grid-cell', SYMBOL_CLASS[symbol] ?? ''];
                  if (mark) cellClasses.push('float-risk');
                  if (mark?.anchor) cellClasses.push('float-anchor');
                  if (mark?.selected) cellClasses.push('float-selected');
                  if (tmark) cellClasses.push('repeat-cell');
                  if (tmark?.anchor) cellClasses.push('repeat-anchor-cell');
                  const shadow = tileShadow(r, c, rowIssueMap.has(r1));
                  const baseTitle = `第 ${r1} 行 第 ${c + 1} 列（视觉坐标）`;
                  const tileTitle = tmark
                    ? `循环单元分界线（视觉坐标，偶数行不镜像）${
                        tmark.anchor ? '；★ 单元起点' : ''
                      }`
                    : '';
                  return (
                    <td key={c} className="grid-cell-td">
                      <button
                        type="button"
                        data-cell={`${r}-${c}`}
                        className={cellClasses.join(' ')}
                        style={shadow ? { boxShadow: shadow } : undefined}
                        title={[baseTitle, mark?.tip, tileTitle]
                          .filter(Boolean)
                          .join('｜')}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          painting.current = true;
                          onPaint(r, c);
                        }}
                        onPointerEnter={() => {
                          if (painting.current) onPaint(r, c);
                        }}
                      >
                        {symbol}
                        {tmark?.anchor && (
                          <span className="repeat-anchor-dot" aria-hidden>
                            ★
                          </span>
                        )}
                      </button>
                    </td>
                  );
                })}
                {issue ? (
                  <th className="row-flag" title={issue}>
                    !
                  </th>
                ) : (
                  <th className="row-flag row-flag-empty" />
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
