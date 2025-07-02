const reportTableScript = `
let sortDirection = { key: 1, created: 1, updated: 1 };
function toggleDetails(i) {
    var row = document.getElementById('details'+i);
    var btn = row.previousElementSibling.querySelector('.expand-btn');
    if (row.style.display === 'table-row') {
        row.style.display = 'none';
        btn.innerHTML = '&#9654;';
    } else {
        row.style.display = 'table-row';
        btn.innerHTML = '&#9660;';
    }
}
function filterTable() {
    var input = document.getElementById('search').value.toLowerCase();
    var rows = document.querySelectorAll('#reportTable tbody tr');
    for (var i = 0; i < rows.length; i += 2) {
        var name = rows[i].children[1].textContent.toLowerCase();
        rows[i].style.display = name.includes(input) ? '' : 'none';
        rows[i+1].style.display = name.includes(input) && rows[i+1].style.display === 'table-row' ? 'table-row' : 'none';
    }
}
function sortTable(col) {
    var table = document.getElementById('reportTbody');
    var rows = Array.from(table.querySelectorAll('tr')).filter((_,i) => i%2===0);
    var details = Array.from(table.querySelectorAll('tr')).filter((_,i) => i%2===1);
    var idx = { key: 1, created: 2, updated: 3 }[col];
    rows = rows.map((row, i) => ({ row, details: details[i] }));
    rows.sort(function(a, b) {
        var aVal = a.row.children[idx].textContent;
        var bVal = b.row.children[idx].textContent;
        if (col === 'created' || col === 'updated') {
            aVal = new Date(aVal);
            bVal = new Date(bVal);
        }
        if (aVal < bVal) return -1 * sortDirection[col];
        if (aVal > bVal) return 1 * sortDirection[col];
        return 0;
    });
    sortDirection[col] *= -1;
    table.innerHTML = '';
    rows.forEach(({row, details}) => { table.appendChild(row); table.appendChild(details); });
}
`;

const groupListScript = `
function toggleGroup(i) {
    var content = document.getElementById('group'+i);
    var arrow = document.getElementById('arrow'+i);
    if (content.style.display === 'block') {
        content.style.display = 'none';
        arrow.innerHTML = '&#9654;';
        arrow.style.transform = '';
    } else {
        content.style.display = 'block';
        arrow.innerHTML = '&#9660;';
        arrow.style.transform = 'rotate(90deg)';
    }
}
`;

const cleanupConfigScript = `
let cleanupConfig = null;
function formatTime(ms) {
    if (ms < 0) return '00:00:00';
    let s = Math.floor(ms/1000)%60;
    let m = Math.floor(ms/60000)%60;
    let h = Math.floor(ms/3600000);
    return h.toString().padStart(2,'0')+':'+m.toString().padStart(2,'0')+':'+s.toString().padStart(2,'0');
}
async function fetchConfig() {
    const res = await fetch('/cleanup/config');
    const data = await res.json();
    cleanupConfig = data;
    document.getElementById('enabled').innerHTML = data.enabled ? '<span class="enabled-yes">Yes</span>' : '<span class="enabled-no">No</span>';
    document.getElementById('interval').textContent = data.cleanupIntervalMinutes;
    document.getElementById('idle').textContent = data.maxIdleTimeHours;
    document.getElementById('age').textContent = data.maxAgeDays;
    document.getElementById('now').textContent = data.currentTime;
    document.getElementById('next').textContent = data.nextCleanupIn;
}
function updateTimers() {
    if (!cleanupConfig) return;
    let intervalMs = (cleanupConfig.cleanupIntervalMinutes || 0) * 60 * 1000;
    let now = new Date();
    let nextIdle = intervalMs - (now.getTime() % intervalMs);
    document.getElementById('idle-timer').textContent = formatTime(nextIdle);
    let maxAgeMs = (cleanupConfig.maxAgeDays || 0) * 24 * 60 * 60 * 1000;
    document.getElementById('maxage-timer').textContent = formatTime(maxAgeMs);
}
fetchConfig();
setInterval(fetchConfig, 5000);
setInterval(updateTimers, 1000);
`;

module.exports = {
    reportTableScript,
    groupListScript,
    cleanupConfigScript
}; 