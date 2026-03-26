"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const user_schema_1 = require("../DataBase/Schema/user.schema");
const user_controller_1 = __importDefault(require("../controller/user.controller"));
const router = (0, express_1.Router)();
const userController = new user_controller_1.default();
// Current user operations
router.get('/me', auth_middleware_1.authenticate, userController.getProfile.bind(userController));
router.put('/me/password', auth_middleware_1.authenticate, userController.updateOwnPassword.bind(userController));
// Admin/SuperAdmin operations
router.post('/', auth_middleware_1.authenticate, (0, auth_middleware_1.authorizeRoles)([user_schema_1.USER_ROLES.SUPER_ADMIN, user_schema_1.USER_ROLES.ADMIN]), userController.createUser.bind(userController));
router.get('/', auth_middleware_1.authenticate, (0, auth_middleware_1.authorizeRoles)([user_schema_1.USER_ROLES.SUPER_ADMIN, user_schema_1.USER_ROLES.ADMIN]), userController.getUsers.bind(userController));
router.delete('/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.authorizeRoles)([user_schema_1.USER_ROLES.SUPER_ADMIN, user_schema_1.USER_ROLES.ADMIN]), userController.deleteUser.bind(userController));
exports.default = router;
//# sourceMappingURL=user.router.js.map