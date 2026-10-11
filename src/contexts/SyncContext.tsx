import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { useAuth } from './AuthContext';
import { getPendingSyncChanges, getSyncStatus, saveSyncStatus } from '../services/storage';
import {
  getLastSyncTime,
  getLocalChangesSince,
  addSyncListener,
  removeSyncListener,
  SyncEvents,
  triggerImmediateSync,
} from '../services/syncService';
import logger from '../utils/logger.js';
import type { AppUser } from '../types';
import { isRecord } from '../types';

interface PendingChanges {
  favorites: number;
  history: number;
}

interface SyncStatus {
  loading: boolean;
  success: boolean | null;
  message: string;
  timestamp: Date | null;
}

interface SyncEventPayload {
  uid?: string;
  error?: string;
  result?: {
    unchanged?: boolean;
    reason?: string;
  };
}

export interface SyncContextValue {
  lastSyncTime: Date | null;
  pendingChanges: PendingChanges;
  isSyncing: boolean;
  syncStatus: SyncStatus;
  setIsSyncing: Dispatch<SetStateAction<boolean>>;
  updateSyncStatus: (newStatus: SyncStatus) => Promise<void>;
  startSync: () => void;
  handleSyncComplete: (success: boolean, message?: string | null) => Promise<void>;
  updatePendingChanges: () => Promise<void>;
  getTotalPendingChanges: () => number;
}

// 回前台 / 网络恢复共用的节流窗口，避免事件连发造成重复同步
const IMMEDIATE_SYNC_THROTTLE = 2000;

const SyncContext = createContext<SyncContextValue | undefined>(undefined);

export const useSync = (): SyncContextValue => {
  const context = useContext(SyncContext);
  if (!context) throw new Error('useSync must be used within a SyncProvider');
  return context;
};

const readSyncEvent = (value: unknown): SyncEventPayload => {
  if (!isRecord(value)) return {};

  const result = isRecord(value.result)
    ? {
        unchanged: value.result.unchanged === true,
        reason: typeof value.result.reason === 'string' ? value.result.reason : undefined,
      }
    : undefined;

  return {
    uid: typeof value.uid === 'string' ? value.uid : undefined,
    error: typeof value.error === 'string' ? value.error : undefined,
    result,
  };
};

