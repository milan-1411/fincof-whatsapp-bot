const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const express = require('express');
const qrcode = require('qrcode');

const app = express();
app.use(express.json());

let sock = null;
let currentQR = null;

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: require('pino')({ level: 'silent' }),
    syncFullHistory: false,
});
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            currentQR = qr;
            console.log('📱 QR code ready — visit http://localhost:3000/qr to scan');
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)
                && lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed. Reconnecting:', shouldReconnect);
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') {
            console.log('✅ WhatsApp Bot is Ready!');
            currentQR = null;
        }
    });
}

// QR code endpoint — open in browser to scan
app.get('/qr', async (req, res) => {
    if (!currentQR) {
        return res.send('<h2>✅ Already authenticated! No QR needed.</h2>');
    }
    const qrImage = await qrcode.toDataURL(currentQR);
    res.send(`<img src="${qrImage}" style="width:300px"/><p>Scan with WhatsApp</p>`);
});

// New registration notification
app.post('/new-registration', async (req, res) => {
    try {
        const { name, email } = req.body;
        const GROUP_ID = '120363424241835379@g.us';
        const message =
            `🎉 *New FInCoF'26 Registration!*\n` +
            `👤 *Name:* ${name}\n` +
            `📧 *Email:* ${email}\n\n` +
            `Welcome aboard! 🚀`;
        await sock.sendMessage(GROUP_ID, { text: message });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get groups
app.get('/get-groups', async (req, res) => {
    try {
        const groups = Object.values(await sock.groupFetchAllParticipating());
        res.json(groups.map(g => ({ name: g.subject, id: g.id })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));

connectToWhatsApp();