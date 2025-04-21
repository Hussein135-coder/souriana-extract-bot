require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const express = require("express"); // Add express require

const app = express(); // Initialize express app
const port = process.env.PORT || 3000; // Define port

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

let websiteToken = null;

async function loginToWebsite() {
  try {
    const response = await axios.post(process.env.WEBSITE_LOGIN_URL, {
      username: process.env.WEBSITE_USERNAME,
      password: process.env.WEBSITE_PASSWORD,
    });
    websiteToken = response.data.jwt;
    return websiteToken;
  } catch (error) {
    console.error("Login error:", error);
    throw error;
  }
}

async function analyzeImage(imagePath) {
  const imageData = fs.readFileSync(imagePath);
  const base64Image = imageData.toString("base64");

  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    generationConfig: { responseMimeType: "application/json" },
  });

  const prompt = `
قم بتحليل الصورة واستخراج البيانات التالية بدقة:
{
  "name": "اسم المرسل (نص)",
  "number": "المبلغ (رقم int بدون فواصل)",
  "date": "التاريخ (تنسيق ISO 8601)",
  "company" : "اسم الشركة هو الهرم أو الفؤاد حصراو ابحث عن هذين الاسمين وان لم تجد ايا منهما اكتب الهرم",
    "status": "ضع القيمة صفر دائما",
    "user": "ضع القيمة hussein دائما "

}

القيم الافتراضية: 
{
     "name": "${process.env.NAME}",
     "number": "150000",
     "company": "الهرم",
     "date": "2025-01-01",
     "status": "0",
     "user": "${process.env.WEBSITE_USERNAME}"
 }

التعليمات:
1. تجاهل أي بيانات غير ذات صلة
2. إذا لم يوجد حقل، استخدم قيمة من القيم الافتراضية
3. تأكد من أن المبلغ رقم صالح
4. التاريخ يجب أن يكون بتنسيق YYYY-MM-DD
5. لا تضيف أي شرح إضافي
6. عندما تكون الحوالة من الفؤاد قم باستخراج المبلغ الصافي مع تجاهل الاصفار الزائدة
7. عندما تكون الحوالة من الهرم يكون هناك مبلغ على اليمين وهو المبلغ الاساسي ثم علامة سلاش ثم مبلغ صغير على اليسار بجانبه كلمة مرسل هو العمولة فقم بتجاهل العمولة
8. ليس هناك اي مبلغ اقل من 50000
`;

  const imageParts = [
    {
      inlineData: {
        data: base64Image,
        mimeType: getMimeType(imagePath),
      },
    },
  ];

  const { response } = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }, ...imageParts],
      },
    ],
  });

  const jsonString =
    response.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

  return sanitizeAndParse(jsonString);
}

function sanitizeAndParse(str) {
  try {
    const cleaned = str
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const parsed = JSON.parse(cleaned);

    if (Array.isArray(parsed)) {
      return parsed.length > 0 ? parsed[0] : {};
    }

    return parsed;
  } catch (e) {
    console.error("فشل تحليل JSON:", str);
    return null;
  }
}

function getMimeType(filePath) {
  const ext = filePath.split(".").pop().toLowerCase();
  const types = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" };
  return types[ext] || "image/jpeg";
}

async function submitDataToWebsite(data) {
  if (!websiteToken) await loginToWebsite();

  try {
    const response = await axios.post(
      process.env.WEBSITE_DATA_URL,
      { data },
      { headers: { Authorization: `Bearer ${websiteToken}` } }
    );
    return response.data;
  } catch (error) {
    if (error.response?.status === 401) {
      await loginToWebsite();
      return submitDataToWebsite(data);
    }
    throw error;
  }
}

async function requestConfirmation(chatId, extractedData) {
  const options = {
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

let extractedData = {};

bot.on("photo", async (msg) => {
  try {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "Processing image...");

    const photoId = msg.photo[msg.photo.length - 1].file_id;
    const photoInfo = await bot.getFile(photoId);
    const folderPath = path.join(__dirname, "uploads");
    if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath);
    const photoPath = await bot.downloadFile(photoInfo.file_id, folderPath);

    extractedData = await analyzeImage(photoPath);
    console.log(extractedData);
    await requestConfirmation(chatId, extractedData);
    fs.unlinkSync(photoPath);
  } catch (error) {
    console.error("Error processing image:", error);
    bot.sendMessage(
      msg.chat.id,
      "An error occurred while processing the image."
    );
  }
});

bot.on("callback_query", async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const data = callbackQuery.data;

  if (data === "approve") {
    const processingMsg = await bot.sendMessage(chatId, "Submitting data...");
    try {
      await submitDataToWebsite(extractedData);
      await bot.editMessageText("Data submitted successfully!", {
        chat_id: chatId,
        message_id: processingMsg.message_id,
      });

      // Delete the original confirmation message
      await bot.deleteMessage(chatId, messageId);
    } catch (error) {
      await bot.editMessageText("Error submitting data!", {
        chat_id: chatId,
        message_id: processingMsg.message_id,
      });
    }
  } else if (data === "cancel") {
    await bot.deleteMessage(chatId, messageId);
    await bot.sendMessage(chatId, "Operation canceled.");
  } else if (data === "edit") {
    const keys = Object.keys(extractedData).map((key) => [
      { text: key, callback_data: `edit_${key}` },
    ]);
    await bot.deleteMessage(chatId, messageId);
    await bot.sendMessage(chatId, "Select a field to edit:", {
      reply_markup: { inline_keyboard: keys },
    });
  } else if (data.startsWith("edit_")) {
    const fieldToEdit = data.replace("edit_", "");
    await bot.deleteMessage(chatId, messageId);
    await bot.sendMessage(chatId, `Enter new value for ${fieldToEdit}:`);
    bot.once("message", async (newValueMsg) => {
      extractedData[fieldToEdit] = newValueMsg.text;
      await requestConfirmation(chatId, extractedData);
    });
  }
});

bot.on("text", async (msg) => {
  const chatId = msg.chat.id;
  if (msg.text === "/start") {
    bot.sendMessage(chatId, "Welcome! Send an image to extract data.");
  }
  if (msg.text === "test") {
    const runningMsg = await bot.sendMessage(chatId, "Running...");
    setTimeout(async () => {
      await bot.deleteMessage(chatId, runningMsg.message_id);
    }, 2000);
  }
});

// Basic route for the server
app.get('/', (req, res) => {
  res.send('Telegram bot is running!');
});

// Start the Express server
app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});

console.log("Bot is running...");

// Send hourly message
const hourlyChatId = 245853116;
const hourlyMessage = "Hourly check-in";

setInterval(async () => {
  try {
    await bot.sendMessage(hourlyChatId, hourlyMessage);
    console.log(`Hourly message sent to ${hourlyChatId}`);
  } catch (error) {
    console.error(`Error sending hourly message to ${hourlyChatId}:`, error);
  }
}, 3600 * 1000); 
