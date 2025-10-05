import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Viewer, Entity } from 'resium';
import * as Cesium from 'cesium';
import { Cartesian3, Viewer as CesiumViewer, Color, ColorMaterialProperty, ConstantProperty, ScreenSpaceEventHandler, ScreenSpaceEventType, Cartographic, Math as CesiumMath, Rectangle, CameraEventType, KeyboardEventModifier, HeadingPitchRange, Matrix4 } from 'cesium';
import * as satellite from 'satellite.js';
import { startTLEAutoUpdate } from '../services/satelliteService';
import { generateClimateRiskGrid, getClimateRiskColor, getNDVICategory, getNDVIColor } from '../services/climateService';
// Removed mock data service imports
import { BloomDataPoint } from '../types';
import { americasDataService } from '../services/americasDataService';
import DataPanel from './DataPanel';
import ModeToggle, { LayerState } from './ModeToggle';
import './EarthGlobe.css';

// Helper interfaces and functions for bloom data visualization
interface HistoricalClimateData {
  lat: number;
  lon: number;
  temperature: number;
  precipitation: number;
  ndvi: number;
  year: number;
  month: number;
}

// Parse bloom CSV data from public folder
const parseBloomCSV = async (): Promise<BloomDataPoint[]> => {

  try {
    // Check if we're in the correct environment
    console.log('🌐 Environment check:', {
      location: window.location.href,
      port: window.location.port,
      protocol: window.location.protocol
    });

    // Test network connectivity first
    console.log('📡 Testing network connectivity...');
    const csvUrl = '/us_east_features_labels_2015_2024.csv';

    // Fetch with detailed error handling
    console.log(`🔗 Fetching CSV from: ${csvUrl}`);
    const response = await fetch(csvUrl, {
      method: 'GET',
      headers: {
        'Accept': 'text/csv,text/plain,*/*'
      }
    });

    console.log('📋 Response details:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: Object.fromEntries(response.headers.entries()),
      url: response.url
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentLength = response.headers.get('content-length');

    console.log('📄 Reading response text...');
    const text = await response.text();

    if (!text || text.length === 0) {
      throw new Error('CSV file is empty or could not be read');
    }

    console.log(`📝 First 200 characters: ${text.substring(0, 200)}...`);

    const lines = text.split('\n').filter(line => line.trim()); // Remove empty lines
    console.log(`📋 Total lines after filtering: ${lines.length}`);

    if (lines.length === 0) {
      throw new Error('No valid lines found in CSV file');
    }

    const headers = lines[0].split(',').map(h => h.trim());
    console.log('🔢 Header count:', headers.length);

    // Find column indices with validation
    const requiredColumns = ['lat', 'lon', 'tmean', 'pr', 'NDVI', 'label', 'month', 'year', 'srad', 'soil', 'vpd', 'dtr', 'AGDD'];
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
      AGDD: headers.indexOf('AGDD')
    };

    console.log('📍 Column indices:', indices);

    // Validate all required columns are present
    const missingColumns = requiredColumns.filter(col => indices[col as keyof typeof indices] === -1);
    if (missingColumns.length > 0) {
      throw new Error(`Missing required columns: ${missingColumns.join(', ')}`);
    }


    const data: BloomDataPoint[] = [];
    let validRows = 0;
    let invalidRows = 0;
    let parseErrors = 0;

    // Process data with progress logging
    const totalDataRows = lines.length - 1;
    const maxRows = totalDataRows; // NO LIMIT - Load all data

    for (let i = 1; i <= maxRows; i++) {
      try {
        const line = lines[i];
        if (!line || !line.trim()) {
          invalidRows++;
          continue;
        }

        const values = line.split(',').map(v => v.trim());

        if (values.length !== headers.length) {
          console.warn(`⚠️ Row ${i}: Column count mismatch. Expected ${headers.length}, got ${values.length}`);
          invalidRows++;
          continue;
        }

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
          AGDD: parseFloat(values[indices.AGDD])
        };

        // Validate parsed data
        if (isNaN(point.lat) || isNaN(point.lon)) {
          console.warn(`⚠️ Row ${i}: Invalid lat/lon values:`, { lat: point.lat, lon: point.lon });
          invalidRows++;
          continue;
        }

        // Additional validation for reasonable coordinate ranges
        if (point.lat < -90 || point.lat > 90 || point.lon < -180 || point.lon > 180) {
          console.warn(`⚠️ Row ${i}: Coordinates out of range:`, { lat: point.lat, lon: point.lon });
          invalidRows++;
          continue;
        }

        data.push(point);
        validRows++;

        // Log progress every 1000 rows
        if (i % 1000 === 0) {
        }
      } catch (rowError) {
        parseErrors++;
        console.error(`❌ Row ${i} parse error:`, rowError);
      }
    }

    if (data.length === 0) {
      throw new Error('No valid data points were parsed from the CSV file');
    }

    // Log processing summary
    console.log('📊 CSV Processing Summary:', {
      totalProcessed: maxRows,
      validRows,
      invalidRows,
      parseErrors,
      successRate: `${Math.round((validRows / maxRows) * 100)}%`
    });

    // Log sample data points
    console.log('First point:', data[0]);
    if (data.length > 1) {
      console.log('Last point:', data[data.length - 1]);
    }
    if (data.length > 10) {
      console.log('Middle point:', data[Math.floor(data.length / 2)]);
    }

    // Analyze data distribution
    const years = Array.from(new Set(data.map(p => p.year))).sort();
    const months = Array.from(new Set(data.map(p => p.month))).sort();
    const labels = Array.from(new Set(data.map(p => p.label))).sort();

    console.log('📊 Data distribution:', {
      years: `${years.length} years (${years[0]}-${years[years.length - 1]})`,
      months: `${months.length} months (${months.join(', ')})`,
      bloomLabels: `${labels.length} labels (${labels.join(', ')})`,
      coordinates: {
        latRange: [Math.min(...data.map(p => p.lat)), Math.max(...data.map(p => p.lat))],
        lonRange: [Math.min(...data.map(p => p.lon)), Math.max(...data.map(p => p.lon))]
      }
    });

    return data;
  } catch (error: any) {
    console.error('❌ Critical error in parseBloomCSV:', error);
    console.error('🔍 Error details:', {
      name: error?.name || 'Unknown',
      message: error?.message || 'Unknown error',
      stack: error?.stack || 'No stack trace'
    });

    // Try alternative approaches

    // Fallback 1: Try with different fetch options
    try {
      const fallbackResponse = await fetch('/us_east_features_labels_2015_2024.csv', {
        method: 'GET',
        cache: 'no-cache'
      });
      if (fallbackResponse.ok) {
        const fallbackText = await fallbackResponse.text();
        if (fallbackText && fallbackText.length > 0) {
          const lines = fallbackText.split('\n').filter(l => l.trim());
          if (lines.length > 1) {
            console.log(`📄 Found ${lines.length} lines in fallback CSV`);
            // Return a minimal dataset for testing
            const headers = lines[0].split(',');
            const latIndex = headers.indexOf('lat');
            const lonIndex = headers.indexOf('lon');
            const ndviIndex = headers.indexOf('NDVI');
            const labelIndex = headers.indexOf('label');
            const yearIndex = headers.indexOf('year');
            const monthIndex = headers.indexOf('month');

            if (latIndex !== -1 && lonIndex !== -1) {
              const fallbackData: BloomDataPoint[] = [];
              for (let i = 1; i < Math.min(lines.length, 100); i++) {
                const values = lines[i].split(',');
                if (values.length === headers.length) {
                  const lat = parseFloat(values[latIndex]);
                  const lon = parseFloat(values[lonIndex]);
                  if (!isNaN(lat) && !isNaN(lon)) {
                    fallbackData.push({
                      lat,
                      lon,
                      tmean: 15, // Default values
                      pr: 100,
                      NDVI: ndviIndex !== -1 ? parseFloat(values[ndviIndex]) || 0.5 : 0.5,
                      label: labelIndex !== -1 ? parseInt(values[labelIndex]) || 0 : 0,
                      month: monthIndex !== -1 ? parseInt(values[monthIndex]) || 4 : 4,
                      year: yearIndex !== -1 ? parseInt(values[yearIndex]) || 2020 : 2020,
                      srad: 1200,
                      soil: 1100,
                      vpd: 50,
                      dtr: 10,
                      AGDD: 100
                    });
                  }
                }
              }
              if (fallbackData.length > 0) {
                return fallbackData;
              }
            }
          }
        }
      }
    } catch (fallbackError) {
      console.error('❌ Fallback fetch also failed:', fallbackError);
    }

    // Fallback 2: Return synthetic test data
    const syntheticData: BloomDataPoint[] = [];

    // Generate a small grid of test points in the eastern US
    for (let lat = 30; lat <= 45; lat += 2) {
      for (let lon = -85; lon <= -70; lon += 2) {
        syntheticData.push({
          lat,
          lon,
          tmean: 15 + Math.random() * 10,
          pr: 80 + Math.random() * 40,
          NDVI: 0.3 + Math.random() * 0.4,
          label: Math.floor(Math.random() * 3),
          month: 4,
          year: 2020,
          srad: 1000 + Math.random() * 400,
          soil: 1000 + Math.random() * 200,
          vpd: 30 + Math.random() * 40,
          dtr: 8 + Math.random() * 6,
          AGDD: 50 + Math.random() * 100
        });
      }
    }

    console.log(`🌱 Generated ${syntheticData.length} synthetic bloom data points for testing`);
    return syntheticData;

    // Final fallback - return empty array
    console.error('💥 ALL FALLBACK STRATEGIES FAILED - RETURNING EMPTY DATASET');
    console.error('🔧 Troubleshooting suggestions:');
    console.error('  1. Check if CSV file exists at /us_east_features_labels_2015_2024.csv');
    console.error('  2. Verify development server is serving static files correctly');
    console.error('  3. Check browser network tab for failed requests');
    console.error('  4. Try accessing http://localhost:3000/us_east_features_labels_2015_2024.csv directly');
    console.error('  5. Check CSV file permissions and format');
    return [];
  }
};

