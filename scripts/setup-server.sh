#!/bin/bash
# =============================================================
# setup-server.sh — Перший запуск на сервері (Ubuntu/Debian)
# Запускати один раз від root або sudo-користувача
# =============================================================
set -e

echo "=================================================="
echo "  Mail → Telegram Bot — Налаштування сервера"
echo "=================================================="

# 1. Node.js 22 через NodeSource
echo ""
echo "1. Встановлення Node.js 22..."
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

node -v
npm -v

# 2. PM2
echo ""
echo "2. Встановлення PM2..."
npm install -g pm2

# 3. Папки проекту
echo ""
echo "3. Підготовка папок..."
mkdir -p /opt/mail-telegram-bot
cd /opt/mail-telegram-bot

echo ""
echo "==================================================="
echo "ГОТОВО! Тепер виконайте наступні кроки вручну:"
echo ""
echo "  1. Скопіюйте файли проекту в /opt/mail-telegram-bot/"
echo "     (або git clone)"
echo ""
echo "  2. Створіть .env файл:"
echo "     cp .env.example .env && nano .env"
echo ""
echo "  3. Встановіть залежності та збудуйте:"
echo "     npm ci --omit=dev"
echo "     npm run build"
echo ""
echo "  4. Запустіть через PM2:"
echo "     bash scripts/deploy.sh"
echo "==================================================="
