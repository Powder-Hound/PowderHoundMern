import { checkResorts as checkResortsOriginal } from "./mock/mockOriginal.js";
import { checkResorts as checkResortsRefactored } from "./mock/mockNotifyUsers.js";

async function runComparison() {
  console.log(
    "Running comparison between mock original and mock refactored..."
  );

  console.time("Mock Original Execution Time");
  const originalOutput = await checkResortsOriginal();
  console.timeEnd("Mock Original Execution Time");

  console.time("Mock Refactored Execution Time");
  const refactoredOutput = await checkResortsRefactored();
  console.timeEnd("Mock Refactored Execution Time");

  console.log("\n### Comparison Results ###");
  if (JSON.stringify(originalOutput) === JSON.stringify(refactoredOutput)) {
    console.log("✅ Outputs are identical!");
  } else {
    console.error("❌ Outputs are different!");
    console.log("Original Output:", JSON.stringify(originalOutput, null, 2));
    console.log(
      "Refactored Output:",
      JSON.stringify(refactoredOutput, null, 2)
    );
  }
}

runComparison().catch((error) =>
  console.error("Error during comparison:", error)
);
