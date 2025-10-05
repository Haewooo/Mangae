import React, { useState, useEffect } from 'react';
import './DataPanel.css';
import { getClimateRiskData, getBloomData, predictNDVI, getNDVICategory } from '../services/climateService';
import { fetchLocationData } from '../services/nasaDataService';
import { LayerState } from './ModeToggle';
import { BloomDataPoint } from '../types';
import HistoricalChart from './HistoricalChart';
import { herbariumService, HerbariumRecord } from '../services/herbariumService';

// Helper function for bloom status names
const getBloomStatusName = (label: number): string => {
  switch(label) {
    case 0: return 'No Bloom';
    case 1: return 'Emerging';
    case 2: return 'Peak Bloom';
    default: return 'Unknown';
  }
};


// Parse bloom CSV data from public folder with indexing
const parseBloomCSV = async (): Promise<BloomDataPoint[]> => {
  try {
    console.log('📄 DataPanel: Loading Americas bloom CSV data...');

    // Load all Americas data files (all years)
    const files = [
      '/GEE_Exports_Americas/NorthAmerica_features_labels_2015_2016.csv',
      '/GEE_Exports_Americas/NorthAmerica_features_labels_2017_2018.csv',
      '/GEE_Exports_Americas/NorthAmerica_features_labels_2019_2020.csv',
      '/GEE_Exports_Americas/NorthAmerica_features_labels_2021_2022.csv',
      '/GEE_Exports_Americas/NorthAmerica_features_labels_2023_2024.csv',
      '/GEE_Exports_Americas/SouthAmerica_features_labels_2015_2016.csv',
      '/GEE_Exports_Americas/SouthAmerica_features_labels_2017_2018.csv',
      '/GEE_Exports_Americas/SouthAmerica_features_labels_2019_2020.csv',
      '/GEE_Exports_Americas/SouthAmerica_features_labels_2021_2022.csv',
      '/GEE_Exports_Americas/SouthAmerica_features_labels_2023_2024.csv'
    ];

    let allData: BloomDataPoint[] = [];

    for (const filePath of files) {
      console.log(`📄 Loading: ${filePath}`);
      const response = await fetch(filePath);
      const text = await response.text();
      const lines = text.split('\n').filter(line => line.trim());
      const headers = lines[0].split(',');

      // Find column indices - use GDDm instead of AGDD for Americas data
      const indices = {
        lat: headers.indexOf('lat'),
        lon: headers.indexOf('lon'),
        tmean: headers.indexOf('tmean'),
        pr: headers.indexOf('pr'),
        NDVI: headers.indexOf('NDVI'),
        label: headers.indexOf('label'),
        month: headers.indexOf('month'),
        year: headers.indexOf('year'),
        srad: headers.indexOf('srad'),
        soil: headers.indexOf('soil'),
        vpd: headers.indexOf('vpd'),
        dtr: headers.indexOf('dtr'),
        AGDD: headers.indexOf('GDDm') // Americas data uses GDDm
      };

      // Process rows for this file
      const maxRows = lines.length;

      for (let i = 1; i < maxRows; i++) {
        const values = lines[i].split(',');
        if (values.length === headers.length) {
          const point: BloomDataPoint = {
            lat: parseFloat(values[indices.lat]),
            lon: parseFloat(values[indices.lon]),
            tmean: parseFloat(values[indices.tmean]),
            pr: parseFloat(values[indices.pr]),
            NDVI: parseFloat(values[indices.NDVI]),
            label: parseInt(values[indices.label]),
            month: parseInt(values[indices.month]),
            year: parseInt(values[indices.year]),
            srad: parseFloat(values[indices.srad]),
            soil: parseFloat(values[indices.soil]),
            vpd: parseFloat(values[indices.vpd]),
            dtr: parseFloat(values[indices.dtr]),
            AGDD: parseFloat(values[indices.AGDD]) || 0
          };

          // Only add valid data points
          if (!isNaN(point.lat) && !isNaN(point.lon)) {
            allData.push(point);
          }
        }
      }
    }


    // Data loaded successfully

    // Log data distribution
    const years = Array.from(new Set(allData.map(p => p.year))).sort();
    const months = Array.from(new Set(allData.map(p => p.month))).sort();
    console.log(`📅 Years available: ${years.join(', ')}`);
    console.log(`📅 Months available: ${months.join(', ')}`);

    // Check for specific time periods
    const data2022_4 = allData.filter(p => p.year === 2022 && p.month === 4);
    const data2021_4 = allData.filter(p => p.year === 2021 && p.month === 4);

    return allData;
  } catch (error) {
    console.error('❌ DataPanel: Failed to load bloom CSV:', error);
    return [];
  }
};