// Convert bloom data to climate data format
const bloomToClimateData = (bloomData: BloomDataPoint[]): HistoricalClimateData[] => {
  return bloomData.map(point => ({
    lat: point.lat,
    lon: point.lon,
    temperature: point.tmean,
    precipitation: point.pr,
    ndvi: point.NDVI,
    year: point.year,
    month: point.month
  }));
};

// Filter data by time
const filterBloomDataByTime = (data: BloomDataPoint[], requestedYear?: number, requestedMonth?: number): BloomDataPoint[] => {
  if (!data || data.length === 0) {
    console.warn('⚠️ filterBloomDataByTime: No input data provided');
    return [];
  }

  // Just return all available data without time filtering
  // This eliminates the mismatched year/month issue
  return data;
};

const filterClimateDataByTime = (data: HistoricalClimateData[], year: number, month: number): HistoricalClimateData[] => {
  return data.filter(point => point.year === year && point.month === month);
};

// Create climate overlay regions
const createClimateOverlayRegions = (data: HistoricalClimateData[], gridSize: number) => {
  const regions: any[] = [];
  const processedCells = new Set<string>();

  data.forEach(point => {
    const cellLat = Math.floor(point.lat / gridSize) * gridSize;
    const cellLon = Math.floor(point.lon / gridSize) * gridSize;
    const cellKey = `${cellLat},${cellLon}`;

    if (!processedCells.has(cellKey)) {
      processedCells.add(cellKey);
      regions.push({
        bounds: {
          west: cellLon,
          east: cellLon + gridSize,
          south: cellLat,
          north: cellLat + gridSize
        },
        climateRiskScore: point.ndvi
      });
    }
  });

  return regions;
};

// Get color based on climate risk
const getHistoricalClimateRiskColor = (ndvi: number): string => {
  if (ndvi < 0.3) return '#FF0000'; // Red - poor
  if (ndvi < 0.5) return '#FFA500'; // Orange - fair
  if (ndvi < 0.7) return '#FFFF00'; // Yellow - good
  return '#00FF00'; // Green
};

// Get color for bloom status
const getBloomStatusColor = (label: number, ndvi: number): string => {
  // Determine bloom status based on NDVI
  let bloomLabel = label;
  if (ndvi < 0.5) {
    bloomLabel = 0; // No bloom
  } else if (ndvi >= 0.5 && ndvi < 0.7) {
    bloomLabel = 1; // Emerging
  } else if (ndvi >= 0.7) {
    bloomLabel = 2; // Peak bloom
  }

  // Return color based on calculated bloom label
  if (bloomLabel === 2) return '#FF1493'; // Peak bloom - deep pink
  if (bloomLabel === 1) return '#FF69B4'; // Emerging - hot pink
  return '#DDA0DD'; // No bloom - plum
};

// Get bloom status name
const getBloomStatusName = (label: number): string => {
  switch(label) {
    case 0: return 'No Bloom';
    case 1: return 'Emerging';
    case 2: return 'Peak Bloom';
    default: return 'Unknown';
  }
};

// Stub for loadRegionalBloomData - returns empty since we only have US East data
const loadRegionalBloomData = async (regionId: string, year: number, month: number): Promise<BloomDataPoint[]> => {
  // Only US East data is available from CSV
  return [];
};

// Set global Cesium for cesium-heatmap library
(window as any).Cesium = Cesium;

// Use require for JavaScript-only library to bypass TypeScript module resolution
const CesiumHeatmap = require('cesium-heatmap');

// Cesium configuration
(window as any).CESIUM_BASE_URL = '/cesium';

// Satellite configuration with real-time TLE data from NASA/NORAD APIs
const satelliteConfig = [
  {
    noradId: 39084,
    name: 'Landsat 8',
    color: Color.CYAN,
    description: 'NASA Earth observation satellite - Land & vegetation monitoring',
    tle1: '', // Real-time TLE data fetched from CelesTrak API
    tle2: ''
  },
  {
    noradId: 25994,
    name: 'Terra',
    color: Color.LIME,
    description: 'NASA atmospheric/ocean/land observation - NDVI/EVI data',
    tle1: '', // Real-time TLE data fetched from CelesTrak API
    tle2: ''
  },
  {
    noradId: 40697,
    name: 'Sentinel-2A',
    color: Color.YELLOW,
    description: 'ESA high-resolution optical satellite - Agriculture/forestry monitoring',
    tle1: '', // Real-time TLE data fetched from CelesTrak API
    tle2: ''
  },
  {
    noradId: 41866,
    name: 'GOES-16',
    color: Color.ORANGE,
    description: 'NOAA geostationary weather satellite - Real-time weather monitoring',
    tle1: '', // Real-time TLE data fetched from CelesTrak API
    tle2: ''
  }
];

