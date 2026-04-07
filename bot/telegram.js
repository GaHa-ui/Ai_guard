const TelegramBot = require('node-telegram-bot-api');
const config = require('../config/config');

let bot = null;
let reports = [];
let stats = {
  totalChecks: 0,
  suspiciousCount: 0,
  banCount: 0
};

/**
 * Инициализация Telegram бота
 */
function initBot() {
  if (!config.telegram.token) {
    console.log('⚠️ Telegram токен не настроен');
    return null;
  }

  bot = new TelegramBot(config.telegram.token, { polling: true });
  
  bot.on('message', handleMessage);
  bot.on('callback_query', handleCallback);
  
  console.log('✅ Telegram бот инициализирован');
  return bot;
}

/**
 * Обработка текстовых сообщений
 */
async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const text = msg.text;

  // Команда /start - главное меню
  if (text === '/start' || text === '⬅️ Назад в меню') {
    await sendMainMenu(chatId);
    return;
  }

  // Статистика
  if (text === '📊 Статистика') {
    await sendStats(chatId);
    return;
  }

  // Репорты
  if (text === '🚨 Репорты') {
    await sendReports(chatId);
    return;
  }

  // Настройки
  if (text === '⚙️ Настройки') {
    await sendSettings(chatId);
    return;
  }
}

/**
 * Обработка callback запросов (кнопок)
 */
async function handleCallback(callback) {
  const chatId = callback.message.chat.id;
  const messageId = callback.message.message_id;
  const data = callback.data;

  await bot.answerCallbackQuery(callback.id);

  // Обработка действий с репортами
  if (data.startsWith('report_')) {
    const [, action, reportId] = data.split('_');
    await handleReportAction(chatId, action, reportId, messageId);
  }

  // Настройки
  if (data.startsWith('setting_')) {
    await handleSettingAction(chatId, data);
  }
}

/**
 * Обработка действий с репортами
 */
async function handleReportAction(chatId, action, reportId, messageId) {
  const report = reports.find(r => r.id === reportId);
  if (!report) {
    await bot.sendMessage(chatId, 'Репорт не найден');
    return;
  }

  if (action === 'ban') {
    // Баним игрока
    stats.banCount++;
    report.status = 'banned';
    await bot.editMessageText(
      `✅ Игрок ${report.playerName} ЗАБАНЕН`,
      { chat_id: chatId, message_id: messageId }
    );
    await bot.sendMessage(chatId, `🔨 Игрок ${report.playerName} забанен по решению администратора`);
  } else if (action === 'ignore') {
    // Игнорируем
    report.status = 'ignored';
    await bot.editMessageText(
      `❌ Репорт игнорирован`,
      { chat_id: chatId, message_id: messageId }
    );
  } else if (action === 'check') {
    // Детальная проверка
    await sendDetailedCheck(chatId, report);
  }
}

/**
 * Обработка настроек
 */
async function handleSettingAction(chatId, data) {
  const [, setting, value] = data.split('_');
  
  let message = '';
  switch (setting) {
    case 'ai':
      message = value === 'on' ? '✅ AI модерация ВКЛЮЧЕНА' : '❌ AI модерация ВЫКЛЮЧЕНА';
      break;
    case 'test':
      message = value === 'on' ? '✅ Тестовый режим ВКЛЮЧЕН' : '❌ Тестовый режим ВЫКЛЮЧЕН';
      break;
    case 'sensitivity':
      message = `⚙️ Уровень чувствительности установлен: ${value}`;
      break;
  }
  
  await bot.sendMessage(chatId, message);
  await sendSettings(chatId);
}

// === КЛАВИАТУРЫ ===

/**
 * Главное меню
 */
async function sendMainMenu(chatId) {
  const keyboard = {
    reply_markup: {
      keyboard: [
        ['📊 Статистика'],
        ['🚨 Репорты', '⚙️ Настройки']
      ],
      resize_keyboard: true
    }
  };

  await bot.sendMessage(
    chatId,
    '🛡️ <b>AI Guard - Система модерации</b>\n\nВыберите действие:',
    { parse_mode: 'HTML', reply_markup: keyboard.reply_markup }
  );
}

/**
 * Статистика
 */
async function sendStats(chatId) {
  const message = `📊 <b>Статистика системы</b>\n\n
├ Проверок: ${stats.totalChecks}
├ Подозрений: ${stats.suspiciousCount}
└ Банов: ${stats.banCount}`;

  const keyboard = {
    reply_markup: {
      keyboard: [['⬅️ Назад в меню']],
      resize_keyboard: true
    }
  };

  await bot.sendMessage(chatId, message, { parse_mode: 'HTML', reply_markup: keyboard.reply_markup });
}

