import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowDownUp, ArrowRight, ArrowUpRight, Home, Headphones, ShieldCheck, Wallet, Users, Handshake, Globe2, Zap, Menu, X, Send, RefreshCw, LockKeyhole, Settings2, CheckCircle2, CircleHelp, Coins, ChartNoAxesCombined, Copy, ExternalLink } from 'lucide-react'
import './style.css'

type TelegramUser = { id: number; first_name: string; username?: string; photo_url?: string }
declare global {
  interface Window {
    Telegram?: { WebApp?: {
      ready: () => void; expand: () => void; setHeaderColor?: (color: string) => void;
      setBackgroundColor?: (color: string) => void; disableVerticalSwipes?: () => void;
      initDataUnsafe?: { user?: TelegramUser }; platform?: string; version?: string;
    } }
  }
}

type Settings = {
  rateUsdtToUah: number; rateUahToUsdt: number; minimumUsdt: number; updatedAt: string;
  managerUrl: string; exchangeUrl: string; projectsUrl: string; heroTitle: string; heroText: string;
  aboutText: string; partnershipText: string; sections: { about: boolean; partnership: boolean; projects: boolean }
}
const defaults: Settings = {
  rateUsdtToUah: 46.6, rateUahToUsdt: 47.7, minimumUsdt: 10, updatedAt: '07.11.2026',
  managerUrl: 'https://t.me/soyermanager', exchangeUrl: 'https://t.me/soyerexchangecom/3', projectsUrl: 'https://t.me/soyer_pr',
  heroTitle: 'Обмін криптовалют без зайвих складнощів',
  heroText: 'SOYER EXCHANGE — зручний обмін USDT та гривні, прозорі умови й індивідуальний підхід до кожної угоди.',
  aboutText: '👋 Вітаємо! Ми — команда SOYER EXCHANGE, займаємося обміном криптовалют та допомагаємо проводити швидкі й зручні фінансові операції.',
  partnershipText: 'Ми зацікавлені у розвитку взаємовигідних партнерських відносин та відкриті до нових можливостей співпраці.',
  sections: { about: true, partnership: true, projects: true }
}
const money = (n: number, digits = 2) => new Intl.NumberFormat('uk-UA', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n)
const reveal = { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: { duration: .55 } } }

