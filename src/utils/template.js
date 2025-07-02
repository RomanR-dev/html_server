const fs = require('fs').promises;
const path = require('path');

const TEMPLATE_DIR = path.join(__dirname, '../templates');

async function renderTemplate(templateName, replacements) {
    let html = await fs.readFile(path.join(TEMPLATE_DIR, templateName), 'utf8');
    for (const [key, value] of Object.entries(replacements)) {
        html = html.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }
    return html;
}

module.exports = { renderTemplate }; 