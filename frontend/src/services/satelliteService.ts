import axios from 'axios';

/**
 * NASA Space Apps Challenge 2024 - Satellite Tracking Service
 * Real-time TLE data fetching from NASA/NORAD official sources
 */

// Fetch real-time TLE data from alternative API
export const fetchTLEFromCelesTrak = async (noradId: number): Promise<{ tle1: string; tle2: string } | null> => {
  try {
    // Try alternative TLE API first
    const response = await axios.get(`https://tle.ivanstanojevic.me/api/tle/${noradId}`);

    if (response.data && response.data.line1 && response.data.line2) {
      console.log(`✅ TLE data fetched for ${response.data.name} (${noradId})`);
      return {
        tle1: response.data.line1,
        tle2: response.data.line2
      };
    }
    return null;
  } catch (error) {
    console.error(`Failed to fetch TLE for NORAD ${noradId}:`, error);

    // Fallback to original CelesTrak if alternative fails
    try {
      const fallbackResponse = await axios.get(`https://celestrak.org/NORAD/elements/gp.php?CATNR=${noradId}&FORMAT=TLE`);
      const lines = fallbackResponse.data.trim().split('\n');

      if (lines.length >= 3) {
        return {
          tle1: lines[1].trim(),
          tle2: lines[2].trim()
        };
      }
    } catch (fallbackError) {
      console.error(`Fallback TLE fetch also failed for NORAD ${noradId}:`, fallbackError);
    }

    return null;
  }
};

// Batch fetch TLE data for multiple satellites
export const fetchMultipleTLE = async (noradIds: number[]): Promise<Map<number, { tle1: string; tle2: string }>> => {
  const tleMap = new Map<number, { tle1: string; tle2: string }>();

  const promises = noradIds.map(async (noradId) => {
    const tle = await fetchTLEFromCelesTrak(noradId);
    if (tle) {
      tleMap.set(noradId, tle);
    }
  });

  await Promise.all(promises);
  return tleMap;
};

// Space-Track.org API (requires authentication)
// Note: Add REACT_APP_SPACETRACK_USER and REACT_APP_SPACETRACK_PASS to .env file
export const fetchTLEFromSpaceTrack = async (noradId: number): Promise<{ tle1: string; tle2: string } | null> => {
  try {
    const username = process.env.REACT_APP_SPACETRACK_USER;
    const password = process.env.REACT_APP_SPACETRACK_PASS;

    if (!username || !password) {
      console.warn('Space-Track credentials not configured. Using CelesTrak instead.');
      return fetchTLEFromCelesTrak(noradId);
    }

    // Space-Track API authentication
    const loginResponse = await axios.post('https://www.space-track.org/ajaxauth/login',
      `identity=${username}&password=${password}`,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    // Fetch TLE data from Space-Track
    const tleResponse = await axios.get(
      `https://www.space-track.org/basicspacedata/query/class/gp/NORAD_CAT_ID/${noradId}/orderby/EPOCH%20desc/limit/1/format/tle`
    );

    const lines = tleResponse.data.trim().split('\n');
    // Space-Track also returns 3-line format: name, TLE line 1, TLE line 2
    if (lines.length >= 3) {
      return {
        tle1: lines[1].trim(), // TLE Line 1
        tle2: lines[2].trim()  // TLE Line 2
      };
    }

    return null;
  } catch (error) {
    console.error(`Failed to fetch from Space-Track for NORAD ${noradId}:`, error);
    // Fallback to CelesTrak
    return fetchTLEFromCelesTrak(noradId);
  }
};

// Fetch real-time satellite position from N2YO API (requires API key)
export const fetchSatellitePosition = async (noradId: number, observerLat: number, observerLng: number, observerAlt: number = 0): Promise<any> => {
  try {
    const apiKey = process.env.REACT_APP_N2YO_API_KEY;

    if (!apiKey) {
      console.warn('N2YO API key not configured');
      return null;
    }

    const response = await axios.get(
      `https://api.n2yo.com/rest/v1/satellite/positions/${noradId}/${observerLat}/${observerLng}/${observerAlt}/1`,
      { params: { apiKey } }
    );

    return response.data;
  } catch (error) {
    console.error(`Failed to fetch position from N2YO for NORAD ${noradId}:`, error);
    return null;
  }
};

// NASA Earth observation satellites tracked in this application
export const SATELLITES = [
  { noradId: 39084, name: 'Landsat 8', description: 'NASA Earth observation satellite - Land & vegetation monitoring' },
  { noradId: 25994, name: 'Terra', description: 'NASA atmospheric/ocean/land observation - NDVI/EVI data' },
  { noradId: 40697, name: 'Sentinel-2A', description: 'ESA high-resolution optical satellite - Agriculture/forestry monitoring' },
  { noradId: 41866, name: 'GOES-16', description: 'NOAA geostationary weather satellite - Real-time weather monitoring' },
];

// Auto-update TLE data every hour to maintain accuracy
export const startTLEAutoUpdate = (callback: (tleData: Map<number, { tle1: string; tle2: string }>) => void) => {
  const updateTLE = async () => {
    const noradIds = SATELLITES.map(sat => sat.noradId);
    const tleData = await fetchMultipleTLE(noradIds);
    callback(tleData);
  };

  // Execute immediately on startup
  updateTLE();

  // Update every hour (3600000ms)
  const interval = setInterval(updateTLE, 60 * 60 * 1000);

  return () => clearInterval(interval);
};
