import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import type { InviteRunSummary } from '@luxel/shared/hospitable-invite';
import { closeSession, openSession } from './firecrawl';
import {
  fetchInviteQueue,
  inviteConfigured,
  inviteEntryUrl,
  postDelivery,
  probeAuth,
  sendInvite,
  signIn,
  verifyInvite,
  type InviteEnv,
  type InviteParams,
} from './invite';

const QUEUE_STEP = {
  retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' },
  timeout: '1 minute',
} as const;

const OPEN_STEP = {
  retries: { limit: 2, delay: '30 seconds', backoff: 'exponential' },
  timeout: '4 minutes',
} as const;

const AUTH_STEP = {
  retries: { limit: 1, delay: '30 seconds', backoff: 'constant' },
  timeout: '6 minutes',
} as const;

const ACTION_STEP = {
  retries: { limit: 1, delay: '20 seconds', backoff: 'constant' },
  timeout: '6 minutes',
} as const;

const DELIVER_STEP = {
  retries: { limit: 3, delay: '15 seconds', backoff: 'exponential' },
  timeout: '1 minute',
} as const;

const CLOSE_STEP = {
  retries: { limit: 2, delay: '5 seconds', backoff: 'constant' },
  timeout: '1 minute',
} as const;

export class HospitableInviteWorkflow extends WorkflowEntrypoint<InviteEnv, InviteParams> {
  override async run(
    _event: Readonly<WorkflowEvent<InviteParams>>,
    step: WorkflowStep,
  ): Promise<InviteRunSummary> {
    if (!inviteConfigured(this.env)) {
      return { status: 'unconfigured', attempted: 0, delivered: 0 };
    }

    const targets = await step.do('read-queue', QUEUE_STEP, () => fetchInviteQueue(this.env));
    if (!targets.length) return { status: 'idle', attempted: 0, delivered: 0 };

    const scrapeId = await step.do('open-session', OPEN_STEP, async () => {
      const id = await openSession(this.env, inviteEntryUrl(this.env));
      if (!id) throw new Error('session_unavailable');
      return id;
    });

    let delivered = 0;
    try {
      const auth = await step.do('sign-in', AUTH_STEP, async () => {
        const first = await probeAuth(this.env, scrapeId);
        if (first === 'signed_in' || first === 'mfa_required') return first;
        return signIn(this.env, scrapeId);
      });

      if (auth !== 'signed_in') {
        console.error('onboarding.invite_blocked', { reason: auth, waiting: targets.length });
        return { status: 'blocked', reason: auth, attempted: 0, delivered: 0 };
      }

      for (const [index, target] of targets.entries()) {
        const attempt = await step.do(`send-invite-${index}`, ACTION_STEP, () =>
          sendInvite(this.env, scrapeId, target),
        );
        if (attempt === 'failed') {
          console.error('onboarding.invite_refused', { customerId: target.customerId });
          continue;
        }

        const present = await step.do(`verify-invite-${index}`, ACTION_STEP, () =>
          verifyInvite(this.env, scrapeId, target),
        );
        if (!present) {
          console.error('onboarding.invite_unverified', { customerId: target.customerId });
          continue;
        }

        const recorded = await step.do(`record-invite-${index}`, DELIVER_STEP, () =>
          postDelivery(this.env, target.customerId),
        );
        if (recorded) delivered += 1;
      }
    } finally {
      await step.do('close-session', CLOSE_STEP, () => closeSession(this.env, scrapeId));
    }

    return { status: 'ran', attempted: targets.length, delivered };
  }
}
