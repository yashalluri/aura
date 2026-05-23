// Lexicon of slang Aura recognizes + can produce.
//
// Built from real sources (citations on every entry). Quarterly refresh via PR.
// `generate: false` = recognize on input, never output unless user used it first.
// `cringe` is the 2026 cringe-factor scale: 0 invisible/safe → 5 instant cringe.
//
// This file is the structural fix for "ig means I guess, not Instagram"-type
// mistakes. The model is told to only use slang from this list, with the
// meaning we specify, in the registers we specify.

export type LexiconRegister = "casual" | "ironic" | "algospeak" | "gaming" | "emoji" | "stretched";
export type LexiconCohort = "gen_z" | "gen_alpha" | "millennial" | "all";

export interface LexiconEntry {
  term: string;
  variants?: string[];
  meaning: string;
  examples_correct: string[];
  examples_wrong?: string[];
  register: LexiconRegister;
  cohort: LexiconCohort[];
  cringe: 0 | 1 | 2 | 3 | 4 | 5;
  generate: boolean;
  ironic_only?: boolean;
  sources: string[];
  notes?: string;
}

// Source tags: keep short, expand in /docs later.
//   frontiers_2025 = 2025 Frontiers in Psychology punctuation study
//   wiki_2020s = Wikipedia "Glossary of 2020s slang"
//   parade_2026 = Parade's 2026 Gen Alpha slang list
//   slangwise_2026 = Slangwise Gen Z vs Gen Alpha 2026
//   aleksic = Adam Aleksic / Etymology Nerd writeups
//   spokesman_2026 = Spokesman "What the sigma" 2026
//   reddit_teen = r/teenagers consensus threads (any 2025-2026)
//   reddit_genz = r/GenZ consensus threads
//   binghamton = Binghamton period-perception study (original)

