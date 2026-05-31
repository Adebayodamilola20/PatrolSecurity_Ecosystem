/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as checkpoints from "../checkpoints.js";
import type * as clients from "../clients.js";
import type * as crons from "../crons.js";
import type * as dev from "../dev.js";
import type * as emergency from "../emergency.js";
import type * as exports from "../exports.js";
import type * as handovers from "../handovers.js";
import type * as health from "../health.js";
import type * as http from "../http.js";
import type * as importer from "../importer.js";
import type * as incidents from "../incidents.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_http from "../lib/http.js";
import type * as lib_httpAuth from "../lib/httpAuth.js";
import type * as lib_jwt from "../lib/jwt.js";
import type * as missedPatrolScheduler from "../missedPatrolScheduler.js";
import type * as missedPatrols from "../missedPatrols.js";
import type * as notifications from "../notifications.js";
import type * as passOnLogs from "../passOnLogs.js";
import type * as positions from "../positions.js";
import type * as postOrders from "../postOrders.js";
import type * as reports from "../reports.js";
import type * as scans from "../scans.js";
import type * as settings from "../settings.js";
import type * as shifts from "../shifts.js";
import type * as sites from "../sites.js";
import type * as tenantBackfill from "../tenantBackfill.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  checkpoints: typeof checkpoints;
  clients: typeof clients;
  crons: typeof crons;
  dev: typeof dev;
  emergency: typeof emergency;
  exports: typeof exports;
  handovers: typeof handovers;
  health: typeof health;
  http: typeof http;
  importer: typeof importer;
  incidents: typeof incidents;
  "lib/auth": typeof lib_auth;
  "lib/http": typeof lib_http;
  "lib/httpAuth": typeof lib_httpAuth;
  "lib/jwt": typeof lib_jwt;
  missedPatrolScheduler: typeof missedPatrolScheduler;
  missedPatrols: typeof missedPatrols;
  notifications: typeof notifications;
  passOnLogs: typeof passOnLogs;
  positions: typeof positions;
  postOrders: typeof postOrders;
  reports: typeof reports;
  scans: typeof scans;
  settings: typeof settings;
  shifts: typeof shifts;
  sites: typeof sites;
  tenantBackfill: typeof tenantBackfill;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
