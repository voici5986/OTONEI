import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { FaSearch, FaHeart, FaHistory } from 'react-icons/fa';

const NAV_ITEMS = [
  { id: 'home', title: '搜索', icon: FaSearch },
  { id: 'favorites', title: '收藏', icon: FaHeart },
  { id: 'history', title: '历史记录', icon: FaHistory },
];

const useNavigationState = ({ activeTab, onTabChange }) => {
  const [expanded, setExpanded] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { currentUser } = useAuth();

  useEffect(() => {
    const handleScroll = () => {
      const isScrolled = window.scrollY > 20;
      if (isScrolled !== scrolled) {
        setScrolled(isScrolled);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [scrolled]);

  const handleNavItemClick = (id) => {
    // 如果当前已经在用户页面，且点击的还是用户图标，则跳转到搜索页
    if (id === 'user' && activeTab === 'user') {
      onTabChange('home');
    } else {
      onTabChange(id);
    }
    setExpanded(false); // 自动收起菜单
  };

  const userInitial = currentUser && currentUser.displayName ?
    currentUser.displayName[0].toUpperCase() :
    (currentUser && currentUser.email ? currentUser.email[0].toUpperCase() : null);

  return {
    expanded,
    setExpanded,
    scrolled,
    currentUser,
    handleNavItemClick,
    userInitial,
    navItems: NAV_ITEMS
  };
};

export default useNavigationState;
