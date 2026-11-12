export { normalizeEmail } from "./domain/email.js";
export {
  hashPassword,
  verifyPassword,
  PASSWORD_HASH_OPTIONS,
} from "./infrastructure/password.js";
export {
  createAuthService,
  type AuthService,
  type AuthenticatedUser,
} from "./application/auth-service.js";
export {
  registerAuthRoutes,
  createRequestAuthenticator,
  type RequestAuthenticator,
} from "./presentation/routes.js";
