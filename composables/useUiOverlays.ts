/**
 * Shared overlay coordination so global shortcuts can open palettes/modals
 * from anywhere without page-level prop drilling.
 *
 * `focusTaskId` is a cross-page "open this task once it's reachable" signal.
 * Notification toasts / the command palette can set it from any route and the
 * `/tasks` dashboard watches it to open the task modal as soon as the route
 * mounts and the task list is hydrated. Set to `null` to clear (do this
 * immediately after consuming so the same id can be fired again later).
 *
 * `pendingCreateTask` is the Shift+N counterpart: open a blank full task
 * modal on `/tasks` once that page is mounted.
 */
export const useUiOverlays = () => {
  const paletteOpen = useState<boolean>("ui:palette", () => false);
  const helpOpen = useState<boolean>("ui:help", () => false);
  const quickCaptureOpen = useState<boolean>("ui:quick-capture", () => false);
  const focusTaskId = useState<string | null>("ui:focusTaskId", () => null);
  const pendingCreateTask = useState<boolean>("ui:pending-create", () => false);

  function closeAll() {
    paletteOpen.value = false;
    helpOpen.value = false;
    quickCaptureOpen.value = false;
  }

  function requestFocusTask(id: string) {
    focusTaskId.value = id;
  }

  function clearFocusTask() {
    focusTaskId.value = null;
  }

  function requestCreateTask() {
    pendingCreateTask.value = true;
  }

  return {
    paletteOpen,
    helpOpen,
    quickCaptureOpen,
    focusTaskId,
    pendingCreateTask,
    requestFocusTask,
    clearFocusTask,
    requestCreateTask,
    closeAll,
  };
};
