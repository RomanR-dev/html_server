# 📊 HTML Report Server

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
| `GET` | `/reports` | List all reports |

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