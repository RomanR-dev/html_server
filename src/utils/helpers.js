const fs = require('fs').promises;
const path = require('path');

async function initializeServer(REPORTS_DIR, reportMap) {
    try {
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

function injectCSS(htmlContent) {
    const cssLink = '<link rel="stylesheet" href="/public/report.css">';
    if (htmlContent.includes('<head>')) {
        return htmlContent.replace('<head>', `<head>\n    ${cssLink}`);
    } else {
        console.warn('⚠️  No <head> tag found in HTML content');
        return htmlContent;
    }
}

module.exports = { injectCSS, initializeServer }; 