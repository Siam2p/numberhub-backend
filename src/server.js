const app = require('./app');
const config = require('./config');
const { connectDB, mongoose } = require('./config/db');
const { initBot, getBot } = require('./bot');
const { startRetentionJobs } = require('./jobs/retentionJob');

let server;

const startServer = async () => {
  try {
    // 1. Connect to MongoDB
    await connectDB();

    // 2. Initialize Telegram Bot
    await initBot();

    // 3. Start scheduled background tasks (retention & expirations)
    startRetentionJobs();

    // 4. Start HTTP Express Server
    server = app.listen(config.port, '0.0.0.0', () => {
      console.log(`[Server] NumberHub backend running on port ${config.port} (${config.nodeEnv})`);
      console.log(`[Server] Health check: http://localhost:${config.port}/api/health`);
    });

    // 5. Graceful shutdown listeners
    const shutdown = async (signal) => {
      console.log(`[Server] ${signal} received. Closing HTTP server and bot...`);
      const bot = getBot();
      if (bot) {
        try {
          bot.stop(signal);
        } catch (e) {
          // Ignore bot stop errors during shutdown
        }
      }

      if (server) {
        server.close(async () => {
          console.log('[Server] HTTP server closed.');
          await mongoose.connection.close(false);
          console.log('[Server] MongoDB connection closed.');
          process.exit(0);
        });
      } else {
        process.exit(0);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    return server;
  } catch (error) {
    console.error('[Server] Fatal startup error:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  startServer();
}

module.exports = { startServer, app };
