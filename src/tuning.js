export const TUNING = {
  // time
  tickSeconds: 0.25,
  refillSeconds: 8,
  tellRefreshSeconds: 6,

  // board
  boardSize: 4,
  startingCash: 500,

  // mark generation (uniform within range)
  bankroll: { low: [800, 2000], mid: [2000, 6000], high: [6000, 15000] },
  bankrollBandWeights: { low: 0.5, mid: 0.35, high: 0.15 },
  greed: [0.7, 1.4],
  threshold: [55, 90],
  thresholdBurned: [80, 100],
  leakedShare: 0.3,

  // per-second rates
  takeRate: 12,
  suspicionRate: 2.2,
  tappedOutSuspicionMult: 2,
  tellNoise: 0.15,

  // pitches: name, takeMult, suspicionMult, matchesTag
  pitches: [
    { name: 'Sure thing',  takeMult: 1.0, suspicionMult: 1.0, matchesTag: null },
    { name: 'Hot tip',     takeMult: 1.6, suspicionMult: 1.7, matchesTag: 'burned' },
    { name: 'Inside info', takeMult: 1.3, suspicionMult: 1.2, matchesTag: 'leaked' },
  ],
  tagMatchBonus: 1.5,

  // convincer
  convincerCost: 200,
  convincerBankrollMult: 1.8,
  convincerRelief: 15,

  // shills
  shillCost: 300,
  shillCostGrowth: 1.5,
  shillWage: 1.5,
  shillRelief: 1.4,

  // intel
  intelCost: { suckerList: 400, hackedFinancials: 700 },
  intelDuration: 90,
  heatPerSecondLeaked: 0.05,

  // heat
  heatCeiling: 100,
  heatPerBolt: 12,
  heatPerLeakedBolt: 20,
  heatPerLateCashout: 4,
};
