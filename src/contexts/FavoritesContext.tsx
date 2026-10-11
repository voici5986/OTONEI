import { subscribeStorageChanges } from '../services/storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getFavorites, toggleFavorite as toggleFavoriteStorage } from '../services/storage';
import type { AppUser, FavoriteRecord, Track } from '../types';
import { useAuth } from './AuthContext';
import { useSync } from './SyncContext';
import { triggerDelayedSync } from '../services/syncService';
import logger from '../utils/logger.js';
import { getTrackKey } from '../utils/trackIdentity';

interface FavoriteToggleResult {
  added: boolean;
  full?: boolean;
  track?: FavoriteRecord;
  error?: string;
}

export interface FavoritesContextValue {
  favorites: FavoriteRecord[];
  isLoading: boolean;
  isFavorite: (track: Pick<Track, 'id' | 'source'> | null | undefined) => boolean;
  toggleFavorite: (track: Track) => Promise<FavoriteToggleResult>;
}

const FavoritesContext = createContext<FavoritesContextValue | undefined>(undefined);

export const useFavorites = (): FavoritesContextValue => {
  const context = useContext(FavoritesContext);
  if (!context) throw new Error('useFavorites must be used within a FavoritesProvider');
  return context;
};

const FavoritesProviderState = ({ children }: { children: ReactNode }) => {
  const [favorites, setFavorites] = useState<FavoriteRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { currentUser } = useAuth() as { currentUser: AppUser | null };
  const { updatePendingChanges } = useSync();
  const activeUserIdRef = useRef(currentUser?.uid);
  useEffect(() => {
    activeUserIdRef.current = currentUser?.uid;
  }, [currentUser?.uid]);

  const loadFavorites = useCallback(async (): Promise<void> => {
    const requestedUserId = currentUser?.uid;
    try {
      setIsLoading(true);
      const favList = (await getFavorites(requestedUserId)) as FavoriteRecord[];
      if (activeUserIdRef.current !== requestedUserId) return;
      setFavorites(favList);
    } catch (error) {
      logger.error('加载收藏列表失败:', error);
    } finally {
      if (activeUserIdRef.current === requestedUserId) setIsLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    void Promise.resolve().then(loadFavorites);
  }, [loadFavorites, currentUser?.uid]);

  useEffect(() => {
    const handleExternalDataChange = () => {
      void loadFavorites();
    };
    const handleLocalDataCleared = (event: Event) => {
      const detail = (event as CustomEvent<{ favorites?: boolean }>).detail;
      if (detail?.favorites) void loadFavorites();
    };

    window.addEventListener('local:data_cleared', handleLocalDataCleared);
    window.addEventListener('sync:data_refreshed', handleExternalDataChange);
    const unsubscribe = subscribeStorageChanges((event: { type: string; scope: string }) => {
      const scope = currentUser?.uid ? `user:${currentUser.uid}` : 'guest';
      if (event.type === 'favorites' && event.scope === scope) void loadFavorites();
    });

    return () => {
      window.removeEventListener('local:data_cleared', handleLocalDataCleared);
      window.removeEventListener('sync:data_refreshed', handleExternalDataChange);
      unsubscribe();
    };
  }, [loadFavorites, currentUser?.uid]);

  const favoriteKeys = useMemo(() => new Set(favorites.map(getTrackKey)), [favorites]);
  const isFavorite = useCallback(
    (track: Pick<Track, 'id' | 'source'> | null | undefined): boolean => {
      if (!track?.id) return false;
      const trackKey = getTrackKey(track);
      return favoriteKeys.has(trackKey);
    },
    [favoriteKeys]
  );

  const toggleFavorite = useCallback(
    async (track: Track): Promise<FavoriteToggleResult> => {
      try {
        const requestedUserId = currentUser?.uid;
        const result = (await toggleFavoriteStorage(
          track,
          requestedUserId
        )) as FavoriteToggleResult;
        if (result.error === 'favorites_limit') return result;

        if (activeUserIdRef.current === requestedUserId) {
          if (result.added) {
            setFavorites((prev) => [
              result.track || { ...track, modifiedAt: Date.now() },
              ...prev.filter((item) => getTrackKey(item) !== getTrackKey(track)),
            ]);
          } else {
            setFavorites((prev) => prev.filter((item) => getTrackKey(item) !== getTrackKey(track)));
          }
        }

        if (currentUser && !currentUser.isLocal) {
          // pending 只是 UI 信号：计数保存失败只降级界面展示，
          // 不能阻断 5 秒延迟同步 —— 收藏本身已保存成功。
          try {
            const { incrementPendingChanges } = await import('../services/storage');
            const pending = await incrementPendingChanges('favorites', currentUser.uid);
            if (pending) {
              void updatePendingChanges();
            } else {
              logger.warn('更新待同步收藏计数失败，仅影响界面展示');
            }
          } catch (error) {
            logger.warn('更新待同步收藏计数失败，仅影响界面展示:', error);
          }
          triggerDelayedSync(currentUser.uid, 'favorites');
        }

        return result;
      } catch (error) {
        logger.error('切换收藏状态失败:', error);
        return { added: false, error: 'toggle_failed' };
      }
    },
    [currentUser, updatePendingChanges]
  );

  const value = useMemo(
    () => ({ favorites, isLoading, isFavorite, toggleFavorite }),
    [favorites, isLoading, isFavorite, toggleFavorite]
  );
  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
};

export const FavoritesProvider = ({ children }: { children: ReactNode }) => {
  const { currentUser } = useAuth() as { currentUser: AppUser | null };
  return (
    <FavoritesProviderState key={currentUser?.uid || 'guest'}>{children}</FavoritesProviderState>
  );
};
