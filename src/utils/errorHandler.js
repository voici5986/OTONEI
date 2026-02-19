import { toast } from 'react-toastify';
import logger from './logger.js';

// 用于跟踪最近显示的错误消息，防止短时间内重复显示
const recentErrors = new Map();
const ERROR_THROTTLE_TIME = 3000; // 3秒内相同错误消息只显示一次

/**
 * 错误类型枚举
 */
export const ErrorTypes = {
  NETWORK: 'network',
  API: 'api',
  PLAYBACK: 'playback',
  DOWNLOAD: 'download',
  SEARCH: 'search',
  AUTH: 'auth',
  STORAGE: 'storage',
  REGION: 'region',
  UNKNOWN: 'unknown'
};

/**
 * 错误严重程度枚举
 */
export const ErrorSeverity = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical'
};

/**
 * 统一处理错误
 * @param {Error} error - 错误对象
 * @param {string} type - 错误类型
 * @param {string} severity - 错误严重程度
 * @param {string} customMessage - 自定义错误消息
 * @param {Function} callback - 错误处理后的回调函数
 */
export const handleError = (error, type = ErrorTypes.UNKNOWN, severity = ErrorSeverity.ERROR, customMessage = null, callback = null) => {
  // 记录错误到控制台
  if (process.env.NODE_ENV === 'development') {
    logger.error(`[${type.toUpperCase()}] Error:`, error);
  }
  
  // 确定显示的错误消息
  let message = customMessage;
  if (!message) {
    message = getErrorMessage(error, type);
  }
  
  // 检查是否是重复错误消息
  const errorKey = `${type}-${message}`;
  const now = Date.now();
  const lastShown = recentErrors.get(errorKey);
  
  if (lastShown && (now - lastShown) < ERROR_THROTTLE_TIME) {
    logger.log(`[ErrorHandler] 抑制重复错误通知: ${message} (${now - lastShown}ms内)`);
    
    // 执行回调但不显示Toast
    if (callback && typeof callback === 'function') {
      callback(error, type, severity);
    }
    
    return;
  }
  
  // 更新最近显示的错误记录
  recentErrors.set(errorKey, now);
  
  // 清理旧记录
  setTimeout(() => {
    if (recentErrors.get(errorKey) === now) {
      recentErrors.delete(errorKey);
    }
  }, ERROR_THROTTLE_TIME);
  
  // 确定图标
  let icon = '❌';
  if (severity === ErrorSeverity.WARNING) {
    icon = '⚠️';
  } else if (severity === ErrorSeverity.INFO) {
    icon = 'ℹ️';
  }
  
  // 确定持续时间
  let duration = 5000; // 默认5秒
  if (severity === ErrorSeverity.CRITICAL) {
    duration = 10000; // 严重错误显示更长时间
  } else if (severity === ErrorSeverity.INFO) {
    duration = 3000; // 信息提示显示更短时间
  }
  
  // 显示错误提示
  showErrorToast(message, severity, icon, duration);
  
  // 执行回调
  if (callback && typeof callback === 'function') {
    callback(error, type, severity);
  }
};

/**
 * 根据错误类型和错误对象获取适当的错误消息
 * @param {Error} error - 错误对象
 * @param {string} type - 错误类型
 * @returns {string} - 错误消息
 */
const getErrorMessage = (error, type) => {
  // 检查是否是网络错误
  if ((error.message && error.message.includes('Network Error')) || error.code === 'ERR_NETWORK') {
    return '网络连接错误，请检查您的网络连接';
  }
  
  // 检查是否是超时错误
  if (error.message && error.message.includes('timeout')) {
    return '请求超时，请稍后重试';
  }
  
  
  // 根据错误类型返回适当的消息
  switch (type) {
    case ErrorTypes.NETWORK:
      return '网络错误，请检查您的网络连接';
    case ErrorTypes.API:
      return '服务器错误，请稍后重试';
    case ErrorTypes.PLAYBACK:
      return '音频播放失败，该音源可能不可用';
    case ErrorTypes.DOWNLOAD:
      return '下载失败，请稍后重试';
    case ErrorTypes.SEARCH:
      return '搜索失败，请稍后重试';
    case ErrorTypes.AUTH:
      return '认证失败，请重新登录';
    case ErrorTypes.STORAGE:
      return '存储操作失败，请检查浏览器存储权限';
    case ErrorTypes.REGION:
      return '您所在的地区可能无法访问此服务';
    default:
      return error.message || '发生未知错误，请稍后重试';
  }
};

/**
 * 显示错误提示Toast
 * @param {string} message - 错误消息
 * @param {string} severity - 错误严重程度
 * @param {string} icon - 图标
 * @param {number} duration - 持续时间
 */
