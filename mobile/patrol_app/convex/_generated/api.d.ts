/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activity from "../activity.js";
import type * as ai from "../ai.js";
import type * as aiService from "../aiService.js";
import type * as analytics from "../analytics.js";
import type * as audit from "../audit.js";
import type * as checkpoints from "../checkpoints.js";
import type * as clients from "../clients.js";
import type * as crons from "../crons.js";
import type * as dev from "../dev.js";
import type * as emergency from "../emergency.js";
import type * as env from "../env.js";
import type * as exports from "../exports.js";
import type * as handovers from "../handovers.js";
import type * as health from "../health.js";
import type * as http from "../http.js";
import type * as importer from "../importer.js";
import type * as incidents from "../incidents.js";
import type * as lib_anonymize from "../lib/anonymize.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_authHelpers from "../lib/authHelpers.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_geo from "../lib/geo.js";
import type * as lib_http from "../lib/http.js";
import type * as lib_httpAuth from "../lib/httpAuth.js";
import type * as lib_jwt from "../lib/jwt.js";
import type * as lib_phone from "../lib/phone.js";
import type * as lib_photoRefs from "../lib/photoRefs.js";
import type * as lib_rateLimiter from "../lib/rateLimiter.js";
import type * as lib_reportTemplates from "../lib/reportTemplates.js";
import type * as lib_sentry from "../lib/sentry.js";
import type * as lib_tombstones from "../lib/tombstones.js";
import type * as missedPatrolScheduler from "../missedPatrolScheduler.js";
import type * as missedPatrols from "../missedPatrols.js";
import type * as notifications from "../notifications.js";
import type * as observations from "../observations.js";
import type * as passOnLogs from "../passOnLogs.js";
import type * as pdfService from "../pdfService.js";
import type * as photoMigration from "../photoMigration.js";
import type * as photos from "../photos.js";
import type * as positions from "../positions.js";
import type * as postOrders from "../postOrders.js";
import type * as reports from "../reports.js";
import type * as scans from "../scans.js";
import type * as selfTest from "../selfTest.js";
import type * as sessions from "../sessions.js";
import type * as settings from "../settings.js";
import type * as shifts from "../shifts.js";
import type * as sites from "../sites.js";
import type * as tenantBackfill from "../tenantBackfill.js";
import type * as truckLogs from "../truckLogs.js";
import type * as users from "../users.js";
import type * as visitors from "../visitors.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activity: typeof activity;
  ai: typeof ai;
  aiService: typeof aiService;
  analytics: typeof analytics;
  audit: typeof audit;
  checkpoints: typeof checkpoints;
  clients: typeof clients;
  crons: typeof crons;
  dev: typeof dev;
  emergency: typeof emergency;
  env: typeof env;
  exports: typeof exports;
  handovers: typeof handovers;
  health: typeof health;
  http: typeof http;
  importer: typeof importer;
  incidents: typeof incidents;
  "lib/anonymize": typeof lib_anonymize;
  "lib/auth": typeof lib_auth;
  "lib/authHelpers": typeof lib_authHelpers;
  "lib/errors": typeof lib_errors;
  "lib/geo": typeof lib_geo;
  "lib/http": typeof lib_http;
  "lib/httpAuth": typeof lib_httpAuth;
  "lib/jwt": typeof lib_jwt;
  "lib/phone": typeof lib_phone;
  "lib/photoRefs": typeof lib_photoRefs;
  "lib/rateLimiter": typeof lib_rateLimiter;
  "lib/reportTemplates": typeof lib_reportTemplates;
  "lib/sentry": typeof lib_sentry;
  "lib/tombstones": typeof lib_tombstones;
  missedPatrolScheduler: typeof missedPatrolScheduler;
  missedPatrols: typeof missedPatrols;
  notifications: typeof notifications;
  observations: typeof observations;
  passOnLogs: typeof passOnLogs;
  pdfService: typeof pdfService;
  photoMigration: typeof photoMigration;
  photos: typeof photos;
  positions: typeof positions;
  postOrders: typeof postOrders;
  reports: typeof reports;
  scans: typeof scans;
  selfTest: typeof selfTest;
  sessions: typeof sessions;
  settings: typeof settings;
  shifts: typeof shifts;
  sites: typeof sites;
  tenantBackfill: typeof tenantBackfill;
  truckLogs: typeof truckLogs;
  users: typeof users;
  visitors: typeof visitors;
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
