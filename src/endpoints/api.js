// cleanupRoutes.js
const express = require('express');
const { CLEANUP_CONFIG, cleanupExpiredReports, startCleanupJob, stopCleanupJob, getCleanupInterval } = require('../utils/cleanup');
const { injectCSS, initializeServer, escapeHtml, removeKeyFromGroups } = require('../utils/helpers');
const fs = require('fs').promises;
const path = require('path');
const marked = require('marked');
const { renderTemplate } = require('../utils/template');
const { reportTableScript, groupListScript, cleanupConfigScript } = require('../utils/scripts');

const groupMap = new Map(); // groupId -> Set of keys
const TEMPLATE_DIR = path.join(__dirname, '../templates');

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
            // Collect keys before cleanup
            const keysBefore = new Set(reportMap.keys());
            await cleanupExpiredReports(reportMap, REPORTS_DIR);
            const afterCount = reportMap.size;
            const deletedKeys = [...keysBefore].filter(k => !reportMap.has(k));
            // Remove deleted keys from groups
            deletedKeys.forEach(k => removeKeyFromGroups(k, groupMap));
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
    app.get('/reports', async (req, res) => {
        if (req.headers.accept && req.headers.accept.includes('application/json')) {
            const reports = Array.from(reportMap.entries()).map(([key, info]) => ({
                key,
                url: info.url,
                serve_url: `http://localhost:${PORT}${info.url}`,
                created: info.created,
                updated: info.updated
            }));
            return res.json({
                total: reports.length,
                reports
            });
        }
        const reports = Array.from(reportMap.entries()).map(([key, info]) => ({
            key,
            url: info.url,
            created: info.created,
            updated: info.updated
        }));
        const rows = reports.map((r, i) => `
            <tr>
                <td><span class="expand-btn" onclick="toggleDetails(${i})">&#9654;</span></td>
                <td>${escapeHtml(r.key)}</td>
                <td>${r.created ? new Date(r.created).toLocaleString() : ''}</td>
                <td>${r.updated ? new Date(r.updated).toLocaleString() : ''}</td>
                <td><a href="/report/${encodeURIComponent(r.key)}" target="_blank">View</a></td>
            </tr>
            <tr class="details-row" id="details${i}">
                <td colspan="5" style="padding:18px 10px; color:#444;">
                    <b>Key:</b> ${escapeHtml(r.key)}<br>
                    <b>Created:</b> ${r.created ? new Date(r.created).toLocaleString() : ''}<br>
                    <b>Updated:</b> ${r.updated ? new Date(r.updated).toLocaleString() : ''}<br>
                    <b>URL:</b> <a href="/report/${encodeURIComponent(r.key)}" target="_blank">/report/${escapeHtml(r.key)}</a>
                </td>
            </tr>
        `).join('');
        const html = await renderTemplate('reports.html', { REPORT_ROWS: rows, SCRIPT: reportTableScript });
        res.send(html);
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
            removeKeyFromGroups(key, groupMap);
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

    // Upload multiple reports to a group
    app.post('/upload-reports', async (req, res) => {
        try {
            const { groupId, reports } = req.body;
            if (!groupId || !Array.isArray(reports) || reports.length === 0) {
                return res.status(400).json({ error: 'groupId and reports[] are required' });
            }
            // Check for duplicate keys within the batch
            const keyCounts = reports.reduce((acc, r) => {
                acc[r.key] = (acc[r.key] || 0) + 1;
                return acc;
            }, {});
            const batchDuplicates = Object.keys(keyCounts).filter(k => keyCounts[k] > 1);
            if (batchDuplicates.length > 0) {
                return res.status(400).json({
                    error: 'Duplicate keys in upload batch',
                    duplicateKeys: batchDuplicates
                });
            }
            // Check for duplicate keys in reportMap
            const duplicateKeys = reports.filter(r => reportMap.has(r.key)).map(r => r.key);
            if (duplicateKeys.length > 0) {
                return res.status(409).json({
                    error: 'One or more keys already exist',
                    duplicateKeys
                });
            }
            if (!groupMap.has(groupId)) groupMap.set(groupId, new Set());
            const groupSet = groupMap.get(groupId);
            const results = [];
            for (const { key, html } of reports) {
                if (!key || !html) {
                    results.push({ key, success: false, error: 'Missing key or html' });
                    continue;
                }
                // Save report as in /upload
                const filename = `${key}.html`;
                const filepath = path.join(REPORTS_DIR, filename);
                try {
                    const htmlWithCSS = injectCSS(html);
                    await fs.writeFile(filepath, htmlWithCSS, 'utf8');
                    const now = new Date();
                    reportMap.set(key, {
                        filename,
                        created: now,
                        updated: now,
                        url: `/report/${key}`
                    });
                    groupSet.add(key);
                    results.push({ key, success: true, url: `/report/${key}` });
                } catch (error) {
                    results.push({ key, success: false, error: error.message });
                }
            }
            res.json({
                success: true,
                groupId,
                added: Array.from(groupSet),
                results
            });
        } catch (error) {
            console.error('Upload-reports error:', error);
            res.status(500).json({ error: 'Failed to upload reports' });
        }
    });

    // /report-groups page
    app.get('/report-groups', async (req, res) => {
        const allGroups = Array.from(groupMap.entries());
        let groupCards = '';
        let html = '';
        if (allGroups.length === 0) {
            groupCards = '<div style="text-align:center;color:#888;">No groups found.</div>';
        } else {
            groupCards = allGroups.map(([groupId, keys], i) => {
                // Sort keys by most recently updated, then created
                const reportInfos = Array.from(keys).map(key => {
                    const info = reportMap.get(key);
                    return {
                        key,
                        created: info && info.created ? new Date(info.created) : null,
                        updated: info && info.updated ? new Date(info.updated) : null
                    };
                });
                reportInfos.sort((a, b) => {
                    if (b.updated && a.updated && b.updated.getTime() !== a.updated.getTime()) {
                        return b.updated - a.updated;
                    }
                    if (b.created && a.created) {
                        return b.created - a.created;
                    }
                    return 0;
                });
                return `
                <div class="group-card">
                    <div class="group-header" onclick="toggleGroup(${i})"><i class="fa-solid fa-folder-tree"></i>Group: <b>${escapeHtml(groupId)}</b> <span class='arrow' id='arrow${i}'>&#9654;</span></div>
                    <div class="group-content" id="group${i}">
                        ${reportInfos.map(r => `<a class='report-link' href='/report/${encodeURIComponent(r.key)}'><i class='fa-solid fa-file-lines'></i> ${escapeHtml(r.key)}</a>`).join('')}
                    </div>
                </div>
                `;
            }).join('');
        }
        html = await renderTemplate('report-groups.html', { GROUP_CARDS: groupCards, SCRIPT: groupListScript });
        res.send(html);
    });

    // /group/:groupId page
    app.get('/group/:groupId', async (req, res) => {
        const { groupId } = req.params;
        if (!groupMap.has(groupId) || groupMap.get(groupId).size === 0) {
            const html = await renderTemplate('error.html', { TITLE: 'No reports found', MESSAGE: `No reports found for group: ${escapeHtml(groupId)}` });
            return res.status(404).send(html);
        }
        const keys = Array.from(groupMap.get(groupId));
        const reportInfos = keys.map(key => {
            const info = reportMap.get(key);
            return {
                key,
                created: info && info.created ? new Date(info.created) : null,
                updated: info && info.updated ? new Date(info.updated) : null
            };
        });
        // Sort by updated (desc), then created (desc)
        reportInfos.sort((a, b) => {
            if (b.updated && a.updated && b.updated.getTime() !== a.updated.getTime()) {
                return b.updated - a.updated;
            }
            if (b.created && a.created) {
                return b.created - a.created;
            }
            return 0;
        });
        const toolbar = `
            <div style="background:#222;padding:16px 0 16px 0;text-align:center;">
                ${reportInfos.map(r =>
                    `<a href="/report/${encodeURIComponent(r.key)}" style="display:inline-block;margin:0 10px;padding:10px 24px;background:#4f8cff;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold;transition:background 0.2s;box-shadow:0 2px 8px #0002;">
                        <div>Report: <b>${escapeHtml(r.key)}</b></div>
                        <div style='font-size:12px;font-weight:normal;color:#e0e0e0;'>${r.created ? r.created.toLocaleString() : ''}</div>
                    </a>`
                ).join('')}
            </div>
        `;
        const html = await renderTemplate('group.html', {
            GROUP_ID: escapeHtml(groupId),
            TOOLBAR: toolbar,
            REPORT_COUNT: reportInfos.length
        });
        res.send(html);
    });

    // /cleanup-config page
    app.get('/cleanup-config', async (req, res) => {
        const html = await renderTemplate('cleanup-config.html', { SCRIPT: cleanupConfigScript });
        res.send(html);
    });

    // Batch update reports endpoint
    app.post('/update-reports', async (req, res) => {
        try {
            const { reports } = req.body;
            if (!Array.isArray(reports) || reports.length === 0) {
                return res.status(400).json({ error: 'reports[] is required' });
            }
            // Check all keys exist first
            const missingKeys = reports.filter(r => !r.key || !reportMap.has(r.key)).map(r => r.key);
            if (missingKeys.length > 0) {
                return res.status(404).json({
                    error: 'One or more keys not found. All keys must exist to update.',
                    missingKeys
                });
            }
            const results = [];
            for (const { key, html } of reports) {
                if (!key || !html) {
                    results.push({ key, success: false, error: 'Missing key or html' });
                    continue;
                }
                const htmlWithCSS = injectCSS(html);
                const filename = `${key}.html`;
                const filepath = path.join(REPORTS_DIR, filename);
                try {
                    await fs.writeFile(filepath, htmlWithCSS, 'utf8');
                    const reportInfo = reportMap.get(key);
                    reportInfo.updated = new Date();
                    results.push({ key, success: true, url: `/report/${key}` });
                } catch (error) {
                    results.push({ key, success: false, error: error.message });
                }
            }
            res.json({
                success: true,
                updated: results.filter(r => r.success).map(r => r.key),
                results
            });
        } catch (error) {
            console.error('Update-reports error:', error);
            res.status(500).json({ error: 'Failed to update reports' });
        }
    });

    // Error and not found pages (example usage)
    app.use(async (req, res, next) => {
        const html = await renderTemplate('error.html', { TITLE: '404 Not Found', MESSAGE: 'The page you are looking for does not exist.' });
        res.status(404).send(html);
    });
}

module.exports = setupApiRoutes;