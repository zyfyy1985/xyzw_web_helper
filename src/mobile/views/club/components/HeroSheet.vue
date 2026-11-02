<template>
  <!-- 武将信息抽屉（俱乐部成员 / 盐场车头 / 蟠桃对手共用）
       字段严格对齐旧版「武将详情」弹窗：战力/等级/星级 + 开孔/红孔/四圣 + 鱼灵三项 + 装备详情 -->
  <div class="m-mask" :class="{ on: modelValue }" @click="close"></div>
  <div class="m-sheet" :class="{ on: modelValue }">
    <div class="m-grab"></div>

    <template v-if="hero">
      <header class="hs-head">
        <img v-if="hero.heroAvate" :src="hero.heroAvate" class="hs-ava" alt="" @error="onImgError" />
        <span v-else class="hs-ava hs-ava--ph">{{ (hero.heroName || "?").charAt(0) }}</span>
        <span class="hs-id">
          <span class="hs-nm">{{ hero.heroName || "武将信息" }}</span>
          <span class="hs-chips">
            <i class="hs-chip">{{ fmtPower(hero.power) }}</i>
            <i class="hs-chip">等级: {{ hero.level || 0 }}</i>
            <i class="hs-chip">星级: {{ hero.star || 0 }}</i>
            <i class="hs-chip" :class="hero.HolyBeast ? 'is-on' : 'is-off'">
              {{ hero.HolyBeast ? "已激活" : "未激活" }}
            </i>
          </span>
        </span>
      </header>

      <div class="hs-grid">
        <div class="hs-cell"><span class="hs-k">战力</span><span class="hs-v is-power">{{ fmtPower(hero.power) }}</span></div>
        <div class="hs-cell"><span class="hs-k">等级</span><span class="hs-v">{{ hero.level || 0 }}</span></div>
        <div class="hs-cell"><span class="hs-k">星级</span><span class="hs-v">{{ hero.star || 0 }}</span></div>
        <div class="hs-cell"><span class="hs-k">开孔数</span><span class="hs-v">{{ hero.hole || 0 }}</span></div>
        <div class="hs-cell"><span class="hs-k">红孔数</span><span class="hs-v is-red">{{ hero.red || 0 }}</span></div>
        <div class="hs-cell">
          <span class="hs-k">四圣状态</span>
          <span class="hs-v" :class="{ 'is-muted': !hero.HolyBeast }">
            {{ hero.HolyBeast ? `已激活${hero.HBlevel ? " · Lv." + hero.HBlevel : ""}` : "未激活" }}
          </span>
        </div>
        <div class="hs-cell"><span class="hs-k">鱼灵</span><span class="hs-v">{{ hero.PearlInfo?.FishInfo?.name ?? "无" }}</span></div>
        <div class="hs-cell"><span class="hs-k">鱼珠技能</span><span class="hs-v">{{ hero.PearlInfo?.PearlSkill?.name ?? "无" }}</span></div>
        <div class="hs-cell">
          <span class="hs-k">鱼灵洗练</span>
          <span class="hs-v">
            <span v-if="hero.PearlInfo?.slotMap?.length" class="hs-wash">
              <i v-for="item in hero.PearlInfo.slotMap" :key="item.id" :style="{ backgroundColor: item.value }"></i>
            </span>
            <span v-else>无</span>
          </span>
        </div>
      </div>

      <div class="hs-sec">装备详情</div>
      <div class="hs-eq">
        <div v-for="(label, idx) in EQU_LABELS" :key="label" class="hs-eq-i">
          <span class="hs-eq-l">{{ label }}:</span>
          <span class="hs-eq-s">
            <i v-for="(item, qi) in quenches(idx)" :key="qi" :class="{ red: item.colorId === 6 }"></i>
            <span v-if="!quenches(idx).length" class="hs-eq-n">无</span>
          </span>
        </div>
      </div>
    </template>

    <div v-else class="m-empty" style="padding: 26px 0; position: relative">
      <div class="m-logo">⚔️</div>
      <h3>武将信息</h3>
      <p>在成员信息里点某个武将查看详情</p>
    </div>
  </div>
