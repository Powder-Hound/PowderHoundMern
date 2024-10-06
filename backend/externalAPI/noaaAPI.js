const apiURL = 'https://api.weather.gov/'
const userAgent = { 'User-Agent': 'api@powalert.com' }

// Due to NOAA's api layout, a call has to be made to fetch the forecast url 
// (can sometimes change- periodically refresh cached forecast url)
export const fetchForecastLink = async (lat, long) => {
    try {
        const response = await fetch(apiURL + `points/${lat},${long}`, {
            headers: userAgent
        })
            .then(response => response.json())
        return await response?.properties?.forecastGridData
    }
    catch (err) {
        console.log(err)
    }
}

export const fetchForecast = async (forecastLink) => {
    try {
        const response = await fetch(forecastLink, {
            headers: { userAgent }
        })
            .then(response => response.json())
        const predictedSnowfall = response.properties?.snowfallAmount.values
        let snowfallSum = 0;
        for (let i = 0; i < predictedSnowfall?.length; i++) {
            snowfallSum += predictedSnowfall[i]?.value;
        }
        return (snowfallSum, predictedSnowfall)
    } catch (err) {
        console.log(err)
    }
}


