/**
<<<<<<< HEAD
 * civil/escort.tsx — Redesigned UI (v3)
 *
 * All logic/backend calls are identical to Phase 3 Patch v2.
 * Only the visual layer has been replaced with a modern tactical-grade UI:
 *   - expo-linear-gradient for depth and atmosphere
 *   - expo-blur for frosted-glass panels
 *   - react-native-reanimated for pulse rings, radar sweep, staggered entry
 *   - expo-haptics for tactile feedback on Start/Stop
 *
 * BUG FIXES (carried over from Patch v2):
 * 1. Session remembered after logout/re-login — backend is authoritative.
 * 2. GPS posting cadence fixed — single foreground interval, background task
 *    only when app is backgrounded.
 * 3. Admin escort-sessions shows full route — server writes to both fields.
=======
 * civil/escort.tsx — Phase 3 (Patch v2)
 *
 * BUG FIXES:
 *
 * 1. SESSION NOT REMEMBERED AFTER LOGOUT/RE-LOGIN
 *    Root cause (real): The backend server.py was a stub — all escort API
 *    routes (/api/escort/action, /api/escort/status, /api/escort/location,
 *    /api/security/escort-sessions, /api/admin/escort-sessions) were missing.
 *    Sessions were never persisted to MongoDB, so there was nothing to restore.
 *    Fix: Complete escort route implementations added to server.py.
 *    The frontend already calls /api/escort/status unconditionally on mount
 *    (patch v1 fix) — that remains correct.
 *
 * 2. GPS POSTING TOO FREQUENTLY (7 points in 2m15s instead of ~2 points)
 *    Root cause: Two independent posting mechanisms were both active AND
 *    useFocusEffect reset trackingStartedRef and restarted tracking on every
 *    screen re-focus, spawning additional foreground intervals:
 *      a) Foreground setInterval (60 s) — one per focus cycle
 *      b) Background expo-location task — independent, also posts on its cadence
 *    Since both ran simultaneously, and re-focus could create more intervals,
 *    posts accumulated quickly.
 *    Fix:
 *      a) useFocusEffect checks isTrackingRef before restarting — if already
 *         tracking, it only restarts the interval (no backend re-check needed).
 *      b) startLocationTracking is strictly idempotent via trackingStartedRef.
 *      c) Background task DISABLED in foreground — expo-location background
 *         task is only started when the app goes to background. In foreground
 *         the setInterval alone handles posting. This prevents double-posting.
 *      d) AppState listener stops background task and restarts foreground
 *         interval when app comes back to foreground.
 *
 * 3. ADMIN DASHBOARD SHOWING ONLY 1 GPS POINT
 *    Root cause: admin/escort-sessions.tsx reads item.locations[] but the
 *    backend stub never wrote to that field. Fixed in server.py — escort
 *    sessions now write to BOTH "route" (security screen) and "locations"
 *    (admin screen) atomically in /api/escort/location.
>>>>>>> 4252d71c791af1f2957fdf14e26a591ed146dfb3
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
<<<<<<< HEAD
  View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
  AppState, Dimensions, Platform,
=======
  View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, AppState,
>>>>>>> 4252d71c791af1f2957fdf14e26a591ed146dfb3
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
<<<<<<< HEAD
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming,
  withDelay, withSequence, interpolate, Easing, FadeIn,
  FadeInDown, FadeInUp, ZoomIn,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { getAuthToken, getUserMetadata, clearAuthData } from '../../utils/auth';
import BACKEND_URL from '../../utils/config';

const { width: W, height: H } = Dimensions.get('window');
const ESCORT_TASK = 'background-location-escort';

// ── Background task ───────────────────────────────────────────────────────────
=======
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { getAuthToken, getUserMetadata, clearAuthData } from '../../utils/auth';
import BACKEND_URL from '../../utils/config';


const ESCORT_TASK = 'background-location-escort';

// ── Background task ───────────────────────────────────────────────────────────
// Only active when app is backgrounded. When foregrounded, the setInterval takes over.
>>>>>>> 4252d71c791af1f2957fdf14e26a591ed146dfb3
if (!TaskManager.isTaskDefined(ESCORT_TASK)) {
  TaskManager.defineTask(ESCORT_TASK, async ({ data, error }: any) => {
    if (error) return;
    if (data?.locations?.[0]) {
      const loc = data.locations[0];
      try {
        const token = await AsyncStorage.getItem('auth_token');
        if (token) {
          await axios.post(
            `${BACKEND_URL}/api/escort/location`,
            {
              latitude:  loc.coords.latitude,
              longitude: loc.coords.longitude,
              accuracy:  loc.coords.accuracy,
              timestamp: new Date().toISOString(),
            },
            { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
          );
        }
      } catch (_) {}
    }
  });
}

<<<<<<< HEAD
// ── Animated pulse ring component ─────────────────────────────────────────────
function PulseRing({ delay = 0, color = '#3B82F6' }: { delay?: number; color?: string }) {
  const scale   = useSharedValue(0.4);
  const opacity = useSharedValue(0.7);

  useEffect(() => {
    scale.value = withDelay(delay,
      withRepeat(withTiming(1.8, { duration: 2200, easing: Easing.out(Easing.quad) }), -1, false)
    );
    opacity.value = withDelay(delay,
      withRepeat(withTiming(0, { duration: 2200, easing: Easing.out(Easing.quad) }), -1, false)
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity:   opacity.value,
  }));

  return (
    <Animated.View style={[StyleSheet.absoluteFillObject, style, {
      borderRadius: 999,
      borderWidth:  2,
      borderColor:  color,
    }]} />
  );
}

// ── Radar sweep ───────────────────────────────────────────────────────────────
function RadarSweep({ active }: { active: boolean }) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (active) {
      rotation.value = withRepeat(
        withTiming(360, { duration: 3000, easing: Easing.linear }),
        -1, false
      );
    } else {
      rotation.value = 0;
    }
  }, [active]);

  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <Animated.View style={[StyleSheet.absoluteFillObject, style, { borderRadius: 999, overflow: 'hidden' }]}>
      <LinearGradient
        colors={['transparent', 'transparent', active ? '#3B82F630' : 'transparent', active ? '#3B82F660' : 'transparent']}
        start={{ x: 0.5, y: 0.5 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFillObject}
      />
    </Animated.View>
  );
}

// ── Shield icon with glow ─────────────────────────────────────────────────────
function ShieldOrb({ active }: { active: boolean }) {
  const glow    = useSharedValue(0.5);
  const iconScale = useSharedValue(1);
  const ORB_SIZE = 140;

  useEffect(() => {
    if (active) {
      glow.value = withRepeat(
        withSequence(
          withTiming(1,   { duration: 1500, easing: Easing.inOut(Easing.sin) }),
          withTiming(0.5, { duration: 1500, easing: Easing.inOut(Easing.sin) })
        ),
        -1, false
      );
      iconScale.value = withRepeat(
        withSequence(
          withTiming(1.08, { duration: 1200 }),
          withTiming(1,    { duration: 1200 })
        ),
        -1, false
      );
    } else {
      glow.value    = 1;
      iconScale.value = 1;
    }
  }, [active]);

  const glowStyle = useAnimatedStyle(() => ({
    shadowOpacity: interpolate(glow.value, [0.5, 1], [0.3, 0.85]),
    shadowRadius:  interpolate(glow.value, [0.5, 1], [8, 28]),
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }));

  return (
    <View style={{ width: ORB_SIZE, height: ORB_SIZE, alignItems: 'center', justifyContent: 'center' }}>
      {/* Radar rings */}
      {active && (
        <>
          <PulseRing delay={0}    color="#3B82F6" />
          <PulseRing delay={700}  color="#3B82F6" />
          <PulseRing delay={1400} color="#3B82F6" />
        </>
      )}

      {/* Radar sweep */}
      <RadarSweep active={active} />

      {/* Orb itself */}
      <Animated.View style={[{
        width: ORB_SIZE, height: ORB_SIZE, borderRadius: ORB_SIZE / 2,
        justifyContent: 'center', alignItems: 'center',
        shadowColor:  active ? '#3B82F6' : '#1E293B',
        shadowOffset: { width: 0, height: 0 },
        elevation: 20,
        overflow: 'hidden',
      }, glowStyle]}>
        <LinearGradient
          colors={active
            ? ['#1d4ed8', '#1E3A5F', '#0F172A']
            : ['#1E3A5F', '#162032', '#0F172A']}
          style={[StyleSheet.absoluteFillObject, { borderRadius: ORB_SIZE / 2 }]}
        />
        {/* Crosshair ring */}
        <View style={{
          position: 'absolute',
          width: ORB_SIZE - 16, height: ORB_SIZE - 16,
          borderRadius: (ORB_SIZE - 16) / 2,
          borderWidth: 1,
          borderColor: active ? '#3B82F640' : '#ffffff15',
        }} />
        <Animated.View style={iconStyle}>
          <Ionicons
            name={active ? 'shield-checkmark' : 'shield-outline'}
            size={52}
            color={active ? '#60A5FA' : '#3B82F6'}
          />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

