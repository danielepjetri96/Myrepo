// Pixel-art sprites defined as text grids. Each character is a palette color,
// '.' is transparent. They are rendered once into small offscreen canvases
// (plus an all-white copy used for the hit flash).
const PALETTE = {
  k: '#1a1c2c', // outline
  p: '#5d275d', r: '#b13e53', o: '#ef7d57', y: '#ffcd75',
  l: '#a7f070', g: '#38b764', G: '#257179',
  n: '#29366f', h: '#3b5dc9', c: '#41a6f6', C: '#73eff7',
  w: '#f4f4f4', e: '#94b0c2', d: '#566c86', x: '#333c57',
  s: '#f4b483', b: '#73464c',
};

function makeSprite(rows) {
  const h = rows.length;
  const w = Math.max(...rows.map(r => r.length));
  const img = document.createElement('canvas');
  const white = document.createElement('canvas');
  img.width = white.width = w;
  img.height = white.height = h;
  const g = img.getContext('2d'), wg = white.getContext('2d');
  wg.fillStyle = '#ffffff';
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      const ch = rows[y][x];
      if (ch === '.' || ch === ' ' || !PALETTE[ch]) continue;
      g.fillStyle = PALETTE[ch];
      g.fillRect(x, y, 1, 1);
      wg.fillRect(x, y, 1, 1);
    }
  }
  return { img, white, w, h };
}

// Draw a sprite centered on (x, y), snapped to whole pixels.
function drawSprite(ctx, spr, x, y, { flip = false, white = false } = {}) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(white ? spr.white : spr.img, -Math.floor(spr.w / 2), -Math.floor(spr.h / 2));
  ctx.restore();
}

function drawText(ctx, str, x, y, { size = 8, color = '#f4f4f4', align = 'center', shadow = '#1a1c2c' } = {}) {
  ctx.font = `${size}px "Press Start 2P", monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  if (shadow) {
    const o = size >= 16 ? 2 : 1;
    ctx.fillStyle = shadow;
    ctx.fillText(str, x + o, y + o);
  }
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

// ---------- Player (faces right; flipped when aiming left) ----------
const P_TOP = [
  '....kkkkkk......',
  '...khhhhhhk.....',
  '..khhhhchhhk....',
  '..khhhhhhhhhk...',
  '..khhhkkkkkkkk..',
  '..kksssssksk....',
  '...ksssssssk....',
  '....kkksskk.....',
  '...kgggGgggk....',
  '..kgggggGgggk...',
  '..kgggggGgggk...',
  '...kkGkkkkGk....',
];
const P_LEGS = {
  stand: [
    '....kGGkGGk.....',
    '....kGGkGGk.....',
    '....kbbkbbk.....',
    '....kkk.kkk.....',
  ],
  stepA: [
    '....kGGkggk.....',
    '...kGGk.kggk....',
    '..kbbk...kbbk...',
    '..kkk.....kkk...',
  ],
  stepB: [
    '....kggkGGk.....',
    '...kggk.kGGk....',
    '..kbbk...kbbk...',
    '..kkk.....kkk...',
  ],
};

// Gun points right. The hand ('s') is the pivot at (1, 3); the muzzle is at (11, 1).
const GUN = [
  '..kkkkkkkkk.',
  '.kddddddddek',
  'kkdkkkkkkkk.',
  'kssk........',
  '.kk.........',
];
const GUN_PIVOT = { x: 1, y: 3 };
const GUN_TIP = { x: 11, y: -2 }; // relative to pivot

const FLASH = [
  '..y..',
  '.ywy.',
  'ywwwy',
  '.ywy.',
  '..y..',
];

// ---------- Enemies ----------
const SLIME = [
  [
    '............',
    '....kkkk....',
    '..kkllllkk..',
    '.kllwwllllk.',
    '.klwllllllk.',
    'kllllkllkllk',
    'kllllkllkllk',
    'kgllllllllgk',
    'kggggggggggk',
    '.kkkkkkkkkk.',
  ],
  [
    '............',
    '............',
    '............',
    '...kkkkkk...',
    '.kkllwwlllkk',
    'kllwlllllllk',
    'kllllkllkllk',
    'kgllllllllgk',
    'kggggggggggk',
    '.kkkkkkkkkk.',
  ],
];

const BAT = [
  [
    'k..........k',
    'kk........kk',
    'krk.kkkk.krk',
    'krrkrrrrkrrk',
    '.krrrrrrrrk.',
    '..kryrryrk..',
    '..krrrrrrk..',
    '...kwkkwk...',
    '....kkkk....',
    '............',
  ],
  [
    '............',
    '............',
    '....kkkk....',
    '..kkrrrrkk..',
    '.krrrrrrrrk.',
    'krrkyrrykrrk',
    'krk.krrk.krk',
    'kk..kwwk..kk',
    'k....kk....k',
    '............',
  ],
];

const BRUTE_TOP = [
  '....kkkkkkk.....',
  '...kpppppppk....',
  '..kpppppppppk...',
  '..kpyykpyykpk...',
  '..kpppppppppk...',
  '..kppwkwkwppk...',
  '...kpppppppk....',
  '.kkkkpppppkkkk..',
  'kppppkpppkppppk.',
  'kppppkpppkppppk.',
  'kppkkpppppkkppk.',
  '.kk.kpppppk.kk..',
];
const BRUTE = [
  BRUTE_TOP.concat([
    '....kppkppk.....',
    '....kppkppk.....',
    '...kkkk.kkkk....',
  ]),
  BRUTE_TOP.concat([
    '....kppkppk.....',
    '...kppk.kppk....',
    '...kkk...kkk....',
  ]),
];

const ROBOT_TOP = [
  '.....kk.....',
  '....kyk.....',
  '...kkkkkk...',
  '..keeeeeek..',
  '..kekkkkek..',
  '..kekrrkek..',
  '..keeeeeek..',
  '.kkkddddkkk.',
  'kekdddddkek.',
  'kekdccddkek.',
  'kk.kddddk.kk',
];
const ROBOT = [
  ROBOT_TOP.concat(['...kdkkdk...', '...kk..kk...']),
  ROBOT_TOP.concat(['..kdk..kdk..', '..kk....kk..']),
];

// ---------- Pickups / HUD ----------
const HEART = [
  '.kk.kk.',
  'krrkrrk',
  'krwrrrk',
  'krrrrrk',
  '.krrrk.',
  '..krk..',
  '...k...',
];
const BOLT = [
  '...kkk',
  '..kyyk',
  '.kyyk.',
  'kyyyyk',
  'kkyyk.',
  '.kyk..',
  '.kk...',
  'k.....',
];

const SPR = {
  playerIdle: makeSprite(P_TOP.concat(P_LEGS.stand)),
  playerWalk: [P_LEGS.stepA, P_LEGS.stand, P_LEGS.stepB, P_LEGS.stand].map(l => makeSprite(P_TOP.concat(l))),
  gun: makeSprite(GUN),
  flash: makeSprite(FLASH),
  slime: SLIME.map(makeSprite),
  bat: BAT.map(makeSprite),
  brute: BRUTE.map(makeSprite),
  robot: ROBOT.map(makeSprite),
  heart: makeSprite(HEART),
  heartEmpty: makeSprite(HEART.map(r => r.replace(/[rw]/g, 'x'))),
  bolt: makeSprite(BOLT),
};
