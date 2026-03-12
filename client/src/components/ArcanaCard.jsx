import React, { useState, useRef } from 'react';
import ReactDOM from 'react-dom';

// ArcanaCard component: displays card background, icon, and name
export function ArcanaCard({ arcana, size = 'medium', onClick, isSelected, isUsed, hoverInfo, deferLoad = false, style = {}, disableHover = false }) {
  const [hovered, setHovered] = useState(false);
  const [tooltipPos, setTooltipPos] = useState(null);
  const [bgLoaded, setBgLoaded] = useState(false);
  const [iconLoaded, setIconLoaded] = useState(false);
  const cardRef = useRef(null);
  const touchTimerRef = useRef(null);
  const arcanaId = typeof arcana?.id === 'string'
    ? arcana.id
    : (typeof arcana === 'string' && arcana.trim() ? arcana.trim() : 'unknown_arcana');
  const arcanaName = typeof arcana?.name === 'string' && arcana.name.trim()
    ? arcana.name
    : arcanaId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const rarity = typeof arcana?.rarity === 'string' ? arcana.rarity : 'common';
  const rarityCapitalized = rarity.charAt(0).toUpperCase() + rarity.slice(1);
  const backgroundPath = `/cards/backgrounds/${rarityCapitalized}.png`;
  const iconId = arcanaId.replace(/_/g, '-');
  const iconPath = `/cards/icons/${iconId}.png`;

  const sizes = {
    small: { width: 80, height: 120, iconSize: 50, fontSize: '0.6rem' },
    medium: { width: 140, height: 210, iconSize: 90, fontSize: '0.75rem' },
    large: { width: 200, height: 300, iconSize: 130, fontSize: '0.9rem' },
  };

  const dims = sizes[size] || sizes.medium;
  const TOOLTIP_W = Math.max(dims.width + 80, 260);
  // Fixed description height keeps all tooltips the same visual height
  const DESC_H = 58;
  // Estimated full tooltip height for above/below positioning
  const TOOLTIP_H = 130;

  const cursor = onClick ? 'pointer' : 'default';

  const cardStyle = {
    width: dims.width,
    height: dims.height,
    position: 'relative',
    borderRadius: 8,
    overflow: 'hidden',
    border: 'none',
    opacity: isUsed ? 0.55 : 1,
    transition: 'transform 0.18s ease, box-shadow 0.18s ease',
    transformOrigin: 'center center',
    boxSizing: 'border-box',
    cursor,
    ...style,
  };

  const showTooltip = !disableHover && hovered && tooltipPos && (hoverInfo || arcanaName);

  const calcPos = (rect) => {
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const cardCenterX = rect.left + rect.width / 2;
    let left = cardCenterX - TOOLTIP_W / 2;
    left = Math.max(8, Math.min(left, vw - TOOLTIP_W - 8));
    const arrowOffset = cardCenterX - (left + TOOLTIP_W / 2);
    const ARROW_H = 8;
    let top = rect.top - TOOLTIP_H - ARROW_H - 4;
    const flipped = top < 8;
    if (flipped) top = rect.bottom + ARROW_H + 4;
    return { left, top, arrowOffset, flipped };
  };

  const handleMouseEnter = (e) => {
    if (onClick) e.currentTarget.style.transform = 'scale(1.05)';
    setHovered(true);
    try { setTooltipPos(calcPos(cardRef.current.getBoundingClientRect())); }
    catch { setTooltipPos({ left: 0, top: 0, arrowOffset: 0, flipped: false }); }
  };

  const handleMouseLeave = (e) => {
    if (onClick) e.currentTarget.style.transform = 'scale(1)';
    setHovered(false);
    setTooltipPos(null);
  };
  const handleTouchStart = (e) => {
    if (disableHover) return;
    if (hovered) {
      clearTimeout(touchTimerRef.current);
      setHovered(false);
      setTooltipPos(null);
      return;
    }
    e.preventDefault();
    try { setTooltipPos(calcPos(cardRef.current.getBoundingClientRect())); }
    catch { setTooltipPos({ left: 0, top: 0, arrowOffset: 0, flipped: false }); }
    setHovered(true);
    clearTimeout(touchTimerRef.current);
    touchTimerRef.current = setTimeout(() => {
      setHovered(false);
      setTooltipPos(null);
    }, 3000);
  };

  const tooltipEl = showTooltip ? (
        <div
          style={{
            position: 'fixed',
            left: tooltipPos.left,
            top: tooltipPos.top,
            width: TOOLTIP_W,
            padding: '8px 10px 10px',
            background: 'rgba(11, 16, 32, 0.97)',
            border: '1px solid rgba(136,192,208,0.45)',
            borderRadius: 8,
            color: '#eceff4',
            fontSize: '0.78rem',
            boxShadow: '0 4px 16px rgba(0,0,0,0.65)',
            zIndex: 99999,
            pointerEvents: 'none',
            textAlign: 'center',
            lineHeight: 1.4,
            boxSizing: 'border-box',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 5 }}>{arcanaName}</div>
          <div style={{
            height: DESC_H,
            overflowY: 'auto',
            overflowX: 'hidden',
            wordBreak: 'break-word',
            overflowWrap: 'break-word',
            whiteSpace: 'pre-line',
            opacity: 0.9,
            fontSize: '0.74rem',
            marginBottom: 4,
            textAlign: 'left',
            padding: '0 2px',
            scrollbarWidth: 'thin',
          }}>
            {hoverInfo || ''}
          </div>
          <div style={{ fontSize: '0.68rem', opacity: 0.65, color: rarity === 'uncommon' ? '#1eff00' : rarity === 'rare' ? '#0070dd' : rarity === 'epic' ? '#a335ee' : rarity === 'legendary' ? '#ff8000' : '#a0a0a0' }}>
            {rarityCapitalized}
          </div>
          {/* Speech-bubble arrow */}
          <div style={{
            position: 'absolute',
            [tooltipPos.flipped ? 'top' : 'bottom']: -8,
            left: '50%',
            transform: `translateX(calc(-50% + ${tooltipPos.arrowOffset}px))`,
            width: 0,
            height: 0,
            borderLeft: '8px solid transparent',
            borderRight: '8px solid transparent',
            ...(tooltipPos.flipped
              ? { borderBottom: '8px solid rgba(136,192,208,0.45)' }
              : { borderTop: '8px solid rgba(136,192,208,0.45)' }),
          }} />
        </div>
  ) : null;

  return (
    <>
      {showTooltip && ReactDOM.createPortal(tooltipEl, document.body)}
      <div
        ref={cardRef}
        style={cardStyle}
        onClick={onClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
      >
        {/* Background */}
        <img
          src={backgroundPath}
          alt=""
          onLoad={() => setBgLoaded(true)}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            zIndex: 0,
            opacity: deferLoad ? (bgLoaded && iconLoaded ? 1 : 0) : 1,
            transition: 'opacity 180ms ease',
          }}
        />

        {/* Card Name (top third) */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '33%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '8px',
            zIndex: 2,
          }}
        >
          <div
            style={{
              fontFamily: 'system-ui, sans-serif',
              fontSize: dims.fontSize,
              fontWeight: 700,
              color: '#eceff4',
              textAlign: 'center',
              textShadow: '0 2px 6px rgba(0,0,0,0.8)',
              lineHeight: 1.2,
              wordWrap: 'break-word',
              maxWidth: '100%',
            }}
          >
            {arcanaName}
          </div>
        </div>

        {/* Icon (lower half) */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '67%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1,
          }}
        >
          <img
            src={iconPath}
            alt={arcanaName}
            onLoad={() => setIconLoaded(true)}
            style={{
              width: dims.iconSize,
              height: dims.iconSize,
              objectFit: 'contain',
              filter: isUsed ? 'grayscale(0.6)' : 'none',
              opacity: deferLoad ? (bgLoaded && iconLoaded ? 1 : 0) : 1,
              transition: 'opacity 200ms ease',
            }}
          />
        </div>

        {/* Badge overlay */}
        {isUsed && (
          <div
            style={{
              position: 'absolute',
              top: 6,
              right: 6,
              fontSize: '0.5rem',
              padding: '2px 6px',
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.4)',
              background: 'rgba(0,0,0,0.7)',
              textTransform: 'uppercase',
              zIndex: 3,
              color: '#d8dee9',
            }}
          >
            USED
          </div>
        )}

        {/* Placeholder overlay while loading when deferLoad is enabled */}
        {deferLoad && !(bgLoaded && iconLoaded) && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(180deg, rgba(0,0,0,0.35), rgba(0,0,0,0.45))',
            zIndex: 4,
            borderRadius: 8,
          }}>
            <div style={{ width: 28, height: 28, borderRadius: 14, border: '3px solid rgba(143,148,251,0.85)', boxSizing: 'border-box', animation: 'spin 1s linear infinite' }} />
            <style>{`@keyframes spin {from {transform: rotate(0deg);} to {transform: rotate(360deg);}}`}</style>
          </div>
        )}
      </div>
    </>
  );
}
