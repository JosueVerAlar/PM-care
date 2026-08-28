/// <reference types="vitest/config" />
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
  /*
   * `jsdom` NO se configura aquí. Vitest 4 quitó `environmentMatchGlobs`, y levantar un
   * DOM para las ~900 pruebas de dominio las haría lentas sin ganar nada. Las de interfaz
   * lo piden archivo por archivo con `// @vitest-environment jsdom` en su cabecera.
   */
})
