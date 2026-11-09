import React, { useEffect, useId, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Polygon, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import colors from '@/constants/colors';

const T = colors.light;
const F = { r: 'Inter_400Regular', m: 'Inter_500Medium', s: 'Inter_600SemiBold', b: 'Inter_700Bold' };
const ND = Platform.OS !== 'web';

export interface TrophyItem { id: string; title: string; description: string; rank: 'bronze' | 'silver' | 'gold'; unlocked: boolean }

/** Display order = perceived value. Visual metadata only; unlock logic lives in lib/progression. */
const RELIC: Record<string, { tier: number; grade: string; metal: [string, string, string]; glow: string }> = {
  survivor: { tier: 1, grade: 'SALVAGE', metal: ['#E8B48A', '#A8643A', '#5A2E18'], glow: '#E0874E' },
  districts: { tier: 2, grade: 'TEMPERED', metal: ['#F1E2C8', '#B68A52', '#5E4022'], glow: '#D9A866' },
  relentless: { tier: 3, grade: 'STERLING', metal: ['#F4F6FA', '#A9B2C4', '#4E5668'], glow: '#BFD0F0' },
  navigator: { tier: 4, grade: 'FORGED', metal: ['#E6FBF6', '#63D6C2', '#1E5E56'], glow: '#63D6C2' },
  resourceful: { tier: 5, grade: 'JEWELLED', metal: ['#FFE9B0', '#E2A43A', '#7A4A12'], glow: '#F2A93B' },
  'road-veteran': { tier: 6, grade: 'ROYAL', metal: ['#FFF1C2', '#F2B33B', '#8A5214'], glow: '#FFC85A' },
  untouchable: { tier: 7, grade: 'MYTHIC', metal: ['#FFF8E2', '#FFD36E', '#B0621A'], glow: '#FFE2A0' },
};
const relicOf = (id: string) => RELIC[id] ?? { tier: 1, grade: 'RELIC', metal: ['#E8B48A', '#A8643A', '#5A2E18'] as [string, string, string], glow: '#E0874E' };
export const orderTrophies = <X extends { id: string }>(list: X[]) => [...list].sort((a, b) => relicOf(a.id).tier - relicOf(b.id).tier);

function useReducedMotion() {
  const [r, setR] = useState(false);
  useEffect(() => {
    let on = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then((v) => { if (on) setR(!!v); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v: boolean) => setR(!!v));
    return () => { on = false; sub?.remove?.(); };
  }, []);
  return r;
}

/** Seven distinct relics. Locked = one shared shrouded silhouette (no shape leak). */
export function TrophyArt({ id, unlocked, size = 120 }: { id: string; unlocked: boolean; size?: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const r = relicOf(id);
  const m = `m${uid}`, g = `g${uid}`, gem = `j${uid}`, gem2 = `k${uid}`;
  if (!unlocked) {
    return (
      <Svg width={size} height={size} viewBox="0 0 120 120">
        <Defs>
          <RadialGradient id={g} cx="50%" cy="45%" r="50%"><Stop offset="0" stopColor="#2A2F44" stopOpacity="0.7" /><Stop offset="1" stopColor="#151826" stopOpacity="0" /></RadialGradient>
        </Defs>
        <Circle cx="60" cy="56" r="56" fill={`url(#${g})`} />
        <Path d="M36 28 H84 C84 58 74 72 66 76 V88 H78 V98 H42 V88 H54 V76 C46 72 36 58 36 28 Z" fill="#0E0F1A" stroke="#2A2F44" strokeWidth="1.5" />
        <Path d="M54 44 C54 36 66 36 66 44 C66 49 60 50 60 55 M60 61 V63" stroke="#363C55" strokeWidth="3" strokeLinecap="round" fill="none" />
      </Svg>
    );
  }
  const [hi, mid, lo] = r.metal;
  const fillM = `url(#${m})`;
  const stroke = lo;
  const t = r.tier;
  const cup = 'M38 30 H82 C82 58 72 70 64 74 V84 H74 L78 94 H42 L46 84 H56 V74 C48 70 38 58 38 30 Z';
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Defs>
        <LinearGradient id={m} x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor={hi} /><Stop offset="0.5" stopColor={mid} /><Stop offset="1" stopColor={lo} /></LinearGradient>
        <RadialGradient id={g} cx="50%" cy="48%" r="50%"><Stop offset="0" stopColor={r.glow} stopOpacity={0.25 + t * 0.06} /><Stop offset="1" stopColor={r.glow} stopOpacity="0" /></RadialGradient>
        <RadialGradient id={gem} cx="35%" cy="30%" r="70%"><Stop offset="0" stopColor="#FFE4E0" /><Stop offset="0.45" stopColor="#E0533D" /><Stop offset="1" stopColor="#5A1410" /></RadialGradient>
        <RadialGradient id={gem2} cx="35%" cy="30%" r="70%"><Stop offset="0" stopColor="#E6FBF6" /><Stop offset="0.45" stopColor="#63D6C2" /><Stop offset="1" stopColor="#0C3A34" /></RadialGradient>
      </Defs>
      <Circle cx="60" cy="58" r="58" fill={`url(#${g})`} />
      {t >= 6 && (
        <G opacity={t === 7 ? 0.7 : 0.4}>
          {Array.from({ length: t === 7 ? 16 : 10 }).map((_, i) => {
            const a = (i / (t === 7 ? 16 : 10)) * Math.PI * 2;
            return <Path key={i} d={`M${60 + Math.cos(a) * 36} ${58 + Math.sin(a) * 36} L${60 + Math.cos(a) * 56} ${58 + Math.sin(a) * 56}`} stroke={r.glow} strokeWidth={i % 2 ? 1 : 2} strokeLinecap="round" />;
          })}
        </G>
      )}
      {t === 1 && (
        <G>
          <Path d="M40 34 H80 L76 82 C76 88 44 88 44 82 Z" fill={fillM} stroke={stroke} strokeWidth="2" />
          <Path d="M80 44 C94 44 94 66 78 66" stroke={mid} strokeWidth="5" fill="none" />
          <Ellipse cx="60" cy="34" rx="20" ry="4" fill={lo} />
          <Path d="M50 50 L56 62 M64 46 L68 58" stroke={lo} strokeWidth="2" opacity="0.6" />
          <Rect x="44" y="92" width="32" height="6" rx="2" fill={lo} />
        </G>
      )}
      {t === 2 && (
        <G>
          {[-1, 1].map((s) => (
            <G key={s}>
              <Path d={`M60 100 C${60 + s * 40} 92 ${60 + s * 44} 50 ${60 + s * 30} 22`} stroke={mid} strokeWidth="2.5" fill="none" />
              {[0, 1, 2, 3, 4, 5].map((i) => {
                const y = 92 - i * 12; const x = 60 + s * (26 + Math.sin(i / 2) * 12);
                return <Ellipse key={i} cx={x} cy={y} rx="9" ry="4" fill={fillM} stroke={stroke} strokeWidth="1" transform={`rotate(${s * (-40 + i * 8)} ${x} ${y})`} />;
              })}
            </G>
          ))}
          <Circle cx="60" cy="58" r="20" fill={fillM} stroke={stroke} strokeWidth="2" />
          <Circle cx="60" cy="58" r="14" fill="none" stroke={hi} strokeWidth="1.5" />
          <Path d="M60 47 L63 55 L71 55 L65 60 L67 68 L60 63 L53 68 L55 60 L49 55 L57 55 Z" fill={lo} />
        </G>
      )}
      {t === 3 && (
        <G>
          {[-1, 1].map((s) => (
            <Path key={s} d={`M${60 + s * 22} 40 C${60 + s * 40} 30 ${60 + s * 52} 34 ${60 + s * 56} 26 C${60 + s * 52} 44 ${60 + s * 46} 50 ${60 + s * 36} 54 C${60 + s * 44} 56 ${60 + s * 42} 62 ${60 + s * 30} 62`} fill={fillM} stroke={stroke} strokeWidth="1.5" />
          ))}
          <Path d={cup} fill={fillM} stroke={stroke} strokeWidth="2" />
          <Path d="M44 34 C46 52 52 62 58 66" stroke={hi} strokeWidth="2.5" fill="none" opacity="0.8" />
          <Rect x="40" y="94" width="40" height="6" rx="2" fill={lo} />
        </G>
      )}
      {t === 4 && (
        <G>
          <Polygon points="60,8 68,50 110,58 68,66 60,108 52,66 10,58 52,50" fill={fillM} stroke={stroke} strokeWidth="1.5" />
          <Polygon points="60,26 64,54 92,58 64,62 60,90 56,62 28,58 56,54" fill={lo} opacity="0.55" />
          <Circle cx="60" cy="58" r="22" fill="none" stroke={hi} strokeWidth="2" />
          <Circle cx="60" cy="58" r="28" fill="none" stroke={mid} strokeWidth="1" strokeDasharray="2 4" />
          <Circle cx="60" cy="58" r="8" fill={`url(#${gem2})`} stroke={hi} strokeWidth="1.5" />
        </G>
      )}
      {t === 5 && (
        <G>
          <Path d="M32 26 H88 C88 56 76 70 66 74 V84 H78 L82 96 H38 L42 84 H54 V74 C44 70 32 56 32 26 Z" fill={fillM} stroke={stroke} strokeWidth="2" />
          <Path d="M32 26 H88 V32 H32 Z" fill={lo} />
          {[42, 52, 68, 78].map((x) => <Circle key={x} cx={x} cy="29" r="2" fill={hi} />)}
          <Polygon points="60,38 72,48 60,64 48,48" fill={`url(#${gem})`} stroke={hi} strokeWidth="1.5" />
          <Path d="M48 48 H72 M54 48 L60 38 L66 48 L60 64" stroke="#FFE4E0" strokeWidth="0.8" fill="none" opacity="0.7" />
          <Circle cx="41" cy="42" r="3.5" fill={`url(#${gem2})`} /><Circle cx="79" cy="42" r="3.5" fill={`url(#${gem2})`} />
          <Rect x="36" y="96" width="48" height="7" rx="2" fill={lo} />
        </G>
      )}
      {t === 6 && (
        <G>
          <Path d="M30 30 L42 44 L52 24 L60 40 L68 24 L78 44 L90 30 L86 56 H34 Z" fill={fillM} stroke={stroke} strokeWidth="2" />
          {[30, 52, 68, 90].map((x, i) => <Circle key={x} cx={x} cy={i === 0 || i === 3 ? 30 : 24} r="3.5" fill={`url(#${i % 2 ? gem2 : gem})`} />)}
          <Path d="M34 56 H86 V62 C86 86 72 98 60 104 C48 98 34 86 34 62 Z" fill={fillM} stroke={stroke} strokeWidth="2" />
          <Path d="M60 64 V96 M44 74 H76" stroke={lo} strokeWidth="4" />
          <Circle cx="60" cy="74" r="7" fill={`url(#${gem})`} stroke={hi} strokeWidth="1.5" />
          <Circle cx="60" cy="44" r="5" fill={`url(#${gem2})`} stroke={hi} strokeWidth="1" />
        </G>
      )}
      {t === 7 && (
        <G>
          {[-1, 1].map((s) => (
            <G key={s}>
              <Path d={`M${60 + s * 20} 52 C${60 + s * 44} 40 ${60 + s * 56} 46 ${60 + s * 58} 30 C${60 + s * 56} 58 ${60 + s * 46} 66 ${60 + s * 28} 70`} fill={fillM} stroke={stroke} strokeWidth="1.5" />
              <Path d={`M${60 + s * 30} 56 C${60 + s * 44} 54 ${60 + s * 50} 50 ${60 + s * 54} 42`} stroke={hi} strokeWidth="1" fill="none" />
            </G>
          ))}
          <Path d="M40 40 H80 C80 64 72 74 64 78 V88 H74 L78 100 H42 L46 88 H56 V78 C48 74 40 64 40 40 Z" fill={fillM} stroke={stroke} strokeWidth="2" />
          <Path d="M42 22 L50 30 L55 16 L60 28 L65 16 L70 30 L78 22 L76 38 H44 Z" fill={fillM} stroke={stroke} strokeWidth="1.5" />
          {[42, 55, 65, 78].map((x, i) => <Circle key={x} cx={x} cy={i === 0 || i === 3 ? 22 : 16} r="2.6" fill={`url(#${gem2})`} />)}
          <Circle cx="60" cy="31" r="3.2" fill={`url(#${gem})`} />
          <Polygon points="60,46 70,56 60,70 50,56" fill={`url(#${gem})`} stroke={hi} strokeWidth="1.5" />
          <Circle cx="48" cy="92" r="2.5" fill={`url(#${gem2})`} /><Circle cx="72" cy="92" r="2.5" fill={`url(#${gem2})`} />
          <Rect x="36" y="100" width="48" height="8" rx="2" fill={lo} />
          <Path d="M36 104 H84" stroke={hi} strokeWidth="1" />
        </G>
      )}
    </Svg>
  );
}

function TrophyCard({ t, index, onPress, width }: { t: TrophyItem; index: number; onPress: () => void; width: number }) {
  const r = relicOf(t.id);
  const reduced = useReducedMotion();
  const a = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) { a.setValue(1); return; }
    Animated.timing(a, { toValue: 1, duration: 420, delay: index * 60, easing: Easing.out(Easing.cubic), useNativeDriver: ND }).start();
  }, [a, index, reduced]);
  const num = String(index + 1).padStart(2, '0');
  return (
    <Animated.View style={{ width, opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }}>
      <Pressable testID={`trophy-${t.id}`} disabled={!t.unlocked} onPress={onPress}
        accessibilityRole={t.unlocked ? 'button' : undefined}
        accessibilityLabel={t.unlocked ? `${t.title}. ${t.description}. Earned.` : `Hidden trophy ${num}. Not yet earned.`}
        style={({ pressed }) => [s.card, t.unlocked && { borderColor: r.glow, backgroundColor: 'rgba(242,169,59,0.06)' }, pressed && s.pressed]}>
        <Text style={[s.num, t.unlocked && { color: r.glow }]}>{num}</Text>
        <TrophyArt id={t.id} unlocked={t.unlocked} size={Math.min(120, width - 24)} />
        {t.unlocked ? (
          <>
            <Text style={[s.grade, { color: r.glow }]}>{r.grade}</Text>
            <Text style={s.cardTitle} numberOfLines={2}>{t.title}</Text>
          </>
        ) : (
          <>
            <Text style={s.grade}>SEALED</Text>
            <Text style={[s.cardTitle, { color: T.mutedForeground }]}>Hidden trophy</Text>
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}

/** Full-screen relic vault. */
export function TrophyMenu({ trophies, top, bottom, onBack }: { trophies: TrophyItem[]; top: number; bottom: number; onBack: () => void }) {
  const { width } = useWindowDimensions();
  const list = orderTrophies(trophies);
  const got = list.filter((t) => t.unlocked).length;
  const [detail, setDetail] = useState<TrophyItem | null>(null);
  const inner = Math.min(width, 560) - 40;
  const cols = inner > 420 ? 3 : 2;
  const cw = Math.floor((inner - (cols - 1) * 12) / cols);
  return (
    <View style={[StyleSheet.absoluteFill, s.vault]} testID="trophy-menu">
      <View style={[s.header, { paddingTop: top + 8 }]}>
        <Pressable testID="trophy-back" accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} hitSlop={12} style={({ pressed }) => [s.back, pressed && s.pressed]}>
          <Feather name="arrow-left" size={20} color={T.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.kicker}>THE VAULT</Text>
          <Text style={s.title}>Trophies</Text>
        </View>
        <Text style={s.count} accessibilityLabel={`${got} of ${list.length} earned`}>{got}<Text style={s.countDim}>/{list.length}</Text></Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bottom + 24, alignItems: 'center' }} showsVerticalScrollIndicator={false}>
        <Text style={s.lede}>{got === 0 ? 'Seven relics wait in the dark. Nobody says how to earn them. Keep running.' : 'What you carried out of the city. The rest stay sealed until you earn them.'}</Text>
        <View style={[s.grid, { width: inner }]}>
          {list.map((t, i) => <TrophyCard key={t.id} t={t} index={i} width={cw} onPress={() => setDetail(t)} />)}
        </View>
      </ScrollView>
      {detail && (
        <Pressable style={[StyleSheet.absoluteFill, s.scrim]} onPress={() => setDetail(null)} accessibilityLabel="Close details" testID="trophy-detail-close">
          <View style={s.detail}>
            <TrophyArt id={detail.id} unlocked size={180} />
            <Text style={[s.grade, { color: relicOf(detail.id).glow }]}>{relicOf(detail.id).grade} · {detail.rank.toUpperCase()}</Text>
            <Text style={s.revealTitle}>{detail.title}</Text>
            <Text style={s.desc}>{detail.description}</Text>
            <Text style={s.hint}>Tap anywhere to close</Text>
          </View>
        </Pressable>
      )}
    </View>
  );
}

