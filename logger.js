// logger.js

const fs = require('fs');
const path = require('path');
require('dotenv').config(); // Per leggere .env

// Percorso del file log
const logFilePath = path.join(__dirname, 'app.log');

// Legge VERBOSE_MODE dal file .env
const VERBOSE_MODE = process.env.VERBOSE_MODE === 'true';

// Funzione per scrivere un messaggio di log
function writeLog(level, message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;

    // Se verbose attivo, logga tutto. Se no, solo WARN ed ERROR.
    if (VERBOSE_MODE || level !== 'INFO') {
        fs.appendFileSync(logFilePath, logMessage);
        console.log(logMessage.trim());
    }
}

module.exports = {
    info: (msg) => writeLog('INFO', msg),
    warn: (msg) => writeLog('WARN', msg),
    error: (msg) => writeLog('ERROR', msg),
};
