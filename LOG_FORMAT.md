# Log Format Reference

This document describes the log transformation from Vercel's log drain format to the shape sent to Coralogix.

## Coralogix Ingestion Object

Each log entry is sent to the Coralogix `/logs/v1/singles` endpoint as a JSON object with the following shape:

```json
{
  "text": "<JSON-stringified transformed log>",
  "severity": 3,
  "timestamp": 1573817250283,
  "applicationName": "Vercel",
  "subsystemName": "lambda"
}
```

| Field | Type | Description |
|---|---|---|
| `text` | string | JSON-stringified transformed log entry (see below) |
| `severity` | number | Coralogix severity level mapped from Vercel's log level |
| `timestamp` | number | Unix timestamp in milliseconds |
| `applicationName` | string | Configurable via `CORALOGIX_APPLICATION_NAME` env var (default: `Vercel`) |
| `subsystemName` | string | Set to the Vercel log `source` (e.g. `lambda`, `edge`, `build`) |

### Severity Mapping

| Vercel Level | Coralogix Severity | Numeric Value |
|---|---|---|
| `info` | Info | 3 |
| `warning` | Warning | 4 |
| `error` | Error | 5 |
| `fatal` | Critical | 6 |
| _(unknown)_ | Info | 3 |

## Transformed Log Entry

The `text` field contains a JSON-stringified object with the following fields. Fields are `undefined` (omitted from JSON) when not present in the original Vercel log entry.

### Core Fields

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique identifier for the log entry |
| `timestamp` | number | Unix timestamp in ms (uses `proxy.timestamp` if available, otherwise root `timestamp`) |
| `deploymentId` | string | Vercel deployment identifier |
| `host` | string | Hostname of the request |
| `projectId` | string | Vercel project identifier |
| `requestId` | string | UUID identifying the request |
| `executionRegion` | string | Region where the request executed (e.g. `sfo1`) |
| `level` | string | Original Vercel log level (`info`, `warning`, `error`, `fatal`) |
| `projectName` | string | Name of the Vercel project |
| `source` | string | Log origin: `build`, `edge`, `lambda`, `static`, `external`, `firewall`, or `redirect` |
| `branch` | string | Git branch name |
| `environment` | string | `production` or `preview` |
| `type` | string | Log output type: `command`, `stdout`, `stderr`, `exit`, `deployment-state`, `delimiter`, `middleware`, `middleware-invocation`, `edge-function-invocation`, `metric`, `report`, `fatal` |
| `statusCode` | number | HTTP status code (`-1` means the lambda crashed) |
| `message` | string | Log message. Falls back to `"{source} {proxyStatusCode} {host}{path}"` for proxy logs, or `"{source} log"` otherwise |

### Build / Edge / Rewrite Fields

| Field | Type | Description |
|---|---|---|
| `buildId` | string | Build identifier (only on build logs) |
| `entrypoint` | string | Function entrypoint path (e.g. `api/index.js`) |
| `destination` | string | Origin URL for `external` and `redirect` logs |
| `edgeType` | string | `edge-function` or `middleware` |

### Tracing Fields

| Field | Type | Description |
|---|---|---|
| `traceId` | string | Trace identifier for distributed tracing |
| `spanId` | string | Span identifier for distributed tracing |
| `traceparent` | string | Constructed W3C traceparent header: `00-{traceId}-{spanId}-01`. Only present when both `traceId` and `spanId` exist |

### Proxy Fields

These fields are extracted from the Vercel `proxy` object and are only present on request-level logs (not build logs).

| Field | Type | Description |
|---|---|---|
| `method` | string | HTTP method (e.g. `GET`, `POST`) |
| `path` | string | Request path including query parameters |
| `proxyStatusCode` | number | HTTP status code from the proxy (`-1` means background revalidation). Separate from root `statusCode` |
| `userAgent` | string | First user agent string from the request |
| `clientIp` | string | Client IP address |
| `region` | string | Region where the request was processed |
| `referrer` | string | Referrer of the request |
| `scheme` | string | Protocol (`https` or `http`) |
| `responseByteSize` | number | Size of the response in bytes |
| `vercelId` | string | Unique Vercel request identifier |
| `vercelCache` | string | Cache status: `MISS`, `HIT`, `STALE`, `BYPASS`, `PRERENDER`, or `REVALIDATED` |
| `pathType` | string | How the request was served: `func`, `prerender`, `background_func`, `edge`, `middleware`, `streaming_func`, `partial_prerender`, `external`, `static`, `not_found`, `unknown`, `api` |
| `wafAction` | string | Firewall action taken: `log`, `challenge`, `deny`, `bypass`, `rate_limit` |
| `wafRuleId` | string | ID of the matched firewall rule |

## Example

A transformed lambda log entry:

```json
{
  "id": "1573817250283254651097202070",
  "timestamp": 1573817250172,
  "deploymentId": "dpl_233NRGRjVZX1caZrXWtz5g1TAksD",
  "host": "my-app.vercel.app",
  "projectId": "gdufoJxB6b9b1fEqr1jUtFkyavUU",
  "requestId": "643af4e3-975a-4cc7-9e7a-1eda11539d90",
  "executionRegion": "sfo1",
  "level": "info",
  "projectName": "my-app",
  "source": "lambda",
  "branch": "main",
  "environment": "production",
  "type": "stdout",
  "statusCode": 200,
  "message": "API request processed",
  "traceId": "1b02cd14bb8642fd092bc23f54c7ffcd",
  "spanId": "f24e8631bd11faa7",
  "traceparent": "00-1b02cd14bb8642fd092bc23f54c7ffcd-f24e8631bd11faa7-01",
  "method": "GET",
  "path": "/api/users?page=1",
  "proxyStatusCode": 200,
  "userAgent": "Mozilla/5.0...",
  "clientIp": "120.75.16.101",
  "region": "sfo1",
  "scheme": "https",
  "vercelCache": "MISS"
}
```
