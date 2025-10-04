import React, { useState } from 'react';
import './LayerControl.css';

export interface Layer {
  id: string;
  name: string;
  type: 'bloom' | 'climate' | 'ndvi';
  visible: boolean;
  opacity: number;
  min?: number;
  max?: number;
  palette?: string[];
  description?: string;
  metadata?: {
    source?: string;
    timeRange?: string;
    resolution?: string;
    units?: string;
  };
}

export interface LayerControlProps {
  layers: Layer[];
  onLayerChange: (layers: Layer[]) => void;
  selectedPosition?: { lat: number; lon: number };
  currentTime?: { year: number; month: number };
}

const LayerControl: React.FC<LayerControlProps> = ({
  layers,
  onLayerChange,
  selectedPosition,
  currentTime
}) => {
  const [expandedLayer, setExpandedLayer] = useState<string | null>(null);
  const [showLegend, setShowLegend] = useState(true);

  const handleVisibilityToggle = (layerId: string) => {
    const updatedLayers = layers.map(layer =>
      layer.id === layerId ? { ...layer, visible: !layer.visible } : layer
    );
    onLayerChange(updatedLayers);
  };

  const handleOpacityChange = (layerId: string, opacity: number) => {
    const updatedLayers = layers.map(layer =>
      layer.id === layerId ? { ...layer, opacity } : layer
    );
    onLayerChange(updatedLayers);
  };

  const handlePaletteChange = (layerId: string, palette: string[]) => {
    const updatedLayers = layers.map(layer =>
      layer.id === layerId ? { ...layer, palette } : layer
    );
    onLayerChange(updatedLayers);
  };

  const toggleLayerExpansion = (layerId: string) => {
    setExpandedLayer(expandedLayer === layerId ? null : layerId);
  };

  const getBloomLegendItems = () => [
    { label: 'Pre-Bloom', color: 'linear-gradient(90deg, #F5B7B1, #F8BBD0)' },
    { label: 'Early Bloom', color: 'linear-gradient(90deg, #F8BBD0, #FCE4EC)' },
    { label: 'Peak Bloom', color: 'linear-gradient(90deg, #FF1493, #FF69B4)' },
    { label: 'Late Bloom', color: 'linear-gradient(90deg, #C71585, #8B008B)' },
    { label: 'Post-Bloom', color: 'linear-gradient(90deg, #800020, #4B0033)' }
  ];

  const getClimateLegendItems = () => [
    { label: 'Very Low Risk', color: '#1a9641' },
    { label: 'Low Risk', color: '#a6d96a' },
    { label: 'Moderate Risk', color: '#ffffbf' },
    { label: 'High Risk', color: '#fdae61' },
    { label: 'Very High Risk', color: '#d7191c' }
  ];

  const getNDVILegendItems = () => [
    { label: 'Water/Snow', color: '#2166AC' },
    { label: 'Bare Soil', color: '#DFC27D' },
    { label: 'Low Vegetation', color: '#F6E8C3' },
    { label: 'Moderate Vegetation', color: '#80CDC1' },
    { label: 'Dense Vegetation', color: '#018571' }
  ];

  const getLegendItems = (layerType: string) => {
    switch (layerType) {
      case 'bloom':
        return getBloomLegendItems();
      case 'climate':
        return getClimateLegendItems();
      case 'ndvi':
        return getNDVILegendItems();
      default:
        return [];
    }
  };

  const getDefaultPalettes = (layerType: string) => {
    switch (layerType) {
      case 'bloom':
        return [
          { name: 'Pink Bloom', colors: ['#FCE4EC', '#F8BBD0', '#FF69B4', '#FF1493', '#C71585', '#8B008B', '#800020'] },
          { name: 'Cherry Blossom', colors: ['#FFE0EC', '#FFB3D9', '#FF66CC', '#FF1493', '#DC143C', '#B22222', '#8B0000'] },
          { name: 'Rose Garden', colors: ['#FFF0F5', '#FFE4E1', '#FFC0CB', '#FFB6C1', '#FF69B4', '#FF1493', '#C71585'] }
        ];
      case 'climate':
        return [
          { name: 'RdYlGn', colors: ['#d7191c', '#fdae61', '#ffffbf', '#a6d96a', '#1a9641'] },
          { name: 'Temperature', colors: ['#313695', '#4575b4', '#74add1', '#abd9e9', '#fee090', '#fdae61', '#f46d43', '#a50026'] },
          { name: 'Precipitation', colors: ['#8c510a', '#bf812d', '#dfc27d', '#f6e8c3', '#c7eae5', '#80cdc1', '#35978f', '#01665e'] }
        ];
      case 'ndvi':
        return [
          { name: 'NDVI Classic', colors: ['#a50026', '#d73027', '#fdae61', '#fee08b', '#d9ef8b', '#a6d96a', '#66bd63', '#006837'] },
          { name: 'Earth', colors: ['#8c510a', '#bf812d', '#dfc27d', '#f6e8c3', '#c7eae5', '#80cdc1', '#35978f', '#01665e'] },
          { name: 'Ocean', colors: ['#fff7fb', '#ece7f2', '#d0d1e6', '#a6bddb', '#74a9cf', '#3690c0', '#0570b0', '#045a8d', '#023858'] }
        ];
      default:
        return [];
    }
  };

  const formatTime = () => {
    if (!currentTime) return '';
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${monthNames[currentTime.month - 1]} ${currentTime.year}`;
  };

  return (
    <div className="layer-control-container">
      <div className="layer-control-header">
        <div className="header-title">
          <svg className="layers-icon" viewBox="0 0 24 24" width="20" height="20">
            <path fill="currentColor" d="M12 16L19.36 10.27L21 9L12 2L3 9L4.63 10.27M12 18.54L4.62 12.81L3 14.07L12 21.07L21 14.07L19.37 12.8L12 18.54Z"/>
          </svg>
          <span>Layers</span>
        </div>
        <button
          className="legend-toggle"
          onClick={() => setShowLegend(!showLegend)}
          title={showLegend ? 'Hide Legend' : 'Show Legend'}
        >
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path fill="currentColor" d={showLegend ? 'M15.41 16.58L10.83 12L15.41 7.41L14 6L8 12L14 18L15.41 16.58Z' : 'M8.59 16.58L13.17 12L8.59 7.41L10 6L16 12L10 18L8.59 16.58Z'}/>
          </svg>
        </button>
      </div>

      {currentTime && (
        <div className="time-display">
          <svg className="time-icon" viewBox="0 0 24 24" width="16" height="16">
            <path fill="currentColor" d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M16.2,16.2L11,13V7H12.5V12.2L17,14.9L16.2,16.2Z"/>
          </svg>
          <span>{formatTime()}</span>
        </div>
      )}

      <div className="layer-list">
        {layers.map(layer => (
          <div key={layer.id} className={`layer-item ${layer.visible ? 'active' : ''}`}>
            <div className="layer-header">
              <label className="layer-checkbox">
                <input
                  type="checkbox"
                  checked={layer.visible}
                  onChange={() => handleVisibilityToggle(layer.id)}
                />
                <span className="checkbox-custom"></span>
                <span className="layer-name">{layer.name}</span>
              </label>
              <button
                className={`layer-expand ${expandedLayer === layer.id ? 'expanded' : ''}`}
                onClick={() => toggleLayerExpansion(layer.id)}
              >
                <svg viewBox="0 0 24 24" width="16" height="16">
                  <path fill="currentColor" d="M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z"/>
                </svg>
              </button>
            </div>

            {expandedLayer === layer.id && (
              <div className="layer-details">
                <div className="opacity-control">
                  <div className="control-label">
                    <span>Opacity</span>
                    <span className="opacity-value">{Math.round(layer.opacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={layer.opacity * 100}
                    onChange={(e) => handleOpacityChange(layer.id, Number(e.target.value) / 100)}
                    className="opacity-slider"
                  />
                </div>

                <div className="palette-control">
                  <div className="control-label">Color Palette</div>
                  <div className="palette-options">
                    {getDefaultPalettes(layer.type).map(palette => (
                      <button
                        key={palette.name}
                        className="palette-option"
                        onClick={() => handlePaletteChange(layer.id, palette.colors)}
                        title={palette.name}
                      >
                        <div className="palette-preview">
                          {palette.colors.slice(0, 5).map((color, index) => (
                            <div
                              key={index}
                              className="palette-color"
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                        <span className="palette-name">{palette.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {layer.metadata && (
                  <div className="layer-metadata">
                    <div className="metadata-header">
                      <svg viewBox="0 0 24 24" width="16" height="16">
                        <path fill="currentColor" d="M11 9H13V7H11M12 20C7.59 20 4 16.41 4 12S7.59 4 12 4 20 7.59 20 12 16.41 20 12 20M12 2C6.48 2 2 6.48 2 12S6.48 22 12 22 22 17.52 22 12 17.52 2 12 2M11 17H13V11H11V17Z"/>
                      </svg>
                      <span>Information</span>
                    </div>
                    {layer.metadata.source && (
                      <div className="metadata-item">
                        <span className="metadata-label">Source:</span>
                        <span className="metadata-value">{layer.metadata.source}</span>
                      </div>
                    )}
                    {layer.metadata.timeRange && (
                      <div className="metadata-item">
                        <span className="metadata-label">Time:</span>
                        <span className="metadata-value">{layer.metadata.timeRange}</span>
                      </div>
                    )}
                    {layer.metadata.resolution && (
                      <div className="metadata-item">
                        <span className="metadata-label">Resolution:</span>
                        <span className="metadata-value">{layer.metadata.resolution}</span>
                      </div>
                    )}
                    {layer.metadata.units && (
                      <div className="metadata-item">
                        <span className="metadata-label">Units:</span>
                        <span className="metadata-value">{layer.metadata.units}</span>
                      </div>
                    )}
                  </div>
                )}

                {layer.description && (
                  <div className="layer-description">
                    <p>{layer.description}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {showLegend && layers.some(l => l.visible) && (
        <div className="layer-legend">
          <div className="legend-header">
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path fill="currentColor" d="M9 3V18H12V3H9M12 5L16 18L19 17L15 4L12 5M8 5L5 17L8 18L12 5L8 5Z"/>
            </svg>
            <span>Legend</span>
          </div>
          {layers.filter(l => l.visible).map(layer => (
            <div key={layer.id} className="legend-section">
              <h5>{layer.name}</h5>
              <div className="legend-items">
                {getLegendItems(layer.type).map((item, index) => (
                  <div key={index} className="legend-item">
                    <div
                      className="legend-color"
                      style={{ background: item.color }}
                    />
                    <span className="legend-label">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedPosition && (
        <div className="position-info">
          <div className="position-header">
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path fill="currentColor" d="M12,11.5A2.5,2.5 0 0,1 9.5,9A2.5,2.5 0 0,1 12,6.5A2.5,2.5 0 0,1 14.5,9A2.5,2.5 0 0,1 12,11.5M12,2A7,7 0 0,0 5,9C5,14.25 12,22 12,22S19,14.25 19,9A7,7 0 0,0 12,2Z"/>
            </svg>
            <span>Selected Position</span>
          </div>
          <div className="position-coords">
            <div className="coord-item">
              <span className="coord-label">Lat:</span>
              <span className="coord-value">{selectedPosition.lat.toFixed(4)}°</span>
            </div>
            <div className="coord-item">
              <span className="coord-label">Lon:</span>
              <span className="coord-value">{selectedPosition.lon.toFixed(4)}°</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LayerControl;