export const SyncProvider = ({ children }: { children: ReactNode }) => {
  const { currentUser } = useAuth() as { currentUser?: AppUser | null };
  // 按触发原因分别节流：foreground 与 online 各有一个窗口。
  // 否则回前台时仍离线（SKIPPED）会占用共享窗口，把 500ms 后的网络恢复同步吞掉。
  const generation = useRef(0);
  const lastImmediateSyncRef = useRef<Record<string, number>>({});
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [pendingChanges, setPendingChanges] = useState<PendingChanges>({
    favorites: 0,
    history: 0,
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    loading: false,
    success: null,
    message: '',
    timestamp: null,
  });

  useEffect(() => {
    const token = ++generation.current;
    queueMicrotask(() => {
      if (token !== generation.current) return;
      setLastSyncTime(null);
      setPendingChanges({ favorites: 0, history: 0 });
      setIsSyncing(false);
      setSyncStatus({ loading: false, success: null, message: '', timestamp: null });
      lastImmediateSyncRef.current = {};
    });
    return () => {
      generation.current += 1;
    };
  }, [currentUser]);

  const updateSyncStatus = useCallback(
    async (newStatus: SyncStatus): Promise<void> => {
      setSyncStatus(newStatus);
      if (currentUser && !currentUser.isLocal) {
        await saveSyncStatus(newStatus, currentUser.uid);
      }
    },
    [currentUser]
  );

  const startSync = useCallback(() => {
    setIsSyncing(true);
    void updateSyncStatus({
      loading: true,
      success: null,
      message: '正在同步...',
      timestamp: null,
    });
  }, [updateSyncStatus]);

  const updatePendingChanges = useCallback(async (): Promise<void> => {
    if (!currentUser || currentUser.isLocal) return;

    const token = generation.current;
    try {
      const lastSync = await getLastSyncTime(currentUser.uid);
      const localChanges = (await getLocalChangesSince(lastSync, currentUser.uid)) as {
        favorites: unknown[];
        favoriteTombstones: unknown[];
        history: unknown[];
      };
      const pendingCounter = (await getPendingSyncChanges(
        currentUser.uid
      )) as PendingChanges | null;

      // 计数器只是界面状态：同步运行期间的新变化可能已被计入旧计数又被成功重置，
      // 但仍能通过 lastSyncTime 检出，所以取两者的较大值。
      // 取消收藏同样产生待同步变更，tombstones 需要一并计入，否则极端竞态下
      // “未同步的取消收藏”可能显示为 0。
      if (token !== generation.current) return;
      setPendingChanges({
        favorites: Math.max(
          pendingCounter?.favorites ?? 0,
          localChanges.favorites.length + localChanges.favoriteTombstones.length
        ),
        history: Math.max(pendingCounter?.history ?? 0, localChanges.history.length),
      });
    } catch (error) {
      logger.error('更新待同步数据失败:', error);
    }
  }, [currentUser]);

  const handleSyncComplete = useCallback(
    async (success: boolean, message: string | null = null): Promise<void> => {
      const token = generation.current;
      const newStatus: SyncStatus = {
        loading: false,
        success,
        message: message || (success ? '同步完成' : '同步失败'),
        timestamp: new Date(),
      };

      await updateSyncStatus(newStatus);

      if (success && currentUser) {
        const lastSync = await getLastSyncTime(currentUser.uid);
        if (token !== generation.current) return;
        if (lastSync) setLastSyncTime(new Date(Number.parseInt(String(lastSync), 10)));
      }

      // pending 的清理由 syncService 统一负责，这里只重新读取并展示，
      // 避免成为第二个 reset 来源。
      if (token !== generation.current) return;
      void updatePendingChanges();
      setIsSyncing(false);
    },
    [currentUser, updateSyncStatus, updatePendingChanges]
  );

  useEffect(() => {
    const token = generation.current;
    const loadSyncStatus = async () => {
      if (!currentUser || currentUser.isLocal) return;

      try {
        const lastSync = await getLastSyncTime(currentUser.uid);
        if (token !== generation.current) return;
        if (lastSync) setLastSyncTime(new Date(Number.parseInt(String(lastSync), 10)));

        const status = (await getSyncStatus(currentUser.uid)) as SyncStatus;
        if (token !== generation.current) return;
        setSyncStatus(status);

        const changes = (await getPendingSyncChanges(currentUser.uid)) as PendingChanges | null;
        if (token !== generation.current) return;
        if (changes) {
          setPendingChanges({ favorites: changes.favorites, history: changes.history });
        }
      } catch (error) {
        logger.error('加载同步状态失败:', error);
      }
    };

    void loadSyncStatus();
  }, [currentUser]);

  useEffect(() => {
    const handleSyncStarted = (value: unknown) => {
      const data = readSyncEvent(value);
      if (data.uid === currentUser?.uid) startSync();
    };

    const handleSyncCompleted = (value: unknown) => {
      const data = readSyncEvent(value);
      if (data.uid !== currentUser?.uid) return;

      if (data.result?.unchanged) {
        void handleSyncComplete(true, data.result.reason || '同步成功：数据已是最新');
      } else {
        void handleSyncComplete(true, '同步完成');
      }
      window.dispatchEvent(new CustomEvent('sync:data_refreshed'));
    };

    const handleSyncSkipped = (value: unknown) => {
      const data = readSyncEvent(value);
      if (data.uid !== currentUser?.uid) return;
      setIsSyncing(false);
      void updatePendingChanges();
    };

    const handleSyncFailed = (value: unknown) => {
      const data = readSyncEvent(value);
      if (data.uid === currentUser?.uid) void handleSyncComplete(false, data.error || '同步失败');
    };

    if (currentUser && !currentUser.isLocal) {
      addSyncListener(SyncEvents.SYNC_STARTED, handleSyncStarted);
      addSyncListener(SyncEvents.SYNC_COMPLETED, handleSyncCompleted);
      addSyncListener(SyncEvents.SYNC_SKIPPED, handleSyncSkipped);
      addSyncListener(SyncEvents.SYNC_FAILED, handleSyncFailed);
    }

    return () => {
      if (currentUser && !currentUser.isLocal) {
        removeSyncListener(SyncEvents.SYNC_STARTED, handleSyncStarted);
        removeSyncListener(SyncEvents.SYNC_COMPLETED, handleSyncCompleted);
        removeSyncListener(SyncEvents.SYNC_SKIPPED, handleSyncSkipped);
        removeSyncListener(SyncEvents.SYNC_FAILED, handleSyncFailed);
      }
    };
  }, [currentUser, startSync, handleSyncComplete, updatePendingChanges]);

  // 回前台 / 网络恢复时立即同步。
  // 网络恢复依赖项目统一的 networkStatusChange 事件，不额外注册 online/offline。
  useEffect(() => {
    if (!currentUser || currentUser.isLocal) return;

    const runImmediateSync = (reason: string) => {
      const now = Date.now();
      if (now - (lastImmediateSyncRef.current[reason] || 0) < IMMEDIATE_SYNC_THROTTLE) return;
      lastImmediateSyncRef.current[reason] = now;
      void triggerImmediateSync(currentUser.uid, reason);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') runImmediateSync('foreground');
    };

    const handleNetworkStatusChange = (event: Event) => {
      const detail = (event as CustomEvent<{ online?: boolean }>).detail;
      if (detail?.online) {
        runImmediateSync('online');
        return;
      }
      // 离线事件后恢复在线应视为一次新的恢复，不被此前 online 的节流窗口挡住
      lastImmediateSyncRef.current.online = 0;
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('networkStatusChange', handleNetworkStatusChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('networkStatusChange', handleNetworkStatusChange);
    };
  }, [currentUser]);

  const getTotalPendingChanges = useCallback(
    () => pendingChanges.favorites + pendingChanges.history,
    [pendingChanges]
  );

  const contextValue: SyncContextValue = useMemo(
    () => ({
      lastSyncTime,
      pendingChanges,
      isSyncing,
      syncStatus,
      setIsSyncing,
      updateSyncStatus,
      startSync,
      handleSyncComplete,
      updatePendingChanges,
      getTotalPendingChanges,
    }),
    [
      lastSyncTime,
      pendingChanges,
      isSyncing,
      syncStatus,
      updateSyncStatus,
      startSync,
      handleSyncComplete,
      updatePendingChanges,
      getTotalPendingChanges,
    ]
  );

  return <SyncContext.Provider value={contextValue}>{children}</SyncContext.Provider>;
};
