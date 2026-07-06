/** Community stub — automation block API (open-core). No blocks exist. */
import type { Block } from './types';

export interface SendBlockResult {
  accepted?: boolean;
  partial?: boolean;
  sentCount?: number;
  totalMessages?: number;
  errors?: unknown[];
}

export async function listBlocks(): Promise<Block[]> {
  return [];
}

export async function listRecentBlocks(): Promise<Block[]> {
  return [];
}

export async function sendBlockToConversation(
  _conversationId: string,
  _blockId: string,
): Promise<SendBlockResult> {
  return { accepted: false, partial: false, sentCount: 0, totalMessages: 0, errors: [] };
}