/** Celebration queue for newly earned relics. */
export function TrophyReveal({ items, onNext, onOpen, top, bottom }: { items: TrophyItem[]; onNext: () => void; onOpen: () => void; top: number; bottom: number }) {
  const t = items[0];
  const reduced = useReducedMotion();
  const a = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!t) return;
    if (reduced) { a.setValue(1); return; }
    a.setValue(0);
    Animated.timing(a, { toValue: 1, duration: 900, easing: Easing.out(Easing.back(1.3)), useNativeDriver: ND }).start();
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 14000, easing: Easing.linear, useNativeDriver: ND }));
    loop.start();
    return () => loop.stop();
  }, [t?.id, reduced, a, spin]);
  if (!t) return null;
  const r = relicOf(t.id);
  const more = items.length - 1;
  return (
    <View style={[StyleSheet.absoluteFill, s.reveal, { paddingTop: top + 16, paddingBottom: bottom + 16 }]} testID="trophy-reveal" accessibilityViewIsModal>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }} showsVerticalScrollIndicator={false}>
        <Text style={s.kicker}>TROPHY UNLOCKED</Text>
        <View style={{ width: 240, height: 240, alignItems: 'center', justifyContent: 'center', marginVertical: 12 }}>
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: a, transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]}>
            <Svg width={240} height={240} viewBox="0 0 240 240">
              {Array.from({ length: 12 }).map((_, i) => (
                <Path key={i} d="M120 120 L112 0 H128 Z" fill={r.glow} opacity={0.12} transform={`rotate(${i * 30} 120 120)`} />
              ))}
            </Svg>
          </Animated.View>
          <Animated.View style={{ opacity: a, transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }}>
            <TrophyArt id={t.id} unlocked size={200} />
          </Animated.View>
        </View>
        <Animated.View style={{ alignItems: 'center', opacity: a, gap: 6 }}>
          <Text style={[s.grade, { color: r.glow }]}>{r.grade} · {t.rank.toUpperCase()}</Text>
          <Text style={s.revealTitle} accessibilityRole="header">{t.title}</Text>
          <Text style={s.desc}>{t.description}</Text>
        </Animated.View>
        <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 28, maxWidth: 420, width: '100%' }}>
          <Pressable testID="trophy-reveal-next" onPress={onNext} style={({ pressed }) => [s.cta, pressed && s.pressed]}>
            <Text style={s.ctaText}>{more > 0 ? `NEXT  (${more} MORE)` : 'CONTINUE'}</Text>
            <Feather name={more > 0 ? 'chevron-right' : 'check'} size={20} color={T.primaryForeground} />
          </Pressable>
          <Pressable testID="trophy-reveal-open" onPress={onOpen} style={({ pressed }) => [s.ghost, pressed && s.pressed]}>
            <Feather name="archive" size={16} color={T.accent} />
            <Text style={s.ghostText}>Open the vault</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  vault: { backgroundColor: T.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: T.border },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: T.muted, alignItems: 'center', justifyContent: 'center' },
  kicker: { fontFamily: F.b, fontSize: 11, letterSpacing: 3, color: T.primary },
  title: { fontFamily: F.b, fontSize: 28, color: T.foreground, letterSpacing: -0.5 },
  count: { fontFamily: F.b, fontSize: 22, color: T.primary, fontVariant: ['tabular-nums'] },
  countDim: { color: T.mutedForeground, fontSize: 16 },
  lede: { fontFamily: F.r, fontSize: 13, lineHeight: 19, color: T.mutedForeground, marginVertical: 18, maxWidth: 520, alignSelf: 'stretch' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { alignItems: 'center', gap: 4, paddingVertical: 14, paddingHorizontal: 8, borderRadius: colors.radius, borderWidth: 1, borderColor: T.border, backgroundColor: 'rgba(10,11,20,0.55)' },
  num: { alignSelf: 'flex-start', fontFamily: F.b, fontSize: 10, letterSpacing: 2, color: T.border, marginLeft: 4 },
  grade: { fontFamily: F.b, fontSize: 9, letterSpacing: 2.4, color: T.border, marginTop: 4 },
  cardTitle: { fontFamily: F.s, fontSize: 13, color: T.foreground, textAlign: 'center' },
  scrim: { backgroundColor: 'rgba(8,9,16,0.88)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  detail: { alignItems: 'center', gap: 8, maxWidth: 380 },
  revealTitle: { fontFamily: F.b, fontSize: 26, color: T.foreground, textAlign: 'center', letterSpacing: -0.4 },
  desc: { fontFamily: F.r, fontSize: 14, lineHeight: 20, color: T.mutedForeground, textAlign: 'center', maxWidth: 340 },
  hint: { fontFamily: F.m, fontSize: 11, color: T.border, marginTop: 10 },
  reveal: { backgroundColor: 'rgba(8,9,16,0.94)' },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: T.primary, borderRadius: colors.radius, paddingVertical: 16 },
  ctaText: { fontFamily: F.b, fontSize: 16, letterSpacing: 2, color: T.primaryForeground },
  ghost: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12 },
  ghostText: { fontFamily: F.s, fontSize: 14, color: T.accent },
});
