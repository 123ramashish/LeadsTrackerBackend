import { Router } from 'express';
import { authenticate, authorizeRoles } from '../middlewares/auth.middleware';
import { USER_ROLES } from '../DataBase/Schema/user.schema';
import UserController from '../controller/user.controller';

const router = Router();
const userController = new UserController();

// Current user operations
router.get('/me', authenticate, userController.getProfile.bind(userController));
router.put('/me/password', authenticate, userController.updateOwnPassword.bind(userController));

// Admin/SuperAdmin operations
router.post(
  '/', 
  authenticate, 
  authorizeRoles([USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN]), 
  userController.createUser.bind(userController)
);

router.get(
  '/', 
  authenticate, 
  authorizeRoles([USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN]), 
  userController.getUsers.bind(userController)
);

router.delete(
  '/:id', 
  authenticate, 
  authorizeRoles([USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN]), 
  userController.deleteUser.bind(userController)
);

export default router;