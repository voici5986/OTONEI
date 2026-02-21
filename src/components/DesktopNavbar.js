import React from 'react';
import { FaUser } from 'react-icons/fa';
import { useDevice } from '../contexts/DeviceContext';
import AvatarImage from './AvatarImage';

const DesktopNavbar = ({
  activeTab,
  expanded,
  setExpanded,
  scrolled,
  currentUser,
  handleNavItemClick,
  userInitial,
  navItems
}) => {
  const deviceInfo = useDevice();
  const isSidebar = !deviceInfo.isMobile;

  // OTONEI标志样式 - 调整更紧凑
  const logoStyle = {
    fontFamily: "'Montserrat', sans-serif",
    fontWeight: 800,
    fontSize: isSidebar ? '1.4rem' : '1.6rem',
    color: 'var(--color-text-primary)',
    letterSpacing: '-0.5px', // 减小字间距，使文字更紧凑
    marginLeft: '-2px' // 微调文字位置
  };

  return (
    <nav
      className={`navbar navbar-expand-lg nav-animated ${scrolled ? 'scrolled' : ''} ${isSidebar ? 'flex-column h-100 align-items-start border-0' : ''}`}
    >
      <div className={`container-fluid ${isSidebar ? 'flex-column align-items-start px-0' : ''} h-100`}>
        <div className={`navbar-brand d-flex align-items-center ${isSidebar ? 'mb-4 ps-3' : ''}`}>
          <img
            src="/logo.svg"
            alt="OTONEI Logo"
            width={isSidebar ? "32" : "38"}
            height={isSidebar ? "32" : "38"}
            className="logo-image logo-pulse me-1"
            style={{
              filter: 'drop-shadow(0 0 3px rgba(31, 31, 31, 0.25))',
              marginBottom: '2px' // 微调垂直对齐
            }}
          />
          <span className="brand-text" style={logoStyle}>OTONEI</span>
        </div>

        {/* 仅在移动端显示顶部的用户头像按钮 */}
        {!isSidebar && (
          <div className="order-lg-last ms-auto me-2 d-flex align-items-center">
            {currentUser ? (
              <div
                onClick={() => handleNavItemClick('user')}
                className={`d-flex align-items-center justify-content-center nav-link nav-item ${activeTab === 'user' ? 'active' : ''}`}
                style={{ width: '40px', height: '40px', cursor: 'pointer' }}
              >
                <AvatarImage
                  src={currentUser?.photoURL || null}
                  cacheKey={currentUser?.uid || currentUser?.email || 'guest'}
                  alt="Profile"
                  className="rounded-circle shadow-sm"
                  style={{ width: '32px', height: '32px', objectFit: 'cover' }}
                  fallback={userInitial ? (
                    <div
                      className="rounded-circle d-flex justify-content-center align-items-center shadow-sm"
                      style={{ width: '32px', height: '32px', fontSize: '1rem', backgroundColor: 'var(--color-text-primary)', color: 'var(--card-background)' }}
                    >
                      {userInitial}
                    </div>
                  ) : (
                    <FaUser />
                  )}
                />
              </div>
            ) : (
              <button
                className="d-flex align-items-center justify-content-center minimal-action-btn"
                onClick={() => handleNavItemClick('user')}
                style={{ width: '40px', height: '40px', borderRadius: '50%', padding: 0 }}
              >
                <FaUser />
              </button>
            )}
          </div>
        )}

        {!isSidebar && (
          <button
            className="navbar-toggler"
            type="button"
            onClick={() => setExpanded(!expanded)}
            aria-controls="basic-navbar-nav"
            aria-expanded={expanded}
            aria-label="Toggle navigation"
          >
            <span className="navbar-toggler-icon"></span>
          </button>
        )}

        <div className={`collapse navbar-collapse ${isSidebar ? "w-100 flex-column show" : (expanded ? "show" : "")}`} id="basic-navbar-nav">
          <div className={`navbar-nav ${isSidebar ? "flex-column w-100" : "mx-auto"}`}>
            {navItems.map(item => {
              const Icon = item.icon;
              return (
                <div
                  key={item.id}
                  onClick={() => handleNavItemClick(item.id)}
                  className={`nav-link d-flex align-items-center ${isSidebar ? '' : 'mx-2 mx-md-4'} nav-item ${activeTab === item.id ? 'active' : ''}`}
                  style={{ cursor: 'pointer' }}
                >
                  <span className={`${isSidebar ? 'me-3' : 'me-1'} nav-icon`}><Icon /></span> {item.title}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default DesktopNavbar;
