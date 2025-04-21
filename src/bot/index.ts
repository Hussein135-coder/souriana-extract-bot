import TelegramBot from "node-telegram-bot-api";
import config from "../config";
import {
  handlePhoto,
  handleCallbackQuery,
  handleText,
  setupHourlyMessage,
} from "./handlers";

/**
 * Initialize and configure the Telegram bot
 */
export function initBot(): TelegramBot {
  const bot = new TelegramBot(config.telegram.token, { polling: true });

  // Register event handlers
  bot.on("photo", (msg) => handlePhoto(bot, msg));
  bot.on("callback_query", (query) => handleCallbackQuery(bot, query));
  bot.on("text", (msg) => handleText(bot, msg));

  // Setup hourly message
  setupHourlyMessage(
    bot,
    config.telegram.hourlyCheckChatId,
    config.telegram.hourlyMessage
  );

  console.log("Bot is running...");
  return bot;
}
