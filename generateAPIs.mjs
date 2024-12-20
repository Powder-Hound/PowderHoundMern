import path from "path";
import { fileURLToPath } from "url";
import generateAPIFile from "./utils/generateApiFile.js";

// ES Module workaround for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Adjusted path to new "api" location at project root
const codeBasePath = path.join(__dirname, "api");
const outputFile = path.join(__dirname, "api-summary.txt");

console.log("🚀 Starting API extraction...");
console.log("🔍 Scanning path:", codeBasePath);

generateAPIFile(codeBasePath, outputFile);
