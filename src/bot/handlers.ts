import fs from "fs";
import path from "path";
import TelegramBot from "node-telegram-bot-api";
import { analyzeImage } from "../services/imageAnalyzer";
import {
  submitDataToWebsite,
  loginToWebsite,
  LoginStatus,
  currentLoginStatus,
} from "../api/website";
import { ensureUploadDirectory } from "../utils/helpers";
import { ExtractedData } from "../types";
import config from "../config";

// Store extracted data temporarily
let extractedData: ExtractedData = {} as ExtractedData;

/**
 * Request confirmation from user for extracted data
 */
async function requestConfirmation(
  bot: TelegramBot,
  chatId: number,
  extractedData: ExtractedData
): Promise<void> {
  const options: TelegramBot.SendMessageOptions = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "Approve ✅", callback_data: "approve" },
          { text: "Edit ✏️", callback_data: "edit" },
          { text: "Cancel ❌", callback_data: "cancel" },
        ],
      ],
    },
  };

  await bot.sendMessage(
    chatId,
    `Please confirm the extracted data:\n\n${JSON.stringify(
      extractedData,
      null,
      2
    )}`,
    options
  );
}

/**
 * محاولة اتصال جديدة بالموقع وعرض الخيارات للمستخدم
 */
async function handleLoginFailure(
  bot: TelegramBot,
  chatId: number,
  messageId?: number
): Promise<void> {
  const keyboard: TelegramBot.InlineKeyboardButton[][] = [
    [
      { text: "إعادة محاولة تسجيل الدخول 🔄", callback_data: "retry_login" },
      { text: "حفظ البيانات محلياً 💾", callback_data: "save_local" },
    ],
    [{ text: "إلغاء ❌", callback_data: "cancel" }],
  ];

  const message =
    `⚠️ فشل الاتصال بالموقع ⚠️\n\n` +
    `لم نتمكن من تسجيل الدخول إلى الموقع بعد عدة محاولات.\n` +
    `يرجى اختيار أحد الخيارات التالية:`;

  if (messageId) {
    await bot.editMessageText(message, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: keyboard,
      },
    });
  } else {
    await bot.sendMessage(chatId, message, {
      reply_markup: {
        inline_keyboard: keyboard,
      },
    });
  }
}

/**
 * حفظ البيانات محلياً في ملف
 */
async function saveDataToFile(data: ExtractedData): Promise<string> {
  try {
    const backupDir = path.join(__dirname, "../../backups");
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `data_${timestamp}.json`;
    const filePath = path.join(backupDir, fileName);

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
    return filePath;
  } catch (error) {
    console.error("Error saving data to file:", error);
    throw error;
  }
}

/**
 * Photo handler - processes images sent to the bot
 */
export async function handlePhoto(
  bot: TelegramBot,
  msg: TelegramBot.Message
): Promise<void> {
  try {
    const chatId = msg.chat.id;
    const processingMsg = await bot.sendMessage(
      chatId,
      "جاري معالجة الصورة..."
    );

    if (!msg.photo || msg.photo.length === 0) {
      await bot.editMessageText("لم يتم العثور على صورة في الرسالة.", {
        chat_id: chatId,
        message_id: processingMsg.message_id,
      });
      return;
    }

    // إعلام المستخدم بتقدم العملية
    await bot.editMessageText("جاري تحميل الصورة...", {
      chat_id: chatId,
      message_id: processingMsg.message_id,
    });

    const photoId = msg.photo[msg.photo.length - 1].file_id;
    const photoInfo = await bot.getFile(photoId);
    const folderPath = ensureUploadDirectory();
    const photoPath = await bot.downloadFile(photoInfo.file_id, folderPath);

    await bot.editMessageText(
      "جاري تحليل الصورة باستخدام الذكاء الاصطناعي...",
      {
        chat_id: chatId,
        message_id: processingMsg.message_id,
      }
    );

    try {
      const analyzedData = await analyzeImage(photoPath);
      if (analyzedData) {
        extractedData = analyzedData;
        console.log(extractedData);

        // حذف رسالة المعالجة
        await bot.deleteMessage(chatId, processingMsg.message_id);

        // إرسال تأكيد البيانات المستخرجة
        await requestConfirmation(bot, chatId, extractedData);
      } else {
        await bot.editMessageText(
          "فشل استخراج البيانات من الصورة. يرجى المحاولة مرة أخرى.",
          {
            chat_id: chatId,
            message_id: processingMsg.message_id,
          }
        );
      }
    } catch (error) {
      console.error("Error in AI processing:", error);
      await bot.editMessageText(
        "حدث خطأ أثناء تحليل الصورة باستخدام الذكاء الاصطناعي. تم استخدام القيم الافتراضية.",
        {
          chat_id: chatId,
          message_id: processingMsg.message_id,
        }
      );
    }

    // حذف الصورة المحفوظة مؤقتاً
    try {
      fs.unlinkSync(photoPath);
    } catch (error) {
      console.error("Error removing temporary image:", error);
    }
  } catch (error) {
    console.error("Error processing image:", error);
    bot.sendMessage(
      msg.chat.id,
      "حدث خطأ أثناء معالجة الصورة. يرجى المحاولة مرة أخرى."
    );
  }
}

