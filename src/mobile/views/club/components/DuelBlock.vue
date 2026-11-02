<template>
  <!-- 连续切磋：入口 + 进度 + 结果，一整个组件（盐场 / 蟠桃 / 后续任何带切磋的信息抽屉都用这个） -->
  <div v-if="player" ref="rootEl" class="m-duelbox">
    <div class="m-duelbar">
      <span class="m-duelbar-t">连续切磋</span>
      <input
        class="m-finput m-duelbar-n"
        type="number"
        min="1"
        max="100"
        step="1"
        :value="fightCount"
        @input="onCountInput"
      />
      <button
        type="button"
        class="m-btn m-btn-p m-duelbar-b"
        :disabled="!isFightCountValid || duelRunning"
        @click="handleDuel"
      >
        {{ duelRunning ? "切磋中…" : "切磋" }}
      </button>
    </div>

    <!-- 进度（跑的过程中） -->
    <div v-if="fightProgress.visible" class="m-prog">
      <div class="m-prog-st">
        <span>总次数 {{ fightProgress.totalCount }}</span>
        <span>已完成 {{ fightProgress.completedCount }}</span>
        <span>剩余 {{ fightProgress.remainingCount }}</span>
        <span>胜 {{ fightProgress.winCount }}</span>
        <span>负 {{ fightProgress.lossCount }}</span>
      </div>
      <div class="m-pbar"><i :style="{ width: fightProgress.percentage + '%' }"></i></div>
    </div>

    <!-- 结果 -->
    <div v-if="fightResult.visible" class="m-duel">
      <div class="m-csub">切磋结果</div>
      <div class="m-duel-st">
        <span>总次数 <b>{{ fightResult.totalCount }}</b></span>
        <span>胜 <b style="color: var(--m-green)">{{ fightResult.winCount }}</b></span>
        <span>负 <b style="color: var(--m-red)">{{ fightResult.lossCount }}</b></span>
        <span>胜率 <b :class="winRateClass">{{ winRate.toFixed(2) }}%</b></span>
        <span>我方掉将率 <b style="color: var(--m-blue)">{{ ourDieRate.toFixed(2) }}%</b></span>
        <span>敌方掉将率 <b style="color: var(--m-blue)">{{ enemyDieRate.toFixed(2) }}%</b></span>
      </div>

      <!-- 场次多时（最多 100 场）只滚这一块，不把下面的信息顶出屏幕 -->
      <div class="m-duel-list">
        <div class="m-duelrow" v-for="(battle, index) in fightResult.resultCount" :key="index">
          <span class="m-duel-idx">第 {{ index + 1 }} 场</span>
          <span class="m-tag" :class="battle.isWin ? 'done' : 'err'">{{ battle.isWin ? "胜" : "负" }}</span>
          <span class="m-duel-side">
            <span class="m-ib m-mava" :style="{ background: avatarBg(battle.leftName) }">
              <img v-if="battle.leftheadImg" :src="battle.leftheadImg" alt="" />
              <span v-else>{{ (battle.leftName || "?").charAt(0) }}</span>
            </span>
            <span class="m-duel-tx">
              <span class="m-duel-nm">{{ battle.leftName || "未知" }}</span>
              <span class="m-duel-mt">{{ battle.leftpower }} · 掉将 {{ battle.leftDieHero }}</span>
            </span>
          </span>
          <span class="m-duel-vs">VS</span>
          <span class="m-duel-side right">
            <span class="m-ib m-mava" :style="{ background: avatarBg(battle.rightName) }">
              <img v-if="battle.rightheadImg" :src="battle.rightheadImg" alt="" />
              <span v-else>{{ (battle.rightName || "?").charAt(0) }}</span>
            </span>
            <span class="m-duel-tx">
              <span class="m-duel-nm">{{ battle.rightName || "未知" }}</span>
              <span class="m-duel-mt">{{ battle.rightpower }} · 掉将 {{ battle.rightDieHero }}</span>
            </span>
          </span>
        </div>
      </div>

      <div class="m-duel-ops">
        <!-- 打完一轮只有一个去处：把结果导出来。原来这里是「重新切磋」（清结果再来一轮），
             实际用不上 —— 要再打得直接把上面的次数一改、点「切磋」。
             导出目标是整张抽屉（对手信息 + 战报 + 武将），和桌面版导 content-section 一致。 -->
        <button
          type="button"
          class="m-btn m-btn-p"
          :disabled="exporting"
          @click="exportResult"
        >
          导出结果
        </button>
        <button type="button" class="m-btn m-btn-g" @click="fightResult.visible = false">
          关闭结果
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, reactive, ref, watch } from "vue";
import { useMessage } from "naive-ui";
import { useTokenStore } from "@/stores/tokenStore";
import { formatPower } from "@/utils/legionWar";
import { exportDomAsImage } from "@/mobile/utils/exportImage";

