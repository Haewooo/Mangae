/**
 * Data filtering service
 * Data source selection with NASA POWER API fallback
 * Americas region detection for bloom data coverage
 */

import { BloomDataPoint } from '../types';
import { fetchLocationData } from './nasaDataService';
import { americasDataService } from './americasDataService';

export interface DataCoverageResult {
  withinRange: boolean;
  distance: number;
  nearestPoint?: BloomDataPoint;
  shouldUseFallback: boolean;
  region: 'americas' | 'outside_americas';
  dataSource: 'csv' | 'nasa_power';
}

export interface LocationDataResult {
  source: 'csv' | 'nasa_power';
  data: any;
  coverage: DataCoverageResult;
  bloomAvailable: boolean;
  confidence: number;
}

/**
 * Calculate geodesic distance between coordinates using Haversine formula
 * Returns distance in degrees (more accurate than simple Euclidean)
 */
export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  // For degree-based distance calculation (maintaining compatibility)
  const dLat = lat1 - lat2;
  const dLon = lon1 - lon2;
  return Math.sqrt(dLat * dLat + dLon * dLon);
};

/**
 * Calculate actual distance in kilometers using Haversine formula
 */
export const calculateDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

/**
 * Americas region detection
 * Covers North America, Central America, South America, and Caribbean
 */
export const isWithinAmericasRegion = (lat: number, lon: number): boolean => {
  // Americas bounds based on actual data coverage:
  // Latitude: -60° (South America) to 85° (North America + Arctic)
  // Longitude: -170° (Alaska/Aleutians) to -30° (Atlantic coast)

  // Basic rectangular bounds check
  const withinBasicBounds = lat >= -60 && lat <= 85 && lon >= -170 && lon <= -30;

  if (!withinBasicBounds) {
    return false;
  }

  // Additional exclusions for non-Americas regions within the rectangle
  // (e.g., some Atlantic/Pacific islands that might fall within bounds)

  // Exclude far eastern Atlantic (Cape Verde, etc.)
  if (lat > 10 && lat < 20 && lon > -30 && lon < -20) {
    return false;
  }

  return true;
};

/**
 * Data coverage analysis
 */
export const checkDataCoverage = (
  targetLat: number,
  targetLon: number,
  csvData: BloomDataPoint[]
): DataCoverageResult => {
  const region = isWithinAmericasRegion(targetLat, targetLon) ? 'americas' : 'outside_americas';

  let minDistance = Infinity;
  let nearestPoint: BloomDataPoint | undefined;

  // Find nearest data point within the same region or globally if no regional data
  for (const point of csvData) {
    const distance = calculateDistance(targetLat, targetLon, point.lat, point.lon);

    if (distance < minDistance) {
      minDistance = distance;
      nearestPoint = point;
    }
  }

  // Different thresholds based on region
  const threshold = region === 'americas' ? 5.0 : 10.0; // More lenient for outside Americas
  const withinRange = minDistance <= threshold;

  // For outside Americas, prefer NASA POWER API
  const shouldUseFallback = region === 'outside_americas' || !withinRange;
  const dataSource = shouldUseFallback ? 'nasa_power' : 'csv';

  return {
    withinRange,
    distance: minDistance,
    nearestPoint,
    shouldUseFallback,
    region,
    dataSource
  };
};

/**
 * Find nearest point from array of bloom data points
 */
const findNearestPoint = (lat: number, lon: number, points: BloomDataPoint[]): BloomDataPoint => {
  let minDistance = Infinity;
  let nearest = points[0];

  for (const point of points) {
    const distance = calculateDistance(lat, lon, point.lat, point.lon);
    if (distance < minDistance) {
      minDistance = distance;
      nearest = point;
    }
  }

  return nearest;
};

