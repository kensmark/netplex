import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metadataPreview, renderCast } from '../public/metadata-display.js';
test('cast previews collapse only above 300 Unicode characters and retain the full text', () => {
  assert.equal(metadataPreview('A'.repeat(300)).expandable, false);
  const text = '🎬'.repeat(301),
    result = metadataPreview(text);
  assert.equal(result.expandable, true);
  assert.equal([...result.preview].length, 300);
  assert.equal(result.full, text);
  assert.equal(metadataPreview('').full, '—');
});
test('cast disclosure escapes names in both collapsed and expanded content', () => {
  const short = renderCast([{ name: '<img onerror="alert(1)">' }]);
  assert.ok(!short.includes('<img'));
  assert.ok(short.includes('&lt;img'));
  assert.ok(!short.includes('toggle-cast'));
  const long = renderCast([{ name: 'A'.repeat(301) + '<script>bad</script>' }]);
  assert.ok(long.includes('aria-expanded="false"'));
  assert.ok(long.includes('id="detail-cast-full" hidden'));
  assert.ok(long.includes('Mere information'));
  assert.ok(!long.includes('<script>'));
});
