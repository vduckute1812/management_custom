/**
 * Client-side gate for the account-deletion dialog. Kept out of the component
 * so the rule that guards an irreversible action is unit-testable: the server
 * re-checks all of it (`emailConfirmationMatches` + the password), and this
 * exists so the button cannot be pressed before the user means it.
 */
export interface AccountDeletionConfirmation {
  /** What the user typed into the confirmation field. */
  typedEmail: string;
  /** The signed-in account's address. */
  accountEmail: string;
  /** False for Google-only accounts, which have no password to check. */
  requiresPassword: boolean;
  password: string;
  /** A request is already in flight. */
  busy: boolean;
}

export function accountEmailMatches(
  typed: string,
  accountEmail: string,
): boolean {
  const a = (typed ?? "").trim().toLowerCase();
  const b = (accountEmail ?? "").trim().toLowerCase();
  return a.length > 0 && a === b;
}

export function canConfirmAccountDeletion(
  input: AccountDeletionConfirmation,
): boolean {
  if (input.busy) return false;
  if (!accountEmailMatches(input.typedEmail, input.accountEmail)) return false;
  if (input.requiresPassword && input.password.length === 0) return false;
  return true;
}
