import React, { useEffect, useRef, useState } from 'react';
import { Viewer, Entity } from 'resium';
import { Cartesian3, Viewer as CesiumViewer, Color, ColorMaterialProperty, ConstantProperty, ScreenSpaceEventHandler, ScreenSpaceEventType, Cartographic, Math as CesiumMath, GeoJsonDataSource } from 'cesium';
import * as satellite from 'satellite.js';
import { startTLEAutoUpdate } from '../services/satelliteService';
import { generateClimateRiskGrid, generateBloomGrid, getClimateRiskColor, getBloomColor } from '../services/climateService';
import DataPanel from './DataPanel';
import ModeToggle, { LayerState } from './ModeToggle';
import './EarthGlobe.css';

// Cesium configuration
(window as any).CESIUM_BASE_URL = '/cesium';

// Satellite configuration with real-time TLE data from NASA/NORAD APIs
const satelliteConfig = [
  {
    noradId: 39084,
    name: 'Landsat 8',
    color: Color.CYAN,
    description: 'NASA Earth observation satellite - Land & vegetation monitoring',
    tle1: '', // Real-time TLE data fetched from CelesTrak API
    tle2: ''
  },
  {
    noradId: 25994,
    name: 'Terra',
    color: Color.LIME,
    description: 'NASA atmospheric/ocean/land observation - NDVI/EVI data',
    tle1: '', // Real-time TLE data fetched from CelesTrak API
    tle2: ''
  },
  {
    noradId: 40697,
    name: 'Sentinel-2A',
    color: Color.YELLOW,
    description: 'ESA high-resolution optical satellite - Agriculture/forestry monitoring',
    tle1: '', // Real-time TLE data fetched from CelesTrak API
    tle2: ''
  },
  {
    noradId: 41866,
    name: 'GOES-16',
    color: Color.ORANGE,
    description: 'NOAA geostationary weather satellite - Real-time weather monitoring',
    tle1: '', // Real-time TLE data fetched from CelesTrak API
    tle2: ''
  }
];

