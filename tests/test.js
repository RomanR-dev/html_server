const axios = require('axios');

// Test configuration
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

// Test data
const sampleHTML = `
<html>
<head>
    <title>Test Report</title>
</head>
<body>
    <div class="report-container">
        <h1>Performance Test Results</h1>
        <table>
            <tr><th>Test</th><th>Status</th><th>Duration</th></tr>
            <tr><td>Login Test</td><td><span class="success">PASSED</span></td><td>1.2s</td></tr>
            <tr><td>API Test</td><td><span class="error">FAILED</span></td><td>timeout</td></tr>
        </table>
    </div>
</body>
</html>
`;

const updatedHTML = `
<html>
<head>
    <title>Updated Test Report</title>
</head>
<body>
    <div class="report-container">
        <h1>Updated Performance Test Results</h1>
        <table>
            <tr><th>Test</th><th>Status</th><th>Duration</th></tr>
            <tr><td>Login Test</td><td><span class="success">PASSED</span></td><td>1.1s</td></tr>
            <tr><td>API Test</td><td><span class="success">PASSED</span></td><td>2.3s</td></tr>
        </table>
    </div>
</body>
</html>
`;

// HTTP helper
async function makeRequest(method, endpoint, data = null) {
    const config = {
        method,
        url: `${BASE_URL}${endpoint}`,
        timeout: 10000,
        validateStatus: () => true // Don't throw on HTTP errors
    };

    if (data) {
        config.data = data;
        config.headers = { 'Content-Type': 'application/json' };
    }

    return await axios(config);
}

