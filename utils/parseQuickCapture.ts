import dayjs, { type Dayjs } from "dayjs";
import type { TimeBlock } from "~/types/task";

export interface ParsedQuickCapture {
  title: string;
  tags: string[];
  dueDate: string;
  block: TimeBlock;
  /** Human-readable schedule summary for the success toast. */
  scheduleLabel: string;
}

function tempBlockId() {
  return `block_${Math.random().toString(16).slice(2, 10)}`;
}

function nextHourStart(from: Dayjs = dayjs()): Dayjs {
  if (from.minute() === 0 && from.second() < 5) return from.startOf("hour");
  return from.add(1, "hour").startOf("hour");
}

function parseHourToken(raw: string): number | null {
  const m = raw
    .trim()
    .toLowerCase()
    .match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const mins = m[2] ? Number(m[2]) : 0;
  const ap = m[3];
  if (Number.isNaN(h) || Number.isNaN(mins) || mins > 59) return null;
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  if (!ap && h > 23) return null;
  if (h < 0 || h > 23) return null;
  return h * 60 + mins;
}

/**
 * Parse a quick-capture line into title, tags, and a scheduled block.
 *
 * Supported fragments (stripped from the title):
 *   #tag
 *   today | tomorrow
 *   @14 | @2pm | @14:30
 *   9-11 | 9:00-11:30 | 14:00-15:30
 */
export function parseQuickCapture(input: string): ParsedQuickCapture {
  let rest = input.trim().replace(/\s+/g, " ");
  const tags: string[] = [];

  rest = rest.replace(/(?:^|\s)#([a-zA-Z0-9_-]+)/g, (_, tag: string) => {
    tags.push(tag.toLowerCase());
    return " ";
  });

  let day = dayjs().startOf("day");
  const dayMatch = rest.match(/\b(today|tomorrow)\b/i);
  if (dayMatch) {
    if (dayMatch[1].toLowerCase() === "tomorrow") {
      day = day.add(1, "day");
    }
    rest = rest.replace(dayMatch[0], " ");
  }

  let startMin: number | null = null;
  let endMin: number | null = null;

  // Range: 9-11, 9:00-11:30, 14:00-15:30 (optionally with am/pm)
  const rangeRe =
    /\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*[-–]\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i;
  const rangeMatch = rest.match(rangeRe);
  if (rangeMatch) {
    startMin = parseHourToken(rangeMatch[1]);
    endMin = parseHourToken(rangeMatch[2]);
    if (startMin !== null && endMin !== null && endMin > startMin) {
      rest = rest.replace(rangeMatch[0], " ");
    } else {
      startMin = null;
      endMin = null;
    }
  }

  // @time: @14, @2pm, @14:30
  if (startMin === null) {
    const atMatch = rest.match(/@\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i);
    if (atMatch) {
      startMin = parseHourToken(atMatch[1]);
      if (startMin !== null) {
        rest = rest.replace(atMatch[0], " ");
        endMin = startMin + 60;
      }
    }
  }

  const title = rest.replace(/\s+/g, " ").trim() || input.trim();

  let start: Dayjs;
  let end: Dayjs;

  if (startMin !== null && endMin !== null) {
    start = day.add(startMin, "minute");
    end = day.add(endMin, "minute");
  } else if (dayMatch && dayMatch[1].toLowerCase() === "tomorrow") {
    // "tomorrow" without a time → 09:00–10:00
    start = day.hour(9).minute(0).second(0).millisecond(0);
    end = start.add(1, "hour");
  } else {
    // Default: next free-looking hour today (or tomorrow if past 23:00)
    start = nextHourStart();
    if (start.isAfter(dayjs().endOf("day"))) {
      start = dayjs().add(1, "day").hour(9).minute(0).second(0).millisecond(0);
    }
    end = start.add(1, "hour");
    day = start.startOf("day");
  }

  const block: TimeBlock = {
    id: tempBlockId(),
    start: start.toISOString(),
    end: end.toISOString(),
  };

  const scheduleLabel = day.isSame(dayjs(), "day")
    ? `${start.format("HH:mm")}–${end.format("HH:mm")}`
    : `${start.format("MMM D HH:mm")}–${end.format("HH:mm")}`;

  return {
    title,
    tags,
    dueDate: start.format("YYYY-MM-DD"),
    block,
    scheduleLabel,
  };
}
