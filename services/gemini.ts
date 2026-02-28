
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Submission } from "../types";
import * as C from "../constants";

// Initialize Gemini
// Note: In a real app, ensure process.env.API_KEY is handled securely (e.g. backend proxy)
// For this frontend-only demo, we assume it's injected.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

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
  required: ["analysis"]
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
    You are an expert Data Analyst for the 'Indirect Tax Technology Benchmark'.
    You have access to a specific user's submission and the entire dataset of submissions.
    
    Your goal is to answer the user's question by analyzing their data against the benchmark.
    
    GUIDELINES:
    1. Be insightful and professional.
    2. Compare the user's metrics (e.g., FTEs, automation rates, AI adoption) with the average or median of the dataset.
    3. If the user asks for a visual or chart, or if a comparison is quantitative (like 'How do I compare on FTEs?'), generate the 'chart' object in the JSON response.
    4. For the chart 'data', usually include a point for 'You' and a point for 'Avg' or 'Top Quartile'.
    5. Translate internal codes (e.g., '100m_1b') to readable labels (e.g., '$100M - $1B') using the provided metadata.
    6. If the dataset is small, acknowledge that the benchmark is growing.
  `;

  try {
    const response = await ai.models.generateContent({
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
