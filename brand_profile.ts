export type BrandProfile = {
  brandName: string;
  website: string;
  supportEmail: string;
  reportTitleTemplate: string;
  watermarkText: string | null;
  logoAssetId: string | null;
  accentColor: string | null;
  disclaimer: { short: string; full: string };
};

export function getBrandProfile(): BrandProfile {
  return {
    brandName: "Down Dirty 84",
    website: "https://www.downdirty84llc.com/",
    supportEmail: "Downdirty84llc@gmail.com",
    reportTitleTemplate: "Down Dirty 84 • Log Review & Change List",
    watermarkText: null,
    logoAssetId: null,
    accentColor: null,
    disclaimer: {
      short:
        "Off-road / motorsports use only. No WOT until blockers are cleared. Verify wideband, fuel system, and calibration before flashing.",
      full:
        "IMPORTANT SAFETY & LIABILITY NOTICE (Down Dirty 84)\n\n" +
        "This analysis and any suggested calibration changes are provided for informational purposes and are intended for off-road / motorsports use only where permitted. Vehicle calibration changes can cause engine, drivetrain, and emissions system damage, and may be illegal for street use in some jurisdictions. You (the vehicle owner/tuner) are solely responsible for verifying all sensor inputs (including wideband scaling/placement), mechanical condition, fuel pressure/volume, injector capacity, ignition system health, and the suitability of any calibration changes before applying them.\n\n" +
        "Do NOT perform wide-open-throttle (WOT) operation when any BLOCKER findings are present (e.g., lean under load, excessive knock, over-temperature, fuel pressure drop). If abnormal behavior occurs (lean spike, knock spike, misfire, overheating, fuel pressure instability), immediately stop the pull and investigate.\n\n" +
        "Down Dirty 84 makes no guarantees regarding performance, reliability, emissions compliance, or fitness for a particular purpose. By using this report and/or applying any suggested changes, you acknowledge and accept all risks, and you agree that Down Dirty 84 is not liable for any direct or indirect damages, loss, injury, or legal consequences arising from use or misuse of this information."
    }
  };
}
