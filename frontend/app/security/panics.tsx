/**
 * security/panics.tsx — Active Panics
 *
 * FIX #5 — SECURITY ALARM RING
 *   An alarm sound now plays on the Security Panics screen whenever there are
 *   active panics. It starts automatically when the screen is focused and
 *   active panics are present, and stops when all panics are resolved or the
 *   officer navigates away.  The officer can also silence it manually with the
 *   "Silence Alarm" button shown in the header while the alarm is ringing.
 *
 *   The alarm uses expo-av with isLooping=true. It is cleaned up on unmount
 *   and on screen blur so it never leaks into other screens.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  ActivityIndicator, Alert, Linking, Platform, Modal,
  TextInput, KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import axios from 'axios';
import { getAuthToken, clearAuthData } from '../../utils/auth';
import { LocationMapModal } from '../../components/LocationMapModal';
import BACKEND_URL from '../../utils/config';


// Poll every 10 seconds for live GPS
const POLL_INTERVAL = 10000;

const EMERGENCY_CATEGORIES: Record<string, { label: string; icon: string; color: string }> = {
  violence:   { label: 'Violence/Assault',       icon: 'alert-circle', color: '#EF4444' },
  robbery:    { label: 'Armed Robbery',           icon: 'warning',      color: '#F97316' },
  kidnapping: { label: 'Kidnapping',              icon: 'body',         color: '#DC2626' },
  breakin:    { label: 'Break-in/Burglary',       icon: 'home',         color: '#8B5CF6' },
  harassment: { label: 'Harassment/Stalking',     icon: 'eye',          color: '#EC4899' },
  medical:    { label: 'Medical Emergency',       icon: 'medkit',       color: '#10B981' },
  fire:       { label: 'Fire Outbreak',           icon: 'flame',        color: '#F59E0B' },
  other:      { label: 'Other Emergency',         icon: 'help-circle',  color: '#64748B' },
};

interface GpsPt {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp: string;
}

export default function SecurityPanics() {
  const router = useRouter();
  const [panics, setPanics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [locationModal, setLocationModal] = useState<{
    visible: boolean; lat: number; lng: number; title: string
  } | null>(null);
  const [respondModal, setRespondModal] = useState<any>(null);
  const [countdown, setCountdown] = useState(10);
  const pollRef = useRef<any>(null);
  const countRef = useRef<any>(null);

  // ── Ambient audio player state ────────────────────────────────────────────
  const soundRef    = useRef<Audio.Sound | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState<string | null>(null);

  // ── FIX #5: Alarm state ───────────────────────────────────────────────────
  const alarmRef     = useRef<Audio.Sound | null>(null);
  const [alarmOn, setAlarmOn]           = useState(false);
  const [alarmSilenced, setAlarmSilenced] = useState(false);
  // Track the panic count we last triggered the alarm for, so we re-trigger
  // when new panics arrive even if the officer silenced the previous batch.
  const lastAlarmCountRef = useRef(0);

  // ── Inline chat state (opened from Respond → Message) ────────────────────
  const [chatConv, setChatConv] = useState<{
    convId: string; otherUserId: string; otherName: string;
  } | null>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatSending, setChatSending] = useState(false);

  // ── Alarm helpers ─────────────────────────────────────────────────────────
  const startAlarm = async () => {
    if (alarmRef.current) return; // already playing
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });
      // Use the system notification sound as the alarm tone.
      // This URI is always available on Android without bundling an asset.
      // On iOS it falls back gracefully if the URI is unavailable.
      const alarmUri =
        Platform.OS === 'android'
          ? 'android.resource://com.safeguard.app/raw/notification'
          : 'system://alarm';
      const { sound } = await Audio.Sound.createAsync(
        { uri: alarmUri },
        { isLooping: true, volume: 1.0, shouldPlay: true }
      ).catch(async () => {
      // Fallback: if the platform URI fails, use a CDN alarm tone.
      // NOTE: require() is resolved statically by Metro at bundle time — never
      // use require() for optional/fallback assets that may not exist on disk.
      return Audio.Sound.createAsync(
        { uri: 'https://assets.mixkit.co/active_storage/sfx/212/212-preview.mp3' },
        { isLooping: true, volume: 1.0, shouldPlay: true }
      );
      });
      alarmRef.current = sound;
      setAlarmOn(true);
    } catch (err) {
      console.warn('[Panics] Could not start alarm:', err);
    }
  };

  const stopAlarm = async () => {
    if (alarmRef.current) {
      try { await alarmRef.current.stopAsync(); } catch (_) {}
      try { await alarmRef.current.unloadAsync(); } catch (_) {}
      alarmRef.current = null;
    }
    setAlarmOn(false);
  };

  const silenceAlarm = async () => {
    await stopAlarm();
    setAlarmSilenced(true);
    // Remember the count at silence time — if new panics arrive later, re-ring.
    lastAlarmCountRef.current = panics.length;
  };

  // ── React to panic count changes ──────────────────────────────────────────
  useEffect(() => {
    const count = panics.length;

    if (count === 0) {
      // All clear — stop alarm and reset silence flag for next time.
      stopAlarm();
      setAlarmSilenced(false);
      lastAlarmCountRef.current = 0;
      return;
    }

    // New panics arrived since officer last silenced → re-ring.
    const newPanicsArrived = count > lastAlarmCountRef.current;
    if (newPanicsArrived) {
      setAlarmSilenced(false);
      lastAlarmCountRef.current = count;
    }

    if (!alarmSilenced || newPanicsArrived) {
      startAlarm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panics.length]);

  // ── Ambient audio helpers ─────────────────────────────────────────────────
  const resolveAudioUrl = (url: string): string => {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    return `${BACKEND_URL}${url.startsWith('/') ? '' : '/'}${url}`;
  };

  const stopAudio = async () => {
    if (soundRef.current) {
      try { await soundRef.current.stopAsync(); } catch (_) {}
      try { await soundRef.current.unloadAsync(); } catch (_) {}
      soundRef.current = null;
    }
    setPlayingId(null);
    setAudioLoading(null);
  };

  const playAmbientAudio = async (rawUrl: string, panicId: string) => {
    if (playingId === panicId) {
      await stopAudio();
      return;
    }
    await stopAudio();

    const url = resolveAudioUrl(rawUrl);
    if (!url) return;

    setAudioLoading(panicId);
    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: false });
      const { sound } = await Audio.Sound.createAsync(
        { uri: url },
        { shouldPlay: true }
      );
      soundRef.current = sound;
      setPlayingId(panicId);
      setAudioLoading(null);

      sound.setOnPlaybackStatusUpdate((status: any) => {
        if (status.isLoaded && status.didJustFinish) {
          stopAudio();
        }
        if (!status.isLoaded && status.error) {
          setAudioLoading(null);
          setPlayingId(null);
        }
      });
    } catch (err: any) {
      setAudioLoading(null);
      Alert.alert('Playback Error', 'Could not play ambient audio: ' + (err?.message || ''));
    }
  };

  // Cleanup ambient audio on unmount
  useEffect(() => { return () => { stopAudio(); }; }, []);

  // Stop ambient audio when navigating away
  useFocusEffect(
    useCallback(() => {
      return () => { stopAudio(); };
    }, [])
  );

  // FIX #5: Stop alarm when screen loses focus (officer navigates away).
  useFocusEffect(
    useCallback(() => {
      // Screen gained focus — alarm will auto-start via the panics.length effect
      return () => {
        // Screen lost focus — stop alarm so it doesn't ring in the background
        stopAlarm();
        setAlarmSilenced(false);
        lastAlarmCountRef.current = 0;
      };
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      loadPanics();
      startPolling();
      return () => stopPolling();
    }, [])
  );

  const startPolling = () => {
    stopPolling();
    pollRef.current = setInterval(() => {
      loadPanics();
      setCountdown(10);
    }, POLL_INTERVAL);
    countRef.current = setInterval(() => {
      setCountdown(p => (p <= 1 ? 10 : p - 1));
    }, 1000);
  };

  const stopPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (countRef.current) clearInterval(countRef.current);
  };

  const loadPanics = async () => {
    try {
      const token = await getAuthToken();
      if (!token) { router.replace('/auth/login'); return; }
      const res = await axios.get(
        `${BACKEND_URL}/api/security/nearby-panics?t=${Date.now()}`,
        { headers: { Authorization: `Bearer ${token}`, 'Cache-Control': 'no-cache' }, timeout: 15000 }
      );
      setPanics(res.data || []);
    } catch (err: any) {
      if (err?.response?.status === 401) {
        await clearAuthData();
        router.replace('/auth/login');
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const catInfo = (cat: string) => EMERGENCY_CATEGORIES[cat] || EMERGENCY_CATEGORIES.other;

  const formatTime = (ts: string) => {
    try {
      return new Date(ts).toLocaleString('en-US', {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        month: 'short', day: 'numeric',
      });
    } catch { return ts; }
  };

  const formatDateTime = (ts: string) => {
    const d = new Date(ts);
    return {
      date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      time: d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    };
  };

  const getSenderName = (item: any) =>
    (item.full_name || '').trim() || item.user_name || item.user_email || item.email || 'Unknown User';

  const callUser = (phone: string) =>
    phone ? Linking.openURL(`tel:${phone}`) : Alert.alert('No Phone', 'Phone number not available');

  // ── In-app chat (opened from Respond modal) ───────────────────────────────
  const openInAppChat = async (panicItem: any) => {
    setRespondModal(null);
    const token = await getAuthToken();
    if (!token) return;

    const otherUserId = panicItem.user_id;
    const otherName   = getSenderName(panicItem);
    setChatLoading(true);

    try {
      const startRes = await axios.post(
        `${BACKEND_URL}/api/chat/start`,
        { to_user_id: otherUserId },
        { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
      );
      const convId    = startRes.data?.conversation_id;
      const isNewConv = startRes.data?.existing === false;

      const cat = panicItem.emergency_category || 'emergency';
      const lat = panicItem.latitude?.toFixed(4) ?? '?';
      const lng = panicItem.longitude?.toFixed(4) ?? '?';

      // Determine whether to send the preset opening message:
      // Always send if conversation is brand new.
      // Also send if the conversation exists but has no messages yet.
      let shouldSendPreset = isNewConv;
      if (!shouldSendPreset && convId) {
        try {
          const check = await axios.get(
            `${BACKEND_URL}/api/chat/${convId}/messages`,
            { headers: { Authorization: `Bearer ${token}` }, timeout: 8000 }
          );
          shouldSendPreset = (check.data?.messages || []).length === 0;
        } catch (_) { shouldSendPreset = true; }
      }

      if (shouldSendPreset) {
        const PRESET_MSG =
          `🚨 SECURITY RESPONSE — ${cat.toUpperCase()} ALERT\n\n` +
          `We have received your emergency alert at coordinates ${lat}, ${lng}.\n\n` +
          `Please send us a brief Situation Report (SITREP) if you are able to communicate safely:\n` +
          `• Are you safe right now?\n` +
          `• What is happening?\n` +
          `• Do you need immediate physical response?\n\n` +
          `A security operative is being dispatched. Stay calm. Help is on the way. 🛡`;

        await axios.post(
          `${BACKEND_URL}/api/chat/send`,
          { to_user_id: otherUserId, content: PRESET_MSG, message_type: 'text' },
          { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }
        );
      }

      const msgRes = await axios.get(
        `${BACKEND_URL}/api/chat/${convId}/messages`,
        { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }
      );
      setChatMessages(msgRes.data?.messages || []);
      setChatConv({ convId, otherUserId, otherName });
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.detail || 'Could not open chat');
    } finally {
      setChatLoading(false);
    }
  };

  const loadChatMessages = async (convId: string) => {
    const token = await getAuthToken();
    if (!token) return;
    try {
      const res = await axios.get(
        `${BACKEND_URL}/api/chat/${convId}/messages`,
        { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }
      );
      setChatMessages(res.data?.messages || []);
    } catch (_) {}
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim() || !chatConv) return;
    setChatSending(true);
    const token = await getAuthToken();
    if (!token) { setChatSending(false); return; }
    try {
      await axios.post(
        `${BACKEND_URL}/api/chat/send`,
        { to_user_id: chatConv.otherUserId, content: chatInput.trim(), message_type: 'text' },
        { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }
      );
      setChatInput('');
      await loadChatMessages(chatConv.convId);
    } catch (_) {} finally { setChatSending(false); }
  };

  const openInMaps = (lat: number, lng: number, label: string) => {
    const url = Platform.select({
      ios: `maps:?q=${encodeURIComponent(label)}&ll=${lat},${lng}`,
      android: `geo:${lat},${lng}?q=${lat},${lng}(${encodeURIComponent(label)})`,
    });
    if (url) Linking.openURL(url).catch(() => Alert.alert('Error', 'Could not open maps'));
  };

  // ── GPS timeline row ──────────────────────────────────────────────────────
  const renderGpsRow = (pt: GpsPt, index: number, total: number) => (
    <TouchableOpacity
      key={`${index}-${pt.timestamp}`}
      style={[gpsStyles.row, index === 0 && gpsStyles.rowLatest]}
      onPress={() =>
        setLocationModal({
          visible: true,
          lat: pt.latitude,
          lng: pt.longitude,
          title: `Location @ ${formatTime(pt.timestamp)}`,
        })
      }
      activeOpacity={0.7}
    >
      <View style={gpsStyles.trail}>
        <View style={[gpsStyles.dot, index === 0 && gpsStyles.dotLatest]} />
        {index < total - 1 && <View style={gpsStyles.line} />}
      </View>
      <View style={gpsStyles.content}>
        <View style={gpsStyles.topRow}>
          {index === 0 && (
            <View style={gpsStyles.latestBadge}>
              <Text style={gpsStyles.latestBadgeText}>LATEST</Text>
            </View>
          )}
          <Text style={gpsStyles.coords} numberOfLines={1}>
            {pt.latitude.toFixed(6)}, {pt.longitude.toFixed(6)}
          </Text>
        </View>
        <Text style={gpsStyles.time}>{formatTime(pt.timestamp)}</Text>
        {pt.accuracy != null && (
          <Text style={gpsStyles.accuracy}>±{Math.round(pt.accuracy)}m accuracy</Text>
        )}
      </View>
      <Ionicons name="map-outline" size={16} color="#3B82F6" style={{ marginLeft: 6 }} />
    </TouchableOpacity>
  );

  // ── Panic card ────────────────────────────────────────────────────────────
  const renderPanic = ({ item }: any) => {
    const cat = catInfo(item.emergency_category);
    const dt = formatDateTime(item.activated_at);
    const name = getSenderName(item);
    const history: GpsPt[] = item.location_history || [];
    const chronoHistory = [...history].reverse();

    return (
      <View style={styles.card}>
        {/* Top badges */}
        <View style={styles.topRow}>
          <View style={styles.activeBadge}>
            <Ionicons name="alert-circle" size={14} color="#EF4444" />
            <Text style={styles.activeBadgeText}>ACTIVE PANIC</Text>
          </View>
          <View style={[styles.catBadge, { backgroundColor: `${cat.color}20` }]}>
            <Ionicons name={cat.icon as any} size={14} color={cat.color} />
            <Text style={[styles.catText, { color: cat.color }]}>{cat.label}</Text>
          </View>
        </View>

        {/* User info */}
        <View style={styles.userRow}>
          <View style={styles.avatar}>
            <Ionicons name="person-circle" size={44} color="#3B82F6" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.userName}>{name}</Text>
            <Text style={styles.userEmail}>{item.user_email || 'No email'}</Text>
            {item.user_phone ? (
              <Text style={styles.userPhone}>{item.user_phone}</Text>
            ) : (
              <Text style={styles.userPhoneEmpty}>No phone on file</Text>
            )}
          </View>
        </View>

        {/* Details */}
        <View style={styles.details}>
          {[
            { icon: 'calendar', text: dt.date },
            { icon: 'time', text: dt.time },
            { icon: 'location', text: `${item.latitude?.toFixed(4)}, ${item.longitude?.toFixed(4)}` },
            { icon: 'pulse', text: `${item.location_count || 0} location updates`, color: '#10B981' },
          ].map((r, i) => (
            <View key={i} style={styles.detailRow}>
              <Ionicons name={r.icon as any} size={15} color={r.color || '#94A3B8'} />
              <Text style={[styles.detailText, r.color ? { color: r.color } : {}]}>{r.text}</Text>
            </View>
          ))}
        </View>

        {/* ── LIVE GPS TRACK ── */}
        <View style={gpsStyles.container}>
          <View style={gpsStyles.header}>
            <Ionicons name="trail-sign" size={16} color="#F59E0B" />
            <Text style={gpsStyles.title}>Live GPS Track</Text>
            {history.length > 0 && (
              <View style={gpsStyles.countBadge}>
                <Text style={gpsStyles.countText}>{history.length}</Text>
              </View>
            )}
            <View style={gpsStyles.liveBadge}>
              <View style={gpsStyles.liveDot} />
              <Text style={gpsStyles.liveText}>LIVE · {countdown}s</Text>
            </View>
          </View>

          {chronoHistory.length === 0 ? (
            <View style={gpsStyles.empty}>
              <Ionicons name="time-outline" size={28} color="#334155" />
              <Text style={gpsStyles.emptyText}>No GPS coordinates yet</Text>
              <Text style={gpsStyles.emptySubtext}>Points will appear as user moves</Text>
            </View>
          ) : (
            <View>
              {chronoHistory.map((pt, i) => renderGpsRow(pt, i, chronoHistory.length))}
            </View>
          )}
        </View>

        {/* ── AMBIENT AUDIO ── */}
        {item.ambient_audio_url ? (
          <TouchableOpacity
            style={[
              audioStyles.btn,
              playingId === item.id && audioStyles.btnPlaying,
            ]}
            onPress={() => playAmbientAudio(item.ambient_audio_url, item.id)}
            disabled={audioLoading === item.id}
          >
            {audioLoading === item.id ? (
              <ActivityIndicator size="small" color="#F97316" />
            ) : (
              <Ionicons
                name={playingId === item.id ? 'stop-circle' : 'mic'}
                size={18}
                color={playingId === item.id ? '#fff' : '#F97316'}
              />
            )}
            <Text style={[
              audioStyles.btnText,
              playingId === item.id && audioStyles.btnTextPlaying,
            ]}>
              {audioLoading === item.id
                ? 'Loading…'
                : playingId === item.id
                  ? 'Stop Audio'
                  : '🎙 Ambient Audio (30s)'}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={audioStyles.pending}>
            <Ionicons name="mic-outline" size={14} color="#475569" />
            <Text style={audioStyles.pendingText}>🎙 Ambient audio — processing…</Text>
          </View>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.respondBtn}
            onPress={() => {
              if (!item.latitude || !item.longitude) {
                Alert.alert('Location Error', 'User location not available');
                return;
              }
              setRespondModal(item);
            }}
          >
            <Ionicons name="navigate" size={20} color="#fff" />
            <Text style={styles.respondBtnText}>Respond</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ── Inline chat view (Respond → Message) ─────────────────────────────────
  if (chatConv) {
    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={chatSt.header}>
            <TouchableOpacity onPress={() => { setChatConv(null); setChatMessages([]); setChatInput(''); }} style={{ padding: 4 }}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={chatSt.headerName}>{chatConv.otherName}</Text>
              <Text style={chatSt.headerSub}>Direct message · Civil user</Text>
            </View>
            <TouchableOpacity onPress={() => loadChatMessages(chatConv.convId)}>
              <Ionicons name="refresh" size={22} color="#3B82F6" />
            </TouchableOpacity>
          </View>

          {chatLoading ? (
            <View style={chatSt.loadBox}>
              <ActivityIndicator size="large" color="#3B82F6" />
              <Text style={chatSt.loadText}>Opening conversation…</Text>
            </View>
          ) : (
            <FlatList
              data={chatMessages}
              keyExtractor={item => item.id}
              style={{ flex: 1 }}
              contentContainerStyle={chatSt.messagesList}
              renderItem={({ item }) => (
                <View style={[chatSt.bubble, item.is_mine ? chatSt.mine : chatSt.theirs]}>
                  <Text style={[chatSt.bubbleText, item.is_mine && { color: '#fff' }]}>{item.content}</Text>
                  <Text style={[chatSt.bubbleTime, item.is_mine && { color: '#ffffff80' }]}>
                    {new Date(item.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              )}
              ListEmptyComponent={
                <View style={chatSt.emptyChat}>
                  <Ionicons name="chatbubbles-outline" size={48} color="#334155" />
                  <Text style={chatSt.emptyChatText}>No messages yet</Text>
                </View>
              }
            />
          )}

          <View style={chatSt.inputRow}>
            <TextInput
              style={chatSt.input}
              placeholder="Type a message…"
              placeholderTextColor="#64748B"
              value={chatInput}
              onChangeText={setChatInput}
              multiline
            />
            <TouchableOpacity
              style={[chatSt.sendBtn, !chatInput.trim() && chatSt.sendBtnOff]}
              onPress={sendChatMessage}
              disabled={!chatInput.trim() || chatSending}
            >
              {chatSending
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="send" size={20} color="#fff" />}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace('/security/home')} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Active Panics ({panics.length})</Text>
        {/* FIX #5: Silence alarm button — only visible while alarm is ringing */}
        {alarmOn ? (
          <TouchableOpacity onPress={silenceAlarm} style={styles.silenceBtn}>
            <Ionicons name="volume-mute" size={20} color="#fff" />
            <Text style={styles.silenceBtnText}>Silence</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={() => { loadPanics(); setCountdown(10); }}>
            <Ionicons name="refresh" size={24} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {/* FIX #5: Alarm banner shown while alarm is active */}
      {alarmOn && (
        <View style={styles.alarmBanner}>
          <Ionicons name="alarm" size={18} color="#fff" />
          <Text style={styles.alarmBannerText}>🔴 EMERGENCY ALARM ACTIVE — {panics.length} panic{panics.length !== 1 ? 's' : ''}</Text>
          <TouchableOpacity onPress={silenceAlarm}>
            <Ionicons name="close-circle" size={20} color="#ffffff90" />
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#EF4444" />
        </View>
      ) : (
        <FlatList
          data={panics}
          renderItem={renderPanic}
          keyExtractor={item => item.id || item._id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="shield-checkmark" size={80} color="#64748B" />
              <Text style={styles.emptyText}>No active panics</Text>
              <Text style={styles.emptySubtext}>All clear in your area</Text>
            </View>
          }
        />
      )}

      {/* Refresh bar */}
      <View style={styles.refreshBar}>
        <Ionicons name="sync-outline" size={11} color="#475569" style={{ marginRight: 5 }} />
        <Text style={styles.refreshBarText}>Live GPS — next update in {countdown}s</Text>
      </View>

      {locationModal && (
        <LocationMapModal
          visible={locationModal.visible}
          onClose={() => setLocationModal(null)}
          latitude={locationModal.lat}
          longitude={locationModal.lng}
          title={locationModal.title}
        />
      )}

      {/* Respond modal */}
      {respondModal && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setRespondModal(null)}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setRespondModal(null)}>
            <View style={styles.respondModal}>
              <Text style={styles.respondTitle}>🚨 Respond to Panic</Text>
              <Text style={styles.respondName}>{getSenderName(respondModal)}</Text>
              {(respondModal.user_phone || respondModal.phone) && (
                <Text style={styles.respondPhone}>📞 {respondModal.user_phone || respondModal.phone}</Text>
              )}
              <Text style={styles.respondCoords}>
                📍 {respondModal.latitude?.toFixed(4)}, {respondModal.longitude?.toFixed(4)}
              </Text>

              <TouchableOpacity
                style={[styles.respondBtn2, { backgroundColor: '#8B5CF6' }]}
                onPress={() => openInAppChat(respondModal)}
              >
                <Ionicons name="chatbubble-ellipses" size={18} color="#fff" />
                <Text style={styles.respondBtn2Text}>Message In-App</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.respondBtn2}
                onPress={() => {
                  setRespondModal(null);
                  setLocationModal({ visible: true, lat: respondModal.latitude, lng: respondModal.longitude, title: `${getSenderName(respondModal)}'s Location` });
                }}
              >
                <Ionicons name="map" size={18} color="#fff" />
                <Text style={styles.respondBtn2Text}>View on Map</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.respondBtn2, { backgroundColor: '#10B981' }]}
                onPress={() => { setRespondModal(null); callUser(respondModal.user_phone || respondModal.phone); }}
              >
                <Ionicons name="call" size={18} color="#fff" />
                <Text style={styles.respondBtn2Text}>Call</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.respondBtn2, { backgroundColor: '#334155' }]}
                onPress={() => setRespondModal(null)}
              >
                <Ionicons name="close-circle" size={18} color="#fff" />
                <Text style={styles.respondBtn2Text}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#0F172A' },
  header:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#1E293B' },
  backBtn:          { padding: 4 },
  headerTitle:      { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  // FIX #5: Silence button + alarm banner styles
  silenceBtn:       { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#EF444430', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: '#EF4444' },
  silenceBtnText:   { fontSize: 13, fontWeight: '700', color: '#fff' },
  alarmBanner:      { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#EF4444', paddingHorizontal: 16, paddingVertical: 10 },
  alarmBannerText:  { flex: 1, fontSize: 13, fontWeight: '700', color: '#fff' },
  loadingBox:       { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list:             { padding: 16, paddingBottom: 40 },
  card:             { backgroundColor: '#1E293B', borderRadius: 16, padding: 16, marginBottom: 16, borderLeftWidth: 4, borderLeftColor: '#EF4444' },
  topRow:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  activeBadge:      { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EF444420', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, gap: 5 },
  activeBadgeText:  { fontSize: 11, fontWeight: '800', color: '#EF4444' },
  catBadge:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, gap: 5 },
  catText:          { fontSize: 11, fontWeight: '600' },
  userRow:          { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  avatar:           { width: 52, height: 52, borderRadius: 26, backgroundColor: '#3B82F620', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  userName:         { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 3 },
  userEmail:        { fontSize: 12, color: '#94A3B8', marginBottom: 2 },
  userPhone:        { fontSize: 13, color: '#10B981', fontWeight: '600' },
  userPhoneEmpty:   { fontSize: 12, color: '#475569', fontStyle: 'italic' },
  details:          { backgroundColor: '#0F172A', borderRadius: 12, padding: 12, marginBottom: 12 },
  detailRow:        { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  detailText:       { fontSize: 13, color: '#94A3B8' },
  actions:          { flexDirection: 'row', marginTop: 12 },
  respondBtn:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 12, backgroundColor: '#F59E0B' },
  respondBtnText:   { fontSize: 15, fontWeight: '700', color: '#fff' },
  empty:            { alignItems: 'center', paddingVertical: 80 },
  emptyText:        { fontSize: 20, color: '#64748B', marginTop: 16, fontWeight: '600' },
  emptySubtext:     { fontSize: 14, color: '#475569', marginTop: 4 },
  refreshBar:       { height: 28, backgroundColor: '#0F172A', borderTopWidth: 1, borderTopColor: '#1E293B', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  refreshBarText:   { fontSize: 11, color: '#475569' },
  // Respond modal
  modalOverlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  respondModal:     { backgroundColor: '#1E293B', borderRadius: 20, padding: 24, width: '100%', maxWidth: 360 },
  respondTitle:     { fontSize: 17, fontWeight: 'bold', color: '#EF4444', marginBottom: 8, textAlign: 'center' },
  respondName:      { fontSize: 19, fontWeight: '700', color: '#fff', marginBottom: 4, textAlign: 'center' },
  respondPhone:     { fontSize: 14, color: '#10B981', marginBottom: 4, textAlign: 'center' },
  respondCoords:    { fontSize: 12, color: '#94A3B8', marginBottom: 20, textAlign: 'center' },
  respondBtn2:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#3B82F6', paddingVertical: 13, borderRadius: 12, marginBottom: 10 },
  respondBtn2Text:  { fontSize: 15, fontWeight: '600', color: '#fff' },
});

const gpsStyles = StyleSheet.create({
  container:    { marginBottom: 4, backgroundColor: '#0F172A', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#F59E0B30' },
  header:       { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 },
  title:        { flex: 1, fontSize: 13, fontWeight: '600', color: '#F59E0B' },
  countBadge:   { backgroundColor: '#F59E0B', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  countText:    { fontSize: 11, fontWeight: '700', color: '#fff' },
  liveBadge:    { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#10B98120', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  liveDot:      { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' },
  liveText:     { fontSize: 10, fontWeight: '700', color: '#10B981' },
  row:          { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1E293B40', paddingHorizontal: 4 },
  rowLatest:    { backgroundColor: '#3B82F608', borderRadius: 8, paddingHorizontal: 8 },
  trail:        { width: 20, alignItems: 'center', marginRight: 10, paddingTop: 2 },
  dot:          { width: 9, height: 9, borderRadius: 5, backgroundColor: '#334155' },
  dotLatest:    { width: 11, height: 11, borderRadius: 6, backgroundColor: '#10B981' },
  line:         { width: 2, height: 26, backgroundColor: '#1E293B', marginTop: 2 },
  content:      { flex: 1 },
  topRow:       { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  latestBadge:  { backgroundColor: '#10B98130', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5 },
  latestBadgeText: { color: '#10B981', fontSize: 9, fontWeight: '700' },
  coords:       { fontSize: 12, color: '#E2E8F0', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  time:         { fontSize: 11, color: '#64748B', marginTop: 2 },
  accuracy:     { fontSize: 10, color: '#475569', marginTop: 1 },
  empty:        { alignItems: 'center', paddingVertical: 24 },
  emptyText:    { color: '#475569', fontSize: 13, marginTop: 8 },
  emptySubtext: { color: '#334155', fontSize: 11, marginTop: 3 },
});

const audioStyles = StyleSheet.create({
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F9731615', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    marginBottom: 10, borderWidth: 1, borderColor: '#F9731630',
  },
  btnPlaying: {
    backgroundColor: '#F97316', borderColor: '#F97316',
  },
  btnText: {
    fontSize: 13, fontWeight: '600', color: '#F97316', flex: 1,
  },
  btnTextPlaying: {
    color: '#fff',
  },
  pending: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 4, paddingVertical: 6, marginBottom: 10,
  },
  pendingText: {
    fontSize: 12, color: '#475569', fontStyle: 'italic',
  },
});

const chatSt = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1E293B' },
  headerName:   { fontSize: 17, fontWeight: '600', color: '#fff' },
  headerSub:    { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  loadBox:      { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadText:     { color: '#94A3B8', marginTop: 12 },
  messagesList: { padding: 16, paddingBottom: 8 },
  bubble:       { maxWidth: '80%', padding: 12, borderRadius: 16, marginBottom: 8 },
  mine:         { alignSelf: 'flex-end', backgroundColor: '#3B82F6', borderBottomRightRadius: 4 },
  theirs:       { alignSelf: 'flex-start', backgroundColor: '#1E293B', borderBottomLeftRadius: 4 },
  bubbleText:   { fontSize: 15, color: '#E2E8F0', lineHeight: 20 },
  bubbleTime:   { fontSize: 10, color: '#64748B', marginTop: 4, textAlign: 'right' },
  emptyChat:    { alignItems: 'center', paddingVertical: 60 },
  emptyChatText:{ fontSize: 16, color: '#475569', marginTop: 12 },
  inputRow:     { flexDirection: 'row', alignItems: 'flex-end', padding: 12, borderTopWidth: 1, borderTopColor: '#1E293B', gap: 10 },
  input:        { flex: 1, backgroundColor: '#1E293B', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12, color: '#fff', fontSize: 15, maxHeight: 100 },
  sendBtn:      { width: 44, height: 44, borderRadius: 22, backgroundColor: '#3B82F6', justifyContent: 'center', alignItems: 'center' },
  sendBtnOff:   { backgroundColor: '#334155' },
});
