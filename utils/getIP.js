const https = require("https");

// Fetch public IP
https
  .get("https://api.ipify.org?format=json", (res) => {
    let data = "";

    res.on("data", (chunk) => (data += chunk));
    res.on("end", () => {
      const ip = JSON.parse(data).ip;
      console.log("Your Public IP Address:", ip);
      console.log("Add this IP to your MongoDB Atlas whitelist.");
    });
  })
  .on("error", (err) => {
    console.error("Error fetching IP:", err.message);
  });
