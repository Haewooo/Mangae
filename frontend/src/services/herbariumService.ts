/**
 * Herbarium Data Service
 * Handles GBIF Herbarium Senckenbergianum plant specimen data
 */

export interface HerbariumRecord {
  gbifID: string;
  scientificName: string;
  species: string;
  genus: string;
  family: string;
  latitude: number;
  longitude: number;
  country: string;
  stateProvince: string;
  locality: string;
  eventDate: string;
  year: string;
  month: string;
  day: string;
  blooming?: number[] | null;
  bloomingLabels?: string[] | null;
  blooming_conditions?: {
    flowering_phenology: string;
    flowering_period: string;
    temperature_range: { min: number; max: number };
    precipitation_range: { min: number; max: number };
    habitat_type: string;
    climate_conditions: {
      temp_min: number;
      temp_max: number;
      precip_min: number;
      precip_max: number;
      humidity: number;
    };
  } | null;
  data_confidence?: number | null;
  data_sources?: string[] | null;
}

export interface IUCNData {
  total_with_iucn: number;
  status_counts: Record<string, number>;
  endangered_species: Record<string, string[]>;
  descriptions: Record<string, string>;
}

export type IUCNStatus = 'CR' | 'EN' | 'VU' | 'NT' | 'LC' | 'DD' | 'EX' | 'EW';

class HerbariumService {
  private data: HerbariumRecord[] = [];
  private isLoaded: boolean = false;
  private isLoading: boolean = false;
  private loadPromise: Promise<HerbariumRecord[]> | null = null;
  private iucnData: IUCNData | null = null;
  private iucnLoaded: boolean = false;

  /**
   * Load herbarium data from JSON file
   */
  async loadData(): Promise<HerbariumRecord[]> {
    if (this.isLoaded) {
      return this.data;
    }

    if (this.isLoading && this.loadPromise) {
      return this.loadPromise;
    }

    this.isLoading = true;
    this.loadPromise = this.fetchData();

    try {
      this.data = await this.loadPromise;
      this.isLoaded = true;
      console.log(`🌿 Herbarium data loaded: ${this.data.length} specimens`);
      return this.data;
    } catch (error) {
      console.error('❌ Failed to load herbarium data:', error);
      this.isLoading = false;
      this.loadPromise = null;
      throw error;
    }
  }

  private async fetchData(): Promise<HerbariumRecord[]> {
    const response = await fetch('/herbarium/processed_data_final_augmented.json');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const jsonData = await response.json();
    
    // JSON이 배열이면 그대로, { records: [...] } 형태면 records 추출
    return Array.isArray(jsonData) ? jsonData : jsonData.records ?? [];
  }

  /**
   * Find nearest specimen to given coordinates
   */
  findNearestSpecimen(
    targetLat: number,
    targetLon: number,
    maxDistance: number = 10.0 // degrees
  ): { specimen: HerbariumRecord; distance: number } | null {
    if (!this.isLoaded || this.data.length === 0) {
      return null;
    }

    let minDistance = Infinity;
    let nearest: HerbariumRecord | null = null;

    for (const specimen of this.data) {
      // Skip specimens without valid coordinates
      if (isNaN(specimen.latitude) || isNaN(specimen.longitude)) {
        continue;
      }

      const dLat = specimen.latitude - targetLat;
      const dLon = specimen.longitude - targetLon;
      const distance = Math.sqrt(dLat * dLat + dLon * dLon);

      if (distance < minDistance && distance <= maxDistance) {
        minDistance = distance;
        nearest = specimen;
      }
    }

    if (!nearest) {
      return null;
    }

    return {
      specimen: nearest,
      distance: minDistance
    };
  }

