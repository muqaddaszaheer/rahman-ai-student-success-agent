```javascript
require("dotenv").config();

const express = require("express");
const path = require("path");

const agent = require("./lib/agent");
const hf = require("./lib/hf");
const { validateOnboarding } = require("./lib/validate");

const app = express();
const PORT = Number(process.env.PORT) || 8080;

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

/* =========================
   HEALTH CHECK
========================= */

app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    provider: "Gemini",
    configured: Boolean(
      process.env.GEMINI_API_KEY &&
        process.env.GEMINI_API_KEY.trim()
    ),
    model:
      process.env.GEMINI_MODEL ||
      "gemini-2.5-flash"
  });
});

/* =========================
   ANALYZE GOAL
========================= */

app.post(
  "/api/agent/analyze-goal",
  asyncRoute(async (req, res) => {
    const check = validateOnboarding(
      req.body || {}
    );

    if (!check.valid) {
      return res.status(400).json({
        error: check.errors.join(" ")
      });
    }

    const result =
      await agent.analyzeGoalAndRoadmap(
        check.value
      );

    return res.status(200).json(result);
  })
);

/* =========================
   STUDY PLAN
========================= */

app.post(
  "/api/agent/study-plan",
  asyncRoute(async (req, res) => {
    const body = req.body || {};

    const dailyMinutes =
      Number(body.dailyMinutes);

    const durationDays =
      Number(body.durationDays);

    if (
      !body.roadmap ||
      !Array.isArray(body.roadmap.stages) ||
      body.roadmap.stages.length === 0
    ) {
      return res.status(400).json({
        error: "A valid roadmap is required."
      });
    }

    if (
      !Number.isFinite(dailyMinutes) ||
      dailyMinutes <= 0 ||
      !Number.isFinite(durationDays) ||
      durationDays <= 0
    ) {
      return res.status(400).json({
        error:
          "Daily minutes and duration days must be positive numbers."
      });
    }

    if (
      typeof body.level !== "string" ||
      !body.level.trim()
    ) {
      return res.status(400).json({
        error: "Student level is required."
      });
    }

    const result =
      await agent.generateStudyPlan({
        roadmap: body.roadmap,
        dailyMinutes,
        durationDays,
        level: body.level.trim()
      });

    return res.status(200).json(result);
  })
);

/* =========================
   PRACTICE
========================= */

app.post(
  "/api/agent/practice",
  asyncRoute(async (req, res) => {
    const body = req.body || {};

    if (
      typeof body.topic !== "string" ||
      !body.topic.trim()
    ) {
      return res.status(400).json({
        error: "A practice topic is required."
      });
    }

    if (
      typeof body.level !== "string" ||
      !body.level.trim()
    ) {
      return res.status(400).json({
        error: "Student level is required."
      });
    }

    const result =
      await agent.generatePractice({
        topic: body.topic.trim(),
        level: body.level.trim(),
        currentStageTitle:
          typeof body.currentStageTitle ===
          "string"
            ? body.currentStageTitle.trim()
            : "",
        recentWeakAreas:
          Array.isArray(
            body.recentWeakAreas
          )
            ? body.recentWeakAreas
                .slice(0, 8)
                .map((item) =>
                  String(item).trim()
                )
                .filter(Boolean)
            : []
      });

    return res.status(200).json(result);
  })
);

/* =========================
   ASSESSMENT
========================= */

app.post(
  "/api/agent/assessment",
  asyncRoute(async (req, res) => {
    const body = req.body || {};

    if (
      typeof body.topic !== "string" ||
      !body.topic.trim()
    ) {
      return res.status(400).json({
        error:
          "An assessment topic is required."
      });
    }

    if (
      typeof body.level !== "string" ||
      !body.level.trim()
    ) {
      return res.status(400).json({
        error: "Student level is required."
      });
    }

    const result =
      await agent.generateAssessment({
        topic: body.topic.trim(),
        level: body.level.trim(),
        numQuestions: body.numQuestions
      });

    return res.status(200).json(result);
  })
);

/* =========================
   AI COACH
========================= */

app.post(
  "/api/agent/coach",
  asyncRoute(async (req, res) => {
    const body = req.body || {};

    if (
      typeof body.message !== "string" ||
      !body.message.trim()
    ) {
      return res.status(400).json({
        error: "Please enter a message."
      });
    }

    const context =
      body.context &&
      typeof body.context === "object"
        ? body.context
        : {};

    const reply =
      await agent.coachReply(
        body.message.trim(),
        context
      );

    return res.status(200).json({
      reply
    });
  })
);

/* =========================
   API 404
========================= */

app.use("/api", (req, res) => {
  return res.status(404).json({
    error: "API route not found."
  });
});

/* =========================
   ERROR HANDLER
========================= */

app.use((err, req, res, next) => {
  console.error("Server error:", err);

  if (err instanceof hf.HFConfigError) {
    return res.status(500).json({
      error: err.message
    });
  }

  if (err instanceof hf.HFRequestError) {
    return res.status(502).json({
      error: err.message
    });
  }

  if (err instanceof hf.HFParseError) {
    return res.status(502).json({
      error: err.message
    });
  }

  return res.status(500).json({
    error:
      "Something went wrong on the server. Please try again."
  });
});

/* =========================
   START SERVER
========================= */

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Rahman AI Student Success Agent running on port ${PORT}`
  );

  console.log(
    `Gemini AI configured with model: ${
      process.env.GEMINI_MODEL ||
      "gemini-2.5-flash"
    }`
  );

  if (
    !process.env.GEMINI_API_KEY ||
    !process.env.GEMINI_API_KEY.trim()
  ) {
    console.warn(
      "GEMINI_API_KEY is not set. Add it to Railway Variables."
    );
  }
});
```
