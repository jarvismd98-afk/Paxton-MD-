const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const bodyParser = require('body-parser');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const megajs = require('megajs');
const archiver = require('archiver');
const QRCode = require('qrcode');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const compression = require('compression');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

const PORT = process.env.PORT || 3001;
const OWNER_NUMBERS = (process.env.OWNER_NUMBERS || '').split(',');

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false,
}));
app.use(compression());
app.use(cors());

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

// Ensure directories exist
fs.ensureDirSync('./sessions');
fs.ensureDirSync('./temp');
fs.ensureDirSync('./qr-codes');

// Store active pairing processes
const activePairs = new Map();

// ==================== ROUTES ====================

// Home page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Pair page
app.get('/pair', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'pair.html'));
});

// QR page
app.get('/qr', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'qr.html'));
});

// Success page
app.get('/success', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'success.html'));
});

// API: Check if number is owner
app.post('/api/check-owner', (req, res) => {
    const { phoneNumber } = req.body;
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    const isOwner = OWNER_NUMBERS.includes(cleanNumber);
    res.json({ isOwner, ownerName: process.env.OWNER_NAME });
});

// API: Generate pairing code
app.post('/api/pair', async (req, res) => {
    const { phoneNumber, method } = req.body;
    
    if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number required' });
    }
    
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    
    if (cleanNumber.length < 10 || cleanNumber.length > 15) {
        return res.status(400).json({ error: 'Invalid phone number format' });
    }
    
    // Check if too many active sessions
    if (activePairs.size >= (process.env.MAX_SESSIONS || 50)) {
        return res.status(429).json({ error: 'Too many active sessions. Please try again later.' });
    }
    
    const sessionId = uuidv4();
    const sessionFolder = path.join(__dirname, 'sessions', sessionId);
    fs.ensureDirSync(sessionFolder);
    
    console.log(`[${sessionId}] Created session for ${cleanNumber} (Method: ${method || 'pairing'})`);
    
    activePairs.set(sessionId, {
        phoneNumber: cleanNumber,
        sessionFolder,
        status: 'starting',
        code: null,
        qrPath: null,
        socketId: null,
        method: method || 'pairing',
        createdAt: Date.now(),
        isOwner: OWNER_NUMBERS.includes(cleanNumber)
    });
    
    // Start pairing process
    startPairingProcess(sessionId, cleanNumber, method);
    
    res.json({ 
        success: true, 
        sessionId,
        method: method || 'pairing',
        message: 'Pairing process started'
    });
});

// API: Get QR code
app.get('/api/qr/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const pairInfo = activePairs.get(sessionId);
    
    if (!pairInfo || !pairInfo.qrPath) {
        return res.status(404).json({ error: 'QR code not found' });
    }
    
    res.sendFile(pairInfo.qrPath);
});

// API: Check pairing status
app.get('/api/status/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const pairInfo = activePairs.get(sessionId);
    
    if (!pairInfo) {
        return res.status(404).json({ error: 'Session not found or expired' });
    }
    
    res.json({
        status: pairInfo.status,
        code: pairInfo.code,
        method: pairInfo.method,
        isOwner: pairInfo.isOwner,
        sessionId
    });
});

// API: Upload to Mega and get session ID
app.post('/api/upload/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    const pairInfo = activePairs.get(sessionId);
    
    if (!pairInfo) {
        return res.status(404).json({ error: 'Session not found' });
    }
    
    if (pairInfo.status !== 'connected') {
        return res.status(400).json({ error: 'Not connected yet' });
    }
    
    try {
        // Create zip file
        const zipPath = path.join(__dirname, 'temp', `${sessionId}.zip`);
        await createZip(pairInfo.sessionFolder, zipPath);
        
        // Upload to Mega
        const megaFileId = await uploadToMega(zipPath, pairInfo.phoneNumber);
        
        console.log(`[${sessionId}] Session uploaded to Mega: ${megaFileId}`);
        
        // Clean up
        fs.removeSync(zipPath);
        fs.removeSync(pairInfo.sessionFolder);
        if (pairInfo.qrPath) fs.removeSync(pairInfo.qrPath);
        activePairs.delete(sessionId);
        
        res.json({
            success: true,
            sessionId: megaFileId,
            message: 'Session generated successfully'
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Failed to upload session' });
    }
});

// ==================== FUNCTIONS ====================

async function createZip(folderPath, zipPath) {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        
        output.on('close', resolve);
        archive.on('error', reject);
        
        archive.pipe(output);
        archive.directory(folderPath, false);
        archive.finalize();
    });
}

