import React from 'react';
import useNavigationState from '../hooks/useNavigationState';
import DesktopNavbar from './DesktopNavbar';
import MobileBottomNav from './MobileBottomNav';
import { useDevice } from '../contexts/DeviceContext';

const Navigation = ({ activeTab, onTabChange }) => {
  const deviceInfo = useDevice();
  const {
    expanded,
    setExpanded,
    scrolled,
    currentUser,
    handleNavItemClick,
    userInitial,
    navItems
  } = useNavigationState({ activeTab, onTabChange });

  return (
    <>
      <div className={!deviceInfo.isMobile ? 'navigation-sidebar' : ''}>
        <DesktopNavbar
          activeTab={activeTab}
          expanded={expanded}
          setExpanded={setExpanded}
          scrolled={scrolled}
          currentUser={currentUser}
          handleNavItemClick={handleNavItemClick}
          userInitial={userInitial}
          navItems={navItems}
        />
      </div>
      <MobileBottomNav
        activeTab={activeTab}
        handleNavItemClick={handleNavItemClick}
        navItems={navItems}
      />
    </>
  );
};

export default Navigation;
