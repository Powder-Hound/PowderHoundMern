export default {
  sendEmail: ({ To, Subject, TextBody }) => {
    console.log(`Mocked Postmark: Sending email to ${To}, Subject: ${Subject}`);
  },
};
