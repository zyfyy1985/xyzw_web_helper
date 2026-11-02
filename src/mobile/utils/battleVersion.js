/* 战斗版本号预热（移动端）。
 *
 * tokenStore.sendMessageWithPromise 会给所有战斗命令（fight_startpvp / fight_starttower / fight_level …）
 * 自动注入 gameData.battleVersion，服务端要拿它校版本。这个值原本由旧桌面版的
 * /admin/game-features（GameFeatures.vue）在挂载时发一次 fight_startlevel 取回来写进 store：
 *   const res = await tokenStore.sendMessageWithPromise(tokenId, "fight_startlevel");
 *   tokenStore.setBattleVersion(res?.battleData?.version);
 * 移动端没有这个页面，没跑过批量任务 / 推图时 gameData.battleVersion 一直是初始的 null，
 * 战斗命令就会带着 null 发出去被服务端拒 —— 表现就是「切磋全都进行不下去」。
 *
 * 所以移动端照旧版的做法补同样的预热：首页、玩法页加载完成时各调一次。
 *   · 已有值直接返回，来回切页面不会重复请求；
 *   · 页面加载那一刻连接可能还没就绪，连上之后补一次（仍然只取一次，不在切磋前临时取）；
 *   · 失败不缓存，下次页面激活会再试。
 */
import { onActivated, onMounted, watch } from "vue";
import { useTokenStore } from "@/stores/tokenStore";

export const useBattleVersionWarmup = () => {
  const tokenStore = useTokenStore();

  const warmup = async () => {
    if (tokenStore.getBattleVersion() != null) return;
    const tokenId = tokenStore.selectedToken?.id;
    if (!tokenId) return;
    if (tokenStore.getWebSocketStatus(tokenId) !== "connected") return;
    try {
      const res = await tokenStore.sendMessageWithPromise(
        tokenId,
        "fight_startlevel",
        {},
        8000,
      );
      const version = res?.battleData?.version ?? res?.body?.battleData?.version;
      if (version) tokenStore.setBattleVersion(version);
    } catch {
      /* 静默：与旧版 initializeGameData 的 catch 一致，不打扰用户 */
    }
  };

  onMounted(warmup);
  onActivated(warmup);
  watch(
    () => tokenStore.getWebSocketStatus(tokenStore.selectedToken?.id),
    (status) => {
      if (status === "connected") warmup();
    },
  );
};
