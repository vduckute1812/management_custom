/**
 * Shared overlay coordination so global shortcuts can open palettes/modals
 * from anywhere without page-level prop drilling.
 */
export const useUiOverlays = () => {
  const paletteOpen = useState<boolean>("ui:palette", () => false);
  const helpOpen = useState<boolean>("ui:help", () => false);
  const quickCaptureOpen = useState<boolean>("ui:quick-capture", () => false);
  /** When set, the dashboard opens this task (e.g. from the command palette). */
  const openTaskId = useState<string | null>("ui:open-task-id", () => null);
  /** When true, the dashboard opens a blank full task modal (Shift+N). */
  const pendingCreateTask = useState<boolean>("ui:pending-create", () => false);

  function closeAll() {
    paletteOpen.value = false;
    helpOpen.value = false;
    quickCaptureOpen.value = false;
  }

  function requestOpenTask(taskId: string) {
    openTaskId.value = taskId;
  }

  function requestCreateTask() {
    pendingCreateTask.value = true;
  }

  return {
    paletteOpen,
    helpOpen,
    quickCaptureOpen,
    openTaskId,
    pendingCreateTask,
    requestOpenTask,
    requestCreateTask,
    closeAll,
  };
};