async function uploadToMega(filePath, phoneNumber) {
    try {
        const storage = await megajs.login(
            process.env.MEGA_EMAIL,
            process.env.MEGA_PASSWORD
        );
        
        const stats = fs.statSync(filePath);
        
        const file = await storage.upload({
            name: `${phoneNumber}_session.zip`,
            size: stats.size
        }, fs.createReadStream(filePath));
        
        const uploadedFile = await file.complete();
        return uploadedFile.downloadId;
    } catch (error) {
        console.error('Mega upload error:', error);
        throw error;
    }
}

async function saveQRCode(qrData, sessionId) {
    try {
        const qrPath = path.join(__dirname, 'qr-codes', `${sessionId}.png`);
        await QRCode.toFile(qrPath, qrData);
        return qrPath;
    } catch (error) {
        console.error('QR save error:', error);
        return null;
    }
}

// ==================== WEBSOCKET ====================

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    socket.on('register', (data) => {
        const { sessionId } = data;
        if (activePairs.has(sessionId)) {
            const pairInfo = activePairs.get(sessionId);
            pairInfo.socketId = socket.id;
            activePairs.set(sessionId, pairInfo);
            
            console.log(`[${sessionId}] Registered with socket ${socket.id}`);
            
            // Send current status immediately
            socket.emit('status', { 
                status: pairInfo.status,
                code: pairInfo.code,
                method: pairInfo.method,
                isOwner: pairInfo.isOwner
            });
        }
    });
    
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// ==================== PAIRING PROCESS ====================

