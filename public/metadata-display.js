// Count visible Unicode characters so an abbreviated name never ends in half an emoji.
export function metadataPreview(value, limit = 300) {
  const text = String(value || '—'),
    characters = Array.from(text);
  return {
    full: text,
    preview: characters.slice(0, limit).join('').trimEnd(),
    expandable: characters.length > limit,
  };
}
const html = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
  );
export function renderCast(cast = []) {
  const { full, preview, expandable } = metadataPreview(
    cast
      .map((person) => person.name)
      .filter(Boolean)
      .join(', '),
  );
  if (!expandable) return '<span class="detail-cast-copy">' + html(full) + '</span>';
  return (
    '<span class="detail-cast-copy" id="detail-cast-preview">' +
    html(preview) +
    '…</span><span class="detail-cast-copy" id="detail-cast-full" hidden>' +
    html(full) +
    '</span><button class="text-button detail-cast-toggle" data-action="toggle-cast" aria-expanded="false" aria-controls="detail-cast-full">Mere information</button>'
  );
}
