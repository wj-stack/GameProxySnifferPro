
export const formatHexInput = (val: string) => {
  const cleaned = val.toUpperCase().replace(/[^0-9A-F?]/g, '');
  const chunks = cleaned.match(/.{1,2}/g) || [];
  return chunks.join(' ');
};

export const hexToRegexSpaced = (pattern: string) => {
  const cleaned = pattern.toUpperCase().replace(/[^0-9A-F?]/g, '');
  if (!cleaned) return null;
  const chunks = cleaned.match(/.{1,2}/g) || [];
  const regexParts = chunks.map(chunk => chunk.replace(/\?/g, '[0-9A-F]'));
  const regexStr = regexParts.join('\\s+');
  try {
    return new RegExp(regexStr, 'i');
  } catch (e) {
    return null;
  }
};
