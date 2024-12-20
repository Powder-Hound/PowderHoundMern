import { fetchVisualCrossing } from "../externalAPI/visualCrossingAPI.js";
import { ResortWeatherData } from "../models/resortWeatherData.model.js"
import { getAllResorts } from "./mongoResortHelper.js";

let lastChecked = new Date().toISOString()

export const getAllVisualCrossingData = async () => {
    await getAllResorts()
        .then(async (fullResortsWithCoords) => {
            for (let i = 0; i < fullResortsWithCoords.length; i++) {
                try {
                    let fetched = await fetchVisualCrossing(fullResortsWithCoords[i].Latitude, fullResortsWithCoords[i].Longitude)
                    let forecast = fetched[0]
                    let uom = fetched[1]
                    const updateForecast = await ResortWeatherData.findOneAndUpdate(
                        { resortId: fullResortsWithCoords[i].resortId },
                        { $set:
                                {
                                    'weatherData.visualCrossing.forecast': { forecast },
                                    lastChecked: lastChecked,
                                    'weatherData.visualCrossing.uom': uom
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