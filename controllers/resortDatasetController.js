import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const getResortDataset = (req, res) => {
  const filePath = path.join(__dirname, "..", "data", "resorts.json");
  console.log("Looking for file at:", filePath); // Debugging path

  fs.readFile(filePath, "utf8", (err, data) => {
    if (err) {
      console.error("Error reading file:", err.message);
      return res.status(500).json({
        success: false,
        message: "Failed to load resort dataset",
      });
    }

    try {
      const resorts = JSON.parse(data);
      res.status(200).json({
        success: true,
        data: resorts,
      });
    } catch (parseError) {
      console.error("Error parsing JSON:", parseError.message);
      res.status(500).json({
        success: false,
        message: "Invalid dataset format",
      });
    }
  });
};

export { getResortDataset };
