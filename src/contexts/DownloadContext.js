import React, { createContext, useContext, useState, useCallback } from 'react';
import { downloadTrack } from '../services/downloadService';
import { 
  handleError, 
  ErrorTypes, 
  ErrorSeverity, 
  checkNetworkStatus, 
  checkDownloadStatus 
} from '../utils/errorHandler';
import useNetworkStatus from '../hooks/useNetworkStatus';

const DownloadContext = createContext();

export const useDownload = () => {
  const context = useContext(DownloadContext);
  if (!context) {
    throw new Error('useDownload must be used within a DownloadProvider');
  }
  return context;
};

export const DownloadProvider = ({ children }) => {
  const [downloading, setDownloading] = useState(false);
  const [currentDownloadingTrack, setCurrentDownloadingTrack] = useState(null);
  
  const { isOnline } = useNetworkStatus({
    showToasts: false, // Don't show toast here as App might handle it
    dispatchEvents: false
  });

  const handleDownload = useCallback(async (track, quality = 320) => {
    // Check if already downloading
    if (!checkDownloadStatus(downloading)) {
      return;
    }

    // Check network
    if (!checkNetworkStatus(isOnline, '下载音乐')) {
      return;
    }

    try {
      setDownloading(true);
      setCurrentDownloadingTrack(track);

      await downloadTrack(track, quality);

    } catch (error) {
      handleError(
        error,
        ErrorTypes.DOWNLOAD,
        ErrorSeverity.ERROR,
        '下载失败，请重试'
      );
    } finally {
      setDownloading(false);
      setCurrentDownloadingTrack(null);
    }
  }, [downloading, isOnline]);

  const isTrackDownloading = useCallback((trackId) => {
    return downloading && currentDownloadingTrack?.id === trackId;
  }, [downloading, currentDownloadingTrack]);

  const value = {
    downloading,
    currentDownloadingTrack,
    handleDownload,
    isTrackDownloading
  };

  return (
    <DownloadContext.Provider value={value}>
      {children}
    </DownloadContext.Provider>
  );
};

export default DownloadProvider;
