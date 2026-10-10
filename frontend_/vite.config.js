import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Dev only: forward /api to the local Flask server, as the production proxy does
  server: {
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
})
