import { APP_ENV, IS_DEMO } from "./environment.js";
import { API_AUDIENCE as GENERATED_API_AUDIENCE, API_SCOPE as GENERATED_API_SCOPE, WRITE_ENABLED as GENERATED_WRITE_ENABLED } from "./generated-environment.js";

export { APP_ENV };
export const APP_MODE = APP_ENV;
export const DEFAULT_PACE_RANGE_PRESET = "30";
// Production writes remain disabled until approved Graph permissions, review
// storage, and record-preservation controls have been verified.
export const PRODUCTION_ADMIN_WRITES_ENABLED = GENERATED_WRITE_ENABLED === true;

export const CONFIG = {
  appName: "Admin Hub",
  moduleName: "PACE Dashboard",
  sitePath: "siu29.sharepoint.com:/sites/IEP_Skook:",
  lists: { users: "IEP_Users2", appUsers: "IEP_App_Users", paceVisits: "IEP_Pace_Visits" },
  auth: {
    clientId: "145a3fc7-5cff-4d03-96c7-577e17980110",
    authority: "https://login.microsoftonline.com/3276761c-22db-462b-a930-172d155bd795",
    scopes: ["User.Read", "Sites.Read.All"]
  },
  api: {
    basePath: "/api/admin/pace",
    audience: GENERATED_API_AUDIENCE,
    scope: GENERATED_API_SCOPE
  },
  demoStorageKey: "adminHubPaceDemoData",
  authorization: {
    enforceExplicitFlag: true,
    adminHubFields: ["AdminHubAccess"],
    paceDashboardFields: [],
    // This is intentionally not an authorization field. Admin Panel is a MAC
    // permission and must never silently grant Admin Hub access.
    excludedLegacyFields: ["Admin Panel"]
  },
  paceFieldAliases: {
    student: ["Student", "Student Name", "StudentName", "studentName"],
    date: ["Date", "Visit Date", "date"],
    timeIn: ["Time In", "TimeIn", "timeIn"],
    timeOut: ["Time Out", "TimeOut", "timeOut"],
    duration: ["Duration", "Duration Minutes", "DurationMinutes", "durationMinutes"],
    room: ["Room", "PACE Room", "Pace Room", "paceRoom"],
    specialist: ["Behavior Specialist", "Staff Member", "Submitted By", "submittedByName"],
    teacher: ["Teacher Came From", "Teacher", "teacherCameFrom"],
    reason: ["Reason", "Behavior", "Behaviors", "behaviors"],
    intervention: ["Intervention Used", "Interventions", "Support", "Supports", "interventions"],
    scm: ["SCM Used", "SCM", "scmUsed"],
    notes: ["Notes", "Visit Notes", "notes"],
    submittedAt: ["Submitted At", "Created", "createdAt", "timestamp"],
    modified: ["Modified"],
    editor: ["Editor"]
  }
};

export const MODULES = [
  { id: "pace", label: "PACE", description: "Visits, usage patterns, duration, interventions, activity and follow-up.", active: true }
];
