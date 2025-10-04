/**
 * NASA Space Apps Challenge 2024 - Climate & Bloom Data Service
 * Provides climate risk assessment and bloom/phenology visualization data
 */

export interface ClimateRiskData {
  latitude: number;
  longitude: number;
  riskLevel: 'high' | 'medium' | 'low';
  temperature: number; // Celsius
  precipitation: number; // mm/year
  ndvi: number; // Normalized Difference Vegetation Index (-1 to 1)
}

export interface BloomData {
  latitude: number;
  longitude: number;
  bloomStatus: 'active' | 'emerging' | 'dormant';
  ndvi: number;
  peakBloomDate: Date | null;
  confidence: number; // 0-1
}

/**
 * Generate mock climate risk data for visualization
 * In production, this would fetch from NASA APIs (MODIS, Landsat)
 */
export const getClimateRiskData = (lat: number, lng: number): ClimateRiskData => {
  // Mock algorithm based on latitude (higher latitudes = lower risk in this simplified model)
  const absLat = Math.abs(lat);
  const riskScore = (90 - absLat) / 90; // 0-1 scale

  let riskLevel: 'high' | 'medium' | 'low';
  if (riskScore > 0.7) riskLevel = 'high';
  else if (riskScore > 0.4) riskLevel = 'medium';
  else riskLevel = 'low';

  return {
    latitude: lat,
    longitude: lng,
    riskLevel,
    temperature: 25 - (absLat * 0.5) + (Math.random() * 5), // Simplified temp model
    precipitation: 1000 + (Math.random() * 500),
    ndvi: 0.3 + (Math.random() * 0.4) // Mock NDVI value
  };
};

/**
 * Generate mock bloom data based on NDVI
 * In production, this would use real MODIS/Landsat NDVI data
 */
export const getBloomData = (lat: number, lng: number): BloomData => {
  const ndvi = 0.2 + (Math.random() * 0.6); // Mock NDVI (-1 to 1, but vegetation is usually 0.2-0.8)

  let bloomStatus: 'active' | 'emerging' | 'dormant';
  if (ndvi > 0.6) bloomStatus = 'active';
  else if (ndvi > 0.4) bloomStatus = 'emerging';
  else bloomStatus = 'dormant';

  // Mock peak bloom date (spring months for northern hemisphere)
  const peakMonth = lat > 0 ? 4 : 10; // April for north, October for south
  const peakBloomDate = new Date(new Date().getFullYear(), peakMonth, 15);

  return {
    latitude: lat,
    longitude: lng,
    bloomStatus,
    ndvi,
    peakBloomDate,
    confidence: 0.7 + (Math.random() * 0.3) // 70-100% confidence
  };
};

/**
 * Generate grid of climate risk points for global visualization
 * Returns array of risk data points in a grid pattern
 */
export const generateClimateRiskGrid = (resolution: number = 10): ClimateRiskData[] => {
  const points: ClimateRiskData[] = [];

  for (let lat = -90; lat <= 90; lat += resolution) {
    for (let lng = -180; lng <= 180; lng += resolution) {
      points.push(getClimateRiskData(lat, lng));
    }
  }

  return points;
};

/**
 * Generate grid of bloom status points for global visualization
 * Returns array of bloom data points in a grid pattern
 */
export const generateBloomGrid = (resolution: number = 10): BloomData[] => {
  const points: BloomData[] = [];

  for (let lat = -90; lat <= 90; lat += resolution) {
    for (let lng = -180; lng <= 180; lng += resolution) {
      // Skip oceans (simplified - only show land areas with some randomness)
      if (Math.random() > 0.7) continue; // 70% ocean coverage

      points.push(getBloomData(lat, lng));
    }
  }

  return points;
};

/**
 * Get color for climate risk level (traffic light system)
 */
export const getClimateRiskColor = (riskLevel: 'high' | 'medium' | 'low'): string => {
  switch (riskLevel) {
    case 'high': return '#FF0000'; // Red
    case 'medium': return '#FFA500'; // Orange
    case 'low': return '#00FF00'; // Green
  }
};

/**
 * Get color for bloom status
 */
export const getBloomColor = (bloomStatus: 'active' | 'emerging' | 'dormant'): string => {
  switch (bloomStatus) {
    case 'active': return '#FF69B4'; // Hot pink (active bloom)
    case 'emerging': return '#FFB6C1'; // Light pink (emerging)
    case 'dormant': return '#8B7355'; // Brown (dormant)
  }
};
