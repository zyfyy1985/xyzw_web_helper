/* 俱乐部 / 盐场共用：rank_getroleinfo 取玩家详情 + 归一化。
 * 实现分别照抄 ClubPanel.fetchTargetInfo 与 SaltPanel.fetchTargetInfo（两者原本是同一套逻辑的两份拷贝），
 * 这里合并为一份，字段取两边超集，展示层不再重复取数。
 *
 * 用法：
 *   const { loading, player, fetchPlayer, reset } = usePlayerInfo({ onStart, onError });
 *   await fetchPlayer(roleId);
 */
import { ref } from "vue";
import { useMessage } from "naive-ui";
import { useTokenStore } from "@/stores/tokenStore";
import { HeroFillInfo, getLineupType } from "@/utils/HeroList";
import { getHeroInfo } from "./heroInfo";

export const usePlayerInfo = (options = {}) => {
  const tokenStore = useTokenStore();
  const message = useMessage();

  const loading = ref(false);
  const player = ref(null);

  const reset = () => {
    player.value = null;
  };

  const fetchPlayer = async (roleId) => {
    if (!tokenStore.selectedToken) {
      message.warning("请先选择游戏角色");
      return null;
    }
    const tokenId = tokenStore.selectedToken.id;
    if (tokenStore.getWebSocketStatus(tokenId) !== "connected") {
      message.error("WebSocket未连接，无法查询信息");
      return null;
    }

    options.onStart?.();
    loading.value = true;
    try {
      const result = await tokenStore.sendMessageWithPromise(
        tokenId,
        "rank_getroleinfo",
        {
          bottleType: 0,
          includeBottleTeam: false,
          isSearch: false,
          roleId,
          includeHero: true,
          includeHeroDetail: true,
          includePearl: true,
        },
        5000,
      );

      if (!result?.roleInfo) {
        message.warning("未查询到玩家信息");
        return null;
      }

      /* 鱼灵（PearlInfo）+ 武将（getHeroInfo 会顺带算总红/总孔） */
      const fishInfo = HeroFillInfo(result.roleInfo);
      let heroAndRed = { redCount: 0, holeCount: 0, heroList: [] };
      if (result.roleInfo.heroes) {
        try {
          heroAndRed = getHeroInfo(result.roleInfo.heroes);
        } catch (error) {
          console.error("处理英雄信息失败:", error);
        }
      }
      heroAndRed.heroList.forEach((hero) => {
        hero.PearlInfo = fishInfo[hero.artifactId] || {};
      });

      const lineupType = getLineupType(heroAndRed.heroList);
      const roleRed = result.roleInfo.red || 0;
      const roleMaxRed = result.roleInfo.maxRed || 0;

      player.value = {
        roleId,
        id: roleId, // 兼容盐场连续切磋 fight_startpvp 的 targetId 取法
        name: result.roleInfo.name || result.roleInfo.nickname || "未知",
        headImg: result.roleInfo.headImg,
        level: result.roleInfo.level,
        power: result.roleInfo.power || 0,
        serverName: result.roleInfo.serverName,
        legionName: result.legionInfo?.name || "无",
        legacy: result.roleInfo.legacy?.color || 0,
        lineupType,
        red: roleRed,
        maxRed: roleMaxRed,
        totalRed: heroAndRed.redCount,
        totalHole: heroAndRed.holeCount,
        holyBeast: heroAndRed.heroList.filter((h) => h.HolyBeast).length,
        heroList: heroAndRed.heroList,
      };

      options.onFetched?.(player.value);
      /* silent：调用方自己有反馈（如榜单行上的 pending 态）时关掉这条 toast，
         免得「正在查询 / 查询成功」两条弹窗盖住刚打开的抽屉标题。 */
      if (!options.silent) message.success("查询成功");
      return player.value;
    } catch (error) {
      options.onError?.(error);
      message.error("查询失败: " + (error.message || "未知错误"));
      return null;
    } finally {
      loading.value = false;
    }
  };

  return { loading, player, fetchPlayer, reset };
};
