
/**
 * Central configuration for the romantic proposal site.
 */

window.PROPOSAL_CONFIG = {
  // Letter page
  letters: {
    delayBetweenMessages: 1500,
    typeSpeed: 38,
    opening: "For you, with all my heart…",

    messages: [
      "Are you ready for it, or are you still not ready? ❤️"
    ],

    closing: ""
  },

  // Happy page — voice-controlled stages
  happy: {
    particleCount: 220,
    minParticles: 80,

    baseThreshold: 0.30,
    shoutHoldMs: 480,
    shoutCooldownMs: 1100,

    shoutsPerStage: [1, 1, 2, 2, 3],

    stageMessages: [
      "A little spark just lit… 💛",
      "You’re making my heart race 💗",
      "I can feel the magic growing ✨",
      "Almost there — one more push 💫",
      "My heart is yours forever ❤️"
    ],

    revealMessage: "My heart just exploded for you ✨",

    recording: {
      maxDurationSeconds: 240,
      maxBytes: 4194304,
      audioBitsPerSecond: 32000
    }
  },

  // Final proposal
  final: {
    question: "Will you be my forever person? ❤️",
    yesMessage: "You just made my world brighter. ❤️",
    noMessage: "Thank you for being honest. ❤️",
    noClosing: "Whatever you decide, I still cherish every moment with you.",
    thinkAgainLabel: "Think again 💗"
  },

  // Supabase configuration
  supabase: {
    url: "https://vgrpxbxxbvsntgufitvh.supabase.co",
    anonKey: "sb_publishable_Mo2bGsC7c1VNkSG18Xv1mA_OeJeTBvG"
  },

  // Background music
  music: {
    src: "",
    volume: 0.35
  }
};
