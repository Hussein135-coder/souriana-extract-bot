import dotenv from "dotenv";
import { Config } from "../types";

dotenv.config();

const config: Config = {
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN || "",
    hourlyCheckChatId: 245853116,
    hourlyMessage: "Hourly check-in",
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || "",
  },
  website: {
    loginUrl: process.env.WEBSITE_LOGIN_URL || "",
    dataUrl: process.env.WEBSITE_DATA_URL || "",
    username: process.env.WEBSITE_USERNAME || "",
    password: process.env.WEBSITE_PASSWORD || "",
  },
  defaultValues: {
    name: process.env.NAME || "",
    number: "150000",
    company: "الهرم",
    date: "2025-01-01",
    status: "0",
    user: process.env.WEBSITE_USERNAME || "hussein",
  },
  server: {
    port: parseInt(process.env.PORT || "3000", 10),
  },
};

export default config;