// ── Feature pill ──────────────────────────────────────────────────────────────
function FeaturePill({ icon, text, index }: { icon: string; text: string; index: number }) {
  return (
    <Animated.View
      entering={FadeInUp.delay(400 + index * 100).springify()}
      style={pill.wrap}
    >
      <View style={pill.iconBox}>
        <Ionicons name={icon as any} size={16} color="#3B82F6" />
      </View>
      <Text style={pill.text}>{text}</Text>
    </Animated.View>
  );
}

const pill = StyleSheet.create({
  wrap:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 16, backgroundColor: '#ffffff08', borderRadius: 12, borderWidth: 1, borderColor: '#ffffff10', marginBottom: 10 },
  iconBox: { width: 30, height: 30, borderRadius: 8, backgroundColor: '#3B82F615', justifyContent: 'center', alignItems: 'center' },
  text:    { color: '#CBD5E1', fontSize: 13.5, fontWeight: '500', flex: 1 },
});

// ── GPS status chip ───────────────────────────────────────────────────────────
function GpsChip({ gps }: { gps: { lat: number; lng: number; updatedAt: string } | null }) {
  const dot = useSharedValue(1);

  useEffect(() => {
    dot.value = withRepeat(
      withSequence(withTiming(0.2, { duration: 700 }), withTiming(1, { duration: 700 })),
      -1, false
    );
  }, []);

  const dotStyle = useAnimatedStyle(() => ({ opacity: dot.value }));

  return (
    <BlurView intensity={18} tint="dark" style={chip.wrap}>
      <View style={chip.header}>
        <Animated.View style={[chip.dot, dotStyle]} />
        <Text style={chip.label}>LIVE GPS</Text>
      </View>
      {gps ? (
        <View>
          <Text style={chip.coords}>
            {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}
          </Text>
          <Text style={chip.updated}>Last ping · {gps.updatedAt}</Text>
        </View>
      ) : (
        <Text style={chip.waiting}>Acquiring signal…</Text>
      )}
      <Text style={chip.note}>Broadcast every 60 s · background-safe</Text>
    </BlurView>
  );
}

