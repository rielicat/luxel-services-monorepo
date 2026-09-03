export abstract class WorkflowEntrypoint<Env = unknown, Params = unknown> {
  protected ctx: unknown;
  protected env: Env;
  constructor(ctx: unknown, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }
  abstract run(event: { payload: Params }, step: unknown): Promise<unknown>;
}

export class NonRetryableError extends Error {}
