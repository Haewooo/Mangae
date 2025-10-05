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
  vpd: number;
  year: number;
  month: number;
}

const HistoricalChart: React.FC<HistoricalChartProps> = ({ location, allBloomData }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [timeSeriesData, setTimeSeriesData] = useState<TimeSeriesData[]>([]);
  const [selectedMetric, setSelectedMetric] = useState<'all' | 'ndvi' | 'temperature' | 'bloom-timeline'>('all');
  const [selectedMonth, setSelectedMonth] = useState<number>(1); // 1월 기본값
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
              vpdValues: [],
              year: point.year,
              month: point.month
            });
          }
          const aggregate = monthlyAggregates.get(key)!;
          aggregate.ndviValues.push(point.NDVI);
          aggregate.tempValues.push(point.tmean);
          aggregate.vpdValues.push(point.vpd);
        });

        // Convert to time series
        const timeSeries: TimeSeriesData[] = Array.from(monthlyAggregates.values()).map(aggregate => ({
          date: `${aggregate.year}-${String(aggregate.month).padStart(2, '0')}-01`,
          ndvi: aggregate.ndviValues.reduce((a, b) => a + b, 0) / aggregate.ndviValues.length,
          temperature: aggregate.tempValues.reduce((a, b) => a + b, 0) / aggregate.tempValues.length,
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


  // Function to get NDVI color based on bloom status ranges
  const getNDVIColor = (ndvi: number): string => {
    if (ndvi > 0.6) return '#FF69B4'; // Hot pink (peak-bloom)
    if (ndvi > 0.4) return '#FFB6C1'; // Light pink (emerging)
    return '#8B7355'; // Brown (dormant)
  };

  // Chart configuration
  const chartData = useMemo(() => {
    if (!timeSeriesData.length) return null;

    const datasets = [];

    // Bloom Timeline 차트 (연도별 일자 변화)
    if (selectedMetric === 'bloom-timeline') {
      // 선택된 월 데이터만 필터링
      const monthData = timeSeriesData.filter(d => d.month === selectedMonth);

      // 연도별로 그룹화하고 NDVI 최고점 날짜 계산
      const yearlyBloomDates = monthData.map(d => {
        // NDVI 기반으로 blooming date 추정 (높을수록 늦음)
        const estimatedDay = Math.round(15 + (d.ndvi * 10)); // 15~25일 사이
        const maxDaysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][selectedMonth - 1];
        return {
          year: d.year,
          bloomDay: Math.min(estimatedDay, maxDaysInMonth)
        };
      });

      const labels = yearlyBloomDates.map(d => d.year.toString());

      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                         'July', 'August', 'September', 'October', 'November', 'December'];

      datasets.push({
        label: `${monthNames[selectedMonth - 1]} Bloom Date`,
        data: yearlyBloomDates.map(d => d.bloomDay),
        borderColor: '#FF69B4',
        backgroundColor: 'rgba(255, 105, 180, 0.1)',
        fill: true,
        yAxisID: 'y-bloom',
        tension: 0.3,
        pointRadius: 5,
        pointHoverRadius: 7,
        borderWidth: 3,
        pointBackgroundColor: '#FF69B4',
        pointBorderColor: '#FFFFFF',
        pointBorderWidth: 2
      });

      return {
        labels,
        datasets
      };
    }

    // 기존 차트들
    const labels = timeSeriesData.map(data => {
      const date = parseISO(data.date);
      return format(date, 'MMM yyyy');
    });

    const currentData = timeSeriesData[timeSeriesData.length - 1];
    if (selectedMetric === 'all' || selectedMetric === 'ndvi') {
      datasets.push({
        label: 'Blooming Date by NDVI',
        data: timeSeriesData.map(d => d.ndvi),
        borderColor: (context: any) => {
          const chart = context.chart;
          const { ctx, chartArea } = chart;
          if (!chartArea) return '#10B981';

          const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);

          // 0.6 이상: 핑크
          gradient.addColorStop(0, '#FF69B4');
          gradient.addColorStop(0.4, '#FF69B4'); // 0.6 라인까지

          // 0.4-0.6: 라이트핑크
          gradient.addColorStop(0.4, '#FFB6C1');
          gradient.addColorStop(0.6, '#FFB6C1'); // 0.4 라인까지

          // 0.4 미만: 브라운
          gradient.addColorStop(0.6, '#8B7355');
          gradient.addColorStop(1, '#8B7355');

          return gradient;
        },
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
        borderColor: '#00CED1',
        backgroundColor: 'transparent',
        fill: false,
        yAxisID: 'y-temp',
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 0,
        borderWidth: 3
      });
    }


    return {
      labels,
      datasets
    };
  }, [timeSeriesData, selectedMetric, selectedMonth]);

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
        align: 'start' as const,
        labels: {
          usePointStyle: true,
          pointStyle: 'circle',
          font: {
            size: 12,
            weight: 'bold' as const
          },
          color: '#E5E7EB',
          padding: 15
        }
      },
      title: {
        display: true,
        text: selectedMetric === 'bloom-timeline'
          ? `${['January', 'February', 'March', 'April', 'May', 'June',
              'July', 'August', 'September', 'October', 'November', 'December'][selectedMonth - 1]} Bloom Timeline - ${location.name}`
          : `Climate Trends - ${location.name}`,
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

            if (datasetLabel === 'Blooming Date by NDVI') {
              const bloomStatus = value > 0.6 ? 'Peak Bloom' : value > 0.4 ? 'Emerging' : 'Dormant';
              return `NDVI: ${value.toFixed(3)} (${bloomStatus})`;
            } else if (datasetLabel === 'Temperature (°C)') {
              return `Temperature: ${value.toFixed(1)}°C`;
            } else if (datasetLabel?.includes('Bloom Date')) {
              const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                                'July', 'August', 'September', 'October', 'November', 'December'];
              return `Bloom Date: ${monthNames[selectedMonth - 1]} ${Math.round(value)}`;
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
          text: selectedMetric === 'bloom-timeline' ? 'Year' : 'Time Period',
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
          color: '#FF69B4',
          font: {
            size: 12,
            weight: 'normal' as const
          }
        },
        grid: {
          color: 'rgba(255, 105, 180, 0.2)',
          lineWidth: 0.5
        },
        ticks: {
          color: (ctx: any) => {
            const value = ctx.tick.value;
            if (value >= 0.6) return '#FF69B4'; // Peak Bloom
            if (value >= 0.4) return '#FFB6C1'; // Emerging
            return '#8B7355'; // Dormant
          }
        },
        min: 0,
        max: 1
      },
      'y-bloom': {
        type: 'linear' as const,
        display: selectedMetric === 'bloom-timeline',
        position: 'left' as const,
        title: {
          display: true,
          text: `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][selectedMonth - 1]} Day`,
          color: '#FF69B4',
          font: {
            size: 12,
            weight: 'normal' as const
          }
        },
        grid: {
          color: 'rgba(255, 105, 180, 0.2)',
          lineWidth: 0.5
        },
        ticks: {
          color: '#FF69B4',
          stepSize: 5,
          callback: function(value: any) {
            const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                               'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            return `${shortMonths[selectedMonth - 1]} ${value}`;
          }
        },
        min: 1,
        max: [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][selectedMonth - 1],
        reverse: false
      },
      'y-temp': {
        type: 'linear' as const,
        display: selectedMetric === 'all' || selectedMetric === 'temperature',
        position: selectedMetric === 'all' ? 'right' as const : 'left' as const,
        title: {
          display: true,
          text: 'Temp (°C)',
          color: '#F59E0B',
          font: {
            size: 10,
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
        },
        min: 0,
        offset: true
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
        {(['all', 'ndvi', 'temperature', 'bloom-timeline'] as const).map(metric => (
          <button
            key={metric}
            onClick={() => setSelectedMetric(metric)}
            className={`metric-button ${selectedMetric === metric ? 'active' : ''}`}
          >
            {metric === 'all' ? 'All Metrics' :
             metric === 'ndvi' ? 'Blooming Date by NDVI' :
             metric === 'temperature' ? 'Temperature' :
             metric === 'bloom-timeline' ? 'Bloom Timeline' : metric}
          </button>
        ))}
      </div>

      {/* Month Selection for Bloom Timeline */}
      {selectedMetric === 'bloom-timeline' && (
        <div className="metric-selector" style={{ marginTop: '10px' }}>
          <label style={{ color: '#E5E7EB', marginRight: '10px' }}>Month:</label>
          {Array.from({length: 12}, (_, i) => i + 1).map(month => (
            <button
              key={month}
              onClick={() => setSelectedMonth(month)}
              className={`metric-button ${selectedMonth === month ? 'active' : ''}`}
              style={{
                minWidth: '45px',
                fontSize: '12px',
                padding: '6px 8px'
              }}
            >
              {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month - 1]}
            </button>
          ))}
        </div>
      )}

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