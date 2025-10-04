import React from 'react';
import './ModeToggle.css';

export interface LayerState {
  climate: boolean;
  bloom: boolean;
}

interface ModeToggleProps {
  layers: LayerState;
  onLayerToggle: (layer: 'climate' | 'bloom') => void;
}

const ModeToggle: React.FC<ModeToggleProps> = ({ layers, onLayerToggle }) => {
  return (
    <div className="mode-toggle-container">
      <button
        className={`mode-button toggle ${layers.climate ? 'active' : ''}`}
        onClick={() => onLayerToggle('climate')}
      >
        Climate Risk {layers.climate && '✓'}
      </button>
      <button
        className={`mode-button toggle ${layers.bloom ? 'active' : ''}`}
        onClick={() => onLayerToggle('bloom')}
      >
        Bloom Status {layers.bloom && '✓'}
      </button>
    </div>
  );
};

export default ModeToggle;