interface DataPanelProps {
  location: {lat: number, lng: number, name: string} | null;
  activeLayers: LayerState;
  currentTime: Date;
}

const DataPanel: React.FC<DataPanelProps> = ({ location, activeLayers, currentTime }) => {
  const [realData, setRealData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [bloomCSVData, setBloomCSVData] = useState<BloomDataPoint[]>([]);
  const [herbariumLoaded, setHerbariumLoaded] = useState(false);
  const [selectedSpecies, setSelectedSpecies] = useState<string | null>(null);
  const [speciesImages, setSpeciesImages] = useState<string[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);

  // Load CSV data once on mount
  useEffect(() => {
    parseBloomCSV().then((data: BloomDataPoint[]) => setBloomCSVData(data));
  }, []);

  // Load herbarium data once on mount
  useEffect(() => {
    herbariumService.loadData()
      .then(() => {
        setHerbariumLoaded(true);
        const stats = herbariumService.getStatistics();
        console.log('🌿 Herbarium loaded:', stats);
      })
      .catch(err => {
        console.error('Failed to load herbarium data:', err);
      });
  }, []);

  // Fetch species images from multiple sources
  const fetchSpeciesImages = async (speciesName: string) => {
    try {
      setLoadingImages(true);
      setSpeciesImages([]); // Clear previous images
      const images: string[] = [];

      // 1. Try GBIF API (Global Biodiversity Information Facility)
      try {
        const gbifResponse = await fetch(
          `https://api.gbif.org/v1/occurrence/search?scientificName=${encodeURIComponent(speciesName)}&mediaType=StillImage&limit=3`
        );
        const gbifData = await gbifResponse.json();
        
        if (gbifData.results && gbifData.results.length > 0) {
          gbifData.results.forEach((result: any) => {
            if (result.media && result.media.length > 0) {
              result.media.forEach((media: any) => {
                if (media.identifier && images.length < 3) {
                  images.push(media.identifier);
                }
              });
            }
          });
        }
      } catch (err) {
        console.log('GBIF API failed, trying next source');
      }

      // 2. Try iNaturalist API
      if (images.length < 3) {
        try {
          const inatResponse = await fetch(
            `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(speciesName)}&rank=species&per_page=1`
          );
          const inatData = await inatResponse.json();
          
          if (inatData.results && inatData.results.length > 0) {
            const taxon = inatData.results[0];
            if (taxon.default_photo?.medium_url) {
              images.push(taxon.default_photo.medium_url);
            }
            if (taxon.taxon_photos && taxon.taxon_photos.length > 0) {
              taxon.taxon_photos.slice(0, 3).forEach((photo: any) => {
                if (photo.photo?.medium_url && images.length < 3) {
                  images.push(photo.photo.medium_url);
                }
              });
            }
          }
        } catch (err) {
          console.log('iNaturalist API failed, trying next source');
        }
      }

      // 3. Try Wikipedia as fallback
      if (images.length === 0) {
        try {
          const wikiResponse = await fetch(
            `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(speciesName)}&prop=pageimages&format=json&pithumbsize=500&origin=*`
          );
          const wikiData = await wikiResponse.json();
          const pages = wikiData.query?.pages;
          
          if (pages) {
            const pageId = Object.keys(pages)[0];
            const page = pages[pageId];
            
            if (page.thumbnail?.source) {
              images.push(page.thumbnail.source);
            }
          }
        } catch (err) {
          console.log('Wikipedia API failed');
        }
      }

      setSpeciesImages(images);
      console.log(`🖼️ Found ${images.length} images for ${speciesName}`);
      
    } catch (error) {
      console.error('Failed to fetch species images:', error);
      setSpeciesImages([]);
    } finally {
      setLoadingImages(false);
    }
  };

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

  return (
    <div className="data-panel">
      {/* Header */}
      <div className="data-panel-header">
        <h2 style={{ color: 'white' }}>{location.name}</h2>
      </div>

      {/* Historical Data Section */}
      <div className="data-section">
        <h3>Historical Climate Data</h3>
        {location ? (
          <HistoricalChart
            location={location}
            allBloomData={bloomCSVData}
          />
        ) : (
          <div className="chart-placeholder">
            <p>Select a location on the map to view historical climate trends</p>
            <p className="note">NDVI, Temperature, and Precipitation data (2015-2024)</p>
          </div>
        )}
      </div>

      {/* Climate Risk Data (when climate layer is active) */}
      {activeLayers.climate && (
        <div className="data-section">
          <h3>Climate Risk Assessment {loading && '(Loading...)'}</h3>
          {realData ? (
            <div className="climate-data">
              <div className={`risk-indicator ${realData.riskLevel}`}>
                <span className="dot"></span>
                <span>{realData.riskLevel.toUpperCase()} RISK</span>
              </div>
              <div className="data-grid">
                <div className="data-item">
                  <strong>Temperature:</strong> {realData.climate.temperature.toFixed(1)}°C
                </div>
                <div className="data-item">
                  <strong>Precipitation:</strong> {realData.climate.precipitation.toFixed(1)} mm/day
                </div>
                <div className="data-item">
                  <strong>Humidity:</strong> {realData.climate.humidity.toFixed(0)}%
                </div>
                <div className="data-item">
                  <strong>Solar Radiation:</strong> {realData.climate.solarRadiation.toFixed(1)} MJ/m²/day
                </div>
              </div>
              <p className="note" style={{color: '#4ade80'}}>✓ NASA POWER API data</p>
            </div>
          ) : (
            <div className="climate-data">
              <p style={{color: '#ef4444'}}>❌ Failed to load NASA POWER API data</p>
            </div>
          )}
        </div>
      )}

      {/* Bloom Status Data (when bloom layer is active) */}
      {activeLayers.bloom && (() => {
        // Find closest bloom data point from CSV
        if (bloomCSVData.length === 0) {
          return (
            <div className="data-section">
              <h3>Bloom & Phenology Status (Loading CSV...)</h3>
              <p className="note">Loading bloom data from 2015-2024...</p>
              <p className="note" style={{fontSize: '12px', marginTop: '5px'}}>CSV data loading... {bloomCSVData.length} points loaded</p>
            </div>
          );
        }

        // Get current year and month from currentTime
        const currentYear = currentTime.getFullYear();
        const currentMonth = currentTime.getMonth() + 1;

        // If no location selected, show general stats
        if (!location) {
          const totalPoints = bloomCSVData.length;
          const currentTimeData = bloomCSVData.filter(p =>
            p.year === currentYear && p.month === currentMonth
          );
          const fallbackData = bloomCSVData.filter(p =>
            p.year === 2020 && p.month === 4
          );

          return (
            <div className="data-section">
              <h3>Bloom & Phenology Status</h3>
              <p className="note">Click on map to view location-specific data</p>
              <div className="data-grid">
                <div className="data-item">
                  <strong>Total data points:</strong> {totalPoints}
                </div>
                <div className="data-item">
                  <strong>Current time data:</strong> {currentTimeData.length} points
                </div>
                <div className="data-item">
                  <strong>Fallback (2020-04):</strong> {fallbackData.length} points
                </div>
              </div>
              <p className="note" style={{fontSize: '12px', marginTop: '10px'}}>
                Data loaded from: Americas features_labels 2015-2024
              </p>
            </div>
          );
        }

        // Filter data by time first
        const timeFilteredData = bloomCSVData.filter(p =>
          p.year === currentYear && p.month === currentMonth
        );

        // Check if there's any CSV data within 5 degrees
        const nearbyCSVData = timeFilteredData.filter(p => {
          const dLat = Math.abs(p.lat - location.lat);
          const dLon = Math.abs(p.lon - location.lng);
          return dLat <= 5 && dLon <= 5;
        });

        // If no CSV data within 5 degrees, use NASA POWER API fallback
        if (nearbyCSVData.length === 0) {
          if (!realData) {
            return (
              <div className="data-section">
                <h3>Bloom & Phenology Status</h3>
                <p style={{color: '#ef4444'}}>❌ No CSV data within 5° and NASA API failed</p>
              </div>
            );
          }

          const bloomStatusFromNDVI = realData.ndvi.ndvi > 0.6 ? 'peak-bloom' : realData.ndvi.ndvi > 0.4 ? 'emerging' : 'dormant';

          // Find nearest herbarium specimen for species info
          const nearestSpecimen = herbariumLoaded 
            ? herbariumService.findNearestSpecimen(location.lat, location.lng, 10.0)
            : null;

          return (
            <div className="data-section">
              <h3>Bloom & Phenology Status (NASA POWER API)</h3>
              <div className="bloom-status">
                <div className={`status-indicator ${bloomStatusFromNDVI}`}>
                  <span className="dot"></span>
                  <span>{bloomStatusFromNDVI.toUpperCase().replace('-', ' ')}</span>
                </div>
                <div className="data-grid">
                  <div className="data-item">
                    <strong>Species:</strong> {nearestSpecimen 
                      ? `${nearestSpecimen.specimen.species} (${nearestSpecimen.specimen.family})`
                      : 'No specimen data within 10°'}
                  </div>
                  <div className="data-item">
                    <strong>NDVI:</strong> {realData.ndvi.ndvi.toFixed(3)}
                  </div>
                  <div className="data-item">
                    <strong>Temperature:</strong> {realData.climate.temperature.toFixed(1)}°C
                  </div>
                  <div className="data-item">
                    <strong>Precipitation:</strong> {realData.climate.precipitation.toFixed(1)} mm/day
                  </div>
                  <div className="data-item">
                    <strong>Humidity:</strong> {realData.climate.humidity.toFixed(0)}%
                  </div>
                  <div className="data-item">
                    <strong>Solar Radiation:</strong> {realData.climate.solarRadiation.toFixed(1)} MJ/m²/day
                  </div>
                </div>
                <p className="note" style={{color: '#4ade80'}}>
                  ✓ NASA POWER API data - No Americas CSV data within 5° (~555km) or out of date range (2015-2024)
                  {nearestSpecimen && (
                    <> | Species data: {(nearestSpecimen.distance * 111).toFixed(0)}km ({nearestSpecimen.distance.toFixed(2)}°)</>
                  )}
                </p>
              </div>
            </div>
          );
        }

        // Find nearest point from nearby CSV data
        let nearestPoint: BloomDataPoint | null = null;
        let minDistance = Infinity;

        for (const point of nearbyCSVData) {
          const dLat = point.lat - location.lat;
          const dLon = point.lon - location.lng;
          const distance = Math.sqrt(dLat * dLat + dLon * dLon);

          if (distance < minDistance) {
            minDistance = distance;
            nearestPoint = point;
          }
        }

        if (!nearestPoint) {
          return (
            <div className="data-section">
              <h3>Bloom & Phenology Status</h3>
              <p className="note">No bloom data available for {currentYear}-{String(currentMonth).padStart(2, '0')}.</p>
              <p className="note" style={{fontSize: '12px', marginTop: '5px'}}>
                Available data: 2015-2024 (Americas)
              </p>
            </div>
          );
        }

        const bloomStatusName = getBloomStatusName(nearestPoint.label);

        // Find nearest herbarium specimen for species info
        const nearestSpecimen = herbariumLoaded 
          ? herbariumService.findNearestSpecimen(location.lat, location.lng, 10.0)
          : null;

        return (
          <div className="data-section">
            <h3>Bloom & Phenology Status (CSV Data {nearestPoint.year}-{String(nearestPoint.month).padStart(2, '0')})</h3>
            <div className="bloom-status">
              <div className={`status-indicator ${bloomStatusName.toLowerCase().replace(' ', '-')}`}>
                <span className="dot"></span>
                <span>{bloomStatusName.toUpperCase()}</span>
              </div>
              <div className="data-grid">
                <div className="data-item">
                  <strong>Species:</strong> {nearestSpecimen 
                    ? `${nearestSpecimen.specimen.species} (${nearestSpecimen.specimen.family})`
                    : 'No specimen data within 10°'}
                </div>
                <div className="data-item">
                  <strong>NDVI:</strong> {nearestPoint.NDVI.toFixed(3)}
                </div>
                <div className="data-item">
                  <strong>Temperature:</strong> {nearestPoint.tmean.toFixed(1)}°C
                </div>
                <div className="data-item">
                  <strong>Precipitation:</strong> {nearestPoint.pr.toFixed(1)} mm
                </div>
                <div className="data-item">
                  <strong>Soil Moisture:</strong> {nearestPoint.soil.toFixed(0)} mm
                </div>
                <div className="data-item">
                  <strong>Solar Radiation:</strong> {nearestPoint.srad.toFixed(0)} W/m²
                </div>
                <div className="data-item">
                  <strong>GDD (AGDD):</strong> {nearestPoint.AGDD.toFixed(0)}
                </div>
                <div className="data-item">
                  <strong>Month:</strong> {nearestPoint.month}
                </div>
                <div className="data-item">
                  <strong>Year:</strong> {nearestPoint.year}
                </div>
              </div>
              <p className="note" style={{color: '#4ade80'}}>
                ✓ Americas CSV data - Distance: {(minDistance * 111).toFixed(0)}km ({minDistance.toFixed(2)}°)
                {nearestSpecimen && (
                  <> | Species data: {(nearestSpecimen.distance * 111).toFixed(0)}km ({nearestSpecimen.distance.toFixed(2)}°)</>
                )}
              </p>
            </div>
          </div>
        );
      })()}

      {/* NDVI Prediction Data (when NDVI layer is active) */}
      {false && (() => {
        // Mock NDVI prediction using 5 features
        const temperature = 15 + (90 - Math.abs(location?.lat || 0)) / 3 + (Math.random() * 10);
        const gdd = Math.max(0, (temperature - 10) * 30 + Math.random() * 500);
        const solarRadiation = 200 + Math.random() * 100;
        const soilMoisture = 30 + Math.random() * 40;
        const evapotranspiration = 3 + Math.random() * 4;

        const predictedNDVI = predictNDVI(temperature, gdd, solarRadiation, soilMoisture, evapotranspiration);
        const ndviCategory = getNDVICategory(predictedNDVI);

        return (
          <div className="data-section">
            <h3>NDVI Prediction (5-Feature Model)</h3>
            <div className="ndvi-prediction">
              <div className={`status-indicator ${ndviCategory}`}>
                <span className="dot"></span>
                <span>{ndviCategory.toUpperCase()} VEGETATION</span>
              </div>
              <div className="data-grid">
                <div className="data-item">
                  <strong>Predicted NDVI:</strong> {predictedNDVI.toFixed(3)}
                </div>
                <div className="data-item">
                  <strong>Temperature:</strong> {temperature.toFixed(1)}°C
                </div>
                <div className="data-item">
                  <strong>GDD:</strong> {gdd.toFixed(0)}
                </div>
                <div className="data-item">
                  <strong>Solar Radiation:</strong> {solarRadiation.toFixed(1)} W/m²
                </div>
                <div className="data-item">
                  <strong>Soil Moisture:</strong> {soilMoisture.toFixed(1)}%
                </div>
                <div className="data-item">
                  <strong>Evapotranspiration:</strong> {evapotranspiration.toFixed(2)} mm/day
                </div>
              </div>
              <p className="note">Based on 5-feature NDVI prediction model (mock data)</p>
            </div>
          </div>
        );
      })()}

      {/* Herbarium Specimen Detail (when herbarium layer is active) */}
      {activeLayers.herbarium && (() => {
        if (!herbariumLoaded) {
          return (
            <div className="data-section">
              <h3>Plant Specimen Data (Loading...)</h3>
              <p className="note">Loading herbarium specimens...</p>
            </div>
          );
        }

        const nearestSpecimen = herbariumService.findNearestSpecimen(location.lat, location.lng, 10.0);

        if (!nearestSpecimen) {
          return (
            <div className="data-section">
              <h3>Plant Specimen Data</h3>
              <p className="note">No specimens found within 10° (~1,110km) of this location</p>
            </div>
          );
        }

        const { specimen, distance } = nearestSpecimen;
        const distanceKm = Math.round(distance * 111);

        // Check IUCN status
        const iucnStatuses = herbariumService.getIUCNStatus(specimen.species);
        const iucnStats = herbariumService.getIUCNStatistics();

        return (
          <div className="data-section">
            <h3>🌿 Plant Specimen Detail</h3>
            <div className="bloom-status">
              {iucnStatuses && iucnStatuses.length > 0 && (
                <div style={{
                  background: 'rgba(239, 68, 68, 0.2)',
                  border: '1px solid #ef4444',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  marginBottom: '12px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '20px' }}>
                      {iucnStatuses[0] === 'CR' ? '🔴' : iucnStatuses[0] === 'EN' ? '🟠' : '🟡'}
                    </span>
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '13px', color: '#ef4444' }}>
                        Endangered Species: {iucnStatuses.join(', ')}
                      </div>
                      <div style={{ fontSize: '11px', opacity: 0.8, marginTop: '2px' }}>
                        {iucnStats && iucnStats.descriptions[iucnStatuses[0]]}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div className="data-grid">
                <div className="data-item" style={{ gridColumn: '1 / -1' }}>
                  <strong>Scientific Name:</strong> 
                  <span 
                    onClick={() => {
                      setSelectedSpecies(specimen.scientificName);
                      fetchSpeciesImages(specimen.scientificName);
                    }}
                    style={{ 
                      cursor: 'pointer', 
                      color: '#4ade80',
                      marginLeft: '8px',
                      textDecoration: 'underline'
                    }}
                  >
                    {specimen.scientificName || 'N/A'} 🔍
                  </span>
                </div>
                <div className="data-item">
                  <strong>Species:</strong> 
                  <span 
                    onClick={() => {
                      setSelectedSpecies(specimen.species);
                      fetchSpeciesImages(specimen.species);
                    }}
                    style={{ 
                      cursor: 'pointer', 
                      color: '#4ade80',
                      marginLeft: '8px',
                      textDecoration: 'underline'
                    }}
                  >
                    {specimen.species || 'N/A'} 🔍
                  </span>
                </div>
                <div className="data-item">
                  <strong>Family:</strong> {specimen.family || 'N/A'}
                </div>
                <div className="data-item">
                  <strong>Genus:</strong> {specimen.genus || 'N/A'}
                </div>
                <div className="data-item">
                  <strong>Collection Date:</strong> {specimen.eventDate || 'N/A'}
                </div>
                <div className="data-item" style={{ gridColumn: '1 / -1' }}>
                  <strong>Locality:</strong> {specimen.locality || 'N/A'}
                </div>
                {specimen.country && (
                  <div className="data-item">
                    <strong>Country:</strong> {specimen.country}
                  </div>
                )}
                {specimen.stateProvince && (
                  <div className="data-item">
                    <strong>Province:</strong> {specimen.stateProvince}
                  </div>
                )}
                <div className="data-item">
                  <strong>Latitude:</strong> {specimen.latitude.toFixed(6)}°
                </div>
                <div className="data-item">
                  <strong>Longitude:</strong> {specimen.longitude.toFixed(6)}°
                </div>
                {specimen.blooming && specimen.blooming.length > 0 && (
                  <div className="data-item" style={{ gridColumn: '1 / -1' }}>
                    <strong>Flowering Months:</strong> {specimen.blooming.join(', ')}
                    {specimen.bloomingLabels && ` (${specimen.bloomingLabels.join(', ')})`}
                  </div>
                )}
                {specimen.blooming_conditions && (
                  <>
                    <div className="data-item">
                      <strong>Flowering Season:</strong> {specimen.blooming_conditions.flowering_phenology}
                    </div>
                    <div className="data-item">
                      <strong>Flowering Period:</strong> {specimen.blooming_conditions.flowering_period}
                    </div>
                    <div className="data-item">
                      <strong>Habitat:</strong> {specimen.blooming_conditions.habitat_type || 'N/A'}
                    </div>
                    {specimen.blooming_conditions.temperature_range && (
                      <div className="data-item">
                        <strong>Temp Range:</strong> {specimen.blooming_conditions.temperature_range.min}°C - {specimen.blooming_conditions.temperature_range.max}°C
                      </div>
                    )}
                  </>
                )}
              </div>
              <p className="note" style={{color: '#4ade80'}}>
                ✓ Herbarium Senckenbergianum specimen - Distance: {distanceKm}km ({distance.toFixed(2)}°)
              </p>
              {specimen.data_confidence && (
                <p className="note" style={{fontSize: '11px'}}>
                  Data confidence: {(specimen.data_confidence * 100).toFixed(0)}%
                  {specimen.data_sources && ` | Sources: ${specimen.data_sources.join(', ')}`}
                </p>
              )}
            </div>
          </div>
        );
      })()}

      {/* Species Images Section */}
      {selectedSpecies && loadingImages && (
        <div className="data-section">
          <h3>📷 {selectedSpecies}</h3>
          <div style={{
            padding: '40px 20px',
            textAlign: 'center',
            color: 'rgba(255, 255, 255, 0.6)'
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              border: '3px solid rgba(76, 222, 128, 0.3)',
              borderTop: '3px solid #4ade80',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 16px'
            }}></div>
            <p>Loading images...</p>
          </div>
        </div>
      )}

      {selectedSpecies && !loadingImages && speciesImages.length > 0 && (
        <div className="data-section">
          <h3>📷 {selectedSpecies}</h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: speciesImages.length === 1 ? '1fr' : '1fr 1fr',
            gap: '12px',
            marginTop: '12px'
          }}>
            {speciesImages.map((imgUrl, index) => (
              <div key={index} style={{
                position: 'relative',
                width: '100%',
                borderRadius: '8px',
                overflow: 'hidden',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                background: 'rgba(255, 255, 255, 0.05)',
                aspectRatio: '1/1'
              }}>
                <img 
                  src={imgUrl} 
                  alt={`${selectedSpecies} ${index + 1}`}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block'
                  }}
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </div>
            ))}
          </div>
          <button
            onClick={() => {
              window.open(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(selectedSpecies)}`, '_blank');
            }}
            style={{
              background: 'rgba(76, 222, 128, 0.2)',
              border: '1px solid #4ade80',
              color: '#4ade80',
              padding: '10px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '500',
              transition: 'all 0.2s',
              marginTop: '12px',
              width: '100%'
            }}
          >
            🔍 View more images on Google
          </button>
        </div>
      )}

      {selectedSpecies && !loadingImages && speciesImages.length === 0 && (
        <div className="data-section">
          <h3>📷 {selectedSpecies}</h3>
          <p className="note">No images found in GBIF, iNaturalist, or Wikipedia databases.</p>
          <button
            onClick={() => {
              window.open(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(selectedSpecies)}`, '_blank');
            }}
            style={{
              background: 'rgba(76, 222, 128, 0.2)',
              border: '1px solid #4ade80',
              color: '#4ade80',
              padding: '10px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '500',
              marginTop: '12px',
              width: '100%'
            }}
          >
            🔍 Search images on Google
          </button>
        </div>
      )}

      {/* Show summary when no layers are active */}
      {!activeLayers.climate && !activeLayers.bloom && !activeLayers.herbarium && (
        <div className="data-section">
          <h3>Layer Information</h3>
          <p className="note">
            Toggle Climate Risk, Bloom Status, Plant Specimens, or NDVI Prediction layers above to view detailed data for this location.
          </p>
        </div>
      )}
    </div>
  );
};

export default DataPanel;
