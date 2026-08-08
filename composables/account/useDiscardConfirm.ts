import { ref } from "vue";

export function useDiscardConfirm(options: {
  isDirty: () => boolean;
  onDiscard: () => void;
}) {
  const discardConfirmOpen = ref(false);
  const discardKeepBtn = ref<HTMLButtonElement | null>(null);

  function requestClose() {
    if (options.isDirty()) {
      discardConfirmOpen.value = true;
      return;
    }
    options.onDiscard();
  }

  function confirmDiscard() {
    discardConfirmOpen.value = false;
    options.onDiscard();
  }

  function cancelDiscard() {
    discardConfirmOpen.value = false;
  }

  return {
    discardConfirmOpen,
    discardKeepBtn,
    requestClose,
    confirmDiscard,
    cancelDiscard,
  };
}
