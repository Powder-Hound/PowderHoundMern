import fs from "fs-extra";
import path from "path";
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import { fileURLToPath } from "url";

// ES Module workaround for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const babelTraverse = traverse.default || traverse;

function generateAPIFile(codeBasePath, outputFile) {
  const publicAPIs = [];
  const protectedAPIs = [];

  // Recursively scan the directory for route files
  function scanDirectory(directory) {
    console.log(`📂 Scanning directory: ${directory}`);
    const files = fs.readdirSync(directory);

    files.forEach((file) => {
      const filePath = path.join(directory, file);
      const stats = fs.statSync(filePath);

      if (stats.isDirectory()) {
        scanDirectory(filePath);
      } else if (file.endsWith(".js") || file.endsWith(".ts")) {
        console.log(`🔍 Found file: ${filePath}`);
        try {
          const content = fs.readFileSync(filePath, "utf8");
          extractAPIs(content);
        } catch (error) {
          console.error(`❌ Error reading file: ${filePath}`, error.message);
        }
      }
    });
  }

  // Extract API routes and categorize as Public or Protected
  function extractAPIs(content) {
    try {
      const ast = parse(content, {
        sourceType: "module",
        plugins: ["classProperties", "dynamicImport"],
      });

      babelTraverse(ast, {
        CallExpression(path) {
          const { callee, arguments: args } = path.node;

          if (
            callee?.object?.name && // Matches authRouter, userRouter, etc.
            ["get", "post", "put", "delete"].includes(callee.property?.name)
          ) {
            const method = callee.property.name.toUpperCase();
            const route = args[0]?.value;

            // Check if any argument after the route is a named middleware
            const hasMiddleware = args.slice(1).some((arg) => {
              return arg.type === "Identifier" && arg.name === "verifyToken"; // Explicit check
            });

            if (route) {
              if (hasMiddleware) {
                protectedAPIs.push({ method, route });
              } else {
                publicAPIs.push({ method, route });
              }
            }
          }
        },
      });
    } catch (error) {
      console.error("❌ Failed to parse file:", error.message);
    }
  }

  // Start scanning the provided directory
  scanDirectory(codeBasePath);

  // Write the API summary to a file
  const publicSummary = publicAPIs
    .map(({ method, route }) => `${method} ${route}`)
    .join("\n");

  const protectedSummary = protectedAPIs
    .map(({ method, route }) => `${method} ${route}`)
    .join("\n");

  const finalOutput = `
Public Routes:
${publicSummary}

Protected Routes:
${protectedSummary}
  `;

  fs.writeFileSync(outputFile, finalOutput.trim(), "utf8");
  console.log(`🎉 API reference file generated: ${outputFile}`);
}

export default generateAPIFile;
