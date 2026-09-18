import React from 'react';
import { FaUser } from 'react-icons/fa';

const MobileBottomNav = ({ activeTab, handleNavItemClick, navItems }) => {
  return (
    <nav className="mobile-tab-bar" aria-label="主导航">
      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <button
            type="button"
            key={item.id}
            className={`mobile-tab-item ${activeTab === item.id ? 'active' : ''}`}
            onClick={() => handleNavItemClick(item.id)}
            aria-label={item.title}
            aria-current={activeTab === item.id ? 'page' : undefined}
            title={item.title}
          >
            <Icon />
          </button>
        );
      })}
      {/* 移动端个人中心 Tab */}
      <button
        type="button"
        className={`mobile-tab-item ${activeTab === 'user' ? 'active' : ''}`}
        onClick={() => handleNavItemClick('user')}
        aria-label="我的"
        aria-current={activeTab === 'user' ? 'page' : undefined}
        title="我的"
      >
        <FaUser />
      </button>
    </nav>
  );
};

export default MobileBottomNav;
