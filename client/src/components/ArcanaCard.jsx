import React, { useState, useRef } from 'react';

// ArcanaCard component: displays card background, icon, and name
export function ArcanaCard({ arcana, size = 'medium', onClick, isSelected, isUsed, hoverInfo }) {
  const [hovered, setHovered] = useState(false);
  const [tooltipStyle, setTooltipStyle] = useState(null);
  const cardRef = useRef(null);
  const TOOLTIP_MAX_W = 280;
  const rarity = arcana.rarity || 'common';
  const rarityCapitalized = rarity.charAt(0).toUpperCase() + rarity.slice(1);
  const backgroundPath = `/cards/backgrounds/${rarityCapitalized}.png`;
  const iconId = arcana.id.replace(/_/g, '-');
  const iconPath = `/cards/icons/${iconId}.png`;

  const sizes = {
    small: { width: 80, height: 120, iconSize: 50, fontSize: '0.6rem' },
    medium: { width: 140, height: 210, iconSize: 90, fontSize: '0.75rem' },
    large: { width: 200, height: 300, iconSize: 130, fontSize: '0.9rem' },
  };

  const dims = sizes[size] || sizes.medium;

  return (
    <div
      style={{
        width: dims.width,
        height: dims.height,
        position: 'relative',
        borderRadius: 8,
        overflow: 'hidden',
          cursor: onClick ? 'pointer' : 'default',
          border: 'none',
          opacity: isUsed ? 0.55 : 1,
          transition: 'transform 0.18s ease, box-shadow 0.18s ease',
          // boxShadow: isSelected ? '0 0 18px rgba(47,111,237,0.65)' : '0 4px 12px rgba(0,0,0,0.4)',
          transformOrigin: 'center center',
      }}
      onClick={onClick}
        ref={cardRef}
        onMouseEnter={(e) => {
          if (onClick) e.currentTarget.style.transform = 'scale(1.05)';
          setHovered(true);
          // compute tooltip position clamped to viewport
          try {
            const rect = cardRef.current.getBoundingClientRect();
            const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
            const tooltipW = Math.min(TOOLTIP_MAX_W, vw - 32);
            let left = rect.left + rect.width / 2 - tooltipW / 2;
            left = Math.max(8, Math.min(left, vw - tooltipW - 8));
            // place tooltip a bit above the card
            const estimatedH = 92; // rough estimate to avoid overlap
            let top = rect.top - estimatedH - 8;
            if (top < 8) {
              // if not enough room above, place below the card
              top = rect.bottom + 8;
            }
            setTooltipStyle({ left, top, width: tooltipW });
          } catch (err) {
            setTooltipStyle(null);
          }
        }}
        onMouseLeave={(e) => {
          if (onClick) e.currentTarget.style.transform = 'scale(1)';
          setHovered(false);
          setTooltipStyle(null);
        }}
    >
      {/* Background */}
      <img
        src={backgroundPath}
        alt=""
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          zIndex: 0,
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
          {arcana.name}
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
          alt={arcana.name}
          style={{
            width: dims.iconSize,
            height: dims.iconSize,
            objectFit: 'contain',
            filter: isUsed ? 'grayscale(0.6)' : 'none',
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
      {isSelected && !isUsed && (
        <div
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            fontSize: '0.5rem',
            padding: '2px 6px',
            borderRadius: 999,
            border: '1px solid #2f6fed',
            background: 'rgba(47,111,237,0.8)',
            textTransform: 'uppercase',
            zIndex: 3,
            color: '#fff',
          }}
        >
          READY
        </div>
      )}

      {/* Hover tooltip for quick description (used in-game) */}
      {hoverInfo && hovered && (
        <div
          style={{
            position: 'fixed',
            left: tooltipStyle ? tooltipStyle.left : '50%',
            top: tooltipStyle ? tooltipStyle.top : undefined,
            bottom: tooltipStyle ? undefined : 'auto',
            width: tooltipStyle ? tooltipStyle.width : TOOLTIP_MAX_W,
            padding: 8,
            background: 'rgba(11, 16, 32, 0.98)',
            border: '1px solid rgba(136,192,208,0.4)',
            borderRadius: 8,
            color: '#eceff4',
            fontSize: '0.8rem',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            zIndex: 9999,
            pointerEvents: 'none',
            textAlign: 'center',
            lineHeight: 1.2,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>{arcana.name}</div>
          <div style={{ opacity: 0.95 }}>{hoverInfo}</div>
        </div>
      )}
    </div>
  );
}
