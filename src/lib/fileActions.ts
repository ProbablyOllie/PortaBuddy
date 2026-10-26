import { useStore } from '../store';
import { buildWorkbook, cableSheet, downloadBlob, portMapSheet, safeFileName, toCsv } from './export';
import { timeAgo } from './time';

/** Shared by the desktop toolbar and the mobile layout. */

export function saveBackupFile() {
  const s = useStore.getState();
  downloadBlob(new Blob([JSON.stringify(s.project, null, 2)], { type: 'application/json' }), `${safeFileName(s.project.name)}.portabuddy.json`);
  s.markFileSaved();
}

export async function exportWorkbook(): Promise<void> {
  const s = useStore.getState();
  try {
    downloadBlob(await buildWorkbook(s.project), `${safeFileName(s.project.name)}.xlsx`);
  } catch (err) {
    console.error(err);
    s.flash('Export failed — see the browser console for details.');
  }
}

export function exportCsvFile(which: 'cables' | 'ports') {
  const { project } = useStore.getState();
  const sheet = which === 'cables' ? cableSheet(project) : portMapSheet(project);
  // BOM so Excel opens UTF-8 correctly.
  downloadBlob(new Blob(['﻿' + toCsv(sheet)], { type: 'text/csv;charset=utf-8' }), `${safeFileName(project.name)}_${which}.csv`);
}

export interface BackupStatus {
  cls: 'ok' | 'warn' | 'error';
  text: string;
  title: string;
}

export function backupStatus(s: { storageError: boolean; unbacked: boolean; fileSavedAt: number | null }): BackupStatus {
  if (s.storageError) {
    return { cls: 'error', text: 'Not saved', title: 'This browser’s storage is full, so recent changes are not saved. Use Save to download a copy now.' };
  }
  if (s.unbacked) {
    return {
      cls: 'warn',
      text: 'Not backed up',
      title: `Saved in this browser only${s.fileSavedAt ? ` (last file backup ${timeAgo(s.fileSavedAt)})` : ''}. Save a backup file — browser storage can be cleared.`,
    };
  }
  if (s.fileSavedAt) return { cls: 'ok', text: `Backed up ${timeAgo(s.fileSavedAt)}`, title: 'No changes since you last saved a file.' };
  return { cls: 'ok', text: 'Saved in browser', title: 'Your work is saved automatically in this browser.' };
}
