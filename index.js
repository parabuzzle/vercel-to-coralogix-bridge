const dns = require("dns");
const https = require("https");
dns.setDefaultResultOrder("ipv4first");

const express = require("express");
const crypto = require("crypto");
const app = express();
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

// Circuit breaker state
const circuitBreaker = {
  failures: 0,
  open: false,
  nextProbeTime: 0,
  maxFailures: 5,
  resetTimeout: 60000,    // 60s before trying again after circuit opens

  recordFailure() {
    this.failures++;
    if (!this.open && this.failures >= this.maxFailures) {
      this.open = true;
      console.error(`Circuit breaker OPEN — ${this.failures} consecutive failures. Will probe again in ${this.resetTimeout / 1000}s.`);
    }
    if (this.open) {
      this.nextProbeTime = Date.now() + this.resetTimeout;
    }
  },

  recordSuccess() {
    if (this.open) {
      console.log("Circuit breaker CLOSED — Coralogix reachable again.");
    }
    this.failures = 0;
    this.open = false;
  },

  isOpen() {
    if (!this.open) return false;
    if (Date.now() >= this.nextProbeTime) {
      // Block further probes until this one resolves
      this.nextProbeTime = Infinity;
      console.log("Circuit breaker HALF-OPEN — sending probe request.");
      return false;
    }
    return true;
  },
};

const FETCH_TIMEOUT_MS = 10000; // 10s fetch timeout
const MAX_INFLIGHT = 20; // max concurrent requests to Coralogix
let inflight = 0;

// Stats for /status endpoint
const stats = {
  startedAt: Date.now(),
  lastLogReceivedAt: 0,
  lastForwardSuccessAt: 0,
  lastForwardFailureAt: 0,
  logsReceived: 0,
  logsForwarded: 0,
  logsFailed: 0,
  logsDropped: 0,
};

const agent = new https.Agent({
  keepAlive: true,
  maxSockets: 10,
  family: 4,
});

