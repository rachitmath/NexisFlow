import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText, tool as createTool } from 'ai';
import {
  IProviderAdapter,
  ProviderChatMessage,
  ProviderChatOptions,
  ProviderChatResult,
  ProviderTool
} from '../types';

export class GoogleAdapter implements IProviderAdapter {
  public providerType = 'google';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private getClient() {
    return createGoogleGenerativeAI({
      apiKey: this.apiKey,
    });
  }

  public async chat(
    messages: ProviderChatMessage[],
    tools: ProviderTool[],
    options: ProviderChatOptions
  ): Promise<ProviderChatResult> {
    const google = this.getClient();

    const toolsMap: Record<string, any> = {};
    for (const t of tools) {
      toolsMap[t.name] = createTool({
        description: t.description,
        parameters: t.parameters as any,
        execute: async () => ({ status: 'acknowledged' }),
      } as any);
    }

    // Separate system messages from user/assistant/tool messages
    const systemParts = messages.filter(m => m.role === 'system').map(m => m.content);
    const systemPrompt = systemParts.length > 0 ? systemParts.join('\n\n') : undefined;
    const nonSystemMessages = messages.filter(m => m.role !== 'system');

    // Vercel AI SDK requires at least one message in messages array
    if (nonSystemMessages.length === 0) {
      nonSystemMessages.push({
        role: 'user',
        content: 'Please proceed with your task according to your system instructions.',
      });
    }

    const coreMessages: any[] = nonSystemMessages.map((m, idx) => {
      if (m.role === 'tool') {
        let toolName = m.name;
        if (!toolName && m.toolCallId) {
          for (let i = idx - 1; i >= 0; i--) {
            const prev = nonSystemMessages[i];
            if (prev.role === 'assistant' && prev.toolCalls) {
              const matched = prev.toolCalls.find(tc => tc.id === m.toolCallId);
              if (matched) {
                toolName = matched.name;
                break;
              }
            }
          }
        }
        const stringVal = typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '');
        return {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: m.toolCallId || 'call_default',
              toolName: toolName || 'tool',
              output: {
                type: 'text',
                value: stringVal,
              },
            }
          ]
        };
      }
      if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
        return {
          role: 'assistant',
          content: [
            ...(m.content ? [{ type: 'text', text: m.content }] : []),
            ...m.toolCalls.map(tc => ({
              type: 'tool-call',
              toolCallId: tc.id,
              toolName: tc.name,
              input: tc.args ?? {},
              providerOptions: {
                google: {
                  thoughtSignature: (tc as any).thoughtSignature || 'skip_thought_signature_validator',
                }
              }
            }))
          ]
        };
      }
      return {
        role: m.role,
        content: m.content,
      };
    });

    const requestedModel = options.model?.trim() || 'gemini-2.0-flash';
    const candidates = [
      requestedModel,
      requestedModel.replace(/-latest$/, ''),
      'gemini-2.0-flash',
      'gemini-1.5-flash',
      'gemini-1.5-pro'
    ].filter((v, i, a) => a.indexOf(v) === i);

    let lastErr: any = null;

    for (const cand of candidates) {
      try {
        const model = google(cand);
        const result = streamText({
          model,
          system: systemPrompt,
          allowSystemInMessages: true,
          messages: coreMessages,
          tools: Object.keys(toolsMap).length > 0 ? toolsMap : undefined,
          temperature: options.temperature ?? 0.7,
          abortSignal: options.abortSignal,
        });

        let fullText = '';
        const toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> = [];

        for await (const chunk of result.fullStream) {
          if (chunk.type === 'error') {
            const err = (chunk as any).error;
            const msg = err?.message || (typeof err === 'string' ? err : 'Google AI stream error occurred.');
            throw new Error(msg);
          } else if (chunk.type === 'text-delta') {
            const delta = (chunk as any).text || (chunk as any).textDelta || '';
            fullText += delta;
            if (options.onToken) {
              options.onToken(delta);
            }
          } else if (chunk.type === 'tool-call') {
            const thoughtSig = (chunk as any).providerMetadata?.google?.thoughtSignature ||
                               (chunk as any).thoughtSignature;
            const tc = {
              id: (chunk as any).toolCallId,
              name: (chunk as any).toolName,
              args: ((chunk as any).input || (chunk as any).args || {}) as Record<string, unknown>,
              thoughtSignature: thoughtSig,
            };
            toolCalls.push(tc);
            if (options.onToolCall) {
              options.onToolCall(tc);
            }
          }
        }

        const usage = await result.usage;
        const promptTokens = usage?.inputTokens ?? (usage as any)?.promptTokens ?? 0;
        const completionTokens = usage?.outputTokens ?? (usage as any)?.completionTokens ?? 0;
        const totalTokens = usage?.totalTokens ?? (promptTokens + completionTokens);

        return {
          text: fullText,
          toolCalls,
          usage: {
            promptTokens,
            completionTokens,
            totalTokens,
          },
        };
      } catch (err: any) {
        lastErr = err;
        const msg = (err?.message || '').toLowerCase();
        if (msg.includes('404') || msg.includes('not found') || msg.includes('unsupported') || msg.includes('models/')) {
          continue;
        }

        // Automatic Google AI Studio Free-Tier Rate Limit (429 / Quota Exceeded) Handling
        if (msg.includes('quota') || msg.includes('rate') || msg.includes('429') || msg.includes('resource_exhausted')) {
          const retryMatch = (err?.message || '').match(/retry in\s+([\d.]+)\s*s/i);
          const waitSec = retryMatch ? Math.min(Math.ceil(parseFloat(retryMatch[1])) + 1, 10) : 6;
          console.warn(`[GoogleAdapter] Free-tier rate limit reached on ${cand}. Waiting ${waitSec}s before retrying/fallback...`);
          
          if (!options.abortSignal?.aborted) {
            await new Promise(resolve => setTimeout(resolve, waitSec * 1000));
            continue;
          }
        }

        throw err;
      }
    }

    throw lastErr || new Error('Google AI failed to stream response.');
  }

  public async testConnection(modelId?: string): Promise<{ success: boolean; latencyMs?: number; error?: string }> {
    const start = Date.now();
    const candidates = modelId && modelId.trim()
      ? [modelId.trim().replace(/-latest$/, '')]
      : ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro'];

    let lastError = '';
    for (const m of candidates) {
      try {
        await this.chat(
          [{ role: 'user', content: 'Say ok' }],
          [],
          { model: m, maxTokens: 10 }
        );
        return {
          success: true,
          latencyMs: Date.now() - start,
        };
      } catch (err: any) {
        lastError = err?.message || 'Failed to connect to Google AI';
      }
    }

    return {
      success: false,
      error: lastError,
    };
  }
}
