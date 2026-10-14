import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { ref } from "vue";
import {
  CLOUD_BIN_PREFIX,
  pushBinToCloud,
  deleteBinFromCloud,
  fetchCloudBin,
  base64ToAb,
} from "@/utils/binCloud";
import { cloudList, cloudDel } from "@/utils/cloudState";

// 数据库结构定义
interface ArrayBufferDB extends DBSchema {
  tokens: {
    key: string;
    value: {
      id: string;
      data: ArrayBuffer;
      createdAt: Date;
      updatedAt: Date;
      metadata?: Record<string, any>;
    };
    indexes: { "by-created": Date };
  };
}

// Hook 返回类型
interface UseIndexedDBReturn {
  // 状态
  isReady: Ref<boolean>;
  error: Ref<string | null>;

  // 操作方法
  storeArrayBuffer: (
    key: string,
    data: ArrayBuffer,
    metadata?: Record<string, any>,
    options?: { skipCloud?: boolean },
  ) => Promise<boolean>;
  getArrayBuffer: (key: string) => Promise<ArrayBuffer | null>;
  getAllKeys: () => Promise<string[]>;
  deleteArrayBuffer: (key: string) => Promise<boolean>;
  clearAll: () => Promise<boolean>;
  getStorageInfo: () => Promise<{ totalSize: number; keyCount: number }>;
  /**
   * 从云端把本地缺失的 bin 拉回来（**只增不删**：不会因为云端没有就删本地）。
   * 直接写 DB、不再推回云端，避免回环。
   */
  syncFromCloud: (
    cloudKeys: string[] | null,
    inlineValues?: Map<string, string> | null,
  ) => Promise<{ added: number; skipped: number }>;
}

// 配置接口
interface DBConfig {
  dbName?: string;
  version?: number;
  storeName?: "tokens";
}

/**
 * Vue3 Hook for IndexedDB ArrayBuffer storage
 */
