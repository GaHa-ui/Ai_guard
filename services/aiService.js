const axios = require('axios');
const config = require('../config/config');

/**
 * AI Service - анализ подозрительной активности через OpenRouter
 * Использует только бесплатные модели (free-tier)
 */

const FREE_MODELS = [
  'meta-llama/llama-3.1-8b-instruct:free',
  'google/gemma-2-9b-it:free',
  'mistralai/mistral-7b-instruct:free'
];

const SYSTEM_PROMPT = `Ты - AI модератор для Minecraft сервера.
Проанализируй действие игрока и определи, является ли оно подозрительным.

Подозрительные действия:
- Слишком быстрый майнинг (более 20 блоков в секунду)
- Полёт (fly) - игрок в воздухе без разрешённых плагинов
- Неестественное движение (телепортация, ускорение)
- X-Ray поведение (быстрый переход через стены)
- Килл аура (автоматические атаки)
- Автоматизация (AFK фарм)

Верни JSON ответ:
{
  "verdict": "suspicious" | "normal",
  "confidence": 0-100,
  "reason": "краткое объяснение",
  "action": "ban" | "warn" | "none"
}`;

/**
 * Выполнить AI анализ действия игрока
 * @param {Object} playerData - данные об игроке и действии
 * @returns {Promise<Object>} результат анализа
 */
async function analyzePlayerAction(playerData) {
  const { playerName, action, position, speed, blockBreakRate, distance, timestamp } = playerData;

  const userPrompt = `Проанализируй действие игрока:
- Игрок: ${playerName}
- Действие: ${action}
- Позиция: ${position?.x}, ${position?.y}, ${position?.z}
- Скорость: ${speed} блоков/сек
- Скорость майнинга: ${blockBreakRate} блоков/сек
- Пройденное расстояние: ${distance} блоков
- Время: ${timestamp}`;

  for (let i = 0; i < FREE_MODELS.length; i++) {
    const model = FREE_MODELS[i];
    try {
      const result = await analyzeWithModel(model, userPrompt);
      return result;
    } catch (error) {
      console.log(`Модель ${model} недоступна, пробую следующую...`);
      if (i === FREE_MODELS.length - 1) {
        throw new Error('Все бесплатные модели недоступны');
      }
    }
  }
}

/**
 * Анализ с конкретной моделью
 */
async function analyzeWithModel(model, userPrompt) {
  const response = await axios.post(
    `${config.openrouter.baseUrl}/chat/completions`,
    {
      model: model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 500,
      temperature: 0.3
    },
    {
      headers: {
        'Authorization': `Bearer ${config.openrouter.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/ai-guard',
        'X-Title': 'AI Guard Minecraft Moderation'
      }
    }
  );

  const content = response.data.choices[0].message.content;
  
  // Парсинг JSON из ответа
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    // Если не JSON, создаем базовый ответ
    return {
      verdict: content.toLowerCase().includes('suspicious') ? 'suspicious' : 'normal',
      confidence: 50,
      reason: content.substring(0, 200),
      action: content.toLowerCase().includes('ban') ? 'ban' : 'none'
    };
  } catch (e) {
    return {
      verdict: 'normal',
      confidence: 0,
      reason: 'Ошибка парсинга ответа AI',
      action: 'none'
    };
  }
}

/**
 * Проверить игрока на наличие нескольких подозрительных действий
 */
async function analyzePlayerHistory(playerName, recentActions) {
  const summary = recentActions.map(a => `${a.action} (${a.timestamp})`).join('\n');
  
  const userPrompt = `Игрок ${playerName} совершил несколько действий за последнее время:
${summary}

Определи, является ли игрок читером или есть другие нарушения.`;

  return analyzeWithModel(FREE_MODELS[0], userPrompt);
}

module.exports = {
  analyzePlayerAction,
  analyzePlayerHistory,
  FREE_MODELS
};