// Web build: AdMob is native-only, so a rewarded ad is never ready. See useRewardedAd.native.ts.
export interface RewardedAdApi {
  /** an ad is loaded and can be shown now */
  ready: boolean;
  /** shows the ad; resolves after it closes, true only if the reward was earned */
  show: () => Promise<boolean>;
}

export function useRewardedAd(): RewardedAdApi {
  return { ready: false, show: async () => false };
}