export function useIndexedDB(config: DBConfig = {}): UseIndexedDBReturn {
  const { dbName = "xyzw", version = 1, storeName = "tokens" } = config;

  // 响应式状态
  const isReady = ref(false);
  const error = ref<string | null>(null);
  const db = ref<IDBPDatabase<ArrayBufferDB> | null>(null);

  /**
   * 初始化数据库
   */
  const initDB = async (): Promise<void> => {
    try {
      error.value = null;

      const database = await openDB<ArrayBufferDB>(dbName, version, {
        upgrade(db) {
          // 创建对象存储空间（如果不存在）
          if (!db.objectStoreNames.contains(storeName)) {
            const store = db.createObjectStore(storeName, { keyPath: "id" });
            // 创建创建时间索引
            store.createIndex("by-created", "createdAt");
            console.log(`✅ IndexedDB 存储空间 "${storeName}" 创建成功`);
          }
        },
        blocked() {
          error.value =
            "数据库被其他标签页阻塞，请关闭其他使用相同数据库的标签页";
        },
        blocking() {
          error.value = "数据库需要升级，请关闭所有标签页后重试";
        },
        terminated() {
          error.value = "数据库连接意外终止";
        },
      });

      db.value = database;
      isReady.value = true;
      console.log(`✅ IndexedDB "${dbName}" 初始化成功`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "未知错误";
      error.value = `初始化数据库失败: ${errorMessage}`;
      console.error("❌ IndexedDB 初始化错误:", err);
    }
  };

  /**
   * 存储 ArrayBuffer 数据
   */
  const storeArrayBuffer = async (
    key: string,
    data: ArrayBuffer,
    metadata?: Record<string, any>,
    options?: { skipCloud?: boolean },
  ): Promise<boolean> => {
    if (!db.value) {
      error.value = "数据库未初始化";
      return false;
    }

    try {
      const item = {
        id: key,
        data,
        metadata,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await db.value.put(storeName, item);
      console.log(
        `✅ ArrayBuffer 存储成功，键: ${key}, 大小: ${data.byteLength} 字节`,
      );

      // 云端同步（异步、防抖、失败仅告警；绝不阻塞本地写入）
      if (!options?.skipCloud) pushBinToCloud(key, data);

      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "未知错误";
      error.value = `存储数据失败: ${errorMessage}`;
      console.error("❌ 存储 ArrayBuffer 错误:", err);
      return false;
    }
  };

  /**
   * 获取 ArrayBuffer 数据
   */
  const getArrayBuffer = async (key: string): Promise<ArrayBuffer | null> => {
    if (!db.value) {
      error.value = "数据库未初始化";
      return null;
    }

    try {
      const result = await db.value.get(storeName, key);

      if (!result) {
        console.warn(`⚠️ 未找到键为 "${key}" 的数据`);
        return null;
      }

      console.log(
        `✅ ArrayBuffer 读取成功，键: ${key}, 大小: ${result.data.byteLength} 字节`,
      );
      return result.data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "未知错误";
      error.value = `读取数据失败: ${errorMessage}`;
      console.error("❌ 读取 ArrayBuffer 错误:", err);
      return null;
    }
  };

  /**
   * 获取所有存储的键
   */
  const getAllKeys = async (): Promise<string[]> => {
    if (!db.value) {
      error.value = "数据库未初始化";
      return [];
    }

    try {
      return await db.value.getAllKeys(storeName);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "未知错误";
      error.value = `获取键列表失败: ${errorMessage}`;
      console.error("❌ 获取键列表错误:", err);
      return [];
    }
  };

  /**
   * 删除指定的 ArrayBuffer 数据
   */
  const deleteArrayBuffer = async (key: string): Promise<boolean> => {
    if (!db.value) {
      error.value = "数据库未初始化";
      return false;
    }

    try {
      await db.value.delete(storeName, key);
      console.log(`✅ ArrayBuffer 删除成功，键: ${key}`);

      // 云端同步（异步、失败仅告警）
      deleteBinFromCloud(key);

      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "未知错误";
      error.value = `删除数据失败: ${errorMessage}`;
      console.error("❌ 删除 ArrayBuffer 错误:", err);
      return false;
    }
  };

  /**
   * 清空所有数据
   */
  const clearAll = async (): Promise<boolean> => {
    if (!db.value) {
      error.value = "数据库未初始化";
      return false;
    }

    try {
      await db.value.clear(storeName);
      console.log("✅ 所有 ArrayBuffer 数据已清空");

      // 云端同步：清掉本账号下的全部 bin（拉不到列表就放弃，别误删）
      try {
        const cloudKeys = await cloudList(CLOUD_BIN_PREFIX);
        if (cloudKeys) cloudKeys.forEach((k) => cloudDel(k, { dirty: false }));
      } catch (e) {
        console.warn("清空云端 bin 失败:", e);
      }

      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "未知错误";
      error.value = `清空数据失败: ${errorMessage}`;
      console.error("❌ 清空数据错误:", err);
      return false;
    }
  };

  /**
   * 从云端把本地缺失的 bin 拉回来（只增不删）
   *
   * @param cloudKeys    云端已有的 bin 逻辑键 —— **由调用方从批量响应里取好传进来**
   *                     （见 localStorageCloudSync 的 D 段）；null = 列取失败。
   * @param inlineValues 批量读（`?list=1&values=1`）**已经拿回来的值**（逻辑键 → base64 字符串）。
   *   体积预算（服务端 8MB）内的值都在这里 ⇒ 正常情况下**一个请求都不用再发**；
   *   被预算挤掉（omitted）/ 老服务端没带值的，才逐键兜底。
   */
  const syncFromCloud = async (
    cloudKeys: string[] | null,
    inlineValues?: Map<string, string> | null,
  ): Promise<{ added: number; skipped: number }> => {
    // 拉不到（未登录 / 网络异常 → null）→ 什么都不做，别把本地当成"云端为空"
    if (!db.value || !cloudKeys) return { added: 0, skipped: 0 };
    const database = db.value;

    let added = 0;
    let skipped = 0;

    /** 先只查本地：本地区全有 ⇒ 一个请求都不发（同设备刷新的常见路径） */
    const missing: { localKey: string; logical: string }[] = [];
    for (const logical of cloudKeys) {
      const localKey = logical.slice(CLOUD_BIN_PREFIX.length);
      if (!localKey) continue;

      let existing: unknown = null;
      try {
        existing = await database.get(storeName, localKey);
      } catch {
        existing = null;
      }
      if (existing) {
        skipped++;
        continue;
      }
      missing.push({ localKey, logical });
    }

    /** 写进 DB（不走 storeArrayBuffer，避免又推回云端形成回环） */
    const put = async (localKey: string, buffer: ArrayBuffer): Promise<void> => {
      try {
        await database.put(storeName, {
          id: localKey,
          data: buffer,
          metadata: { fromCloud: true },
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        console.log(
          `⬇️ 已从云端恢复 bin「${localKey}」，${buffer.byteLength} 字节`,
        );
        added++;
      } catch (err) {
        console.error(`从云端恢复 bin「${localKey}」失败:`, err);
        skipped++;
      }
    };

    // ① 值已随批量响应一起回来了 → 直接用，**不发任何请求**
    const needFetch: string[] = [];
    for (const { localKey, logical } of missing) {
      const raw = inlineValues ? inlineValues.get(logical) : undefined;
      if (typeof raw === "string" && raw) {
        try {
          await put(localKey, base64ToAb(raw));
          continue;
        } catch (e) {
          console.warn(`解析批量响应里的 bin「${localKey}」失败，改走单键取:`, e);
        }
      }
      needFetch.push(localKey);
    }

    // ② 兜底：单键取。**并发**（原先是逐条 await ⇒ N 条 bin = N 轮串行往返 + N 个
    //    CORS 预检；真机实测登录时 8 条 bin 把界面卡在登录页）。限并发 4，别把移动端打爆。
    const CONCURRENCY = 4;
    for (let i = 0; i < needFetch.length; i += CONCURRENCY) {
      await Promise.all(
        needFetch.slice(i, i + CONCURRENCY).map(async (localKey) => {
          const buffer = await fetchCloudBin(localKey);
          if (!buffer) {
            skipped++;
            return;
          }
          await put(localKey, buffer);
        }),
      );
    }

    return { added, skipped };
  };

  /**
   * 获取存储信息
   */
  const getStorageInfo = async (): Promise<{
    totalSize: number;
    keyCount: number;
  }> => {
    if (!db.value) {
      return { totalSize: 0, keyCount: 0 };
    }

    try {
      const allItems = await db.value.getAll(storeName);
      const totalSize = allItems.reduce(
        (size, item) => size + item.data.byteLength,
        0,
      );
      const keyCount = allItems.length;

      return { totalSize, keyCount };
    } catch (err) {
      console.error("❌ 获取存储信息错误:", err);
      return { totalSize: 0, keyCount: 0 };
    }
  };

  initDB();

  return {
    // 状态
    isReady,
    error,

    // 方法
    storeArrayBuffer,
    getArrayBuffer,
    getAllKeys,
    deleteArrayBuffer,
    clearAll,
    getStorageInfo,
    syncFromCloud,
  };
}

export default useIndexedDB;
