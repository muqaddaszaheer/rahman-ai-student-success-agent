const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const GEMINI_API_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

class HFParseError extends Error {
  constructor(message) {
    super(message);
    this.name = "HFParseError";
  }
}

function ensureApiKey() {
  if (!GEMINI_API_KEY) {
    throw new HFParseError(
      "GEMINI_API_KEY is not configured. Add GEMINI_API_KEY in Railway Variables."
    );
  }
}

function cleanText(text) {
  if (typeof text !== "string") {
    return "";
  }

  return text.trim();
}

function extractResponseText(data) {
  const text =
    data?.candidates?.[0]?.content?.parts
      ?.map((part) => part?.text || "")
      .join("")
      .trim() || "";

  if (!text) {
    const finishReason =
      data?.candidates?.[0]?.finishReason || "unknown";

    throw new HFParseError(
      `Gemini returned no usable text. Finish reason: ${finishReason}.`
    );
  }

  return text;
}

function removeMarkdownCodeFence(text) {
  let cleaned = cleanText(text);

  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "");
    cleaned = cleaned.replace(/\s*```$/i, "");
  }

  return cleaned.trim();
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
      maxOutputTokens: Math.max(1, Number(maxTokens) || 800),
      temperature: Number.isFinite(Number(temperature))
        ? Number(temperature)
        : 0.2
    }
  };

  if (jsonMode) {
    body.generationConfig.responseMimeType = "application/json";
  }

  let response;

  try {
    response = await fetch(
      `${GEMINI_API_URL}?key=${encodeURIComponent(GEMINI_API_KEY)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      }
    );
  } catch (error) {
    throw new HFParseError(
      `Could not connect to Gemini: ${error.message}`
    );
  }

  let data;

  try {
    data = await response.json();
  } catch (error) {
    throw new HFParseError(
      `Gemini returned an invalid response. HTTP status: ${response.status}.`
    );
  }

  if (!response.ok) {
    const apiMessage =
      data?.error?.message ||
      `Gemini API request failed with HTTP ${response.status}.`;

    throw new HFParseError(apiMessage);
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

  const cleaned = removeMarkdownCodeFence(text);

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
  HFParseError,
  generateJSON,
  generateText
};
