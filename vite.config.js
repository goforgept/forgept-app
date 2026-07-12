import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    // Target Safari 14 / ES2020 so Vite transpiles ES2022 static class blocks used
    // inside the pdfjs-dist worker. Without this the worker crashes silently on
    // iOS < 16.4 (Safari < 16.4) because it can't parse `static { }` syntax.
    target: ['es2020', 'safari14'],
  },
  worker: {
    // Force IIFE (classic) workers — ES module workers (.mjs) hang on iOS WebKit.
    format: 'iife',
    // Same transpile target for the worker bundle itself.
    rollupOptions: {
      output: { format: 'iife' },
    },
  },
})
