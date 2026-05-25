# 📬 Mail → Telegram Notification System
## Система сповіщень для служби безпеки магазинів

> **Для Claude Code** — повний промпт для розробки проекту

---

## 🎯 Опис проекту

Система яка:
1. Читає вхідні листи з поштової скриньки (IMAP polling)
2. Парсить тему та тіло листа та зображення/відео
3. Визначає, до якого магазину відноситься лист
4. Відправляє сповіщення у Telegram відповідним користувачам
5. Пріоритет — служба безпеки магазину (отримують першими)
6. Адмін-панель для управління користувачами та доступами

---

## 🏗️ Архітектура

```
mail-telegram-bot/
├── src/
│   ├── config/
│   │   └── index.ts              # env конфіг
│   ├── db/
│   │   ├── schema.sql            # SQL схема бази
│   │   ├── index.ts              # підключення до БД
│   │   └── migrations/           # міграції
│   ├── services/
│   │   ├── mail/
│   │   │   ├── imap.service.ts   # IMAP підключення та polling
│   │   │   └── parser.service.ts # парсинг листів
│   │   ├── telegram/
│   │   │   ├── bot.service.ts    # Telegram Bot API
│   │   │   └── templates.ts      # шаблони повідомлень
│   │   └── notification/
│   │       └── dispatcher.ts     # логіка розподілу сповіщень
│   ├── api/
│   │   ├── routes/
│   │   │   ├── users.ts          # CRUD користувачів
│   │   │   ├── stores.ts         # управління магазинами
│   │   │   └── auth.ts           # авторизація адміна
│   │   └── server.ts             # Express сервер
│   ├── web/
│   │   └── admin/                # HTML адмін-панель (Vanilla JS або React)
│   └── index.ts                  # точка входу
├── .env.example
├── .claudeignore                 # ⚠️ важливо — дивись нижче
├── docker-compose.yml
└── package.json
```

---

## 🗄️ База даних (PostgreSQL або SQLite)

### Таблиці:

```sql
-- Магазини
CREATE TABLE stores (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(20) UNIQUE NOT NULL,  -- ідентифікатор для парсингу листів
  address TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Користувачі
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  last_name VARCHAR(100) NOT NULL,        -- Прізвище
  first_name VARCHAR(100) NOT NULL,       -- Ім'я
  middle_name VARCHAR(100),               -- По батькові
  phone VARCHAR(20) NOT NULL,
  position VARCHAR(100) NOT NULL,         -- Посада
  store_id INT REFERENCES stores(id),
  telegram_chat_id BIGINT,               -- chat_id після /start у боті
  telegram_username VARCHAR(100),
  role VARCHAR(20) DEFAULT 'employee',   -- 'security' | 'employee' | 'admin'
  is_active BOOLEAN DEFAULT true,
  registration_token VARCHAR(64),        -- токен для реєстрації через бот
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Лог надісланих повідомлень
CREATE TABLE notification_log (
  id SERIAL PRIMARY KEY,
  mail_subject TEXT,
  mail_from VARCHAR(200),
  mail_received_at TIMESTAMP,
  store_id INT REFERENCES stores(id),
  users_notified INT[],                  -- масив user.id
  status VARCHAR(20) DEFAULT 'sent',
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## ⚙️ Технічний стек

- **Runtime**: Node.js 20+ з TypeScript
- **БД**: PostgreSQL (через `pg` або `drizzle-orm`) або SQLite (через `better-sqlite3`) — вибрати один
- **IMAP**: `imapflow` — сучасна бібліотека для IMAP
- **Парсинг листів**: `mailparser` — для розбору HTML/text листів
- **Telegram Bot**: `grammy` або `node-telegram-bot-api`
- **API сервер**: `fastify` або `express`
- **Валідація**: `zod`
- **Планувальник**: `node-cron` — для polling пошти кожні N секунд
- **Логування**: `pino`

---

## 🔔 Логіка розподілу сповіщень

```typescript
// Пріоритет відправки:
// 1. Служба безпеки магазину (role === 'security') — ПЕРШИМИ
// 2. Решта активних співробітників цього магазину

