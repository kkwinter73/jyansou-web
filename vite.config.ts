import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// 開発時は core の TS ソースを直接参照する（ローカル依存。ADR-0008）。
// 将来サーバと共有/公開する段階で、ビルド済みパッケージ参照へ切り替える。
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@jyansou/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
    },
  },
});
