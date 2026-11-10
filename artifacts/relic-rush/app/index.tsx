import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, BackHandler, Easing, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import colors from '@/constants/colors';
import { RunnerScene, type SceneApi } from '@/components/RunnerScene';
import { actions, advance, canRevive, revive, simDifficulty, routeInfo, simStageAt, newMissionSim, newSim, requestTurn, setLane, stageInfo, steer, turnInfo, START_SPEED, MAX_SPEED, STAGE_NAMES, type Sim, type Mode, type WalkerType, type StageId, type TurnDir } from '@/lib/game';
import { INTRO_LEN, introCaption, newIntro, skipIntro, stepIntro, type IntroCaption } from '@/lib/intro';
import { useProgress } from '@/context/ProgressContext';
import { useTiltControls } from '@/hooks/useTiltControls';
import { useIntroSound } from '@/hooks/useIntroSound';
import { useGameAudio, type AudioPrefs } from '@/hooks/useGameAudio';
import { useRewardedAd } from '@/hooks/useRewardedAd';
import { HordeMeter, POWER, PowerChips, SensitivityRow, Toast, type PowerType } from '@/components/Loadout';
import { TrophyMenu, TrophyReveal } from '@/components/TrophyMenu';
import { CampaignMap, CutsceneOverlay, MissionHud, MissionSaveError, MissionSaving, MissionSuccess, ModeChooser, type MissionHudData } from '@/components/CampaignUI';
import { cutsceneLength } from '@/components/campaignMeta';
import { lastStandUnlocked, missionById, missionObjective, missionSection, missionUnlocked } from '@/lib/campaign';

const T = colors.light;
type Act = 'left' | 'right' | 'jump' | 'slide';
type Ctl = 'tilt' | 'touch';
interface HudTurn { dir: TurnDir; dist: number; open: boolean; armed: -1 | 0 | 1; branch: boolean }
interface Hud { dist: number; coins: number; speed: number; turn: HudTurn | null; stage: StageId; stageName: string; stageProg: number; next: StageId; toNext: number; tier: number; threat: string; overdrive: number; horde: number; shield: number; flashlight: number; distraction: number; route: string; routeId: string; mission: MissionHudData | null }
function hudOf(s: Sim): Hud {
  const ti = turnInfo(s);
  const st = stageInfo(s.dist);
  const df = simDifficulty(s);
  const rt = routeInfo(s.dist);
  const c = s.campaign;
  let mission: MissionHudData | null = null;
  if (c) {
    const m = missionById(c.id);
    mission = { id: c.id, title: m.title, objective: missionObjective(c, s.dist), section: missionSection(c, s.dist).name, item: m.item, itemName: m.itemName, collected: c.collected,
      recovering: c.recoveries > 0 && !c.collected, progress: Math.max(0, Math.min(1, s.dist / Math.max(1, c.finish))), activating: c.activationT > 0 };
  }
  return { mission, horde: s.horde, shield: s.shieldT, flashlight: s.flashlightT, distraction: s.distractionT, route: rt.name, routeId: rt.id, tier: df.tier, threat: df.name, overdrive: df.overdrive, stage: st.id, stageName: st.name, stageProg: st.progress, next: st.next, toNext: Math.ceil(st.remaining), dist: Math.floor(s.dist), coins: s.coinsRun, speed: s.speed, turn: s.mode === 'run' && ti.warn ? { dir: ti.dir, dist: Math.max(0, Math.ceil(ti.dist)), open: ti.open, armed: ti.armed, branch: !!s.turn.branch } : null };
}

