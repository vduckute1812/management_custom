export type ToastTone = "info" | "success" | "danger";

export interface Toast {
  id: string;
  message: string;
  tone: ToastTone;
  /** Label for the action button. Defaults to "Undo" when `onAction` is set. */
  actionLabel?: string;
  /** Invoked when the action button is clicked. */
  onAction?: () => void | Promise<void>;
  /** Milliseconds before auto-dismiss. Set 0 to require manual dismiss. */
  duration: number;
}

interface PushToastOptions {
  tone?: ToastTone;
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
  duration?: number;
}

let counter = 0;

export const useToasts = () => {
  const toasts = useState<Toast[]>("toasts", () => []);

  function dismiss(id: string) {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }

  function pushToast(message: string, options: PushToastOptions = {}): Toast {
    const id = `toast_${Date.now()}_${counter++}`;
    const toast: Toast = {
      id,
      message,
      tone: options.tone ?? "info",
      actionLabel: options.actionLabel ?? (options.onAction ? "Undo" : undefined),
      onAction: options.onAction,
      duration: options.duration ?? 5000,
    };
    toasts.value = [...toasts.value, toast];

    if (toast.duration > 0 && import.meta.client) {
      setTimeout(() => dismiss(id), toast.duration);
    }
    return toast;
  }

  async function triggerAction(toast: Toast) {
    if (toast.onAction) {
      try {
        await toast.onAction();
      } catch {
        // Swallow; the caller is responsible for surfacing follow-up errors.
      }
    }
    dismiss(toast.id);
  }

  return { toasts, pushToast, dismiss, triggerAction };
};
