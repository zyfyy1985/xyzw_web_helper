<template>
  <div class="legion-war-statistics-container">
    <div class="legion-war-statistics-card">
      <div v-if="!isAccessible" class="access-denied-container">
        <n-result status="403" title="暂未开放" description="该功能仅在特定时间开放">
          <template #footer>
            <div class="access-denied-info">
              <p>开放时间：</p>
              <p>1. 每月前四周的周六 19:55 - 21:00</p>
              <p>2. 每月第四周的周日 19:55 - 21:30</p>
              <p>3. 2026年3月年赛特殊开放</p>
            </div>
          </template>
        </n-result>
      </div>
      <template v-else>
      <!-- 头部信息区 -->
      <div class="header-section">
        <div class="header-left">
          <img src="/icons/moonPalace.png" alt="盐场图标" class="header-icon" />
          <div class="header-title">
            <h2>盐场实时战况</h2>
            <p>实时获取俱乐部盐场数据</p>
          </div>
        </div>
      </div>

      <!-- 功能操作区 -->
      <div class="function-section">
        <div class="function-left">
          <n-radio-group v-model:value="viewMode" size="small">
            <n-radio-button value="legion">战队战况</n-radio-button>
            <n-radio-button value="individual">个人战况</n-radio-button>
            <n-radio-button value="all_individual">全部战况</n-radio-button>
          </n-radio-group>
          
          <div class="stat-item">
            <span class="stat-label">连接状态:</span>
            <n-tag :type="isConnected ? 'success' : 'error'">
              {{ isConnected ? "已连接" : "未连接" }}
            </n-tag>
          </div>
          <div class="stat-item">
            <span class="stat-label">战场数据:</span>
            <n-tag :type="battlefieldId ? 'success' : 'error'">{{ battlefieldId ? "已成功获取战场数据" : "未获取到战场数据" }}</n-tag>
          </div>
          <div class="stat-item">
            <span class="stat-label">更新时间:</span>
            <n-tag type="warning">{{ lastUpdateTime || "等待数据..." }}</n-tag>
          </div>

          <n-button 
            size="small" 
            :type="isEntireBattlefield ? 'success' : 'warning'" 
            :loading="connecting"
            @click="toggleBattlefieldEntry"
          >
            <template #icon>
              <n-icon>
                <LogInOutline />
              </n-icon>
            </template>
            {{ isEntireBattlefield ? "已进入战场" : "进入战场" }}
          </n-button>

          <n-button 
            size="small" 
            type="primary" 
            :disabled="!isConnected && !isEntireBattlefield"
            @click="refreshData"
            style="margin-right: 8px"
          >
            <template #icon>
              <n-icon>
                <RefreshOutline />
              </n-icon>
            </template>
            刷新数据
          </n-button>
          
          <n-button 
            size="small" 
            type="info" 
            :loading="exporting"
            @click="exportImage"
          >
            <template #icon>
              <n-icon>
                <ImageOutline />
              </n-icon>
            </template>
            导出图片
          </n-button>

          <n-button 
            size="small" 
            type="success" 
            @click="exportExcel"
          >
            <template #icon>
              <n-icon>
                <DownloadOutline />
              </n-icon>
            </template>
            导出表格
          </n-button>
        </div>
      </div>

      <!-- 表格内容区 -->
      <div class="table-content">
        <!-- 战队战况表格 -->
        <n-data-table
          v-if="viewMode === 'legion'"
          :columns="legionColumns"
          :data="legionData"
          :loading="false"
          :pagination="{ pageSize: 20 }"
          size="small"
          :max-height="tableMaxHeight"
          :row-class-name="rowClassName"
        >
          <template #empty>
            <div class="empty-state">
              <template v-if="connecting">
                <div class="loading-container">
                  <n-spin size="large" />
                  <p>正在连接战场...</p>
                </div>
              </template>
              <template v-else-if="isConnected">
                <div class="loading-container">
                  <n-spin size="large" />
                  <p>正在获取战况数据...</p>
                </div>
              </template>
              <template v-else>
                <n-empty description="暂无战场数据，请手动刷新数据">
                  <template #icon>
                    <n-icon>
                      <StatsChart />
                    </n-icon>
                  </template>
                </n-empty>
              </template>
            </div>
          </template>
        </n-data-table>

        <!-- 个人战况表格 -->
        <n-data-table
          v-else-if="viewMode === 'individual'"
          :columns="individualColumns"
          :data="individualData"
          :loading="false"
          :pagination="{ pageSize: 30 }"
          size="small"
          :max-height="tableMaxHeight"
        >
          <template #empty>
            <div class="empty-state">
              <template v-if="connecting">
                <div class="loading-container">
                  <n-spin size="large" />
                  <p>正在连接战场...</p>
                </div>
              </template>
              <template v-else-if="isConnected">
                <div class="loading-container">
                  <n-spin size="large" />
                  <p>正在获取战况数据...</p>
                </div>
              </template>
              <template v-else>
                <n-empty description="暂无战场数据，请手动刷新数据">
                  <template #icon>
                    <n-icon>
                      <StatsChart />
                    </n-icon>
                  </template>
                </n-empty>
              </template>
            </div>
          </template>
        </n-data-table>

        <!-- 全部战况表格 -->
        <n-data-table
          v-else-if="viewMode === 'all_individual'"
          :columns="allIndividualColumns"
          :data="allIndividualData"
          :loading="false"
          :pagination="false"
          size="small"
          :row-class-name="rowClassName"
          :max-height="600"
        >
          <template #empty>
            <div class="empty-state">
              <template v-if="connecting">
                <div class="loading-container">
                  <n-spin size="large" />
                  <p>正在连接战场...</p>
                </div>
              </template>
              <template v-else-if="isConnected">
                <div class="loading-container">
                  <n-spin size="large" />
                  <p>正在获取战况数据...</p>
                </div>
              </template>
              <template v-else>
                <n-empty description="暂无战场数据，请手动刷新数据">
                  <template #icon>
                    <n-icon>
                      <StatsChart />
                    </n-icon>
                  </template>
                </n-empty>
              </template>
            </div>
          </template>
        </n-data-table>

        <!-- [本地扩展 · 移动端卡片视图] 桌面隐藏，≤768px 显示并隐藏上方宽表。
             三张表分别是 10 / 9 / 10 列且都没设 scroll-x，窄屏会被压成一条。
             这里按当前 viewMode 渲染对应的卡片列表，字段与列一一对应。
             注意：宽表对 团队/个人 战况做了分页（20 / 30 条一页），卡片按完整
             列表展示、排名用整表序号，省掉手机上翻页。
             默认 display:none + 只在 ≤768px 显示 → 不会影响导出。 -->
        <div v-if="viewMode === 'legion'" class="salt-cards">
          <div
            v-for="(row, index) in legionData"
            :key="'lg-' + (row.id || index)"
            class="salt-card"
            :class="rowClassName(row)"
          >
            <div class="salt-card__head">
              <span class="salt-card__rank">#{{ index + 1 }}</span>
              <span class="salt-card__name">{{ row.name }}</span>
            </div>
            <div class="salt-card__grid salt-card__grid--lg">
              <!-- 顺序由用户指定：积分 | 击杀数 | 免费复活 | 花费总丹 ／ 四圣 | 人数 | 红数 | 战力 -->
              <div class="salt-card__cell">
                <span class="salt-card__label">积分</span>
                <span class="salt-card__value is-score">{{ row.score }}</span>
              </div>
              <div class="salt-card__cell">
                <span class="salt-card__label">击杀数</span>
                <span class="salt-card__value is-kill">{{ row.killCnt }}</span>
              </div>
              <div class="salt-card__cell">
                <span class="salt-card__label">免费复活</span>
                <span class="salt-card__value">{{ row.reviveCount }}/150</span>
              </div>
              <div class="salt-card__cell">
                <span class="salt-card__label">花费总丹</span>
                <span class="salt-card__value">{{ row.danCount }}</span>
              </div>
              <div class="salt-card__cell">
                <span class="salt-card__label">四圣</span>
                <span class="salt-card__value"
                  >{{ row.blessingCount }}个共{{ row.blessingScore }}分</span
                >
              </div>
              <div class="salt-card__cell">
                <span class="salt-card__label">人数</span>
                <span class="salt-card__value">{{
                  row.participantsCount
                }}/30</span>
              </div>
              <div class="salt-card__cell">
                <span class="salt-card__label">红数</span>
                <span class="salt-card__value is-red">{{ row.redCount }}</span>
              </div>
              <div class="salt-card__cell">
                <span class="salt-card__label">战力</span>
                <span class="salt-card__value is-power">{{
                  formatPower(row.power)
                }}</span>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="viewMode === 'individual'" class="salt-cards">
          <div
            v-for="(row, index) in individualData"
            :key="'iv-' + (row.key ?? index)"
            class="salt-card"
            :class="rowClassName(row)"
          >
            <div class="salt-card__head">
              <span class="salt-card__rank">#{{ index + 1 }}</span>
              <span class="salt-card__name">{{ row.name }}</span>
            </div>
            <div class="salt-card__grid salt-card__grid--lg">
              <!-- 顺序由用户指定：积分 | 击杀数 | 死亡次数 | K/D ／ 已复活次数 | 复活丹 | 刨地 -->
              <div class="salt-card__cell">
                <span class="salt-card__label">积分</span>
                <span class="salt-card__value is-score">{{ row.score }}</span>
              </div>
              <div class="salt-card__cell">
                <span class="salt-card__label">击杀数</span>
                <span class="salt-card__value is-kill">{{ row.kill }}</span>
              </div>
              <div class="salt-card__cell">
                <span class="salt-card__label">死亡次数</span>
                <span class="salt-card__value is-death">{{ row.die }}</span>
              </div>
              <div class="salt-card__cell">
                <span class="salt-card__label">K/D</span>
                <span class="salt-card__value">{{ row.kd }}</span>
              </div>
              <div class="salt-card__cell">
                <span class="salt-card__label">已复活次数</span>
                <span class="salt-card__value">{{ row.revive }}/5</span>
              </div>
              <div class="salt-card__cell">
                <span class="salt-card__label">复活丹</span>
                <span class="salt-card__value is-revive">{{ row.dan }}</span>
              </div>
              <div class="salt-card__cell">
                <span class="salt-card__label">刨地</span>
                <span class="salt-card__value">{{ row.digGround }}</span>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="viewMode === 'all_individual'" class="salt-cards">
          <div
            v-for="(row, index) in allIndividualData"
            :key="'ai-' + (row.key ?? index)"
            class="salt-card"
            :class="rowClassName(row)"
          >
            <div class="salt-card__head salt-card__head--club">
              <span class="salt-card__rank">#{{ index + 1 }}</span>
              <span class="salt-card__name">{{ row.name }}</span>
              <!-- 俱乐部并入名字行、靠右（原来是名字下方单独一行 .salt-card__line） -->
              <span class="salt-card__club">{{ row.clubName }}</span>
            </div>
            <div class="salt-card__grid salt-card__grid--lg">
              <!-- 顺序由用户指定：积分 | 击杀数 | 死亡次数 | K/D ／ 已复活次数 | 复活丹 | 刨地 -->
              <div class="salt-card__cell">
                <span class="salt-card__label">积分</span>
                <span class="salt-card__value is-score">{{ row.score }}</span>
              </div>
              <div class="salt-card__cell">
                <span class="salt-card__label">击杀数</span>
                <span class="salt-card__value is-kill">{{ row.kill }}</span>
              </div>
              <div class="salt-card__cell">
                <span class="salt-card__label">死亡次数</span>
                <span class="salt-card__value is-death">{{ row.die }}</span>
              </div>
              <div class="salt-card__cell">
                <span class="salt-card__label">K/D</span>
                <span class="salt-card__value">{{ row.kd }}</span>
              </div>
              <div class="salt-card__cell">
                <span class="salt-card__label">已复活次数</span>
                <span class="salt-card__value">{{ row.revive }}/5</span>
              </div>
              <div class="salt-card__cell">
                <span class="salt-card__label">复活丹</span>
                <span class="salt-card__value is-revive">{{ row.dan }}</span>
              </div>
              <div class="salt-card__cell">
                <span class="salt-card__label">刨地</span>
                <span class="salt-card__value">{{ row.digGround }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, watch, nextTick } from "vue";
