const fs = require('fs');
const path = require('path');

const LSN_FILE = path.join('/app/state', 'lsn_checkpoint.txt');

function readLSN() {
  try {
    if (fs.existsSync(LSN_FILE)) {
      const lsn = fs.readFileSync(LSN_FILE, 'utf8').trim();
      return lsn || null;
    }
  } catch (err) {
    console.error('Error reading LSN:', err);
  }
  return null;
}

function writeLSN(lsn) {
  try {
    const dir = path.dirname(LSN_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(LSN_FILE, lsn, 'utf8');
  } catch (err) {
    console.error('Error writing LSN:', err);
  }
}

module.exports = { readLSN, writeLSN };
