import { createHash } from "node:crypto";
import { z } from "zod";
import { InfraiError, infrai } from "./infrai.js";

export const buildEventSchema = z.object({
  user_id: z.string().min(1),
  build_id: z.string().min(1),
  tool: z.enum(["cli", "extension", "api"]),
  result: z.enum(["passed", "failed"]),
});

export const releaseOperationSchema = z.object({
  operation_id: z.string().min(1),
  user_id: z.string().min(1),
  build_id: z.string().min(1),
  experiment_key: z.string().min(1),
});

export const diagnosticSchema = z.object({
  build_id: z.string().min(1),
});

export type Variant = "control" | "candidate";

export function assignVariant(userId: string, experimentKey: string): Variant {
  const digest = createHash("sha256").update(`${experimentKey}:${userId}`).digest();
  const bucket = digest.readUInt32BE(0) % 100;
  return bucket < 50 ? "control" : "candidate";
}

type BuildEvent = z.infer<typeof buildEventSchema> & { received_at: string };
type ReleaseOperation = z.infer<typeof releaseOperationSchema> & {
  variant: Variant;
  flag_value: unknown;
};

export class ReleaseLedger {
  private readonly builds = new Map<string, BuildEvent>();
  private readonly releases = new Map<string, ReleaseOperation>();

  recordBuild(input: unknown): BuildEvent {
    const event = { ...buildEventSchema.parse(input), received_at: new Date().toISOString() };
    this.builds.set(event.build_id, event);
    return event;
  }

  async release(input: unknown): Promise<ReleaseOperation> {
    const request = releaseOperationSchema.parse(input);
    const prior = this.releases.get(request.operation_id);
    if (prior) return prior;
    const build = this.builds.get(request.build_id);
    if (!build || build.result !== "passed") {
      throw new DomainError("A passed build is required before release", 409);
    }

    await infrai.auth.user.get(request.user_id);
    const flagValue = await infrai.flags.get_value(request.experiment_key, "control");
    const operation = {
      ...request,
      variant: assignVariant(request.user_id, request.experiment_key),
      flag_value: flagValue,
    };
    this.releases.set(operation.operation_id, operation);
    return operation;
  }

  diagnostics(input: unknown) {
    const { build_id } = diagnosticSchema.parse(input);
    const build = this.builds.get(build_id);
    const releases = [...this.releases.values()].filter((item) => item.build_id === build_id);
    return { build: build ?? null, releases, release_count: releases.length };
  }
}

export class DomainError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "DomainError";
    this.status = status;
  }
}

export function clientStatus(error: unknown): number {
  if (error instanceof z.ZodError) return 400;
  if (error instanceof DomainError) return error.status;
  if (error instanceof InfraiError && error.status >= 400 && error.status < 500) {
    return error.status;
  }
  return 502;
}
