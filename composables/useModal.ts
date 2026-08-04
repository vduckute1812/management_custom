/**
 * Accessible modal lifecycle: focus trap, body scroll lock, focus restore,
 * Escape → onClose. Nested modals share a document-level stack so only the
 * topmost dialog traps Tab / Escape.
 */
import {
  onBeforeUnmount,
  watch,
  nextTick,
  type Ref,
  type ComputedRef,
} from "vue";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function listFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((el) => {
    if (el.getAttribute("aria-hidden") === "true") return false;
    // Nested confirms set `inert` on the parent form so Tab cannot escape.
    if (el.closest("[inert]")) return false;
    // Visible to assistive tech / keyboard (offsetParent misses fixed/flex
    // children in some trees — getClientRects covers those).
    return el.getClientRects().length > 0;
  });
}

type ModalEntry = {
  id: number;
  getContainer: () => HTMLElement | null;
  onEscape: (() => void) | null;
  previousFocus: HTMLElement | null;
};

let nextModalId = 1;
const modalStack: ModalEntry[] = [];
let docListenerAttached = false;
let bodyOverflowBackup: string | null = null;

function lockBodyScroll() {
  if (!import.meta.client) return;
  if (bodyOverflowBackup === null) {
    bodyOverflowBackup = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
}

function unlockBodyScroll() {
  if (!import.meta.client) return;
  if (modalStack.length === 0 && bodyOverflowBackup !== null) {
    document.body.style.overflow = bodyOverflowBackup;
    bodyOverflowBackup = null;
  }
}

function onDocumentKeydown(e: KeyboardEvent) {
  const top = modalStack[modalStack.length - 1];
  if (!top) return;
  const container = top.getContainer();
  if (!container) return;

  if (e.key === "Escape") {
    if (!top.onEscape) return;
    e.preventDefault();
    e.stopPropagation();
    top.onEscape();
    return;
  }

  if (e.key !== "Tab") return;

  const focusables = listFocusable(container);
  if (!focusables.length) {
    e.preventDefault();
    if (!container.hasAttribute("tabindex")) {
      container.setAttribute("tabindex", "-1");
    }
    container.focus();
    return;
  }

  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (!first || !last) return;

  const active = document.activeElement as HTMLElement | null;
  const inside = active != null && container.contains(active);

  if (e.shiftKey) {
    if (!inside || active === first) {
      e.preventDefault();
      last.focus();
    }
  } else if (!inside || active === last) {
    e.preventDefault();
    first.focus();
  }
}

function ensureDocListener() {
  if (docListenerAttached || !import.meta.client) return;
  document.addEventListener("keydown", onDocumentKeydown, true);
  docListenerAttached = true;
}

function teardownDocListenerIfEmpty() {
  if (modalStack.length > 0 || !docListenerAttached || !import.meta.client) {
    return;
  }
  document.removeEventListener("keydown", onDocumentKeydown, true);
  docListenerAttached = false;
}

export type UseModalOptions = {
  /** Root element that contains all focusable controls for this dialog. */
  container: Ref<HTMLElement | null | undefined>;
  /** Escape handler. Omit / null to leave Escape to other listeners. */
  onClose?: (() => void) | null;
  /** Prefer this control on open; otherwise first focusable (or container). */
  initialFocus?:
    | Ref<HTMLElement | null | undefined>
    | (() => HTMLElement | null | undefined);
  /** Default: true when `onClose` is provided. */
  closeOnEscape?: boolean;
  /** Default: true. Nested modals share one body lock via the stack. */
  lockScroll?: boolean;
};

/**
 * Register a dialog while `open` is true. Call from setup with a ref/computed
 * open flag and a template ref on the dialog root (role=dialog|alertdialog).
 */
export function useModal(
  open: Ref<boolean> | ComputedRef<boolean>,
  options: UseModalOptions,
) {
  const id = nextModalId++;
  let registered = false;

  function resolveInitialFocus(): HTMLElement | null {
    const root = options.container.value ?? null;
    if (!root) return null;
    const opt = options.initialFocus;
    let preferred: HTMLElement | null | undefined;
    if (typeof opt === "function") preferred = opt();
    else if (opt) preferred = opt.value;
    if (preferred) return preferred;
    const focusables = listFocusable(root);
    return focusables[0] ?? root;
  }

  function activate() {
    if (!import.meta.client || registered) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const closeOnEscape = options.closeOnEscape ?? options.onClose != null;
    modalStack.push({
      id,
      getContainer: () => options.container.value ?? null,
      onEscape:
        closeOnEscape && options.onClose != null ? options.onClose : null,
      previousFocus,
    });
    registered = true;
    ensureDocListener();
    if (options.lockScroll !== false) lockBodyScroll();

    void nextTick(() => {
      const root = options.container.value;
      if (root && !root.hasAttribute("tabindex")) {
        root.setAttribute("tabindex", "-1");
      }
      resolveInitialFocus()?.focus();
    });
  }

  function deactivate() {
    if (!registered) return;
    const idx = modalStack.findIndex((m) => m.id === id);
    let previousFocus: HTMLElement | null = null;
    if (idx >= 0) {
      const [entry] = modalStack.splice(idx, 1);
      previousFocus = entry?.previousFocus ?? null;
    }
    registered = false;
    unlockBodyScroll();
    teardownDocListenerIfEmpty();

    if (!import.meta.client || !previousFocus?.isConnected) return;
    const active = document.activeElement;
    const root = options.container.value;
    const stillInThis =
      root != null && active instanceof Node && root.contains(active);
    const nowhereUseful =
      !active ||
      active === document.body ||
      active === document.documentElement;
    if (stillInThis || nowhereUseful) {
      previousFocus.focus();
    }
  }

  watch(
    open,
    (isOpen) => {
      if (isOpen) activate();
      else deactivate();
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    deactivate();
  });
}

/** Test helper — exposed for unit tests only. */
export function __modalStackDepthForTests(): number {
  return modalStack.length;
}
