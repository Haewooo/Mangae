import React, { useEffect, useRef, useState } from 'react';
import { Viewer, Entity } from 'resium';
import { Cartesian3, Viewer as CesiumViewer, TileMapServiceImageryProvider, SkyBox, Color } from 'cesium';
import * as satellite from 'satellite.js';
import { startTLEAutoUpdate } from '../services/satelliteService';
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
  const [satellites, setSatellites] = useState(satelliteConfig); // Real-time updatable TLE data

  // Auto-update TLE data every hour from CelesTrak API
  useEffect(() => {
    const cleanup = startTLEAutoUpdate((tleData) => {
      setSatellites(prevSats =>
        prevSats.map(sat => {
          const updatedTLE = tleData.get(sat.noradId);
          if (updatedTLE) {
            console.log(`✅ Updated TLE for ${sat.name}`);
            return { ...sat, ...updatedTLE };
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

      setCurrentTime(prevTime => new Date(prevTime.getTime() + simulationSpeed * delta));
      animationId = requestAnimationFrame(animate);
    };

    animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
  }, [simulationSpeed]);

  useEffect(() => {
    // Real-time satellite position calculation using SGP4 propagation model
    let animationId: number;

    const updateSatellitePositions = () => {
      const positions: {[key: string]: Cartesian3} = {};

      satellites.forEach((sat) => {
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
            console.log(`✅ ${sat.name} position:`, { longitude, latitude, height: height/1000 + 'km' });
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

      setCameraInitialized(true);
    }
  }, [viewerRef.current]);

  useEffect(() => {
    if (viewerRef.current) {
      const viewer = viewerRef.current;

      // Load NASA Blue Marble high-resolution Earth imagery
      TileMapServiceImageryProvider.fromUrl(
        'https://cesiumjs.org/blackmarble',
        {
          maximumLevel: 8
        }
      ).then(provider => {
        viewer.imageryLayers.addImageryProvider(provider);
      });

      // Enhanced star brightness for space environment visualization
      viewer.scene.skyBox = new SkyBox({
        sources: {
          positiveX: 'https://cesiumjs.org/Cesium/Build/Cesium/Assets/Textures/SkyBox/tycho2t3_80_px.jpg',
          negativeX: 'https://cesiumjs.org/Cesium/Build/Cesium/Assets/Textures/SkyBox/tycho2t3_80_mx.jpg',
          positiveY: 'https://cesiumjs.org/Cesium/Build/Cesium/Assets/Textures/SkyBox/tycho2t3_80_py.jpg',
          negativeY: 'https://cesiumjs.org/Cesium/Build/Cesium/Assets/Textures/SkyBox/tycho2t3_80_my.jpg',
          positiveZ: 'https://cesiumjs.org/Cesium/Build/Cesium/Assets/Textures/SkyBox/tycho2t3_80_pz.jpg',
          negativeZ: 'https://cesiumjs.org/Cesium/Build/Cesium/Assets/Textures/SkyBox/tycho2t3_80_mz.jpg'
        }
      });

      // Maximum quality rendering settings
      viewer.scene.globe.maximumScreenSpaceError = 1;
      viewer.scene.globe.tileCacheSize = 1000;
      viewer.scene.postProcessStages.fxaa.enabled = true;

      // High-definition rendering options
      viewer.resolutionScale = window.devicePixelRatio || 1;
      viewer.scene.globe.enableLighting = true;
      viewer.scene.highDynamicRange = true;
      viewer.scene.requestRenderMode = false;

      // Enable Earth rotation animation
      viewer.clock.shouldAnimate = true;
      viewer.clock.multiplier = 3600; // 1 hour = 1 second

      // Double-click event - smooth camera reset to initial position
      const handler = new (window as any).Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      handler.setInputAction(() => {
        viewer.camera.flyTo({
          destination: Cartesian3.fromDegrees(0, 0, 25000000),
          orientation: {
            heading: 0,
            pitch: -Math.PI / 2,
            roll: 0
          },
          duration: 2.5,
          easingFunction: (window as any).Cesium.EasingFunction.CUBIC_IN_OUT
        });
      }, (window as any).Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

      return () => {
        handler.destroy();
      };
    }
  }, []);

  return (
    <div className="earth-globe-container">
      {/* Glass Effect Time Control Panel */}
      <div style={{
        position: 'absolute',
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
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
        boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)'
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
            onClick={() => setSimulationSpeed(10000)}
            style={{
              padding: '8px 18px',
              background: simulationSpeed === 10000 ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.1)',
              color: 'white',
              border: simulationSpeed === 10000 ? '1px solid rgba(255, 255, 255, 0.4)' : '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '12px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '14px',
              fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
              transition: 'all 0.3s ease',
              backdropFilter: 'blur(10px)'
            }}
          >
            10000×
          </button>
        </div>

        <input
          type="datetime-local"
          value={(() => {
            if (!currentTime || isNaN(currentTime.getTime())) return '';
            const year = currentTime.getFullYear();
            const month = String(currentTime.getMonth() + 1).padStart(2, '0');
            const day = String(currentTime.getDate()).padStart(2, '0');
            const hour = String(currentTime.getHours()).padStart(2, '0');
            const minute = String(currentTime.getMinutes()).padStart(2, '0');
            return `${year}-${month}-${day}T${hour}:${minute}`;
          })()}
          onChange={(e) => {
            const newDate = new Date(e.target.value);
            if (!isNaN(newDate.getTime())) {
              setCurrentTime(newDate);
            }
          }}
          style={{
            padding: '8px 14px',
            background: 'rgba(255, 255, 255, 0.15)',
            color: 'white',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            borderRadius: '12px',
            cursor: 'pointer',
            fontWeight: '500',
            fontSize: '14px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
            backdropFilter: 'blur(10px)'
          }}
        />
      </div>

      <Viewer
        ref={(ref) => { viewerRef.current = ref?.cesiumElement || null; }}
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
              // Disable click to prevent Earth manipulation interference
              onClick={() => {}}
            />
          ) : null
        )}
      </Viewer>
    </div>
  );
};

export default EarthGlobe;
