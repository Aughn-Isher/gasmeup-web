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
  if (/home.screen widget/i.test(html)) {
    violations.push({ file, rule: 'feature-truth', detail: 'widget marketing (cut from v1, ADR-0022)' });
  }
  for (const [, heading] of html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)) {
    if (/(?:save|saved|saving)[^<]*\$\s?\d|\$\s?\d[\d,.]*[^<]*(?:\/|\bper\b|\ba\b)?\s*(?:year|yr|month|mo)?[^<]*(?:sav)/i.test(heading)) {
      violations.push({ file, rule: 'dollar-headline', detail: heading.trim() });
    }
  }
  auditPlayLinks(file, html, violations);
  if (file === 'index.html') {
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