import { useMessage } from "naive-ui";
import { useTokenStore } from "@/stores/tokenStore";
import { useLegionWarStore } from "@/stores/legionWarStore";
import { extractValidData, formatPower } from "@/utils/legionWar";
import { getCurrentTimeByFormat } from "@/utils/DateTimeUtils";
import { isLegionWarAccessible } from "@/utils/clubBattleUtils";
import { storeToRefs } from "pinia";
import html2canvas from "html2canvas";
import * as XLSX from "xlsx";
import { 
  LogInOutline, 
  MegaphoneOutline, 
  StatsChart,
  RefreshOutline,
  ImageOutline,
  DownloadOutline
} from "@vicons/ionicons5";

const message = useMessage();
const tokenStore = useTokenStore();
const legionWarStore = useLegionWarStore();

const isAccessible = ref(isLegionWarAccessible());

// Store 状态
const { 
  isConnected, 
  connecting, 
  validData, 
  battlefieldId, 
  lastUpdateTime,
  legionDetails,
  isJoined: isEntireBattlefield 
} = storeToRefs(legionWarStore);

// 状态
const viewMode = ref("legion"); // legion | individual
const exporting = ref(false);
const tableMaxHeight = ref(600);
const exportExcel = () => {
  if (!validData.value) {
    message.warning("无数据可导出");
    return;
  }
  
  let dataToExport = [];
  let fileNamePrefix = "";
  
  if (viewMode.value === 'legion') {
    fileNamePrefix = "俱乐部战况";
    dataToExport = legionData.value.map((item, index) => ({
      "排名": index + 1,
      "俱乐部名称": item.name,
      "击杀数": item.killCnt,
      "免费复活": `${item.reviveCount}/150`,
      "积分": item.score,
      "红数": item.redCount,
      "战力": formatPower(item.power),
      "人数": `${item.participantsCount}/30`,
      "花费总丹": item.danCount,
      "四圣": `${item.blessingCount}个共${item.blessingScore}分`
    }));
  } else if (viewMode.value === 'individual') {
    fileNamePrefix = "个人战况";
    dataToExport = individualData.value.map((item, index) => ({
      "排名": index + 1,
      "名称": item.name,
      "击杀数": item.kill,
      "死亡次数": item.die,
      "已复活次数": `${item.revive}/5`,
      "积分": item.score,
      "刨地": item.digGround,
      "复活丹": item.dan,
      "K/D": item.kd
    }));
  } else if (viewMode.value === 'all_individual') {
    fileNamePrefix = "全部战况";
    dataToExport = allIndividualData.value.map((item, index) => ({
      "排名": index + 1,
      "名称": item.name,
      "俱乐部": item.clubName,
      "击杀数": item.kill,
      "死亡次数": item.die,
      "已复活次数": `${item.revive}/5`,
      "积分": item.score,
      "刨地": item.digGround,
      "复活丹": item.dan,
      "K/D": item.kd
    }));
  }
  
  if (dataToExport.length === 0) {
    message.warning("当前列表无数据");
    return;
  }

  const ws = XLSX.utils.json_to_sheet(dataToExport);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  
  const fileName = `盐场${fileNamePrefix}_${getCurrentTimeByFormat("yyyyMMdd_HHmmss")}.xlsx`;
  XLSX.writeFile(wb, fileName);
  message.success(`导出成功: ${fileName}`);
};

