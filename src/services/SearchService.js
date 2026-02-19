import { getFavorites, getHistory } from './storage';
import logger from '../utils/logger.js';

/**
 * 本地搜索服务
 * 用于从收藏和播放历史中检索歌曲
 */
const SearchService = {
  /**
   * 执行本地模糊搜索
   * @param {string} query - 搜索词
   * @returns {Promise<Object>} - 分类好的结果 { favorites: [], history: [] }
   */
  async searchLocal(query) {
    if (!query || !query.trim()) {
      return { favorites: [], history: [] };
    }

    const normalizedQuery = query.toLowerCase().trim();

    try {
      // 并行获取数据
      const [favorites, historyData] = await Promise.all([
        getFavorites(),
        getHistory()
      ]);

      // 1. 匹配收藏
      const matchedFavorites = (favorites || []).filter(track =>
        this._isMatch(track, normalizedQuery)
      );

      // 2. 匹配历史
      const historyTracks = (historyData || []).map(item => item.song).filter(Boolean);

      const uniqueHistoryMap = new Map();
      historyTracks.forEach(track => {
        if (track && track.id && !uniqueHistoryMap.has(track.id)) {
          uniqueHistoryMap.set(track.id, track);
        }
      });

      const matchedHistory = Array.from(uniqueHistoryMap.values()).filter(track =>
        this._isMatch(track, normalizedQuery)
      );

      return {
        favorites: matchedFavorites,
        history: matchedHistory
      };
    } catch (error) {
      logger.error('SearchService.searchLocal error:', error);
      return { favorites: [], history: [] };
    }
  },

  /**
   * 内部匹配逻辑：支持极致模糊匹配和全字段覆盖
   */
  _isMatch(track, query) {
    if (!track || !query) return false;

    try {
      // 1. 获取所有可能的文本字段进行匹配
      // 涵盖歌名、歌手、专辑、别称(alia)、翻译名(tns)、特殊歌手字段等
      const searchTargets = [
        track.name,
        track.artist,
        track.album,
        track.alia,
        track.tns,
        track.singer,
        track.artistsname,
        track.author,
        // 深度提取 ar 数组
        ...(Array.isArray(track.ar) ? track.ar.map(a => [a.name, a.tns, a.alias]) : []),
        // 深度提取 artists 数组
        ...(Array.isArray(track.artists) ? track.artists.map(a => [a.name, a.alias]) : []),
        // 专辑信息
        track.al?.name,
        track.al?.tns,
        track.album?.name
      ].flat().filter(Boolean).map(s => s.toString().toLowerCase().replace(/\s+/g, ''));

      // 2. 处理搜索词：支持空格分隔的“且”匹配，同时支持整体模糊匹配
      const cleanQuery = query.toLowerCase().replace(/\s+/g, '');
      const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 0);

      // 检查整体包含（专治日文中间带标点或空格搜不到的情况）
      const isOverallMatch = searchTargets.some(target => target.includes(cleanQuery));
      if (isOverallMatch) return true;

      // 如果有多个词，检查是否每个词都命中（增强逻辑）
      if (queryWords.length > 1) {
        return queryWords.every(word => {
          const w = word.replace(/\s+/g, '');
          return searchTargets.some(target => target.includes(w));
        });
      }

      return false;
    } catch (e) {
      logger.warn('Match check failed for track:', track, e);
      return false;
    }
  }
};

export default SearchService;
