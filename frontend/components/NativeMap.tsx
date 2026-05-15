<<<<<<< HEAD
import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, Platform, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Mapbox, { MapView, Camera, ShapeSource, CircleLayer, MarkerView, SymbolLayer } from '@rnmapbox/maps';
import { MAPBOX_TOKEN } from '../config/mapbox';

// Set the access token
Mapbox.setAccessToken(MAPBOX_TOKEN);

// Map style types
type MapStyleType = 'satellite' | 'streets';
=======
import React, { useState } from 'react';
import { View, StyleSheet, Platform, Text, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
>>>>>>> 4252d71c791af1f2957fdf14e26a591ed146dfb3

interface NativeMapProps {
  region: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  };
  markerCoords?: {
    latitude: number;
    longitude: number;
  };
  markers?: Array<{
    id: string;
    latitude: number;
    longitude: number;
    title?: string;
    description?: string;
    pinColor?: string;
  }>;
  radiusKm?: number;
  onPress?: (coords: { latitude: number; longitude: number }) => void;
  onMarkerChange?: (coords: { latitude: number; longitude: number }) => void;
  style?: any;
}

export function NativeMap({ region, markerCoords, markers, radiusKm, onPress, style }: NativeMapProps) {
<<<<<<< HEAD
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapStyle, setMapStyle] = useState<MapStyleType>('satellite');
  const mapRef = useRef<any>(null);
=======
  const [mapLoading, setMapLoading] = useState(true);
>>>>>>> 4252d71c791af1f2957fdf14e26a591ed146dfb3

  const lat = markerCoords?.latitude ?? region.latitude;
  const lng = markerCoords?.longitude ?? region.longitude;

  const allMarkers = markers ? markers : (markerCoords ? [{
    id: 'main', latitude: lat, longitude: lng, title: 'Selected Location', pinColor: '#EF4444'
  }] : []);

<<<<<<< HEAD
  const radiusMeters = radiusKm ? radiusKm * 1000 : 0;

  // Get style URL based on selection
  const getStyleUrl = (): string => {
    if (!MAPBOX_TOKEN) {
      console.warn('[Mapbox] No token - map may not display');
    }
    return mapStyle === 'satellite'
      ? Mapbox.StyleURL.Satellite
      : Mapbox.StyleURL.Streets;
  };

  // Toggle map style
  const toggleMapStyle = () => {
    setMapStyle(prev => prev === 'satellite' ? 'streets' : 'satellite');
  };

  // Create circle geometry for radius
  const circleFeature = radiusMeters > 0 && allMarkers.length > 0 ? {
    type: 'Feature' as const,
    geometry: {
      type: 'Point' as const,
      coordinates: [lng, lat]
    },
    properties: {}
  } : null;

=======
  const markersJson = JSON.stringify(allMarkers);
  const radiusMeters = radiusKm ? radiusKm * 1000 : 0;

>>>>>>> 4252d71c791af1f2957fdf14e26a591ed146dfb3
  if (Platform.OS === 'web') {
    return (
      <View style={[styles.container, style]}>
        <View style={styles.webFallback}>
          <Ionicons name="map" size={60} color="#3B82F6" />
          <Text style={styles.coordsText}>{lat.toFixed(6)}, {lng.toFixed(6)}</Text>
          {radiusKm ? <Text style={styles.radiusText}>Radius: {radiusKm} km</Text> : null}
        </View>
      </View>
    );
  }

<<<<<<< HEAD
  const handleMapPress = (feature: any) => {
    if (feature && feature.geometry && onPress) {
      const [lng, lat] = feature.geometry.coordinates;
      onPress({ latitude: lat, longitude: lng });
    }
  };

  const handleMarkerDrag = (marker: any, longitude: number, latitude: number) => {
    if (onMarkerChange) {
      onMarkerChange({ latitude, longitude });
    }
=======
  const osmHtml = `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <style>* { margin:0;padding:0; } html,body,#map { width:100vw;height:100vh;background:#0F172A; }</style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    var map = L.map('map',{zoomControl:true}).setView([${region.latitude},${region.longitude}],13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
    var markersData=${markersJson};
    var leafletMarkers=[];
    markersData.forEach(function(m){
      var color=m.pinColor||'#EF4444';
      var icon=L.divIcon({html:'<div style="background:'+color+';width:18px;height:18px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>',className:'',iconSize:[18,18],iconAnchor:[9,9]});
      var marker=L.marker([m.latitude,m.longitude],{icon:icon,draggable:true}).addTo(map);
      if(m.title) marker.bindPopup('<b>'+m.title+'</b>'+(m.description?'<br>'+m.description:''));
      marker.on('dragend',function(e){
        var ll=e.target.getLatLng();
        if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({lat:ll.lat,lng:ll.lng}));
      });
      leafletMarkers.push(marker);
    });
    ${radiusMeters > 0 && allMarkers.length > 0 ? `var radiusCircle=L.circle([${lat},${lng}],{radius:${radiusMeters},color:'#3B82F6',fillColor:'#3B82F6',fillOpacity:0.1,weight:2}).addTo(map);` : ''}
    map.on('click',function(e){
      if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({lat:e.latlng.lat,lng:e.latlng.lng}));
      if(leafletMarkers.length>0){
        leafletMarkers[0].setLatLng(e.latlng);
        ${radiusMeters > 0 ? "if(radiusCircle) radiusCircle.setLatLng(e.latlng);" : ''}
      }
    });
  </script>
</body>
</html>`;

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.lat && data.lng && onPress) {
        onPress({ latitude: data.lat, longitude: data.lng });
      }
    } catch (e) {}
