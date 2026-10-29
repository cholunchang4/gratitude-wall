// 由 rules/build_rules.py 從 rules/wall-constants.json 產生，請不要手動修改（改常數後重跑 build_rules.py）。
export const K = Object.freeze({
  "OWNER_EMAILS": [
    "cholun.chang@roche.com"
  ],
  "EVENTS": {
    "hw2026": {
      "start": 1792252800000,
      "end": 1793462399000,
      "target": 200
    },
    "midautumn2026": {
      "start": 1790179200000,
      "end": 1790783999999
    },
    "hw2026_epilogue": {
      "start": 1793462399001,
      "end": 1794067199999
    }
  },
  "LEVEL_STEPS": [
    [
      100,
      13
    ],
    [
      90,
      12
    ],
    [
      80,
      11
    ],
    [
      70,
      10
    ],
    [
      60,
      9
    ],
    [
      50,
      8
    ],
    [
      30,
      7
    ],
    [
      20,
      6
    ],
    [
      15,
      5
    ],
    [
      10,
      4
    ],
    [
      5,
      3
    ],
    [
      1,
      2
    ]
  ],
  "ADMIN_LEVEL": 99,
  "ADMIN_MAX_LENGTH": 2000,
  "UNLOCK_EXP": {
    "like": 1,
    "drag": 5,
    "themes_basic": 10,
    "multi_tag": 15,
    "image": 20,
    "anonymous": 30,
    "photo_badge": 50
  },
  "THEMES_FREE": [
    "theme-classic",
    "theme-sage",
    "theme-lemon"
  ],
  "THEMES_LV4": [
    "theme-midnight",
    "theme-wine",
    "theme-slate",
    "theme-lavender",
    "theme-matcha",
    "theme-terracotta",
    "theme-ice"
  ],
  "THEMES_REWARD": {
    "theme-neon": 60,
    "theme-holo": 70,
    "theme-gold": 80,
    "theme-cosmic": 90,
    "theme-ultimate": 100
  },
  "THEME_ADMIN": "theme-admin",
  "THEME_HW": "theme-halloween",
  "THEME_MOON": "theme-moonlight",
  "HW_MASKS": [
    "🎃 搗蛋南瓜",
    "🦇 迷路蝙蝠",
    "🧛 夜貓伯爵",
    "🧟 貪吃殭屍",
    "👻 搞怪幽靈",
    "🧙‍♀️ 熬夜女巫",
    "💀 骨感骷髏"
  ],
  "HW_REWARD_TIERS": [
    [
      200,
      null
    ],
    [
      150,
      60
    ],
    [
      100,
      30
    ]
  ],
  "QUOTA": {
    "daily": 10,
    "monthly": 30,
    "event_extra": 10,
    "window_days": 30
  },
  "POST_INTERVAL_MS": 3000,
  "LIMITS": {
    "text_store_max": 2000,
    "receiver_max": 500,
    "name_max": 100,
    "info_max": 200,
    "mask_max": 40,
    "photo_data_url_max": 2100000,
    "reason_max": 200,
    "pref_value_max": 40,
    "main_title_max": 60,
    "sub_title_max": 200,
    "app_version_max": 20
  },
  "PREF_KEYS": [
    "onboarding_seen",
    "hw2026_story_seen",
    "level_celebrated",
    "hw2026_reveal_seen",
    "hw2026_roster_seen",
    "lb_hidden"
  ],
  "PHOTO_PREFIXES": [
    "data:image/webp;base64,",
    "data:image/jpeg;base64,",
    "data:image/png;base64,",
    "data:image/gif;base64,"
  ]
});
