export type ExtensionMessage =
  { type: 'START_SELECTION' } | { type: 'SELECTION_READY'; text: string };

export function isStartSelection(
  message: unknown,
): message is Extract<ExtensionMessage, { type: 'START_SELECTION' }> {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === 'START_SELECTION'
  );
}
