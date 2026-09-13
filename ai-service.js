/**
 * AI Service Module
 * Handles streaming communication with:
 * - Built-in Intelligent Simulated Engine (Instant, zero-config)
 * - Google Gemini API (gemini-1.5-flash, gemini-1.5-pro, gemini-2.0-flash)
 * - OpenAI API (gpt-4o-mini, gpt-4o, gpt-3.5-turbo)
 */

export class AIService {
  constructor(config = {}) {
    this.provider = config.provider || 'simulated';
    this.apiKey = config.apiKey || '';
    this.model = config.model || 'gemini-3.6-flash';
    this.temperature = config.temperature !== undefined ? config.temperature : 0.7;
    this.systemPrompt = config.systemPrompt || 'You are Aether AI, a powerful, versatile, and articulate AI assistant created to help with questions, coding, creative tasks, and problem solving.';
  }

  updateConfig(newConfig) {
    Object.assign(this, newConfig);
  }

  /**
   * Stream a response from the selected provider
   * @param {Array} history - Array of {role: 'user'|'assistant', content: string}
   * @param {Object} options - {onChunk: (chunk: string) => void, signal: AbortSignal}
   * @returns {Promise<string>} Full assembled response
   */
  async streamResponse(history, { onChunk, signal } = {}) {
    if (this.provider === 'gemini') {
      return this._streamGemini(history, { onChunk, signal });
    } else if (this.provider === 'openai') {
      return this._streamOpenAI(history, { onChunk, signal });
    } else {
      return this._streamSimulated(history, { onChunk, signal });
    }
  }

