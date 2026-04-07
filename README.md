# 🛡️ AI Guard - Minecraft модерация

AI-powered система модерации для Minecraft сервера (Purpur 1.21.x) с Telegram ботом.

## 📦 Компоненты

### Backend (Node.js)
- Telegram бот с меню управления
- AI анализ через OpenRouter
- REST API для Minecraft плагина

### Minecraft Плагин (Java/Spigot)
- Отслеживание игроков
- Детектирование читов
- Отправка данных в backend

## 🚀 Установка

### 1. Backend

```bash
cd ai-guard
npm install
# Отредактируй .env с твоими токенами
npm start
```

### 2. Minecraft Плагин

```bash
cd minecraft-plugin
./gradlew shadowJar
# Скопируй build/libs/Aiguard.jar в папку plugins твоего сервера
```

### 3. Конфигурация

В `minecraft-plugin/src/main/resources/config.yml`:
```yaml
api_url: "http://localhost:3000/api"
api_key: "your_mc_api_key_secret"
```

В `.env` backend:
```env
MC_API_KEY=your_mc_api_key_secret
```

## 📡 API Endpoints

- `POST /api/check` - проверка действия игрока
- `POST /api/ban` - бан игрока  
- `POST /api/webhook` - вебхук от плагина

## 🤖 Telegram Бот

- `/start` - главное меню
- 📊 Статистика
- 🚨 Репорты (Забанить/Игнорировать/Проверить)
- ⚙️ Настройки

## 🎯 Детектируемые нарушения

- Скорость (speed hack)
- Полёт (fly)
- Быстрый майнинг
- Килл аура
- Подозрительные команды