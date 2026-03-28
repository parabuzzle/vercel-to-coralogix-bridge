# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Vercel Log Drain to Coralogix bridge. Receives Vercel log drain webhook payloads via Express, verifies HMAC-SHA1 signatures, transforms log entries, and forwards them to the Coralogix ingestion API.

## Commands

- **Run:** `node index.js`
- **Run (dev with auto-reload):** `yarn dev`
- **Install dependencies:** `yarn`
- **Build Docker image:** `docker build -t vercel-log-drain .`

There are no tests or linting configured.

## Architecture

Single-file Express app (`index.js`). No build step.

- **POST `/`** — Main endpoint. Verifies `x-vercel-signature` HMAC against `LOG_DRAIN_SECRET` using raw request body, transforms Vercel log entries to Coralogix format, and POSTs each log individually to the Coralogix ingestion endpoint. Empty bodies get a verification response with `x-vercel-verify` header.
- **GET `/`** — Health check, returns "ok".

## Environment Variables

- `PORT` — Server port (default: 8080)
- `VERIFY_TOKEN` — (Optional) Returned in `x-vercel-verify` header for verification handshake
- `LOG_DRAIN_SECRET` — HMAC-SHA1 secret for verifying `x-vercel-signature`
- `CORALOGIX_KEY` — Coralogix API key (used for SDK config and Bearer auth)
- `CORALOGIX_INGRESS_URL` — Coralogix ingestion endpoint (default: `https://ingress.us1.coralogix.com/logs/v1/singles`)
- `CORALOGIX_APPLICATION_NAME` — Application name in Coralogix (default: `Vercel`)
- `USE_PROJECT_NAME` — If `true`, uses project name as application name instead of `CORALOGIX_APPLICATION_NAME`
- `DEBUG` — Set to `true` for debug logging

## Log Format

See `LOG_FORMAT.md` for the full field reference, Coralogix object shape, severity mapping, and examples.
