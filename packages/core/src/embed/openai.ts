import type { EmbeddingProvider } from '../types.js';

/**
 * OpenAI embedding provider. Optional. Requires OPENAI_API_KEY in env or
 * passed to the constructor. Falls back to throwing if unconfigured to make
 * misconfiguration loud rather than silent.
 *
 * Default model: text-embedding-3-small (1536 dim, cheap, strong).
 * Override via the `model` option.
 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly id: string;
  readonly dimensions: number;
  private apiKey: string;
  private model: string;
  private endpoint: string;

  constructor(opts: {
    apiKey?: string;
    model?: string;
    dimensions?: number;
    endpoint?: string;
  } = {}) {
    const key = opts.apiKey ?? process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error(
        'OpenAIEmbeddingProvider requires an apiKey or OPENAI_API_KEY env var'
      );
    }
    this.apiKey = key;
    this.model = opts.model ?? 'text-embedding-3-small';
    this.dimensions = opts.dimensions ?? 1536;
    this.endpoint = opts.endpoint ?? 'https://api.openai.com/v1/embeddings';
    this.id = `openai-${this.model}-${this.dimensions}`;
  }

  async embed(text: string): Promise<number[]> {
    const [vec] = await this.embedBatch([text]);
    return vec;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
        dimensions: this.dimensions
      })
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI embeddings failed: ${res.status} ${text}`);
    }
    const data = (await res.json()) as { data: { embedding: number[] }[] };
    return data.data.map((d) => d.embedding);
  }
}