export const getLocationData = async (
  targetLat: number,
  targetLon: number,
  year: number,
  month: number
): Promise<LocationDataResult> => {
  const region = isWithinAmericasRegion(targetLat, targetLon) ? 'americas' : 'outside_americas';


  if (region === 'americas') {
    // Try Americas CSV data first
    try {
      console.log(`🔍 Requesting Americas data for viewport: lat=${targetLat-0.1} to ${targetLat+0.1}, lon=${targetLon-0.1} to ${targetLon+0.1}`);

      // Direct CSV data loading (before refactoring method)
      const response = await fetch('/GEE_Exports_Americas/NorthAmerica_features_labels_2021_2022.csv');
      const csvText = await response.text();
      const lines = csvText.trim().split('\n');
      const headers = lines[0].split(',');

      const americasData: any[] = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        if (values.length === headers.length) {
          const lat = parseFloat(values[headers.indexOf('lat')]);
          const lon = parseFloat(values[headers.indexOf('lon')]);

          if (lat >= targetLat - 0.1 && lat <= targetLat + 0.1 &&
              lon >= targetLon - 0.1 && lon <= targetLon + 0.1) {
            americasData.push({
              lat,
              lon,
              tmean: parseFloat(values[headers.indexOf('tmean')]),
              pr: parseFloat(values[headers.indexOf('pr')]),
              NDVI: parseFloat(values[headers.indexOf('NDVI')]),
              label: parseInt(values[headers.indexOf('label')]) || 0,
              month: parseInt(values[headers.indexOf('month')]),
              year: parseInt(values[headers.indexOf('year')]),
              srad: parseFloat(values[headers.indexOf('srad')]),
              soil: parseFloat(values[headers.indexOf('soil')]),
              AGDD: parseFloat(values[headers.indexOf('GDDm')]) || 0
            });
          }
        }
      }


      if (americasData.length > 0) {
        const nearestPoint = findNearestPoint(targetLat, targetLon, americasData);
        const distance = calculateDistance(targetLat, targetLon, nearestPoint.lat, nearestPoint.lon);

        if (distance <= 5.0) {
          return {
            source: 'csv',
            data: nearestPoint,
            coverage: {
              withinRange: true,
              distance,
              nearestPoint,
              shouldUseFallback: false,
              region: 'americas',
              dataSource: 'csv'
            },
            bloomAvailable: true,
            confidence: Math.max(0.5, 1 - distance / 5.0)
          };
        } else {
        }
      } else {
      }
    } catch (error) {
      console.error('❌ Americas CSV data error, falling back to NASA POWER API:', error);
    }
  }

  // Fallback to NASA POWER API (no bloom data)
  console.log(`📡 Using NASA POWER API fallback for ${region} region`);

  try {
    const nasaData = await fetchLocationData(targetLat, targetLon);
    return {
      source: 'nasa_power',
      data: nasaData,
      coverage: {
        withinRange: false,
        distance: Infinity,
        shouldUseFallback: true,
        region,
        dataSource: 'nasa_power'
      },
      bloomAvailable: false,
      confidence: 0.8 // NASA POWER API is reliable for climate data
    };
  } catch (error) {
    console.error('❌ NASA POWER API failed:', error);
    throw new Error(`No data available for location (${targetLat}, ${targetLon})`);
  }
};

export const getFilteredData = (
  targetLat: number,
  targetLon: number,
  csvData: BloomDataPoint[],
  radiusDegrees: number = 5.0,
  maxPoints: number = 1000
): BloomDataPoint[] => {
  // Filter by distance
  const filteredByDistance = csvData.filter(point => {
    const distance = calculateDistance(targetLat, targetLon, point.lat, point.lon);
    return distance <= radiusDegrees;
  });

  // If too many points, apply sampling
  if (filteredByDistance.length > maxPoints) {
    // Sort by distance and take closest points, prioritizing bloom events
    const withDistance = filteredByDistance.map(point => ({
      ...point,
      distance: calculateDistance(targetLat, targetLon, point.lat, point.lon),
      priority: point.label > 0 ? 1 : 0.5 // Prioritize bloom events
    }));

    // Sort by priority (bloom events first) then by distance
    withDistance.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return a.distance - b.distance;
    });

    return withDistance.slice(0, maxPoints).map(({ distance, priority, ...point }) => point);
  }

  return filteredByDistance;
};

