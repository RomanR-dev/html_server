// cleanupRoutes.js
const express = require('express');
const { CLEANUP_CONFIG, cleanupExpiredReports, startCleanupJob, stopCleanupJob, getCleanupInterval } = require('../utils/cleanup');
const { injectCSS, initializeServer } = require('../utils/helpers');
const fs = require('fs').promises;
const path = require('path');
const marked = require('marked');

function createCleanupRoutes(reportMap, reportsDir) {
    const router = express.Router();

    // POST /cleanup - Manual cleanup trigger
    router.post('/cleanup', async (req, res) => {
        try {
            const beforeCount = reportMap.size;
            await cleanupExpiredReports(reportMap, reportsDir);
            const afterCount = reportMap.size;
            const deletedCount = beforeCount - afterCount;

            res.json({
                success: true,
                message: 'Manual cleanup completed',
                deletedReports: deletedCount,
                remainingReports: afterCount,
                cleanupConfig: {
                    enabled: CLEANUP_CONFIG.ENABLED,
                    maxIdleHours: CLEANUP_CONFIG.MAX_IDLE_TIME / (60 * 60 * 1000),
                    maxAgeDays: CLEANUP_CONFIG.MAX_AGE / (24 * 60 * 60 * 1000)
                }
            });
        } catch (error) {
            console.error('Manual cleanup error:', error);
            res.status(500).json({
                error: 'Cleanup failed',
                details: error.message
            });
        }
    });

    // GET /cleanup/config - Get cleanup configuration
    router.get('/cleanup/config', (req, res) => {
        res.json({
            enabled: CLEANUP_CONFIG.ENABLED,
            cleanupIntervalMinutes: CLEANUP_CONFIG.CLEANUP_INTERVAL / (60 * 1000),
            maxIdleTimeHours: CLEANUP_CONFIG.MAX_IDLE_TIME / (60 * 60 * 1000),
            maxAgeDays: CLEANUP_CONFIG.MAX_AGE / (24 * 60 * 60 * 1000),
            currentTime: new Date().toISOString(),
            nextCleanupIn: getCleanupInterval() ? 'Active' : 'Disabled'
        });
    });

    // PUT /cleanup/config - Update cleanup configuration
    router.put('/cleanup/config', (req, res) => {
        const { enabled, maxIdleTimeHours, maxAgeDays, cleanupIntervalMinutes } = req.body;

        let changes = [];

        if (typeof enabled === 'boolean') {
            const oldEnabled = CLEANUP_CONFIG.ENABLED;
            CLEANUP_CONFIG.ENABLED = enabled;
            changes.push(`enabled: ${oldEnabled} → ${enabled}`);

            if (enabled && !getCleanupInterval()) {
                startCleanupJob(reportMap, reportsDir);
            } else if (!enabled && getCleanupInterval()) {
                stopCleanupJob();
            }
        }

        if (typeof maxIdleTimeHours === 'number' && maxIdleTimeHours > 0) {
            const oldHours = CLEANUP_CONFIG.MAX_IDLE_TIME / (60 * 60 * 1000);
            CLEANUP_CONFIG.MAX_IDLE_TIME = maxIdleTimeHours * 60 * 60 * 1000;
            changes.push(`maxIdleTime: ${oldHours}h → ${maxIdleTimeHours}h`);
        }

        if (typeof maxAgeDays === 'number' && maxAgeDays > 0) {
            const oldDays = CLEANUP_CONFIG.MAX_AGE / (24 * 60 * 60 * 1000);
            CLEANUP_CONFIG.MAX_AGE = maxAgeDays * 24 * 60 * 60 * 1000;
            changes.push(`maxAge: ${oldDays}d → ${maxAgeDays}d`);
        }

        if (typeof cleanupIntervalMinutes === 'number' && cleanupIntervalMinutes > 0) {
            const oldMinutes = CLEANUP_CONFIG.CLEANUP_INTERVAL / (60 * 1000);
            CLEANUP_CONFIG.CLEANUP_INTERVAL = cleanupIntervalMinutes * 60 * 1000;
            changes.push(`interval: ${oldMinutes}min → ${cleanupIntervalMinutes}min`);

            // Restart cleanup job with new interval
            if (CLEANUP_CONFIG.ENABLED) {
                stopCleanupJob();
                startCleanupJob(reportMap, reportsDir);
            }
        }

        res.json({
            success: true,
            message: 'Configuration updated',
            changes,
            newConfig: {
                enabled: CLEANUP_CONFIG.ENABLED,
                cleanupIntervalMinutes: CLEANUP_CONFIG.CLEANUP_INTERVAL / (60 * 1000),
                maxIdleTimeHours: CLEANUP_CONFIG.MAX_IDLE_TIME / (60 * 60 * 1000),
                maxAgeDays: CLEANUP_CONFIG.MAX_AGE / (24 * 60 * 60 * 1000)
            }
        });
    });
    return router;
}

