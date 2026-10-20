import type { DragEvent } from 'react';
import type { Face } from './types';

/**
 * What is currently being dragged from the library or a rack. HTML5 drag events only expose
 * dataTransfer contents on drop, so the payload is kept here for the dragover preview.
 */
export type DragPayload =
  | { kind: 'template'; templateId: string; heightU: number; fullDepth: boolean }
  | {
      kind: 'device';
      deviceId: string;
      heightU: number;
      fullDepth: boolean;
      grabOffsetU: number;
      facing: Face;
      /** Rack side the device was picked up from; dropping it on the other side turns it round. */
      fromFace: Face;
    };

let current: DragPayload | null = null;

export const MIME = 'application/x-portabuddy';

export function startDrag(e: DragEvent, payload: DragPayload) {
  current = payload;
  e.dataTransfer.setData(MIME, JSON.stringify(payload));
  e.dataTransfer.setData('text/plain', payload.kind);
  e.dataTransfer.effectAllowed = payload.kind === 'template' ? 'copy' : 'move';
}

export function currentDrag(): DragPayload | null {
  return current;
}

export function endDrag() {
  current = null;
}
