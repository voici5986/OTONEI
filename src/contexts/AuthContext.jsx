import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import {
  auth,
  loginWithEmailAndPassword,
  loginWithGoogle,
  registerWithEmailAndPassword,
  logout,
  sendPasswordReset,
  firebaseInitError,
} from '../services/firebase';
import {
  SyncEvents,
  resetSyncScheduler,
  triggerEvent,
  shouldSyncOnLogin,
  initialSync,
} from '../services/syncService';
import { toast } from 'react-toastify';
import { saveSyncStatus, getLocalUser, saveLocalUser, getNetworkStatus } from '../services/storage';
import useFirebaseStatus from '../hooks/useFirebaseStatus';
import logger from '../utils/logger.js';
import { setStorageScope } from '../services/storage';

const createLocalPasswordSalt = () => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const hashLocalPassword = async (password, salt) => {
  if (!crypto?.subtle) {
    throw new Error('当前浏览器不支持本地密码校验');
  }

  // 单重 SHA-256 强度不足，改用 PBKDF2（10 万次迭代）以抵御彩虹表/暴力破解
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return Array.from(new Uint8Array(bits), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const syncWithTimeout = async (uid, isCurrent) => {
  let timer;
  try {
    return await Promise.race([
      initialSync(uid),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          if (isCurrent()) resetSyncScheduler();
          reject(new Error('同步操作超时'));
        }, 30000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};

// 创建认证上下文
export const AuthContext = createContext();

// 自定义钩子，方便获取认证上下文
export const useAuth = () => useContext(AuthContext);

// 认证提供者组件
export const AuthProvider = ({ children }) => {
  const session = useRef({ generation: 0, uid: null });
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncComplete, setSyncComplete] = useState(false);

  // 使用Firebase状态Hook
  const { isAvailable: isFirebaseAvailable, checkAvailability } = useFirebaseStatus({
    showToasts: false, // 不显示提示，由AuthContext自己处理
    manualCheck: true, // 手动检查
  });

  const isOfflineMode = !isFirebaseAvailable;

  // 注册
  const register = useCallback(
    async (email, password, displayName) => {
      // 如果处于离线模式，创建本地用户
      if (isOfflineMode) {
        try {
          const passwordSalt = createLocalPasswordSalt();
          const passwordHash = await hashLocalPassword(password, passwordSalt);

          // 创建简单的本地用户对象
          const localUser = {
            uid: `local_${Date.now()}`,
            email,
            displayName: displayName || email,
            isAnonymous: false,
            isLocal: true,
            passwordSalt,
            passwordHash,
          };

          // 保存本地用户
          await saveLocalUser(localUser);
          session.current = { generation: session.current.generation + 1, uid: localUser.uid };
          setStorageScope(localUser);
          setCurrentUser(localUser);
          return { success: true, user: localUser };
        } catch (err) {
          toast.error('创建本地账户失败');
          return { success: false, error: err };
        }
      }

      try {
        const { user, error } = await registerWithEmailAndPassword(email, password, displayName);
        if (error) {
          let errorMessage = '注册失败';
          if (error.code === 'auth/email-already-in-use') {
            errorMessage = '该邮箱已被注册';
          } else if (error.code === 'auth/weak-password') {
            errorMessage = '密码强度太弱';
          } else if (error.code === 'auth/invalid-email') {
            errorMessage = '无效的邮箱地址';
          }
          toast.error(errorMessage);
          return { success: false, error };
        }

        return { success: true, user };
      } catch (err) {
        toast.error('注册过程中发生错误');
        return { success: false, error: err };
      }
    },
    [isOfflineMode]
  );

  // 邮箱密码登录
  const login = useCallback(
    async (email, password) => {
      // 如果处于离线模式，尝试获取本地用户
      if (isOfflineMode) {
        try {
          const attemptKey = 'otonei:local-login-attempts';
          const now = Date.now();
          let attempts;
          try {
            attempts = JSON.parse(localStorage.getItem(attemptKey) || '[]');
          } catch {
            attempts = [];
          }
          attempts = Array.isArray(attempts)
            ? attempts.filter((value) => Number.isFinite(value) && now - value < 15 * 60 * 1000)
            : [];
          if (attempts.length >= 5)
            return { success: false, error: new Error('尝试次数过多，请15分钟后重试') };
          localStorage.setItem(attemptKey, JSON.stringify([...attempts, now]));
          const localUser = await getLocalUser();

          const canVerifyPassword = localUser?.passwordSalt && localUser?.passwordHash;
          const passwordMatches =
            canVerifyPassword &&
            (await hashLocalPassword(password, localUser.passwordSalt)) === localUser.passwordHash;

          if (localUser && localUser.email === email && passwordMatches) {
            localStorage.removeItem(attemptKey);
            session.current = { generation: session.current.generation + 1, uid: localUser.uid };
            setStorageScope(localUser);
            setCurrentUser(localUser);
            return { success: true, user: localUser };
          }

          toast.error(canVerifyPassword ? '邮箱或密码错误' : '本地账户缺少密码凭据，请重新注册');
          return { success: false, error: new Error('邮箱或密码错误') };
        } catch (err) {
          toast.error('登录失败');
          return { success: false, error: err };
        }
      }

      try {
        const { user, error } = await loginWithEmailAndPassword(email, password);
        if (error) {
          let errorMessage = '登录失败';
          if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            errorMessage = '邮箱或密码错误';
          } else if (error.code === 'auth/too-many-requests') {
            errorMessage = '尝试次数过多，请稍后再试';
          }
          toast.error(errorMessage);
          return { success: false, error };
        }

        return { success: true, user };
      } catch (err) {
        toast.error('登录过程中发生错误');
        return { success: false, error: err };
      }
    },
    [isOfflineMode]
  );

  // Google登录
  const signInWithGoogle = useCallback(async () => {
    if (isOfflineMode) {
      toast.error('当前网络不可用，Google登录不可用');
      return { success: false, error: new Error('当前网络不可用，Google登录不可用') };
    }

    try {
      const { user, error } = await loginWithGoogle();
      if (error) {
        toast.error('Google登录失败');
        return { success: false, error };
      }

      return { success: true, user };
    } catch (err) {
      toast.error('登录过程中发生错误');
      return { success: false, error: err };
    }
  }, [isOfflineMode]);

  // 退出登录
  const signOut = useCallback(async () => {
    const captured = session.current;
    const uid = currentUser?.uid ?? null;
    const isCurrent = () =>
      session.current.generation === captured.generation &&
      session.current.uid === uid &&
      (currentUser?.isLocal || (auth.currentUser?.uid ?? null) === uid);
    const cancelled = () => ({ success: false, error: new Error('账户已切换，退出操作已取消') });
    if (!isCurrent()) return cancelled();
    resetSyncScheduler();
    // 如果是本地用户，直接清除
    if (currentUser?.isLocal) {
      session.current = { generation: captured.generation + 1, uid: null };
      setStorageScope(null);
      setCurrentUser(null);
      toast.info('您已退出本地账户');
      return { success: true };
    }

    try {
      // 在退出登录前执行一次同步，确保数据保存到云端
      if (currentUser && !isOfflineMode) {
        try {
          logger.log('退出登录前同步：检查数据变更');

          // 检查网络状态
          const networkStatus = await getNetworkStatus();
          if (!isCurrent()) return cancelled();
          if (networkStatus.online) {
            // 检查Firebase可用性
            const firebaseAvailable = await checkAvailability();
            if (!isCurrent()) return cancelled();
            if (firebaseAvailable) {
              // 检查是否有数据需要同步
              const syncCheck = await shouldSyncOnLogin(uid);
              if (!isCurrent()) return cancelled();

              if (syncCheck.shouldSync) {
                logger.log(`退出前执行同步: ${syncCheck.reason}`);

                // 触发同步开始事件
                triggerEvent(SyncEvents.SYNC_STARTED, {
                  uid: currentUser.uid,
                  timestamp: Date.now(),
                  syncType: 'logout',
                });

                // 更新同步状态
                await saveSyncStatus(
                  {
                    loading: true,
                    success: null,
                    message: '退出前数据同步...',
                    timestamp: null,
                  },
                  currentUser.uid
                );

                // 执行同步
                if (!isCurrent()) return cancelled();
                const result = await syncWithTimeout(uid, isCurrent);
                if (!isCurrent()) return cancelled();

                // 触发同步完成/失败事件
                if (result.success) {
                  triggerEvent(SyncEvents.SYNC_COMPLETED, {
                    uid: currentUser.uid,
                    timestamp: Date.now(),
                    syncType: 'logout',
                    result: { success: true },
                  });
                } else {
                  triggerEvent(SyncEvents.SYNC_FAILED, {
                    uid: currentUser.uid,
                    error: result.error || '未知错误',
                    timestamp: Date.now(),
                    syncType: 'logout',
                  });
                }

                // 更新同步状态
                await saveSyncStatus(
                  {
                    loading: false,
                    success: result.success,
                    message: result.success ? '同步完成' : `同步失败: ${result.error}`,
                    timestamp: new Date(),
                  },
                  currentUser.uid
                );

                logger.log('退出前同步完成，状态:', result.success ? '成功' : '失败');
              } else {
                logger.log(`退出前同步跳过: ${syncCheck.reason}`);
              }
            }
          }
        } catch (syncError) {
          if (!isCurrent()) return cancelled();
          logger.error('退出前同步失败:', syncError);

          // 触发同步失败事件
          triggerEvent(SyncEvents.SYNC_FAILED, {
            uid: currentUser.uid,
            error: syncError.message || '未知错误',
            timestamp: Date.now(),
            syncType: 'logout',
          });
        }
      }

      // 执行退出登录
      if (!isCurrent()) return cancelled();
      const { error } = await logout();
      if (auth.currentUser && auth.currentUser.uid !== uid) return cancelled();
      if (error) throw error;
      toast.info('您已退出登录');
      return { success: true };
    } catch (err) {
      toast.error('退出登录失败');
      return { success: false, error: err };
    }
  }, [currentUser, isOfflineMode, checkAvailability]);

  // 重置密码
  const resetPassword = useCallback(
    async (email) => {
      if (isOfflineMode) {
        toast.error('当前网络不可用，重置密码功能不可用');
        return { success: false, error: new Error('当前网络不可用，重置密码功能不可用') };
      }

      try {
        const { error } = await sendPasswordReset(email);
        if (error) {
          toast.error('重置密码邮件发送失败');
          return { success: false, error };
        }

        toast.success('重置密码邮件已发送，请查收');
        return { success: true };
      } catch (err) {
        toast.error('发送重置密码邮件失败');
        return { success: false, error: err };
      }
    },
    [isOfflineMode]
  );

  useEffect(() => {
    let active = true;
    let generation = 0;
    let timer;
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!active) return;
      const requestGeneration = ++generation;
      session.current = { generation: session.current.generation + 1, uid: user?.uid ?? null };
      clearTimeout(timer);
      resetSyncScheduler();
      setStorageScope(user);
      setCurrentUser(user);
      setLoading(false);
      setSyncComplete(!user);
      const isCurrent = () => active && requestGeneration === generation;
      if (!user) return;
      try {
        const networkStatus = await getNetworkStatus();
        if (!isCurrent()) return;
        const available = networkStatus.online && (await checkAvailability());
        if (!isCurrent()) return;
        const syncCheck = available && (await shouldSyncOnLogin(user.uid));
        if (!isCurrent()) return;
        if (!syncCheck || !syncCheck.shouldSync) {
          setSyncComplete(true);
          return;
        }
        await saveSyncStatus(
          { loading: true, success: null, message: '登录后自动同步...', timestamp: null },
          user.uid
        );
        if (!isCurrent()) return;
        let timeout;
        const timeoutPromise = new Promise((_, reject) => {
          timeout = setTimeout(() => {
            if (isCurrent()) resetSyncScheduler();
            reject(new Error('同步操作超时'));
          }, 30000);
          timer = timeout;
        });
        let result;
        try {
          result = await Promise.race([initialSync(user.uid), timeoutPromise]);
        } finally {
          clearTimeout(timeout);
        }
        if (!isCurrent()) return;
        setSyncComplete(true);
        await saveSyncStatus(
          {
            loading: false,
            success: result.success,
            message: result.success ? '同步完成' : `同步失败: ${result.error}`,
            timestamp: new Date(),
          },
          user.uid
        );
      } catch (error) {
        if (!isCurrent()) return;
        setSyncComplete(true);
        await saveSyncStatus(
          {
            loading: false,
            success: false,
            message: `同步错误: ${error.message}`,
            timestamp: new Date(),
          },
          user.uid
        );
      }
    });
    return () => {
      active = false;
      session.current = { generation: session.current.generation + 1, uid: null };
      generation += 1;
      clearTimeout(timer);
      unsubscribe();
      resetSyncScheduler();
    };
  }, [checkAvailability]);

  // 上下文值
  const value = useMemo(
    () => ({
      currentUser,
      isOfflineMode,
      loading,
      syncComplete,
      login,
      register,
      signInWithGoogle,
      signOut,
      resetPassword,
      firebaseInitError,
    }),
    [
      currentUser,
      isOfflineMode,
      loading,
      syncComplete,
      login,
      register,
      signInWithGoogle,
      signOut,
      resetPassword,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
