// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CreateUserModal from './CreateUserModal.vue';
import { api } from '@/api/index';

vi.mock('@/api/index', () => ({
  api: {
    post: vi.fn(),
  },
}));

const postMock = vi.mocked(api.post);

function mountModal() {
  return mount(CreateUserModal, {
    props: {
      open: true,
      departments: [{ id: 'dept-1', name: 'Kinh doanh', _depth: 0 }],
      permissionGroups: [{ id: 'group-1', name: 'Sale', _depth: 0 }],
    },
  });
}

describe('CreateUserModal', () => {
  beforeEach(() => {
    postMock.mockReset();
    postMock.mockResolvedValue({
      data: {
        id: 'user-1',
        fullName: 'Nguyễn Văn A',
        email: 'sale@example.com',
        phone: null,
        role: 'member',
      },
    });
  });

  it('creates an email/password account without Zalo linking', async () => {
    const wrapper = mountModal();
    const inputs = wrapper.findAll('input');

    await inputs[0].setValue('Nguyễn Văn A');
    await inputs[1].setValue('Sale@Example.com');
    await inputs[2].setValue('Secure123');
    await wrapper.findAll('select')[0].setValue('dept-1');
    await wrapper.findAll('select')[1].setValue('group-1');
    await wrapper.get('button.btn-primary').trigger('click');

    expect(postMock).toHaveBeenCalledTimes(1);
    expect(postMock).toHaveBeenCalledWith('/users', {
      fullName: 'Nguyễn Văn A',
      email: 'sale@example.com',
      password: 'Secure123',
      phone: null,
      departmentId: 'dept-1',
      permissionGroupId: 'group-1',
      role: 'member',
    });
    expect(postMock.mock.calls[0][0]).not.toContain('zalo');
    expect(wrapper.text()).toContain('Đã tạo Nguyễn Văn A');
  });

  it('shows the API error and remains on the form', async () => {
    postMock.mockRejectedValue({ response: { data: { error: 'Email đã tồn tại' } } });
    const wrapper = mountModal();
    const inputs = wrapper.findAll('input');

    await inputs[0].setValue('Nguyễn Văn A');
    await inputs[1].setValue('sale@example.com');
    await inputs[2].setValue('Secure123');
    await wrapper.get('button.btn-primary').trigger('click');

    expect(wrapper.text()).toContain('Email đã tồn tại');
    expect(wrapper.text()).toContain('Email đăng nhập');
  });
});