export const LEXICON: LexiconEntry[] = [
  // ── Invisible-common Gen Z markers (use freely) ─────────────────────────────
  {
    term: "fr",
    variants: ["frfr"],
    meaning: "for real — agreement or emphasis, not literal honesty",
    examples_correct: ["that was crazy fr", "fr im so tired"],
    register: "casual",
    cohort: ["gen_z", "gen_alpha"],
    cringe: 0,
    generate: true,
    sources: ["wiki_2020s", "reddit_genz"],
  },
  {
    term: "ngl",
    meaning: "not gonna lie — softens a take or admits something mildly contrarian",
    examples_correct: ["ngl the food was mid", "ngl i kinda liked it"],
    register: "casual",
    cohort: ["gen_z", "gen_alpha", "millennial"],
    cringe: 0,
    generate: true,
    sources: ["wiki_2020s"],
  },
  {
    term: "lowkey",
    meaning: "kind of / slightly — hedges a feeling",
    examples_correct: ["lowkey nervous about it", "lowkey craving tacos"],
    register: "casual",
    cohort: ["gen_z", "millennial"],
    cringe: 0,
    generate: true,
    sources: ["wiki_2020s"],
  },
  {
    term: "highkey",
    meaning: "openly / very — opposite of lowkey",
    examples_correct: ["highkey obsessed with this song"],
    register: "casual",
    cohort: ["gen_z"],
    cringe: 1,
    generate: true,
    sources: ["wiki_2020s"],
    notes: "Less common than lowkey in 2026. Use sparingly.",
  },
  {
    term: "tbh",
    meaning: "to be honest — softens a take",
    examples_correct: ["tbh i forgot", "tbh that's fair"],
    register: "casual",
    cohort: ["all"],
    cringe: 0,
    generate: true,
    sources: ["wiki_2020s"],
  },
  {
    term: "rn",
    meaning: "right now",
    examples_correct: ["im busy rn", "what u doing rn"],
    register: "casual",
    cohort: ["all"],
    cringe: 0,
    generate: true,
    sources: ["wiki_2020s"],
  },
  {
    term: "atm",
    meaning: "at the moment",
    examples_correct: ["im at work atm"],
    register: "casual",
    cohort: ["all"],
    cringe: 0,
    generate: true,
    sources: ["wiki_2020s"],
  },
  {
    term: "atp",
    meaning: "at this point — usually exasperation",
    examples_correct: ["atp im just gonna stay in", "atp who cares"],
    register: "casual",
    cohort: ["gen_z", "gen_alpha"],
    cringe: 0,
    generate: true,
    sources: ["wiki_2020s", "reddit_teen"],
  },
  {
    term: "ts",
    meaning: "this shi / this stuff — usually slight annoyance or emphasis",
    examples_correct: ["ts crazy", "i hate ts"],
    examples_wrong: ["ts (as 'too soon') — WRONG, ts is 'this shi' in Gen Z"],
    register: "casual",
    cohort: ["gen_z", "gen_alpha"],
    cringe: 1,
    generate: true,
    sources: ["aleksic", "reddit_teen"],
    notes: "Younger Gen Z / Gen Alpha specifically. Pairs often with 'pmo' (piss me off) in their usage.",
  },
  {
    term: "ig",
    meaning: "I guess — concessive, resigned agreement (NOT Instagram, ever)",
    examples_correct: ["ig that works", "ig ill just go alone"],
    examples_wrong: ["bro ig again (meaning Instagram) — WRONG, say 'insta' for Instagram"],
    register: "casual",
    cohort: ["gen_z", "gen_alpha"],
    cringe: 0,
    generate: true,
    sources: ["wiki_2020s", "reddit_teen"],
    notes: "Critical: 'ig' is NEVER Instagram in slang. Use 'insta' for that.",
  },
  {
    term: "insta",
    meaning: "Instagram",
    examples_correct: ["close insta", "u still on insta"],
    register: "casual",
    cohort: ["all"],
    cringe: 0,
    generate: true,
    sources: ["wiki_2020s"],
  },
  {
    term: "ong",
    meaning: "on God — emphasis, strong agreement",
    examples_correct: ["ong that was insane", "ong i forgot too"],
    register: "casual",
    cohort: ["gen_z", "gen_alpha"],
    cringe: 1,
    generate: true,
    sources: ["wiki_2020s"],
  },
  {
    term: "istg",
    meaning: "I swear to god — emphasis, often exasperated",
    examples_correct: ["istg if he cancels again", "istg this app"],
    register: "casual",
    cohort: ["gen_z", "millennial"],
    cringe: 0,
    generate: true,
    sources: ["wiki_2020s"],
  },
  {
    term: "deadass",
    meaning: "seriously / for real — stronger than fr",
    examples_correct: ["deadass??", "deadass thought u were joking"],
    register: "casual",
    cohort: ["gen_z"],
    cringe: 0,
    generate: true,
    sources: ["wiki_2020s", "reddit_teen"],
  },
  {
    term: "lol",
    meaning: "tone-softener / filler — does NOT mean laughter anymore",
    examples_correct: ["sorry abt that lol", "idk lol", "wym lol"],
    examples_wrong: ["i lol'd at that — WRONG, lol is a softener not a verb in 2026"],
    register: "casual",
    cohort: ["all"],
    cringe: 0,
    generate: true,
    sources: ["aleksic", "reddit_genz"],
    notes: "Has fully detached from laughter. Softens flat statements.",
  },
  {
    term: "lmao",
    meaning: "actual laughter / amusement",
    examples_correct: ["lmao", "lmao what"],
    register: "casual",
    cohort: ["all"],
    cringe: 0,
    generate: true,
    sources: ["wiki_2020s"],
  },
  {
    term: "bro",
    meaning: "friendly vocative (any gender) — not literal brother",
    examples_correct: ["bro u up?", "nahh bro"],
    register: "casual",
    cohort: ["gen_z", "gen_alpha"],
    cringe: 0,
    generate: true,
    sources: ["reddit_teen"],
  },
  {
    term: "bruh",
    meaning: "exasperation / disbelief vocative",
    examples_correct: ["bruh.", "bruh what"],
    register: "casual",
    cohort: ["all"],
    cringe: 0,
    generate: true,
    sources: ["wiki_2020s"],
  },
  {
    term: "dude",
    meaning: "vocative — slightly more millennial-leaning",
    examples_correct: ["dude same", "dude no way"],
    register: "casual",
    cohort: ["gen_z", "millennial"],
    cringe: 0,
    generate: true,
    sources: ["wiki_2020s"],
  },
  {
    term: "u",
    meaning: "you (texting shorthand)",
    examples_correct: ["u ok?", "what u doing"],
    register: "casual",
    cohort: ["all"],
    cringe: 0,
    generate: true,
    sources: ["wiki_2020s"],
  },
  {
    term: "ur",
    meaning: "your / you're (context-dependent)",
    examples_correct: ["ur joking", "ur stuff is on the table"],
    register: "casual",
    cohort: ["all"],
    cringe: 0,
    generate: true,
    sources: ["wiki_2020s"],
  },
  {
    term: "pls",
    variants: ["plz", "plspls"],
    meaning: "please — usually pleading or mock-pleading",
    examples_correct: ["pls", "stoppp pls"],
    register: "casual",
    cohort: ["all"],
    cringe: 0,
    generate: true,
    sources: ["wiki_2020s"],
  },
  {
    term: "btw",
    meaning: "by the way",
    examples_correct: ["btw u left ur charger here"],
    register: "casual",
    cohort: ["all"],
    cringe: 0,
    generate: true,
    sources: ["wiki_2020s"],
  },
  {
    term: "wym",
    meaning: "what you mean — request for clarification",
    examples_correct: ["wym lol", "wym he said no"],
    register: "casual",
    cohort: ["gen_z"],
    cringe: 0,
    generate: true,
    sources: ["wiki_2020s"],
  },
  {
    term: "idk",
    meaning: "I don't know",
    examples_correct: ["idk man", "idk lol"],
    register: "casual",
    cohort: ["all"],
    cringe: 0,
    generate: true,
    sources: ["wiki_2020s"],
  },
  {
    term: "imo",
    variants: ["imho"],
    meaning: "in my opinion",
    examples_correct: ["imo it was fine"],
    register: "casual",
    cohort: ["all"],
    cringe: 0,
    generate: true,
    sources: ["wiki_2020s"],
  },
  {
    term: "tho",
    meaning: "though (texting shorthand)",
    examples_correct: ["that was fire tho", "im hungry tho"],
    register: "casual",
    cohort: ["all"],
    cringe: 0,
    generate: true,
    sources: ["wiki_2020s"],
  },
  {
    term: "fwiw",
    meaning: "for what it's worth",
    examples_correct: ["fwiw i thought u did great"],
    register: "casual",
    cohort: ["millennial", "gen_z"],
    cringe: 0,
    generate: true,
    sources: ["wiki_2020s"],
  },
  {
    term: "iirc",
    meaning: "if I remember correctly",
    examples_correct: ["iirc u said tuesday"],
    register: "casual",
    cohort: ["millennial", "gen_z"],
    cringe: 0,
    generate: true,
    sources: ["wiki_2020s"],
  },
  {
    term: "afaik",
    meaning: "as far as I know",
    examples_correct: ["afaik it's still on"],
    register: "casual",
    cohort: ["millennial"],
    cringe: 1,
    generate: true,
    sources: ["wiki_2020s"],
  },

  // ── Reaction openers (very common, near-invisible) ─────────────────────────
  {
    term: "wait",
    meaning: "reaction opener — signals processing, mild surprise",
    examples_correct: ["wait u actually went?", "wait what"],
    register: "casual",
    cohort: ["all"],
    cringe: 0,
    generate: true,
    sources: ["reddit_teen"],
  },
  {
    term: "nahh",
    variants: ["nah", "nahhh"],
    meaning: "disagreement or disbelief opener",
    examples_correct: ["nahh thats wild", "nah u didnt"],
    register: "casual",
    cohort: ["all"],
    cringe: 0,
    generate: true,
    sources: ["reddit_teen"],
  },
  {
    term: "stop",
    meaning: "playful disbelief / 'no way'",
    examples_correct: ["stop omg", "stop ur lying"],
    register: "casual",
    cohort: ["gen_z", "gen_alpha"],
    cringe: 0,
    generate: true,
    sources: ["reddit_genz"],
  },
  {
    term: "be fr",
    meaning: "'be for real' — incredulity",
    examples_correct: ["be fr rn", "be fr that's not happening"],
    register: "casual",
    cohort: ["gen_z"],
    cringe: 0,
    generate: true,
    sources: ["reddit_teen"],
  },
  {
    term: "ok so",
    meaning: "narrative opener — 'let me tell you what happened'",
    examples_correct: ["ok so. so basically...", "ok so hear me out"],
    register: "casual",
    cohort: ["all"],
    cringe: 0,
    generate: true,
    sources: ["reddit_genz"],
  },
  {
    term: "no way",
    meaning: "disbelief reaction",
    examples_correct: ["no way", "no waayyy"],
    register: "casual",
    cohort: ["all"],
    cringe: 0,
    generate: true,
    sources: ["wiki_2020s"],
  },
  {
    term: "respect",
    meaning: "acknowledgment of something earned",
    examples_correct: ["ok respect", "deadass respect"],
    register: "casual",
    cohort: ["gen_z"],
    cringe: 0,
    generate: true,
    sources: ["reddit_teen"],
  },

  // ── Word stretches (tone via spelling) ─────────────────────────────────────
  {
    term: "noooo",
    variants: ["nooo", "nooooo"],
    meaning: "stretched 'no' — mock dismay",
    examples_correct: ["noooo", "noooo u didnt"],
    register: "stretched",
    cohort: ["all"],
    cringe: 0,
    generate: true,
    sources: ["reddit_genz"],
  },
  {
    term: "stoppp",
    variants: ["stoppppp"],
    meaning: "stretched 'stop' — playful disbelief",
    examples_correct: ["stoppp", "stopppp omg"],
    register: "stretched",
    cohort: ["gen_z"],
    cringe: 0,
    generate: true,
    sources: ["reddit_genz"],
  },
  {
    term: "yessss",
    variants: ["yesss", "yesssss"],
    meaning: "stretched 'yes' — hype",
    examples_correct: ["yessss", "yessss lets gooo"],
    register: "stretched",
    cohort: ["all"],
    cringe: 0,
    generate: true,
    sources: ["reddit_genz"],
  },
  {
    term: "sameee",
    variants: ["samee"],
    meaning: "agreement, drawn out",
    examples_correct: ["sameee", "sameee dude"],
    register: "stretched",
    cohort: ["all"],
    cringe: 0,
    generate: true,
    sources: ["reddit_genz"],
  },
  {
    term: "pleaseee",
    variants: ["pleasee"],
    meaning: "stretched 'please' — mock-pleading",
    examples_correct: ["pleaseee no"],
    register: "stretched",
    cohort: ["all"],
    cringe: 0,
    generate: true,
    sources: ["reddit_genz"],
  },

  // ── Algospeak (TikTok content-filter terms that bled into texting) ─────────
  {
    term: "unalive",
    meaning: "kill / die — algospeak euphemism",
    examples_correct: ["this homework is gonna unalive me"],
    register: "algospeak",
    cohort: ["gen_z", "gen_alpha"],
    cringe: 1,
    generate: false,
    sources: ["aleksic", "reddit_teen"],
    notes: "Only use if user uses first. NEVER generate in mental-health contexts.",
  },
  {
    term: "seggs",
    meaning: "sex — algospeak euphemism",
    examples_correct: ["lol seggs ed class"],
    register: "algospeak",
    cohort: ["gen_z"],
    cringe: 2,
    generate: false,
    sources: ["aleksic"],
    notes: "Only mirror if user uses it. Recognize, don't initiate.",
  },
  {
    term: "le dollar bean",
    meaning: "lesbian — algospeak (📐💲🫘 visual rebus)",
    examples_correct: ["i'm le dollar bean lol"],
    register: "algospeak",
    cohort: ["gen_z"],
    cringe: 2,
    generate: false,
    sources: ["aleksic"],
    notes: "User-led only.",
  },

  // ── Cringe leaderboard 2026 — RECOGNIZE, DO NOT GENERATE ────────────────────
  {
    term: "skibidi",
    meaning: "originally from Skibidi Toilet meme; now used by Gen Alpha as filler/intensifier",
    examples_correct: ["that's so skibidi (Gen Alpha sincere)"],
    examples_wrong: ["Aura should NEVER say skibidi unless mocking it. Top of 2026 cringe leaderboard."],
    register: "casual",
    cohort: ["gen_alpha"],
    cringe: 5,
    generate: false,
    sources: ["parade_2026", "slangwise_2026", "spokesman_2026"],
    notes: "2026 cringe leaderboard: 38% negative reactions. Don't output.",
  },
  {
    term: "sigma",
    meaning: "ironic / sincere depending on cohort — masculine cool-loner archetype",
    examples_correct: ["he's the sigma of our group (irony)"],
    examples_wrong: ["sigma grindset (NEVER) — instant cringe in any context"],
    register: "ironic",
    cohort: ["gen_alpha"],
    cringe: 5,
    generate: false,
    sources: ["parade_2026", "spokesman_2026"],
    notes: "2026 cringe leaderboard: 32%. Recognize, never output.",
  },
  {
    term: "6-7",
    variants: ["six seven"],
    meaning: "Gen Alpha filler from a meme; means roughly nothing, used as joke",
    examples_correct: ["6-7 (random Gen Alpha)"],
    register: "casual",
    cohort: ["gen_alpha"],
    cringe: 5,
    generate: false,
    sources: ["spokesman_2026"],
    notes: "2026 #1 cringe term (40%). Pure brainrot. Never output.",
  },
  {
    term: "slay",
    meaning: "praise — was big 2020-2022, now reads performative",
    examples_correct: ["slay (sincere, only if user used it)"],
    register: "casual",
    cohort: ["gen_z", "millennial"],
    cringe: 4,
    generate: false,
    sources: ["aleksic", "reddit_genz"],
    notes: "Avoid. Reads like a marketer wrote it.",
  },
  {
    term: "bestie",
    meaning: "friend — vocative, but reads cringe when used by a bot",
    examples_correct: ["my bestie (sincere reference to a person)"],
    examples_wrong: ["yo bestie 🙏 — WRONG, bestie-as-vocative reads instantly fake"],
    register: "casual",
    cohort: ["gen_z"],
    cringe: 4,
    generate: false,
    sources: ["reddit_genz", "aleksic"],
    notes: "Never use as a vocative. OK as a noun referring to user's friend if they used it first.",
  },
  {
    term: "no cap",
    meaning: "no lie / not exaggerating — specifically for contradicting expectation",
    examples_correct: ["no cap that was the best meal of my life", "no cap, im in"],
    examples_wrong: ["ur amazing no cap — WRONG, no cap is for contradicting expectation not generic validation"],
    register: "casual",
    cohort: ["gen_z"],
    cringe: 3,
    generate: false,
    sources: ["reddit_genz", "wiki_2020s"],
    notes: "Mirror only. Generic validation use is a tell.",
  },
  {
    term: "bet",
    meaning: "agreement / 'sounds good'",
    examples_correct: ["bet"],
    examples_wrong: ["alright bet talk later — WRONG as a generic signoff"],
    register: "casual",
    cohort: ["gen_z"],
    cringe: 2,
    generate: false,
    sources: ["reddit_genz"],
    notes: "Mirror only. Don't use as a signoff or hype response.",
  },
  {
    term: "cheugy",
    meaning: "uncool / outdated, originally aimed at millennial aesthetics",
    examples_correct: ["lol cheugy"],
    register: "casual",
    cohort: ["gen_z"],
    cringe: 4,
    generate: false,
    sources: ["wiki_2020s"],
    notes: "Cheugy is itself now cheugy. Recognize, never output.",
  },
  {
    term: "periodt",
    variants: ["period."],
    meaning: "emphasis — was viral 2020-21, now reads dated",
    examples_correct: ["periodt (only mirror)"],
    register: "casual",
    cohort: ["gen_z", "millennial"],
    cringe: 3,
    generate: false,
    sources: ["wiki_2020s"],
  },
  {
    term: "vibe check",
    meaning: "checking someone's energy — millennial-coded now",
    examples_correct: ["vibe check (only mirror)"],
    register: "casual",
    cohort: ["millennial"],
    cringe: 3,
    generate: false,
    sources: ["wiki_2020s"],
  },

  // ── Gen Alpha specific (recognize for context, mostly avoid generating) ────
  {
    term: "rizz",
    meaning: "charm / charisma, especially in dating",
    examples_correct: ["he's got rizz (sincere)", "lost all my rizz lol"],
    register: "casual",
    cohort: ["gen_z", "gen_alpha"],
    cringe: 3,
    generate: false,
    sources: ["parade_2026", "slangwise_2026"],
    notes: "Streamer-coined (Kai Cenat). Mirror only. Don't initiate.",
  },
  {
    term: "gyatt",
    meaning: "exclamation about a body — NSFW-adjacent origin",
    examples_correct: ["(user-only)"],
    register: "casual",
    cohort: ["gen_alpha"],
    cringe: 4,
    generate: false,
    sources: ["parade_2026", "aleksic"],
    notes: "NSFW-origin. Recognize on input only. Never output regardless of context.",
  },
  {
    term: "fanum tax",
    meaning: "taking food from a friend (Fanum/Cenat meme)",
    examples_correct: ["fanum tax (only mirror)"],
    register: "casual",
    cohort: ["gen_alpha"],
    cringe: 4,
    generate: false,
    sources: ["parade_2026"],
  },
  {
    term: "mewing",
    meaning: "jawline exercise meme — NSFW-origin community",
    examples_correct: ["(user-only)"],
    register: "casual",
    cohort: ["gen_alpha"],
    cringe: 4,
    generate: false,
    sources: ["aleksic"],
    notes: "Looksmaxxing-adjacent. Don't initiate. Body-image guard.",
  },
  {
    term: "looksmaxxing",
    meaning: "optimizing appearance — incel-adjacent origins",
    examples_correct: ["(user-only)"],
    register: "casual",
    cohort: ["gen_alpha"],
    cringe: 4,
    generate: false,
    sources: ["aleksic"],
    notes: "Body-image guard. Don't initiate.",
  },
  {
    term: "ohio",
    meaning: "weird / unhinged (meme usage)",
    examples_correct: ["that's so ohio (Gen Alpha)"],
    register: "ironic",
    cohort: ["gen_alpha"],
    cringe: 4,
    generate: false,
    sources: ["parade_2026"],
  },
  {
    term: "mid",
    meaning: "mediocre / bad",
    examples_correct: ["the food was mid"],
    register: "casual",
    cohort: ["gen_z", "gen_alpha"],
    cringe: 1,
    generate: true,
    sources: ["wiki_2020s"],
  },
  {
    term: "npc",
    meaning: "non-player character — someone acting robotic / unaware",
    examples_correct: ["my coworker is such an npc (mocking)"],
    register: "gaming",
    cohort: ["gen_z", "gen_alpha"],
    cringe: 2,
    generate: false,
    sources: ["parade_2026"],
    notes: "Mirror only.",
  },
  {
    term: "aura points",
    meaning: "social capital / vibe credit (Gen Alpha)",
    examples_correct: ["lost 100 aura points (joking)"],
    register: "ironic",
    cohort: ["gen_alpha"],
    cringe: 3,
    generate: false,
    sources: ["parade_2026", "spokesman_2026"],
    notes: "The product's name overlap is awkward. Avoid using.",
  },

  // ── Gaming-derived (often used in non-gaming contexts) ─────────────────────
  {
    term: "clutch",
    meaning: "high-pressure save / last-minute win",
    examples_correct: ["that was clutch", "u clutched it"],
    register: "gaming",
    cohort: ["gen_z", "millennial"],
    cringe: 0,
    generate: true,
    sources: ["wiki_2020s"],
  },
  {
    term: "diff",
    meaning: "skill gap — 'X-diff' = X was the difference",
    examples_correct: ["skill diff", "vibe diff"],
    register: "gaming",
    cohort: ["gen_z"],
    cringe: 1,
    generate: true,
    sources: ["reddit_teen"],
  },
  {
    term: "ratio",
    meaning: "twitter callout where replies > likes — humiliation",
    examples_correct: ["ratio'd", "L + ratio (joking)"],
    register: "gaming",
    cohort: ["gen_z"],
    cringe: 2,
    generate: false,
    sources: ["wiki_2020s"],
    notes: "Twitter-specific. Mirror only.",
  },
  {
    term: "L",
    meaning: "loss / bad outcome",
    examples_correct: ["that's an L", "took an L on that one"],
    register: "gaming",
    cohort: ["gen_z"],
    cringe: 0,
    generate: true,
    sources: ["wiki_2020s"],
  },
  {
    term: "W",
    meaning: "win / good outcome",
    examples_correct: ["W move", "W weekend"],
    register: "gaming",
    cohort: ["gen_z"],
    cringe: 0,
    generate: true,
    sources: ["wiki_2020s"],
  },

  // ── Emoji ──────────────────────────────────────────────────────────────────
  {
    term: "💀",
    meaning: "laughing (dead from laughter) — the core 2026 laugh emoji",
    examples_correct: ["wait 💀", "bro 💀"],
    register: "emoji",
    cohort: ["gen_z", "gen_alpha"],
    cringe: 0,
    generate: true,
    sources: ["aleksic", "reddit_teen"],
  },
  {
    term: "😭",
    meaning: "laughing (crying from laughter) — equally core",
    examples_correct: ["😭", "stop 😭"],
    register: "emoji",
    cohort: ["all"],
    cringe: 0,
    generate: true,
    sources: ["aleksic"],
  },
  {
    term: "✋😭",
    meaning: "'I can't' — common combo",
    examples_correct: ["✋😭"],
    register: "emoji",
    cohort: ["gen_z"],
    cringe: 0,
    generate: true,
    sources: ["reddit_genz"],
  },
  {
    term: "😂",
    meaning: "face with tears of joy — parent-coded in 2026",
    examples_correct: ["(user-only — never generate)"],
    examples_wrong: ["lmao 😂 — WRONG, 😂 is the single biggest tell of an older writer"],
    register: "emoji",
    cohort: ["millennial"],
    cringe: 5,
    generate: false,
    sources: ["aleksic", "reddit_genz"],
    notes: "Use 💀 or 😭 instead. 😂 is the #1 'older writer' signal.",
  },
  {
    term: "🙏",
    meaning: "begging — overused as a softener",
    examples_correct: ["pls 🙏 (actually begging)"],
    examples_wrong: ["take care 🙏 — WRONG, reads performative"],
    register: "emoji",
    cohort: ["millennial", "gen_z"],
    cringe: 2,
    generate: true,
    ironic_only: false,
    sources: ["reddit_genz"],
    notes: "Use sparingly and only for actual begging. Don't bracket sentences with it.",
  },
  {
    term: "💜",
    meaning: "love / care emoji (less overused than ❤️)",
    examples_correct: ["love u 💜"],
    register: "emoji",
    cohort: ["all"],
    cringe: 1,
    generate: true,
    sources: ["reddit_genz"],
  },
  {
    term: "✨",
    meaning: "sparkle — emphasis / sass",
    examples_correct: ["doing the ✨ thing ✨"],
    register: "emoji",
    cohort: ["gen_z", "millennial"],
    cringe: 1,
    generate: true,
    sources: ["wiki_2020s"],
    notes: "Lightly overused but still works.",
  },
  {
    term: "🔥",
    meaning: "fire / good",
    examples_correct: ["this song 🔥"],
    register: "emoji",
    cohort: ["all"],
    cringe: 0,
    generate: true,
    sources: ["wiki_2020s"],
  },

  // ── Period-as-anger anti-pattern (encoded as a "term" for prompt clarity) ──
  {
    term: "period_on_fragment",
    meaning: "ANTI-PATTERN: ending a single-word reply with a period reads as anger",
    examples_correct: ["yup", "ok", "fine"],
    examples_wrong: ["yup. — WRONG, reads as 34% less friendly", "ok. — WRONG, reads cold"],
    register: "casual",
    cohort: ["all"],
    cringe: 5,
    generate: false,
    sources: ["binghamton", "frontiers_2025"],
    notes: "2025 Frontiers in Psychology study: ~34% friendliness drop on fragment-with-period.",
  },
];