// Wait for server helper
async function waitForServer(retries = 30, delay = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await axios.get(`${BASE_URL}/health`, { timeout: 3000 });
            if (response.status === 200) {
                return true;
            }
        } catch (error) {
            if (i === retries - 1) {
                throw new Error(`Server not responding after ${retries} retries`);
            }
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// Setup and teardown
beforeAll(async () => {
    console.log(`🚀 Testing HTML Report Server at: ${BASE_URL}`);
    await waitForServer();
    console.log('✅ Server is ready');
}, 30000);

afterAll(async () => {
    // Clean up any test data
    try {
        await makeRequest('DELETE', '/report/test-report-001');
        await makeRequest('DELETE', '/report/test-report-002');
        await makeRequest('DELETE', '/report/security-scan-001');
    } catch (error) {
        // Ignore cleanup errors
    }
});

// Health and System Tests
describe('System Health', () => {
    test('Health Check', async () => {
        const response = await makeRequest('GET', '/health');

        expect(response.status).toBe(200);
        expect(response.data.status).toBe('healthy');
        expect(typeof response.data.reports).toBe('number');
        expect(typeof response.data.uptime).toBe('number');
    });

    test('Root Documentation Page', async () => {
        const response = await makeRequest('GET', '/');

        expect(response.status).toBe(200);
        expect(response.data).toContain('HTML Report Server');
    });
});

// Report Upload Tests
describe('Report Upload', () => {
    test('Upload New Report', async () => {
        const response = await makeRequest('POST', '/upload', {
            key: 'test-report-001',
            html: sampleHTML
        });

        expect(response.status).toBe(200);
        expect(response.data.success).toBe(true);
        expect(response.data.key).toBe('test-report-001');
        expect(response.data.serve_url).toContain('/report/test-report-001');
        expect(response.data.url).toBe('/report/test-report-001');
    });

    test('Upload Another Report', async () => {
        const response = await makeRequest('POST', '/upload', {
            key: 'test-report-002',
            html: '<html><head><title>Second Report</title></head><body><h1>Second Test</h1></body></html>'
        });

        expect(response.status).toBe(200);
        expect(response.data.success).toBe(true);
        expect(response.data.key).toBe('test-report-002');
    });

    test('Upload Report with Complex HTML', async () => {
        const complexHTML = `
        <html>
        <head><title>Security Report</title></head>
        <body>
            <h1>Security Scan Results</h1>
            <table>
                <tr><th>Vulnerability</th><th>Severity</th><th>Status</th></tr>
                <tr><td>SQL Injection</td><td><span class="error">HIGH</span></td><td>Fixed</td></tr>
                <tr><td>XSS</td><td><span class="warning">MEDIUM</span></td><td>Open</td></tr>
            </table>
        </body>
        </html>
        `;

        const response = await makeRequest('POST', '/upload', {
            key: 'security-scan-001',
            html: complexHTML
        });

        expect(response.status).toBe(200);
        expect(response.data.success).toBe(true);
    });
});

// Report Existence Tests
describe('Report Existence Check', () => {
    test('Check Existing Report', async () => {
        const response = await makeRequest('GET', '/exists/test-report-001');

        expect(response.status).toBe(200);
        expect(response.data.exists).toBe(true);
        expect(response.data.key).toBe('test-report-001');
        expect(response.data.serve_url).toContain('/report/test-report-001');
        expect(response.data).toHaveProperty('created');
        expect(response.data).toHaveProperty('updated');
    });

    test('Check Non-Existent Report', async () => {
        const response = await makeRequest('GET', '/exists/non-existent-report');

        expect(response.status).toBe(200);
        expect(response.data.exists).toBe(false);
        expect(response.data.key).toBe('non-existent-report');
        expect(response.data).not.toHaveProperty('serve_url');
    });

    test('Check Multiple Reports Exist', async () => {
        const reports = ['test-report-001', 'test-report-002', 'security-scan-001'];

        for (const reportKey of reports) {
            const response = await makeRequest('GET', `/exists/${reportKey}`);
            expect(response.status).toBe(200);
            expect(response.data.exists).toBe(true);
            expect(response.data.key).toBe(reportKey);
        }
    });
});

// Report Info and Serving Tests
describe('Report Information', () => {
    test('Get Report Info', async () => {
        const response = await makeRequest('GET', '/serve?key=test-report-001');

        expect(response.status).toBe(200);
        expect(response.data.key).toBe('test-report-001');
        expect(response.data.url).toBe('/report/test-report-001');
        expect(response.data.serve_url).toContain('/report/test-report-001');
        expect(response.data).toHaveProperty('created');
        expect(response.data).toHaveProperty('updated');
    });

    test('View Report Content', async () => {
        const response = await makeRequest('GET', '/report/test-report-001');

        expect(response.status).toBe(200);
        expect(response.data).toContain('<title>Test Report</title>');
        expect(response.data).toContain('Performance Test Results');
        expect(response.data).toContain('<link rel="stylesheet" href="/public/report.css">');
    });

    test('List All Reports', async () => {
        const response = await makeRequest('GET', '/reports');

        expect(response.status).toBe(200);
        expect(typeof response.data.total).toBe('number');
        expect(response.data.total).toBeGreaterThanOrEqual(3);
        expect(Array.isArray(response.data.reports)).toBe(true);

        // Check report structure
        const report = response.data.reports.find(r => r.key === 'test-report-001');
        expect(report).toBeDefined();
        expect(report.serve_url).toContain('/report/test-report-001');
    });
});

// Report Update Tests
describe('Report Updates', () => {
    test('Update Existing Report', async () => {
        const response = await makeRequest('POST', '/update', {
            key: 'test-report-001',
            html: updatedHTML
        });

        expect(response.status).toBe(200);
        expect(response.data.success).toBe(true);
        expect(response.data.key).toBe('test-report-001');
        expect(response.data.message).toBe('Report updated successfully');
    });

    test('Verify Report Update', async () => {
        const response = await makeRequest('GET', '/report/test-report-001');

        expect(response.status).toBe(200);
        expect(response.data).toContain('<title>Updated Test Report</title>');
        expect(response.data).toContain('Updated Performance Test Results');
    });

    test('Update Report Multiple Times', async () => {
        const iterations = ['First Update', 'Second Update', 'Final Update'];

        for (const [index, title] of iterations.entries()) {
            const html = `<html><head><title>${title}</title></head><body><h1>Update #${index + 1}</h1></body></html>`;

            const response = await makeRequest('POST', '/update', {
                key: 'test-report-002',
                html: html
            });

            expect(response.status).toBe(200);
            expect(response.data.success).toBe(true);
        }

        // Verify final update
        const finalResponse = await makeRequest('GET', '/report/test-report-002');
        expect(finalResponse.data).toContain('<title>Final Update</title>');
    });
});

// Error Handling Tests
describe('Error Handling', () => {
    test('Duplicate Key Upload Should Fail', async () => {
        const response = await makeRequest('POST', '/upload', {
            key: 'test-report-001',
            html: sampleHTML
        });

        expect(response.status).toBe(409);
        expect(response.data.error).toContain('already exists');
    });

    test('Update Non-Existent Report Should Fail', async () => {
        const response = await makeRequest('POST', '/update', {
            key: 'definitely-does-not-exist',
            html: sampleHTML
        });

        expect(response.status).toBe(404);
        expect(response.data.error).toContain('not found');
    });

    test('Invalid Upload Request - Missing HTML', async () => {
        const response = await makeRequest('POST', '/upload', {
            key: 'test-invalid'
            // Missing html field
        });

        expect(response.status).toBe(400);
        expect(response.data.error).toContain('required');
    });

    test('Invalid Upload Request - Missing Key', async () => {
        const response = await makeRequest('POST', '/upload', {
            html: sampleHTML
            // Missing key field
        });

        expect(response.status).toBe(400);
        expect(response.data.error).toContain('required');
    });

    test('View Non-Existent Report', async () => {
        const response = await makeRequest('GET', '/report/absolutely-missing-report');

        expect(response.status).toBe(404);
        expect(response.data).toContain('Report Not Found');
    });

    test('Invalid Serve Request - Missing Key', async () => {
        const response = await makeRequest('GET', '/serve');

        expect(response.status).toBe(400);
        expect(response.data.error).toContain('key parameter is required');
    });

    test('Serve Non-Existent Report', async () => {
        const response = await makeRequest('GET', '/serve?key=missing-report-key');

        expect(response.status).toBe(404);
        expect(response.data.error).toContain('not found');
    });
});

// Cleanup Management Tests
describe('Cleanup Management', () => {
    test('Get Cleanup Configuration', async () => {
        const response = await makeRequest('GET', '/cleanup/config');

        expect(response.status).toBe(200);
        expect(typeof response.data.enabled).toBe('boolean');
        expect(typeof response.data.cleanupIntervalMinutes).toBe('number');
        expect(typeof response.data.maxIdleTimeHours).toBe('number');
        expect(typeof response.data.maxAgeDays).toBe('number');
        expect(response.data).toHaveProperty('currentTime');
    });

    test('Manual Cleanup Trigger', async () => {
        const response = await makeRequest('POST', '/cleanup');

        expect(response.status).toBe(200);
        expect(response.data.success).toBe(true);
        expect(response.data.message).toContain('cleanup completed');
        expect(typeof response.data.deletedReports).toBe('number');
        expect(typeof response.data.remainingReports).toBe('number');
    });

    test('Update Cleanup Configuration', async () => {
        const newConfig = {
            enabled: true,
            maxIdleTimeHours: 48,
            maxAgeDays: 14,
            cleanupIntervalMinutes: 60
        };

        const response = await makeRequest('PUT', '/cleanup/config', newConfig);

        expect(response.status).toBe(200);
        expect(response.data.success).toBe(true);
        expect(response.data.message).toBe('Configuration updated');
        expect(response.data.newConfig.maxIdleTimeHours).toBe(48);
        expect(response.data.newConfig.maxAgeDays).toBe(14);
    });

    test('Verify Updated Cleanup Configuration', async () => {
        const response = await makeRequest('GET', '/cleanup/config');

        expect(response.status).toBe(200);
        expect(response.data.maxIdleTimeHours).toBe(48);
        expect(response.data.maxAgeDays).toBe(14);
        expect(response.data.cleanupIntervalMinutes).toBe(60);
    });

    test('Disable and Re-enable Cleanup', async () => {
        // Disable cleanup
        const disableResponse = await makeRequest('PUT', '/cleanup/config', {
            enabled: false
        });
        expect(disableResponse.status).toBe(200);
        expect(disableResponse.data.newConfig.enabled).toBe(false);

        // Verify disabled
        const checkResponse = await makeRequest('GET', '/cleanup/config');
        expect(checkResponse.data.enabled).toBe(false);

        // Re-enable cleanup
        const enableResponse = await makeRequest('PUT', '/cleanup/config', {
            enabled: true
        });
        expect(enableResponse.status).toBe(200);
        expect(enableResponse.data.newConfig.enabled).toBe(true);
    });
});

// Report Deletion Tests
describe('Report Deletion', () => {
    test('Delete Existing Report', async () => {
        const response = await makeRequest('DELETE', '/report/test-report-002');

        expect(response.status).toBe(200);
        expect(response.data.success).toBe(true);
        expect(response.data.key).toBe('test-report-002');
        expect(response.data.message).toContain('deleted successfully');
    });

    test('Verify Report Deletion', async () => {
        const response = await makeRequest('GET', '/exists/test-report-002');

        expect(response.status).toBe(200);
        expect(response.data.exists).toBe(false);
    });

    test('Delete Non-Existent Report', async () => {
        const response = await makeRequest('DELETE', '/report/never-existed-report');

        expect(response.status).toBe(404);
        expect(response.data.error).toContain('not found');
    });

    test('Try to View Deleted Report', async () => {
        const response = await makeRequest('GET', '/report/test-report-002');

        expect(response.status).toBe(404);
        expect(response.data).toContain('Report Not Found');
    });
});

// Integration Tests
describe('End-to-End Workflows', () => {
    test('Complete Report Lifecycle', async () => {
        const reportKey = 'lifecycle-test-report';
        const initialHTML = '<html><head><title>Initial</title></head><body><h1>Initial Report</h1></body></html>';
        const updatedHTML = '<html><head><title>Updated</title></head><body><h1>Updated Report</h1></body></html>';

        // 1. Upload
        const uploadResponse = await makeRequest('POST', '/upload', {
            key: reportKey,
            html: initialHTML
        });
        expect(uploadResponse.status).toBe(200);

        // 2. Check exists
        const existsResponse = await makeRequest('GET', `/exists/${reportKey}`);
        expect(existsResponse.data.exists).toBe(true);

        // 3. View content
        const viewResponse = await makeRequest('GET', `/report/${reportKey}`);
        expect(viewResponse.data).toContain('<title>Initial</title>');

        // 4. Update
        const updateResponse = await makeRequest('POST', '/update', {
            key: reportKey,
            html: updatedHTML
        });
        expect(updateResponse.status).toBe(200);

        // 5. Verify update
        const updatedViewResponse = await makeRequest('GET', `/report/${reportKey}`);
        expect(updatedViewResponse.data).toContain('<title>Updated</title>');

        // 6. Delete
        const deleteResponse = await makeRequest('DELETE', `/report/${reportKey}`);
        expect(deleteResponse.status).toBe(200);

        // 7. Verify deletion
        const finalExistsResponse = await makeRequest('GET', `/exists/${reportKey}`);
        expect(finalExistsResponse.data.exists).toBe(false);
    });

    test('Bulk Report Operations', async () => {
        const reportKeys = ['bulk-test-1', 'bulk-test-2', 'bulk-test-3'];

        // Upload multiple reports
        for (const key of reportKeys) {
            const response = await makeRequest('POST', '/upload', {
                key,
                html: `<html><head><title>${key}</title></head><body><h1>Report ${key}</h1></body></html>`
            });
            expect(response.status).toBe(200);
        }

        // Verify all exist
        for (const key of reportKeys) {
            const response = await makeRequest('GET', `/exists/${key}`);
            expect(response.data.exists).toBe(true);
        }

        // Check reports list includes our reports
        const listResponse = await makeRequest('GET', '/reports');
        expect(listResponse.status).toBe(200);
        expect(listResponse.data.total).toBeGreaterThanOrEqual(reportKeys.length);

        // Clean up
        for (const key of reportKeys) {
            await makeRequest('DELETE', `/report/${key}`);
        }
    });
});