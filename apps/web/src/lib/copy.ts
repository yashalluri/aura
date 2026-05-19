export const copy = {
  hero: {
    headline: "your life assistant,\nin one text thread.",
    sub: "aura helps you keep up with your people and actually stick to your habits. no app. just text.",
  },
  howItWorks: {
    title: "how it works",
    cards: [
      {
        emoji: "💜",
        title: "relationships",
        body: "tell aura who matters to you. she'll make sure you never accidentally ghost anyone again.",
      },
      {
        emoji: "🔁",
        title: "routines",
        body: "gym, reading, journaling — whatever you're locking in. aura tracks it and keeps you honest.",
      },
      {
        emoji: "🌅",
        title: "daily check-ins",
        body: "every morning, aura texts you a personalized nudge. who to reach out to. what to get done.",
      },
    ],
  },
  chatPreview: {
    title: "it literally feels like texting your friend",
    messages: [
      { from: "aura", text: "yooo welcome to aura 💜 im basically your personal life assistant but make it text" },
      { from: "aura", text: "what should i call u btw" },
      { from: "user", text: "im kai!" },
      { from: "aura", text: "kai we're locked in 🔒 where are you based? just need ur city so i dont text u at 4am lol" },
      { from: "user", text: "LA" },
      { from: "aura", text: "cali vibes 🌴 ok who's someone you've been meaning to text back?" },
      { from: "user", text: "honestly my mom. i keep forgetting" },
      { from: "aura", text: "say less, i added her. ill remind u every few days 💜 any habits ur tryna lock in rn?" },
    ],
  },
  whoItsFor: {
    title: "built for people who care but forget",
    body: "you love your people. you have goals. you just need someone in your corner keeping you on track — without another app cluttering your phone.",
  },
  waitlist: {
    title: "get early access",
    sub: "drop your number — aura will be ready to text the second you submit.",
    buttonText: "give me access",
    successText:
      "you're in 💜 text aura at +1 (628) 264-6604 anytime to start",
    placeholder: "+1 (555) 555-1234",
  },
} as const;
