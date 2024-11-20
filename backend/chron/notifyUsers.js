import { User } from "../models/users.model.js";
import { ResortWeatherData } from "../models/resortWeatherData.model.js";
import { NotifyData } from "../models/notify.model.js"
import { sendTextMessage } from "../middleware/twilioMiddleware.js";
import client from "../middleware/postmarkMiddleware.js"

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

const checkThresholds = (user, aggregates, userThreshold, thresholdCategory) => {
    let userRange = user.alertThreshold.snowfallPeriod.toString()
    let resortIds = Object.keys(aggregates)
    let resortMatched = {};
    let thresholdMetSource = null

    for (let i in resortIds) {
        let resortId = resortIds[i]
        resortMatched[resortId] = {
            sources: []
        }
        for (const dataSource in aggregates[resortId]) {
            let sourceInfo = []
            let sourceMatch = aggregates[resortId][[dataSource]][[userRange]]
            resortMatched[resortId]["sources"].push(dataSource);

            sourceMatch.some((val) => {
                let sum
                if (aggregates[resortId][dataSource]['uom'] != user.alertThreshold.uom) {
                    sum = uomConverter(val.sum, aggregates[resortId][dataSource]["uom"], user.alertThreshold.uom)
                } else {
                    sum = val.sum
                }
                if (sum >= userThreshold) {
                    thresholdMetSource = true
                    sourceInfo.push(val)
                } else {
                    return;
                }
            })
            if (sourceInfo.length > 0) {
                resortMatched[resortId][dataSource] = {
                    thresholdMet: thresholdMetSource,
                    sourceInfo: sourceInfo,
                    category: thresholdCategory,
                    thresholdValidUntil: sourceInfo[sourceInfo.length - 1]['end:']
                }
            } else {
                continue
            }
        }
    }

    let returnUser = [];


    resortIds.forEach((resortId) => {
        let passedThresh = false
        resortMatched[resortId]["sources"].forEach((source) => {
            if (resortMatched[resortId][source]?.thresholdMet === true) {
                passedThresh = true
            }
        })
        if (passedThresh) {
            returnUser.push(resortMatched[resortId])
        }
    })

    if (returnUser.length > 0) {
        return returnUser
    }

}


let usersToNotify = {}

let compileUserInfo = (user, aggregates, userThreshold) => {
    let thresholdValue = user.alertThreshold[userThreshold]

    let thresholdChecked = checkThresholds(user, aggregates, thresholdValue, userThreshold)
    if (thresholdChecked) {
        if (usersToNotify.hasOwnProperty(user._id)) {
            usersToNotify[user._id]["resorts"][userThreshold] = thresholdChecked
        } else {
            usersToNotify[user._id] = {
                username: user.username,
                resorts: { [userThreshold]: thresholdChecked },
                prefThreshold: user.alertThreshold.preferredResorts,
                anyThreshold: user.alertThreshold.anyResort,
                uom: user.alertThreshold.uom,
                countryCode: user.countryCode,
                phoneNumber: user.phoneNumber,
                email: user?.email,
                notificationPref: user.notificationsActive
            }
        }
        return true

    }
}

const getUsers = () => {
    try {
        return User.aggregate([
            {
                $match: {
                    $or: [
                        { "notificationsActive.phone": { $eq: true } },
                        { "notificationsActive.email": { $eq: true } }
                    ]
                }
            },
            {
                $project: {
                    _id: 1,
                    username: 1,
                    resortPreference: { resorts: 1, skiPass: 1 },
                    alertThreshold: { preferredResorts: 1, anyResort: 1, snowfallPeriod: 1, uom: 1 },
                    countryCode: 1,
                    phoneNumber: 1,
                    email: 1,
                    notificationsActive: { phone: 1, email: 1 },
                }
            }
        ])
            .then((results) => { return results })
    } catch (error) {
        console.error(error)
    }
}

const getAllResorts = () => {
    try {
        let allAggregates = {}
        return ResortWeatherData.find({})
            .then((results) => {
                results.forEach((resort) => {
                    allAggregates[resort.resortId] = compileAggregates(resort.resortId, resort.weatherData)[resort.resortId]
                })
                return allAggregates
            })
    } catch (error) {
        console.error(error)
    }
}

const getPreviousResults = async () => {
    try {
        return NotifyData.find({}, 
            {
                userId: 1,
                previousMatches: 1
            }
        )
        .then((results) => {return results})
    } catch (error) {
        throw new Error(error)
    }
}

