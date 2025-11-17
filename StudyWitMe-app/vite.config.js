import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/generate": "http://localhost:3000",
      "/study": "http://localhost:3000",
      "/compare": "http://localhost:3000",
      "/quiz": "http://localhost:3000",
      "/pixabay-search": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
})
