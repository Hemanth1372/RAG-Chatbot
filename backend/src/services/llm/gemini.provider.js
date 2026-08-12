import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const generationModel = process.env.GEMINI_GENERATION_MODEL || "gemini-3.5-flash";

export async function generateWithGemini(prompt) {
  const response = await ai.models.generateContent({
    model: generationModel,
    contents: prompt,
    config: {
      temperature: 0,
      responseMimeType: "application/json",
    },
  });

  const rawText = response.text?.trim();

  if (!rawText) {
    throw new Error("Gemini returned an empty response.");
  }

  return rawText;
}
