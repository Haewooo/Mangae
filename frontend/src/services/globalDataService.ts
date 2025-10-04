/**
 * Global Data Service for World-Scale Bloom Data
 * Handles millions to billions of points globally
 */

import { BloomDataPoint } from '../types';

export interface DataChunk {
  region: string;
  bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  data: BloomDataPoint[];
  totalCount: number;
  loadedCount: number;
}

export class GlobalDataService {
  private regionChunks: Map<string, DataChunk> = new Map();
  private loadingQueue: string[] = [];
  private isLoading: boolean = false;
  private maxMemoryMB: number = 500; // Max 500MB in memory
  private currentMemoryMB: number = 0;

  /**
   * Define world regions for chunked loading
   */
  private readonly WORLD_REGIONS = [
    { id: 'north-america', bounds: { minLat: 15, maxLat: 75, minLon: -170, maxLon: -50 }},
    { id: 'south-america', bounds: { minLat: -60, maxLat: 15, minLon: -90, maxLon: -30 }},
    { id: 'europe', bounds: { minLat: 35, maxLat: 75, minLon: -15, maxLon: 50 }},
    { id: 'africa', bounds: { minLat: -35, maxLat: 35, minLon: -20, maxLon: 55 }},
    { id: 'asia', bounds: { minLat: 0, maxLat: 75, minLon: 50, maxLon: 150 }},
    { id: 'oceania', bounds: { minLat: -50, maxLat: 0, minLon: 110, maxLon: 180 }},
  ];

  /**
   * Load data for visible viewport
   */
  async loadViewportData(
    viewport: { bounds: any; zoom: number },
    time: { year: number; month: number }
  ): Promise<BloomDataPoint[]> {
    // Determine which regions intersect viewport
    const visibleRegions = this.getVisibleRegions(viewport.bounds);

    // Calculate data resolution based on zoom
    const resolution = this.getResolutionForZoom(viewport.zoom);

    const allData: BloomDataPoint[] = [];

    for (const region of visibleRegions) {
      // Check if region is cached
      const cached = this.regionChunks.get(region.id);

      if (cached && this.isCacheValid(cached, time)) {
        allData.push(...this.filterByTime(cached.data, time));
      } else {
        // Queue for loading
        this.queueRegionLoad(region.id);
      }
    }

    // Start loading queued regions
    this.processLoadQueue();

    // Apply LOD based on zoom
    return this.applyLOD(allData, viewport.zoom);
  }

  /**
   * Get visible regions for viewport
   */
  private getVisibleRegions(viewportBounds: any) {
    return this.WORLD_REGIONS.filter(region => {
      return !(
        region.bounds.maxLat < viewportBounds.south ||
        region.bounds.minLat > viewportBounds.north ||
        region.bounds.maxLon < viewportBounds.west ||
        region.bounds.minLon > viewportBounds.east
      );
    });
  }

  /**
   * Get data resolution based on zoom level
   */
  private getResolutionForZoom(zoom: number): 'low' | 'medium' | 'high' | 'ultra' {
    if (zoom > 10000000) return 'low';    // Global view - 0.1% of points
    if (zoom > 1000000) return 'medium';  // Continental - 1% of points
    if (zoom > 100000) return 'high';     // Country - 10% of points
    return 'ultra';                       // Local - 100% of points
  }

  /**
   * Apply Level of Detail to reduce points
   */
  private applyLOD(data: BloomDataPoint[], zoom: number): BloomDataPoint[] {
    const resolution = this.getResolutionForZoom(zoom);

    const sampleRates = {
      'low': 0.001,    // 0.1%
      'medium': 0.01,  // 1%
      'high': 0.1,     // 10%
      'ultra': 1.0     // 100%
    };

    const sampleRate = sampleRates[resolution];

    if (sampleRate === 1.0) {
      return data;
    }

    // Smart sampling - prioritize bloom events
    const bloomPoints = data.filter(p => p.label > 0);
    const normalPoints = data.filter(p => p.label === 0);

    const sampledBloom = this.smartSample(bloomPoints, Math.floor(bloomPoints.length * sampleRate * 2));
    const sampledNormal = this.smartSample(normalPoints, Math.floor(normalPoints.length * sampleRate));

    return [...sampledBloom, ...sampledNormal];
  }

