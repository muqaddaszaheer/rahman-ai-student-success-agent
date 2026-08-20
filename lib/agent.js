const hf = require("./hf");

const SYSTEM_PROMPT = `
You are Rahman AI Student Success Agent.

Help students with:
1. Learning goal analysis
2. Personalized learning roadmaps
3. Study planning
4. Targeted practice
5. Assessments
6. AI coaching

Be accurate, practical, beginner-friendly, concise, and encouraging.

Never invent student progress, scores, completed work, or knowledge.

When JSON is requested, return valid JSON only.
`;

function cleanString(value, fallback = "") {
  const result = String(value ?? "").trim();
  return result || fallback;
}

function parsePositiveNumber(value, message) {
  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    throw new hf.HFParseError(message);
  }

  return number;
}

function createDailyBlocks(dailyMinutes) {
  const minutes = Number(dailyMinutes);

  if (!Number.isFinite(minutes) || minutes <= 0) {
    throw new hf.HFParseError(
      "Daily study time must be a positive number."
    );
  }

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

function checkFeasibility(stages, dailyMinutes, durationDays) {
  if (!Array.isArray(stages) || stages.length === 0) {
    throw new hf.HFParseError(
      "At least one roadmap stage is required."
    );
  }

  const daily = Number(dailyMinutes);
  const days = Number(durationDays);

  if (!Number.isFinite(daily) || daily <= 0) {
    throw new hf.HFParseError(
      "Daily study time must be a positive number."
    );
  }

  if (!Number.isFinite(days) || days <= 0) {
    throw new hf.HFParseError(
      "Study duration must be a positive number of days."
    );
  }

  const totalMinutesNeeded = stages.reduce(
    (total, stage) => {
      const minutes = Number(stage?.estimatedMinutes);

      if (Number.isFinite(minutes) && minutes > 0) {
        return total + minutes;
      }

      return total;
    },
    0
  );

  const totalMinutesAvailable = daily * days;

  const feasible =
    totalMinutesNeeded <= totalMinutesAvailable;

  const minDaysNeeded = Math.max(
    1,
    Math.ceil(totalMinutesNeeded / daily)
  );

  return {
    totalMinutesNeeded,
    totalMinutesAvailable,
    feasible,
    minDaysNeeded
  };
}

function escapeForPrompt(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, " ");
}

async function analyzeGoalAndRoadmap(state) {
  const goal = cleanString(state?.goal);

  if (!goal) {
    throw new hf.HFParseError(
      "Please enter a learning goal."
    );
  }

  const level = cleanString(
    state?.level,
    "Beginner"
  );

  const dailyMinutes = parsePositiveNumber(
    state?.dailyMinutes,
    "Daily study time must be a positive number."
  );

  const durationDays = parsePositiveNumber(
    state?.durationDays,
    "Target duration must be a positive number of days."
  );

  const prompt = `
Student learning goal:
${goal}

Current level:
${level}

Available study time:
${dailyMinutes} minutes per day

Target duration:
${durationDays} days

Create a realistic personalized learning roadmap.

Return exactly this JSON structure:

{
  "analysis": {
    "requiredKnowledge": [],
    "prerequisites": [],
    "coreTopics": [],
    "learningOrder": [],
    "practiceRequirements": "",
    "assessmentPoints": []
  },
  "roadmap": {
    "stages": [
      {
        "title": "",
        "objective": "",
        "estimatedMinutes": 120,
        "practiceTask": "",
        "status": "not_started"
      }
    ]
  }
}

Rules:
- Create 4 to 8 stages.
- Order topics from basic to advanced.
- Match the student's level.
- estimatedMinutes must be a positive whole number.
- status must be "not_started".
- Keep the roadmap practical and realistic.
- Do not claim the student already knows anything.
- Do not claim completed work.
- Do not invent scores or progress.
`;

  const result = await hf.generateJSON(
    SYSTEM_PROMPT,
    prompt,
    {
      maxTokens: 3000
    }
  );

  if (
    !result ||
    typeof result !== "object" ||
    !result.analysis ||
    typeof result.analysis !== "object" ||
    !result.roadmap ||
    typeof result.roadmap !== "object" ||
    !Array.isArray(result.roadmap.stages)
  ) {
    throw new hf.HFParseError(
      "The AI returned an invalid learning roadmap."
    );
  }

  if (
    result.roadmap.stages.length < 4 ||
    result.roadmap.stages.length > 8
  ) {
    throw new hf.HFParseError(
      "The AI returned an invalid number of roadmap stages."
    );
  }

  for (const stage of result.roadmap.stages) {
    if (
      !stage ||
      typeof stage !== "object" ||
      !cleanString(stage.title) ||
      !cleanString(stage.objective) ||
      !cleanString(stage.practiceTask) ||
      !Number.isInteger(stage.estimatedMinutes) ||
      stage.estimatedMinutes <= 0
    ) {
      throw new hf.HFParseError(
        "The AI returned an incomplete roadmap."
      );
    }

    stage.status = "not_started";
  }

  return result;
}

