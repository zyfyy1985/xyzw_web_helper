<template>
  <div class="m-page m-share">
    <!-- 标题不放页头条，用与「我的 → 账户信息」同款的卡头：本页是账号级设置，
         不是高频操作页，没必要在顶部再立一条 bar。两个 tab 用全站统一的 .m-seg。 -->
    <div class="m-card">
      <div class="m-card-h"><span class="m-t">角色授权</span></div>
      <div class="m-seg">
        <button :class="{ on: tab === 'owner' }" type="button" @click="tab = 'owner'">
          我发出的 {{ ownerRows.length }}
        </button>
        <button :class="{ on: tab === 'grantee' }" type="button" @click="tab = 'grantee'">
          我收到的 {{ granteeRows.length }}
        </button>
      </div>
      <p class="m-share-hint">
        {{ tab === "owner"
          ? "对方拿到凭证后可随时登录该角色；撤销后对方最迟 60 秒内失效。"
          : "这些是别人授权给你的角色，与自己的角色一样出现在角色列表里。" }}
      </p>
    </div>

    <!-- ============ 我发出的 ============ -->
    <template v-if="tab === 'owner'">
      <div v-if="ownerRows.length" class="m-card">
        <div
          v-for="g in ownerRows"
          :key="g.gid"
          class="m-trow"
          :class="{ 'm-share-off': stOf(g) !== 'active' }"
        >
          <span class="m-ib" :style="{ background: 'var(--m-primary-deep)' }">{{ initialOf(g.meta?.name) }}</span>
          <span class="m-body">
            <span class="m-nm">
              {{ g.meta?.name || "未命名角色" }} → {{ g.grantee }}
              <span class="m-tag" :class="tagClass(g)">{{ stText(g) }}</span>
            </span>
            <span class="m-ds">{{ expireText(g.expiresAt) }}</span>
          </span>
          <span class="m-rt">
            <button
              v-if="stOf(g) === 'active'"
              class="m-btn m-btn-g m-share-act"
              type="button"
              @click="revoke(g)"
            >
              撤销
            </button>
            <span v-else class="m-share-dim">—</span>
          </span>
        </div>
      </div>

      <div v-else class="m-card">
        <div class="m-empty">
          <div class="m-logo">◌</div>
          <h3>还没有授权给任何人</h3>
          <p>在「角色列表」里点某个账号右上角的「⋯」，选「授权给他人」。</p>
        </div>
      </div>
    </template>

    <!-- ============ 我收到的 ============ -->
    <template v-else>
      <div v-if="granteeRows.length" class="m-card">
        <div
          v-for="t in granteeRows"
          :key="t.id"
          class="m-trow"
          role="button"
          tabindex="0"
          @click="openTokens"
          @keydown.enter="openTokens"
        >
          <span class="m-ib" style="background: var(--m-primary-deep)">{{ initialOf(t.name) }}</span>
          <span class="m-body">
            <span class="m-nm">
              {{ t.name || "未命名角色" }}
              <span class="m-tag">{{ t.server || "未知区服" }}</span>
            </span>
            <span class="m-ds">{{ t.sharedFrom || "未知" }} 授权 · {{ expireText(t.expiresAt) }}</span>
          </span>
          <span class="m-rt">
            <button class="m-btn m-btn-g m-share-act" type="button" @click.stop="remove(t)">移除</button>
          </span>
        </div>
      </div>

      <div v-else class="m-card">
        <div class="m-empty">
          <div class="m-logo">◌</div>
          <h3>还没有收到授权</h3>
          <p>别人把角色授权给你之后，会出现在这里和角色列表里。</p>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
/* 「我的 → 角色授权」—— 发出 / 收到两侧的管理页。
 *
 * 数据来源刻意分成两条：
 *   · 发出侧：服务端的 `list role=owner`。授权方本地没有任何共享条目的副本
 *     （共享条目只在被授权方的 gameTokens 里），所以只能问服务端。
 *   · 收到侧：直接读 `gameTokens` 里 `shared: true` 的那些。它们才是「本机实际能用」
 *     的集合；服务端清单由 `tokenStore.refreshSharedGrants()` 对齐过来。
 *     如果这里再单独拉一次 list，两份数据会打架（撤销后一边有一边没有）。
 *
 * 撤销 / 移除都会走 confirmDanger（站内唯一确认入口），不做「点一下就没」。
 */
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useDialog, useMessage } from "naive-ui";
import { storeToRefs } from "pinia";
import { confirmDanger } from "@/mobile/utils/confirm";
import { useTokenStore } from "@/stores/tokenStore";

