// src/utils/conversions.js

export const convertToMetric = (data) => ({
  snow: {
    value: data.snow.value * 2.54, // Convert inches to cm
    snowDepth: data.snow.snowDepth * 2.54, // Convert inches to cm
  },
  temperature: {
    max: ((data.temperature.max - 32) * 5) / 9, // Fahrenheit to Celsius
    min: ((data.temperature.min - 32) * 5) / 9,
    avg: ((data.temperature.avg - 32) * 5) / 9,
  },
  wind: {
    speed: data.wind.speed * 1.60934, // mph to km/h
    gust: data.wind.gust * 1.60934,
  },
  visibility: data.visibility * 1.60934, // Miles to km
  pressure: data.pressure * 33.8639, // inHg to hPa
});

export const convertToStandard = (data) => ({
  snow: {
    value: data.snow.value / 2.54, // Convert cm to inches
    snowDepth: data.snow.snowDepth / 2.54, // Convert cm to inches
  },
  temperature: {
    max: (data.temperature.max * 9) / 5 + 32, // Celsius to Fahrenheit
    min: (data.temperature.min * 9) / 5 + 32,
    avg: (data.temperature.avg * 9) / 5 + 32,
  },
  wind: {
    speed: data.wind.speed / 1.60934, // km/h to mph
    gust: data.wind.gust / 1.60934,
  },
  visibility: data.visibility / 1.60934, // km to miles
  pressure: data.pressure / 33.8639, // hPa to inHg
});
