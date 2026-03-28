# Vercel to Coralogix Bridge

Receives [Vercel Log Drain](https://vercel.com/docs/observability/log-drains) webhooks, verifies HMAC-SHA1 signatures, transforms log entries, and forwards them to [Coralogix](https://coralogix.com/).

## Quick Start

```bash
docker run -p 8080:8080 \
  -e LOG_DRAIN_SECRET=your-log-drain-secret \
  -e CORALOGIX_KEY=your-coralogix-key \
  parabuzzle/vercel-to-coralogix-bridge:latest
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `LOG_DRAIN_SECRET` | Yes | Secret for verifying Vercel's `x-vercel-signature` HMAC-SHA1 header |
| `CORALOGIX_KEY` | Yes | Your Coralogix [Send-Your-Data API key](https://coralogix.com/docs/send-your-data-api-key/) |
| `CORALOGIX_INGRESS_URL` | No | Coralogix ingestion URL (default: `https://ingress.us1.coralogix.com/logs/v1/singles`) |
| `CORALOGIX_APPLICATION_NAME` | No | Application name in Coralogix (default: `Vercel`) |
| `USE_PROJECT_NAME` | No | If `true`, uses the Vercel project name as the Coralogix application name |
| `PORT` | No | Server port (default: `8080`) |
| `DEBUG` | No | Set to `true` for debug logging |

## Source

[GitHub](https://github.com/parabuzzle/vercel-logs-drain)
