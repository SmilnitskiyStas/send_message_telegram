-- Магазини
CREATE TABLE IF NOT EXISTS stores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  address TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Користувачі
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  last_name TEXT NOT NULL,
  first_name TEXT NOT NULL,
  middle_name TEXT,
  phone TEXT NOT NULL,
  position TEXT NOT NULL,
  store_id INTEGER REFERENCES stores(id),
  telegram_chat_id INTEGER UNIQUE,
  telegram_username TEXT,
  role TEXT DEFAULT 'employee' CHECK(role IN ('security', 'employee', 'admin')),
  receive_all INTEGER DEFAULT 0,  -- 1 = отримує сповіщення з усіх магазинів
  is_active INTEGER DEFAULT 1,
  registration_token TEXT UNIQUE,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Лог надісланих повідомлень
CREATE TABLE IF NOT EXISTS notification_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mail_subject TEXT,
  mail_from TEXT,
  mail_received_at TEXT,
  store_id INTEGER REFERENCES stores(id),
  users_notified TEXT DEFAULT '[]',
  status TEXT DEFAULT 'sent',
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Деталізований лог по кожному відправленню
CREATE TABLE IF NOT EXISTS message_sends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  log_id INTEGER REFERENCES notification_log(id),
  user_id INTEGER REFERENCES users(id),
  user_full_name TEXT,
  chat_id INTEGER,
  role TEXT,
  store_name TEXT,
  status TEXT DEFAULT 'sent',
  error_message TEXT,
  sent_at TEXT DEFAULT (datetime('now'))
);

-- Адмін-сесії
CREATE TABLE IF NOT EXISTS admin_sessions (
  id TEXT PRIMARY KEY,
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

-- Тригер для updated_at
CREATE TRIGGER IF NOT EXISTS users_updated_at
  AFTER UPDATE ON users
BEGIN
  UPDATE users SET updated_at = datetime('now') WHERE id = NEW.id;
END;
