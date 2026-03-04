const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const fs = require('fs-extra');
const path = require('path');

// Get arguments
const sessionId = process.argv[2];
const phoneNumber = process.argv[3];

if (!sessionId || !phoneNumber) {
    console.error('Missing arguments');
    process.exit(1);
}

const sessionFolder = path.join(__dirname, 'session', sessionId);
fs.ensureDirSync(sessionFolder);

async function startPairing() {
    console.log(`Starting pairing for ${phoneNumber}...`);
    
    const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ['PAXTON-MD', 'Chrome', '4.0.1'],
        syncFullHistory: false,
        markOnlineOnConnect: false
    });
    
    // Request pairing code
    if (!sock.authState.creds.registered) {
        try {
            const code = await sock.requestPairingCode(phoneNumber);
            console.log(`PAIRING CODE: ${code}`);
        } catch (error) {
            console.error('Failed to get pairing code:', error);
            process.exit(1);
        }
    }
    
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'open') {
            console.log('CONNECTED - WhatsApp paired successfully!');
            
            // Wait a bit for credentials to save
            setTimeout(() => {
                process.exit(0);
            }, 2000);
        }
        
        if (connection === 'close') {
            const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
            if (reason === DisconnectReason.loggedOut) {
                console.error('Logged out');
                process.exit(1);
            } else {
                console.log('Connection closed, retrying...');
            }
        }
    });
    
    sock.ev.on('creds.update', saveCreds);
}

startPairing().catch(console.error);
