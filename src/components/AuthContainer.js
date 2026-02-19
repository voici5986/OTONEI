import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { FaEnvelope, FaLock, FaUser } from 'react-icons/fa';
import { FcGoogle } from 'react-icons/fc';

/**
 * 统一的身份验证容器组件
 * 整合了登录、注册和重置密码功能
 * @param {string} initialMode - 初始模式：'login' | 'register'
 * @param {function} onAuthSuccess - 验证成功后的回调
 */
const AuthContainer = ({ initialMode = 'login', onAuthSuccess }) => {
  // 模式状态：login, register, forgot
  const [mode, setMode] = useState(initialMode);

  // 表单状态
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // UI 状态
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);

  const { login, register, signInWithGoogle, resetPassword } = useAuth();

  // 切换模式
  const switchMode = (newMode) => {
    setMode(newMode);
    setError('');
    setResetEmailSent(false);
  };

  // 处理登录
  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    if (!email || !password) return setError('请填写所有必填字段');

    try {
      setLoading(true);
      await login(email, password);
      onAuthSuccess && onAuthSuccess();
    } catch (err) {
      console.error('登录失败:', err);
      const msg = {
        'auth/user-not-found': '邮箱或密码错误',
        'auth/wrong-password': '邮箱或密码错误',
        'auth/invalid-email': '无效的邮箱格式',
        'auth/too-many-requests': '登录尝试次数过多，请稍后再试'
      }[err.code] || '登录失败，请稍后再试';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // 处理注册
  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    if (!displayName || !email || !password || !confirmPassword) return setError('请填写所有必填字段');
    if (password !== confirmPassword) return setError('两次输入的密码不一致');
    if (password.length < 6) return setError('密码长度至少为6个字符');

    try {
      setLoading(true);
      await register(email, password, displayName);
      onAuthSuccess && onAuthSuccess();
    } catch (err) {
      console.error('注册失败:', err);
      const msg = {
        'auth/email-already-in-use': '该邮箱已被注册',
        'auth/invalid-email': '无效的邮箱格式',
        'auth/weak-password': '密码强度太弱'
      }[err.code] || '注册失败，请稍后再试';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // 处理重置密码
  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!email) return setError('请输入邮箱地址');

    setLoading(true);
    try {
      const { success } = await resetPassword(email);
      if (success) setResetEmailSent(true);
    } catch {
      setError('邮件发送失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  // 处理 Google 登录
  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      const { success } = await signInWithGoogle();
      if (success) onAuthSuccess && onAuthSuccess();
    } catch {
      setError('Google登录失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-form-container">
      {/* 品牌区域 (移动端显示) */}
      <div className="brand-section d-lg-none">
        <div className="brand-logo"><img src="/logo.svg" alt="OTONEI" style={{ width: '48px', height: '48px' }} /></div>
        <div className="brand-name">OTONEI</div>
        <div className="brand-tagline">让音乐随心而动</div>
      </div>

      <h3 className="text-center mb-4 d-none d-lg-block">
        {mode === 'login' ? '登录账号' : mode === 'register' ? '创建账号' : '重置密码'}
      </h3>

      {error && <div className="alert-custom alert-danger-custom">{error}</div>}
      {resetEmailSent && <div className="alert-custom alert-success-custom">重置邮件已发送，请查收</div>}

      <form onSubmit={mode === 'login' ? handleLogin : mode === 'register' ? handleRegister : handleResetPassword}>
        {/* 昵称 (仅注册模式) */}
        {mode === 'register' && (
          <div className="form-group">
            <div className="input-wrapper">
              <div className="input-icon"><FaUser /></div>
              <input
                type="text"
                className="input-field"
                placeholder="昵称"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                disabled={loading}
              />
            </div>
          </div>
        )}

        {/* 邮箱 */}
        <div className="form-group">
          <div className="input-wrapper">
            <div className="input-icon"><FaEnvelope /></div>
            <input
              type="email"
              className="input-field"
              placeholder="输入你的邮箱"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>
        </div>

        {/* 密码 (非重置模式) */}
        {mode !== 'forgot' && (
          <div className="form-group">
            <div className="input-wrapper">
              <div className="input-icon"><FaLock /></div>
              <input
                type="password"
                className="input-field"
                placeholder={mode === 'register' ? "设置密码" : "密码"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            {mode === 'register' && <div className="text-muted small mt-1 ps-1" style={{ fontSize: '12px' }}>密码长度至少为6个字符</div>}
          </div>
        )}

        {/* 确认密码 (仅注册模式) */}
        {mode === 'register' && (
          <div className="form-group">
            <div className="input-wrapper">
              <div className="input-icon"><FaLock /></div>
              <input
                type="password"
                className="input-field"
                placeholder="确认密码"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>
          </div>
        )}

        <button type="submit" disabled={loading} className="btn-auth btn-primary-auth">
          {loading ? <span className="spinner-custom" style={{ width: '1.2rem', height: '1.2rem' }}></span> :
            mode === 'login' ? "立即登录" : mode === 'register' ? "立即注册" : "发送重置邮件"}
        </button>

        {/* Google 登录 (非重置模式) */}
        {mode !== 'forgot' && (
          <button type="button" onClick={handleGoogleLogin} disabled={loading} className="btn-auth btn-google-auth">
            <FcGoogle /> 使用 Google 账号{mode === 'login' ? '登录' : '注册'}
          </button>
        )}

        {/* 底部切换链接 */}
        <div className="d-flex justify-content-between align-items-center mt-4">
          {mode === 'login' ? (
            <>
              <button type="button" onClick={() => switchMode('forgot')} className="text-link">忘记密码？</button>
              <button type="button" onClick={() => switchMode('register')} className="text-accent">免费注册</button>
            </>
          ) : mode === 'register' ? (
            <div className="w-100 text-center">
              <span className="text-muted small">已有账号？</span>
              <button type="button" onClick={() => switchMode('login')} className="text-accent ms-1">立即登录</button>
            </div>
          ) : (
            <div className="w-100 text-center">
              <button type="button" onClick={() => switchMode('login')} className="text-accent">返回登录</button>
            </div>
          )}
        </div>
      </form>
    </div>
  );
};

export default AuthContainer;