/**
 * Репорты - список подозрительных игроков
 */
async function sendReports(chatId) {
  if (reports.length === 0) {
    await bot.sendMessage(chatId, '🚨 Нет активных репортов', {
      reply_markup: {
        keyboard: [['⬅️ Назад в меню']],
        resize_keyboard: true
      }
    });
    return;
  }

  for (const report of reports.slice(-5)) {
    if (report.status !== 'pending') continue;
    
    const inlineKeyboard = {
      inline_keyboard: [
        [
          { text: '✅ Забанить', callback_data: `report_ban_${report.id}` },
          { text: '❌ Игнорировать', callback_data: `report_ignore_${report.id}` }
        ],
        [
          { text: '🔍 Проверить', callback_data: `report_check_${report.id}` }
        ]
      ]
    };

    await bot.sendMessage(
      chatId,
      `🚨 <b>Репорт #${report.id}</b>\n\n` +
      `├ Игрок: <code>${report.playerName}</code>\n` +
      `├ Действие: ${report.action}\n` +
      `├ Причина: ${report.reason}\n` +
      `└ Уверенность: ${report.confidence}%`,
      { parse_mode: 'HTML', reply_markup: inlineKeyboard }
    );
  }

  const backKeyboard = {
    reply_markup: {
      keyboard: [['⬅️ Назад в меню']],
      resize_keyboard: true
    }
  };
  await bot.sendMessage(chatId, 'Выберите действие для репорта:', { reply_markup: backKeyboard.reply_markup });
}

/**
 * Детальная проверка игрока
 */
async function sendDetailedCheck(chatId, report) {
  const message = `🔍 <b>Детальная проверка</b>\n\n` +
    `Игрок: ${report.playerName}\n` +
    `Действие: ${report.action}\n` +
    `Причина: ${report.reason}\n` +
    `Вердикт: ${report.verdict}\n` +
    `Уверенность: ${report.confidence}%\n\n` +
    `Время: ${report.timestamp}\n` +
    `Позиция: ${report.position}`;

  await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
}

/**
 * Настройки
 */
async function sendSettings(chatId) {
  const inlineKeyboard = {
    inline_keyboard: [
      [
        { text: '🔴 AI ВЫКЛ', callback_data: 'setting_ai_off' },
        { text: '🟢 AI ВКЛ', callback_data: 'setting_ai_on' }
      ],
      [
        { text: '🔴 Тест ВЫКЛ', callback_data: 'setting_test_off' },
        { text: '🟢 Тест ВКЛ', callback_data: 'setting_test_on' }
      ],
      [
        { text: '📊 Низкая чувствительность', callback_data: 'setting_sensitivity_low' },
        { text: '📊 Средняя чувствительность', callback_data: 'setting_sensitivity_medium' },
        { text: '📊 Высокая чувствительность', callback_data: 'setting_sensitivity_high' }
      ]
    ]
  };

  await bot.sendMessage(
    chatId,
    '⚙️ <b>Настройки системы</b>\n\n' +
    'AI Модерация: ВКЛ\n' +
    'Тестовый режим: ВЫКЛ\n' +
    'Чувствительность: Средняя',
    { parse_mode: 'HTML', reply_markup: inlineKeyboard }
  );
}

// === ПУБЛИЧНЫЕ МЕТОДЫ ===

/**
 * Добавить новый репорт
 */
function addReport(report) {
  reports.unshift({
    id: Date.now().toString(),
    ...report,
    status: 'pending',
    timestamp: new Date().toISOString()
  });
  // Ограничим список 50 репортами
  if (reports.length > 50) reports.pop();
}

/**
 * Обновить статистику
 */
function updateStats(type) {
  stats.totalChecks++;
  if (type === 'suspicious') stats.suspiciousCount++;
}

/**
 * Получить бота
 */
function getBot() {
  return bot;
}

/**
 * Отправить уведомление в Telegram
 */
async function sendNotification(message) {
  if (!bot || !config.telegram.adminId) return;
  try {
    await bot.sendMessage(config.telegram.adminId, message, { parse_mode: 'HTML' });
  } catch (e) {
    console.log('Ошибка отправки уведомления:', e.message);
  }
}

module.exports = {
  initBot,
  getBot,
  addReport,
  updateStats,
  sendNotification,
  sendMainMenu,
  stats
};