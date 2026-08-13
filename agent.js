const hf = require("./hf");

const {
  validateGoalAnalysis,
  validateStudyPlan,
  validatePractice,
  validateAssessment
} = require("./validate");

const SYSTEM = `You are the reasoning engine inside Rahman AI Student Success Agent.
You help students turn learning goals into realistic, measurable learning actions.
Be accurate, practical, beginner-friendly, and concise.
Never invent student progress, scores, or completed work.
When JSON is requested, return JSON only with no markdown fences.`;

/* =========================================================
   GOAL ANALYSIS + ROADMAP
   ========================================================= */

async function analyzeGoalAndRoadmap(state) {
  const goal = String(state?.goal || "").trim();
  const level = String(state?.level || "Beginner").trim();
  const dailyMinutes = Number(state?.dailyMinutes);
  const durationDays = Number(state?.durationDays);

  if (!goal) {
    throw new hf.HFParseError(
      "Please enter a learning goal."
    );
  }

  if (!Number.isFinite(dailyMinutes) || dailyMinutes <= 0) {
    throw new hf.HFParseError(
      "Daily study time must be a positive number."
    );
  }

  if (!Number.isFinite(durationDays) || durationDays <= 0) {
    throw new hf.HFParseError(
      "Target duration must be a positive number of days."
    );
  }

  const prompt = `Student goal: ${goal}
Current level: ${level}
Daily study time: ${dailyMinutes} minutes
Target duration: ${durationDays} days

Create a personalized learning analysis and roadmap.

Return exactly:
{
  "analysis": {
    "requiredKnowledge": ["short phrase"],
    "prerequisites": ["short phrase"],
    "coreTopics": ["short phrase"],
    "learningOrder": ["short phrase"],
    "practiceRequirements": "one short sentence",
    "assessmentPoints": ["short phrase"]
  },
  "roadmap": {
    "stages": [
      {
        "title": "short title",
        "objective": "one short sentence",
        "estimatedMinutes": 120,
        "practiceTask": "one short practice task",
        "status": "not_started"
      }
    ]
  }
}

Rules:
- Create 4 to 8 stages.
- Order stages logically for the student's level.
- estimatedMinutes must be a positive whole number.
- Every status must be exactly "not_started".
- Keep strings concise.
- Do not claim the student already knows or completed anything.
- Do not invent student progress.`;

  const result = await hf.generateJSON(
    SYSTEM,
    prompt,
    {
      maxTokens: 1400,
      temperature: 0.15
    }
  );

  if (!validateGoalAnalysis(result)) {
    throw new hf.HFParseError(
      "The AI produced an incomplete goal analysis. Please try again."
    );
  }

  return result;
}


/* =========================================================
   FEASIBILITY CHECK
   ========================================================= */

function checkFeasibility(stages, dailyMinutes, durationDays) {
  const safeDailyMinutes = Number(dailyMinutes);
  const safeDurationDays = Number(durationDays);

  if (
    !Array.isArray(stages) ||
    stages.length === 0 ||
    !Number.isFinite(safeDailyMinutes) ||
    safeDailyMinutes <= 0 ||
    !Number.isFinite(safeDurationDays) ||
    safeDurationDays <= 0
  ) {
    return {
      totalMinutesNeeded: 0,
      totalMinutesAvailable: 0,
      feasible: false,
      minDaysNeeded: 1
    };
  }

  const totalMinutesNeeded = stages.reduce(
    (sum, stage) => {
      const minutes = Number(stage?.estimatedMinutes) || 0;
      return sum + Math.max(0, minutes);
    },
    0
  );

  const totalMinutesAvailable =
    safeDailyMinutes * safeDurationDays;

  const feasible =
    totalMinutesNeeded <= totalMinutesAvailable;

  const minDaysNeeded = Math.max(
    1,
    Math.ceil(totalMinutesNeeded / safeDailyMinutes)
  );

  return {
    totalMinutesNeeded,
    totalMinutesAvailable,
    feasible,
    minDaysNeeded
  };
}


/* =========================================================
   CREATE SAFE DAILY BLOCKS
   ========================================================= */

