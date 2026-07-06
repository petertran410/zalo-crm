// Phase 7 — Block content validator unit tests.
//
// Covers `validateBlockContent` for all 3 supported actionTypes in phase G,
// plus rejection paths for malformed payloads.

import { describe, it, expect } from 'vitest';
import {
  validateBlockContent,
  isSupportedActionType,
  SUPPORTED_ACTION_TYPES,
} from '../src/modules/automation/blocks/types.js';

describe('isSupportedActionType', () => {
  it('accepts the 3 phase-7 action types', () => {
    expect(isSupportedActionType('request_friend')).toBe(true);
    expect(isSupportedActionType('send_message')).toBe(true);
    expect(isSupportedActionType('update_status')).toBe(true);
  });

  it('rejects reserved-but-not-yet-supported action types', () => {
    expect(isSupportedActionType('send_image')).toBe(false);
    expect(isSupportedActionType('assign_user')).toBe(false);
  });

  it('rejects unknown strings', () => {
    expect(isSupportedActionType('bogus')).toBe(false);
    expect(isSupportedActionType('')).toBe(false);
    expect(isSupportedActionType(undefined)).toBe(false);
    expect(isSupportedActionType(123)).toBe(false);
  });

  it('exposes the 3 phase-7 types in SUPPORTED_ACTION_TYPES', () => {
    expect(SUPPORTED_ACTION_TYPES).toEqual([
      'request_friend',
      'send_message',
      'update_status',
    ]);
  });
});

describe('validateBlockContent — request_friend', () => {
  it('accepts valid content', () => {
    const r = validateBlockContent('request_friend', {
      greetingVariants: ['Chào anh', 'Hi anh ạ'],
    });
    expect(r.ok).toBe(true);
  });

  it('rejects empty variant list', () => {
    const r = validateBlockContent('request_friend', { greetingVariants: [] });
    expect(r.ok).toBe(false);
  });

  it('rejects non-array variants', () => {
    const r = validateBlockContent('request_friend', { greetingVariants: 'hi' });
    expect(r.ok).toBe(false);
  });

  it('rejects empty-string variant', () => {
    const r = validateBlockContent('request_friend', { greetingVariants: ['ok', '   '] });
    expect(r.ok).toBe(false);
  });

  it('rejects non-string variant', () => {
    const r = validateBlockContent('request_friend', { greetingVariants: ['ok', 123] });
    expect(r.ok).toBe(false);
  });
});

describe('validateBlockContent — send_message', () => {
  it('accepts text-only content', () => {
    const r = validateBlockContent('send_message', { textVariants: ['Hello'] });
    expect(r.ok).toBe(true);
  });

  it('accepts with valid attachments', () => {
    const r = validateBlockContent('send_message', {
      textVariants: ['Xem layout nhé'],
      attachments: [{ kind: 'image', url: 'https://x/y.jpg', caption: 'L1' }],
    });
    expect(r.ok).toBe(true);
  });

  it('rejects empty textVariants', () => {
    const r = validateBlockContent('send_message', { textVariants: [] });
    expect(r.ok).toBe(false);
  });

  it('rejects attachment with bad kind', () => {
    const r = validateBlockContent('send_message', {
      textVariants: ['ok'],
      attachments: [{ kind: 'video', url: 'https://x' }],
    });
    expect(r.ok).toBe(false);
  });

  it('rejects attachment without url', () => {
    const r = validateBlockContent('send_message', {
      textVariants: ['ok'],
      attachments: [{ kind: 'image' }],
    });
    expect(r.ok).toBe(false);
  });
});

describe('validateBlockContent — update_status', () => {
  it('accepts minimal content', () => {
    const r = validateBlockContent('update_status', { statusId: 'status-warm' });
    expect(r.ok).toBe(true);
  });

  it('accepts with onlyFromStatusIds guard', () => {
    const r = validateBlockContent('update_status', {
      statusId: 'status-hot',
      onlyFromStatusIds: ['status-warm', 'status-cold'],
    });
    expect(r.ok).toBe(true);
  });

  it('rejects missing statusId', () => {
    const r = validateBlockContent('update_status', {});
    expect(r.ok).toBe(false);
  });

  it('rejects non-array onlyFromStatusIds', () => {
    const r = validateBlockContent('update_status', {
      statusId: 'x',
      onlyFromStatusIds: 'not-an-array',
    });
    expect(r.ok).toBe(false);
  });
});

describe('validateBlockContent — error paths', () => {
  it('rejects null content', () => {
    const r = validateBlockContent('send_message', null);
    expect(r.ok).toBe(false);
  });

  it('rejects primitive content', () => {
    const r = validateBlockContent('send_message', 'oops');
    expect(r.ok).toBe(false);
  });

  it('rejects reserved-but-not-ship action type', () => {
    // Cast around the type since validator must defend at runtime.
    const r = validateBlockContent('send_image' as unknown as 'request_friend', {});
    expect(r.ok).toBe(false);
  });
});
