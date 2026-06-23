import { Submission } from '../types';
import * as C from '../constants';
import SURVEY_TOOLTIPS from '../surveyTooltips';
import {
  streamClaudeStructured, askClaudeStructured,
  type SystemBlock, type ClaudeUsage,
} from './claude';

/**
 * Taxi-specific prompt + schema. Builds the Claude request for the
 * benchmark-analysis chat and exposes both a one-shot (`askTaxi`) and a
 * streaming (`streamTaxi`) variant.
 *
 * Caching strategy: the system prompt carries the immutable instructions
 * plus the (large) benchmark dataset + metadata. We mark this block with
 * cache_control so repeat questions from the same user reuse the prefix.
 * The per-question payload (which user, what they asked) is the message
 * body — varies per call, doesn't invalidate the system cache.
 *
 * Minimum cacheable prefix on claude-haiku-4-5 is 4096 tokens. The dataset
 * portion of the system prompt easily clears that once a handful of
 * submissions are in the table; on near-empty datasets caching is silently
 * inert (no error, `usage.cache_read_input_tokens` stays at 0).
 */

const SYSTEM_INSTRUCTION = `You are **Taxi**, the AI benchmark analyst powering Taxable AI.
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
7. Always provide 2-3 relevant follow-up questions in the followUps array. These should naturally build on the current analysis and help the user dig deeper.`;

// JSON Schema matching the old Gemini RESPONSE_SCHEMA. Anthropic's structured
// outputs require `additionalProperties: false` on every object — silently
// drops anything Claude tries to add that isn't in the schema.
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    analysis: {
      type: 'string',
      description: "A detailed, markdown-formatted analysis answering the user's question based on the data provided.",
    },
    chart: {
      type: ['object', 'null'],
      description: 'Optional. Provide this if the user asks for a chart or if the data is best compared visually. null when no chart is appropriate.',
      properties: {
        title: { type: 'string' },
        type: { type: 'string', enum: ['bar', 'pie'], description: 'Type of chart to render' },
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: "Label for the data point (e.g. 'Your Org', 'Industry Avg')" },
              value: { type: 'number', description: 'Numerical value' },
            },
            required: ['name', 'value'],
            additionalProperties: false,
          },
        },
        xAxisLabel: { type: 'string' },
        yAxisLabel: { type: 'string' },
      },
      required: ['title', 'type', 'data'],
      additionalProperties: false,
    },
    followUps: {
      type: 'array',
      description: '2-3 short follow-up questions the user might want to ask next, based on what was just discussed.',
      items: { type: 'string' },
    },
  },
  required: ['analysis', 'followUps'],
  additionalProperties: false,
} as const;

export interface TaxiResponse {
  analysis: string;
  chart: {
    title: string;
    type: 'bar' | 'pie';
    data: Array<{ name: string; value: number }>;
    xAxisLabel?: string;
    yAxisLabel?: string;
  } | null;
  followUps: string[];
}

// Static reference data goes in the system prompt — same for every request.
// Per-user data (which submission is "yours") goes in the message body.
function buildSystem(allSubmissions: Submission[]): SystemBlock[] {
  const benchmarkContext = {
    benchmarkData: allSubmissions,
    metadata: {
      totalRespondents: allSubmissions.length,
      constants: {
        revenueRanges: C.OPTS_REVENUE,
        roles: C.OPTS_RESPONDENT_ROLE,
        automation: C.OPTS_AUTOMATION,
        budgetRanges: C.OPTS_BUDGET_RANGE,
        decisionOwner: C.OPTS_DECISION_OWNER,
        buildBuyExperience: C.OPTS_BUILD_BUY_EXPERIENCE,
      },
      fieldDescriptions: SURVEY_TOOLTIPS,
    },
  };
  return [
    {
      type: 'text',
      text: `${SYSTEM_INSTRUCTION}\n\n--- BENCHMARK DATASET ---\n${JSON.stringify(benchmarkContext)}`,
      cache_control: { type: 'ephemeral' },
    },
  ];
}

function buildUserMessage(question: string, userSubmission: Submission): string {
  return `Here is the user's own submission:\n${JSON.stringify(userSubmission)}\n\nUser Question: ${question}`;
}

const FALLBACK: TaxiResponse = {
  analysis: 'I apologize, but I encountered an error analyzing the data. Please try again.',
  chart: null,
  followUps: [],
};

/** Non-streaming variant — kept for tests and any caller that wants a single await. */
export async function askTaxi(
  question: string,
  userSubmission: Submission,
  allSubmissions: Submission[],
): Promise<TaxiResponse> {
  try {
    const { json } = await askClaudeStructured<TaxiResponse>({
      system: buildSystem(allSubmissions),
      messages: [{ role: 'user', content: buildUserMessage(question, userSubmission) }],
      outputFormat: RESPONSE_SCHEMA as unknown as Record<string, unknown>,
    });
    return json;
  } catch (error: any) {
    // Surface the daily-limit message to the user instead of the generic
    // fallback so they know to wait rather than think the AI is broken.
    if (error?.status === 429) {
      return { analysis: error.message, chart: null, followUps: [] };
    }
    console.error('AI Request Failed', error);
    return FALLBACK;
  }
}

/**
 * Streaming variant — same return shape, but the wire is SSE so the server
 * starts emitting tokens before the full response is rendered. Optionally
 * accepts an onDelta callback for the UI to show a typing indicator with a
 * live token count or other lightweight progress.
 *
 * The final JSON is parsed once the stream completes — we don't attempt
 * partial-JSON parsing of the streaming content (the JSON-shaped output
 * isn't useful to render incrementally anyway).
 */
export async function streamTaxi(
  question: string,
  userSubmission: Submission,
  allSubmissions: Submission[],
  onDelta?: (chunk: string, accumulated: string) => void,
): Promise<{ result: TaxiResponse; usage: ClaudeUsage | null }> {
  try {
    const { json, usage } = await streamClaudeStructured<TaxiResponse>({
      system: buildSystem(allSubmissions),
      messages: [{ role: 'user', content: buildUserMessage(question, userSubmission) }],
      outputFormat: RESPONSE_SCHEMA as unknown as Record<string, unknown>,
    }, onDelta);
    return { result: json, usage };
  } catch (error: any) {
    // Surface the daily-limit message as the answer so the user sees why,
    // instead of the generic "encountered an error" fallback.
    if (error?.status === 429) {
      return { result: { analysis: error.message, chart: null, followUps: [] }, usage: null };
    }
    console.error('AI Request Failed', error);
    return { result: FALLBACK, usage: null };
  }
}

// Exported for tests.
export { SYSTEM_INSTRUCTION, RESPONSE_SCHEMA, buildSystem, buildUserMessage, FALLBACK };
