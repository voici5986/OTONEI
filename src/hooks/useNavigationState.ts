import { useState, useEffect, type Dispatch, type SetStateAction } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { FaSearch, FaHeart, FaHistory } from 'react-icons/fa';
import type { IconType } from 'react-icons';
import type { AppUser } from '../types';

type NavigationTab = string;

interface NavigationItem {
  id: 'home' | 'favorites' | 'history';
  title: string;
  icon: IconType;
}

export interface UseNavigationStateOptions {
  activeTab: NavigationTab;
  onTabChange: (tab: NavigationTab) => void;
}

export interface UseNavigationStateResult {
  expanded: boolean;
  setExpanded: Dispatch<SetStateAction<boolean>>;
  scrolled: boolean;
  currentUser: AppUser | null;
  handleNavItemClick: (id: NavigationTab) => void;
  userInitial: string | null;
  navItems: readonly NavigationItem[];
}

const NAV_ITEMS: readonly NavigationItem[] = [
  { id: 'home', title: '搜索', icon: FaSearch },
  { id: 'favorites', title: '收藏', icon: FaHeart },
  { id: 'history', title: '历史记录', icon: FaHistory },
];

const useNavigationState = ({
  activeTab,
  onTabChange,
}: UseNavigationStateOptions): UseNavigationStateResult => {
  const [expanded, setExpanded] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { currentUser } = useAuth() as { currentUser?: AppUser | null };

  useEffect(() => {
    const handleScroll = () => {
      const isScrolled = (document.querySelector('.main-content')?.scrollTop ?? 0) > 20;
      setScrolled((previous) => (previous === isScrolled ? previous : isScrolled));
    };

    document.addEventListener('scroll', handleScroll, true);
    return () => document.removeEventListener('scroll', handleScroll, true);
  }, []);

  const handleNavItemClick = (id: NavigationTab) => {
    if (id === 'user' && activeTab === 'user') {
      onTabChange('home');
    } else {
      onTabChange(id);
    }
    setExpanded(false);
  };

  const userInitial = currentUser?.displayName
    ? currentUser.displayName[0].toUpperCase()
    : currentUser?.email
      ? currentUser.email[0].toUpperCase()
      : null;

  return {
    expanded,
    setExpanded,
    scrolled,
    currentUser: currentUser ?? null,
    handleNavItemClick,
    userInitial,
    navItems: NAV_ITEMS,
  };
};

export default useNavigationState;
