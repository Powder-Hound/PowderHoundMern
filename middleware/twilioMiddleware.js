import dotenv from "dotenv";
import twilio from "twilio";
import sgMail from '@sendgrid/mail'
dotenv.config();

const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);
sgMail.setApiKey(process.env.SENDGRID_API_KEY)

export const sendVerificationCode = (req, res) => {
    try {
        client.verify.v2.services(process.env.TWILIO_VERIFY_SERVICE_SID)
            .verifications
            .create({ to: `+${req.body.phoneNumber}`, channel: 'sms' })
            .then(verification => console.log(verification.status, verification))
    } catch (e) {
        console.log(e)
        res.status(500).send(e);
        return
    }
    res.sendStatus(200);
}

export const verifyOTP = async (req, res) => {
    try {
        const check = await client.verify.v2
            .services(process.env.TWILIO_VERIFY_SERVICE_SID)
            .verificationChecks
            .create({ to: `+${req.body.phoneNumber}`, code: req.body.code })
            .catch(e => {
                console.log(e)
                res.status(500).send(e);
            });
        console.log(check)
        res.status(200).send(check);
    } catch (error) {
        console.log(error)
        res.status(400).send(error)
    }

};

export const sendTextMessage = (number, message) => {
    try {
        client.messages
            .create({
                body: message,
                to: number,
                from: '+18554267058'
            })
    } catch (error) {
        console.log(error)
    }
}

export const validatePhoneNumber = async (req, res) => {
    const phoneNumber = await client.lookups.v2
        .phoneNumbers(req.body.phoneNumber)
        .fetch()
        .catch((error) => {
            console.log(error)
            res.status(400).send(error)
        })

    if (phoneNumber.valid) {
        console.log(phoneNumber)
        res.status(200).send(phoneNumber)
    }
}

export const sendVerificationEmail = async (req, res) => {
    try {
        const verification = await client.verify.v2
            .services(process.env.TWILIO_VERIFY_SERVICE_SID)
            .verifications.create({
                channel: "email",
                channelConfiguration: {
                    template_id: "d-93502069b6154914be398a69cec69aa2",
                    from: "sign-in@powalert.com",
                    from_name: "PowAlert Sign In",
                },
                to: `${req.body.email}`,
            });
        res.status(200).send(verification.sid);
    } catch (error) {
        console.log(error)
        res.status(500).send(error);
        return
    }
}

export const emailVerificationCheck = async (req, res) => {
    try {
        const verificationCheck = await client.verify.v2
        .services(process.env.TWILIO_VERIFY_SERVICE_SID)
        .verificationChecks.create({
            code: req.body.code,
            to: req.body.email
        })
        res.status(200).send(verificationCheck)
    } catch (error) {
        res.status(500).send(error)
        console.error(error)
    }
}