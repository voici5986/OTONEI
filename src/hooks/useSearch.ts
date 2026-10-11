import { useReducer, useCallback, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { searchMusic } from '../services/musicApiService';
import type { Track } from '../types';
import logger from '../utils/logger';
import { getTrackKey } from '../utils/trackIdentity';
import {
  handleError,
  ErrorTypes,
  ErrorSeverity,
  checkNetworkStatus,
  validateSearchParams,
} from '../utils/errorHandler';

const SEARCH_PAGE_SIZE = 20;
const LOAD_MORE_MIN_INTERVAL = 800;

const toError = (value: unknown): Error =>
  value instanceof Error ? value : new Error(typeof value === 'string' ? value : String(value));

export interface SearchState {
  query: string;
  results: Track[];
  source: string;
  quality: number;
  loading: boolean;
  loadingMore: boolean;
  error: unknown;
  page: number;
  hasMore: boolean;
  activeQuery: string;
  activeSource: string;
}

type SearchAction =
  | { type: 'SET_FIELD'; field: 'query' | 'source'; value: string }
  | { type: 'SET_FIELD'; field: 'quality'; value: number }
  | { type: 'SEARCH_START' }
  | {
      type: 'SEARCH_SUCCESS';
      payload: { results: Track[]; page: number; hasMore: boolean; query: string; source: string };
    }
  | { type: 'SEARCH_FAILURE'; payload: unknown }
  | { type: 'LOAD_MORE_START' }
  | { type: 'LOAD_MORE_SUCCESS'; payload: { results: Track[]; page: number; hasMore: boolean } }
  | { type: 'LOAD_MORE_FAILURE'; payload: unknown }
  | { type: 'REFRESH_RESULTS'; payload: Track[] };

export interface UseSearchResult extends SearchState {
  handleSearch: (
    event?: { preventDefault(): void } | null,
    query?: string,
    source?: string
  ) => Promise<void>;
  setQuery: (value: string) => void;
  setSource: (value: string) => void;
  setQuality: (value: string | number) => void;
  handleLoadMore: () => Promise<void>;
}

const searchInitialState: SearchState = {
  query: '',
  results: [],
  source: 'netease',
  quality: 999,
  loading: false,
  loadingMore: false,
  error: null,
  page: 0,
  hasMore: false,
  activeQuery: '',
  activeSource: 'netease',
};

const dedupeSearchResults = (results: Track[]): Track[] => {
  const existingKeys = new Set<string>();
  return results.filter((track, index) => {
    const key = track?.id == null ? `unknown:${index}` : getTrackKey(track);
    if (existingKeys.has(key)) return false;
    existingKeys.add(key);
    return true;
  });
};

const mergeSearchResults = (currentResults: Track[], nextResults: Track[]): Track[] =>
  dedupeSearchResults([...currentResults, ...nextResults]);

export function searchReducer(state: SearchState, action: SearchAction): SearchState {
  switch (action.type) {
    case 'SET_FIELD':
      if (action.field === 'quality') return { ...state, quality: action.value };
      return { ...state, [action.field]: action.value };
    case 'SEARCH_START':
      return { ...state, loading: true, loadingMore: false, error: null };
    case 'SEARCH_SUCCESS':
      return {
        ...state,
        loading: false,
        loadingMore: false,
        error: null,
        results: dedupeSearchResults(action.payload.results),
        page: action.payload.page,
        hasMore: action.payload.hasMore,
        activeQuery: action.payload.query,
        activeSource: action.payload.source,
      };
    case 'SEARCH_FAILURE':
      return { ...state, loading: false, loadingMore: false, error: action.payload };
    case 'LOAD_MORE_START':
      return { ...state, loadingMore: true, error: null };
    case 'LOAD_MORE_SUCCESS':
      return {
        ...state,
        loadingMore: false,
        results: mergeSearchResults(state.results, action.payload.results),
        page: action.payload.page,
        hasMore: action.payload.hasMore,
      };
    case 'LOAD_MORE_FAILURE':
      return { ...state, loadingMore: false, error: action.payload };
    case 'REFRESH_RESULTS':
      return { ...state, results: action.payload };
    default:
      return state;
  }
}

const useSearch = (isOnline: boolean): UseSearchResult => {
  const [state, dispatch] = useReducer(searchReducer, searchInitialState);
  const { query, source, loading, loadingMore, page, hasMore, activeQuery, activeSource } = state;
  const lastLoadMoreAtRef = useRef(0);
  const searchRequestIdRef = useRef(0);
  const searchAbortControllerRef = useRef<AbortController | null>(null);

  // 组件卸载时取消在途请求并递增序号，避免卸载后仍 dispatch
  useEffect(() => {
    return () => {
      searchAbortControllerRef.current?.abort();
      searchRequestIdRef.current += 1;
    };
  }, []);

  const handleSearch = useCallback(
    async (event?: { preventDefault(): void } | null, nextQuery?: string, nextSource?: string) => {
      event?.preventDefault();

      const searchQuery = (nextQuery ?? query).trim();
      const searchSource = nextSource ?? source;

      if (!checkNetworkStatus(isOnline, '搜索音乐')) return;
      if (!validateSearchParams(searchQuery)) return;

      // 校验通过后才递增请求序号：本地拒绝的“搜索”不应顶掉在途请求（否则 loading 卡死）
      const requestId = ++searchRequestIdRef.current;
      // 真正发起新搜索时取消旧 HTTP 请求，及时释放连接并节省 API 配额
      searchAbortControllerRef.current?.abort();
      const controller = new AbortController();
      searchAbortControllerRef.current = controller;

      dispatch({ type: 'SEARCH_START' });
      try {
        const searchResults = (await searchMusic(
          searchQuery,
          searchSource,
          SEARCH_PAGE_SIZE,
          1,
          controller.signal
        )) as Track[];
        if (requestId !== searchRequestIdRef.current) return;
        const resultsWithoutCovers = searchResults.map((track) => ({ ...track }));

        dispatch({
          type: 'SEARCH_SUCCESS',
          payload: {
            results: resultsWithoutCovers,
            page: 1,
            hasMore: resultsWithoutCovers.length === SEARCH_PAGE_SIZE,
            query: searchQuery,
            source: searchSource,
          },
        });

        if (resultsWithoutCovers.length === 0) toast.info(`未找到"${searchQuery}"的相关结果`);

        try {
          const { addSearchHistory } = await import('../services/storage');
          addSearchHistory(searchQuery, searchSource);
        } catch (error) {
          logger.error('添加搜索历史失败:', error);
        }
      } catch (error) {
        if (requestId !== searchRequestIdRef.current) return;
        dispatch({ type: 'SEARCH_FAILURE', payload: error });
        handleError(toError(error), ErrorTypes.SEARCH, ErrorSeverity.ERROR, '搜索失败，请重试');
      }
    },
    [query, source, isOnline]
  );

  const handleLoadMore = useCallback(async () => {
    if (loading || loadingMore || !hasMore || !activeQuery) return;
    if (!checkNetworkStatus(isOnline, '加载更多搜索结果')) return;

    const now = Date.now();
    if (now - lastLoadMoreAtRef.current < LOAD_MORE_MIN_INTERVAL) return;
    lastLoadMoreAtRef.current = now;

    const nextPage = page + 1;
    const requestId = searchRequestIdRef.current;
    // 复用当前搜索批次的取消信号，被新搜索取代时“加载更多”随之取消
    const signal = searchAbortControllerRef.current
      ? searchAbortControllerRef.current.signal
      : new AbortController().signal;
    dispatch({ type: 'LOAD_MORE_START' });

    try {
      const searchResults = (await searchMusic(
        activeQuery,
        activeSource,
        SEARCH_PAGE_SIZE,
        nextPage,
        signal
      )) as Track[];
      if (requestId !== searchRequestIdRef.current) return;
      const resultsWithoutCovers = searchResults.map((track) => ({ ...track }));

      dispatch({
        type: 'LOAD_MORE_SUCCESS',
        payload: {
          results: resultsWithoutCovers,
          page: nextPage,
          hasMore: resultsWithoutCovers.length === SEARCH_PAGE_SIZE,
        },
      });

      if (resultsWithoutCovers.length === 0) toast.info('没有更多结果了');
    } catch (error) {
      if (requestId !== searchRequestIdRef.current) return;
      dispatch({ type: 'LOAD_MORE_FAILURE', payload: error });
      handleError(toError(error), ErrorTypes.SEARCH, ErrorSeverity.ERROR, '加载更多失败，请重试');
    }
  }, [activeQuery, activeSource, hasMore, isOnline, loading, loadingMore, page]);

  const setQuery = useCallback((value: string) => {
    dispatch({ type: 'SET_FIELD', field: 'query', value });
  }, []);

  const setSource = useCallback((value: string) => {
    dispatch({ type: 'SET_FIELD', field: 'source', value });
  }, []);

  const setQuality = useCallback((value: string | number) => {
    dispatch({ type: 'SET_FIELD', field: 'quality', value: Number.parseInt(String(value), 10) });
  }, []);

  return { ...state, handleSearch, setQuery, setSource, setQuality, handleLoadMore };
};

export default useSearch;
