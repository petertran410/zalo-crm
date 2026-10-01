<template>
  <v-dialog v-model="open" max-width="520" persistent>
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon class="mr-2">mdi-account-group-outline</v-icon>
        Tạo nhóm mới
      </v-card-title>
      <v-card-text>
        <v-select v-if="accounts?.length" v-model="selectedAccountId" :items="accounts" item-title="displayName" item-value="id" label="Tài khoản Zalo" variant="outlined" density="comfortable" class="mb-3" />
        <v-text-field v-model="form.name" label="Tên nhóm" variant="outlined" density="comfortable" autofocus :rules="[v => !!v || 'Vui lòng nhập tên nhóm']" class="mb-3" />
        <template v-if="accounts?.length">
          <v-text-field v-model="friendSearch" label="Tìm bạn Zalo để thêm vào nhóm" prepend-inner-icon="mdi-magnify" variant="outlined" density="comfortable" hide-details />
          <div v-if="selectedMembers.length" class="group-create-selected">
            <v-chip v-for="member in selectedMembers" :key="member.uid" closable size="small" @click:close="removeMember(member.uid)">{{ member.name }}</v-chip>
          </div>
          <div class="group-create-results">
            <p v-if="friendLoading">Đang tải bạn bè…</p>
            <p v-else-if="friendError">{{ friendError }}</p>
            <p v-else-if="friendResults.length === 0">Không tìm thấy bạn Zalo.</p>
            <button v-for="friend in friendResults" :key="friend.zaloUidInNick" type="button" class="group-create-friend" :disabled="selectedMembers.some((member) => member.uid === friend.zaloUidInNick)" @click="addMember(friend)">
              <span>{{ friend.zaloDisplayName || friend.contact?.fullName || friend.zaloUidInNick }}</span>
              <v-icon size="18">{{ selectedMembers.some((member) => member.uid === friend.zaloUidInNick) ? 'mdi-check' : 'mdi-plus' }}</v-icon>
            </button>
          </div>
          <details class="group-create-manual">
            <summary>Nhập ID thành viên thủ công</summary>
            <v-textarea v-model="memberInput" label="ID thành viên" variant="outlined" density="comfortable" placeholder="Các ID cách nhau bởi dấu phẩy hoặc xuống dòng" rows="2" hide-details />
          </details>
        </template>
        <v-textarea v-else v-model="memberInput" label="ID thành viên" variant="outlined" density="comfortable" placeholder="Nhập các ID cách nhau bởi dấu phẩy hoặc xuống dòng" hint="VD: 123456, 789012" rows="3" persistent-hint />
      </v-card-text>
      <v-card-actions class="px-4 pb-4">
        <v-spacer />
        <v-btn variant="text" :disabled="busy" @click="cancel">Hủy</v-btn>
        <v-btn color="primary" variant="elevated" :loading="busy" :disabled="!canSubmit" @click="submit">Tạo nhóm</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { api } from '@/api';

interface AccountOption { id: string; displayName: string | null }
interface FriendOption {
  zaloUidInNick: string;
  zaloDisplayName: string | null;
  contact?: { fullName: string | null } | null;
}
interface SelectedMember { uid: string; name: string }

const props = defineProps<{
  modelValue: boolean;
  accounts?: AccountOption[];
  defaultAccountId?: string | null;
  busy?: boolean;
  autoClose?: boolean;
}>();
const emit = defineEmits<{
  'update:modelValue': [val: boolean];
  create: [payload: { name: string; memberIds: string[]; accountId?: string }];
}>();

const open = ref(props.modelValue);
const form = ref({ name: '' });
const memberInput = ref('');
const selectedAccountId = ref<string | null>(null);
const friendSearch = ref('');
const friendResults = ref<FriendOption[]>([]);
const selectedMembers = ref<SelectedMember[]>([]);
const friendLoading = ref(false);
const friendError = ref('');
let friendRequestId = 0;
let friendTimer: ReturnType<typeof setTimeout> | null = null;

