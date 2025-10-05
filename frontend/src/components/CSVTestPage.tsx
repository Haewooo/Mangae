import React, { useState, useEffect } from 'react';

const CSVTestPage: React.FC = () => {
  const [csvData, setCsvData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadCSV = async () => {
      try {
        setLoading(true);
        const response = await fetch('/GEE_Exports_Americas/NorthAmerica_fixedpts_features_labels_2021_2022.csv');

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const text = await response.text();
        const lines = text.split('\n').filter(line => line.trim());
        const headers = lines[0].split(',');

        const data = lines.slice(1, 101).map(line => {
          const values = line.split(',');
          const row: any = {};
          headers.forEach((header, index) => {
            row[header.trim()] = values[index]?.trim();
          });
          return row;
        });

        setCsvData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    loadCSV();
  }, []);

  if (loading) return <div>Loading CSV data...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div style={{ padding: '20px' }}>
      <h1>CSV Test Page</h1>
      <p>Loaded {csvData.length} rows</p>

      {csvData.length > 0 && (
        <div>
          <h2>Sample Data (first 10 rows):</h2>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                {Object.keys(csvData[0]).map(header => (
                  <th key={header} style={{ border: '1px solid #ccc', padding: '8px' }}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {csvData.slice(0, 10).map((row, index) => (
                <tr key={index}>
                  {Object.values(row).map((value: any, idx) => (
                    <td key={idx} style={{ border: '1px solid #ccc', padding: '8px' }}>
                      {value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default CSVTestPage;