const props = defineProps({
  /* 切磋对手：要 id（fight_startpvp 的 targetId）与 name（提示文案）。
     父组件在 PlayerSheet 的 #top 插槽里传当前玩家即可，内部自己取数/发命令/出结果。 */
  player: { type: Object, default: null },
});

const tokenStore = useTokenStore();
const message = useMessage();

const rootEl = ref(null);
const exporting = ref(false);

const fightCount = ref(1);
const isFightCountValid = ref(true);
const duelRunning = ref(false);
const fightProgress = reactive({
  visible: false,
  totalCount: 0,
  completedCount: 0,
  remainingCount: 0,
  winCount: 0,
  lossCount: 0,
  percentage: 0,
});
const fightResult = reactive({
  visible: false,
  totalCount: 0,
  winCount: 0,
  lossCount: 0,
  winRate: 0,
  ourDieRate: 0,
  enemyDieRate: 0,
  resultCount: [],
});
const dieStats = reactive({
  ourDieHeroGameCount: 0,
  enemyDieHeroGameCount: 0,
});

const total = computed(() => fightResult.totalCount || 0);
const winRate = computed(() =>
  total.value ? (fightResult.winCount / total.value) * 100 : 0,
);
const winRateClass = computed(() => {
  if (winRate.value > 50) return "duel-high";
  if (winRate.value < 50) return "duel-low";
  return "";
});
const ourDieRate = computed(() =>
  total.value ? (dieStats.ourDieHeroGameCount / total.value) * 100 : 0,
);
const enemyDieRate = computed(() =>
  total.value ? (dieStats.enemyDieHeroGameCount / total.value) * 100 : 0,
);

/* 头像底色：同色相四档（与 MobileLayout / 各面板的 avatarBg 同一套 --m-ava-*），
   不引入第二强调色相；用变量而不是字面色值，主题换肤才能一起换掉 */
const avatarBg = (name) => {
  const grads = ["var(--m-ava-1)", "var(--m-ava-2)", "var(--m-ava-3)", "var(--m-ava-4)"];
  return grads[(name || "").length % grads.length];
};

const onCountInput = (e) => {
  fightCount.value = e.target.value;
  validateFightCount(e.target.value);
};
const validateFightCount = (value) => {
  const num = parseInt(value);
  isFightCountValid.value = !isNaN(num) && num >= 1 && num <= 100;
};
const resetFightResult = () => {
  fightResult.visible = false;
  fightProgress.visible = false;
  dieStats.ourDieHeroGameCount = 0;
  dieStats.enemyDieHeroGameCount = 0;
  fightCount.value = 1;
  validateFightCount(1);
};
const updateFightProgress = (completedCount, winCount, lossCount) => {
  fightProgress.completedCount = completedCount;
  fightProgress.winCount = winCount;
  fightProgress.lossCount = lossCount;
  fightProgress.remainingCount = fightProgress.totalCount - completedCount;
  fightProgress.percentage = Math.round(
    (completedCount / fightProgress.totalCount) * 100,
  );
};
const calculateFinalResult = (winCount, lossCount, resultCount) => {
  fightResult.totalCount = fightProgress.totalCount;
  fightResult.winCount = winCount;
  fightResult.lossCount = lossCount;
  fightResult.winRate = Math.round((winCount / fightProgress.totalCount) * 100);
  fightResult.ourDieRate = Math.round(
    (dieStats.ourDieHeroGameCount / fightProgress.totalCount) * 100,
  );
  fightResult.enemyDieRate = Math.round(
    (dieStats.enemyDieHeroGameCount / fightProgress.totalCount) * 100,
  );
  fightResult.resultCount = resultCount;
  fightResult.visible = true;
  fightProgress.visible = false;
};