watch(() => props.modelValue, (value) => {
  open.value = value;
  if (value) selectedAccountId.value = props.defaultAccountId || props.accounts?.[0]?.id || null;
  else reset();
});
watch(open, (value) => emit('update:modelValue', value));
watch(selectedAccountId, () => {
  selectedMembers.value = [];
  friendSearch.value = '';
});
watch([open, selectedAccountId, friendSearch], () => {
  friendRequestId++;
  if (friendTimer) clearTimeout(friendTimer);
  if (!open.value || !selectedAccountId.value || !props.accounts?.length) {
    friendResults.value = [];
    friendLoading.value = false;
    return;
  }
  friendTimer = setTimeout(() => void loadFriends(++friendRequestId), 250);
});

const canSubmit = computed(() => !!form.value.name.trim()
  && (!props.accounts?.length || !!selectedAccountId.value)
  && (selectedMembers.value.length > 0 || parseMemberIds().length > 0));

async function loadFriends(requestId: number) {
  const accountId = selectedAccountId.value;
  if (!accountId) return;
  friendLoading.value = true;
  friendError.value = '';
  try {
    const response = await api.get<{ friends?: FriendOption[] }>(`/zalo-accounts/${accountId}/friends-db`, {
      params: { kind: 'all', page: 1, limit: 50, search: friendSearch.value.trim() },
    });
    if (requestId === friendRequestId) friendResults.value = (response.data.friends || []).filter((friend) => !!friend.zaloUidInNick);
  } catch {
    if (requestId === friendRequestId) friendError.value = 'Không tải được danh sách bạn Zalo.';
  } finally {
    if (requestId === friendRequestId) friendLoading.value = false;
  }
}

function addMember(friend: FriendOption) {
  if (selectedMembers.value.some((member) => member.uid === friend.zaloUidInNick)) return;
  selectedMembers.value.push({ uid: friend.zaloUidInNick, name: friend.zaloDisplayName || friend.contact?.fullName || friend.zaloUidInNick });
}

function removeMember(uid: string) {
  selectedMembers.value = selectedMembers.value.filter((member) => member.uid !== uid);
}

function parseMemberIds(): string[] {
  return [...new Set(memberInput.value.split(/[\n,]+/).map((value) => value.trim()).filter(Boolean))];
}

function submit() {
  if (!canSubmit.value) return;
  emit('create', {
    name: form.value.name.trim(),
    memberIds: [...new Set([...selectedMembers.value.map((member) => member.uid), ...parseMemberIds()])],
    ...(selectedAccountId.value ? { accountId: selectedAccountId.value } : {}),
  });
  if (props.autoClose !== false) cancel();
}

function reset() {
  friendRequestId++;
  if (friendTimer) clearTimeout(friendTimer);
  form.value.name = '';
  memberInput.value = '';
  selectedAccountId.value = null;
  selectedMembers.value = [];
  friendResults.value = [];
  friendSearch.value = '';
  friendError.value = '';
  friendLoading.value = false;
}

function cancel() {
  open.value = false;
  reset();
}
</script>

<style scoped>
.group-create-selected { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0; }
.group-create-results { max-height: 200px; overflow-y: auto; margin-top: 8px; border: 1px solid #e4e9f0; border-radius: 8px; }
.group-create-results p { margin: 0; padding: 12px; color: #62748e; font-size: 12px; }
.group-create-friend { display: flex; width: 100%; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; border: 0; border-bottom: 1px solid #edf1f7; background: #fff; color: #26364b; text-align: left; cursor: pointer; }
.group-create-friend:last-child { border-bottom: 0; }
.group-create-friend:hover { background: #f4f8fd; }
.group-create-friend:disabled { color: #77879b; cursor: default; }
.group-create-manual { margin-top: 12px; color: #62748e; font-size: 12px; }
.group-create-manual summary { margin-bottom: 8px; cursor: pointer; }
</style>
