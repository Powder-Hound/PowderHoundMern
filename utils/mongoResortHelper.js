import { Resort } from "../models/resorts.model.js";

export const getAllResorts = async (query = {}) => {
    let fullResortsWithCoords = [];
    try {
        // We only need to grab coords and a reference to the resort
        const resorts = await Resort.find(query, {
            _id: 1,
            resortName: 1,
            Country: 1,
            Latitude: 1,
            Longitude: 1,
            forecastPoint: 1,
        })
        resorts.forEach(D => fullResortsWithCoords.push({
            resortId: D._id,
            resortName: D.resortName,
            Country: D.Country,
            Latitude: D.Latitude,
            Longitude: D.Longitude,
            forecastPoint: D.forecastPoint,
        }))
    }
    catch (err) {
        console.log(err)
    }
    return fullResortsWithCoords
}