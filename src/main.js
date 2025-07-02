const express = require('express');
const path = require('path');
const { CLEANUP_CONFIG, startCleanupJob, stopCleanupJob } = require('./utils/cleanup');
const { injectCSS, initializeServer } = require('./utils/helpers');
const setupApiRoutes = require('./endpoints/api');

const app = express();
const PORT = 3000;
const REPORTS_DIR = './reports';
const PUBLIC_DIR = './src/public';

app.use(express.json({ limit: '1024mb' }));
app.use('/public', express.static(PUBLIC_DIR));

const reportMap = new Map();

setupApiRoutes(app, reportMap, REPORTS_DIR, PUBLIC_DIR, PORT);

async function startServer() {
    await initializeServer(REPORTS_DIR, reportMap);
    startCleanupJob(reportMap, REPORTS_DIR);
    app.listen(PORT, () => {
        console.log(`🚀 HTML Report Server running at http://localhost:${PORT}`);
        console.log(`📁 Reports saved to: ${path.resolve(REPORTS_DIR)}`);
        console.log(`🎨 CSS served from: ${path.resolve(PUBLIC_DIR)}`);
        console.log(`📡 API documentation: http://localhost:${PORT}`);
        console.log(`🧹 Cleanup: ${CLEANUP_CONFIG.ENABLED ? 'Enabled' : 'Disabled'}`);
    });
}

startServer().catch(console.error);

process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down server...');
    stopCleanupJob();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Server terminated');
    stopCleanupJob();
    process.exit(0);
});

module.exports = app;