import type { NaturalRect } from '../extract/geometry';

export type SelectionSource = 'img' | 'canvas' | 'video' | 'background' | 'viewport';

export interface SelectionPayload {
  dataUrl: string;
  width: number;
  height: number;
  source: SelectionSource;
  naturalRect: NaturalRect;
  createdAt: number;
}

export type ExtensionMessage =
  | { type: 'START_SELECTION' }
  | { type: 'SELECTION_CROPPED'; payload: SelectionPayload }
  | { type: 'CAPTURE_VISIBLE' }
  | { type: 'FETCH_IMAGE'; url: string };

function hasType(message: unknown, type: ExtensionMessage['type']): boolean {
  return (
    typeof message === 'object' && message !== null && (message as { type?: unknown }).type === type
  );
}

export function isStartSelection(
  message: unknown,
): message is Extract<ExtensionMessage, { type: 'START_SELECTION' }> {
  return hasType(message, 'START_SELECTION');
}

export function isSelectionCropped(
  message: unknown,
): message is Extract<ExtensionMessage, { type: 'SELECTION_CROPPED' }> {
  return hasType(message, 'SELECTION_CROPPED');
}

export function isCaptureVisible(
  message: unknown,
): message is Extract<ExtensionMessage, { type: 'CAPTURE_VISIBLE' }> {
  return hasType(message, 'CAPTURE_VISIBLE');
}

export function isFetchImage(
  message: unknown,
): message is Extract<ExtensionMessage, { type: 'FETCH_IMAGE' }> {
  return hasType(message, 'FETCH_IMAGE') && typeof (message as { url?: unknown }).url === 'string';
}
