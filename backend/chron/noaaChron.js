import { fetchForecast, fetchForecastLink } from "../externalAPI/noaaAPI.js";
import { ResortWeatherData } from "../models/resortWeatherData.model.js"
import { getAllResorts } from "./mongoResortHelper.js";

let lastChecked = new Date().toISOString();
let query = { 'Country': 'United States' }

export const getAllNOAAData = async () => {
    await getAllResorts(query)
        .then(async (fullResortsWithCoords) => {
            for (let i = 0; i < fullResortsWithCoords.length; i++) {
                try {
                    let link = await fetchForecastLink(fullResortsWithCoords[i].Latitude, fullResortsWithCoords[i].Longitude);
                    // test if link returnes undefined
                    if (link === undefined) {
                        throw new Error("Unable to get link")
                    }
                    let fetched = await fetchForecast(await link)
                    let forecast = fetched[0]
                    let uom = fetched[1]
                    if (forecast === null) {
                        throw new Error("Unable to get forecast")
                    }
                    // Set reference to resort, populate weatherdata with attribution to source
                    const updateForecast = await ResortWeatherData.findOneAndUpdate(
                        { resortId: fullResortsWithCoords[i].resortId },
                        { $set:
                            {
                                'weatherData.NOAA.forecast': { forecast },
                                lastChecked: lastChecked,
                                'weatherData.NOAA.uom': uom
                            }
                    },
                        { upsert: true },
                        { new: true }
                    )
                } catch (err) {
                    console.log("Error in NOAA Chron: " + err)
                }
                process.stdout.write(`\r\x1b[K---Fetching NOAA Data... (${i + 1}/${fullResortsWithCoords.length} fetched)`)
            }
        })
    console.log('\r')
    return console.log('NOAA Data updated')
}