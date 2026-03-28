import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { buildExport } from '../services/excelExport';

const router = Router();
router.use(requireAuth);

router.get('/excel', async (req, res) => {
  const { start, end } = req.query as { start: string; end: string };
  if (!start || !end) {
    res.status(400).json({ error: 'start and end query params required' });
    return;
  }
  try {
    const buffer = await buildExport(start, end);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="food-tracker-${start}-${end}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Export failed' });
  }
});

export default router;
