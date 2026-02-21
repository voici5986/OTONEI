import { useReducer, useCallback, useEffect } from 'react';
import { toast } from 'react-toastify';
import { searchMusic } from '../services/musicApiService';
import logger from '../utils/logger';
import { 
  handleError, 
  ErrorTypes, 
  ErrorSeverity, 
  checkNetworkStatus, 
  validateSearchParams 
} from '../utils/errorHandler';

const searchInitialState = {
  query: '',
  results: [],
  source: 'netease',
  quality: 999,
  loading: false,
  error: null,
};

function searchReducer(state, action) {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value };
    case 'SEARCH_START':
      return { ...state, loading: true, error: null };
    case 'SEARCH_SUCCESS':
      return { ...state, loading: false, results: action.payload };
    case 'SEARCH_FAILURE':
      return { ...state, loading: false, error: action.payload };
    default:
      return state;
  }
}

const useSearch = (isOnline) => {
  const [state, dispatch] = useReducer(searchReducer, searchInitialState);
  const { query, results, source } = state;

  const handleSearch = useCallback(async (e) => {
    if (e) e.preventDefault();

    if (!checkNetworkStatus(isOnline, '搜索音乐')) return;
    if (!validateSearchParams(query)) return;

    dispatch({ type: 'SEARCH_START' });
    try {
      const searchResults = await searchMusic(query, source, 20, 1);
      const resultsWithoutCovers = searchResults.map(track => ({ ...track }));

      dispatch({ type: 'SEARCH_SUCCESS', payload: resultsWithoutCovers });

      if (resultsWithoutCovers.length === 0) {
        toast.info(`未找到"${query}"的相关结果`);
      }

      // 添加到搜索历史
      try {
        const { addSearchHistory } = await import('../services/storage');
        addSearchHistory(query, source);
      } catch (error) {
        logger.error('添加搜索历史失败:', error);
      }
    } catch (error) {
      dispatch({ type: 'SEARCH_FAILURE', payload: error });
      handleError(error, ErrorTypes.SEARCH, ErrorSeverity.ERROR, '搜索失败，请重试');
    }
  }, [query, source, isOnline]);

  // 监听收藏状态变化，同步更新搜索结果（触发重绘）
  useEffect(() => {
    const handleFavoritesChanged = () => {
      dispatch({ type: 'SEARCH_SUCCESS', payload: [...results] });
    };

    window.addEventListener('favorites_changed', handleFavoritesChanged);
    return () => window.removeEventListener('favorites_changed', handleFavoritesChanged);
  }, [results]);

  const setQuery = useCallback((val) => dispatch({ type: 'SET_FIELD', field: 'query', value: val }), []);
  const setSource = useCallback((val) => dispatch({ type: 'SET_FIELD', field: 'source', value: val }), []);
  const setQuality = useCallback((val) => dispatch({ type: 'SET_FIELD', field: 'quality', value: parseInt(val) }), []);

  return {
    ...state,
    handleSearch,
    setQuery,
    setSource,
    setQuality
  };
};

export default useSearch;
