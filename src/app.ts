import { initBot } from "./bot";
import { initServer } from "./server";
import { loginToWebsite, LoginStatus, currentLoginStatus } from "./api/website";
import { GoogleGenerativeAI } from "@google/generative-ai";
import config from "./config";

/**
 * التحقق من صحة مفتاح API الخاص بـ Gemini
 */
async function checkGeminiApiKey(): Promise<boolean> {
  try {
    console.log("Checking Gemini API key...");
    const genAI = new GoogleGenerativeAI(config.gemini.apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // محاولة إجراء طلب بسيط للتحقق من المفتاح
    await model.generateContent({
      contents: [{ role: "user", parts: [{ text: "hello" }] }],
    });
    console.log("Gemini API key is valid!");
    return true;
  } catch (error) {
    console.error("Error validating Gemini API key:", error);
    console.warn(
      "WARNING: The Gemini API key appears to be invalid or has access issues."
    );
    console.warn("The bot will fallback to default values for image analysis.");
    return false;
  }
}

/**
 * محاولة الاتصال بالموقع والتعامل مع الأخطاء
 */
async function tryWebsiteLogin(retries = 3): Promise<boolean> {
  console.log("Attempting to connect to the website...");

  try {
    const token = await loginToWebsite(true);

    if (token) {
      console.log("Successfully authenticated with website");
      return true;
    } else {
      console.error(
        "Failed to authenticate with website after multiple attempts"
      );
      console.warn(
        "WARNING: The bot will continue running, but data submission will require manual retry."
      );
      return false;
    }
  } catch (error) {
    console.error("Exception during website authentication:", error);
    console.warn(
      "WARNING: Website connection failed. Check your network and credentials."
    );
    return false;
  }
}

/**
 * Initialize the application
 */
async function initialize(): Promise<void> {
  try {
    console.log("Starting application...");

    // التحقق من مفتاح API الخاص بـ Gemini
    await checkGeminiApiKey();

    // Initialize Telegram bot
    const bot = initBot();

    // Initialize Express server
    initServer();

    // محاولة الاتصال بالموقع
    const websiteConnected = await tryWebsiteLogin();

    // لو كان المستخدم مسؤول، أرسل له إشعاراً بحالة البدء
    const adminId = 245853116; // احصل على معرف المسؤول من الإعدادات

    if (adminId) {
      try {
        // إنشاء رسالة بالحالة
        let statusMessage =
          `🤖 تم بدء تشغيل البوت\n\n` +
          `🔑 Gemini API: ${(await checkGeminiApiKey()) ? "✅" : "❌"}\n` +
          `🌐 الاتصال بالموقع: ${websiteConnected ? "✅" : "❌"}\n` +
          `🚀 حالة الخادم: ✅\n\n` +
          `تاريخ بدء التشغيل: ${new Date().toLocaleString("ar")}`;

        await bot.sendMessage(adminId, statusMessage);
      } catch (error) {
        console.error("Failed to send startup notification to admin:", error);
      }
    }

    console.log("Application initialized successfully");
  } catch (error) {
    console.error("Failed to initialize application:", error);
    process.exit(1);
  }
}

// Start the application
initialize();
