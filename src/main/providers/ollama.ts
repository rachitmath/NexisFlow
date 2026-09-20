import { ModelInfo } from '../../shared/types';

export interface OllamaModelTag {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details?: {
    format: string;
    family: string;
    parameter_size: string;
    quantization_level: string;
  };
}

export class OllamaDetector {
  private defaultBaseUrl: string;

  constructor(baseUrl: string = 'http://localhost:11434') {
    this.defaultBaseUrl = baseUrl.replace(/\/v1\/?$/, '');
  }

  public async detect(): Promise<{ online: boolean; models: ModelInfo[]; rawTags?: OllamaModelTag[] }> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const res = await fetch(`${this.defaultBaseUrl}/api/tags`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        return { online: false, models: [] };
      }

      const data = await res.json() as { models?: OllamaModelTag[] };
      const rawTags = data.models || [];

      const models: ModelInfo[] = rawTags.map(tag => {
        const nameLower = tag.name.toLowerCase();
        // Ollama models with known high-quality tool calling capabilities
        const supportsToolCalling = (
          nameLower.includes('qwen2.5') ||
          nameLower.includes('llama3.1') ||
          nameLower.includes('mistral') ||
          nameLower.includes('command-r') ||
          nameLower.includes('deepseek')
        );

        return {
          id: tag.name,
          name: `${tag.name} (Local)`,
          provider: 'openai-compatible',
          supportsToolCalling,
          contextWindow: nameLower.includes('llama3.1') ? 128000 : 32768,
          isLocal: true,
          description: `Local Ollama model (${(tag.size / (1024 * 1024 * 1024)).toFixed(1)} GB)`,
        };
      });

      return { online: true, models, rawTags };
    } catch {
      return { online: false, models: [] };
    }
  }
}