function App() {
  const [settings, setSettings] = useState<Settings>(defaults)
  const [loading, setLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [direction, setDirection] = useState<'sell' | 'buy'>('sell')
  const [amount, setAmount] = useState('100')
  const [receiveAmount, setReceiveAmount] = useState('4660.00')
  const [adminMode, setAdminMode] = useState(location.pathname.startsWith('/admin'))
  const [toast, setToast] = useState('')
  const [telegramUser, setTelegramUser] = useState<TelegramUser | null>(null)
  const [insideTelegram, setInsideTelegram] = useState(false)
  useEffect(() => {
    const tg = window.Telegram?.WebApp
    if (!tg) return
    tg.ready()
    tg.expand()
    tg.setHeaderColor?.('#07110d')
    tg.setBackgroundColor?.('#07110d')
    tg.disableVerticalSwipes?.()
    setTelegramUser(tg.initDataUnsafe?.user || null)
    setInsideTelegram(true)
    document.body.classList.add('telegram-mini-app')
    return () => document.body.classList.remove('telegram-mini-app')
  }, [])
  useEffect(() => {
    let active = true
    const refreshSettings = () => fetch('/api/settings', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Settings unavailable')))
      .then(data => {
        if (!active) return
        const next = { ...defaults, ...data, sections: { ...defaults.sections, ...data.sections } }
        setSettings(next)
        setReceiveAmount(current => current === '4660.00' ? (100 * next.rateUsdtToUah).toFixed(2) : current)
      })
      .catch(() => { if (active) setSettings(current => current || defaults) })
      .finally(() => { if (active) setLoading(false) })
    refreshSettings()
    const timer = window.setInterval(refreshSettings, 60_000)
    return () => { active = false; window.clearInterval(timer) }
  }, [])
  useEffect(() => { const onPop = () => setAdminMode(location.pathname.startsWith('/admin')); window.addEventListener('popstate', onPop); return () => window.removeEventListener('popstate', onPop) }, [])
  const numericAmount = Math.max(0, Number(amount.replace(',', '.')) || 0)
  const result = direction === 'sell' ? numericAmount * settings.rateUsdtToUah : numericAmount / settings.rateUahToUsdt
  const minOk = direction === 'sell' ? numericAmount >= settings.minimumUsdt : numericAmount >= settings.minimumUsdt * settings.rateUahToUsdt
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 2800) }
  const goAdmin = () => { history.pushState({}, '', '/admin'); setAdminMode(true); window.scrollTo(0, 0) }
  const goHome = () => { history.pushState({}, '', '/'); setAdminMode(false); window.scrollTo(0, 0) }
  if (adminMode) return <Admin settings={settings} onSave={s => { setSettings(s); notify('Налаштування збережено') }} onExit={goHome} />
  return <>
    <header className="header"><div className="container nav-wrap">
      <a className="brand" href="#home" onClick={() => setMenuOpen(false)}><span className="brand-mark"><span>S</span></span><span>SOYER <b>EXCHANGE</b></span></a>
      {insideTelegram && <div className="tg-user-chip">{telegramUser?.photo_url ? <img src={telegramUser.photo_url} alt="" /> : <span className="tg-avatar">{(telegramUser?.first_name || 'S').slice(0,1).toUpperCase()}</span>}<span>{telegramUser?.first_name || 'Telegram'}</span></div>}
      <button className="mobile-toggle" aria-label="Відкрити меню" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button>
      <nav className={menuOpen ? 'nav-links open' : 'nav-links'}>{[['Головна','#home'],['Обмін','#exchange'],['Курс','#rates'],['Про нас','#about'],['Партнерство','#partnership'],['Контакти','#contacts']].map(([label,href]) => <a key={href} href={href} onClick={() => setMenuOpen(false)}>{label}</a>)}</nav>
      <a className="button button-small" href={settings.managerUrl} target="_blank" rel="noreferrer">Обміняти <ArrowUpRight size={16}/></a>
    </div></header>
    <main>
      <section className="hero section" id="home"><div className="hero-grid"/><div className="container hero-inner">
        <motion.div className="hero-copy" initial="hidden" animate="show" variants={reveal}>
          <div className="eyebrow"><span className="live-dot"/> DIGITAL ASSET EXCHANGE <span className="eyebrow-line"/></div>
          <h1>{settings.heroTitle.split(' ').slice(0,2).join(' ')} <span>{settings.heroTitle.split(' ').slice(2).join(' ')}</span></h1>
          <p className="hero-lead">{settings.heroText}</p>
          <div className="hero-actions"><a className="button" href={settings.managerUrl} target="_blank" rel="noreferrer">Обміняти зараз <ArrowUpRight size={18}/></a><a className="button button-ghost" href="#rates">Переглянути курс <ArrowRight size={17}/></a></div>
          <div className="hero-proof"><div className="proof-icon"><ShieldCheck size={18}/></div><span>Умови кожної угоди погоджуються<br/>з менеджером заздалегідь</span></div>
        </motion.div>
        <motion.div className="hero-visual" initial={{ opacity: 0, scale: .88, rotate: -5 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={{ duration: .8, delay: .15 }}>
          <div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="coin-shadow"/><div className="coin"><div className="coin-inner"><span className="coin-symbol">₮</span><span className="coin-label">TETHER</span></div></div>
          <div className="float-card float-top"><span className="mini-icon green"><ArrowUpRight size={15}/></span><div><small>USDT / UAH</small><b>{money(settings.rateUsdtToUah)}</b></div><span className="tiny-live">LIVE*</span></div>
          <div className="float-card float-bottom"><span className="mini-icon blue"><RefreshCw size={15}/></span><div><small>Швидкий зв'язок</small><b>Telegram manager</b></div></div>
          <div className="visual-caption">SECURE · SIMPLE · CLEAR</div>
        </motion.div>
      </div><div className="container hero-bottom"><span>01 / 04</span><span className="hero-bottom-line"/><span>ПРОЗОРИЙ ПІДХІД ДО ОБМІНУ</span></div></section>

      <section className="stats-strip"><div className="container stats-grid"><div><span className="stat-icon"><Coins/></span><p><b>USDT</b><small>Цифровий актив</small></p></div><div><span className="stat-icon"><Wallet/></span><p><b>UAH</b><small>Українська гривня</small></p></div><div><span className="stat-icon"><ShieldCheck/></span><p><b>Прозорі умови</b><small>До підтвердження угоди</small></p></div><div><span className="stat-icon"><Send/></span><p><b>Telegram</b><small>Зв'язок із менеджером</small></p></div></div></section>

      <section className="section rates-section" id="rates"><div className="container"><div className="section-heading"><div><div className="eyebrow">MARKET INFORMATION</div><h2>Актуальний <span>курс</span></h2></div><p>Орієнтовні значення для розрахунку.<br/>Фінальні умови підтверджує менеджер.</p></div>
        <div className="rates-card"><div className="rates-top"><div><span className="card-kicker">SOYER EXCHANGE / RATE BOARD</span><h3>Курс обміну</h3></div><span className="rate-date"><span className="live-dot"/> Оновлено: {settings.updatedAt}</span></div>
          <div className="rate-values"><div className="rate-value"><span className="rate-direction">USDT <ArrowRight size={15}/> UAH</span><strong>{money(settings.rateUsdtToUah)}</strong><small>UAH за 1 USDT</small></div><div className="rate-divider"><ArrowDownUp size={19}/></div><div className="rate-value"><span className="rate-direction">UAH <ArrowRight size={15}/> USDT</span><strong>{money(settings.rateUahToUsdt)}</strong><small>UAH за 1 USDT</small></div></div>
          <div className="rate-footer"><span><span className="note-dot"/> Мінімальна сума: <b>{money(settings.minimumUsdt, 0)} USDT</b></span><a href={settings.exchangeUrl} target="_blank" rel="noreferrer">Перевірити актуальний курс <ArrowUpRight size={16}/></a></div>
        </div>
      </div></section>

      <section className="section calculator-section" id="exchange"><div className="container calculator-layout"><div className="calculator-copy"><div className="eyebrow">EXCHANGE CALCULATOR</div><h2>Розрахуйте свій <span>обмін</span></h2><p>Оберіть напрямок і введіть суму — калькулятор покаже орієнтовний результат за вказаним курсом.</p><div className="calc-note"><CircleHelp size={18}/><span>Розрахунок є попереднім. Остаточний курс, доступність та умови погоджуються з менеджером.</span></div></div>
        <div className="calculator"><div className="calc-head"><span>КАЛЬКУЛЯТОР</span><span className="calc-secure"><ShieldCheck size={14}/> PREVIEW</span></div><div className="direction-switch"><button className={direction==='sell'?'active':''} onClick={() => {setDirection('sell');setAmount('100');setReceiveAmount((100 * settings.rateUsdtToUah).toFixed(2))}}>USDT <ArrowRight size={14}/> UAH</button><button className={direction==='buy'?'active':''} onClick={() => {setDirection('buy');setAmount('4770');setReceiveAmount((4770 / settings.rateUahToUsdt).toFixed(2))}}>UAH <ArrowRight size={14}/> USDT</button></div>
          <label className="amount-label">ВИ ВІДДАЄТЕ</label><div className="amount-input"><input value={amount} onChange={e => { const v = e.target.value.replace(/[^0-9.,]/g,''); setAmount(v); const n = Number(v.replace(',', '.')); setReceiveAmount(v === '' ? '' : (direction === 'sell' ? n * settings.rateUsdtToUah : n / settings.rateUahToUsdt).toFixed(2)) }} inputMode="decimal" aria-label="Сума, яку ви віддаєте"/><span className="currency-pill">{direction==='sell'?'USDT':'UAH'}</span></div>
          <div className="calc-middle"><span><ArrowDownUp size={17}/></span><small>КУРС: 1 USDT = {money(direction==='sell'?settings.rateUsdtToUah:settings.rateUahToUsdt)} UAH</small></div>
          <label className="amount-label">ВИ ОТРИМАЄТЕ <span>ОРІЄНТОВНО</span></label><div className="amount-output"><input className="amount-output-input" value={receiveAmount} onChange={e => { const v = e.target.value.replace(/[^0-9.,]/g,''); setReceiveAmount(v); const n = Number(v.replace(',', '.')); setAmount(v === '' ? '' : (direction === 'sell' ? n / settings.rateUsdtToUah : n * settings.rateUahToUsdt).toString()) }} inputMode="decimal" aria-label="Сума, яку ви отримаєте"/><span className="currency-pill">{direction==='sell'?'UAH':'USDT'}</span></div>
          {!minOk && numericAmount > 0 && <div className="validation"><CircleHelp size={14}/> Мінімальна сума для цього напрямку: {direction==='sell'?`${money(settings.minimumUsdt,0)} USDT`:`${money(settings.minimumUsdt*settings.rateUahToUsdt,0)} UAH`}</div>}
          <a className={`button calc-button ${(!minOk || numericAmount<=0)?'disabled':''}`} href={settings.managerUrl} target="_blank" rel="noreferrer" onClick={e => {if(!minOk || numericAmount<=0){e.preventDefault();notify('Введіть суму не меншу за мінімальну')}}}>Продовжити в Telegram <ArrowUpRight size={17}/></a>
          <p className="calc-foot">Без автоматичного списання коштів чи створення транзакцій.</p>
        </div>
      </div></section>

      {settings.sections.about && <section className="section about-section" id="about"><div className="container"><div className="section-heading"><div><div className="eyebrow">ABOUT OUR TEAM</div><h2>Хто <span>ми?</span></h2></div><span className="section-index">01 — ABOUT</span></div><div className="about-grid"><div className="about-art"><div className="art-grid"/><div className="art-ring ring-a"/><div className="art-ring ring-b"/><div className="art-core"><span>₮</span><small>SOYER</small></div><div className="art-tag"><span className="live-dot"/> DIGITAL FINANCE</div></div><div className="about-content"><p className="about-intro">{settings.aboutText}</p><div className="why-title">ЧОМУ САМЕ МИ?</div><div className="feature-list"><Feature number="01" title="Зручність" text="Відправляємо та отримуємо USDT через будь-які блокчейн-мережі або UID бірж." icon={<Zap/>}/><Feature number="02" title="Особисті рахунки" text="Перекази проводяться з особистих рахунків команди після погодження деталей." icon={<Wallet/>}/><Feature number="03" title="Прозорі умови" text="Погоджуємо курс і всі умови перед кожною угодою." icon={<ShieldCheck/>}/><Feature number="04" title="Гнучкість" text="Можливість проведення угод через P2P на різних біржах за попереднім погодженням." icon={<RefreshCw/>}/></div><div className="trust-note"><ShieldCheck size={21}/><p>Ми цінуємо довіру кожного клієнта та прагнемо забезпечити прозорість на кожному етапі обговорення обміну.</p></div></div></div></div></section>}

      <section className="section directions-section"><div className="container"><div className="section-heading"><div><div className="eyebrow">AVAILABLE DIRECTIONS</div><h2>Напрямки <span>обміну</span></h2></div><p>Оберіть потрібний напрямок<br/>і зв'яжіться з менеджером.</p></div><div className="direction-cards"><DirectionCard title="USDT" subtitle="Українська гривня" desc="Обмін Tether на українську гривню." rate={money(settings.rateUsdtToUah)} url={settings.managerUrl} type="sell"/><DirectionCard title="UAH" subtitle="Tether (USDT)" desc="Обмін української гривні на Tether." rate={money(settings.rateUahToUsdt)} url={settings.managerUrl} type="buy"/></div></div></section>

      {settings.sections.partnership && <section className="section partnership-section" id="partnership"><div className="container"><div className="partner-banner"><div className="partner-glow"/><div className="partner-copy"><div className="eyebrow">LET'S BUILD TOGETHER</div><h2>Партнерство з<br/><span>SOYER EXCHANGE</span></h2><p className="partner-lead">Відкриті до співпраці та нових партнерств.</p><p>{settings.partnershipText}</p><div className="partner-points"><span><CheckCircle2/> Індивідуальні умови</span><span><CheckCircle2/> Взаємовигідна співпраця</span><span><CheckCircle2/> Довгострокові відносини</span></div><a className="button" href={settings.managerUrl} target="_blank" rel="noreferrer">Стати партнером <ArrowUpRight size={18}/></a><small>Обговоримо вашу пропозицію індивідуально.</small></div><div className="partner-art"><div className="partner-orbit orbit-p1"/><div className="partner-orbit orbit-p2"/><div className="handshake"><Handshake size={104} strokeWidth={1.15}/></div><div className="partner-art-label">PARTNERSHIP<br/><b>NETWORK</b></div><div className="partner-chip"><Globe2 size={15}/> CONNECT</div></div></div>
        <div className="partner-details"><div><div className="eyebrow">WHO WE WORK WITH</div><h3>Відкриті до нових<br/>можливостей</h3></div><div className="partner-categories"><PartnerItem n="01" title="Криптовалютні обмінники" text="Відкриті до співпраці з іншими сервісами обміну криптовалют."/><PartnerItem n="02" title="Власники Telegram-каналів" text="Зацікавлені у співпраці з власниками криптовалютних каналів та спільнот."/><PartnerItem n="03" title="Реферальні команди та посередники" text="Розглядаємо партнерства з реферальними командами та посередниками."/></div></div>
      </div></section>}

      {settings.sections.projects && <section className="section projects-section" id="contacts"><div className="container"><div className="section-heading"><div><div className="eyebrow">STAY CONNECTED</div><h2>Ми в <span>Telegram</span></h2></div><p>Зв'язок, інформація про обмін<br/>та наші проєкти.</p></div><div className="project-cards"><ProjectCard title="SOYER MANAGER" desc="Для обміну та партнерства." url={settings.managerUrl} tag="CONTACT"/><ProjectCard title="SOYER EXCHANGE" desc="Актуальний курс та інформація про обмін." url={settings.exchangeUrl} tag="EXCHANGE"/><ProjectCard title="SOYER PROJECTS" desc="Наші проєкти та новини." url={settings.projectsUrl} tag="COMMUNITY"/></div></div></section>}
    </main>
    <footer className="footer"><div className="container"><div className="footer-main"><div><a className="brand" href="#home"><span className="brand-mark"><span>S</span></span><span>SOYER <b>EXCHANGE</b></span></a><p>Сучасний підхід до обміну криптовалют.</p></div><div className="footer-nav"><b>НАВІГАЦІЯ</b><a href="#home">Головна</a><a href="#exchange">Обмін</a><a href="#rates">Курс</a><a href="#about">Про нас</a><a href="#partnership">Партнерство</a></div><div className="footer-nav"><b>TELEGRAM</b><a href={settings.managerUrl} target="_blank" rel="noreferrer">@soyermanager <ExternalLink size={12}/></a><a href={settings.projectsUrl} target="_blank" rel="noreferrer">@soyer_pr <ExternalLink size={12}/></a><a href={settings.exchangeUrl} target="_blank" rel="noreferrer">@soyerexchangecom <ExternalLink size={12}/></a></div></div><div className="footer-bottom"><span>© 2026 SOYER EXCHANGE. Усі права захищені.</span><span>Інформацію оновлено: {settings.updatedAt}</span><button onClick={goAdmin}><LockKeyhole size={12}/> ADMIN</button></div><p className="disclaimer">Інформація на сайті має ознайомчий характер і не є публічною офертою, фінансовою чи інвестиційною рекомендацією. Калькулятор показує лише попередній розрахунок. Перевіряйте реквізити та умови безпосередньо з менеджером.</p></div></footer>
    <AnimatePresence>{toast && <motion.div className="toast" initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} exit={{opacity:0,y:10}}>{toast}</motion.div>}</AnimatePresence>
    {loading && <div className="loading-line"/>}
    {insideTelegram && <nav className="tg-bottom-nav" aria-label="Навігація Mini App">
      <a href="#home"><Home size={18}/><span>Головна</span></a>
      <a href="#exchange"><ArrowDownUp size={18}/><span>Калькулятор</span></a>
      <a href="#rates"><Coins size={18}/><span>Курс</span></a>
      <a href={settings.managerUrl} target="_blank" rel="noreferrer"><Headphones size={18}/><span>Менеджер</span></a>
    </nav>}
  </>
}
function Feature({number,title,text,icon}:{number:string,title:string,text:string,icon:React.ReactNode}) { return <div className="feature"><span className="feature-number">{number}</span><span className="feature-icon">{icon}</span><div><b>{title}</b><p>{text}</p></div></div> }
function DirectionCard({title,subtitle,desc,rate,url,type}:{title:string,subtitle:string,desc:string,rate:string,url:string,type:string}) { return <div className="direction-card"><div className="direction-card-top"><span className="token-icon">{type==='sell'?'₮':'₴'}</span><span className="direction-tag">{type==='sell'?'SELL USDT':'BUY USDT'}</span></div><h3>{title} <ArrowRight size={21}/> <span>{subtitle}</span></h3><p>{desc}</p><div className="direction-rate"><small>ОРІЄНТОВНИЙ КУРС</small><b>{rate}</b></div><a href={url} target="_blank" rel="noreferrer">Обміняти <ArrowUpRight size={16}/></a></div> }
function PartnerItem({n,title,text}:{n:string,title:string,text:string}) { return <div className="partner-item"><span>{n}</span><div><b>{title}</b><p>{text}</p></div><ArrowUpRight size={17}/></div> }
function ProjectCard({title,desc,url,tag}:{title:string,desc:string,url:string,tag:string}) { return <a className="project-card" href={url} target="_blank" rel="noreferrer"><div className="project-card-top"><span className="project-icon"><Send size={20}/></span><span>{tag}</span></div><h3>{title}</h3><p>{desc}</p><div className="project-link">Відкрити Telegram <ArrowUpRight size={16}/></div></a> }

function Admin({settings,onSave,onExit}:{settings:Settings,onSave:(s:Settings)=>void,onExit:()=>void}) {
  const [authenticated,setAuthenticated] = useState(false)
  const [password,setPassword] = useState('')
  const [form,setForm] = useState<Settings>(settings)
  const [error,setError] = useState('')
  const [busy,setBusy] = useState(false)
  const [saved,setSaved] = useState(false)
  useEffect(()=>{fetch('/api/admin/me').then(r=>{if(r.ok)setAuthenticated(true)}).catch(()=>{})},[])
  const update = (key:keyof Settings,value:any) => setForm(f=>({...f,[key]:value}))
  const login = async (e:React.FormEvent) => {e.preventDefault();setBusy(true);setError('');try{const r=await fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Не вдалося увійти');setAuthenticated(true);setPassword('')}catch(e:any){setError(e.message)}finally{setBusy(false)}}
  const save = async () => {setBusy(true);setError('');try{const r=await fetch('/api/admin/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)});const d=await r.json();if(!r.ok)throw new Error(d.error||'Помилка збереження');onSave(d.settings);setSaved(true);setTimeout(()=>setSaved(false),2500)}catch(e:any){setError(e.message)}finally{setBusy(false)}}
  const logout = async()=>{await fetch('/api/admin/logout',{method:'POST'}).catch(()=>{});setAuthenticated(false);onExit()}
  if(!authenticated) return <div className="admin-shell"><div className="admin-login"><a className="brand" href="#" onClick={e=>{e.preventDefault();onExit()}}><span className="brand-mark"><span>S</span></span><span>SOYER <b>EXCHANGE</b></span></a><div className="admin-lock"><LockKeyhole size={25}/></div><h1>Адміністративна<br/><span>панель</span></h1><p>Увійдіть, щоб керувати налаштуваннями сайту.</p><form onSubmit={login}><label>ПАРОЛЬ АДМІНІСТРАТОРА</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" placeholder="Введіть пароль" required/><button className="button" disabled={busy}>{busy?'Перевірка...':'Увійти'} <ArrowRight size={17}/></button></form>{error&&<div className="admin-error">{error}</div>}<button className="back-link" onClick={onExit}>← Повернутися на сайт</button></div></div>
  return <div className="admin-shell"><div className="admin-wrap"><div className="admin-top"><a className="brand" href="#" onClick={e=>{e.preventDefault();onExit()}}><span className="brand-mark"><span>S</span></span><span>SOYER <b>EXCHANGE</b></span></a><div><span className="admin-status"><span className="live-dot"/> ADMIN SESSION</span><button className="admin-logout" onClick={logout}>Вийти</button></div></div><div className="admin-title"><div><div className="eyebrow">CONTROL CENTER</div><h1>Налаштування <span>сайту</span></h1><p>Зміни зберігаються на сервері та одразу відображаються на головній сторінці.</p></div><span className="admin-title-icon"><Settings2 size={28}/></span></div>
    <div className="admin-grid"><div className="admin-panel"><h3><ChartNoAxesCombined/> Курс та обмеження</h3><div className="admin-fields two"><Field label="USDT → UAH" value={form.rateUsdtToUah} type="number" onChange={v=>update('rateUsdtToUah',Number(v))}/><Field label="UAH → USDT" value={form.rateUahToUsdt} type="number" onChange={v=>update('rateUahToUsdt',Number(v))}/><Field label="Мінімальна сума (USDT)" value={form.minimumUsdt} type="number" onChange={v=>update('minimumUsdt',Number(v))}/><Field label="Дата оновлення" value={form.updatedAt} onChange={v=>update('updatedAt',v)}/></div></div>
    <div className="admin-panel"><h3><Send/> Telegram-посилання</h3><div className="admin-fields"><Field label="Менеджер" value={form.managerUrl} onChange={v=>update('managerUrl',v)}/><Field label="Канал обміну" value={form.exchangeUrl} onChange={v=>update('exchangeUrl',v)}/><Field label="Проєкти" value={form.projectsUrl} onChange={v=>update('projectsUrl',v)}/></div></div>
    <div className="admin-panel"><h3><Globe2/> Головний екран</h3><div className="admin-fields"><Field label="Заголовок" value={form.heroTitle} onChange={v=>update('heroTitle',v)}/><Field label="Підзаголовок" value={form.heroText} onChange={v=>update('heroText',v)} area/></div></div>
    <div className="admin-panel"><h3><Users/> Інформаційні розділи</h3><div className="admin-fields"><Field label="Текст «Хто ми?»" value={form.aboutText} onChange={v=>update('aboutText',v)} area/><Field label="Текст партнерства" value={form.partnershipText} onChange={v=>update('partnershipText',v)} area/></div></div>
    <div className="admin-panel full"><h3><Settings2/> Видимість секцій</h3><div className="admin-toggles">{([['about','Про нас'],['partnership','Партнерство'],['projects','Telegram та проєкти']] as const).map(([key,label])=><label key={key} className="toggle-row"><span>{label}</span><input type="checkbox" checked={form.sections[key]} onChange={e=>update('sections',{...form.sections,[key]:e.target.checked})}/><i/></label>)}</div></div></div>
    {error&&<div className="admin-error">{error}</div>}<div className="admin-savebar"><span>Перед збереженням перевірте правильність курсу та посилань.</span><button className="button" onClick={save} disabled={busy}>{saved?<><CheckCircle2 size={17}/> Збережено</>:busy?'Збереження...':'Зберегти зміни'} {!saved&&<ArrowRight size={17}/>}</button></div><button className="back-link" onClick={onExit}>← Переглянути сайт</button></div></div>
}
function Field({label,value,onChange,type='text',area=false}:{label:string,value:string|number,onChange:(v:string)=>void,type?:string,area?:boolean}) { return <label className="admin-field"><span>{label}</span>{area?<textarea value={value} onChange={e=>onChange(e.target.value)} rows={3}/>:<input type={type} step={type==='number'?'0.01':undefined} value={value} onChange={e=>onChange(e.target.value)}/>}</label> }

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>)