/* 换了个对手（或抽屉被 reset 清空）就把上一轮的结果收掉，和原来父组件 onStart 里做的事一样 */
watch(
  () => props.player?.roleId || props.player?.id,
  () => resetFightResult(),
);

const handleDuel = async () => {
  if (!props.player) return;
  if (!props.player.id) {
    message.error("缺少目标玩家 ID，无法切磋");
    return;
  }
  validateFightCount(fightCount.value);
  if (!isFightCountValid.value) {
    message.error("请输入有效的切磋次数 (1-100)");
    return;
  }
  const totalCount = parseInt(fightCount.value);
  if (!tokenStore.selectedToken) {
    message.warning("请先选择游戏角色");
    return;
  }
  const tokenId = tokenStore.selectedToken.id;
  const wsStatus = tokenStore.getWebSocketStatus(tokenId);
  if (wsStatus !== "connected") {
    message.error("WebSocket未连接，无法发起切磋");
    return;
  }

  duelRunning.value = true;
  fightProgress.visible = true;
  fightProgress.totalCount = totalCount;
  fightProgress.completedCount = 0;
  fightProgress.remainingCount = totalCount;
  fightProgress.winCount = 0;
  fightProgress.lossCount = 0;
  fightProgress.percentage = 0;
  dieStats.ourDieHeroGameCount = 0;
  dieStats.enemyDieHeroGameCount = 0;

  try {
    let winCount = 0;
    let lossCount = 0;
    let resultCount = [];
    for (let i = 0; i < totalCount; i++) {
      const result = await tokenStore.sendMessageWithPromise(
        tokenId,
        "fight_startpvp",
        { targetId: props.player.id },
        10000,
      );
      if (result && result.battleData) {
        let leftCount = 0;
        let rightCount = 0;
        if (result.battleData.result?.sponsor?.teamInfo) {
          result.battleData.result.sponsor.teamInfo.forEach((item) => {
            if (item.hp == 0) leftCount++;
          });
        }
        if (result.battleData.result?.accept?.teamInfo) {
          result.battleData.result.accept.teamInfo.forEach((item) => {
            if (item.hp == 0) rightCount++;
          });
        }
        const battleResult = {
          isWin: result.battleData.result?.isWin || false,
          leftName: result.battleData.leftTeam?.name || "未知",
          leftheadImg: result.battleData.leftTeam?.headImg || "",
          leftpower: formatPower(result.battleData.leftTeam?.power || 0),
          leftDieHero: leftCount,
          rightName: result.battleData.rightTeam?.name || "未知",
          rightheadImg: result.battleData.rightTeam?.headImg || "",
          rightpower: formatPower(result.battleData.rightTeam?.power || 0),
          rightDieHero: rightCount,
        };
        resultCount.push(battleResult);
        if (leftCount > 0) dieStats.ourDieHeroGameCount++;
        if (rightCount > 0) dieStats.enemyDieHeroGameCount++;
        if (battleResult.isWin) winCount++;
        else lossCount++;
        updateFightProgress(i + 1, winCount, lossCount);
        /* 短暂延迟，避免请求过于频繁 */
        if (i < totalCount - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      } else {
        message.warning(
          `第 ${i + 1} 场切磋失败: ${result?.message || "未返回战斗数据"}`,
        );
        lossCount++;
        updateFightProgress(i + 1, winCount, lossCount);
      }
    }
    calculateFinalResult(winCount, lossCount, resultCount);
    message.success(`连续切磋完成，共${totalCount}场`);
  } catch (error) {
    console.error("连续切磋失败:", error);
    message.error(`连续切磋失败: ${error.message || "网络错误"}`);
    fightProgress.visible = false;
  } finally {
    duelRunning.value = false;
  }
};

/* ---------- 导出结果 ----------
 * 目标：整块对手信息（PlayerSheet 卡片 + 里面的切磋块），与桌面版导 content-section 同范围。
 * 走营地挑战「导出长图」同一套：mobile/utils/exportImage 的 exportDomAsImage。
 *
 * 恒传 flatten：
 *   · 切磋面板把 PlayerSheet 内联铺在页面里（.ps-inline）⇒ 摊平本身无副作用；
 *   · 盐场 / 蟠桃 / 排行榜仍是底部抽屉（.m-sheet：absolute + max-height:82% + overflow-y:auto）
 *     ⇒ 不摊平就只有可视那一截，滚动区外的武将阵容会被丢掉（用户 11-01 遇到的截断）。
 *   · 两条路都需要那套预处理：导出瞬间本按钮是 disabled（图里会变灰），
 *     切磋次数是 <input>（html2canvas 画出来是乱码笔画）。
 */
const exportResult = async () => {
  if (exporting.value) return;
  const el =
    document.querySelector(".ps-inline") ||
    document.querySelector(".m-sheet.on") ||
    rootEl.value;
  if (!el) return;
  exporting.value = true;
  const loading = message.loading("正在渲染长图，请稍候…", { duration: 0 });
  try {
    await nextTick();
    await exportDomAsImage(el, `${props.player?.name || "对手"}-切磋结果.png`, {
      flatten: true,
    });
    message.success("长图导出成功！");
  } catch (e) {
    console.error("导出结果失败:", e);
    message.error("导出失败：" + (e?.message || "请重试"));
  } finally {
    loading?.destroy?.();
    exporting.value = false;
  }
};
</script>

<style scoped>
/* 整块：夹在「信息块」和「武将阵容」之间，上下都要留白，否则会跟信息卡黏在一起 */
.m-duelbox { margin-top: 12px; }

/* 切磋条（band 平带，design.md：分区靠底色不靠边框） */
.m-duelbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 12px;
  padding: 8px 10px;
  border-radius: var(--m-r-md);
  background: var(--m-band);
}
.m-duelbar-t { flex: none; font-size: 12px; font-weight: 700; color: var(--m-text); }
.m-duelbar-n { flex: 1; min-width: 0; height: 30px; text-align: center; }
.m-duelbar-b { flex: none; padding: 0 14px; height: 30px; font-size: 12.5px; }

