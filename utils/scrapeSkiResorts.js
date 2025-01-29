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
    Array.from(document.querySelectorAll(".resort-list-item a")).map(
      (link) => ({
        name: link.innerText.trim(),
        url: link.getAttribute("href").startsWith("http")
          ? link.getAttribute("href")
          : `https://www.skiresort.info${link.getAttribute("href")}`,
      })
    )
  );

  console.log(`Found ${resortLinks.length} resorts. Extracting details...`);

  const resortsData = [];

  for (const { name, url } of resortLinks) {
    console.log(`Scraping: ${name}...`);
    const resortPage = await browser.newPage();
    await resortPage.goto(url, { waitUntil: "domcontentloaded" });

    // Extract details from individual resort page
    const resortInfo = await resortPage.evaluate(() => {
      const getText = (selector) =>
        document.querySelector(selector)?.innerText.trim() || "Unknown";

      const getLink = (selector) =>
        document.querySelector(selector)?.getAttribute("href") || "N/A";

      const getBoolean = (text) =>
        document.body.innerText.includes(text) ? true : false;

      const getImage = () =>
        document
          .querySelector(".resort-detail-image img")
          ?.getAttribute("src") || "N/A";

      return {
        resortName: getText("h1"),
        State: getText(".resort-location")?.split(", ")[1] || "Unknown",
        City: getText(".resort-location")?.split(", ")[0] || "Unknown",
        Website: getLink(".external-link").startsWith("http")
          ? getLink(".external-link")
          : `https://www.skiresort.info${getLink(".external-link")}`,
        snowStick: getLink(".snow-report-link").startsWith("http")
          ? getLink(".snow-report-link")
          : `https://www.skiresort.info${getLink(".snow-report-link")}`,
        Latitude: parseFloat(
          document.body.innerHTML.match(/"latitude":([-\d.]+)/)?.[1] || "0"
        ),
        Longitude: parseFloat(
          document.body.innerHTML.match(/"longitude":([-\d.]+)/)?.[1] || "0"
        ),
        Ikon: getBoolean("Ikon Pass"),
        Epic: getBoolean("Epic Pass"),
        "Mountain Collective": getBoolean("Mountain Collective"),
        Country: "USA",
        Image: getImage(),
      };
    });

    resortsData.push(resortInfo);
    await resortPage.close();
  }

  console.log("Saving data...");
  await fs.writeFile("ski_resorts.json", JSON.stringify(resortsData, null, 4));

  console.log("✅ All ski resort data saved successfully!");
  await browser.close();
})();
