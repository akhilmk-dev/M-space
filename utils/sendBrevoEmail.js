const Brevo = require("@getbrevo/brevo");
require("dotenv").config();

const apiInstance = new Brevo.TransactionalEmailsApi();
apiInstance.authentications["apiKey"].apiKey = process.env.BREVO_API_KEY;

async function sendBrevoEmail(toEmail, subject, htmlContent) {
  try {
    const sendSmtpEmail = new Brevo.SendSmtpEmail();

    sendSmtpEmail.subject = subject;
    sendSmtpEmail.htmlContent = htmlContent;
    sendSmtpEmail.sender = {
      name: "Mspace Learning App",
      email: "mspacenest@gmail.com",
    };
    sendSmtpEmail.to = [{ email: toEmail }];

    const data = await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log(" Email sent successfully via Brevo:", data.messageId);
    return data;
  } catch (error) {
    console.error(" Error sending email via Brevo:", error.message);
  }
}

module.exports = sendBrevoEmail;
