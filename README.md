# Vercel Log Drain to Coralogix Bridge

A lightweight Express service that receives [Vercel Log Drain](https://vercel.com/docs/observability/log-drains) webhooks and forwards them to [Coralogix](https://coralogix.com/).

## How It Works

Vercel sends batched log entries (build, edge, lambda, and static logs) to this service via webhook. Each request is verified using HMAC-SHA1 signature validation, then log entries are transformed from Vercel's format into Coralogix's expected shape and forwarded individually to the Coralogix ingestion API.

## Setup

### Environment Variables

| Variable | Description |
|---|---|
| `PORT` | Server port (default: `8080`) |
| `VERIFY_TOKEN` | (Optional) Token returned in `x-vercel-verify` header if Vercel sends a verification handshake. May not be required for simple log drains |
| `LOG_DRAIN_SECRET` | Secret used to verify the `x-vercel-signature` HMAC-SHA1 header on incoming requests |
| `CORALOGIX_KEY` | Your Coralogix [Send-Your-Data API key](https://coralogix.com/docs/send-your-data-api-key/) |
| `CORALOGIX_INGRESS_URL` | Coralogix ingestion URL (default: `https://ingress.us1.coralogix.com/logs/v1/singles`). See [Coralogix endpoints](https://coralogix.com/docs/integrations/coralogix-endpoints/) for other regions |
| `CORALOGIX_APPLICATION_NAME` | Application name in Coralogix (default: `Vercel`) |
| `USE_PROJECT_NAME` | If `true` the project name will be used as the application name instead of `CORALOGIX_APPLICATION_NAME` |
| `DEBUG` | Set to `true` to enable debug logging (incoming requests, signature verification, Coralogix responses) |

### Run Locally

```bash
yarn install
node index.js
```

### Run with Docker

```bash
docker build -t vercel-log-drain .
docker run -p 8080:8080 \
  -e LOG_DRAIN_SECRET=your-log-drain-secret \
  -e CORALOGIX_KEY=your-coralogix-key \
  -e CORALOGIX_INGRESS_URL=https://ingress.us1.coralogix.com/logs/v1/singles \
  vercel-log-drain
```

## Configuring Vercel

1. Go to your Vercel project's **Settings > Log Drains**.
2. Add a new log drain with the URL pointing to this service's `/` endpoint.
3. Set the drain secret to match your `LOG_DRAIN_SECRET` environment variable.
4. Select the log sources you want to forward (stdout, stderr, etc.).

## Log Transformation

Vercel log entries are transformed into a flat structure with fields from the root log entry, proxy details, and constructed W3C trace context. See [LOG_FORMAT.md](LOG_FORMAT.md) for the full field reference, severity mapping, and examples.

## License

MIT
