import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import { REVIEW_MAX_ATTEMPTS } from '@luxel/shared/cleaning-review';
import {
  isRunId,
  isTerminal,
  runReviewAttempt,
  type CleaningReviewParams,
  type ReviewEnv,
} from './review';

const STEP_CONFIG = {
  retries: {
    limit: REVIEW_MAX_ATTEMPTS + 1,
    delay: '30 seconds',
    backoff: 'exponential',
  },
  timeout: '5 minutes',
} as const;

export class CleaningReviewWorkflow extends WorkflowEntrypoint<ReviewEnv, CleaningReviewParams> {
  override async run(
    event: Readonly<WorkflowEvent<CleaningReviewParams>>,
    step: WorkflowStep,
  ): Promise<{ runId: string; status: string }> {
    const runId = event.payload.runId;
    if (!isRunId(runId)) return { runId: '', status: 'unknown' };

    const status = await step.do('compare-walkthrough', STEP_CONFIG, async () => {
      const outcome = await runReviewAttempt(this.env, runId);
      if (!outcome) throw new Error('review_unreachable');
      if (!isTerminal(outcome)) throw new Error(`review_${outcome}`);
      return outcome;
    });

    return { runId, status };
  }
}
