import { defineSchedule } from 'eve/schedules';
import { distillPending } from '@luxel/core/agent/distill';

export default defineSchedule({
  cron: '0 6 * * *',
  run({ waitUntil }) {
    waitUntil(
      distillPending().then((result) => {
        console.warn('agent.distilled', result);
      }),
    );
  },
});
