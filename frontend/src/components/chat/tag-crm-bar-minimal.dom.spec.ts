// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import TagCrmBar from './TagCrmBar.vue';
import { api } from '@/api/index';

vi.mock('@/api/index', () => ({ api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
vi.mock('@/composables/use-toast', () => ({ useToast: () => ({ error: vi.fn() }) }));
vi.mock('@/composables/use-friend-socket', () => ({ useFriendSocket: vi.fn() }));
vi.mock('@/composables/use-tag-taxonomy', () => ({ refreshTagTaxonomy: vi.fn() }));

const tag = { id: 'tag-test', slug: 'khach-thu', name: 'Khách thử', color: '#2164ef', emoji: null, source: 'manual_per_nick', scope: 'friend', priority: 1 };
const assignment = { id: 'assignment-test', tag, removedAt: null };
const passthrough = { template: '<div><slot /></div>' };
const wrappers: ReturnType<typeof mount>[] = [];
let assigned = false;
function mountBar(minimal = true) {
  const wrapper = mount(TagCrmBar, {
    props: { minimal, friendId: 'friend-test', contactId: 'contact-test' },
    global: { stubs: {
      'v-dialog': { props: ['modelValue'], template: '<div v-if="modelValue" role="dialog"><slot /></div>' },
      'v-card': passthrough, 'v-card-title': passthrough, 'v-card-subtitle': passthrough,
      'v-card-text': passthrough, 'v-card-actions': passthrough, 'v-spacer': true,
      'v-btn': { template: '<button><slot /></button>' },
    } },
  });
  wrappers.push(wrapper);
  return wrapper;
}
beforeEach(() => {
  vi.clearAllMocks();
  assigned = false;
  vi.mocked(api.get).mockImplementation(async (path) => ({ data: path === '/tags' ? { tags: [tag] } : { friendTags: assigned ? [assignment] : [] } }));
  vi.mocked(api.post).mockImplementation(async () => { assigned = true; return { data: { assignment } }; });
  vi.mocked(api.delete).mockImplementation(async () => { assigned = false; return { data: {} }; });
});
afterEach(() => wrappers.splice(0).forEach(wrapper => wrapper.unmount()));

describe('Minimal CRM tag management', () => {
  it('uses a passive summary and opens the real management dialog on demand', async () => {
    const wrapper = mountBar();
    await flushPromises();
    expect(wrapper.findAll('button')).toHaveLength(0);
    expect(wrapper.text()).toContain('Chưa có nhãn');
    wrapper.vm.openManager();
    await flushPromises();
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
    const option = wrapper.findAll('.minimal-tag-option').find(button => button.text() === 'Khách thử')!;
    await option.trigger('click');
    await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/friends/friend-test/tags', expect.objectContaining({ tagId: tag.id }));
    expect(wrapper.get('.minimal-tag-summary').text()).toContain('Khách thử');
    await option.trigger('click');
    await flushPromises();
    expect(api.delete).toHaveBeenCalledWith('/friends/friend-test/tags/tag-test');
    expect(wrapper.get('.minimal-tag-summary').text()).toContain('Chưa có nhãn');
  });

  it('closes the manager when switching customers', async () => {
    const wrapper = mountBar();
    wrapper.vm.openManager();
    await flushPromises();
    await wrapper.setProps({ friendId: 'another-friend' });
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  });

  it('retains the original inline tag buttons by default', async () => {
    const wrapper = mountBar(false);
    await flushPromises();
    expect(wrapper.find('.qt-chips-wrapper').exists()).toBe(true);
    expect(wrapper.findAll('.qt-chip').length).toBeGreaterThan(0);
    expect(wrapper.find('.minimal-tag-summary').exists()).toBe(false);
  });
});
