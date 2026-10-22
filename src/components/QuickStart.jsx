import '../styles/UserGuidance.css';

export default function QuickStart({ onOpenGuide, onSearch }) {
  return (
    <section className="quick-start" aria-labelledby="quick-start-title">
      <h2 id="quick-start-title">搜索你想听的音乐</h2>
      <p className="guidance-secondary">输入歌曲、歌手或专辑名称。</p>
      <div className="quick-start-actions">
        <button type="button" className="ui-button ui-button--secondary" onClick={onSearch}>
          搜索音乐
        </button>
        <button type="button" className="ui-text-button" onClick={onOpenGuide}>
          使用帮助
        </button>
      </div>
    </section>
  );
}
