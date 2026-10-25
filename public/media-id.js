export const isMediaId = (value) =>
  /^(?:\d{1,20}|s-[a-f0-9]{24}-\d{1,20})$/.test(String(value || ''));