const showErrorToast = (message, severity, icon, duration) => {
  const toastOptions = {
    icon,
    autoClose: duration,
    hideProgressBar: false,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
    progress: undefined,
  };
  
  switch (severity) {
    case ErrorSeverity.INFO:
      toast.info(message, toastOptions);
      break;
    case ErrorSeverity.WARNING:
      toast.warning(message, {
        ...toastOptions,
        className: 'custom-toast warning-toast'
      });
      break;
    case ErrorSeverity.ERROR:
    case ErrorSeverity.CRITICAL:
      toast.error(message, {
        ...toastOptions,
        className: 'custom-toast error-toast'
      });
      break;
    default:
      toast(message, toastOptions);
  }
};

/**
 * 检查网络状态并处理离线情况
 * @param {boolean} isOnline - 是否在线
 * @param {string} actionType - 尝试执行的操作类型
 * @returns {boolean} - 如果在线返回true，离线返回false
 */
export const checkNetworkStatus = (isOnline, actionType = '操作') => {
  if (!isOnline) {
    handleError(
      new Error('您当前处于离线状态'),
      ErrorTypes.NETWORK,
      ErrorSeverity.WARNING,
      `您当前处于离线状态，无法${actionType}`
    );
    return false;
  }
  return true;
};

/**
 * 检查搜索参数
 * @param {string} query - 搜索关键词
 * @returns {boolean} - 如果搜索参数有效返回true，否则返回false
 */
export const validateSearchParams = (query) => {
  if (!query || query.trim() === '') {
    handleError(
      new Error('搜索关键词为空'),
      ErrorTypes.SEARCH,
      ErrorSeverity.INFO,
      '请输入搜索关键词'
    );
    return false;
  }
  return true;
};

/**
 * 检查下载状态
 * @param {boolean} downloading - 是否正在下载
 * @returns {boolean} - 如果可以开始新的下载返回true，否则返回false
 */
export const checkDownloadStatus = (downloading) => {
  if (downloading) {
    toast.info('正在下载中，请稍候', { autoClose: 2000 });
    return false;
  }
  return true;
};

/**
 * 提供恢复建议
 * @param {string} type - 错误类型
 * @returns {string} - 恢复建议
 */
export const getRecoverySuggestion = (type) => {
  switch (type) {
    case ErrorTypes.NETWORK:
      return '请检查您的网络连接，然后刷新页面重试';
    case ErrorTypes.API:
      return '服务器可能暂时不可用，请稍后再试';
    case ErrorTypes.PLAYBACK:
      return '请尝试其他音源或切换音质';
    case ErrorTypes.DOWNLOAD:
      return '请检查您的网络连接和存储空间';
    case ErrorTypes.SEARCH:
      return '请尝试使用不同的关键词或音源';
    case ErrorTypes.AUTH:
      return '请重新登录或尝试使用离线模式';
    case ErrorTypes.STORAGE:
      return '请检查浏览器存储权限或清理浏览器缓存';
    case ErrorTypes.REGION:
      return '请考虑使用VPN服务或切换网络';
    default:
      return '请刷新页面或重新启动应用';
  }
};

/**
 * 检查是否可以自动恢复
 * @param {Error} error - 错误对象
 * @param {string} type - 错误类型
 * @returns {boolean} - 是否可以自动恢复
 */
export const canAutoRecover = (error, type) => {
  // 网络错误通常可以通过重试来恢复
  if (type === ErrorTypes.NETWORK || 
      ((error.message && error.message.includes('Network Error')) || 
      error.code === 'ERR_NETWORK')) {
    return true;
  }
  
  // API错误可能可以通过重试来恢复
  if (type === ErrorTypes.API && error.response && error.response.status >= 500) {
    return true;
  }
  
  // 其他类型的错误通常需要用户干预
  return false;
};

/**
 * 尝试自动恢复
 * @param {Function} recoveryFn - 恢复函数
 * @param {number} maxRetries - 最大重试次数
 * @param {number} delay - 重试延迟(毫秒)
 * @returns {Promise} - 恢复结果
 */
export const autoRecover = async (recoveryFn, maxRetries = 3, delay = 1000) => {
  let retries = 0;
  let lastError = null;
  
  while (retries < maxRetries) {
    try {
      // 捕获当前delay值
      const currentDelay = delay;
      // 等待指定延迟
      await new Promise(resolve => setTimeout(resolve, currentDelay));
      
      // 尝试恢复
      const result = await recoveryFn();
      return result;
    } catch (error) {
      lastError = error;
      retries++;
      
      // 增加重试延迟（指数退避）
      delay *= 2;
    }
  }
  
  // 所有重试都失败了
  throw lastError;
}; 