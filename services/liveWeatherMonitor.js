// services/liveWeatherMonitor.js
import EventEmitter from "events";
import axios from "axios";

// This class polls your live weather API and emits "weatherAlert" events when conditions meet thresholds.
class LiveWeatherMonitor extends EventEmitter {
  constructor() {
    super();
    this.interval = null;
  }

  // Replace this function with your actual live weather API call.
  async fetchLiveWeatherData() {
    try {
      // Example endpoint: adjust URL, params, and response parsing as needed.
      const response = await axios.get("https://api.example.com/live-weather");
      return response.data; // Assume it returns an array of weather data objects
    } catch (error) {
      console.error("Error fetching live weather data", error);
      return [];
    }
  }

  // Process the fetched data and emit events if thresholds are met.
  async pollWeather() {
    const liveData = await this.fetchLiveWeatherData();
    // Example: iterate over data and emit an alert if snowfall meets the threshold.
    liveData.forEach((weatherItem) => {
      // Replace these fields and condition with your actual logic.
      const { resortId, snowfall, threshold, resortName } = weatherItem;
      if (snowfall >= threshold) {
        // Build an alert object with any details you need.
        const alert = {
          resortId,
          resortName,
          snowfall,
          timestamp: new Date(),
          message: `Live Alert: ${resortName} is reporting ${snowfall}in of snowfall.`,
        };
        // Emit the alert event.
        this.emit("weatherAlert", alert);
      }
    });
  }

  // Start polling at the specified interval (default is 60 seconds).
  start(pollInterval = 60000) {
    if (this.interval) return; // Already running
    this.interval = setInterval(() => this.pollWeather(), pollInterval);
    console.log("Live weather monitor started with interval", pollInterval);
  }

  // Stop the polling process.
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.log("Live weather monitor stopped");
    }
  }
}

export const liveWeatherMonitor = new LiveWeatherMonitor();