function haptic(kind: 'light' | 'heavy' | 'success') {
  if (Platform.OS === 'web') return;
  try {
    if (kind === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    else Haptics.impactAsync(kind === 'heavy' ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  } catch {}
}

const CAUSE: Record<string, string> = {
  gap: 'The street collapsed into a sinkhole. They reached the edge first.',
  hurdle: 'You slammed into a concrete barricade. The horde closed the gap.',
  beam: 'A quarantine gate caught you at chest height. They were right behind.',
  corner: 'You ran straight into a dead end. Swipe toward the open street before the corner.',
  wrongway: 'You turned into a blocked wall. The arrows point to the open street.',
};
// walker deaths by character kind (see characters.ts / STAGE_KINDS)
const WALKER_CAUSE: Record<number, string> = {
  0: 'An infected office worker walked straight into you. Change lanes before they reach you.',
  1: 'A road worker shambled into your lane. Read the walkers early and slip past.',
  2: 'A patient in a hospital gown caught you head-on. Dodge sideways; you cannot jump them.',
  3: 'An infected jogger ran right at you. Sidestep walkers; jumping and sliding will not clear them.',
  4: 'A shopper lurched into your path. Move to an empty lane before contact.',
  5: 'A police officer zombie blocked your lane. Sidestep the uniforms in the precinct.',
  6: 'A patrol officer zombie walked into you. Dodge sideways; there is always an open lane.',
  7: 'A doctor in a bloody coat caught you in the corridor. Sidestep before contact.',
  8: 'A nurse zombie collided with you on the ward. Move to the open lane.',
};
// special infected (missions 2+): first-sighting warning and death message
const SPECIAL_WARN: Record<Exclude<WalkerType, 'walker'>, string> = {
  crawler: 'Crawler ahead. It is low on the ground: jump over it.',
  sprinter: 'Sprinter! It charges fast. Change lanes early.',
  brute: 'Brute ahead. It blocks two lanes. Find the open one.',
};
const SPECIAL_CAUSE: Record<Exclude<WalkerType, 'walker'>, string> = {
  crawler: 'A crawler grabbed your ankles. Jump over the ones on the ground.',
  sprinter: 'A sprinter ran you down. Move lanes as soon as you see one charging.',
  brute: 'A brute flattened you. It fills two lanes, so head for the third.',
};
const STAGE_ICON: Record<StageId, React.ComponentProps<typeof MaterialCommunityIcons>['name']> = { city: 'city-variant-outline', police: 'police-badge-outline', hospital: 'hospital-box-outline' };
const TONE_COLOR: Record<IntroCaption['tone'], string> = { time: T.mutedForeground, sfx: T.foreground, alert: T.destructive, action: T.primary };

export default function Game() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const top = Math.max(insets.top, Platform.OS === 'web' ? 67 : 0);
  const bottom = Math.max(insets.bottom, Platform.OS === 'web' ? 34 : 0);
  const progress = useProgress();
  const progressLoadedRef = useRef(progress.loaded); progressLoadedRef.current = progress.loaded;
  const isWeb = Platform.OS === 'web';

  const simRef = useRef<Sim>(newSim('home'));
  // dev-only (web): expose the live sim for visual debugging in the browser console
  if (__DEV__ && Platform.OS === 'web') (globalThis as { __dr?: typeof simRef }).__dr = simRef;
  const missionRef = useRef<number | null>(null);
  const freshSim = (m: Mode) => (m === 'run' && missionRef.current ? newMissionSim(missionRef.current) : newSim(m));
  type Menu = 'home' | 'chooser' | 'campaign';
  const [menu, setMenu] = useState<Menu>('home');
  const [activeMission, setActiveMission] = useState<number | null>(null);
  // completion flow: saving -> cutscene -> done | error ; replay cutscenes never touch progress
  type Phase = 'none' | 'saving' | 'error' | 'cutscene' | 'done';
  const [phase, setPhase] = useState<Phase>('none');
  const [saveBusy, setSaveBusy] = useState(false);
  const completionRef = useRef<{ id: number; seconds: number; dist: number; coins: number; stats: { turns: number; jumps: number; slides: number; pickups: number } } | null>(null);
  const [completion, setCompletion] = useState<{ id: number; seconds: number; coins: number } | null>(null);
  const cutRef = useRef<{ id: number; t: number; replay: boolean } | null>(null);
  const [cut, setCut] = useState<{ id: number; t: number; replay: boolean } | null>(null);
  const completeRef = useRef(progress.completeMission); completeRef.current = progress.completeMission;
  const campaignRef = useRef(progress.campaign); campaignRef.current = progress.campaign;
  const lastRecRef = useRef(0); const lastActRef = useRef(false); const seenSpecialRef = useRef(new Set<WalkerType>()); const bestRef = useRef(0); const passedBestRef = useRef(false);
  bestRef.current = progress.lastStandBest;
  const lastStandRef = useRef(false); lastStandRef.current = lastStandUnlocked(progress.campaign);
  const sceneRef = useRef<SceneApi | null>(null);
  const appActiveRef = useRef(AppState.currentState === 'active');
  const [sceneReady, setSceneReady] = useState(false);
  const [hud, setHud] = useState<Hud>(() => hudOf(newSim('home')));
  const [mode, setMode] = useState<Mode>('home');
  const [help, setHelp] = useState<boolean>(false);
  const ctl: Ctl = isWeb ? 'touch' : progress.settings.control;
  const setCtl = useCallback((c: Ctl) => progress.updateSettings({ control: c }), [progress.updateSettings]);
  const [toast, setToast] = useState<{ text: string; tone: 'good' | 'bad' | 'warn'; icon: React.ComponentProps<typeof Feather>['name']; until: number } | null>(null);
  const toastRef = useRef(setToast); toastRef.current = setToast;
  const [result, setResult] = useState<{ dist: number; coins: number; best: boolean; cause: string; turns: number; jumps: number; slides: number; pickups: number } | null>(null);
  const introRef = useRef(newIntro());
  const introSeenRef = useRef(false);
  const [introOn, setIntroOn] = useState(false);
  const [introT, setIntroT] = useState(0);
  const resetClockRef = useRef(false);
  const introSound = useIntroSound(introOn, introT);
  const audio = useGameAudio(mode === 'run' && !introOn, mode === 'run' ? Math.max(0, Math.min(1, (5 - hud.horde) / 4)) : 0);
  const sfxRef = useRef(audio.play); sfxRef.current = audio.play;
  const stageRef = useRef<StageId>('city');
  // rewarded revive: offered once per run when an ad is loaded; the run is recorded only after it is declined or used
  const rewarded = useRewardedAd();
  const adReadyRef = useRef(rewarded.ready); adReadyRef.current = rewarded.ready;
  const [offer, setOffer] = useState(false);
  const offerRef = useRef(offer); offerRef.current = offer;
  const [adBusy, setAdBusy] = useState(false);
  const recordRef = useRef(progress.recordRun);
  recordRef.current = progress.recordRun;

  const tiltOn = ctl === 'tilt' && (mode === 'home' || mode === 'run' || mode === 'paused');
  const onLane = useCallback((position: number) => { setLane(simRef.current, position); }, []);
  const tilt = useTiltControls({ enabled: tiltOn, onLane, sensitivity: progress.settings.sensitivity });
  const tiltBroken = tilt.status === 'unavailable' || tilt.status === 'denied' || tilt.status === 'error';
  const usingTilt = ctl === 'tilt' && !tiltBroken && tilt.status === 'ready';
  const showPad = !usingTilt;

  const fade = useRef(new Animated.Value(1)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: !isWeb }),
      Animated.timing(pulse, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: !isWeb }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse, isWeb]);

  const showOverlay = useCallback(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: !isWeb }).start();
  }, [fade, isWeb]);

  // single rAF owner: simulation step + GL render; HUD throttled to ~10Hz
  useEffect(() => {
    let raf = 0; let last = 0; let hudAt = 0;
    const tick = (now: number) => {
      const elapsed = last && !resetClockRef.current ? Math.max(0, (now - last) / 1000) : 0;
      resetClockRef.current = false;
      const dt = Math.min(0.1, elapsed);
      last = now;
      if (!appActiveRef.current || !sceneRef.current) {
        raf = requestAnimationFrame(tick);
        return;
      }
      if (cutRef.current) {
        const ct = cutRef.current;
        ct.t += elapsed;
        if (ct.t >= cutsceneLength(ct.id)) endCutRef.current();
        else {
          sceneRef.current.renderMissionCutscene(ct.id, ct.t);
          if (now - hudAt > 100) { hudAt = now; setCut({ ...ct }); }
        }
        raf = requestAnimationFrame(tick);
        return;
      }
      if (introActiveRef.current) {
        const ist = introRef.current;
        if (stepIntro(ist, elapsed)) finishRef.current();
        else {
          sceneRef.current.renderIntro(ist.t);
          if (now - hudAt > 100) { hudAt = now; setIntroT(ist.t); }
        }
        raf = requestAnimationFrame(tick);
        return;
      }
      const s = simRef.current;
      const prev = s.mode;
      if (s.mode !== 'paused' && s.mode !== 'over' && s.mode !== 'complete') {
        const pre0 = s.shieldT, pre1 = s.flashlightT, pre2 = s.distractionT;
        const ev = advance(s, dt);
        if (ev.coin) { haptic('light'); sfxRef.current('pickup'); }
        if (ev.died) { haptic('heavy'); sfxRef.current('hit'); }
        if (ev.turned) sfxRef.current('turn');
        if (ev.pickup) {
          haptic('success'); sfxRef.current('pickup');
          const k: PowerType = s.distractionT > pre2 ? 'distraction' : s.flashlightT > pre1 ? 'flashlight' : s.shieldT > pre0 ? 'shield' : 'shield';
          toastRef.current({ text: `${POWER[k].label}: ${POWER[k].body}`, tone: 'good', icon: 'zap', until: now + 2600 });
        }
        if (ev.stumbled) {
          haptic('heavy'); sfxRef.current('hit');
          toastRef.current({ text: 'Stumbled. They are gaining. One more hit while they are close is fatal.', tone: 'warn', icon: 'alert-triangle', until: now + 2400 });
        }
        if (ev.missionPickup && s.campaign) {
          haptic('success'); sfxRef.current('pickup');
          const m = missionById(s.campaign.id);
          toastRef.current({ text: m.item === 'survivors' ? 'The Ward C survivors are with you. Every corner you take, they take.' : `${m.itemName} secured. Now reach ${m.destination.toLowerCase()}.`, tone: 'good', icon: 'check-circle', until: now + 3000 });
        }
        if (s.campaign) {
          if (s.campaign.recoveries > lastRecRef.current) {
            lastRecRef.current = s.campaign.recoveries; haptic('heavy');
            toastRef.current({ text: 'Missed it. It has been moved 100 m ahead. Follow the green lane; it is clear.', tone: 'warn', icon: 'rotate-cw', until: now + 3200 });
          }
          const act = s.campaign.activationT > 0 || s.campaign.activated;
          if (act && !lastActRef.current) { lastActRef.current = true; sfxRef.current('stage'); toastRef.current({ text: 'Beacon powering up. Keep running for the pier.', tone: 'good', icon: 'radio', until: now + 2800 }); }
        }
        for (const w of s.walkers) {
          if (!w.type || w.type === 'walker' || seenSpecialRef.current.has(w.type) || w.s - s.dist > 60) continue;
          seenSpecialRef.current.add(w.type); haptic('heavy');
          toastRef.current({ text: SPECIAL_WARN[w.type], tone: 'warn', icon: 'alert-octagon', until: now + 2800 });
        }
        if (!s.campaign && !passedBestRef.current && bestRef.current > 0 && s.dist > bestRef.current) {
          passedBestRef.current = true; haptic('success'); sfxRef.current('stage');
          toastRef.current({ text: `New best! Past ${bestRef.current} m. Every metre now is a record.`, tone: 'good', icon: 'award', until: now + 2600 });
        }
        if (ev.completed) completeOnceRef.current();
        if (s.mode === 'run') {
          const sid = simStageAt(s, s.dist);
          if (sid !== stageRef.current) { stageRef.current = sid; sfxRef.current('stage'); }
        }
      }
      if (prev === 'dying' && s.mode === 'over') {
        if (canRevive(s) && adReadyRef.current) {
          setToast(null); setOffer(true);
          setMode('over');
          showOverlay();
        } else finishDeathRef.current();
      }
      if (s.mode === 'run' && now - hudAt > 100) {
        hudAt = now;
        setHud(hudOf(s));
        setToast((t) => (t && now > t.until ? null : t));
      }
      if (s.mode !== 'paused' && !cutRef.current) sceneRef.current?.render(s);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [showOverlay]);

  const finishDeath = useCallback(() => {
    const s = simRef.current;
    if (s.mode !== 'over') return;
    const dist = Math.floor(s.dist);
    const stats = { turns: s.turnsTaken, jumps: s.jumps, slides: s.slides, pickups: s.pickupsRun };
    const best = recordRef.current(dist, s.coinsRun, stats, !s.campaign);
    setOffer(false); setToast(null);
    setResult({ dist, coins: s.coinsRun, best, ...stats, cause: s.deathCause === 'walker' ? (s.deathWalker && s.deathWalker !== 'walker' ? SPECIAL_CAUSE[s.deathWalker] : WALKER_CAUSE[s.deathKind ?? 0] ?? WALKER_CAUSE[0]) : CAUSE[s.deathCause ?? 'gap'] });
    setMode('over');
    showOverlay();
  }, [showOverlay]);
  const finishDeathRef = useRef(finishDeath); finishDeathRef.current = finishDeath;
  const watchAd = useCallback(() => {
    const s = simRef.current;
    if (adBusy || !canRevive(s)) return;
    setAdBusy(true);
    rewarded.show().then((earned) => {
      setAdBusy(false);
      if (simRef.current !== s) return;
      if (earned && revive(s)) {
        setOffer(false);
        resetClockRef.current = true;
        setHud(hudOf(s)); setMode('run'); haptic('success');
        setToast({ text: 'Back on your feet. The horde is pushed back. No more second chances this run.', tone: 'good', icon: 'heart', until: performance.now() + 2600 });
      } else finishDeathRef.current();
    });
  }, [adBusy, rewarded.show]);

  const onSceneReady = useCallback((api: SceneApi | null) => {
    sceneRef.current = api;
    setSceneReady(!!api);
    if (!api && simRef.current.mode === 'run') {
      simRef.current.mode = 'paused';
      setMode('paused');
    }
    if (api) api.render(simRef.current);
  }, []);

  // horizontal input: corner turn inside a window; lateral nudge only in touch mode and never near a corner
  const lateralRef = useRef(!usingTilt); lateralRef.current = !usingTilt;
  const doAction = useCallback((a: Act) => {
    const s = simRef.current;
    if (s.mode !== 'run') return;
    if (a === 'left' || a === 'right') {
      const r = steer(s, a === 'left' ? -1 : 1, lateralRef.current);
      if (r === 'turn') { haptic('success'); setHud(hudOf(s)); } else if (r === 'lane') haptic('light');
      return;
    }
    if (actions[a](s)) { haptic('light'); sfxRef.current(a); }
  }, []);
  const holdRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdStop = useCallback(() => { if (holdRef.current) { clearInterval(holdRef.current); holdRef.current = null; } }, []);
  const holdStart = useCallback((dir: -1 | 1) => {
    holdStop();
    doAction(dir < 0 ? 'left' : 'right');
    holdRef.current = setInterval(() => { const s = simRef.current; if (s.mode !== 'run') return; setLane(s, s.lane + dir * 0.07); }, 33);
  }, [doAction, holdStop]);
  useEffect(() => holdStop, [holdStop]);
  const turnPress = useCallback((dir: TurnDir) => {
    const s = simRef.current;
    if (requestTurn(s, dir)) { haptic('success'); setHud(hudOf(s)); }
  }, []);

  const startRun = useCallback(() => {
    if (!sceneRef.current || !progressLoadedRef.current) return;
    endCutRef.current(true);
    simRef.current = freshSim('run');
    lastRecRef.current = 0; lastActRef.current = false; seenSpecialRef.current.clear(); passedBestRef.current = false;
    completionRef.current = null; setCompletion(null); setPhase('none'); setSaveBusy(false);
    setActiveMission(missionRef.current);
    setMenu('home');
    setToast(null);
    stageRef.current = 'city';
    audio.restartMusic();
    setHud(hudOf(simRef.current));
    setResult(null); setOffer(false);
    setHelp(false); setVault(false);
    setMode('run');
    haptic('success');
  }, [audio.restartMusic]);
  // opening cinematic: first RUN press per app session; retry/restart bypass it
  const introActiveRef = useRef(false);
  const finishIntro = useCallback(() => {
    if (!introActiveRef.current) return;
    introActiveRef.current = false;
    sceneRef.current?.endIntro();
    setIntroOn(false);
    // the run chosen before the intro started wins; nothing else may override it
    missionRef.current = introTargetRef.current;
    startRun();
  }, [startRun]);
  const finishRef = useRef(finishIntro); finishRef.current = finishIntro;
  const introTargetRef = useRef<number | null>(null);
  const playIntro = useCallback((target: number | null = null) => {
    if (!sceneRef.current || introActiveRef.current || cutRef.current) return;
    introTargetRef.current = target;
    introSeenRef.current = true;
    introRef.current = newIntro();
    resetClockRef.current = true;
    introActiveRef.current = true;
    setIntroT(0); setHelp(false); setMenu('home'); setIntroOn(true);
  }, []);
  const skip = useCallback(() => { if (skipIntro(introRef.current)) finishIntro(); }, [finishIntro]);
  // Last Stand (endless): unlocked after mission 5; intro on first run per session
  const startEndless = useCallback(() => {
    if (!progressLoadedRef.current || !lastStandRef.current) return;
    missionRef.current = null;
    if (!introSeenRef.current) { audio.restartMusic(); audio.pauseNow(); playIntro(null); } else startRun();
  }, [playIntro, startRun, audio.restartMusic, audio.pauseNow]);
  // Campaign: mission 1 may use the original intro the first time; others start directly
  const startMission = useCallback((id: number) => {
    if (!progressLoadedRef.current || !missionUnlocked(campaignRef.current, id)) return;
    missionRef.current = id;
    if (id === 1 && !introSeenRef.current) { audio.restartMusic(); audio.pauseNow(); playIntro(1); } else startRun();
  }, [playIntro, startRun, audio.restartMusic, audio.pauseNow]);
  const start = useCallback(() => { if (progressLoadedRef.current) setMenu('chooser'); }, []);

  // ---------- mission completion ----------
  const runSave = useCallback(() => {
    const c = completionRef.current; if (!c) return;
    setSaveBusy(true);
    completeRef.current(c.id, c.seconds, c.dist, c.coins, c.stats).then((ok) => {
      if (completionRef.current !== c) return;
      setSaveBusy(false);
      if (ok) {
        setPhase('cutscene');
        resetClockRef.current = true;
        cutRef.current = { id: c.id, t: 0, replay: false }; setCut({ id: c.id, t: 0, replay: false });
      } else setPhase('error');
    }).catch(() => { if (completionRef.current === c) { setSaveBusy(false); setPhase('error'); } });
  }, []);
  const completeOnce = useCallback(() => {
    const s = simRef.current; const c = s.campaign;
    if (!c || completionRef.current) return;
    const seconds = Math.max(0.1, Math.round(s.time * 10) / 10);
    completionRef.current = { id: c.id, seconds, dist: Math.floor(s.dist), coins: s.coinsRun, stats: { turns: s.turnsTaken, jumps: s.jumps, slides: s.slides, pickups: s.pickupsRun } };
    setCompletion({ id: c.id, seconds, coins: s.coinsRun });
    setToast(null); holdStop();
    haptic('success'); sfxRef.current('stage');
    setMode('complete'); setPhase('saving');
    runSave();
  }, [runSave]);
  const completeOnceRef = useRef(completeOnce); completeOnceRef.current = completeOnce;
  const endCut = useCallback((silent = false) => {
    const ct = cutRef.current; if (!ct) return;
    cutRef.current = null; setCut(null);
    sceneRef.current?.endMissionCutscene();
    resetClockRef.current = true;
    if (silent) return;
    if (ct.replay) { setMenu('campaign'); showOverlay(); }
    else { setPhase('done'); showOverlay(); }
  }, []);
  const endCutRef = useRef(endCut); endCutRef.current = endCut;
  const replayScene = useCallback((id: number) => {
    if (!sceneRef.current || cutRef.current || introActiveRef.current) return;
    if (!campaignRef.current.completed.includes(id)) return;
    resetClockRef.current = true;
    cutRef.current = { id, t: 0, replay: true }; setCut({ id, t: 0, replay: true });
  }, []);
  const replayOwnScene = useCallback(() => {
    const c = completionRef.current; if (!c || cutRef.current) return;
    resetClockRef.current = true;
    cutRef.current = { id: c.id, t: 0, replay: false }; setCut({ id: c.id, t: 0, replay: false });
    setPhase('cutscene');
  }, []);
  const skipCut = useCallback(() => endCutRef.current(), []);

  const pause = useCallback(() => {
    if (simRef.current.mode !== 'run') return;
    simRef.current.mode = 'paused';
    const s = simRef.current;
    setHud(hudOf(s));
    setMode('paused');
    showOverlay();
  }, [showOverlay]);
  const resume = useCallback(() => {
    if (simRef.current.mode !== 'paused') return;
    simRef.current.mode = 'run';
    setMode('run');
  }, []);
  const home = useCallback((to: 'home' | 'campaign' = 'home') => {
    endCutRef.current(true);
    simRef.current = freshSim('home');
    completionRef.current = null; setCompletion(null); setPhase('none');
    setResult(null); setToast(null); setOffer(false);
    setMenu(to);
    setMode('home');
    showOverlay();
  }, [showOverlay]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      appActiveRef.current = st === 'active';
      resetClockRef.current = true;
      if (st !== 'active') pause();
    });
    return () => sub.remove();
  }, [pause]);

  const keyRef = useRef({ doAction, pause, resume, start, skip, retry: startRun });
  keyRef.current = { doAction, pause, resume, start, skip, retry: startRun };
  const menuRef = useRef(menu); menuRef.current = menu;
  // Android back: skip scenes, step back through menus, pause a run; never resumes a paused run
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (cutRef.current) { endCutRef.current(); return true; }
      if (introActiveRef.current) { keyRef.current.skip(); return true; }
      if (vaultRef.current) { setVault(false); return true; }
      const m = simRef.current.mode;
      if (m === 'run') { keyRef.current.pause(); return true; }
      if (m === 'over' && offerRef.current) { finishDeathRef.current(); return true; }
      if (m === 'paused' || m === 'complete' || m === 'dying') return true;
      if (m === 'home' && menuRef.current === 'campaign') { setMenu('chooser'); return true; }
      if (m === 'home' && menuRef.current === 'chooser') { setMenu('home'); return true; }
      return false;
    });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (!isWeb || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      const k = keyRef.current;
      const m = simRef.current.mode;
      if (vaultRef.current) { if (e.key === 'Escape') { e.preventDefault(); setVault(false); } return; }
      if (cutRef.current) { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); endCutRef.current(); } return; }
      if (introActiveRef.current) { if (e.key === 'Escape') { e.preventDefault(); k.skip(); } return; }
      if (m === 'complete') return;
      const map: Record<string, Act> = { ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right', ArrowUp: 'jump', w: 'jump', ' ': 'jump', ArrowDown: 'slide', s: 'slide' };
      if (map[e.key] && m === 'run') { e.preventDefault(); k.doAction(map[e.key]); return; }
      // Escape pauses but never resumes; P toggles
      if (e.key === 'Escape' && m === 'run') k.pause();
      if (e.key === 'p') { if (m === 'run') k.pause(); else if (m === 'paused') k.resume(); }
      if (e.key === 'Enter' && m === 'home' && menuRef.current === 'home') k.start();
      if (e.key === 'Enter' && m === 'over') k.retry();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isWeb]);

  // swipe: vertical = jump/slide; horizontal = corner turn (any mode) or touch-mode lateral nudge
  // touch mode: horizontal drag steers continuously (finger position maps to lateral offset) unless a corner is
  // being warned, in which case a horizontal swipe is a corner turn. Vertical swipes always jump/slide.
  const fired = useRef(false);
  const dragRef = useRef<{ on: boolean; lane0: number }>({ on: false, lane0: 0 });
  const actRef = useRef(doAction); actRef.current = doAction;
  const widthRef = useRef(width); widthRef.current = width;
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { fired.current = false; dragRef.current = { on: false, lane0: simRef.current.lane }; },
    onPanResponderMove: (_e, g) => {
      const s = simRef.current;
      if (dragRef.current.on) { setLane(s, dragRef.current.lane0 + (g.dx / Math.max(200, widthRef.current * 0.42)) * 1.2); return; }
      if (fired.current) return;
      const ax = Math.abs(g.dx); const ay = Math.abs(g.dy);
      if (Math.max(ax, ay) < 22) return;
      if (ax > ay) {
        const turning = s.mode === 'run' && turnInfo(s).open;
        if (lateralRef.current && !turning) { dragRef.current.on = true; setLane(s, dragRef.current.lane0 + (g.dx / Math.max(200, widthRef.current * 0.42)) * 1.2); return; }
        fired.current = true; actRef.current(g.dx < 0 ? 'left' : 'right'); return;
      }
      fired.current = true;
      actRef.current(g.dy < 0 ? 'jump' : 'slide');
    },
  })).current;

  // trophy vault + unlock reveal
  const [vault, setVault] = useState(false);
  const vaultRef = useRef(false); vaultRef.current = vault;
  const [revealQ, setRevealQ] = useState<string[]>([]);
  const seenRef = useRef<Set<string> | null>(null);
  const unlockedKey = progress.trophies.filter((t) => t.unlocked).map((t) => t.id).join('|');
  useEffect(() => {
    if (!progress.loaded) return;
    const ids = unlockedKey ? unlockedKey.split('|') : [];
    if (!seenRef.current) { seenRef.current = new Set(ids); return; }
    if (mode === 'run' || mode === 'paused' || mode === 'dying' || introOn || cut || phase === 'saving' || phase === 'cutscene') return;
    const fresh = ids.filter((id) => !seenRef.current!.has(id));
    if (!fresh.length) return;
    fresh.forEach((id) => seenRef.current!.add(id));
    setRevealQ((q) => [...q, ...fresh]);
  }, [progress.loaded, unlockedKey, mode, introOn, cut, phase]);
  const revealItems = revealQ.map((id) => progress.trophies.find((t) => t.id === id)).filter((t): t is NonNullable<typeof t> => !!t);

  const running = mode === 'run';
  const glow = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });
  const danger = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] });

  const controlPanel = (
    <ControlPanel ctl={ctl} isWeb={isWeb} status={tilt.status} message={tilt.message} onCalibrate={() => { tilt.calibrate().catch(() => {}); }} onCtl={setCtl}
      sensitivity={progress.settings.sensitivity} onSensitivity={(v) => progress.updateSettings({ sensitivity: v })} />
  );

  return (
    <View style={styles.root}>
      <RunnerScene width={width} height={height} onReady={onSceneReady} />

      {running && <View style={StyleSheet.absoluteFill} {...pan.panHandlers} testID="swipe-area" />}

      {running && (
        <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { paddingTop: top + 8, paddingBottom: bottom + 12 }]}>
          <View pointerEvents="box-none" style={styles.hud}>
            <View style={styles.hudCard} pointerEvents="none">
              <Text style={styles.hudLabel}>DISTANCE</Text>
              <Text style={styles.hudBig}>{hud.dist}<Text style={styles.hudUnit}> m</Text></Text>
              {!activeMission && progress.lastStandBest > 0 && (
                <Text style={[styles.hudBest, hud.dist > progress.lastStandBest && { color: T.accent }]} testID="hud-best">
                  {hud.dist > progress.lastStandBest ? 'NEW BEST' : `BEST ${progress.lastStandBest} m · ${progress.lastStandBest - hud.dist} m to go`}
                </Text>
              )}
              <Text style={[styles.threat, hud.tier >= 4 && { color: T.destructive }]} testID="threat">THREAT {hud.tier + 1} · {hud.threat.toUpperCase()}{hud.overdrive > 0 ? ` +${hud.overdrive}` : ''}</Text>
              <View style={styles.speedTrack}><View style={[styles.speedFill, { width: `${Math.min(100, ((hud.speed - START_SPEED) / (MAX_SPEED - START_SPEED)) * 100)}%` }]} /></View>
            </View>
            <View style={styles.hudRight}>
              <View style={styles.coinChip}>
                <MaterialCommunityIcons name="medical-bag" size={16} color={T.accent} />
                <Text style={styles.coinText}>{hud.coins}</Text>
              </View>
              <Pressable testID="pause" accessibilityLabel="Pause" onPress={pause} hitSlop={12} style={styles.iconBtn}>
                <Feather name="pause" size={22} color={T.foreground} />
              </Pressable>
            </View>
          </View>
          <HordeMeter horde={hud.horde} pulse={danger} />
          <PowerChips shield={hud.shield} flashlight={hud.flashlight} distraction={hud.distraction} />
          <View style={styles.tiltTag} pointerEvents="none">
            <Text style={styles.tiltTagText}>{usingTilt ? (tilt.status === 'ready' ? 'TILT STEERING' : 'TILT ' + tilt.status.toUpperCase()) : 'TOUCH STEERING'}</Text>
          </View>
          {hud.mission ? <MissionHud h={hud.mission} /> : <StageChip hud={hud} />}
          {hud.turn && <TurnBanner turn={hud.turn} pulse={danger} />}
          {toast && <Toast text={toast.text} tone={toast.tone} icon={toast.icon} />}
          <View style={{ flex: 1 }} pointerEvents="none" />
          {hud.turn && (
            <View style={styles.turnRow} pointerEvents="box-none">
              {([-1, 1] as const).map((dir) => (
                <Pressable key={dir} testID={`turn-${dir < 0 ? 'left' : 'right'}`} accessibilityLabel={dir < 0 ? 'Turn left at the corner' : 'Turn right at the corner'} onPressIn={() => turnPress(dir)}
                  style={({ pressed }) => [styles.turnBtn, (hud.turn?.dir === dir || hud.turn?.branch) && styles.turnBtnHint, hud.turn?.armed === dir && styles.turnBtnArmed, pressed && styles.padBtnOn]}>
                  <Feather name={dir < 0 ? 'corner-up-left' : 'corner-up-right'} size={26} color={hud.turn?.armed === dir ? T.primaryForeground : T.foreground} />
                  <Text style={[styles.turnBtnText, hud.turn?.armed === dir && { color: T.primaryForeground }]}>{dir < 0 ? 'LEFT' : 'RIGHT'}</Text>
                </Pressable>
              ))}
            </View>
          )}
          <View style={styles.pad} pointerEvents="box-none">
            {(showPad && !hud.turn
              ? ([['left', 'chevron-left', 'Move left'], ['slide', 'chevrons-down', 'Slide'], ['jump', 'chevrons-up', 'Jump'], ['right', 'chevron-right', 'Move right']] as const)
              : ([['slide', 'chevrons-down', 'Slide'], ['jump', 'chevrons-up', 'Jump']] as const)
            ).map(([a, ic, label]) => (
              <Pressable key={a} testID={`pad-${a}`} accessibilityLabel={label} onPressIn={() => (a === 'left' || a === 'right' ? holdStart(a === 'left' ? -1 : 1) : doAction(a))} onPressOut={holdStop} style={({ pressed }) => [styles.padBtn, pressed && styles.padBtnOn]}>
                <Feather name={ic} size={26} color={T.foreground} />
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {mode === 'home' && !introOn && menu === 'home' && !cut && (
        <Animated.View style={[StyleSheet.absoluteFill, styles.overlayHome, { paddingTop: top + 12, paddingBottom: bottom + 16, opacity: fade }]}>
          <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
            <View style={styles.brand}>
              <View style={styles.kickerRow}>
                <Animated.View style={[styles.hordeDot, { opacity: danger }]} />
                <Text style={styles.kicker}>SECTOR 9 · QUARANTINE BREACHED</Text>
              </View>
              <Text style={styles.title}>DEAD RUN</Text>
              <Text style={styles.tag}>The sun is going down. They are not.</Text>
            </View>
            <View style={{ flex: 1, minHeight: 40 }} />
            {progress.error && (
              <Pressable onPress={progress.retry} style={styles.errorBar} testID="persist-error">
                <Feather name="alert-triangle" size={16} color={T.destructiveForeground} />
                <Text style={styles.errorText}>{progress.error}</Text>
              </Pressable>
            )}
            {lastStandUnlocked(progress.campaign) ? (
              <View style={styles.bestRow} testID="best-run" accessible accessibilityLabel={progress.loaded ? `Last Stand best ${progress.lastStandBest} metres` : 'Loading best run'}>
                <Text style={styles.statLabel}>LAST STAND BEST</Text>
                <Text style={styles.bestValue}>{progress.loaded ? progress.lastStandBest : '—'}<Text style={styles.hudUnit}> m</Text></Text>
              </View>
            ) : (
              <View style={styles.bestRow} testID="best-run" accessible accessibilityLabel={progress.loaded ? `Escape progress ${progress.campaign.completed.length} of 10` : 'Loading progress'}>
                <Text style={styles.statLabel}>ESCAPE PROGRESS</Text>
                <Text style={styles.bestValue}>{progress.loaded ? progress.campaign.completed.length : '—'}<Text style={styles.hudUnit}> / 10</Text></Text>
              </View>
            )}
            <Animated.View style={{ transform: [{ scale: glow }], marginTop: 12 }}>
              <Pressable testID="start" disabled={!sceneReady || !progress.loaded} onPress={start} style={({ pressed }) => [styles.cta, pressed && styles.pressed, (!sceneReady || !progress.loaded) && { opacity: 0.5 }]}>
                <Text style={styles.ctaText}>{!progress.loaded ? 'LOADING RECORDS' : sceneReady ? 'RUN' : 'LOADING CITY'}</Text>
                <Feather name="arrow-up-right" size={24} color={T.primaryForeground} />
              </Pressable>
            </Animated.View>
            <Pressable testID="trophy-open" accessibilityLabel="Trophies" onPress={() => setVault(true)} style={({ pressed }) => [styles.ghost, pressed && styles.pressed]}>
              <Feather name="archive" size={18} color={T.accent} />
              <Text style={styles.ghostText}>Trophies</Text>
            </Pressable>
            <Pressable testID="help" onPress={() => setHelp(true)} style={({ pressed }) => [styles.ghost, pressed && styles.pressed]}>
              <Feather name="book-open" size={18} color={T.accent} />
              <Text style={styles.ghostText}>Survival briefing</Text>
            </Pressable>
            {(
              <Pressable testID="replay-intro" onPress={() => playIntro(null)} disabled={!sceneReady} style={({ pressed }) => [styles.ghost, pressed && styles.pressed, !sceneReady && { opacity: 0.5 }]}>
                <Feather name="film" size={18} color={T.accent} />
                <Text style={styles.ghostText}>Replay the night it started</Text>
              </Pressable>
            )}
          </ScrollView>
        </Animated.View>
      )}

      {introOn && <IntroOverlay t={introT} top={top} bottom={bottom} onSkip={skip} muted={introSound.muted} audioError={introSound.error} onMute={introSound.toggle} />}

      {mode === 'paused' && (
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: fade, paddingTop: top, paddingBottom: bottom }]}>
          <ScrollView contentContainerStyle={styles.scrollCenter} showsVerticalScrollIndicator={false}>
            <View style={styles.panel}>
              <Text style={styles.kicker}>HOLD YOUR BREATH</Text>
              <Text style={styles.panelTitle}>Paused</Text>
              <Text style={styles.panelSub}>{hud.dist} m out  ·  {hud.coins} supplies</Text>
              <Text style={styles.kicker}>CONTROLS AND SOUND</Text>
              {controlPanel}
              <SoundPanel prefs={audio.prefs} error={audio.error} onMusic={audio.toggleMusic} onSfx={audio.toggleSfx} onDismiss={audio.dismissError} />
              <Pressable testID="resume" onPress={resume} style={({ pressed }) => [styles.cta, pressed && styles.pressed]}>
                <Feather name="play" size={22} color={T.primaryForeground} />
                <Text style={styles.ctaText}>RESUME</Text>
              </Pressable>
              <View style={styles.rowBtns}>
                <Pressable testID="restart" onPress={startRun} style={({ pressed }) => [styles.ghost, pressed && styles.pressed]}>
                  <Feather name="rotate-ccw" size={18} color={T.accent} /><Text style={styles.ghostText}>Restart</Text>
                </Pressable>
                <Pressable testID="pause-home" onPress={() => home(activeMission ? 'campaign' : 'home')} style={({ pressed }) => [styles.ghost, pressed && styles.pressed]}>
                  <Feather name="home" size={18} color={T.accent} /><Text style={styles.ghostText}>Safehouse</Text>
                </Pressable>
                <Pressable testID="trophy-open" accessibilityLabel="Trophies" onPress={() => setVault(true)} style={({ pressed }) => [styles.ghost, pressed && styles.pressed]}>
                  <Feather name="archive" size={18} color={T.accent} /><Text style={styles.ghostText}>Trophies</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </Animated.View>
      )}

      {mode === 'over' && offer && (
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: fade, paddingTop: top, paddingBottom: bottom }]}>
          <ScrollView contentContainerStyle={styles.scrollCenter} showsVerticalScrollIndicator={false}>
            <View style={styles.panel} testID="revive-offer">
              <Text style={[styles.kicker, { color: T.destructive }]}>CAUGHT</Text>
              <Text style={styles.panelTitle}>Second chance?</Text>
              <Text style={styles.panelSub}>Watch a short ad to get back up at {Math.floor(simRef.current.dist)} m with the horde pushed back. One per run.</Text>
              <Pressable testID="revive-watch" disabled={adBusy} onPress={watchAd} style={({ pressed }) => [styles.cta, pressed && styles.pressed, adBusy && { opacity: 0.5 }]}>
                <Feather name="play-circle" size={22} color={T.primaryForeground} />
                <Text style={styles.ctaText}>{adBusy ? 'LOADING' : 'CONTINUE'}</Text>
              </Pressable>
              <Pressable testID="revive-skip" disabled={adBusy} onPress={finishDeath} style={({ pressed }) => [styles.ghost, pressed && styles.pressed]}>
                <Feather name="x" size={18} color={T.accent} /><Text style={styles.ghostText}>No thanks</Text>
              </Pressable>
            </View>
          </ScrollView>
        </Animated.View>
      )}

      {mode === 'over' && result && (
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: fade, paddingTop: top, paddingBottom: bottom }]}>
          <ScrollView contentContainerStyle={styles.scrollCenter} showsVerticalScrollIndicator={false}>
            <View style={styles.panel}>
              <Text style={[styles.kicker, { color: T.destructive }]}>CAUGHT</Text>
              <Text style={styles.panelSub}>{result.cause}</Text>
              <Text style={styles.resultBig}>{result.dist}<Text style={styles.hudUnit}> m</Text></Text>
              {activeMission ? null : result.best ? (
                <View style={styles.badge}><Feather name="award" size={14} color={T.accentForeground} /><Text style={styles.badgeText}>FURTHEST YET</Text></View>
              ) : (
                <Text style={styles.panelSub}>Last Stand best {progress.lastStandBest} m</Text>
              )}
              <View style={styles.statsRow} testID="run-stats">
                <Stat label="CORNERS" value={`${result.turns}`} />
                <View style={styles.statDivider} />
                <Stat label="JUMPS" value={`${result.jumps}`} />
                <View style={styles.statDivider} />
                <Stat label="SLIDES" value={`${result.slides}`} />
                <View style={styles.statDivider} />
                <Stat label="PICKUPS" value={`${result.pickups}`} />
                <View style={styles.statDivider} />
                <Stat label="SUPPLIES" value={`${result.coins}`} />
              </View>
              {progress.error && (
                <Pressable onPress={progress.dismissError} style={styles.errorBar}>
                  <Feather name="alert-triangle" size={16} color={T.destructiveForeground} />
                  <Text style={styles.errorText}>{progress.error}</Text>
                </Pressable>
              )}
              <Pressable testID={activeMission ? 'mission-retry' : 'retry'} onPress={startRun} style={({ pressed }) => [styles.cta, pressed && styles.pressed]}>
                <Feather name="rotate-ccw" size={22} color={T.primaryForeground} />
                <Text style={styles.ctaText}>RUN AGAIN</Text>
              </Pressable>
              {activeMission && (
                <Pressable testID="campaign-back" onPress={() => home('campaign')} style={({ pressed }) => [styles.ghost, pressed && styles.pressed]}>
                  <Feather name="map" size={18} color={T.accent} /><Text style={styles.ghostText}>Escape route</Text>
                </Pressable>
              )}
              <Pressable testID="over-home" onPress={() => home()} style={({ pressed }) => [styles.ghost, pressed && styles.pressed]}>
                <Feather name="home" size={18} color={T.accent} /><Text style={styles.ghostText}>Back to the safehouse</Text>
              </Pressable>
              <Pressable testID="trophy-open" accessibilityLabel="Trophies" onPress={() => setVault(true)} style={({ pressed }) => [styles.ghost, pressed && styles.pressed]}>
                <Feather name="archive" size={18} color={T.accent} /><Text style={styles.ghostText}>Trophies</Text>
              </Pressable>
            </View>
          </ScrollView>
        </Animated.View>
      )}

      {mode === 'home' && !introOn && !cut && menu === 'chooser' && (
        <ModeChooser top={top} bottom={bottom} best={progress.lastStandBest} done={progress.campaign.completed.length} lastStand={lastStandUnlocked(progress.campaign)}
          onBack={() => setMenu('home')} onEndless={startEndless} onEscape={() => setMenu('campaign')} />
      )}
      {mode === 'home' && !introOn && !cut && menu === 'campaign' && (
        <CampaignMap top={top} bottom={bottom} campaign={progress.campaign} loaded={progress.loaded && sceneReady}
          onBack={() => setMenu('chooser')} onStart={startMission} onReplay={replayScene} />
      )}
      {mode === 'complete' && completion && phase === 'saving' && <MissionSaving top={top} bottom={bottom} title={missionById(completion.id).destination} />}
      {mode === 'complete' && completion && phase === 'error' && (
        <MissionSaveError top={top} bottom={bottom} busy={saveBusy} message={progress.error ?? 'Your device refused the write. Nothing was lost yet; try again.'}
          onRetry={runSave} onAbandon={() => home('campaign')} />
      )}
      {mode === 'complete' && completion && phase === 'done' && !cut && (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]}>
          <MissionSuccess top={top} bottom={bottom} m={missionById(completion.id)} seconds={completion.seconds} coins={completion.coins}
            best={progress.campaign.bestTimes[completion.id]} hasNext={completion.id < 10 && missionUnlocked(progress.campaign, completion.id + 1)}
            onNext={() => startMission(completion.id + 1)} onRetry={() => { missionRef.current = completion.id; startRun(); }}
            onCampaign={() => home('campaign')} onScene={replayOwnScene} />
        </Animated.View>
      )}
      {cut && <CutsceneOverlay id={cut.id} t={cut.t} top={top} bottom={bottom} replay={cut.replay} onSkip={skipCut} />}

      {help && (
        <View style={[StyleSheet.absoluteFill, styles.scrim, { paddingTop: top, paddingBottom: bottom }]}>
          <View style={[styles.panel, { maxHeight: height - top - bottom - 24 }]}>
            <ScrollView contentContainerStyle={{ gap: 14 }} showsVerticalScrollIndicator={false}>
              <Text style={styles.kicker}>SURVIVAL BRIEFING</Text>
              <Text style={styles.panelTitle}>Keep moving</Text>
              <Text style={styles.panelSub}>The infected never stop. Read the street, not the crowd behind you.</Text>
              <HelpRow icon="smartphone" title="Smooth tilt steering" body="A small tilt moves you partway across the road. Lean further to move further. Return to your calibrated neutral position to center." />
              <HelpRow icon="crosshair" title="Calibrate first" body="Hold the phone the way you will play, neutral and still, then tap Calibrate. It takes about half a second." />
              <HelpRow icon="corner-up-right" title="Turn at corners" body="Streets end in dead ends. Arrows, roadside signs and a countdown show which way the open street goes. Swipe that way, tap the turn button, or press the arrow key as you reach the corner. The faster you run, the earlier it accepts your turn. Tilt never turns you; it only moves you across the street." />
              <HelpRow icon="users" title="Infected walk at you" body="Some infected come straight down a lane toward you. They never swerve. You cannot jump or slide past them, so move to an empty lane. There is always one open." />
              <HelpRow icon="alert-octagon" title="Special infected" body="From mission 2 the campaign adds new infected, one per mission. Crawlers stay low: jump over them. Sprinters charge fast: change lanes early. Brutes block two lanes at once: find the third." />
              <HelpRow icon="map" title="Three zones, then repeat" body="Every 900 m the route changes: ruined city streets, then the Precinct 9 police station, then St. Agnes Hospital, then back outside. Uniformed officers patrol the precinct; doctors and nurses roam the wards. Your distance and speed carry through." />
              <HelpRow icon="arrow-up" title="Swipe up or tap Jump" body="Clear sinkholes and concrete barricades." />
              <HelpRow icon="arrow-down" title="Swipe down or tap Slide" body="Duck under quarantine gates. Mid-air, it drops you fast." />
              <HelpRow icon="shield" title="Shield" body={POWER.shield.body} />
              <HelpRow icon="sun" title="Torch" body={POWER.flashlight.body} />
              <HelpRow icon="zap" title="Flare" body={POWER.distraction.body} />
              <HelpRow icon="alert-triangle" title="Stumbles" body="Clip a barricade, gate or walker while the horde is well behind and you stumble instead of dying, then blink safe for a moment. Hit something while they are close and it is over. Sinkholes and wrong corners are always fatal." />
              <HelpRow icon="git-branch" title="Routes and splits" body="The road changes every 300 m: evacuation boulevard, service passage, collapsed corridor. Split junctions open both ways; either turn is safe." />
              <HelpRow icon="package" title="Grab supplies" body="Glowing med canisters add to your stockpile. Arcs of them hint at a jump." />
              <HelpRow icon="sliders" title="Controls and sound" body="Tilt or touch steering, calibration, sensitivity, music and effects all live in the pause menu. Tap the pause button at the top right during a run." />
              <HelpRow icon="command" title="No tilt?" body="Switch to Touch for lane buttons and sideways swipes (away from corners). On web: arrow keys or WASD, Space to jump, P to pause, Enter to start." />
              <Pressable testID="help-close" onPress={() => setHelp(false)} style={({ pressed }) => [styles.cta, pressed && styles.pressed]}>
                <Feather name="check" size={22} color={T.primaryForeground} />
                <Text style={styles.ctaText}>UNDERSTOOD</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      )}

      {vault && !running && !introOn && !cut && <TrophyMenu trophies={progress.trophies} top={top} bottom={bottom} onBack={() => setVault(false)} />}
      {revealItems.length > 0 && !running && !introOn && !cut && phase !== 'saving' && phase !== 'error' && (
        <TrophyReveal items={revealItems} top={top} bottom={bottom}
          onNext={() => setRevealQ((q) => q.slice(1))}
          onOpen={() => { setRevealQ([]); setVault(true); }} />
      )}
    </View>
  );
}

