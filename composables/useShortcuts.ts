/**
 * Global keyboard shortcuts. Mounted once from the default layout.
 *
 * Conventions:
 *   - We never intercept events whose target is an editable element unless the
 *     binding is explicitly platform-level (Mod+K, Esc).
 *   - Two-key "g" sequences (g d, g e, g a) follow the Gmail/Linear pattern.
 */
const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (EDITABLE_TAGS.has(target.tagName)) return true;
  if (target.isContentEditable) return true;
  return false;
}

function isMod(e: KeyboardEvent): boolean {
  return e.metaKey || e.ctrlKey;
}

export const useShortcuts = () => {
  const router = useRouter();
  const overlays = useUiOverlays();

  let gPending = false;
  let gTimer: ReturnType<typeof setTimeout> | null = null;

  function armG() {
    gPending = true;
    if (gTimer) clearTimeout(gTimer);
    gTimer = setTimeout(() => {
      gPending = false;
    }, 800);
  }

  function consumeG() {
    gPending = false;
    if (gTimer) {
      clearTimeout(gTimer);
      gTimer = null;
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    // Platform-level: Mod+K opens the command palette from anywhere.
    if (isMod(e) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      overlays.paletteOpen.value = !overlays.paletteOpen.value;
      overlays.helpOpen.value = false;
      overlays.quickCaptureOpen.value = false;
      return;
    }

    // Esc always closes overlays (palette / help / quick capture).
    if (e.key === "Escape") {
      if (
        overlays.paletteOpen.value ||
        overlays.helpOpen.value ||
        overlays.quickCaptureOpen.value
      ) {
        overlays.closeAll();
      }
      return;
    }

    // From here on, ignore typing inside editable controls.
    if (isEditableTarget(e.target)) return;

    // Modifier-only / alt combinations: ignore for the simple bindings below.
    if (e.altKey || e.metaKey || e.ctrlKey) return;

    // Two-key "g" navigation sequences.
    if (gPending) {
      const key = e.key.toLowerCase();
      if (key === "d") {
        e.preventDefault();
        consumeG();
        router.push("/");
        return;
      }
      if (key === "e") {
        e.preventDefault();
        consumeG();
        router.push("/epics");
        return;
      }
      if (key === "a") {
        e.preventDefault();
        consumeG();
        router.push("/analytics");
        return;
      }
      // Any other key cancels the pending sequence.
      consumeG();
    }

    if (e.key === "g") {
      e.preventDefault();
      armG();
      return;
    }

    // Quick capture.
    if (e.key === "n") {
      if (e.shiftKey) return; // Shift+N reserved for the full modal (handled by page).
      e.preventDefault();
      overlays.quickCaptureOpen.value = true;
      return;
    }

    // Help cheatsheet.
    if (e.key === "?") {
      e.preventDefault();
      overlays.helpOpen.value = !overlays.helpOpen.value;
      return;
    }
  }

  onMounted(() => {
    window.addEventListener("keydown", onKeyDown);
  });

  onBeforeUnmount(() => {
    window.removeEventListener("keydown", onKeyDown);
    if (gTimer) clearTimeout(gTimer);
  });
};

/**
 * Page-scoped helper: bind a list of plain single-key shortcuts that should
 * only fire while a given page is mounted (e.g. `1` / `2` / `3` view toggle).
 */
export function usePageShortcuts(
  bindings: { key: string; handler: (e: KeyboardEvent) => void }[]
) {
  const lookup = new Map(bindings.map((b) => [b.key, b.handler]));

  function onKeyDown(e: KeyboardEvent) {
    if (isEditableTarget(e.target)) return;
    if (e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const h = lookup.get(e.key);
    if (h) {
      e.preventDefault();
      h(e);
    }
  }

  onMounted(() => window.addEventListener("keydown", onKeyDown));
  onBeforeUnmount(() => window.removeEventListener("keydown", onKeyDown));
}
