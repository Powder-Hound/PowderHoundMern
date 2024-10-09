import { fetchVisualCrossing } from "../externalAPI/visualCrossingAPI.js";
import { ResortWeatherData } from "../models/resortWeatherData.model.js"
import { getAllResorts } from "./mongoResortHelper.js";

let lastChecked = new Date().toISOString()

export const getAllVisualCrossingData = async () => {
    await getAllResorts()
        .then(async (fullResortsWithCoords) => {
            for (let i = 0; i < fullResortsWithCoords.length; i++) {
                try {
                    let forecast = await fetchVisualCrossing(fullResortsWithCoords[i].Latitude, fullResortsWithCoords[i].Longitude)
                    const updateForecast = await ResortWeatherData.findOneAndUpdate(
                        { resortId: fullResortsWithCoords[i].resortId },
                        { $set:
                                {
                                    'weatherData.visualCrossing': { forecast },
                                    lastChecked: lastChecked
                                }
                        },
                        { upsert: true },
                        { new: true }
                    )

                } catch (err) {
                    console.log("Error in VisualCrossing Chron: " + err)
                }
                process.stdout.write(`\r\x1b[K---Fetching VisualCrossing Data... (${i + 1}/${fullResortsWithCoords.length} fetched)`)
            }
        })
    console.log('\r')
    return console.log('VisualCrossing Data updated')
}