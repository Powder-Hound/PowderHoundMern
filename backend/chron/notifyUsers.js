import { User } from "../models/users.model.js";
import { ResortWeatherData } from "../models/resortWeatherData.model.js";

const range = [24, 48, 72]

const aggregateSnowfallForRange = (forecast, range) => {
    // Iterative loops are regulated by date value comparison rather than index values, 
    // because NOAA has variable length duration for each index. Some are 4hr, some 6hr, etc.
    // The data as stored as a isoString, so we convert it back to a date object for comparison
    // We calculate the last index value for the range set (ie if range is 48 hours, stop looping 48 hours before last value)
    // Then iterate through the forecast array, defining an endpoint for our period to compare against
    // Values within the nested loop are aggregated, then added to 'aggregates' with start and end points 

    // I am certain this can be rewritten more performantly, but I am also sure that this will work. 
    const toDate = (date) => {
        return new Date(date)
    }
    let endDate = new Date(forecast[forecast.length - 1].validTime)
    endDate.setDate(endDate.getDate() - (range / 24))
    let aggregates = [];
    let i = 0;
    while (toDate(forecast[i].validTime) <= endDate) {
        let sum = 0;
        let j = i
        let start = toDate(forecast[j].validTime)
        let end = toDate(start)
        end.setDate(end.getDate() + range / 24)
        while (toDate(forecast[j].validTime) < end) {
            sum += forecast[j].value
            j++
        }
        aggregates.push({ 'start:': forecast[i].validTime, 'end:': end, sum: sum })
        sum = 0
        j = 0;
        i++
    }
    return (aggregates)
}

const uomConverter = (measurement, uom, convertTo) => {
    switch (uom) {
        case 'mm':
            switch (convertTo) {
                case 'cm':
                    return measurement / 10
                case 'in':
                    return measurement / 25.4
            }
        case 'cm':
            switch (convertTo) {
                case 'mm':
                    return measurement * 10
                case 'in':
                    return measurement / 2.54
            }
        case 'in':
            switch (convertTo) {
                case 'mm':
                    return measurement * 25.4
                case 'cm':
                    return measurement * 2.54
            }
    }


}

const compileAggregates = (results) => {
    // A call is made once for each Range interval available as an enumerated option in users.model.js
    let aggregates = { NOAA: {}, visualCrossing: [] }
    for (let i = 0; i < results.length; i++) {
        let resortId = results[i].resortId
        let noaa = { [resortId]: [] }
        let visCross = { [resortId]: [] }
        for (let j = 0; j < range.length; j++) {
            noaa[`${resortId}`].push({ [range[j]]: aggregateSnowfallForRange(results[i].weatherData.NOAA.forecast.forecast, range[j]) })
            visCross[`${resortId}`].push({ [range[j]]: aggregateSnowfallForRange(results[i].weatherData.visualCrossing.forecast.forecast, range[j]) })
        }
        aggregates.NOAA[`${resortId}`] = noaa[`${resortId}`].map((resort) => ({ ...resort }));
        aggregates.visualCrossing[`${resortId}`] = visCross[`${resortId}`].map((resort) => ({ ...resort }));
    }
    return aggregates
}

const checkThresholds = (results) => {
    let aggregates = compileAggregates(results);
    let usersToNotify = [];
    results.forEach((resort) => {
        resort.usersWithResortPreference.forEach((user) => {
            const period = ['24', '48', '72']
            let userPeriod = period.indexOf(`${user.alertThreshold.snowfallPeriod}`)

            let aggregateMatchNOAA = aggregates.NOAA[resort.resortId][[userPeriod]][`${period[userPeriod]}`]
            let thresholdMetNOAA = aggregateMatchNOAA.some((val) => {
                let sum;
                if (resort.weatherData.NOAA.uom != user.alertThreshold.uom) {
                    sum = uomConverter(val.sum, resort.weatherData.NOAA.uom, user.alertThreshold.uom)
                } else {
                    sum = val.sum
                }
                return sum <= user.alertThreshold.preferredResorts
            })

            let aggregateMatchVC = aggregates.visualCrossing[resort.resortId][[userPeriod]][`${period[userPeriod]}`]
            let thresholdMetVC = aggregateMatchVC.some((val) => {
                let sum;
                if (resort.weatherData.visualCrossing.uom != user.alertThreshold.uom) {
                    sum = uomConverter(val.sum, resort.weatherData.visualCrossing.uom, user.alertThreshold.uom)
                } else {
                    sum = val.sum
                }
                return sum <= user.alertThreshold.preferredResorts
            })
            // console.log({[user.username]: {thresholdMetNOAA, thresholdMetVC, resortId: resort.resortId}})
            usersToNotify.push({ [user._id]: { thresholdMetNOAA, thresholdMetVC, resortId: resort.resortId } })
        })
    })
    return usersToNotify
}

export const checkResorts = async () => {
    console.time('Execution Time')
    try {
        ResortWeatherData.aggregate([
            {
                $lookup: {
                    from: "users", // Collection name of Users
                    let: { resortId: "$resortId" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $in: ["$$resortId", "$resortPreference.resorts"]
                                }
                            }
                        },
                        {
                            $project: {
                                _id: 1,
                                resortPreferences: 1,
                                alertThreshold: { preferredResorts: 1, snowfallPeriod: 1, uom: 1 }
                            }
                        }
                    ],
                    as: "usersWithResortPreference"
                }
            },
            {
                $match: {
                    "usersWithResortPreference.0": { $exists: true }
                }
            },
            {
                $project: {
                    resortId: 1,
                    weatherData: 1,
                    usersWithResortPreference: 1
                }
            }
        ])
            .then((results) => {
                const usersToNotify = checkThresholds(results)
                for (let i = 0; i < usersToNotify.length; i++) {
                    
                }
            }
            )
    } catch (error) {
        console.log(error)
    }
    console.timeEnd('Execution Time')
}