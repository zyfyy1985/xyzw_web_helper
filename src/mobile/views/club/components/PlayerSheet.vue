<template>
  <!-- 成员信息（俱乐部成员 / 盐场车头 / 蟠桃对手 / 切磋共用）
       字段严格对齐旧版「成员信息」弹窗：战力 + 服务器 + 俱乐部 + 总红数/总开孔/四圣 + 武将阵容

       inline：不套 .m-mask / .m-sheet 这层浮层，直接当一张普通白卡铺在页面流里。
         切磋面板要的就是这个 —— 一是不用从底部弹出来（用户 11-01 反馈），
         二是抽屉有 max-height:82% + overflow-y:auto，html2canvas 只截得到可视那一截，
         武将阵容必被裁；铺平后盒子高度=内容高度，导出长图才完整。 -->
  <div v-if="!inline" class="m-mask" :class="{ on: modelValue }" @click="close"></div>
  <div
    v-if="!inline || player || loading"
    :class="[inline ? ['m-card', 'ps-inline'] : 'm-sheet', !inline && modelValue ? 'on' : '']"
  >
    <div v-if="!inline" class="m-grab"></div>

    <template v-if="player">
      <header class="ps-title">
        <img v-if="player.headImg" :src="player.headImg" class="ps-ava" alt="" @error="onImgError" />
        <span v-else class="ps-ava ps-ava--ph">{{ (player.name || "?").charAt(0) }}</span>
        <span class="ps-main">
          <span class="ps-nm">{{ player.name || "成员信息" }}</span>
          <span class="ps-id">ID {{ player.roleId || "-" }}</span>
        </span>
      </header>

      <p v-if="loading" class="m-hint ps-loading">正在查询成员信息…</p>
      <template v-else>
        <div class="ps-rows">
          <div class="ps-row">
            <span>战力 <b class="ps-power">{{ fmtPower(player.power) }}</b></span>
            <span>服务器 <b>{{ player.serverName || "未知" }}</b></span>
          </div>
          <div class="ps-row">
            <span>俱乐部 <b>{{ player.legionName || "无" }}</b></span>
          </div>
          <div class="ps-row">
            <span>总红数 <b class="ps-red">{{ player.totalRed || 0 }}</b></span>
            <span>总开孔 <b>{{ player.totalHole || 0 }}</b></span>
            <span>四圣 <b class="ps-green">{{ player.holyBeast || 0 }}</b></span>
          </div>
        </div>

        <!-- 面板特有内容（切磋入口 / 进度 / 结果）：落在信息块之下、武将阵容之上 -->
        <slot name="mid" />

        <div class="ps-sec">武将阵容</div>
        <p class="ps-cnt">武将数量：{{ player.heroList?.length || 0 }}</p>

        <div v-if="player.heroList?.length" class="ps-hgrid">
          <button
            v-for="(h, i) in player.heroList"
            :key="h.heroId || i"
            class="ps-hcard"
            @click="emit('open-hero', h)"
          >
            <span class="ps-hname">{{ h.heroName || "未知武将" }}</span>
            <span class="ps-hbody">
              <img v-if="h.heroAvate" :src="h.heroAvate" class="ps-hava" alt="" @error="onImgError" />
              <span v-else class="ps-hava ps-hava--ph">{{ (h.heroName || "?").charAt(0) }}</span>
              <span class="ps-hpills">
                <span class="ps-pill ps-pill--wide">战力: {{ fmtPower(h.power) }}</span>
                <span class="ps-pill">星级: {{ h.star || 0 }}</span>
                <span class="ps-pill">红数: {{ h.red || 0 }}</span>
                <span class="ps-pill">开孔: {{ h.hole || 0 }}</span>
                <span class="ps-pill" :class="h.HolyBeast ? 'is-on' : 'is-off'">
                  {{ h.HolyBeast ? "已开四圣" : "未开四圣" }}
                </span>
                <span v-if="h.HolyBeast" class="ps-pill ps-pill--wide">四圣等级: {{ h.HBlevel || 0 }}</span>
              </span>
            </span>
          </button>
        </div>
        <p v-else class="m-hint">未查询到武将信息</p>
      </template>

      <!-- 面板特有内容（盐场/蟠桃的连续切磋）：独立于 loading，切磋过程始终可见 -->
      <slot name="extra" />
    </template>

    <div v-else class="m-empty" style="padding: 26px 0; position: relative">
      <div class="m-logo">🛡️</div>
      <h3>成员信息</h3>
      <p>点成员头像或车头查看详情</p>
    </div>
  </div>
