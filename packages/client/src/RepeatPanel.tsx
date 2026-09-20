import { useEffect, useMemo, useRef } from 'react';
import type { RepeatSearchResult } from '@jacquard/shared';
import { extractRepeatUnit, tileRepeatUnit } from '@jacquard/shared';

interface RepeatPanelProps {
  /** 最小重复单元搜索结果（随网格实时重算） */
  result: RepeatSearchResult;
  grid: string[][];
  /** 1 基视觉行偏移（单元顶边所在行），范围 1..rowPeriod */
  rowOffset: number;
  /** 1 基视觉列偏移（单元左边所在列），范围 1..colPeriod */
  colOffset: number;
  onRowOffset: (v: number) => void;
  onColOffset: (v: number) => void;
}

/** 符号底色与文字色（与 CSS 变量保持一致） */
const CELL_COLORS: Record<string, { bg: string; ink: string }> = {
  A: { bg: '#eef2f7', ink: '#8a97a5' },
  B: { bg: '#2b3a55', ink: '#ffffff' },
  C: { bg: '#d9893d', ink: '#ffffff' },
};
const TILE_LINE = '#0e9488';

interface TileCanvasProps {
  cells: string[][];
  /** 平铺单元尺寸（行/列）；仅用于在 count×count 预览中画单元分界线 */
  unitRow?: number;
  unitCol?: number;
  /** 每格像素尺寸；不传则按画布宽度自适应 */
  fixedCell?: number;
  count?: number;
  ariaLabel: string;
}

/**
 * 用 canvas 绘制符号网格：保证大块单元（最多 64×64 平铺为 192×192）
 * 也能清晰、低成本地渲染。偶数行与奇数行完全同构——绝不镜像。
 */
