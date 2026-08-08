// site-check — invariant audit over the shipped HTML (plans/website-deep-pass.md).
// Zero dependencies; run via `node --test scripts/`.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SOON_PATTERNS = [/launching soon/i, /coming soon/i, /—\s*soon\b/i, /\bsoon\b\s*<\/(?:span|summary)>/i];

export function auditHtml(file, html, { files } = {}) {
  const violations = [];
  if (files) {
    for (const [, , ref] of html.matchAll(/(href|src)="([^"]+)"/g)) {
      if (/^(https?:|mailto:|#|\/)/.test(ref)) continue;
      if (!files.includes(ref.split('#')[0])) {
        violations.push({ file, rule: 'broken-link', detail: ref });
      }
    }
  }
  for (const pattern of SOON_PATTERNS) {
    if (pattern.test(html)) {
      violations.push({ file, rule: 'soon-copy', detail: `matches ${pattern}` });
      break;
    }
  }
  const MARKETING_PAGES = ['index.html', 'press.html'];
  if (MARKETING_PAGES.includes(file)) {
    const dashes = (html.match(/—/g) ?? []).length;
    if (dashes > 2) {
      violations.push({ file, rule: 'em-dash-budget', detail: `${dashes} em-dashes (max 2) — AI-register guard` });
    }
  }
  if (/home.screen widget/i.test(html)) {
    violations.push({ file, rule: 'feature-truth', detail: 'widget marketing (cut from v1, ADR-0022)' });
  }
  for (const [, heading] of html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)) {
    if (/(?:save|saved|saving)[^<]*\$\s?\d|\$\s?\d[\d,.]*[^<]*(?:\/|\bper\b|\ba\b)?\s*(?:year|yr|month|mo)?[^<]*(?:sav)/i.test(heading)) {
      violations.push({ file, rule: 'dollar-headline', detail: heading.trim() });
    }
  }
  if (file === 'press.html') {
    if (!/\$1\.99[\s\S]*\$17\.99/.test(html)) {
      violations.push({ file, rule: 'press-kit', detail: 'price facts missing' });
    }
    if (!/mailto:support@gasmeup\.app/.test(html)) {
      violations.push({ file, rule: 'press-kit', detail: 'contact email missing' });
    }
    if (!/apps\.apple\.com/.test(html) || !/play\.google\.com/.test(html)) {
      violations.push({ file, rule: 'press-kit', detail: 'store-links missing' });
    }
    if (!/href="gasmeup-press-kit\.zip"/.test(html)) {
      violations.push({ file, rule: 'press-kit', detail: 'asset-zip link missing' });
    }
  }
  auditPlayLinks(file, html, violations);
  if (file === 'index.html') {
    if (!/property="og:image"/.test(html)) {
      violations.push({ file, rule: 'required-meta', detail: 'og:image missing' });
    }
    if (!/name="apple-itunes-app"/.test(html)) {
      violations.push({ file, rule: 'required-meta', detail: 'apple-itunes-app smart-banner meta missing' });
    }
    if (!/rel="canonical"/.test(html)) {
      violations.push({ file, rule: 'required-meta', detail: 'canonical link missing' });
    }
    const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    if (!ld) {
      violations.push({ file, rule: 'required-meta', detail: 'json-ld missing' });
    } else {
      try {
        const parsed = JSON.parse(ld[1]);
        if (parsed['@type'] !== 'SoftwareApplication' || !parsed.name || !parsed.offers) throw new Error('shape');
      } catch {
        violations.push({ file, rule: 'required-meta', detail: 'json-ld unparseable or missing name/offers' });
      }
    }
    if (!/href="[^"]*apps\.apple\.com\/us\/app\/gasmeup-find-cheap-gas\/id6777846453[^"]*"/.test(html)) {
      violations.push({ file, rule: 'store-link-missing', detail: 'no apple App Store link' });
    }
    if (!/href="[^"]*play\.google\.com\/store\/apps\/details\?id=com\.vfisher\.gasmeup[^"]*"/.test(html)) {
      violations.push({ file, rule: 'store-link-missing', detail: 'no google Play link' });
    }
  }
  return violations;
}

function auditPlayLinks(file, html, violations) {
  const hrefs = [...html.matchAll(/href="([^"]*play\.google\.com\/store\/apps[^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
  for (const href of hrefs) {
    const params = new URL(href).searchParams;
    if ([...params.keys()].some((k) => k.startsWith('utm_'))) {
      violations.push({ file, rule: 'play-link-bare-utm', detail: href });
    }
    const referrer = params.get('referrer') ?? '';
    if (!/utm_source=/.test(decodeURIComponent(referrer))) {
      violations.push({ file, rule: 'play-link-untagged', detail: href });
    }
  }
}

export function auditSite(dir) {
  const violations = [];
  const files = readdirSync(dir);
  for (const file of files.filter((f) => f.endsWith('.html'))) {
    violations.push(...auditHtml(file, readFileSync(join(dir, file), 'utf8'), { files }));
  }
  return violations;
}
