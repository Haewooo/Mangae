/**
 * Americas Data Service
 * Handles Google Earth Engine exported data for North and South America
 */

import { BloomDataPoint } from '../types';

export interface AmericasDataInfo {
  northAmerica: {
    files: string[];
    totalPoints: number;
    yearRange: [number, number];
  };
  southAmerica: {
    files: string[];
    totalPoints: number;
    yearRange: [number, number];
  };
}

export class AmericasDataService {
  private cache: Map<string, BloomDataPoint[]> = new Map();
  private loadingStatus: Map<string, boolean> = new Map();
  private dataInfo: AmericasDataInfo = {
    northAmerica: {
      files: [
        'NorthAmerica_features_labels_2015_2016.csv',
        'NorthAmerica_features_labels_2017_2018.csv',
        'NorthAmerica_features_labels_2019_2020.csv',
        'NorthAmerica_features_labels_2021_2022.csv',
        'NorthAmerica_features_labels_2023_2024.csv'
      ],
      totalPoints: 0,
      yearRange: [2015, 2024]
    },
    southAmerica: {
      files: [
        'SouthAmerica_features_labels_2015_2016.csv',
        'SouthAmerica_features_labels_2017_2018.csv',
        'SouthAmerica_features_labels_2019_2020.csv',
        'SouthAmerica_features_labels_2021_2022.csv',
        'SouthAmerica_features_labels_2023_2024.csv'
      ],
      totalPoints: 0,
      yearRange: [2015, 2024]
    }
  };

  /**
   * Load Americas data for specific year and month
   */
  async loadAmericasData(
    year: number,
    month: number,
    region: 'north' | 'south' | 'both' = 'both'
  ): Promise<BloomDataPoint[]> {
    console.log(`🌎 Loading Americas data for ${year}-${month}, region: ${region}`);

    const results: BloomDataPoint[] = [];

    // Load North America data
    if (region === 'north' || region === 'both') {
      const northData = await this.loadRegionData('north', year, month);
      results.push(...northData);
    }

    // Load South America data
    if (region === 'south' || region === 'both') {
      const southData = await this.loadRegionData('south', year, month);
      results.push(...southData);
    }

    console.log(`✅ Loaded ${results.length} total points for Americas`);
    return results;
  }

  /**
   * Load data for specific region
   */
  private async loadRegionData(
    region: 'north' | 'south',
    year: number,
    month: number
  ): Promise<BloomDataPoint[]> {
    // Determine which file contains the requested year
    const fileName = this.getFileNameForYear(region, year);
    if (!fileName) {
      console.warn(`⚠️ No data file for ${region} America, year ${year}`);
      return [];
    }

    const cacheKey = `${region}_${fileName}`;

    // Check cache first
    if (!this.cache.has(cacheKey)) {
      // Load file if not in cache
      await this.loadFile(region, fileName);
    }

    const allData = this.cache.get(cacheKey) || [];

    // Filter by year and month
    const filteredData = allData.filter(
      point => point.year === year && point.month === month
    );

    console.log(`📍 ${region === 'north' ? 'North' : 'South'} America: ${filteredData.length} points for ${year}-${month}`);
    return filteredData;
  }

  /**
   * Get file name for specific year
   */
  private getFileNameForYear(region: 'north' | 'south', year: number): string | null {
    const files = region === 'north'
      ? this.dataInfo.northAmerica.files
      : this.dataInfo.southAmerica.files;

    for (const file of files) {
      // Extract year range from filename
      const match = file.match(/(\d{4})_(\d{4})/);
      if (match) {
        const startYear = parseInt(match[1]);
        const endYear = parseInt(match[2]);
        if (year >= startYear && year <= endYear) {
          return file;
        }
      }
    }

    return null;
  }

