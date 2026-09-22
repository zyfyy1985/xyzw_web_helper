<template>
  <div class="legion-war-map-container">
    <div class="legion-war-map-card">
      <div v-if="!isAccessible" class="access-denied-container">
        <n-result
          status="403"
          title="暂未开放"
          description="该功能仅在特定时间开放"
        >
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
            <img
              src="/icons/moonPalace.png"
              alt="盐场图标"
              class="header-icon"
            />
            <div class="header-title">
              <h2>盐场实时地图</h2>
              <p>获取盐场位置分布</p>
            </div>
          </div>

          <!-- 数据统计区 -->
          <div class="stats-section">
            <div class="stat-item">
              <span class="stat-label">连接状态:</span>
              <n-tag :type="isConnected ? 'success' : 'error'">
                {{ isConnected ? "已连接" : "未连接" }}
              </n-tag>
            </div>
            <div class="stat-item">
              <span class="stat-label">战场数据:</span>
              <n-tag :type="battlefieldId ? 'success' : 'error'">{{
                battlefieldId ? "已成功获取战场数据" : "未获取到战场数据"
              }}</n-tag>
            </div>
            <div class="stat-item">
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
            </div>
          </div>
        </div>

        <!-- 主要内容区：地图 + 侧边栏 -->
        <div class="main-content-layout">
          <!-- 地图区域 -->
          <div class="map-container-wrapper">
            <div class="map-container">
              <canvas ref="legionWarMapDom" class="mapCanvas"></canvas>
            </div>

            <div v-if="!validData" class="empty-state-overlay">
              <div class="empty-content">
                <template v-if="connecting">
                  <n-spin size="large" />
                  <p>正在连接战场...</p>
                </template>
                <template v-else-if="isConnected">
                  <n-spin size="large" />
                  <p>正在获取地图数据...</p>
                </template>
                <template v-else>
                  <n-icon size="48" color="#ccc">
                    <MapOutline />
                  </n-icon>
                  <p>暂无地图数据，请手动刷新数据</p>
                </template>
              </div>
            </div>
          </div>

          <!-- [本地扩展 · 地图拖拽/缩放] 手势才是主入口（单指拖动平移、双指捏合缩放、
               双击在 2x 与 100% 之间切换、滚轮缩放），这里只是给摸不到手势的人一个兜底。
               桌面 display:none、导出长图忽略（no-export，见 exportImage 的 ignoreElements）。 -->
          <div class="map-zoom-bar no-export">
            <button class="map-zoom-btn" type="button" @click="zoomMapBy(-0.5)">
              -
            </button>
            <span class="map-zoom-val">{{ Math.round(mapZoom * 100) }}%</span>
            <button class="map-zoom-btn" type="button" @click="zoomMapBy(0.5)">
              +
            </button>
            <button
              class="map-zoom-btn map-zoom-btn--reset"
              type="button"
              @click="resetMapView"
            >
              复位
            </button>
          </div>

          <!-- [本地扩展 · 手机端侧栏抽屉开关] 桌面 display:none，只在 ≤768px 显示；
               no-export 让导出长图时忽略它（见 exportImage 的 ignoreElements）。 -->
          <n-button
            class="legion-panel-toggle no-export"
            size="small"
            type="primary"
            @click="showLegionPanel = !showLegionPanel"
          >
            {{ showLegionPanel ? "收起列表" : "俱乐部 " + sortedLegions.length }}
          </n-button>

          <!-- 右侧信息栏 -->
          <div
            class="side-info-panel"
            :class="{ 'is-open': showLegionPanel }"
            v-if="validData && sortedLegions.length > 0"
          >
            <div class="legion-list">
              <template
                v-for="(group, groupName) in allianceGroups"
                :key="groupName"
              >
                <div v-if="group.length > 0" class="alliance-group">
                  <div class="group-header">
                    <span class="group-name">{{ groupName }}</span>
                    <span class="group-count">({{ group.length }})</span>
                  </div>
                  <div
                    v-for="(legion, index) in group"
                    :key="legion.id"
                    class="legion-item"
                    :style="{ borderLeftColor: legion.color }"
                  >
                    <div class="rank-badge">
                      {{ sortedLegions.indexOf(legion) + 1 }}
                    </div>
                    <div class="legion-info">
                      <div class="legion-name" :title="legion.name">
                        <span class="legion-id">[{{ legion.serverId }}]</span>
                        {{ legion.name }}
                      </div>
                      <div class="legion-stats">
                        <span class="stat-red">红: {{ legion.redCount }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from "vue";
import { useMessage } from "naive-ui";
import { useTokenStore } from "@/stores/tokenStore";
import { useLegionWarStore } from "@/stores/legionWarStore";
import { extractValidData, HexGraph, roadPointList } from "@/utils/legionWar";
import { getCurrentTimeByFormat } from "@/utils/DateTimeUtils";
import {
  LogInOutline,
  MapOutline,
  RefreshOutline,
  ImageOutline,
} from "@vicons/ionicons5";
import { allianceincludes } from "@/utils/clubWarrankUtils";
import { isLegionWarAccessible } from "@/utils/clubBattleUtils";
import { storeToRefs } from "pinia";
import html2canvas from "html2canvas";

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
  legionDetails,
  isJoined: isEntireBattlefield,
} = storeToRefs(legionWarStore);

// 本地状态
const legionWarMapDom = ref(null);
let ctx = null;
let resizeHandler = null;

const isJoined = isEntireBattlefield; // alias for compatibility if needed, but we use isEntireBattlefield in template

const exporting = ref(false);

// [本地扩展 · 手机端] 侧栏抽屉开关（桌面端按钮 display:none，此项无影响）
const showLegionPanel = ref(false);

// 导出固定桌面宽度（沿用其它盐场组件的范式，配合 GameStatus 的导出段）
const EXPORT_WIDTH = 1280;