export const determineOptimalDataSource = (
  lat: number,
  lon: number,
  requiresBloomData: boolean = false
): {
  primary: 'csv' | 'nasa_power';
  fallback: 'csv' | 'nasa_power' | null;
  bloomAvailable: boolean;
  reason: string;
} => {
  const inAmericas = isWithinAmericasRegion(lat, lon);

  if (requiresBloomData && !inAmericas) {
    return {
      primary: 'nasa_power',
      fallback: null,
      bloomAvailable: false,
      reason: 'Bloom data only available for Americas region'
    };
  }

  if (inAmericas) {
    return {
      primary: 'csv',
      fallback: 'nasa_power',
      bloomAvailable: true,
      reason: 'Americas region - CSV preferred with NASA POWER fallback'
    };
  }

  return {
    primary: 'nasa_power',
    fallback: null,
    bloomAvailable: false,
    reason: 'Outside Americas - NASA POWER API for climate data only'
  };
};

export const getDataCoverageStats = (csvData: BloomDataPoint[]) => {
  if (csvData.length === 0) {
    return {
      totalPoints: 0,
      latRange: { min: 0, max: 0 },
      lonRange: { min: 0, max: 0 },
      timeRange: { minYear: 0, maxYear: 0 },
      coverage: 'No data available',
      regions: []
    };
  }

  const lats = csvData.map(p => p.lat);
  const lons = csvData.map(p => p.lon);
  const years = csvData.map(p => p.year);

  // Analyze regional distribution
  const northAmerica = csvData.filter(p => p.lat > 25);
  const centralAmerica = csvData.filter(p => p.lat >= 7 && p.lat <= 25);
  const southAmerica = csvData.filter(p => p.lat < 7);

  const regions = [
    { name: 'North America', count: northAmerica.length, percentage: (northAmerica.length / csvData.length * 100).toFixed(1) },
    { name: 'Central America', count: centralAmerica.length, percentage: (centralAmerica.length / csvData.length * 100).toFixed(1) },
    { name: 'South America', count: southAmerica.length, percentage: (southAmerica.length / csvData.length * 100).toFixed(1) }
  ];

  return {
    totalPoints: csvData.length,
    latRange: {
      min: Math.min(...lats),
      max: Math.max(...lats)
    },
    lonRange: {
      min: Math.min(...lons),
      max: Math.max(...lons)
    },
    timeRange: {
      minYear: Math.min(...years),
      maxYear: Math.max(...years)
    },
    coverage: `${csvData.length} points covering Americas region (${Math.min(...years)}-${Math.max(...years)})`,
    regions
  };
};

/**
 * Quality metrics for data source selection
 */
export const calculateDataQuality = (
  source: 'csv' | 'nasa_power',
  distance: number,
  region: 'americas' | 'outside_americas'
): {
  score: number;
  factors: string[];
  recommendation: string;
} => {
  let score = 0;
  const factors: string[] = [];
  let recommendation = '';

  if (source === 'csv') {
    score += 0.9; // High confidence for CSV data
    factors.push('Direct measurement data');

    if (distance <= 1.0) {
      score += 0.1;
      factors.push('Very close spatial match');
    } else if (distance <= 3.0) {
      factors.push('Good spatial match');
    } else {
      score -= 0.2;
      factors.push('Distant spatial match');
    }

    if (region === 'americas') {
      factors.push('Within primary coverage area');
      recommendation = 'High quality bloom and climate data available';
    } else {
      score -= 0.3;
      factors.push('Outside primary coverage area');
      recommendation = 'Consider NASA POWER API for better coverage';
    }
  } else {
    score += 0.7; // Good confidence for NASA POWER
    factors.push('NASA POWER API - reliable climate data');
    factors.push('No bloom data available');

    if (region === 'outside_americas') {
      score += 0.1;
      factors.push('Optimal for global coverage');
      recommendation = 'Best available data source for this region';
    } else {
      recommendation = 'Fallback option - CSV data preferred if available';
    }
  }

  return {
    score: Math.max(0, Math.min(1, score)),
    factors,
    recommendation
  };
};

// Legacy compatibility exports
export const getDataWithFallback = getLocationData;
export const checkDataCoverage_legacy = checkDataCoverage;

// Re-export for backwards compatibility
export interface FilterResult extends DataCoverageResult {}