function createDailyBlocks(dailyMinutes) {
  const minutes = Number(dailyMinutes);

  if (!Number.isFinite(minutes) || minutes <= 0) {
    throw new hf.HFParseError(
      "Daily study time must be a positive number."
    );
  }

  /*
   * For very short study sessions, use fewer activities.
   * This guarantees that the total is NEVER above the
   * student's available daily study time.
   */

  if (minutes <= 10) {
    return [
      {
        activity: "Learn",
        minutes
      }
    ];
  }

  if (minutes <= 20) {
    const learn = Math.floor(minutes * 0.6);
    const practice = minutes - learn;

    return [
      {
        activity: "Learn",
        minutes: learn
      },
      {
        activity: "Practice",
        minutes: practice
      }
    ];
  }

  const learn = Math.floor(minutes * 0.5);
  const practice = Math.floor(minutes * 0.3);
  const review = minutes - learn - practice;

  return [
    {
      activity: "Learn",
      minutes: learn
    },
    {
      activity: "Practice",
      minutes: practice
    },
    {
      activity: "Review",
      minutes: review
    }
  ];
}


/* =========================================================
   CREATE DETERMINISTIC STUDY PLAN
   ========================================================= */

function buildSafeStagePlans(stages, dailyMinutes) {
  const safeDailyMinutes = Number(dailyMinutes);

  if (
    !Array.isArray(stages) ||
    stages.length === 0
  ) {
    throw new hf.HFParseError(
      "No roadmap stages are available for the study plan."
    );
  }

  const cleanedStages = stages.map((stage, index) => ({
    title:
      String(stage?.title || "").trim() ||
      `Stage ${index + 1}`,

    estimatedMinutes: Math.max(
      1,
      Number(stage?.estimatedMinutes) || safeDailyMinutes
    )
  }));

  const totalEstimatedMinutes =
    cleanedStages.reduce(
      (sum, stage) =>
        sum + stage.estimatedMinutes,
      0
    );

  const totalDays = Math.max(
    cleanedStages.length,
    Math.ceil(
      totalEstimatedMinutes / safeDailyMinutes
    )
  );

  /*
   * Give every stage at least one day.
   * Remaining days are distributed according
   * to each stage's estimated time.
   */

  const stagePlans = [];
  let currentDay = 1;
  let remainingDays = totalDays;

  cleanedStages.forEach((stage, index) => {
    const remainingStages =
      cleanedStages.length - index - 1;

    const idealDays = Math.max(
      1,
      Math.ceil(
        stage.estimatedMinutes /
          safeDailyMinutes
      )
    );

    const maximumDaysForStage = Math.max(
      1,
      remainingDays - remainingStages
    );

    const daysForStage = Math.min(
      idealDays,
      maximumDaysForStage
    );

    const startDay = currentDay;
    const endDay =
      currentDay + daysForStage - 1;

    stagePlans.push({
      stageTitle: stage.title,
      startDay,
      endDay,
      dailyBlocks:
        createDailyBlocks(safeDailyMinutes)
    });

    currentDay = endDay + 1;
    remainingDays -= daysForStage;
  });

  return stagePlans;
}


/* =========================================================
   VALIDATE STUDY PLAN SAFETY
   ========================================================= */

function validateSafeStagePlans(
  stagePlans,
  roadmapStages,
  dailyMinutes
) {
  const safeDailyMinutes = Number(dailyMinutes);

  if (
    !Array.isArray(stagePlans) ||
    stagePlans.length !== roadmapStages.length
  ) {
    return false;
  }

  let expectedDay = 1;

  for (let i = 0; i < stagePlans.length; i++) {
    const plan = stagePlans[i];

    if (
      !plan ||
      typeof plan.stageTitle !== "string" ||
      plan.stageTitle.trim() === ""
    ) {
      return false;
    }

    if (
      plan.startDay !== expectedDay ||
      !Number.isInteger(plan.startDay) ||
      !Number.isInteger(plan.endDay) ||
      plan.endDay < plan.startDay
    ) {
      return false;
    }

    if (
      plan.stageTitle !==
      String(roadmapStages[i].title || "").trim()
    ) {
      return false;
    }

    if (!Array.isArray(plan.dailyBlocks)) {
      return false;
    }

    const dailyTotal =
      plan.dailyBlocks.reduce(
        (sum, block) =>
          sum + Number(block?.minutes || 0),
        0
      );

    if (dailyTotal !== safeDailyMinutes) {
      return false;
    }

    for (const block of plan.dailyBlocks) {
      if (
        !block ||
        typeof block.activity !== "string" ||
        !Number.isFinite(Number(block.minutes)) ||
        Number(block.minutes) < 0
      ) {
        return false;
      }
    }

    expectedDay = plan.endDay + 1;
  }

  return true;
}


/* =========================================================
   STUDY PLAN
   ========================================================= */