function postToCoralogix(url, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const data = JSON.stringify(body);
    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: parsed.pathname,
        method: "POST",
        agent,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${coralogixKey}`,
          "Content-Length": Buffer.byteLength(data),
        },
        timeout: FETCH_TIMEOUT_MS,
      },
      (res) => {
        let responseBody = "";
        res.on("data", (chunk) => (responseBody += chunk));
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ status: res.statusCode, body: responseBody });
          } else {
            reject(new Error(`Coralogix returned ${res.statusCode}: ${responseBody}`));
          }
        });
      }
    );
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`request timed out after ${FETCH_TIMEOUT_MS}ms`));
    });
    req.on("error", (err) => {
      reject(new Error(`fetch failed (${err.code || err.message})`));
    });
    req.write(data);
    req.end();
  });
}

const port = process.env.PORT || 8080;

const verifyToken =
  process.env.VERIFY_TOKEN;

const coralogixKey =
  process.env.CORALOGIX_KEY;

const coralogixIngressUrl =
  process.env.CORALOGIX_INGRESS_URL ||
  "https://ingress.us1.coralogix.com/logs/v1/singles";

const debug = process.env.DEBUG === "true";

if (!process.env.LOG_DRAIN_SECRET) {
  console.error("LOG_DRAIN_SECRET is required");
  process.exit(1);
}
if (!coralogixKey) {
  console.error("CORALOGIX_KEY is required");
  process.exit(1);
}

async function verifySignature(req) {
  const signature = crypto
    .createHmac(
      "sha1",
      process.env.LOG_DRAIN_SECRET
    )
    .update(req.rawBody)
    .digest("hex");
  const expected = req.headers["x-vercel-signature"] || "";
  if (signature.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function transformLevel(level) {
  switch (level) {
    case "info":
      return 3;
    case "warning":
      return 4;
    case "error":
      return 5;
    case "fatal":
      return 6;
    default:
      return 3;
  }
}

function transformLogEntry(logEntry) {
  const {
    proxy,
    id,
    timestamp,
    deploymentId,
    host,
    projectId,
    requestId,
    executionRegion,
    level,
    projectName,
    source,
    branch,
    environment,
    traceId,
    spanId,
    statusCode,
    type,
    buildId,
    entrypoint,
    destination,
    edgeType,
  } = logEntry;

  const message =
    logEntry.message ||
    (proxy
      ? `${source} ${proxy.statusCode} ${proxy.host}${proxy.path}`
      : `${source} log`);

  return {
    id,
    timestamp: proxy?.timestamp || timestamp,
    deploymentId,
    host,
    projectId,
    requestId,
    executionRegion,
    level,
    projectName,
    source,
    branch,
    environment,
    type,
    buildId,
    entrypoint,
    destination,
    edgeType,
    statusCode,
    message,
    traceId,
    spanId,
    traceparent: traceId && spanId ? `00-${traceId}-${spanId}-01` : undefined,
    method: proxy?.method,
    path: proxy?.path,
    proxyStatusCode: proxy?.statusCode,
    userAgent: proxy?.userAgent ? proxy.userAgent[0] : undefined,
    clientIp: proxy?.clientIp,
    region: proxy?.region,
    referrer: proxy?.referrer,
    scheme: proxy?.scheme,
    responseByteSize: proxy?.responseByteSize,
    vercelCache: proxy?.vercelCache,
    pathType: proxy?.pathType,
    vercelId: proxy?.vercelId,
    wafAction: proxy?.wafAction,
    wafRuleId: proxy?.wafRuleId,
  };
}

function transformLogEntries(logEntries) {
  return logEntries.map(transformLogEntry);
}

app.get("/", (_, res) => {
  res.send("ok");
});

app.get("/status", (_, res) => {
  const now = Date.now();
  const uptimeSeconds = Math.floor((now - stats.startedAt) / 1000);
  const secondsSinceLastLog = stats.lastLogReceivedAt ? Math.floor((now - stats.lastLogReceivedAt) / 1000) : null;
  const secondsSinceLastSuccess = stats.lastForwardSuccessAt ? Math.floor((now - stats.lastForwardSuccessAt) / 1000) : null;

  // Healthy if: circuit breaker is closed AND we've successfully forwarded logs in the last 5 minutes
  const logsFlowing = secondsSinceLastSuccess !== null && secondsSinceLastSuccess < 300;
  const healthy = !circuitBreaker.open && logsFlowing;

  const body = {
    status: healthy ? "healthy" : "degraded",
    uptime: uptimeSeconds,
    circuitBreaker: circuitBreaker.open ? "open" : "closed",
    inflight,
    logsFlowing,
    secondsSinceLastLog,
    secondsSinceLastSuccess,
    counts: {
      received: stats.logsReceived,
      forwarded: stats.logsForwarded,
      failed: stats.logsFailed,
      dropped: stats.logsDropped,
    },
  };

  res.status(healthy ? 200 : 503).json(body);
});

app.post("/", async (req, res) => {
  if (debug) {
    console.log(`[DEBUG] POST / - body length: ${req.body?.length ?? 0}, content-type: ${req.headers["content-type"]}`);
  }

  if (!req.body || !req.body.length) {
    if (debug) console.log("[DEBUG] Empty body - sending verification response");
    res.status(200);
    res.header("x-vercel-verify", verifyToken);
    res.send("ok");
    return;
  }

  if (!(await verifySignature(req))) {
    if (debug) console.log("[DEBUG] Signature verification failed");
    console.error("Unauthorized request — signature mismatch");
    res.status(401).send("Unauthorized");
    return;
  }
  if (debug) console.log("[DEBUG] Signature verified");

  stats.lastLogReceivedAt = Date.now();
  stats.logsReceived += req.body.length;

  if (circuitBreaker.isOpen()) {
    if (debug) console.log("[DEBUG] Circuit breaker open — dropping logs");
    stats.logsDropped += req.body.length;
    res.status(503).send("Service temporarily unavailable");
    return;
  }

  if (inflight >= MAX_INFLIGHT) {
    if (debug) console.log(`[DEBUG] Too many in-flight requests (${inflight}) — shedding load`);
    stats.logsDropped += req.body.length;
    res.status(503).send("Service temporarily unavailable");
    return;
  }

  const logs = transformLogEntries(req.body);
  if (debug) console.log(`[DEBUG] Forwarding ${logs.length} logs to ${coralogixIngressUrl}`);

  const appName = process.env.USE_PROJECT_NAME === "true"
    ? (logs[0]?.projectName || process.env.CORALOGIX_APPLICATION_NAME || "Vercel")
    : (process.env.CORALOGIX_APPLICATION_NAME || "Vercel");

  const batch = logs.map((log) => ({
    text: JSON.stringify(log),
    severity: transformLevel(log.level),
    timestamp: log.timestamp,
    applicationName: process.env.USE_PROJECT_NAME === "true" ? log.projectName : appName,
    subsystemName: log.source,
  }));

  const payloadSize = JSON.stringify(batch).length;
  inflight++;
  try {
    if (debug) console.log(`[DEBUG] Sending batch of ${batch.length} logs (${(payloadSize / 1024).toFixed(1)}KB) [inflight: ${inflight}]`);
    const result = await postToCoralogix(coralogixIngressUrl, batch);
    if (debug) console.log(`[DEBUG] Coralogix response: ${result.status} - ${result.body}`);
    stats.logsForwarded += batch.length;
    stats.lastForwardSuccessAt = Date.now();
    circuitBreaker.recordSuccess();
  } catch (err) {
    stats.logsFailed += batch.length;
    stats.lastForwardFailureAt = Date.now();
    circuitBreaker.recordFailure();
    console.error("Failed to forward logs to Coralogix:", err.message);
    res.status(502).send("Failed to forward logs");
    return;
  } finally {
    inflight--;
  }

  res.send("ok");
});

app.listen(port, () => {
  console.log(`log drain listening on port ${port}`);
});