const chip = StyleSheet.create({
  wrap:    { borderRadius: 16, overflow: 'hidden', padding: 16, borderWidth: 1, borderColor: '#3B82F630', marginTop: 4 },
  header:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  dot:     { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22D3EE' },
  label:   { fontSize: 10, fontWeight: '700', color: '#22D3EE', letterSpacing: 2 },
  coords:  { fontSize: 13, color: '#F1F5F9', fontVariant: ['tabular-nums' as any], marginBottom: 3 },
  updated: { fontSize: 11, color: '#64748B' },
  waiting: { fontSize: 13, color: '#64748B', fontStyle: 'italic', marginBottom: 4 },
  note:    { fontSize: 10, color: '#334155', marginTop: 10 },
});

// ── Timer display ─────────────────────────────────────────────────────────────
function ElapsedTimer({ seconds }: { seconds: number }) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return (
    <View style={timer.wrap}>
      <Text style={timer.label}>ACTIVE FOR</Text>
      <Text style={timer.value}>
        {String(m).padStart(2, '0')}
        <Text style={timer.sep}>:</Text>
        {String(s).padStart(2, '0')}
      </Text>
    </View>
  );
}

const timer = StyleSheet.create({
  wrap:  { alignItems: 'center', paddingVertical: 8 },
  label: { fontSize: 10, fontWeight: '700', color: '#64748B', letterSpacing: 3, marginBottom: 4 },
  value: { fontSize: 52, fontWeight: '700', color: '#F1F5F9', fontVariant: ['tabular-nums' as any], letterSpacing: -2 },
  sep:   { color: '#3B82F6' },
});

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
=======
>>>>>>> 4252d71c791af1f2957fdf14e26a591ed146dfb3
export default function Escort() {
  const router = useRouter();
  const [isTracking,      setIsTracking]      = useState(false);
  const [loading,         setLoading]         = useState(false);
  const [checkingPremium, setCheckingPremium] = useState(true);
  const [isPremium,       setIsPremium]       = useState(false);
  const [sessionId,       setSessionId]       = useState<string | null>(null);
  const [startTime,       setStartTime]       = useState<string | null>(null);
  const [elapsedSeconds,  setElapsedSeconds]  = useState(0);
  const [currentGps,      setCurrentGps]      = useState<{ lat: number; lng: number; updatedAt: string } | null>(null);

<<<<<<< HEAD
  const intervalRef        = useRef<any>(null);
  const timerRef           = useRef<any>(null);
  const tokenRef           = useRef<string | null>(null);
  const trackingStartedRef = useRef(false);
  const isTrackingRef      = useRef(false);
  const appStateRef        = useRef(AppState.currentState);

  useEffect(() => { isTrackingRef.current = isTracking; }, [isTracking]);

  // ── Timer ──────────────────────────────────────────────────────────────────
=======
  const intervalRef         = useRef<any>(null);
  const timerRef            = useRef<any>(null);
  const tokenRef            = useRef<string | null>(null);
  // True once startLocationTracking has been called this focus cycle
  const trackingStartedRef  = useRef(false);
  // Mirrors isTracking as a ref so callbacks always see current value
  const isTrackingRef       = useRef(false);
  const appStateRef         = useRef(AppState.currentState);

  // Keep isTrackingRef in sync with state
  useEffect(() => { isTrackingRef.current = isTracking; }, [isTracking]);

  // ── Elapsed timer ─────────────────────────────────────────────────────────
>>>>>>> 4252d71c791af1f2957fdf14e26a591ed146dfb3
  useEffect(() => {
    if (isTracking && startTime) {
      const start = new Date(startTime).getTime();
      setElapsedSeconds(Math.floor((Date.now() - start) / 1000));
      timerRef.current = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - start) / 1000));
      }, 1000);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      setElapsedSeconds(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isTracking, startTime]);

<<<<<<< HEAD
  // ── AppState: foreground ↔ background task swap ───────────────────────────
=======
  // ── AppState: swap between foreground interval and background task ─────────
