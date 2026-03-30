
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Submission } from "../types";
import * as C from "../constants";

// Initialize Gemini lazily so a missing API key doesn't crash the app on load.
let ai: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!ai) {
    const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");
    ai = new GoogleGenAI({ apiKey });
  }
  return ai;
}

const RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    analysis: {
      type: Type.STRING,
      description: "A detailed, markdown-formatted analysis answering the user's question based on the data provided.",
    },
    chart: {
      type: Type.OBJECT,
      nullable: true,
      description: "Optional. Provide this if the user asks for a chart or if the data is best compared visually.",
      properties: {
        title: { type: Type.STRING },
        type: { type: Type.STRING, enum: ["bar", "pie"], description: "Type of chart to render" },
        data: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING, description: "Label for the data point (e.g. 'Your Org', 'Industry Avg')" },
              value: { type: Type.NUMBER, description: "Numerical value" }
            }
          }
        },
        xAxisLabel: { type: Type.STRING },
        yAxisLabel: { type: Type.STRING }
      },
      required: ["title", "type", "data"]
    }
  },
  followUps: {
    type: Type.ARRAY,
    description: "2-3 short follow-up questions the user might want to ask next, based on what was just discussed.",
    items: { type: Type.STRING }
  },
  required: ["analysis", "followUps"]
};

export async function askBenchmarkAI(
  question: string, 
  userSubmission: Submission, 
  allSubmissions: Submission[]
) {
  // Prepare context data
  const context = {
    currentUserData: userSubmission,
    benchmarkData: allSubmissions,
    metadata: {
      totalRespondents: allSubmissions.length,
      constants: {
        revenueRanges: C.OPTS_REVENUE,
        roles: C.OPTS_RESPONDENT_ROLE,
        automation: C.OPTS_AUTOMATION
      }
    }
  };

  // Updated to the recommended model for basic text/data analysis
  const model = "gemini-3-flash-preview";
  
  const systemInstruction = `
    You are **Taxi**, the AI benchmark analyst powering Taxable AI.
    You have access to a specific user's submission and the entire dataset of submissions.

    PERSONALITY:
    - You're knowledgeable and sharp, but also approachable and conversational.
    - Lead with the insight, then explain. Don't be dry — use a confident, advisory tone like a trusted colleague who happens to be a data expert.
    - Keep responses concise but substantive. Use short paragraphs and bullet points for readability.
    - When the data tells an interesting story, highlight it. When it's limited, be honest about it.

    GUIDELINES:
    1. Compare the user's metrics (e.g., FTEs, automation rates, AI adoption) with the average or median of the dataset.
    2. If the user asks for a visual or chart, or if a comparison is quantitative (like 'How do I compare on FTEs?'), generate the 'chart' object in the JSON response.
    3. For the chart 'data', usually include a point for 'You' and a point for 'Avg' or 'Top Quartile'.
    4. Translate internal codes (e.g., '100m_1b') to readable labels (e.g., '$100M - $1B') using the provided metadata.
    5. If the dataset is small, acknowledge that the benchmark is growing but still provide the best analysis you can.
    6. End with a brief actionable takeaway.
    7. Always provide 2-3 relevant follow-up questions in the followUps array. These should naturally build on the current analysis and help the user dig deeper.
  `;

  try {
    const response = await getAI().models.generateContent({
      model: model,
      contents: [
        { role: 'user', parts: [{ text: JSON.stringify(context) }] },
        { role: 'user', parts: [{ text: `User Question: ${question}` }] }
      ],
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.2, // Low temperature for analytical consistency
      }
    });

    // Directly access the .text property (not a method call)
    const text = response.text;
    if (!text) throw new Error("No response from AI");
    
    return JSON.parse(text);

  } catch (error) {
    console.error("AI Request Failed", error);
    return {
      analysis: "I apologize, but I encountered an error analyzing the data. Please try again.",
      chart: null
    };
  }
}
