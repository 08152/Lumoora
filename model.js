/*
 * LUMORA Engine
 *
 * Kleines, vollständig lokales autoregressives Wort-n-Gramm-Modell.
 * Wichtig: Muster-Schlüssel (z. B. "hallo") werden NICHT als Trainingssatz
 * mit ihren Antworten verbunden. Dadurch erzeugt LUMORA bei Begrüßungen keine
 * künstlichen Mischungen wie "hallo: Antwort A. Antwort B".
 */
(function (global) {
  'use strict';

  class LocalNGramLanguageModel {
    constructor(options = {}) {
      this.order = Math.max(2, Math.min(4, options.order || 3));
      this.counts = new Map();
      this.unigrams = new Map();
      this.starts = new Map();
      this.sentences = [];
      this.totalTokens = 0;
    }

    _key(tokens) {
      return tokens.join('\u0001');
    }

    tokenizeWords(text) {
      return String(text ?? '').match(/\p{L}[\p{L}\p{M}\p{N}_'-]*|\p{N}+(?:[.,]\p{N}+)*|[^\s\p{L}\p{N}]/gu) || [];
    }

    train(sentences) {
      this.counts.clear();
      this.unigrams.clear();
      this.starts.clear();
      this.sentences = [];
      this.totalTokens = 0;

      for (const raw of sentences || []) {
        const sentence = String(raw ?? '').replace(/\s+/g, ' ').trim();
        if (!sentence) continue;

        const tokens = this.tokenizeWords(sentence);
        if (!tokens.length) continue;

        this.sentences.push(sentence);
        const seq = ['<BOS>', '<BOS>', ...tokens, '<EOS>'];

        for (const token of tokens) {
          this.unigrams.set(token, (this.unigrams.get(token) || 0) + 1);
          this.totalTokens++;
        }

        for (let i = 2; i < seq.length; i++) {
          for (let n = 2; n <= this.order; n++) {
            const start = Math.max(0, i - n + 1);
            const context = seq.slice(start, i);
            const next = seq[i];
            const key = this._key(context);
            if (!this.counts.has(key)) this.counts.set(key, new Map());
            const bucket = this.counts.get(key);
            bucket.set(next, (bucket.get(next) || 0) + 1);
          }
        }

        const firstKey = tokens.slice(0, Math.min(3, tokens.length)).join(' ');
        this.starts.set(firstKey, (this.starts.get(firstKey) || 0) + 1);
      }

      return this;
    }

    _sampleDistribution(bucket, temperature = 0.78) {
      const entries = [...bucket.entries()].filter(([token]) => token !== '<BOS>');
      if (!entries.length) return null;

      // Niedrigere Temperatur = stabilere, besser zusammenhängende Sätze.
      const powered = entries.map(([token, count]) => [
        token,
        Math.pow(count, 1 / Math.max(0.2, temperature))
      ]);

      const sum = powered.reduce((total, [, weight]) => total + weight, 0);
      let random = Math.random() * sum;

      for (const [token, weight] of powered) {
        random -= weight;
        if (random <= 0) return token;
      }

      return powered[powered.length - 1][0];
    }

    generate(seedText = '', maxTokens = 28, temperature = 0.78) {
      if (!this.sentences.length) return '';

      const seedTokens = this.tokenizeWords(seedText);
      let seed = seedTokens.slice(-Math.min(this.order - 1, 3));

      // Nur vorhandene Kontextfolgen als Start verwenden.
      const candidates = [];
      for (let n = seed.length; n >= 1; n--) {
        const part = seed.slice(-n);
        if (this.counts.has(this._key(part))) {
          candidates.push(part);
          break;
        }
      }

      if (candidates.length) {
        seed = candidates[0];
      } else {
        const pool = [...this.starts.keys()];
        if (!pool.length) return '';
        const picked = pool[Math.floor(Math.random() * pool.length)];
        seed = this.tokenizeWords(picked).slice(0, Math.min(this.order - 1, 3));
      }

      const output = [];
      let context = ['<BOS>', ...seed];

      for (let i = 0; i < maxTokens; i++) {
        let next = null;

        for (let n = Math.min(this.order - 1, context.length); n >= 1 && !next; n--) {
          const key = this._key(context.slice(-n));
          const bucket = this.counts.get(key);
          if (bucket) next = this._sampleDistribution(bucket, temperature);
        }

        if (!next || next === '<EOS>') break;

        output.push(next);
        context.push(next);

        // Eine Antwort soll nicht in ein langes, zusammenhangloses Textstück ausufern.
        if (output.length >= 3 && /^[.!?…]$/.test(next)) break;
      }

      return this.detokenize(output);
    }

    detokenize(tokens) {
      let out = '';
      const noSpaceBefore = new Set(['.', ',', '!', '?', ':', ';', ')', ']', '}', '%', '…']);
      const noSpaceAfter = new Set(['(', '[', '{', '„', '«', '“']);

      for (const token of tokens) {
        if (!out) {
          out = token;
        } else if (noSpaceBefore.has(token) || token.startsWith("'")) {
          out += token;
        } else if (noSpaceAfter.has(out.slice(-1))) {
          out += token;
        } else {
          out += ' ' + token;
        }
      }

      return out.trim();
    }
  }

  function collectStrings(value, out = []) {
    if (typeof value === 'string') {
      out.push(value);
    } else if (Array.isArray(value)) {
      value.forEach(v => collectStrings(v, out));
    } else if (value && typeof value === 'object') {
      Object.values(value).forEach(v => collectStrings(v, out));
    }
    return out;
  }

  function normalize(s) {
    return String(s ?? '')
      .toLocaleLowerCase('de-DE')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function words(s) {
    return normalize(s).match(/[a-z0-9äöüß]+/g) || [];
  }

  function cleanText(text) {
    return String(text ?? '')
      .replace(/<BOS>|<EOS>/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^[:;,.\-]+\s*/, '')
      .trim();
  }

  function normalizeAnswer(text) {
    let answer = cleanText(text);
    if (!answer) return '';

    // Doppelte direkt hintereinander stehende Sätze entfernen.
    const parts = answer.match(/[^.!?…]+[.!?…]?/g) || [answer];
    const unique = [];
    const seen = new Set();

    for (const part of parts) {
      const sentence = cleanText(part);
      if (!sentence) continue;
      const key = normalize(sentence).replace(/[^a-z0-9äöüß ]/g, '').trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      unique.push(sentence);
    }

    answer = unique.join(' ').trim();
    return answer;
  }

  class LUMORAEngine {
    constructor(data = {}, tokenizer = null) {
      this.data = data || {};
      this.tokenizer = tokenizer;
      this.languageModel = new LocalNGramLanguageModel({ order: 3 });
      this.history = [];
      this.maxHistory = 12;
      this.lastIntent = null;
      this.train();
    }

    setData(data) {
      this.data = data || {};
      this.train();
    }

    train() {
      // Ausschließlich echte Textinhalte trainieren.
      // Muster-Schlüssel wie "hallo" werden NICHT mit Antworten zu
      // "hallo: Antwort" verbunden.
      const corpus = collectStrings(this.data).filter(s => s.trim().length >= 2);
      this.languageModel.train(corpus);

      return {
        sentenceCount: this.languageModel.sentences.length,
        tokenCount: this.languageModel.totalTokens,
        vocabularySize: this.tokenizer?.vocabSize ?? 0
      };
    }

    learn(text) {
      const learned = cleanText(text);
      if (!learned) return false;

      if (!this.data.sprechen) this.data.sprechen = {};
      if (!Array.isArray(this.data.sprechen.lernsaetze)) {
        this.data.sprechen.lernsaetze = [];
      }

      this.data.sprechen.lernsaetze.push(learned);
      this.train();
      return true;
    }

    _patternEntries() {
      const patterns = this.data?.sprechen?.muster || this.data?.muster || {};
      return Object.entries(patterns).map(([key, responses]) => ({
        key,
        responses: Array.isArray(responses) ? responses.filter(Boolean).map(cleanText) : []
      }));
    }

    _findIntent(input) {
      const normalizedInput = normalize(input);
      const inputWords = new Set(words(input));
      let best = null;

      for (const entry of this._patternEntries()) {
        const keyWords = words(entry.key);
        let score = 0;

        // Exaktere Treffer deutlich stärker gewichten.
        if (normalizedInput === normalize(entry.key)) score += 10;
        if (normalizedInput.includes(normalize(entry.key)) && normalize(entry.key).length > 2) score += 3;

        for (const w of keyWords) {
          if (inputWords.has(w)) score += 2;
        }

        if (score > (best?.score || 0) && entry.responses.length) {
          best = { ...entry, score };
        }
      }

      const rules = this.data?.regeln?.regeln || [];
      for (const rule of rules) {
        const triggers = Array.isArray(rule.wenn) ? rule.wenn : [];
        const matched = triggers.some(trigger => {
          const t = normalize(trigger);
          return normalizedInput.includes(t);
        });

        if (matched) {
          if (!best || best.score < 1) {
            best = {
              key: rule.name || 'regel',
              responses: [],
              score: 1,
              rule
            };
          } else {
            best.rule = rule;
          }
        }
      }

      return best;
    }

    _knowledgeMatches(input) {
      const inputWords = new Set(words(input));
      const knowledge = this.data?.sprechen?.wissen || [];

      return knowledge
        .map(item => {
          const text = typeof item === 'string'
            ? item
            : `${item.thema || ''} ${item.inhalt || item.text || ''}`;
          const ws = words(text);
          let score = 0;
          for (const w of ws) {
            if (inputWords.has(w)) score++;
          }
          return { item, text: cleanText(text), score };
        })
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
    }

    _selectFragment(intent) {
      if (!intent?.responses?.length) return '';
      const valid = intent.responses.filter(Boolean);
      return valid.length ? valid[Math.floor(Math.random() * valid.length)] : '';
    }

    _contextSeed() {
      return this.history
        .slice(-4)
        .map(message => message.text)
        .join(' ');
    }

    _isCoherentContinuation(base, generated) {
      const a = new Set(words(base));
      const b = words(generated);
      if (!b.length) return false;

      // Eine Fortsetzung muss wenigstens ein paar Wörter aus dem aktuellen
      // Thema teilen; sonst wird sie verworfen statt an die Antwort angehängt.
      let overlap = 0;
      for (const word of b) {
        if (a.has(word)) overlap++;
      }
      return overlap >= Math.min(2, b.length);
    }

    _compose(input, intent, matches) {
      const known = normalizeAnswer(this._selectFragment(intent));
      const fact = matches[0]?.item;
      const factText = fact
        ? normalizeAnswer(typeof fact === 'string' ? fact : (fact.inhalt || fact.text || ''))
        : '';

      // 1) Exaktes Muster: genau EINE Antwort zurückgeben.
      // Keine zweite generierte Antwort anhängen.
      if (intent && intent.score >= 5 && known) {
        return known;
      }

      // 2) Bei schwächeren Mustern ebenfalls die vorhandene Antwort priorisieren.
      // Das verhindert, dass eine Regelaktion mit einem unpassenden Modelltext vermischt wird.
      if (known) {
        return known;
      }

      // 3) Erst danach das lokale Sprachmodell einsetzen.
      const context = this._contextSeed();
      const seed = [context, input, factText].filter(Boolean).join(' ');
      let generated = normalizeAnswer(this.languageModel.generate(seed, 28, 0.72));

      // Unpassende Modellfortsetzungen werden verworfen.
      if (generated && factText && !this._isCoherentContinuation(factText, generated)) {
        generated = '';
      }

      // 4) Bekannte Fakten sind ein sicherer, zusammenhängender Fallback.
      if (factText) return factText;
      if (generated) return generated;

      return 'Ich habe dazu noch wenig Daten. Füge weitere Inhalte in DATEN/ ein, damit ich daraus mehr lernen kann.';
    }

    generate(input) {
      const userText = String(input ?? '').trim();
      if (!userText) {
        return 'Schreib mir etwas, dann kann ich daraus eine Antwort erzeugen.';
      }

      const intent = this._findIntent(userText);
      const matches = this._knowledgeMatches(userText);
      const response = normalizeAnswer(this._compose(userText, intent, matches));

      this.lastIntent = intent;
      this.history.push(
        { role: 'user', text: userText },
        { role: 'assistant', text: response }
      );

      if (this.history.length > this.maxHistory) {
        this.history.splice(0, this.history.length - this.maxHistory);
      }

      return response;
    }

    encode(text) {
      return this.tokenizer ? this.tokenizer.encode(text) : [];
    }

    decode(ids) {
      return this.tokenizer ? this.tokenizer.decodeText(ids) : '';
    }

    stats() {
      return {
        vocabSize: this.tokenizer?.vocabSize ?? 0,
        trainingSentences: this.languageModel.sentences.length,
        trainingTokens: this.languageModel.totalTokens,
        historyMessages: this.history.length
      };
    }
  }

  global.LUMORAEngine = LUMORAEngine;
  global.LUMORALocalNGramLanguageModel = LocalNGramLanguageModel;
})(globalThis);