async function generateStudyPlan(state) {
  const roadmap = state?.roadmap;

  if (
    !roadmap ||
    typeof roadmap !== "object" ||
    !Array.isArray(roadmap.stages) ||
    roadmap.stages.length === 0
  ) {
    throw new hf.HFParseError(
      "A valid roadmap is required before generating the study plan."
    );
  }

  const dailyMinutes = parsePositiveNumber(
    state?.dailyMinutes,
    "Daily study time must be a positive number."
  );

  const durationDays = parsePositiveNumber(
    state?.durationDays,
    "Study duration must be a positive number of days."
  );

  const level = cleanString(
    state?.level,
    "Beginner"
  );

  const feasibility = checkFeasibility(
    roadmap.stages,
    dailyMinutes,
    durationDays
  );

  const effectiveDurationDays = feasibility.feasible
    ? durationDays
    : feasibility.minDaysNeeded;

  const stagePlans = [];
  let currentDay = 1;

  for (const stage of roadmap.stages) {
    const estimatedMinutes = Math.max(
      1,
      Number(stage?.estimatedMinutes) || dailyMinutes
    );

    const daysForStage = Math.max(
      1,
      Math.ceil(
        estimatedMinutes / dailyMinutes
      )
    );

    const startDay = currentDay;
    const endDay =
      currentDay + daysForStage - 1;

    stagePlans.push({
      stageTitle: cleanString(
        stage?.title,
        "Learning Stage"
      ),
      startDay,
      endDay,
      dailyBlocks: createDailyBlocks(
        dailyMinutes
      )
    });

    currentDay = endDay + 1;
  }

  const note = feasibility.feasible
    ? `Study at the ${level} level for ${dailyMinutes} minutes each day and complete the stages in order.`
    : `Your requested duration is shorter than the estimated workload. A minimum of ${feasibility.minDaysNeeded} days is recommended at ${dailyMinutes} minutes per day.`;

  return {
    feasible: feasibility.feasible,
    requestedDurationDays: durationDays,
    effectiveDurationDays,
    minDaysNeeded: feasibility.minDaysNeeded,
    totalMinutesNeeded: feasibility.totalMinutesNeeded,
    totalMinutesAvailable: feasibility.totalMinutesAvailable,
    note,
    stagePlans
  };
}

async function generatePractice(state) {
  const topic = cleanString(state?.topic);

  if (!topic) {
    throw new hf.HFParseError(
      "Please select a practice topic."
    );
  }

  const level = cleanString(
    state?.level,
    "Beginner"
  );

  const currentStageTitle = cleanString(
    state?.currentStageTitle,
    "Not specified"
  );

  const recentWeakAreas =
    Array.isArray(state?.recentWeakAreas)
      ? state.recentWeakAreas
          .slice(0, 8)
          .map((item) => String(item).trim())
          .filter(Boolean)
      : [];

  const safeTopic = escapeForPrompt(topic);

  const prompt = `
Student level:
${level}

Current learning stage:
${currentStageTitle}

Topic:
${topic}

Recent weak areas:
${
  recentWeakAreas.length
    ? recentWeakAreas.join(", ")
    : "None recorded"
}

Create ONE useful practice activity.

Choose exactly one type:
- predict_output
- find_error
- complete_code
- write_program
- explain_concept
- conceptual_question

Return exactly:

{
  "type": "one allowed type",
  "topic": "${safeTopic}",
  "prompt": "clear practice task",
  "starterCode": "",
  "hint": "short hint",
  "answer": "correct answer with short explanation"
}

Rules:
- Match the student's level.
- Make the task clear.
- Do not make ambiguous questions.
- Do not claim the student completed it.
`;

  const result = await hf.generateJSON(
    SYSTEM_PROMPT,
    prompt,
    {
      maxTokens: 1800
    }
  );

  const allowedTypes = [
    "predict_output",
    "find_error",
    "complete_code",
    "write_program",
    "explain_concept",
    "conceptual_question"
  ];

  if (
    !result ||
    typeof result !== "object" ||
    !allowedTypes.includes(result.type) ||
    !cleanString(result.topic) ||
    !cleanString(result.prompt) ||
    typeof result.starterCode !== "string" ||
    !cleanString(result.hint) ||
    !cleanString(result.answer)
  ) {
    throw new hf.HFParseError(
      "The AI returned an invalid practice activity."
    );
  }

  return result;
}

