import fs from "fs";
import path from "path";

// Function to generate random numbers within a range
function getRandomInRange(min, max, decimals = 0) {
  const factor = Math.pow(10, decimals);
  return Math.round((Math.random() * (max - min) + min) * factor) / factor;
}

// Function to generate a random forecast entry
function generateForecast() {
  const date = new Date();
  date.setDate(date.getDate() + getRandomInRange(0, 365));

  return {
    date: date.toISOString().split("T")[0],
    time: `${getRandomInRange(0, 23)}:00`,
    lowcloud_pct: getRandomInRange(0, 30),
    lowcloud_min_pct: getRandomInRange(0, 20),
    lowcloud_max_pct: getRandomInRange(20, 50),
    lowcloud_avg_pct: getRandomInRange(10, 30),
    midcloud_pct: getRandomInRange(20, 50),
    midcloud_min_pct: getRandomInRange(10, 40),
    midcloud_max_pct: getRandomInRange(30, 60),
    midcloud_avg_pct: getRandomInRange(20, 50),
    highcloud_pct: getRandomInRange(10, 40),
    highcloud_min_pct: getRandomInRange(5, 30),
    highcloud_max_pct: getRandomInRange(20, 50),
    highcloud_avg_pct: getRandomInRange(15, 35),
    totalcloud_pct: getRandomInRange(30, 80),
    totalcloud_min_pct: getRandomInRange(20, 60),
    totalcloud_max_pct: getRandomInRange(40, 90),
    totalcloud_avg_pct: getRandomInRange(30, 70),
    frzglvl_ft: getRandomInRange(6000, 15000),
    frzglvl_min_ft: getRandomInRange(5000, 14000),
    frzglvl_max_ft: getRandomInRange(7000, 16000),
    frzglvl_avg_ft: getRandomInRange(6000, 15000),
    precip_mm: getRandomInRange(0, 20, 2),
    precip_in: getRandomInRange(0, 1, 2),
    hum_pct: getRandomInRange(40, 100),
    dewpoint_c: getRandomInRange(-10, 20),
    dewpoint_f: getRandomInRange(10, 60),
    vis_km: getRandomInRange(5, 20),
    slp_mb: getRandomInRange(950, 1050),
    base: {
      wx_desc: ["Clear skies", "Partly cloudy", "Overcast"][
        getRandomInRange(0, 2)
      ],
      wx_icon: ["Clear.gif", "PartlyCloudy.gif", "Overcast.gif"][
        getRandomInRange(0, 2)
      ],
      temp_c: getRandomInRange(-10, 30),
      temp_f: getRandomInRange(14, 86),
      winddir_deg: getRandomInRange(0, 360),
      windspd_mph: getRandomInRange(0, 20),
    },
  };
}

// Function to generate resort data
function generateResort(id, name, country, continent) {
  return {
    id,
    name,
    country,
    continent,
    forecast: Array.from({ length: 7 }, generateForecast), // Generate 7 days of forecast
  };
}

// Generate resorts data
const resorts = [
  generateResort(999001, "Aspen Mountain", "United States", "North America"),
  generateResort(999002, "Cortina d'Ampezzo", "Italy", "Europe"),
  generateResort(999003, "Niseko Grand Hirafu", "Japan", "Asia"),
  generateResort(999004, "Zermatt", "Switzerland", "Europe"),
  generateResort(999005, "Whistler Blackcomb", "Canada", "North America"),
  generateResort(999006, "Hakuba Valley", "Japan", "Asia"),
  generateResort(999007, "Val d'Isère", "France", "Europe"),
];

// Ensure the data directory exists
const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

// Write to JSON file
const filePath = path.join(dataDir, "unlockedfake.json");
fs.writeFileSync(filePath, JSON.stringify(resorts, null, 4));

console.log(`unlockedfake.json has been created in the data folder!`);
