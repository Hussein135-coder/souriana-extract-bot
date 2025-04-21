import axios from "axios";
import config from "../config";
import {
  WebsiteLoginResponse,
  WebsiteDataResponse,
  ExtractedData,
} from "../types";

let websiteToken: string | null = null;
let loginRetryCount = 0;
const MAX_LOGIN_RETRIES = 3;
const LOGIN_RETRY_DELAY = 1000; // بالمللي ثانية

// الانتظار لفترة محددة بالمللي ثانية
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// حالة تسجيل الدخول للعرض في واجهة المستخدم
export enum LoginStatus {
  SUCCESS = "success",
  FAILED = "failed",
  RETRYING = "retrying",
  NOT_ATTEMPTED = "not_attempted",
}

// حالة تسجيل الدخول الحالية
export let currentLoginStatus: LoginStatus = LoginStatus.NOT_ATTEMPTED;

export async function loginToWebsite(
  forceNewLogin = false
): Promise<string | null> {
  if (websiteToken && !forceNewLogin) {
    return websiteToken;
  }

  loginRetryCount = 0;
  return attemptLogin();
}

async function attemptLogin(): Promise<string | null> {
  try {
    currentLoginStatus = LoginStatus.RETRYING;
    console.log(
      `Attempting to login (attempt ${
        loginRetryCount + 1
      }/${MAX_LOGIN_RETRIES})...`
    );

    const response = await axios.post<WebsiteLoginResponse>(
      config.website.loginUrl,
      {
        username: config.website.username,
        password: config.website.password,
      },
      { timeout: 10000 } // وضع حد زمني للطلب (10 ثواني)
    );

    websiteToken = response.data.jwt;
    currentLoginStatus = LoginStatus.SUCCESS;
    loginRetryCount = 0;
    console.log("Login successful");
    return websiteToken;
  } catch (error: any) {
    console.error("Login error:", error.message || error);

    // محاولة إعادة تسجيل الدخول
    if (loginRetryCount < MAX_LOGIN_RETRIES - 1) {
      loginRetryCount++;
      const delay = LOGIN_RETRY_DELAY * Math.pow(2, loginRetryCount - 1);
      console.log(`Login failed. Retrying in ${delay}ms...`);
      await wait(delay);
      return attemptLogin();
    }

    // إذا فشلت جميع المحاولات
    console.error(`Failed to login after ${MAX_LOGIN_RETRIES} attempts`);
    currentLoginStatus = LoginStatus.FAILED;
    return null;
  }
}

export async function submitDataToWebsite(
  data: ExtractedData
): Promise<WebsiteDataResponse | null> {
  // محاولة تسجيل الدخول إذا لم يكن هناك رمز
  if (!websiteToken) {
    const token = await loginToWebsite();
    if (!token) {
      console.error("Cannot submit data: Failed to login");
      return null;
    }
  }

  try {
    const response = await axios.post<WebsiteDataResponse>(
      config.website.dataUrl,
      { data },
      {
        headers: { Authorization: `Bearer ${websiteToken}` },
        timeout: 15000, // وضع حد زمني للطلب (15 ثانية)
      }
    );
    return response.data;
  } catch (error: any) {
    // إعادة تسجيل الدخول في حالة انتهاء صلاحية الرمز
    if (error.response?.status === 401) {
      console.log("Token expired, trying to login again...");
      const newToken = await loginToWebsite(true);
      if (!newToken) {
        console.error(
          "Cannot submit data: Failed to login after token expiration"
        );
        return null;
      }

      try {
        // إعادة المحاولة بعد تسجيل الدخول مجدداً
        const response = await axios.post<WebsiteDataResponse>(
          config.website.dataUrl,
          { data },
          { headers: { Authorization: `Bearer ${newToken}` } }
        );
        return response.data;
      } catch (retryError) {
        console.error("Submit data retry error:", retryError);
        return null;
      }
    }

    console.error("Submit data error:", error.message || error);
    return null;
  }
}