const STATUS_LABEL: Record<string, string> = {
  idle: 'Waking sensor', ready: 'Tilt ready', calibrating: 'Calibrating', unavailable: 'No motion sensor', denied: 'Motion access denied', error: 'Sensor error',
};

function ControlPanel({ ctl, isWeb, status, message, onCalibrate, onCtl, sensitivity, onSensitivity }: {
  ctl: Ctl; isWeb: boolean; status: string; message: string; onCalibrate: () => void; onCtl: (c: Ctl) => void; sensitivity: number; onSensitivity: (v: number) => void;
}) {
  const ok = status === 'ready';
  const bad = status === 'unavailable' || status === 'denied' || status === 'error';
  return (
    <View style={styles.ctlCard}>
      <View style={styles.seg}>
        {(['tilt', 'touch'] as const).map((c) => {
          const disabled = c === 'tilt' && isWeb;
          const on = ctl === c;
          return (
            <Pressable key={c} testID={`ctl-${c}`} disabled={disabled} accessibilityState={{ selected: on, disabled }} onPress={() => onCtl(c)} style={[styles.segBtn, on && styles.segOn, disabled && { opacity: 0.4 }]}>
              <MaterialCommunityIcons name={c === 'tilt' ? 'phone-rotate-landscape' : 'gesture-tap-button'} size={16} color={on ? T.primaryForeground : T.foreground} />
              <Text style={[styles.segText, on && { color: T.primaryForeground }]}>{c === 'tilt' ? 'Tilt' : 'Touch'}</Text>
            </Pressable>
          );
        })}
      </View>
      {ctl === 'tilt' && !isWeb ? (
        <View style={styles.ctlRow}>
          <View style={[styles.statusDot, { backgroundColor: ok ? T.accent : bad ? T.destructive : T.primary }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.ctlTitle}>{STATUS_LABEL[status] ?? status}</Text>
            {!!message && <Text style={styles.ctlBody} numberOfLines={3}>{message}</Text>}
          </View>
          <Pressable testID="calibrate" onPress={onCalibrate} disabled={status === 'calibrating' || status === 'unavailable'} style={({ pressed }) => [styles.calBtn, pressed && styles.pressed, (status === 'calibrating' || status === 'unavailable') && { opacity: 0.5 }]}>
            <Feather name="crosshair" size={15} color={T.accent} />
            <Text style={styles.calText}>{status === 'denied' ? 'Allow' : 'Calibrate'}</Text>
          </Pressable>
        </View>
      ) : null}
      {ctl === 'tilt' && !isWeb ? <SensitivityRow value={sensitivity} onChange={onSensitivity} /> : (
        <Text style={styles.ctlBody}>
          {isWeb ? 'Tilt steering needs the mobile app. Here: arrow keys or WASD, swipes, or the on-screen lane buttons.' : 'Drag sideways anywhere to steer smoothly, or hold the lane buttons. Near a corner, a sideways swipe turns. Swipe up or down to jump and slide.'}
        </Text>
      )}
    </View>
  );
}

function SoundPanel({ prefs, error, onMusic, onSfx, onDismiss }: { prefs: AudioPrefs; error: string | null; onMusic: () => void; onSfx: () => void; onDismiss: () => void }) {
  const items = [
    { k: 'music', on: prefs.music, label: 'Music', icon: prefs.music ? 'music' : 'music-off', act: onMusic },
    { k: 'sfx', on: prefs.sfx, label: 'Effects', icon: prefs.sfx ? 'volume-high' : 'volume-off', act: onSfx },
  ] as const;
  return (
    <View style={{ gap: 8, marginTop: 10 }}>
      <View style={styles.seg}>
        {items.map((it) => (
          <Pressable key={it.k} testID={`sound-${it.k}`} accessibilityRole="switch" accessibilityState={{ checked: it.on }}
            accessibilityLabel={`${it.label} ${it.on ? 'on' : 'off'}. Tap to ${it.on ? 'mute' : 'unmute'}.`}
            onPress={it.act} style={[styles.segBtn, it.on && styles.segOn]}>
            <MaterialCommunityIcons name={it.icon} size={16} color={it.on ? T.primaryForeground : T.mutedForeground} />
            <Text style={[styles.segText, it.on ? { color: T.primaryForeground } : { color: T.mutedForeground }]}>{it.label} {it.on ? 'on' : 'off'}</Text>
          </Pressable>
        ))}
      </View>
      {error && (
        <Pressable testID="audio-error" onPress={onDismiss} accessibilityLabel={`${error} Tap to dismiss.`} style={styles.errorBar}>
          <Feather name="volume-x" size={16} color={T.destructiveForeground} />
          <Text style={styles.errorText}>{error}</Text>
        </Pressable>
      )}
    </View>
  );
}

function StageChip({ hud }: { hud: Hud }) {
  const fresh = hud.stageProg < 0.05 && hud.dist > 10;
  return (
    <View style={styles.stageWrap} pointerEvents="none" testID="stage-chip">
      <View style={[styles.stageChip, fresh && styles.stageChipFresh]}>
        <MaterialCommunityIcons name={STAGE_ICON[hud.stage]} size={16} color={fresh ? T.primaryForeground : T.accent} />
        <View style={{ gap: 3 }}>
          <Text style={[styles.stageName, fresh && { color: T.primaryForeground }]}>{fresh ? `ENTERING ${hud.stageName.toUpperCase()}` : hud.stageName.toUpperCase()}</Text>
          <View style={styles.stageTrack}><View style={[styles.stageFill, { width: `${Math.round(hud.stageProg * 100)}%` }]} /></View>
          <Text style={[styles.stageSub, fresh && { color: T.primaryForeground }]}>{hud.toNext} m to {STAGE_NAMES[hud.next]}</Text>
          <Text style={[styles.stageSub, { color: fresh ? T.primaryForeground : T.primary }]} testID="route-name">{hud.route.toUpperCase()}</Text>
        </View>
      </View>
    </View>
  );
}

function IntroOverlay({ t, top, bottom, onSkip, muted, audioError, onMute }: { t: number; top: number; bottom: number; onSkip: () => void; muted: boolean; audioError: boolean; onMute: () => void }) {
  const cap = introCaption(t);
  const left = Math.max(0, Math.ceil(INTRO_LEN - t));
  const fadeIn = Math.max(0, 1 - t / 0.6);
  const fadeOut = Math.max(0, (t - (INTRO_LEN - 0.5)) / 0.5);
  return (
    <View style={StyleSheet.absoluteFill} testID="intro">
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: T.background, opacity: Math.max(fadeIn, fadeOut) }]} />
      <View pointerEvents="none" style={[styles.letterbox, { top: 0, height: top + 34 }]} />
      <View pointerEvents="none" style={[styles.letterbox, { bottom: 0, height: bottom + 54 }]} />
      <View style={[styles.introTop, { top: top + 6 }]} pointerEvents="box-none">
        <Text style={styles.introKicker}>THE NIGHT IT STARTED</Text>
        <Pressable accessibilityLabel={muted ? 'Unmute intro' : 'Mute intro'} onPress={onMute} hitSlop={10}>
          <Feather name={muted || audioError ? 'volume-x' : 'volume-2'} size={18} color={T.foreground} />
        </Pressable>
        <Pressable testID="intro-skip" accessibilityLabel="Skip intro" onPress={onSkip} hitSlop={10} style={({ pressed }) => [styles.skipBtn, pressed && styles.pressed]}>
          <Text style={styles.skipText}>SKIP  {left}</Text>
          <Feather name="skip-forward" size={14} color={T.foreground} />
        </Pressable>
      </View>
      {audioError && <Text style={{ position: 'absolute', top: top + 40, left: 16, color: T.mutedForeground, fontSize: 11 }}>Audio unavailable — captions remain on.</Text>}
      {cap && (
        <View pointerEvents="none" style={[styles.captionWrap, { bottom: bottom + 70 }]}>
          <Text testID="intro-caption" style={[styles.caption, { color: TONE_COLOR[cap.tone] }, cap.tone === 'alert' && styles.captionAlert, cap.tone === 'sfx' && styles.captionSfx]}>{cap.text}</Text>
        </View>
      )}
    </View>
  );
}

