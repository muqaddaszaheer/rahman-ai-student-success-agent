const { InferenceClient } = require("@huggingface/inference");

const HF_TOKEN = process.env.HF_TOKEN;
const HF_MODEL =
  process.env.HF_MODEL || "Qwen/Qwen2.5-7B-Instruct-1M";

class HFConfigError extends Error {}
class HFRequestError extends Error {}
class HFParseError extends Error {}

function getClient() {
  if (!HF_TOKEN) {
    throw new HFConfigError(
      "HF_TOKEN is missing. Add it to your local .env file."
    );
  }

  return new InferenceClient(HF_TOKEN);
}

function cleanModelText(text) {
  let value = String(text || "").trim();

  // Remove Markdown code fences if the model adds them.
  value = value.replace(/^```(?:json)?\s*/i, "");
  value = value.replace(/\s*```$/i, "");
  value = value.trim();

  // Extract the JSON object if the model adds extra text.
  const first = value.indexOf("{");
  const last = value.lastIndexOf("}");

  if (first >= 0 && last > first) {
    value = value.slice(first, last + 1);
  }

  return value;
}

function getFriendlyHFError(error) {
  const message = String(error?.message || error || "").trim();
  const lower = message.toLowerCase();

  // Hugging Face quota / credit limit.
  if (
    lower.includes("depleted") ||
    lower.includes("monthly included credits") ||
    lower.includes("purchase pre-paid credits") ||
    lower.includes("quota") ||
    lower.includes("credits")
  ) {
    return (
      "Hugging Face inference credits have been exhausted. " +
      "Please use an account/provider with available inference credits."
    );
  }

  // Rate limiting.
  if (
    lower.includes("429") ||
    lower.includes("too many requests") ||
    lower.includes("rate limit")
  ) {
    return (
      "Hugging Face is temporarily rate-limiting requests. " +
      "Please wait a moment and try again."
    );
  }

  // Authentication problems.
  if (
    lower.includes("401") ||
    lower.includes("403") ||
    lower.includes("unauthorized") ||
    lower.includes("forbidden")
  ) {
    return (
      "Hugging Face authentication failed. " +
      "Please check the HF_TOKEN in your local .env file."
    );
  }

  // Model/provider problems.
  if (
    lower.includes("model") &&
    (lower.includes("not found") ||
      lower.includes("does not exist") ||
      lower.includes("unavailable"))
  ) {
    return (
      `The Hugging Face model "${HF_MODEL}" is currently unavailable. ` +
      "Please check the model name or provider availability."
    );
  }

  return `Hugging Face request failed: ${
    message || "Unknown Hugging Face error."
  }`;
}

async function chat(messages, options = {}) {
  const client = getClient();

  try {
    const response = await client.chatCompletion({
      model: HF_MODEL,
      provider: "auto",
      messages,
      max_tokens: options.maxTokens || 1000,
      temperature: options.temperature ?? 0.2
    });

    const content = response?.choices?.[0]?.message?.content;

    if (!content) {
      throw new HFRequestError(
        "Hugging Face returned an empty response."
      );
    }

    return String(content).trim();
  } catch (error) {
    if (
      error instanceof HFRequestError ||
      error instanceof HFConfigError ||
      error instanceof HFParseError
    ) {
      throw error;
    }

    throw new HFRequestError(getFriendlyHFError(error));
  }
}

async function generateJSON(systemPrompt, userPrompt, options = {}) {
  const text = await chat(
    [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: userPrompt
      }
    ],
    options
  );

  const cleaned = cleanModelText(text);

  try {
    return JSON.parse(cleaned);
  } catch {
    throw new HFParseError(
      "The AI returned an invalid structured response. Please try again."
    );
  }
}

async function generateText(systemPrompt, userPrompt, options = {}) {
  return chat(
    [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: userPrompt
      }
    ],
    options
  );
}

module.exports = {
  HF_MODEL,
  HFConfigError,
  HFRequestError,
  HFParseError,
  generateJSON,
  generateText
};