// 导出固定桌面宽度（沿用其它盐场组件的范式，配合 GameStatus 的导出段）
const EXPORT_WIDTH = 1280;

const exportImage = async () => {
  const element = document.querySelector(".legion-war-statistics-card .table-content");
  if (!element) {
    message.error("未找到导出内容");
    return;
  }

  exporting.value = true;
  // 临时移除最大高度以截取完整内容
  const originalMaxHeight = tableMaxHeight.value;
  tableMaxHeight.value = undefined;
  // <=768px 时三张宽表被隐藏、只显示卡片，而媒体查询按「视口」判定 ——
  // 不挂这个标记类，导出的会是手机卡片版式（规则见 GameStatus 的导出段）。
  element.classList.add("export-desktop-layout");

  try {
    await nextTick();
    // 等待一点时间确保渲染完成
    await new Promise(resolve => setTimeout(resolve, 100));

    const renderWidth = Math.max(EXPORT_WIDTH, element.scrollWidth);
    const renderHeight = element.scrollHeight;

    const canvas = await html2canvas(element, {
      useCORS: true,
      scale: 2, // Higher quality
      backgroundColor: "#ffffff",
      width: renderWidth,
      height: renderHeight,
      windowWidth: renderWidth, // 让克隆文档的媒体查询按桌面宽度解析
      windowHeight: renderHeight,
    });

    const link = document.createElement("a");
    const modeName = viewMode.value === "legion" ? "俱乐部战况" : (viewMode.value === "individual" ? "个人战况" : "全部战况");
    link.download = `盐场${modeName}_${getCurrentTimeByFormat("yyyyMMdd_HHmmss")}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    message.success("导出成功");
  } catch (error) {
    console.error("导出失败:", error);
    message.error("导出失败");
  } finally {
    element.classList.remove("export-desktop-layout");
    tableMaxHeight.value = originalMaxHeight;
    exporting.value = false;
  }
};

// 战队数据处理
const legionData = computed(() => {
  if (!validData.value?.legionInfo) return [];
  return Object.values(validData.value.legionInfo)
    .map(item => {
      const detail = legionDetails.value[item.id];
      // 优先使用详情中的红淬数据 (quenchNum)
      const realRedCount = detail?.quenchNum !== undefined ? detail.quenchNum : item.redCount;
      // 优先使用详情中的战力数据 (power)
      const realPower = detail?.power !== undefined ? detail.power : item.power;
      return {
        ...item,
        redCount: realRedCount,
        power: realPower,
        key: item.id
      };
    })
    .sort((a, b) => b.score - a.score);
});

// 个人数据处理
const individualData = computed(() => {
  if (!validData.value?.memberInfo) return [];
  const myLegionId = tokenStore.gameData?.roleInfo?.role?.legionId;
  
  // 筛选本俱乐部成员并排序
  return Object.values(validData.value.memberInfo)
    .filter(item => item.legionId == myLegionId)
    .map((item, index) => ({
      ...item,
      key: index,
      kd: item.die > 0 ? (item.kill / item.die).toFixed(2) : item.kill.toFixed(2)
    }))
    .sort((a, b) => b.kill - a.kill);
});

// 全部个人数据处理
const allIndividualData = computed(() => {
  if (!validData.value?.memberInfo) return [];
  
  return Object.values(validData.value.memberInfo)
    .map((item, index) => {
      // 获取俱乐部名称
      const legionInfo = validData.value.legionInfo?.[item.legionId];
      const clubName = legionInfo ? legionInfo.name : "未知俱乐部";
      
      return {
        ...item,
        key: item.id || index,
        clubName: clubName,
        kd: item.die > 0 ? (item.kill / item.die).toFixed(2) : item.kill.toFixed(2)
      };
    })
    .sort((a, b) => b.kill - a.kill);
});

// 表格列定义
const legionColumns = [
  { 
    title: "排名", 
    key: "rank", 
    width: 60,
    render: (_, index) => index + 1
  },
  { 
    title: "俱乐部名称", 
    key: "name",
    width: 150,
    render: (row) => {
      return  row.name
    }
  },
  { 
    title: "击杀数", 
    key: "killCnt", 
    sorter: (a, b) => a.killCnt - b.killCnt 
  },
  { 
    title: "免费复活", 
    key: "reviveCount", 
    render: (row) => `${row.reviveCount}/150` 
  },
  { 
    title: "积分", 
    key: "score", 
    sorter: (a, b) => a.score - b.score 
  },
  { 
    title: "红数", 
    key: "redCount", 
    sorter: (a, b) => a.redCount - b.redCount 
  },
  { 
    title: "战力", 
    key: "power", 
    render: (row) => formatPower(row.power),
    sorter: (a, b) => a.power - b.power 
  },
  { 
    title: "人数", 
    key: "participantsCount", 
    render: (row) => `${row.participantsCount}/30` 
  },
  { 
    title: "花费总丹", 
    key: "danCount", 
    sorter: (a, b) => a.danCount - b.danCount 
  },
  { 
    title: "四圣", 
    key: "blessingInfo", 
    render: (row) => `${row.blessingCount}个共${row.blessingScore}分` 
  }
];

const individualColumns = [
  { 
    title: "排名", 
    key: "rank", 
    width: 60,
    render: (_, index) => index + 1
  },
  { 
    title: "名称", 
    key: "name",
    width: 120
  },
  { 
    title: "击杀数", 
    key: "kill", 
    sorter: (a, b) => a.kill - b.kill 
  },
  { 
    title: "死亡次数", 
    key: "die", 
    sorter: (a, b) => a.die - b.die 
  },
  { 
    title: "已复活次数", 
    key: "revive", 
    render: (row) => `${row.revive}/5` 
  },
  { 
    title: "积分", 
    key: "score", 
    sorter: (a, b) => a.score - b.score 
  },
  { 
    title: "刨地", 
    key: "digGround", 
    sorter: (a, b) => a.digGround - b.digGround 
  },
  { 
    title: "复活丹", 
    key: "dan", 
    sorter: (a, b) => a.dan - b.dan 
  },
  { 
    title: "K/D", 
    key: "kd", 
    sorter: (a, b) => parseFloat(a.kd) - parseFloat(b.kd) 
  }
];

const allIndividualColumns = [
  { 
    title: "排名", 
    key: "rank", 
    width: 60,
    render: (_, index) => index + 1
  },
  { 
    title: "名称", 
    key: "name",
    width: 120
  },
  { 
    title: "俱乐部", 
    key: "clubName",
    width: 150
  },
  { 
    title: "击杀数", 
    key: "kill", 
    sorter: (a, b) => a.kill - b.kill 
  },
  { 
    title: "死亡次数", 
    key: "die", 
    sorter: (a, b) => a.die - b.die 
  },
  { 
    title: "已复活次数", 
    key: "revive", 
    render: (row) => `${row.revive}/5` 
  },
  { 
    title: "积分", 
    key: "score", 
    sorter: (a, b) => a.score - b.score 
  },
  { 
    title: "刨地", 
    key: "digGround", 
    sorter: (a, b) => a.digGround - b.digGround 
  },
  { 
    title: "复活丹", 
    key: "dan", 
    sorter: (a, b) => a.dan - b.dan 
  },
  { 
    title: "K/D", 
    key: "kd", 
    sorter: (a, b) => parseFloat(a.kd) - parseFloat(b.kd) 
  }
];

// 行样式
const rowClassName = (row) => {
  // 可以根据俱乐部ID高亮显示自己的俱乐部
  const myLegionId = tokenStore.gameData?.roleInfo?.role?.legionId;
  
  // 如果有 legionId 字段，说明是成员数据
  if (row.legionId !== undefined) {
    if (row.legionId == myLegionId) {
      return 'my-legion-row';
    }
  } 
  // 否则认为是俱乐部数据
  else if (row.id == myLegionId) {
    return 'my-legion-row';
  }
  
  return '';
};

const toggleBattlefieldEntry = async () => {
  if (isEntireBattlefield.value) {
    legionWarStore.disconnect(true); // 强制断开
  } else {
    try {
      await legionWarStore.connect();
    } catch (error) {
      message.error(error.message);
    }
  }
};

const refreshData = () => {
  try {
    legionWarStore.refreshData();
    message.success("已发送刷新请求");
  } catch (error) {
    message.warning(error.message);
  }
};

// 生命周期钩子
onMounted(() => {
  // 组件加载时尝试连接
  try {
    legionWarStore.connect().catch(e => {
        console.error("Auto connect failed", e);
    });
  } catch (e) {
      // ignore
  }
});

onUnmounted(() => {
   // 组件卸载时断开连接（减少引用计数）
  legionWarStore.disconnect();
});
</script>

<style scoped lang="scss">
.legion-war-statistics-container {
  padding: 8px;
  
  .legion-war-statistics-card {
    background: #fff;
    border-radius: 8px;
    box-shadow: 0 1px 2px -2px rgba(0, 0, 0, 0.08), 
                0 3px 6px 0 rgba(0, 0, 0, 0.06), 
                0 5px 12px 4px rgba(0, 0, 0, 0.04); 
    
    .access-denied-container {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 600px; /* 给个固定高度或者 min-height */
      padding: 40px;
    }

    .access-denied-info {
      margin-top: 16px;
      text-align: left;
      color: #666;
      
      p {
        margin: 4px 0;
      }
    }

    .header-section {
      padding: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #eee;
      flex-wrap: wrap;
      gap: 12px;
      
      .header-left {
        display: flex;
        align-items: center;
        gap: 12px;
        
        .header-icon {
          width: 40px;
          height: 40px;
        }
        
        .header-title {
          h2 {
            margin: 0;
            font-size: 18px;
            color: #333;
          }
          p {
            margin: 4px 0 0;
            font-size: 12px;
            color: #999;
          }
        }
      }
    }
    
    .function-section {
      padding: 12px 16px;
      background: #f9f9f9;
      border-bottom: 1px solid #eee;
      
      .function-left {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
        
        .stat-item {
          display: flex;
          align-items: center;
          gap: 4px;
          
          .stat-label {
            font-size: 12px;
            color: #666;
          }
        }
      }
    }
    
    .table-content {
      padding: 16px;
      min-height: 400px;
      
      .empty-state {
        display: flex;
        justify-content: center;
        align-items: center;
        height: 300px;
        color: #999;
        
        .loading-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
        }
      }
    }
  }
}

:deep(.my-legion-row) {
  td {
    background-color: #f0fdf4 !important;
  }
}

// 响应式调整
@media (max-width: 768px) {
  .header-section {
    flex-direction: column;
    align-items: flex-start;
  }

  /* 「暂未开放」占位：桌面是 height:600px + padding:40px，手机上又高又空。
     改成「手机端的最小高度 + 居中」：比 600px 矮得多，又靠 align-items:center
     让内容上下留白自动相等（height:auto 时卡片紧贴内容，只靠 padding 撑不出呼吸感）。
     内边距 24px，n-result 的图标 / 字号收小。
     ⚠️ 图标不能用 `--n-icon-size` 覆盖 —— naive-ui 把主题变量写成**行内样式**挂在
     `.n-result` 根节点上，class 规则赢不了；改为直接命中内部元素提特异性。 */
  /* ⚠️ 外层容器类必须一起写：桌面规则是「容器 > 卡片 > 占位」三层，少一层就特异性更低、静默失效。 */
  .legion-war-statistics-container {
    /* 卡片下方多留一点：容器基础 padding 只有 8px，空状态卡片会贴着容器底，
       与上方（头部 + 操作栏）的留白不对称。 */
    padding-bottom: 24px;

    .legion-war-statistics-card {
      .access-denied-container {
        height: auto;
        min-height: 320px;
        padding: 24px 16px;
      }

      .access-denied-info {
        margin-top: 10px;
        font-size: 12px;
        line-height: 1.6;

        p {
          margin: 3px 0;
        }
      }

      :deep(.n-result-icon__status-image),
      :deep(.n-result-base-icon),
      :deep(.n-result-icon svg) {
        font-size: 48px;
      }

      :deep(.n-result-header__title) {
        margin-top: 8px;
        font-size: 17px;
      }

      :deep(.n-result-header__description) {
        margin-top: 6px;
        font-size: 13px;
      }

      :deep(.n-result-content),
      :deep(.n-result-footer) {
        margin-top: 12px;
      }
    }
  }
}
</style>
