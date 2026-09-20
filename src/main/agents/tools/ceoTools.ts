import { z } from 'zod';
import { ProviderTool } from '../../providers/types';

export const CEO_TOOL_DEFINITIONS = {
  setup_department: {
    name: 'setup_department',
    description: 'Setup a new department for the company tailored to the objective (e.g. "Marketing & Growth", "Sales & Outreach", "Engineering & Tech", "Product & Design", "Content & Media") with a designated department leader/head.',
    parameters: z.object({
      name: z.string().describe('Name of the department, e.g. "Marketing & Growth", "Sales & Outreach", "Engineering & Tech"'),
      headRole: z.string().describe('Job title of the department leader, e.g. "Head of Marketing", "VP of Sales", "CTO", "Head of Product"'),
      headPrompt: z.string().optional().describe('Custom instructions and strategic responsibilities for the department head'),
      description: z.string().optional().describe('Mission and scope of this department'),
      color: z.enum(['indigo', 'emerald', 'amber', 'rose', 'purple', 'cyan', 'blue']).optional().describe('Visual tag color for this department'),
    }),
  },
  create_task: {
    name: 'create_task',
    description: 'Create a new task with dependencies for the company to execute.',
    parameters: z.object({
      title: z.string().describe('Clear, action-oriented task title (e.g., "Build ATS Parser Engine", "Draft B2B Cold Outreach Sequence")'),
      description: z.string().describe('Thorough and detailed instructions: context, specific requirements, expected deliverable filenames (e.g. in /deliverables), and acceptance criteria. Must NOT just repeat the title.'),
      department: z.string().optional().describe('Target department name or ID for this task'),
      dependencies: z.array(z.string()).optional().describe('List of task IDs that must be completed before this task starts'),
    }),
  },
  hire_agent: {
    name: 'hire_agent',
    description: 'Hire a new specialist agent or team lead for the company roster. Check the existing roster first with check_status; do not hire duplicate roles.',
    parameters: z.object({
      role: z.string().describe('Specific job title, e.g. "Lead SDR", "Copywriter", "Frontend Dev", "SEO Specialist"'),
      prompt: z.string().describe('Precise system prompt defining their responsibilities, output guidelines, and domain'),
      department: z.string().optional().describe('Name or ID of the department this agent belongs to (e.g. "Marketing & Growth", "Sales & Outreach")'),
      reportsTo: z.string().optional().describe('Role or ID of the supervising manager or department head this agent reports to'),
      level: z.enum(['c_level', 'lead', 'specialist']).optional().describe('Seniority level in company hierarchy (default: specialist)'),
      tools: z.array(z.string()).optional().describe('Allowed tools for this agent, e.g. ["read_file", "write_file", "report_result"]'),
    }),
  },
  assign_task: {
    name: 'assign_task',
    description: 'Assign an unassigned or ready task to an existing agent on the roster (by Agent ID or Role title, e.g. "Head of Marketing", "Lead SDR", "CTO").',
    parameters: z.object({
      taskId: z.string().describe('ID or Title of the task to assign'),
      agentId: z.string().describe('ID or Role name of the agent on the roster to assign to'),
    }),
  },
  check_status: {
    name: 'check_status',
    description: 'Check the current task board status, agent roster, pending reviews, and workspace notes.',
    parameters: z.object({}),
  },
  get_result: {
    name: 'get_result',
    description: 'Get the full deliverable and reported result of a completed or in-review task.',
    parameters: z.object({
      taskId: z.string().describe('ID of the task'),
    }),
  },
  review_result: {
    name: 'review_result',
    description: 'Review a submitted task deliverable. Accept it to complete the task, or reject it with specific constructive feedback to request a retry.',
    parameters: z.object({
      taskId: z.string().describe('ID of the task being reviewed'),
      decision: z.enum(['accept', 'reject']).describe('Whether to accept or reject the work'),
      feedback: z.string().describe('Detailed review feedback or approval notes'),
    }),
  },
  pause_agent: {
    name: 'pause_agent',
    description: 'Pause an agent on the roster.',
    parameters: z.object({
      agentId: z.string().describe('ID of the agent to pause'),
    }),
  },
  update_goal_plan: {
    name: 'update_goal_plan',
    description: 'Update the overarching plan summary and strategy towards the company goal.',
    parameters: z.object({
      planSummary: z.string().describe('Updated high-level plan and next milestones'),
    }),
  },
  write_memory: {
    name: 'write_memory',
    description: 'Write a shared memory note into company knowledge for workers to consult.',
    parameters: z.object({
      title: z.string().describe('Title of the note'),
      content: z.string().describe('Markdown note contents'),
      tags: z.array(z.string()).optional().describe('Searchable topic tags'),
    }),
  },
  request_approval: {
    name: 'request_approval',
    description: 'Pause execution and request explicit user approval before proceeding with a sensitive, expensive, or irreversible action.',
    parameters: z.object({
      reason: z.string().describe('Why user permission is needed'),
      action: z.string().describe('The proposed action to be approved'),
    }),
  },
  finish: {
    name: 'finish',
    description: 'Call when all tasks are reviewed and the primary company goal deliverable is ready.',
    parameters: z.object({
      summary: z.string().describe('Final summary of accomplishments, deliverables produced, and recommended next steps for the user'),
    }),
  },
};

export function getCeoTools(): ProviderTool[] {
  return Object.values(CEO_TOOL_DEFINITIONS);
}
