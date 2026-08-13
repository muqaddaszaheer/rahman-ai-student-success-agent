const STORAGE_KEY = "rahmanStudentAgentState";

const $ = (id) => document.getElementById(id);
let state = loadState();
let currentAssessment = null;

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null;
  } catch {
    return null;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  $("toast").textContent = message;
  $("toast").classList.remove("hidden");
  setTimeout(() => $("toast").classList.add("hidden"), 3500);
}

async function api(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("The server returned an invalid response.");
  }

  if (!response.ok) throw new Error(data.error || "The request failed.");
  return data;
}

function setLoading(id, visible) {
  $(id).classList.toggle("hidden", !visible);
}

function renderAnalysis() {
  const a = state.analysis;
  $("analysisContent").innerHTML = `
    <p><strong>Core topics</strong></p>
    <div class="pill-list">${a.coreTopics.map(x => `<span class="pill">${escapeHTML(x)}</span>`).join("")}</div>
    <p><strong>Learning order</strong></p>
    <ol>${a.learningOrder.map(x => `<li>${escapeHTML(x)}</li>`).join("")}</ol>
    <p><strong>Practice</strong><br>${escapeHTML(a.practiceRequirements)}</p>
  `;
}

function renderRoadmap() {
  $("roadmapContent").innerHTML = state.roadmap.stages.map((s, i) => `
    <div class="stage">
      <div class="stage-number">${i + 1}</div>
      <div>
        <h4>${escapeHTML(s.title)}</h4>
        <p>${escapeHTML(s.objective)}<br><strong>Practice:</strong> ${escapeHTML(s.practiceTask)}</p>
      </div>
      <div class="stage-time">${Number(s.estimatedMinutes)} min</div>
    </div>
  `).join("");

  const options = state.roadmap.stages.map(s =>
    `<option value="${escapeHTML(s.title)}">${escapeHTML(s.title)}</option>`
  ).join("");
  $("practiceTopicSelect").innerHTML = options;
  $("assessmentTopicSelect").innerHTML = options;
}

function calculateProgress() {
  const completed = state.assessmentHistory?.length || 0;
  const progress = Math.min(100, completed * 20);
  $("progressFill").style.width = `${progress}%`;
  $("progressPercent").textContent = `${progress}%`;
  $("progressText").textContent = completed
    ? `${completed} assessment${completed === 1 ? "" : "s"} completed.`
    : "No assessments completed yet.";
}

function getPerformance() {
  const history = state.assessmentHistory || [];
  if (!history.length) return { strengths: [], weaknesses: [], latestScore: null };

  const topicStats = {};
  history.forEach(item => {
    (item.results || []).forEach(r => {
      if (!topicStats[r.subtopic]) topicStats[r.subtopic] = { correct: 0, total: 0 };
      topicStats[r.subtopic].total++;
      if (r.correct) topicStats[r.subtopic].correct++;
    });
  });

  const entries = Object.entries(topicStats).map(([topic, x]) => ({
    topic,
    rate: x.total ? x.correct / x.total : 0
  }));

  return {
    strengths: entries.filter(x => x.rate >= 0.75).sort((a,b) => b.rate-a.rate).slice(0, 3).map(x => x.topic),
    weaknesses: entries.filter(x => x.rate < 0.75).sort((a,b) => a.rate-b.rate).slice(0, 3).map(x => x.topic),
    latestScore: history[history.length - 1]?.score ?? null
  };
}

function renderPerformance() {
  const p = getPerformance();
  if (p.latestScore === null) {
    $("performanceContent").innerHTML = "Complete an assessment to see your strengths and weaknesses.";
    return;
  }

  $("performanceContent").innerHTML = `
    <div class="result-score">${p.latestScore}%</div>
    <p><strong class="good">Strengths:</strong> ${p.strengths.length ? p.strengths.map(escapeHTML).join(", ") : "Keep practicing to establish strengths."}</p>
    <p><strong class="bad">Focus next:</strong> ${p.weaknesses.length ? p.weaknesses.map(escapeHTML).join(", ") : "No major weak areas recorded yet."}</p>
  `;
}

function nextAction() {
  const p = getPerformance();
  if (!state.studyPlan) return {
    title: "Generate your study plan",
    reason: "Turn your roadmap into a realistic day-by-day schedule."
  };
  if (!state.lastPractice) return {
    title: "Complete targeted practice",
    reason: "Practice a current roadmap topic before testing yourself."
  };
  if (p.latestScore !== null && p.latestScore < 75 && p.weaknesses.length) return {
    title: `Practice ${p.weaknesses[0]}`,
    reason: "Your latest assessment shows this topic needs more attention."
  };
  return {
    title: "Take your next assessment",
    reason: "Measure your progress and update your learning priorities."
  };
}

