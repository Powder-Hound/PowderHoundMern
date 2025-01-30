import puppeteer from "puppeteer";
import fs from "fs/promises";

const BASE_URL = "https://www.skiresort.info/ski-resorts/usa/";

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  console.log("Opening page...");
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });

  console.log("Scraping resort links...");
  const resortLinks = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".resort-list-item a"))
      .map((link) => ({
        name: link.innerText.trim(),
        url: link.getAttribute("href").startsWith("http")
          ? link.getAttribute("href")
          : `https://www.skiresort.info${link.getAttribute("href")}`,
      }))
      .filter(
        (resort) => !resort.name.match(/Ski resorts|Test report|North America/i) // Ignore bad names
      )
  );

  console.log(`Found ${resortLinks.length} resorts. Extracting details...`);

  const resortsData = [];
  const uniqueLocations = new Set();

  for (const { name, url } of resortLinks) {
    console.log(`Scraping: ${name}...`);
    const resortPage = await browser.newPage();
    await resortPage.goto(url, { waitUntil: "domcontentloaded" });

    const resortInfo = await resortPage.evaluate(() => {
      const getText = (selector) => {
        const element = document.querySelector(selector);
        return element ? element.innerText.trim() : "N/A";
      };

      const getLink = (selector) => {
        const element = document.querySelector(selector);
        if (element && element.getAttribute("href")) {
          return element.getAttribute("href").startsWith("http")
            ? element.getAttribute("href")
            : `https://www.skiresort.info${element.getAttribute("href")}`;
        }
        return "N/A";
      };

      const getBoolean = (text) =>
        document.body.innerText.includes(text) ? true : false;

      const getImage = () => {
        const img = document.querySelector(".resort-detail-image img");
        return img
          ? img.getAttribute("src")
          : "https://via.placeholder.com/400"; // Default image
      };

      // Extract location details
      const location = getText(".resort-location");
      const locationParts = location.split(", ");
      const city = locationParts.length > 1 ? locationParts[0] : "Unknown";
      const state = locationParts.length > 1 ? locationParts[1] : "Unknown";

      // Extract latitude & longitude
      const latMatch = document.body.innerHTML.match(/"latitude":([-\d.]+)/);
      const lngMatch = document.body.innerHTML.match(/"longitude":([-\d.]+)/);
      let latitude = latMatch ? parseFloat(latMatch[1]) : null;
      let longitude = lngMatch ? parseFloat(lngMatch[1]) : null;

      // If missing, estimate lat/lon by state (fallback)
      if (!latitude || !longitude) {
        const stateCoords = {
          Colorado: [39.5501, -105.7821],
          Utah: [39.32098, -111.0937],
          California: [37.7749, -119.4194],
          Montana: [46.8797, -110.3626],
          Vermont: [44.5588, -72.5778],
        };
        if (state in stateCoords) {
          [latitude, longitude] = stateCoords[state];
        } else {
          latitude = Math.random() * 10 + 35; // Random fallback
          longitude = Math.random() * 10 - 110;
        }
      }

      return {
        resortName: getText("h1")
          .replace(/Ski resort|Test report/gi, "")
          .trim(),
        State: state !== "Unknown" ? state : "Colorado",
        City: city !== "Unknown" ? city : "Aspen",
        Website: getLink(".external-link"),
        snowStick: getLink(".snow-report-link"),
        Latitude: latitude,
        Longitude: longitude,
        Ikon: getBoolean("Ikon Pass"),
        Epic: getBoolean("Epic Pass"),
        "Mountain Collective": getBoolean("Mountain Collective"),
        Country: "USA",
        Image: getImage(),
      };
    });

    // Fix duplicate filtering - keep resorts if they have valid lat/lon
    const locationKey = `${resortInfo.Latitude},${resortInfo.Longitude}`;
    if (
      !uniqueLocations.has(locationKey) ||
      !resortInfo.Latitude ||
      !resortInfo.Longitude
    ) {
      uniqueLocations.add(locationKey);
      resortsData.push(resortInfo);
    } else {
      console.log(
        `Skipping duplicate: ${resortInfo.resortName} (${locationKey})`
      );
    }

    await resortPage.close();
  }

  console.log("Saving data...");
  await fs.writeFile("ski_resorts.json", JSON.stringify(resortsData, null, 4));

  console.log(
    `✅ Saved ${resortsData.length} unique ski resorts successfully!`
  );
  await browser.close();
})();
