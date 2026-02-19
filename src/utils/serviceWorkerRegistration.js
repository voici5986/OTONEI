import logger from './logger.js';
/**
 * Service Worker注册工具
 * 用于注册、更新和管理Service Worker
 */

// 当前环境是否为生产环境
const isLocalhost = Boolean(
  window.location.hostname === 'localhost' ||
  window.location.hostname === '[::1]' ||
  window.location.hostname.match(/^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/)
);

/**
 * 注册Service Worker
 * @param {Object} config 配置选项
 */
export function register(config = {}) {
  if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
    // URL构造函数在所有浏览器中可用
    const publicUrl = new URL(process.env.PUBLIC_URL, window.location.href);

    // 如果我们的源与PUBLIC_URL的源不同，则PWA不会工作
    if (publicUrl.origin !== window.location.origin) {
      logger.log('PUBLIC_URL的源与页面源不匹配，Service Worker将不会被注册');
      return;
    }

    window.addEventListener('load', () => {
      const swUrl = `${process.env.PUBLIC_URL}/service-worker.js`;

      if (isLocalhost) {
        // 这是在开发环境中的本地主机
        // 检查Service Worker是否存在
        checkValidServiceWorker(swUrl, config);

        // 添加一些额外的日志到本地主机
        navigator.serviceWorker.ready.then(() => {
          logger.log('Service Worker准备就绪');
        });
      } else {
        // 不是本地主机，注册Service Worker
        registerValidSW(swUrl, config);
      }
    });
  } else {
    logger.log('当前环境不支持Service Worker，或者不是生产环境');
  }
}

/**
 * 注册有效的Service Worker
 * @param {string} swUrl Service Worker URL
 * @param {Object} config 配置选项
 */
function registerValidSW(swUrl, config) {
  navigator.serviceWorker
    .register(swUrl)
    .then((registration) => {
      // 立即回传registration，便于UI获取
      if (config && config.onSuccess) {
        config.onSuccess(registration);
      }
      // 检查更新
      registration.onupdatefound = () => {
        const installingWorker = registration.installing;
        if (installingWorker == null) {
          return;
        }
        installingWorker.onstatechange = () => {
          if (installingWorker.state === 'installed') {
            if (navigator.serviceWorker.controller) {
              // 新内容可用，通知用户
              logger.log('新内容可用，请刷新页面');

              // 执行回调
              if (config && config.onUpdate) {
                config.onUpdate(registration);
              }
            } else {
              // 一切都已缓存，内容离线可用
              logger.log('内容已缓存，可离线使用');

              // 已在注册时回传，无需重复
            }
          }
        };
      };
    })
    .catch((error) => {
      logger.error('Service Worker注册失败:', error);
    });
}

/**
 * 检查Service Worker是否有效
 * @param {string} swUrl Service Worker URL
 * @param {Object} config 配置选项
 */
function checkValidServiceWorker(swUrl, config) {
  // 检查是否可以找到Service Worker
  fetch(swUrl, {
    headers: { 'Service-Worker': 'script' },
  })
    .then((response) => {
      // 确保Service Worker存在，且响应正常
      const contentType = response.headers.get('content-type');
      if (
        response.status === 404 ||
        (contentType != null && contentType.indexOf('javascript') === -1)
      ) {
        // 找不到Service Worker，可能是不同的应用
        navigator.serviceWorker.ready.then((registration) => {
          registration.unregister().then(() => {
            window.location.reload();
          });
        });
      } else {
        // 找到Service Worker，正常注册
        registerValidSW(swUrl, config);
      }
    })
    .catch(() => {
      logger.log('无法连接到网络，使用离线模式');
    });
}

/**
 * 注销Service Worker
 */
export function unregister() {
  if ('serviceWorker' in navigator) {
    return navigator.serviceWorker.ready
      .then((registration) => {
        return registration.unregister();
      })
      .catch((error) => {
        logger.error('Service Worker注销失败:', error);
      });
  }
  return Promise.resolve(false);
}

/**
 * 发送消息给Service Worker
 * @param {string} type 消息类型
 * @param {any} payload 消息内容
 */
export function sendMessageToSW(type, payload) {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type,
      payload,
    });
  }
}

/**
 * 检查应用更新
 * @returns {Promise} 返回一个Promise，表示检查更新的结果
 */
export function checkForUpdates() {
  if ('serviceWorker' in navigator) {
    return navigator.serviceWorker.ready
      .then((registration) => {
        return registration.update();
      })
      .catch((error) => {
        logger.error('检查更新失败:', error);
        return Promise.reject(error);
      });
  }
  return Promise.resolve(false);
}

// 创建一个命名对象，代替匿名导出
const serviceWorkerRegistration = {
  register,
  unregister,
  sendMessageToSW,
  checkForUpdates
};

export default serviceWorkerRegistration; 
