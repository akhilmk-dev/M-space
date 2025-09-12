
// === Util: Calculate size from base64
const calculateBase64FileSize = (base64String) => {
  const length = base64String.length;
  const sizeInBytes = 3 * (length / 4) - (base64String.endsWith('==') ? 2 : base64String.endsWith('=') ? 1 : 0);
  const sizeKB = +(sizeInBytes / 1024).toFixed(2);
  const sizeMB = +(sizeKB / 1024).toFixed(2);
  return sizeMB > 1
    ? `${sizeMB.toFixed(2)} MB`
    : `${sizeKB.toFixed(2)} KB`;
};

module.exports = calculateBase64FileSize;