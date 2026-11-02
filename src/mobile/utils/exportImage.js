/**
 * 移动端 DOM 导出图片（照抄旧组件导出范式）
 * 旧组件：ClubInfo / ClubHistoryRecords / ClubWeirdTowerInfo /
 *        ClubBattleRecords / ClubMonthBattleRecords / ClubWarrankV2
 * 共用参数：scale 2 / useCORS / allowTaint / logging false；
 * 下载复用 utils/imageExport 的 downloadCanvasAsImage（share→download→dataURL 三级回退）。
 * 移动端差异仅在背景色：按当前主题解析实体背景（暗色 #171a21 / 亮色 #fff），
 * 避免暗色模式下导出白底刺眼。
 *
 * flatten 选项（默认关，不影响既有调用）：给「会被裁剪的浮层」用 —— 见 flattenForCapture。
 */
import html2canvas from "html2canvas";
import { downloadCanvasAsImage } from "@/utils/imageExport";

const resolveBg = (dom) => {
  let el = dom;
  while (el && el.nodeType === 1) {
    const bg = getComputedStyle(el).backgroundColor;
    if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") return bg;
    el = el.parentElement;
  }
  return document.documentElement.dataset.theme === "dark" ? "#171a21" : "#ffffff";
};

/**
 * 把目标节点克隆一份、摊平成完整高度的普通块，交给 html2canvas。
 *
 * 三件事，都是「截图前必须做、但只能对克隆体做」的处理：
 *  1) 摊平：底部抽屉 `.m-sheet` 是 `position:absolute; bottom:0; max-height:82%; overflow-y:auto`，
 *     盒子只有可视那一截 —— html2canvas 按元素盒子开画布，滚动区外的内容（比如武将阵容）必然缺失。
 *     实测：抽屉 getBoundingClientRect().height 692、scrollHeight 817，导出图就是少了下面 125px。
 *     普通卡片（高度=内容高度）这一步无副作用，宽高不变。
 *  2) 去掉 disabled：导出瞬间按钮往往正是 `:disabled="exporting"`，
 *     `.m-btn[disabled]{opacity:.4}` 会被原样画进图里，变成一颗灰按钮。
 *  3) 去掉拖拽条 `.m-grab`（图里只剩一道孤零零的横线），
 *     并把 `<input>` 换成同 class 的 span —— html2canvas 画表单控件不可靠，实测是一个乱码笔画。
 *
 * 克隆体带 data-v 属性，scoped 样式照常命中；`--m-*` 变量挂在 :root，颜色也不会丢。
 */
const flattenForCapture = (dom) => {
  const bg = resolveBg(dom);
  const clone = dom.cloneNode(true);
  Object.assign(clone.style, {
    position: "static",
    left: "auto",
    right: "auto",
    top: "auto",
    bottom: "auto",
    transform: "none",
    transition: "none",
    maxHeight: "none",
    height: "auto",
    overflow: "visible",
    width: `${dom.offsetWidth}px`,
    borderRadius: "0",
    boxSizing: "border-box",
    background: bg,
  });
  /* 导出瞬间按钮往往是 disabled（`.m-btn[disabled]{opacity:.4}`），图里会留一颗灰按钮 */
  clone.querySelectorAll("[disabled]").forEach((n) => n.removeAttribute("disabled"));
  /* 抽屉顶部那条拖拽条是交互暗示，截进图里只剩一道孤零零的横线 */
  clone.querySelectorAll(".m-grab").forEach((n) => n.remove());
  /* html2canvas 对表单控件渲染不可靠（实测 <input> 的 value 画出来是乱码笔画），
     换成同 class 的 span 显示当前值，样式照旧命中 */
  clone.querySelectorAll("input").forEach((inp) => {
    const span = document.createElement("span");
    span.className = inp.className;
    span.textContent = inp.value || "";
    span.style.cssText =
      "display:inline-flex;align-items:center;justify-content:center;line-height:28px;text-align:center";
    inp.replaceWith(span);
  });

  /* 屏幕外容器：不参与布局、不闪一下，截完即删 */
  const holder = document.createElement("div");
  Object.assign(holder.style, {
    position: "fixed",
    left: "-20000px",
    top: "0",
    zIndex: "-1",
    background: bg,
  });
  holder.appendChild(clone);
  document.body.appendChild(holder);
  return { el: clone, cleanup: () => holder.remove() };
};

export const exportDomAsImage = async (dom, filename, options = {}) => {
  if (!dom) {
    throw new Error("未找到要导出的内容");
  }
  const { flatten = false } = options;
  const target = flatten ? flattenForCapture(dom) : null;
  try {
    const node = target ? target.el : dom;
    const canvas = await html2canvas(node, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: resolveBg(dom),
      logging: false,
      /* 摊平后元素已脱离文档流（position:fixed 到屏幕外），显式给尺寸更稳 */
      ...(target
        ? {
            width: node.scrollWidth,
            height: node.scrollHeight,
            windowWidth: node.scrollWidth,
            windowHeight: node.scrollHeight,
          }
        : {}),
    });
    downloadCanvasAsImage(canvas, filename);
  } finally {
    target?.cleanup();
  }
};
