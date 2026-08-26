import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// El renderer se sirve desde file:// cuando está empaquetado, así que las rutas
// tienen que ser relativas. Con base absoluta la app abre en blanco.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist/renderer', emptyOutDir: true },
  // 5190 y no el 5173 por omisión: ese puerto suele estar ocupado por otro Vite.
  server: { port: 5190, strictPort: true },
})
