import { ModelInfo } from './types';

export const BUILTIN_MODELS: ModelInfo[] = [
  // Anthropic
  {
    id: 'claude-3-5-sonnet-20241022',
    name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    supportsToolCalling: true,
    contextWindow: 200000,
    isLocal: false,
    description: 'Premier coding, reasoning and agent orchestration model',
  },
  {
    id: 'claude-3-5-haiku-20241022',
    name: 'Claude 3.5 Haiku',
    provider: 'anthropic',
    supportsToolCalling: true,
    contextWindow: 200000,
    isLocal: false,
    description: 'Fast, lightweight worker model',
  },
  // OpenAI
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    supportsToolCalling: true,
    contextWindow: 128000,
    isLocal: false,
    description: 'High-capability multi-modal reasoning and tool calling',
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    supportsToolCalling: true,
    contextWindow: 128000,
    isLocal: false,
    description: 'Cost-effective high-throughput worker model',
  },
  // Google
  {
    id: 'gemini-1.5-flash',
    name: 'Gemini 1.5 Flash',
    provider: 'google',
    supportsToolCalling: true,
    contextWindow: 1000000,
    isLocal: false,
    description: 'Fast, cost-effective high-throughput worker model',
  },
  {
    id: 'gemini-1.5-pro',
    name: 'Gemini 1.5 Pro',
    provider: 'google',
    supportsToolCalling: true,
    contextWindow: 1000000,
    isLocal: false,
    description: 'Ultra-long context and complex reasoning',
  },
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    provider: 'google',
    supportsToolCalling: true,
    contextWindow: 1000000,
    isLocal: false,
    description: 'Next-gen fast multimodal reasoning model',
  },
  // Local (Ollama)
  {
    id: 'qwen2.5-coder:7b',
    name: 'Qwen 2.5 Coder 7B (Local)',
    provider: 'openai-compatible',
    supportsToolCalling: true,
    contextWindow: 32768,
    isLocal: true,
    description: 'Local code generation and tool calling specialist',
  },
  {
    id: 'llama3.1:8b',
    name: 'Llama 3.1 8B (Local)',
    provider: 'openai-compatible',
    supportsToolCalling: true,
    contextWindow: 128000,
    isLocal: true,
    description: 'Versatile general-purpose local agent model',
  },
  {
    id: 'mistral:7b',
    name: 'Mistral 7B (Local)',
    provider: 'openai-compatible',
    supportsToolCalling: true,
    contextWindow: 32768,
    isLocal: true,
    description: 'Fast local reasoning model',
  },
  // OpenRouter Models
  {
    id: 'deepseek/deepseek-chat',
    name: 'DeepSeek V3 (OpenRouter)',
    provider: 'openrouter',
    supportsToolCalling: true,
    contextWindow: 64000,
    isLocal: false,
    description: 'Premier low-cost, ultra-high capability reasoning & coding model',
  },
  {
    id: 'deepseek/deepseek-r1',
    name: 'DeepSeek R1 (OpenRouter)',
    provider: 'openrouter',
    supportsToolCalling: true,
    contextWindow: 64000,
    isLocal: false,
    description: 'State-of-the-art open reasoning model with chain-of-thought excellence',
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct',
    name: 'Llama 3.3 70B Instruct (OpenRouter)',
    provider: 'openrouter',
    supportsToolCalling: true,
    contextWindow: 131072,
    isLocal: false,
    description: 'Meta flagship open model with exceptional multi-agent tool execution',
  },
  {
    id: 'anthropic/claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet (OpenRouter)',
    provider: 'openrouter',
    supportsToolCalling: true,
    contextWindow: 200000,
    isLocal: false,
    description: 'Industry benchmark reasoning & coding via OpenRouter',
  },
  {
    id: 'google/gemini-2.0-flash-001',
    name: 'Gemini 2.0 Flash (OpenRouter)',
    provider: 'openrouter',
    supportsToolCalling: true,
    contextWindow: 1000000,
    isLocal: false,
    description: 'Google Gemini 2.0 Flash via OpenRouter (bypasses direct Google quota limits)',
  },
  {
    id: 'qwen/qwen-2.5-coder-32b-instruct',
    name: 'Qwen 2.5 Coder 32B (OpenRouter)',
    provider: 'openrouter',
    supportsToolCalling: true,
    contextWindow: 32768,
    isLocal: false,
    description: 'Top-tier code specialist model via OpenRouter',
  }
];

