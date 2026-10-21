// Jump Guy data: edit this file to change the number of levels, their thresholds and the obstacle patterns.
// No logic here.
const JumpGuyData = {
  // One entry per level, easiest first. Speed grows up to the last level (the maximum).
  levels: [
    { speed: 90,  length: 1500, maxTier: 1, gapExtra: [70, 150] },
    { speed: 105, length: 1800, maxTier: 2, gapExtra: [50, 120] },
    { speed: 120, length: 2100, maxTier: 2, gapExtra: [30, 100] },
    { speed: 135, length: 2400, maxTier: 3, gapExtra: [10, 70] },
    { speed: 150, length: 2700, maxTier: 3, gapExtra: [0, 50] },
  ],

  // Endless mode: speed ramps linearly over rampDistance px up to maxSpeed. Harder pattern tiers appear at the
  // distances in tierAt (tier 2, then tier 3). The gap between patterns goes from gapExtraStart to gapExtraEnd.
  endless: {
    startSpeed: 90, maxSpeed: 150, rampDistance: 5000,
    tierAt: [1000, 3500],
    gapExtraStart: [70, 150], gapExtraEnd: [0, 50],
    metersPerPx: 0.1,          // score unit: 1 metre = 10 px
  },

  // Obstacle patterns, picked in random order. Each obstacle is [dx, w, h] relative to the pattern start.
  // tier: 1 easy, 2 medium, 3 hard. Every pattern must stay clearable with a single jump, with at least 150 ms of leeway at the speed of the levels it appears in (checked by tests.html).
  patterns: [
    { tier: 1, o: [[0, 14, 14]] },                                  // single spike
    { tier: 1, o: [[0, 14, 14], [14, 14, 14]] },                    // double spike
    { tier: 1, o: [[0, 28, 10]] },                                  // low wide block
    { tier: 1, o: [[0, 14, 18]] },                                  // small pillar
    { tier: 1, o: [[0, 14, 14], [28, 14, 14]] },                    // spike, gap, spike
    { tier: 1, o: [[0, 42, 10]] },                                  // long low block
    { tier: 1, o: [[0, 14, 12], [14, 14, 18]] },                    // small stairs up
    { tier: 1, o: [[0, 14, 18], [14, 14, 12]] },                    // small stairs down
    { tier: 2, o: [[0, 14, 24]] },                                  // tall pillar
    { tier: 2, o: [[0, 14, 14], [14, 14, 14], [28, 14, 14]] },      // triple spike
    { tier: 2, o: [[0, 14, 24], [14, 14, 24]] },                    // wide tall block
    { tier: 2, o: [[0, 14, 14], [24, 14, 24]] },                    // spike then tall
    { tier: 2, o: [[0, 14, 24], [24, 14, 14]] },                    // tall then spike
    { tier: 2, o: [[0, 14, 10], [14, 14, 16], [28, 14, 22]] },      // stairs up
    { tier: 2, o: [[0, 14, 22], [14, 14, 16], [28, 14, 10]] },      // stairs down
    { tier: 2, o: [[0, 14, 20], [30, 14, 20]] },                    // two pillars
    { tier: 3, o: [[0, 14, 28]] },                                  // very tall pillar
    { tier: 3, o: [[0, 14, 14], [22, 14, 14], [44, 14, 14]] },      // three spikes spaced
    { tier: 3, o: [[0, 14, 14], [18, 14, 26], [36, 14, 14]] },      // spike, tower, spike
    { tier: 3, o: [[0, 14, 26], [14, 14, 26], [28, 14, 14]] },      // wall then spike
    { tier: 3, o: [[0, 14, 14], [14, 14, 26], [28, 14, 26]] },      // spike then wall
    { tier: 3, o: [[0, 14, 22], [20, 14, 26], [40, 14, 22]] },      // three towers
    { tier: 3, o: [[0, 14, 16], [14, 14, 22], [28, 14, 28]] },      // tall stairs up
    { tier: 3, o: [[0, 14, 28], [14, 14, 22], [28, 14, 16]] },      // tall stairs down
  ],
};
