import { useState, useEffect, useCallback, useRef } from 'react';
import { isFirebaseAvailable, checkFirebaseAvailability } from '../services/firebase';
import useNetworkStatus from './useNetworkStatus';
import { toast } from 'react-toastify';
export interface UseFirebaseStatusOptions {
  showToasts?: boolean;
  manualCheck?: boolean;
}
export interface UseFirebaseStatusResult {
  isAvailable: boolean;
  isChecking: boolean;
  lastChecked: number;
  checkAvailability: (force?: boolean) => Promise<boolean>;
}
const useFirebaseStatus = (options: UseFirebaseStatusOptions = {}): UseFirebaseStatusResult => {
  const { showToasts = false, manualCheck = false } = options;
  const { isOnline } = useNetworkStatus();
  const [available, setAvailable] = useState(() => Boolean(isFirebaseAvailable));
  const [isChecking, setIsChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState(0);
  const pending = useRef<Promise<boolean> | null>(null);
  const generation = useRef(0);
  const checkAvailability = useCallback(
    (_force = false): Promise<boolean> => {
      if (pending.current) return pending.current;
      const requestGeneration = generation.current;
      setIsChecking(true);
      const request = Promise.resolve()
        .then(() => (navigator.onLine ? checkFirebaseAvailability() : false))
        .catch(() => false)
        .then((value) => {
          if (requestGeneration === generation.current) {
            setAvailable(Boolean(value));
            setLastChecked(Date.now());
            setIsChecking(false);
            if (!value && showToasts) toast.error('数据库连接不可用，部分功能可能受限');
          }
          return Boolean(value);
        })
        .finally(() => {
          if (pending.current === request) pending.current = null;
        });
      pending.current = request;
      return request;
    },
    [showToasts]
  );
  useEffect(() => {
    // Schedule outside the effect to avoid synchronous state updates and cancel StrictMode's first setup.
    const timer = setTimeout(() => {
      if (!manualCheck || !isOnline) void checkAvailability();
    }, 0);
    return () => {
      clearTimeout(timer);
      generation.current += 1;
      pending.current = null;
    };
  }, [manualCheck, isOnline, checkAvailability]);
  return { isAvailable: isOnline && available, isChecking, lastChecked, checkAvailability };
};
export default useFirebaseStatus;
