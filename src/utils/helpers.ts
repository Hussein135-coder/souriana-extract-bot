import path from "path";
import fs from "fs";

/**
 * Sanitizes and parses JSON strings from AI responses
 */
export function sanitizeAndParse(str: string): Record<string, any> | null {
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

/**
 * Gets MIME type based on file extension
 */
export function getMimeType(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  const types: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
  };
  return types[ext] || "image/jpeg";
}

/**
 * Ensures upload directory exists
 */
export function ensureUploadDirectory(): string {
  const folderPath = path.join(__dirname, "../../uploads");
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath);
  }
  return folderPath;
}
