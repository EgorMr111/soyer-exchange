import 'dotenv/config'
import express from 'express'
import helmet from 'helmet'
import { createServer } from 'node:http'
import { randomBytes, createHash, createHmac, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
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
const requestsPath = path.join(dataDir, 'requests.json')
const app = express()
const sessions = new Map()
const telegramSessions = new Map()
const PORT = Number(process.env.PORT || 3001)
const databaseUrl = process.env.DATABASE_URL || ''
const pool = (databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://')) ? new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false }, max: 5 }) : null
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
async function readRequests() {
  if (pool) {
    const result = await pool.query('SELECT id, telegram_user_id AS "telegramUserId", username, first_name AS "firstName", direction, amount_from AS "amountFrom", amount_to AS "amountTo", status, created_at AS "createdAt" FROM soyer_exchange_requests ORDER BY created_at DESC LIMIT 300')
    return result.rows
  }
  try { return JSON.parse(await fs.readFile(requestsPath, 'utf8')) } catch { return [] }
}
async function writeRequests(items) {
  await fs.mkdir(dataDir, { recursive: true })
  const temp = requestsPath + '.tmp'
  await fs.writeFile(temp, JSON.stringify(items, null, 2), 'utf8')
  await fs.rename(temp, requestsPath)
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
  await pool.query(`CREATE TABLE IF NOT EXISTS soyer_exchange_requests (
    id BIGSERIAL PRIMARY KEY,
    telegram_user_id TEXT NOT NULL,
    username TEXT NOT NULL DEFAULT '',
    first_name TEXT NOT NULL DEFAULT '',
    direction TEXT NOT NULL,
    amount_from NUMERIC(24,8) NOT NULL,
    amount_to NUMERIC(24,8) NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
function telegramAdminRequired(req, res, next) {
  const authorization = String(req.headers.authorization || '')
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  const session = token && telegramSessions.get(token)
  if (!session || session.expiresAt < Date.now()) return res.status(401).json({ error: 'Потрібно увійти через Telegram.' })
  const configuredAdmins = String(process.env.ADMIN_IDS || process.env.ADMIN_TELEGRAM_IDS || '').split(',').map(x => x.trim()).filter(Boolean)
  const allowed = new Set([...configuredAdmins, '1099861854', '8664825175'])
  if (!allowed.has(String(session.user.id))) return res.status(403).json({ error: 'Цей Telegram-акаунт не має прав адміністратора.' })
  req.telegramUser = session.user
  next()
}
function adminOrTelegramRequired(req, res, next) {
  const authorization = String(req.headers.authorization || '')
  const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  const adminToken = bearer || parseCookies(req.headers.cookie).soyer_admin
  const expiry = adminToken && sessions.get(adminToken)
  if (expiry && expiry >= Date.now()) return next()
  if (adminToken) sessions.delete(adminToken)
  return telegramAdminRequired(req, res, next)
}
function sessionRequired(req, res, next) {
  const authorization = String(req.headers.authorization || '')
  const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  const token = bearer || parseCookies(req.headers.cookie).soyer_admin
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


function telegramLoginHtml() {
  const username = String(process.env.TELEGRAM_BOT_USERNAME || '').replace(/^@/, '')
  if (!username) return '<!doctype html><meta charset="utf-8"><title>SOYER ONE</title><p>Telegram login is not configured. Set TELEGRAM_BOT_USERNAME in Render.</p>'
  return `<!doctype html>
<html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Вхід — SOYER ONE</title>
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#080a0f;color:#f5f7fb;font:16px Arial,sans-serif}
main{width:min(92%,420px);padding:30px;border:1px solid #29334a;border-radius:24px;background:#111722;text-align:center}
h1{margin:0 0 10px;font-size:25px}p{color:#8d98aa;line-height:1.5}.login{margin:28px auto 8px;display:flex;justify-content:center}
#error{color:#ff9a9a;font-size:13px}
</style></head><body><main><h1>SOYER ONE</h1><p>Увійдіть через Telegram, щоб продовжити.</p>
<div class="login"><script async src="https://telegram.org/js/telegram-widget.js?22" data-telegram-login="${username}" data-size="large" data-userpic="true" data-onauth="onTelegramAuth(user)"></script></div>
<p id="error"></p></main>
<script>
async function onTelegramAuth(user){
 const error=document.getElementById('error'); error.textContent='Перевіряємо акаунт…';
 try{
  const response=await fetch('/api/auth/telegram',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(user)});
  const data=await response.json();
  if(!response.ok) throw new Error(data.error||'Не вдалося увійти');
  if(window.SoyerTelegramBridge){window.SoyerTelegramBridge.onAuth(JSON.stringify(data));}
  else {error.textContent='Поверніться до застосунку SOYER ONE.';}
 }catch(e){error.textContent=e.message||'Помилка авторизації';}
}
</script></body></html>`
}

function verifyTelegramLogin(payload) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN || ''
  if (!botToken) return false
  const hash = String(payload?.hash || '')
  const authDate = Number(payload?.auth_date || 0)
  if (!/^[a-f0-9]{64}$/i.test(hash) || !Number.isFinite(authDate) || authDate > Math.floor(Date.now()/1000) + 30 || Date.now()/1000 - authDate > 300) return false
  const dataCheckString = Object.keys(payload).filter(key => key !== 'hash' && payload[key] !== undefined && payload[key] !== null)
    .sort().map(key => `${key}=${payload[key]}`).join('\n')
  const secret = createHash('sha256').update(botToken).digest()
  const expected = createHmac('sha256', secret).update(dataCheckString).digest()
  const supplied = Buffer.from(hash, 'hex')
  return supplied.length === expected.length && timingSafeEqual(supplied, expected)
}

function telegramSessionRequired(req, res, next) {
  const authorization = String(req.headers.authorization || '')
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  const session = token && telegramSessions.get(token)
  if (!session || session.expiresAt < Date.now()) {
    if (token) telegramSessions.delete(token)
    return res.status(401).json({ error: 'Потрібно увійти через Telegram.' })
  }
  req.telegramUser = session.user
  next()
}

app.get('/telegram-login', (_req, res) => {
  res.set('Cache-Control', 'no-store')
  res.type('html').send(telegramLoginHtml())
})
app.post('/api/auth/telegram', (req, res) => {
  if (!process.env.TELEGRAM_BOT_USERNAME || !process.env.TELEGRAM_BOT_TOKEN) {
    return res.status(503).json({ error: 'Telegram-авторизація ще не налаштована на сервері.' })
  }
  if (!verifyTelegramLogin(req.body)) return res.status(401).json({ error: 'Не вдалося підтвердити Telegram-акаунт. Спробуйте увійти ще раз.' })
  const user = {
    id: String(req.body.id || ''),
    firstName: String(req.body.first_name || ''),
    lastName: String(req.body.last_name || ''),
    username: String(req.body.username || ''),
    photoUrl: String(req.body.photo_url || '')
  }
  if (!user.id || !user.firstName) return res.status(400).json({ error: 'Telegram не повернув дані профілю.' })
  const token = randomBytes(32).toString('hex')
  telegramSessions.set(token, { user, expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 })
  res.json({ ok: true, token, user })
})
app.get('/api/auth/me', telegramSessionRequired, (req, res) => res.json({ authenticated: true, user: req.telegramUser }))
app.post('/api/requests', telegramSessionRequired, async (req, res) => {
  try {
    const direction = String(req.body?.direction || '')
    const amountFrom = Number(req.body?.amountFrom)
    const amountTo = Number(req.body?.amountTo)
    if (!['USDT_TO_UAH', 'UAH_TO_USDT'].includes(direction) || !Number.isFinite(amountFrom) || !Number.isFinite(amountTo) || amountFrom <= 0 || amountTo <= 0 || amountFrom > 1000000000 || amountTo > 1000000000) {
      return res.status(400).json({ error: 'Перевірте напрямок та суму обміну.' })
    }
    const user = req.telegramUser
    if (pool) {
      const result = await pool.query('INSERT INTO soyer_exchange_requests (telegram_user_id, username, first_name, direction, amount_from, amount_to) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, telegram_user_id AS "telegramUserId", username, first_name AS "firstName", direction, amount_from AS "amountFrom", amount_to AS "amountTo", status, created_at AS "createdAt"', [user.id, user.username || '', user.firstName || '', direction, amountFrom, amountTo])
      return res.status(201).json({ ok: true, request: result.rows[0] })
    }
    const items = await readRequests()
    const item = { id: Date.now(), telegramUserId: user.id, username: user.username || '', firstName: user.firstName || '', direction, amountFrom, amountTo, status: 'new', createdAt: new Date().toISOString() }
    items.unshift(item)
    await writeRequests(items.slice(0, 300))
    res.status(201).json({ ok: true, request: item })
  } catch (error) { console.error('Request creation failed:', error); res.status(500).json({ error: 'Не вдалося створити заявку.' }) }
})
app.post('/api/auth/logout', telegramSessionRequired, (req, res) => {
  const token = String(req.headers.authorization || '').slice(7).trim()
  telegramSessions.delete(token)
  res.json({ ok: true })
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
  res.json({ ok: true, token })
})

app.post('/api/admin/logout', sameOrigin, sessionRequired, (req, res) => {
  const token = parseCookies(req.headers.cookie).soyer_admin
  sessions.delete(token)
  res.setHeader('Set-Cookie', `soyer_admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${isProd ? '; Secure' : ''}`)
  res.json({ ok: true })
})
app.get('/api/admin/me', adminOrTelegramRequired, (_req, res) => res.json({ authenticated: true }))
app.get('/api/admin/requests', adminOrTelegramRequired, async (_req, res) => {
  try { res.set('Cache-Control', 'no-store'); res.json({ requests: await readRequests() }) }
  catch { res.status(500).json({ error: 'Не вдалося завантажити заявки.' }) }
})
app.patch('/api/admin/requests/:id', adminOrTelegramRequired, async (req, res) => {
  const id = String(req.params.id)
  const status = String(req.body?.status || '')
  if (!['new', 'processing', 'completed', 'cancelled'].includes(status)) return res.status(400).json({ error: 'Некоректний статус заявки.' })
  try {
    if (pool) {
      const result = await pool.query('UPDATE soyer_exchange_requests SET status = $1 WHERE id = $2 RETURNING id', [status, id])
      if (!result.rowCount) return res.status(404).json({ error: 'Заявку не знайдено.' })
    } else {
      const items = await readRequests()
      const item = items.find(x => String(x.id) === id)
      if (!item) return res.status(404).json({ error: 'Заявку не знайдено.' })
      item.status = status
      await writeRequests(items)
    }
    res.json({ ok: true, id, status })
  } catch { res.status(500).json({ error: 'Не вдалося оновити заявку.' }) }
})
app.put('/api/admin/settings', sameOrigin, adminOrTelegramRequired, async (req, res) => {
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
