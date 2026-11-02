<template>
  <!-- 自定义周日历抽屉（盐场 / 蟠桃共用）：只用周日/周六这类「有数据的日子」可选，
       当月外的日子灰显，可翻月。原来各面板各写一套（一个是原生 date input、一个是自绘日历），
       统一到这里，样式与交互只维护一份。 -->
  <div class="m-mask" :class="{ on: show }" @click="close"></div>
  <div class="m-sheet" :class="{ on: show }">
    <div class="m-grab"></div>
    <h4>{{ title }}</h4>
    <div class="m-sh-sub">{{ subTitle }}</div>
    <div class="m-cal-h">
      <button type="button" class="m-cal-nav" @click="shiftMonth(-1)">&lt;</button>
      <span>{{ monthTitle }}</span>
      <button type="button" class="m-cal-nav" @click="shiftMonth(1)">&gt;</button>
    </div>
    <div class="m-cal-wd">
      <span v-for="d in WEEKDAYS" :key="d">{{ d }}</span>
    </div>
    <div class="m-cal-g">
      <button
        v-for="day in days"
        :key="day.key"
        type="button"
        :class="{ on: day.value === date, off: day.disabled, out: day.outside }"
        :disabled="day.disabled"
        @click="pick(day.value)"
      >
        {{ day.label }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from "vue";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

const props = defineProps({
  show: { type: Boolean, default: false },
  /* 当前选中的日期，统一 "YYYY/MM/DD" */
  date: { type: String, default: "" },
  title: { type: String, default: "选择查询日期" },
  /* 哪几个星期几可选：0=周日 … 6=周六。蟠桃是 [0]，盐场是 [0,6]（周六/周日） */
  weekdays: { type: Array, default: () => [0] },
  /* 未来日期是否禁用（盐场查不了未来战绩） */
  disableFuture: { type: Boolean, default: false },
});
const emit = defineEmits(["update:show", "select"]);

const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const month = ref((props.date || "").slice(0, 7) || thisMonth());

/* 每次打开都回到「当前选中日期所在月」 */
watch(
  () => props.show,
  (open) => {
    if (open) month.value = (props.date || thisMonth()).slice(0, 7);
  },
);

const monthTitle = computed(() => {
  const [y, m] = month.value.split("/");
  return `${y}年${m}月`;
});
const subTitle = computed(() => {
  const names = [...props.weekdays]
    .sort((a, b) => a - b)
    .map((w) => `周${WEEKDAYS[w]}`)
    .join("/");
  return `仅${names}可查询（${monthTitle.value}）`;
});

const days = computed(() => {
  const [year, m] = month.value.split("/").map(Number);
  const firstDay = new Date(year, m - 1, 1);
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - firstDay.getDay());
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const out = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const y = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const future = props.disableFuture && d.getTime() > today.getTime();
    out.push({
      key: `${y}-${d.getMonth() + 1}-${d.getDate()}`,
      label: d.getDate(),
      value: `${y}/${mm}/${dd}`,
      disabled: !props.weekdays.includes(d.getDay()) || future,
      outside: d.getMonth() !== m - 1,
    });
  }
  return out;
});

const shiftMonth = (offset) => {
  const [y, m] = month.value.split("/").map(Number);
  const d = new Date(y, m - 1 + offset, 1);
  month.value = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const close = () => emit("update:show", false);
const pick = (value) => {
  emit("update:show", false);
  emit("select", value);
};
</script>

<style scoped>
.m-cal-h {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 8px; font-size: 13px; font-weight: 700; color: var(--m-text);
}
.m-cal-nav {
  width: 30px; height: 30px; border-radius: var(--m-r-md); border: 1px solid var(--m-border);
  background: var(--m-bg); color: var(--m-text2);
  font-size: 13px; font-weight: 700; font-family: inherit; cursor: pointer;
}
.m-cal-wd { display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; margin-bottom: 4px; }
.m-cal-wd span { text-align: center; font-size: 10.5px; font-weight: 700; color: var(--m-text3); }
.m-cal-g { display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; }
.m-cal-g button {
  height: 34px; border-radius: var(--m-r-md); border: 1px solid transparent;
  background: var(--m-bg); color: var(--m-text);
  font-size: 12px; font-weight: 700; font-family: inherit; cursor: pointer;
}
.m-cal-g button.out { color: var(--m-text3); opacity: 0.5; }
.m-cal-g button.off { color: var(--m-text3); opacity: 0.35; cursor: not-allowed; }
.m-cal-g button.on {
  background: var(--m-primary);
  border-color: transparent; color: var(--m-on-primary); font-weight: 700;
}
</style>
