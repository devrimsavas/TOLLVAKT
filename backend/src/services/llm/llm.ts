// Language models, for rewriting searches into the tariff's wording and,
// later, for choosing codes. Locally Ollama, in production the Gemini API.
//
// LLM_PROVIDER=ollama   OLLAMA_HOST, OLLAMA_LLM_MODEL (e.g. gemma4:12b)
// LLM_PROVIDER=gemini   GEMINI_API_KEY, GEMINI_LLM_MODEL
// LLM_PROVIDER=fake     tests only: answers from a function the test sets
//
// Answers are JSON, checked against a schema the caller gives: the model is
// asked for exactly that shape (Ollama "format", Gemini "responseSchema").

const DEFAULT_TIMEOUT_SECONDS = 60;
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

// A JSON schema in the subset both providers accept: objects with required
// string or string-array properties
export interface JsonSchema {
  type: "object";
  properties: Record<string, { type: "string" } | { type: "array"; items: { type: "string" } }>;
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

// Parses the model's text and checks the required properties are there with
// the right types
export function parseJsonAnswer(text: string, schema: JsonSchema, model: string): Record<string, unknown> {
  let data: unknown;
  try {
    data = JSON.parse(extractJsonObject(text));
  } catch {
    throw new LlmError(`${model} did not answer with JSON`);
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new LlmError(`${model} did not answer with a JSON object`);
  }
  const answer = data as Record<string, unknown>;
  for (const key of schema.required) {
    const expected = schema.properties[key]?.type;
    const value = answer[key];
    const ok =
      expected === "array"
        ? Array.isArray(value) && value.every((v) => typeof v === "string")
        : typeof value === "string";
    if (!ok) throw new LlmError(`${model} answered without a valid "${key}"`);
  }
  return answer;
}

async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  timeoutMs: number,
  who: string,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new LlmError(`${who} did not answer within ${timeoutMs / 1000} seconds`);
    }
    throw new LlmError(`${who} could not be reached`);
  }
  if (!response.ok) {
    // 429: the Gemini free tier's limit per minute or per day is used up
    throw new LlmError(`${who} answered ${response.status}`);
  }
  return response.json();
}

export class OllamaLlm implements Llm {
  readonly model: string;

  constructor(
    private readonly host: string,
    private readonly name: string,
    private readonly timeoutMs: number,
  ) {
    this.model = `ollama:${name}`;
  }

  async generateJson({ system, prompt, schema }: JsonRequest): Promise<Record<string, unknown>> {
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
        // The same search should give the same rewrite
        options: { temperature: 0 },
      },
      {},
      this.timeoutMs,
      `Ollama at ${this.host}`,
    )) as { message?: { content?: string } };
    return parseJsonAnswer(data.message?.content ?? "", schema, this.model);
  }
}

export class GeminiLlm implements Llm {
  readonly model: string;

  constructor(
    private readonly apiKey: string,
    private readonly name: string,
    private readonly timeoutMs: number,
  ) {
    this.model = `gemini:${name}`;
  }

  async generateJson({ system, prompt, schema }: JsonRequest): Promise<Record<string, unknown>> {
    const data = (await postJson(
      `${GEMINI_BASE_URL}/models/${encodeURIComponent(this.name)}:generateContent`,
      {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: schema,
          temperature: 0,
        },
      },
      { "x-goog-api-key": this.apiKey },
      this.timeoutMs,
      "Gemini",
    )) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = (data.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? "").join("");
    return parseJsonAnswer(text, schema, this.model);
  }
}

// For tests: answers come from a function the test sets
export class FakeLlm implements Llm {
  readonly model = "fake";
  static answer: (request: JsonRequest) => Record<string, unknown> = () => ({});

  async generateJson(request: JsonRequest): Promise<Record<string, unknown>> {
    return parseJsonAnswer(JSON.stringify(FakeLlm.answer(request)), request.schema, this.model);
  }
}

// The model chosen in the environment, or null when none is set up. Read on
// every call, so tests can set their own values.
export function createLlm(): Llm | null {
  const env = process.env;
  const timeoutMs = Number(env.LLM_TIMEOUT_SECONDS ?? DEFAULT_TIMEOUT_SECONDS) * 1000;

  switch (env.LLM_PROVIDER?.trim()) {
    case "ollama":
      if (!env.OLLAMA_LLM_MODEL) return null;
      return new OllamaLlm(env.OLLAMA_HOST || "http://localhost:11434", env.OLLAMA_LLM_MODEL, timeoutMs);
    case "gemini":
      if (!env.GEMINI_API_KEY || !env.GEMINI_LLM_MODEL) return null;
      return new GeminiLlm(env.GEMINI_API_KEY, env.GEMINI_LLM_MODEL, timeoutMs);
    case "fake":
      return new FakeLlm();
    default:
      return null;
  }
}