function renderNextAction() {
  const action = nextAction();
  $("nextActionTitle").textContent = action.title;
  $("nextActionReason").textContent = action.reason;
}

function renderStudyPlan() {
  if (!state.studyPlan) {
    $("studyPlanContent").textContent = "Generate a plan from your roadmap.";
    return;
  }

  $("studyPlanContent").innerHTML = `
    <p>${escapeHTML(state.studyPlan.note)}</p>
    ${state.studyPlan.stagePlans.map(plan => `
      <div class="plan-stage">
        <h4>${escapeHTML(plan.stageTitle)} <span class="muted">· Days ${plan.startDay}–${plan.endDay}</span></h4>
        <div class="blocks">${plan.dailyBlocks.map(b =>
          `<span class="block">${escapeHTML(b.activity)} · ${Number(b.minutes)} min</span>`
        ).join("")}</div>
      </div>
    `).join("")}
  `;
}

function renderDashboard() {
  $("onboardingScreen").classList.add("hidden");
  $("dashboard").classList.remove("hidden");
  $("goalPill").textContent = state.goal;
  $("levelBadge").textContent = state.level;
  renderAnalysis();
  renderRoadmap();
  renderStudyPlan();
  renderPerformance();
  renderNextAction();
  calculateProgress();
}

$("onboardingForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const goal = $("goalInput").value.trim();
  const level = $("levelInput").value;
  const dailyMinutes = Number($("dailyMinutesInput").value);
  const durationDays = Number($("durationDaysInput").value);
  const errors = [];

  if (goal.length < 5) errors.push("Enter a clear learning goal.");
  if (!level) errors.push("Select your current level.");
  if (!Number.isFinite(dailyMinutes) || dailyMinutes < 15 || dailyMinutes > 480) errors.push("Daily study time must be 15–480 minutes.");
  if (!Number.isFinite(durationDays) || durationDays < 3 || durationDays > 180) errors.push("Target duration must be 3–180 days.");

  if (errors.length) {
    $("onboardingErrors").textContent = errors.join(" ");
    $("onboardingErrors").classList.remove("hidden");
    return;
  }

  $("onboardingErrors").classList.add("hidden");
  $("startBtn").disabled = true;
  setLoading("onboardingLoading", true);

  try {
    const result = await api("/api/agent/analyze-goal", { goal, level, dailyMinutes, durationDays });
    state = {
      goal, level, dailyMinutes, durationDays,
      analysis: result.analysis,
      roadmap: result.roadmap,
      studyPlan: null,
      assessmentHistory: [],
      lastPractice: null
    };
    saveState();
    renderDashboard();
  } catch (error) {
    showToast(error.message);
  } finally {
    $("startBtn").disabled = false;
    setLoading("onboardingLoading", false);
  }
});

$("generatePlanBtn").addEventListener("click", async () => {
  setLoading("studyPlanLoading", true);
  try {
    state.studyPlan = await api("/api/agent/study-plan", {
      roadmap: state.roadmap,
      dailyMinutes: state.dailyMinutes,
      durationDays: state.durationDays,
      level: state.level
    });
    saveState();
    renderStudyPlan();
    renderNextAction();
    showToast("Study plan created.");
  } catch (error) {
    showToast(error.message);
  } finally {
    setLoading("studyPlanLoading", false);
  }
});

$("getPracticeBtn").addEventListener("click", async () => {
  setLoading("practiceLoading", true);
  try {
    const topic = $("practiceTopicSelect").value;
    const p = getPerformance();
    const result = await api("/api/agent/practice", {
      topic,
      level: state.level,
      currentStageTitle: state.roadmap.stages[0]?.title || "",
      recentWeakAreas: p.weaknesses
    });

    state.lastPractice = result;
    saveState();

    $("practiceContent").innerHTML = `
      <div class="practice-box">
        <p><strong>${escapeHTML(result.type.replaceAll("_", " "))}</strong></p>
        <p>${escapeHTML(result.prompt)}</p>
        ${result.starterCode ? `<pre><code>${escapeHTML(result.starterCode)}</code></pre>` : ""}
        <p><strong>Hint:</strong> ${escapeHTML(result.hint)}</p>
        <button id="showAnswerBtn" class="secondary-btn" type="button">Show Answer</button>
        <div id="practiceAnswer" class="answer hidden">${escapeHTML(result.answer)}</div>
      </div>
    `;
    $("showAnswerBtn").addEventListener("click", () => $("practiceAnswer").classList.toggle("hidden"));
    renderNextAction();
  } catch (error) {
    showToast(error.message);
  } finally {
    setLoading("practiceLoading", false);
  }
});