</template>

<script setup>
import { formatPower as fmtPower } from "@/utils/legionWar";
import { heroEquipmentQuenches } from "./heroInfo";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  hero: { type: Object, default: null },
});
const emit = defineEmits(["update:modelValue"]);

const close = () => emit("update:modelValue", false);
const onImgError = (e) => {
  e.target.src = "/icons/xiaoyugan.png";
};

/* 装备四部位（顺序照抄旧版：武器 / 衣服 / 头盔 / 坐骑） */
const EQU_LABELS = ["武器", "衣服", "头盔", "坐骑"];
const quenches = (idx) => heroEquipmentQuenches(props.hero, idx);
</script>

<style scoped>
/* 头部：头像 + 名字 + 属性胶囊 */
.hs-head { display: flex; align-items: flex-start; gap: 10px; margin: 2px 0 12px; }
.hs-ava {
  flex: none; width: 48px; height: 48px; border-radius: var(--m-r-md);
  object-fit: cover; border: 1px solid var(--m-border);
}
.hs-ava--ph {
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 17px; font-weight: 700; color:var(--m-on-primary);
  background: var(--m-primary-deep);
}
.hs-id { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
.hs-nm {
  font-size: 16px; font-weight: 700; color: var(--m-text);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.hs-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.hs-chip {
  font-style: normal; padding: 1px 6px; border-radius: 4px;
  font-size: 10px; font-weight: 700; color: var(--m-text2);
  background: var(--m-bg); border: 1px solid var(--m-border);
  white-space: nowrap; font-variant-numeric: tabular-nums;
}
.hs-chip.is-off { color: var(--m-amber); background: var(--m-amber-soft); border-color: transparent; }
.hs-chip.is-on { color: var(--m-green); background: var(--m-green-soft); border-color: transparent; }

/* 指标表格 3 列 × 3 行 */
.hs-grid {
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0; overflow: hidden;
  background: var(--m-bg); border: 1px solid var(--m-border); border-radius: 8px;
}
.hs-cell { padding: 9px 10px; min-width: 0; }
.hs-cell:nth-child(3n + 1),
.hs-cell:nth-child(3n + 2) { border-right: 1px solid var(--m-border); }
.hs-cell:nth-child(-n + 6) { border-bottom: 1px solid var(--m-border); }
.hs-k { display: block; font-size: 10.5px; color: var(--m-text3); font-weight: 700; margin-bottom: 2px; }
.hs-v {
  display: block; font-size: 12.5px; font-weight: 700; color: var(--m-text);
  font-variant-numeric: tabular-nums; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.hs-v.is-power { color: var(--m-amber); }
.hs-v.is-red { color: var(--m-red); }
.hs-v.is-muted { color: var(--m-text3); }
/* 洗练色块 */
.hs-wash { display: inline-flex; gap: 3px; }
.hs-wash i { width: 11px; height: 11px; border-radius: 4px; display: inline-block; }
/* 分组标题 */
.hs-sec {
  font-size: 12.5px; font-weight: 700; color: var(--m-text);
  margin: 16px 0 8px;
}
/* 装备详情 2×2 */
.hs-eq { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 14px; }
.hs-eq-i { display: flex; align-items: center; gap: 7px; min-width: 0; }
.hs-eq-l { flex: none; font-size: 12px; font-weight: 700; color: var(--m-text2); }
.hs-eq-s { display: flex; flex-wrap: wrap; gap: 3px; align-items: center; }
.hs-eq-s i { width: 12px; height: 12px; border-radius: 4px; background: var(--m-border); display: inline-block; }
.hs-eq-s i.red { background: var(--m-red); }
.hs-eq-n { font-size: 11px; color: var(--m-text3); }
</style>
