import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../common/middleware/authenticate';
import { requirePermission } from '../../common/middleware/requirePermission';
import { requireTenantContext } from '../../common/middleware/tenantContext';
import { validate } from '../../common/middleware/validate';
import { getActivityLog, getActivityLogs, getStats } from './activity-logs.controller';

const router = Router();
const idParam = z.object({ logId: z.string().uuid() });

router.use(authenticate, requireTenantContext);

router.get('/stats', requirePermission('activity_logs.view'), getStats);
router.get('/', requirePermission('activity_logs.view'), getActivityLogs);
router.get('/:logId', requirePermission('activity_logs.view'), validate({ params: idParam }), getActivityLog);

export const activityLogsRouter = router;
