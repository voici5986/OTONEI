import React from 'react';
import logger from '../utils/logger.js';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    if (process.env.NODE_ENV === 'development') {
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
          <h2 style={{ marginBottom: '8px' }}>页面出错了</h2>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            请刷新页面或稍后再试
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={this.handleReload}
          >
            刷新页面
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