>>>>>>> 4252d71c791af1f2957fdf14e26a591ed146dfb3
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (nextState) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;
<<<<<<< HEAD
      if (!isTrackingRef.current || !tokenRef.current) return;
      if (prev === 'active' && nextState === 'background') {
=======

      if (!isTrackingRef.current || !tokenRef.current) return;

      if (prev === 'active' && nextState === 'background') {
        // Going to background: stop foreground interval, start background task
>>>>>>> 4252d71c791af1f2957fdf14e26a591ed146dfb3
        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
        try {
          const running = await Location.hasStartedLocationUpdatesAsync(ESCORT_TASK).catch(() => false);
          if (!running) {
            await Location.startLocationUpdatesAsync(ESCORT_TASK, {
              accuracy: Location.Accuracy.High,
              timeInterval: 60_000,
              distanceInterval: 0,
              foregroundService: {
                notificationTitle: '🛡 Se-Q Escort Active',
<<<<<<< HEAD
                notificationBody:  'Security can see your location.',
=======
                notificationBody:  'Security can see your location. Tap when you arrive safely.',
>>>>>>> 4252d71c791af1f2957fdf14e26a591ed146dfb3
              },
              pausesUpdatesAutomatically: false,
            });
          }
        } catch (_) {}
      } else if (nextState === 'active' && prev !== 'active') {
<<<<<<< HEAD
        try { await Location.stopLocationUpdatesAsync(ESCORT_TASK); } catch (_) {}
        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
=======
        // Coming to foreground: stop background task, restart foreground interval
        try { await Location.stopLocationUpdatesAsync(ESCORT_TASK); } catch (_) {}
        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
        // Post immediately then resume 60s cadence
>>>>>>> 4252d71c791af1f2957fdf14e26a591ed146dfb3
        postGpsPoint(tokenRef.current!);
        intervalRef.current = setInterval(() => postGpsPoint(tokenRef.current!), 60_000);
      }
    });
    return () => sub.remove();
  }, []);

<<<<<<< HEAD
  // ── Focus ──────────────────────────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      if (isTrackingRef.current) {
=======
  // ── Focus effect ──────────────────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      if (isTrackingRef.current) {
        // Already tracking — just ensure the interval is running (may have been
        // cleared on a previous blur). Don't re-run checkActiveEscort.
>>>>>>> 4252d71c791af1f2957fdf14e26a591ed146dfb3
        if (!intervalRef.current && tokenRef.current) {
          intervalRef.current = setInterval(() => postGpsPoint(tokenRef.current!), 60_000);
        }
      } else {
        trackingStartedRef.current = false;
        checkActiveEscort();
      }
<<<<<<< HEAD
      return () => {
=======

      return () => {
        // On blur: clear the foreground interval (background task takes over if backgrounded).
        // Do NOT reset trackingStartedRef here — it must stay true if we're tracking.
>>>>>>> 4252d71c791af1f2957fdf14e26a591ed146dfb3
        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      };
    }, [])
  );

<<<<<<< HEAD
  // ── Check / restore session ────────────────────────────────────────────────
=======
  // ── Check / restore active session ────────────────────────────────────────
