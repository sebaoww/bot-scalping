// logger.js

const fs = require('fs');
const path = require('path');

// Percorso del file di log
const logFilePath = path.join(__dirname, 'app.log');

// Funzione per scrivere log su file
function writeLog(level, message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
    fs.appendFileSync(logFilePath, logMessage);
    console.log(logMessage.trim());
}

module.exports = {
    info: (message) => writeLog('INFO', message),
    warn: (message) => writeLog('WARN', message),
    error: (message) => writeLog('ERROR', message),
};