const pushResults = async (userId, userResorts) => {
    try {
        const updateResults = await NotifyData.findOneAndUpdate({
            userId: userId
        },
            {
                $set: {
                    previousMatches: userResorts
                }
            },
            { upsert: true },
            { new: true }
        )
    } catch (error) {
        console.error(error)
    }
}

const checkForChanges = (usersToNotify, previousData) => {
    for (let previousUser in previousData) {
        let userId = previousData[previousUser].userId
        // First, check if updated user is already in the previous data. If they're not, nothing needs to happen. 
        if (Object.keys(usersToNotify).includes(userId)) {
            // If a user is in the previous data segment and that data is an exact 1-1 match, remove user from list of people to be notified. 
            // (They already were last time, when the previous data was pushed to the DB. This applies to APIs that update daily, not hourly.)
            if (JSON.stringify(previousData[previousUser].resorts) === JSON.stringify(usersToNotify.resorts)){
                usersToNotify[userId] = undefined
                return
            }

        } else {
            return
        }
    }
}

export const checkResorts = async () => {
    console.time('Execution Time')

    let previousData = await getPreviousResults()
    const allAggregates = await getAllResorts()
    const allUsers = await getUsers();
    let allAggregatesKeys = Object.keys(allAggregates)
    allUsers.forEach(async (user) => {
        let matchedResorts = {}
        let unmatchedResorts = {}
        allAggregatesKeys.forEach((resort) => {
            if (user.resortPreference.resorts.includes(resort)) {
                matchedResorts[resort] = allAggregates[resort]
            } else {
                unmatchedResorts[resort] = allAggregates[resort]
            }
        })
        compileUserInfo(user, matchedResorts, 'preferredResorts')
        compileUserInfo(user, unmatchedResorts, 'anyResort')
        if (usersToNotify[user._id.toString()]) {
            let resorts = usersToNotify[user._id.toString()].resorts
            // pushResults(user._id, resorts)
        }
    })
    console.timeEnd('Execution Time')
    console.log(Object.keys(usersToNotify).length)
    checkForChanges(usersToNotify, previousData)
    console.log(Object.keys(usersToNotify).length)
    // sendUserNotifications(usersToNotify)
    return usersToNotify
}

const sendUserNotifications = (usersToNotify) => {
    for (let userId in usersToNotify) {
        let user = usersToNotify[userId]
        let sumOfPrefResorts
        user.resorts.preferredResorts ? sumOfPrefResorts = Object.keys(user.resorts?.preferredResorts).length : null
        let sumOfAnyResorts
        user.resorts.anyResort ? sumOfAnyResorts = Object.keys(user.resorts?.anyResort).length : null

        let messageEndings = ['hit the slopes!', 'shred.', 'conquer!', 'hit a black diamond.', 'shred the gnar.', 'carve up.', 'bomb.', 'drop in!', 'make fresh tracks.']
        let prefMessage = `${sumOfPrefResorts} preferred ${sumOfPrefResorts > 1 ? "resorts" : "resort"} with over ${user.prefThreshold}${user.uom} of snow`
        let anyMessage = `${sumOfAnyResorts} ${sumOfAnyResorts > 1 ? "resorts" : "resort"} with over ${user.anyThreshold}${user.uom} of snow`
        let finalMessage
        let messageEnd = messageEndings[Math.floor(Math.random() * (messageEndings.length))]
        if (sumOfPrefResorts && sumOfAnyResorts) {
            finalMessage = prefMessage + ' and ' + anyMessage + ' ready to ' + messageEnd
        } else if (sumOfPrefResorts) {
            finalMessage = prefMessage + ' ready to ' + messageEnd
        } else if (sumOfAnyResorts) {
            finalMessage = anyMessage + ' ready to ' + messageEnd
        }
        let message = `Hello, ${user.username}! You have ${finalMessage} 
To see details, head to https://www.powalert.com/. 
        
Click here to change your preferences or unsubscribe: https://www.powalert.com/deactivate`
        let notificationPref = user.notificationPref
        if (notificationPref.phone === true) {
            try {
                // sendTextMessage(user.phoneNumber, message)
            } catch (error) {
                console.error(error)
            }
            // console.log(message)
        }
        if (notificationPref.email === true) {
            try {
                // client.sendEmail({
                //         "From": "sudo@powalert.com",
                //         "To": `${user.email}`,
                //         "Subject": "New matches for your alerts",
                //         // "HtmlBody": message,
                //         "TextBody": `${message}`,
                //         "MessageStream": "outbound"
                //       });
            } catch (error) {
                console.error(error)
            }
        }
    }

    console.log('messages sent')
}