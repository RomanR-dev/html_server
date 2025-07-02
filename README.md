# 📊 HTML Report Server

[All Reports](http://localhost:3000/reports) | [Groups](http://localhost:3000/report-groups) | [Cleanup Config](http://localhost:3000/cleanup-config) | [Docs](http://localhost:3000/)

Upload HTML reports and get instant shareable URLs for CI/CD pipelines.

## 🔄 How It Works

1. **Jenkins runs** automation/tests
2. **Script uploads** HTML report to server
3. **Server returns** unique URL
4. **Team clicks** URL to view report instantly

## 🚀 Quick Start

```bash
# Start with Docker Compose
docker-compose up -d

# Server runs on http://localhost:3000
```

### docker-compose.yml
```yaml
version: '3.8'
services:
  report-server:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./reports:/app/reports
```

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/upload` | Upload new report |
| `POST` | `/update` | Update existing report |
| `GET` | `/exists/:key` | Check if report exists |
| `GET` | `/report/:key` | View report |
| `GET` | `/reports` | List all reports (UI/JSON) |
| `POST` | `/upload-reports` | Upload multiple reports to a group |
| `GET` | `/group/:groupId` | View all reports in a group |
| `GET` | `/report-groups` | List all groups (UI) |
| `GET` | `/cleanup-config` | View cleanup config (UI) |

## 🛠 Usage

### Upload Report
```bash
curl -X POST http://localhost:3000/upload \
  -H "Content-Type: application/json" \
  -d '{"key": "test-001", "html": "<html><body><h1>Test Report</h1></body></html>"}'

# Returns: {"serve_url": "http://localhost:3000/report/test-001"}
```

### Check if Report Exists
```bash
curl http://localhost:3000/exists/test-001

# Returns: {"exists": true, "serve_url": "http://localhost:3000/report/test-001"}
```

### Update Report
```bash
curl -X POST http://localhost:3000/update \
  -H "Content-Type: application/json" \
  -d '{"key": "test-001", "html": "<html><body><h1>Updated Report</h1></body></html>"}'
```

### Upload Multiple Reports to a Group
```bash
curl -X POST http://localhost:3000/upload-reports \
  -H "Content-Type: application/json" \
  -d '{"groupId": "my-group", "reports": [{"key": "r1", "html": "<html>...</html>"}, {"key": "r2", "html": "<html>...</html>"}]}'
```

## 🤖 Jenkins Integration

```bash
#!/bin/bash
# In your automation script

# Generate report HTML
REPORT_HTML="<html><body><h1>Build Results</h1></body></html>"

# Upload to server
RESPONSE=$(curl -s -X POST http://report-server:3000/upload \
  -H "Content-Type: application/json" \
  -d "{\"key\": \"build-${BUILD_NUMBER}\", \"html\": \"$REPORT_HTML\"}")

# Extract URL
REPORT_URL=$(echo "$RESPONSE" | jq -r '.serve_url')

# Display in Jenkins
echo "📊 Report: $REPORT_URL"
```

**Result:** Team gets instant clickable link to view live reports during build execution.

## New Features (2025)

### Group Upload and Viewing
- **POST /upload-reports**: Upload multiple reports at once to a group. Body: `{ groupId, reports: [{ key, html }] }`.
- **GET /group/:groupId**: Modern page showing all reports in a group, with a toolbar of buttons for each report.
- **GET /report-groups**: Modern, HD-friendly page listing all groups, each expandable to show reports in that group.

### Modern Reports Table
- **GET /reports**: Now renders a modern, filterable, sortable, searchable table of all reports. Each row is expandable for more details. Still returns JSON if requested with `Accept: application/json`.

### Cleanup Configuration UI
- **GET /cleanup-config**: Modern page showing the current cleanup configuration, auto-refreshing every 5 seconds.

### Backward Compatibility
- **/upload** and **/update** still work as before for single reports.

---

See the UI for more details and try out the new endpoints!