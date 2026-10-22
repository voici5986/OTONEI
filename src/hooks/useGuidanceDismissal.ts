import { useCallback, useSyncExternalStore } from 'react';
import {
  subscribeGuidance,
  getGuidanceDismissed,
  dismissGuidance,
} from '../services/guidanceStorage';

/** Subscribe React to the framework-free guidance store. */
export default function useGuidanceDismissal(key: string) {
  const dismissed = useSyncExternalStore(
    subscribeGuidance,
    () => getGuidanceDismissed(key),
    () => false
  );
  const dismiss = useCallback(() => dismissGuidance(key), [key]);
  return [dismissed, dismiss] as const;
}
