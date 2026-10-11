import { useCallback, useSyncExternalStore } from 'react';
import { saveNetworkStatus } from '../services/storage';
import type { ConnectionType, NetworkStatus } from '../types';
export interface UseNetworkStatusOptions {
  showToasts?: boolean;
  dispatchEvents?: boolean;
}
export interface UseNetworkStatusResult {
  isOnline: boolean;
  lastChecked: number;
  connectionType: ConnectionType;
  checkNetworkStatus: () => Promise<NetworkStatus>;
  dispatchNetworkStatusChange: (online: boolean, typeOverride?: ConnectionType) => void;
}
interface NavigatorConnection extends EventTarget {
  effectiveType?: string;
  type?: string;
  saveData?: boolean;
}
const connection = () => (navigator as Navigator & { connection?: NavigatorConnection }).connection;
const detectType = (): ConnectionType => {
  if (!navigator.onLine) return 'offline';
  const value = connection();
  const type = value?.effectiveType || value?.type;
  if (value?.saveData) return 'saveData';
  if (type === '4g' || type === 'wifi') return 'fast';
  if (type === '3g') return 'medium';
  if (type === '2g' || type === 'cellular') return 'slow';
  return 'unknown';
};
let snapshot: NetworkStatus = {
  online: navigator.onLine,
  connectionType: detectType(),
  lastChecked: Date.now(),
};
const listeners = new Set<() => void>();
const dispatch = (online: boolean, type = snapshot.connectionType) =>
  window.dispatchEvent(
    new CustomEvent('networkStatusChange', {
      detail: { online, connectionType: type, lastChecked: snapshot.lastChecked },
    })
  );
const refresh = () => {
  const online = navigator.onLine;
  const type = detectType();
  if (online === snapshot.online && type === snapshot.connectionType) return snapshot;
  snapshot = { online, connectionType: type, lastChecked: Date.now() };
  void saveNetworkStatus(snapshot);
  listeners.forEach((listener) => listener());
  dispatch(online, type);
  return snapshot;
};
let subscribedConnection: NavigatorConnection | undefined;
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  if (listeners.size === 1) {
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    subscribedConnection = connection();
    subscribedConnection?.addEventListener('change', refresh);
    refresh();
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
      subscribedConnection?.removeEventListener('change', refresh);
    }
  };
};
const getSnapshot = () => snapshot;
const checkNetworkStatus = async () => refresh();
const useNetworkStatus = (options: UseNetworkStatusOptions = {}): UseNetworkStatusResult => {
  const status = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const dispatchEvents = options.dispatchEvents !== false;
  const dispatchNetworkStatusChange = useCallback(
    (online: boolean, type?: ConnectionType) => {
      if (dispatchEvents) dispatch(online, type);
    },
    [dispatchEvents]
  );
  return {
    isOnline: status.online,
    lastChecked: status.lastChecked,
    connectionType: status.connectionType as ConnectionType,
    checkNetworkStatus,
    dispatchNetworkStatusChange,
  };
};
export default useNetworkStatus;
