import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// base: './' hace que los assets se referencien con ruta relativa,
// imprescindible para que funcione en GitHub Pages (usuario.github.io/repo/).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
})
