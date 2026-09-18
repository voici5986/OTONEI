import type { ComponentType } from 'react';
import { usePlayer } from '../contexts/PlayerContext';
import { useDownload } from '../contexts/DownloadContext';
import MusicCardActions from './MusicCardActions';
import logger from '../utils/logger.js';
import { getTrackArtist } from '../utils/trackFormatter';
import type { Track } from '../types';
import { getTrackKey } from '../utils/trackIdentity';

interface SearchPlayerContext {
  handlePlay: (
    track: Track,
    index?: number,
    playlist?: Track[] | null,
    quality?: number
  ) => void | Promise<void>;
  currentTrack: Track | null;
}

interface MusicCardActionsProps {
  track: Track;
  isDownloading: boolean;
  onDownload: (track: Track) => void;
}

const TypedMusicCardActions = MusicCardActions as ComponentType<MusicCardActionsProps>;

export interface SearchResultItemProps {
  track: Track;
  searchResults: Track[];
  quality?: number;
}

const SearchResultItem = ({ track, searchResults, quality }: SearchResultItemProps) => {
  const { handlePlay, currentTrack } = usePlayer() as SearchPlayerContext;
  const { isTrackDownloading, handleDownload } = useDownload();
  const activeQuality = quality || 999;

  const handleTrackPlay = (selectedTrack: Track) => {
    logger.log('从搜索结果播放曲目:', selectedTrack.id, selectedTrack.name, '音质:', activeQuality);
    const trackIndex = searchResults.findIndex(
      (item) => getTrackKey(item) === getTrackKey(selectedTrack)
    );
    void handlePlay(selectedTrack, trackIndex >= 0 ? trackIndex : -1, searchResults, activeQuality);
  };

  const onDownloadClick = (selectedTrack: Track) => {
    void handleDownload(selectedTrack, activeQuality);
  };

  return (
    <div
      className={`music-card ${currentTrack && getTrackKey(currentTrack) === getTrackKey(track) ? 'is-active' : ''}`}
      onClick={() => handleTrackPlay(track)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleTrackPlay(track);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`播放 ${track.name} - ${getTrackArtist(track) || '未知歌手'}`}
      aria-current={
        currentTrack && getTrackKey(currentTrack) === getTrackKey(track) ? 'true' : undefined
      }
    >
      <div className="music-card-row">
        <div className="music-card-info">
          <h6>{track.name}</h6>
          <small>{getTrackArtist(track) || '未知歌手'}</small>
        </div>
        <TypedMusicCardActions
          track={track}
          isDownloading={isTrackDownloading(track)}
          onDownload={onDownloadClick}
        />
      </div>
    </div>
  );
};

export default SearchResultItem;
