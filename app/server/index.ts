import express from 'express'
import { createServer } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import chokidar from 'chokidar'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import type { ViteDevServer } from 'vite'

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url))
const APP_DIR = path.resolve(SERVER_DIR, '..')
const ROOT_DIR = path.resolve(APP_DIR, '..')
const DATA_DIR = path.join(ROOT_DIR, 'data')
const DIST_DIR = path.join(APP_DIR, 'dist')
const INDEX_HTML_PATH = path.join(APP_DIR, 'index.html')
const WS_PATH = '/ws'
const PORT = Number(process.env.PORT ?? 5173)
const modeArgIndex = process.argv.indexOf('--mode')
const MODE = modeArgIndex >= 0 ? process.argv[modeArgIndex + 1] : (process.env.NODE_ENV ?? 'development')
const IS_DEV = MODE !== 'production'

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

const app = express()
app.use(express.text({ type: '*/*', limit: '10mb' }))

const server = createServer(app)
const wss = new WebSocketServer({ noServer: true })
let vite: ViteDevServer | null = null

const recentWrites = new Set<string>()

app.get('/api/files', (_req, res) => {
  try {
    const files = listMdFiles()
    res.json(files)
  } catch (err) {
    res.status(500).json({ error: 'Failed to list files' })
  }
})

app.get('/api/files/:name', (req, res) => {
  const filePath = safePath(req.params.name)
  if (!filePath) return res.status(400).json({ error: 'Invalid filename' })
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' })

  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const stat = fs.statSync(filePath)
    res.json({
      name: req.params.name,
      content,
      lastModified: stat.mtimeMs,
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to read file' })
  }
})

app.put('/api/files/:name', (req, res) => {
  const filePath = safePath(req.params.name)
  if (!filePath) return res.status(400).json({ error: 'Invalid filename' })

  try {
    const content = typeof req.body === 'string' ? req.body : ''
    recentWrites.add(path.basename(filePath))
    setTimeout(() => recentWrites.delete(path.basename(filePath)), 1000)

    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

    fs.writeFileSync(filePath, content, 'utf-8')
    res.json({ ok: true, name: req.params.name })
  } catch (err) {
    res.status(500).json({ error: 'Failed to write file' })
  }
})

app.delete('/api/files/:name', (req, res) => {
  const filePath = safePath(req.params.name)
  if (!filePath) return res.status(400).json({ error: 'Invalid filename' })
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' })

  try {
    recentWrites.add(path.basename(filePath))
    setTimeout(() => recentWrites.delete(path.basename(filePath)), 1000)
    fs.unlinkSync(filePath)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete file' })
  }
})

app.post('/api/files/:name/rename', (req, res) => {
  const oldPath = safePath(req.params.name)
  const newName = typeof req.body === 'string' ? req.body.trim() : ''
  const newPath = safePath(newName)
  if (!oldPath || !newPath) return res.status(400).json({ error: 'Invalid filename' })
  if (!fs.existsSync(oldPath)) return res.status(404).json({ error: 'Not found' })

  try {
    const dir = path.dirname(newPath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

    recentWrites.add(path.basename(oldPath))
    recentWrites.add(path.basename(newPath))
    setTimeout(() => {
      recentWrites.delete(path.basename(oldPath))
      recentWrites.delete(path.basename(newPath))
    }, 1000)
    fs.renameSync(oldPath, newPath)
    res.json({ ok: true, name: newName })
  } catch (err) {
    res.status(500).json({ error: 'Failed to rename file' })
  }
})

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'init', files: listMdFiles() }))
})

function broadcast(data: object) {
  const msg = JSON.stringify(data)
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg)
    }
  })
}

const watcher = chokidar.watch(DATA_DIR, {
  ignored: /(^|[\/\\])\../,
  persistent: true,
  ignoreInitial: true,
  depth: 3,
  awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
})

watcher
  .on('add', (filePath) => {
    if (!filePath.endsWith('.md')) return
    const name = path.relative(DATA_DIR, filePath).replace(/\\/g, '/')
    if (recentWrites.has(path.basename(filePath))) return
    const content = fs.readFileSync(filePath, 'utf-8')
    broadcast({ type: 'created', name, content })
  })
  .on('change', (filePath) => {
    if (!filePath.endsWith('.md')) return
    const name = path.relative(DATA_DIR, filePath).replace(/\\/g, '/')
    if (recentWrites.has(path.basename(filePath))) return
    const content = fs.readFileSync(filePath, 'utf-8')
    broadcast({ type: 'changed', name, content })
  })
  .on('unlink', (filePath) => {
    if (!filePath.endsWith('.md')) return
    const name = path.relative(DATA_DIR, filePath).replace(/\\/g, '/')
    if (recentWrites.has(path.basename(filePath))) return
    broadcast({ type: 'deleted', name })
  })

function safePath(name: string): string | null {
  if (!name || name.includes('..') || /[<>:"|?*]/.test(name)) return null
  if (!name.endsWith('.md')) name += '.md'
  return path.join(DATA_DIR, name)
}

function listMdFiles(): { name: string; lastModified: number }[] {
  return walkDir(DATA_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const rel = path.relative(DATA_DIR, f).replace(/\\/g, '/')
      const stat = fs.statSync(f)
      return { name: rel, lastModified: stat.mtimeMs }
    })
    .sort((a, b) => b.lastModified - a.lastModified)
}

function walkDir(dir: string): string[] {
  const results: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      results.push(...walkDir(full))
    } else if (entry.isFile()) {
      results.push(full)
    }
  }
  return results
}

async function attachFrontend() {
  if (IS_DEV) {
    const { createServer: createViteServer } = await import('vite')
    vite = await createViteServer({
      root: APP_DIR,
      appType: 'custom',
      server: {
        middlewareMode: true,
        hmr: { server },
      },
    })

    app.use(vite.middlewares)
    app.use(async (req, res, next) => {
      const url = req.originalUrl
      if (url.startsWith('/api/') || url === '/api' || url === WS_PATH) {
        next()
        return
      }

      try {
        let template = fs.readFileSync(INDEX_HTML_PATH, 'utf-8')
        template = await vite!.transformIndexHtml(url, template)
        res.status(200).setHeader('Content-Type', 'text/html')
        res.end(template)
      } catch (error) {
        vite!.ssrFixStacktrace(error as Error)
        next(error)
      }
    })
    return
  }

  app.use(express.static(DIST_DIR))
  app.get(/^(?!\/api(?:\/|$)|\/ws$).*/, (_req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'))
  })
}

async function start() {
  await attachFrontend()

  server.on('upgrade', (request, socket, head) => {
    const requestUrl = request.url ?? '/'
    const host = request.headers.host ?? `localhost:${PORT}`
    const pathname = new URL(requestUrl, `http://${host}`).pathname

    if (pathname !== WS_PATH) {
      return
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request)
    })
  })

  server.listen(PORT, () => {
    console.log(`\n  Inner running on http://localhost:${PORT}`)
    console.log(`    Mode:       ${MODE}`)
    console.log(`    API:        /api/files`)
    console.log(`    WebSocket:  ${WS_PATH}`)
    console.log(`    Data dir:   ${DATA_DIR}\n`)
  })

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n  Port ${PORT} is already in use.\n`)
      process.exit(1)
    }
    throw err
  })
}

start()
