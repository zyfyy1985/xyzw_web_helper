<!-- ============================================================
 * 切磋（移动端原生版）
 * 桌面版 FightPvp.vue 是「7 个 fieldset + 一张 800px 卡 + 属性表 + 5 列武将卡」，
 * 塞进 390px 后输入组错位、按钮灰掉、中间一大片空白（用户截图就是这个）。
 * 这里只保留一个「查对手」入口：查到人就把站内既有的玩家详情卡（PlayerSheet）
 * 直接铺在输入卡下面，与排行榜点人的内容完全一致，只是不再从底部弹抽屉。
 *
 * 全部复用站内既有组件，不重写业务：
 *   usePlayerInfo.js  rank_getroleinfo 查人 + 归一化（总红 / 总开孔 / 武将列表）
 *   PlayerSheet.vue   玩家详情卡（战力 / 服务器 / 俱乐部 / 红孔 / 武将阵容）—— inline 模式
 *   DuelBlock.vue     连续切磋：次数输入 + 进度条 + 逐场战报 + 胜率（fight_startpvp）
 *   HeroSheet.vue     单个武将详情
 * ============================================================ -->
<template>
  <div class="m-pane m-desk m-fpvp">
    <!-- ① 查对手 -->
    <div class="m-card">
      <div class="m-card-h">
        <span class="m-t">
          <MIcon name="swords" :size="14" class="fpvp-ico" />切磋系统
        </span>
        <span class="m-more">{{ connected ? "已连接" : "游戏未连接" }}</span>
      </div>

      <div class="fpvp-q">
        <input
          v-model="idText"
          class="m-finput fpvp-in"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          placeholder="对手角色 ID"
          @input="onIdInput"
          @keyup.enter="doQuery"
        />
        <button
          type="button"
          class="m-btn m-btn-p fpvp-go"
          :disabled="querying || !idText"
          @click="doQuery"
        >
          {{ querying ? "查询中…" : "查询对手" }}
        </button>
      </div>

      <p class="m-hint fpvp-hint">
        填对手的角色 ID（纯数字，可从排行榜 / 盐场里复制），查到后对手信息直接显示在下方。
      </p>
    </div>

    <!-- ② 查到的对手：还是那张 PlayerSheet，只是换成 inline 铺在页面里，不从底部弹出。
         铺平后盒子高度=内容高度 ⇒ 导出长图不会被裁剪（抽屉是 max-height:82% + overflow-y:auto）。 -->
    <PlayerSheet inline :player="player" :loading="querying" @open-hero="openHero">
      <template #mid>
        <!-- 连续切磋 + 结果导出都由 DuelBlock 自己带（按钮「导出结果」导整块对手信息） -->
        <DuelBlock :player="player" />
      </template>
    </PlayerSheet>

    <!-- ③ 空态（查询中由 PlayerSheet 自己的「正在查询成员信息…」占位，这里不再叠一层） -->
    <div v-if="!player && !querying" class="m-card">
      <div class="m-empty" style="padding: 30px 0">
        <div class="m-logo">⚔️</div>
        <h3>还没有对手</h3>
        <p>
          {{
            connected
              ? "在上面填对手的角色 ID，点「查询对手」"
              : "先到 Token 管理里连上游戏服务器"
          }}
        </p>
      </div>
    </div>

    <HeroSheet v-model="heroDetail" :hero="currentHero" />
  </div>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { useMessage } from "naive-ui";
import { useTokenStore } from "@/stores/tokenStore";
import MIcon from "@/mobile/components/MIcon.vue";
import PlayerSheet from "../components/PlayerSheet.vue";
import HeroSheet from "../components/HeroSheet.vue";
import DuelBlock from "../components/DuelBlock.vue";
import { usePlayerInfo } from "../components/usePlayerInfo.js";

const tokenStore = useTokenStore();
const message = useMessage();

/* 战斗版本号由 ClubPage 统一预热（useBattleVersionWarmup），本面板不再重复发 fight_startlevel */

const idText = ref("");
const querying = ref(false);
const heroDetail = ref(false);
const currentHero = ref(null);

const connected = computed(
  () => tokenStore.getWebSocketStatus(tokenStore.selectedToken?.id) === "connected",
);

/* silent：结果直接铺在页面上，不需要「查询成功」toast */
const { player, fetchPlayer, reset } = usePlayerInfo({ silent: true });

const onIdInput = (e) => {
  /* 角色 ID 是纯数字：把误粘贴进来的空格/汉字直接抹掉，省得发一条必然失败的查询 */
  const clean = String(e.target.value || "").replace(/\D/g, "").slice(0, 12);
  idText.value = clean;
  e.target.value = clean;
};

const doQuery = async () => {
  const roleId = String(idText.value || "").trim();
  if (!roleId) {
    message.warning("请先输入对手角色 ID");
    return;
  }
  if (querying.value) return;
  querying.value = true;
  try {
    /* 查到人 PlayerSheet 自己会从「正在查询」切成详情卡；
       查不到（ID 写错 / 服务端无此人）保持空态，toast 已经在 usePlayerInfo 里给过 */
    await fetchPlayer(roleId);
  } finally {
    querying.value = false;
  }
};

const openHero = (hero) => {
  currentHero.value = hero;
  heroDetail.value = true;
};

/* 换号：清掉上一个账号查过的对手，避免拿 A 号的 ID 在 B 号上切磋 */
watch(
  () => tokenStore.selectedToken?.id,
  () => {
    player.value = null;
    reset();
    heroDetail.value = false;
  },
);
</script>

<style scoped>
.m-fpvp {
  padding-bottom: 4px;
}
.fpvp-ico {
  display: inline-block;
  margin-right: 4px;
  vertical-align: -2px;
  color: var(--m-primary);
}

/* 输入 + 主行动：等高并排，390 下按钮 ~92px、输入仍留 200px 以上 */
.fpvp-q {
  display: flex;
  align-items: stretch;
  gap: 8px;
}
.fpvp-in {
  flex: 1 1 auto;
  min-width: 0;
  height: 40px;
  padding: 0 12px;
  font-size: 14px;
  font-weight: 600;
  color: var(--m-text);
}
.fpvp-in::placeholder {
  font-weight: 400;
  color: var(--m-text3);
  font-size: 13px;
}
/* .m-btn-p 默认 min-height 44（那是给登录页整宽 CTA 的），卡片内的动作压到 40 */
.fpvp-go {
  flex: none;
  min-height: 40px;
  padding: 0 16px;
  font-size: 13.5px;
}
.fpvp-hint {
  margin: 8px 0 0;
}

/* 内联的 PlayerSheet 就是 .m-pane 的普通子项，12px 间距由 .m-pane 的 gap 给，这里不用再写 */

@media (max-width: 359px) {
  .fpvp-in {
    font-size: 13px;
  }
  .fpvp-go {
    padding: 0 12px;
    font-size: 13px;
  }
}
</style>

<script>
export default { name: "MobileFightPvpPanel" };
</script>
