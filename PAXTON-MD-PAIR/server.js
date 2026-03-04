const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const bodyParser = require('body-parser');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const { generateSessionId } = require('./mega');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Ensure directories exist
fs.ensureDirSync('./session');
fs.ensureDirSync('./temp');

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

// API: Generate pairing code
app.post('/api/pair', async (req, res) => {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number required' });
    }
    
    // Clean phone number (remove + and spaces)
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    
    if (cleanNumber.length < 10) {
        return res.status(400).json({ error: 'Invalid phone number' });
    }
    
    const sessionId = uuidv4();
    const sessionFolder = path.join(__dirname, 'session', sessionId);
    fs.ensureDirSync(sessionFolder);
    
    // Store pairing info
    activePairs.set(sessionId, {
        phoneNumber: cleanNumber,
        sessionFolder,
        status: 'starting',
        code: null,
        socketId: null
    });
    
    // Start pairing process
    startPairingProcess(sessionId, cleanNumber);
    
    res.json({ 
        success: true, 
        sessionId,
        message: 'Pairing process started'
    });
});

// API: Check pairing status
app.get('/api/status/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const pairInfo = activePairs.get(sessionId);
    
    if (!pairInfo) {
        return res.status(404).json({ error: 'Session not found' });
    }
    
    res.json({
        status: pairInfo.status,
        code: pairInfo.code,
        sessionId: pairInfo.sessionId
    });
});

// API: Get session ID after pairing
app.get('/api/session/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    const pairInfo = activePairs.get(sessionId);
    
    if (!pairInfo) {
        return res.status(404).json({ error: 'Session not found' });
    }
    
    if (pairInfo.status !== 'connected') {
        return res.status(400).json({ error: 'Not connected yet' });
    }
    
    try {
        // Generate Mega file ID as session ID
        const megaFileId = await generateSessionId(
            pairInfo.phoneNumber,
            pairInfo.sessionFolder
        );
        
        // Clean up
        activePairs.delete(sessionId);
        
        res.json({
            success: true,
            sessionId: megaFileId,
            message: 'Session generated successfully'
        });
    } catch (error) {
        console.error('Session generation error:', error);
        res.status(500).json({ error: 'Failed to generate session' });
    }
});

// ==================== WEBSOCKET ====================

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    socket.on('register', (data) => {
        const { sessionId } = data;
        if (activePairs.has(sessionId)) {
            const pairInfo = activePairs.get(sessionId);
            pairInfo.socketId = socket.id;
            activePairs.set(sessionId, pairInfo);
            
            // Send current status
            socket.emit('status', { 
                status: pairInfo.status,
                code: pairInfo.code 
            });
        }
    });
    
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// ==================== PAIRING PROCESS ====================

function startPairingProcess(sessionId, phoneNumber) {
    const pairInfo = activePairs.get(sessionId);
    
    // Spawn child process for pairing
    const child = spawn('node', ['pair-worker.js', sessionId, phoneNumber]);
    
    child.stdout.on('data', (data) => {
        const output = data.toString();
        console.log(`[${sessionId}]:`, output);
        
        // Parse pairing code from output
        const codeMatch = output.match(/PAIRING CODE:?\s*([A-Z0-9-]+)/i);
        if (codeMatch) {
            pairInfo.status = 'code_ready';
            pairInfo.code = codeMatch[1];
            activePairs.set(sessionId, pairInfo);
            
            // Send code via socket
            if (pairInfo.socketId) {
                io.to(pairInfo.socketId).emit('code', { code: codeMatch[1] });
            }
        }
        
        // Check for connection success
        if (output.includes('CONNECTED') || output.includes('success')) {
            pairInfo.status = 'connected';
            activePairs.set(sessionId, pairInfo);
            
            if (pairInfo.socketId) {
                io.to(pairInfo.socketId).emit('connected', { success: true });
            }
        }
    });
    
    child.stderr.on('data', (data) => {
        console.error(`[${sessionId}] Error:`, data.toString());
    });
    
    child.on('close', (code) => {
        console.log(`[${sessionId}] Process exited with code ${code}`);
    });
    
    // Store child process
    pairInfo.process = child;
    activePairs.set(sessionId, pairInfo);
}

// ==================== START SERVER ====================

server.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════╗
║    🌐 PAXTON-MD PAIRING WEB     ║
║    ━━━━━━━━━━━━━━━━━━━━━━━━━━   ║
║    Developer: Paxton Mathebula   ║
║    Server: http://localhost:${PORT}   ║
║    Status: 🟢 RUNNING            ║
╚══════════════════════════════════╝
    `);
});
