# web 作業ガイド（CLAUDE.md）

`web` = 麻雀ブラウザフロント（React + Vite, TypeScript）。UI・入力・描画・CPU起動・seed生成を担う。

## 最重要（インライン必須・毎回読む）

- **ルール判定を web に書かない。** 牌/和了/役/点数/合法手の判定はすべて `@jyansou/core` に委譲する（architecture.md）。`web` は core の状態を保持・描画するだけ。
- **担当リポ外（`../core`, `../docs-hub`）を書き換えない。** 読むのは可。core を変えたくなったら core に Issue を立てる（ADR-0005）。scope-guard hook が拒否する。
- **恒久・横断の知識は個人メモリでなく `../docs-hub` へ。**

## 開発

```bash
npm install
npm run dev        # Vite 開発サーバ
npm run build      # tsc --noEmit && vite build
npm run typecheck
```

`@jyansou/core` は dev 時 `../core/src` を alias 参照する（vite.config.ts / tsconfig paths, ADR-0008）。

## タスク種別 → 参照すべき横断ドキュメント

| やること | まず読む |
|---|---|
| core の公開APIで何が使えるか | `../docs-hub/docs/design/architecture.md#core-の公開api境界の契約` |
| 盤面・手牌・河・点棒のUI | `../docs-hub/docs/design/game-flow-design.md`（状態の形） |
| 状態の持ち方（不変state） | `../docs-hub/docs/decisions/0006-immutable-state-reducer.md` |
| 技術選定のなぜ | `../docs-hub/docs/decisions/0003-frontend-stack.md` |
| このリポ内に閉じた設計判断 | `docs/adr/` |

## 現状（基盤）

`src/App.tsx` は core 疎通デモ（手牌→和了/聴牌/待ち判定）。状態管理は React 標準（useReducer/Context）から始め、必要になるまで外部ライブラリを入れない（ADR-0003）。
