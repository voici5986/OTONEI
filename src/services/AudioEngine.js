/**
 * AudioEngine.js
 * 核心音频引擎层，基于原生 HTML5 Audio 对象。
 * 封装了音频播放、暂停、跳转、事件监听等底层逻辑，确保全局只有一个 Audio 实例。
 */

class AudioEngine {
    constructor() {
        this.audio = new Audio();
        this.audio.preload = 'auto';
        this.audio.crossOrigin = 'anonymous';
        this.eventListeners = new Map();
        this.currentTrack = null;

        // 初始化默认事件转发
        this._initEvents();
    }

    _initEvents() {
        const events = [
            'play', 'pause', 'ended', 'timeupdate',
            'loadedmetadata', 'error', 'waiting', 'playing', 'canplay'
        ];

        events.forEach(eventName => {
            this.audio.addEventListener(eventName, (e) => {
                this._dispatch(eventName, e);
            });
        });

        // 自动重连逻辑或错误处理增强
        this.audio.addEventListener('error', () => {
            console.error('[AudioEngine] 播放错误:', this.audio.error);
        });
    }

    // 注册事件监听
    on(event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(callback);
        return () => this.off(event, callback);
    }

    off(event, callback) {
        if (this.eventListeners.has(event)) {
            const listeners = this.eventListeners.get(event);
            this.eventListeners.set(event, listeners.filter(l => l !== callback));
        }
    }

    _dispatch(event, data) {
        if (this.eventListeners.has(event)) {
            this.eventListeners.get(event).forEach(callback => callback(data));
        }
    }

    // 播放控制
    async setSource(url, track) {
        console.log('[AudioEngine] 设置音源:', url);
        this.currentTrack = track;

        // 停止当前播放
        if (!this.audio.paused) {
            this.audio.pause();
        }

        this.audio.src = url;
        this.audio.load();

        try {
            await this.audio.play();
            return true;
        } catch (error) {
            console.warn('[AudioEngine] 自动播放尝试失败 (通常是浏览器限制):', error);
            // 仍然标记为成功加载，等待用户交互触发 play()
            return false;
        }
    }

    play() {
        if (this.audio.src) {
            return this.audio.play().catch(e => console.error('[AudioEngine] 播放失败:', e));
        }
    }

    pause() {
        this.audio.pause();
    }

    seek(seconds) {
        if (this.audio.duration) {
            this.audio.currentTime = seconds;
        }
    }

    setVolume(val) {
        this.audio.volume = Math.max(0, Math.min(1, val));
    }

    // 获取状态
    get duration() {
        return this.audio.duration || 0;
    }

    get currentTime() {
        return this.audio.currentTime || 0;
    }

    get paused() {
        return this.audio.paused;
    }
}

// 单例模式
const audioEngine = new AudioEngine();
export default audioEngine;
