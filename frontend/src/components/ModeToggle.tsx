import React from 'react';
import './ModeToggle.css';

export interface LayerState {
  climate: boolean;
  bloom: boolean;
  herbarium: boolean;
}

interface ModeToggleProps {
  layers: LayerState;
  onLayerToggle: (layer: 'climate' | 'bloom' | 'herbarium') => void;
}

const ModeToggle: React.FC<ModeToggleProps> = ({ layers, onLayerToggle }) => {
  return (
    <div className="mode-toggle-container">
      <button
        className={`mode-button toggle ${layers.bloom ? 'active' : ''}`}
        onClick={() => onLayerToggle('bloom')}
      >
        Bloom Status
      </button>
      <button
        className={`mode-button toggle ${layers.climate ? 'active' : ''}`}
        onClick={() => onLayerToggle('climate')}
      >
        Climate Risk
      </button>
      <button
        className={`mode-button toggle ${layers.herbarium ? 'active' : ''}`}
        onClick={() => onLayerToggle('herbarium')}
      >
        Plant Specimens
      </button>
    </div>
  );
};

export default ModeToggle;
