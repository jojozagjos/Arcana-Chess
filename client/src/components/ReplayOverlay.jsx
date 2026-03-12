import React, { useEffect, useState } from 'react';
import { ArcanaCard } from './ArcanaCard.jsx';

export function ReplayOverlay({
  styles,
  replayMeta,
  replayFrames,
  replayIndex,
  setReplayIndex,
  isReplayPlaying,
  setIsReplayPlaying,
  replayPanelTab,
  setReplayPanelTab,
  replayEvents,
  replayCardsByPlayer,
  replayArcanaEvents,
  exitReplayMode,
}) {
  const [showArcanaTimeline, setShowArcanaTimeline] = useState(true);
  const [eventsExpanded, setEventsExpanded] = useState(true);
  const [handsExpanded, setHandsExpanded] = useState(true);

  const replayMaxIndex = Math.max(replayFrames.length - 1, 0);
  const currentStep = replayFrames.length > 0 ? replayIndex + 1 : 0;

  useEffect(() => {
    if (replayPanelTab !== 'events' && replayPanelTab !== 'cards') {
      setReplayPanelTab('events');
    }
  }, [replayPanelTab, setReplayPanelTab]);

  return (
    <div style={styles.replayOverlay}>
      <div style={styles.replayTopRow}>
        <div>
          <div style={styles.replayTitle}>Replay Viewer</div>
          <div style={styles.replayMetaText}>
            {replayMeta?.gameId ? `Game ${replayMeta.gameId}` : 'Imported replay'}
          </div>
        </div>
        <button style={styles.replayExitButton} onClick={exitReplayMode}>Exit Replay</button>
      </div>

      <div style={styles.replayControlsRow}>
        <button
          style={styles.replayControlButton}
          onClick={() => {
            setIsReplayPlaying(false);
            setReplayIndex((prev) => Math.max(0, prev - 1));
          }}
        >
          Previous
        </button>
        <button
          style={styles.replayControlButton}
          onClick={() => {
            if (replayFrames.length <= 1) return;
            setIsReplayPlaying((prev) => !prev);
          }}
          disabled={replayFrames.length <= 1}
        >
          {isReplayPlaying ? 'Pause' : 'Play'}
        </button>
        <button
          style={styles.replayControlButton}
          onClick={() => {
            setIsReplayPlaying(false);
            setReplayIndex((prev) => Math.min(replayFrames.length - 1, prev + 1));
          }}
        >
          Next
        </button>
        <div style={styles.replayStepText}>
          {currentStep} / {replayFrames.length}
        </div>
      </div>

      <div style={styles.replayTabRow}>
        <button
          style={{ ...styles.replayTabButton, ...(replayPanelTab === 'events' ? styles.replayTabButtonActive : {}) }}
          onClick={() => setReplayPanelTab('events')}
        >
          Events
        </button>
        <button
          style={{ ...styles.replayTabButton, ...(replayPanelTab === 'cards' ? styles.replayTabButtonActive : {}) }}
          onClick={() => setReplayPanelTab('cards')}
        >
          Cards
        </button>
      </div>

      <input
        type="range"
        min={0}
        max={replayMaxIndex}
        value={Math.min(replayIndex, replayMaxIndex)}
        onChange={(e) => {
          setIsReplayPlaying(false);
          setReplayIndex(Number(e.target.value));
        }}
        style={styles.replaySlider}
      />

      {replayPanelTab === 'events' && (
        <>
        <div style={styles.replayEventBox}>
          {replayFrames[replayIndex]?.move
            ? `Move: ${replayFrames[replayIndex].move.from} -> ${replayFrames[replayIndex].move.to}`
            : (replayEvents[replayIndex]?.text || 'No move detail for this frame')}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
          <span style={{ fontSize: '0.72rem', color: '#88c0d0', opacity: 0.75 }}>All Events</span>
          <button style={styles.replayControlButton} onClick={() => setEventsExpanded((v) => !v)}>
            {eventsExpanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
        {eventsExpanded && (
        <div style={styles.replayListBox}>
          {(replayEvents || []).length === 0 && <div style={styles.replayEmptyText}>No replay events available.</div>}
          {(replayEvents || []).slice(-20).map((event, idx) => (
            <div key={`replay-event-${idx}-${event?.at || idx}`} style={styles.replayListItem}>
              <span style={styles.replayListType}>{event?.type || 'event'}</span>
              <span>{event?.text || 'No text'}</span>
            </div>
          ))}
        </div>
        )}
        </>
      )}

      {replayPanelTab === 'cards' && (
        <div style={styles.replayCardsBox}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: '0.72rem', color: '#88c0d0', opacity: 0.75 }}>Hands at this frame</span>
            <button style={styles.replayControlButton} onClick={() => setHandsExpanded((v) => !v)}>
              {handsExpanded ? 'Collapse' : 'Expand'}
            </button>
          </div>
          {handsExpanded && (
          <div style={styles.replayCardsGrid}>
            {replayCardsByPlayer.map((entry) => (
              <div key={`replay-cards-${entry.playerId}`} style={styles.replayCardsPanel}>
                <div style={styles.replayCardsHeader}>{entry.label} Hand ({entry.cards.length})</div>
                <div style={styles.replayCardsRow}>
                  {entry.cards.length === 0 && <div style={styles.replayEmptyText}>Empty.</div>}
                  {entry.cards.map((card, idx) => {
                    const isHidden = card?.hidden;
                    return (
                      <div key={`replay-card-${entry.playerId}-${card?.instanceId || card?.id || idx}`} style={{ position: 'relative', display: 'inline-block' }}>
                        <div style={isHidden ? { opacity: 0.5, position: 'relative' } : {}}>
                        <ArcanaCard
                            arcana={card}
                            size="small"
                            hoverInfo={card?.description || card?.name || 'Card'}
                            onClick={() => setShowArcanaTimeline(false)}
                          />
                          {isHidden && (
                            <div style={{
                              position: 'absolute',
                              top: '50%',
                              left: '50%',
                              transform: 'translate(-50%, -50%)',
                              fontSize: '1.2rem',
                              fontWeight: 'bold',
                              color: '#d8c59e',
                              pointerEvents: 'none',
                              textShadow: '0 0 4px rgba(0,0,0,0.8)',
                            }}>
                              ?
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          )}

          {showArcanaTimeline ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={styles.replayCardsHeader}>Arcana Timeline</div>
                <button style={styles.replayControlButton} onClick={() => setShowArcanaTimeline(false)}>Hide</button>
              </div>
              <div style={styles.replayListBox}>
                {replayArcanaEvents.length === 0 && <div style={styles.replayEmptyText}>No arcana draw/use entries.</div>}
                {replayArcanaEvents.slice(-25).map((event, idx) => (
                  <div key={`replay-arcana-event-${idx}-${event?.at || idx}`} style={styles.replayListItem}>
                    <span style={styles.replayListType}>{event?.type === 'arcana_drawn' ? 'draw' : 'use'}</span>
                    <span>{event?.text || 'Arcana event'}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button style={styles.replayControlButton} onClick={() => setShowArcanaTimeline(true)}>Show Arcana Timeline</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
