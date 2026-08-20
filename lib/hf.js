const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-3.6-flash";

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
  if (!GEMINI_API_KEY.trim()) {
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

  value = value.replace(/^```(?:json|javascript)?\s*/i, "");
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

  const firstBracket = cleaned.indexOf("[");
  const lastBracket = cleaned.lastIndexOf("]");

  if (
    firstBracket !== -1 &&
    lastBracket !== -1 &&
    lastBracket > firstBracket
  ) {
    return cleaned.slice(firstBracket, lastBracket + 1).trim();
  }

  return cleaned;
}

function extractResponseText(data) {
  const parts = data?.candidates?.[0]?.content?.parts;

  const text = Array.isArray(parts)
    ? parts
        .map((part) => part?.text || "")
        .join("")
        .trim()
    : "";

  const finishReason =
    data?.candidates?.[0]?.finishReason || "unknown";

  if (!text) {
    throw new HFRequestError(
      `Gemini returned no usable response. Finish reason: ${finishReason}.`
    );
  }

  if (finishReason === "MAX_TOKENS") {
    throw new HFRequestError(
      "Gemini response was cut off because it reached the output token limit."
    );
  }

  return text;
}

async function callGemini({
  systemInstruction = "",
  prompt = "",
  maxTokens = 4096,
  temperature = 0.2,
  jsonMode = false
}) {
  ensureApiKey();

  const body = {
    systemInstruction: {
      parts: [
        {
          text: String(systemInstruction).trim()
        }
      ]
    },

    contents: [
      {
        role: "user",
        parts: [
          {
            text: String(prompt).trim()
          }
        ]
      }
    ],

    generationConfig: {
      maxOutputTokens: Math.max(
        1000,
        Number(maxTokens) || 4096
      ),
      temperature: Math.max(
        0,
        Math.min(
          1,
          Number(temperature) || 0.2
        )
      )
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
  const maxTokens = Math.max(
    3000,
    Number(options.maxTokens) || 5000
  );

  const temperature =
    Number.isFinite(Number(options.temperature))
      ? Number(options.temperature)
      : 0.15;

  let text;

  try {
    text = await callGemini({
      systemInstruction,
      prompt,
      maxTokens,
      temperature,
      jsonMode: true
    });
  } catch (error) {
    throw error;
  }

  let cleaned = extractJson(text);

  if (!cleaned) {
    throw new HFParseError(
      "Gemini returned an empty JSON response."
    );
  }

  try {
    return JSON.parse(cleaned);
  } catch (firstError) {
    const retryPrompt = `${prompt}

IMPORTANT JSON REQUIREMENTS:
- Return ONLY one complete JSON object.
- Do not use Markdown.
- Do not use code fences.
- Do not add explanations.
- Do not leave any field incomplete.
- Make sure every opening brace has a matching closing brace.
- Make sure every opening bracket has a matching closing bracket.
- Keep the response concise enough to fit within the output limit.
`;

    let retryText;

    try {
      retryText = await callGemini({
        systemInstruction,
        prompt: retryPrompt,
        maxTokens: Math.max(
          6000,
          maxTokens
        ),
        temperature: 0.1,
        jsonMode: true
      });
    } catch (retryError) {
      throw retryError;
    }

    cleaned = extractJson(retryText);

    if (!cleaned) {
      throw new HFParseError(
        "Gemini returned an empty JSON response after retry."
      );
    }

    try {
      return JSON.parse(cleaned);
    } catch (secondError) {
      throw new HFParseError(
        `Gemini returned invalid JSON after retry: ${secondError.message}`
      );
    }
  }
}

async function generateText(
  systemInstruction,
  prompt,
  options = {}
) {
  const maxTokens = Math.max(
    1000,
    Number(options.maxTokens) || 2000
  );

  const temperature =
    Number.isFinite(Number(options.temperature))
      ? Number(options.temperature)
      : 0.35;

  return callGemini({
    systemInstruction,
    prompt,
    maxTokens,
    temperature,
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
