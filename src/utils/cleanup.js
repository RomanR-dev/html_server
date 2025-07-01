// cleanup.js
const fs = require('fs').promises;
const path = require('path');

// Cleanup configuration (in milliseconds)
const CLEANUP_CONFIG = {
    CLEANUP_INTERVAL: parseInt(process.env.CLEANUP_INTERVAL) || 30 * 60 * 1000,
    MAX_IDLE_TIME: parseInt(process.env.MAX_IDLE_TIME) || 24 * 60 * 60 * 1000,
    MAX_AGE: parseInt(process.env.MAX_AGE) || 7 * 24 * 60 * 60 * 1000,
    ENABLED: process.env.CLEANUP_ENABLED !== 'false'
};

let cleanupInterval = null;

// Helper function to update last accessed time
function updateLastAccessed(key, reportMap) {
    if (reportMap.has(key)) {
        const reportInfo = reportMap.get(key);
        reportInfo.lastAccessed = new Date();
        console.log(`📖 Report '${key}' accessed at ${reportInfo.lastAccessed.toISOString()}`);
    }
}

// Background cleanup function
async function cleanupExpiredReports(reportMap, reportsDir) {
    if (!CLEANUP_CONFIG.ENABLED) return;

    console.log('🧹 Starting cleanup of expired reports...');
    const now = new Date();
    let deletedCount = 0;
    let checkedCount = 0;

    try {
        for (const [key, reportInfo] of reportMap.entries()) {
            checkedCount++;
            const age = now - reportInfo.created;
            const idleTime = now - (reportInfo.lastAccessed || reportInfo.created);

            let shouldDelete = false;
            let reason = '';

            if (age > CLEANUP_CONFIG.MAX_AGE) {
                shouldDelete = true;
                reason = `exceeded max age (${Math.floor(age / (24 * 60 * 60 * 1000))} days old)`;
            } else if (idleTime > CLEANUP_CONFIG.MAX_IDLE_TIME) {
                shouldDelete = true;
                reason = `not accessed for ${Math.floor(idleTime / (60 * 60 * 1000))} hours`;
            }

            if (shouldDelete) {
                try {
                    const filepath = path.join(reportsDir, reportInfo.filename);
                    await fs.unlink(filepath);
                    reportMap.delete(key);
                    deletedCount++;
                    console.log(`🗑️  Deleted report '${key}' - ${reason}`);
                } catch (error) {
                    console.error(`❌ Failed to delete report '${key}':`, error.message);
                }
            }
        }

        console.log(`✅ Cleanup completed: checked ${checkedCount}, deleted ${deletedCount} reports`);
        if (deletedCount > 0) {
            console.log(`📊 Remaining reports: ${reportMap.size}`);
        }

    } catch (error) {
        console.error('❌ Cleanup failed:', error);
    }
}

// Start background cleanup job
function startCleanupJob(reportMap, reportsDir) {
    if (!CLEANUP_CONFIG.ENABLED) {
        console.log('⏸️  Report cleanup is disabled');
        return;
    }

    console.log(`🔄 Starting cleanup job - runs every ${CLEANUP_CONFIG.CLEANUP_INTERVAL / (60 * 1000)} minutes`);
    console.log(`⏰ Reports deleted after ${CLEANUP_CONFIG.MAX_IDLE_TIME / (60 * 60 * 1000)} hours of inactivity`);
    console.log(`📅 Reports deleted after ${CLEANUP_CONFIG.MAX_AGE / (24 * 60 * 60 * 1000)} days regardless of activity`);

    // Run cleanup immediately on startup
    setTimeout(() => cleanupExpiredReports(reportMap, reportsDir), 5000);

    // Schedule recurring cleanup
    cleanupInterval = setInterval(() => cleanupExpiredReports(reportMap, reportsDir), CLEANUP_CONFIG.CLEANUP_INTERVAL);
}

// Stop cleanup job
function stopCleanupJob() {
    if (cleanupInterval) {
        clearInterval(cleanupInterval);
        cleanupInterval = null;
        console.log('⏹️  Cleanup job stopped');
    }
}

module.exports = {
    CLEANUP_CONFIG,
    updateLastAccessed,
    cleanupExpiredReports,
    startCleanupJob,
    stopCleanupJob,
    getCleanupInterval: () => cleanupInterval
};