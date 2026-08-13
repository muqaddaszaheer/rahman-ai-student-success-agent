require("dotenv").config();
const express = require("express");
const path = require("path");

const agent = require("./agent");
const hf = require("./hf");
const { validateOnboarding } = require("./validate");

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

function asyncRoute(handler) {
  return (req, res, next) =>
    Promise.resolve(handler(req, res, next)).catch(next);
}

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    hasToken: Boolean(process.env.HF_TOKEN),
    model: hf.HF_MODEL
  });
});

app.post("/api/agent/analyze-goal", asyncRoute(async (req, res) => {
  const check = validateOnboarding(req.body || {});

  if (!check.valid) {
    return res.status(400).json({
      error: check.errors.join(" ")
    });
  }

  res.json(await agent.analyzeGoalAndRoadmap(check.value));
}));

app.post("/api/agent/study-plan", asyncRoute(async (req, res) => {
  const body = req.body || {};
  const dailyMinutes = Number(body.dailyMinutes);
  const durationDays = Number(body.durationDays);

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
      error: "Daily minutes and duration days must be positive numbers."
    });
  }

  if (!body.level) {
    return res.status(400).json({
      error: "Student level is required."
    });
  }

  res.json(
    await agent.generateStudyPlan({
      roadmap: body.roadmap,
      dailyMinutes,
      durationDays,
      level: String(body.level)
    })
  );
}));

app.post("/api/agent/practice", asyncRoute(async (req, res) => {
  const body = req.body || {};

  if (!body.topic || typeof body.topic !== "string") {
    return res.status(400).json({
      error: "A practice topic is required."
    });
  }

  if (!body.level) {
    return res.status(400).json({
      error: "Student level is required."
    });
  }

  res.json(
    await agent.generatePractice({
      topic: body.topic.trim(),
      level: String(body.level),
      currentStageTitle: body.currentStageTitle || "",
      recentWeakAreas: Array.isArray(body.recentWeakAreas)
        ? body.recentWeakAreas.slice(0, 8)
        : []
    })
  );
}));

app.post("/api/agent/assessment", asyncRoute(async (req, res) => {
  const body = req.body || {};

  if (!body.topic || typeof body.topic !== "string") {
    return res.status(400).json({
      error: "An assessment topic is required."
    });
  }

  if (!body.level) {
    return res.status(400).json({
      error: "Student level is required."
    });
  }

  res.json(
    await agent.generateAssessment({
      topic: body.topic.trim(),
      level: String(body.level),
      numQuestions: body.numQuestions
    })
  );
}));

app.post("/api/agent/coach", asyncRoute(async (req, res) => {
  const body = req.body || {};

  if (
    !body.message ||
    typeof body.message !== "string" ||
    !body.message.trim()
  ) {
    return res.status(400).json({
      error: "Please enter a message."
    });
  }

  const context =
    body.context && typeof body.context === "object"
      ? body.context
      : {};

  const reply = await agent.coachReply(
    body.message.trim(),
    context
  );

  res.json({ reply });
}));

app.use("/api", (req, res) => {
  res.status(404).json({
    error: "API route not found."
  });
});

app.use((err, req, res, next) => {
  console.error(err);

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

  res.status(500).json({
    error: "Something went wrong on the server. Please try again."
  });
});

app.listen(PORT, () => {
  console.log(
    `Rahman AI Student Success Agent running at http://localhost:${PORT}`
  );
  console.log(`Hugging Face model: ${hf.HF_MODEL}`);

  if (!process.env.HF_TOKEN) {
    console.warn(
      "HF_TOKEN is not set. Add your Hugging Face token to the environment variables."
    );
  }
});
