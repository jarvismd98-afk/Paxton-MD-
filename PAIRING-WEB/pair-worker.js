const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const fs = require('fs-extra');
const path = require('path');

const sessionId = process.argv[2];
const phoneNumber = process.argv[3];
const method = process.argv[4] || 'pairing';

if (!sessionId || !phoneNumber) {
    console.error('Missing arguments');
    process.exit(1);
}

// Format phone number (remove any leading zeros)
const formattedNumber = phoneNumber.replace(/^0+/, '');
console.log(`Phone: ${formattedNumber}`);
console.log(`Method: ${method}`);

const sessionFolder = path.join(__dirname, 'sessions', sessionId);
fs.ensureDirSync(sessionFolder);

async function startPairing() {
    console.log(`Starting ${method} for ${formattedNumber}...`);
    
    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
        const { version } = await fetchLatestBaileysVersion();
        
        console.log(`Baileys version: ${version.join('.')}`);
        
        const sock = makeWASocket({
            version: version,
            auth: state,
            printQRInTerminal: method === 'qr', // Print QR in terminal if QR method
            logger: pino({ level: 'fatal' }),
            browser: ['PAXTON-MD', 'Chrome', '4.0.1'],
            syncFullHistory: false,
            markOnlineOnConnect: false,
            generateHighQualityLinkPreview: false,
            defaultQueryTimeoutMs: 60000
        });

        let pairingCodeRequested = false;
        let qrSent = false;

        // Handle connection updates
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            console.log('Connection update:', connection || 'unknown');
            
            // Handle QR code for QR method
            if (qr && method === 'qr' && !qrSent) {
                qrSent = true;
                console.log(`QR CODE: ${qr}`);
                console.log('✅ Scan this QR code with WhatsApp');
            }
            
            // Handle pairing code method
            if (method === 'pairing') {
                // If we get a QR code, that means connection is ready for pairing code
                if (qr && !pairingCodeRequested) {
                    console.log('Connection ready, requesting pairing code...');
                    pairingCodeRequested = true;
                    
                    try {
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        
                        console.log('Requesting pairing code...');
                        const code = await sock.requestPairingCode(formattedNumber);
                        const formattedCode = code.match(/.{1,4}/g)?.join('-') || code;
                        
                        console.log(`PAIRING CODE: ${formattedCode}`);
                        console.log('✅ Check your WhatsApp now!');
                        
                    } catch (error) {
                        console.error('Failed to get pairing code:', error.message);
                        process.exit(1);
                    }
                }
                
                // Fallback: if connection opens without QR
                if (connection === 'open' && !pairingCodeRequested) {
                    pairingCodeRequested = true;
                    
                    try {
                        console.log('Connection open, requesting pairing code...');
                        const code = await sock.requestPairingCode(formattedNumber);
                        const formattedCode = code.match(/.{1,4}/g)?.join('-') || code;
                        
                        console.log(`PAIRING CODE: ${formattedCode}`);
                        console.log('✅ Check your WhatsApp now!');
                        
                    } catch (error) {
                        console.error('Failed to get pairing code:', error.message);
                        process.exit(1);
                    }
                }
            }
            
            if (connection === 'open') {
                console.log('✅ CONNECTED - WhatsApp paired successfully!');
                
                // Keep process alive a bit longer
                setTimeout(() => {
                    process.exit(0);
                }, 5000);
            }
            
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                console.log('Connection closed, status code:', statusCode);
                
                if (statusCode === DisconnectReason.loggedOut) {
                    console.error('LOGGED OUT');
                    process.exit(1);
                }
            }
        });
        
        // Save credentials when they update
        sock.ev.on('creds.update', saveCreds);
        
        // Add a timeout
        setTimeout(() => {
            if (method === 'pairing' && !pairingCodeRequested) {
                console.error('Timeout - could not get pairing code');
                process.exit(1);
            }
        }, 45000); // 45 second timeout
        
    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    }
}

startPairing();
