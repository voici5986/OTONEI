import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  auth,
  loginWithEmailAndPassword,
  loginWithGoogle,
  registerWithEmailAndPassword,
  logout,
  sendPasswordReset,
  firebaseInitError
} from '../services/firebase';
import {
  SyncEvents,
  triggerEvent,
  shouldSyncOnLogin,
  initialSync
} from '../services/syncService';
import { toast } from 'react-toastify';
import { saveSyncStatus, getLocalUser, saveLocalUser, getNetworkStatus } from '../services/storage';
import useFirebaseStatus from '../hooks/useFirebaseStatus';
import logger from '../utils/logger.js';

// 创建认证上下文
export const AuthContext = createContext();

// 自定义钩子，方便获取认证上下文
export const useAuth = () => useContext(AuthContext);

// 认证提供者组件
export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncComplete, setSyncComplete] = useState(false);

  // 使用Firebase状态Hook
  const { isAvailable: isFirebaseAvailable, checkAvailability } = useFirebaseStatus({
    showToasts: false, // 不显示提示，由AuthContext自己处理
    manualCheck: true // 手动检查
  });

  const [isOfflineMode, setIsOfflineMode] = useState(!isFirebaseAvailable);

  // 仅根据 Firebase 可用性状态设置离线模式
  useEffect(() => {
    setIsOfflineMode(!isFirebaseAvailable);
  }, [isFirebaseAvailable]);

  // 注册
  const register = async (email, password, displayName) => {
    // 如果处于离线模式，创建本地用户
    if (isOfflineMode) {
      try {
        // 创建简单的本地用户对象
        const localUser = {
          uid: `local_${Date.now()}`,
          email,
          displayName: displayName || email,
          isAnonymous: false,
          isLocal: true
        };

        // 保存本地用户
        await saveLocalUser(localUser);
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
  };

  // 邮箱密码登录
  const login = async (email, password) => {
    // 如果处于离线模式，尝试获取本地用户
    if (isOfflineMode) {
      try {
        const localUser = await getLocalUser();

        // 检查本地用户是否存在且邮箱匹配
        if (localUser && localUser.email === email) {
          // 简单模拟密码检查，实际生产中应使用更安全的方式
          setCurrentUser(localUser);
          return { success: true, user: localUser };
        } else {
          toast.error('邮箱或密码错误');
          return { success: false, error: new Error('邮箱或密码错误') };
        }
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
  };

  // Google登录
  const signInWithGoogle = async () => {
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
  };

  // 退出登录
  const signOut = async () => {
    // 如果是本地用户，直接清除
    if (currentUser?.isLocal) {
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
          if (networkStatus.online) {
            // 检查Firebase可用性
            const firebaseAvailable = await checkAvailability();
            if (firebaseAvailable) {
              // 检查是否有数据需要同步
              const syncCheck = await shouldSyncOnLogin(currentUser.uid);

              if (syncCheck.shouldSync) {
                logger.log(`退出前执行同步: ${syncCheck.reason}`);

                // 触发同步开始事件
                triggerEvent(SyncEvents.SYNC_STARTED, {
                  uid: currentUser.uid,
                  timestamp: Date.now(),
                  syncType: 'logout'
                });

                // 更新同步状态
                await saveSyncStatus({
                  loading: true,
                  success: null,
                  message: '退出前数据同步...',
                  timestamp: null
                }, currentUser.uid);

                // 执行同步
                const result = await initialSync(currentUser.uid);

                // 触发同步完成/失败事件
                if (result.success) {
                  triggerEvent(SyncEvents.SYNC_COMPLETED, {
                    uid: currentUser.uid,
                    timestamp: Date.now(),
                    syncType: 'logout',
                    result: { success: true }
                  });
                } else {
                  triggerEvent(SyncEvents.SYNC_FAILED, {
                    uid: currentUser.uid,
                    error: result.error || '未知错误',
                    timestamp: Date.now(),
                    syncType: 'logout'
                  });
                }

                // 更新同步状态
                await saveSyncStatus({
                  loading: false,
                  success: result.success,
                  message: result.success ? '同步完成' : `同步失败: ${result.error}`,
                  timestamp: new Date()
                }, currentUser.uid);

                logger.log('退出前同步完成，状态:', result.success ? '成功' : '失败');
              } else {
                logger.log(`退出前同步跳过: ${syncCheck.reason}`);
              }
            }
          }
        } catch (syncError) {
          logger.error('退出前同步失败:', syncError);

          // 触发同步失败事件
          triggerEvent(SyncEvents.SYNC_FAILED, {
            uid: currentUser.uid,
            error: syncError.message || '未知错误',
            timestamp: Date.now(),
            syncType: 'logout'
          });
        }
      }

      // 执行退出登录
      await logout();
      toast.info('您已退出登录');
      return { success: true };
    } catch (err) {
      toast.error('退出登录失败');
      return { success: false, error: err };
    }
  };

  // 重置密码
  const resetPassword = async (email) => {
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
  };

  // 监听用户登录状态
  useEffect(() => {
    // 离线模式下不需要监听Firebase身份验证状态
    if (isOfflineMode) {
      setLoading(false);
      return () => { };
    }

    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      setCurrentUser(user);
      setLoading(false);

      // 如果用户登录了，执行数据同步
      if (user) {
        setSyncComplete(false);
        try {
          // 先检查网络和Firebase可用性
          logger.log('登录后同步：检查网络和Firebase可用性');

          // 检查网络状态
          const networkStatus = await getNetworkStatus();
          if (!networkStatus.online) {
            logger.warn('网络离线，跳过登录同步');
            setSyncComplete(true);
            await saveSyncStatus({
              loading: false,
              success: false,
              message: '网络离线，同步已跳过',
              timestamp: new Date()
            }, user.uid);
            return;
          }


          // 检查Firebase可用性，使用Hook提供的方法
          const firebaseAvailable = await checkAvailability();
          if (!firebaseAvailable) {
            logger.warn('Firebase不可用，跳过登录同步');
            setSyncComplete(true);
            await saveSyncStatus({
              loading: false,
              success: false,
              message: 'Firebase不可用，同步已跳过',
              timestamp: new Date()
            }, user.uid);
            return;
          }

          // 新增：检查是否需要同步
          const syncCheck = await shouldSyncOnLogin(user.uid);
          if (!syncCheck.shouldSync) {
            logger.log(`跳过登录同步: ${syncCheck.reason}`);
            setSyncComplete(true);
            await saveSyncStatus({
              loading: false,
              success: true,
              message: `同步已跳过: ${syncCheck.reason}`,
              timestamp: new Date()
            }, user.uid);
            return;
          }

          // 更新同步状态为"正在同步"
          await saveSyncStatus({
            loading: true,
            success: null,
            message: '登录后自动同步...',
            timestamp: null
          }, user.uid);

          // 添加超时处理
          const syncPromise = initialSync(user.uid);
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('同步操作超时')), 30000)
          );

          // 使用Promise.race确保同步不会永久挂起
          const result = await Promise.race([syncPromise, timeoutPromise])
            .catch(error => {
              logger.error('登录同步失败:', error);
              return { success: false, error: error.message };
            });

          setSyncComplete(true);

          // 更新同步状态
          await saveSyncStatus({
            loading: false,
            success: result.success,
            message: result.success ? '同步完成' : `同步失败: ${result.error}`,
            timestamp: new Date()
          }, user.uid);

          if (result.success) {
            logger.log('登录同步成功');
          } else {
            logger.warn('登录同步失败:', result.error);
          }
        } catch (error) {
          logger.error('同步过程中发生错误:', error);
          setSyncComplete(true);

          // 更新同步状态
          await saveSyncStatus({
            loading: false,
            success: false,
            message: `同步错误: ${error.message}`,
            timestamp: new Date()
          }, user.uid);
        }
      }
    });

    return () => unsubscribe();
  }, [isOfflineMode, checkAvailability]);

  // 上下文值
  const value = {
    currentUser,
    isOfflineMode,
    loading,
    syncComplete,
    login,
    register,
    signInWithGoogle,
    signOut,
    resetPassword,
    firebaseInitError
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}; 
