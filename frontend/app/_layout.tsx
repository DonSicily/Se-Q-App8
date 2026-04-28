/**
 * _layout.tsx — Root layout
 *
 * PRIVACY & SAFETY FIXES
 *   1. All in-app floating notification alerts removed for civil users — nothing
 *      on-screen reveals this is a security app if an assailant checks the phone.
 *   2. Push notification banners suppressed for civil users (shouldShowAlert: false).
 *   3. Shake-to-activate no longer navigates directly to the panic screen.
 *      Instead a discreet 3-second banner appears at the top of the screen:
 *        – Tap → activates panic (navigates to panic-shake)
 *        – No tap for 3 s → silently dismisses
 *      The banner reveals no app-identity text to a casual observer.
 *   4. Security officers still receive the full in-app emergency alert popup.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  Alert, AppState, AppStateStatus, View, Text,
  TouchableOpacity, Animated, StyleSheet,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { startQueueProcessor } from '../utils/offlineQueue';
import { useShakeDetector } from '../utils/shakeDetector';
import { getAuthToken } from '../utils/auth';
import { checkAndConsumePanic } from '../utils/nativePanicBridge';

// Role-aware notification handler.
// – Security users receiving a panic alert: sound ON, banner ON.
// – Civil users: sound OFF, banner OFF (nothing reveals the app's purpose).
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const role = await AsyncStorage.getItem('user_role').catch(() => null);
    const data = notification.request.content.data as { type?: string };
    const isPanicAlert = data?.type === 'panic';
    const isSecurityUser = role === 'security';
    return {
      // Civil users see no system banner — nothing to reveal to an assailant
      shouldShowAlert:  isSecurityUser,
      shouldPlaySound:  isPanicAlert && isSecurityUser,
      shouldSetBadge:   isSecurityUser,
      shouldShowBanner: isSecurityUser,
      shouldShowList:   isSecurityUser,
    };
  },
});

type NotificationData = {
  type?: 'panic' | 'report' | 'general' | 'chat';
  event_id?: string;
  conversation_id?: string;
};

// ─── Shake Banner ─────────────────────────────────────────────────────────────
// A discreet 3-second dropdown that appears after a shake gesture.
// Tapping activates the panic screen. Waiting 3 s silently dismisses it.
// The banner text is intentionally neutral — no mention of "security" or "emergency".
interface ShakeBannerProps {
  onTap: () => void;
  onDismiss: () => void;
}

function ShakeBanner({ onTap, onDismiss }: ShakeBannerProps) {
  const translateY = useRef(new Animated.Value(-80)).current;

  useEffect(() => {
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      tension: 80,
      friction: 10,
    }).start();
  }, []);

  const handleDismiss = useCallback(() => {
    Animated.timing(translateY, {
      toValue: -80,
      duration: 200,
      useNativeDriver: true,
    }).start(onDismiss);
  }, [onDismiss]);

  const handleTap = useCallback(() => {
    Animated.timing(translateY, {
      toValue: -80,
      duration: 150,
      useNativeDriver: true,
    }).start(onTap);
  }, [onTap]);

  return (
    <Animated.View
      style={[bannerStyles.wrapper, { transform: [{ translateY }] }]}
      pointerEvents="box-none"
    >
      <TouchableOpacity
        style={bannerStyles.banner}
        onPress={handleTap}
        activeOpacity={0.85}
      >
        <View style={bannerStyles.dot} />
        <View style={bannerStyles.textCol}>
          <Text style={bannerStyles.title}>Tap to activate</Text>
          <Text style={bannerStyles.sub}>Swipe away or wait 3 s to cancel</Text>
        </View>
        <TouchableOpacity onPress={handleDismiss} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={bannerStyles.x}>✕</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

const bannerStyles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: 44,          // below status bar
    left: 16,
    right: 16,
    zIndex: 9999,
    elevation: 20,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  dot:     { width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' },
  textCol: { flex: 1 },
  title:   { fontSize: 14, fontWeight: '700', color: '#fff' },
  sub:     { fontSize: 11, color: '#64748B', marginTop: 1 },
  x:       { fontSize: 14, color: '#475569', fontWeight: '600' },
});

// ─── Inner app ────────────────────────────────────────────────────────────────
function AppContent() {
  const router    = useRouter();
  const segments  = useSegments();
  const notifListener    = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);
  const queueCleanup  = useRef<(() => void) | null>(null);
  const initialized   = useRef(false);

  const [userRole, setUserRole] = useState<string | null>(null);
  // Stable ref — lets async notification callback read the current role without
  // capturing a stale closure from the effect registration time.
  const userRoleRef = useRef<string | null>(null);
  useEffect(() => { userRoleRef.current = userRole; }, [userRole]);

  // ── Shake banner state ────────────────────────────────────────────────
  const [bannerVisible, setBannerVisible] = useState(false);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showShakeBanner = useCallback(() => {
    setBannerVisible(true);
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    bannerTimerRef.current = setTimeout(() => {
      setBannerVisible(false);
    }, 3000);
  }, []);

  const handleBannerTap = useCallback(() => {
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    setBannerVisible(false);
    try { router.push('/civil/panic-shake'); } catch (_) {}
  }, []);

  const handleBannerDismiss = useCallback(() => {
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    setBannerVisible(false);
  }, []);

  useEffect(() => () => {
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
  }, []);

  // ── User role (gates JS shake detector) ──────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem('user_role').then(role => setUserRole(role));
  }, [segments.join('/')]);

  const currentRoute    = segments.join('/');
  const isOnPanicScreen = currentRoute.includes('panic-shake') || currentRoute.includes('panic-active');
  const shakeEnabled    = userRole === 'civil' && !isOnPanicScreen;

  const handleShakeTrigger = useCallback(async () => {
    if (isOnPanicScreen) return;

    try {
      const panicActive = await AsyncStorage.getItem('panic_active');
      const activePanic = await AsyncStorage.getItem('active_panic');
      if (panicActive === 'true' || !!activePanic) return;
    } catch (_) {}

    // Show discreet 3-second banner instead of immediately opening the panic screen.
    // The banner makes no mention of emergencies or security — safe if seen by
    // an assailant who glances at the phone.
    showShakeBanner();
  }, [isOnPanicScreen, showShakeBanner]);

  useShakeDetector({
    enabled:        shakeEnabled,
    threshold:      2.2,
    requiredShakes: 3,
    windowMs:       2000,
    cooldownMs:     6000,
    onTriggered:    handleShakeTrigger,
  });

  // ── Native shake bridge ────────────────────────────────────────────────
  useEffect(() => {
    let isMounted = true;
    let retryCount = 0;
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 300;

    const navigate = async () => {
      try {
        const pending = await checkAndConsumePanic();
        if (!pending || !isMounted) return;

        const role = await AsyncStorage.getItem('user_role');
        if (role !== 'civil') return;

        const route = segments.join('/');
        if (route.includes('panic-shake') || route.includes('panic-active')) return;

        console.log('[Layout] Navigating to panic-shake from cold start');
        router.replace('/civil/panic-shake');
      } catch (error) {
        console.error('[Layout] Navigation error:', error);
        if (retryCount < MAX_RETRIES) {
          retryCount++;
          setTimeout(navigate, RETRY_DELAY);
        }
      }
    };

    const coldStartTimer = setTimeout(navigate, 500);

    const appStateSub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') navigate();
    });

    return () => {
      isMounted = false;
      clearTimeout(coldStartTimer);
      appStateSub.remove();
    };
  }, [segments]);

  // ── Offline queue ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      queueCleanup.current = startQueueProcessor();
    }
    return () => { queueCleanup.current?.(); queueCleanup.current = null; };
  }, []);

  // ── Push notifications ────────────────────────────────────────────────
  useEffect(() => {
    notifListener.current = Notifications.addNotificationReceivedListener(n => {
      const d = n.request.content.data as NotificationData;
      // Only show the in-app alert popup for security/admin users receiving
      // a live panic alert.  Civil users must NEVER see an in-app popup —
      // it would reveal the app's purpose to an assailant observing the screen.
      if (d?.type === 'panic' && userRoleRef.current === 'security') {
        Alert.alert(
          '🚨 EMERGENCY ALERT',
          n.request.content.body || 'Panic alert nearby!',
          [
            { text: 'View',    onPress: () => { try { router.push('/security/panics'); } catch (_) {} } },
            { text: 'Dismiss', style: 'cancel' },
          ]
        );
      }
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(r => {
      const d = r.notification.request.content.data as NotificationData;
      try {
        if (d?.type === 'panic')       router.push('/security/panics');
        else if (d?.type === 'report') router.push('/security/reports');
        else if (d?.type === 'chat' && d?.conversation_id)
          router.push(`/security/chat/${d.conversation_id}` as any);
      } catch (_) {}
    });

    return () => {
      notifListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <Slot />
      {bannerVisible && (
        <ShakeBanner onTap={handleBannerTap} onDismiss={handleBannerDismiss} />
      )}
    </View>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: '#0F172A' }}>
        <AppContent />
      </View>
    </SafeAreaProvider>
  );
}