async function generateStudyPlan(state) {
  const roadmap = state?.roadmap;
  const level = String(
    state?.level || "Beginner"
  ).trim();

  const dailyMinutes = Number(
    state?.dailyMinutes
  );

  const durationDays = Number(
    state?.durationDays
  );

  if (
    !roadmap ||
    !Array.isArray(roadmap.stages) ||
    roadmap.stages.length === 0
  ) {
    throw new hf.HFParseError(
      "A valid roadmap is required before generating the study plan."
    );
  }

  if (
    !Number.isFinite(dailyMinutes) ||
    dailyMinutes <= 0
  ) {
    throw new hf.HFParseError(
      "Daily study time must be a positive number."
    );
  }

  if (
    !Number.isFinite(durationDays) ||
    durationDays <= 0
  ) {
    throw new hf.HFParseError(
      "Study duration must be a positive number of days."
    );
  }

  const feasibility = checkFeasibility(
    roadmap.stages,
    dailyMinutes,
    durationDays
  );

  const effectiveDuration =
    feasibility.feasible
      ? durationDays
      : feasibility.minDaysNeeded;

  /*
   * Generate a short AI pacing note.
   * The actual schedule is calculated by JavaScript
   * so arithmetic cannot be corrupted by the model.
   */

  let aiNote = "";

  try {
    const prompt = `Student level: ${level}
Daily study time: ${dailyMinutes} minutes
Requested duration: ${durationDays} days
Effective duration: ${effectiveDuration} days

Roadmap:
${JSON.stringify(
  roadmap.stages.map((stage) => ({
    title: stage.title,
    estimatedMinutes:
      Number(stage.estimatedMinutes) || 0
  }))
)}

Return exactly:
{
  "note": "one short practical pacing sentence"
}

Rules:
- Keep it concise.
- Do not claim completed progress.
- Do not invent scores.
- Do not mention information not provided.`;

    const result = await hf.generateJSON(
      SYSTEM,
      prompt,
      {
        maxTokens: 200,
        temperature: 0.1
      }
    );

    if (
      result &&
      typeof result.note === "string" &&
      result.note.trim()
    ) {
      aiNote = result.note.trim();
    }
  } catch (error) {
    /*
     * The AI note is optional.
     * The deterministic study plan remains available.
     */
    aiNote = "";
  }

  const stagePlans = buildSafeStagePlans(
    roadmap.stages,
    dailyMinutes
  );

  const safePlansAreValid =
    validateSafeStagePlans(
      stagePlans,
      roadmap.stages,
      dailyMinutes
    );

  if (!safePlansAreValid) {
    throw new hf.HFParseError(
      "The study plan could not be created safely. Please try again."
    );
  }

  const defaultNote =
    `Follow each stage in order and use your ${dailyMinutes} daily study minutes consistently.`;

  const finalNote =
    aiNote || defaultNote;

  const finalPlan = {
    feasible: feasibility.feasible,

    requestedDurationDays:
      durationDays,

    effectiveDurationDays:
      effectiveDuration,

    minDaysNeeded:
      feasibility.minDaysNeeded,

    totalMinutesNeeded:
      feasibility.totalMinutesNeeded,

    totalMinutesAvailable:
      feasibility.totalMinutesAvailable,

    note: feasibility.feasible
      ? finalNote
      : `The roadmap needs about ${feasibility.minDaysNeeded} days at ${dailyMinutes} minutes per day. ${finalNote}`,

    stagePlans
  };

  if (!validateStudyPlan(finalPlan)) {
    throw new hf.HFParseError(
      "The study plan format is invalid. Please try again."
    );
  }

  return finalPlan;
}


/* =========================================================
   TARGETED PRACTICE
   ========================================================= */

async function generatePractice(state) {
  const topic = String(
    state?.topic || ""
  ).trim();

  const level = String(
    state?.level || "Beginner"
  ).trim();

  const currentStageTitle = String(
    state?.currentStageTitle || "Not specified"
  ).trim();

  const recentWeakAreas =
    Array.isArray(state?.recentWeakAreas)
      ? state.recentWeakAreas
      : [];

  if (!topic) {
    throw new hf.HFParseError(
      "Please select a practice topic."
    );
  }

  const safeTopic =
    topic.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  const prompt = `Student level: ${level}
Current stage: ${currentStageTitle}
Topic: ${topic}
Recent weak areas: ${
    recentWeakAreas.length
      ? recentWeakAreas.join(", ")
      : "None recorded"
  }

Create ONE useful beginner-appropriate practice task.

Choose exactly one type:
predict_output
find_error
complete_code
write_program
explain_concept
conceptual_question

Return exactly:
{
  "type": "one allowed type",
  "topic": "${safeTopic}",
  "prompt": "clear task",
  "starterCode": "code if relevant, otherwise empty string",
  "hint": "one short hint",
  "answer": "correct answer or strong example solution with short explanation"
}

Rules:
- Make the task clear and unambiguous.
- Keep it appropriate for the student's level.
- Do not claim that the student has completed it.
- Do not invent student scores.`;

  const result = await hf.generateJSON(
    SYSTEM,
    prompt,
    {
      maxTokens: 900,
      temperature: 0.2
    }
  );

  if (!validatePractice(result)) {
    throw new hf.HFParseError(
      "The AI produced an incomplete practice item. Please try again."
    );
  }

  return result;
}


