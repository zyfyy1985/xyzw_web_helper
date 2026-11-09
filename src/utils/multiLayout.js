/**
 * 多开布局计算（纯函数，不碰 DOM）。
 *
 * 铁律：格子只做等比缩放，永不拉伸 —— 协同靠归一化坐标（x/宽, y/高）换算，
 * 一旦某个窗被拉成不同宽高比，坐标就会错位。
 *
 * 排布（count = 开几个）：
 *   1 → 1×1
 *   2 → 上下 1 列 2 行 / 左右 1 行 2 列（auto 按容器高宽比选：竖容器上下、横容器左右）
 *   3 → 上 2 下 1（下排单窗居中）
 *   4 → 田字 2×2
 *
 * mode：'auto' | 'rows'（强制上下/田字）| 'cols'（强制左右）
 */

/** 游戏原始比例（与「打开游戏」小窗口一致） */
export const PANE_W = 480;
export const PANE_H = 940;

/** 每行放几个 */
export function resolveRows(count, mode, boxW, boxH) {
  const n = Math.max(1, Math.min(4, count | 0));
  if (n === 1) return [1];
  if (mode === "cols") return [n];
  if (mode === "rows") return n === 2 ? [1, 1] : n === 3 ? [2, 1] : [2, 2];
  if (n === 2) return boxH >= boxW ? [1, 1] : [2];
  if (n === 3) return [2, 1];
  return [2, 2];
}

/**
 * @param {{count:number,width:number,height:number,mode?:string,gap?:number,pad?:number}} opts
 * @returns {{rows:number[],cols:number,scale:number,paneW:number,paneH:number,panes:Array<{x:number,y:number,w:number,h:number}>}}
 */
export function computeLayout({ count, width, height, mode = "auto", gap = 8, pad = 8 }) {
  const rows = resolveRows(count, mode, width, height);
  const cols = Math.max(...rows);
  const innerW = Math.max(0, width - pad * 2 - gap * (cols - 1));
  const innerH = Math.max(0, height - pad * 2 - gap * (rows.length - 1));
  const cellW = innerW / cols;
  const cellH = innerH / rows.length;

  // 统一比例：取所有行里最紧的一格，保证 3 开的三个窗大小一致
  const scale = Math.max(0.1, Math.min(cellW / PANE_W, cellH / PANE_H));
  const paneW = Math.round(PANE_W * scale);
  const paneH = Math.round(PANE_H * scale);

  const panes = [];
  let slot = 0;
  for (let r = 0; r < rows.length; r++) {
    const n = rows[r];
    const rowW = n * paneW + gap * (n - 1);
    const startX = pad + Math.max(0, (width - pad * 2 - rowW) / 2);
    const rowTop = pad + r * (cellH + gap);
    const y = Math.round(rowTop + Math.max(0, (cellH - paneH) / 2));
    for (let c = 0; c < n; c++) {
      if (slot >= count) break;
      panes.push({
        x: Math.round(startX + c * (paneW + gap)),
        y,
        w: paneW,
        h: paneH,
      });
      slot += 1;
    }
  }

  return { rows, cols, scale, paneW, paneH, panes };
}
