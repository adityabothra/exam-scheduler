const { ApiError } = require('./helpers');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

/**
 * Schema-driven validation.
 *   schema = { field: { type, required, min, max, enum, default, trim } }
 * types: string | int | number | email | bool | date | time | intArray
 * Returns a cleaned object containing only the fields present in the schema,
 * or throws ApiError(400) listing every problem found.
 */
function validate(body, schema, { partial = false } = {}) {
  const out = {};
  const errors = [];
  const src = body || {};

  for (const [field, rule] of Object.entries(schema)) {
    let v = src[field];
    const missing = v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

    if (missing) {
      if (rule.default !== undefined && !partial) out[field] = rule.default;
      else if (rule.nullable && src[field] !== undefined) out[field] = null;
      else if (rule.required && !partial) errors.push({ field, message: `${field} is required` });
      continue;
    }

    switch (rule.type) {
      case 'string':
      case 'email': {
        v = String(v).trim();
        if (rule.type === 'email' && !EMAIL_RE.test(v)) errors.push({ field, message: `${field} must be a valid email` });
        if (rule.max && v.length > rule.max) errors.push({ field, message: `${field} must be at most ${rule.max} characters` });
        if (rule.min && v.length < rule.min) errors.push({ field, message: `${field} must be at least ${rule.min} characters` });
        break;
      }
      case 'int':
      case 'number': {
        const n = Number(v);
        if (!Number.isFinite(n) || (rule.type === 'int' && !Number.isInteger(n))) {
          errors.push({ field, message: `${field} must be ${rule.type === 'int' ? 'an integer' : 'a number'}` });
          continue;
        }
        if (rule.min !== undefined && n < rule.min) errors.push({ field, message: `${field} must be >= ${rule.min}` });
        if (rule.max !== undefined && n > rule.max) errors.push({ field, message: `${field} must be <= ${rule.max}` });
        v = n;
        break;
      }
      case 'bool':
        v = v === true || v === 1 || v === '1' || v === 'true';
        break;
      case 'date':
        v = String(v).slice(0, 10);
        if (!DATE_RE.test(v) || Number.isNaN(Date.parse(v))) errors.push({ field, message: `${field} must be a date (YYYY-MM-DD)` });
        break;
      case 'time':
        v = String(v);
        if (!TIME_RE.test(v)) errors.push({ field, message: `${field} must be a time (HH:MM)` });
        else if (v.length === 5) v += ':00';
        break;
      case 'intArray':
        if (!Array.isArray(v) || v.some((x) => !Number.isInteger(Number(x)))) {
          errors.push({ field, message: `${field} must be an array of integer ids` });
          continue;
        }
        v = [...new Set(v.map(Number))];
        break;
      default:
        break;
    }

    if (rule.enum && !rule.enum.includes(v)) errors.push({ field, message: `${field} must be one of: ${rule.enum.join(', ')}` });
    out[field] = v;
  }

  if (errors.length) throw new ApiError(400, 'Validation failed: ' + errors.map((e) => e.message).join('; '), errors);
  return out;
}

module.exports = { validate, EMAIL_RE };
