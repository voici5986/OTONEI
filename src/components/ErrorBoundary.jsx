import React from 'react';
import logger from '../utils/logger.js';
import { env } from '../config/env';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    if (env.isDevelopment) {
      logger.error('[ErrorBoundary] Caught error:', error, info);
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="text-center my-5">
          <h2 style={{ marginBottom: 'var(--spacing-sm)' }}>页面出错了</h2>
          <p style={{ color: 'var(--color-text-secondary)' }}>请刷新页面或稍后再试</p>
          <button type="button" className="btn btn-primary" onClick={this.handleReload}>
            刷新页面
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