// ── Index helpers ──────────────────────────────────────────────────────────

const TERM_INDEX = new Map<string, LexiconEntry>();
for (const e of LEXICON) {
  TERM_INDEX.set(e.term.toLowerCase(), e);
  for (const v of e.variants ?? []) {
    TERM_INDEX.set(v.toLowerCase(), e);
  }
}

export function lookup(term: string): LexiconEntry | undefined {
  return TERM_INDEX.get(term.toLowerCase());
}

/**
 * Tokenize text into candidate slang terms (lower, strip punctuation except apostrophes).
 */
function tokenize(text: string): string[] {
  // Match emoji as standalone tokens too.
  const emojiRegex = /\p{Extended_Pictographic}(?:‍\p{Extended_Pictographic})*/gu;
  const emojis = text.match(emojiRegex) ?? [];
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9'\- ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  return [...words, ...emojis];
}

/**
 * Find every lexicon entry that appears in `text`. Used to:
 *   1. Inject only the relevant entries into the prompt (saves tokens).
 *   2. Compute a style profile (which markers the user uses).
 */
export function findInText(text: string): LexiconEntry[] {
  const tokens = tokenize(text);
  // also try 2-grams for multi-word entries ("no cap", "be fr", etc.)
  const bigrams: string[] = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    bigrams.push(`${tokens[i]} ${tokens[i + 1]}`);
  }
  const found = new Set<LexiconEntry>();
  for (const t of [...tokens, ...bigrams]) {
    const e = lookup(t);
    if (e) found.add(e);
  }
  return [...found];
}

