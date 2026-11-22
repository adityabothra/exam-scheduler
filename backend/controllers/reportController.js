const reports = require('../services/reportService');
const { asyncHandler } = require('../utils/helpers');

/** GET /api/reports/:type?format=pdf|xlsx|csv&runId=&id=&semester= */
exports.download = asyncHandler(async (req, res) => {
  const { format = 'pdf', runId, id, ...filters } = req.query;
  const out = await reports.render(req.params.type, String(format).toLowerCase(), { runId, id, filters });
  res.setHeader('Content-Type', out.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
  res.send(out.buffer);
});
