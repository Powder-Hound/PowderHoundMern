const apiURL = 'https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/'
import dotenv from 'dotenv';
dotenv.config();

const API_KEY = process.env.VISUALCROSSING_KEY;

export const fetchVisualCrossing = async (lat, long) => {
    try {
        const response = await fetch(apiURL + `${lat},${long}?&key=${API_KEY}`)
            .then(response => response.json())
        const forecast = {};
        // VC set to return snow forecast in cm
        let uom = 'cm';
        for (let i = 0; i < response.days.length; i++) {
            forecast[i] = {
                'validTime': response.days[i].datetime,
                'value': response.days[i].snow
            }
        }
        return ([Object.values(forecast), uom])
    } catch (err) {
        console.log(err)
    }
}