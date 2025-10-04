import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  TooltipItem
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { BloomDataPoint } from '../types';
import { format, parseISO } from 'date-fns';
import './HistoricalChart.css';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);


interface HistoricalChartProps {
  location: { lat: number; lng: number; name: string };
  allBloomData: BloomDataPoint[];
}

interface TimeSeriesData {
  date: string;
  ndvi: number;
  temperature: number;
  precipitation: number;
  vpd: number;
  year: number;
  month: number;
}

const HistoricalChart: React.FC<HistoricalChartProps> = ({ location, allBloomData }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [timeSeriesData, setTimeSeriesData] = useState<TimeSeriesData[]>([]);
  const [selectedMetric, setSelectedMetric] = useState<'all' | 'ndvi' | 'temperature'>('all');
  const [dataSourceDistance, setDataSourceDistance] = useState<number>(0);
  const chartRef = useRef<ChartJS<'line'>>(null);

  // 단일 useEffect로 모든 데이터 처리를 통합
  useEffect(() => {
    if (!location || !allBloomData.length) {
      setTimeSeriesData([]);
      setDataSourceDistance(0);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const processDataAsync = async () => {
      try {
        // Search for nearby data
        let locationData: BloomDataPoint[] = [];
        const searchRadii = [0.5, 1.0, 2.0, 5.0, 10.0];
        let usedRadius = 0;

        for (const radius of searchRadii) {
          locationData = allBloomData.filter(point => {
            const latDiff = Math.abs(point.lat - location.lat);
            const lonDiff = Math.abs(point.lon - location.lng);
            return latDiff <= radius && lonDiff <= radius;
          });

          if (locationData.length > 0) {
            usedRadius = radius;
            break;
          }
        }

        // Use closest points if no nearby data
        if (locationData.length === 0) {
          const pointsWithDistance = allBloomData.map(point => {
            const latDiff = point.lat - location.lat;
            const lonDiff = point.lon - location.lng;
            const distance = Math.sqrt(latDiff * latDiff + lonDiff * lonDiff);
            return { ...point, distance };
          });

          pointsWithDistance.sort((a, b) => a.distance - b.distance);
          locationData = pointsWithDistance.slice(0, 50).map(({ distance, ...point }) => point);
          usedRadius = pointsWithDistance[0]?.distance || 0;
        }

        // Aggregate by month
        const monthlyAggregates = new Map<string, {
          ndviValues: number[];
          tempValues: number[];
          precipValues: number[];
          vpdValues: number[];
          year: number;
          month: number;
        }>();

        locationData.forEach(point => {
          const key = `${point.year}-${point.month}`;
          if (!monthlyAggregates.has(key)) {
            monthlyAggregates.set(key, {
              ndviValues: [],
              tempValues: [],
              precipValues: [],
              vpdValues: [],
              year: point.year,
              month: point.month
            });
          }
          const aggregate = monthlyAggregates.get(key)!;
          aggregate.ndviValues.push(point.NDVI);
          aggregate.tempValues.push(point.tmean);
          aggregate.precipValues.push(point.pr);
          aggregate.vpdValues.push(point.vpd);
        });

        // Convert to time series
        const timeSeries: TimeSeriesData[] = Array.from(monthlyAggregates.values()).map(aggregate => ({
          date: `${aggregate.year}-${String(aggregate.month).padStart(2, '0')}-01`,
          ndvi: aggregate.ndviValues.reduce((a, b) => a + b, 0) / aggregate.ndviValues.length,
          temperature: aggregate.tempValues.reduce((a, b) => a + b, 0) / aggregate.tempValues.length,
          precipitation: aggregate.precipValues.reduce((a, b) => a + b, 0) / aggregate.precipValues.length,
          vpd: aggregate.vpdValues.reduce((a, b) => a + b, 0) / aggregate.vpdValues.length,
          year: aggregate.year,
          month: aggregate.month
        }));

        // Sort by time
        timeSeries.sort((a, b) => {
          if (a.year !== b.year) return a.year - b.year;
          return a.month - b.month;
        });


        console.log(`Raw data: ${locationData.length}, Monthly aggregates: ${monthlyAggregates.size}, Final: ${timeSeries.length}`);

        // Update state
        setTimeout(() => {
          setTimeSeriesData(timeSeries);
          setDataSourceDistance(usedRadius);
          setIsLoading(false);
        }, 100);

      } catch (error) {
        setTimeSeriesData([]);
        setDataSourceDistance(0);
        setIsLoading(false);
      }
    };

    processDataAsync();
  }, [location?.lat, location?.lng, location?.name, allBloomData.length]);

  // Chart configuration
  const chartData = useMemo(() => {
    if (!timeSeriesData.length) return null;

    const labels = timeSeriesData.map(data => {
      const date = parseISO(data.date);
      return format(date, 'MMM yyyy');
    });

    const datasets = [];

    const currentData = timeSeriesData[timeSeriesData.length - 1];
    if (selectedMetric === 'all' || selectedMetric === 'ndvi') {
      datasets.push({
        label: 'Blooming Date by NDVI',
        data: timeSeriesData.map(d => d.ndvi),
        borderColor: '#10B981',
        backgroundColor: 'transparent',
        fill: false,
        yAxisID: 'y-ndvi',
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 0,
        borderWidth: 3
      });
    }

    if (selectedMetric === 'all' || selectedMetric === 'temperature') {
      datasets.push({
        label: 'Temperature (°C)',
        data: timeSeriesData.map(d => d.temperature),
        borderColor: '#F59E0B',
        backgroundColor: 'transparent',
        fill: false,
        yAxisID: 'y-temp',
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 0,
        borderWidth: 3
      });
    }

    if (selectedMetric === 'all') {
      datasets.push({
        label: `Current Precipitation: ${currentData.precipitation.toFixed(1)}mm`,
        data: Array(timeSeriesData.length).fill(currentData.precipitation),
        borderColor: '#3B82F6',
        backgroundColor: 'transparent',
        fill: false,
        yAxisID: 'y-precip',
        tension: 0,
        pointRadius: 0,
        pointHoverRadius: 0,
        borderWidth: 2,
        borderDash: [5, 5]
      });

      datasets.push({
        label: `Current Humidity (VPD): ${currentData.vpd.toFixed(1)}kPa`,
        data: Array(timeSeriesData.length).fill(currentData.vpd),
        borderColor: '#8B5CF6',
        backgroundColor: 'transparent',
        fill: false,
        yAxisID: 'y-vpd',
        tension: 0,
        pointRadius: 0,
        pointHoverRadius: 0,
        borderWidth: 2,
        borderDash: [5, 5]
      });
    }

    return {
      labels,
      datasets
    };
  }, [timeSeriesData, selectedMetric]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    animation: {
      duration: 1000,
      easing: 'easeInOutQuart' as const
    },
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          usePointStyle: true,
          pointStyle: 'circle',
          font: {
            size: 12,
            weight: 'bold' as const
          },
          color: '#E5E7EB',
          padding: 20
        }
      },
      title: {
        display: true,
        text: `Climate Trends - ${location.name}`,
        font: {
          size: 16,
          weight: 'bold' as const
        },
        color: '#F9FAFB',
        padding: {
          top: 10,
          bottom: 30
        }
      },
      tooltip: {
        backgroundColor: 'rgba(17, 24, 39, 0.95)',
        titleColor: '#F9FAFB',
        bodyColor: '#E5E7EB',
        borderColor: 'rgba(75, 85, 99, 0.5)',
        borderWidth: 1,
        cornerRadius: 8,
        displayColors: true,
        callbacks: {
          title: (context: TooltipItem<'line'>[]) => {
            const date = parseISO(timeSeriesData[context[0].dataIndex].date);
            return format(date, 'MMMM yyyy');
          },
          label: (context: TooltipItem<'line'>) => {
            const value = context.parsed.y;
            const datasetLabel = context.dataset.label;

            if (datasetLabel === 'NDVI') {
              return `NDVI: ${value.toFixed(3)}`;
            } else if (datasetLabel === 'Temperature (°C)') {
              return `Temperature: ${value.toFixed(1)}°C`;
            } else if (datasetLabel === 'Precipitation (mm)') {
              return `Precipitation: ${value.toFixed(1)} mm`;
            }
            return `${datasetLabel}: ${value}`;
          }
        }
      }
    },
    scales: {
      x: {
        display: true,
        title: {
          display: true,
          text: 'Time Period',
          color: '#9CA3AF',
          font: {
            size: 12,
            weight: 'normal' as const
          }
        },
        grid: {
          color: 'rgba(75, 85, 99, 0.3)',
          lineWidth: 0.5
        },
        ticks: {
          color: '#9CA3AF',
          maxTicksLimit: 10
        }
      },
      'y-ndvi': {
        type: 'linear' as const,
        display: selectedMetric === 'all' || selectedMetric === 'ndvi',
        position: 'left' as const,
        title: {
          display: true,
          text: 'Blooming Date by NDVI',
          color: '#10B981',
          font: {
            size: 12,
            weight: 'normal' as const
          }
        },
        grid: {
          color: 'rgba(16, 185, 129, 0.2)',
          lineWidth: 0.5
        },
        ticks: {
          color: '#10B981'
        },
        min: 0,
        max: 1
      },
      'y-temp': {
        type: 'linear' as const,
        display: selectedMetric === 'all' || selectedMetric === 'temperature',
        position: selectedMetric === 'all' ? 'right' as const : 'left' as const,
        title: {
          display: true,
          text: 'Temperature (°C)',
          color: '#F59E0B',
          font: {
            size: 12,
            weight: 'normal' as const
          }
        },
        grid: {
          display: selectedMetric !== 'all',
          color: 'rgba(245, 158, 11, 0.2)',
          lineWidth: 0.5
        },
        ticks: {
          color: '#F59E0B'
        }
      },
      'y-precip': {
        type: 'linear' as const,
        display: selectedMetric === 'all',
        position: 'right' as const,
        title: {
          display: true,
          text: 'Current Precipitation (mm)',
          color: '#3B82F6',
          font: {
            size: 10,
            weight: 'normal' as const
          }
        },
        grid: {
          display: false,
          color: 'rgba(59, 130, 246, 0.1)',
          lineWidth: 0.5
        },
        ticks: {
          color: '#3B82F6'
        },
        min: 0
      },
      'y-vpd': {
        type: 'linear' as const,
        display: selectedMetric === 'all',
        position: 'right' as const,
        title: {
          display: true,
          text: 'Current Humidity (VPD kPa)',
          color: '#8B5CF6',
          font: {
            size: 10,
            weight: 'normal' as const
          }
        },
        grid: {
          display: false,
          color: 'rgba(139, 92, 246, 0.1)',
          lineWidth: 0.5
        },
        ticks: {
          color: '#8B5CF6'
        },
        min: 0
      }
    }
  }), [location.name, selectedMetric, timeSeriesData]);

  if (isLoading) {
    return (
      <div className="chart-container">
        <div className="chart-loading">
          Loading historical data...
        </div>
      </div>
    );
  }

  if (!timeSeriesData.length) {
    return (
      <div className="chart-container">
        <div className="chart-no-data">
          <div className="chart-no-data-icon">📊</div>
          <div className="chart-no-data-title">No data available</div>
          <div className="chart-no-data-subtitle">
            {location ? (
              <>
                No data found within 22km radius of {location.name}<br />
                <span style={{ fontSize: '11px', opacity: 0.6 }}>
                  Coordinates: {location.lat.toFixed(2)}°, {location.lng.toFixed(2)}°
                </span>
              </>
            ) : (
              'Try selecting a location with more data coverage'
            )}
          </div>
        </div>
      </div>
    );
  }


  return (
    <div className="chart-container">

      {/* Metric Selection */}
      <div className="metric-selector">
        {(['all', 'ndvi', 'temperature'] as const).map(metric => (
          <button
            key={metric}
            onClick={() => setSelectedMetric(metric)}
            className={`metric-button ${selectedMetric === metric ? 'active' : ''}`}
          >
            {metric === 'all' ? 'All Metrics' :
             metric === 'ndvi' ? 'Blooming Date by NDVI' :
             metric === 'temperature' ? 'Temperature' : metric}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div style={{ height: '400px', width: '100%' }}>
        {chartData ? (
          <Line
            ref={chartRef}
            data={chartData}
            options={chartOptions}
          />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#666' }}>
            No chart data available
          </div>
        )}
      </div>

      {/* Data Summary */}
      <div style={{
        marginTop: '15px',
        fontSize: '12px',
        color: '#6B7280',
        textAlign: 'center'
      }}>
{timeSeriesData.length} monthly averages • {Math.min(...timeSeriesData.map(d => d.year))} - {Math.max(...timeSeriesData.map(d => d.year))}
        <br />
        Data source: ~{Math.round(dataSourceDistance * 111)}km from location
      </div>
    </div>
  );
};

export default HistoricalChart;