/**
 * PromptForge — main.js
 * Handles: navigation, active links, mobile menu, Groq API, clipboard, toasts
 */

// ══════════════════════════════════════════════════════════════
//  CONFIG
// ══════════════════════════════════════════════════════════════

const CONFIG = {
  // ⚠️  Replace with your actual Groq API key before deploying.
  //     On Netlify/Vercel, inject via environment variables and a
  //     serverless function — never expose this key client-side in production.
  GROQ_API_KEY: 'YOUR_GROQ_API_KEY',

  GROQ_API_URL: 'https://api.groq.com/openai/v1/chat/completions',
  GROQ_MODEL:   'llama-3.3-70b-versatile',

  MAX_TOKENS:   1024,
  TEMPERATURE:  0.85,
};


// ══════════════════════════════════════════════════════════════
//  NAV — active link & mobile menu
// ══════════════════════════════════════════════════════════════

function initNavigation() {
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';

  // Mark active nav link
  document.querySelectorAll('.nav-links a, .mobile-nav a').forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentPage || (currentPage === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });

  // Mobile hamburger toggle
  const hamburger = document.getElementById('hamburger');
  const mobileNav = document.getElementById('mobile-nav');

  if (hamburger && mobileNav) {
    hamburger.addEventListener('click', () => {
      const isOpen = mobileNav.classList.toggle('open');
      hamburger.classList.toggle('open', isOpen);
      hamburger.setAttribute('aria-expanded', String(isOpen));
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!hamburger.contains(e.target) && !mobileNav.contains(e.target)) {
        mobileNav.classList.remove('open');
        hamburger.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
      }
    });
  }
}


// ══════════════════════════════════════════════════════════════
//  TOAST NOTIFICATIONS
// ══════════════════════════════════════════════════════════════

function showToast(message, type = 'info', duration = 3500) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const icons = { success: '✓', error: '✕', info: '◆' };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('removing');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, duration);
}


// ══════════════════════════════════════════════════════════════
//  CLIPBOARD
// ══════════════════════════════════════════════════════════════

async function copyToClipboard(text, buttonEl) {
  try {
    await navigator.clipboard.writeText(text);
    if (buttonEl) {
      const original = buttonEl.textContent;
      buttonEl.textContent = 'Copied!';
      buttonEl.classList.add('copied');
      setTimeout(() => {
        buttonEl.textContent = original;
        buttonEl.classList.remove('copied');
      }, 2000);
    }
    showToast('Prompt copied to clipboard!', 'success');
  } catch {
    showToast('Could not copy — please select manually.', 'error');
  }
}


// ══════════════════════════════════════════════════════════════
//  GROQ API
// ══════════════════════════════════════════════════════════════

/**
 * Build the system prompt for the meta-prompt generator.
 */
function buildSystemPrompt() {
  return `You are PromptForge, a world-class AI prompt engineering expert.
Your only job is to generate highly effective, production-ready AI prompts.

Rules:
- Output ONLY the generated prompt. No preamble, no labels, no explanations.
- Tailor the prompt to the specified use-case, AI model target, tone, and detail level.
- Use clear, specific, and unambiguous language.
- Structure prompts with logical sections when helpful (role, context, instructions, output format).
- Make prompts reusable by including [PLACEHOLDER] variables where appropriate.
- Optimise for the specified target model's known strengths and conventions.`;
}

/**
 * Build the user message from form fields.
 */
function buildUserMessage({ topic, useCase, targetModel, tone, detailLevel, extras }) {
  let msg = `Generate an AI prompt for the following requirements:\n\n`;
  msg += `Topic/Goal: ${topic}\n`;
  msg += `Use Case: ${useCase}\n`;
  msg += `Target AI Model: ${targetModel}\n`;
  msg += `Desired Tone: ${tone}\n`;
  msg += `Detail Level: ${detailLevel}\n`;
  if (extras && extras.trim()) msg += `Additional Instructions: ${extras.trim()}\n`;
  return msg;
}

/**
 * Core Groq API call with error handling.
 * @param {object} formData
 * @returns {Promise<string>} generated prompt text
 */