/* =========================================================
   ASSESSMENT
   ========================================================= */

async function generateAssessment(state) {
  const topic = String(
    state?.topic || ""
  ).trim();

  const level = String(
    state?.level || "Beginner"
  ).trim();

  const count = Math.min(
    Math.max(
      Number(state?.numQuestions) || 5,
      3
    ),
    8
  );

  if (!topic) {
    throw new hf.HFParseError(
      "Please select an assessment topic."
    );
  }

  const safeTopic =
    topic.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  const prompt = `Student level: ${level}
Assessment topic: ${topic}
Question count: ${count}

Create a fair beginner-friendly assessment mixing MCQ and short-answer questions.

Return exactly:
{
  "topic": "${safeTopic}",
  "questions": [
    {
      "id": "q1",
      "type": "mcq",
      "subtopic": "short label",
      "question": "clear question",
      "options": ["A", "B", "C", "D"],
      "correctIndex": 0
    },
    {
      "id": "q2",
      "type": "short",
      "subtopic": "short label",
      "question": "clear question",
      "acceptableAnswers": ["answer", "close variant"]
    }
  ]
}

Rules:
- Create exactly ${count} questions.
- IDs must be q1 through q${count}.
- Use both MCQ and short-answer questions.
- MCQs must have 3 or 4 plausible options.
- Each MCQ must have exactly one correct answer.
- correctIndex must point to the correct option.
- Short answers must have concise acceptable answers.
- Tag every question with a useful subtopic.
- Avoid trick questions.
- Avoid ambiguous wording.
- Keep questions appropriate for the student's level.`;

  const result = await hf.generateJSON(
    SYSTEM,
    prompt,
    {
      maxTokens: 1800,
      temperature: 0.15
    }
  );

  if (
    !validateAssessment(result) ||
    !Array.isArray(result.questions) ||
    result.questions.length !== count
  ) {
    throw new hf.HFParseError(
      "The AI produced an incomplete assessment. Please try again."
    );
  }

  return result;
}


/* =========================================================
   AI COACH
   ========================================================= */

async function coachReply(message, context) {
  const studentMessage = String(
    message || ""
  ).trim();

  const safeContext =
    context && typeof context === "object"
      ? context
      : {};

  if (!studentMessage) {
    return "Please enter a message so I can help you.";
  }

  const strengths =
    Array.isArray(safeContext.strengths)
      ? safeContext.strengths
      : [];

  const weaknesses =
    Array.isArray(safeContext.weaknesses)
      ? safeContext.weaknesses
      : [];

  const prompt = `Student context:
Goal: ${safeContext.goal || "Not set"}
Level: ${safeContext.level || "Not set"}
Current stage: ${
    safeContext.currentStageTitle || "Not set"
  }
Strengths: ${
    strengths.join(", ") || "None recorded"
  }
Weaknesses: ${
    weaknesses.join(", ") || "None recorded"
  }
Latest score: ${
    safeContext.latestScore ?? "Not available"
  }
Next action: ${
    safeContext.nextActionTitle || "Not set"
  }

Student message:
${studentMessage}

Give focused, encouraging help grounded in this context.

Rules:
- Do not invent progress or scores.
- Do not claim the student completed anything unless the context explicitly says so.
- Be specific and practical.
- Keep the response under 150 words unless a code example is genuinely needed.`;

  return hf.generateText(
    "You are Rahman AI Student Success Agent's personal AI Coach. Be specific, supportive, practical, and accurate.",
    prompt,
    {
      maxTokens: 450,
      temperature: 0.4
    }
  );
}


/* =========================================================
   EXPORTS
   IMPORTANT: server.js depends on these exact names.
   ========================================================= */

module.exports = {
  analyzeGoalAndRoadmap,
  generateStudyPlan,
  generatePractice,
  generateAssessment,
  coachReply,
  checkFeasibility
};