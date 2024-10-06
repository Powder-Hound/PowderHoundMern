import { fetchForecast, fetchForecastLink } from "../externalAPI/noaaAPI.js";
import { Resort } from "../models/resorts.model.js";
import { ResortWeatherData } from "../models/resortWeatherData.model.js"

let lastChecked;
let fullResortsWithCoords = [];

const getAllResorts = async () => {
    try {
        const resorts = await Resort.find({}, {
            _id: 1,
            Latitude: 1,
            Longitude: 1
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
                let link = await fetchForecastLink(fullResortsWithCoords[i].Latitude, fullResortsWithCoords[i].Longitude)
                let forecast = await fetchForecast(await link)
                try {
                    const updateForecast = await ResortWeatherData.findOneAndUpdate(
                        { resortId: fullResortsWithCoords[i].resortId },
                        { $set: { weatherData: { noaa: { forecast } } } },
                        { upsert: true },
                        { new: true }
                    )
                    if (updateForecast) {
                        console.log(updateForecast)
                    } else {
                        const updateForecast = new ResortWeatherData({
                            'resortId': fullResortsWithCoords[i].resortId,
                            'weatherData': { noaa: { forecast } }
                        })
                        await updateForecast.save();
                    }
                } catch (err) {
                    console.log(err)
                }
            }
        })
}