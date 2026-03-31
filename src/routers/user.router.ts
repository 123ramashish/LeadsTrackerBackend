// import { Router } from 'express';
// import { authenticate, authorizeRoles } from '../middlewares/auth.middleware';
// import { USER_ROLES } from '../DataBase/Schema/user.schema';
// import UserController from '../controller/user.controller';

// const router = Router();
// const userController = new UserController();

// // Current user operations
// router.get('/me', authenticate, userController.getProfile.bind(userController));
// router.put('/me/password', authenticate, userController.updateOwnPassword.bind(userController));

// // Admin/SuperAdmin operations
// router.post(
//   '/', 
//   authenticate, 
//   authorizeRoles([USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN]), 
//   userController.createUser.bind(userController)
// );

// router.get(
//   '/', 
//   authenticate, 
//   authorizeRoles([USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN]), 
//   userController.getUsers.bind(userController)
// );

// router.delete(
//   '/:id', 
//   authenticate, 
//   authorizeRoles([USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN]), 
//   userController.deleteUser.bind(userController)
// );

// export default router;

import { Router } from 'express';
import { USER_ROLES } from '../DataBase/Schema/user.schema';
import { authenticate, authorizeRoles, enforceTenant } from '../middlewares/auth.middleware';
import UserController from '../controller/user.controller';

const userRouter = Router();
const userController = new UserController();

userRouter.use(authenticate, enforceTenant);

// ── Own account ───────────────────────────────────────────────────────────────
userRouter.get('/me', (req, res) => userController.getProfile(req as any, res));
userRouter.patch('/me', (req, res) => userController.updateProfile(req as any, res));
userRouter.patch('/me/password', (req, res) =>
  userController.updateOwnPassword(req as any, res)
);

// ── Admin/SuperAdmin operations ────────────────────────────────────────────────
const adminRoles = [
  USER_ROLES.SUPER_ADMIN,
  USER_ROLES.ADMIN,
  USER_ROLES.MANAGER,
];

userRouter.get(
  '/',
  authorizeRoles(adminRoles),
  (req, res) => userController.getUsers(req as any, res)
);

userRouter.post(
  '/',
  authorizeRoles([USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN]),
  (req, res) => userController.createUser(req as any, res)
);

userRouter.get(
  '/:id',
  authorizeRoles(adminRoles),
  (req, res) => userController.getUser(req as any, res)
);

userRouter.patch(
  '/:id',
  authorizeRoles([USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN]),
  (req, res) => userController.updateUser(req as any, res)
);

userRouter.patch(
  '/:id/password',
  authorizeRoles([USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN]),
  (req, res) => userController.adminResetPassword(req as any, res)
);

userRouter.delete(
  '/:id',
  authorizeRoles([USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN]),
  (req, res) => userController.deleteUser(req as any, res)
);

export { userRouter };
