export function success(res, message, data = {}, meta = {}) {
  return res.json({ success: true, message, data, meta });
}
