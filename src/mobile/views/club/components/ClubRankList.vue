<!-- ============================================================
 * 俱乐部类榜单的「行」（俱乐部榜 / 黄金积分榜 / 伟大航路积分榜共用）
 * 只负责画，不管取数：
 *   名次 / 俱乐部 logo / 名称 + 联盟 tag / 服务器·红淬·战力 / 前三车头 / 积分（可选）
 * 行本身不能点（里面已经有车头按钮，button 不能嵌套），点车头头像抛 open-player，
 * 由外层接 RankPlayerSheet（玩家详情 + 切磋 + 武将）。
 * ============================================================ -->
<template>
  <div class="cr-list">
    <div v-for="r in rows" :key="r.key" class="cr-row">
      <span class="cr-rank" :class="{ top: r.rank <= 3 }">{{ r.rank || "-" }}</span>
      <img v-if="r.logo" class="cr-logo" :src="r.logo" alt="" @error="onImgError" />
      <span v-else class="cr-logo cr-logo--ph">{{ (r.name || "?").charAt(0) }}</span>

      <span class="cr-body">
        <span class="cr-l1">
          <span class="cr-nm">{{ r.name || "未知俱乐部" }}</span>
          <span v-if="r.alliance && r.alliance !== '未知联盟'" class="cr-tag">
            {{ r.alliance }}
          </span>
        </span>

        <span class="cr-meta">
          服务器 {{ r.serverId || "-" }} · 红淬 {{ r.redQuench || 0 }} · {{ r.powerText }}
        </span>
      </span>

      <span v-if="scoreLabel" class="cr-tail">
        <b class="cr-score">{{ r.scoreText }}</b>
        <small class="cr-score-lb">{{ scoreLabel }}</small>
      </span>

      <!-- 前三车头：点开就是玩家详情（含切磋、武将）
           ★ 放在 .cr-row 的直接子代（grid-column: 2 / -1），而不是塞进名称列：
             塞进名称列只有 284px 可用，三枚胶囊各 90px，名字只能留 4 个字。 -->
      <span v-if="r.topHeroes.length" class="cr-heroes">
        <button
          v-for="h in r.topHeroes"
          :key="h.id"
          class="cr-h"
          :class="{ 'is-pending': String(pendingId) === String(h.id) }"
          @click="$emit('open-player', h)"
        >
          <img v-if="h.headImg" class="cr-h-ava" :src="h.headImg" alt="" @error="onImgError" />
          <span v-else class="cr-h-ava cr-h-ava--ph">{{ (h.name || "?").charAt(0) }}</span>
          <i class="cr-h-nm">{{ h.name }}</i>
        </button>
      </span>
      <!-- 详情还没回来：先占位，避免列表在补齐时上下跳 -->
      <span v-else-if="!r.detailLoaded" class="cr-heroes cr-heroes--ph">
        <i></i><i></i><i></i>
      </span>
    </div>
  </div>
</template>

<script setup>
defineProps({
  rows: { type: Array, default: () => [] },
  /* 积分列的表头文字；空串 = 这个榜没有积分列（俱乐部榜） */
  scoreLabel: { type: String, default: "" },
  pendingId: { type: [Number, String], default: 0 },
});

defineEmits(["open-player"]);

const onImgError = (e) => {
  e.target.src = "/icons/xiaoyugan.png";
};
</script>

<style scoped>
.cr-list {
  display: flex;
  flex-direction: column;
  background: var(--m-card);
}
.cr-row {
  display: grid;
  grid-template-columns: 24px 34px minmax(0, 1fr) auto;
  align-items: start;
  gap: 10px;
  padding: 11px 14px;
  border-bottom: 1px solid var(--m-band);
}
.cr-row:last-child {
  border-bottom: none;
}

.cr-rank {
  width: 24px;
  height: 24px;
  margin-top: 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--m-r-sm);
  background: var(--m-bg);
  font-size: 11.5px;
  font-weight: 700;
  color: var(--m-text2) !important;
  font-variant-numeric: tabular-nums;
}
.cr-rank.top {
  background: var(--m-primary);
  color: var(--m-on-primary) !important;
}

.cr-logo {
  width: 34px;
  height: 34px;
  border-radius: var(--m-r-sm);
  object-fit: cover;
  background: var(--m-bg);
}
.cr-logo--ph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  color: var(--m-text3) !important;
}

.cr-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.cr-l1 {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}
.cr-nm {
  font-size: 14px;
  font-weight: 600;
  color: var(--m-text) !important;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cr-tag {
  flex: none;
  font-size: 10px;
  line-height: 15px;
  padding: 0 5px;
  border-radius: 3px;
  background: var(--m-primary-soft);
  color: var(--m-primary) !important;
  font-weight: 500;
}
.cr-meta {
  font-size: 11px;
  color: var(--m-text3) !important;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

/* ---------- 前三车头 ----------
   ★ 三个胶囊等分可用宽度（flex:1 1 0 + min-width:0），名字自己省略。
   写 max-width 固定宽会溢出：390 下三枚加起来 300px，比列宽 284px 还宽，第三枚被硬切一刀。 */
.cr-heroes {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  grid-column: 2 / -1;
}
.cr-h {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: 1 1 0;
  min-width: 0;
  max-width: 116px;
  padding: 2px 6px 2px 2px;
  background: var(--m-bg);
  border: none;
  border-radius: var(--m-r-sm);
  font-family: inherit;
  cursor: pointer;
  text-align: left;
}
.cr-h:active {
  opacity: 0.6;
}
/* 点完保留焦点框会像多了一圈描边，手机上很脏 */
.cr-h:focus,
.cr-h:focus-visible {
  outline: none;
}
.cr-h.is-pending {
  opacity: 0.5;
}
.cr-h-ava {
  width: 18px;
  height: 18px;
  border-radius: 3px;
  object-fit: cover;
  flex: none;
  background: var(--m-card);
}
.cr-h-ava--ph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 600;
  color: var(--m-text3) !important;
}
.cr-h-nm {
  font-style: normal;
  font-size: 11px;
  line-height: 14px;
  color: var(--m-text2) !important;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 车头详情加载中的占位（与真实 chip 同高，列表不跳） */
.cr-heroes--ph i {
  display: block;
  width: 56px;
  height: 22px;
  border-radius: var(--m-r-sm);
  background: var(--m-band);
  animation: cr-pulse 1.3s ease-in-out infinite;
}

.cr-tail {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
  flex: none;
  margin-top: 3px;
}
.cr-score {
  font-size: 13px;
  font-weight: 700;
  color: var(--m-text) !important;
  font-variant-numeric: tabular-nums;
}
.cr-score-lb {
  font-size: 10px;
  color: var(--m-text3) !important;
}

@keyframes cr-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

@media (max-width: 359px) {
  .cr-row { grid-template-columns: 22px 30px minmax(0, 1fr) auto; gap: 8px; padding: 10px 12px; }
  .cr-rank { width: 22px; height: 22px; font-size: 11px; }
  .cr-logo { width: 30px; height: 30px; }
  .cr-nm { font-size: 13.5px; }
  .cr-h { max-width: 88px; }
}
</style>

<script>
export default { name: "MobileClubRankList" };
</script>
