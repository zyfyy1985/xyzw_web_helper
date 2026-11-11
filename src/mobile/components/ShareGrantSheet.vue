<template>
  <div class="m-mask" :class="{ on: show }" @click="close"></div>
  <div class="m-sheet" :class="{ on: show }">
    <div class="m-grab"></div>
    <h4>授权给他人</h4>
    <div class="m-sh-sub">{{ token?.name || "—" }} · {{ token?.server || "未知区服" }}</div>

    <label class="m-tk-f">
      <span>对方用户名</span>
      <input
        v-model="to"
        class="m-finput"
        placeholder="对方注册时的用户名"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
      />
    </label>

    <div class="m-tk-f">
      <span>有效期</span>
      <div class="m-seg">
        <button
          v-for="opt in TTL_OPTIONS"
          :key="opt.value"
          :class="{ on: ttl === opt.value }"
          type="button"
          @click="ttl = opt.value"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>

    <div class="m-grant-warn">
      <b>等同于把账号交给对方</b>
      <p>对方会拿到该角色的完整登录凭证，可随时登录与操作，你在本机设的限制对它不生效。</p>
      <p>同一角色同一时间只建议一个人在线，两人同时登录会互相顶下线。</p>
    </div>

    <div
      class="m-grant-agree"
      role="checkbox"
      :aria-checked="agreed"
      tabindex="0"
      @click="agreed = !agreed"
      @keydown.enter.prevent="agreed = !agreed"
      @keydown.space.prevent="agreed = !agreed"
    >
      <span class="m-grant-box" :class="{ on: agreed }">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7" />
        </svg>
      </span>
      <span>我已确认，愿意承担该风险</span>
    </div>

    <div class="m-tk-fbtns">
      <button class="m-btn m-btn-g" type="button" @click="close">取消</button>
      <button class="m-btn m-btn-p" type="button" :disabled="!canSubmit || busy" @click="submit">
        {{ busy ? "授权中…" : "确认授权" }}
      </button>
    </div>
  </div>
</template>

<script setup>
/* 「授权给他人」抽屉 —— 挂在 /mobile/tokens 的账号卡「⋯」里。
 *
 * 只负责收集三件事：对方用户名、有效期、风险确认；
 * 凭证与 bin 由 tokenStore.grantToken 从本地取（bin 在 IndexedDB 里，页面上看不到）。
 *
 * ★ 有效期只有 24 小时 / 7 天 / 30 天，没有「永久」—— 这是给对方登录自己的号，
 *   必须能自动失效。服务端也只认这三个枚举值，前端不提供任何绕过的入口。
 * ★ 风险块的文案不是保险话术：托管 = 交出完整凭证，对方可以脱离本工具直接登录，
 *   我们拦不住。所以必须勾选后才能提交，而不是点一下按钮就发出去。 */
import { computed, ref, watch } from "vue";
import { useMessage } from "naive-ui";
import { useTokenStore } from "@/stores/tokenStore";

const props = defineProps({
  show: { type: Boolean, default: false },
  token: { type: Object, default: null },
});
const emit = defineEmits(["close", "done"]);

const message = useMessage();
const tokenStore = useTokenStore();

const TTL_OPTIONS = [
  { value: "24h", label: "24 小时" },
  { value: "7d", label: "7 天" },
  { value: "30d", label: "30 天" },
];

const to = ref("");
const ttl = ref("24h");
const agreed = ref(false);
const busy = ref(false);

const canSubmit = computed(() => !!to.value.trim() && !!props.token && agreed.value);

/* 每次打开都从空白开始：上一次填的用户名留着，很容易顺手点给错的人 */
watch(
  () => props.show,
  (on) => {
    if (!on) return;
    to.value = "";
    ttl.value = "24h";
    agreed.value = false;
    busy.value = false;
  },
);

function close() {
  if (busy.value) return;
  emit("close");
}

/* 后端 message 常常比固定文案更有用（比如「该角色正在授权给『某某』」里带了人名），
 * 所以只把「后端说不出具体信息」的几类固定下来，其余回落到 res.message。 */
const ERR_TEXT = {
  grantee_not_found: "对方账号不存在，请核对用户名",
  bad_grantee: "用户名格式不对（2-32 个字符，不含空格）",
  not_your_token: "该角色不在你的角色列表里",
  too_many_grants: "授权数量已达上限，请先撤销部分授权",
  token_taken: "该角色已授权给他人，请先在「角色授权」里撤销",
  foreign_token: "该角色登记在别的账号名下，不能转授权",
  bin_too_large: "该角色的 BIN 过大，无法托管授权",
  unauthorized: "登录已过期，请重新登录",
};

async function submit() {
  if (!canSubmit.value || busy.value) return;
  const name = to.value.trim();

  busy.value = true;
  try {
    const res = await tokenStore.grantToken(props.token.id, name, ttl.value);
    if (!res || !res.ok) {
      message.error(ERR_TEXT[res?.error] || res?.message || "授权失败，请重试");
      return;
    }
    const label = TTL_OPTIONS.find((o) => o.value === ttl.value)?.label || "";
    message.success(`已授权给 ${name}，${label}后自动失效`);
    emit("done");
    emit("close");
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped lang="scss">
/* ---------- 风险提示 ----------
 * 用 --m-red-soft 底 + --m-red 字（与 .m-tag.err / .m-medal.low 同一支），
 * 不新造警示色；暗色下这两个变量会自动换成半透明红。 */
.m-grant-warn {
  background: var(--m-red-soft);
  border-radius: var(--m-r-md);
  padding: 10px 12px;
  margin: 2px 0 12px;
}
.m-grant-warn b {
  display: block;
  font-size: 12.5px;
  font-weight: 700;
  line-height: 1.4;
  color: var(--m-red);
  margin-bottom: 4px;
}
.m-grant-warn p {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.55;
  color: var(--m-red);
}
.m-grant-warn p + p {
  margin-top: 4px;
}

/* ---------- 勾选行 ----------
 * 用手写方块而不是 input[type=checkbox]：原生控件在 iOS 上尺寸不可控，
 * 且与项目里其它「点整行切换」的行（.m-trow）交互不一致。 */
.m-grant-agree {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 0 12px;
  font-size: 12.5px;
  color: var(--m-text2);
}
.m-grant-box {
  width: 17px;
  height: 17px;
  flex: none;
  border-radius: 5px;
  border: 1.5px solid var(--m-hairline);
  background: var(--m-card);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, border-color 0.15s;
}
.m-grant-box svg {
  width: 12px;
  height: 12px;
  color: var(--m-on-primary);
  opacity: 0;
}
.m-grant-box.on {
  background: var(--m-primary);
  border-color: var(--m-primary);
}
.m-grant-box.on svg {
  opacity: 1;
}
</style>