const exportImage = async () => {
  const element = document.querySelector(
    ".legion-war-map-card .main-content-layout",
  );
  if (!element) {
    message.error("未找到导出内容");
    return;
  }

  exporting.value = true;
  // <=768px 时主区是「地图在上 / 侧栏在下」的竖排，而媒体查询按「视口」判定 ——
  // 不挂这个标记类，导出的会是手机版式（对应规则见本文件样式末尾的「导出长图期间
  // 临时恢复桌面版式」段）。
  element.classList.add("export-desktop-layout");

  try {
    await nextTick();
    // 等待一点时间确保渲染完成
    await new Promise((resolve) => setTimeout(resolve, 100));

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
      ignoreElements: (el) => el.classList.contains("no-export"),
    });

    const link = document.createElement("a");
    link.download = `盐场地图_${getCurrentTimeByFormat("yyyyMMdd_HHmmss")}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    message.success("导出成功");
  } catch (error) {
    console.error("导出失败:", error);
    message.error("导出失败");
  } finally {
    element.classList.remove("export-desktop-layout");
    exporting.value = false;
  }
};

// 俱乐部排序
const sortedLegions = computed(() => {
  if (!validData.value || !validData.value.legionInfo) return [];

  // 将对象转换为数组并排序
  // 排序规则：红度 > 战力 > ID
  const list = Object.values(validData.value.legionInfo).map((legion) => {
    // 尝试获取公告信息，如果还没有详情则为空
    const detail = legionDetails.value[legion.id] || {};
    // 根据公告判断联盟
    const alliance = detail.announcement
      ? allianceincludes(detail.announcement)
      : "未知联盟";

    // 优先使用详情中的红淬数据
    const redCount =
      detail.quenchNum !== undefined ? detail.quenchNum : legion.redCount;

    return {
      ...legion,
      announcement: detail.announcement || "",
      alliance: alliance,
      redCount: redCount,
    };
  });

  return list.sort((a, b) => {
    // 1. 红度降序
    if (b.redCount !== a.redCount) {
      return b.redCount - a.redCount;
    }
    // 2. 战力降序 (如果有)
    if (b.power && a.power && b.power !== a.power) {
      return b.power - a.power;
    }
    // 3. ID 升序
    return parseInt(a.id) - parseInt(b.id);
  });
});

// 监听数据变化以重绘地图
watch(
  validData,
  (newVal) => {
    if (newVal) {
      nextTick(() => {
        resizeAndRedraw();
      });
    }
  },
  { deep: true },
);

// 监听联盟详情数据变化以重绘地图（因为颜色依赖于详情中的公告）
watch(
  legionDetails,
  () => {
    nextTick(() => {
      resizeAndRedraw();
    });
  },
  { deep: true },
);

// 监听连接状态变化
watch(isConnected, (newVal) => {
  if (!newVal) {
    // 断开连接后，重新绘制基础地图
    nextTick(() => {
      resizeAndRedraw();
    });
  }
});

// 获取联盟分组的列表
const allianceGroups = computed(() => {
  const groups = {};

  // 初始化分组
  const allianceTypes = [
    "大联盟",
    "梦盟",
    "正义联盟",
    "龙盟",
    "曦盟",
    "未知联盟",
  ];
  allianceTypes.forEach((type) => {
    groups[type] = [];
  });

  // 分配俱乐部到对应分组
  sortedLegions.value.forEach((legion) => {
    const alliance = legion.alliance;
    if (groups[alliance]) {
      groups[alliance].push(legion);
    } else {
      // 如果有其他未定义的类型，归入未知
      groups["未知联盟"].push(legion);
    }
  });

  return groups;
});

// Canvas 相关配置
const dpr = window.devicePixelRatio || 1;
let hexSize = 15.5;
const gap = 3;
let hexWidth = 2 * hexSize;
let hexHeight = Math.sqrt(3) * hexSize;
const arr = Array.from({ length: 41 }, () =>
  Array.from({ length: 41 }, () => 0),
);
let leftMaxPoint = [0, 0];

// 颜色映射
const typeBg = (type) => {
  switch (type) {
    case 1:
      return "#4477CE"; // 30分 - 小 - 蓝色
    case 2:
      return "#D835D8"; // 50分 - 中 - 粉紫色
    case 3:
      return "#F9B500"; // 80分 - 大 - 金色
    case 4:
      return "#D21E1E"; // 大本营 - 本 - 红色
    case 5:
      return "#2B2B2B"; // 100分 - 城 - 深灰色
    case 6:
      return "#000000"; // 核心 - 黑
    case 9:
      return "#4477CE"; // 道路 - 蓝色
    default:
      return "#cccccc";
  }
};

// 标签映射
const typeLabel = (type) => {
  switch (type) {
    case 1:
      return "小";
    case 2:
      return "中";
    case 3:
      return "大";
    case 4:
      return "本";
    case 5:
      return "城";
    case 6:
      return "核";
    default:
      return "";
  }
};

// 绘制六边形
const drawHexagon = (x, y, color, type) => {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = ((2 * Math.PI) / 6) * i;
    const px = x + hexSize * Math.cos(angle);
    const py = y + hexSize * Math.sin(angle);
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);

    if (px >= leftMaxPoint[0]) leftMaxPoint[0] = px;
    if (py >= leftMaxPoint[1]) leftMaxPoint[1] = py;
  }
  ctx.closePath();

  // 填充背景
  ctx.fillStyle = color;
  ctx.fill();

  // 描边
  ctx.strokeStyle = "#ffffff"; // 白色边框
  ctx.lineWidth = 1;
  ctx.stroke();
};

// 联盟颜色映射
const allianceColors = {
  大联盟: "#667eea", // var(--primary-color)
  梦盟: "#18a058", // var(--success-color)
  正义联盟: "#2080f0", // var(--info-color)
  龙盟: "#d03050", // var(--error-color)
  曦盟: "#9c27b0", // 紫色
  未知联盟: "#f5a623", // var(--warning-color)
};

// 绘制文字
const drawText = (x, y, text, color = "#fff", fontSize = 10) => {
  ctx.fillStyle = color;
  ctx.font = `bold ${fontSize}px Microsoft Yahei`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
};

// 绘制地图内容
const drawCanvasContent = () => {
  if (!ctx) return;

  // 清空画布
  ctx.clearRect(0, 0, ctx.canvas.width / dpr, ctx.canvas.height / dpr);

  // 重置 arr 数组
  arr.forEach((row) => row.fill(0));

  // 获取图结构实例
  let graph = HexGraph.getInstance();
  graph.removeAllNode();

  // 计算需要绘制的行列数以铺满画布
  const canvasWidth = ctx.canvas.width / dpr;
  const canvasHeight = ctx.canvas.height / dpr;
  const horizontalStep = hexWidth * 0.75 + gap;
  const verticalStep = hexHeight + gap;

  const maxCols = Math.ceil(canvasWidth / horizontalStep) + 2;
  const maxRows = Math.ceil(canvasHeight / verticalStep) + 2;

  // 绘制背景网格
  ctx.strokeStyle = "#e0e0e0"; // 浅灰色边框
  ctx.lineWidth = 1;

  for (let row = 0; row < maxRows; row++) {
    for (let col = 0; col < maxCols; col++) {
      // 背景网格从第0行开始绘制，铺满全屏
      const x = col * (hexWidth * 0.75) + hexSize + gap * col;
      const y =
        row * hexHeight + (col % 2 === 1 ? hexHeight / 2 : 0) + gap * row;

      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = ((2 * Math.PI) / 6) * i;
        const px = x + hexSize * Math.cos(angle);
        const py = y + hexSize * Math.sin(angle);
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();

      // 绘制坐标
      //drawText(x, y, `${col},${row}`, "#e0e0e0", 8);
    }
  }

  // 平移画布以居中显示有效区域
  // 假设有效区域左上角偏移约为 (-2, -3) 个六边形
  ctx.save();
  ctx.translate(2 * (hexWidth * 0.75 + gap), -1 * (hexHeight + gap));

  // 使用静态数据作为基础，结合 validData 处理颜色和状态
  // 1. 准备数据
  // 注意：即使 validData 为 null，也应该填充 graph，以显示基础地图
  graph.addNodeList(
    roadPointList.map((item) => {
      const realTimeNode = validData.value?.buildingData?.[item.id];
      // 优先使用实时数据中的 type，如果没有则使用静态 type
      const type = realTimeNode?.type || item.type;
      const belongsLegionId = realTimeNode ? realTimeNode.belongsLegionId : -1;

      return {
        id: item.id,
        type: type,
        belongsLegionId: belongsLegionId,
        hP: realTimeNode ? realTimeNode.hP : 0,
        maxHP: realTimeNode ? realTimeNode.maxHP : 0,
        point: realTimeNode ? realTimeNode.point : 0,
        belongsLegionInfo: validData.value?.legionInfo?.[belongsLegionId],
      };
    }),
  );

  // 2. 绘制所有网格节点
  // 使用 graph.getAllNodes() 获取 graph 中的节点，如果为空则使用 roadPointList
  const graphNodes = graph.getAllNodes();
  const nodesToDraw =
    graphNodes.length > 0
      ? graphNodes
      : roadPointList.map((item) => {
          // 确保静态数据也有正确的属性结构
          return {
            ...item,
            // 如果是静态数据，确保这些字段存在
            type: item.type,
            belongsLegionId: -1,
          };
        });

  nodesToDraw.forEach((node) => {
    const [colStr, rowStr] = node.id.split("_");
    const col = parseInt(colStr);
    const row = parseInt(rowStr);

    if (!isNaN(col) && !isNaN(row)) {
      const x = col * (hexWidth * 0.75) + hexSize + gap * col;
      const y =
        row * hexHeight + (col % 2 === 1 ? hexHeight / 2 : 0) + gap * row;

      // 决定背景色：始终使用类型颜色，不依赖归属情况
      let bgColor = typeBg(node.type);

      // 核心周围特殊处理
      const coreSurroundingPoints = [
        "19_16",
        "19_17",
        "20_16",
        "20_18",
        "21_16",
        "21_17",
      ];
      if (coreSurroundingPoints.includes(node.id)) {
        bgColor = "#cccccc";
      }

      // 核心始终显示黑色 (根据类型6判断，不依赖归属)
      if (node.type === 6) {
        bgColor = "#000000";
      }

      drawHexagon(x, y, bgColor, node.type);

      // 绘制标签
      if (node.type !== 9) {
        const label = typeLabel(node.type);
        drawText(x, y, label, "#fff", 12);
      }
    }
  });

  // 绘制俱乐部名称 (独立逻辑)
  if (validData.value && validData.value.legionInfo) {
    Object.values(validData.value.legionInfo).forEach((legion) => {
      // 必须有大本营坐标
      if (legion.strongholdId) {
        const [colStr, rowStr] = legion.strongholdId.split("_");
        const col = parseInt(colStr);
        const row = parseInt(rowStr);

        if (!isNaN(col) && !isNaN(row)) {
          const x = col * (hexWidth * 0.75) + hexSize + gap * col;
          const y =
            row * hexHeight + (col % 2 === 1 ? hexHeight / 2 : 0) + gap * row;

          // 获取联盟信息
          const detail = legionDetails.value[legion.id] || {};

          // 格式：「【N红】名称」。原先画「【区服ID】名称」—— 区服ID 没信息量，把括号里
          //   换成红数，版式（含宽度自适应）与原来完全一致。
          //   红数与侧栏列表同源同优先级：优先实时 quenchNum，其次 legionInfo.redCount。
          //   （手机端/电脑端共用这份 drawCanvasContent，改一处两边生效。）
          const redCount =
            detail.quenchNum !== undefined ? detail.quenchNum : legion.redCount || 0;
          const nameStr = `【${redCount}红】${legion.name}`;
          const alliance = detail.announcement
            ? allianceincludes(detail.announcement)
            : "未知联盟";
          const allianceColor =
            allianceColors[alliance] || allianceColors["未知联盟"];

          // 绘制背景和文字
          ctx.font = "bold 12px Microsoft Yahei";
          const textWidth = ctx.measureText(nameStr).width;
          const padding = 10;
          const height = 24;
          const bgX = x - textWidth / 2 - padding / 2;
          const bgY = y - 32;
          const bgWidth = textWidth + padding;

          ctx.fillStyle = allianceColor;

          const r = 4;
          ctx.beginPath();
          ctx.moveTo(bgX + r, bgY);
          ctx.arcTo(bgX + bgWidth, bgY, bgX + bgWidth, bgY + height, r);
          ctx.arcTo(bgX + bgWidth, bgY + height, bgX, bgY + height, r);
          ctx.arcTo(bgX, bgY + height, bgX, bgY, r);
          ctx.arcTo(bgX, bgY, bgX + bgWidth, bgY, r);
          ctx.closePath();
          ctx.fill();

          drawText(x, bgY + height / 2, nameStr, "#fff", 12);
        }
      }
    });
  }
};
const resizeAndRedraw = () => {
  if (!legionWarMapDom.value) return;
  const canvas = legionWarMapDom.value;
  const container = canvas.parentElement;

  // 移除之前添加的 style 尺寸设置
  canvas.style.width = "100%";
  canvas.style.height = "100%";

  const w = container.clientWidth;
  const h = container.clientHeight;

  // 设置 Canvas 物理像素大小
  canvas.width = w * dpr;
  canvas.height = h * dpr;

  // 根据容器大小动态计算合适的 hexSize
  // 地图尺寸: 41列 * 41行
  const cols = 41;
  const rows = 41;

  // 计算可用空间下最大的 hexSize
  // 宽度公式: w = cols * (1.5 * s + gap) + 0.5 * s
  // 高度公式: h = rows * (sqrt(3) * s + gap) + sqrt(3)/2 * s

  // 简化计算 (减少边距以最大化显示)
  const padding = 10;
  const availableW = w - padding * 2;
  const availableH = h - padding * 2;

  const sizeW = (availableW - (cols - 1) * gap) / (cols * 1.5 + 0.5);
  const sizeH =
    (availableH - (rows - 1) * gap) / (rows * Math.sqrt(3) + Math.sqrt(3) / 2);

  // 取较小值以确保完整显示
  hexSize = Math.min(sizeW, sizeH);

  // 限制最大最小尺寸，避免极端情况
  hexSize = Math.max(12, Math.min(hexSize, 30));

  // 更新依赖变量
  hexWidth = 2 * hexSize;
  hexHeight = Math.sqrt(3) * hexSize;

  if (ctx) {
    ctx.scale(dpr, dpr);
    drawCanvasContent();
  }
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

const initializeCanvas = async () => {
  await nextTick();
  const canvas = legionWarMapDom.value;
  if (!canvas) return false;

  const context = canvas.getContext("2d");
  if (!context) return false;
  ctx = context;

  if (!resizeHandler) {
    resizeHandler = () => resizeAndRedraw();
    window.addEventListener("resize", resizeHandler);
  }

  resizeAndRedraw();
  return true;
};

// 生命周期钩子
onMounted(async () => {
  await initializeCanvas();

  try {
    legionWarStore.connect().catch((e) => {
      console.error("Auto connect failed", e);
    });
  } catch (e) {}
});

watch(isAccessible, async (accessible) => {
  if (accessible) {
    await initializeCanvas();
  }
});

onUnmounted(() => {
  if (resizeHandler) {
    window.removeEventListener("resize", resizeHandler);
    resizeHandler = null;
  }
  legionWarStore.disconnect();
});

/* ══════════════════════════════════════════════════════════════════════════
 * [本地扩展 · 地图拖拽 / 缩放]（只在手机端生效，桌面完全不动）
 * --------------------------------------------------------------------------
 * 为什么：地图在 12px 六边形下约 870×980，手机屏（约 374px 宽）一屏放不下。
 *   原来靠「.map-container-wrapper 内两轴 overflow:auto」看全图 —— 手机上既看不到
 *   滚动条、又要横竖各滚一次，很难用。改成手势：单指拖动平移 / 双指捏合缩放 /
 *   双击在 2x 与 100% 间切换 / 滚轮缩放（窄窗口调试用），左下角另有 -/＋/复位 兜底。
 *
 * 实现要点（都不碰画布尺寸逻辑，所以 hexSize 仍恒为 12、标签不糊）：
 *   1) 只对舞台（canvas 父节点 = .map-container）做 transform: translate3d + scale，
 *      transform-origin 为 0 0，与 JS 里「先 translate 后 scale」的顺序一致
 *      → 屏幕坐标 = offset + 局部坐标 * scale。
 *   2) 画布按 devicePixelRatio 倍率绘制，所以放大到约 dpr（手机常见 3×）以内
 *      仍是 1:1 设备像素，不会虚。
 *   3) 舞台尺寸用**行内 style** 写死 920×1000（内联优先级最高）→ 即使手机端 CSS
 *      规则将来被改动或被上游规则压掉，地图也不会被裁在一个小画布里。
 *   4) 平移做了夹取：图比视口大时不允许拖出留白，比视口小时保持居中不跑偏。
 *   5) ⚠️ 本组件是 `<script setup>`（**没有** lang="ts"）→ 这里**不能写 TS 类型标注**，
 *      否则 compileScript 直接报 "Missing semicolon"。
 * ════════════════════════════════════════════════════════════════════════ */
const MAP_STAGE_W = 920; // 与手机端 CSS 里 .map-container 的固定尺寸一致
const MAP_STAGE_H = 1000; // 两者共同保证 resizeAndRedraw 里 hexSize = 12
const MAP_ZOOM_MAX = 4;
// 手机端「打开/复位」的默认缩放（缩放条显示 50%）。0.5 > mapFitScale()（374/920≈0.41），
// 所以不会被最小缩放夹住；比 100% 一屏能多看约一倍的地名，又不至于小到看不清 12px 字。
const MAP_DEFAULT_ZOOM = 0.5;
const MAP_MOBILE_QUERY = "(max-width: 768px)";
const mapZoom = ref(1);
let mapPanX = 0;
let mapPanY = 0;
let mapViewBound = false;
let mapViewEl = null; // 已绑定的视口元素（主区被 v-else 重建时靠它识别「换了元素」）
let mapViewCleanup = null;

const isMapMobile = () => window.matchMedia(MAP_MOBILE_QUERY).matches;

// canvas（legionWarMapDom）→ .map-container（舞台）→ .map-container-wrapper（视口）
const mapStageEl = () => {
  const canvas = legionWarMapDom.value;
  return canvas ? canvas.parentElement : null;
};
const mapViewportEl = () => {
  const stage = mapStageEl();
  return stage ? stage.parentElement : null;
};

const applyMapTransform = () => {
  const stage = mapStageEl();
  if (!stage) return;
  stage.style.transformOrigin = "0 0";
  stage.style.transform =
    "translate3d(" +
    mapPanX +
    "px, " +
    mapPanY +
    "px, 0) scale(" +
    mapZoom.value +
    ")";
};

// 缩到「整图刚好放得下」即为最小缩放（再小就只剩白边了）
const mapFitScale = () => {
  const vp = mapViewportEl();
  const stage = mapStageEl();
  if (!vp || !stage) return 1;
  const vw = vp.clientWidth;
  const vh = vp.clientHeight;
  if (!vw || !vh) return 1;
  return Math.min(vw / stage.offsetWidth, vh / stage.offsetHeight, 1);
};

const clampMapPan = () => {
  const vp = mapViewportEl();
  const stage = mapStageEl();
  if (!vp || !stage) return;
  const w = stage.offsetWidth * mapZoom.value;
  const h = stage.offsetHeight * mapZoom.value;
  const minX = Math.min(0, vp.clientWidth - w);
  const maxX = Math.max(0, vp.clientWidth - w);
  const minY = Math.min(0, vp.clientHeight - h);
  const maxY = Math.max(0, vp.clientHeight - h);
  mapPanX = Math.min(maxX, Math.max(minX, mapPanX));
  mapPanY = Math.min(maxY, Math.max(minY, mapPanY));
};

/** 以屏幕上某点为焦点缩放（focalX/focalY 为 clientX/clientY，省略则用视口中心） */
const setMapZoom = (next, focalX, focalY) => {
  const vp = mapViewportEl();
  if (!vp) return;
  const rect = vp.getBoundingClientRect();
  const from = mapZoom.value;
  const target = Math.min(MAP_ZOOM_MAX, Math.max(mapFitScale(), next));
  if (Math.abs(target - from) < 0.001) return;
  const fx = (focalX === undefined ? rect.left + rect.width / 2 : focalX) - rect.left;
  const fy = (focalY === undefined ? rect.top + rect.height / 2 : focalY) - rect.top;
  const ratio = target / from;
  // 让焦点处的图元保持不动
  mapPanX = fx - (fx - mapPanX) * ratio;
  mapPanY = fy - (fy - mapPanY) * ratio;
  mapZoom.value = target;
  clampMapPan();
  applyMapTransform();
};

const zoomMapBy = (delta) => setMapZoom(mapZoom.value + delta);

const resetMapView = () => {
  const vp = mapViewportEl();
  const stage = mapStageEl();
  mapZoom.value = MAP_DEFAULT_ZOOM; // 打开/复位都回到默认视图（50%），不再是 100%
  if (vp && stage) {
    // ⚠️ 居中要按「缩放后的尺寸」算：offsetWidth 是 1x 的宽，乘上 zoom 才是屏上实际占宽，
    //    否则 50% 时算出的位移会超出 clampMapPan 的允许区间，图会被钉到一边而不是居中。
    mapPanX = (vp.clientWidth - stage.offsetWidth * mapZoom.value) / 2;
    mapPanY = (vp.clientHeight - stage.offsetHeight * mapZoom.value) / 2;
  } else {
    mapPanX = 0;
    mapPanY = 0;
  }
  clampMapPan();
  applyMapTransform();
};

/** 手机端把舞台写成 920×1000（行内 style），回到桌面则清掉并重绘 */
const syncMapStage = () => {
  const stage = mapStageEl();
  if (!stage) return;
  if (isMapMobile()) {
    const wantW = MAP_STAGE_W + "px";
    const wantH = MAP_STAGE_H + "px";
    if (stage.style.width !== wantW || stage.style.height !== wantH) {
      stage.style.width = wantW;
      stage.style.height = wantH;
      resizeAndRedraw();
    }
  } else if (stage.style.width) {
    stage.style.width = "";
    stage.style.height = "";
    stage.style.transform = "";
    resizeAndRedraw();
  }
};

const bindMapGestures = () => {
  const vp = mapViewportEl();
  if (!vp) return;
  // 同一个元素重复调用直接返回；换了元素（主区重建）先把旧的解绑掉再重绑
  if (mapViewBound && mapViewEl === vp) return;
  if (mapViewCleanup) mapViewCleanup();
  mapViewEl = vp;
  mapViewBound = true;

  let panLast = null; // 单指上一帧位置
  let panMoved = false; // 本次触摸是否真的移动过（用于区分「点按」与「拖动」）
  let pinchLastDist = 0;
  let pinchLastMid = null;
  let lastTapAt = 0;
  let lastTapX = 0;
  let lastTapY = 0;

  const distOf = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  const midOf = (a, b) => ({
    x: (a.clientX + b.clientX) / 2,
    y: (a.clientY + b.clientY) / 2,
  });

  const onTouchStart = (e) => {
    if (!isMapMobile()) return;
    if (e.touches.length >= 2) {
      pinchLastDist = distOf(e.touches[0], e.touches[1]);
      pinchLastMid = midOf(e.touches[0], e.touches[1]);
      panLast = null;
      panMoved = true;
    } else if (e.touches.length === 1) {
      pinchLastDist = 0;
      pinchLastMid = null;
      panMoved = false;
      panLast = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };

  const onTouchMove = (e) => {
    if (!isMapMobile()) return;
    if (e.touches.length >= 2) {
      e.preventDefault();
      const d = distOf(e.touches[0], e.touches[1]);
      const m = midOf(e.touches[0], e.touches[1]);
      if (pinchLastDist > 0 && Math.abs(d - pinchLastDist) > 0.5) {
        setMapZoom(mapZoom.value * (d / pinchLastDist), m.x, m.y);
      }
      if (pinchLastMid) {
        // 双指整体平移：中点位移直接加到 offset
        mapPanX += m.x - pinchLastMid.x;
        mapPanY += m.y - pinchLastMid.y;
        clampMapPan();
        applyMapTransform();
      }
      pinchLastDist = d;
      pinchLastMid = m;
      panMoved = true;
      return;
    }
    if (e.touches.length === 1 && panLast) {
      e.preventDefault();
      const t = e.touches[0];
      const dx = t.clientX - panLast.x;
      const dy = t.clientY - panLast.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) panMoved = true;
      mapPanX += dx;
      mapPanY += dy;
      panLast = { x: t.clientX, y: t.clientY };
      clampMapPan();
      applyMapTransform();
    }
  };

  const onTouchEnd = (e) => {
    if (e.touches.length === 0) {
      const now = Date.now();
      const last = panLast;
      if (last && !panMoved) {
        // 双击：2x 与 100% 之间切换，以点击点为焦点
        if (now - lastTapAt < 300 && Math.abs(lastTapX - last.x) < 30 && Math.abs(lastTapY - last.y) < 30) {
          setMapZoom(mapZoom.value >= 1.9 ? 1 : 2, last.x, last.y);
          lastTapAt = 0;
        } else {
          lastTapAt = now;
          lastTapX = last.x;
          lastTapY = last.y;
        }
      }
      panLast = null;
      panMoved = false;
      pinchLastDist = 0;
      pinchLastMid = null;
      return;
    }
    // 双指抬起一根 → 退化为单指拖动
    if (e.touches.length === 1) {
      panLast = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      pinchLastDist = 0;
      pinchLastMid = null;
    }
  };

  const onWheel = (e) => {
    if (!isMapMobile()) return;
    e.preventDefault();
    setMapZoom(mapZoom.value * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e.clientX, e.clientY);
  };

  const onResize = () => {
    syncMapStage();
    clampMapPan();
    applyMapTransform();
  };

  vp.addEventListener("touchstart", onTouchStart, { passive: true });
  vp.addEventListener("touchmove", onTouchMove, { passive: false });
  vp.addEventListener("touchend", onTouchEnd, { passive: true });
  vp.addEventListener("touchcancel", onTouchEnd, { passive: true });
  vp.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("resize", onResize);

  mapViewCleanup = () => {
    vp.removeEventListener("touchstart", onTouchStart);
    vp.removeEventListener("touchmove", onTouchMove);
    vp.removeEventListener("touchend", onTouchEnd);
    vp.removeEventListener("touchcancel", onTouchEnd);
    vp.removeEventListener("wheel", onWheel);
    window.removeEventListener("resize", onResize);
    mapViewBound = false;
    mapViewEl = null;
    mapViewCleanup = null;
  };
};

// 自己单独一个 onMounted（不改上游那个）：等上游 initializeCanvas 跑完再接手势
onMounted(async () => {
  await nextTick();
  syncMapStage();
  bindMapGestures();
  if (isMapMobile()) resetMapView();
});

// ⚠️ 地图主区在 <template v-else> 里（isAccessible=false 时整个主区不存在）→ 画布可能
// 在挂载之后才出现：比如页面在「暂未开放」时载入、之后 isAccessible 翻成 true。
// 这时 onMounted 早就跑完了，所以要在模板 ref 上再挂一个 watch 补一次。
watch(legionWarMapDom, (el) => {
  if (!el) return;
  syncMapStage();
  bindMapGestures();
  if (isMapMobile()) resetMapView();
});

onUnmounted(() => {
  if (mapViewCleanup) mapViewCleanup();
});
</script>

<style scoped lang="scss">
.legion-war-map-container {
  padding: 8px;

  .legion-war-map-card {
    background: #fff;
    border-radius: 8px;
    box-shadow:
      0 1px 2px -2px rgba(0, 0, 0, 0.08),
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

      .stats-section {
        display: flex;
        gap: 16px;
        align-items: center;

        .stat-item {
          display: flex;
          align-items: center;
          gap: 8px;

          .stat-label {
            font-size: 13px;
            color: #666;
          }
        }
      }
    }

    .main-content-layout {
      position: relative;
      width: 100%;
      height: 960px;
      display: flex;
      overflow: hidden;

      /* [本地扩展 · 盐场地图手机端抽屉开关] 桌面隐藏。
         ⚠️ 必须写成「外层容器类一起写」的 4 段选择器：@media 内把它显示出来的规则
         是同一条 4 段链（同特异性），靠源码顺序（@media 在更后面）胜出。
         若写成单类选择器，会退化成和 naive-ui 自己的 .n-button 规则抢优先级，不可靠。 */
      .legion-panel-toggle {
        display: none;
      }

      /* [本地扩展 · 地图拖拽/缩放] 桌面地图 100% 就装得下，不需要缩放控件。 */
      .map-zoom-bar {
        display: none;
      }

      .map-container-wrapper {
        flex: 1;
        height: 100%;
        position: relative;
        background-color: #f5f5f5;
        overflow: hidden;

        .map-container {
          width: 100%;
          height: 100%;

          .mapCanvas {
            width: 100%;
            height: 100%;
            display: block;
          }
        }

        .empty-state-overlay {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          display: flex;
          justify-content: center;
          align-items: center;
          background-color: rgba(255, 255, 255, 0.8);
          z-index: 10;

          .empty-content {
            text-align: center;
            color: #999;

            p {
              margin-top: 12px;
            }
          }
        }
      }

      .side-info-panel {
        width: 300px;
        height: 100%;
        background: #fff;
        border-left: 1px solid #eee;
        display: flex;
        flex-direction: column;
        z-index: 20;
        box-shadow: -2px 0 8px rgba(0, 0, 0, 0.05);

        .panel-header {
          padding: 12px 16px;
          border-bottom: 1px solid #eee;
          background: #f9f9f9;

          h3 {
            margin: 0;
            font-size: 16px;
            color: #333;
          }
        }

        .legion-list {
          flex: 1;
          overflow-y: auto;
          padding: 8px;

          .legion-item {
            display: flex;
            align-items: center;
            padding: 2px 4px; /* 进一步减小内边距 */
            margin-bottom: 2px; /* 进一步减小外边距 */
            background: #f8f9fa;
            border-radius: 4px;
            border-left: 4px solid transparent;
            transition: all 0.2s;
            height: 32px; /* 进一步减小固定高度 */

            &:hover {
              background: #f0f0f0;
              transform: translateX(2px);
            }

            .rank-badge {
              width: 18px;
              height: 18px;
              background: #e0e0e0;
              color: #666;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 10px;
              font-weight: bold;
              margin-right: 6px;
              flex-shrink: 0;
            }

            .legion-info {
              flex: 1;
              overflow: hidden;
              display: flex; /* 改为 flex 布局 */
              align-items: center; /* 垂直居中 */
              justify-content: space-between; /* 两端对齐 */

              .legion-name {
                font-size: 13px; /* 缩小字体 */
                color: #333;
                font-weight: 500;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                margin-bottom: 0; /* 移除底部边距 */
                margin-right: 8px; /* 添加右侧间距 */
                flex: 1; /* 占据剩余空间 */

                .legion-id {
                  color: #999;
                  font-size: 11px;
                  margin-right: 4px;
                  font-weight: normal;
                }
              }

              .legion-stats {
                display: flex;
                align-items: center;
                gap: 4px;
                font-size: 11px;
                flex-shrink: 0; /* 防止被压缩 */

                .stat-red {
                  color: #d03050;
                  background: rgba(208, 48, 80, 0.1);
                  padding: 1px 4px; /* 减小内边距 */
                  border-radius: 3px;
                }
              }
            }
          }

          .alliance-group {
            margin-bottom: 4px; /* 进一步减小分组间距 */

            .group-header {
              display: flex;
              align-items: center;
              padding: 2px 4px; /* 进一步减小标题内边距 */
              margin-bottom: 2px;

              .group-name {
                font-weight: bold;
                font-size: 13px; /* 缩小字体 */
                color: #333;
                margin-right: 6px;
              }

              .group-count {
                font-size: 11px;
                color: #999;
              }
            }
          }
        }
      }
    }
  }
}

// 响应式调整
@media (max-width: 768px) {
  .header-section {
    flex-direction: column;
    align-items: flex-start;

    .stats-section {
      width: 100%;
      justify-content: space-between;
    }
  }

  /* 头部操作按钮组（进入战场 / 刷新数据 / 导出图片）——它们在模板里是 .stats-section
     的第 3 个 .stat-item，桌面 1280px 宽刚好放下；手机上三个按钮（naive-ui 是 nowrap
     且不收缩）会整组顶出卡片右边界。两层修：
       ① 这一组独占整行 + 允许换行 → 兜住任意窄屏（320px 也不会横滑）；
       ② 压掉按钮自身的左右内边距，让 390px 下三个按钮仍能排一行（丑在换行、不如排一行）。
     ⚠️ naive-ui 的尺寸变量（--n-padding 等）是写在根节点的**行内 style**，CSS 覆盖不了，
        所以直接命中 .n-button 自身。scoped 的 :deep 编译成 [data-v-x] .n-button（特异性 2），
        压过 naive-ui 自己的 .n-button（特异性 1），不需要 !important。 */
  .legion-war-map-container
    .legion-war-map-card
    .header-section
    .stats-section
    .stat-item:last-child {
    width: 100%;
    min-width: 0;
    flex-wrap: wrap;

    :deep(.n-button) {
      padding-left: 8px;
      padding-right: 8px;
    }
  }

  .map-container-wrapper {
    height: 400px !important;
  }

  /* 「暂未开放」占位：同 LegionWarStatistics —— 桌面 600px 定高 + 40px 内边距在
     手机上过高过空；改成手机端最小高度 320px + 居中，上下留白自动相等，
     并收小字号。 */
  /* ⚠️ 外层容器类必须一起写（理由同 LegionWarStatistics：特异性要压过桌面规则）。 */
  .legion-war-map-container {
    /* 卡片下方多留一点（同 LegionWarStatistics：容器基础 padding 只有 8px）。 */
    padding-bottom: 24px;

    .legion-war-map-card {
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

  /* ── 主区：地图占满 + 侧栏改「覆盖式抽屉」
        桌面 .main-content-layout 是 flex + height:960px、右侧栏固定 300px ——
        手机上整行只有约 374px，侧栏独占 300px 后地图只剩不到 80px。因此：
        · 主区改 column，地图占满整行、高度 62vh（不低于 380px）；
        · 地图容器**内部双向滚动**：六边形有 12px 下限（「小/中/大/本/城/核」是 12px
          字号，再小就糊），全图在 12px 下约 880×735，一屏放不下 → 只能滑动看全。
          ⚠️ 不要为了「一屏全览」去调小那个下限，字会糊成一片。
        · 侧栏绝对定位贴底覆盖在地图上，默认收起，由 .legion-panel-toggle 开合。
        外层容器类必须一起写（同「暂未开放」那段：特异性要压过桌面规则）。 */
  .legion-war-map-container .legion-war-map-card .main-content-layout {
    flex-direction: column;
    height: auto;
  }

  .legion-war-map-container
    .legion-war-map-card
    .main-content-layout
    .map-container-wrapper {
    /* ⚠️ flex:none 不是装饰：桌面的 flex:1 含 flex-basis:0%，在 column 主轴下会让
       下面的 height 整条失效，高度只能塌到 min-height。必须显式压掉。 */
    flex: none;
    width: 100%;
    height: 62vh !important;
    min-height: 380px;
    /* [本地扩展 · 地图拖拽/缩放] 不再是「容器内两轴滚动」：overflow 必须 hidden
       （transform 的位移会计入可滚动区域，否则又冒滚动条），touch-action:none 把
       手势控制权交给 JS，避免浏览器把单指拖动当成页面滚动。 */
    overflow: hidden;
    touch-action: none;

    /* ⚠️ 920×1000 是算出来的：resizeAndRedraw 里 hexSize = clamp(min(sizeW, sizeH), 12, 30)，
         这两个值使 sizeH≈11.96 成为较小者 → hexSize 恒为 12（不随视口高度漂移）。
         920 宽保证 12px 六边形下的全图（约 880 宽，含 translate 偏移）完整落在画布内。
         改动这两个数会连带改变 hexSize 与地图裁切范围，别随手调。 */
    .map-container {
      width: 920px;
      height: 1000px;
      /* [本地扩展 · 地图拖拽/缩放] 原点在左上角，与 JS 的 translate→scale 顺序一致。 */
      transform-origin: 0 0;
      will-change: transform;
    }
  }

  .legion-war-map-container
    .legion-war-map-card
    .main-content-layout
    .legion-panel-toggle {
    display: inline-flex;
    position: absolute;
    top: 10px;
    /* [本地扩展] 左上角 —— 与右上角的缩放控件分居两侧，互不遮挡。 */
    left: 10px;
    z-index: 30;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
  }

  .legion-war-map-container
    .legion-war-map-card
    /* ⚠️ :not(.export-desktop-layout) 不是装饰：导出长图时真机仍是手机视口，这段
       @media 规则照样命中；而 html2canvas 的克隆文档按 1280px 判定媒体查询，命中不了。
       两边排版不同 → 「真机量到的高度」必然对不上「克隆需要的高度」，长图不是被裁就是
       留一大片空白。挂上标记类后整段失效，真机直接回到桌面排版（300px 侧栏 + 桌面
       字号/行高/内边距），与克隆一致。 */
    .main-content-layout:not(.export-desktop-layout)
    /* 左侧抽屉：贴左、通高、尽量窄。顶部留 44px 给「俱乐部」开关（按钮 z-index 30
       压在抽屉之上，正好充当抽屉标题栏），底部让军团列表自己滚。
       宽度 148px 是算出来的：可用 110px ≈ 徽章 17 + 「[区服] 名字」最多 60 + 红数 34，
       再长的名字靠换行显示，不做省略号截断（用户要求「展示的内容要都有」）。 */
    .side-info-panel {
    position: absolute;
    top: 0;
    bottom: 0;
    right: auto;
    left: 0;
    width: 148px;
    height: 100%;
    max-height: none;
    box-sizing: border-box;
    padding-top: 44px; /* = 开关按钮 top 10 + 高约 30，避免内容钻到按钮底下 */
    border-left: none;
    border-top: none;
    border-right: 1px solid #eee;
    border-radius: 0 12px 12px 0;
    box-shadow: 4px 0 16px rgba(0, 0, 0, 0.12);
    z-index: 25;
    overflow: hidden;
    opacity: 0;
    transform: translateX(-105%);
    transition:
      transform 0.25s ease,
      opacity 0.25s ease;
    pointer-events: none;

    &.is-open {
      opacity: 1;
      transform: translateX(0);
      pointer-events: auto;
    }

    /* ── 以下为「窄宽度下把间距压小、但字段一个不少」的覆盖。
          选择器链条段数逐条与桌面规则对齐（同特异性）→ 靠源码顺序（本块更靠后）胜出。 ── */
    .legion-list {
      flex: 1;
      min-height: 0;
      max-height: none;
      overflow-y: auto;
      padding: 0 6px 8px;

      .alliance-group {
        margin-bottom: 4px;

        .group-header {
          padding: 1px 2px;
          margin-bottom: 2px;

          .group-name {
            font-size: 11px;
            margin-right: 4px;
          }

          .group-count {
            font-size: 10px;
          }
        }
      }

      .legion-item {
        height: auto;
        min-height: 24px;
        padding: 2px 3px;
        margin-bottom: 2px;
        border-left-width: 3px;
        border-radius: 3px;

        .rank-badge {
          width: 14px;
          height: 14px;
          margin-right: 3px;
          font-size: 9px;
        }

        .legion-info {
          min-width: 0;

          .legion-name {
            /* 窄抽屉里改为换行，不用省略号 —— 名字与 [区服] 都要看得见 */
            white-space: normal;
            overflow: visible;
            text-overflow: clip;
            overflow-wrap: anywhere;
            word-break: break-word;
            font-size: 11px;
            line-height: 1.25;
            margin-right: 4px;

            .legion-id {
              font-size: 10px;
              margin-right: 2px;
            }
          }

          .legion-stats {
            gap: 2px;
            font-size: 10px;

            .stat-red {
              padding: 0 3px;
            }
          }
        }
      }
    }
  }

  /* ── [本地扩展 · 地图拖拽/缩放] 兜底控件：右上角（开关在左上角，两侧分担）。
        桌面 display:none、导出忽略（no-export）。z-index 20，抽屉在左侧 25 → 互不遮挡。 */
  .legion-war-map-container
    .legion-war-map-card
    .main-content-layout
    .map-zoom-bar {
    display: flex;
    position: absolute;
    /* [本地扩展] 右上角。 */
    right: 10px;
    top: 10px;
    z-index: 20;
    align-items: center;
    gap: 4px;
    padding: 2px 4px;
    background: rgba(255, 255, 255, 0.94);
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);

    .map-zoom-btn {
      min-width: 24px;
      height: 24px;
      padding: 0 5px;
      border: none;
      border-radius: 6px;
      background: #eef2f7;
      color: #334155;
      font-size: 14px;
      line-height: 1;
      cursor: pointer;

      &:active {
        background: #dde5ee;
      }
    }

    .map-zoom-btn--reset {
      font-size: 12px;
    }

    .map-zoom-val {
      min-width: 34px;
      text-align: center;
      color: #64748b;
      font-size: 11px;
      font-variant-numeric: tabular-nums;
    }
  }
}

/* ══════════════════════════════════════════════════════════════════════════
 * [本地扩展 · 导出长图期间临时恢复桌面版式]
 * --------------------------------------------------------------------------
 * 起因：exportImage 是在**真机 DOM** 上量 element.scrollWidth / scrollHeight 的，
 *   而 <=768px 时主区是「地图列 + 覆盖式抽屉」的手机版式：
 *     · .main-content-layout 高度塌到 62vh（约 480px）、右侧栏 out of flow；
 *     · .map-container 被 JS 写上 translate3d + scale 的拖拽/缩放变换（行内 style）。
 *   于是量出来的高度只有 480px，而克隆文档按 1280px 渲染的是桌面 960px 版式 ——
 *   长图只截到地图上半屏、俱乐部列表整块消失，也就是「导出图片不全」。
 *   @media 按「视口」判定，光给元素写死桌面宽度不会让它失效，所以只能在导出期间用
 *   标记类把桌面版式**真实地**打开：exportImage 里先 add 类 → 量尺寸 → finally 移除。
 *   （上游 GameStatus 的导出段（.warrank-full-container / 宽表 / 卡片）不覆盖本卡片的
 *     内部布局，所以本组件必须自带一组，不能用它的。）
 *
 * 手机端相关规则都在 @media 内、部分高度还带 !important，所以本组：
 *   ① 选择器比手机端多一层（.main-content-layout.export-desktop-layout）→ 特异性更高；
 *   ② 对带 !important 的声明同样带 !important（同为 !important 时比特异性）；
 *   ③ 放在 @media 之后，源码顺序也占优。
 * ⚠️ transform 必须用 !important —— 它是 JS 写在 .map-container 行内 style 上的，
 *    只有样式表里的 !important 才能盖过行内声明。把平移/缩放值全部清掉，导出的就是
 *    「整图原始尺寸」，与桌面端一致（桌面地图本来就完整可见）。
 * ⚠️ 舞台保持 920×1000 原始尺寸，而不是改回桌面的 100%：resizeAndRedraw 是按**舞台**
 *    的 clientWidth/Height 算 hexSize 的，而且只在 window.resize 时重算（没有挂
 *    ResizeObserver），改成 100% 会让 canvas 位图被 CSS 拉伸成非等比、六边形变形。
 *    保持 920×1000 时 canvas 的 CSS 盒 = 位图尺寸 = 1:1，且正好装下 hexSize=12 的全图。
 * ⚠️ 侧栏列表改成不内部滚动：桌面 960px 定高会把长列表裁掉（对长图来说同样是「不全」），
 *    导出时让列表自己撑开、由 .main-content-layout 的高度跟着长。
 * ════════════════════════════════════════════════════════════════════════ */
.legion-war-map-container
  .legion-war-map-card
  .main-content-layout.export-desktop-layout {
  /* 桌面是「左地图 / 右侧栏」的横排；高度交给内容撑（桌面固定 960px 会裁掉长列表）。 */
  flex-direction: row !important;
  height: auto !important;
  align-items: stretch !important;
  overflow: visible !important;

  /* ── 地图列：回到舞台原始尺寸，解除拖拽/缩放的形变与视口裁切 ── */
  .map-container-wrapper {
    /* ⚠️ flex:none 不是装饰：桌面的 flex:1 含 flex-basis:0%，不改的话宽度会被压成 0。
       width 920px = .map-container 的原始宽度，导出所需宽度 = 920 + 300 = 1220。 */
    flex: none !important;
    width: 920px !important;
    height: auto !important;
    min-height: 0 !important;
    overflow: visible !important;
    touch-action: auto !important;

    .map-container {
      width: 920px !important;
      height: 1000px !important;
      /* 盖掉 JS 写在行内的 translate3d(x,y,0) scale(n) */
      transform: none !important;
      transform-origin: 0 0;
      will-change: auto;
    }
  }

  /* ── 侧栏：手机端「贴左覆盖抽屉 + 紧凑排版」整段已在 @media 里用
        :not(.export-desktop-layout) 关掉（真机与克隆都回到桌面排版），这里只补两点：
        · flex:none —— 导出态是 374px 的容器里横排「920 + 300」，不加 flex:none 侧栏会
          被 flex 压缩到 ≈110px：真机按 110px 排版、克隆按 300px 排版，量出来的高度
          对不上（实测差 3000+px → 长图底部一大片空白）；
        · 列表不内部滚动 —— 桌面规则 flex:1 + overflow-y:auto 会把长列表裁掉。 ── */
  .side-info-panel {
    flex: none !important;
    height: auto !important;
    max-height: none !important;

    .legion-list {
      flex: none !important;
      max-height: none !important;
      overflow: visible !important;
    }
  }
}

</style>