/**
 * Core entries that always appear in the prompt regardless of intersection.
 * Tight curation — these are the ones we want the model to default to.
 */
export const ACTIVE_CORE_TERMS = [
  "fr",
  "ngl",
  "lowkey",
  "tbh",
  "rn",
  "atp",
  "lol",
  "lmao",
  "bro",
  "bruh",
  "deadass",
  "ig",
  "insta",
  "wait",
  "nahh",
  "stop",
  "no way",
  "respect",
  "💀",
  "😭",
  "😂",
];

export function getActiveCore(): LexiconEntry[] {
  return ACTIVE_CORE_TERMS.map((t) => lookup(t)).filter((x): x is LexiconEntry => !!x);
}

/**
 * Format a list of entries into a compact prompt-ready block.
 * One line per term. Short, scan-able.
 */
export function formatLexicon(entries: LexiconEntry[]): string {
  if (!entries.length) return "";
  const lines = entries.map((e) => {
    const gen = e.generate ? "USE" : "RECOGNIZE-ONLY";
    const wrongs = e.examples_wrong?.length
      ? ` ⚠️ ${e.examples_wrong.join(" | ")}`
      : "";
    return `- ${e.term} [${gen}]: ${e.meaning}. ex: ${e.examples_correct.slice(0, 2).join(" | ")}${wrongs}`;
  });
  return `## Slang lexicon (the only slang you may produce)\n${lines.join("\n")}`;
}
