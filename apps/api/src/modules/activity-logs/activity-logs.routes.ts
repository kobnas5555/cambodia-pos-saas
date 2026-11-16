import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate';
import { requirePermission } from '../../common/middleware/requirePermission';
import { requireTenantContext } from '../../common/middleware/tenantContext';
import { getActivityLogs, getStats } from './activity-logs.controller';

const router = Router();

router.use(authenticate, requireTenantContext);

router.get('/stats', requirePermission('activity_logs.view'), getStats);
router.get('/', requirePermission('activity_logs.view'), getActivityLogs);

export const activityLogsRouter = router;
