````javascript
const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || "";

const GEMINI_MODEL =
  process.env.GEMINI_MODEL ||
  "gemini-3.7-flash";

const GEMINI_API_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const REQUEST_TIMEOUT_MS = 60000;
const MAX_JSON_RETRIES = 2;

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
  if (typeof text !== "string") {
    return "";
  }

  return text.trim();
}

function removeMarkdownCodeFence(text) {
  let value = cleanText(text);

  value = value.replace(
    /^```(?:json)?\s*/i,
    ""
  );

  value = value.replace(
    /\s*```$/i,
    ""
  );

  return value.trim();
}

function extractJson(text) {
  const cleaned =
    removeMarkdownCodeFence(text);

  if (!cleaned) {
    return "";
  }

  /*
   * First try the complete response directly.
   * This is the safest option when Gemini already
   * returned valid JSON.
   */
  try {
    JSON.parse(cleaned);
    return cleaned;
  } catch {
    // Continue with extraction below.
  }

  const firstBrace =
    cleaned.indexOf("{");

  const lastBrace =
    cleaned.lastIndexOf("}");

  if (
    firstBrace !== -1 &&
    lastBrace !== -1 &&
    lastBrace > firstBrace
  ) {
    return cleaned
      .slice(
        firstBrace,
        lastBrace + 1
      )
      .trim();
  }

  return cleaned;
}

function extractResponseText(data) {
  const candidate =
    data?.candidates?.[0];

  const parts =
    candidate?.content?.parts;

  const text =
    Array.isArray(parts)
      ? parts
          .map(
            (part) =>
              typeof part?.text === "string"
                ? part.text
                : ""
          )
          .join("")
          .trim()
      : "";

  if (!text) {
    const finishReason =
      candidate?.finishReason ||
      "unknown";

    const blockReason =
      data?.promptFeedback?.blockReason;

    if (blockReason) {
      throw new HFRequestError(
        `Gemini blocked the request. Reason: ${blockReason}.`
      );
    }

    throw new HFRequestError(
      `Gemini returned no usable response. Finish reason: ${finishReason}.`
    );
  }

  return text;
}

function getFinishReason(data) {
  return (
    data?.candidates?.[0]?.finishReason ||
    "unknown"
  );
}

function isRetryableStatus(status) {
  return (
    status === 408 ||
    status === 429 ||
    status >= 500
  );
}

async function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function requestGemini(body) {
  ensureApiKey();

  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller =
      new AbortController();

    const timeout = setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT_MS
    );

    try {
      const response = await fetch(
        GEMINI_API_URL,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
            "x-goog-api-key":
              GEMINI_API_KEY.trim()
          },
          body: JSON.stringify(body),
          signal: controller.signal
        }
      );

      clearTimeout(timeout);

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

        if (
          isRetryableStatus(response.status) &&
          attempt < 2
        ) {
          lastError =
            new HFRequestError(message);

          await sleep(
            1000 * (attempt + 1)
          );

          continue;
        }

        throw new HFRequestError(
          message
        );
      }

      return data;
    } catch (error) {
      clearTimeout(timeout);

      if (
        error instanceof HFRequestError
      ) {
        if (attempt < 2) {
          lastError = error;

          await sleep(
            1000 * (attempt + 1)
          );

          continue;
        }

        throw error;
      }

      if (
        error?.name === "AbortError"
      ) {
        lastError =
          new HFRequestError(
            "Gemini request timed out after 60 seconds."
          );

        if (attempt < 2) {
          await sleep(
            1000 * (attempt + 1)
          );

          continue;
        }

        throw lastError;
      }

      lastError =
        new HFRequestError(
          `Could not connect to Gemini: ${
            error?.message ||
            "Network error."
          }`
        );

      if (attempt < 2) {
        await sleep(
          1000 * (attempt + 1)
        );

        continue;
      }

      throw lastError;
    }
  }

  throw (
    lastError ||
    new HFRequestError(
      "Gemini request failed."
    )
  );
}

async function callGemini({
  systemInstruction,
  prompt,
  maxTokens = 8192,
  jsonMode = false,
  temperature
}) {
  const safeMaxTokens = Math.min(
    Math.max(
      1,
      Number(maxTokens) || 8192
    ),
    64000
  );

  const body = {
    systemInstruction: {
      parts: [
        {
          text: String(
            systemInstruction || ""
          ).trim()
        }
      ]
    },

    contents: [
      {
        role: "user",
        parts: [
          {
            text: String(
              prompt || ""
            ).trim()
          }
        ]
      }
    ],

    generationConfig: {
      maxOutputTokens:
        safeMaxTokens
    }
  };

  if (
    temperature !== undefined &&
    temperature !== null
  ) {
    const numericTemperature =
      Number(temperature);

    if (
      Number.isFinite(
        numericTemperature
      )
    ) {
      body.generationConfig.temperature =
        Math.min(
          Math.max(
            numericTemperature,
            0
          ),
          2
        );
    }
  }

  if (jsonMode) {
    body.generationConfig.responseMimeType =
      "application/json";
  }

  const data =
    await requestGemini(body);

  const finishReason =
    getFinishReason(data);

  const text =
    extractResponseText(data);

  return {
    text,
    finishReason
  };
}

async function generateJSON(
  systemInstruction,
  prompt,
  options = {}
) {
  const maxTokens =
    Math.min(
      Math.max(
        4000,
        Number(options.maxTokens) ||
          10000
      ),
      64000
    );

  const temperature =
    options.temperature !== undefined
      ? options.temperature
      : 0.15;

  let lastParseError = null;

  for (
    let attempt = 0;
    attempt <= MAX_JSON_RETRIES;
    attempt += 1
  ) {
    let requestPrompt =
      String(prompt || "").trim();

    if (attempt > 0) {
      requestPrompt = `
${requestPrompt}

IMPORTANT RETRY INSTRUCTION:

The previous response was not usable as complete JSON.

Return ONE complete JSON object only.

Do not use Markdown.
Do not use code fences.
Do not add explanations.
Do not stop early.
Make sure every opening { has a matching }.
Make sure every opening [ has a matching ].
Return the complete object before ending the response.
`;
    }

    let result;

    try {
      result = await callGemini({
        systemInstruction,
        prompt: requestPrompt,
        maxTokens,
        jsonMode: true,
        temperature
      });
    } catch (error) {
      throw error;
    }

    const text = cleanText(
      result.text
    );

    if (!text) {
      lastParseError =
        new HFParseError(
          "Gemini returned an empty structured response."
        );

      continue;
    }

    const cleaned =
      extractJson(text);

    if (!cleaned) {
      lastParseError =
        new HFParseError(
          "Gemini returned an empty JSON response."
        );

      continue;
    }

    try {
      return JSON.parse(cleaned);
    } catch (error) {
      lastParseError =
        new HFParseError(
          `Gemini returned invalid JSON: ${error.message}. Finish reason: ${result.finishReason}.`
        );

      /*
       * If Gemini stopped because the output limit
       * was reached, retry with a larger limit.
       */
      continue;
    }
  }

  throw (
    lastParseError ||
    new HFParseError(
      "Gemini could not return valid JSON."
    )
  );
}

async function generateText(
  systemInstruction,
  prompt,
  options = {}
) {
  const maxTokens =
    Math.min(
      Math.max(
        1000,
        Number(options.maxTokens) ||
          3000
      ),
      64000
    );

  const temperature =
    options.temperature !== undefined
      ? options.temperature
      : 0.35;

  const result =
    await callGemini({
      systemInstruction,
      prompt,
      maxTokens,
      jsonMode: false,
      temperature
    });

  return result.text;
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
````
