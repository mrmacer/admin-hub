import { APP_ENV, IS_DEMO } from "./environment.js";

export { APP_ENV };
export const APP_MODE = APP_ENV;

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
  demoStorageKey: "adminHubPaceDemoData",
  authorization: {
    enforceExplicitFlag: false,
    adminHubFields: ["Admin Hub", "Admin Hub Access", "AdminHub", "adminHub"],
    paceDashboardFields: ["PACE Dashboard", "PACE Dashboard Access", "Pace Dashboard"],
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
  { id: "pace", label: "PACE", description: "Visits, usage patterns, duration, interventions and activity.", active: true },
  { id: "discipline", label: "Discipline", description: "Referral and follow-up intelligence.", active: false },
  { id: "support", label: "Student Support", description: "Operational support tracking.", active: false }
];
