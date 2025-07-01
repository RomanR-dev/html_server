// cleanupRoutes.js
const express = require('express');
const { CLEANUP_CONFIG, cleanupExpiredReports, startCleanupJob, stopCleanupJob, getCleanupInterval } = require('../utils/cleanup');

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


    // GET /exists/:key - Check if report exists
    router.get('/exists/:key', (req, res) => {
        const { key } = req.params;

        if (!key) {
            return res.status(400).json({
                error: 'Key parameter is required'
            });
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

    return router;
}

module.exports = createCleanupRoutes;