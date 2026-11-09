import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import colors from '@/constants/colors';

const T = colors.light;
const F = { r: 'Inter_400Regular', m: 'Inter_500Medium', s: 'Inter_600SemiBold', b: 'Inter_700Bold' };
const ND = Platform.OS !== 'web';

export type PowerType = 'shield' | 'flashlight' | 'distraction';
export const POWER: Record<PowerType, { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; label: string; color: string; max: number; body: string }> = {
  shield: { icon: 'shield-half-full', label: 'SHIELD', color: T.accent, max: 12, body: 'Absorbs one barricade, gate or walker hit for 12 s. It cannot save you from sinkholes or missed corners.' },
  flashlight: { icon: 'flashlight', label: 'TORCH', color: T.primary, max: 12, body: 'Lights the road for 12 s: hazard markers glow brighter and appear further ahead.' },
  distraction: { icon: 'fire', label: 'FLARE', color: T.destructive, max: 8, body: 'Drops a road flare behind you. The horde turns on it and falls back.' },
};

/** Fades + slides in on mount; used for status pills. */
function Pop({ children, style }: { children: React.ReactNode; style?: object }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(a, { toValue: 1, duration: 220, easing: Easing.out(Easing.back(1.6)), useNativeDriver: ND }).start(); }, [a]);
  return <Animated.View style={[style, { opacity: a, transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }] }]}>{children}</Animated.View>;
}

export function PowerChips({ shield, flashlight, distraction }: Record<PowerType, number>) {
  const list = ([['shield', shield], ['flashlight', flashlight], ['distraction', distraction]] as const).filter(([, t]) => t > 0);
  if (!list.length) return null;
  return (
    <View style={st.chips} pointerEvents="none" testID="power-chips">
      {list.map(([k, t]) => {
        const p = POWER[k];
        return (
          <Pop key={k} style={[st.chip, { borderColor: p.color }]}>
            <MaterialCommunityIcons name={p.icon} size={14} color={p.color} />
            <Text style={[st.chipText, { color: p.color }]} testID={`power-${k}`}>{p.label} {Math.ceil(t)}s</Text>
            <View style={st.chipTrack}><View style={[st.chipFill, { backgroundColor: p.color, width: `${Math.min(100, (t / p.max) * 100)}%` }]} /></View>
          </Pop>
        );
      })}
    </View>
  );
}

/** Horde proximity: 0 = at your heels. Bar fills as they close in. */
export function HordeMeter({ horde, pulse }: { horde: number; pulse: Animated.AnimatedInterpolation<number> }) {
  const threat = Math.max(0, Math.min(1, (5 - horde) / 4));
  const close = horde < 2;
  const label = horde < 1.3 ? 'ON YOUR HEELS' : horde < 2.2 ? 'CLOSING IN' : horde < 3.5 ? 'BEHIND YOU' : 'FALLING BACK';
  return (
    <View style={st.horde} pointerEvents="none" testID="horde-meter">
      <Animated.View style={[st.hordeDot, { opacity: close ? pulse : 0.7 }]} />
      <Text style={[st.hordeText, close && { color: T.destructive }]}>HORDE {horde.toFixed(1)} m · {label}</Text>
      <View style={st.hordeTrack}><View style={[st.hordeFill, { width: `${Math.round(threat * 100)}%` }, close && { backgroundColor: T.destructive }]} /></View>
    </View>
  );
}

export function Toast({ text, tone, icon }: { text: string; tone: 'good' | 'bad' | 'warn'; icon: React.ComponentProps<typeof Feather>['name'] }) {
  const c = tone === 'good' ? T.accent : tone === 'bad' ? T.destructive : T.primary;
  return (
    <View style={st.toastWrap} pointerEvents="none">
      <Pop key={text} style={[st.toast, { borderColor: c }]}>
        <Feather name={icon} size={16} color={c} />
        <Text style={st.toastText} testID="toast">{text}</Text>
      </Pop>
    </View>
  );
}