>>>>>>> 4252d71c791af1f2957fdf14e26a591ed146dfb3
  const checkActiveEscort = async () => {
    setCheckingPremium(true);
    try {
      const token = await getAuthToken();
      if (!token) { router.replace('/auth/login'); return; }
      tokenRef.current = token;

<<<<<<< HEAD
=======
      // Always call /api/escort/status — backend is authoritative.
      // clearAuthData() wipes the local 'active_escort' key on logout, so
      // gating this call on local storage would silently miss live sessions.
>>>>>>> 4252d71c791af1f2957fdf14e26a591ed146dfb3
      try {
        const statusRes = await axios.get(`${BACKEND_URL}/api/escort/status`, {
          headers: { Authorization: `Bearer ${token}` }, timeout: 8000,
        });
<<<<<<< HEAD
=======

>>>>>>> 4252d71c791af1f2957fdf14e26a591ed146dfb3
        if (statusRes.data?.is_active && statusRes.data?.session_id) {
          const sid = statusRes.data.session_id;
          const sat = statusRes.data.started_at || new Date().toISOString();
          await AsyncStorage.multiSet([
            ['active_escort', JSON.stringify({ session_id: sid, started_at: sat })],
            ['auth_token', token],
          ]);
<<<<<<< HEAD
          setSessionId(sid); setStartTime(sat);
          setIsTracking(true); isTrackingRef.current = true;
=======
          setSessionId(sid);
          setStartTime(sat);
          setIsTracking(true);
          isTrackingRef.current = true;
>>>>>>> 4252d71c791af1f2957fdf14e26a591ed146dfb3
          startLocationTracking(token);
        } else {
          await AsyncStorage.removeItem('active_escort');
        }
      } catch (_statusErr) {
<<<<<<< HEAD
=======
        // Network error: fall back to local cache
>>>>>>> 4252d71c791af1f2957fdf14e26a591ed146dfb3
        const stored = await AsyncStorage.getItem('active_escort');
        if (stored) {
          try {
            const data = JSON.parse(stored);
<<<<<<< HEAD
            setIsTracking(true); isTrackingRef.current = true;
            setSessionId(data.session_id); setStartTime(data.started_at);
=======
            setIsTracking(true);
            isTrackingRef.current = true;
            setSessionId(data.session_id);
            setStartTime(data.started_at);
>>>>>>> 4252d71c791af1f2957fdf14e26a591ed146dfb3
            startLocationTracking(token);
          } catch (_) { await AsyncStorage.removeItem('active_escort'); }
        }
      }

<<<<<<< HEAD
=======
      // Premium check
>>>>>>> 4252d71c791af1f2957fdf14e26a591ed146dfb3
      const metadata = await getUserMetadata();
      if (metadata.isPremium) {
        setIsPremium(true);
      } else {
        const res = await axios.get(`${BACKEND_URL}/api/user/profile`, {
          headers: { Authorization: `Bearer ${token}` }, timeout: 10000,
        });
        const premium = res.data?.is_premium === true;
        setIsPremium(premium);
        if (!premium && !isTrackingRef.current) {
          Alert.alert(
            'Premium Feature',
            'Security Escort is a premium feature. Would you like to upgrade?',
            [
<<<<<<< HEAD
              { text: 'Go Back', onPress: () => router.back() },
              { text: 'Upgrade', onPress: () => router.replace('/premium') },
=======
              { text: 'Go Back',  onPress: () => router.back() },
              { text: 'Upgrade',  onPress: () => router.replace('/premium') },
>>>>>>> 4252d71c791af1f2957fdf14e26a591ed146dfb3
            ]
          );
        }
      }
    } catch (err: any) {
      if (err?.response?.status === 401) { await clearAuthData(); router.replace('/auth/login'); }
    } finally {
      setCheckingPremium(false);
    }
  };

  // ── Start escort ──────────────────────────────────────────────────────────
  const startEscort = async () => {
    if (!isPremium) { Alert.alert('Premium Required', 'Please upgrade to use Security Escort.'); return; }
<<<<<<< HEAD
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
=======
>>>>>>> 4252d71c791af1f2957fdf14e26a591ed146dfb3
    setLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission required');
        setLoading(false);
        return;
      }
      try { await Location.requestBackgroundPermissionsAsync(); } catch (_) {}

      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const token    = await getAuthToken();
      if (!token) { router.replace('/auth/login'); return; }
      tokenRef.current = token;

      const res = await axios.post(
        `${BACKEND_URL}/api/escort/action`,
        {
          action: 'start',
          location: {
            latitude:  location.coords.latitude,
            longitude: location.coords.longitude,
            accuracy:  location.coords.accuracy,
            timestamp: new Date().toISOString(),
          },
        },
        { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
      );

      const newSessionId = res.data.session_id;
      const startedAt    = new Date().toISOString();
      await AsyncStorage.multiSet([
        ['active_escort', JSON.stringify({ session_id: newSessionId, started_at: startedAt })],
        ['auth_token', token],
      ]);
<<<<<<< HEAD
      setSessionId(newSessionId); setStartTime(startedAt);
      setIsTracking(true); isTrackingRef.current = true;
      trackingStartedRef.current = false;
      startLocationTracking(token);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      if (err?.response?.status === 401) { await clearAuthData(); router.replace('/auth/login'); return; }
=======
      setSessionId(newSessionId);
      setStartTime(startedAt);
      setIsTracking(true);
      isTrackingRef.current = true;
      trackingStartedRef.current = false;  // allow fresh start
      startLocationTracking(token);
      Alert.alert('Escort Started', 'Nearby security can now track your journey safely.');
    } catch (err: any) {
      if (err?.response?.status === 401) { await clearAuthData(); router.replace('/auth/login'); return; }
      // Verify with backend in case POST succeeded before error was thrown
>>>>>>> 4252d71c791af1f2957fdf14e26a591ed146dfb3
      try {
        const tok = await getAuthToken();
        if (tok) {
          const check = await axios.get(`${BACKEND_URL}/api/escort/status`, {
            headers: { Authorization: `Bearer ${tok}` }, timeout: 8000,
          });
          if (check.data?.is_active && check.data?.session_id) {
            const sid = check.data.session_id;
            const sat = check.data.started_at || new Date().toISOString();
            await AsyncStorage.multiSet([
              ['active_escort', JSON.stringify({ session_id: sid, started_at: sat })],
              ['auth_token', tok],
            ]);
            tokenRef.current = tok;
            setSessionId(sid); setStartTime(sat);
            setIsTracking(true); isTrackingRef.current = true;
            trackingStartedRef.current = false;
            startLocationTracking(tok);
            return;
          }
        }
      } catch (_) {}
      Alert.alert('Error', err.response?.data?.detail || 'Failed to start escort. Please try again.');
    } finally {
      setLoading(false);
    }
  };

<<<<<<< HEAD
  // ── GPS point ─────────────────────────────────────────────────────────────
=======
  // ── Post a single GPS point ───────────────────────────────────────────────
>>>>>>> 4252d71c791af1f2957fdf14e26a591ed146dfb3
  const postGpsPoint = async (token: string) => {
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setCurrentGps({
        lat:       loc.coords.latitude,
        lng:       loc.coords.longitude,
        updatedAt: new Date().toLocaleTimeString(),
      });
      await axios.post(
        `${BACKEND_URL}/api/escort/location`,
        {
          latitude:  loc.coords.latitude,
          longitude: loc.coords.longitude,
          accuracy:  loc.coords.accuracy,
          timestamp: new Date().toISOString(),
        },
        { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }
      );
<<<<<<< HEAD
    } catch (_) {}
  };

  // ── Start tracking ────────────────────────────────────────────────────────
  const startLocationTracking = async (token: string) => {
    if (trackingStartedRef.current) return;
    trackingStartedRef.current = true;
    tokenRef.current = token;
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    await postGpsPoint(token);
=======
    } catch (err: any) {
      console.warn('[Escort] GPS post failed:', err?.response?.status);
    }
  };

  // ── Start location tracking (idempotent) ──────────────────────────────────
  // Manages the FOREGROUND interval only.
  // Background task is managed by the AppState listener above.
  const startLocationTracking = async (token: string) => {
    if (trackingStartedRef.current) {
      console.log('[Escort] startLocationTracking: already started, suppressing duplicate');
      return;
    }
    trackingStartedRef.current = true;
    tokenRef.current = token;

    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }

    // Post immediately so security screen shows GPS straight away
    await postGpsPoint(token);

    // Then every 60 seconds — foreground only
