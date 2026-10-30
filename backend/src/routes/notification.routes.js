import {Router} from 'express';
import {authenticate} from '../middlewares/auth.middleware.js';
import {protectMutation} from '../middlewares/origin.middleware.js';
import {notificationController as controller} from '../controllers/notification.controller.js';

export function notificationRoutes(authService){
 const router=Router();
 router.use(authenticate(authService),protectMutation,(req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
 router.get('/',controller.list);
 router.get('/unread-count',controller.unreadCount);
 router.post('/read-all',controller.markAllRead);
 router.post('/:id/read',controller.markRead);
 return router;
}
