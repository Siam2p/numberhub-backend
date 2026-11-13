const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const dns = require('dns');
const { spawn } = require('child_process');
const config = require('./index');

// Use reliable public DNS for SRV queries on Windows environments
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (_) {}

let isConnected = false;
let mongodProcess = null;

/**
 * Attempts to launch local mongod if port 27017 is not yet active
 */
const ensureMongodStarted = async () => {
  if (config.mongodbUri && config.mongodbUri.includes('+srv://')) {
    return false; // Remote MongoDB Atlas cluster, do not start local mongod
  }
  const possiblePaths = [
    'C:\\Program Files\\MongoDB\\Server\\8.3\\bin\\mongod.exe',
    'C:\\Program Files\\MongoDB\\Server\\7.0\\bin\\mongod.exe',
    'C:\\Program Files\\MongoDB\\Server\\6.0\\bin\\mongod.exe',
  ];

  let mongodBin = possiblePaths.find((p) => fs.existsSync(p));
  if (!mongodBin) return false;

  const dbPath = path.resolve(__dirname, '../../../data/db');
  if (!fs.existsSync(dbPath)) {
    fs.mkdirSync(dbPath, { recursive: true });
  }

  try {
    console.log(`[MongoDB] Starting background mongod instance from ${mongodBin}...`);
    mongodProcess = spawn(mongodBin, ['--dbpath', dbPath, '--port', '27017'], {
      detached: true,
      stdio: 'ignore',
    });
    mongodProcess.unref();

    // Give it 1.5s to initialize
    await new Promise((r) => setTimeout(r, 1500));
    return true;
  } catch (err) {
    console.warn(`[MongoDB] Could not auto-launch mongod: ${err.message}`);
    return false;
  }
};

const connectDB = async () => {
  if (isConnected) return;

  try {
    const isRemote = config.mongodbUri && config.mongodbUri.includes('+srv://');
    const conn = await mongoose.connect(config.mongodbUri, {
      serverSelectionTimeoutMS: isRemote ? 10000 : 2500,
      autoIndex: true,
    });

    isConnected = true;
    console.log(`[MongoDB] Connected: ${conn.connection.host}/${conn.connection.name}`);
  } catch (error) {
    console.warn(`[MongoDB] Initial connection attempt failed: ${error.message}. Attempting to start local mongod...`);

    const started = await ensureMongodStarted();
    if (started) {
      try {
        const conn = await mongoose.connect(config.mongodbUri, {
          serverSelectionTimeoutMS: 5000,
          autoIndex: true,
        });
        isConnected = true;
        console.log(`[MongoDB] Successfully connected after launching local mongod: ${conn.connection.host}`);
        return;
      } catch (retryErr) {
        console.error(`[MongoDB] Retry connection failed: ${retryErr.message}`);
      }
    }

    if (config.nodeEnv === 'production') {
      process.exit(1);
    }
  }
};

mongoose.connection.on('disconnected', () => {
  isConnected = false;
  console.warn('[MongoDB] Disconnected from server');
});

mongoose.connection.on('reconnected', () => {
  isConnected = true;
  console.log('[MongoDB] Reconnected');
});

module.exports = { connectDB, mongoose };
