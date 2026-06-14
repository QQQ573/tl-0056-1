import { svelte } from '@sveltejs/vite-plugin-svelte'

export default {
  plugins: [svelte()],
  server: {
    host: '0.0.0.0',
    port: 5173
  }
}
