// Language models, for rewriting searches into the tariff's wording and,
// later, for choosing codes. Locally Ollama, in production the Gemini API.
//
// LLM_PROVIDER=ollama   OLLAMA_HOST, OLLAMA_LLM_MODEL (e.g. gemma4:12b),
//                       OLLAMA_NUM_CTX (context window in tokens, default 16384)
// LLM_PROVIDER=gemini   GEMINI_API_KEY, GEMINI_LLM_MODEL,
//                       GEMINI_THINKING_LEVEL (e.g. low; empty = the model's default)
// LLM_PROVIDER=fake     tests only: answers from a function the test sets
//
// Answers are JSON, checked against a schema the caller gives: the model is
// asked for exactly that shape (Ollama "format", Gemini "responseSchema").

import { providerSetupProblem } from "../../config/providerSettings.js";
import { postJsonWithRetry } from "../http.js";

const DEFAULT_TIMEOUT_SECONDS = 60;
// Ollama gives a model only 4096 tokens of context unless asked for more;
// a classification prompt with 20 tariff paths and the answer need more,
// and a cut prompt or answer comes back as broken JSON
const DEFAULT_OLLAMA_NUM_CTX = 16384;
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

// A JSON schema in the subset both providers accept: objects, arrays,
// strings (optionally from a fixed list) and nesting of these
export type JsonSchemaNode =
  | { type: "string"; enum?: string[] }
  | { type: "array"; items: JsonSchemaNode }
  | JsonSchema;

export interface JsonSchema {
  type: "object";
  properties: Record<string, JsonSchemaNode>;
  required: string[];
}

export interface JsonRequest {
  system: string;
  prompt: string;
  schema: JsonSchema;
}

export interface Llm {
  // e.g. "ollama:gemma4:12b"
  readonly model: string;
  generateJson(request: JsonRequest): Promise<Record<string, unknown>>;
}

// The model could not be reached or gave an unusable answer
export class LlmError extends Error {}

// Models sometimes wrap JSON in a Markdown code fence or add a sentence
// around it, even when asked for JSON only: take the outermost {...}
export function extractJsonObject(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start !== -1 && end > start ? text.slice(start, end + 1) : text;
}

// Checks a value against the schema; returns the path of the first problem
function findProblem(
  value: unknown,
  schema: JsonSchemaNode,
  path: string,
): string | null {
  switch (schema.type) {
    case "string":
      if (typeof value !== "string") return path;
      return schema.enum && !schema.enum.includes(value) ? path : null;
    case "array":
      if (!Array.isArray(value)) return path;
      for (const [index, item] of value.entries()) {
        const problem = findProblem(item, schema.items, `${path}[${index}]`);
        if (problem) return problem;
      }
      return null;
    case "object": {
      if (typeof value !== "object" || value === null || Array.isArray(value))
        return path;
      const record = value as Record<string, unknown>;
      for (const key of schema.required) {
        const property = schema.properties[key];
        const problem = property
          ? findProblem(record[key], property, path ? `${path}.${key}` : key)
          : null;
        if (problem) return problem;
      }
      return null;
    }
  }
}

// Parses the model's text and checks it against the schema
export function parseJsonAnswer(
  text: string,
  schema: JsonSchema,
  model: string,
  // Why the model stopped, as the provider reports it ("length" when the
  // answer was cut off)
  stopReason?: string,
): Record<string, unknown> {
  let data: unknown;
  try {
    data = JSON.parse(extractJsonObject(text));
  } catch {
    const why =
      stopReason && !["stop", "STOP"].includes(stopReason)
        ? ` (stopped: ${stopReason})`
        : "";
    throw new LlmError(`${model} did not answer with JSON${why}`);
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new LlmError(`${model} did not answer with a JSON object`);
  }
  const problem = findProblem(data, schema, "");
  if (problem)
    throw new LlmError(`${model} answered without a valid "${problem}"`);
  return data as Record<string, unknown>;
}

// Attempts per request: a small local model now and then answers with
// something that is not the asked JSON; a second try usually works
const ATTEMPTS = 2;

export async function generateJsonWithRetry(
  llm: Llm,
  request: JsonRequest,
): Promise<Record<string, unknown>> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await llm.generateJson(request);
    } catch (error) {
      if (!(error instanceof LlmError) || attempt >= ATTEMPTS) throw error;
    }
  }
}

