import { z } from 'zod';
import { ModelInfo } from '../../shared/types';

export interface ProviderChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    args: Record<string, unknown>;
  }>;
}

export interface ProviderTool {
  name: string;
  description: string;
  parameters: z.ZodTypeAny;
}

export interface ProviderChatOptions {
  model: string;
  temperature?: number;
  maxTokens?: number;
  abortSignal?: AbortSignal;
  onToken?: (token: string) => void;
  onToolCall?: (toolCall: { id: string; name: string; args: Record<string, unknown> }) => void;
}

export interface ProviderChatResult {
  text: string;
  toolCalls: Array<{
    id: string;
    name: string;
    args: Record<string, unknown>;
  }>;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface IProviderAdapter {
  providerType: string;
  chat(
    messages: ProviderChatMessage[],
    tools: ProviderTool[],
    options: ProviderChatOptions
  ): Promise<ProviderChatResult>;
  testConnection(model?: string): Promise<{ success: boolean; latencyMs?: number; error?: string }>;
}