async function generateAssessment(state) {
  const topic = cleanString(state?.topic);

  if (!topic) {
    throw new hf.HFParseError(
      "Please select an assessment topic."
    );
  }

  const level = cleanString(
    state?.level,
    "Beginner"
  );

  let count = Number(state?.numQuestions);

  if (!Number.isFinite(count)) {
    count = 5;
  }

  count = Math.min(
    Math.max(Math.floor(count), 3),
    8
  );

  const safeTopic = escapeForPrompt(topic);

  const prompt = `
Student level:
${level}

Assessment topic:
${topic}

Number of questions:
${count}

Create a fair assessment.

Use both MCQ and short-answer questions.

Return exactly:

{
  "topic": "${safeTopic}",
  "questions": []
}

Each MCQ must use:

{
  "id": "q1",
  "type": "mcq",
  "subtopic": "short label",
  "question": "clear question",
  "options": ["A", "B", "C", "D"],
  "correctIndex": 0
}

Each short-answer question must use:

{
  "id": "q2",
  "type": "short",
  "subtopic": "short label",
  "question": "clear question",
  "acceptableAnswers": ["answer", "close answer"]
}

Rules:
- Create exactly ${count} questions.
- IDs must be q1 through q${count}.
- Use both MCQ and short-answer questions.
- MCQs must have 3 or 4 options.
- Each MCQ must have exactly one correct answer.
- correctIndex must be valid.
- Short answers must have at least one acceptable answer.
- Avoid trick questions.
- Avoid ambiguous questions.
- Match the student's level.
`;

  const result = await hf.generateJSON(
    SYSTEM_PROMPT,
    prompt,
    {
      maxTokens: 3000
    }
  );

  if (
    !result ||
    typeof result !== "object" ||
    !Array.isArray(result.questions) ||
    result.questions.length !== count
  ) {
    throw new hf.HFParseError(
      "The AI returned an invalid assessment."
    );
  }

  let hasMcq = false;
  let hasShort = false;

  result.questions.forEach((question, index) => {
    if (
      !question ||
      typeof question !== "object" ||
      question.id !== `q${index + 1}` ||
      !["mcq", "short"].includes(question.type) ||
      !cleanString(question.subtopic) ||
      !cleanString(question.question)
    ) {
      throw new hf.HFParseError(
        "The AI returned an invalid assessment question."
      );
    }

    if (question.type === "mcq") {
      hasMcq = true;

      if (
        !Array.isArray(question.options) ||
        question.options.length < 3 ||
        question.options.length > 4 ||
        !question.options.every(
          (option) => cleanString(option)
        ) ||
        !Number.isInteger(question.correctIndex) ||
        question.correctIndex < 0 ||
        question.correctIndex >= question.options.length
      ) {
        throw new hf.HFParseError(
          "The AI returned an invalid MCQ."
        );
      }
    }

    if (question.type === "short") {
      hasShort = true;

      if (
        !Array.isArray(question.acceptableAnswers) ||
        question.acceptableAnswers.length === 0 ||
        !question.acceptableAnswers.every(
          (answer) => cleanString(answer)
        )
      ) {
        throw new hf.HFParseError(
          "The AI returned an invalid short-answer question."
        );
      }
    }
  });

  if (!hasMcq || !hasShort) {
    throw new hf.HFParseError(
      "The AI returned an assessment without both MCQ and short-answer questions."
    );
  }

  return result;
}

async function coachReply(message, context = {}) {
  const studentMessage = cleanString(message);

  if (!studentMessage) {
    return "Please enter a message so I can help you.";
  }

  const safeContext =
    context && typeof context === "object"
      ? context
      : {};

  const strengths =
    Array.isArray(safeContext.strengths)
      ? safeContext.strengths
          .slice(0, 8)
          .map((item) => String(item).trim())
          .filter(Boolean)
      : [];

  const weaknesses =
    Array.isArray(safeContext.weaknesses)
      ? safeContext.weaknesses
          .slice(0, 8)
          .map((item) => String(item).trim())
          .filter(Boolean)
      : [];

  const latestScore =
    safeContext.latestScore !== undefined &&
    safeContext.latestScore !== null
      ? String(safeContext.latestScore)
      : "Not available";

  const prompt = `
Student goal:
${cleanString(safeContext.goal, "Not set")}

Student level:
${cleanString(safeContext.level, "Not set")}

Current stage:
${cleanString(
  safeContext.currentStageTitle,
  "Not set"
)}

Strengths:
${
  strengths.length
    ? strengths.join(", ")
    : "None recorded"
}

Weaknesses:
${
  weaknesses.length
    ? weaknesses.join(", ")
    : "None recorded"
}

Latest score:
${latestScore}

Next action:
${cleanString(
  safeContext.nextActionTitle,
  "Not set"
)}

Student message:
${studentMessage}

Give practical, focused, encouraging guidance.

Rules:
- Do not invent progress.
- Do not invent scores.
- Do not claim completed work.
- Give clear next steps.
- Keep the answer concise.
`;

  return hf.generateText(
    `
You are the personal AI Coach inside Rahman AI Student Success Agent.

Be supportive, accurate, practical, and concise.
`,
    prompt,
    {
      maxTokens: 600
    }
  );
}

module.exports = {
  analyzeGoalAndRoadmap,
  generateStudyPlan,
  generatePractice,
  generateAssessment,
  coachReply,
  checkFeasibility
};
