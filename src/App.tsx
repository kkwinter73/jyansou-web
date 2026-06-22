import { useMemo, useState } from 'react';
// ルール判定は必ず core に委譲する（web はUIのみ。architecture.md）。
import { parseHand, isWinningHand, isTenpai, waits, kindToString } from '@jyansou/core';

// 基盤の疎通確認用デモ。手牌表記を入力すると core が和了/聴牌/待ちを判定する。
// 盤面UI・対局ループは Phase 4 以降で game-flow-design.md に沿って実装する。
export function App() {
  const [hand, setHand] = useState('123456789m23p11s');

  const result = useMemo(() => {
    try {
      const counts = parseHand(hand);
      return {
        ok: true as const,
        win: isWinningHand(counts),
        tenpai: isTenpai(counts),
        waits: waits(counts).map(kindToString),
      };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  }, [hand]);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 640, margin: '2rem auto', padding: '0 1rem' }}>
      <h1>jyansou 🀄</h1>
      <p>麻雀ブラウザゲーム — 基盤（core エンジン疎通デモ）</p>
      <label style={{ display: 'block', marginTop: 16 }}>
        手牌（例: <code>123456789m23p11s</code> / <code>119m19p19s1234567z</code>）
        <input
          value={hand}
          onChange={(e) => setHand(e.target.value)}
          style={{ display: 'block', width: '100%', padding: 8, fontSize: 16, marginTop: 4 }}
        />
      </label>

      {result.ok ? (
        <ul style={{ marginTop: 16, lineHeight: 1.8 }}>
          <li>和了形: <strong>{result.win ? '✅ 和了' : '—'}</strong></li>
          <li>聴牌: <strong>{result.tenpai ? '✅ テンパイ' : '—'}</strong></li>
          <li>待ち: <strong>{result.waits.length ? result.waits.join(', ') : '—'}</strong></li>
        </ul>
      ) : (
        <p style={{ color: 'crimson', marginTop: 16 }}>入力エラー: {result.error}</p>
      )}

      <footer style={{ marginTop: 32, color: '#666', fontSize: 13 }}>
        役・点数（Phase 2-3）と対局ループ（Phase 4）は今後実装。設計は ../docs-hub を参照。
      </footer>
    </main>
  );
}
