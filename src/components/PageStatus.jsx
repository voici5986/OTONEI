import React from 'react';

const PageStatus = ({ title, description, busy = false, error = false, action, onAction }) => (
  <section className="page-status" role={error ? 'alert' : 'status'} aria-busy={busy}>
    {busy && <span className="spinner-custom" aria-hidden="true" />}
    <h2 className="page-status-title">{title}</h2>
    {description && <p className="page-status-description">{description}</p>}
    {action && onAction && (
      <div className="page-status-actions">
        <button
          type="button"
          className="page-status-button minimal-action-btn ui-button"
          onClick={onAction}
        >
          {action}
        </button>
      </div>
    )}
  </section>
);

export default PageStatus;