/**
 * Text message handler
 */
export async function handleText(
  bot: TelegramBot,
  msg: TelegramBot.Message
): Promise<void> {
  const chatId = msg.chat.id;

  if (msg.text === "/start") {
    bot.sendMessage(chatId, "أهلاً بك! قم بإرسال صورة لاستخراج البيانات منها.");
  } else if (msg.text === "/status") {
    // عرض حالة الاتصال بالموقع
    let statusMessage: string;

    switch (currentLoginStatus) {
      case LoginStatus.SUCCESS:
        statusMessage = "✅ متصل\nتم تسجيل الدخول إلى الموقع بنجاح.";
        break;
      case LoginStatus.FAILED:
        statusMessage = "❌ غير متصل\nفشل تسجيل الدخول إلى الموقع.";
        break;
      case LoginStatus.RETRYING:
        statusMessage = "🔄 جاري المحاولة\nجاري محاولة الاتصال بالموقع...";
        break;
      case LoginStatus.NOT_ATTEMPTED:
        statusMessage = "⚪ غير معروفة\nلم تتم محاولة الاتصال بالموقع بعد.";
        break;
    }

    // إضافة معلومات إضافية
    statusMessage +=
      `\n\nإعدادات الموقع:` +
      `\nعنوان تسجيل الدخول: ${config.website.loginUrl ? "✓" : "✗"}` +
      `\nعنوان إرسال البيانات: ${config.website.dataUrl ? "✓" : "✗"}` +
      `\nاسم المستخدم: ${config.website.username ? "✓" : "✗"}`;

    // أزرار للإجراءات
    const keyboard: TelegramBot.InlineKeyboardButton[][] = [
      [{ text: "إعادة محاولة الاتصال 🔄", callback_data: "retry_connection" }],
    ];

    await bot.sendMessage(chatId, `حالة الاتصال بالموقع:\n${statusMessage}`, {
      reply_markup: {
        inline_keyboard: keyboard,
      },
    });
  } else if (msg.text === "test") {
    const runningMsg = await bot.sendMessage(chatId, "جاري التشغيل...");
    setTimeout(async () => {
      await bot.deleteMessage(chatId, runningMsg.message_id);
    }, 2000);
  } else if (msg.text === "/help") {
    // إضافة رسالة مساعدة
    const helpMessage =
      "🤖 *مساعدة بوت استخراج البيانات* 🤖\n\n" +
      "الأوامر المتاحة:\n" +
      "/start - بدء استخدام البوت\n" +
      "/status - عرض حالة الاتصال بالموقع\n" +
      "/help - عرض هذه المساعدة\n\n" +
      "لاستخراج البيانات، ما عليك سوى إرسال صورة وسيقوم البوت بتحليلها واستخراج البيانات منها.";

    await bot.sendMessage(chatId, helpMessage, { parse_mode: "Markdown" });
  }
}

/**
 * Callback query handler - handles button interactions
 */
