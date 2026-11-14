import 'dotenv/config'
import express from 'express'
import helmet from 'helmet'
import { createServer } from 'node:http'
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Pool } from 'pg'

const scrypt = promisify(scryptCallback)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const dataDir = path.join(root, 'data')
const settingsPath = path.join(dataDir, 'settings.json')
const app = express()
const sessions = new Map()
const PORT = Number(process.env.PORT || 3001)
const databaseUrl = process.env.DATABASE_URL || ''
const pool = /^postgres(?:ql)?:\\/\\//i.test(databaseUrl) ? new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false }, max: 5 }) : null
const isProd = process.env.NODE_ENV === 'production'
if (isProd && (!process.env.ADMIN_PASSWORD || !process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) {
  throw new Error('Production requires ADMIN_PASSWORD and SESSION_SECRET (at least 32 characters).')
}
const allowedKeys = ['rateUsdtToUah','rateUahToUsdt','minimumUsdt','updatedAt','managerUrl','exchangeUrl','projectsUrl','heroTitle','heroText','aboutText','partnershipText','sections']

app.disable('x-powered-by')
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }))
app.use(express.json({ limit: '32kb' }))

async function readSettings() {
  if (pool) {
    const result = await pool.query('SELECT settings FROM soyer_app_settings WHERE id = 1')
    if (result.rows[0]?.settings) return result.rows[0].settings
  }
  return JSON.parse(await fs.readFile(settingsPath, 'utf8'))
}
async function writeSettings(settings) {
  if (pool) {
    await pool.query(
      'INSERT INTO soyer_app_settings (id, settings, updated_at) VALUES (1, $1::jsonb, NOW()) ON CONFLICT (id) DO UPDATE SET settings = EXCLUDED.settings, updated_at = NOW()',
      [JSON.stringify(settings)]
    )
  }
  await fs.mkdir(dataDir, { recursive: true })
  const temp = settingsPath + '.tmp'
  await fs.writeFile(temp, JSON.stringify(settings, null, 2), 'utf8')
  await fs.rename(temp, settingsPath)
}
async function initializeStorage() {
  if (!pool) {
    console.warn('DATABASE_URL is not configured; settings use local JSON storage.')
    return
  }
  await pool.query(`CREATE TABLE IF NOT EXISTS soyer_app_settings (
    id SMALLINT PRIMARY KEY CHECK (id = 1),
    settings JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`)
  const existing = await pool.query('SELECT id FROM soyer_app_settings WHERE id = 1')
  if (existing.rowCount === 0) {
    const initial = JSON.parse(await fs.readFile(settingsPath, 'utf8'))
    await pool.query('INSERT INTO soyer_app_settings (id, settings) VALUES (1, $1::jsonb)', [JSON.stringify(initial)])
  }
}
function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map(v => v.trim()).filter(Boolean).map(v => {
    const i = v.indexOf('='); return [v.slice(0, i), decodeURIComponent(v.slice(i + 1))]
  }))
}
function cookieOptions() {
  return `Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${isProd ? '; Secure' : ''}`
}
function sessionRequired(req, res, next) {
  const token = parseCookies(req.headers.cookie).soyer_admin
  const expiry = token && sessions.get(token)
  if (!expiry || expiry < Date.now()) {
    if (token) sessions.delete(token)
    return res.status(401).json({ error: 'Потрібна авторизація.' })
  }
  next()
}
function sameOrigin(req, res, next) {
  const origin = req.get('origin')
  const host = req.get('host')
  if (origin) {
    try { if (new URL(origin).host !== host) return res.status(403).json({ error: 'Недозволене джерело запиту.' }) }
    catch { return res.status(403).json({ error: 'Некоректне джерело запиту.' }) }
  }
  next()
}

app.get('/api/settings', async (_req, res) => {
  try { res.set('Cache-Control', 'no-store'); res.json(await readSettings()) }
  catch { res.status(500).json({ error: 'Не вдалося завантажити налаштування.' }) }
})

