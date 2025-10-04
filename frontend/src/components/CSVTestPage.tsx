import React, { useState, useEffect } from 'react';
import { BloomDataPoint } from '../types';

// Simple CSV test component to verify loading
const CSVTestPage: React.FC = () => {
  const [csvData, setCsvData] = useState<BloomDataPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);

  // Simplified CSV parser for testing
  const testParseCSV = async (): Promise<BloomDataPoint[]> => {
    console.log('🧪 Starting CSV test parsing...');

    try {
      const response = await fetch('/us_east_features_labels_2015_2024.csv');

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const text = await response.text();
      const lines = text.split('\n').filter(line => line.trim());

      if (lines.length === 0) {
        throw new Error('No lines found in CSV');
      }

      const headers = lines[0].split(',').map(h => h.trim());
      console.log('Headers:', headers);

      // Find indices
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

      // Validate indices
      const missingColumns = Object.entries(indices)
        .filter(([, index]) => index === -1)
        .map(([col]) => col);

      if (missingColumns.length > 0) {
        throw new Error(`Missing columns: ${missingColumns.join(', ')}`);
      }

      const data: BloomDataPoint[] = [];
      const maxRows = Math.min(1000, lines.length - 1); // Test with 1000 rows

      for (let i = 1; i <= maxRows; i++) {
        const values = lines[i].split(',').map(v => v.trim());

        if (values.length !== headers.length) {
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

        // Validate data
        if (!isNaN(point.lat) && !isNaN(point.lon) &&
            point.lat >= -90 && point.lat <= 90 &&
            point.lon >= -180 && point.lon <= 180) {
          data.push(point);
        }
      }

      return data;
    } catch (err) {
      console.error('CSV test parsing error:', err);
      throw err;
    }
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await testParseCSV();
      setCsvData(data);

      // Generate stats
      const years = Array.from(new Set(data.map(p => p.year)));
      const months = Array.from(new Set(data.map(p => p.month)));
      const labels = Array.from(new Set(data.map(p => p.label)));

      setStats({
        totalPoints: data.length,
        years: years.sort(),
        months: months.sort(),
        labels: labels.sort(),
        latRange: [Math.min(...data.map(p => p.lat)), Math.max(...data.map(p => p.lat))],
        lonRange: [Math.min(...data.map(p => p.lon)), Math.max(...data.map(p => p.lon))],
        samplePoints: data.slice(0, 3)
      });

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div style={{
      padding: '20px',
      fontFamily: 'monospace',
      backgroundColor: '#1a1a1a',
      color: '#ffffff',
      minHeight: '100vh'
    }}>
      <h1>🧪 CSV Loading Test Page</h1>

      <div style={{ marginBottom: '20px' }}>
        <button
          onClick={loadData}
          disabled={loading}
          style={{
            padding: '10px 20px',
            backgroundColor: '#007acc',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? 'Loading...' : 'Reload CSV Data'}
        </button>
      </div>

      {loading && (
        <div style={{ color: '#ffa500' }}>
          🔄 Loading CSV data...
        </div>
      )}

      {error && (
        <div style={{
          backgroundColor: '#ff0000',
          color: 'white',
          padding: '10px',
          borderRadius: '5px',
          marginBottom: '20px'
        }}>
          ❌ Error: {error}
        </div>
      )}

      {stats && (
        <div style={{ backgroundColor: '#2a2a2a', padding: '15px', borderRadius: '5px' }}>
          <h2>📊 Data Statistics</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <strong>Total Points:</strong> {stats.totalPoints}
            </div>
            <div>
              <strong>Years:</strong> {stats.years.join(', ')}
            </div>
            <div>
              <strong>Months:</strong> {stats.months.join(', ')}
            </div>
            <div>
              <strong>Bloom Labels:</strong> {stats.labels.join(', ')}
            </div>
            <div>
              <strong>Lat Range:</strong> {stats.latRange[0].toFixed(2)} to {stats.latRange[1].toFixed(2)}
            </div>
            <div>
              <strong>Lon Range:</strong> {stats.lonRange[0].toFixed(2)} to {stats.lonRange[1].toFixed(2)}
            </div>
          </div>

          <h3>🎯 Sample Data Points</h3>
          {stats.samplePoints.map((point: BloomDataPoint, index: number) => (
            <div key={index} style={{
              backgroundColor: '#3a3a3a',
              padding: '10px',
              marginBottom: '10px',
              borderRadius: '3px',
              fontSize: '12px'
            }}>
              <div><strong>Point {index + 1}:</strong></div>
              <div>Lat: {point.lat}, Lon: {point.lon}</div>
              <div>Year: {point.year}, Month: {point.month}</div>
              <div>NDVI: {point.NDVI}, Label: {point.label}</div>
              <div>Temperature: {point.tmean}°C, Precipitation: {point.pr}mm</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: '20px', fontSize: '14px', color: '#888' }}>
        <p>This test page verifies that the CSV file can be loaded and parsed correctly.</p>
        <p>If you see data above, the CSV loading is working properly.</p>
        <p>Check the browser console for detailed debugging information.</p>
      </div>
    </div>
  );
};

export default CSVTestPage;