>>>>>>> 4252d71c791af1f2957fdf14e26a591ed146dfb3
    intervalRef.current = setInterval(() => postGpsPoint(token), 60_000);
  };

  // ── Stop escort ───────────────────────────────────────────────────────────
  const stopEscort = async () => {
<<<<<<< HEAD
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('Arrived Safely?', 'This will stop tracking and remove all route data.', [
=======
    Alert.alert('Arrived Safely?', 'Stopping will remove all tracking data.', [
>>>>>>> 4252d71c791af1f2957fdf14e26a591ed146dfb3
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Yes, I Arrived',
        onPress: async () => {
          setLoading(true);
          try {
            if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
            try { await Location.stopLocationUpdatesAsync(ESCORT_TASK); } catch (_) {}
            trackingStartedRef.current = false;
<<<<<<< HEAD
=======

>>>>>>> 4252d71c791af1f2957fdf14e26a591ed146dfb3
            const token = await getAuthToken();
            if (token) {
              await axios.post(
                `${BACKEND_URL}/api/escort/action`,
                { action: 'stop', location: { latitude: 0, longitude: 0, timestamp: new Date().toISOString() } },
                { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
              );
            }
            await AsyncStorage.removeItem('active_escort');
<<<<<<< HEAD
            setIsTracking(false); isTrackingRef.current = false;
            setSessionId(null); setStartTime(null);
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert('Arrived Safely!', 'Tracking stopped. Route data deleted.', [
=======
            setIsTracking(false);
            isTrackingRef.current = false;
            setSessionId(null);
            setStartTime(null);
            Alert.alert('Arrived Safely!', 'Tracking stopped. Data will be deleted.', [
>>>>>>> 4252d71c791af1f2957fdf14e26a591ed146dfb3
              { text: 'OK', onPress: () => router.back() },
            ]);
          } catch (_) {
            Alert.alert('Error', 'Failed to stop escort. Please try again.');
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

<<<<<<< HEAD
  // ── Loading screen ────────────────────────────────────────────────────────
  if (checkingPremium) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0A0F1C' }}>
        <LinearGradient
          colors={['#0A0F1C', '#0F172A', '#0A0F1C']}
          style={StyleSheet.absoluteFillObject}
        />
        <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={{ color: '#64748B', marginTop: 14, fontSize: 13, letterSpacing: 1 }}>
            AUTHENTICATING
          </Text>
        </SafeAreaView>
      </View>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: '#0A0F1C' }}>
      {/* Background gradient */}
      <LinearGradient
        colors={isTracking
          ? ['#051024', '#0c1a35', '#071322']
          : ['#0A0F1C', '#0F172A', '#0A0F1C']}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Subtle grid texture */}
      <View style={st.gridOverlay} pointerEvents="none">
        {Array.from({ length: 8 }).map((_, i) => (
          <View key={i} style={[st.gridLine, { top: `${i * 14}%` as any }]} />
        ))}
      </View>

      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <Animated.View entering={FadeInDown.duration(400)} style={st.header}>
          <TouchableOpacity style={st.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color="#94A3B8" />
          </TouchableOpacity>
          <View style={st.headerCenter}>
            <Text style={st.headerTitle}>SECURITY ESCORT</Text>
            {isTracking && (
              <Animated.View entering={ZoomIn.delay(100)} style={st.liveBadge}>
                <View style={st.liveDot} />
                <Text style={st.liveText}>LIVE</Text>
              </Animated.View>
            )}
          </View>
          {/* Premium badge */}
          <View style={st.premiumBadge}>
            <Ionicons name="star" size={11} color="#F59E0B" />
            <Text style={st.premiumText}>PRO</Text>
          </View>
        </Animated.View>

        {/* ── IDLE STATE ── */}
        {!isTracking ? (
          <View style={st.body}>
            {/* Orb */}
            <Animated.View entering={ZoomIn.delay(100).springify()} style={st.orbWrap}>
              <ShieldOrb active={false} />
            </Animated.View>

            {/* Headline */}
            <Animated.View entering={FadeInUp.delay(200)} style={st.headlineWrap}>
              <Text style={st.headline}>Ready to Escort</Text>
              <Text style={st.subheadline}>
                Activate tracking so nearby security operatives can monitor your journey in real time.
              </Text>
            </Animated.View>

            {/* Feature pills */}
            <View style={st.pillsWrap}>
              {[
                { icon: 'location-outline',       text: 'GPS broadcasted every 60 seconds' },
                { icon: 'shield-outline',          text: 'Runs safely in the background' },
                { icon: 'people-outline',          text: 'Visible to all nearby security' },
                { icon: 'trash-outline',           text: 'Route deleted on arrival' },
              ].map((f, i) => <FeaturePill key={i} icon={f.icon} text={f.text} index={i} />)}
            </View>

            {/* CTA */}
            <Animated.View entering={FadeInUp.delay(700)} style={st.ctaWrap}>
              <TouchableOpacity
                onPress={startEscort}
                disabled={loading}
                activeOpacity={0.85}
                style={st.startBtnWrap}
              >
                <LinearGradient
                  colors={loading ? ['#1E3A5F', '#1E3A5F'] : ['#2563EB', '#1d4ed8', '#1e40af']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={st.startBtn}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <View style={st.startIconBox}>
                        <Ionicons name="navigate" size={20} color="#fff" />
                      </View>
                      <Text style={st.startBtnText}>Start Escort</Text>
                      <Ionicons name="arrow-forward" size={18} color="#93C5FD" style={{ marginLeft: 4 }} />
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          </View>
        ) : (
          /* ── ACTIVE STATE ── */
          <Animated.View entering={FadeIn.duration(500)} style={st.body}>
            {/* Animated orb */}
            <View style={st.orbWrap}>
              <ShieldOrb active={true} />
            </View>

            {/* Timer */}
            <Animated.View entering={FadeInDown.delay(150)}>
              <ElapsedTimer seconds={elapsedSeconds} />
            </Animated.View>

            {/* Status row */}
            <Animated.View entering={FadeInUp.delay(200)} style={st.statusRow}>
              <View style={st.statusChip}>
                <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                <Text style={st.statusChipText}>Security notified</Text>
              </View>
              <View style={[st.statusChip, { borderColor: '#3B82F630', backgroundColor: '#3B82F610' }]}>
                <Ionicons name="wifi" size={14} color="#3B82F6" />
                <Text style={[st.statusChipText, { color: '#3B82F6' }]}>Broadcasting</Text>
              </View>
            </Animated.View>

            {/* GPS chip */}
            <Animated.View entering={FadeInUp.delay(300)} style={{ width: '100%' }}>
              <GpsChip gps={currentGps} />
            </Animated.View>

            {/* Safety tip */}
            <Animated.View entering={FadeInUp.delay(400)} style={st.tipBox}>
              <Ionicons name="information-circle-outline" size={16} color="#64748B" />
              <Text style={st.tipText}>
                Keep the app open or in the background. Tap "Arrived" when you reach your destination.
              </Text>
            </Animated.View>

            {/* Arrived button */}
            <Animated.View entering={FadeInUp.delay(500)} style={st.ctaWrap}>
              <TouchableOpacity
                onPress={stopEscort}
                disabled={loading}
                activeOpacity={0.85}
                style={st.startBtnWrap}
              >
                <LinearGradient
                  colors={loading ? ['#1E293B', '#1E293B'] : ['#059669', '#047857', '#065f46']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={st.startBtn}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <View style={[st.startIconBox, { backgroundColor: '#ffffff20' }]}>
                        <Ionicons name="checkmark" size={20} color="#fff" />
                      </View>
                      <Text style={st.startBtnText}>I've Arrived Safely</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          </Animated.View>
        )}
      </SafeAreaView>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════════
const st = StyleSheet.create({
  // Grid overlay
  gridOverlay: { position: 'absolute', inset: 0, overflow: 'hidden' },
  gridLine:    { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: '#ffffff06' },

  // Header
  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  backBtn:      { width: 38, height: 38, borderRadius: 10, backgroundColor: '#ffffff0a', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#ffffff10' },
  headerCenter: { flex: 1, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 10 },
  headerTitle:  { fontSize: 12, fontWeight: '700', color: '#94A3B8', letterSpacing: 3 },
  liveBadge:    { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#EF444420', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#EF444440' },
  liveDot:      { width: 5, height: 5, borderRadius: 3, backgroundColor: '#EF4444' },
  liveText:     { fontSize: 9, fontWeight: '800', color: '#EF4444', letterSpacing: 1.5 },
  premiumBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F59E0B15', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: '#F59E0B30' },
  premiumText:  { fontSize: 10, fontWeight: '700', color: '#F59E0B', letterSpacing: 1 },

  // Layout
  body:         { flex: 1, paddingHorizontal: 24, paddingTop: 8, alignItems: 'center' },
  orbWrap:      { marginBottom: 28, marginTop: 8 },
  headlineWrap: { alignItems: 'center', marginBottom: 28 },
  headline:     { fontSize: 26, fontWeight: '700', color: '#F1F5F9', textAlign: 'center', marginBottom: 10, letterSpacing: -0.5 },
  subheadline:  { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 21, maxWidth: 300 },

  // Pills
  pillsWrap:    { width: '100%', marginBottom: 28 },

  // Status row (active state)
  statusRow:    { flexDirection: 'row', gap: 10, marginBottom: 18 },
  statusChip:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 13, borderRadius: 20, backgroundColor: '#10B98110', borderWidth: 1, borderColor: '#10B98130' },
  statusChipText: { fontSize: 12, fontWeight: '600', color: '#10B981' },

  // Tip
  tipBox:       { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#ffffff06', borderRadius: 12, padding: 14, marginTop: 14, borderWidth: 1, borderColor: '#ffffff0a', width: '100%' },
  tipText:      { flex: 1, fontSize: 12, color: '#64748B', lineHeight: 18 },

  // CTA
  ctaWrap:      { width: '100%', marginTop: 'auto' as any, paddingBottom: Platform.OS === 'ios' ? 8 : 16 },
  startBtnWrap: { width: '100%', borderRadius: 16, overflow: 'hidden', shadowColor: '#3B82F6', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 16, elevation: 12 },
  startBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 18, paddingHorizontal: 24, gap: 12 },
  startIconBox: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#ffffff20', justifyContent: 'center', alignItems: 'center' },
  startBtnText: { fontSize: 16, fontWeight: '700', color: '#fff', letterSpacing: 0.3 },
=======
  const fmt = () => {
    const m = Math.floor(elapsedSeconds / 60);
    const s = elapsedSeconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  if (checkingPremium) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.loading}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={s.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.title}>Security Escort</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={s.content}>
        {isTracking ? (
          <View style={s.trackingBox}>
            <View style={s.pulseWrap}>
              <View style={s.pulseOuter} />
              <View style={s.pulseInner}>
                <Ionicons name="shield-checkmark" size={60} color="#10B981" />
              </View>
            </View>
            <Text style={s.trackTitle}>Escort Active</Text>
            <Text style={s.trackSub}>Security can track your journey</Text>
            <Text style={s.elapsed}>Duration: {fmt()}</Text>

            <View style={s.gpsPanel}>
              <View style={s.gpsHeader}>
                <Ionicons name="location" size={16} color="#10B981" />
                <Text style={s.gpsTitle}>GPS Location Tracking</Text>
                <View style={s.gpsDot} />
              </View>
              {currentGps ? (
                <>
                  <Text style={s.gpsCoords}>{currentGps.lat.toFixed(6)}, {currentGps.lng.toFixed(6)}</Text>
                  <Text style={s.gpsUpdated}>Updated: {currentGps.updatedAt}</Text>
                </>
              ) : (
                <Text style={s.gpsWaiting}>Acquiring location…</Text>
              )}
              <Text style={s.gpsNote}>GPS posted every 60 s · background-safe</Text>
            </View>

            <TouchableOpacity style={s.arrivedBtn} onPress={stopEscort} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name="checkmark-circle" size={24} color="#fff" />
                  <Text style={s.arrivedText}>I've Arrived Safely</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.startBox}>
            <View style={s.iconBox}>
              <Ionicons name="walk" size={80} color="#3B82F6" />
            </View>
            <Text style={s.mainTitle}>Security Escort</Text>
            <Text style={s.desc}>
              Enable tracking so nearby security personnel can monitor your journey and ensure your safety.
            </Text>
            <View style={s.features}>
              {[
                { icon: 'location', text: 'GPS recorded every 60 seconds' },
                { icon: 'shield',   text: 'Works when app is in background' },
                { icon: 'trash',    text: 'Data deleted when you arrive' },
              ].map((f, i) => (
                <View key={i} style={s.feature}>
                  <Ionicons name={f.icon as any} size={20} color="#10B981" />
                  <Text style={s.featureText}>{f.text}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity style={s.startBtn} onPress={startEscort} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name="play" size={24} color="#fff" />
                  <Text style={s.startText}>Start Escort</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#0F172A' },
  header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  title:       { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  loading:     { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#94A3B8', marginTop: 12 },
  content:     { flex: 1, padding: 20 },
  startBox:    { flex: 1, alignItems: 'center', paddingTop: 32 },
  iconBox:     { width: 140, height: 140, borderRadius: 70, backgroundColor: '#1E293B', justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  mainTitle:   { fontSize: 28, fontWeight: 'bold', color: '#fff', marginBottom: 12 },
  desc:        { fontSize: 16, color: '#94A3B8', textAlign: 'center', lineHeight: 24, marginBottom: 28 },
  features:    { width: '100%', backgroundColor: '#1E293B', borderRadius: 16, padding: 20, marginBottom: 28 },
  feature:     { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  featureText: { fontSize: 14, color: '#fff' },
  startBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#3B82F6', paddingVertical: 16, paddingHorizontal: 32, borderRadius: 12, width: '100%' },
  startText:   { fontSize: 18, fontWeight: '600', color: '#fff' },
  trackingBox: { flex: 1, alignItems: 'center', paddingTop: 32 },
  pulseWrap:   { position: 'relative', width: 140, height: 140, marginBottom: 24, justifyContent: 'center', alignItems: 'center' },
  pulseOuter:  { position: 'absolute', width: 140, height: 140, borderRadius: 70, backgroundColor: '#10B98130' },
  pulseInner:  { width: 100, height: 100, borderRadius: 50, backgroundColor: '#10B98120', justifyContent: 'center', alignItems: 'center' },
  trackTitle:  { fontSize: 28, fontWeight: 'bold', color: '#10B981', marginBottom: 8 },
  trackSub:    { fontSize: 16, color: '#94A3B8', marginBottom: 12 },
  elapsed:     { fontSize: 20, color: '#fff', fontWeight: '600', marginBottom: 28 },
  gpsPanel:    { width: '100%', backgroundColor: '#0F172A', borderRadius: 12, padding: 14, marginBottom: 24, borderWidth: 1, borderColor: '#10B98130' },
  gpsHeader:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  gpsTitle:    { fontSize: 13, fontWeight: '600', color: '#10B981', flex: 1 },
  gpsDot:      { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' },
  gpsCoords:   { fontSize: 13, color: '#fff', fontFamily: 'monospace', marginBottom: 4 },
  gpsUpdated:  { fontSize: 11, color: '#64748B' },
  gpsWaiting:  { fontSize: 13, color: '#64748B', fontStyle: 'italic' },
  gpsNote:     { fontSize: 11, color: '#475569', marginTop: 8 },
  arrivedBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#10B981', paddingVertical: 16, paddingHorizontal: 32, borderRadius: 12, width: '100%' },
  arrivedText: { fontSize: 18, fontWeight: '600', color: '#fff' },
>>>>>>> 4252d71c791af1f2957fdf14e26a591ed146dfb3
});
