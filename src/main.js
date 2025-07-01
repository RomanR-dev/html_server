const express = require('express');
const fs = require('fs').promises;
const path = require('path');

// cleanup
// Import cleanup utilities
const { CLEANUP_CONFIG, updateLastAccessed, startCleanupJob, stopCleanupJob, getCleanupInterval } = require('./utils/cleanup');

// Import cleanup API routes
const createCleanupRoutes = require('./endpoints/api');
const app = express();
const PORT = 3000;

// Configuration
const REPORTS_DIR = './reports';
const PUBLIC_DIR = './public';




// Middleware
app.use(express.json({ limit: '1024mb' }));
app.use('/public', express.static(PUBLIC_DIR));


// In-memory mapping of keys to report info
const reportMap = new Map();

app.use('/', createCleanupRoutes(reportMap, REPORTS_DIR));


// Initialize directories and CSS
async function initializeServer() {
    try {
        // Load existing reports on startup
        try {
            const files = await fs.readdir(REPORTS_DIR);
            for (const file of files) {
                if (file.endsWith('.html')) {
                    const key = file.replace('.html', '');
                    const stats = await fs.stat(path.join(REPORTS_DIR, file));
                    reportMap.set(key, {
                        filename: file,
                        created: stats.birthtime,
                        updated: stats.mtime,
                        url: `/report/${key}`
                    });
                }
            }
            console.log(`📄 Loaded ${reportMap.size} existing reports`);
        } catch (err) {
            console.log('📁 No existing reports found');
        }

    } catch (error) {
        console.error('❌ Failed to initialize server:', error);
        process.exit(1);
    }
}

// Helper function to inject CSS reference
function injectCSS(htmlContent) {
    const cssLink = '<link rel="stylesheet" href="/public/report.css">';

    // Find the head tag and inject CSS
    if (htmlContent.includes('<head>')) {
        return htmlContent.replace('<head>', `<head>\n    ${cssLink}`);
    } else {
        console.warn('⚠️  No <head> tag found in HTML content');
        return htmlContent;
    }
}

// POST /upload - Upload new HTML document
app.post('/upload', async (req, res) => {
    try {
        const { html, key } = req.body;

        if (!html || !key) {
            return res.status(400).json({
                error: 'Both html and key are required'
            });
        }

        // Check if key already exists
        if (reportMap.has(key)) {
            return res.status(409).json({
                error: 'Key already exists. Use /update to modify existing reports.'
            });
        }

        // Inject CSS reference
        const htmlWithCSS = injectCSS(html);

        // Save HTML to file
        const filename = `${key}.html`;
        const filepath = path.join(REPORTS_DIR, filename);
        await fs.writeFile(filepath, htmlWithCSS, 'utf8');

        // Store in map
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

// POST /update - Update existing HTML document
app.post('/update', async (req, res) => {
    try {
        const { html, key } = req.body;

        if (!html || !key) {
            return res.status(400).json({
                error: 'Both html and key are required'
            });
        }

        // Check if key exists
        if (!reportMap.has(key)) {
            return res.status(404).json({
                error: 'Key not found. Use /upload to create new reports.'
            });
        }

        // Inject CSS reference
        const htmlWithCSS = injectCSS(html);

        // Update HTML file
        const filename = `${key}.html`;
        const filepath = path.join(REPORTS_DIR, filename);
        await fs.writeFile(filepath, htmlWithCSS, 'utf8');

        // Update map
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

// GET /serve - Get unique URL for a report
app.get('/serve', (req, res) => {
    const { key } = req.query;

    if (!key) {
        return res.status(400).json({
            error: 'key parameter is required'
        });
    }

    if (!reportMap.has(key)) {
        return res.status(404).json({
            error: 'Report not found'
        });
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

// GET /report/:key - Serve the actual HTML report
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

        updateLastAccessed(key, reportMap);
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

// GET /reports - List all reports
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

// DELETE /report/:key - Delete a report
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

// Root endpoint with documentation
app.get('/', (req, res) => {
    res.send(`
        <html>
        <head>
            <title>HTML Report Server</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
                .endpoint { background: #f4f4f4; padding: 15px; margin: 10px 0; border-radius: 5px; }
                .method { color: white; padding: 4px 8px; border-radius: 3px; font-weight: bold; }
                .post { background: #28a745; }
                .get { background: #007bff; }
                .delete { background: #dc3545; }
                code { background: #f8f9fa; padding: 2px 4px; border-radius: 3px; }
            </style>
        </head>
        <body>
            <h1>🚀 HTML Report Server</h1>
            <p>Server for uploading, updating, and serving HTML reports with CSS styling.</p>
            
            <h2>📡 API Endpoints</h2>
            
            <div class="endpoint">
                <span class="method post">POST</span> <strong>/upload</strong>
                <p>Upload new HTML report</p>
                <code>{ "html": "&lt;html&gt;...&lt;/html&gt;", "key": "unique-key" }</code>
            </div>
            
            <div class="endpoint">
                <span class="method post">POST</span> <strong>/update</strong>
                <p>Update existing HTML report</p>
                <code>{ "html": "&lt;html&gt;...&lt;/html&gt;", "key": "existing-key" }</code>
            </div>
            
            <div class="endpoint">
                <span class="method get">GET</span> <strong>/serve?key=report-key</strong>
                <p>Get URL info for a report</p>
            </div>
            
            <div class="endpoint">
                <span class="method get">GET</span> <strong>/report/:key</strong>
                <p>View the actual HTML report</p>
            </div>
            
            <div class="endpoint">
                <span class="method get">GET</span> <strong>/reports</strong>
                <p>List all available reports</p>
            </div>
            
            <div class="endpoint">
                <span class="method delete">DELETE</span> <strong>/report/:key</strong>
                <p>Delete a report</p>
            </div>
            
            <h2>📊 Current Reports</h2>
            <p><a href="/reports">View all reports (${reportMap.size} available)</a></p>
            
            <h2>🎨 CSS</h2>
            <p>CSS is automatically injected into all HTML reports.</p>
            <p><a href="/public/report.css">View CSS file</a></p>
        </body>
        </html>
    `);
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        reports: reportMap.size,
        uptime: process.uptime()
    });
});

// Start server
async function startServer() {
    await initializeServer();

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

// Graceful shutdown
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