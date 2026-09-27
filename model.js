// --- Logische Offline-KI ohne API ---
// Intent-Erkennung + einfache Wissensbasis + etwas Stil

function tokenize(t) {
  return t.toLowerCase()
    .replace(/[^a-zäöüß0-9\s]/gi, " ")
    .split(/\s+/)
    .filter(x => x);
}

// Kleine Wissensbasis (kannst du erweitern)
const knowledge = [
  { keys: ["hallo", "hi", "hey"], answer: "Hallo! Schön, dass du da bist. Was möchtest du wissen?" },
  { keys: ["wie", "geht", "dir"], answer: "Mir geht es gut – ich bin eine kleine Offline-KI ohne API und immer bereit zu reden." },
  { keys: ["wer", "bist", "du"], answer: "Ich bin deine Browser-KI, die komplett lokal läuft – ohne Cloud, ohne API-Key." },
  { keys: ["zeit"], answer: "Ich kenne deine Systemzeit nicht direkt, aber du kannst auf die Uhr schauen – logisch, oder? 😉" },
  { keys: ["datum"], answer: "Das genaue Datum kenne ich nicht, aber dein Gerät weiß es ganz sicher." },
  { keys: ["hilfe"], answer: "Frag mich einfach etwas: zum Beispiel 'wer bist du', 'was kannst du', oder 'wie funktioniert das'." }
];

// Optional: etwas „Stil“-Text, aber kontrolliert
const styleText = `
Manchmal entstehen Gedanken wie kleine Funken im Dunkeln.
Worte verbinden sich zu neuen Ideen und formen klare Sätze.
Ein Fluss der niemals stillsteht erinnert an neugierige Fragen.
Logik und Fantasie können zusammenarbeiten ohne sich zu widersprechen.
`;

// Einfacher Stil-Baukasten: fügt einen kleinen Zusatz an logische Antworten an
function buildStyleFragments(text) {
  const sentences = text.split(".").map(s => s.trim()).filter(s => s.length > 0);
  return sentences;
}

const styleFragments = buildStyleFragments(styleText);

// Wähle optional einen Stil-Satz
function pickStyle() {
  if (styleFragments.length === 0) return "";
  const s = styleFragments[Math.floor(Math.random() * styleFragments.length)];
  return " " + s + ".";
}

// Intent-Erkennung: Begrüßung, Frage, Wissen
function detectIntent(tokens) {
  if (tokens.length === 0) return "empty";

  if (tokens.includes("hallo") || tokens.includes("hi") || tokens.includes("hey")) {
    return "greeting";
  }

  if (tokens.includes("wer") && tokens.includes("bist")) {
    return "identity";
  }

  if (tokens.includes("zeit") || tokens.includes("uhr")) {
    return "time";
  }

  if (tokens.includes("datum")) {
    return "date";
  }

  if (tokens.includes("hilfe")) || tokens.includes("hilfe?")) {
    return "help";
  }

  return "generic";
}

// Suche in Wissensbasis
function findKnowledge(tokens) {
  let best = null;
  let bestScore = 0;

  knowledge.forEach(entry => {
    let score = 0;
    entry.keys.forEach(k => {
      if (tokens.includes(k)) score++;
    });
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  });

  return best;
}

// Hauptfunktion: logische Antwort erzeugen
function KI_generate(userText) {
  const tokens = tokenize(userText);
  const intent = detectIntent(tokens);

  // 1. Versuche, passende Wissensbasis zu finden
  const kb = findKnowledge(tokens);
  if (kb && intent !== "empty") {
    return kb.answer + pickStyle();
  }

  // 2. Intent-basierte Fallbacks
  switch (intent) {
    case "greeting":
      return "Hallo! Ich freue mich über deine Nachricht. Frag mich etwas Konkretes, dann antworte ich logisch." + pickStyle();
    case "identity":
      return "Ich bin eine kleine KI, die komplett im Browser läuft – ohne Server, ohne API, nur JavaScript." + pickStyle();
    case "time":
      return "Ich kann deine lokale Zeit nicht direkt auslesen, aber logisch betrachtet: deine Uhr zeigt sie dir gerade an." + pickStyle();
    case "date":
      return "Das Datum hängt von deinem System ab – ich bleibe bewusst offline und lese nichts aus." + pickStyle();
    case "help":
      return "Ich arbeite regelbasiert: je klarer deine Frage, desto sinnvoller meine Antwort. Versuch es mit 'wer bist du' oder 'was kannst du'." + pickStyle();
    case "empty":
      return "Sag mir etwas, dann kann ich sinnvoll antworten.";
    default:
      // 3. Generische logische Antwort
      return "Ich habe deine Nachricht verstanden, aber meine kleine Offline-Logik findet keine perfekte Antwort dazu. Formuliere deine Frage etwas genauer." + pickStyle();
  }
}
