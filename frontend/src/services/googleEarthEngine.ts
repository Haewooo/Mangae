// Google Earth Engine API Service for bloom visualization
// Documentation: https://developers.google.com/earth-engine/

export interface EEImageLayer {
  name: string;
  eeObject: any; // ee.Image or ee.ImageCollection
  visParams: {
    min?: number | number[];
    max?: number | number[];
    palette?: string[];
    bands?: string[];
    opacity?: number;
  };
}

// Initialize Google Earth Engine
export const initializeEarthEngine = async (): Promise<void> => {
  return new Promise((resolve, reject) => {
    // Load the Google Earth Engine API
    const script = document.createElement('script');
    script.src = 'https://earthengine.googleapis.com/v1/earthengine.js';
    script.onload = () => {
      // Initialize with API key
      (window as any).ee.initialize(
        null, // Use default API endpoint
        null, // Use default tile provider
        () => {
          resolve();
        },
        (error: any) => {
          console.error('❌ Failed to initialize Earth Engine:', error);
          reject(error);
        }
      );
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
};

// Create bloom status layer using Earth Engine
export const createBloomLayer = (year: number, month: number): EEImageLayer => {
  const ee = (window as any).ee;

  // Use MODIS NDVI data as proxy for bloom status
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(month).padStart(2, '0')}-28`;

  // MODIS NDVI 16-day composite
  const ndvi = ee.ImageCollection('MODIS/006/MOD13A1')
    .filterDate(startDate, endDate)
    .select('NDVI')
    .mean()
    .multiply(0.0001); // Scale factor

  // Classify NDVI into bloom stages
  const bloomStatus = ee.Image(0)
    .where(ndvi.gt(0.3).and(ndvi.lte(0.5)), 1)  // Pre-bloom
    .where(ndvi.gt(0.5).and(ndvi.lte(0.7)), 2)  // Blooming
    .where(ndvi.gt(0.7), 3);                     // Full bloom

  return {
    name: 'Bloom Status',
    eeObject: bloomStatus,
    visParams: {
      min: 0,
      max: 3,
      palette: ['#CCCCCC', '#FFB6C1', '#FF1493', '#800020'] // Gray, Light Pink, Deep Pink, Burgundy
    }
  };
};

// Create NDVI layer
export const createNDVILayer = (year: number, month: number): EEImageLayer => {
  const ee = (window as any).ee;

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(month).padStart(2, '0')}-28`;

  const ndvi = ee.ImageCollection('MODIS/006/MOD13A1')
    .filterDate(startDate, endDate)
    .select('NDVI')
    .mean()
    .multiply(0.0001);

  return {
    name: 'NDVI',
    eeObject: ndvi,
    visParams: {
      min: 0,
      max: 0.8,
      palette: ['#FFFFFF', '#CE7E45', '#DF923D', '#F1B555', '#FCD163', '#99B718',
                '#74A901', '#66A000', '#529400', '#3E8601', '#207401', '#056201',
                '#004C00', '#023B01', '#012E01', '#011D01', '#011301']
    }
  };
};

// Create temperature anomaly layer
export const createTemperatureLayer = (year: number, month: number): EEImageLayer => {
  const ee = (window as any).ee;

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(month).padStart(2, '0')}-28`;

  // ERA5 temperature data
  const temperature = ee.ImageCollection('ECMWF/ERA5_LAND/HOURLY')
    .filterDate(startDate, endDate)
    .select('temperature_2m')
    .mean()
    .subtract(273.15); // Convert K to C

  return {
    name: 'Temperature',
    eeObject: temperature,
    visParams: {
      min: -10,
      max: 35,
      palette: ['#0000FF', '#00FFFF', '#00FF00', '#FFFF00', '#FF0000']
    }
  };
};

// Get Earth Engine map tiles URL
export const getEETileUrl = (layer: EEImageLayer): string => {
  const ee = (window as any).ee;

  // Get the map ID and token
  const mapId = layer.eeObject.getMap(layer.visParams);

  // Return the tile URL template
  return `https://earthengine.googleapis.com/v1/projects/earthengine-public/maps/${mapId.mapid}/tiles/{z}/{x}/{y}`;
};

// Export Earth Engine layer to Cesium
export const addEELayerToCesium = (
  viewer: any, // Cesium.Viewer
  layer: EEImageLayer,
  opacity: number = 1.0
): any => {
  const tileUrl = getEETileUrl(layer);

  // Add as imagery provider
  const imageryProvider = new (window as any).Cesium.UrlTemplateImageryProvider({
    url: tileUrl,
    credit: 'Google Earth Engine'
  });

  const imageryLayer = viewer.imageryLayers.addImageryProvider(imageryProvider);
  imageryLayer.alpha = opacity;
  imageryLayer.name = layer.name;

  return imageryLayer;
};

// Authenticate with Earth Engine (requires OAuth2)
export const authenticateEarthEngine = async (): Promise<void> => {
  const ee = (window as any).ee;

  return new Promise((resolve, reject) => {
    ee.data.authenticateViaOauth(
      // Client ID from Google Cloud Console
      process.env.REACT_APP_GEE_CLIENT_ID,
      () => {
        resolve();
      },
      (error: any) => {
        console.error('❌ Authentication failed:', error);
        reject(error);
      },
      // Additional scopes
      ['https://www.googleapis.com/auth/earthengine'],
      // Auto-prompt for permissions
      true
    );
  });
};