// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, shallowMount } from '@vue/test-utils';
import { ref } from 'vue';
import ConversationList from './ConversationList.vue';
import type { Conversation } from '@/composables/use-chat';

vi.mock('@/api/index', () => ({
  api: { get: vi.fn(async (path: string) => ({ data: path.endsWith('sidebar-tags') ? { crmTags: ['TEST'], zaloTags: [] } : {} })) },
}));
vi.mock('@/composables/use-privacy-visibility', () => ({
  usePrivacyVisibility: () => ({ shouldBlurConv: () => false, isOwnerOfPrivateNick: () => true }),
}));
vi.mock('@/composables/use-crm-tag-defs', () => ({
  loadTagDefs: vi.fn(), isZaloManaged: () => false, cleanTagName: (name: string) => name, tagColor: () => '#64748b',
}));
vi.mock('@/composables/use-tag-taxonomy', () => ({
  loadTagTaxonomy: vi.fn(), findTagBySlug: () => undefined, useTagTaxonomy: () => ({ taxonomyVersion: ref(0) }),
}));
vi.mock('@/components/chat/NewMessageDialog.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/components/chat/conversation-context-menu.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/components/zalo-accounts/NickPickerPopup.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/components/chat/ConvTime.vue', () => ({ default: { template: '<span>Hôm nay</span>' } }));

const conversation = {
  id: 'test-conversation', threadType: 'user', unreadCount: 2,
  contact: { id: 'test-contact', fullName: 'Khách thử nghiệm', tags: [] },
  messages: [], lastMessage: null, friendship: null, zaloAccount: null,
} as unknown as Conversation;

const wrappers: ReturnType<typeof shallowMount>[] = [];
function mountList(minimal = true) {
  const wrapper = shallowMount(ConversationList, {
    props: { minimal, conversations: [conversation], selectedId: null, loading: false, search: '', channelFilter: null },
    global: { stubs: { 'v-menu': true, 'v-icon': true } },
  });
  wrappers.push(wrapper);
  return wrapper;
}
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); });

describe('Minimal conversation list', () => {
  it('keeps the legacy toolbar when minimal is disabled', () => {
    const wrapper = mountList(false);
    expect(wrapper.find('.cl-inbox-header').exists()).toBe(true);
    expect(wrapper.find('.cl-minimal-header').exists()).toBe(false);
  });

  it('selects a conversation with its labeled native button', async () => {
    const wrapper = mountList();
    const button = wrapper.get('button.ci-select-control');
    expect(button.attributes('aria-label')).toContain('Khách thử nghiệm');
    await button.trigger('click');
    expect(wrapper.emitted('select')).toEqual([['test-conversation']]);
    await wrapper.setProps({ selectedId: 'test-conversation' });
    expect(button.attributes('aria-pressed')).toBe('true');
  });

  it('preserves search and clear behavior', async () => {
    const wrapper = mountList();
    await wrapper.get('input[type="search"]').setValue('An');
    expect(wrapper.emitted('update:search')?.at(-1)).toEqual(['An']);
    await wrapper.setProps({ search: 'An' });
    await wrapper.get('button[aria-label="Xóa tìm kiếm"]').trigger('click');
    expect(wrapper.emitted('update:search')?.at(-1)).toEqual(['']);
  });

  it('emits channel and tag filters and clears the tag explicitly', async () => {
    const wrapper = mountList();
    await flushPromises();
    const fields = wrapper.findAll('select');
    await fields[0].setValue('facebook');
    expect(wrapper.emitted('update:channelFilter')?.at(-1)).toEqual(['facebook']);
    expect(fields[0].get('option[value="tiktok_shop"]').attributes('disabled')).toBeDefined();
    await fields[1].setValue('TEST');
    expect(wrapper.emitted('update:filters')?.at(-1)).toEqual([{ tab: 'main', tags: 'TEST' }]);
    await fields[1].setValue('');
    expect(wrapper.emitted('update:filters')?.at(-1)).toEqual([{ tab: 'main', tags: '' }]);
  });

  it('opens advanced filters without replacing the original filter engine', async () => {
    const wrapper = mountList();
    await wrapper.get('.cl-minimal-action').trigger('click');
    expect(wrapper.emitted('open-filters')).toEqual([[]]);
  });
});
