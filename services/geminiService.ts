import { GoogleGenAI, Type } from "@google/genai";

// Use the provided key as a fallback if env var is missing or process is undefined
const FALLBACK_KEY = "AIzaSyASR3vX2WLolNVwKr0wtLLMjMnghFJuUAU";

export const generateSamplePosts = async (): Promise<string[]> => {
  try {
    let apiKey = FALLBACK_KEY;

    // Safely check for environment variable without crashing if 'process' is undefined
    try {
      if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
        apiKey = process.env.API_KEY;
      }
    } catch (e) {
      // Ignore reference error if process is not defined
    }

    if (!apiKey) {
      console.warn("No Gemini API Key found. Returning fallback posts.");
      return [
        "Just learned about the new crypto regulations. Interesting times ahead! #crypto",
        "Who else is bullish on USDT stability? 🚀",
        "Check out this cool resource for React developers: https://react.dev",
      ];
    }

    const ai = new GoogleGenAI({ apiKey });
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: "Generate 3 short, engaging social media text posts about technology, finance, or motivation. One should include a link (fake or real). Return them as a JSON array of strings.",
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.STRING
          }
        }
      }
    });

    const text = response.text;
    if (!text) return [];
    
    const posts = JSON.parse(text);
    return Array.isArray(posts) ? posts : [];

  } catch (error) {
    console.error("Gemini Error:", error);
    return [
       "System update: The new pay-per-view algorithm is live.",
       "Daily Reminder: Drink water and check your portfolio.",
    ];
  }
};