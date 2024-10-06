import { fetchForecast, fetchForecastLink } from "../externalAPI/noaaAPI.js";
import { Resort } from "../models/resorts.model.js";
import { ResortWeatherData } from "../models/resortWeatherData.model.js"

let lastChecked;
let fullResortsWithCoords = [];

const getAllResorts = async () => {
    try {
        // noaa only works for US! We only need to grab coords and a reference to the resort
        const resorts = await Resort.find({'Country': 'United States'}, {
            _id: 1,
            Latitude: 1,
            Longitude: 1,
        })
        resorts.forEach(D => fullResortsWithCoords.push({ resortId: D._id, Latitude: D.Latitude, Longitude: D.Longitude }))
    }
    catch (err) {
        console.log(err)
    }
}


export const pullAPIData = async () => {
    await getAllResorts()
        .then(async () => {
            for (let i = 0; i < fullResortsWithCoords.length; i++) {
                try {
                    let link = await fetchForecastLink(fullResortsWithCoords[i].Latitude, fullResortsWithCoords[i].Longitude);
                    // test if link returnes undefined
                    if (link === undefined) {
                        throw new Error("Unable to get link")
                    }
                    let forecast = await fetchForecast(await link)
                    if (forecast === null) {
                        throw new Error("Unable to get forecast")
                    }
                    // Set reference to resort, populate weatherdata with attribution to source
                    const updateForecast = await ResortWeatherData.findOneAndUpdate(
                        { resortId: fullResortsWithCoords[i].resortId },
                        { $set: { weatherData: { noaa: { forecast } } } },
                        { upsert: true },
                        { new: true }
                    )
                    if (!updateForecast){
                        const updateForecast = new ResortWeatherData({
                            'resortId': fullResortsWithCoords[i].resortId,
                            'weatherData': { noaa: { forecast } }
                        })
                        await updateForecast.save();
                    }
                } catch (err) {
                    console.log(err, fullResortsWithCoords[i])
                }
                process.stdout.write(`\r\x1b[K---Fetching NOAA Data... (${i}/${fullResortsWithCoords.length} fetched)`)
            }
        })
    return console.log('NOAA Data updated')
}