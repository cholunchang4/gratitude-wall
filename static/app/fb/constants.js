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
    },
    "k1000": {
      "start": 1793635200000,
      "end": 1794239999999
    },
    "k1000_theme": {
      "start": 1793635200000,
      "end": 1798732799999
    },
    "sky2026": {
      "start": 1794240000000,
      "act2": 1794844800000,
      "act3": 1795449600000,
      "end": 1796054399999,
      "epilogue_end": 1796659199999,
      "twinkle_end": 1798732799999,
      "tiers": [
        25,
        50,
        85
      ],
      "per_author_cap": 10,
      "theme": "theme-starnight",
      "theme_tier": 2
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
  "THEME_ADMIN_NEON": "theme-admin-neon",
  "THEME_HW": "theme-halloween",
  "THEME_MOON": "theme-moonlight",
  "THEME_K1000": "theme-k1000",
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
    "_note": "T107（卓倫 2026-11-09：英文以單字計）：留言與資料卡的上限是「字」（中日韓每字 1、英文或數字每個單字 1、emoji 1、空白標點不算），由前台 fb/logic.js countWords 檢查；Firebase 規則數不了單字，所以規則只檢查字元數（JavaScript .length）≤ 上限 × char_factor 的寬鬆安全網（20→160、50→400、200→1600、1000→8000、管理員 2000→16000；資料卡 50→400、40→320）。取捨：改過前台、直接寫資料庫的人最多可以寫到 ×8 的字元數（例如 Lv.1 寫 160 個中文字），只影響自己的卡；text_store_max＝管理員上限 × char_factor（含 trash 的 x）。",
    "char_factor": 8,
    "text_store_max": 16000,
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
    "lb_hidden",
    "pc_pool"
  ],
  "PHOTO_PREFIXES": [
    "data:image/webp;base64,",
    "data:image/jpeg;base64,",
    "data:image/png;base64,",
    "data:image/gif;base64,"
  ],
  "PROFILE": {
    "fields": [
      "care",
      "proud",
      "motiv",
      "power",
      "contrib",
      "learn",
      "stress"
    ],
    "work_fields": [
      "ok",
      "no"
    ],
    "field_max": 50,
    "work_max": 40,
    "avatar_prefix": "data:image/jpeg;base64,",
    "avatar_small_px": 64,
    "avatar_large_px": 192,
    "avatar_small_max": 16000,
    "avatar_large_max": 60000
  },
  "BANK": {
    "currency_key": "lp",
    "start": 1796054400000,
    "start_profile": 1794240000000,
    "first_card_for_all": false,
    "wallet_cap": 2000,
    "amounts": {
      "write": 5,
      "daily": 5,
      "new": 10,
      "reunion": 5,
      "first": 20,
      "rcv": 3,
      "pcw": 5,
      "pcr": 5,
      "open": 50,
      "k1000": 30,
      "retro_per_card": 5,
      "pc_cell": 5,
      "pc_done": 25
    },
    "limits": {
      "min_chars": 15,
      "star_min_chars": 10,
      "same_target_window_days": 30,
      "same_target_max": 2,
      "reunion_days": 90,
      "new_reunion_per_week": 5,
      "rcv_per_week": 5,
      "star_per_month": 10,
      "retro_max": 50,
      "dup_history": 5,
      "pc_min_chars": 6,
      "pc_done_cells": 5,
      "admin_amount_max": 1000,
      "admin_batch_max": 50,
      "admin_note_max": 60,
      "admin_ledger_max": 500
    },
    "pc_reward_fields": [
      "care",
      "proud",
      "motiv",
      "power",
      "contrib",
      "learn",
      "work"
    ],
    "events": {
      "ev26": {
        "start": 1794240000000,
        "end": 1796054399999,
        "cap": 150,
        "day_cap": 70,
        "acts": {
          "1": 1794240000000,
          "2": 1794844800000,
          "3": 1795449600000
        },
        "epilogue_end": "2026-12-07T23:59:59.999+08:00",
        "twinkle_end": "2026-12-31T23:59:59.999+08:00",
        "codes": {
          "pick": {
            "a": 15,
            "check": "lantern",
            "open": 1794240000000
          },
          "link": {
            "a": 15,
            "check": "star",
            "src": [
              "pc",
              "pc0"
            ],
            "open": 1794844800000
          },
          "lab": {
            "a": 15,
            "check": "card",
            "src": [
              "pc"
            ],
            "open": 1795449600000
          },
          "all3": {
            "a": 25,
            "check": "all",
            "need": [
              "pick",
              "link",
              "lab"
            ],
            "open": 1795449600000
          },
          "t1": {
            "a": 10,
            "check": "tier",
            "n": 1,
            "open": 1796054400000,
            "claim_end": 1801411199999,
            "no_day_cap": true
          },
          "t2": {
            "a": 15,
            "check": "tier",
            "n": 2,
            "open": 1796054400000,
            "claim_end": 1801411199999,
            "no_day_cap": true
          },
          "t3": {
            "a": 25,
            "check": "tier",
            "n": 3,
            "open": 1796054400000,
            "claim_end": 1801411199999,
            "no_day_cap": true
          }
        },
        "stars": {
          "tiers": [
            25,
            50,
            85
          ],
          "per_author": 10,
          "src": [
            "pc",
            "pc0"
          ],
          "theme": "theme-starnight",
          "theme_tier": 2
        },
        "pool": {
          "themes": [
            "care",
            "proud",
            "motiv",
            "power",
            "contrib",
            "work"
          ],
          "size": 6,
          "min": 3,
          "per_day": 200
        }
      }
    },
    "labels": {
      "currency": "光點",
      "wallet": "光瓶",
      "shop": "拾光小舖",
      "reasons": {
        "write": "寫了一張感謝卡",
        "daily": "今天的第一張",
        "new": "第一次寫給這位同事",
        "reunion": "好久不見，又寫給他了",
        "first": "你的第一張感謝卡",
        "rcv": "收到一張感謝卡",
        "pcw": "你從說明書寫了一張星光卡",
        "pcr": "有人讀了你的說明書，送來一點光",
        "open": "小螢的見面禮",
        "k1000": "千光禮：一千道光的紀念",
        "retro": "小螢找到你以前寫的卡",
        "pc_cell": "你的說明書多了一頁光",
        "pc_done": "說明書裝訂完成",
        "ev": "活動的光點",
        "ev26.pick": "天燈座亮了",
        "ev26.link": "連星座亮了",
        "ev26.lab": "實驗座亮了",
        "ev26.all3": "你的星座完成了",
        "ev26.t1": "全公司點亮「初星」",
        "ev26.t2": "全公司點亮「繁星」",
        "ev26.t3": "全公司點亮「銀河傳說」",
        "admin": "補發的光點",
        "buy": "換了東西",
        "x_del": "這張卡的光收回了",
        "x_adm": "這筆光點收回了"
      }
    }
  }
});
