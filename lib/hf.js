const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-2.5-flash";

const GEMINI_API_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

class HFConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "HFConfigError";
  }
}

class HFRequestError extends Error {
  constructor(message) {
    super(message);
    this.name = "HFRequestError";
  }
}

class HFParseError extends Error {
  constructor(message) {
    super(message);
    this.name = "HFParseError";
  }
}

function ensureApiKey() {
  if (!GEMINI_API_KEY || !GEMINI_API_KEY.trim()) {
    throw new HFConfigError(
      "GEMINI_API_KEY is not configured. Add GEMINI_API_KEY to Railway Variables."
    );
  }
}

function cleanText(text) {
  return typeof text === "string" ? text.trim() : "";
}

function removeMarkdownCodeFence(text) {
  let value = cleanText(text);

  value = value.replace(/^```(?:json)?\s*/i, "");
  value = value.replace(/\s*```$/i, "");

  return value.trim();
}

function extractJson(text) {
  const cleaned = removeMarkdownCodeFence(text);

  if (!cleaned) {
    return "";
  }

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (
    firstBrace !== -1 &&
    lastBrace !== -1 &&
    lastBrace > firstBrace
  ) {
    return cleaned.slice(firstBrace, lastBrace + 1).trim();
  }

  return cleaned;
}

function extractResponseText(data) {
  const parts =
    data?.candidates?.[0]?.content?.parts || [];

  const text = parts
    .map((part) => part?.text || "")
    .join("")
    .trim();

  if (!text) {
    const finishReason =
      data?.candidates?.[0]?.finishReason || "unknown";

    throw new HFRequestError(
      `Gemini returned no usable response. Finish reason: ${finishReason}.`
    );
  }

  return text;
}

async function callGemini({
  systemInstruction,
  prompt,
  maxTokens = 800,
  temperature = 0.2,
  jsonMode = false
}) {
  ensureApiKey();

  const body = {
    systemInstruction: {
      parts: [
        {
          text: String(systemInstruction || "").trim()
        }
      ]
    },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: String(prompt || "").trim()
          }
        ]
      }
    ],
    generationConfig: {
      maxOutputTokens: Math.max(
        1,
        Number(maxTokens) || 800
      ),
      temperature: Number.isFinite(Number(temperature))
        ? Number(temperature)
        : 0.2
    }
  };

  if (jsonMode) {
    body.generationConfig.responseMimeType =
      "application/json";
  }

  let response;

  try {
    response = await fetch(
      `${GEMINI_API_URL}?key=${encodeURIComponent(
        GEMINI_API_KEY.trim()
      )}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      }
    );
  } catch (error) {
    throw new HFRequestError(
      `Could not connect to Gemini: ${
        error?.message || "Network error."
      }`
    );
  }

  let data;

  try {
    data = await response.json();
  } catch {
    throw new HFRequestError(
      `Gemini returned an invalid response. HTTP status: ${response.status}.`
    );
  }

  if (!response.ok) {
    const message =
      data?.error?.message ||
      `Gemini API request failed with HTTP ${response.status}.`;

    throw new HFRequestError(message);
  }

  return extractResponseText(data);
}

async function generateJSON(
  systemInstruction,
  prompt,
  options = {}
) {
  const text = await callGemini({
    systemInstruction,
    prompt,
    maxTokens: options.maxTokens ?? 1200,
    temperature: options.temperature ?? 0.2,
    jsonMode: true
  });

  const cleaned = extractJson(text);

  if (!cleaned) {
    throw new HFParseError(
      "Gemini returned an empty structured response."
    );
  }

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    throw new HFParseError(
      `Gemini returned invalid JSON: ${error.message}`
    );
  }
}

async function generateText(
  systemInstruction,
  prompt,
  options = {}
) {
  return callGemini({
    systemInstruction,
    prompt,
    maxTokens: options.maxTokens ?? 500,
    temperature: options.temperature ?? 0.4,
    jsonMode: false
  });
}

console.log(
  `Gemini AI configured with model: ${GEMINI_MODEL}`
);

module.exports = {
  HF_MODEL: GEMINI_MODEL,
  HFConfigError,
  HFRequestError,
  HFParseError,
  generateJSON,
  generateText
};