  /**
   * Load CSV file and parse data
   */
  private async loadFile(region: 'north' | 'south', fileName: string): Promise<void> {
    const cacheKey = `${region}_${fileName}`;

    // Check if already loading
    if (this.loadingStatus.get(cacheKey)) {
      console.log(`⏳ Already loading ${fileName}`);
      return;
    }

    this.loadingStatus.set(cacheKey, true);

    try {
      console.log(`📂 Loading ${fileName}...`);
      const response = await fetch(`/GEE_Exports_Americas/${fileName}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const text = await response.text();

      const data = this.parseCSV(text);
      this.cache.set(cacheKey, data);

      // Update data info
      if (region === 'north') {
        this.dataInfo.northAmerica.totalPoints += data.length;
      } else {
        this.dataInfo.southAmerica.totalPoints += data.length;
      }

      console.log(`✅ Loaded ${data.length} points from ${fileName}`);
    } catch (error) {
      console.error(`❌ Failed to load ${fileName}:`, error);
      // Set empty cache to prevent repeated attempts
      this.cache.set(cacheKey, []);
    } finally {
      this.loadingStatus.set(cacheKey, false);
    }
  }

  /**
   * Parse CSV data
   */
  private parseCSV(text: string): BloomDataPoint[] {
    const lines = text.split('\n').filter(line => line.trim());
    const headers = lines[0].split(',');

    // Map GEE header names to our format
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
      AGDD: headers.indexOf('GDDm'), // GDDm in Americas data
      aet: headers.indexOf('aet'),
      pet: headers.indexOf('pet'),
      def: headers.indexOf('def')
    };

    const data: BloomDataPoint[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',');

      if (values.length === headers.length) {
        const point: BloomDataPoint = {
          lat: parseFloat(values[indices.lat]),
          lon: parseFloat(values[indices.lon]),
          tmean: parseFloat(values[indices.tmean]),
          pr: parseFloat(values[indices.pr]),
          NDVI: parseFloat(values[indices.NDVI]),
          label: parseInt(values[indices.label]) || 0,
          month: parseInt(values[indices.month]),
          year: parseInt(values[indices.year]),
          srad: parseFloat(values[indices.srad]),
          soil: parseFloat(values[indices.soil]),
          vpd: parseFloat(values[indices.vpd]),
          dtr: parseFloat(values[indices.dtr]),
          AGDD: parseFloat(values[indices.AGDD]) || 0
        };

        // Validate data point
        if (!isNaN(point.lat) && !isNaN(point.lon) &&
            point.lat >= -90 && point.lat <= 90 &&
            point.lon >= -180 && point.lon <= 180) {
          data.push(point);
        }
      }
    }

    return data;
  }

  /**
   * Preload all Americas data
   */
  async preloadAllData(): Promise<void> {
    console.log('🚀 Preloading all Americas data...');

    const allFiles = [
      ...this.dataInfo.northAmerica.files,
      ...this.dataInfo.southAmerica.files
    ];

    const loadPromises = allFiles.map(fileName => {
      const region = fileName.startsWith('North') ? 'north' : 'south';
      return this.loadFile(region, fileName);
    });

    await Promise.all(loadPromises);

    console.log(`✅ Preloaded all Americas data:`);
    console.log(`  North America: ${this.dataInfo.northAmerica.totalPoints} points`);
    console.log(`  South America: ${this.dataInfo.southAmerica.totalPoints} points`);
  }

  /**
   * Get data for viewport bounds
   */
  async getDataForViewport(
    bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number },
    year: number,
    month: number
  ): Promise<BloomDataPoint[]> {
    // Determine which regions to load based on bounds
    const loadNorth = bounds.maxLat > 15 && bounds.minLon < -50;
    const loadSouth = bounds.minLat < 15 && bounds.minLon < -30;

    let region: 'north' | 'south' | 'both' = 'both';
    if (loadNorth && !loadSouth) region = 'north';
    else if (!loadNorth && loadSouth) region = 'south';

    const allData = await this.loadAmericasData(year, month, region);

    // Filter by viewport bounds
    return allData.filter(point =>
      point.lat >= bounds.minLat &&
      point.lat <= bounds.maxLat &&
      point.lon >= bounds.minLon &&
      point.lon <= bounds.maxLon
    );
  }

  /**
   * Get data statistics
   */
  getStatistics() {
    let totalCachedPoints = 0;
    this.cache.forEach(data => {
      totalCachedPoints += data.length;
    });

    return {
      northAmerica: this.dataInfo.northAmerica,
      southAmerica: this.dataInfo.southAmerica,
      cachedFiles: this.cache.size,
      totalCachedPoints,
      memoryUsageMB: Math.round(totalCachedPoints * 104 / 1024 / 1024) // Rough estimate
    };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    this.loadingStatus.clear();
    this.dataInfo.northAmerica.totalPoints = 0;
    this.dataInfo.southAmerica.totalPoints = 0;
    console.log('🗑️ Americas data cache cleared');
  }
}

// Singleton instance
export const americasDataService = new AmericasDataService();