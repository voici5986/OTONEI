import { resetGuidance } from '../services/guidanceStorage';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import useGuidanceLayout from '../hooks/useGuidanceLayout';
import '../styles/UserGuidance.css';

export default function UserGuide({ open, onClose }) {
  const layout = useGuidanceLayout();
  const accountEntry = layout.usesBottomNavigation ? '底部导航的「我的」' : '右上角头像或登录入口';
  const dialogRef = useRef(null);
  const supportsNativeDialog =
    typeof HTMLDialogElement !== 'undefined' &&
    typeof HTMLDialogElement.prototype.showModal === 'function' &&
    typeof HTMLDialogElement.prototype.close === 'function';
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open) return;
    const trigger = document.activeElement;
    const native = supportsNativeDialog;
    const restoreBackground = [];
    if (native) dialog.showModal();
    else {
      dialog.setAttribute('open', '');
      dialog.setAttribute('data-fallback', '');
      // Inert siblings along the ancestor chain, never the dialog's own ancestor.
      let branch = dialog;
      while (branch.parentElement) {
        for (const sibling of branch.parentElement.children) {
          if (sibling === branch) continue;
          const wasInert = sibling.hasAttribute('inert');
          sibling.setAttribute('inert', '');
          restoreBackground.push(() => {
            if (!wasInert) sibling.removeAttribute('inert');
          });
        }
        branch = branch.parentElement;
        if (branch === document.body) break;
      }
    }
    const focusable = () => [
      ...dialog.querySelectorAll(
        'button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]'
      ),
    ];
    focusable()[0]?.focus();
    const keepFocus = (event) => {
      if (!dialog.contains(event.target)) focusable()[0]?.focus();
    };
    const handleKey = (event) => {
      if (!native && event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
      if (event.key !== 'Tab') return;
      const controls = focusable();
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', handleKey);
    if (!native) document.addEventListener('focusin', keepFocus);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('focusin', keepFocus);
      if (native && dialog.open) dialog.close();
      else dialog.removeAttribute('open');
      dialog.removeAttribute('data-fallback');
      restoreBackground.forEach((restore) => restore());
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, [open, onClose, supportsNativeDialog]);

  const dialog = (
    <dialog
      ref={dialogRef}
      className="user-guide"
      aria-labelledby="user-guide-title"
      aria-modal={open ? true : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={() => {
        if (!dialogRef.current?.open) onClose();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          onClose();
      }}
    >
      <header className="user-guide-header">
        <h2 id="user-guide-title">使用帮助</h2>
        <button type="button" className="ui-text-button" onClick={onClose}>
          关闭帮助
        </button>
      </header>
      <div className="user-guide-content">
        <section>
          <h3>音源与音质</h3>
          <p>没有结果、加载失败或无法播放时，换个音源重新搜索。不同音源的结果与可用性可能不同。</p>
          <p className="guidance-secondary">实际音质取决于音源，选择无损不保证有无损资源。</p>
        </section>
        <section>
          <h3>本地数据与账号同步</h3>
          <ul className="user-guide-steps">
            <li>游客收藏与历史只保存在当前浏览器，清除浏览器数据可能移除这些记录。</li>
            <li>
              各个账号的数据独立保存，登录不会自动合并游客收藏。本地模式账号的数据也只保存在当前浏览器。
            </li>
            <li>
              打开{accountEntry}
              查看账号与同步状态。云端账号的收藏与播放历史可在网络和同步服务可用时同步。
            </li>
          </ul>
        </section>
        <section>
          <h3>下载与安装</h3>
          <p>下载的音频保存位置与提示由浏览器管理，可在浏览器的下载记录中查找。</p>
          <p className="guidance-secondary">
            安装应用不会自动保存歌曲供离线播放。离线时可能仍能打开已加载的界面，搜索与在线播放通常仍需要网络。
          </p>
        </section>
        <section>
          <h3>收藏备份</h3>
          <p>
            登录后，打开{accountEntry}
            的「数据管理」，可「导出收藏数据」保存备份，或「导入收藏数据」选择备份文件。
          </p>
          <p className="guidance-secondary">
            备份文件的保存位置由浏览器管理，只包含收藏数据，不包含歌曲音频。导入备份与云端同步是两种独立的数据恢复方式。
          </p>
        </section>
        <button
          type="button"
          className="ui-text-button"
          onClick={() => {
            resetGuidance();
            onClose();
          }}
        >
          重新查看引导
        </button>
      </div>
    </dialog>
  );
  if (supportsNativeDialog) return dialog;
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="user-guide-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {dialog}
    </div>,
    document.body
  );
}
