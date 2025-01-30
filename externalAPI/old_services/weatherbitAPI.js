const apiURL = 'http://api.weatherbit.io/v2.0/forecast/daily'
import dotenv from 'dotenv';
dotenv.config();

const API_KEY = process.env.WEATHERBIT_KEY;

export const fetchWeatherBit = async (lat, long) => {
    try {
        const response = await fetch(apiURL + `?lat=${lat}&lon=${long}&key=${API_KEY}`)
            .then(response => response.json())
        const forecast = {};
        for (let i = 0; i < response.data.length; i++) {
            forecast[i] = {
                'validTime': response.data[i].valid_date,
                'snow': response.data[i].snow
            }
        }
        return forecast
    } catch (err) {
        console.log(err)
    }
}