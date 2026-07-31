import dayjs, { type Dayjs } from "dayjs";
import type { Task, TimeBlock } from "~/types/task";

/**
 * Scheduling helpers shared by quick capture, Up next, and rollover review.
 */
export function useSchedule() {
  const { tasks, saveTask } = useTasks();

  function occupiedRanges(day: Dayjs): { start: number; end: number }[] {
    const dayStart = day.startOf("day");
    const ranges: { start: number; end: number }[] = [];
    for (const t of tasks.value) {
      for (const b of t.timeBlocks ?? []) {
        if (b.projected) continue;
        const s = dayjs(b.start);
        const e = dayjs(b.end);
        if (!s.isValid() || !e.isValid()) continue;
        if (!s.isSame(day, "day") && !e.isSame(day, "day")) continue;
        const startMin = Math.max(0, s.diff(dayStart, "minute"));
        const endMin = Math.min(24 * 60, e.diff(dayStart, "minute"));
        if (endMin > startMin) ranges.push({ start: startMin, end: endMin });
      }
    }
    return ranges.sort((a, b) => a.start - b.start);
  }

  /**
   * First free `durationMin`-minute window on `day`, starting no earlier than
   * `earliest` (defaults to 09:00, or "now" rounded up when the day is today).
   */
  function nextFreeSlot(
    day: Dayjs = dayjs(),
    durationMin = 60,
    earliest?: Dayjs,
  ): { start: Dayjs; end: Dayjs } {
    const dayStart = day.startOf("day");
    let cursorMin = 9 * 60;
    if (earliest) {
      cursorMin = Math.max(cursorMin, earliest.diff(dayStart, "minute"));
    } else if (day.isSame(dayjs(), "day")) {
      const now = dayjs();
      const rounded =
        now.minute() === 0 && now.second() < 5
          ? now.startOf("hour")
          : now.add(1, "hour").startOf("hour");
      cursorMin = Math.max(cursorMin, rounded.diff(dayStart, "minute"));
    }

    const busy = occupiedRanges(day);
    const dayEnd = 22 * 60; // stop suggesting after 10pm

    while (cursorMin + durationMin <= dayEnd) {
      const slotEnd = cursorMin + durationMin;
      const conflict = busy.some((r) => cursorMin < r.end && slotEnd > r.start);
      if (!conflict) {
        const start = dayStart.add(cursorMin, "minute");
        return { start, end: start.add(durationMin, "minute") };
      }
      // Jump to the end of the conflicting range (or +15m).
      const blocker = busy.find((r) => cursorMin < r.end && slotEnd > r.start);
      cursorMin = blocker ? blocker.end : cursorMin + 15;
    }

    // Fallback: append at 9am even if busy — better than failing silently.
    const start = dayStart.hour(9).minute(0);
    return { start, end: start.add(durationMin, "minute") };
  }

  function blockDurationMinutes(task: Task): number {
    const blocks = (task.timeBlocks ?? []).filter((b) => !b.projected);
    if (!blocks.length) return 60;
    // Prefer the most recent past block's duration, else the first block.
    const sorted = [...blocks].sort(
      (a, b) => dayjs(b.start).valueOf() - dayjs(a.start).valueOf(),
    );
    const b = sorted[0];
    if (!b) return 60;
    const mins = dayjs(b.end).diff(dayjs(b.start), "minute");
    return mins > 0 ? mins : 60;
  }

  /**
   * Move (or create) a single day's focus block for `task` onto `day` at the
   * next free slot. Preserves duration from the latest existing block.
   */
  async function rescheduleToDay(
    task: Task,
    day: Dayjs = dayjs(),
  ): Promise<Task> {
    const durationMin = blockDurationMinutes(task);
    const { start, end } = nextFreeSlot(day, durationMin);
    const blocks = [...(task.timeBlocks ?? [])].filter((b) => !b.projected);

    // Prefer moving the most recent past / any block on a different day;
    // if the task already has a block on the target day, move that one.
    const sameDayIdx = blocks.findIndex((b) =>
      dayjs(b.start).isSame(day, "day"),
    );
    const sameDayBlock = sameDayIdx >= 0 ? blocks[sameDayIdx] : undefined;
    const newBlock: TimeBlock = {
      id:
        sameDayBlock?.id ?? `block_${Math.random().toString(16).slice(2, 10)}`,
      start: start.toISOString(),
      end: end.toISOString(),
      spentHours: sameDayBlock?.spentHours,
    };

    let nextBlocks: TimeBlock[];
    if (sameDayIdx >= 0) {
      nextBlocks = blocks.map((b, i) => (i === sameDayIdx ? newBlock : b));
    } else if (blocks.length) {
      // Replace the oldest past block when rolling over; keep future ones.
      const pastIdx = blocks.findIndex((b) =>
        dayjs(b.end).isBefore(dayjs().startOf("day")),
      );
      if (pastIdx >= 0) {
        nextBlocks = blocks.map((b, i) =>
          i === pastIdx ? { ...newBlock, id: b.id } : b,
        );
      } else {
        nextBlocks = [...blocks, newBlock];
      }
    } else {
      nextBlocks = [newBlock];
    }

    return saveTask({
      ...task,
      dueDate: start.format("YYYY-MM-DD"),
      timeBlocks: nextBlocks,
    });
  }

  return {
    nextFreeSlot,
    rescheduleToDay,
    blockDurationMinutes,
  };
}
