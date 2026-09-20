import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText, tool as createTool } from 'ai';
import {
  IProviderAdapter,
  ProviderChatMessage,
  ProviderChatOptions,
  ProviderChatResult,
  ProviderTool
} from '../types';

export class AnthropicAdapter implements IProviderAdapter {
  public providerType = 'anthropic';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private getClient() {
    return createAnthropic({
      apiKey: this.apiKey,
    });
  }

  public async chat(
    messages: ProviderChatMessage[],
    tools: ProviderTool[],
    options: ProviderChatOptions
  ): Promise<ProviderChatResult> {
    const anthropic = this.getClient();
    const model = anthropic(options.model || 'claude-3-5-sonnet-20241022');

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
            }))
          ]
        };
      }
      return {
        role: m.role,
        content: m.content,
      };
    });

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
        const msg = err?.message || (typeof err === 'string' ? err : 'Anthropic stream error occurred.');
        throw new Error(msg);
      } else if (chunk.type === 'text-delta') {
        const delta = (chunk as any).text || (chunk as any).textDelta || '';
        fullText += delta;
        if (options.onToken) {
          options.onToken(delta);
        }
      } else if (chunk.type === 'tool-call') {
        const tc = {
          id: (chunk as any).toolCallId,
          name: (chunk as any).toolName,
          args: ((chunk as any).input || (chunk as any).args || {}) as Record<string, unknown>,
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
  }

  public async testConnection(modelId: string = 'claude-3-5-haiku-20241022'): Promise<{ success: boolean; latencyMs?: number; error?: string }> {
    const start = Date.now();
    try {
      await this.chat(
        [{ role: 'user', content: 'Say ok' }],
        [],
        { model: modelId, maxTokens: 10 }
      );
      return {
        success: true,
        latencyMs: Date.now() - start,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Failed to connect to Anthropic',
      };
    }
  }
}
