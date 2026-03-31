import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
  ],
  assetsInclude: ['**/*.frag', '**/*.vert'],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return

          if (id.includes('katex')) {
            return 'katex-vendor'
          }

          if (id.includes('@milkdown')) {
            return 'milkdown-vendor'
          }

          if (id.includes('prosemirror')) {
            return 'prosemirror-vendor'
          }

          if (
            id.includes('remark') ||
            id.includes('micromark') ||
            id.includes('mdast') ||
            id.includes('unist') ||
            id.includes('unified')
          ) {
            return 'markdown-parser-vendor'
          }

          if (id.includes('three')) {
            return 'render-vendor'
          }

          if (id.includes('/vue/') || id.includes('@vue')) {
            return 'vue-vendor'
          }

          return 'vendor'
        },
      },
    },
  },
})
