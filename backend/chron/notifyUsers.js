import { User } from "../models/users.model.js";
import { ResortWeatherData } from "../models/resortWeatherData.model.js";
import { send } from "process";

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

const compileAggregates = (resortId, weatherData) => {
    // A call is made once for each Range interval available as an enumerated option in users.model.js
    let returnAggregates = { [resortId]: {} }

    for (const dataSource in weatherData) {
        returnAggregates[[resortId]][dataSource] = { uom: weatherData[dataSource].uom };
        for (let j = 0; j < range.length; j++) {
            let rangeTitle = range[j].toString()
            let getAggregates = aggregateSnowfallForRange(weatherData[dataSource].forecast.forecast, range[j])
            returnAggregates[[resortId]][[dataSource]][[rangeTitle]] = getAggregates
        }
    }
    return returnAggregates
}

const checkThresholds = (user, aggregates) => {
    let userRange = user.alertThreshold.snowfallPeriod.toString()
    let resortId = Object.keys(aggregates).toString()
    let userMatched = [{
        resortId: resortId,
        sources: []
    }];
    let thresholdMetSource = null
    let count = 0
    let sourceInfo = [];

    for (const dataSource in aggregates[resortId]) {
        let sourceMatch = aggregates[resortId][[dataSource]][[userRange]]
        userMatched[0]["sources"].push(dataSource);

        sourceMatch.some((val) => {
            let sum
            if (aggregates[resortId][dataSource]['uom'] != user.alertThreshold.uom) {
                sum = uomConverter(val.sum, aggregates[resortId][dataSource]["uom"], user.alertThreshold.uom)
            } else {
                sum = val.sum
            }
            if (sum >= user.alertThreshold.preferredResorts) {
                count++
                thresholdMetSource = true
                sourceInfo.push(val)
            } else {
                return;
            }
        })
        if (sourceInfo.length > 0) {
            userMatched[0][dataSource] = { thresholdMet: thresholdMetSource, sourceInfo: sourceInfo }
        } else {
            userMatched[0][dataSource] = { thresholdMet: thresholdMetSource }
        }
    }

    let returnUser;

    userMatched[0]["sources"].forEach((source) => {
        if (userMatched[0][source].thresholdMet === true) {
            returnUser = userMatched
        } else {
            return
        }
    })

    return returnUser

}

export const checkResorts = async () => {
    console.time('Execution Time')
    let usersToNotify = {}
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
                                resortPreference: { resorts: 1, skiPass: 1 },
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
                results.forEach((resort) => {
                    let aggregates = compileAggregates(resort.resortId, resort.weatherData)
                    // console.log(resort.usersWithResortPreference)
                    resort.usersWithResortPreference.forEach((user) => {
                        // usersToNotify[user._id] = {}
                        let thresholdChecked = checkThresholds(user, aggregates)
                        if (thresholdChecked) {
                            if (usersToNotify.hasOwnProperty(user._id)) {
                                usersToNotify[user._id]["resorts"] = thresholdChecked
                            } else {
                                usersToNotify[user._id] = {}
                                usersToNotify[user._id]["resorts"] = thresholdChecked
                            }
                        }
                    })
                })
                return usersToNotify
            }
            )
    } catch (error) {
        console.log(error)
    }
    console.timeEnd('Execution Time')
}