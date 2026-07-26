import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import {
  PRIORITY_I18N_KEYS,
  STATUS_I18N_KEYS,
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
  const { t } = useI18n();
  const { tasks } = useTasks();
  const { epics, findEpic } = useEpics();

  function timestamp(): string {
    return dayjs().format("YYYY-MM-DD-HHmm");
  }

  function statusLabel(status: TaskStatus): string {
    return t(STATUS_I18N_KEYS[status] ?? "status.todo");
  }

  function priorityLabel(priority: TaskPriority): string {
    return t(PRIORITY_I18N_KEYS[priority] ?? "common.priority.normal");
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
      t("export.status"),
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

    for (const task of tasks.value as Task[]) {
      const epic = findEpic(task.epicId);
      // CSV is for humans — emit the labels rather than raw enum ints so a
      // spreadsheet open of the file is immediately readable.
      const base = [
        task.id,
        task.title,
        task.epicId ?? "",
        epic?.title ?? "",
        statusLabel(task.status),
        priorityLabel(task.priority ?? TaskPriority.Normal),
        task.dueDate ?? "",
        task.estimatedHours ?? "",
        task.progress ?? "",
        (task.tags ?? []).join("|"),
      ];

      const blocks = task.timeBlocks ?? [];
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

    for (const task of tasks.value as Task[]) {
      const epic = findEpic(task.epicId);
      const summaryBase = `${epic ? `[${epic.title}] ` : ""}${task.title}`;
      const desc = [
        task.notes,
        (task.tags ?? []).length
          ? `Tags: ${(task.tags ?? []).map((x) => `#${x}`).join(" ")}`
          : "",
        task.priority !== undefined && task.priority !== TaskPriority.Normal
          ? `Priority: ${priorityLabel(task.priority)}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");

      for (const b of task.timeBlocks ?? []) {
        lines.push("BEGIN:VEVENT");
        lines.push(foldLine(`UID:${b.id}@management.local`));
        lines.push(`DTSTAMP:${stamp}`);
        lines.push(`DTSTART:${icsDate(b.start)}`);
        lines.push(`DTEND:${icsDate(b.end)}`);
        lines.push(foldLine(`SUMMARY:${icsEscape(summaryBase)}`));
        if (desc) lines.push(foldLine(`DESCRIPTION:${icsEscape(desc)}`));
        lines.push("END:VEVENT");
      }

      if (task.dueDate) {
        lines.push("BEGIN:VTODO");
        lines.push(foldLine(`UID:${task.id}@management.local`));
        lines.push(`DTSTAMP:${stamp}`);
        lines.push(`DUE;VALUE=DATE:${icsDateOnly(task.dueDate)}`);
        lines.push(foldLine(`SUMMARY:${icsEscape(summaryBase)}`));
        if (desc) lines.push(foldLine(`DESCRIPTION:${icsEscape(desc)}`));
        lines.push(
          `STATUS:${
            task.status === TaskStatus.Done
              ? "COMPLETED"
              : task.status === TaskStatus.InProgress
              ? "IN-PROCESS"
              : "NEEDS-ACTION"
          }`
        );
        if (typeof task.progress === "number") {
          lines.push(`PERCENT-COMPLETE:${Math.round(task.progress)}`);
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
      t("export.status"),
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
          statusLabel(e.status),
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
