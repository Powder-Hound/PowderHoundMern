const apiURL = 'https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/'
import dotenv from 'dotenv';
dotenv.config();

const API_KEY = process.env.VISUALCROSSING_KEY;

export const fetchVisualCrossing = async (lat, long) => {
    try {
        const response = await fetch(apiURL + `${lat},${long}?key=${API_KEY}`)
            .then(response => response.json())
        const forecast = {};
        for (let i = 0; i < response.days.length; i++) {
            forecast[i] = {
                'validTime': response.days[i].datetime,
                'snow': response.days[i].snow
            }
        }
        return forecast
    } catch (err) {
        console.log(err)
    }
}