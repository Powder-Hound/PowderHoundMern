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
        console.log(err.status + ": NOAA Forecast Link Error")
    }
}

export const fetchForecast = async (forecastLink) => {
    try {
        const response = await fetch(forecastLink, {
            headers: { userAgent }
        })
            .then(response => response.json())
        const predictedSnowfall = response.properties?.snowfallAmount.values
        let uom = response.properties?.snowfallAmount?.uom
        if (uom && uom.includes(':')) {
            uom = uom.split(':')[1]
        }
        if (predictedSnowfall) {
            for (let i = 0; i < predictedSnowfall.length; i++) {
                if (predictedSnowfall[i].validTime.includes('/')) {
                    let truncatedVT = predictedSnowfall[i].validTime.split("/")
                    predictedSnowfall[i].validTime = truncatedVT[0]
                }
            }
        }
        // console.log(predictedSnowfall)
        return (predictedSnowfall ? [predictedSnowfall, uom] : null)
    } catch (err) {
        console.log(err + ": NOAA Forecast Error")
    }
}