function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  timeoutMs: number,
  who: string,
): Promise<unknown> {
  return postJsonWithRetry(
    url,
    body,
    headers,
    timeoutMs,
    who,
    (message) => new LlmError(message),
  );
}

export class OllamaLlm implements Llm {
  readonly model: string;

  constructor(
    private readonly host: string,
    private readonly name: string,
    private readonly timeoutMs: number,
    private readonly numCtx: number = DEFAULT_OLLAMA_NUM_CTX,
  ) {
    this.model = `ollama:${name}`;
  }

  async generateJson({
    system,
    prompt,
    schema,
  }: JsonRequest): Promise<Record<string, unknown>> {
    const data = (await postJson(
      `${this.host.replace(/\/+$/, "")}/api/chat`,
      {
        model: this.name,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        format: schema,
        stream: false,
        // The same request should give the same answer
        options: { temperature: 0, num_ctx: this.numCtx },
      },
      {},
      this.timeoutMs,
      `Ollama at ${this.host}`,
    )) as { message?: { content?: string }; done_reason?: string };
    return parseJsonAnswer(
      data.message?.content ?? "",
      schema,
      this.model,
      data.done_reason,
    );
  }
}

export class GeminiLlm implements Llm {
  readonly model: string;

  constructor(
    private readonly apiKey: string,
    private readonly name: string,
    private readonly timeoutMs: number,
    // How much the model thinks before answering; "low" is faster and
    // cheaper, and enough for choosing among given candidates
    private readonly thinkingLevel?: string,
  ) {
    this.model = `gemini:${name}`;
  }

  async generateJson({
    system,
    prompt,
    schema,
  }: JsonRequest): Promise<Record<string, unknown>> {
    const data = (await postJson(
      `${GEMINI_BASE_URL}/models/${encodeURIComponent(this.name)}:generateContent`,
      {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: schema,
          temperature: 0,
          ...(this.thinkingLevel
            ? { thinkingConfig: { thinkingLevel: this.thinkingLevel } }
            : {}),
        },
      },
      { "x-goog-api-key": this.apiKey },
      this.timeoutMs,
      "Gemini",
    )) as {
      candidates?: {
        content?: { parts?: { text?: string }[] };
        finishReason?: string;
      }[];
    };
    const candidate = data.candidates?.[0];
    const text = (candidate?.content?.parts ?? [])
      .map((part) => part.text ?? "")
      .join("");
    return parseJsonAnswer(text, schema, this.model, candidate?.finishReason);
  }
}

// For tests: answers come from a function the test sets
export class FakeLlm implements Llm {
  readonly model = "fake";
  static answer: (request: JsonRequest) => Record<string, unknown> = () => ({});

  async generateJson(request: JsonRequest): Promise<Record<string, unknown>> {
    return parseJsonAnswer(
      JSON.stringify(FakeLlm.answer(request)),
      request.schema,
      this.model,
    );
  }
}

// The settings each provider needs, besides LLM_PROVIDER itself
const LLM_SETTINGS = {
  ollama: ["OLLAMA_LLM_MODEL"],
  gemini: ["GEMINI_API_KEY", "GEMINI_LLM_MODEL"],
};

// Why createLlm() returns null, for the error message
export function llmSetupProblem(): string {
  return providerSetupProblem("LLM_PROVIDER", LLM_SETTINGS);
}

// The model chosen in the environment, or null when none is set up. Read on
// every call, so tests can set their own values.
export function createLlm(): Llm | null {
  const env = process.env;
  const timeoutMs =
    Number(env.LLM_TIMEOUT_SECONDS ?? DEFAULT_TIMEOUT_SECONDS) * 1000;

  switch (env.LLM_PROVIDER?.trim()) {
    case "ollama":
      if (!env.OLLAMA_LLM_MODEL) return null;
      return new OllamaLlm(
        env.OLLAMA_HOST || "http://localhost:11434",
        env.OLLAMA_LLM_MODEL,
        timeoutMs,
        Number(env.OLLAMA_NUM_CTX) || DEFAULT_OLLAMA_NUM_CTX,
      );
    case "gemini":
      if (!env.GEMINI_API_KEY || !env.GEMINI_LLM_MODEL) return null;
      return new GeminiLlm(
        env.GEMINI_API_KEY,
        env.GEMINI_LLM_MODEL,
        timeoutMs,
        env.GEMINI_THINKING_LEVEL?.trim() || undefined,
      );
    case "fake":
      return new FakeLlm();
    default:
      return null;
  }
}
