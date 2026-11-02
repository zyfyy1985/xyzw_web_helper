<template>
  <!-- 隐私政策 / 用户协议 全文抽屉。
       两处入口共用这一份：注册页的「我已阅读并同意…」和「我的 → 隐私与协议」。
       状态自己管，外面只管调 open(key) —— 省得两个页面各写一遍 visible / key / 滚动复位。 -->
  <div class="m-mask" :class="{ on: visible }" @click="close"></div>
  <div
    class="m-sheet m-legal"
    :class="{ on: visible }"
    role="dialog"
    aria-modal="true"
    :aria-label="doc.title"
  >
    <div class="m-grab"></div>

    <div class="m-legal-hd">
      <h4 class="m-legal-tt">{{ doc.title }}</h4>
      <div class="m-legal-meta">更新日期 {{ doc.updatedAt }} · 生效日期 {{ doc.effectiveAt }}</div>
    </div>

    <div ref="scroller" class="m-legal-body">
      <p class="m-legal-intro">{{ doc.intro }}</p>
      <section v-for="s in doc.sections" :key="s.h" class="m-legal-sec">
        <h5 class="m-legal-h">{{ s.h }}</h5>
        <p v-for="(p, i) in s.paras" :key="`p${i}`" class="m-legal-p">{{ p }}</p>
        <ul v-if="s.list" class="m-legal-ul">
          <li v-for="(it, i) in s.list" :key="`l${i}`" class="m-legal-li">{{ it }}</li>
        </ul>
        <p v-for="(p, i) in s.paras2 || []" :key="`q${i}`" class="m-legal-p">{{ p }}</p>
      </section>
    </div>

    <div class="m-legal-ft">
      <button class="m-btn m-btn-g m-btn-block" @click="close">关闭</button>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref } from "vue";
import { LEGAL_DOCS } from "@/mobile/legal/docs";

const visible = ref(false);
const which = ref("privacy");
const scroller = ref(null);

/* key 认不出来就回隐私政策，不抛错 —— 入口是模板里写死的字符串，真写错也不该白屏 */
const doc = computed(() => LEGAL_DOCS[which.value] || LEGAL_DOCS.privacy);

function onKey(e) {
  if (e.key === "Escape") close();
}

async function open(key) {
  which.value = LEGAL_DOCS[key] ? key : "privacy";
  visible.value = true;
  window.addEventListener("keydown", onKey);
  /* 抽屉是同一个 DOM，不换节点 ⇒ 上次读到第 6 章，再打开会停在第 6 章。
     关的时候不复位（正好让「刚才看的那段」还在），开的时候复位。 */
  await nextTick();
  if (scroller.value) scroller.value.scrollTop = 0;
}

function close() {
  visible.value = false;
  window.removeEventListener("keydown", onKey);
}

onBeforeUnmount(() => window.removeEventListener("keydown", onKey));

defineExpose({ open, close });
</script>
