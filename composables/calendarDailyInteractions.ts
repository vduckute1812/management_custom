import dayjs, { type Dayjs } from "dayjs";
import type { Ref } from "vue";
import type { Task, TimeBlock } from "~/types/task";

export interface PositionedCalendarBlock {
  task: Task;
  block: TimeBlock;
  top: number;
  height: number;
  column: number;
  columnCount: number;
}

export type CalendarDragMode = "move" | "resize-top" | "resize-bottom";

export interface CalendarDragSession {
  entry: PositionedCalendarBlock;
  mode: CalendarDragMode;
  startPointerY: number;
  startTop: number;
  startHeight: number;
  currentTop: number;
  currentHeight: number;
  moved: boolean;
  saving: boolean;
}

interface CalendarDailyInteractionOptions {
  date: () => Dayjs;
  hourHeight: Readonly<Ref<number>>;
}

const DRAG_THRESHOLD_PX = 3;

export function useCalendarDailyInteractions(
  options: CalendarDailyInteractionOptions,
) {
  const { t } = useI18n();
  const { saveTask } = useTasks();
  const { pushToast } = useToasts();
  const { formatTime } = useSettings();
  const drag = ref<CalendarDragSession | null>(null);
  const suppressNextClick = ref(false);

  const snapPx = computed(() => options.hourHeight.value / 4);
  const minHeightPx = computed(() => snapPx.value * 2);
  const dayHeight = computed(() => options.hourHeight.value * 24);

  function clamp(n: number, min: number, max: number) {
    return Math.min(Math.max(n, min), max);
  }

  function snap(px: number) {
    return Math.round(px / snapPx.value) * snapPx.value;
  }

  function pxToTime(px: number) {
    const totalMinutes = (px / options.hourHeight.value) * 60;
    return dayjs()
      .hour(Math.floor(totalMinutes / 60))
      .minute(Math.round(totalMinutes % 60));
  }

  function onPointerDown(
    event: PointerEvent,
    entry: PositionedCalendarBlock,
    mode: CalendarDragMode,
  ) {
    if (event.button !== 0 || entry.block.projected) return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);

    drag.value = {
      entry,
      mode,
      startPointerY: event.clientY,
      startTop: entry.top,
      startHeight: entry.height,
      currentTop: entry.top,
      currentHeight: entry.height,
      moved: false,
      saving: false,
    };

    document.body.style.cursor = mode === "move" ? "grabbing" : "ns-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, { once: true });
    window.addEventListener("pointercancel", onPointerCancel, { once: true });
  }

  function onPointerMove(event: PointerEvent) {
    const session = drag.value;
    if (!session) return;
    const deltaY = event.clientY - session.startPointerY;
    if (Math.abs(deltaY) > DRAG_THRESHOLD_PX) session.moved = true;

    if (session.mode === "move") {
      session.currentTop = clamp(
        snap(session.startTop + deltaY),
        0,
        dayHeight.value - session.startHeight,
      );
      session.currentHeight = session.startHeight;
    } else if (session.mode === "resize-top") {
      const proposedTop = clamp(
        snap(session.startTop + deltaY),
        0,
        session.startTop + session.startHeight - minHeightPx.value,
      );
      session.currentTop = proposedTop;
      session.currentHeight =
        session.startTop + session.startHeight - proposedTop;
    } else {
      session.currentTop = session.startTop;
      session.currentHeight = clamp(
        snap(session.startHeight + deltaY),
        minHeightPx.value,
        dayHeight.value - session.startTop,
      );
    }
  }

  function teardownDrag() {
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerCancel);
  }

  async function onPointerUp() {
    const session = drag.value;
    if (!session) {
      teardownDrag();
      return;
    }
    if (!session.moved) {
      drag.value = null;
      teardownDrag();
      return;
    }

    suppressNextClick.value = true;
    const dayStart = options.date().startOf("day");
    const newStart = dayStart.add(
      (session.currentTop / options.hourHeight.value) * 60,
      "minute",
    );
    const newEnd = dayStart.add(
      ((session.currentTop + session.currentHeight) /
        options.hourHeight.value) *
        60,
      "minute",
    );
    const task = session.entry.task;
    const updatedBlocks = (task.timeBlocks ?? []).map((block) =>
      block.id === session.entry.block.id
        ? {
            ...block,
            start: newStart.toISOString(),
            end: newEnd.toISOString(),
          }
        : block,
    );

    session.saving = true;
    try {
      await saveTask({ ...task, timeBlocks: updatedBlocks });
    } catch (error: unknown) {
      pushToast(
        error instanceof Error ? error.message : t("toasts.failedToReschedule"),
        { tone: "danger" },
      );
    } finally {
      drag.value = null;
      teardownDrag();
      setTimeout(() => {
        suppressNextClick.value = false;
      }, 0);
    }
  }

  function onPointerCancel() {
    drag.value = null;
    teardownDrag();
  }

  const dragLabel = computed(() => {
    const session = drag.value;
    if (!session) return null;
    const start = pxToTime(session.currentTop);
    const end = pxToTime(session.currentTop + session.currentHeight);
    return `${formatTime(start)} – ${formatTime(end)}`;
  });

  onBeforeUnmount(() => {
    if (import.meta.client && drag.value) {
      teardownDrag();
      drag.value = null;
    }
  });

  return {
    drag,
    dragLabel,
    suppressNextClick,
    onPointerDown,
  };
}