async function callGroqAPI(formData) {
  if (!CONFIG.GROQ_API_KEY || CONFIG.GROQ_API_KEY === 'YOUR_GROQ_API_KEY') {
    throw new Error(
      'API key not configured. Please replace YOUR_GROQ_API_KEY in main.js with your actual Groq API key.'
    );
  }

  const payload = {
    model:       CONFIG.GROQ_MODEL,
    max_tokens:  CONFIG.MAX_TOKENS,
    temperature: CONFIG.TEMPERATURE,
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user',   content: buildUserMessage(formData) },
    ],
  };

  let response;
  try {
    response = await fetch(CONFIG.GROQ_API_URL, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${CONFIG.GROQ_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (networkError) {
    throw new Error(`Network error: ${networkError.message}. Check your internet connection.`);
  }

  // Non-2xx HTTP response handling
  if (!response.ok) {
    let detail = '';
    try {
      const errBody = await response.json();
      detail = errBody?.error?.message || JSON.stringify(errBody);
    } catch {
      detail = await response.text().catch(() => '');
    }

    const STATUS_MESSAGES = {
      400: `Bad request — check your input fields. ${detail}`,
      401: 'Invalid API key. Please verify your Groq API key.',
      403: 'Access forbidden. Your API key may lack permissions.',
      422: `Unprocessable request. ${detail}`,
      429: 'Rate limit reached. Please wait a moment and try again.',
      500: 'Groq server error. Please try again shortly.',
      503: 'Groq service unavailable. Please try again later.',
    };

    const message = STATUS_MESSAGES[response.status]
      || `Unexpected error (HTTP ${response.status}): ${detail}`;
    throw new Error(message);
  }

  const data = await response.json();

  // Validate expected response structure
  if (!data?.choices?.[0]?.message?.content) {
    throw new Error('Unexpected API response format. Please try again.');
  }

  return data.choices[0].message.content.trim();
}


// ══════════════════════════════════════════════════════════════
//  PROMPT GENERATOR UI  (index.html only)
// ══════════════════════════════════════════════════════════════

function initGenerator() {
  const form        = document.getElementById('prompt-form');
  const outputBox   = document.getElementById('output-text');
  const outputWrap  = document.getElementById('output-wrapper');
  const copyBtn     = document.getElementById('copy-btn');
  const charCount   = document.getElementById('char-count');
  const generateBtn = document.getElementById('generate-btn');

  if (!form) return; // not on home page

  // Live character count for extras field
  const extrasField = document.getElementById('extras');
  if (extrasField && charCount) {
    extrasField.addEventListener('input', () => {
      charCount.textContent = `${extrasField.value.length} / 300`;
    });
  }

  // Copy button
  if (copyBtn && outputBox) {
    copyBtn.addEventListener('click', () => {
      const text = outputBox.textContent;
      if (text && !outputBox.querySelector('.output-placeholder')) {
        copyToClipboard(text, copyBtn);
      }
    });
  }

  // Form submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = {
      topic:       document.getElementById('topic')?.value.trim(),
      useCase:     document.getElementById('use-case')?.value,
      targetModel: document.getElementById('target-model')?.value,
      tone:        document.getElementById('tone')?.value,
      detailLevel: document.getElementById('detail-level')?.value,
      extras:      document.getElementById('extras')?.value.trim(),
    };

    // Client-side validation
    if (!formData.topic) {
      showToast('Please describe your topic or goal.', 'error');
      document.getElementById('topic')?.focus();
      return;
    }

    // Loading state
    const btnText    = generateBtn.querySelector('.btn-text');
    const btnSpinner = generateBtn.querySelector('.spinner');

    generateBtn.disabled = true;
    if (btnText)    btnText.textContent  = 'Generating…';
    if (btnSpinner) btnSpinner.style.display = 'inline-block';

    // Placeholder shimmer
    outputBox.innerHTML = `<span class="output-placeholder">✦ Crafting your prompt — this takes just a moment…</span>`;
    if (outputWrap) outputWrap.style.display = 'block';

    try {
      const result = await callGroqAPI(formData);

      // Render result
      outputBox.textContent = result;
      outputBox.classList.add('animate-in');
      setTimeout(() => outputBox.classList.remove('animate-in'), 600);

      if (copyBtn) copyBtn.style.display = 'inline-flex';
      showToast('Prompt generated successfully!', 'success');

      // Scroll to output
      outputWrap?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    } catch (err) {
      outputBox.innerHTML = `<span style="color:#f87171;">⚠ ${err.message}</span>`;
      showToast(err.message, 'error', 6000);
      console.error('[PromptForge] Generation error:', err);
    } finally {
      generateBtn.disabled = false;
      if (btnText)    btnText.textContent     = 'Generate Prompt';
      if (btnSpinner) btnSpinner.style.display = 'none';
    }
  });
}


// ══════════════════════════════════════════════════════════════
//  CONTACT FORM (contact.html only)
// ══════════════════════════════════════════════════════════════

function initContactForm() {
  const form = document.getElementById('contact-form');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const name    = document.getElementById('c-name')?.value.trim();
    const email   = document.getElementById('c-email')?.value.trim();
    const message = document.getElementById('c-message')?.value.trim();

    if (!name || !email || !message) {
      showToast('Please fill in all required fields.', 'error');
      return;
    }

    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(email)) {
      showToast('Please enter a valid email address.', 'error');
      return;
    }

    // Replace with real form submission (Netlify Forms, Formspree, etc.)
    showToast("Message sent! We'll be in touch soon.", 'success', 5000);
    form.reset();
  });
}


// ══════════════════════════════════════════════════════════════
//  SMOOTH SCROLL for anchor links
// ══════════════════════════════════════════════════════════════

function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const target = document.querySelector(anchor.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}


// ══════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initGenerator();
  initContactForm();
  initSmoothScroll();
});
