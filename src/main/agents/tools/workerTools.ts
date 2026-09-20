import { z } from 'zod';
import { ProviderTool } from '../../providers/types';

export const WORKER_TOOL_DEFINITIONS = {
  read_file: {
    name: 'read_file',
    description: 'Read a file inside the company workspace (e.g. "notes/strategy.md" or "deliverables/report.md").',
    parameters: z.object({
      path: z.string().describe('Relative file path inside the company workspace'),
    }),
  },
  write_file: {
    name: 'write_file',
    description: 'Write or update a file in the company workspace. Save intermediate findings in notes/... and final user artifacts in deliverables/...',
    parameters: z.object({
      path: z.string().describe('Relative path to save, e.g. "deliverables/newsletter_part1.md"'),
      content: z.string().describe('Text or markdown content to write'),
    }),
  },
  list_files: {
    name: 'list_files',
    description: 'List available files in workspace /notes and /deliverables.',
    parameters: z.object({
      directory: z.enum(['notes', 'deliverables', 'all']).optional().describe('Subdirectory to inspect'),
    }),
  },
  report_result: {
    name: 'report_result',
    description: 'Report the final output of your assigned task back to the CEO for review. You must provide a comprehensive summary and any deliverable file path.',
    parameters: z.object({
      taskId: z.string().describe('The task ID you were assigned to execute'),
      summary: z.string().describe('Executive summary of the completed work and key insights'),
      deliverablePath: z.string().optional().describe('Relative path of the primary deliverable generated in deliverables/, if any'),
      deliverableContent: z.string().optional().describe('Key text or preview of the deliverable output'),
    }),
  },
};

export function getWorkerTools(): ProviderTool[] {
  return Object.values(WORKER_TOOL_DEFINITIONS);
}
