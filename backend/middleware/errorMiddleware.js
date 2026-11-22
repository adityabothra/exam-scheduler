const { ApiError } = require('../utils/helpers');

function notFound(req, res, next) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

/** Translates MySQL constraint errors into friendly API errors. */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  let status = err.status || 500;
  let message = err.message || 'Internal server error';

  switch (err.code) {
    case 'ER_DUP_ENTRY': {
      status = 409;
      const m = /for key '(?:[^.']+\.)?([^']+)'/.exec(err.sqlMessage || '');
      const key = m ? m[1].replace(/^uq_|^idx_/, '').replace(/_/g, ' ') : 'value';
      message = `Duplicate record: a record with the same ${key} already exists.`;
      break;
    }
    case 'ER_ROW_IS_REFERENCED_2':
    case 'ER_ROW_IS_REFERENCED':
      status = 409;
      message = 'Cannot delete this record because other records depend on it (for example a saved schedule, enrolled students or assigned items). Remove those first.';
      break;
    case 'ER_NO_REFERENCED_ROW_2':
    case 'ER_NO_REFERENCED_ROW':
      status = 400;
      message = 'Invalid reference: a related record (department, course, subject, room ...) does not exist.';
      break;
    case 'ER_CHECK_CONSTRAINT_VIOLATED':
    case 'ER_CONSTRAINT_FAILED':
      status = 400;
      message = 'A value violates a database constraint (check capacity, dates and times).';
      break;
    case 'ECONNREFUSED':
      status = 503;
      message = 'Database connection refused. Is MySQL running?';
      break;
    default:
      break;
  }

  if (status >= 500) console.error('[error]', err);
  res.status(status).json({ error: message, details: err.details || undefined });
}

module.exports = { notFound, errorHandler };
