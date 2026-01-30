export type RunStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELED";

export type RunRecord = {
  runId: string;
  jobId: string;
  status: RunStatus;
  progress: { pct: number; stage: string };
  startedAt?: string;
  finishedAt?: string | null;
  errors: Array<{ code: string; message: string; details?: Record<string, unknown> }>;
  validation: any | null;
  findings: any | null;
  diffsets: any[];
};

const runs = new Map<string, RunRecord>();

export function putRun(run: RunRecord) {
  runs.set(run.runId, run);
}

export function getRun(runId: string): RunRecord | undefined {
  return runs.get(runId);
}

export function updateRun(runId: string, patch: Partial<RunRecord>) {
  const r = runs.get(runId);
  if (!r) return;
  runs.set(runId, { ...r, ...patch });
}

export function findRunByJobLatest(jobId: string, runId?: string): RunRecord | undefined {
  if (runId) {
    const r = runs.get(runId);
    if (r && r.jobId === jobId) return r;
    return undefined;
  }
  const jobRuns = Array.from(runs.values()).filter(r => r.jobId === jobId);
  jobRuns.sort((a, b) => (a.startedAt ?? "").localeCompare(b.startedAt ?? ""));
  return jobRuns.at(-1);
}

export function findDiffSetById(diffSetId: string): any | undefined {
  for (const r of runs.values()) {
    const hit = (r.diffsets ?? []).find((d: any) => d.diffSetId === diffSetId);
    if (hit) return hit;
  }
  return undefined;
}
