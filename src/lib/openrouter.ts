import { createOpenAI } from "@ai-sdk/openai";

export const openrouter = createOpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

export const MODELS = {
  gemini: "google/gemini-3.1-flash-lite-preview",
  grok: "x-ai/grok-4.1-fast",
} as const;
