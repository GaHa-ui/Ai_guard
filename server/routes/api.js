const express = require('express');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const config = require('../../config/config');
const aiService = require('../../services/aiService');
const telegramBot = require('../../bot/telegram');

const router = express.Router();

// In-memory хранилище (в реальном проекте использовать БД)
const players = new Map();
const logs = [];

/**
 * POST /api/check - проверка действия игрока
 */
router.post('/check', async (req, res) => {
  try {
    const { playerName, action, position, speed, blockBreakRate, distance, timestamp } = req.body;

    if (!playerName || !action) {
      return res.status(400).json({ error: 'Отсутствуют обязательные поля' });
    }

    // Проверка API ключа
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== config.mcServer.apiKey) {
      return res.status(401).json({ error: 'Неверный API ключ' });
    }

    // Сохраняем данные игрока
    if (!players.has(playerName)) {
      players.set(playerName, { actions: [], stats: { checks: 0, suspicious: 0, banned: false } });
    }
    
    const player = players.get(playerName);
    player.actions.push({ action, position, speed, blockBreakRate, distance, timestamp });
    player.stats.checks++;

    // Отправляем в AI анализ
    const aiResult = await aiService.analyzePlayerAction({
      playerName,
      action,
      position,
      speed,
      blockBreakRate,
      distance,
      timestamp
    });

    // Логируем
    const logEntry = {
      id: uuidv4(),
      playerName,
      action,
      aiResult,
      timestamp: new Date().toISOString()
    };
    logs.unshift(logEntry);
    if (logs.length > 1000) logs.pop();

    // Обновляем статистику
    telegramBot.updateStats(aiResult.verdict === 'suspicious' ? 'suspicious' : 'normal');

    // Если подозрительно - создаем репорт и отправляем уведомление
    if (aiResult.verdict === 'suspicious' && aiResult.action !== 'none') {
      const report = {
        playerName,
        action,
        reason: aiResult.reason,
        confidence: aiResult.confidence,
        verdict: aiResult.verdict,
        position: position ? `${position.x}, ${position.y}, ${position.z}` : 'N/A'
      };
      
      telegramBot.addReport(report);
      
      await telegramBot.sendNotification(
        `🚨 <b>Подозрительная активность</b>\n\n` +
        `Игрок: <code>${playerName}</code>\n` +
        `Действие: ${action}\n` +
        `Причина: ${aiResult.reason}\n` +
        `Уверенность: ${aiResult.confidence}%`
      );
    }

    res.json({
      success: true,
      playerName,
      verdict: aiResult.verdict,
      confidence: aiResult.confidence,
      action: aiResult.action,
      reason: aiResult.reason
    });

  } catch (error) {
    console.error('Ошибка проверки:', error.message);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * POST /api/ban - бан игрока на сервере
 */
router.post('/ban', async (req, res) => {
  try {
    const { playerName, reason, duration, admin } = req.body;

    if (!playerName) {
      return res.status(400).json({ error: 'Отсутствует имя игрока' });
    }

    // Проверка API ключа
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== config.mcServer.apiKey) {
      return res.status(401).json({ error: 'Неверный API ключ' });
    }

    // Отправляем команду на Minecraft сервер
    if (config.mcServer.url) {
      try {
        await axios.post(`${config.mcServer.url}/api/ban`, {
          player: playerName,
          reason: reason || 'AI Moderation',
          duration: duration || 'permanent',
          admin: admin || 'AI_System'
        });
      } catch (e) {
        console.log('Не удалось связаться с MC сервером:', e.message);
      }
    }

    // Обновляем статус игрока
    if (players.has(playerName)) {
      const player = players.get(playerName);
      player.stats.banned = true;
    }

    await telegramBot.sendNotification(
      `🔨 <b>Игрок забанен</b>\n\n` +
      `Игрок: <code>${playerName}</code>\n` +
      `Причина: ${reason || 'AI Moderation'}\n` +
      `Админ: ${admin || 'Система'}`
    );

    res.json({ success: true, message: `Игрок ${playerName} забанен` });

  } catch (error) {
    console.error('Ошибка бана:', error.message);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

/**
 * GET /api/players/:name - информация об игроке
 */
router.get('/players/:name', (req, res) => {
  const { name } = req.params;
  const player = players.get(name);
  
  if (!player) {
    return res.status(404).json({ error: 'Игрок не найден' });
  }

  res.json({
    name,
    stats: player.stats,
    recentActions: player.actions.slice(-10)
  });
});

/**
 * GET /api/logs - история проверок
 */
router.get('/logs', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json(logs.slice(0, limit));
});

/**
 * GET /api/stats - общая статистика
 */
router.get('/stats', (req, res) => {
  res.json({
    totalPlayers: players.size,
    totalChecks: logs.length,
    suspiciousCount: logs.filter(l => l.aiResult?.verdict === 'suspicious').length,
    ...telegramBot.stats
  });
});

/**
 * POST /api/webhook - вебхук от Minecraft плагина
 */
router.post('/webhook', async (req, res) => {
  try {
    const { event, player, data } = req.body;

    // Проверка API ключа
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== config.mcServer.apiKey) {
      return res.status(401).json({ error: 'Неверный API ключ' });
    }

    console.log(`📡 Получен вебхук: ${event} от ${player}`);

    // Обработка различных событий
    switch (event) {
      case 'player_action':
        // Уже обрабатывается в /check
        break;
      case 'player_join':
        await telegramBot.sendNotification(`👤 Игрок <code>${player}</code> присоединился к серверу`);
        break;
      case 'player_quit':
        await telegramBot.sendNotification(`👋 Игрок <code>${player}</code> покинул сервер`);
        break;
      case 'death':
        await telegramBot.sendNotification(`💀 Игрок <code>${player}</code> погиб: ${data?.cause || 'unknown'}`);
        break;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Ошибка вебхука:', error.message);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

module.exports = router;