/// <reference types="vitest/config" />
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { injectOriginTrial } from './src/lib/originTrial.js'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      // WebMCP origin-trial tokens are per-origin; inject only when a build-time token is provided.
      name: "webmcp-origin-trial",
      transformIndexHtml(html: string) {
        return injectOriginTrial(html, process.env.VITE_WEBMCP_OT_TOKEN);
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "server/**/*.test.js"],
    setupFiles: ["src/test/setup.ts"],
    css: { include: [/index\.css/] },
  },
})
