import React from 'react';
import { FaUser } from 'react-icons/fa';

const MobileBottomNav = ({ activeTab, handleNavItemClick, navItems }) => {
  return (
    <div className="mobile-tab-bar">
      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <div
            key={item.id}
            className={`mobile-tab-item ${activeTab === item.id ? 'active' : ''}`}
            onClick={() => handleNavItemClick(item.id)}
            title={item.title}
          >
            <Icon />
          </div>
        );
      })}
      {/* 移动端个人中心 Tab */}
      <div
        className={`mobile-tab-item ${activeTab === 'user' ? 'active' : ''}`}
        onClick={() => handleNavItemClick('user')}
        title="我的"
      >
        <FaUser />
      </div>
    </div>
  );
};

export default MobileBottomNav;
