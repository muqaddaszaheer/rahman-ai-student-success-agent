function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value, min = 1) {
  return Array.isArray(value) &&
    value.length >= min &&
    value.every(item => typeof item === "string" && item.trim().length > 0);
}

function validateOnboarding(body) {
  const errors = [];
  const goal = typeof body.goal === "string" ? body.goal.trim() : "";
  const level = typeof body.level === "string" ? body.level.trim() : "";
  const dailyMinutes = Number(body.dailyMinutes);
  const durationDays = Number(body.durationDays);

  if (goal.length < 5 || goal.length > 300) errors.push("Enter a learning goal between 5 and 300 characters.");
  if (!["Beginner", "Intermediate", "Advanced"].includes(level)) errors.push("Select a valid current level.");
  if (!Number.isFinite(dailyMinutes) || dailyMinutes < 15 || dailyMinutes > 480) {
    errors.push("Daily study time must be between 15 and 480 minutes.");
  }
  if (!Number.isFinite(durationDays) || durationDays < 3 || durationDays > 180) {
    errors.push("Target duration must be between 3 and 180 days.");
  }

  return {
    valid: errors.length === 0,
    errors,
    value: { goal, level, dailyMinutes, durationDays }
  };
}

function validateGoalAnalysis(data) {
  if (!data || typeof data !== "object") return false;
  const a = data.analysis;
  const r = data.roadmap;
  if (!a || !r || !Array.isArray(r.stages)) return false;

  return (
    isStringArray(a.requiredKnowledge) &&
    isStringArray(a.prerequisites) &&
    isStringArray(a.coreTopics) &&
    isStringArray(a.learningOrder) &&
    isNonEmptyString(a.practiceRequirements) &&
    isStringArray(a.assessmentPoints) &&
    r.stages.length >= 4 &&
    r.stages.length <= 8 &&
    r.stages.every(stage =>
      isNonEmptyString(stage.title) &&
      isNonEmptyString(stage.objective) &&
      Number.isInteger(stage.estimatedMinutes) &&
      stage.estimatedMinutes > 0 &&
      isNonEmptyString(stage.practiceTask) &&
      stage.status === "not_started"
    )
  );
}

function validateStudyPlan(data) {
  if (!data || typeof data !== "object" || !Array.isArray(data.stagePlans) || data.stagePlans.length === 0) {
    return false;
  }

  return (
    isNonEmptyString(data.note) &&
    data.stagePlans.every(stage =>
      isNonEmptyString(stage.stageTitle) &&
      Number.isInteger(stage.startDay) &&
      Number.isInteger(stage.endDay) &&
      stage.startDay >= 1 &&
      stage.endDay >= stage.startDay &&
      Array.isArray(stage.dailyBlocks) &&
      stage.dailyBlocks.length > 0 &&
      stage.dailyBlocks.every(block =>
        isNonEmptyString(block.activity) &&
        Number.isFinite(Number(block.minutes)) &&
        Number(block.minutes) > 0
      )
    )
  );
}

function validatePractice(data) {
  if (!data || typeof data !== "object") return false;
  const allowed = ["predict_output", "find_error", "complete_code", "write_program", "explain_concept", "conceptual_question"];

  return (
    allowed.includes(data.type) &&
    isNonEmptyString(data.topic) &&
    isNonEmptyString(data.prompt) &&
    typeof data.starterCode === "string" &&
    isNonEmptyString(data.hint) &&
    isNonEmptyString(data.answer)
  );
}

function validateAssessment(data) {
  if (!data || typeof data !== "object" || !Array.isArray(data.questions) || data.questions.length < 3) {
    return false;
  }

  return data.questions.every((q, index) => {
    if (!q || q.id !== `q${index + 1}` || !["mcq", "short"].includes(q.type)) return false;
    if (!isNonEmptyString(q.subtopic) || !isNonEmptyString(q.question)) return false;

    if (q.type === "mcq") {
      return Array.isArray(q.options) &&
        q.options.length >= 3 &&
        q.options.every(isNonEmptyString) &&
        Number.isInteger(q.correctIndex) &&
        q.correctIndex >= 0 &&
        q.correctIndex < q.options.length;
    }

    return Array.isArray(q.acceptableAnswers) &&
      q.acceptableAnswers.length > 0 &&
      q.acceptableAnswers.every(isNonEmptyString);
  });
}

module.exports = {
  validateOnboarding,
  validateGoalAnalysis,
  validateStudyPlan,
  validatePractice,
  validateAssessment
};