>>>>>>> 4252d71c791af1f2957fdf14e26a591ed146dfb3
  };

  return (
    <View style={[styles.container, style]}>
<<<<<<< HEAD
      {!mapLoaded && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading {mapStyle === 'satellite' ? 'satellite' : 'map'} view...</Text>
        </View>
      )}

      <MapView
        ref={mapRef}
        style={styles.map}
        styleURL={getStyleUrl()}
        surfaceView={true}
        onStyleLoad={() => setMapLoaded(true)}
        onPress={handleMapPress}
        rotateEnabled={true}
        pitchEnabled={true}
        logoEnabled={false}
        attributionEnabled={false}
      >
        <Camera
          defaultSettings={{
            centerCoordinate: [lng, lat],
            zoomLevel: 14,
            pitch: 0,
            bearing: 0
          }}
        />

        {/* Radius Circle */}
        {circleFeature && (
          <ShapeSource id="radius" shape={circleFeature}>
            <CircleLayer
              id="radius-circle"
              style={{
                circleRadius: radiusMeters / 10, // Convert to map units
                circleColor: '#3B82F6',
                circleOpacity: 0.2,
                circleStrokeWidth: 2,
                circleStrokeColor: '#3B82F6',
              }}
            />
          </ShapeSource>
        )}

        {/* Markers */}
        {allMarkers.map((marker) => (
          <MarkerView
            key={marker.id}
            coordinate={[marker.longitude, marker.latitude]}
            anchor={marker.pinColor === '#22C55E' ? [0.5, 0.5] : [0.5, 1]}
            draggable
            onDrag={(e) => {
              const coords = e.geometry.coordinates;
              handleMarkerDrag(marker, coords[0], coords[1]);
            }}
          >
            <View style={[styles.markerContainer, marker.pinColor ? { backgroundColor: marker.pinColor } : null]}>
              {marker.pinColor === '#22C55E' ? (
                <Ionicons name="checkmark-circle" size={28} color="white" />
              ) : marker.pinColor === '#EF4444' ? (
                <Ionicons name="location" size={28} color="white" />
              ) : (
                <Ionicons name="pin" size={28} color="white" />
              )}
              {marker.title && (
                <View style={styles.markerLabel}>
                  <Text style={styles.markerLabelText} numberOfLines={1}>{marker.title}</Text>
                </View>
              )}
            </View>
          </MarkerView>
        ))}
      </MapView>

      {/* Map Style Toggle */}
      <View style={styles.controlsContainer}>
        <TouchableOpacity style={styles.controlButton} onPress={toggleMapStyle}>
          <Ionicons
            name={mapStyle === 'satellite' ? 'satellite' : 'map'}
            size={16}
            color="#3B82F6"
          />
          <Text style={styles.controlText}>
            {mapStyle === 'satellite' ? 'Satellite' : 'Streets'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* No Token Warning */}
      {!MAPBOX_TOKEN && mapLoaded && (
        <View style={styles.warningBanner}>
          <Ionicons name="warning" size={16} color="#F59E0B" />
          <Text style={styles.warningText}>Add Mapbox token in config/mapbox.ts</Text>
        </View>
      )}
=======
      {mapLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading map...</Text>
        </View>
      )}
      <WebView
        source={{ html: osmHtml }}
        style={styles.webview}
        onLoad={() => setMapLoading(false)}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={['*']}
        mixedContentMode="always"
        allowFileAccess
        geolocationEnabled
      />
>>>>>>> 4252d71c791af1f2957fdf14e26a591ed146dfb3
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
<<<<<<< HEAD
  map: { flex: 1 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
=======
  webview: { flex: 1, backgroundColor: '#0F172A' },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject, backgroundColor: '#0F172A',
    justifyContent: 'center', alignItems: 'center', zIndex: 10,
>>>>>>> 4252d71c791af1f2957fdf14e26a591ed146dfb3
  },
  loadingText: { color: '#94A3B8', marginTop: 12, fontSize: 14 },
  webFallback: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  coordsText: { color: '#94A3B8', fontSize: 14, marginTop: 12 },
  radiusText: { color: '#3B82F6', fontSize: 14, marginTop: 8, fontWeight: '500' },
<<<<<<< HEAD
  markerContainer: {
    alignItems: 'center',
    backgroundColor: '#EF4444',
    borderRadius: 20,
    padding: 6,
    borderWidth: 3,
    borderColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  markerLabel: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 4,
    maxWidth: 120,
  },
  markerLabelText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '600',
  },
  controlsContainer: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 1,
  },
  controlButton: {
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3B82F6',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  controlText: {
    color: '#3B82F6',
    fontSize: 12,
    fontWeight: '600',
  },
  warningBanner: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F59E0B',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  warningText: {
    color: '#F59E0B',
    fontSize: 12,
  },
});
=======
});
>>>>>>> 4252d71c791af1f2957fdf14e26a591ed146dfb3
