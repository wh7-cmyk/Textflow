import { GoogleGenAI, Type } from "@google/genai";

export const generateSamplePosts = async (): Promise<string[]> => {
  try {
    const apiKey = process.env.API_KEY;
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