function TileCanvas({
  cells,
  unitRow,
  unitCol,
  fixedCell,
  count = 1,
  ariaLabel,
}: TileCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  const rows = cells.length;
  const cols = cells[0]?.length ?? 0;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const cssWidth = canvas.clientWidth || 320;
    const cell =
      fixedCell ?? Math.max(2, Math.min(16, Math.floor(cssWidth / cols)));
    const dpr = window.devicePixelRatio || 1;
    const w = cols * cell;
    const h = rows * cell;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const symbol = cells[r]?.[c] ?? '';
        const color = CELL_COLORS[symbol] ?? CELL_COLORS.A;
        ctx.fillStyle = color.bg;
        ctx.fillRect(c * cell, r * cell, cell, cell);
        if (cell >= 11) {
          ctx.fillStyle = color.ink;
          ctx.font = `700 ${Math.round(cell * 0.6)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(symbol, c * cell + cell / 2, r * cell + cell / 2 + 0.5);
        }
      }
    }

    // 细网格线
    ctx.strokeStyle = 'rgba(31,41,51,0.18)';
    ctx.lineWidth = 1;
    for (let c = 0; c <= cols; c += 1) {
      ctx.beginPath();
      ctx.moveTo(c * cell + 0.5, 0);
      ctx.lineTo(c * cell + 0.5, h);
      ctx.stroke();
    }
    for (let r = 0; r <= rows; r += 1) {
      ctx.beginPath();
      ctx.moveTo(0, r * cell + 0.5);
      ctx.lineTo(w, r * cell + 0.5);
      ctx.stroke();
    }

    // 3×3 平铺中的单元分界（每 unitRow/unitCol 格一条）
    if (unitRow && unitCol && count > 1) {
      ctx.strokeStyle = TILE_LINE;
      ctx.lineWidth = 2;
      for (let tr = 0; tr <= count; tr += 1) {
        const y = tr * unitRow * cell;
        ctx.beginPath();
        ctx.moveTo(0, y + (tr === 0 ? 1 : -0.5));
        ctx.lineTo(w, y + (tr === 0 ? 1 : -0.5));
        ctx.stroke();
      }
      for (let tc = 0; tc <= count; tc += 1) {
        const x = tc * unitCol * cell;
        ctx.beginPath();
        ctx.moveTo(x + (tc === 0 ? 1 : -0.5), 0);
        ctx.lineTo(x + (tc === 0 ? 1 : -0.5), h);
        ctx.stroke();
      }
    }
  }, [cells, rows, cols, unitRow, unitCol, fixedCell, count]);

  return <canvas ref={ref} className="repeat-canvas" role="img" aria-label={ariaLabel} />;
}

/**
 * 循环花版面板：
 * - 显示最小重复单元尺寸、整幅尺寸与压缩比；
 * - 行/列偏移（视觉坐标）平移单元相位，偶数行不镜像；
 * - 展示单元本体与 3×3 平铺预览。
 */
export default function RepeatPanel({
  result,
  grid,
  rowOffset,
  colOffset,
  onRowOffset,
  onColOffset,
}: RepeatPanelProps) {
  const unit = useMemo(
    () =>
      extractRepeatUnit(
        grid,
        result.rows,
        result.cols,
        { rowPeriod: result.rowPeriod, colPeriod: result.colPeriod },
        rowOffset,
        colOffset,
      ),
    [grid, result, rowOffset, colOffset],
  );

  const tiled = useMemo(() => tileRepeatUnit(unit, 3), [unit]);

  const ratioText =
    Number.isInteger(result.ratio)
      ? `${result.ratio} : 1`
      : `${result.ratio.toFixed(2)} : 1`;

  const offsetInput = (
    label: string,
    value: number,
    max: number,
    onChange: (v: number) => void,
  ) => (
    <label className="repeat-offset-label">
      {label}
      <input
        type="number"
        min={1}
        max={max}
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(Math.min(Math.max(Math.trunc(v), 1), max));
        }}
      />
      <span className="hint">/ {max}</span>
    </label>
  );

  return (
    <section className="repeat-panel" aria-label="循环花版">
      <div className="repeat-head">
        <span className="repeat-badge">循环花版</span>
        <span className="repeat-stats">
          最小重复单元 <strong>{result.rowPeriod} 行 × {result.colPeriod} 列</strong>
          （{result.unitCells} 格）；整幅 {result.rows} × {result.cols}（
          {result.gridCells} 格）；压缩比 <strong>{ratioText}</strong>
        </span>
        {result.trivial && (
          <span className="repeat-trivial">
            未发现更小的重复单元，单元即整幅（压缩比 1:1）
          </span>
        )}
      </div>

      <div className="repeat-body">
        <div className="repeat-controls">
          <div className="repeat-offsets">
            {offsetInput('行偏移（视觉行）', rowOffset, result.rowPeriod, onRowOffset)}
            {offsetInput('列偏移（视觉列）', colOffset, result.colPeriod, onColOffset)}
            <button
              type="button"
              className="repeat-reset"
              onClick={() => {
                onRowOffset(1);
                onColOffset(1);
              }}
            >
              复位
            </button>
          </div>
          <p className="hint repeat-hint">
            偏移为单元左上角所在的视觉行/列（1～周期），仅平移循环相位：
            跨出末尾的行/列回到顶/左衔接。全程使用视觉坐标，
            <strong>偶数行不镜像</strong>。
          </p>
          <div className="repeat-unit-block">
            <div className="repeat-block-title">
              重复单元（{result.rowPeriod}×{result.colPeriod}）
            </div>
            <div className="repeat-unit-canvas">
              <TileCanvas
                cells={unit}
                fixedCell={Math.max(8, Math.min(22, Math.floor(220 / Math.max(result.colPeriod, 1))))}
                ariaLabel={`最小重复单元，${result.rowPeriod} 行 ${result.colPeriod} 列`}
              />
            </div>
          </div>
        </div>

        <div className="repeat-tile-block">
          <div className="repeat-block-title">
            3×3 平铺预览（{result.rowPeriod * 3} 行 × {result.colPeriod * 3} 列）
          </div>
          <div className="repeat-tile-canvas">
            <TileCanvas
              cells={tiled}
              unitRow={result.rowPeriod}
              unitCol={result.colPeriod}
              count={3}
              ariaLabel="单元按 3 行 3 列平铺的预览"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
