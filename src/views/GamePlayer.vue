<template>
  <div class="game-player">
    <button class="back-btn" @click="goBack">← 返回</button>

    <div class="iframe-wrapper">
      <iframe
        :src="gameSrc"
        class="game-iframe"
        allow="fullscreen; autoplay"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useRouter } from 'vue-router'

const router = useRouter()
const route = useRoute()

// 账号切换.js 的「启动」会以 /game?bin_id=<id> 开新标签页；
// 这里把 bin_id 透传给游戏页，game-bridge 优先读 URL 参数登录对应账号
const gameSrc = computed(() => {
  const base = import.meta.env.BASE_URL + 'game/index.html'
  const binId = route.query.bin_id
  return binId ? `${base}?bin_id=${encodeURIComponent(String(binId))}` : base
})

// 账号切换.js 把浮层挂在本页 body 上，离开游戏页时要显式清掉，
// 否则返回 dashboard 后悬浮球会残留
onUnmounted(() => {
  try {
    const s = window.__ACCT_SWITCH__
    if (s && typeof s.destroy === 'function') s.destroy()
  } catch (e) {
    /* 浮层不存在时忽略 */
  }
})

function goBack() {
  router.push('/admin/dashboard')
}
</script>

<style scoped>
.game-player {
  position: fixed;
  inset: 0;
  z-index: 1;
  background: #000;
}

.iframe-wrapper {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
}

.game-iframe {
  width: 100%;
  height: 100%;
  border: none;
  display: block;
}

.back-btn {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 200;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  border: none;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
}

.back-btn:hover {
  background: rgba(0, 0, 0, 0.7);
}

.back-btn:active {
  background: rgba(0, 0, 0, 0.8);
}
</style>
