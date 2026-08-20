const { InferenceClient } = require("@huggingface/inference");

const HF_TOKEN = process.env.HF_TOKEN;
const HF_MODEL =
  process.env.HF_MODEL || "Qwen/Qwen2.5-7B-Instruct-1M";

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

function getClient() {
  if (!HF_TOKEN || !HF_TOKEN.trim()) {
    throw new HFConfigError(
      "HF_TOKEN is not configured. Add HF_TOKEN to your environment variables."
    );
  }

  return new InferenceClient(HF_TOKEN.trim());
}

function cleanModelText(text) {
  let value = String(text || "").trim();

  if (!value) {
    return "";
  }

  // Remove Markdown code fences.
  value = value.replace(/^```(?:json)?\s*/i, "");
  value = value.replace(/\s*```$/i, "");
  value = value.trim();

  return value;
}

function extractJSONObject(text) {
  const value = cleanModelText(text);

  if (!value) {
    return "";
  }

  const firstBrace = value.indexOf("{");
  const lastBrace = value.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return value;
  }

  return value.slice(firstBrace, lastBrace + 1).trim();
}

function getFriendlyHFError(error) {
  const message = String(error?.message || error || "").trim();
  const lower = message.toLowerCase();

  if (
    lower.includes("401") ||
    lower.includes("403") ||
    lower.includes("unauthorized") ||
    lower.includes("forbidden") ||
    lower.includes("invalid token")
  ) {
    return "Hugging Face authentication failed. Check your HF_TOKEN.";
  }

  if (
    lower.includes("429") ||
    lower.includes("too many requests") ||
    lower.includes("rate limit")
  ) {
    return "Hugging Face is temporarily rate-limiting requests. Please try again shortly.";
  }

  if (
    lower.includes("credit") ||
    lower.includes("quota") ||
    lower.includes("depleted") ||
    lower.includes("monthly included")
  ) {
    return "Hugging Face inference credits are unavailable or exhausted.";
  }

  if (
    lower.includes("model") &&
    (
      lower.includes("not found") ||
      lower.includes("does not exist") ||
      lower.includes("unavailable")
    )
  ) {
    return `The Hugging Face model "${HF_MODEL}" is unavailable.`;
  }

  if (
    lower.includes("provider") &&
    (
      lower.includes("not available") ||
      lower.includes("unavailable")
    )
  ) {
    return `No available Hugging Face provider was found for "${HF_MODEL}".`;
  }

  return `Hugging Face request failed: ${
    message || "Unknown error."
  }`;
}

async function chat(messages, options = {}) {
  const client = getClient();

  if (!Array.isArray(messages) || messages.length === 0) {
    throw new HFRequestError(
      "No messages were provided to Hugging Face."
    );
  }

  const maxTokens = Math.max(
    1,
    Number(options.maxTokens) || 1000
  );

  const temperature = Number.isFinite(
    Number(options.temperature)
  )
    ? Number(options.temperature)
    : 0.2;

  try {
    const response = await client.chatCompletion({
      model: HF_MODEL,
      provider: "auto",
      messages,
      max_tokens: maxTokens,
      temperature
    });

    const content =
      response?.choices?.[0]?.message?.content;

    if (typeof content !== "string" || !content.trim()) {
      throw new HFRequestError(
        "Hugging Face returned an empty response."
      );
    }

    return content.trim();
  } catch (error) {
    if (
      error instanceof HFRequestError ||
      error instanceof HFConfigError ||
      error instanceof HFParseError
    ) {
      throw error;
    }

    throw new HFRequestError(
      getFriendlyHFError(error)
    );
  }
}

async function generateJSON(
  systemPrompt,
  userPrompt,
  options = {}
) {
  const text = await chat(
    [
      {
        role: "system",
        content: String(systemPrompt || "").trim()
      },
      {
        role: "user",
        content: String(userPrompt || "").trim()
      }
    ],
    {
      maxTokens: options.maxTokens ?? 1200,
      temperature: options.temperature ?? 0.2
    }
  );

  const cleaned = extractJSONObject(text);

  if (!cleaned) {
    throw new HFParseError(
      "Hugging Face returned an empty structured response."
    );
  }

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    throw new HFParseError(
      `Hugging Face returned invalid JSON: ${error.message}`
    );
  }
}

async function generateText(
  systemPrompt,
  userPrompt,
  options = {}
) {
  return chat(
    [
      {
        role: "system",
        content: String(systemPrompt || "").trim()
      },
      {
        role: "user",
        content: String(userPrompt || "").trim()
      }
    ],
    {
      maxTokens: options.maxTokens ?? 500,
      temperature: options.temperature ?? 0.4
    }
  );
}

console.log(
  `Hugging Face model configured: ${HF_MODEL}`
);

module.exports = {
  HF_MODEL,
  HFConfigError,
  HFRequestError,
  HFParseError,
  generateJSON,
  generateText
};
