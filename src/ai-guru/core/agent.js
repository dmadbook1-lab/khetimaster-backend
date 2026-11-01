import { Agent, OpenAIProvider, Runner, assistant, user } from '@openai/agents';

import { aiGuruTools } from '../tools/index.js';
import { ASSISTANT_NAME } from './systemPrompt.js';

/*
|--------------------------------------------------------------------------
| AI GURU AGENT
|--------------------------------------------------------------------------
|
| Same stack as the CropGen farm assistant: OpenAI Agents SDK Runner with
| the OpenAI provider, plain-text farmer replies, and one recovery retry
| when a reply comes back empty, cut off, or claims it has no data access.
|
| The agent is stateless: conversation history comes from MongoDB on every
| call, so any server instance can answer any message.
|
*/

const AGENT_TIMEOUT_MS = Number(process.env.AI_GURU_TIMEOUT_MS) || 60000;

/** Model call + a few tool round-trips (farm, weather, prices, open screen). */
const AGENT_MAX_TURNS = 8;

export const AI_ERROR_REPLY =
  "I'm having trouble reaching the AI service right now. Please try again in a moment.";

export const AI_NOT_CONFIGURED_REPLY = 'AI Guru is not configured yet. Please contact support.';

const INCOMPLETE_REPLY =
  'I could not generate a full answer just now. Please ask again in a moment.';

let runner = null;

export function isAiGuruConfigured() {
  return Boolean(String(process.env.OPENAI_API_KEY ?? '').trim());
}

/** One shared Runner backed by the OpenAI Agents SDK provider. */
function getRunner() {
  const apiKey = String(process.env.OPENAI_API_KEY ?? '').trim();
  if (!apiKey) return null;

  if (!runner) {
    runner = new Runner({
      modelProvider: new OpenAIProvider({ apiKey }),
      workflowName: 'KhetiMaster AI Guru',
    });
  }

  return runner;
}

export function resolveModelName() {
  return (
    process.env.AI_GURU_MODEL ||
    process.env.OPENAI_AGENT_MODEL ||
    process.env.OPENAI_MODEL ||
    'gpt-4o-mini'
  );
}

function readModelConfig() {
  const envTemp = process.env.AI_GURU_TEMPERATURE ?? process.env.OPENAI_AGENT_TEMPERATURE;
  const envMaxOut = process.env.AI_GURU_MAX_TOKENS ?? process.env.OPENAI_AGENT_MAX_TOKENS;

  return {
    temperature: envTemp !== undefined && envTemp !== '' ? Number(envTemp) : 0.42,
    maxTokens: envMaxOut !== undefined && envMaxOut !== '' ? Number(envMaxOut) : 1024,
  };
}

function buildAgent(instructions) {
  const { temperature, maxTokens } = readModelConfig();

  return new Agent({
    name: ASSISTANT_NAME,
    instructions,
    model: resolveModelName(),
    tools: aiGuruTools,
    modelSettings: { temperature, maxTokens, topP: 0.9 },
  });
}

/*
|--------------------------------------------------------------------------
| REPLY CLEAN-UP (same rules as CropGen)
|--------------------------------------------------------------------------
*/

function isIncompleteReply(text) {
  const t = (text || '').trim();
  if (!t) return true;
  const lines = t
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length === 1 && /^(Do|Check|Avoid|Next):\s*$/i.test(lines[0]);
}

function looksTruncated(text) {
  const t = (text || '').trim();
  if (!t) return true;
  // Indian scripts end sentences with । or ॥
  if (/[.!?…।॥)]["']?\s*$/.test(t)) return false;
  if (t.length < 22) return true;
  if (t.length >= 220) return false;
  return /\b(make|makes|helps?|better|more|less|the|a|an|to|for|and|or|with|is|are|was|were|be|have|has|had|your|our|their|that|this|what|when|how|which|if|as|so|like|such)\s*$/i.test(
    t
  );
}

const needsRecoveryReply = (text) => isIncompleteReply(text) || looksTruncated(text);

function isAccessDisclaimer(text) {
  return /don'?t have (direct |real-?time )?(access|weather)|do not have (direct |real-?time )?(access|weather)|cannot access (real-?time )?(weather|data)|unable to (access|see|get) (your )?(weather|live data)/i.test(
    String(text || '')
  );
}

function normalizeListLineBreaks(text) {
  let t = text.replace(/\r\n/g, '\n');
  t = t.replace(/([.!?।])\s*(Do|Check|Avoid|Next):\s*•\s+/gi, '$1\n\n$2:\n• ');
  t = t.replace(/(^|\n)(Do|Check|Avoid|Next):\s*•\s+/gm, '$1$2:\n• ');
  t = t.replace(/([.!?।])\s*•\s+/g, '$1\n• ');
  t = t.replace(/([.!?।])\s*(Do|Check|Avoid|Next):\s+(?!•\s)/gi, '$1\n\n$2:\n');
  return t.replace(/\n{3,}/g, '\n\n');
}

