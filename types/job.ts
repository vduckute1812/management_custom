/**
 * Background job status — TINYINT UNSIGNED end-to-end.
 * Pending=0, Processing=1, Completed=2, Dead=3
 */
export const JobStatus = {
  Pending: 0,
  Processing: 1,
  Completed: 2,
  Dead: 3,
} as const;
export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

export const JOB_STATUSES = [
  JobStatus.Pending,
  JobStatus.Processing,
  JobStatus.Completed,
  JobStatus.Dead,
] as const;
