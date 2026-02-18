import { Router } from 'express';
import CompanyController from '../controller/company.controller';
import { authenticate, authorizeRoles, enforceTenant } from '../middlewares/auth.middleware';
import { USER_ROLES } from '../DataBase/Schema/user.schema';

const companyRouter = Router();
const companyController = new CompanyController();

// Public: any visitor can register a new company
companyRouter.post('/register', companyController.register.bind(companyController));

// Protected
companyRouter.use(authenticate, enforceTenant);

// SuperAdmin: list all companies
companyRouter.get(
  '/',
  authorizeRoles([USER_ROLES.SUPER_ADMIN]),
  companyController.getCompanies.bind(companyController)
);

// SuperAdmin or own-company Admin: view single company
companyRouter.get(
  '/:id',
  authorizeRoles([USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN]),
  companyController.getCompany.bind(companyController)
);

// SuperAdmin or own-company Admin: update company
companyRouter.patch(
  '/:id',
  authorizeRoles([USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMIN]),
  companyController.updateCompany.bind(companyController)
);

// SuperAdmin only: soft-delete company + its users
companyRouter.delete(
  '/:id',
  authorizeRoles([USER_ROLES.SUPER_ADMIN]),
  companyController.deleteCompany.bind(companyController)
);

export { companyRouter };