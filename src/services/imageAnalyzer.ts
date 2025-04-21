import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";
import fs from "fs";
import config from "../config";
import { getMimeType, sanitizeAndParse } from "../utils/helpers";
import { ExtractedData } from "../types";

const genAI = new GoogleGenerativeAI(config.gemini.apiKey);

// عدد محاولات إعادة المحاولة الافتراضي
const MAX_RETRIES = 3;
// مدة الانتظار الأساسية قبل إعادة المحاولة (بالمللي ثانية)
const BASE_DELAY = 1000;

/**
 * انتظار لفترة محددة بالمللي ثانية
 */
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * تحليل الصورة واستخراج البيانات
 */
export async function analyzeImage(
  imagePath: string,
  retries = MAX_RETRIES
): Promise<ExtractedData | null> {
  try {
    const imageData = fs.readFileSync(imagePath);
    const base64Image = imageData.toString("base64");

    const model: GenerativeModel = genAI.getGenerativeModel({
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
     "name": "${config.defaultValues.name}",
     "number": "${config.defaultValues.number}",
     "company": "${config.defaultValues.company}",
     "date": "${config.defaultValues.date}",
     "status": "${config.defaultValues.status}",
     "user": "${config.defaultValues.user}"
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

    return sanitizeAndParse(jsonString) as ExtractedData | null;
  } catch (error: any) {
    console.error(
      `Error analyzing image (attempt ${
        MAX_RETRIES - retries + 1
      }/${MAX_RETRIES}):`,
      error
    );

    // في حالة وجود محاولات متبقية، أعد المحاولة بعد فترة
    if (retries > 0) {
      const delay = BASE_DELAY * Math.pow(2, MAX_RETRIES - retries);
      console.log(`Retrying after ${delay}ms...`);
      await wait(delay);
      return analyzeImage(imagePath, retries - 1);
    }

    // إذا فشلت جميع المحاولات، قم بإرجاع القيم الافتراضية
    console.log("All retry attempts failed. Returning default values.");
    return {
      name: config.defaultValues.name,
      number: config.defaultValues.number,
      company: config.defaultValues.company,
      date: config.defaultValues.date,
      status: config.defaultValues.status,
      user: config.defaultValues.user,
    };
  }
}
