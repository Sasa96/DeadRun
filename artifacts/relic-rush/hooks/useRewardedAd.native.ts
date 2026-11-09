import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import mobileAds, { AdEventType, AdsConsent, RewardedAd, RewardedAdEventType, TestIds } from 'react-native-google-mobile-ads';
import { requestTrackingPermissionsAsync } from 'expo-tracking-transparency';
import { ADMOB_UNITS, USE_TEST_ADS } from '@/constants/ads';
import type { RewardedAdApi } from './useRewardedAd';

const RETRY_MS = 30000;
const unitId = (() => {
  const real = Platform.OS === 'ios' ? ADMOB_UNITS.rewardedRevive.ios : ADMOB_UNITS.rewardedRevive.android;
  return USE_TEST_ADS || !real ? TestIds.REWARDED : real;
})();

let started: Promise<boolean> | null = null;
/** Once per app session: privacy consent (Google UMP), then the iOS tracking prompt, then SDK init.
 * No ad is requested before this resolves true. */
function startAds() {
  started ??= (async () => {
    try { await AdsConsent.gatherConsent(); } catch {}
    try { await requestTrackingPermissionsAsync(); } catch {}
    const info = await AdsConsent.getConsentInfo().catch(() => null);
    if (info && !info.canRequestAds) return false;
    await mobileAds().initialize();
    return true;
  })().catch(() => false);
  return started;
}

export function useRewardedAd(): RewardedAdApi {
  const [ready, setReady] = useState(false);
  const adRef = useRef<RewardedAd | null>(null);
  const pending = useRef<{ earned: boolean; resolve: (earned: boolean) => void } | null>(null);
  const settle = useCallback(() => {
    const p = pending.current;
    pending.current = null;
    p?.resolve(p.earned);
  }, []);

  useEffect(() => {
    let alive = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const unsubs: (() => void)[] = [];
    startAds().then((ok) => {
      if (!ok || !alive) return;
      const ad = RewardedAd.createForAdRequest(unitId);
      adRef.current = ad;
      const load = () => { if (alive) { setReady(false); ad.load(); } };
      unsubs.push(
        ad.addAdEventListener(RewardedAdEventType.LOADED, () => alive && setReady(true)),
        ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => { if (pending.current) pending.current.earned = true; }),
        // A shown ad is spent: preload the next one as soon as it closes.
        ad.addAdEventListener(AdEventType.CLOSED, () => { settle(); load(); }),
        ad.addAdEventListener(AdEventType.ERROR, () => { settle(); if (alive) setReady(false); clearTimeout(retry); retry = setTimeout(load, RETRY_MS); }),
      );
      load();
    });
    return () => {
      alive = false;
      clearTimeout(retry);
      unsubs.forEach((u) => u());
      adRef.current = null;
      settle();
    };
  }, [settle]);

  const show = useCallback(() => new Promise<boolean>((resolve) => {
    const ad = adRef.current;
    if (!ad || !ad.loaded || pending.current) { resolve(false); return; }
    pending.current = { earned: false, resolve };
    setReady(false);
    ad.show().catch(settle);
  }), [settle]);

  return { ready, show };
}
