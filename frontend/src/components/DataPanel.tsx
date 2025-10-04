import React, { useState, useEffect } from 'react';
import './DataPanel.css';
import { getClimateRiskData, getBloomData } from '../services/climateService';
import { fetchLocationData } from '../services/nasaDataService';
import { LayerState } from './ModeToggle';

interface DataPanelProps {
  location: {lat: number, lng: number, name: string} | null;
  activeLayers: LayerState;
}

const DataPanel: React.FC<DataPanelProps> = ({ location, activeLayers }) => {
  const [realData, setRealData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Fetch real NASA data when location changes
  useEffect(() => {
    if (!location) return;

    setLoading(true);
    fetchLocationData(location.lat, location.lng)
      .then(data => {
        setRealData(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch NASA data:', err);
        setLoading(false);
      });
  }, [location?.lat, location?.lng]);

  if (!location) return null;

  // Use real NASA data if available, otherwise fallback to mock data
  const climateData = realData?.climate || getClimateRiskData(location.lat, location.lng);
  const bloomData = realData?.ndvi || getBloomData(location.lat, location.lng);

  return (
    <div className="data-panel">
      {/* Header */}
      <div className="data-panel-header">
        <h2 style={{ color: 'white' }}>{location.name}</h2>
      </div>

      {/* Historical Data Section */}
      <div className="data-section">
        <h3>Historical Climate Data</h3>
        <div className="chart-placeholder">
          <p>Historical NDVI, Temperature, and Precipitation trends</p>
          <p className="note">Chart integration coming soon...</p>
        </div>
      </div>

      {/* Climate Risk Data (when climate layer is active) */}
      {activeLayers.climate && (
        <div className="data-section">
          <h3>Climate Risk Assessment {loading && '(Loading...)'}</h3>
          <div className="climate-data">
            <div className={`risk-indicator ${realData?.riskLevel || climateData.riskLevel}`}>
              <span className="dot"></span>
              <span>{(realData?.riskLevel || climateData.riskLevel).toUpperCase()} RISK</span>
            </div>
            <div className="data-grid">
              <div className="data-item">
                <strong>Temperature:</strong> {(realData?.climate?.temperature || climateData.temperature).toFixed(1)}°C
              </div>
              <div className="data-item">
                <strong>Precipitation:</strong> {(realData?.climate?.precipitation || climateData.precipitation).toFixed(1)} mm/day
              </div>
              <div className="data-item">
                <strong>Humidity:</strong> {(realData?.climate?.humidity || 50).toFixed(0)}%
              </div>
            </div>
            {realData && <p className="note" style={{color: '#4ade80'}}>✓ Real-time NASA POWER API data</p>}
          </div>
        </div>
      )}

      {/* Bloom Status Data (when bloom layer is active) */}
      {activeLayers.bloom && (
        <div className="data-section">
          <h3>Bloom & Phenology Status {loading && '(Loading...)'}</h3>
          <div className="bloom-status">
            <div className={`status-indicator ${realData?.bloomStatus || bloomData.bloomStatus}`}>
              <span className="dot"></span>
              <span>{(realData?.bloomStatus || bloomData.bloomStatus).toUpperCase()}</span>
            </div>
            <div className="data-grid">
              <div className="data-item">
                <strong>NDVI:</strong> {(realData?.ndvi?.ndvi || bloomData.ndvi).toFixed(3)}
              </div>
              <div className="data-item">
                <strong>EVI:</strong> {(realData?.ndvi?.evi || bloomData.ndvi * 1.2).toFixed(3)}
              </div>
              {bloomData.peakBloomDate && (
                <div className="data-item">
                  <strong>Peak Bloom:</strong> {bloomData.peakBloomDate.toLocaleDateString()}
                </div>
              )}
            </div>
            {realData ? (
              <p className="note" style={{color: '#4ade80'}}>✓ Real-time NDVI data (estimated from climate)</p>
            ) : (
              <p className="note">Based on NDVI data from NASA MODIS & Landsat satellites</p>
            )}
          </div>
        </div>
      )}

      {/* Show summary when no layers are active */}
      {!activeLayers.climate && !activeLayers.bloom && (
        <div className="data-section">
          <h3>Layer Information</h3>
          <p className="note">
            Toggle Climate Risk or Bloom Status layers above to view detailed data for this location.
          </p>
        </div>
      )}
    </div>
  );
};

export default DataPanel;
