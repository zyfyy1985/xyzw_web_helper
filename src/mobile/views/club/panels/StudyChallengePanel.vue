<template>
  <div class="m-pane m-desk m-study">
    <!-- 就绪门：组件里 computed(() => tokenStore.gameData.studyStatus) 是硬访问，
         gameData 为 null 时模板求值当场抛错、冒泡到根把整个移动端壳卸掉。 -->
    <div v-if="!dataReady" class="m-card">
      <div class="m-empty" style="padding: 30px 0">
        <div class="m-logo">◌</div>
        <h3>等待账号数据</h3>
        <p>连上账号后冲关任务会自动出现</p>
      </div>
    </div>
    <StudyChallengeCard v-else />
  </div>
</template>

<script setup>
/* ============================================================
 * 咸鱼大冲关（移动端宿主）
 * 复用 src/components/cards/StudyChallengeCard.vue，逻辑一行不改：
 *   一键答题 / 取题库 / 40s 超时回滚 / 状态机（starting→answering→claiming_rewards）全在组件里。
 * 只做窄屏修正：桌面按钮靠 MyCard 的 .card-action > button 撑满，Arco 按钮自带 height:32，
 * 手机上偏矮且配色是 Arco 蓝，需要跟 .m-desk 的行动蓝对齐。
 * ============================================================ */
import { computed } from "vue";
import StudyChallengeCard from "@/mobile/fork/components/cards/StudyChallengeCard.vue";
import { useTokenStore } from "@/stores/tokenStore";

const tokenStore = useTokenStore();
const dataReady = computed(() => !!tokenStore.gameData?.roleInfo);
</script>

<style scoped>
/* 卡身描述：桌面 12px 偏浅，手机上正文给到 13 保持可读 */
.m-study :deep(.card-content .description) {
  font-size: 13px;
  line-height: 1.55;
  color: var(--m-text2);
}

/* 动作区只有一个按钮，撑满即可；高度对齐其它卡的 40。
   注意：源组件写的是 a-button status="primary"，而 Arco 的 status 只有
   normal/success/warning/danger，没有 primary —— 落到默认 secondary 上是一块浅灰，
   在手机上像是「禁用的次要操作」。这里显式把它拉回唯一行动色（纯 UI 改动，不改行为）。 */
.m-study :deep(.card-action) {
  margin-top: 12px;
}
.m-study :deep(.card-action .arco-btn) {
  height: 40px;
  font-size: 13px;
  font-weight: 500;
  border-radius: var(--m-r-md);
}
.m-study :deep(.card-action .arco-btn:not(.arco-btn-disabled)) {
  background: var(--m-primary);
  border: 1px solid var(--m-primary);
  color: var(--m-on-primary);
}
.m-study :deep(.card-action .arco-btn.arco-btn-disabled) {
  background: var(--m-band);
  border: 1px solid transparent;
  color: var(--m-text3);
}
</style>

<script>
export default { name: "MobileStudyChallengePanel" };
</script>
