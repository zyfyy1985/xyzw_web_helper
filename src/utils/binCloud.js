/**
 * bin 文件（IndexedDB 里的 ArrayBuffer）与云端的桥接
 *
 * IndexedDB 库 `xyzw` / 表 `tokens` 里存的是按 tokenId（或历史遗留的 token.name）
 * 索引的 ArrayBuffer —— 即导入时上传的 `.bin` 文件。
 * 这里负责把它们以 base64 形式放进 `/api/state`，键名统一加 `bins/` 前缀。
 *
 * ⚠️ 本文件**不 import** `useIndexedDB`，避免与 hook 形成循环依赖：
 *    hook → binCloud（推/删）是一条单向依赖。
 */
import { cloudGetEx, cloudSet, cloudDel } from "./cloudState";

/** 云端逻辑键前缀 */
export const CLOUD_BIN_PREFIX = "bins/";

/**
 * 单条 bin 上云的原始字节上限。
 * 服务端 `/api/state` 单条上限 1MB，base64 会膨胀约 33%，这里给原始数据留 700KB 余量。
 * 超限的 bin 只留在本地，并打一条警告。
 */
export const MAX_CLOUD_BIN_BYTES = 700 * 1024;

/** ArrayBuffer → base64（分块，避免大文件时 String.fromCharCode 参数过多爆栈） */
export function abToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** base64 → ArrayBuffer */
export function base64ToAb(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/** 逻辑键：`bins/<tokenId 或 name>` */
export function cloudBinKey(key) {
  return CLOUD_BIN_PREFIX + key;
}

/** 把本地 bin 推到云端（异步、防抖合并、失败仅告警；超限自动跳过） */
export function pushBinToCloud(key, data) {
  if (!data || typeof data.byteLength !== "number") return;
  if (data.byteLength === 0) return;

  if (data.byteLength > MAX_CLOUD_BIN_BYTES) {
    console.warn(
      `[binCloud] bin「${key}」${data.byteLength} 字节超过云端单条上限（${MAX_CLOUD_BIN_BYTES}），仅保存在本地`,
    );
    return;
  }

  // dirty:false —— bin 是 base64 大字符串，**不存在 localStorage 里**，
  // 留「未推送标记」重试时读不回原值，所以这类键只做一次尽力而为的推送（与改造前行为一致）。
  cloudSet(cloudBinKey(key), abToBase64(data), { dirty: false });
}

/** 从云端删除某个 bin（同上：不参与「未推送标记」重试） */
export function deleteBinFromCloud(key) {
  cloudDel(cloudBinKey(key), { dirty: false });
}

/** 按逻辑键（不含 `bins/` 前缀）从云端取回一个 bin；取不到返回 null */
export async function fetchCloudBin(key) {
  const res = await cloudGetEx(cloudBinKey(key));
  if (!res.ok || typeof res.value !== "string") return null;
  try {
    return base64ToAb(res.value);
  } catch (e) {
    console.warn(`[binCloud] 解析云端 bin「${key}」失败:`, e);
    return null;
  }
}
