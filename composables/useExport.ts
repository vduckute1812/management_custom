import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  TaskPriority,
  TaskStatus,
  type Epic,
  type Task,
} from "~/types/task";

dayjs.extend(utc);

function download(filename: string, mime: string, content: string) {
  if (!import.meta.client) return;
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  // RFC 4180: quote if contains comma, quote, or newline; double internal quotes.
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvRow(values: unknown[]): string {
  return values.map(csvField).join(",");
}

export const useExport = () => {
  const { tasks } = useTasks();
  const { epics, findEpic } = useEpics();

  function timestamp(): string {
    return dayjs().format("YYYY-MM-DD-HHmm");
  }

  /** Snapshot the full DB as-served by the API (with computed fields). */
  function exportJSON() {
    const payload = {
      exportedAt: dayjs().toISOString(),
      epics: epics.value,
      tasks: tasks.value,
    };
    download(
      `management-${timestamp()}.json`,
      "application/json",
      JSON.stringify(payload, null, 2)
    );
  }

  /** One row per (task, timeBlock). Tasks without blocks get a single row with empty block columns. */
  function exportCSV() {
    const header = [
      "task_id",
      "task_title",
      "epic_id",
      "epic_title",
      "status",
      "priority",
      "due_date",
      "estimated_hours",
      "progress",
      "tags",
      "block_id",
      "block_start",
      "block_end",
      "block_spent_hours",
    ];

    const rows: string[] = [header.join(",")];

    for (const t of tasks.value as Task[]) {
      const epic = findEpic(t.epicId);
      // CSV is for humans — emit the labels rather than raw enum ints so a
      // spreadsheet open of the file is immediately readable.
      const base = [
        t.id,
        t.title,
        t.epicId ?? "",
        epic?.title ?? "",
        STATUS_LABELS[t.status] ?? t.status,
        PRIORITY_LABELS[t.priority ?? TaskPriority.Normal],
        t.dueDate ?? "",
        t.estimatedHours ?? "",
        t.progress ?? "",
        (t.tags ?? []).join("|"),
      ];

      const blocks = t.timeBlocks ?? [];
      if (blocks.length === 0) {
        rows.push(csvRow([...base, "", "", "", ""]));
      } else {
        for (const b of blocks) {
          rows.push(
            csvRow([
              ...base,
              b.id,
              b.start,
              b.end,
              b.spentHours ?? "",
            ])
          );
        }
      }
    }

    download(
      `management-tasks-${timestamp()}.csv`,
      "text/csv",
      rows.join("\n")
    );
  }

  // ---- iCal --------------------------------------------------------------

  function icsDate(iso: string): string {
    // RFC 5545 form: "20260618T101500Z" (UTC).
    return dayjs(iso).utc().format("YYYYMMDDTHHmmss") + "Z";
  }

  function icsDateOnly(iso: string): string {
    return dayjs(iso).format("YYYYMMDD");
  }

  function icsEscape(text: string): string {
    return text
      .replace(/\\/g, "\\\\")
      .replace(/\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  }

  function foldLine(line: string): string {
    // iCal lines should be <= 75 octets. Fold by inserting CRLF + space.
    if (line.length <= 75) return line;
    const chunks: string[] = [];
    for (let i = 0; i < line.length; i += 73) {
      chunks.push((i === 0 ? "" : " ") + line.slice(i, i + 73));
    }
    return chunks.join("\r\n");
  }

  /** One VEVENT per scheduled TimeBlock, plus one VTODO per task with a due date. */
  function exportICS() {
    const stamp = icsDate(dayjs().toISOString());
    const lines: string[] = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//management//local//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
    ];

    for (const t of tasks.value as Task[]) {
      const epic = findEpic(t.epicId);
      const summaryBase = `${epic ? `[${epic.title}] ` : ""}${t.title}`;
      const desc = [
        t.notes,
        (t.tags ?? []).length
          ? `Tags: ${(t.tags ?? []).map((x) => `#${x}`).join(" ")}`
          : "",
        t.priority !== undefined && t.priority !== TaskPriority.Normal
          ? `Priority: ${PRIORITY_LABELS[t.priority]}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");

      for (const b of t.timeBlocks ?? []) {
        lines.push("BEGIN:VEVENT");
        lines.push(foldLine(`UID:${b.id}@management.local`));
        lines.push(`DTSTAMP:${stamp}`);
        lines.push(`DTSTART:${icsDate(b.start)}`);
        lines.push(`DTEND:${icsDate(b.end)}`);
        lines.push(foldLine(`SUMMARY:${icsEscape(summaryBase)}`));
        if (desc) lines.push(foldLine(`DESCRIPTION:${icsEscape(desc)}`));
        lines.push("END:VEVENT");
      }

      if (t.dueDate) {
        lines.push("BEGIN:VTODO");
        lines.push(foldLine(`UID:${t.id}@management.local`));
        lines.push(`DTSTAMP:${stamp}`);
        lines.push(`DUE;VALUE=DATE:${icsDateOnly(t.dueDate)}`);
        lines.push(foldLine(`SUMMARY:${icsEscape(summaryBase)}`));
        if (desc) lines.push(foldLine(`DESCRIPTION:${icsEscape(desc)}`));
        lines.push(
          `STATUS:${
            t.status === TaskStatus.Done
              ? "COMPLETED"
              : t.status === TaskStatus.InProgress
              ? "IN-PROCESS"
              : "NEEDS-ACTION"
          }`
        );
        if (typeof t.progress === "number") {
          lines.push(`PERCENT-COMPLETE:${Math.round(t.progress)}`);
        }
        lines.push("END:VTODO");
      }
    }

    lines.push("END:VCALENDAR");
    download(
      `management-${timestamp()}.ics`,
      "text/calendar",
      lines.join("\r\n") + "\r\n"
    );
  }

  /** Epic-level summary as CSV. */
  function exportEpicsCSV() {
    const header = [
      "epic_id",
      "title",
      "status",
      "color",
      "due_date",
      "task_count",
      "estimated_hours",
      "spent_hours",
      "progress",
      "tags",
    ];
    const rows = [header.join(",")];
    for (const e of epics.value as Epic[]) {
      rows.push(
        csvRow([
          e.id,
          e.title,
          STATUS_LABELS[e.status] ?? e.status,
          e.color ?? "brand",
          e.dueDate ?? "",
          e.taskCount ?? 0,
          e.estimatedHours ?? 0,
          e.spentHours ?? 0,
          e.progress ?? 0,
          (e.tags ?? []).join("|"),
        ])
      );
    }
    download(
      `management-epics-${timestamp()}.csv`,
      "text/csv",
      rows.join("\n")
    );
  }

  return { exportJSON, exportCSV, exportEpicsCSV, exportICS };
};