function startPairingProcess(sessionId, phoneNumber, method = 'pairing') {
    const pairInfo = activePairs.get(sessionId);
    
    console.log(`[${sessionId}] Starting ${method} worker for ${phoneNumber}`);
    
    const child = spawn('node', ['pair-worker.js', sessionId, phoneNumber, method]);
    
    let codeFound = false;
    let connectedFound = false;
    let qrSaved = false;
    
    child.stdout.on('data', async (data) => {
        const output = data.toString();
        console.log(`[${sessionId}]`, output.trim());
        
        // Look for QR code
        const qrMatch = output.match(/QR CODE:?\s*([A-Za-z0-9@:%._\+~#=]+)/i);
        if (qrMatch && !qrSaved && method === 'qr') {
            qrSaved = true;
            const qrPath = await saveQRCode(qrMatch[1], sessionId);
            if (qrPath) {
                pairInfo.qrPath = qrPath;
                pairInfo.status = 'qr_ready';
                activePairs.set(sessionId, pairInfo);
                
                if (pairInfo.socketId) {
                    io.to(pairInfo.socketId).emit('qr', { qrUrl: `/api/qr/${sessionId}` });
                }
            }
        }
        
        // Look for pairing code
        const codeMatch = output.match(/PAIRING CODE:?\s*([A-Z0-9-]+)/i);
        if (codeMatch && !codeFound) {
            codeFound = true;
            pairInfo.status = 'code_ready';
            pairInfo.code = codeMatch[1];
            activePairs.set(sessionId, pairInfo);
            
            console.log(`[${sessionId}] ✅ Code generated: ${codeMatch[1]}`);
            
            if (pairInfo.socketId) {
                io.to(pairInfo.socketId).emit('code', { code: codeMatch[1] });
            }
        }
        
        // Look for success message
        if (output.includes('✅ Check your WhatsApp now')) {
            console.log(`[${sessionId}] Code sent to WhatsApp`);
        }
        
        // Look for actual connection
        if (output.includes('CONNECTED')) {
            connectedFound = true;
            pairInfo.status = 'connected';
            activePairs.set(sessionId, pairInfo);
            
            console.log(`[${sessionId}] ✅ Connected successfully`);
            
            if (pairInfo.socketId) {
                io.to(pairInfo.socketId).emit('connected', { success: true });
            }
            
            // Trigger upload after connection
            setTimeout(() => {
                axios.post(`http://localhost:${PORT}/api/upload/${sessionId}`)
                    .then(response => {
                        console.log(`[${sessionId}] Upload successful:`, response.data);
                    })
                    .catch(error => {
                        console.error(`[${sessionId}] Upload failed:`, error.message);
                    });
            }, 5000);
        }
    });
    
    child.stderr.on('data', (data) => {
        console.error(`[${sessionId}] Error:`, data.toString());
    });
    
    child.on('close', (code) => {
        console.log(`[${sessionId}] Worker exited with code ${code}`);
        
        // If process exited without connecting, update status
        if (!connectedFound && activePairs.has(sessionId)) {
            if (!codeFound && !qrSaved) {
                pairInfo.status = 'failed';
                activePairs.set(sessionId, pairInfo);
                
                if (pairInfo.socketId) {
                    io.to(pairInfo.socketId).emit('error', { message: 'Pairing failed. Please try again.' });
                }
                
                // Clean up after 30 seconds
                setTimeout(() => {
                    if (activePairs.has(sessionId)) {
                        fs.removeSync(pairInfo.sessionFolder);
                        if (pairInfo.qrPath) fs.removeSync(pairInfo.qrPath);
                        activePairs.delete(sessionId);
                    }
                }, 30000);
            }
        }
    });
    
    child.on('error', (err) => {
        console.error(`[${sessionId}] Worker error:`, err);
    });
    
    pairInfo.process = child;
    activePairs.set(sessionId, pairInfo);
}

// Cleanup old sessions (older than 10 minutes)
setInterval(() => {
    const now = Date.now();
    for (const [sessionId, info] of activePairs.entries()) {
        if (now - info.createdAt > 600000) { // 10 minutes
            console.log(`[${sessionId}] Cleaning up expired session`);
            if (info.process) {
                try {
                    info.process.kill();
                } catch (e) {}
            }
            fs.removeSync(info.sessionFolder);
            if (info.qrPath) fs.removeSync(info.qrPath);
            activePairs.delete(sessionId);
        }
    }
}, 60000); // Check every minute

// Cleanup old QR codes periodically
setInterval(() => {
    const qrDir = path.join(__dirname, 'qr-codes');
    if (fs.existsSync(qrDir)) {
        const files = fs.readdirSync(qrDir);
        const now = Date.now();
        files.forEach(file => {
            const filePath = path.join(qrDir, file);
            const stats = fs.statSync(filePath);
            if (now - stats.mtimeMs > 3600000) { // 1 hour
                fs.removeSync(filePath);
            }
        });
    }
}, 3600000); // Every hour

// ==================== START SERVER ====================

server.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════╗
║    🌑 PAXTON-MD DARK WEB 🌑     ║
╠══════════════════════════════════╣
║  Owner: ${process.env.OWNER_NAME}        
║  Number: ${process.env.OWNER_NUMBER}        
║  Bot: ${process.env.BOT_NAME}            
║  Server: http://localhost:${PORT}        
║  Status: 🟢 RUNNING              
║  Mode: 🔥 PROFESSIONAL           
║  Theme: 🖤 DARK MODE 🖤           
╚══════════════════════════════════╝
    `);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down gracefully...');
    
    // Kill all child processes
    for (const [sessionId, info] of activePairs.entries()) {
        if (info.process) {
            try {
                info.process.kill();
            } catch (e) {}
        }
        fs.removeSync(info.sessionFolder);
        if (info.qrPath) fs.removeSync(info.qrPath);
    }
    
    process.exit(0);
});

process.on('SIGTERM', () => {
    process.exit(0);
});
