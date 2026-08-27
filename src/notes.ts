import { invoke } from '@tauri-apps/api/core';

export type StoredNote = {
  id: string;
  accountId: string;
  title: string;
  commentsCount: number;
  storedComments: number;
  xsecToken?: string;
  syncedAt: number;
};

export type StoredComment = {
  id: string;
  noteId: string;
  authorId: string;
  nickname: string;
  avatarUrl?: string;
  content: string;
  commentedAt?: number;
  ipLocation?: string;
  likeCount: number;
  noteTitle?: string;
};

export type XhsNotePullResult = {
  noteId: string;
  pulled: number;
  upserted: number;
  message: string;
  verificationRequired: boolean;
};

export function storeListNotes(): Promise<StoredNote[]> {
  return invoke<StoredNote[]>('store_list_notes');
}

export function storeListComments(): Promise<StoredComment[]> {
  return invoke<StoredComment[]>('store_list_comments');
}

export function xhsSyncNotes(): Promise<StoredNote[]> {
  return invoke<StoredNote[]>('xhs_sync_notes');
}

export function xhsSyncNoteComments(noteId: string): Promise<XhsNotePullResult> {
  return invoke<XhsNotePullResult>('xhs_sync_note_comments', { noteId });
}

export function exportComments(
  comments: StoredComment[],
  fileName: string,
): Promise<string | null> {
  return invoke<string | null>('export_comments', { comments, fileName });
}