$("startAssessmentBtn").addEventListener("click", async () => {
  setLoading("assessmentLoading", true);
  $("assessmentSetup").classList.add("hidden");
  $("assessmentResults").classList.add("hidden");

  try {
    currentAssessment = await api("/api/agent/assessment", {
      topic: $("assessmentTopicSelect").value,
      level: state.level,
      numQuestions: 5
    });

    $("assessmentForm").innerHTML = currentAssessment.questions.map((q, i) => {
      if (q.type === "mcq") {
        return `
          <div class="question">
            <h4>${i + 1}. ${escapeHTML(q.question)}</h4>
            ${q.options.map((option, j) => `
              <label class="option">
                <input type="radio" name="q${i}" value="${j}" required>
                ${escapeHTML(option)}
              </label>
            `).join("")}
          </div>
        `;
      }
      return `
        <div class="question">
          <h4>${i + 1}. ${escapeHTML(q.question)}</h4>
          <input type="text" name="q${i}" placeholder="Type your answer" required>
        </div>
      `;
    }).join("") + `<button class="primary-btn" type="submit">Submit Assessment</button>`;

    $("assessmentForm").classList.remove("hidden");
  } catch (error) {
    showToast(error.message);
    $("assessmentSetup").classList.remove("hidden");
  } finally {
    setLoading("assessmentLoading", false);
  }
});

$("assessmentForm").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!currentAssessment) return;

  const form = new FormData(event.target);
  const results = currentAssessment.questions.map((q, i) => {
    const raw = form.get(`q${i}`);
    let correct = false;

    if (q.type === "mcq") {
      correct = Number(raw) === q.correctIndex;
    } else {
      const answer = String(raw || "").trim().toLowerCase();
      correct = q.acceptableAnswers.some(a =>
        answer === a.trim().toLowerCase() ||
        answer.includes(a.trim().toLowerCase()) ||
        a.trim().toLowerCase().includes(answer)
      );
    }

    return { subtopic: q.subtopic, correct };
  });

  const correctCount = results.filter(r => r.correct).length;
  const score = Math.round((correctCount / results.length) * 100);

  state.assessmentHistory.push({
    date: new Date().toISOString(),
    topic: currentAssessment.topic,
    score,
    results
  });
  saveState();

  $("assessmentForm").classList.add("hidden");
  $("assessmentSetup").classList.remove("hidden");
  $("assessmentResults").classList.remove("hidden");
  $("assessmentResults").innerHTML = `
    <div class="result-score">${score}%</div>
    <p>${correctCount} of ${results.length} answers correct.</p>
    <button id="newAssessmentBtn" class="secondary-btn" type="button">Take Another</button>
  `;
  $("newAssessmentBtn").addEventListener("click", () => {
    $("assessmentResults").classList.add("hidden");
  });

  renderPerformance();
  renderNextAction();
  calculateProgress();
  showToast("Assessment completed.");
});

$("nextActionBtn").addEventListener("click", () => {
  const action = nextAction();
  if (action.title.startsWith("Generate")) {
    $("generatePlanBtn").scrollIntoView({ behavior: "smooth", block: "center" });
    $("generatePlanBtn").focus();
  } else if (action.title.startsWith("Complete")) {
    $("getPracticeBtn").scrollIntoView({ behavior: "smooth", block: "center" });
    $("getPracticeBtn").focus();
  } else if (action.title.startsWith("Practice")) {
    $("practiceTopicSelect").value = getPerformance().weaknesses[0] || $("practiceTopicSelect").value;
    $("getPracticeBtn").scrollIntoView({ behavior: "smooth", block: "center" });
    $("getPracticeBtn").focus();
  } else {
    $("startAssessmentBtn").scrollIntoView({ behavior: "smooth", block: "center" });
    $("startAssessmentBtn").focus();
  }
});

$("coachForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = $("coachInput");
  const message = input.value.trim();
  if (!message) return;

  addCoachMessage("user", message);
  input.value = "";
  setLoading("coachLoading", true);

  try {
    const p = getPerformance();
    const reply = await api("/api/agent/coach", {
      message,
      context: {
        goal: state.goal,
        level: state.level,
        currentStageTitle: state.roadmap.stages[0]?.title || "",
        strengths: p.strengths,
        weaknesses: p.weaknesses,
        latestScore: p.latestScore,
        nextActionTitle: nextAction().title
      }
    });
    addCoachMessage("ai", reply.reply);
  } catch (error) {
    showToast(error.message);
  } finally {
    setLoading("coachLoading", false);
  }
});

function addCoachMessage(role, text) {
  const div = document.createElement("div");
  div.className = `message ${role}`;
  div.textContent = text;
  $("coachMessages").appendChild(div);
  $("coachMessages").scrollTop = $("coachMessages").scrollHeight;
}

$("resetBtn").addEventListener("click", () => {
  if (!confirm("Start a new learning goal? Your current local progress will be cleared.")) return;
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
});

if (state?.goal && state?.analysis && state?.roadmap) {
  renderDashboard();
}