function TurnBanner({ turn, pulse }: { turn: HudTurn; pulse: Animated.AnimatedInterpolation<number> }) {
  const left = turn.dir < 0;
  const armedOk = turn.branch ? turn.armed !== 0 : turn.armed === turn.dir;
  const label = armedOk ? 'TURN LOCKED' : turn.branch ? (turn.open ? 'SPLIT · TURN NOW' : 'SPLIT AHEAD') : turn.open ? 'TURN NOW' : `${left ? 'LEFT' : 'RIGHT'} TURN`;
  return (
    <View style={styles.turnWrap} pointerEvents="none" testID="turn-banner">
      <Animated.View style={[styles.turnCard, turn.open && !armedOk && styles.turnCardOpen, armedOk && styles.turnCardArmed, turn.open && !armedOk ? { opacity: pulse } : null]}>
        {turn.branch ? <Feather name="git-branch" size={28} color={armedOk || turn.open ? T.primaryForeground : T.primary} style={{ transform: [{ rotate: '180deg' }] }} />
          : <Feather name={left ? 'corner-up-left' : 'corner-up-right'} size={30} color={armedOk || turn.open ? T.primaryForeground : T.primary} />}
        <View>
          <Text style={[styles.turnLabel, (armedOk || turn.open) && { color: T.primaryForeground }]}>{label}</Text>
          <Text style={[styles.turnSub, (armedOk || turn.open) && { color: T.primaryForeground }]}>{armedOk ? 'Hold your line' : turn.branch ? `${turn.dist} m · swipe either way` : `${turn.dist} m · swipe ${left ? 'left' : 'right'}`}</Text>
        </View>
      </Animated.View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function HelpRow({ icon, title, body }: { icon: React.ComponentProps<typeof Feather>['name']; title: string; body: string }) {
  return (
    <View style={styles.helpRow}>
      <View style={styles.helpIcon}><Feather name={icon} size={18} color={T.primary} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.helpTitle}>{title}</Text>
        <Text style={styles.helpBody}>{body}</Text>
      </View>
    </View>
  );
}

const F = { r: 'Inter_400Regular', m: 'Inter_500Medium', s: 'Inter_600SemiBold', b: 'Inter_700Bold' };

const styles = StyleSheet.create({
  threat: { fontSize: 10, letterSpacing: 1.2, fontWeight: '800', color: T.accent, marginTop: 2 },
  root: { flex: 1, backgroundColor: T.background, overflow: 'hidden' },
  hud: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 16 },
  hudCard: { backgroundColor: T.glass, paddingHorizontal: 14, paddingVertical: 8, borderRadius: colors.radius, borderLeftWidth: 3, borderLeftColor: T.primary },
  hudLabel: { fontFamily: F.s, fontSize: 10, letterSpacing: 2.5, color: T.mutedForeground },
  hudBest: { fontFamily: F.s, fontSize: 10, letterSpacing: 1.2, color: T.mutedForeground, marginTop: 2 },
  hudBig: { fontFamily: F.b, fontSize: 36, color: T.foreground, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  hudUnit: { fontFamily: F.m, fontSize: 16, color: T.mutedForeground },
  speedTrack: { width: 110, height: 3, backgroundColor: T.border, borderRadius: 2, overflow: 'hidden', marginTop: 4 },
  speedFill: { height: 3, backgroundColor: T.destructive },
  hudRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  coinChip: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, backgroundColor: T.glass, borderWidth: 1, borderColor: T.border },
  coinText: { fontFamily: F.b, fontSize: 16, color: T.accent, fontVariant: ['tabular-nums'] },
  iconBtn: { padding: 6 },
  tiltTag: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginLeft: 18, marginTop: 8 },
  tiltTagText: { fontFamily: F.s, fontSize: 10, letterSpacing: 2, color: T.mutedForeground },
  hordeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: T.destructive },
  pad: { flexDirection: 'row', justifyContent: 'center', gap: 12, paddingHorizontal: 16 },
  padBtn: { width: 70, height: 60, borderRadius: colors.radius, backgroundColor: T.glass, borderWidth: 1, borderColor: T.border, alignItems: 'center', justifyContent: 'center' },
  stageWrap: { alignItems: 'flex-start', marginLeft: 16, marginTop: 8 },
  stageChip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 6, borderRadius: colors.radius, backgroundColor: T.glass, borderWidth: 1, borderColor: T.border },
  stageChipFresh: { backgroundColor: T.primary, borderColor: T.primary },
  stageName: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.6, color: T.foreground },
  stageSub: { fontFamily: 'Inter_500Medium', fontSize: 10, color: T.mutedForeground, fontVariant: ['tabular-nums'] },
  stageTrack: { width: 130, height: 3, borderRadius: 2, backgroundColor: T.border, overflow: 'hidden' },
  stageFill: { height: 3, backgroundColor: T.accent },
  letterbox: { position: 'absolute', left: 0, right: 0, backgroundColor: T.scrim },
  introTop: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  introKicker: { fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 3, color: T.mutedForeground },
  skipBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, backgroundColor: T.glass, borderWidth: 1, borderColor: T.border },
  skipText: { fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 2, color: T.foreground, fontVariant: ['tabular-nums'] },
  captionWrap: { position: 'absolute', left: 20, right: 20, alignItems: 'center' },
  caption: { fontFamily: 'Inter_700Bold', fontSize: 18, letterSpacing: 2.5, textAlign: 'center', textShadowColor: T.scrim, textShadowRadius: 8 },
  captionAlert: { fontSize: 20, backgroundColor: T.destructive, color: T.destructiveForeground, paddingHorizontal: 12, paddingVertical: 6, overflow: 'hidden' },
  captionSfx: { fontStyle: 'italic', letterSpacing: 4 },
  turnWrap: { alignItems: 'center', marginTop: 10 },
  turnCard: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderRadius: colors.radius, backgroundColor: T.glass, borderWidth: 2, borderColor: T.primary },
  turnCardOpen: { backgroundColor: T.primary, borderColor: T.primaryEdge },
  turnCardArmed: { backgroundColor: T.accent, borderColor: T.accent },
  turnLabel: { fontFamily: 'Inter_700Bold', fontSize: 17, letterSpacing: 2.5, color: T.primary },
  turnSub: { fontFamily: 'Inter_500Medium', fontSize: 12, color: T.mutedForeground, fontVariant: ['tabular-nums'] },
  turnRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, marginBottom: 12 },
  turnBtn: { width: 96, height: 76, borderRadius: colors.radius, backgroundColor: T.glass, borderWidth: 1, borderColor: T.border, alignItems: 'center', justifyContent: 'center', gap: 2 },
  turnBtnHint: { borderColor: T.primary, borderWidth: 2 },
  turnBtnArmed: { backgroundColor: T.accent, borderColor: T.accent },
  turnBtnText: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 2, color: T.foreground },
  padBtnOn: { backgroundColor: T.secondary, borderColor: T.primary, transform: [{ scale: 0.94 }] },
  overlayHome: { paddingHorizontal: 22, backgroundColor: T.homeScrim },
  brand: { alignItems: 'center', marginTop: 4 },
  kickerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: T.glass, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99 },
  kicker: { fontFamily: F.s, fontSize: 11, letterSpacing: 2.6, color: T.accent, textAlign: 'center' },
  title: { fontFamily: F.b, fontSize: 52, lineHeight: 56, letterSpacing: 3, color: T.foreground, textAlign: 'center', marginTop: 14, textShadowColor: T.scrim, textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 14 },
  subtitle: { fontFamily: F.b, fontSize: 18, letterSpacing: 12, color: T.primary, textAlign: 'center', marginTop: 2, paddingLeft: 12 },
  tag: { fontFamily: F.m, fontSize: 15, color: T.foreground, marginTop: 12, textAlign: 'center', opacity: 0.9, textShadowColor: T.scrim, textShadowRadius: 8 },
  statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, marginBottom: 10, borderWidth: 1, borderColor: T.border, backgroundColor: T.glass, borderRadius: colors.radius },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontFamily: F.b, fontSize: 19, color: T.foreground, fontVariant: ['tabular-nums'] },
  statLabel: { fontFamily: F.s, fontSize: 9, letterSpacing: 1.8, color: T.mutedForeground, marginTop: 3 },
  bestRow: { alignSelf: 'center', alignItems: 'center', paddingHorizontal: 28, paddingVertical: 10, marginBottom: 6, borderRadius: colors.radius, backgroundColor: T.glass, borderWidth: 1, borderColor: T.border },
  bestValue: { fontFamily: F.b, fontSize: 34, color: T.foreground, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  statDivider: { width: 1, height: 28, backgroundColor: T.border },
  ctlCard: { backgroundColor: T.glass, borderWidth: 1, borderColor: T.border, borderRadius: colors.radius, padding: 12, gap: 10 },
  seg: { flexDirection: 'row', backgroundColor: T.muted, borderRadius: 10, padding: 3 },
  segBtn: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: 8 },
  segOn: { backgroundColor: T.primary },
  segText: { fontFamily: F.s, fontSize: 13, color: T.foreground },
  ctlRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusDot: { width: 9, height: 9, borderRadius: 5 },
  ctlTitle: { fontFamily: F.s, fontSize: 14, color: T.foreground },
  ctlBody: { fontFamily: F.r, fontSize: 12, lineHeight: 17, color: T.mutedForeground },
  calBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99, borderWidth: 1, borderColor: T.accent },
  calText: { fontFamily: F.s, fontSize: 13, color: T.accent },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: T.primary, paddingVertical: 17, borderRadius: colors.radius, borderBottomWidth: 4, borderBottomColor: T.primaryEdge },
  ctaText: { fontFamily: F.b, fontSize: 19, letterSpacing: 4, color: T.primaryForeground },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  ghost: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, paddingHorizontal: 14 },
  ghostText: { fontFamily: F.s, fontSize: 15, color: T.accent },
  rowBtns: { flexDirection: 'row', justifyContent: 'center', gap: 16 },
  scrim: { backgroundColor: T.scrim, justifyContent: 'center', paddingHorizontal: 20 },
  scrollCenter: { flexGrow: 1, justifyContent: 'center', paddingVertical: 12 },
  panel: { backgroundColor: T.card, borderRadius: colors.radius + 6, padding: 20, borderWidth: 1, borderColor: T.border, gap: 10, width: '100%', maxWidth: 440, alignSelf: 'center' },
  panelTitle: { fontFamily: F.b, fontSize: 30, color: T.foreground, textAlign: 'center' },
  panelSub: { fontFamily: F.r, fontSize: 14, lineHeight: 20, color: T.mutedForeground, textAlign: 'center' },
  resultBig: { fontFamily: F.b, fontSize: 58, color: T.primary, textAlign: 'center', letterSpacing: -2, fontVariant: ['tabular-nums'] },
  badge: { flexDirection: 'row', gap: 6, alignSelf: 'center', alignItems: 'center', backgroundColor: T.accent, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 99 },
  badgeText: { fontFamily: F.b, fontSize: 11, letterSpacing: 2, color: T.accentForeground },
  errorBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: T.destructive, padding: 12, borderRadius: colors.radius, marginBottom: 10 },
  errorText: { flex: 1, fontFamily: F.m, fontSize: 13, color: T.destructiveForeground },
  helpRow: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  helpIcon: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: T.border, alignItems: 'center', justifyContent: 'center', backgroundColor: T.muted },
  helpTitle: { fontFamily: F.s, fontSize: 15, color: T.foreground },
  helpBody: { fontFamily: F.r, fontSize: 13, lineHeight: 19, color: T.mutedForeground, marginTop: 2 },
});
