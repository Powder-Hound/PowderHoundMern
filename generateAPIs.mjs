import path from "path";
import { fileURLToPath } from "url";
import generateAPIFile from "./backend/utils/generateApiFile.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const codeBasePath = path.join(__dirname, "backend", "api");
const outputFile = path.join(__dirname, "api-summary.txt");

console.log("🚀 Starting API extraction...");
console.log("🔍 Scanning path:", codeBasePath);

generateAPIFile(codeBasePath, outputFile);
