# SOYER EXCHANGE

Адаптивний інформаційний сайт SOYER EXCHANGE з калькулятором, Telegram-посиланнями та серверною адмінпанеллю.

## Що реалізовано

- Premium dark дизайн для ПК, планшетів і смартфонів.
- Анімований hero-блок, картки напрямків, блоки про команду та партнерство.
- Калькулятор USDT → UAH та UAH → USDT з мінімальною сумою.
- Курси, мінімальна сума, дата, тексти, посилання й видимість секцій керуються з `/admin`.
- Серверне збереження налаштувань у PostgreSQL (`DATABASE_URL`), із JSON-файлом як fallback для локального запуску.
- Захищена адмін-сесія: HttpOnly cookie, SameSite=Strict, серверна перевірка пароля через scrypt, обмеження спроб входу.
- Немає реального приймання платежів, криптогаманців, автоматичних переказів або фальшивих підтверджень транзакцій.

## Запуск у Windows (PowerShell)

1. Встановіть Node.js LTS (рекомендовано Node.js 20 або новіший).
2. Розпакуйте ZIP у зручну папку.
3. Відкрийте PowerShell у папці `soyer-exchange`.
4. Створіть локальний файл налаштувань:

```powershell
Copy-Item .env.example .env
notepad .env
```

5. У `.env` обов'язково встановіть власні секрети:

```env
ADMIN_PASSWORD=ваш-довгий-унікальний-пароль
SESSION_SECRET=вставте_випадковий_секрет_мінімум_32_символи
PORT=3001
NODE_ENV=development
```

Не публікуйте `.env` і не надсилайте його нікому. Файл уже доданий до `.gitignore`.

6. Встановіть залежності та запустіть сайт:

```powershell
npm install
npm run dev
```

7. Відкрийте у браузері:

- Сайт: http://localhost:5173
- Адмінпанель: http://localhost:5173/admin

У режимі розробки Vite запускає frontend, а Node.js API — на порту 3001.

## Production-збірка

```powershell
npm run build
$env:NODE_ENV="production"
npm start
```

Production-сервер віддає зібраний frontend і API з одного порту (за замовчуванням 3001). Для публічного розміщення використовуйте HTTPS через хостинг або reverse proxy. У production обов'язково задайте `ADMIN_PASSWORD` та `SESSION_SECRET` (не менше 32 символів). Для збереження курсу та текстів після перезапусків Render додайте `DATABASE_URL` з PostgreSQL (наприклад, Supabase або Render PostgreSQL).

## Де зберігаються дані

- PostgreSQL, таблиця `soyer_app_settings` — основне спільне сховище налаштувань, якщо задано `DATABASE_URL`.
- `data/settings.json` — локальне сховище та резервна копія; без `DATABASE_URL` використовується як fallback.
- `.env` — секрети сервера; не додається до Git.

Зробіть резервну копію бази PostgreSQL перед перенесенням сайту на інший сервер. Якщо використовується локальний fallback, зробіть резервну копію `data/settings.json`.

## Важливо перед публічним запуском

Це інформаційний сайт із переходом до менеджера, а не платіжний або кастодіальний сервіс. Калькулятор показує попередній арифметичний розрахунок. Не додавайте приймання коштів або обіцянки гарантованої безпеки без належної юридичної, фінансової та технічної перевірки. Перевірте законність діяльності, вимоги до ліцензування, KYC/AML, захисту даних і правила реклами у відповідних юрисдикціях до початку будь-яких реальних операцій.


## Green theme edition
The interface uses a premium emerald/black palette. To deploy this version, upload the updated project files to the same GitHub repository and redeploy on Render.

## Android SOYER ONE
The Android app connects to `https://soyer-exchange-api.onrender.com`. The same administrator password is used by the website and Android app. Settings are exposed through `/api/settings`; updates require the authenticated admin session. Android refreshes public settings every 60 seconds.
