export const normalizeWeatherData = (apiData) => {
  const { name, country, forecast, base, mid, upper } = apiData;

  // Transform forecast into a ten-day array
  const tenDayOutlook = forecast.slice(0, 10).map((day) => day.snow_in || 0);

  // Return normalized data
  return {
    name,
    location: country, // Assuming 'country' is used for location
    last24Hours: base?.freshsnow_in || 0, // Snowfall at base level
    windMph: base?.windspd_mph || 0, // Wind speed at base
    temperature: base?.temp_f || "N/A", // Temperature at base
    tenDayOutlook,
  };
};
