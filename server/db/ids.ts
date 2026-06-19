export type IdPrefix =
  | "task"
  | "epic"
  | "block"
  | "chk"
  | "user"
  | "rtok"
  | "vrfy";

export function generateId(prefix: IdPrefix = "task"): string {
  const rand = Math.random().toString(16).slice(2, 10);
  return `${prefix}_${rand}`;
}

export function nowISO(): string {
  return new Date().toISOString();
}
