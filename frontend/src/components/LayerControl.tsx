import React from 'react';
import './LayerControl.css';

interface LayerControlProps {
  onNDVIToggle: (show: boolean) => void;
  ndviVisible: boolean;
}

const LayerControl: React.FC<LayerControlProps> = ({ onNDVIToggle, ndviVisible }) => {
  return (
    <div className="layer-control">
      <h3>🛰️ NASA Data Layers</h3>

      <div className="layer-item">
        <label>
          <input
            type="checkbox"
            checked={ndviVisible}
            onChange={(e) => onNDVIToggle(e.target.checked)}
          />
          <span className="layer-name">MODIS NDVI</span>
        </label>
        <div className="layer-description">
          Vegetation health indicator (8-day composite)
        </div>
      </div>

      <div className="ndvi-legend">
        <h4>NDVI Scale</h4>
        <div className="legend-bar">
          <div className="legend-label">
            <span>-1.0</span>
            <span>Water</span>
          </div>
          <div className="legend-gradient"></div>
          <div className="legend-label">
            <span>+1.0</span>
            <span>Dense Vegetation</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LayerControl;
