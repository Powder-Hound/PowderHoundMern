import dotenv from 'dotenv';
import readline from 'readline';
import twilio from 'twilio';
dotenv.config()

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

var readingline = readline.createInterface({
   input: process.stdin,
   output: process.stdout
});

function sendVerificationCode(phoneNumber) {
   return client.verify.v2.services(process.env.TWILIO_VERIFY_SERVICE_SID)
       .verifications
       .create({
           to: phoneNumber,
           channel: 'sms'
       }).then((data) => {
           return data.status;
       });
}

function checkVerification(phoneNumber, code) {
   return client.verify.v2.services(process.env.TWILIO_VERIFY_SERVICE_SID)
       .verificationChecks
       .create({
           to: phoneNumber,
           code: code
       }).then((data) => {
           return data.status;
       });
}

export const verifyUser = async (req, res, next) => {
  const phoneNumber = req.body.countryCode + req.body.phoneNumber;
  const status = await sendVerificationCode(phoneNumber);
   if (status === 'pending') {
         readingline.question('Enter code: ', code => {
           checkVerification(phoneNumber, code)
               .then((data) => {
                   if (data === 'approved') {
                        readingline.write('User verified');
                        readingline.close();
                        next();
                   } else {
                       readingline.write('User not verified');
                       readingline.close();
                   }
               });
       });

   }
   else {
       return 'Error sending verification code';
   }
}