export function SensitivityRow({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const steps = [0.6, 0.8, 1, 1.2, 1.4, 1.6];
  return (
    <View style={{ gap: 6 }} testID="sensitivity">
      <View style={st.rowBetween}>
        <Text style={st.smallTitle}>Tilt sensitivity</Text>
        <Text style={st.smallValue}>{value.toFixed(1)}x</Text>
      </View>
      <View style={st.steps}>
        <Pressable testID="sens-down" accessibilityLabel="Less sensitive" hitSlop={8} onPress={() => onChange(Math.max(0.6, +(value - 0.2).toFixed(1)))} style={({ pressed }) => [st.stepBtn, pressed && st.pressed]}>
          <Feather name="minus" size={16} color={T.foreground} />
        </Pressable>
        {steps.map((v) => (
          <Pressable key={v} testID={`sens-${v}`} accessibilityLabel={`Sensitivity ${v}`} accessibilityState={{ selected: Math.abs(v - value) < 0.05 }} onPress={() => onChange(v)} style={st.tickHit}>
            <View style={[st.tick, { height: 8 + (v - 0.6) * 14 }, v <= value + 0.01 && { backgroundColor: T.accent }]} />
          </Pressable>
        ))}
        <Pressable testID="sens-up" accessibilityLabel="More sensitive" hitSlop={8} onPress={() => onChange(Math.min(1.6, +(value + 0.2).toFixed(1)))} style={({ pressed }) => [st.stepBtn, pressed && st.pressed]}>
          <Feather name="plus" size={16} color={T.foreground} />
        </Pressable>
      </View>
      <Text style={st.note}>Lower is calmer for small hands or shaky grips. Higher reaches the edge lanes with less lean.</Text>
    </View>
  );
}

const st = StyleSheet.create({
  pressed: { opacity: 0.85, transform: [{ scale: 0.96 }] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginLeft: 16, marginTop: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 99, backgroundColor: T.glass, borderWidth: 1 },
  chipText: { fontFamily: F.b, fontSize: 10, letterSpacing: 1.2, fontVariant: ['tabular-nums'] },
  chipTrack: { width: 26, height: 3, borderRadius: 2, backgroundColor: T.border, overflow: 'hidden' },
  chipFill: { height: 3 },
  horde: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 18, marginTop: 6 },
  hordeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: T.destructive },
  hordeText: { fontFamily: F.s, fontSize: 10, letterSpacing: 1.6, color: T.mutedForeground, fontVariant: ['tabular-nums'] },
  hordeTrack: { width: 54, height: 3, borderRadius: 2, backgroundColor: T.border, overflow: 'hidden' },
  hordeFill: { height: 3, backgroundColor: T.primary },
  toastWrap: { alignItems: 'center', marginTop: 8 },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: 340, paddingHorizontal: 14, paddingVertical: 8, borderRadius: colors.radius, backgroundColor: T.card, borderWidth: 1 },
  toastText: { flexShrink: 1, fontFamily: F.s, fontSize: 12, color: T.foreground },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  smallTitle: { fontFamily: F.s, fontSize: 13, color: T.foreground },
  smallValue: { fontFamily: F.b, fontSize: 13, color: T.accent, fontVariant: ['tabular-nums'] },
  steps: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 4 },
  stepBtn: { width: 34, height: 30, borderRadius: 8, backgroundColor: T.muted, alignItems: 'center', justifyContent: 'center' },
  tickHit: { flex: 1, height: 30, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 4 },
  tick: { width: 8, borderRadius: 3, backgroundColor: T.border },
  note: { fontFamily: F.r, fontSize: 11, lineHeight: 15, color: T.mutedForeground },
  card: { backgroundColor: T.glass, borderWidth: 1, borderColor: T.border, borderRadius: colors.radius, padding: 12, gap: 10, marginTop: 10 },
  cardKicker: { fontFamily: F.b, fontSize: 11, letterSpacing: 2.4, color: T.primary },
  mission: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  missionIcon: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: T.border, alignItems: 'center', justifyContent: 'center' },
  missionTitle: { fontFamily: F.s, fontSize: 13, color: T.foreground },
  missionTrack: { height: 3, borderRadius: 2, backgroundColor: T.border, overflow: 'hidden' },
  missionFill: { height: 3, backgroundColor: T.accent },
  rankText: { fontFamily: F.b, fontSize: 9, letterSpacing: 1.6 },
});
