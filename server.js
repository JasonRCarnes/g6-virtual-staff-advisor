
require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const { routeRequest, generateAdvice } = require("./src/advisor");
const { getKnowledgeStatus } = require("./src/knowledge");

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.disable("x-powered-by");
app.use(helmet());
app.use(express.json({ limit: "32kb" }));

// Single-origin development setup.
// Production deployments also require approved identity and access controls.
app.use((req, res, next) => {
  const origin = req.get("origin");
  const allowedOrigin = process.env.ALLOWED_ORIGIN;

  if (origin && origin !== allowedOrigin) {
    return res.status(403).json({ error: "Origin not permitted." });
  }

  next();
});

app.use(express.static(path.join(__dirname, "public")));

const auditPath = path.resolve(
  __dirname,
  process.env.AUDIT_FILE || "./private/audit.jsonl"
);

function audit(event) {
  try {
    fs.mkdirSync(path.dirname(auditPath), {
      recursive: true,
      mode: 0o700
    });

    fs.appendFileSync(
      auditPath,
      JSON.stringify({
        timestamp: new Date().toISOString(),
        ...event
      }) + "\n",
      { mode: 0o600 }
    );
  } catch {
    // Fail visibly in server logs; never claim audit success.
    console.error("Audit write failed.");
  }
}

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    advisor: "USAREUR-AF CIO/G6 Virtual Staff Advisor",
    aiEnabled: process.env.AI_ENABLED === "true"
  });
});

app.get("/api/admin/status", (req, res) => {
  try {
    const status = getKnowledgeStatus();

    res.json({
      contentOwner: status.owner,
      reviewCycleDays: status.reviewCycleDays,
      totalSources: status.total,
      eligibleSources: status.eligible.length,
      ineligibleSources: status.ineligible,
      aiEnabled: process.env.AI_ENABLED === "true",
      note:
        "Read-only prototype metadata. Production requires authenticated " +
        "administrative access."
    });
  } catch {
    res.status(503).json({
      error: "Knowledge registry unavailable."
    });
  }
});

app.post("/api/advisor", async (req, res) => {
  const query = req.body?.query;

  if (
    typeof query !== "string" ||
    !query.trim() ||
    query.length > 8000
  ) {
    return res.status(400).json({
      error: "Enter a question of 1–8,000 characters."
    });
  }

  const requestId = crypto.randomUUID();

  try {
    const route = routeRequest(query);
    const status = getKnowledgeStatus();

    const result = await generateAdvice({
      query: query.trim(),
      route,
      sources: status.eligible
    });

    audit({
      requestId,
      route: route?.id || "unmatched",
      mode: result.mode,
      sourceIds: (result.sources || []).map(source => source.id),
      outcome: "response-returned"
    });

    res.json({ requestId, ...result });
  } catch (error) {
    audit({
      requestId,
      outcome: "processing-error"
    });

    console.error("Advisor request failed:", error.message);

    res.status(502).json({
      error:
        "The advisor could not complete the request. Retry later or use " +
        "the approved support channel.",
      requestId
    });
  }
});

// The starter intentionally does not provide an unauthenticated
// document-upload, source-editing, or approval endpoint.

app.listen(PORT, () => {
  console.log(`G6 Virtual Staff Advisor running on port ${PORT}`);
});