const EarthGlobe: React.FC = () => {
  const viewerRef = useRef<CesiumViewer | null>(null);
  const [satellitePositions, setSatellitePositions] = useState<{[key: string]: Cartesian3}>({});
  const [cameraInitialized, setCameraInitialized] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date('2024-04-15T12:00:00')); // Default to April 2024 (peak bloom season)
  const [startTime, setStartTime] = useState<Date | null>(null); // Start time for range playback
  const [endTime, setEndTime] = useState<Date | null>(null); // Target end time for acceleration
  const [simulationSpeed, setSimulationSpeed] = useState(1); // 1 = real-time
  const [isPaused, setIsPaused] = useState(false);
  const [isEditingTime, setIsEditingTime] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false); // Track if time acceleration is active
  const [satellites, setSatellites] = useState(satelliteConfig); // Real-time updatable TLE data
  const [selectedLocation, setSelectedLocation] = useState<{lat: number, lng: number, name: string} | null>(null);
  const [selectedCartesian, setSelectedCartesian] = useState<Cartesian3 | null>(null); // Store 3D position for tracking
  const [activeLayers, setActiveLayers] = useState<LayerState>({ climate: false, bloom: true });
  const [searchQuery, setSearchQuery] = useState('');

  // Add debugging for active layers
  useEffect(() => {
  }, [activeLayers]);

  const [bloomData, setBloomData] = useState<BloomDataPoint[]>([]);
  const [globalBloomData, setGlobalBloomData] = useState<Map<string, BloomDataPoint[]>>(new Map());
  const [climateData, setClimateData] = useState<HistoricalClimateData[]>([]);
  const [dataCache, setDataCache] = useState<Map<string, { data: BloomDataPoint[], timestamp: number }>>(new Map());
  const [cameraHeight, setCameraHeight] = useState<number>(25000000);
  const [lastCameraUpdate, setLastCameraUpdate] = useState<number>(0);

  // Add camera height monitoring
  useEffect(() => {
    if (!viewerRef.current) return;

    const viewer = viewerRef.current;
    let cameraUpdateInterval: NodeJS.Timeout;

    const updateCameraHeight = () => {
      try {
        const currentHeight = viewer.camera.positionCartographic.height;
        if (Math.abs(currentHeight - cameraHeight) > 1000) { // Only update if significant change
          setCameraHeight(currentHeight);
          console.log(`📷 Camera height updated: ${Math.round(currentHeight / 1000)}km`);
        }
      } catch (error) {
        console.warn('⚠️ Error updating camera height:', error);
      }
    };

    // Update camera height every 500ms
    cameraUpdateInterval = setInterval(updateCameraHeight, 500);

    return () => {
      if (cameraUpdateInterval) {
        clearInterval(cameraUpdateInterval);
      }
    };
  }, [viewerRef.current, cameraHeight]);

  const handleLayerToggle = (layer: 'climate' | 'bloom') => {
    setActiveLayers(prev => {
      const newState = { ...prev, [layer]: !prev[layer] };
      return newState;
    });
  };

  // Load global bloom data on mount
  useEffect(() => {
    const loadGlobalBloomData = async () => {
      console.log('⏰ Load timestamp:', new Date().toISOString());
      console.log('📅 Current time state:', currentTime.toISOString());
      console.log('⏰ Load timestamp:', new Date().toISOString());

      try {
        // Load US East CSV data (ground truth)
        console.log('📂 Calling parseBloomCSV()...');
        const usEastData = await parseBloomCSV();

        if (!usEastData || usEastData.length === 0) {
          console.error('❌ No bloom data received from parseBloomCSV()');
          console.error('🔍 This indicates the CSV parsing failed completely');
        }

        // Load Americas data from Google Earth Engine exports
        console.log('🌎 Loading Americas data...');
        const currentYear = currentTime.getFullYear();
        const currentMonth = currentTime.getMonth() + 1;

        try {
          const americasData = await americasDataService.loadAmericasData(
            currentYear,
            currentMonth,
            'both' // Load both North and South America
          );

          console.log('🌎 Americas data loaded:', {
            points: americasData.length,
            year: currentYear,
            month: currentMonth
          });

          // Combine US East and Americas data
          const combinedData = [...usEastData, ...americasData];
          setBloomData(combinedData);

          // Initialize global bloom data with US East and Americas
          const initialGlobalData = new Map<string, BloomDataPoint[]>();

          // Separate US East data (it contains both initially)
          const usEastOnlyData = combinedData.filter((p: BloomDataPoint) => {
            // US East is roughly lon: -100 to -60, lat: 25 to 50
            return p.lon > -100 && p.lon < -60 && p.lat > 25 && p.lat < 50;
          });

          // Americas data is everything else (North and South America)
          const americasOnlyData = combinedData.filter((p: BloomDataPoint) => {
            // Americas but not US East
            return !(p.lon > -100 && p.lon < -60 && p.lat > 25 && p.lat < 50);
          });

          initialGlobalData.set('us-east', usEastOnlyData);
          initialGlobalData.set('americas', americasOnlyData);
          setGlobalBloomData(initialGlobalData);

          console.log('Global data initialized:', {
            usEast: usEastOnlyData.length,
            americas: americasOnlyData.length
          });
        } catch (error) {
          console.error('❌ Failed to load Americas data:', error);
          // Fall back to just US East data if Americas loading fails
          setBloomData(usEastData);

          // Still need to initialize global bloom data with just US East
          const initialGlobalData = new Map<string, BloomDataPoint[]>();
          initialGlobalData.set('us-east', usEastData);
          setGlobalBloomData(initialGlobalData);
        }

        // Convert bloom data to historical climate data
        const historicalClimate = bloomToClimateData(usEastData);
        setClimateData(historicalClimate);

        if (usEastData.length > 0) {
        }

      } catch (error: any) {
        console.error('💥 Critical error in loadGlobalBloomData:', error);
        console.error('🔍 Error details:', {
          name: error?.name || 'Unknown',
          message: error?.message || 'Unknown error',
          stack: error?.stack || 'No stack trace'
        });
      }
    };

    loadGlobalBloomData();
  }, []);

  // Load additional regional data when time changes - with caching
  useEffect(() => {
    const loadRegionalData = async () => {
      const currentYear = currentTime.getFullYear();
      const currentMonth = currentTime.getMonth() + 1;
      const cacheExpiryTime = 10 * 60 * 1000; // 10 minutes

      // Load Americas data for the new time period
      const cacheKey = `americas-${currentYear}-${currentMonth}`;
      const cachedData = dataCache.get(cacheKey);

      // Check if we have valid cached data
      if (cachedData && (Date.now() - cachedData.timestamp < cacheExpiryTime)) {
        setGlobalBloomData(prev => new Map(prev).set('americas', cachedData.data));
      } else {
        // Load new Americas data
        console.log(`🌎 Loading Americas data for ${currentYear}-${String(currentMonth).padStart(2, '0')}`);

        try {
          const americasData = await americasDataService.loadAmericasData(
            currentYear,
            currentMonth,
            'both'
          );


          // Store in cache
          setDataCache(prev => new Map(prev).set(cacheKey, {
            data: americasData,
            timestamp: Date.now()
          }));

          // Update global bloom data
          setGlobalBloomData(prev => new Map(prev).set('americas', americasData));
        } catch (error) {
          console.error('❌ Failed to load Americas data:', error);
        }
      }
    };

    // Only load regional data after initial US East data is loaded
    if (bloomData.length > 0) {
      loadRegionalData();
    }
  }, [currentTime, bloomData.length, dataCache]);

  // Auto-update TLE data every hour from CelesTrak API
  useEffect(() => {
    const cleanup = startTLEAutoUpdate((tleData) => {
      console.log('📡 Received TLE data:', tleData.size, 'satellites');
      setSatellites(prevSats =>
        prevSats.map(sat => {
          const updatedTLE = tleData.get(sat.noradId);
          if (updatedTLE) {
            return { ...sat, ...updatedTLE };
          } else {
            console.warn(`❌ No TLE data for ${sat.name} (NORAD ${sat.noradId})`);
          }
          return sat;
        })
      );
    });

    return cleanup;
  }, []);

  useEffect(() => {
    // Smooth simulation time update using requestAnimationFrame for 60fps
    let animationId: number;
    let lastTime = Date.now();

    const animate = () => {
      const now = Date.now();
      const delta = now - lastTime;
      lastTime = now;

      if (!isPaused && !isEditingTime) {
        setCurrentTime(prevTime => {
          // Determine direction based on end time
          const isReversing = endTime && endTime < prevTime;
          const direction = isReversing ? -1 : 1;
          const newTime = new Date(prevTime.getTime() + direction * simulationSpeed * delta);

          // Limit to 2015 minimum (CSV data starts from 2015)
          const minDate = new Date('2015-01-01T00:00:00');
          if (newTime < minDate) {
            return minDate;
          }

          // Stop at end time if set
          if (endTime) {
            if (isReversing && newTime <= endTime) {
              // Stop when rewinding reaches the end time
              setIsPaused(true);
              setIsPlaying(false);
              return endTime;
            } else if (!isReversing && newTime >= endTime) {
              // Stop when moving forward reaches the end time
              setIsPaused(true);
              setIsPlaying(false);
              return endTime;
            }
          }
          return newTime;
        });
      }
      animationId = requestAnimationFrame(animate);
    };

    animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
  }, [simulationSpeed, isPaused, isEditingTime, startTime, endTime]);

  useEffect(() => {
    // Real-time satellite position calculation using SGP4 propagation model
    let animationId: number;

    const updateSatellitePositions = () => {
      const positions: {[key: string]: Cartesian3} = {};

      satellites.forEach((sat) => {
        // Skip if TLE data not loaded yet
        if (!sat.tle1 || !sat.tle2) {
          return;
        }

        const satrec = satellite.twoline2satrec(sat.tle1, sat.tle2);
        const positionAndVelocity = satellite.propagate(satrec, currentTime);

        if (positionAndVelocity && positionAndVelocity.position && typeof positionAndVelocity.position !== 'boolean') {
          const positionEci = positionAndVelocity.position;
          const gmst = satellite.gstime(currentTime);
          const positionGd = satellite.eciToGeodetic(positionEci, gmst);

          const longitude = satellite.degreesLong(positionGd.longitude);
          const latitude = satellite.degreesLat(positionGd.latitude);
          const height = positionGd.height * 1000; // Convert km to meters

          // Validate position values before creating Cartesian3 coordinates
          if (!isNaN(longitude) && !isNaN(latitude) && !isNaN(height) &&
              isFinite(longitude) && isFinite(latitude) && isFinite(height) &&
              latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) {
            positions[sat.name] = Cartesian3.fromDegrees(longitude, latitude, height);
          } else {
            console.warn(`⚠️ Invalid position for ${sat.name}:`, { longitude, latitude, height });
          }
        } else {
          console.warn(`⚠️ Failed to propagate ${sat.name}:`, positionAndVelocity);
        }
      });

      setSatellitePositions(positions);
      animationId = requestAnimationFrame(updateSatellitePositions);
    };

    animationId = requestAnimationFrame(updateSatellitePositions);
    return () => cancelAnimationFrame(animationId);
  }, [currentTime, satellites]);

  useEffect(() => {
    if (viewerRef.current && !cameraInitialized) {
      const viewer = viewerRef.current;

      // Set initial camera position (runs only once)
      viewer.camera.setView({
        destination: Cartesian3.fromDegrees(0, 0, 25000000),
        orientation: {
          heading: 0,
          pitch: -Math.PI / 2,
          roll: 0
        }
      });

      // Configure camera movement controls
      const controller = viewer.scene.screenSpaceCameraController;
      controller.enableRotate = true;
      controller.enableZoom = true;
      controller.enableLook = false;
      controller.enableTilt = true;

      // Enable trackpad/touchpad zoom (two-finger pinch on MacBook)
      controller.enableInputs = true;
      controller.inertiaSpin = 0.9;
      controller.inertiaTranslate = 0.9;
      controller.inertiaZoom = 0.8;

      // Enable pinch/trackpad zoom for MacBook
      controller.zoomEventTypes = [
        CameraEventType.WHEEL,
        CameraEventType.PINCH
      ];

      // Tilt controls
      controller.tiltEventTypes = [
        CameraEventType.RIGHT_DRAG,
        {
          eventType: CameraEventType.LEFT_DRAG,
          modifier: KeyboardEventModifier.CTRL
        }
      ];

      // Set zoom limits to prevent black screen
      controller.minimumZoomDistance = 1000; // 1km minimum
      controller.maximumZoomDistance = 50000000; // 50,000km maximum

      setCameraInitialized(true);
    }
  }, [viewerRef.current]);

  useEffect(() => {
    if (!viewerRef.current) return;

    const viewer = viewerRef.current;

    // High-quality rendering settings
    viewer.scene.globe.enableLighting = true;
    viewer.scene.globe.maximumScreenSpaceError = 1.5;
    viewer.scene.globe.showGroundAtmosphere = true;

    // Enable Earth rotation animation with simulation speed
    viewer.clock.shouldAnimate = true;
    viewer.clock.multiplier = simulationSpeed; // Controlled by speed buttons

    // Set sun position based on current real time for realistic day/night
    viewer.scene.globe.atmosphereLightIntensity = 10.0; // Brighter sunlight

    // Update sun position based on current time
    const updateSunPosition = () => {
      const julianDate = viewer.clock.currentTime;
      viewer.scene.globe.enableLighting = true;
      // Cesium automatically calculates sun position from julianDate
    };

    updateSunPosition();
    viewer.clock.onTick.addEventListener(updateSunPosition);

    // CRITICAL: Enable actual Earth rotation by rotating camera around Earth
    let rotationHandler: any;
    const startRotation = () => {
      if (rotationHandler) return;

      rotationHandler = viewer.clock.onTick.addEventListener(() => {
        if (isPaused) return; // Don't rotate when paused

        const multiplier = viewer.clock.multiplier;
        if (multiplier <= 0) return;

        // Calculate rotation based on Earth's actual rotation speed
        // Earth rotates 360 degrees in 24 hours (86400 seconds)
        const secondsPerFrame = multiplier / 60; // Assuming 60fps
        const degreesPerSecond = 360 / 86400; // 0.00416667 degrees per second
        const rotationDegrees = degreesPerSecond * secondsPerFrame;

        // If a location is selected, keep camera locked on it
        if (selectedCartesian) {
          try {
            // Convert cartesian to lat/lon for stable tracking
            const cartographic = Cartographic.fromCartesian(selectedCartesian);
            const longitude = CesiumMath.toDegrees(cartographic.longitude);
            const latitude = CesiumMath.toDegrees(cartographic.latitude);

            // Maintain camera position and orientation relative to the selected point
            const currentHeight = viewer.camera.positionCartographic.height;
            const currentHeading = viewer.camera.heading;
            const currentPitch = viewer.camera.pitch;

            // Use setView for more stable camera positioning
            viewer.camera.setView({
              destination: Cartesian3.fromDegrees(longitude, latitude, currentHeight),
              orientation: {
                heading: currentHeading,
                pitch: currentPitch,
                roll: 0
              }
            });

            // Log tracking status occasionally
            if (Math.random() < 0.01) { // Log 1% of the time to avoid spam
              console.log('🔒 Camera tracking active at:', latitude.toFixed(2), longitude.toFixed(2));
            }
          } catch (error) {
            console.warn('Camera tracking error:', error);
          }
        } else {
          // Otherwise rotate camera normally
          viewer.scene.camera.rotateRight(CesiumMath.toRadians(rotationDegrees));
        }
      });
    };

    startRotation();

    // Load country boundaries - using simpler approach with PolylineCollection

    fetch('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson')
      .then(response => response.json())
      .then(geojson => {

        // Create entities for each country
        geojson.features.forEach((feature: any) => {
          const geometry = feature.geometry;
          const countryName = feature.properties.ADMIN || feature.properties.NAME || 'Unknown';

          if (geometry.type === 'Polygon') {
            const coordinates = geometry.coordinates[0]; // Outer ring
            const positions = coordinates.map((coord: number[]) =>
              Cartesian3.fromDegrees(coord[0], coord[1])
            );

            viewer.entities.add({
              name: countryName,
              polyline: {
                positions: positions,
                width: 1,
                material: Color.WHITE.withAlpha(0.5)
              },
              properties: {
                type: 'country-boundary',
                name: countryName
              }
            });
          } else if (geometry.type === 'MultiPolygon') {
            geometry.coordinates.forEach((polygon: any) => {
              const coordinates = polygon[0]; // Outer ring
              const positions = coordinates.map((coord: number[]) =>
                Cartesian3.fromDegrees(coord[0], coord[1])
              );

              viewer.entities.add({
                name: countryName,
                polyline: {
                  positions: positions,
                  width: 1,
                  material: Color.WHITE.withAlpha(0.5)
                },
                properties: {
                  type: 'country-boundary',
                  name: countryName
                }
              });
            });
          }
        });

      })
      .catch(error => {
        console.error('❌ Failed to load country boundaries:', error);
      });

    // Region click handler - zoom to selected location
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);


    // Single click - select country or region and zoom
    handler.setInputAction((click: any) => {
      console.log('👆 Click detected');

      // First, get the globe coordinates
      const cartesian = viewer.camera.pickEllipsoid(click.position, viewer.scene.globe.ellipsoid);
      if (!cartesian) return;

      const cartographic = Cartographic.fromCartesian(cartesian);
      const longitude = CesiumMath.toDegrees(cartographic.longitude);
      const latitude = CesiumMath.toDegrees(cartographic.latitude);

      // Check if clicked on a country polygon or satellite
      const pickedObject = viewer.scene.pick(click.position);
      let locationName = `Location: ${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°`;

      // If clicked on satellite, don't zoom
      if (pickedObject && pickedObject.id && pickedObject.id.position) {
        return;
      }

      // If clicked on a country polygon, get the country name
      if (pickedObject && pickedObject.id && pickedObject.id.polygon) {
        const entity = pickedObject.id;
        const countryName = entity.properties?.name?.getValue() ||
                           entity.properties?.NAME?.getValue() ||
                           entity.properties?.ADMIN?.getValue();

        if (countryName) {
          locationName = countryName;
          console.log('🌏 Clicked on country:', countryName);

          // Highlight selected country
          entity.polygon!.material = new ColorMaterialProperty(Color.CYAN.withAlpha(0.3));
          entity.polygon!.outlineColor = new ConstantProperty(Color.CYAN);
          entity.polygon!.outlineWidth = new ConstantProperty(3);
        }
      } else {
      }

      // Store both lat/lng and 3D cartesian position
      setSelectedLocation({
        lat: latitude,
        lng: longitude,
        name: locationName
      });
      setSelectedCartesian(cartesian); // Store 3D position for real-time tracking

      // Fly to clicked location at ground level
      viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(longitude, latitude, 5000), // 5km altitude
        orientation: {
          heading: viewer.camera.heading,
          pitch: -Math.PI / 12, // 15-degree slight downward angle
          roll: 0
        },
        duration: 1.5,
        complete: () => {
          // Enable tracking after fly animation completes
          if (selectedCartesian) {
            console.log('🔒 Camera lock enabled for location');
          }
        }
      });
    }, ScreenSpaceEventType.LEFT_CLICK);

    // Double-click - reset camera to global view
    handler.setInputAction(() => {
      setSelectedLocation(null);
      setSelectedCartesian(null);
      viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(0, 0, 25000000),
        orientation: {
          heading: 0,
          pitch: -Math.PI / 2,
          roll: 0
        },
        duration: 2.5
      });
    }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    return () => {
      console.log('🧹 Cleaning up event handler and rotation');
      handler.destroy();
      if (rotationHandler) {
        rotationHandler();
      }
    };
  }, [viewerRef.current, isPaused]);

  // Update simulation speed
  useEffect(() => {
    if (!viewerRef.current) return;

    const viewer = viewerRef.current;
    viewer.clock.multiplier = simulationSpeed;
  }, [simulationSpeed]);

  // Control pause/play state - stop Cesium clock and lighting updates
  useEffect(() => {
    if (!viewerRef.current) return;

    const viewer = viewerRef.current;
    viewer.clock.shouldAnimate = !isPaused;

    if (isPaused) {
    } else {
    }
  }, [isPaused]);

  // Real-time location update - convert 3D position to lat/lng as Earth rotates
  useEffect(() => {
    if (!viewerRef.current || !selectedCartesian) return;

    const viewer = viewerRef.current;
    let updateId: number;

    const updateLocation = () => {
      if (!selectedCartesian) return;

      // Convert 3D cartesian position to geographic coordinates
      const cartographic = Cartographic.fromCartesian(selectedCartesian);
      const longitude = CesiumMath.toDegrees(cartographic.longitude);
      const latitude = CesiumMath.toDegrees(cartographic.latitude);

      // Update location display
      setSelectedLocation(prev =>
        prev ? { ...prev, lat: latitude, lng: longitude } : null
      );

      updateId = requestAnimationFrame(updateLocation);
    };

    updateId = requestAnimationFrame(updateLocation);
    return () => cancelAnimationFrame(updateId);
  }, [selectedCartesian]);

  // Visualization layer management - optimized for performance
  useEffect(() => {
    if (!viewerRef.current) return;

    const viewer = viewerRef.current;
    const entities = viewer.entities;

    // Clear all visualization entities (keep satellites and countries)
    const visualizationEntities = entities.values.filter((e: any) => {
      if (!e.properties) return false;
      const vizType = e.properties.visualizationType?.getValue?.() || e.properties.visualizationType;
      return vizType === 'climate' || vizType === 'bloom' || vizType === 'ndvi';
    });
    visualizationEntities.forEach((e: any) => entities.remove(e));

    console.log('🔄 Visualization update:', {
      climate: activeLayers.climate,
      bloom: activeLayers.bloom,
      cameraHeight: Math.round(cameraHeight / 1000) + 'km',
      bloomDataCount: bloomData.length,
      globalBloomDataSize: globalBloomData.size,
      climateDataCount: climateData.length
    });

    // Use cached camera height for performance optimization
    const currentCameraHeight = cameraHeight;
    console.log(`📏 Current camera height: ${Math.round(currentCameraHeight / 1000)}km`);

    // Display historical climate risk layer if active (real data 2015-2024)
    if (activeLayers.climate && climateData.length > 0) {
      // Filter by current simulation time (year and month)
      const currentYear = currentTime.getFullYear();
      const currentMonth = currentTime.getMonth() + 1;
      const filteredClimateData = filterClimateDataByTime(climateData, currentYear, currentMonth);

      // Dynamic grid resolution based on camera height (LOD - Level of Detail)
      let gridSize = 0.15; // Default

      if (currentCameraHeight < 500000) {         // Very zoomed in - ultra high detail
        gridSize = 0.05;
      } else if (currentCameraHeight < 1000000) { // Zoomed in - high detail
        gridSize = 0.1;
      } else if (currentCameraHeight < 5000000) { // Medium zoom - medium detail
        gridSize = 0.15;
      } else {                              // Zoomed out - lower detail for performance
        gridSize = 0.25;
      }

      // Create complete tessellation with adaptive resolution
      const climateRegions = createClimateOverlayRegions(filteredClimateData, gridSize);

      // Render rectangle overlays for each climate region
      climateRegions.forEach((region: any) => {
        const colorString = getHistoricalClimateRiskColor(region.climateRiskScore);
        const cesiumColor = Color.fromCssColorString(colorString);

        entities.add({
          rectangle: {
            coordinates: Rectangle.fromDegrees(
              region.bounds.west,
              region.bounds.south,
              region.bounds.east,
              region.bounds.north
            ),
            material: cesiumColor,
            height: 0
          },
          properties: {
            visualizationType: 'climate',
            climateRiskScore: region.climateRiskScore,
            avgTemperature: region.avgTemperature,
            avgPrecipitation: region.avgPrecipitation,
            avgSoilMoisture: region.avgSoilMoisture,
            count: region.count,
            year: currentYear,
            month: currentMonth
          }
        });
      });

    } else {
      console.log(`🚫 CLIMATE LAYER NOT RENDERED:`, {
        climateLayerActive: activeLayers.climate,
        climateDataLength: climateData.length,
        reason: !activeLayers.climate ? 'climate layer inactive' : 'no climate data'
      });
    }

    // Display bloom status layer if active (global data) - PERFORMANCE OPTIMIZED
    if (activeLayers.bloom && globalBloomData.size > 0) {
      const currentYear = currentTime.getFullYear();
      const currentMonth = currentTime.getMonth() + 1;

      console.log('🌸 Bloom layer rendering:', {
        bloomLayerActive: activeLayers.bloom,
        globalBloomDataSize: globalBloomData.size,
        currentTime: { year: currentYear, month: currentMonth },
        cameraHeight: currentCameraHeight
      });

      let totalPoints = 0;

      // Calculate adaptive point limits based on zoom level for performance
      let maxPointsPerRegion: number;
      let pixelSize: number;

      if (currentCameraHeight < 1000000) {        // Zoomed in - show more detail
        maxPointsPerRegion = 3000;
        pixelSize = 8;
      } else if (currentCameraHeight < 5000000) { // Medium zoom
        maxPointsPerRegion = 1500;
        pixelSize = 6;
      } else if (currentCameraHeight < 15000000) { // Zoomed out
        maxPointsPerRegion = 800;
        pixelSize = 5;
      } else {                              // Very zoomed out - minimal points
        maxPointsPerRegion = 400;
        pixelSize = 4;
      }


      // Render data from all regions with performance optimization
      globalBloomData.forEach((regionData, regionId) => {
        console.log(`🗺️ Processing region ${regionId}:`, {
          regionDataLength: regionData.length,
          hasData: regionData.length > 0
        });

        if (regionData.length === 0) {
          console.warn(`⚠️ Region ${regionId} has no data, skipping`);
          return;
        }

        let filteredData: BloomDataPoint[] = [];

        // For US East, filter by time like before
        if (regionId === 'us-east') {
          filteredData = filterBloomDataByTime(regionData, currentYear, currentMonth);
          console.log(`📅 Time filtering for ${regionId}:`, {
            originalCount: regionData.length,
            filteredCount: filteredData.length,
            filterCriteria: { year: currentYear, month: currentMonth }
          });

          // Fallback to 2020 April for US East if no data
          if (filteredData.length === 0) {
            filteredData = filterBloomDataByTime(regionData, 2020, 4);
            console.log(`📅 No US East data for ${currentYear}-${currentMonth}, using 2020-04 data instead`);
          }

          // Try additional fallbacks if still no data
          if (filteredData.length === 0) {
            // Try any data from 2020
            const data2020 = filterBloomDataByTime(regionData, 2020, 1);
            if (data2020.length > 0) {
              filteredData = data2020;
            } else {
              // Use first available data
              filteredData = regionData.slice(0, 1000);
            }
          }
        } else {
          // For other regions, data is already generated for current time
          filteredData = regionData;
        }

        if (filteredData.length === 0) {
          console.warn(`⚠️ No filtered data for region ${regionId}, skipping render`);
          return;
        }


        // Apply performance-based point limiting with smart sampling
        let limitedData: BloomDataPoint[];

        console.log(`⚡ Performance limiting for ${regionId}:`, {
          filteredDataCount: filteredData.length,
          maxPointsPerRegion,
          needsLimiting: filteredData.length > maxPointsPerRegion,
          cameraHeight: Math.round(currentCameraHeight / 1000) + 'km'
        });

        if (filteredData.length > maxPointsPerRegion) {
          // Sample points - prioritize high NDVI and diverse bloom stages
          const sortedData = [...filteredData].sort((a, b) => {
            // Prioritize: 1) Peak bloom, 2) High NDVI, 3) Early bloom, 4) Pre-bloom
            const priorityA = a.label * 1000 + a.NDVI * 100;
            const priorityB = b.label * 1000 + b.NDVI * 100;
            return priorityB - priorityA;
          });

          // Take top priority points plus some random sampling for variety
          const topPriority = sortedData.slice(0, Math.floor(maxPointsPerRegion * 0.7));
          const randomSample = sortedData.slice(Math.floor(maxPointsPerRegion * 0.7))
            .filter((_, index) => index % 3 === 0)
            .slice(0, Math.floor(maxPointsPerRegion * 0.3));

          limitedData = [...topPriority, ...randomSample];

          console.log(`📊 Data sampling for ${regionId}:`, {
            original: filteredData.length,
            topPriority: topPriority.length,
            randomSample: randomSample.length,
            final: limitedData.length,
            reductionPercentage: Math.round((1 - limitedData.length / filteredData.length) * 100) + '%'
          });
        } else {
          limitedData = filteredData;
        }

        // Batch entity creation for better performance

        const pointEntities = limitedData.map((point, index) => {
          const entityOptions = {
            position: Cartesian3.fromDegrees(point.lon, point.lat),
            point: {
              pixelSize: regionId === 'us-east' ? pixelSize : Math.max(pixelSize - 1, 3),
              color: Color.fromCssColorString(getBloomStatusColor(point.label, point.NDVI)),
              outlineColor: Color.WHITE,
              outlineWidth: currentCameraHeight > 10000000 ? 0 : 1, // Remove outlines when very zoomed out
              disableDepthTestDistance: 0 // Always perform depth test so points behind Earth are hidden
            },
            properties: {
              visualizationType: 'bloom',
              bloomStatus: getBloomStatusName(point.label),
              ndvi: point.NDVI,
              region: regionId
            }
          };

          // Log sample entities for debugging
          if (index < 3) {
            console.log(`🎯 Sample entity ${index} for ${regionId}:`, {
              lat: point.lat,
              lon: point.lon,
              bloomStatus: getBloomStatusName(point.label),
              ndvi: point.NDVI,
              color: getBloomStatusColor(point.label, point.NDVI)
            });
          }

          return entityOptions;
        });


        // Add entities in smaller batches to prevent blocking
        const batchSize = 100;
        let entitiesAdded = 0;

        for (let i = 0; i < pointEntities.length; i += batchSize) {
          const batch = pointEntities.slice(i, i + batchSize);
          batch.forEach(entityOptions => {
            try {
              entities.add(entityOptions);
              entitiesAdded++;
            } catch (entityError) {
              console.error(`❌ Error adding entity:`, entityError);
            }
          });

          // Allow browser to breathe between batches
          if (i + batchSize < pointEntities.length) {
            setTimeout(() => {}, 0);
          }
        }

        totalPoints += limitedData.length;
        console.log(`⚡ Successfully added ${entitiesAdded}/${limitedData.length} entities for ${regionId}`);
      });


      if (totalPoints === 0) {
        console.error(`💥 CRITICAL: No bloom points were rendered despite having data!`);
        console.error(`🔍 Debug info:`, {
          bloomLayerActive: activeLayers.bloom,
          globalBloomDataSize: globalBloomData.size,
          bloomDataLength: bloomData.length,
          climateDataLength: climateData.length,
          currentTime: { year: currentYear, month: currentMonth }
        });
      }
    } else {
      console.log(`🚫 BLOOM LAYER NOT RENDERED:`, {
        bloomLayerActive: activeLayers.bloom,
        globalBloomDataSize: globalBloomData.size,
        reason: !activeLayers.bloom ? 'bloom layer inactive' : 'no global bloom data'
      });
    }

  }, [activeLayers, bloomData, globalBloomData, climateData, currentTime, viewerRef.current]);

  // Debug effect to monitor state changes
  useEffect(() => {
    console.log('🔄 State change detected:', {
      bloomDataLength: bloomData.length,
      globalBloomDataSize: globalBloomData.size,
      climateDataLength: climateData.length,
      activeLayers,
      currentTime: currentTime.toISOString(),
      viewerReady: !!viewerRef.current
    });
  }, [bloomData, globalBloomData, climateData, activeLayers, currentTime, viewerRef.current]);

  // Continuous zoom - hold to zoom in/out
  const [zoomInterval, setZoomInterval] = React.useState<NodeJS.Timeout | null>(null);

  const startZoomIn = () => {
    if (!viewerRef.current) return;
    const viewer = viewerRef.current;

    const height = viewer.camera.positionCartographic.height;
    viewer.camera.zoomIn(height * 0.15);

    const interval = setInterval(() => {
      if (!viewerRef.current) return;
      const h = viewerRef.current.camera.positionCartographic.height;
      viewerRef.current.camera.zoomIn(h * 0.15);
    }, 50);

    setZoomInterval(interval);
  };

  const startZoomOut = () => {
    if (!viewerRef.current) return;
    const viewer = viewerRef.current;

    const height = viewer.camera.positionCartographic.height;
    viewer.camera.zoomOut(height * 0.15);

    const interval = setInterval(() => {
      if (!viewerRef.current) return;
      const h = viewerRef.current.camera.positionCartographic.height;
      viewerRef.current.camera.zoomOut(h * 0.15);
    }, 50);

    setZoomInterval(interval);
  };

  const stopZoom = () => {
    if (zoomInterval) {
      clearInterval(zoomInterval);
      setZoomInterval(null);
    }
  };

  // Location search using Nominatim (OpenStreetMap Geocoding API)
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewerRef.current || !searchQuery.trim()) return;

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1`
      );
      const data = await response.json();

      if (data && data.length > 0) {
        const result = data[0];
        const lat = parseFloat(result.lat);
        const lon = parseFloat(result.lon);

        // Fly to the location
        viewerRef.current.camera.flyTo({
          destination: Cartesian3.fromDegrees(lon, lat, 10000),
          orientation: {
            heading: 0,
            pitch: -Math.PI / 4,
            roll: 0
          },
          duration: 2.0
        });

        // Set selected location
        setSelectedLocation({
          lat,
          lng: lon,
          name: result.display_name
        });
        setSelectedCartesian(Cartesian3.fromDegrees(lon, lat));

        console.log(`🔍 Found location: ${result.display_name}`);
      } else {
        console.warn('Location not found');
      }
    } catch (error) {
      console.error('Search error:', error);
    }
  };

  return (
    <div className="earth-globe-container">
      <ModeToggle layers={activeLayers} onLayerToggle={(layer: keyof LayerState) => {
        setActiveLayers(prev => ({ ...prev, [layer]: !prev[layer] }));
      }} />

      <form onSubmit={handleSearch} style={{
        position: 'absolute',
        top: '24px',
        left: '24px',
        zIndex: 999,
        width: '280px'
      }}>
        <div style={{ position: 'relative' }}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{
              position: 'absolute',
              left: '16px',
              top: '50%',
              transform: 'translateY(-50%)',
              opacity: 0.6,
              pointerEvents: 'none',
              zIndex: 1
            }}
          >
            <circle cx="6.5" cy="6.5" r="5" stroke="white" strokeWidth="1.5" fill="none"/>
            <path d="M10 10L14 14" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search location..."
            style={{
              width: '100%',
              padding: '12px 16px 12px 42px',
              borderRadius: '20px',
              background: 'rgba(255, 255, 255, 0.08)',
              backdropFilter: 'blur(80px) saturate(200%)',
              WebkitBackdropFilter: 'blur(80px) saturate(200%)',
              border: '0.5px solid rgba(255, 255, 255, 0.2)',
              color: 'white',
              fontSize: '15px',
              fontWeight: '400',
              letterSpacing: '-0.2px',
              fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", sans-serif',
              outline: 'none',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), 0 0 0 0.5px rgba(255, 255, 255, 0.18) inset, 0 1px 0 0 rgba(255, 255, 255, 0.15) inset',
              transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              boxSizing: 'border-box',
              textAlign: 'left',
              direction: 'ltr'
            }}
            onFocus={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
              e.currentTarget.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.25) inset, 0 1px 0 0 rgba(255, 255, 255, 0.2) inset';
            }}
            onBlur={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
              e.currentTarget.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.3), 0 0 0 0.5px rgba(255, 255, 255, 0.18) inset, 0 1px 0 0 rgba(255, 255, 255, 0.15) inset';
            }}
          />
        </div>
      </form>

      <div style={{
        position: 'absolute',
        left: '24px',
        top: '50%',
        transform: 'translateY(-50%)',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        zIndex: 1000,
        background: 'rgba(255, 255, 255, 0.08)',
        backdropFilter: 'blur(80px) saturate(200%)',
        WebkitBackdropFilter: 'blur(80px) saturate(200%)',
        border: '0.5px solid rgba(255, 255, 255, 0.2)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), 0 0 0 0.5px rgba(255, 255, 255, 0.18) inset, 0 1px 0 0 rgba(255, 255, 255, 0.15) inset',
        borderRadius: '20px',
        padding: '6px'
      }}>
        <button
          onMouseDown={startZoomIn}
          onMouseUp={stopZoom}
          onTouchStart={startZoomIn}
          onTouchEnd={stopZoom}
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '14px',
            background: 'transparent',
            border: 'none',
            color: 'white',
            fontSize: '22px',
            fontWeight: '300',
            fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            padding: 0,
            margin: 0,
            lineHeight: 1
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            stopZoom();
          }}
        >
          +
        </button>
        <button
          onMouseDown={startZoomOut}
          onMouseUp={stopZoom}
          onTouchStart={startZoomOut}
          onTouchEnd={stopZoom}
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '14px',
            background: 'transparent',
            border: 'none',
            color: 'white',
            fontSize: '22px',
            fontWeight: '300',
            fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            padding: 0,
            margin: 0,
            lineHeight: 1
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            stopZoom();
          }}
        >
          −
        </button>
      </div>

      <div style={{
        position: 'absolute',
        bottom: '24px',
        left: selectedLocation ? '20px' : '50%',
        transform: selectedLocation ? 'none' : 'translateX(-50%)',
        background: 'rgba(255, 255, 255, 0.08)',
        backdropFilter: 'blur(80px) saturate(200%)',
        WebkitBackdropFilter: 'blur(80px) saturate(200%)',
        border: '0.5px solid rgba(255, 255, 255, 0.2)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), 0 0 0 0.5px rgba(255, 255, 255, 0.18) inset, 0 1px 0 0 rgba(255, 255, 255, 0.15) inset',
        color: 'white',
        padding: '16px 28px',
        borderRadius: '20px',
        display: 'flex',
        alignItems: 'center',
        gap: '20px',
        zIndex: 1000,
        transition: 'left 0.3s ease, transform 0.3s ease'
      }}>
        <div style={{
          fontSize: '16px',
          fontWeight: '600',
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
          letterSpacing: '-0.03em'
        }}>
          {currentTime.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
          }).replace(/,/g, '')}
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => {
              setCurrentTime(new Date());
              setSimulationSpeed(1);
            }}
            style={{
              padding: '8px 16px',
              background: 'rgba(255, 255, 255, 0.95)',
              color: 'rgba(0, 0, 0, 0.95)',
              border: 'none',
              borderRadius: '14px',
              cursor: 'pointer',
              fontWeight: '590',
              fontSize: '14px',
              fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
          >
            Now
          </button>
          <button
            onClick={() => setSimulationSpeed(1)}
            style={{
              padding: '8px 16px',
              background: simulationSpeed === 1 ? 'rgba(255, 255, 255, 0.2)' : 'transparent',
              color: 'white',
              border: 'none',
              borderRadius: '14px',
              cursor: 'pointer',
              fontWeight: '400',
              fontSize: '14px',
              fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
          >
            1×
          </button>
          <button
            onClick={() => setSimulationSpeed(60)}
            style={{
              padding: '8px 16px',
              background: simulationSpeed === 60 ? 'rgba(255, 255, 255, 0.2)' : 'transparent',
              color: 'white',
              border: 'none',
              borderRadius: '14px',
              cursor: 'pointer',
              fontWeight: '400',
              fontSize: '14px',
              fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
          >
            1m
          </button>
          <button
            onClick={() => setSimulationSpeed(3600)}
            style={{
              padding: '8px 16px',
              background: simulationSpeed === 3600 ? 'rgba(255, 255, 255, 0.2)' : 'transparent',
              color: 'white',
              border: 'none',
              borderRadius: '14px',
              cursor: 'pointer',
              fontWeight: '400',
              fontSize: '14px',
              fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
          >
            1h
          </button>
          <button
            onClick={() => setSimulationSpeed(86400)}
            style={{
              padding: '8px 16px',
              background: simulationSpeed === 86400 ? 'rgba(255, 255, 255, 0.2)' : 'transparent',
              color: 'white',
              border: 'none',
              borderRadius: '14px',
              cursor: 'pointer',
              fontWeight: '400',
              fontSize: '14px',
              fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
          >
            1d
          </button>
          <button
            onClick={() => setSimulationSpeed(2592000)}
            style={{
              padding: '8px 16px',
              background: simulationSpeed === 2592000 ? 'rgba(255, 255, 255, 0.2)' : 'transparent',
              color: 'white',
              border: 'none',
              borderRadius: '14px',
              cursor: 'pointer',
              fontWeight: '400',
              fontSize: '14px',
              fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
          >
            1M
          </button>
        </div>

        {/* Playback controls - Cassette-style */}
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          {/* Rewind button - Skip 1 month back */}
          <button
            onClick={() => {
              setCurrentTime(prevTime => {
                const newTime = new Date(prevTime);
                newTime.setMonth(newTime.getMonth() - 1); // Rewind 1 month
                const minDate = new Date('2015-01-01T00:00:00');
                return newTime < minDate ? minDate : newTime;
              });
            }}
            title="Previous Month"
            style={{
              padding: '4px',
              background: 'transparent',
              color: 'rgba(255, 255, 255, 0.7)',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center'
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.transform = 'scale(0.95)';
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.95)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M8 1L3 6l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" style={{marginLeft: '-6px'}}>
              <path d="M8 1L3 6l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
          </button>

          {/* Play/Pause button */}
          <button
            onClick={() => {
              setIsPaused(prev => !prev);
              setIsPlaying(prev => !prev);
            }}
            style={{
              padding: '8px 20px',
              background: isPaused ? 'rgba(255, 59, 48, 0.6)' : 'rgba(52, 199, 89, 0.6)',
              color: 'white',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '12px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '18px',
              fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
              transition: 'all 0.2s ease',
              backdropFilter: 'blur(10px)',
              willChange: 'background'
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.transform = 'scale(0.95)';
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            {isPaused ? '▶' : '⏸'}
          </button>

          {/* Fast-forward button - Skip 1 month forward */}
          <button
            onClick={() => {
              setCurrentTime(prevTime => {
                const newTime = new Date(prevTime);
                newTime.setMonth(newTime.getMonth() + 1); // Forward 1 month
                const maxDate = new Date();
                return newTime > maxDate ? maxDate : newTime;
              });
            }}
            title="Next Month"
            style={{
              padding: '4px',
              background: 'transparent',
              color: 'rgba(255, 255, 255, 0.7)',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center'
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.transform = 'scale(0.95)';
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.95)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" style={{marginRight: '-6px'}}>
              <path d="M4 1l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M4 1l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
          </button>
        </div>

        {/* Start time input */}
        <input
          type="text"
          placeholder="YYYY-MM"
          onFocus={(e) => {
            e.target.select(); // Select all text on focus
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const inputElement = e.target as HTMLInputElement;
              let value = inputElement.value.trim();

              // Parse the input directly
              let match = value.match(/^(\d{4})[\s\/\-\.]?(\d{1,2})$/);

              if (match) {
                const [, yearStr, monthStr] = match;
                const year = parseInt(yearStr);
                let month = parseInt(monthStr);

                // Validate month range
                if (month < 1) month = 1;
                if (month > 12) month = 12;

                // Check year limits (2015 minimum)
                const targetYear = year < 2015 ? 2015 : year;
                const newDate = new Date(targetYear, month - 1, 1);

                // Jump to this time immediately
                setCurrentTime(newDate);

                // Format and update the input field
                const formattedValue = `${targetYear}-${String(month).padStart(2, '0')}`;
                inputElement.value = formattedValue;

                // Update startTime state
                setStartTime(newDate);
              }

              inputElement.blur(); // Remove focus
            }
          }}
          onBlur={(e) => {
            let value = e.target.value.trim();

            // Auto-format: Allow flexible input formats
            // Support: YYYY-M, YYYY/M, YYYY.M, YYYYMM, YYYY M
            let match = value.match(/^(\d{4})[\s\/\-\.]?(\d{1,2})$/);

            if (match) {
              const [, yearStr, monthStr] = match;
              const year = parseInt(yearStr);
              let month = parseInt(monthStr);

              // Validate month range
              if (month < 1) month = 1;
              if (month > 12) month = 12;

              // Format to YYYY-MM
              const formattedValue = `${year}-${String(month).padStart(2, '0')}`;
              e.target.value = formattedValue;

              const newDate = new Date(year, month - 1, 1);

              if (!isNaN(newDate.getTime())) {
                // Limit to 2015 minimum (CSV data starts from 2015)
                const minDate = new Date('2015-01-01');
                const maxDate = new Date();

                if (newDate < minDate) {
                  // Flash red border for invalid date
                  e.target.style.border = '1px solid rgba(255, 59, 48, 0.8)';
                  setTimeout(() => {
                    e.target.style.border = '1px solid rgba(255, 255, 255, 0.25)';
                  }, 1500);
                  // Set to minimum date
                  setStartTime(minDate);
                  e.target.value = '2015-01';
                } else if (newDate > maxDate) {
                  // Don't allow future dates
                  setStartTime(maxDate);
                  const maxYear = maxDate.getFullYear();
                  const maxMonth = maxDate.getMonth() + 1;
                  e.target.value = `${maxYear}-${String(maxMonth).padStart(2, '0')}`;
                } else {
                  setStartTime(newDate);
                }
              }
            } else if (value) {
              // Invalid format - flash red and clear
              e.target.style.border = '1px solid rgba(255, 59, 48, 0.8)';
              setTimeout(() => {
                e.target.style.border = '1px solid rgba(255, 255, 255, 0.25)';
              }, 1500);
            } else {
              // Clear start time if empty
              setStartTime(null);
            }
          }}
          style={{
            padding: '8px 14px',
            background: 'rgba(255, 255, 255, 0.15)',
            color: 'white',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            borderRadius: '12px',
            cursor: 'text',
            fontWeight: '500',
            fontSize: '14px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
            backdropFilter: 'blur(10px)',
            width: '120px',
            outline: 'none'
          }}
        />

        {/* End time input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            color: 'rgba(255, 255, 255, 0.6)',
            fontSize: '14px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif'
          }}>
            to
          </span>
          <input
            type="text"
            placeholder="YYYY-MM"
            style={{
              padding: '8px 12px',
              background: 'rgba(255, 255, 255, 0.05)',
              color: 'white',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '8px',
              fontSize: '14px',
              fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
              width: '120px',
              outline: 'none',
              transition: 'all 0.2s ease'
            }}
            onFocus={(e) => {
              e.target.style.background = 'rgba(255, 255, 255, 0.08)';
              e.target.style.border = '1px solid rgba(255, 255, 255, 0.4)';
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur();
              }
            }}
            onBlur={(e) => {
              // Reset styles
              e.target.style.background = 'rgba(255, 255, 255, 0.05)';
              e.target.style.border = '1px solid rgba(255, 255, 255, 0.2)';

              // Process input value
              let value = e.target.value.trim();
              if (!value) {
                setEndTime(null);
                return;
              }

              // Auto-format: Allow flexible input formats
              let match = value.match(/^(\d{4})[\s\/\-\.]?(\d{1,2})$/);

              if (match) {
                const [, yearStr, monthStr] = match;
                const year = parseInt(yearStr);
                let month = parseInt(monthStr);

                // Validate month range
                if (month < 1) month = 1;
                if (month > 12) month = 12;

                // Format to YYYY-MM
                const formattedValue = `${year}-${String(month).padStart(2, '0')}`;
                e.target.value = formattedValue;

                const newDate = new Date(year, month - 1, 1);

                if (!isNaN(newDate.getTime())) {
                  // Ensure end time is after 2015
                  const minDate = new Date('2015-01-01');

                  if (newDate < minDate) {
                    // Flash red border for invalid date
                    e.target.style.border = '1px solid rgba(255, 59, 48, 0.8)';
                    setTimeout(() => {
                      e.target.style.border = '1px solid rgba(255, 255, 255, 0.2)';
                    }, 1500);
                    // Clear invalid input
                    e.target.value = '';
                    setEndTime(null);
                  } else {
                    setEndTime(newDate);
                  }
                }
              } else if (value) {
                // Invalid format - flash red
                e.target.style.border = '1px solid rgba(255, 59, 48, 0.8)';
                setTimeout(() => {
                  e.target.style.border = '1px solid rgba(255, 255, 255, 0.2)';
                }, 1500);
              }
            }}
          />
          {startTime && endTime && (
            <button
              onClick={() => {
                // Jump to start time and begin playback to end time
                console.log(`🎬 Starting playback from ${startTime.toISOString()} to ${endTime.toISOString()}`);
                setCurrentTime(startTime);
                setIsPaused(false);
                setIsPlaying(true);
              }}
              style={{
                padding: '4px 10px',
                background: 'rgba(52, 199, 89, 0.2)',
                color: 'rgba(52, 199, 89, 0.9)',
                border: '1px solid rgba(52, 199, 89, 0.3)',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: '600',
                fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(52, 199, 89, 0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(52, 199, 89, 0.2)';
              }}
            >
              Start
            </button>
          )}
        </div>
      </div>

      <Viewer
        ref={(ref) => {
          viewerRef.current = ref?.cesiumElement || null;
        }}
        full
        timeline={false}
        animation={false}
        homeButton={false}
        sceneModePicker={false}
        baseLayerPicker={false}
        navigationHelpButton={false}
        geocoder={false}
        fullscreenButton={false}
        vrButton={false}
        infoBox={false}
        selectionIndicator={false}
        useBrowserRecommendedResolution={false}
      >
        {/* Real-time satellite position visualization using NASA TLE data */}
        {satellites.map((sat) =>
          satellitePositions[sat.name] ? (
            <Entity
              key={sat.name}
              name={sat.name}
              position={satellitePositions[sat.name]}
              point={{
                pixelSize: 8,
                color: sat.color,
                outlineColor: Color.WHITE,
                outlineWidth: 2
              }}
              label={{
                text: `🛰️ ${sat.name}`,
                font: '12px sans-serif',
                fillColor: Color.WHITE,
                outlineColor: Color.BLACK,
                outlineWidth: 2,
                verticalOrigin: 1 as any,
                pixelOffset: new Cartesian3(0, -35, 0) as any
              }}
              description={sat.description}
            />
          ) : null
        )}
      </Viewer>

      {/* Data Panel */}
      <DataPanel
        location={selectedLocation}
        activeLayers={activeLayers}
        currentTime={currentTime}
      />
    </div>
  );
};

export default EarthGlobe;