/* 进度 */
.m-prog { margin-top: 12px; }
.m-prog-st {
  display: flex; flex-wrap: wrap; gap: 8px;
  margin-bottom: 6px; font-size: 11px; color: var(--m-text2);
}

/* 结果 */
.m-duel { margin-top: 12px; }
.m-duel-st {
  display: flex; flex-wrap: wrap; gap: 8px;
  margin-bottom: 8px; font-size: 11px; color: var(--m-text2);
}
.m-duel-st b { color: var(--m-text); }
.duel-high { color: var(--m-green) !important; }
.duel-low { color: var(--m-red) !important; }

/* 场次多时只滚这块（100 场也不会把下面信息顶走） */
.m-duel-list { max-height: 44vh; overflow-y: auto; }

/* 每场对战行：第N场 + 胜/负 + 左方(头像/名/战力) + VS + 右方 */
.m-duelrow {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  padding: 9px 0; border-bottom: 1px solid var(--m-border);
}
.m-duelrow:last-child { border-bottom: none; }
.m-duel-idx { flex: none; font-size: 10.5px; font-weight: 700; color: var(--m-text3); }
.m-duel-side { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; }
.m-duel-side.right { justify-content: flex-end; }
.m-duel-side.right .m-duel-tx { text-align: right; }
.m-duel-side .m-mava { width: 26px; height: 26px; border-radius: var(--m-r-md); }
.m-duel-side .m-mava img { width: 26px; height: 26px; border-radius: var(--m-r-md); object-fit: cover; }
.m-duel-tx { min-width: 0; }
.m-duel-nm {
  display: block; font-size: 11.5px; font-weight: 700; color: var(--m-text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.m-duel-mt { display: block; font-size: 10px; color: var(--m-text3); }
.m-duel-vs { flex: none; font-size: 9.5px; font-weight: 700; color: var(--m-text3); }

.m-duel-ops { display: flex; gap: 8px; margin-top: 10px; margin-bottom: 4px; }
.m-duel-ops .m-btn { flex: 1; }
</style>