  /**
   * Calculate actual distance in kilometers using Haversine formula
   */
  calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  /**
   * Find specimens within a bounding box
   */
  findSpecimensInBounds(
    bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number },
    limit: number = 1000
  ): HerbariumRecord[] {
    if (!this.isLoaded || this.data.length === 0) {
      return [];
    }

    const results: HerbariumRecord[] = [];

    for (const specimen of this.data) {
      if (
        specimen.latitude >= bounds.minLat &&
        specimen.latitude <= bounds.maxLat &&
        specimen.longitude >= bounds.minLon &&
        specimen.longitude <= bounds.maxLon
      ) {
        results.push(specimen);

        if (results.length >= limit) {
          break;
        }
      }
    }

    return results;
  }

  /**
   * Get statistics about loaded data
   */
  getStatistics() {
    if (!this.isLoaded) {
      return {
        totalSpecimens: 0,
        isLoaded: false
      };
    }

    const species = new Set(this.data.map(r => r.species));
    const genera = new Set(this.data.map(r => r.genus));
    const families = new Set(this.data.map(r => r.family));

    const lats = this.data.map(r => r.latitude).filter(v => !isNaN(v));
    const lons = this.data.map(r => r.longitude).filter(v => !isNaN(v));

    return {
      totalSpecimens: this.data.length,
      uniqueSpecies: species.size,
      uniqueGenera: genera.size,
      uniqueFamilies: families.size,
      latRange: { min: Math.min(...lats), max: Math.max(...lats) },
      lonRange: { min: Math.min(...lons), max: Math.max(...lons) },
      isLoaded: true
    };
  }

  /**
   * Load IUCN endangered species data
   */
  async loadIUCNData(): Promise<IUCNData> {
    if (this.iucnLoaded && this.iucnData) {
      return this.iucnData;
    }

    try {
      const response = await fetch('/herbarium/iucn_analysis.json');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      this.iucnData = await response.json();
      this.iucnLoaded = true;
      console.log('🔴 IUCN data loaded:', {
        total: this.iucnData.total_with_iucn,
        endangeredCount: Object.keys(this.iucnData.endangered_species).length
      });
      return this.iucnData;
    } catch (error) {
      console.error('❌ Failed to load IUCN data:', error);
      throw error;
    }
  }

  /**
   * Get IUCN status for a species
   */
  getIUCNStatus(species: string): IUCNStatus[] | null {
    if (!this.iucnLoaded || !this.iucnData) {
      return null;
    }
    return (this.iucnData.endangered_species[species] as IUCNStatus[]) || null;
  }

  /**
   * Check if species is endangered (CR, EN, or VU)
   */
  isEndangered(species: string): boolean {
    const statuses = this.getIUCNStatus(species);
    if (!statuses) return false;
    return statuses.some(s => s === 'CR' || s === 'EN' || s === 'VU');
  }

  /**
   * Get color for IUCN status
   */
  getIUCNColor(status: IUCNStatus): string {
    switch (status) {
      case 'CR': return '#FF0000'; // Red - Critically Endangered
      case 'EN': return '#FF6600'; // Orange - Endangered
      case 'VU': return '#FFCC00'; // Yellow - Vulnerable
      case 'NT': return '#CCE226'; // Light Green - Near Threatened
      case 'LC': return '#00CC00'; // Green - Least Concern
      case 'DD': return '#999999'; // Gray - Data Deficient
      case 'EX': return '#000000'; // Black - Extinct
      case 'EW': return '#333333'; // Dark Gray - Extinct in Wild
      default: return '#FFFFFF';
    }
  }

  /**
   * Get IUCN statistics
   */
  getIUCNStatistics() {
    if (!this.iucnLoaded || !this.iucnData) {
      return null;
    }
    return {
      total_with_iucn: this.iucnData.total_with_iucn,
      status_counts: this.iucnData.status_counts,
      endangered_count: Object.keys(this.iucnData.endangered_species).length,
      descriptions: this.iucnData.descriptions
    };
  }

  /**
   * Clear loaded data
   */
  clear(): void {
    this.data = [];
    this.isLoaded = false;
    this.isLoading = false;
    this.loadPromise = null;
    this.iucnData = null;
    this.iucnLoaded = false;
  }
}

// Singleton instance
export const herbariumService = new HerbariumService();
