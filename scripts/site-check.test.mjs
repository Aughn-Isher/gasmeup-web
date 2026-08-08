import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditHtml, auditSite } from './site-check.mjs';

const ruleHits = (violations, rule) => violations.filter((v) => v.rule === rule);

test('flags "launching soon" copy anywhere in a page', () => {
  const violations = auditHtml('index.html', '<p>Launching soon on iPhone</p>');
  assert.equal(ruleHits(violations, 'soon-copy').length, 1);
});

test('clean live-app copy passes the soon-copy rule', () => {
  const violations = auditHtml('index.html', '<p>Now on iPhone &amp; Android</p>');
  assert.deepEqual(ruleHits(violations, 'soon-copy'), []);
});

test('Play links must nest utm_* inside an encoded referrer=, never bare', () => {
  const untagged = auditHtml('index.html', '<a href="https://play.google.com/store/apps/details?id=com.vfisher.gasmeup">Play</a>');
  assert.equal(untagged.some((v) => v.rule === 'play-link-untagged'), true);

  const bare = auditHtml('index.html', '<a href="https://play.google.com/store/apps/details?id=com.vfisher.gasmeup&amp;utm_source=website">Play</a>');
  assert.equal(bare.some((v) => v.rule === 'play-link-bare-utm'), true);

  const tagged = auditHtml('index.html', '<a href="https://play.google.com/store/apps/details?id=com.vfisher.gasmeup&amp;referrer=utm_source%3Dgasmeup.app%26utm_medium%3Dreferral%26utm_campaign%3Dsite%26utm_content%3Dsite-hero">Play</a>');
  assert.deepEqual(tagged.filter((v) => v.rule.startsWith('play-link')), []);
});

test('the landing page must link both live store listings', () => {
  const noLinks = auditHtml('index.html', '<span class="badge">App Store</span><span class="badge">Google Play</span>');
  assert.equal(noLinks.some((v) => v.rule === 'store-link-missing' && /apple/i.test(v.detail)), true);
  assert.equal(noLinks.some((v) => v.rule === 'store-link-missing' && /play/i.test(v.detail)), true);

  const linked = auditHtml('index.html',
    '<a href="https://apps.apple.com/us/app/gasmeup-find-cheap-gas/id6777846453">App Store</a>' +
    '<a href="https://play.google.com/store/apps/details?id=com.vfisher.gasmeup&amp;referrer=utm_source%3Dgasmeup.app%26utm_medium%3Dreferral%26utm_campaign%3Dsite%26utm_content%3Dsite-hero">Play</a>');
  assert.deepEqual(linked.filter((v) => v.rule === 'store-link-missing'), []);

  const otherPage = auditHtml('privacy.html', '<p>no store links here</p>');
  assert.deepEqual(otherPage.filter((v) => v.rule === 'store-link-missing'), []);
});

test('flags features the shipped binaries do not have (widget)', () => {
  const violations = auditHtml('index.html', '<h3>Home-screen widget</h3><p>Right on your home screen.</p>');
  assert.equal(ruleHits(violations, 'feature-truth').length, 1);
});

test('flags dollar-savings claims in headings, allows them in body copy', () => {
  const headline = auditHtml('index.html', '<h2>Save $300 a year on gas</h2>');
  assert.equal(ruleHits(headline, 'dollar-headline').length, 1);

  const body = auditHtml('index.html', '<p>You pay $1.99 a month — that is the whole business model.</p>');
  assert.deepEqual(ruleHits(body, 'dollar-headline'), []);
});

test('internal links and asset references must resolve to real files', () => {
  const files = ['index.html', 'style.css', 'logo.png'];
  const broken = auditHtml('index.html', '<img src="missing.png" /><a href="press.html">Press</a>', { files });
  assert.equal(ruleHits(broken, 'broken-link').length, 2);

  const ok = auditHtml('index.html',
    '<img src="logo.png" /><link href="style.css" /><a href="https://apps.apple.com/x">ext</a><a href="mailto:a@b.c">m</a><a href="#faq">jump</a>', { files });
  assert.deepEqual(ruleHits(ok, 'broken-link'), []);
});

test('marketing pages hold the em-dash budget (max 2)', () => {
  const dashy = auditHtml('index.html', '<p>One — two — three — four dashes is AI register.</p>');
  assert.equal(ruleHits(dashy, 'em-dash-budget').length, 1);

  const fine = auditHtml('index.html', '<p>One quiet dash — that is all.</p>');
  assert.deepEqual(ruleHits(fine, 'em-dash-budget'), []);

  const legal = auditHtml('terms.html', '<p>Legal — pages — may — dash — freely.</p>');
  assert.deepEqual(ruleHits(legal, 'em-dash-budget'), []);
});

test('index carries the crawler/share head set: og:image, smart banner, canonical, JSON-LD', () => {
  const bare = auditHtml('index.html', '<head><title>x</title></head>');
  for (const missing of ['og:image', 'apple-itunes-app', 'canonical', 'json-ld']) {
    assert.equal(ruleHits(bare, 'required-meta').some((v) => v.detail.includes(missing)), true, `should flag ${missing}`);
  }

  const full = auditHtml('index.html',
    '<head><meta property="og:image" content="https://gasmeup.app/og.png" />' +
    '<meta name="apple-itunes-app" content="app-id=6777846453" />' +
    '<link rel="canonical" href="https://gasmeup.app/" />' +
    '<script type="application/ld+json">{"@type":"SoftwareApplication","name":"GasMeUp","offers":[{"price":"1.99"}]}</script></head>');
  assert.deepEqual(ruleHits(full, 'required-meta'), []);

  const badJson = auditHtml('index.html',
    '<head><meta property="og:image" content="x" /><meta name="apple-itunes-app" content="y" />' +
    '<link rel="canonical" href="z" /><script type="application/ld+json">{broken</script></head>');
  assert.equal(ruleHits(badJson, 'required-meta').some((v) => v.detail.includes('json-ld')), true);
});

test('every shipped page passes the audit', () => {
  const violations = auditSite(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  assert.deepEqual(violations, []);
});
