import type { TileKind } from '@jyansou/core';

const HONORS = ['東', '南', '西', '北', '白', '發', '中'];
const SUIT_MARK = ['m', 'p', 's'];

/** 牌種を表示用ラベルに（数牌=数字+mps、字牌=漢字）。 */
export function tileLabel(kind: TileKind): string {
  if (kind >= 27) return HONORS[kind - 27];
  const suit = Math.floor(kind / 9);
  const num = (kind % 9) + 1;
  return `${num}${SUIT_MARK[suit]}`;
}

/** 牌の色クラス（スート別の色分け）。 */
export function tileSuitClass(kind: TileKind): string {
  if (kind >= 31) return 'dragon';
  if (kind >= 27) return 'wind';
  return SUIT_MARK[Math.floor(kind / 9)];
}

export const WIND_LABEL: Record<string, string> = { E: '東', S: '南', W: '西', N: '北' };