  /**
   * Google Gemini API Streaming
   */
  async _streamGemini(history, { onChunk, signal }) {
    if (!this.apiKey) {
      throw new Error('Please enter your Google Gemini API Key in Settings to use Gemini models.');
    }

    let modelName = this.model || 'gemini-3.6-flash';
    // Auto-normalize if user had old gemini-2.0-flash configured
    if (modelName === 'gemini-2.0-flash' || modelName === 'gemini-2.0') {
      modelName = 'gemini-3.6-flash';
      this.model = 'gemini-3.6-flash';
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?key=${this.apiKey}&alt=sse`;

    // Map conversation history to Gemini format
    const contents = history.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

    const body = {
      contents,
      generationConfig: {
        temperature: parseFloat(this.temperature) || 0.7,
        maxOutputTokens: 2500,
      }
    };

    if (this.systemPrompt && this.systemPrompt.trim()) {
      body.systemInstruction = {
        parts: [{ text: this.systemPrompt }]
      };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal
    });

    if (!response.ok) {
      const errText = await response.text();
      let msg = `Gemini API Error (${response.status})`;
      try {
        const parsed = JSON.parse(errText);
        if (parsed.error && parsed.error.message) {
          msg = parsed.error.message;
        }
      } catch (e) {
        msg = errText;
      }

      // Smart auto-recovery: If Google API says the model is no longer available, auto-retry with gemini-3.6-flash
      if ((msg.includes('no longer available') || msg.includes('gemini-2.0-flash') || response.status === 404) && modelName !== 'gemini-3.6-flash') {
        console.warn(`Model ${modelName} is unavailable (${msg}). Automatically switching to gemini-3.6-flash...`);
        this.model = 'gemini-3.6-flash';
        return this._streamGemini(history, { onChunk, signal });
      }

      throw new Error(msg);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let fullText = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep partial line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          const jsonStr = trimmed.substring(6);
          if (jsonStr === '[DONE]') continue;
          try {
            const data = JSON.parse(jsonStr);
            const textChunk = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (textChunk) {
              fullText += textChunk;
              if (onChunk) onChunk(textChunk);
            }
          } catch (err) {
            // Ignore partial parse chunk errors
          }
        }
      }
    }

    return fullText;
  }

  /**
   * OpenAI API Streaming
   */
  async _streamOpenAI(history, { onChunk, signal }) {
    if (!this.apiKey) {
      throw new Error('Please enter your OpenAI API Key in Settings to use ChatGPT models.');
    }

    const messages = [];
    if (this.systemPrompt && this.systemPrompt.trim()) {
      messages.push({ role: 'system', content: this.systemPrompt });
    }
    history.forEach(m => {
      messages.push({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content
      });
    });

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model || 'gpt-4o-mini',
        messages,
        temperature: parseFloat(this.temperature) || 0.7,
        stream: true
      }),
      signal
    });

    if (!response.ok) {
      const errText = await response.text();
      let msg = `OpenAI API Error (${response.status})`;
      try {
        const parsed = JSON.parse(errText);
        if (parsed.error && parsed.error.message) {
          msg = parsed.error.message;
        }
      } catch (e) {
        msg = errText;
      }
      throw new Error(msg);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let fullText = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          const jsonStr = trimmed.substring(6);
          if (jsonStr === '[DONE]') break;
          try {
            const data = JSON.parse(jsonStr);
            const delta = data.choices?.[0]?.delta?.content || '';
            if (delta) {
              fullText += delta;
              if (onChunk) onChunk(delta);
            }
          } catch (err) {
            // Ignore incomplete chunks
          }
        }
      }
    }

    return fullText;
  }

  /**
   * Built-in Intelligent Simulated Engine
   * Provides immediate, dynamic, beautifully structured replies without needing an external API key.
   */
  async _streamSimulated(history, { onChunk, signal }) {
    const lastUserMessage = history.filter(m => m.role === 'user').pop();
    const query = (lastUserMessage ? lastUserMessage.content : '').toLowerCase().trim();

    const responseText = this._generateSimulatedResponse(query);
    
    // Simulate streaming by yielding chunks with dynamic typing rhythm
    let currentPos = 0;
    const chunkSize = 4; // chunk length
    const delayMs = 18;  // ms delay per chunk

    while (currentPos < responseText.length) {
      if (signal && signal.aborted) {
        throw new DOMException('Generation stopped by user', 'AbortError');
      }

      const endPos = Math.min(currentPos + Math.floor(Math.random() * 3 + 3), responseText.length);
      const chunk = responseText.slice(currentPos, endPos);
      currentPos = endPos;

      if (onChunk) onChunk(chunk);
      await new Promise(r => setTimeout(r, delayMs));
    }

    return responseText;
  }

  /**
   * Generate intelligent markdown answers for diverse topics
   */
  _generateSimulatedResponse(query) {
    // 1. Quantum Computing
    if (query.includes('quantum') || query.includes('qubit')) {
      return `### ⚛️ Understanding Quantum Computing: The Coin Analogy

Quantum computing is fundamentally different from classical computers because it harnesses the bizarre rules of quantum physics: **superposition** and **entanglement**.

#### 1. The Coin Analogy
* **Classical Bit (0 or 1):** Imagine a coin lying flat on a table. It can show **Heads (0)** or **Tails (1)**. A computer examines millions of coins one state at a time.
* **Quantum Qubit:** Now imagine spinning that coin rapidly on its edge! While it is spinning, it is not simply heads or tails—it is a probabilistic mixture of **both states simultaneously**. That is **Superposition**.

#### 2. Why Does This Matter?
Classical computers solve complex problems sequentially (like navigating a maze by trying one path at a time). A quantum computer explores countless paths **all at once** through constructive interference.

| Feature | Classical Computing | Quantum Computing |
| :--- | :--- | :--- |
| **Basic Unit** | Bit ($0$ or $1$) | Qubit ($\alpha\|0\\rangle + \beta\|1\\rangle$) |
| **Scaling** | Linear growth | Exponential capacity ($2^n$ states) |
| **Optimal Use Cases** | Databases, UI, logic, gaming | Cryptography, drug discovery, chemistry |

\`\`\`python
# Simple Qiskit snippet demonstrating superposition
from qiskit import QuantumCircuit

qc = QuantumCircuit(1, 1)
qc.h(0)        # Apply Hadamard gate to put qubit 0 into superposition
qc.measure(0, 0)
print(qc.draw())
\`\`\`

> 💡 **Takeaway:** Quantum computers won't replace your phone or laptop; instead, they operate as specialized accelerators for immense mathematical and scientific calculations.`;
    }

    // 2. Python Web Scraper
    if (query.includes('python') || query.includes('scrape') || query.includes('hacker news') || query.includes('beautifulsoup')) {
      return `### 🐍 Complete Python Web Scraper (BeautifulSoup & Requests)

Here is a clean, robust, and production-ready Python script to fetch the top stories from **Hacker News**:

\`\`\`python
import requests
from bs4 import BeautifulSoup

def get_top_hacker_news_stories(limit=10):
    """
    Scrapes the top stories from Hacker News and returns a list of dictionaries.
    """
    url = "https://news.ycombinator.com/"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }
    
    try:
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
    except requests.RequestException as e:
        print(f"Error fetching page: {e}")
        return []

    soup = BeautifulSoup(response.text, "html.parser")
    story_rows = soup.select(".athing")
    subtext_rows = soup.select(".subtext")
    
    stories = []
    
    for i in range(min(limit, len(story_rows))):
        title_tag = story_rows[i].select_one(".titleline > a")
        if not title_tag:
            continue
            
        title = title_tag.get_text()
        link = title_tag.get("href")
        
        # Extract score / points
        subtext = subtext_rows[i]
        score_tag = subtext.select_one(".score")
        score = score_tag.get_text() if score_tag else "0 points"
        
        stories.append({
            "rank": i + 1,
            "title": title,
            "link": link,
            "score": score
        })
        
    return stories

if __name__ == "__main__":
    top_stories = get_top_hacker_news_stories(limit=5)
    print("🔥 Top Hacker News Stories:\n" + "=" * 30)
    for story in top_stories:
        print(f"[{story['rank']}] {story['title']}")
        print(f"    ⭐ {story['score']} | 🔗 {story['link']}\n")
\`\`\`

#### Installation Instructions:
Run this command in your terminal before executing:
\`\`\`bash
pip install requests beautifulsoup4
\`\`\`

#### Key Highlights:
1. **Header Spoofing:** Uses a standard \`User-Agent\` header to avoid 403 request throttling.
2. **Safe Parsing:** Uses CSS selectors (\`.athing\` and \`.titleline > a\`) for resilience against minor layout changes.
3. **Timeout Protection:** Adds \`timeout=10\` to prevent indefinite hanging.`;
    }

    // 3. Sales / Pitch Email
    if (query.includes('email') || query.includes('pitch') || query.includes('sales') || query.includes('client')) {
      return `### ✉️ High-Converting B2B Enterprise Cold Outreach Email

Here is a modern, personalized email framework designed to achieve high response rates with senior executives and tech leaders:

---

**Subject:** Quick question regarding {{Company_Name}}'s workflow automation

**Hi {{First_Name}},**

I noticed that {{Company_Name}} has recently been expanding its operations in {{Industry_Area}}—congratulations on the recent milestones!

Most leaders in your position face a familiar bottleneck: teams spend up to **35% of their week** wrangling manual reports and disparate data pipelines rather than driving high-impact strategy.

At **Aether**, we developed an adaptive AI assistant that integrates seamlessly into existing enterprise stacks to:
1. **Reduce response latency by 60%** across repetitive customer and engineering workflows.
2. **Ensure enterprise-grade privacy:** zero public training retention with isolated data boundaries.
3. **Deliver positive ROI in under 3 weeks.**

Would you be open to a brief **10-minute coffee chat** this Thursday at 2:00 PM EST to see a live 2-minute prototype tailored for {{Company_Name}}?

If not, no worries at all—feel free to pass this along to the right person on your product team.

Best regards,

**Your Name**  
*Head of Growth | Aether AI*  
[LinkedIn Profile] • [Calendar Link]

---

#### 🎯 Why This Structure Converts:
* **No generic fluff:** Opening immediately references their specific context.
* **Quantifiable value:** Mentions concrete numbers (35%, 60%, 3 weeks).
* **Low-friction Call-to-Action (CTA):** Asking for 10 minutes or a simple referral significantly lowers resistance.`;
    }

    // 4. Framework Comparison (React vs Vue vs Svelte)
    if (query.includes('react') || query.includes('vue') || query.includes('svelte') || query.includes('framework')) {
      return `### ⚡ Modern Frontend Comparison: React vs. Vue vs. Svelte

Choosing the right frontend ecosystem depends on your team size, performance targets, and architectural preferences:

#### Architectural Breakdown

| Criteria | ⚛️ React (19+) | 💚 Vue (3.5+) | 🧡 Svelte (5 Runes) |
| :--- | :--- | :--- | :--- |
| **Core Paradigm** | Virtual DOM, JSX, Hooks | Virtual DOM, Single-File-Components | Zero Virtual DOM, Compiler-based |
| **Reactivity** | Explicit state (\`useState\`, \`useActionState\`) | Proxy-based (\`ref\`, \`reactive\`) | Deep signals (\`$state\`, \`$derived\`) |
| **Bundle Size** | Medium (~42 KB runtime) | Small-Medium (~33 KB) | Ultra-light (~2-5 KB runtime) |
| **Learning Curve** | Moderate (JSX, unidirectional data) | Gentle (HTML-like template syntax) | Very gentle (Vanilla JS feeling) |
| **Ecosystem & Jobs** | Massive (Dominates corporate market) | Strong (Global, great documentation) | Rapidly surging, developer-loved |

#### Recommendation Guide:
* **Pick React if:** You need maximal job opportunities, large community libraries, or are building huge cross-platform systems with React Native.
* **Pick Vue if:** You want a clean, elegant balance of great tooling, official router/state management, and easy incremental adoption.
* **Pick Svelte if:** You prioritize lightning-fast page loads, tiny bundle footprints, and writing clean, boilerplate-free code.`;
    }

    // 5. General Greetings & Persona
    if (query.startsWith('hi') || query.startsWith('hello') || query.startsWith('hey') || query.includes('who are you') || query.includes('what can you do')) {
      return `👋 **Hello! I am Aether AI**, your intelligent conversational assistant.

I can help you with a wide variety of tasks, including:

* 💻 **Software Engineering & Code:** Writing scripts, debugging errors, explaining architectures in Python, JavaScript, Rust, C++, and more.
* 🔬 **Science, Math & Explanations:** Breaking down intricate concepts with clear analogies, derivations, and step-by-step logic.
* ✍️ **Creative & Business Writing:** Crafting persuasive emails, essays, summaries, and marketing copy.
* 📊 **Analysis & Brainstorming:** Comparing technologies, evaluating tradeoffs, and structuring project roadmaps.

> **Tip:** You can ask me questions directly, or open the **Settings** menu at the bottom-left to connect your own **Google Gemini** or **OpenAI API key** for live cloud intelligence!

What would you like to explore today?`;
    }

    // 6. Generic Fallback (Intelligent structured response for anything else)
    const capitalizedTopic = query.length > 0 ? query.charAt(0).toUpperCase() + query.slice(1) : 'your request';
    return `### 💡 Analysis & Insights on "${capitalizedTopic}"

Thank you for your question! Here is a structured breakdown and comprehensive answer:

#### 1. Core Overview
When exploring **${capitalizedTopic}**, it helps to distinguish between the fundamental principles and their practical applications. The key objective is ensuring clarity, efficiency, and actionable next steps.

#### 2. Key Pillars & Considerations
* **Precision & Strategy:** Establish measurable outcomes before executing.
* **Iterative Improvement:** Test assumptions with lightweight prototypes and feedback loops.
* **Scalability:** Optimize for resilience and long-term sustainability rather than quick fixes.

\`\`\`javascript
// Example implementation pattern
function solveProblem(context) {
  console.log("Analyzing parameters for:", context);
  return {
    status: "success",
    insights: ["Clarity of purpose", "Actionable execution", "Continuous verification"],
    timestamp: new Date().toISOString()
  };
}

const result = solveProblem("${capitalizedTopic.replace(/"/g, '')}");
console.log(result);
\`\`\`

#### 3. Recommended Next Steps
1. Define the specific constraints and edge cases for this scenario.
2. Formulate a testable hypothesis or prototype.
3. Validate results with empirical data or user feedback.

*Would you like me to dive deeper into any specific sub-topic or provide sample code/implementation details?*`;
  }
}
