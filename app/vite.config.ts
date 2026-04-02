import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// Tauri 在开发模式下使用固定端口，生产模式下使用 frontendDist
const host = process.env.TAURI_DEV_HOST

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
  ],
  assetsInclude: ['**/*.frag', '**/*.vert'],

  // Tauri 要求明确的服务器配置
  server: {
    host: host ?? 'localhost',
    port: 5173,
    strictPort: true,
    // 仅在 Tauri 要求远程访问时启用 HTTPS（移动端调试用）
    ...(host ? { hmr: { protocol: 'ws', host, port: 5183 } } : {}),
  },

  // 告知 Vite 不要混淆 Tauri 命令（避免 __TAURI__ 相关变量被 tree-shaking 掉）
  envPrefix: ['VITE_', 'TAURI_'],

  build: {
    // Tauri WebView 在 Windows 上使用 Chromium（WebView2），支持较新语法
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    // 开发模式下保留 sourcemap 方便调试
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return

          if (id.includes('katex')) return 'katex-vendor'
          if (id.includes('@milkdown')) return 'milkdown-vendor'
          if (id.includes('prosemirror')) return 'prosemirror-vendor'
          if (
            id.includes('remark') ||
            id.includes('micromark') ||
            id.includes('mdast') ||
            id.includes('unist') ||
            id.includes('unified')
          ) return 'markdown-parser-vendor'
          if (id.includes('three')) return 'render-vendor'
          if (id.includes('/vue/') || id.includes('@vue')) return 'vue-vendor'

          return 'vendor'
        },
      },
    },
  },
})
