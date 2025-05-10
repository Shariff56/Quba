const express = require('express');
const { GoogleSpreadsheet } = require('google-spreadsheet');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Security headers middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Constants
const UPI_ID = '8123649448@axl';
const MAX_AMOUNT = 100000; // Safety limit (₹100,000)

// Record donation endpoint
app.post('/record-donation', async (req, res) => {
    try {
        const { name, amount } = req.body;

        // Input validation
        if (!name || !name.trim() || !amount) {
            return res.status(400).json({ 
                success: false, 
                message: 'Name and amount are required' 
            });
        }

        const amountNum = parseFloat(amount);
        if(isNaN(amountNum)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid amount' 
            });
        }

        if (amountNum <= 0 || amountNum > MAX_AMOUNT) {
            return res.status(400).json({ 
                success: false, 
                message: `Amount must be between ₹1 and ₹${MAX_AMOUNT}` 
            });
        }

        // Record to Google Sheets
        const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID);
        await doc.useServiceAccountAuth({
            client_email: process.env.GOOGLE_CLIENT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
        });
        await doc.loadInfo();
        
        const sheet = doc.sheetsByIndex[0];
        await sheet.addRow({
            'Date': new Date().toISOString(), // Standardized date format
            'Name': name.trim(),
            'Amount': amountNum,
            'Status': 'Pending',
            'Verified': 'No'
        });

        // Generate UPI payment link
        const transactionId = `DON-${Date.now()}`;
        const upiLink = `upi://pay?pa=${UPI_ID}&pn=Masjid-E-Quba&am=${amountNum}&tn=${transactionId}`;
        
        res.json({
            success: true,
            upiLink: upiLink,
            qrCode: `https://upiqr.in/?pa=${UPI_ID}&pn=Masjid-E-Quba&am=${amountNum}&tn=${transactionId}`,
            message: 'Please complete payment via UPI'
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error' 
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
