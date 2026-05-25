#!/bin/bash
# =============================================================
# deploy.sh — Деплой / оновлення на сервері
# Запускати кожен раз для оновлення
# =============================================================
set -e

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

echo "📦 Деплой mail-telegram-bot..."
echo "   Директорія: $APP_DIR"
echo ""

# 1. Встановлення залежностей (тільки production)
echo "1. npm ci..."
npm ci --omit=dev

# 2. Build TypeScript
echo ""
echo "2. npm run build..."
npm run build

# 3. Підготовка папок
mkdir -p data logs

# 4. PM2 — перезапуск або перший старт
echo ""
echo "3. Запуск PM2..."
if pm2 describe mail-telegram-bot > /dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs --env production
  echo "   ✅ Перезапущено (reload — без downtime)"
else
  pm2 start ecosystem.config.cjs --env production
  echo "   ✅ Запущено вперше"
fi

# 5. Зберегти список процесів PM2 (автозапуск після reboot)
pm2 save

echo ""
echo "====================================="
pm2 status mail-telegram-bot
echo "====================================="
echo ""
echo "📋 Корисні команди:"
echo "   pm2 logs mail-telegram-bot     # логи в реальному часі"
echo "   pm2 status                     # статус процесу"
echo "   pm2 reload mail-telegram-bot   # перезапуск без downtime"
echo "   pm2 stop mail-telegram-bot     # зупинити"