const router = useRouter();
const dialog = useDialog();
const message = useMessage();
const tokenStore = useTokenStore();
const { gameTokens } = storeToRefs(tokenStore);

const tab = ref("owner");
const ownerRows = ref([]);
const granteeRows = computed(() => (gameTokens.value || []).filter((t) => t.shared));

const initialOf = (name) => (name || "角").charAt(0);

function stOf(g) {
  if (g.state === "revoked") return "revoked";
  if (g.expiresAt && Date.now() >= g.expiresAt) return "expired";
  return "active";
}

function stText(g) {
  const st = stOf(g);
  if (st === "revoked") return "已撤销";
  if (st === "expired") return "已过期";
  // 5 分钟内有取凭证记录 = 对方正在用
  const seen = g.lastSeenAt ? Date.parse(g.lastSeenAt) : 0;
  if (seen && Date.now() - seen < 5 * 60 * 1000) return "使用中";
  return "已授权";
}

function tagClass(g) {
  const st = stOf(g);
  if (st !== "active") return "";
  return stText(g) === "使用中" ? "done" : "wait";
}

function expireText(ts) {
  if (!ts) return "有效期待同步";
  const left = ts - Date.now();
  if (left <= 0) return "已过期";
  const h = Math.floor(left / 3600000);
  if (h < 1) return `${Math.max(1, Math.floor(left / 60000))} 分钟后到期`;
  if (h < 24) return `${h} 小时后到期`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}-${d.getDate()} 到期`;
}

async function loadOwner() {
  const res = await tokenStore.listGrants("owner");
  if (res && res.ok) {
    ownerRows.value = res.grants || [];
  } else if (res && res.error === "unauthorized") {
    message.error("登录已过期，请重新登录");
  }
  return res;
}

onMounted(async () => {
  await Promise.all([loadOwner(), tokenStore.refreshSharedGrants()]);
});

function revoke(g) {
  confirmDanger(dialog, {
    title: "撤销授权",
    content: `撤销后「${g.grantee}」将立即失去对「${g.meta?.name || "该角色"}」的访问，本机凭证同时删除。`,
    positiveText: "确认撤销",
    onPositiveClick: async () => {
      const res = await tokenStore.revokeGrant(g.gid);
      if (res && res.ok) {
        message.success("已撤销");
        await loadOwner();
      } else {
        message.error(res?.message || "撤销失败，请重试");
      }
    },
  });
}

function remove(t) {
  confirmDanger(dialog, {
    title: "移除共享角色",
    content: `将从本机移除「${t.name || "该角色"}」，需要时可以让对方重新授权。`,
    positiveText: "确认移除",
    onPositiveClick: async () => {
      const res = await tokenStore.dropSharedToken(t.id);
      if (res && res.ok) {
        message.success("已移除");
      } else {
        message.error(res?.message || "移除失败，请重试");
      }
    },
  });
}

function openTokens() {
  router.push("/mobile/tokens");
}
</script>

<style scoped lang="scss">
.m-share-hint {
  margin: 10px 0 0;
  font-size: 11.5px;
  line-height: 1.55;
  color: var(--m-text3);
}
/* 已撤销 / 已过期：整行降透明度，右侧没有动作按钮。不靠颜色区分状态 ——
   状态本身用 .m-tag 表达，整行只做「这条不再有效」的弱化。 */
.m-share-off {
  opacity: 0.55;
}
/* 管理行里的动作按钮要小一号：.m-btn 是给「主行动」用的 32px 高，
   塞进 44px 高的 .m-trow 里会把行撑起来，整列看着像一排按钮。 */
.m-share-act {
  padding: 5px 11px;
  font-size: 12px;
  border-radius: var(--m-r-sm);
}
.m-share-dim {
  font-size: 12px;
  color: var(--m-text3);
}
</style>