function setupApiRoutes(app, reportMap, REPORTS_DIR, PUBLIC_DIR, PORT) {
    // Cleanup endpoints
    app.post('/cleanup', async (req, res) => {
        try {
            const beforeCount = reportMap.size;
            await cleanupExpiredReports(reportMap, REPORTS_DIR);
            const afterCount = reportMap.size;
            const deletedCount = beforeCount - afterCount;

            res.json({
                success: true,
                message: 'Manual cleanup completed',
                deletedReports: deletedCount,
                remainingReports: afterCount,
                cleanupConfig: {
                    enabled: CLEANUP_CONFIG.ENABLED,
                    maxIdleHours: CLEANUP_CONFIG.MAX_IDLE_TIME / (60 * 60 * 1000),
                    maxAgeDays: CLEANUP_CONFIG.MAX_AGE / (24 * 60 * 60 * 1000)
                }
            });
        } catch (error) {
            console.error('Manual cleanup error:', error);
            res.status(500).json({
                error: 'Cleanup failed',
                details: error.message
            });
        }
    });
    app.get('/cleanup/config', (req, res) => {
        res.json({
            enabled: CLEANUP_CONFIG.ENABLED,
            cleanupIntervalMinutes: CLEANUP_CONFIG.CLEANUP_INTERVAL / (60 * 1000),
            maxIdleTimeHours: CLEANUP_CONFIG.MAX_IDLE_TIME / (60 * 60 * 1000),
            maxAgeDays: CLEANUP_CONFIG.MAX_AGE / (24 * 60 * 60 * 1000),
            currentTime: new Date().toISOString(),
            nextCleanupIn: getCleanupInterval() ? 'Active' : 'Disabled'
        });
    });
    app.put('/cleanup/config', (req, res) => {
        const { enabled, maxIdleTimeHours, maxAgeDays, cleanupIntervalMinutes } = req.body;
        let changes = [];
        if (typeof enabled === 'boolean') {
            const oldEnabled = CLEANUP_CONFIG.ENABLED;
            CLEANUP_CONFIG.ENABLED = enabled;
            changes.push(`enabled: ${oldEnabled} → ${enabled}`);
            if (enabled && !getCleanupInterval()) {
                startCleanupJob(reportMap, REPORTS_DIR);
            } else if (!enabled && getCleanupInterval()) {
                stopCleanupJob();
            }
        }
        if (typeof maxIdleTimeHours === 'number' && maxIdleTimeHours > 0) {
            const oldHours = CLEANUP_CONFIG.MAX_IDLE_TIME / (60 * 60 * 1000);
            CLEANUP_CONFIG.MAX_IDLE_TIME = maxIdleTimeHours * 60 * 60 * 1000;
            changes.push(`maxIdleTime: ${oldHours}h → ${maxIdleTimeHours}h`);
        }
        if (typeof maxAgeDays === 'number' && maxAgeDays > 0) {
            const oldDays = CLEANUP_CONFIG.MAX_AGE / (24 * 60 * 60 * 1000);
            CLEANUP_CONFIG.MAX_AGE = maxAgeDays * 24 * 60 * 60 * 1000;
            changes.push(`maxAge: ${oldDays}d → ${maxAgeDays}d`);
        }
        if (typeof cleanupIntervalMinutes === 'number' && cleanupIntervalMinutes > 0) {
            const oldMinutes = CLEANUP_CONFIG.CLEANUP_INTERVAL / (60 * 1000);
            CLEANUP_CONFIG.CLEANUP_INTERVAL = cleanupIntervalMinutes * 60 * 1000;
            changes.push(`interval: ${oldMinutes}min → ${cleanupIntervalMinutes}min`);
            if (CLEANUP_CONFIG.ENABLED) {
                stopCleanupJob();
                startCleanupJob(reportMap, REPORTS_DIR);
            }
        }
        res.json({
            success: true,
            message: 'Configuration updated',
            changes,
            newConfig: {
                enabled: CLEANUP_CONFIG.ENABLED,
                cleanupIntervalMinutes: CLEANUP_CONFIG.CLEANUP_INTERVAL / (60 * 1000),
                maxIdleTimeHours: CLEANUP_CONFIG.MAX_IDLE_TIME / (60 * 60 * 1000),
                maxAgeDays: CLEANUP_CONFIG.MAX_AGE / (24 * 60 * 60 * 1000)
            }
        });
    });

    // Upload, update, serve, delete, list, exists, health, docs endpoints
    app.post('/upload', async (req, res) => {
        try {
            const { html, key } = req.body;
            if (!html || !key) {
                return res.status(400).json({ error: 'Both html and key are required' });
            }
            if (reportMap.has(key)) {
                return res.status(409).json({ error: 'Key already exists. Use /update to modify existing reports.' });
            }
            const htmlWithCSS = injectCSS(html);
            const filename = `${key}.html`;
            const filepath = path.join(REPORTS_DIR, filename);
            await fs.writeFile(filepath, htmlWithCSS, 'utf8');
            const now = new Date();
            reportMap.set(key, {
                filename,
                created: now,
                updated: now,
                url: `/report/${key}`
            });
            res.json({
                success: true,
                message: 'Report uploaded successfully',
                key,
                url: `/report/${key}`,
                serve_url: `http://localhost:${PORT}/report/${key}`
            });
        } catch (error) {
            console.error('Upload error:', error);
            res.status(500).json({ error: 'Failed to upload report' });
        }
    });
    app.post('/update', async (req, res) => {
        try {
            const { html, key } = req.body;
            if (!html || !key) {
                return res.status(400).json({ error: 'Both html and key are required' });
            }
            if (!reportMap.has(key)) {
                return res.status(404).json({ error: 'Key not found. Use /upload to create new reports.' });
            }
            const htmlWithCSS = injectCSS(html);
            const filename = `${key}.html`;
            const filepath = path.join(REPORTS_DIR, filename);
            await fs.writeFile(filepath, htmlWithCSS, 'utf8');
            const reportInfo = reportMap.get(key);
            reportInfo.updated = new Date();
            res.json({
                success: true,
                message: 'Report updated successfully',
                key,
                url: `/report/${key}`,
                serve_url: `http://localhost:${PORT}/report/${key}`
            });
        } catch (error) {
            console.error('Update error:', error);
            res.status(500).json({ error: 'Failed to update report' });
        }
    });
    app.get('/serve', (req, res) => {
        const { key } = req.query;
        if (!key) {
            return res.status(400).json({ error: 'key parameter is required' });
        }
        if (!reportMap.has(key)) {
            return res.status(404).json({ error: 'Report not found' });
        }
        const reportInfo = reportMap.get(key);
        res.json({
            key,
            url: reportInfo.url,
            serve_url: `http://localhost:${PORT}${reportInfo.url}`,
            created: reportInfo.created,
            updated: reportInfo.updated
        });
    });
    app.get('/report/:key', async (req, res) => {
        try {
            const { key } = req.params;
            if (!reportMap.has(key)) {
                return res.status(404).send(`
                    <html>
                    <body>
                        <h1>Report Not Found</h1>
                        <p>Report with key "${key}" does not exist.</p>
                        <a href="/reports">View all reports</a>
                    </body>
                    </html>
                `);
            }
            const reportInfo = reportMap.get(key);
            const filepath = path.join(REPORTS_DIR, reportInfo.filename);
            const htmlContent = await fs.readFile(filepath, 'utf8');
            // updateLastAccessed(key, reportMap); // If needed, add this back
            res.setHeader('Content-Type', 'text/html');
            res.send(htmlContent);
        } catch (error) {
            console.error('Serve error:', error);
            res.status(500).send(`
                <html>
                <body>
                    <h1>Error</h1>
                    <p>Failed to load report: ${error.message}</p>
                </body>
                </html>
            `);
        }
    });
    app.get('/reports', (req, res) => {
        const reports = Array.from(reportMap.entries()).map(([key, info]) => ({
            key,
            url: info.url,
            serve_url: `http://localhost:${PORT}${info.url}`,
            created: info.created,
            updated: info.updated
        }));
        res.json({
            total: reports.length,
            reports
        });
    });
    app.delete('/report/:key', async (req, res) => {
        try {
            const { key } = req.params;
            if (!reportMap.has(key)) {
                return res.status(404).json({ error: 'Report not found' });
            }
            const reportInfo = reportMap.get(key);
            const filepath = path.join(REPORTS_DIR, reportInfo.filename);
            await fs.unlink(filepath);
            reportMap.delete(key);
            res.json({
                success: true,
                message: 'Report deleted successfully',
                key
            });
        } catch (error) {
            console.error('Delete error:', error);
            res.status(500).json({ error: 'Failed to delete report' });
        }
    });
    app.get('/', async (req, res) => {
        const markdownContent = await fs.readFile(path.join(__dirname, '../', '../', 'README.md'), 'utf8');
        const htmlContent = marked.parse(markdownContent);
        res.setHeader('Content-Type', 'text/html');
        res.send(`
                <!DOCTYPE html>
                <html lang="en-US">
                <head>
                    <title>HTML Report Server - Documentation</title>
                    <style>
                        body { font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6; }
                        code { background: #f4f4f4; padding: 2px 4px; border-radius: 3px; }
                        pre { background: #f4f4f4; padding: 15px; border-radius: 5px; overflow-x: auto; }
                        table { border-collapse: collapse; width: 100%; }
                        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                        th { background-color: #f2f2f2; }
                    </style>
                </head>
                <body>
                    ${htmlContent}
                </body>
                </html>
            `);
    });
    app.get('/health', (req, res) => {
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            reports: reportMap.size,
            uptime: process.uptime()
        });
    });
    app.get('/exists/:key', (req, res) => {
        const { key } = req.params;
        if (!key) {
            return res.status(400).json({ error: 'Key parameter is required' });
        }
        const exists = reportMap.has(key);
        if (exists) {
            const reportInfo = reportMap.get(key);
            res.json({
                exists: true,
                key,
                url: `/report/${key}`,
                serve_url: `http://localhost:${PORT}/report/${key}`,
                created: reportInfo.created,
                updated: reportInfo.updated,
                lastAccessed: reportInfo.lastAccessed
            });
        } else {
            res.json({
                exists: false,
                key
            });
        }
    });
}

module.exports = setupApiRoutes;