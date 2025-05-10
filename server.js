const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const { GoogleSpreadsheet } = require('google-spreadsheet');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// PhonePe credentials (replace with your actual values)
const PHONEPE_MERCHANT_ID = 'YOUR_MERCHANT_ID';
const PHONEPE_SALT_KEY = 'YOUR_SALT_KEY';
const PHONEPE_SALT_INDEX = 1;

// Google Sheets setup
const doc = new GoogleSpreadsheet('YOUR_GOOGLE_SHEET_ID');
const CREDENTIALS = require('./credentials.json'); // Your Google API credentials

// Calculate PhonePe checksum
function calculateChecksum(payload) {
    const data = Buffer.from(JSON.stringify(payload)).toString('base64');
    const toHash = data + '/pg/v1/pay' + PHONEPE_SALT_KEY;
    const hash = crypto.createHash('sha256').update(toHash).digest('hex');
    return hash + '###' + PHONEPE_SALT_INDEX;
}

// Process payment endpoint
app.get('/process-payment', async (req, res) => {
    try {
        const { name, amount, transactionId } = req.query;
        const amountInPaise = Math.round(parseFloat(amount) * 100);

        const payload = {
            merchantId: PHONEPE_MERCHANT_ID,
            merchantTransactionId: transactionId,
            merchantUserId: 'USER_' + Date.now(),
            amount: amountInPaise,
            redirectUrl: `http://yourdomain.com/payment-success?transactionId=${transactionId}`,
            redirectMode: 'POST',
            callbackUrl: 'http://yourdomain.com/payment-webhook',
            paymentInstrument: {
                type: 'PAY_PAGE'
            }
        };

        const checksum = calculateChecksum(payload);
        const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');

        const response = await axios.post('https://api.phonepe.com/apis/hermes/pg/v1/pay', {
            request: base64Payload
        }, {
            headers: {
                'Content-Type': 'application/json',
                'X-VERIFY': checksum
            }
        });

        const paymentUrl = response.data.data.instrumentResponse.redirectInfo.url;
        res.redirect(paymentUrl);
    } catch (error) {
        console.error('Payment error:', error);
        res.status(500).send('Payment processing failed');
    }
});

// Payment success callback
app.post('/payment-success', async (req, res) => {
    const { transactionId } = req.body;
    res.send('Payment successful! Your transaction ID: ' + transactionId);
});

// Payment webhook (PhonePe will call this)
app.post('/payment-webhook', async (req, res) => {
    try {
        const response = req.body.response;
        const decoded = JSON.parse(Buffer.from(response, 'base64').toString());
        
        if (decoded.code === 'PAYMENT_SUCCESS') {
            // Authenticate with Google Sheets
            await doc.useServiceAccountAuth(CREDENTIALS);
            await doc.loadInfo();
            
            const sheet = doc.sheetsByIndex[0];
            await sheet.addRow({
                'Name': decoded.data.merchantTransactionId.split('|')[0],
                'Amount': (decoded.data.amount / 100).toFixed(2),
                'Transaction ID': decoded.data.transactionId,
                'Status': 'Success',
                'Date': new Date().toLocaleString()
            });
        }
        
        res.status(200).end();
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).end();
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));