const EarthGlobe: React.FC = () => {
  const viewerRef = useRef<CesiumViewer | null>(null);
  const [satellitePositions, setSatellitePositions] = useState<{[key: string]: Cartesian3}>({});
  const [cameraInitialized, setCameraInitialized] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [simulationSpeed, setSimulationSpeed] = useState(1); // 1 = real-time
  const [isPaused, setIsPaused] = useState(false);
  const [isEditingTime, setIsEditingTime] = useState(false);
  const [satellites, setSatellites] = useState(satelliteConfig); // Real-time updatable TLE data
  const [selectedLocation, setSelectedLocation] = useState<{lat: number, lng: number, name: string} | null>(null);
  const [selectedCartesian, setSelectedCartesian] = useState<Cartesian3 | null>(null); // Store 3D position for tracking
  const [activeLayers, setActiveLayers] = useState<LayerState>({ climate: false, bloom: false });

  const handleLayerToggle = (layer: 'climate' | 'bloom') => {
    setActiveLayers(prev => ({ ...prev, [layer]: !prev[layer] }));
  };

  // Auto-update TLE data every hour from CelesTrak API
  useEffect(() => {
    console.log('🛰️ Starting TLE auto-update...');
    const cleanup = startTLEAutoUpdate((tleData) => {
      console.log('📡 Received TLE data:', tleData.size, 'satellites');
      setSatellites(prevSats =>
        prevSats.map(sat => {
          const updatedTLE = tleData.get(sat.noradId);
          if (updatedTLE) {
            console.log(`✅ Updated TLE for ${sat.name}:`, updatedTLE);
            return { ...sat, ...updatedTLE };
          } else {
            console.warn(`❌ No TLE data for ${sat.name} (NORAD ${sat.noradId})`);
          }
          return sat;
        })
      );
    });

    return cleanup;
  }, []);

  useEffect(() => {
    // Smooth simulation time update using requestAnimationFrame for 60fps
    let animationId: number;
    let lastTime = Date.now();

    const animate = () => {
      const now = Date.now();
      const delta = now - lastTime;
      lastTime = now;

      if (!isPaused && !isEditingTime) {
        setCurrentTime(prevTime => new Date(prevTime.getTime() + simulationSpeed * delta));
      }
      animationId = requestAnimationFrame(animate);
    };

    animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
  }, [simulationSpeed, isPaused, isEditingTime]);

  useEffect(() => {
    // Real-time satellite position calculation using SGP4 propagation model
    let animationId: number;

    const updateSatellitePositions = () => {
      const positions: {[key: string]: Cartesian3} = {};

      satellites.forEach((sat) => {
        // Skip if TLE data not loaded yet
        if (!sat.tle1 || !sat.tle2) {
          return;
        }

        const satrec = satellite.twoline2satrec(sat.tle1, sat.tle2);
        const positionAndVelocity = satellite.propagate(satrec, currentTime);

        if (positionAndVelocity && positionAndVelocity.position && typeof positionAndVelocity.position !== 'boolean') {
          const positionEci = positionAndVelocity.position;
          const gmst = satellite.gstime(currentTime);
          const positionGd = satellite.eciToGeodetic(positionEci, gmst);

          const longitude = satellite.degreesLong(positionGd.longitude);
          const latitude = satellite.degreesLat(positionGd.latitude);
          const height = positionGd.height * 1000; // Convert km to meters

          // Validate position values before creating Cartesian3 coordinates
          if (!isNaN(longitude) && !isNaN(latitude) && !isNaN(height) &&
              isFinite(longitude) && isFinite(latitude) && isFinite(height) &&
              latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) {
            positions[sat.name] = Cartesian3.fromDegrees(longitude, latitude, height);
          } else {
            console.warn(`⚠️ Invalid position for ${sat.name}:`, { longitude, latitude, height });
          }
        } else {
          console.warn(`⚠️ Failed to propagate ${sat.name}:`, positionAndVelocity);
        }
      });

      setSatellitePositions(positions);
      animationId = requestAnimationFrame(updateSatellitePositions);
    };

    animationId = requestAnimationFrame(updateSatellitePositions);
    return () => cancelAnimationFrame(animationId);
  }, [currentTime, satellites]);

  useEffect(() => {
    if (viewerRef.current && !cameraInitialized) {
      const viewer = viewerRef.current;

      // Set initial camera position (runs only once)
      viewer.camera.setView({
        destination: Cartesian3.fromDegrees(0, 0, 25000000),
        orientation: {
          heading: 0,
          pitch: -Math.PI / 2,
          roll: 0
        }
      });

      // Configure camera movement controls
      viewer.scene.screenSpaceCameraController.enableRotate = true;
      viewer.scene.screenSpaceCameraController.enableZoom = true;
      viewer.scene.screenSpaceCameraController.enableLook = false;
      viewer.scene.screenSpaceCameraController.enableTilt = true;

      // Set zoom limits to prevent black screen
      viewer.scene.screenSpaceCameraController.minimumZoomDistance = 1000; // 1km minimum
      viewer.scene.screenSpaceCameraController.maximumZoomDistance = 50000000; // 50,000km maximum

      setCameraInitialized(true);
    }
  }, [viewerRef.current]);

  useEffect(() => {
    if (!viewerRef.current) return;

    const viewer = viewerRef.current;
    console.log('🎯 Setting up Cesium viewer...');

    // High-quality rendering settings
    viewer.scene.globe.enableLighting = true;
    viewer.scene.globe.maximumScreenSpaceError = 1.5;
    viewer.scene.globe.showGroundAtmosphere = true;

    // Enable Earth rotation animation with simulation speed
    viewer.clock.shouldAnimate = true;
    viewer.clock.multiplier = simulationSpeed; // Controlled by speed buttons

    // Set sun position based on current real time for realistic day/night
    viewer.scene.globe.atmosphereLightIntensity = 10.0; // Brighter sunlight

    // Update sun position based on current time
    const updateSunPosition = () => {
      const julianDate = viewer.clock.currentTime;
      viewer.scene.globe.enableLighting = true;
      // Cesium automatically calculates sun position from julianDate
    };

    updateSunPosition();
    viewer.clock.onTick.addEventListener(updateSunPosition);

    // CRITICAL: Enable actual Earth rotation by rotating camera around Earth
    let rotationHandler: any;
    const startRotation = () => {
      if (rotationHandler) return;

      rotationHandler = viewer.clock.onTick.addEventListener(() => {
        if (isPaused) return; // Don't rotate when paused

        const multiplier = viewer.clock.multiplier;
        if (multiplier <= 0) return;

        // Calculate rotation based on Earth's actual rotation speed
        // Earth rotates 360 degrees in 24 hours (86400 seconds)
        const secondsPerFrame = multiplier / 60; // Assuming 60fps
        const degreesPerSecond = 360 / 86400; // 0.00416667 degrees per second
        const rotationDegrees = degreesPerSecond * secondsPerFrame;

        // Rotate camera around Earth's axis
        viewer.scene.camera.rotateRight(CesiumMath.toRadians(rotationDegrees));
      });
    };

    startRotation();

    // Load country boundaries - using simpler approach with PolylineCollection
    console.log('🗺️ Loading country boundaries...');

    fetch('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson')
      .then(response => response.json())
      .then(geojson => {
        console.log('✅ Country GeoJSON loaded:', geojson.features.length, 'countries');

        // Create entities for each country
        geojson.features.forEach((feature: any) => {
          const geometry = feature.geometry;
          const countryName = feature.properties.ADMIN || feature.properties.NAME || 'Unknown';

          if (geometry.type === 'Polygon') {
            const coordinates = geometry.coordinates[0]; // Outer ring
            const positions = coordinates.map((coord: number[]) =>
              Cartesian3.fromDegrees(coord[0], coord[1])
            );

            viewer.entities.add({
              name: countryName,
              polyline: {
                positions: positions,
                width: 1,
                material: Color.WHITE.withAlpha(0.5)
              },
              properties: {
                type: 'country-boundary',
                name: countryName
              }
            });
          } else if (geometry.type === 'MultiPolygon') {
            geometry.coordinates.forEach((polygon: any) => {
              const coordinates = polygon[0]; // Outer ring
              const positions = coordinates.map((coord: number[]) =>
                Cartesian3.fromDegrees(coord[0], coord[1])
              );

              viewer.entities.add({
                name: countryName,
                polyline: {
                  positions: positions,
                  width: 1,
                  material: Color.WHITE.withAlpha(0.5)
                },
                properties: {
                  type: 'country-boundary',
                  name: countryName
                }
              });
            });
          }
        });

        console.log(`✅ Drew ${geojson.features.length} country boundaries`);
      })
      .catch(error => {
        console.error('❌ Failed to load country boundaries:', error);
      });

    // Region click handler - zoom to selected location
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);

    console.log('🎯 Event handler registered');

    // Single click - select country or region and zoom
    handler.setInputAction((click: any) => {
      console.log('👆 Click detected');

      // First, get the globe coordinates
      const cartesian = viewer.camera.pickEllipsoid(click.position, viewer.scene.globe.ellipsoid);
      if (!cartesian) return;

      const cartographic = Cartographic.fromCartesian(cartesian);
      const longitude = CesiumMath.toDegrees(cartographic.longitude);
      const latitude = CesiumMath.toDegrees(cartographic.latitude);

      // Check if clicked on a country polygon or satellite
      const pickedObject = viewer.scene.pick(click.position);
      let locationName = `Location: ${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°`;

      // If clicked on satellite, don't zoom
      if (pickedObject && pickedObject.id && pickedObject.id.position) {
        console.log('🛰️ Clicked on satellite');
        return;
      }

      // If clicked on a country polygon, get the country name
      if (pickedObject && pickedObject.id && pickedObject.id.polygon) {
        const entity = pickedObject.id;
        const countryName = entity.properties?.name?.getValue() ||
                           entity.properties?.NAME?.getValue() ||
                           entity.properties?.ADMIN?.getValue();

        if (countryName) {
          locationName = countryName;
          console.log('🌏 Clicked on country:', countryName);

          // Highlight selected country
          entity.polygon!.material = new ColorMaterialProperty(Color.CYAN.withAlpha(0.3));
          entity.polygon!.outlineColor = new ConstantProperty(Color.CYAN);
          entity.polygon!.outlineWidth = new ConstantProperty(3);
        }
      } else {
        console.log('🌍 Clicked on globe:', latitude.toFixed(2), longitude.toFixed(2));
      }

      // Store both lat/lng and 3D cartesian position
      setSelectedLocation({
        lat: latitude,
        lng: longitude,
        name: locationName
      });
      setSelectedCartesian(cartesian); // Store 3D position for real-time tracking

      // Always zoom to clicked location at 10km altitude
      viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(longitude, latitude, 10000),
        orientation: {
          heading: 0,
          pitch: -Math.PI / 4, // 45-degree angle for better terrain view
          roll: 0
        },
        duration: 2.0
      });
    }, ScreenSpaceEventType.LEFT_CLICK);

    // Double-click - reset camera to global view
    handler.setInputAction(() => {
      console.log('🌍 Reset to global view');
      setSelectedLocation(null);
      setSelectedCartesian(null);
      viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(0, 0, 25000000),
        orientation: {
          heading: 0,
          pitch: -Math.PI / 2,
          roll: 0
        },
        duration: 2.5
      });
    }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    return () => {
      console.log('🧹 Cleaning up event handler and rotation');
      handler.destroy();
      if (rotationHandler) {
        rotationHandler();
      }
    };
  }, [viewerRef.current, isPaused]);

  // Update simulation speed
  useEffect(() => {
    if (!viewerRef.current) return;

    const viewer = viewerRef.current;
    viewer.clock.multiplier = simulationSpeed;
    console.log(`⏱️ Simulation speed updated to ${simulationSpeed}x`);
  }, [simulationSpeed]);

  // Real-time location update - convert 3D position to lat/lng as Earth rotates
  useEffect(() => {
    if (!viewerRef.current || !selectedCartesian) return;

    const viewer = viewerRef.current;
    let updateId: number;

    const updateLocation = () => {
      if (!selectedCartesian) return;

      // Convert 3D cartesian position to geographic coordinates
      const cartographic = Cartographic.fromCartesian(selectedCartesian);
      const longitude = CesiumMath.toDegrees(cartographic.longitude);
      const latitude = CesiumMath.toDegrees(cartographic.latitude);

      // Update location display
      setSelectedLocation(prev =>
        prev ? { ...prev, lat: latitude, lng: longitude } : null
      );

      updateId = requestAnimationFrame(updateLocation);
    };

    updateId = requestAnimationFrame(updateLocation);
    return () => cancelAnimationFrame(updateId);
  }, [selectedCartesian]);

  // Visualization layer management - support multiple layers simultaneously
  useEffect(() => {
    if (!viewerRef.current) return;

    const viewer = viewerRef.current;
    const entities = viewer.entities;

    // Clear all visualization entities (keep satellites and countries)
    const visualizationEntities = entities.values.filter((e: any) => {
      if (!e.properties) return false;
      const vizType = e.properties.visualizationType?.getValue?.() || e.properties.visualizationType;
      return vizType === 'climate' || vizType === 'bloom';
    });
    visualizationEntities.forEach((e: any) => entities.remove(e));
    console.log(`🗑️ Removed ${visualizationEntities.length} visualization entities`);

    console.log(`🌍 Active layers: Climate=${activeLayers.climate}, Bloom=${activeLayers.bloom}`);

    // Display climate risk layer if active
    if (activeLayers.climate) {
      const climateData = generateClimateRiskGrid(15); // 15-degree resolution for performance

      climateData.forEach(data => {
        const color = getClimateRiskColor(data.riskLevel);
        const cesiumColor = Color.fromCssColorString(color).withAlpha(0.6);

        entities.add({
          position: Cartesian3.fromDegrees(data.longitude, data.latitude),
          point: {
            pixelSize: 12,
            color: cesiumColor,
            outlineColor: Color.WHITE,
            outlineWidth: 1
          },
          properties: {
            visualizationType: 'climate',
            riskLevel: data.riskLevel,
            temperature: data.temperature,
            precipitation: data.precipitation
          }
        });
      });

      console.log(`✅ Added ${climateData.length} climate risk points`);
    }

    // Display bloom status layer if active
    if (activeLayers.bloom) {
      const bloomData = generateBloomGrid(15); // 15-degree resolution

      bloomData.forEach(data => {
        const color = getBloomColor(data.bloomStatus);
        const cesiumColor = Color.fromCssColorString(color).withAlpha(0.7);

        entities.add({
          position: Cartesian3.fromDegrees(data.longitude, data.latitude),
          point: {
            pixelSize: 14,
            color: cesiumColor,
            outlineColor: Color.WHITE,
            outlineWidth: 1
          },
          properties: {
            visualizationType: 'bloom',
            bloomStatus: data.bloomStatus,
            ndvi: data.ndvi,
            peakBloomDate: data.peakBloomDate
          }
        });
      });

      console.log(`✅ Added ${bloomData.length} bloom status points`);
    }
  }, [activeLayers, viewerRef.current]);

  return (
    <div className="earth-globe-container">
      {/* Layer Toggle Buttons */}
      <ModeToggle layers={activeLayers} onLayerToggle={handleLayerToggle} />

      {/* Glass Effect Time Control Panel */}
      <div style={{
        position: 'absolute',
        bottom: '24px',
        left: selectedLocation ? '20px' : '50%',
        transform: selectedLocation ? 'none' : 'translateX(-50%)',
        background: 'rgba(255, 255, 255, 0.1)',
        color: 'white',
        padding: '16px 28px',
        borderRadius: '20px',
        display: 'flex',
        alignItems: 'center',
        gap: '24px',
        zIndex: 1000,
        backdropFilter: 'blur(40px) saturate(180%)',
        WebkitBackdropFilter: 'blur(40px) saturate(180%)',
        border: '1px solid rgba(255, 255, 255, 0.18)',
        boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
        transition: 'left 0.3s ease, transform 0.3s ease'
      }}>
        <div style={{
          fontSize: '16px',
          fontWeight: '600',
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
          letterSpacing: '-0.03em'
        }}>
          {currentTime.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
          }).replace(/,/g, '')}
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => {
              setCurrentTime(new Date());
              setSimulationSpeed(1);
            }}
            style={{
              padding: '8px 18px',
              background: 'rgba(0, 122, 255, 0.6)',
              color: 'white',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '12px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '14px',
              fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
              transition: 'all 0.3s ease',
              backdropFilter: 'blur(10px)'
            }}
          >
            Now
          </button>
          <button
            onClick={() => setSimulationSpeed(1)}
            style={{
              padding: '8px 18px',
              background: simulationSpeed === 1 ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.1)',
              color: 'white',
              border: simulationSpeed === 1 ? '1px solid rgba(255, 255, 255, 0.4)' : '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '12px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '14px',
              fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
              transition: 'all 0.3s ease',
              backdropFilter: 'blur(10px)'
            }}
          >
            1×
          </button>
          <button
            onClick={() => setSimulationSpeed(2)}
            style={{
              padding: '8px 18px',
              background: simulationSpeed === 2 ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.1)',
              color: 'white',
              border: simulationSpeed === 2 ? '1px solid rgba(255, 255, 255, 0.4)' : '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '12px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '14px',
              fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
              transition: 'all 0.3s ease',
              backdropFilter: 'blur(10px)'
            }}
          >
            2×
          </button>
          <button
            onClick={() => setSimulationSpeed(5)}
            style={{
              padding: '8px 18px',
              background: simulationSpeed === 5 ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.1)',
              color: 'white',
              border: simulationSpeed === 5 ? '1px solid rgba(255, 255, 255, 0.4)' : '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '12px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '14px',
              fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
              transition: 'all 0.3s ease',
              backdropFilter: 'blur(10px)'
            }}
          >
            5×
          </button>
          <button
            onClick={() => setSimulationSpeed(10)}
            style={{
              padding: '8px 18px',
              background: simulationSpeed === 10 ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.1)',
              color: 'white',
              border: simulationSpeed === 10 ? '1px solid rgba(255, 255, 255, 0.4)' : '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '12px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '14px',
              fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
              transition: 'all 0.3s ease',
              backdropFilter: 'blur(10px)'
            }}
          >
            10×
          </button>
          <button
            onClick={() => setSimulationSpeed(60)}
            style={{
              padding: '8px 18px',
              background: simulationSpeed === 60 ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.1)',
              color: 'white',
              border: simulationSpeed === 60 ? '1px solid rgba(255, 255, 255, 0.4)' : '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '12px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '14px',
              fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
              transition: 'all 0.3s ease',
              backdropFilter: 'blur(10px)'
            }}
          >
            60×
          </button>
          <button
            onClick={() => setIsPaused(prev => !prev)}
            style={{
              padding: '8px 18px',
              background: isPaused ? 'rgba(255, 59, 48, 0.6)' : 'rgba(52, 199, 89, 0.6)',
              color: 'white',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '12px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '18px',
              fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
              transition: 'background 0.2s ease',
              backdropFilter: 'blur(10px)',
              willChange: 'background'
            }}
          >
            {isPaused ? '▶' : '⏸'}
          </button>
        </div>

        <input
          type="text"
          placeholder="YYYY-MM-DD HH:mm"
          value={(() => {
            if (!currentTime || isNaN(currentTime.getTime())) return '';
            if (isEditingTime) return undefined; // Don't update while editing
            const year = currentTime.getFullYear();
            const month = String(currentTime.getMonth() + 1).padStart(2, '0');
            const day = String(currentTime.getDate()).padStart(2, '0');
            const hour = String(currentTime.getHours()).padStart(2, '0');
            const minute = String(currentTime.getMinutes()).padStart(2, '0');
            return `${year}-${month}-${day} ${hour}:${minute}`;
          })()}
          onFocus={(e) => {
            setIsEditingTime(true);
            e.target.select(); // Select all text on focus
          }}
          onBlur={() => setIsEditingTime(false)}
          onChange={(e) => {
            const value = e.target.value.trim();
            // Try parsing YYYY-MM-DD HH:mm format
            const match = value.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
            if (match) {
              const [, year, month, day, hour, minute] = match;
              const newDate = new Date(
                parseInt(year),
                parseInt(month) - 1,
                parseInt(day),
                parseInt(hour),
                parseInt(minute)
              );
              if (!isNaN(newDate.getTime())) {
                setCurrentTime(newDate);
              }
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.currentTarget.blur();
            }
          }}
          style={{
            padding: '8px 14px',
            background: 'rgba(255, 255, 255, 0.15)',
            color: 'white',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            borderRadius: '12px',
            cursor: 'text',
            fontWeight: '500',
            fontSize: '14px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
            backdropFilter: 'blur(10px)',
            width: '180px'
          }}
        />
      </div>

      <Viewer
        ref={(ref) => {
          viewerRef.current = ref?.cesiumElement || null;
          if (viewerRef.current) {
            console.log('✅ Viewer ref set:', viewerRef.current);
          }
        }}
        full
        timeline={false}
        animation={false}
        homeButton={false}
        sceneModePicker={false}
        baseLayerPicker={false}
        navigationHelpButton={false}
        geocoder={false}
        fullscreenButton={false}
        vrButton={false}
        infoBox={false}
        selectionIndicator={false}
        useBrowserRecommendedResolution={false}
      >
        {/* Real-time satellite position visualization using NASA TLE data */}
        {satellites.map((sat) =>
          satellitePositions[sat.name] ? (
            <Entity
              key={sat.name}
              name={sat.name}
              position={satellitePositions[sat.name]}
              point={{
                pixelSize: 10,
                color: sat.color,
                outlineColor: Color.WHITE,
                outlineWidth: 2
              }}
              label={{
                text: `🛰️ ${sat.name}`,
                font: '12px sans-serif',
                fillColor: Color.WHITE,
                outlineColor: Color.BLACK,
                outlineWidth: 2,
                verticalOrigin: 1 as any,
                pixelOffset: new Cartesian3(0, -15, 0) as any
              }}
              description={sat.description}
            />
          ) : null
        )}
      </Viewer>

      {/* Data Panel */}
      <DataPanel
        location={selectedLocation}
        activeLayers={activeLayers}
      />
    </div>
  );
};

export default EarthGlobe;
