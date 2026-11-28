import { Resort } from "../models/resorts.model.js";

export const getAllResorts = async (query = {}) => {
    let fullResortsWithCoords = [];
    try {
        // Same resorts and coordinates as before. resortName is only for failure logs.
        const resorts = await Resort.find(query, {
            _id: 1,
            resortName: 1,
            Latitude: 1,
            Longitude: 1,
        })
        resorts.forEach(D => fullResortsWithCoords.push({
            resortId: D._id,
            resortName: D.resortName,
            Latitude: D.Latitude,
            Longitude: D.Longitude,
        }))
    }
    catch (err) {
        console.log(err)
    }
    return fullResortsWithCoords
}