</template>

<script setup>
import { formatPower as fmtPower } from "@/utils/legionWar";

defineProps({
  modelValue: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  player: { type: Object, default: null },
  /* true = 内联卡片（铺在页面里，不弹抽屉也不吃 modelValue）；默认仍是底部抽屉 */
  inline: { type: Boolean, default: false },
});
const emit = defineEmits(["update:modelValue", "open-hero"]);

const close = () => emit("update:modelValue", false);
const onImgError = (e) => {
  e.target.src = "/icons/xiaoyugan.png";
};
</script>

<style scoped>
/* inline 模式：当普通卡片用，.m-card 已经给了 14/16 内边距，标题行顶边不用再让 */
.ps-inline .ps-title {
  margin: 0 0 12px;
}

/* 标题行：头像 + 名字/ID + 关闭按钮 */
.ps-title {
  display: flex; align-items: center; gap: 9px;
  margin: 2px 0 12px;
}
.ps-ava {
  flex: none; width: 34px; height: 34px; border-radius: var(--m-r-md);
  object-fit: cover; border: 1px solid var(--m-border);
}
.ps-ava--ph {
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 700; color:var(--m-on-primary);
  background: var(--m-primary-deep);
}
.ps-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.ps-nm {
  min-width: 0; font-size: 15.5px; font-weight: 700; color: var(--m-text); line-height: 1.25;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ps-id { font-size: 10.5px; color: var(--m-text3); font-variant-numeric: tabular-nums; white-space: nowrap; }
.ps-loading { padding: 22px 0; text-align: center; }

/* 信息行：战力/服务器、俱乐部、三项统计 */
.ps-rows {
  display: flex; flex-direction: column; gap: 6px;
  padding: 10px 12px; border-radius: 8px;
  background: var(--m-bg); border: 1px solid var(--m-border);
}
.ps-row {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 16px;
  font-size: 12px; color: var(--m-text2);
}
.ps-row b {
  font-size: 12.5px; font-weight: 700; color: var(--m-text);
  font-variant-numeric: tabular-nums;
}
.ps-power { color: var(--m-amber) !important; }
.ps-red { color: var(--m-red) !important; }
.ps-green { color: var(--m-green) !important; }

/* 武将阵容 */
.ps-sec {
  font-size: 12.5px; font-weight: 700; color: var(--m-text);
  margin: 16px 0 2px;
}
.ps-cnt { margin: 0 0 8px; font-size: 11px; color: var(--m-text3); }
.ps-hgrid {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.ps-hcard {
  display: flex; flex-direction: column; gap: 6px; width: 100%; text-align: left;
  padding: 8px 9px; border: 1px solid var(--m-border); border-radius: 8px;
  background: var(--m-card);
}
.ps-hcard:active { background: var(--m-bg); }
.ps-hname {
  font-size: 12px; font-weight: 700; color: var(--m-text);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ps-hbody { display: flex; align-items: flex-start; gap: 7px; min-width: 0; }
.ps-hava {
  flex: none; width: 38px; height: 38px; border-radius: var(--m-r-md);
  object-fit: cover; border: 1px solid var(--m-border);
}
.ps-hava--ph {
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 700; color:var(--m-on-primary);
  background: var(--m-primary-deep);
}
.ps-hpills {
  flex: 1; min-width: 0;
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3px;
}
.ps-pill {
  display: block; padding: 1px 2px; border-radius: 4px; text-align: center;
  font-size: 9px; font-weight: 700; color: var(--m-text2);
  background: var(--m-bg); border: 1px solid var(--m-border);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  font-variant-numeric: tabular-nums;
}
.ps-pill--wide { grid-column: 1 / -1; }
.ps-pill.is-off { color: var(--m-amber); background: var(--m-amber-soft); border-color: transparent; }
.ps-pill.is-on { color: var(--m-green); background: var(--m-green-soft); border-color: transparent; }
</style>