  /**
   * Smart sampling algorithm
   */
  private smartSample(data: BloomDataPoint[], targetCount: number): BloomDataPoint[] {
    if (data.length <= targetCount) {
      return data;
    }

    // Grid-based sampling for spatial distribution
    const gridSize = Math.sqrt(targetCount);
    const latStep = 180 / gridSize;
    const lonStep = 360 / gridSize;

    const grid: Map<string, BloomDataPoint[]> = new Map();

    // Assign points to grid cells
    for (const point of data) {
      const gridLat = Math.floor((point.lat + 90) / latStep);
      const gridLon = Math.floor((point.lon + 180) / lonStep);
      const key = `${gridLat},${gridLon}`;

      if (!grid.has(key)) {
        grid.set(key, []);
      }
      grid.get(key)!.push(point);
    }

    // Sample from each grid cell
    const sampled: BloomDataPoint[] = [];
    grid.forEach(cellPoints => {
      if (cellPoints.length > 0) {
        // Take highest NDVI point from each cell
        const best = cellPoints.reduce((a, b) => a.NDVI > b.NDVI ? a : b);
        sampled.push(best);
      }
    });

    return sampled;
  }

  /**
   * Queue region for background loading
   */
  private queueRegionLoad(regionId: string): void {
    if (!this.loadingQueue.includes(regionId)) {
      this.loadingQueue.push(regionId);
    }
  }

  /**
   * Process loading queue
   */
  private async processLoadQueue(): Promise<void> {
    if (this.isLoading || this.loadingQueue.length === 0) {
      return;
    }

    this.isLoading = true;
    const regionId = this.loadingQueue.shift()!;

    try {
      // Check memory before loading
      if (this.currentMemoryMB > this.maxMemoryMB) {
        this.evictLRURegion();
      }

      // In production, this would be an API call
      // For now, we'll simulate loading
      console.log(`📦 Loading region: ${regionId}`);

      // Simulate API call
      // const response = await fetch(`/api/bloom-data/${regionId}`);
      // const data = await response.json();

      // Store in cache
      // this.regionChunks.set(regionId, {
      //   region: regionId,
      //   bounds: ...,
      //   data: data,
      //   totalCount: data.length,
      //   loadedCount: data.length
      // });

    } catch (error) {
      console.error(`Failed to load region ${regionId}:`, error);
    } finally {
      this.isLoading = false;
      // Continue processing queue
      if (this.loadingQueue.length > 0) {
        setTimeout(() => this.processLoadQueue(), 100);
      }
    }
  }

  /**
   * Evict least recently used region from cache
   */
  private evictLRURegion(): void {
    // Simple LRU eviction
    const firstKey = this.regionChunks.keys().next().value;
    if (firstKey) {
      const chunk = this.regionChunks.get(firstKey)!;
      this.currentMemoryMB -= this.estimateMemoryMB(chunk.data);
      this.regionChunks.delete(firstKey);
      console.log(`🗑️ Evicted region: ${firstKey}`);
    }
  }

  /**
   * Estimate memory usage of data
   */
  private estimateMemoryMB(data: BloomDataPoint[]): number {
    // Each BloomDataPoint is roughly 13 properties * 8 bytes = 104 bytes
    return (data.length * 104) / (1024 * 1024);
  }

  /**
   * Check if cache is valid for time
   */
  private isCacheValid(cache: DataChunk, time: { year: number; month: number }): boolean {
    // Check if cache contains data for requested time
    return cache.data.some(p => p.year === time.year && p.month === time.month);
  }

  /**
   * Filter data by time
   */
  private filterByTime(
    data: BloomDataPoint[],
    time: { year: number; month: number }
  ): BloomDataPoint[] {
    return data.filter(p => p.year === time.year && p.month === time.month);
  }

  /**
   * Get memory statistics
   */
  getMemoryStats() {
    return {
      currentMB: this.currentMemoryMB,
      maxMB: this.maxMemoryMB,
      regions: this.regionChunks.size,
      queueLength: this.loadingQueue.length
    };
  }
}

// Singleton instance
export const globalDataService = new GlobalDataService();

/**
 * Future improvements for billion-scale data:
 *
 * 1. WebWorker for data processing
 * 2. IndexedDB for client-side caching
 * 3. WebAssembly for decompression
 * 4. Protocol Buffers instead of JSON
 * 5. HTTP/2 Server Push for prefetching
 * 6. CDN with edge computing
 * 7. GraphQL for flexible queries
 */