export function formatPlainFarmerReply(raw) {
  if (!raw) return '';
  let s = raw.replace(/\r\n/g, '\n');
  for (let i = 0; i < 6; i++) {
    const next = s.replace(/\*\*([^*]+)\*\*/g, '$1');
    if (next === s) break;
    s = next;
  }
  s = s.replace(/\*\*/g, '');
  s = s.replace(/^#{1,6}\s+/gm, '');
  s = s.replace(/`+/g, '');
  s = s.replace(/:\s*\*\s+/g, ':\n• ');
  s = s.replace(/^\s*[*-]\s+/gm, '• ');
  s = s.replace(/([.!?])\s*\*\s+/g, '$1\n• ');
  s = normalizeListLineBreaks(s);
  return s.replace(/\n{3,}/g, '\n\n').trim();
}

/*
|--------------------------------------------------------------------------
| RUN
|--------------------------------------------------------------------------
*/

function toUserItem(text, imageDataUrl) {
  if (!imageDataUrl) return user(text);

  return user([
    { type: 'input_text', text },
    { type: 'input_image', image: imageDataUrl, detail: 'auto' },
  ]);
}

function toInputItems(history, text, imageDataUrl) {
  return [
    ...history.map((message) =>
      message.role === 'assistant' ? assistant(message.content) : user(message.content)
    ),
    toUserItem(text, imageDataUrl),
  ];
}

function emptyUsage() {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
}

function addUsage(total, usage) {
  total.inputTokens += Number(usage?.inputTokens) || 0;
  total.outputTokens += Number(usage?.outputTokens) || 0;
  total.totalTokens += Number(usage?.totalTokens) || 0;
}

async function runOnce(agentRunner, agent, input, context, totals) {
  const result = await agentRunner.run(agent, input, {
    context,
    maxTurns: AGENT_MAX_TURNS,
    signal: AbortSignal.timeout(AGENT_TIMEOUT_MS),
  });

  addUsage(totals.usage, result.runContext?.usage);

  for (const item of result.newItems || []) {
    if (item.type === 'tool_call_item' && item.rawItem?.name) {
      totals.toolCalls.push(item.rawItem.name);
    }
  }

  const out = result.finalOutput;
  return typeof out === 'string' ? out.trim() : '';
}

/**
 * Ask AI Guru one question.
 *
 * @param {object} options
 * @param {string} options.instructions  System prompt from buildSystemPrompt
 * @param {{ role: 'user'|'assistant', content: string }[]} options.history  Earlier turns, oldest first
 * @param {string} options.text  The farmer's new message
 * @param {string|null} [options.imageDataUrl]  Optional photo as a data: URL
 * @param {object} options.context  Run context for tools ({ userId, user })
 * @returns {Promise<{ text: string, actions: object[], usage: object, toolCalls: string[], model: string, isError: boolean }>}
 */
export async function askAiGuru({
  instructions,
  history = [],
  text,
  imageDataUrl = null,
  context,
}) {
  const model = resolveModelName();
  const agentRunner = getRunner();
  const totals = { usage: emptyUsage(), toolCalls: [] };
  const runContext = { ...context, actions: [] };

  if (!agentRunner) {
    return {
      text: AI_NOT_CONFIGURED_REPLY,
      actions: [],
      usage: totals.usage,
      toolCalls: [],
      model,
      isError: true,
    };
  }

  const agent = buildAgent(instructions);

  try {
    let raw = await runOnce(
      agentRunner,
      agent,
      toInputItems(history, text, imageDataUrl),
      runContext,
      totals
    );
    let reply = formatPlainFarmerReply(raw);

    if (needsRecoveryReply(reply) || isAccessDisclaimer(reply)) {
      const recoveryAgent = agent.clone({
        instructions: `${instructions}\n\nRECOVERY: ${
          isAccessDisclaimer(reply)
            ? 'Your last answer claimed you lack weather or data access. That is forbidden. Use the tools (get_weather, get_farm_advisory, get_mandi_prices, ...) and answer with concrete actions.'
            : 'Your last answer was incomplete or cut off. Write a full reply: complete sentences, at least 3 sentences. Do not stop mid-phrase.'
        }`,
      });

      raw = await runOnce(
        agentRunner,
        recoveryAgent,
        [toUserItem(text, imageDataUrl)],
        runContext,
        totals
      );
      reply = formatPlainFarmerReply(raw);
    }

    const failed = needsRecoveryReply(reply);

    return {
      text: failed ? INCOMPLETE_REPLY : reply,
      actions: runContext.actions,
      usage: totals.usage,
      toolCalls: totals.toolCalls,
      model,
      isError: failed,
    };
  } catch (error) {
    const cause = error?.cause?.code || error?.cause?.message || error?.code || error?.status || '';

    console.error('[AI Guru] invoke error:', error?.message || error, cause ? `[${cause}]` : '');

    return {
      text: AI_ERROR_REPLY,
      actions: [],
      usage: totals.usage,
      toolCalls: totals.toolCalls,
      model,
      isError: true,
    };
  }
}
