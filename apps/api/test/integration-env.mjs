import { loadRootEnv, testEnvironment } from "../../../tooling/env.mjs";
Object.assign(process.env, testEnvironment(loadRootEnv()));
