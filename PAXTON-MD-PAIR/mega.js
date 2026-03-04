const mega = require('megajs');
const fs = require('fs-extra');
const path = require('path');
const archiver = require('archiver');
require('dotenv').config();

/**
 * Upload session folder to Mega.nz and return file ID
 * @param {string} sessionPath - Path to session folder
 * @param {string} phoneNumber - Phone number for filename
 * @returns {Promise<string>} - Mega file ID
 */
async function uploadToMega(sessionPath, phoneNumber) {
    try {
        // Create zip file of session folder
        const zipPath = path.join(__dirname, 'temp', `${phoneNumber}_session.zip`);
        await createZip(sessionPath, zipPath);
        
        // Login to Mega
        const storage = await mega.login(
            process.env.MEGA_EMAIL,
            process.env.MEGA_PASSWORD
        );
        
        // Upload file
        const file = await storage.upload({
            name: `${phoneNumber}_session.zip`,
            size: fs.statSync(zipPath).size
        }, fs.createReadStream(zipPath));
        
        const uploadedFile = await file.complete();
        
        // Get file ID
        const fileId = uploadedFile.downloadId;
        
        // Clean up temp zip
        fs.removeSync(zipPath);
        
        return fileId;
    } catch (error) {
        console.error('Mega upload error:', error);
        throw error;
    }
}

/**
 * Create zip file from folder
 */
function createZip(folderPath, zipPath) {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        
        output.on('close', () => resolve());
        archive.on('error', (err) => reject(err));
        
        archive.pipe(output);
        archive.directory(folderPath, false);
        archive.finalize();
    });
}

/**
 * Generate session ID (Mega file ID)
 */
async function generateSessionId(phoneNumber, sessionFolder) {
    try {
        const fileId = await uploadToMega(sessionFolder, phoneNumber);
        return fileId;
    } catch (error) {
        console.error('Session ID generation error:', error);
        throw error;
    }
}

module.exports = { generateSessionId, uploadToMega };