const loginAttempts = new Map()
app.post('/api/admin/login', sameOrigin, async (req, res) => {
  const ip = req.ip || 'unknown'
  const now = Date.now()
  const state = loginAttempts.get(ip) || { count: 0, reset: now + 10 * 60 * 1000 }
  if (state.reset < now) { state.count = 0; state.reset = now + 10 * 60 * 1000 }
  if (state.count >= 8) return res.status(429).json({ error: 'Забагато спроб. Спробуйте пізніше.' })
  state.count++
  loginAttempts.set(ip, state)
  const configured = process.env.ADMIN_PASSWORD
  if (!configured) return res.status(503).json({ error: 'Адміністратор не налаштований. Додайте ADMIN_PASSWORD у .env.' })
  const candidate = String(req.body?.password || '')
  const salt = process.env.SESSION_SECRET || 'local-development-only'
  const [expected, actual] = await Promise.all([scrypt(configured, salt, 64), scrypt(candidate, salt, 64)])
  if (!timingSafeEqual(expected, actual)) return res.status(401).json({ error: 'Неправильний пароль.' })
  loginAttempts.delete(ip)
  const token = randomBytes(32).toString('hex')
  sessions.set(token, now + 8 * 60 * 60 * 1000)
  res.setHeader('Set-Cookie', `soyer_admin=${token}; ${cookieOptions()}`)
  res.json({ ok: true })
})

app.post('/api/admin/logout', sameOrigin, sessionRequired, (req, res) => {
  const token = parseCookies(req.headers.cookie).soyer_admin
  sessions.delete(token)
  res.setHeader('Set-Cookie', `soyer_admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${isProd ? '; Secure' : ''}`)
  res.json({ ok: true })
})
app.get('/api/admin/me', sessionRequired, (_req, res) => res.json({ authenticated: true }))
app.put('/api/admin/settings', sameOrigin, sessionRequired, async (req, res) => {
  try {
    const current = await readSettings()
    const input = req.body || {}
    const next = { ...current }
    for (const key of allowedKeys) if (Object.hasOwn(input, key)) next[key] = input[key]
    for (const key of ['rateUsdtToUah', 'rateUahToUsdt', 'minimumUsdt']) {
      const n = Number(next[key])
      if (!Number.isFinite(n) || n <= 0 || n > 100000000) return res.status(400).json({ error: `Некоректне значення: ${key}` })
      next[key] = n
    }
    for (const key of ['updatedAt','managerUrl','exchangeUrl','projectsUrl','heroTitle','heroText','aboutText','partnershipText']) {
      if (typeof next[key] !== 'string' || next[key].length > 2000) return res.status(400).json({ error: `Некоректне поле: ${key}` })
    }
    for (const key of ['managerUrl','exchangeUrl','projectsUrl']) {
      const url = new URL(next[key])
      if (url.protocol !== 'https:' || !['t.me'].includes(url.hostname)) return res.status(400).json({ error: 'Дозволені лише HTTPS-посилання Telegram.' })
    }
    if (!next.sections || typeof next.sections !== 'object') return res.status(400).json({ error: 'Некоректні налаштування секцій.' })
    next.sections = { about: !!next.sections.about, partnership: !!next.sections.partnership, projects: !!next.sections.projects }
    await writeSettings(next)
    res.json({ ok: true, settings: next })
  } catch { res.status(400).json({ error: 'Не вдалося зберегти налаштування. Перевірте введені дані.' }) }
})

if (isProd) {
  app.use(express.static(path.join(root, 'dist'), { maxAge: '1h', index: false }))
  app.get('*', (_req, res) => res.sendFile(path.join(root, 'dist', 'index.html')))
}
app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: 'Внутрішня помилка сервера.' })
})
initializeStorage().then(() => {
  createServer(app).listen(PORT, () => console.log(`SOYER EXCHANGE API: http://localhost:${PORT}`))
}).catch(error => {
  console.error('Storage initialization failed:', error)
  process.exit(1)
})
