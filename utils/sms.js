const fast2sms = require('fast-two-sms');

const sendSMS = async (message, contactNumber) => {
    const options = {
        authorization: process.env.FAST2SMS_API_KEY,
        message,
        numbers: [contactNumber],
    };

    try {
        const response = await fast2sms.sendMessage(options);
        return response;
    } catch (error) {
        throw new Error('SMS sending failed: ' + error.message);
    }
};

module.exports = { sendSMS }; 