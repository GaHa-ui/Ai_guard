require('dotenv').config();
const express = require('express');
const config = require('./config/config');
const telegramBot = require('./bot/telegram');
const apiRoutes = require('./server/routes/api');

const app = express();

// Middleware
app.use(express.json());

// Логирование запросов
app.use((req, res, next) => {
  console.log(`📝 ${req.method} ${req.path}`);
  next();
});

// API роуты
app.use('/api', apiRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Статические файлы (если нужно)
app.use(express.static('public'));

// Инициализация Telegram бота
telegramBot.initBot();

// Запуск сервера
app.listen(config.app.port, () => {
  console.log(`
╔═══════════════════════════════════════╗
║   🛡️ AI Guard - Система модерации     ║
║   =================================   ║
║   Сервер запущен на порту ${config.app.port}      ║
║   Режим: ${config.app.nodeEnv}                      ║
╚═══════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Выключение...');
  process.exit();
});