export async function handleCallbackQuery(
  bot: TelegramBot,
  callbackQuery: TelegramBot.CallbackQuery
): Promise<void> {
  if (!callbackQuery.message) return;

  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const data = callbackQuery.data || "";

  if (data === "approve") {
    const processingMsg = await bot.sendMessage(
      chatId,
      "جاري إرسال البيانات..."
    );
    try {
      const result = await submitDataToWebsite(extractedData);

      if (result) {
        await bot.editMessageText("تم إرسال البيانات بنجاح! ✅", {
          chat_id: chatId,
          message_id: processingMsg.message_id,
        });
        // Delete the original confirmation message
        await bot.deleteMessage(chatId, messageId);
      } else {
        // فشل في إرسال البيانات - إظهار خيارات المستخدم
        await handleLoginFailure(bot, chatId, processingMsg.message_id);
      }
    } catch (error) {
      await bot.editMessageText("حدث خطأ أثناء إرسال البيانات!", {
        chat_id: chatId,
        message_id: processingMsg.message_id,
      });
    }
  } else if (data === "cancel") {
    await bot.deleteMessage(chatId, messageId);
    await bot.sendMessage(chatId, "تم إلغاء العملية.");
  } else if (data === "edit") {
    const keys = Object.keys(extractedData).map((key) => [
      { text: key, callback_data: `edit_${key}` },
    ]);
    await bot.deleteMessage(chatId, messageId);
    await bot.sendMessage(chatId, "اختر الحقل الذي تريد تعديله:", {
      reply_markup: { inline_keyboard: keys },
    });
  } else if (data.startsWith("edit_")) {
    const fieldToEdit = data.replace("edit_", "");
    await bot.deleteMessage(chatId, messageId);
    await bot.sendMessage(chatId, `أدخل قيمة جديدة لـ ${fieldToEdit}:`);
    bot.once("message", async (newValueMsg) => {
      if (newValueMsg.text) {
        extractedData[fieldToEdit] = newValueMsg.text;
        await requestConfirmation(bot, chatId, extractedData);
      }
    });
  } else if (data === "retry_login") {
    const processingMsg = await bot.sendMessage(
      chatId,
      "جاري إعادة محاولة تسجيل الدخول..."
    );

    // محاولة تسجيل الدخول من جديد
    const token = await loginToWebsite(true);

    if (token) {
      await bot.editMessageText(
        "تم تسجيل الدخول بنجاح. جاري إرسال البيانات...",
        {
          chat_id: chatId,
          message_id: processingMsg.message_id,
        }
      );

      // محاولة إرسال البيانات مرة أخرى
      const result = await submitDataToWebsite(extractedData);

      if (result) {
        await bot.editMessageText("تم إرسال البيانات بنجاح! ✅", {
          chat_id: chatId,
          message_id: processingMsg.message_id,
        });
      } else {
        await bot.editMessageText(
          "فشل إرسال البيانات رغم نجاح تسجيل الدخول. ⚠️",
          {
            chat_id: chatId,
            message_id: processingMsg.message_id,
          }
        );
      }
    } else {
      // لا تزال هناك مشكلة في تسجيل الدخول
      await handleLoginFailure(bot, chatId, processingMsg.message_id);
    }
  } else if (data === "save_local") {
    const processingMsg = await bot.sendMessage(
      chatId,
      "جاري حفظ البيانات محلياً..."
    );

    try {
      const filePath = await saveDataToFile(extractedData);
      await bot.editMessageText(
        `تم حفظ البيانات محلياً بنجاح! ✅\nالمسار: ${filePath}`,
        {
          chat_id: chatId,
          message_id: processingMsg.message_id,
        }
      );

      // إرسال ملف البيانات للمستخدم
      await bot.sendDocument(chatId, filePath, {
        caption: "ملف البيانات المستخرجة",
      });
    } catch (error) {
      await bot.editMessageText("حدث خطأ أثناء حفظ البيانات محلياً!", {
        chat_id: chatId,
        message_id: processingMsg.message_id,
      });
    }
  } else if (data === "retry_connection") {
    const processingMsg = await bot.sendMessage(
      chatId,
      "جاري إعادة محاولة الاتصال بالموقع..."
    );

    // محاولة تسجيل الدخول من جديد
    const token = await loginToWebsite(true);

    if (token) {
      await bot.editMessageText("✅ تم الاتصال بالموقع بنجاح!", {
        chat_id: chatId,
        message_id: processingMsg.message_id,
      });
    } else {
      await bot.editMessageText(
        "❌ فشل الاتصال بالموقع. يرجى التحقق من إعدادات الاتصال.",
        {
          chat_id: chatId,
          message_id: processingMsg.message_id,
        }
      );
    }
  }
}

/**
 * Sets up the hourly message function
 */
export function setupHourlyMessage(
  bot: TelegramBot,
  chatId: number,
  message: string
): NodeJS.Timeout {
  return setInterval(async () => {
    try {
      await bot.sendMessage(chatId, message);
      console.log(`Hourly message sent to ${chatId}`);
    } catch (error) {
      console.error(`Error sending hourly message to ${chatId}:`, error);
    }
  }, 3600 * 1000);
}