async function dispatchNotification(parsedMail, storeId) {
  const securityStaff = await getActiveUsers(storeId, role='security')
  const otherStaff = await getActiveUsers(storeId, role='employee')
  
  // Спочатку безпека
  await sendToAll(securityStaff, message)
  // Потім решта
  await sendToAll(otherStaff, message)
  
  await logNotification(...)
}
```

---

## 🤖 Telegram Bot — реєстрація користувачів

Нові користувачі реєструються через бот:

1. Адмін створює запис користувача в адмін-панелі → генерується унікальний `registration_token`
2. Користувач отримує посилання вигляду: `t.me/YOUR_BOT?start=TOKEN`
3. Бот при `/start TOKEN` прив'язує `telegram_chat_id` до запису
4. Після прив'язки — користувач активний і отримуватиме сповіщення

---

## 🖥️ Адмін-панель (Web UI)

### Сторінки:
- `/admin` — дашборд (статистика: скільки листів, скільки сповіщень)
- `/admin/users` — список користувачів з фільтром по магазину/ролі/статусу
- `/admin/users/new` — форма додавання нового користувача
- `/admin/users/:id` — редагування: зміна магазину, ролі, активності
- `/admin/stores` — управління магазинами
- `/admin/logs` — лог надісланих сповіщень

### Форма нового користувача (поля):
- Прізвище *
- Ім'я *
- По батькові
- Номер телефону *
- Посада *
- Магазин * (dropdown)
- Роль: Службіст безпеки / Співробітник
- Активний: так/ні

---

## 🌍 ENV змінні (.env.example)

```env
# Пошта (IMAP)
MAIL_HOST=imap.gmail.com
MAIL_PORT=993
MAIL_USER=your@email.com
MAIL_PASS=your_app_password
MAIL_POLL_INTERVAL_SEC=30   # як часто перевіряти пошту

# Telegram
TELEGRAM_BOT_TOKEN=your_bot_token

# База даних
DATABASE_URL=postgresql://user:pass@localhost:5432/mailbot
# або для SQLite:
# DATABASE_PATH=./data/mailbot.db

# API сервер
PORT=3000
ADMIN_PASSWORD=change_me_please

# Парсинг листів — ключові слова для визначення магазину
# Наприклад, якщо в темі листа є "Магазин №5" або "Store-005"
STORE_DETECTION_PATTERN=магазин|store|shop
```

---

## ⚠️ .claudeignore — ОБОВ'ЯЗКОВО НАЛАШТУЙ

```gitignore
# Не аналізувати для економії токенів:
node_modules/
dist/
build/
.git/
*.log
data/
coverage/
.nyc_output/
```

> **Порада**: Перед запуском `claude` у папці проекту переконайся, що `.claudeignore` існує і містить `node_modules/` та `dist/`. Це зекономить сотні токенів на кожному запиті.

---

## 📋 Задачі для Claude Code (в порядку виконання)

Використовуй цей список як `/todo` або просто давай Claude Code по одному блоку:

### Блок 1 — Ініціалізація
```
1. Створи структуру папок проекту згідно архітектури
2. Ініціалізуй package.json з TypeScript, налаштуй tsconfig.json
3. Створи .env.example і .claudeignore
4. Налаштуй підключення до БД і виконай schema.sql
```

### Блок 2 — IMAP сервіс
```
5. Реалізуй imap.service.ts — підключення, polling нових листів через imapflow
6. Реалізуй parser.service.ts — витягує тему, тіло (text+html), відправника, дату
7. Реалізуй логіку визначення магазину з тексту листа
```

### Блок 3 — Telegram Bot
```
8. Реалізуй bot.service.ts — ініціалізація grammy бота
9. Додай обробник /start TOKEN — прив'язка chat_id до користувача
10. Реалізуй функцію відправки повідомлення з форматуванням
```

### Блок 4 — Диспетчер
```
11. Реалізуй dispatcher.ts — отримує parsed mail, знаходить користувачів по магазину,
    спочатку відправляє службі безпеки, потім решті, логує результат
```

### Блок 5 — API та Адмін-панель
```
12. Реалізуй REST API: CRUD для users, stores, перегляд logs
13. Додай базову авторизацію адмін-панелі (логін/пароль з env)
14. Зроби HTML адмін-панель з формами управління користувачами
```

### Блок 6 — Фінал
```
15. Створи docker-compose.yml (app + postgres)
16. Напиши README.md з інструкцією запуску
17. Додай базові тести для parser та dispatcher
```

---

## 🚀 Запуск проекту

```bash
# Розробка
npm run dev

# Docker
docker-compose up -d

# Міграції
npm run db:migrate
```

---

*Згенеровано як архітектурний план. Адаптуй стек під свої потреби — наприклад, замість PostgreSQL можна використати SQLite для простішого деплою.*