export const MODEL_PRICING: Record<string, { promptPerM: number; completionPerM: number }> = {
  'claude-3-5-sonnet-20241022': { promptPerM: 3.0, completionPerM: 15.0 },
  'claude-3-5-haiku-20241022': { promptPerM: 0.8, completionPerM: 4.0 },
  'gpt-4o': { promptPerM: 2.5, completionPerM: 10.0 },
  'gpt-4o-mini': { promptPerM: 0.15, completionPerM: 0.6 },
  'gemini-1.5-pro': { promptPerM: 1.25, completionPerM: 5.0 },
  'gemini-1.5-flash': { promptPerM: 0.075, completionPerM: 0.3 },
  'gemini-2.0-flash': { promptPerM: 0.10, completionPerM: 0.4 },
  'gemini-1.5-pro-latest': { promptPerM: 1.25, completionPerM: 5.0 },
  'gemini-1.5-flash-latest': { promptPerM: 0.075, completionPerM: 0.3 },
  // OpenRouter models
  'deepseek/deepseek-chat': { promptPerM: 0.14, completionPerM: 0.28 },
  'deepseek/deepseek-r1': { promptPerM: 0.55, completionPerM: 2.19 },
  'meta-llama/llama-3.3-70b-instruct': { promptPerM: 0.12, completionPerM: 0.30 },
  'anthropic/claude-3.5-sonnet': { promptPerM: 3.0, completionPerM: 15.0 },
  'google/gemini-2.0-flash-001': { promptPerM: 0.10, completionPerM: 0.40 },
  'qwen/qwen-2.5-coder-32b-instruct': { promptPerM: 0.18, completionPerM: 0.18 },
  // Local models are free
  'qwen2.5-coder:7b': { promptPerM: 0, completionPerM: 0 },
  'llama3.1:8b': { promptPerM: 0, completionPerM: 0 },
  'mistral:7b': { promptPerM: 0, completionPerM: 0 },
};

export const DEFAULT_LIMITS = {
  MAX_AGENTS: 5,
  MAX_SPAWN_DEPTH: 2,
  MAX_STEPS_PER_AGENT: 25,
  MAX_RETRIES_PER_TASK: 2,
  DEFAULT_TOKEN_BUDGET: 500_000,
  DEFAULT_BUDGET_PER_RUN: 5.0, // $5 USD
  DEFAULT_BUDGET_MONTHLY: 50.0, // $50 USD
  APPROVAL_AGENT_THRESHOLD: 4, // Require approval when hiring beyond 4 agents
};

export const COMPANY_TEMPLATES = {
  startup: {
    id: 'startup',
    name: 'Tech Startup',
    description: 'Build an MVP, conduct competitive research, and formulate a go-to-market plan.',
    ceoPrompt: `You are the visionary CEO of a fast-moving Tech Startup.
Your mission is to guide the company from idea to viable MVP deliverable.
You organize work systematically:
1. Break goals down into market research, architecture design, MVP code, and launch positioning.
2. Check existing roster before hiring new talent.
3. Delegate tasks to specialized workers (e.g. Lead Researcher, Full-Stack Engineer, Product Marketer).
4. Rigorously review every worker deliverable before accepting.
5. Save key findings to /notes and final output to /deliverables.`,
  },
  content_studio: {
    id: 'content_studio',
    name: 'Content & Media Studio',
    description: 'Plan, research, draft, edit, and publish high-impact newsletters, articles, and media.',
    ceoPrompt: `You are the Editor-in-Chief and CEO of a high-production Content Studio.
Your mission is to produce authoritative, engaging publications and deliverables.
You organize work methodically:
1. Outline the content strategy and editorial schedule.
2. Hire or assign dedicated Topic Researchers, Copywriters, and Fact-Checkers.
3. Review drafted content for voice, accuracy, structure, and readability.
4. Ensure final newsletters or articles are written into /deliverables.`,
  },
  software_agency: {
    id: 'software_agency',
    name: 'Software Agency',
    description: 'Deliver production-ready client specifications, software designs, and code.',
    ceoPrompt: `You are the Managing Director and CEO of an agile Software Development Agency.
Your mission is to turn client requirements into robust, high-quality software specifications and deliverables.
You organize work rigorously:
1. Break the client goal into technical architecture, core implementation, documentation, and QA checklists.
2. Delegate to Software Architects, Developers, and QA Testers.
3. Review all code and deliverables against high reliability standards.`,
  },
  custom: {
    id: 'custom',
    name: 'Custom Enterprise',
    description: 'A flexible corporate structure customized to your specific workflow.',
    ceoPrompt: `You are the CEO and Operational Leader of this venture.
Your goal is to execute the company vision autonomously, efficiently, and transparently.
Delegate tasks, hire appropriate specialists, review outcomes, and present polished deliverables.`,
  }
};
