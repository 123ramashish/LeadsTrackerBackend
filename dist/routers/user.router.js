"use strict";
// import { Router } from 'express';
// import { authenticate, authorizeRoles } from '../middlewares/auth.middleware';
// import { USER_ROLES } from '../DataBase/Schema/user.schema';
// import UserController from '../controller/user.controller';
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.userRouter = void 0;
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
const express_1 = require("express");
const user_schema_1 = require("../DataBase/Schema/user.schema");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const user_controller_1 = __importDefault(require("../controller/user.controller"));
const userRouter = (0, express_1.Router)();
exports.userRouter = userRouter;
const userController = new user_controller_1.default();
userRouter.use(auth_middleware_1.authenticate, auth_middleware_1.enforceTenant);
// ── Own account ───────────────────────────────────────────────────────────────
userRouter.get('/me', (req, res) => userController.getProfile(req, res));
userRouter.patch('/me', (req, res) => userController.updateProfile(req, res));
userRouter.patch('/me/password', (req, res) => userController.updateOwnPassword(req, res));
// ── Admin/SuperAdmin operations ────────────────────────────────────────────────
const adminRoles = [
    user_schema_1.USER_ROLES.SUPER_ADMIN,
    user_schema_1.USER_ROLES.ADMIN,
    user_schema_1.USER_ROLES.MANAGER,
];
userRouter.get('/', (0, auth_middleware_1.authorizeRoles)(adminRoles), (req, res) => userController.getUsers(req, res));
userRouter.post('/', (0, auth_middleware_1.authorizeRoles)([user_schema_1.USER_ROLES.SUPER_ADMIN, user_schema_1.USER_ROLES.ADMIN]), (req, res) => userController.createUser(req, res));
userRouter.get('/:id', (0, auth_middleware_1.authorizeRoles)(adminRoles), (req, res) => userController.getUser(req, res));
userRouter.patch('/:id', (0, auth_middleware_1.authorizeRoles)([user_schema_1.USER_ROLES.SUPER_ADMIN, user_schema_1.USER_ROLES.ADMIN]), (req, res) => userController.updateUser(req, res));
userRouter.patch('/:id/password', (0, auth_middleware_1.authorizeRoles)([user_schema_1.USER_ROLES.SUPER_ADMIN, user_schema_1.USER_ROLES.ADMIN]), (req, res) => userController.adminResetPassword(req, res));
userRouter.delete('/:id', (0, auth_middleware_1.authorizeRoles)([user_schema_1.USER_ROLES.SUPER_ADMIN, user_schema_1.USER_ROLES.ADMIN]), (req, res) => userController.deleteUser(req, res));
