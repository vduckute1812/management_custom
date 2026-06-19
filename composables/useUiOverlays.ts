/**
 * Shared overlay coordination so global shortcuts can open palettes/modals
 * from anywhere without page-level prop drilling.
 */
export const useUiOverlays = () => {
  const paletteOpen = useState<boolean>("ui:palette", () => false);
  const helpOpen = useState<boolean>("ui:help", () => false);
  const quickCaptureOpen = useState<boolean>("ui:quick-capture", () => false);

  function closeAll() {
    paletteOpen.value = false;
    helpOpen.value = false;
    quickCaptureOpen.value = false;
  }

  return {
    paletteOpen,
    helpOpen,
    quickCaptureOpen,
    closeAll,
  };
};
