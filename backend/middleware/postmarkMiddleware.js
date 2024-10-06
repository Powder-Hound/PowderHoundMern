// Require:
import postmark from 'postmark'

// Send an email:
var client = new postmark.ServerClient("1b034caf-daac-4858-8d82-6a7f1fe4251f");

export default client

// client.sendEmail({
//     "From": "sudo@powalert.com",
//     "To": "sudo@powalert.com",
//     "Subject": "Hello from Taite, testing Postmark",
//     "HtmlBody": "<h1>This is my first attempt with authorization</h1>",
//     "TextBody": "Let's hope this works!",
//     "MessageStream": "outbound"
//   });